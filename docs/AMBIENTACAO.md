# Ambientação do mapa

Implementação de 18/10/2026. Procedimento de publicação em `deploy/README.md`.

O cenário recebe 200 pessoas e 24 veículos. Há nove caminhões de som com palco (três por time), além dos dois carros de som e dos demais veículos anteriores: dois carros, três motos, um chopper, um carrinho de pipoca, um Roadster, uma carreta sem som, um dirigível, um dinossauro, um calango e uma onça. Os figurantes mantêm somente os cinco modelos básicos, com variações de aparência e time. Livros, Bíblia, Constituição, pneu, detergente e objetos de PvP também aparecem como itens visuais de mão, sem ataques ou participação no PvP real. São reutilizados os recursos já disponíveis. As pessoas alternam pequenos percursos, pausas, danças e gestos em fases diferentes. Os veículos são estacionados. Não há etiquetas ou marcadores adicionados a esses elementos.

Carros e caminhões de som ambientais ficam no miolo do mapa em três trechos por time. Cada grupo tem veículos enfileirados nas duas laterais da avenida, alinhados em X −40 m e +40 m, com posições entre Z −150 e 165 m. Veículos de times diferentes mantêm no mínimo 80 m de distância. As músicas mantêm o alcance normal: 55 m nos carros de som e 120 m nos caminhões. Veículos conduzidos pelos jogadores mantêm seus alcances e movimentos normais.

As posições e trajetórias são verificadas contra as colisões estáticas atuais, limites do mapa, largada/circuito, spawns e acessos das atrações. O mapa permanece 520 × 1.280. Não foram criados novos interiores ou atividades, nem substituídos os elementos e recursos já existentes.

## Integração

`scripts/ambient-population.js` gera a configuração e incorpora o controlador ao cliente. Cópias temporárias das coleções são passadas somente ao renderizador de personagens, ao renderizador de multidão distante e ao renderizador de veículos. Os elementos não entram em WebSockets, contas, nomes, população online, classificações, capacidade ou física dos participantes. Cada navegador apresenta sua ambientação; ela não representa jogadores conectados nem uma simulação compartilhada de tráfego.

Pessoas reais mantêm prioridade no orçamento gráfico. No celular, a decoração usa até 24 pessoas a até 80 m da câmera, com até duas detalhadas dentro do orçamento existente; as poses ambientais são atualizadas a 20 Hz. Veículos ambientais sem som deixam de ser renderizados no celular; os equipamentos de som são exibidos a até 160 m. O catálogo completo e as fontes sonoras são preservados. Participantes e veículos reais não passam por esse filtro. No desktop, permanecem 200 figurantes, até dez detalhados, e os 24 veículos ambientais. Os identificadores visuais são separados dos identificadores da rede, com fase de animação normalizada.

O perfil gráfico padrão móvel limita renderização/animações a 30 FPS, densidade de pixels a 1 e efeitos a 55%, reduzindo o trabalho concorrente com áudio e toque. As configurações personalizadas continuam disponíveis. Esses limites reduzem o trabalho solicitado ao navegador, mas não representam uma medição de FPS ou homologação em aparelhos físicos.

`scripts/ambient-audio.js` incorpora 11 fontes ao mixer local (nove caminhões de som e dois carros de som), usando as faixas políticas locais `d5` (Funk do Bolsonaro), `e5` (Funk do Lula) e `m1` (Eu vou votar no Renan), associadas ao time de cada veículo. A origem desses arquivos não foi confirmada como jingle oficial de campanha. O áudio respeita distância, limite de fontes simultâneas, volume, silêncio e o gesto inicial exigido pelo navegador. O nível das fontes é limitado a 30%; não se força autoplay. Saída, desconexão, ocultação da página e `pagehide` interrompem somente as fontes ambientais; o retorno à página permite retomada. Não há YouTube, microfone ou nova conexão externa.

## Validação

A revisão local posterior de 18/10/2026 também corrigiu a troca repetida da fonte de música ao atravessar a fronteira entre caminhões do mesmo time. O mixer mantém a fonte já audível enquanto outra não estiver pelo menos 8 m mais próxima, respeitando o alcance de cada equipamento. Regressões cobrem a estabilidade dessa seleção e os limites móveis, preservando jogadores, veículos reais e fontes sonoras. A reprodução de áudio em aparelhos físicos continua pendente.

- Suíte completa: **676 testes aprovados**, sem falhas ou skips; verificação dos assets antigos e novos por SHA-256.
- Testes da configuração real: exatamente 200 pessoas, 24 veículos e 11 fontes válidas; percursos e colisões; cópias de renderização sem modificar os dados de jogadores; áudio, pausa, retomada e fontes reais preservadas.
- Compilação dos patches sobre o cliente real, incluindo desenho distante da multidão e índices negativos de animação.
- Navegador local: entrada como visitante, movimento, pessoas e veículos visíveis sem etiquetas, faixas locais carregada pelo mixer e contagem online correspondente apenas à conexão real.
- Limites de detalhe e áudio móveis preservados. A revisão de 200 figurantes confirmou renderização no navegador sem erros de console; não foi realizada nova medição de FPS em aparelhos móveis físicos.

Evidências atuais em `analysis/ambiente-200-20261018/` e histórico em `analysis/ambiente-20261018/`, fora do Git. A aplicação em produção permanece dependente de autorização separada.
