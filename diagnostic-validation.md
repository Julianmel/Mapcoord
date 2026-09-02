# Validação do painel de diagnóstico Android

## Preview PWA

Em 26/08/2026, a tela foi aberta no preview em viewport móvel de 390 × 844 px. A PWA carregou sem erros de TypeScript e o painel não foi exibido fora do APK, pois a ponte `window.AndroidGps` não existe em um navegador comum. Esse comportamento é esperado e confirma que a interface não mostra um diagnóstico Android falso quando executada como PWA.

## WebView Android

A sandbox não possui um aparelho Android conectado nem uma sessão WebView disponível para alterar permissões ou iniciar o serviço fisicamente. Portanto, a validação de atualização em até 1 segundo no APK permanece como teste de campo. No aparelho, abrir o APK, iniciar uma captura e observar a seção “Diagnóstico Android”: ela deve mostrar a ponte, permissões, estado do serviço, modo, pontos pendentes e o último ponto; esses valores são consultados a cada segundo.

## Procedimento de campo

1. Instalar o APK e permitir localização precisa, localização em segundo plano e notificações.
2. Abrir a captura contínua ou “Coletar pausas no movimento”.
3. Confirmar que “serviço ativo” aparece na notificação e no diagnóstico.
4. Verificar que “Último ponto” e “Pendentes” mudam sem recarregar a página.
5. Desligar a tela, aguardar o intervalo configurado e retornar ao APK para confirmar a importação do ponto.
6. Se o diagnóstico informar erro, guardar o texto exibido para identificar a permissão ou etapa que falhou.
