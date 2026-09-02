# Evidências de validação — 28/08/2026

A prévia desktop em 1280×720 carregou sem erro visual, com painel de captura à esquerda, mapa à direita, cabeçalho compacto e área de dados ampla. Os botões principais permanecem separados e legíveis.

A prévia móvel em 390×844 carregou sem sobreposição na área inicial; os botões Capturar GPS, Captura contínua (intervalo) e Coletar pausas no movimento ocupam a largura disponível. A área de dados mantém altura suficiente e a seção Visualização começa abaixo dela. O restante dos controles fica abaixo da dobra e deve ser alcançado por rolagem do painel.

Observação: o screenshot do gerenciador ainda identifica a versão publicada anterior enquanto as alterações atuais estão apenas em HMR; o próximo checkpoint deve atualizar essa referência.


## Validação automatizada final

A suíte `pnpm test` terminou com 3 arquivos e 13 testes aprovados. A cobertura inclui normalização de exportação, cabeçalho compacto, CRLF, filtros de teletransporte, velocidade estacionária, timestamps duplicados/fora de ordem e filtragem sequencial da fila nativa.

O build `pnpm build` terminou com sucesso e o APK `assembleDebug` foi compilado com sucesso usando Gradle 8.7. A bridge Android grava o texto recebido em UTF-8 via `MediaStore.Downloads`; o conteúdo foi normalizado antes da chamada pelo fluxo de exportação da PWA.

Não existe aparelho Android/ADB conectado nesta sandbox. Portanto, a gravação física em Downloads e os fluxos específicos do WebView — long-press, progresso estacionário, auto-load e diagnóstico em tempo real — permanecem prontos para teste de campo, mas não podem ser declarados fisicamente confirmados neste ambiente.
