# Modelos de Brasília no mapa compacto

Implementação de 18/10/2026. Procedimento de publicação em `deploy/README.md`.

## Cenário e funcionalidades

Os 13 edifícios do cenário público novo foram integrados como modelos Draco: Catedral, Congresso, Planalto, Biblioteca, Museu Nacional, Itamaraty, Justiça, STF, Casa de Chá, Espaço Oscar Niemeyer, Panteão, Espaço Lúcio Costa e Museu da Cidade. A Torre de TV e os seis blocos de ministérios existentes permanecem.

O envelope continua **520 × 1280**. Os modelos foram ajustados aos sete lotes já limpos, com escala uniforme, rotação quando necessária e compensação do centro real de cada GLB. Não foi importado o terreno global de 1120 × 2600. Corrida, 13 atrações, 65 painéis, spawns, área de paz, índices das paredes pintáveis e coordenadas das interações foram preservados. O protocolo permanece v14; login, Turnstile, pontos, convites, PostgreSQL e voz não foram substituídos pelo cliente original.

Os edifícios são cenário externo nesta integração. Os interiores que vêm no arquivo visual não criam novos elevadores, portas, pisos navegáveis ou APIs do mapa Premium original. Os elevadores e atrações que já existiam no jogo local continuam com seus contratos próprios.

## Arquivos e geometria

- `data/brasilia-layout.json`: 13 entradas `models` com caminho, SHA-256, escala, rotação e colisões, além dos nove marcos legados. `collisionLandmarks()` substitui somente Catedral/Congresso antigos e mantém um índice comum ao servidor e cliente.
- `data/brasilia-model-assets.json`: inventário de **108 arquivos / 53.998.487 bytes**, com hashes, origem, dependências e limites por node/mesh. Inclui 13 edifícios, quatro monumentos e seis props LOD1, 79 texturas, decoder e créditos. Os monumentos/props adicionais estão disponíveis como assets; esta etapa posiciona os 13 edifícios.
- `scripts/import-brasilia-assets.mjs`: importação reproduzível, sem alterar os bytes dos recursos originais. Variantes base duplicadas e terreno global são excluídos.
- `scripts/inspect-brasilia-draco.mjs`: decodificação de geometria com o decoder Draco oficial, usada por testes e geração de colisões.
- `scripts/build-brasilia-model-collisions.mjs`: recria volumes aéreos a partir da geometria decodificada. `--check` verifica sem escrever: Catedral179 subvolumes; Congresso58. As passagens entre nervuras e o vão entre torres são exercitados nos testes.
- `scripts/brasilia-model-client.js` e `scripts/vendor/draco-loader-r180.js`: carregador, controle de memória e adaptação Draco r180 para as classes Three já presentes. Nenhuma dependência npm nova.

Créditos e licenças preservados em `public/assets/brasilia/CREDITS.json` e `public/assets/brasilia/draco-r180/`.

## Carregamento e falhas

Carregamento progressivo por proximidade, concorrência de dois downloads, no máximo dois modelos residentes em telas pequenas e cinco no desktop. Ao afastar, os recursos são liberados e a reserva visual reaparece. Texturas são reduzidas para no máximo512 pixels no mobile e1024 no desktop antes do upload à GPU, preservando proporção; bitmaps originais são fechados quando substituídos.

Há abort de rede após15s e prazo total de35s, até duas tentativas separadas por intervalo, descarte de resultados tardios e liberação no encerramento da página. Reservas leves usam uma geometria combinada por modelo, incluindo a silhueta da Catedral e as torres/vãos do Congresso. As colisões não dependem de sucesso do download. O modo espectador acompanha a câmera livre; jogadores a pé ou em veículos usam a posição do avatar.

Somente em loopback, `?model-debug=1` adiciona diagnóstico no atributo `data-brasilia-models` do elemento HTML, uma vez por segundo. Não cria painel para o jogador, não expõe conta/tokens e não é ativado no domínio de produção.

## Validação integrada

- **608 testes passaram**, sem falhas ou skips, na suíte completa, incluindo as correções anteriores de segurança/HUD.
- **731 assets antigos e108 arquivos novos** conferidos por SHA-256, sem divergências.
- Decodificação Draco WASM real dos13 edifícios e conferência das contagens de posições/faces com glTF.
- Todos os modelos dentro dos lotes, sem sobreposição com marcos mantidos; percurso da corrida amostrado a cada metro; testes preservam atrações, painéis, pintura e spawns.
- Gerador de colisões `--check` aprovado; teste do pacote confirma inclusão do inventário e dos novos assets, sem estado ou uploads privados.
- Teste isolado local com1000 clientes,15s: aprovado, RTTp9513,15ms, sem erros; não representa ensaio na internet nem carga de GPU de1000 celulares.
- Revisões independentes de backend, cliente e integração registradas em `REVISAO-MODELOS-BACKEND.md`, `REVISAO-MODELOS-CLIENTE.md` e `REVISAO-MODELOS-INDEPENDENTE.md`.
- Navegador local confirmou instalação real de GLBs por Web Worker/Draco, nenhuma falha do carregador e nenhum erro de console. Viewport pequeno confirmou dois residentes,60FPS no ambiente observado e ausência de transbordamento horizontal. Isso não é medição em aparelho físico.

Evidências operacionais desta execução em `analysis/modelos-brasilia-20261018/` (ignorado no Git). Sem acesso a dados de produção ou envio real de e-mail. A produção permanece na release anterior até nova autorização de publicação.
