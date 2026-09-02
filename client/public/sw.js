const CACHE_NAME = "geo-map-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
];

// === Captura contínua via Service Worker ===
// O SW mantém um timer independente que roda mesmo com a tela desligada
let captureIntervalId = null;
let captureState = null; // { intervalSeconds, lastTimestamp }
const CAPTURE_STATE_KEY = "capture-state";

function loadCaptureState() {
  try {
    const saved = localStorage.getItem(CAPTURE_STATE_KEY);
    if (saved) captureState = JSON.parse(saved);
  } catch {}
}

function saveCaptureState(state) {
  captureState = state;
  try {
    localStorage.setItem(CAPTURE_STATE_KEY, JSON.stringify(state));
  } catch {}
}

function getTimestamp() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// Função de captura GPS dentro do SW
function captureAndSave(seqCounter: number, intervalSeconds: number) {
  // Nota: SW não tem acesso direto a navigator.geolocation em todos os browsers
  // Mas podemos usar fetch para obter a posição via API do browser
  // Em Chrome/Android, o SW pode acessar geolocation
  try {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const timestamp = getTimestamp();
        const observation = `Coleta #${seqCounter} (intervalo ${intervalSeconds}s)`;
        const newLine = `[${timestamp}] ${observation}, ${lat},${lng}`;

        // Salvar no localStorage
        try {
          const existing = localStorage.getItem("mapa-coordenadas-data") || "";
          const updated = existing.trim() === "" ? newLine
            : existing.trim().endsWith(";") ? `${existing} ${newLine}`
            : `${existing}; ${newLine}`;
          localStorage.setItem("mapa-coordenadas-data", updated);
          // Incrementar e salvar o contador
          localStorage.setItem("capture-seq-counter", String(seqCounter + 1));
          // Notificar a página principal (se estiver aberta)
          self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({
                type: "NEW_COORDINATE",
                coord: newLine,
                seq: seqCounter,
              });
            });
          });
        } catch {}
      },
      () => {
        // Silencioso - geolocation pode falhar sem GPS ativo
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  } catch {}
}

// Instalar
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativar
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Mensagens da página principal para o SW
self.addEventListener("message", (event) => {
  if (!event.data) return;

  switch (event.data.type) {
    case "START_CAPTURE": {
      const intervalSeconds = event.data.interval || 5;
      loadCaptureState();
      // Se já está capturando, parar primeiro
      if (captureIntervalId) {
        clearInterval(captureIntervalId);
      }
      // Captura inicial imediata
      const initialSeq = parseInt(localStorage.getItem("capture-seq-counter") || "0", 10) || 0;
      captureAndSave(initialSeq, intervalSeconds);
      // Iniciar timer
      captureIntervalId = setInterval(() => {
        const seq = parseInt(localStorage.getItem("capture-seq-counter") || "0", 10) || 0;
        captureAndSave(seq, intervalSeconds);
      }, intervalSeconds * 1000);
      saveCaptureState({ active: true, intervalSeconds });
      break;
    }

    case "STOP_CAPTURE": {
      if (captureIntervalId) {
        clearInterval(captureIntervalId);
        captureIntervalId = null;
      }
      saveCaptureState({ active: false, intervalSeconds: 0 });
      break;
    }

    case "GET_CAPTURE_STATE": {
      event.source.postMessage({
        type: "CAPTURE_STATE_RESPONSE",
        active: captureState?.active || false,
        interval: captureState?.intervalSeconds || 0,
      });
      break;
    }

    case "SYNC_STATE": {
      // Sincronizar: a página informa que está capturando localmente
      // ou pede para confirmar o estado
      if (captureState?.active) {
        event.source.postMessage({
          type: "CAPTURE_STATE_RESPONSE",
          active: true,
          interval: captureState.intervalSeconds,
        });
      }
      break;
    }

    default:
      break;
  }
});

// Fetch: network-first strategy
self.addEventListener("fetch", (event) => {
  if (event.request.url.startsWith("https://maps")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
