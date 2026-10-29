# Revisão independente dos modelos de Brasília

Data: 18/10/2026. Revisão local da integração final, sem commit, push ou deploy.

## Escopo

Leitura direta de `scripts/brasilia-model-client.js`, adaptador Draco, patches de cenário,
layout compartilhado, inventário dos GLBs e CSP do servidor. Esta revisão não substituiu
arquivos dos agentes responsáveis nem executou o gerador do cliente ou navegador.

## Achados corrigidos durante a revisão

- Carregamentos sem prazo podiam ocupar os dois slots para sempre. O responsável adicionou
  abort do download em 15 segundos, prazo total de 35 segundos, manutenção da reserva e
  descarte de resultados tardios. Falha ao instalar também libera os recursos recebidos.
- Conservar todos os modelos após percorrer o mapa acumulava texturas e geometrias. A leitura
  das dimensões das imagens mediu 52 texturas distintas dos 13 prédios: aproximadamente
  549 MiB em RGBA8 com mipmaps, ou 1.136 MiB somando referências sem compartilhamento.
  Esses números são estimativas do conteúdo original, não medições de uso real da GPU.
  O runtime revisado retém dois modelos próximos em mobile e cinco em desktop, descarta
  os demais e reduz texturas para no máximo 512 e 1.024 pixels, respectivamente.
- O redimensionamento inicialmente perdia a referência ao ImageBitmap original. O código
  final examinado agrupa referências por imagem, substitui todas e fecha o bitmap original;
  em falha, descarta a cena. O descarte normal libera texturas, materiais e geometrias.

## Contratos conferidos

- Three.js do cliente e adaptador Draco são r180. As classes minificadas usadas na fábrica
  existem no bundle e o decoder é servido pelo próprio site. O WASM local compilou com
  sucesso em `WebAssembly.compile` (quatro imports e 149 exports).
- CSP do servidor e metatag permitem workers `blob:` e compilação WASM; os caminhos de
  modelos e texturas são locais, sem dependência de CDN externa.
- A instalação calcula o AABB real carregado, centraliza X/Z, alinha a base e aplica escala
  uniforme e rotação. Os 13 caminhos são distintos; o cache não reutiliza a mesma instância
  para dois edifícios do layout atual.
- Os modelos e o fallback mantêm o envelope de 520 × 1.280. Renderer e simulação usam
  `collisionLandmarks`, removendo os volumes antigos dos marcos substituídos.
- A reserva fica visível até instalação bem-sucedida e volta após descarte. `pagehide`
  descarta recursos quando a página não entra no BFCache; uma página preservada não é
  invalidada nesse evento.
- As reservas agora unem caixas dos componentes aéreos em uma geometria por edifício;
  não fecham o vão do Congresso com um caixote global. Os modelos seguem a posição da
  câmera no modo espectador e a posição do avatar no modo jogador. O diagnóstico extra
  exige localhost/loopback e `?model-debug=1`, sem ser publicado no HUD normal.
- A Catedral conserva 17 sólidos de solo e 179 componentes aéreos; o Congresso possui
  58 componentes aéreos. Os componentes foram conferidos contra vértices Draco e a
  transformação dos nodes pelo gerador reprodutível `build-brasilia-model-collisions.mjs`.

## Validação executada

```sh
node scripts/build-brasilia-model-collisions.mjs --check
node --test test/brasilia-model-controller.test.js test/brasilia-model-assets.test.js test/brasilia-model-layout.test.js test/brasilia-layout.test.js test/brasilia-scene.test.js
```

Resultado no código final revisto: **30 testes passaram, zero falhas**. O gerador confirmou
os 179/58 componentes sem reescrever o JSON. Os testes cobrem integridade de
assets e dependências locais, transformações de AABB, limites de mapa, colisões compartilhadas,
concorrência, retry, resultado tardio, falha de instalação, retenção mobile, dimensões de textura,
modo espectador, passagens da Catedral, vão entre torres e volumes aéreos no Roadster.
O decoder WASM oficial também decodificou os 13 edifícios com posições e faces reais.
Foi exercitada separadamente a troca de posição enquanto dois carregamentos estão pendentes:
os modelos antigos resolvidos são descartados e a fila atende a nova posição.

## Conclusão e limites

Não restou defeito comprovado em aberto no escopo desta revisão do código final.
Os achados de carregamento, memória, descarte e colisões foram corrigidos e revalidados.

- Os GLBs ainda têm geometrias detalhadas: Congresso tem 480.775 triângulos e Catedral,
  350.338. Limite de texturas e retenção controla memória acumulada, mas não prova FPS em
  celulares reais. O coordenador realizou validação visual com emulação de dispositivos;
  desempenho em hardware móvel real continua fora da evidência desta revisão.
- Os testes legados das nervuras da Catedral e alturas do Congresso foram atualizados
  para a geometria importada. As passagens de solo da Catedral e o vão aéreo entre torres
  permanecem livres nos testes finais. Acesso completo a interiores não faz parte desta etapa.
- Esta revisão não mediu duas pessoas em dispositivos reais nem execução de microfone.
  Não houve alteração de backend de autenticação, pontos, protocolos ou pagamentos.
