# Mapa de Coordenadas (Mapcoord)

Sistema especializado em telemetria cartográfica, captura contínua de coordenadas GPS em campo, visualização espacial técnica e análise inteligente de trajetos.

O projeto é composto por uma **PWA (Progressive Web App)** moderna e responsiva, integrada a um **módulo Android nativo** complementar (em Kotlin) para captura ininterrupta em segundo plano (com tela apagada) e um backend com **processamento determinístico e assistente de IA**.

---

## Sumário

- [Visão Geral](#visão-geral)
- [Modos de Captura de Coordenadas](#modos-de-captura-de-coordenadas)
- [Filtros de Validação e Antiruído](#filtros-de-validação-e-antiruído)
- [Módulo Android Nativo (Background Service)](#módulo-android-nativo-background-service)
- [Visualização Cartográfica Técnica](#visualização-cartográfica-técnica)
- [Formato Padronizado de Log e Metadados](#formato-padronizado-de-log-e-metadados)
- [Análise Inteligente de Trajetos com IA](#análise-inteligente-de-trajetos-com-ia)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Instalação e Execução](#instalação-e-execução)
- [Compilação do Aplicativo Android](#compilação-do-aplicativo-android)

---

## Visão Geral

O **Mapa de Coordenadas** foi desenvolvido com foco em aplicações técnicas de campo (engenharia, agrimensura, inspeções, frotas e logística). Ele resolve uma das maiores limitações de aplicações baseadas em navegadores móveis: a suspensão da coleta GPS pelo sistema operacional quando a tela é bloqueada ou o usuário alterna de aplicativo.

Através de uma ponte bidirecional em JavaScript (`window.AndroidGps`), a interface web pode rodar tanto em qualquer navegador desktop/mobile quanto empacotada em um WebView Android apoiado por um **Serviço em Primeiro Plano (Foreground Service)**.

---

## Modos de Captura de Coordenadas

1. **Captura Manual / Instantânea:**
   - Registra a posição geográfica no instante do clique com feedback visual imediato.

2. **Captura Contínua por Intervalo:**
   - Coleta automática de coordenadas a cada intervalo configurado (a partir de 1 segundo).
   - Ideal para registro contínuo de deslocamento e traçado de rotas.

3. **Coleta de Pausas no Movimento (Modo Permanência):**
   - Registra uma coordenada apenas quando o usuário ou veículo permanece estacionário no local por um período mínimo definido (a partir de 5 segundos).
   - Utiliza um limiar de deslocamento de 3 metros para absorver o ruído natural do sinal do satélite sem acionar falsos movimentos.
   - Reinicia o contador automaticamente se houver deslocamento além do limiar.

---

## Filtros de Validação e Antiruído

Para garantir a confiabilidade dos dados em campo, as leituras passam por validações antes de serem registradas:

- **Descarte de Precisão Baixa:** Posições com erro horizontal estimado superior a 150 metros são rejeitadas.
- **Detecção de Velocidades Anômalas:** Registros com velocidade acima de 180 km/h ou incompatíveis com o deslocamento no tempo decorrido são descartados.
- **Filtro Anti-teletransporte:** Avaliação da distância física entre pontos consecutivos versus o tempo decorrido para evitar saltos irreais por perda momentânea de sinal.
- **Validação de Imobilidade Estrita:** No modo de pausas, exige velocidade próxima a zero ($\le 2,5\text{ km/h}$) para confirmar o registro.

---

## Módulo Android Nativo (Background Service)

Localizado na pasta `android/`, o módulo nativo assegura:

- **Serviço em Primeiro Plano (`LocationForegroundService.kt`):** Declara o tipo `location` e exibe uma notificação persistente no sistema Android informando o status, o timestamp da última posição e o total de registros pendentes.
- **Fused Location Provider Client:** Utiliza a API do Google Play Services com prioridade `PRIORITY_HIGH_ACCURACY`.
- **Fila Offline Transacional:** Buffer local capaz de reter até 10.000 posições de forma segura no dispositivo.
- **Sincronização em Tempo Real:** Ao reabrir a interface PWA/WebView, os pontos são sincronizados e incorporados ao log sem perda de dados ou duplicações.
- **Painel de Diagnóstico:** Exibe em tempo de execução o status da ponte nativa, permissões concedidas, estado do serviço e últimas coordenadas obtidas.

---

## Visualização Cartográfica Técnica

Interface inspirada em ferramentas profissionais de GIS (Geographic Information Systems):

- **Integração Google Maps API:** Utilização de bibliotecas de Marker, Geometry e Places.
- **Raio de Incerteza / Abrangência:** Círculos dinâmicos desenhados ao redor de cada coordenada, com raio ajustável via controle deslizante (slider de 1m a 5m com precisão decimal).
- **Marcadores Numéricos Sequenciais:** Identificação clara da ordem cronológica dos pontos através de marcadores numerados com ancoragem centralizada.
- **Customização Cromática com Persistência:** Paleta de 32 cores para personalização de número, fundo do marcador, preenchimento e borda dos círculos (salvo no `localStorage`).
- **Substrato Cartográfico:** Grade técnica, retículo e cruz de mira para apoio visual.

---

## Formato Padronizado de Log e Metadados

Os registros utilizam padrão determinístico compatível com exportação e importação em sistemas de geoprocessamento:

```text
[timestamp], obs, lat, lng, dir, alt, speed, speed_acc, acc, dist, time;
```

### Campos:
- `[timestamp]`: Data e hora no formato numérico compacto `YYYYMMDDHHMMSS`.
- `obs`: Observação ou modo da captura (ex: manual, contínuo, pausa).
- `lat`: Latitude decimal.
- `lng`: Longitude decimal.
- `dir`: Direção / rumo (bearing em graus decimais).
- `alt`: Altitude em metros.
- `speed`: Velocidade instantânea em km/h.
- `speed_acc`: Precisão estimada da velocidade.
- `acc`: Precisão horizontal da posição em metros.
- `dist`: Distância euclidiana/esférica em metros em relação ao ponto anterior.
- `time`: Tempo decorrido em segundos desde o ponto anterior.

Todos os registros são separados por `;` e finalizados com quebra de linha `\r\n` (CRLF).

---

## Análise Inteligente de Trajetos com IA

O backend em Node.js (`server/routers.ts`) disponibiliza um analisador de telemetria integrado a Large Language Models (LLM):

1. **Métricas Determinísticas (`summarizeTrack`):**
   - Distância total acumulada (filtrando lacunas superiores a 60s).
   - Tempo efetivo em movimento vs. duração total.
   - Velocidade média real do percurso.
   - Maior lacuna de amostragem.
   - Precisão horizontal média.

2. **Assistente de Conversação (`AIChatBox`):**
   - Janela de diálogo em português para tirar dúvidas sobre o trajeto percorrido (ex.: *"Qual foi o trecho de maior velocidade?"*, *"Quanto tempo passei parado no terceiro ponto?"*).
   - Respostas estritamente fundamentadas no resumo estatístico e nos dados reais do log, prevenindo alucinações.

---

## Estrutura do Projeto

```text
Mapcoord/
├── android/                  # Módulo Android nativo (Kotlin + Gradle)
│   └── app/src/main/java/    # LocationForegroundService e MainActivity
├── client/                   # Frontend PWA (React 19 + Vite + Tailwind CSS)
│   ├── src/
│   │   ├── components/       # MapView, AIChatBox, componentes UI Radix
│   │   ├── lib/              # Utilitários de trackLog e parsing de coordenadas
│   │   └── pages/            # Home.tsx (interface principal de cartografia)
│   └── public/               # Manifest PWA e ícones
├── server/                   # Backend (Express + tRPC + Drizzle ORM)
│   ├── routers.ts            # Rotas tRPC (resumo de métricas e consulta IA)
│   └── db.ts                 # Configuração de persistência de banco de dados
├── drizzle/                  # Migrações e esquemas de banco de dados
└── package.json              # Dependências e scripts do projeto
```

---

## Instalação e Execução

### Pré-requisitos
- Node.js 20+
- pnpm 10+

### Instalação de dependências
```bash
pnpm install
```

### Execução em modo de desenvolvimento
```bash
pnpm dev
```
Acesse a aplicação no navegador em `http://localhost:3000`.

### Verificação de tipos e testes
```bash
pnpm check
pnpm test
```

### Build para produção
```bash
pnpm build
```

---

## Compilação do Aplicativo Android

### Pré-requisitos
- JDK 17 ou 21
- Android Studio ou Android SDK (Platform 35, Build Tools 35)

### Gerar APK de depuração
Navegue até a pasta `android` e execute:
```bash
cd android
./gradlew :app:assembleDebug
```
O APK gerado estará disponível em:
```text
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Repositório Oficial

- **GitHub:** [https://github.com/Julianmel/Mapcoord](https://github.com/Julianmel/Mapcoord)
