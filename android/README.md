# Mapa de Coordenadas — captura Android em background

Este módulo Android complementa a PWA publicada em `https://mapacoordenadas.manus.space`. Ele abre a PWA em um `WebView` e expõe uma ponte `window.AndroidGps` para iniciar e parar um serviço de localização em primeiro plano.

## O que a solução garante

Enquanto o serviço estiver ativo e as permissões estiverem concedidas, o Android mantém atualizações GPS com a tela apagada e durante a troca para outros aplicativos. Cada posição é gravada em uma fila local limitada a 10.000 registros. Quando a PWA é aberta novamente, importa a fila para o log existente e só depois confirma a limpeza da fila nativa.

## Permissões

Na primeira utilização, permita localização precisa. Em Android 10 ou superior, permita também localização “o tempo todo” nas configurações do sistema. Em Android 13 ou superior, permita notificações para visualizar o indicador persistente do serviço.

## Compilação

É necessário ter Android Studio ou Gradle, Android SDK 35, JDK 17 e acesso às dependências Maven. Abra a pasta `android/` no Android Studio e execute `assembleDebug`, ou gere um projeto com Gradle Wrapper no ambiente de desenvolvimento e execute:

```bash
./gradlew :app:assembleDebug
```

O APK de debug será gerado em `app/build/outputs/apk/debug/`.

## Teste de campo

Inicie a captura contínua pela PWA, confirme a notificação “Captura GPS ativa”, desligue a tela por alguns minutos, alterne entre aplicativos e depois abra novamente o Mapa de Coordenadas. Ao carregar, os pontos pendentes devem ser incorporados ao log local. Use o botão **Parar captura contínua** ou a ação **Parar** da notificação para encerrar o serviço.

## Limitações

A PWA aberta diretamente no Chrome continua sujeita às políticas de suspensão do navegador. A captura persistente depende de executar este módulo Android instalado, com o serviço em primeiro plano e as permissões apropriadas. Fabricantes podem aplicar otimizações de bateria adicionais; para testes críticos, exclua o aplicativo da economia agressiva de bateria.

## Indicador de captura ativa

Quando a captura é iniciada com sucesso, o Android mantém uma notificação persistente com o título **“Mapa de Coordenadas — ATIVO”**. Enquanto ainda não chegou uma posição, ela informa “aguardando posição”; após a primeira leitura, mostra o timestamp do último ponto e a quantidade de registros pendentes para importação. A notificação possui a ação **Parar**.

Se a notificação não aparecer no Android 13 ou superior, verifique em **Configurações → Notificações → Mapa de Coordenadas** se as notificações estão permitidas. Verifique também em **Configurações → Apps → Mapa de Coordenadas → Permissões → Localização** se a permissão precisa está habilitada. Alguns fabricantes aplicam economia de bateria agressiva; para testes de background, remova a restrição de bateria do aplicativo.

A ausência da notificação significa que o serviço não foi iniciado ou que a permissão de notificações está bloqueada; nesse caso, a captura não deve ser considerada ativa.

## Metadados GPS e limitações de análise

Além de latitude e longitude, os registros podem incluir velocidade instantânea em km/h, direção em graus, altitude, precisão horizontal, distância do segmento e tempo desde o ponto anterior. O APK Android obtém esses campos do `Location` nativo e tende a oferecer dados mais completos durante o serviço em primeiro plano. No navegador/PWA/WebView, velocidade, direção e altitude podem ser nulas ou variar conforme o dispositivo, o navegador e a disponibilidade do GPS.

A velocidade instantânea é uma estimativa do sensor e pode oscilar, especialmente parado ou em baixa velocidade; a precisão horizontal representa o erro estimado e não uma garantia de exatidão. Altitude e direção geralmente são menos confiáveis do que latitude/longitude, e a direção pode não ser significativa quando o deslocamento é pequeno. A distância e o tempo do segmento são derivados de pontos consecutivos e devem ser interpretados com cautela quando há lacunas, timestamps duplicados ou baixa precisão.

A janela de análise diferencia velocidade instantânea registrada de velocidade média calculada. Leituras isoladas muito altas, saltos de posição e segmentos com grandes lacunas devem ser tratados como possíveis anomalias, não como fatos confirmados. Logs antigos continuam válidos; nesses casos, os novos campos aparecem como “não disponível”.
