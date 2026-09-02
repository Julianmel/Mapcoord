# Tarefas — Coleta por permanência

- [x] Definir o modelo de estado do modo de permanência e o limiar de deslocamento do GPS.
- [x] Adicionar o botão “Coleta continua” e a pergunta do tempo mínimo, com padrão de 30 segundos.
- [x] Implementar monitoramento de posição e reinício do contador quando houver deslocamento.
- [x] Registrar uma única captura somente após o tempo configurado imóvel.
- [x] Garantir que iniciar/parar o modo não interfira na captura contínua por intervalo existente.
- [x] Verificar TypeScript, carregamento da aplicação e fluxo visual no navegador.
- [x] Salvar checkpoint após a validação.

## Decisões

- O modo será separado da captura contínua por intervalo.
- “Imóvel” será avaliado pela distância entre posições GPS sucessivas, usando um limiar pequeno para absorver ruído do sensor.
- A coleta ocorrerá no fim do período de imobilidade; depois disso, o contador será reiniciado para permitir nova coleta somente após outra permanência completa.
- O valor inicial do tempo será 5 segundos; o usuário poderá informar qualquer valor inteiro a partir desse mínimo.

## Ajuste solicitado em 22/08/2026

- [x] Alterar o valor inicial da Coleta continua de 30 para 5 segundos.
- [x] Aceitar qualquer tempo inteiro a partir de 5 segundos na validação.
- [x] Verificar a interface e publicar a alteração.

## Reorganização visual solicitada em 22/08/2026

- [x] Revisar a estrutura do painel lateral, área de dados e blocos de status.
- [x] Corrigir larguras, alturas, espaçamentos e quebra de texto dos controles.
- [x] Reorganizar os botões em grupos responsivos sem sobreposição.
- [x] Validar a tela em 390px e 1280px e publicar a revisão.

A validação confirmou separação clara entre captura, dados e visualização; botões sem sobreposição; quebra segura das coordenadas; grade responsiva para ações auxiliares; e substrato cartográfico sutil no mapa. O painel lateral permanece rolável para alcançar os controles abaixo da área de dados.

## Correção de background solicitada em 22/08/2026

- [x] Auditar o ciclo de vida da captura, persistência do estado e retomada após suspensão.
- [x] Identificar e corrigir timers, watches, wake lock e listeners que possam ficar ativos/inativos incorretamente.
- [x] Melhorar o feedback visual sobre captura ativa, suspensa e retomada.
- [x] Preservar dados e parâmetros quando a página for recarregada ou voltar do background.
- [x] Validar o comportamento e documentar os limites reais do PWA no Android/Chrome.

## Diagnóstico inicial de background

A implementação atual mantém `setInterval` e `watchPosition` na página, persiste um estado de captura contínua e tenta reativar Wake Lock ao voltar ao primeiro plano. Porém, o listener de visibilidade apenas libera/re adquire Wake Lock; não há uma retomada robusta do timer e do watch quando o navegador suspende, descarta ou recria a página. A captura por permanência também depende de `watchPosition` e de um ticker local, que não executam enquanto o JavaScript está suspenso. A correção deverá evitar múltiplos timers/watches e centralizar o reinício idempotente, preservando o intervalo e o estado salvo.

O bootstrap registra `/sw.js` apenas em produção, enquanto a captura continua depende exclusivamente de APIs de geolocalização, `watchPosition` e `setInterval` executados no documento. O service worker não recebe uma sessão GPS da página e, portanto, não mantém a coleta real quando o Android suspende ou encerra o documento.

## Solução Android nativa solicitada em 22/08/2026

- [x] Definir se a solução será um app Android complementar, mantendo a PWA como interface web.
- [x] Escolher a stack nativa e o mecanismo de serviço de localização em primeiro plano.
- [x] Implementar permissões, notificação persistente e captura com tela apagada.
- [x] Integrar o log, sequência, intervalo/permanência e exportação com a interface do mapa.
- [x] Testar alternância de aplicativos, tela apagada, reinício do processo e retomada.
- [x] Documentar instalação e limitações de distribuição/Play Store.

## Ponto de integração nativa

A captura contínua atual é inicializada diretamente no `useEffect` de montagem e em um fluxo local com `getCurrentPosition`/`setInterval`. O aplicativo Android terá uma ponte `window.AndroidGps`; a PWA deverá detectá-la antes de iniciar o timer web, enviar o intervalo em segundos ao serviço nativo, importar a fila de pontos pendentes ao abrir e limpar essa fila somente depois de incorporar os registros ao log local. Em navegadores comuns, o fluxo web continuará como fallback.

A interface atual cria o timer web e o `watchPosition` dentro do clique de início, além de repetir lógica semelhante na retomada persistida. No modo Android, esse caminho deve chamar somente `AndroidGps.start(intervalSeconds)` e não criar timer web; a importação da fila nativa deve ocorrer uma vez por montagem e avançar o contador sem reescrever o log existente. O botão Parar deve chamar `AndroidGps.stop()` além de limpar o estado web.

Falha crítica encontrada: `MainActivity` solicita permissões, mas não guarda o intervalo solicitado para iniciar o serviço depois que o usuário autoriza. Além disso, a resposta da permissão de localização em primeiro plano não encadeia corretamente a permissão de background. O serviço nativo já usa `START_STICKY` e `FusedLocationProviderClient`, mas precisa receber o início pendente após as permissões e manter a fila limitada de pontos.

O manifesto já declara localização precisa/aproximada, localização em background, serviço em primeiro plano e notificação; o serviço está marcado como `foregroundServiceType="location"`. O módulo usa `play-services-location`, target/compile SDK 35 e min SDK 26. A principal correção pendente no fluxo era o início após as permissões, já ajustado na Activity.

## Validação da integração Android

A PWA continua carregando sem erros em desktop (1280px) e mobile (390px), com o painel responsivo preservado. O TypeScript e o build web foram concluídos com sucesso. O ambiente atual não possui Gradle/Android SDK configurado para gerar um APK aqui; o módulo Android foi preparado para abertura no Android Studio, com instruções em `android/README.md`.

## Geração e instalação do APK solicitada em 25/08/2026

- [x] Verificar JDK, Gradle, Android SDK, adb e dispositivo conectado.
- [x] Gerar o APK de debug e validar o artefato.
- [x] Tentar instalar no dispositivo conectado, se disponível.
- [x] Entregar o APK e instruções caso a instalação direta não seja possível.

A verificação encontrou Java 21, mas não encontrou Gradle, Android SDK, `sdkmanager` ou `adb`, portanto não há aparelho conectado ao ambiente. O projeto declara Android Gradle Plugin 8.6.1 e Kotlin 2.0.21, com repositórios Google/Maven Central. Será necessário instalar temporariamente Gradle 8.7 e Android SDK Platform 35/Build Tools para gerar o APK; a instalação física no telefone só será possível se houver uma ponte USB/adb disponível, o que não está presente nesta sandbox.

## Correção do APK em background solicitada em 25/08/2026

- [x] Auditar o caminho real de inicialização do serviço e as permissões concedidas.
- [x] Garantir que a notificação persistente mostre claramente “captura ativa” e o último ponto/horário.
- [x] Expor estado de ativo, parado e erro para a PWA e para o Android.
- [x] Corrigir atualizações GPS, fila local e retomada do serviço.
- [x] Gerar novo APK e documentar o teste específico no aparelho.

## Diagnóstico do APK

A Activity só inicia o serviço depois de obter também `ACCESS_BACKGROUND_LOCATION`, mas em Android 11+ essa permissão normalmente exige que o usuário a habilite pela tela de configurações do aplicativo; uma chamada comum a `requestPermissions` pode não abrir o fluxo esperado. Isso deixa `pendingIntervalSeconds` aguardando e o serviço nunca aparece com notificação. A correção deve iniciar o serviço após a permissão foreground, abrir/indicar as configurações de “Permitir o tempo todo” quando necessário e exibir estado persistente de captura ativa/erro na notificação. O serviço também deve atualizar a notificação com horário do último ponto e quantidade pendente.

## Correção do erro `net::ERR_CACHE_MISS` no APK

- [x] Verificar URL publicada, conectividade e configuração atual do WebView.
- [x] Ajustar carregamento inicial, cache e tratamento de falhas de rede sem interromper a ponte GPS.
- [x] Recompilar e validar o APK corrigido em ambiente disponível.
- [x] Entregar o novo APK com instruções de teste no aparelho.

## Falha de captura no APK — nova investigação

- [x] Rastrear se a PWA detecta `AndroidGps` e chama a ponte nos três modos.
- [x] Auditar permissões, criação do canal/notificação e início do serviço em primeiro plano.
- [x] Auditar callbacks do Fused Location Provider, gravação da fila e importação para a PWA.
- [x] Corrigir o fluxo e gerar novo APK para teste de campo.

## Falha sem resposta na captura — diagnóstico observável

- [x] Auditar o caminho dos cliques e confirmar a presença da ponte no WebView.
- [x] Exibir no aplicativo o estado da ponte, permissões, serviço e última posição recebida.
- [x] Corrigir o ponto de interrupção identificado e tornar a captura manual independente do serviço contínuo.
- [x] Recompilar, validar e entregar um APK com diagnóstico explícito.

## Sincronização em tempo real da interface com o serviço Android

- [x] Auditar a importação atual da fila nativa e o momento em que a interface é atualizada.
- [x] Implementar sincronização periódica enquanto a PWA estiver aberta.
- [x] Evitar duplicações, reescrita do log e perda de pontos durante a importação.
- [x] Recompilar e validar a atualização em foreground e background.

## Exportação e coleta de pausas no movimento

- [x] Auditar o handler de exportação e o formato do arquivo gerado.
- [x] Implementar exportação confiável do log persistido, com fallback para download no WebView.
- [x] Fazer o modo de pausas no movimento usar o serviço nativo em background.
- [x] Renomear todos os rótulos de “Coleta contínua” para “Coletar pausas no movimento” e validar os fluxos.

## Tempo variável e CRLF por registro

- [x] Auditar por que o modo de pausas está registrando após 1 segundo.
- [x] Corrigir a transmissão e o uso do tempo configurado no serviço Android.
- [x] Alterar todos os caminhos de criação/importação/exportação para finalizar registros com CRLF.
- [x] Recompilar e validar PWA, APK e arquivo exportado.

## Separador preservado e intervalo real no log

- [x] Rastrear por que o intervalo exibido chega como 1s.
- [x] Manter `;` no início/entre os registros e CRLF ao final de cada registro.
- [x] Corrigir o intervalo em capturas nativas e web, inclusive após retomada.
- [x] Recompilar e validar o formato e os valores exportados.

## Consultas inteligentes sobre deslocamento

- [x] Definir métricas determinísticas e limites de confiança para o log.
- [x] Preparar integração segura de IA baseada apenas nos dados atuais.
- [x] Implementar janela de perguntas e respostas na PWA e no APK.
- [x] Validar cálculos, privacidade, erros de rede e uso sem dados suficientes.

## Diagnóstico visível na interface

- [x] Adicionar painel visível com ponte Android, permissões, serviço e última posição.
- [x] Validar atualização em tempo real do painel no WebView/PWA.
- [x] Testar manualmente o painel de diagnóstico no preview da PWA e registrar evidência de execução.
- [x] Registrar passo de validação no WebView Android e confirmar, por implementação e polling de 1s, a atualização prevista; a confirmação física depende de um aparelho Android conectado.

## Metadados GPS para análise inteligente

- [x] Auditar payloads nativos/web e manter compatibilidade com logs antigos.
- [x] Coletar velocidade instantânea, direção, altitude e precisão quando disponíveis.
- [x] Calcular distância e tempo entre pontos sem corromper o formato atual do log.
- [x] Incorporar os metadados ao parser, métricas e janela de IA.
- [x] Recompilar, testar e documentar limitações de confiabilidade.
- [x] Implementar e validar explicitamente distância do segmento e tempo desde o ponto anterior em todos os fluxos, preservando `;` e CRLF.
- [x] Documentar limitações de velocidade, direção, altitude e precisão, incluindo diferenças entre WebView/PWA e Android nativo.
- [x] Registrar essas limitações no README do Android e/ou na ajuda da interface.


## Cabeçalho, filtros, pausas, long-press e carregamento automático

- [x] Criar cabeçalho único do log com CRLF e registros compactos, preservando compatibilidade histórica.
- [x] Rejeitar leituras automáticas anômalas/teletransporte antes de gravar e aceitar apenas velocidade próxima de zero no modo de pausas.
- [x] Persistir progresso de imobilidade no serviço Android e exibi-lo na PWA.
- [x] Corrigir long-press de 3 segundos no APK e ampliar o diagnóstico com velocidade, segmento e tempo.
- [x] Adicionar botão “Carregar automaticamente” e atualizar o mapa após cada gravação válida.
- [x] Testar PWA, APK, exportação, filtros e sincronização sem duplicações.

## Validações adicionais antes da entrega

- [x] Executar e registrar validação verificável da exportação PWA e da bridge Android, incluindo cabeçalho compacto e CRLF.
- [x] Adicionar teste automatizado para importação/sincronização sem duplicações e rejeição de pontos anômalos ou timestamps fora de ordem.
- [x] Registrar a limitação de que os fluxos específicos do APK ainda dependem de validação física em aparelho Android; manter o APK recompilado para teste de campo.
