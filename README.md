# Mapa de Coordenadas (Mapcoord) - v6.2

Sistema especializado em telemetria cartográfica, captura contínua de coordenadas GPS em campo, visualização espacial técnica, edição interativa de vértices e análise estatística de trajetos.

O projeto é composto por uma **PWA (Progressive Web App)** moderna e responsiva (desenvolvida em React 19, Vite, Leaflet e Tailwind CSS), integrada a um **módulo Android nativo** complementar (em Kotlin) para captura ininterrupta em segundo plano (com tela apagada) e deploy automatizado no **GitHub Pages** com geração contínua do instalador **APK**.

🔗 **Acesso Web / PWA:** [https://julianmel.github.io/Mapcoord/](https://julianmel.github.io/Mapcoord/)

---

## Sumário

- [Visão Geral](#visão-geral)
- [Novidades e Recursos da Versão 6.2](#novidades-e-recursos-da-versão-62)
- [Modos de Captura de Coordenadas](#modos-de-captura-de-coordenadas)
- [Visualização Cartográfica e Interatividade](#visualização-cartográfica-e-interatividade)
  - [Edição de Pontos por Arrasto (Drag & Drop)](#edição-de-pontos-por-arrasto-drag--drop)
  - [Modo "Traçar Linha" Inteligente e Limpo](#modo-traçar-linha-inteligente-e-limpo)
  - [Balão Informativo Técnico (Popup)](#balão-informativo-técnico-popup)
  - [Padronização Decimal com Vírgula (pt-BR)](#padronização-decimal-com-vírgula-pt-br)
  - [Personalização Cromática e Círculos de Raio](#personalização-cromática-e-círculos-de-raio)
- [Estatísticas e Análise do Deslocamento](#estatísticas-e-análise-do-deslocamento)
- [Filtros de Validação e Antiruído](#filtros-de-validação-e-antiruído)
- [Módulo Android Nativo (Background Service)](#módulo-android-nativo-background-service)
- [Formato Padronizado de Log e Metadados](#formato-padronizado-de-log-e-metadados)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Instalação e Execução Local](#instalação-e-execução-local)
- [Compilação e Geração do APK Android](#compilação-e-geração-do-apk-android)
- [Deploy Automatizado (CI/CD)](#deploy-automatizado-cicd)

---

## Visão Geral

O **Mapa de Coordenadas** foi desenvolvido com foco em aplicações técnicas de campo (engenharia, agrimensura, inspeções, fiscalização, frotas e logística). Ele resolve as principais limitações de navegadores móveis tradicionais:
1. Suspensão da coleta GPS pelo sistema operacional quando a tela é bloqueada ou o usuário alterna de aplicativo.
2. Dificuldade de corrigir vértices imprecisos causados por deriva momentânea de satélite.
3. Poluição visual ao traçar rotas com centenas de pontos.
4. Falta de métricas imediatas e determinísticas de deslocamento em campo.

A interface opera tanto em navegadores desktop/mobile quanto empacotada no aplicativo nativo Android via ponte bidirecional JavaScript (`window.AndroidGps`) integrada a um **Serviço em Primeiro Plano (Foreground Service)**.

---

## Novidades e Recursos da Versão 6.2

- **Edição Interativa por Arrasto (*Drag & Drop*):** Marcadores reposicionáveis diretamente no mapa com recálculo geodésico imediato.
- **Auditoria de Correção Manual no Log:** Identificação automática no log textual e no balão do ponto: `"Ponto corrigido manualmente"`.
- **Modo "Traçar Linha" Limpo:** Ocultação automática de pontos intermediários e círculos para despoluir a visualização, mantendo destacados apenas o Ponto Inicial (verde) e o Ponto Final (vermelho).
- **Telemetria Completa no Balão do Ponto:** Exibição da velocidade instantânea do sensor e deslocamento em relação ao ponto anterior.
- **Padrão Decimal Brasileiro (`pt-BR`):** Substituição de pontos por vírgula em todos os valores numéricos de distância, velocidade, precisão e raio.
- **Novo Modal de Estatísticas do Deslocamento:** Painel determinístico com métricas consolidadas (distância total, tempo em movimento vs. parado, velocidade média/máxima, altimetria e precisão).
- **Melhorias de GPS Nativo Android:** Provedor GNSS de hardware direto, WakeLock, prompt de desativação de economia de bateria e eliminação de atrasos de 20s em segundo plano.
- **Build & CI/CD Automatizado:** Pipeline no GitHub Actions que compila o APK e faz deploy para o GitHub Pages a cada push na `main`.

---

## Modos de Captura de Coordenadas

1. **Captura Manual / Instantânea:**
   - Registra as coordenadas no exato momento do clique no botão ou no mapa, com feedback tátil e visual imediato.

2. **Captura Contínua por Intervalo:**
   - Coleta automática de coordenadas a cada intervalo configurável (a partir de 1 segundo).
   - Ideal para mapeamento contínuo de percursos, estradas, trilhas e trajetos veiculares.

3. **Coleta de Pausas no Movimento (Modo Permanência):**
   - Registra uma coordenada apenas quando o usuário ou veículo permanece estacionário no mesmo local pelo período mínimo definido (a partir de 5 segundos).
   - Utiliza limiar de deslocamento de 3 metros para absorver o ruído natural do sinal de satélite sem disparar falsos deslocamentos.
   - Reinicia a contagem automaticamente se houver movimento além do limiar.

---

## Visualização Cartográfica e Interatividade

### Edição de Pontos por Arrasto (Drag & Drop)
Qualquer ponto carregado ou capturado pode ser ajustado diretamente sobre o mapa:
- **Toque Aumentado para Mobile:** Hitbox de toque ampla (38x38px) com ancoragem centralizada que facilita arrastar tanto com o mouse quanto com o dedo na tela de smartphones.
- **Recálculo em Tempo Real:** Ao arrastar o marcador, a linha do traçado acompanha o movimento dinamicamente.
- **Persistência e Registro:** Ao soltar o ponto, as novas coordenadas são salvas e o log é atualizado adicionando a observação `"Ponto corrigido manualmente"`.

### Modo "Traçar Linha" Inteligente e Limpo
- Ao clicar em **"Traçar linha"**, uma linha poligonal técnica (2,5px) conecta todos os pontos da rota.
- **Ocultação de Intermediários:** Os círculos de raio e os marcadores intermediários são removidos da visualização para evitar poluição visual.
- **Pontos Chave:** Permanem visíveis apenas:
  - **Ponto Inicial:** Marcador verde destacado com identificação de Início (`1`).
  - **Ponto Final / Atual:** Marcador vermelho com a numeração total da rota.
- Ao clicar em **"Remover linha"**, todos os marcadores numerados e círculos de raio retornam à exibição original.

### Balão Informativo Técnico (Popup)
Ao tocar em qualquer marcador, é aberto um painel com formatação monoespaçada contendo:
- **Identificação:** Título do ponto (`Ponto XX`, `Início do Percurso`, `Fim / Ponto Atual`).
- **Observação:** Detalhe da coleta ou nota personalizada em destaque verde.
- **Data e Hora:** Timestamp formatado (`YYYY-MM-DD HH:MM:SS`).
- **Coordenadas:** Latitude e Longitude com 6 casas decimais.
- **Velocidade Instantânea:** Velocidade informada pelo satélite GPS ou calculada (ex.: `45,2 km/h`).
- **Deslocamento:** Distância em metros ou quilômetros em relação ao ponto anterior (ex.: `18,4 m` ou `1,25 km (1250 m)`).
- **Indicador de Edição:** Se o ponto foi movido, exibe a confirmação `✓ Posição atualizada manualmente`.

### Padronização Decimal com Vírgula (pt-BR)
Todos os valores exibidos ao usuário seguem a convenção nacional:
- Distâncias: `12,5 m`, `1,45 km`.
- Velocidades: `35,8 km/h`, `0,0 km/h`.
- Raios e Precisão: `3,0 m`, `±4,2 m`.

### Personalização Cromática e Círculos de Raio
- **Círculos de Abrangência/Incerteza:** Raio dinâmico ajustável por controle deslizante (de 1 a 5 metros com precisão decimal).
- **Paleta Espectral de 32 Cores:** Personalização independente para número, fundo do marcador, preenchimento e borda dos círculos (com persistência no `localStorage`).

---

## Estatísticas e Análise do Deslocamento

Acessível pelo botão **"Estatísticas do deslocamento"**, o modal consolidado (`TrackStatisticsModal.tsx`) fornece métricas calculadas em milissegundos sem dependência de APIs externas:

- **Distância Total Acumulada:** Soma precisa em km e metros.
- **Duração Total vs. Tempo em Movimento:** Discriminação entre tempo ativo e tempo parado/em pausa.
- **Velocidade Média e Máxima:** Velocidade média real dos trechos em movimento e pico de velocidade reportado.
- **Precisão Média do GPS:** Avaliação da qualidade do sinal durante a atividade.
- **Detecção de Lacunas:** Identificação de intervalos com perda momentânea de sinal de satélite.
- **Ações Rápidas:** Botão para reenquadrar toda a rota no mapa e botão para copiar o resumo analítico formatado para a área de transferência.

---

## Filtros de Validação e Antiruído

Para garantir precisão milimétrica e confiabilidade em coletas técnicas de campo:

- **Descarte de Precisão Baixa:** Rejeição automática de posições com erro horizontal estimado superior a 85 metros (descartando triangulações celulares imprecisas).
- **Filtro Anti-teletransporte:** Avaliação da distância física entre posições consecutivas em relação ao tempo decorrido, evitando saltos impossíveis.
- **Limite de Velocidade Plausível:** Descarte de leituras com velocidades anômalas (> 220 km/h).
- **Filtro de Deriva Estática:** Descarte de saltos superiores a 50 metros em intervalos curtos quando o sensor de velocidade acusa menos de 1,5 km/h.
- **Validação de Imobilidade:** No modo de permanência, exige velocidade $\le 2,5\text{ km/h}$ para confirmar o ponto.

---

## Módulo Android Nativo (Background Service)

Localizado no diretório `android/`, o módulo em Kotlin proporciona captura ininterrupta mesmo com tela bloqueada ou outro app em primeiro plano:

- **Foreground Service (`LocationForegroundService.kt`):**
  - Notificação persistente no sistema informando status, timestamp e total de posições pendentes.
  - Provedor GNSS de hardware direto e Fused Location Provider com `PRIORITY_HIGH_ACCURACY`.
  - WakeLock parcial para impedir suspensão do processador durante o percurso.
- **Fila Offline Transacional:**
  - Buffer local de alta capacidade para reter posições mesmo sem conexão à internet.
  - Sincronização automática com a interface web assim que o app é reaberto.
- **Painel de Diagnóstico em Tempo Real:**
  - Exibe no rodapé da aplicação o estado da ponte nativa, permissões concedidas, modo de operação, velocidade instantânea do sensor e dados do último segmento sincronizado.

---

## Formato Padronizado de Log e Metadados

Os registros utilizam o padrão determinístico com cabeçalho compacto:

```text
[timestamp], obs, lat, lng, dir, alt, speed, speed_acc, acc, dist, time;
```

### Campos:
- `[timestamp]`: Data e hora compactas no padrão `YYYYMMDDHHMMSS`.
- `obs`: Observação ou modo de captura (ex.: `Captura Manual`, `Coleta #1 (intervalo 5s)`, `Coleta #2 - Ponto corrigido manualmente`).
- `lat`: Latitude decimal (6 casas decimais).
- `lng`: Longitude decimal (6 casas decimais).
- `dir`: Rumo / direção (*bearing* em graus decimais).
- `alt`: Altitude em metros.
- `speed`: Velocidade instantânea em km/h.
- `speed_acc`: Precisão estimada da velocidade.
- `acc`: Precisão horizontal da posição em metros.
- `dist`: Deslocamento em metros em relação ao ponto anterior.
- `time`: Tempo decorrido em segundos desde o ponto anterior.

Todos os registros são separados por `;` e finalizados com quebra de linha `\r\n` (CRLF).

---

## Estrutura do Projeto

```text
Mapcoord/
├── .github/
│   └── workflows/
│       └── deploy.yml        # CI/CD: build web, build APK e deploy no GitHub Pages
├── android/                  # Módulo Android nativo (Kotlin + Gradle 8.7)
│   ├── app/src/main/java/    # LocationForegroundService e MainActivity
│   └── gradlew / gradlew.bat # Gradle Wrapper
├── client/                   # Frontend PWA (React 19 + Vite 7 + Tailwind CSS)
│   ├── src/
│   │   ├── components/       # TrackStatisticsModal, MapView, controles UI Radix
│   │   ├── lib/              # trackLog.ts (parsing e edição), trackAnalysis.ts
│   │   ├── pages/            # Home.tsx (interface principal de cartografia)
│   │   └── version.ts        # Versão centralizada do aplicativo (v6.2)
│   └── public/               # Manifest PWA, ícones e assets estáticos
├── server/                   # Backend de apoio e testes (Vitest + Express)
│   ├── track-log-helpers.test.ts # Testes unitários de parsing e edição de logs
│   └── track-analysis.test.ts    # Testes unitários de análise estatística
├── Mapcoord.APK              # Instalador APK compilado localmente
└── package.json              # Dependências, scripts e versão do projeto
```

---

## Instalação e Execução Local

### Pré-requisitos
- **Node.js:** Versão 20+
- **pnpm:** Versão 10+
- **Java:** JDK 17 (para build do APK Android)

### 1. Instalar dependências
```bash
pnpm install
```

### 2. Executar em modo de desenvolvimento
```bash
pnpm dev
```
Acesse no navegador: `http://localhost:3000`

### 3. Validação de tipos e testes unitários
```bash
pnpm check
pnpm test
```

### 4. Compilar versão web para produção
```bash
pnpm build
```

---

## Compilação e Geração do APK Android

O projeto inclui o Gradle Wrapper para compilação direta via linha de comando no Windows, Linux ou macOS.

### Compilação e cópia direta para a raiz (`Mapcoord.APK`):
```bash
pnpm run build:apk
```
*Ou executando diretamente pelo Gradle:*
```bash
cd android
./gradlew :app:copyApkToRoot
```
O APK será gerado e copiado automaticamente para a raiz do repositório como **`Mapcoord.APK`**.

---

## Deploy Automatizado (CI/CD)

O repositório está integrado com o **GitHub Actions** ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). A cada `git push` na branch `main`:

1. Instala dependências e compila os assets web da PWA.
2. Configura o ambiente Java 17 e compila o APK do Android com Gradle.
3. Disponibiliza o `Mapcoord.APK` dentro dos arquivos distribuídos na web.
4. Publica o site em produção diretamente no **GitHub Pages**:
   - **App Web:** [https://julianmel.github.io/Mapcoord/](https://julianmel.github.io/Mapcoord/)
   - **Download direto do APK:** [https://julianmel.github.io/Mapcoord/Mapcoord.APK](https://julianmel.github.io/Mapcoord/Mapcoord.APK)
