# Revisão do cliente para integração dos modelos de Brasília

Data: 18/10/2026. Revisão estática e testes locais; sem commit, push ou deploy.

## Escopo e resultado

Foram revisados os adaptadores `scripts/design-*.js`, `scripts/points-client.js`,
`scripts/production-client.js`, `scripts/turnstile-client.js`, os controles e estilos
de voz e as folhas de estilo de entrada/HUD. Nenhum defeito funcional comprovado
nesses componentes exigiu alteração nesta revisão.

Os adaptadores usam âncoras explícitas e falham ao receber um cliente incompatível.
Isso evita transportar silenciosamente os contratos antigos de login, carteira,
anúncios e social para um bundle novo. A integração dos modelos deve manter o
cliente compatível atual e incorporar somente os recursos de cenário.

## Validação executada

```sh
node --test test/design-*.test.js test/points-client.test.js test/production-client.test.js test/voice-client*.test.js test/client-contracts.test.js test/client-social-resume.test.js
```

Resultado: **131 testes passaram, zero falhas**.

As verificações incluem submissão duplicada, respostas tardias após fechar painéis,
recuperação de foco, loja/pontos, publicação e cancelamento de campanhas, redução
de texturas, reconexão social, descarte de captura tardia de microfone, cancelamento
de conexão de voz, fullscreen WebKit e estados acessíveis dos controles mobile.

## Invariantes para a integração

- Login por e-mail e Turnstile continuam usando a API da própria instalação.
- Carteira, benefícios e campanhas continuam confirmados pelo servidor existente.
- A voz mantém a sala compartilhada opcional e não deve iniciar captura automaticamente.
- HUD, opções de atividades, seleção de personagens e interação por toque não dependem dos modelos novos.
- A troca dos edifícios não deve substituir o bundle principal nem importar o protocolo v16 do site original.

## Limites e revisão integrada pendente

Esta revisão não abriu navegador nem testou dois dispositivos com microfones reais.
A verificação visual de celulares e tablets, incluindo controles sobre os edifícios,
permanece a cargo da validação integrada. Os testes unitários comprovam os contratos
e os estados simulados; não comprovam desempenho de renderização em aparelhos reais.

## Revisão independente após a integração

A integração foi revisada em `scripts/brasilia-scene.js`,
`scripts/brasilia-model-client.js`, `src/brasilia-layout.js`, no adaptador Draco e
nos testes novos de modelos. Não foi identificada correção bloqueante comprovada.

Uma segunda execução passou **115 testes, zero falhas**:

```sh
node --test test/brasilia-model*.test.js test/brasilia-scene*.test.js test/brasilia-layout*.test.js test/design-*.test.js test/voice-client*.test.js
```

Foram conferidos:

- Decodificação Draco real dos 13 edifícios, inventário SHA256 e dependências locais.
- Limites preservados em 520 × 1.280, lotes sem sobreposição e volumes de colisão compartilhados.
- Centralização em X/Z e assentamento pelo mínimo Y antes da escala e da rotação.
- Reservas visuais por modelo, preservadas em erro de carregamento ou instalação.
- Concorrência de dois carregamentos, máximo de cinco modelos residentes no desktop e dois no mobile.
- Redução proporcional de texturas para 1.024/512 pixels e descarte de materiais, geometria, texturas e workers.
- CSP com permissões para o worker local por blob e decodificação WASM.
- Atualização do carregamento pela câmera do espectador e pelo avatar durante o jogo.

O carregador mantém a reserva simplificada após duas tentativas malsucedidas;
recarregar a página permite nova tentativa. Isso evita repetição contínua de
downloads e conserva a geometria e a física existentes em rede indisponível.

Esta revisão independente não utilizou navegador. O resultado visual e a ausência
de erros WebGL são responsabilidade da validação integrada conduzida pelo agente
principal; desempenho em aparelhos físicos e microfones reais continuam fora da
evidência dos testes acima.
