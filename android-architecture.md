# Arquitetura Android para captura GPS em background

## Decisão

A solução Android será um aplicativo complementar à PWA, com um serviço de localização em primeiro plano. A PWA continuará sendo a interface web e o aplicativo Android será responsável por manter a captura GPS ativa quando o usuário alternar de aplicativo ou apagar a tela.

## Por que a PWA sozinha não atende

A PWA atual executa `watchPosition()` e temporizadores dentro do documento da página. Esses mecanismos dependem de o navegador manter o documento ativo. Um service worker não possui acesso direto à sessão de geolocalização da página, portanto não pode substituir o serviço nativo.

A documentação oficial do Android informa que um serviço em primeiro plano mantém acesso à localização quando o aplicativo vai para background ou a tela é desligada, com uma notificação persistente e declaração do tipo de serviço `location` [1] [2]. A Geolocation API web fornece `getCurrentPosition()` e `watchPosition()` para páginas em contexto seguro, mas não oferece o mesmo mecanismo de serviço persistente do Android [3].

## Fluxo escolhido

O usuário inicia a coleta no aplicativo Android. O serviço nativo solicita localização precisa e permissão de background quando necessária, inicia uma notificação persistente, coleta no intervalo configurado, grava cada ponto em armazenamento local transacional e mantém a sequência e o timestamp do próprio instante da leitura. A interface em primeiro plano lê o mesmo armazenamento e apresenta mapa, log e exportação.

A captura por permanência será implementada no serviço, e não em um timer da interface: o serviço mantém a última posição estável, aplica um limiar configurável de ruído GPS e registra somente após o tempo configurado sem deslocamento. Se o processo for reiniciado, o serviço recupera os parâmetros persistidos e sinaliza a retomada ao usuário.

## Opções técnicas consideradas

| Abordagem | Tradeoffs | Custo | Complexidade |
|---|---|---|---|
| Aplicativo Android nativo em Kotlin | Melhor controle do serviço em primeiro plano e das permissões; exige distribuição/instalação Android | Sem custo de execução; eventual assinatura/distribuição | Alta |
| Aplicativo Expo/React Native com módulo nativo de localização | Reaproveita parte da interface React; exige build nativo e configuração de permissões; a coleta em background depende do módulo nativo | Sem custo de execução; eventual serviço de build/distribuição | Média-alta |
| Manter somente a PWA | Não exige instalação; não garante coleta enquanto o navegador estiver suspenso ou encerrado | Sem custo | Baixa, mas não atende ao requisito principal |

## Requisitos de segurança e distribuição

O aplicativo deve explicar claramente a coleta em background, pedir somente as permissões necessárias, exibir notificação contínua enquanto coleta e oferecer um botão explícito para parar. A distribuição pela Google Play está sujeita à política de localização em background e à justificativa de que o recurso é central para a função do aplicativo [1] [2].

## Referências

[1]: https://developer.android.com/develop/sensors-and-location/location/background "Access location in the background — Android Developers"
[2]: https://developer.android.com/develop/sensors-and-location/location/permissions "Request location permissions — Android Developers"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API "Geolocation API — MDN Web Docs"

## Fontes oficiais consultadas

As fontes oficiais consultadas foram o guia do Android sobre acesso à localização em background (https://developer.android.com/develop/sensors-and-location/location/background), o guia de permissões de localização (https://developer.android.com/develop/sensors-and-location/location/permissions) e a referência da Geolocation API web (https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API). Elas fundamentam a escolha de serviço Android em primeiro plano, notificação persistente e permissões explícitas.
