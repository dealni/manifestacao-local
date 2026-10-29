# Brasília Livre — reconstrução local

> **Preparação pública em 29/10/2026:** nomes e hostnames opcionais dos sites de referência foram retirados também da base usada pelo gerador, dos catálogos e do inventário. As adaptações e seus hashes estão registrados; isso não declara autoria própria nem licença geral sobre material incorporado. Veja [preparação pública](docs/PREPARACAO-PUBLICA-2026-10-29.md).

> **Produção encerrada em 29/10/2026:** aplicação, voz e tarefas agendadas foram desativadas. O domínio responde HTTP 410. Este repositório conserva a versão local e o histórico técnico; as referências a releases abaixo são históricas. Consulte [encerramento e revisão para publicação](docs/ENCERRAMENTO-2026-10-29.md).

> **Revisão local da escuta dos palcos (18/10/2026), ainda sem publicação:** corrigido aviso de voz desligada que permanecia após reativar a escuta. O painel Som agora distingue som geral, voz e volume zero; ativar o som retoma o contexto de áudio durante o clique. O microfone explica impedimentos reais e desconexão do dispositivo. Também foi corrigido o clique central de entrada que podia ser perdido no WebKit. Regressões ampliadas para orador e plateia em dois clientes, sem microfones físicos. Veja [voz dos palcos](docs/VOZ-PALCOS.md). Sem commit, push ou deploy nesta rodada.

> **Revisão geral complementar com 20 agentes (18/10/2026), local e sem publicação:** implementação e revisão independente cobriram backend, cliente, multiplayer, persistência, mídia, economia, atividades, áudio, modelos e gates. Foram corrigidos confirmação de autenticação antes da gravação, respostas antigas após logout, leitura de conversas arquivadas/bloqueadas, ativação de designs após reinício, rollback de uploads em falhas de persistência, limpeza na retomada de sessões, transições de corrida/debate, crédito indevido de passageiros, escolha contextual de caronas, carregamentos distantes de modelos e foco de diálogos. Referências técnicas oficiais foram consultadas e os artefatos do cliente foram regenerados. Os resultados desta rodada ficam em `.artifacts/revisao-geral-*.log`; a auditoria de dependências está em `.artifacts/revisao-geral-audit.json`. Validação local não homologa microfones/aparelhos físicos nem implementa as integrações externas listadas em “Limites e diferenças”. Sem commit, push, deploy ou alteração em produção.

> **Validação final desta rodada:** `npm run check` aprovado com 956 testes, cobertura de 98,18% das linhas, 92,95% das branches e 94,28% das funções; PostgreSQL real em cluster temporário aprovado; 36 cenários de navegador aprovados em seis projetos Chromium/WebKit, incluindo celular, paisagem, tablet e música no perfil iPhone. Conferidos 731 assets originais e 108 de Brasília, sem divergências; `npm audit` sem vulnerabilidades conhecidas reportadas. A tentativa adicional de Firefox voltou a falhar ao iniciar o motor com “Could not find profile folder”, antes de abrir a aplicação. Resumo estruturado em `.artifacts/revisao-geral-resumo.json`.

> **Caronas implementadas localmente (18/10/2026):** carros e carros de som de jogadores levam motorista e um passageiro, inclusive entre times. Use E ou o botão contextual para embarcar e sair. O servidor controla proximidade, lotação, acompanhamento do carro e liberação nas transições de sessão ou atividade. O embarque no palco dos caminhões permanece disponível. Veja [caronas e embarque](docs/CARONAS.md). Esta alteração ainda não foi publicada.

> **Revisão local de voz com três agentes (18/10/2026), sem publicação:** controle de microfone independente do menu Ações no desktop e celular, cancelamento da preparação pelo botão, descarte de confirmações e áudio atrasados, liberação após falha do processador e continuidade da fala no caminhão em movimento. Ajuda, grupos e painel Som foram alinhados aos usos disponíveis. Veja [voz dos palcos](docs/VOZ-PALCOS.md).

> **Revisão complementar local com quatro agentes (18/10/2026), ainda sem publicação:** sair da mesa por desbloqueio de posição, teleporte ao palanque ou embarque no caminhão agora encerra a participação no debate e libera os comandos de movimento. Respostas sociais atrasadas respeitam a pessoa selecionada e o fechamento do menu, inclusive após saída ou desconexão. A API rejeita JSON que não seja objeto antes de alterar o estado. Chaves de compras com recibos arquivados continuam rejeitando outro produto, mesmo quando já adquirido. As correções têm regressões próprias e o cliente foi regenerado pelo gerador oficial. Sem commit, push, deploy ou acesso à produção.

> **Segunda revisão geral local (18/10/2026), ainda sem publicação:** novos agentes corrigiram cotas de uploads paralelos, confirmação de logout, falhas de armazenamento JSON, convites antigos após bloqueio, checkpoints por teleporte, altitude residual ao trocar o Roadster e colisões de golpes/atropelamentos. Downloads cancelados liberam arquivos, e mídia segue o contrato HTTP de Range/HEAD. Editor, loja, conversas, áudio, microfone, Turnstile e menus descartam estados ou callbacks antigos. A entrada em paisagem estreita, o histórico do superchat e o fechamento do debate receberam ajustes de acessibilidade. O gate PostgreSQL também isola opções e credenciais herdadas. As mudanças permanecem locais, sem commit, push, deploy ou alteração em produção.

> **Revisão geral local (18/10/2026), ainda sem publicação:** correções de segurança e privacidade, gerenciamento de foco nos diálogos, responsividade da entrada e dos controles, além de ajustes de desempenho. A validação de navegador foi ampliada para Chromium e WebKit em perfis de desktop, celular e tablet; Firefox ficou disponível como verificação opcional, pendente de execução por uma falha de inicialização do motor no ambiente local. Os testes usam dados isolados; a revisão não inclui commit, push, deploy ou alterações em produção. A matriz emulada não substitui a homologação em aparelhos físicos.

> **Correção posterior de música no iPhone (18/10/2026), local e sem publicação:** a medição no WebKit com perfil iPhone 15 Pro Max reproduziu 27 reposicionamentos automáticos da música em cerca de 25 segundos, mesmo parado e a 30 FPS. O sincronizador agora espera o carregamento inicial, uma busca pendente e dados suficientes; não corrige com o contexto de áudio inativo. No iOS, a margem passa de 250 ms para 1 s para não perseguir o desvio estável observado entre mídia e Web Audio; desvios maiores continuam sendo corrigidos. Outros sistemas preservam a margem anterior. A suíte de navegador inclui regressão específica com MP3 real no WebKit; isso não substitui teste no iPhone físico.

> **Ajustes locais para celular (18/10/2026), ainda sem publicação:** o áudio ambiente mantém a fonte ao cruzar entre caminhões do mesmo time, evitando reiniciar a faixa por movimentos pequenos. O perfil gráfico padrão móvel limita renderização/animações a 30 FPS, densidade a 1 e efeitos a 55%; configurações personalizadas permanecem disponíveis. A decoração móvel usa até 24 figurantes próximos, dois detalhados, e remove veículos ambientais sem som. Participantes e veículos reais são preservados. O minimapa mantém a proporção clicável em paisagem. Veículos decorativos são identificados na interface; a carona de jogadores foi implementada na rodada descrita acima, e a condução pela garagem permanece disponível. A melhora de fluidez e áudio ainda precisa ser conferida em celular físico.

> **Músicas selecionadas (local):** 16 MP3 locais, sendo 9 de Bolsonaro/Flávio, 6 de Lula e 1 de Missão/Renan. O painel Som permite escolher e avançar músicas nos equipamentos do jogador; as fontes fixas de ambientação percorrem a lista do próprio time automaticamente. Catálogo em `data/music-tracks.json`, com durações medidas e origem dos arquivos. As demais faixas saíram do catálogo ativo. Sem publicação em produção.

> **Voz na versão local:** microfone apenas nos palanques e no palco do caminhão de som de jogador. Um orador por vez, escuta até 60 m. A sala compartilhada e microfones de mesas e grupos foram removidos. Consulte [voz dos palcos](docs/VOZ-PALCOS.md). Sem publicação em produção.

> **Ambientação local:** 100 pessoas sem etiquetas, três veículos de som, dois carros e três motos usam os recursos existentes, com controle de distância e prioridade gráfica para participantes reais. Anúncios e destaques continuam em pontos. Veja [ambientação](docs/AMBIENTACAO.md). Ainda sem publicação.

> **Revisão local de confiabilidade (18/10/2026):** reconexões preservam o progresso temporário de visitantes; teleportes não concedem caminhada; corridas respeitam o prazo antes de premiar. Debates evitam retransmissões idênticas e estados incompatíveis com veículos. Proximidade considera a posição real, e IDs de veículos respeitam o protocolo. Modelos recuperam falhas de carregamento e usam margem de estabilidade no mobile; respostas tardias respeitam a janela atual. A biblioteca permite excluir mídias sem campanhas ativas, com confirmação de persistência antes de remover arquivos compartilhados. Essas alterações ainda não foram publicadas.

> **Alterações locais de 18/10/2026, ainda sem publicação:** personagens, veículos, bandeiras e objetos liberados para visitantes; PvP mantém consentimento. Corrida e missões aceitam visitantes, com progresso da sessão. Conta por e-mail permanece necessária para salvar progresso e ranking, amigos, mensagens privadas, uploads e publicações próprias. Designs pessoais são gratuitos (limite de 20 por tipo). **Anúncios continuam custando 100 pontos por telão/24 horas e destaques/superchat a partir de 100 pontos.** Saldos e convites preservados. Denúncias públicas agora são registradas com limites e retenção de até 30 dias, sem promessa de análise por IA. A descrição histórica abaixo refere-se à versão já publicada. Veja [acesso livre](docs/ACESSO-LIVRE.md) e [modelos novos de Brasília](docs/MODELOS-BRASILIA.md).

Produção histórica: `manifestacoes.com` (encerrada). Última release descrita nesta seção: `20261017-10`, publicada em 17/10/2026 às 23h19 de Brasília, com código do commit `13b0452`, Cloudflare, backend Node na VPS de apps e PostgreSQL. O perfil configurado é de 1.000 jogadores e 1.200 conexões WebSocket; capacidade real pela internet ainda exige homologação. Consulte [produção](docs/PRODUCAO.md) e [capacidade e limites](docs/CAPACIDADE-1000.md).

Visitantes e contas por código de e-mail estão disponíveis. Pontos, convites, cartazes/bandeiras e anúncios estão publicados; pagamentos reais continuam desativados. Uploads passam por validação técnica e aprovação automática, sem moderação humana. Na release histórica, o TURN dedicado operava sem TLS; áudio real entre aparelhos/redes ainda precisa ser homologado.

A revisão usou 501 testes como baseline; as correções de spray, PvP de espectadores, sessões durante compras/uploads, exclusão de designs e cotas de DMs foram publicadas após 562 testes aprovados. TLS mínimo 1.2 e DNSSEC estão ativos, com DS publicado na Hostinger e cadeia validada externamente. Backup externo permanece desligado por decisão do usuário. Histórico, verificações e limites estão em [revisão de produção](docs/REVISAO-PRODUCAO.md).

Adaptação local de Brasília sobre a reconstrução do cliente público incorporado, iniciada em 17/10/2026. Os assets vieram do cliente entregue ao navegador; o servidor foi reimplementado por compatibilidade com os contratos observados. Não é o código-fonte original do backend nem uma réplica comprovadamente idêntica às suas regras internas.

## Cenário de Brasília

Brasília é representada de forma compacta e estilizada no mesmo retângulo jogável de **520 × 1.280 unidades**: X entre −260 e 260, Z entre −640 e 640. A direção do mapa é um eixo de jogo, sem correspondência obrigatória com o norte geográfico. O fundo visual continua podendo ultrapassar o limite caminhável.

- Torre de TV e setor comercial numa ponta, pavilhão cultural e jardins no centro, Catedral, blocos ministeriais e Congresso Nacional na outra ponta.
- Corredor da avenida, ruas transitáveis, largada e circuito, spawns, zonas de debate/paz e lotes das 13 atrações preservados.
- Modelos de personagens, veículos, atrações, árvores e mobiliário reaproveitados. Os marcos institucionais usam geometria procedural; a atração satírica do Congresso permanece separada.
- IDs técnicos das atrações, painéis e paredes mantidos. As pinturas das paredes substituídas ficam guardadas, mas essas paredes deixam de aceitar/exibir novas marcas.
- A adaptação do cenário não acrescentou interiores, expansão do mapa ou alteração do protocolo. A publicação posterior está documentada em `docs/PRODUCAO.md`.

`data/brasilia-layout.json` é a referência de lotes e marcos; `src/brasilia-layout.js` contém os critérios comuns de geometria. Os módulos `scripts/brasilia-scene.js`, `scripts/brasilia-spray.js` e `scripts/brasilia-content.js` integram a adaptação ao `npm run prepare-client`. Não edite apenas `public/client.js`: ele é uma saída gerada. Os assets visuais permanecem preservados; a base de código recebeu a limpeza de identificadores documentada na preparação pública.

A revisão ampliada distribuiu 24 áreas entre agentes. O recorte de prédios remove também as torres que perderam seus embasamentos: o prédio suspenso junto à Catedral e três volumes próximos aos ministérios foram corrigidos. Colisões aéreas usam os componentes dos novos marcos; o spray ignora paredes retiradas; retomadas em posições bloqueadas voltam a um spawn livre. O corredor de acesso do ET Bilu foi alinhado ao cliente. Foco de DMs após reconexão e textos de missões já persistidas também foram corrigidos sem apagar progresso. Evidências e limites em `analysis/brasilia-validation.md`.

O estado local anterior à mudança foi preservado em `data/snapshots/antes-brasilia-*`, diretório privado e ignorado pelo Git. `analysis/brasilia-baseline.json` registra a geometria anterior sem credenciais. Os testes usam estado temporário e não apagam contas, uploads, anúncios ou progresso da instalação.

## Abrir

Para desenvolvimento, inicie o servidor e acesse **http://127.0.0.1:4173/**.

Para iniciar novamente, nesta pasta:

```sh
npm start
```

Ou abra `iniciar.command` no Mac. Use Node.js 24.22.1 e npm 12.2.1 conforme os pins do projeto. Em outra máquina, execute `npm ci` antes de iniciar. `Ctrl+C` encerra. Esse comando mantém o ambiente de desenvolvimento em loopback. A produção usa o serviço isolado na VPS descrito em `docs/PRODUCAO.md`.

Você pode entrar como visitante ou usar código de e-mail. Sem transporte de envio configurado, o desenvolvimento fornece `localCode` para teste; com transporte configurado, o código chega por e-mail. Produção não expõe o código local. Use contas fictícias e dados isolados na validação; configuração em [login por e-mail](docs/LOGIN-EMAIL.md).

## O que funciona localmente

| Área                 | Reconstrução                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cenário e interface  | Renderer Three.js, Brasília estilizada, mapa do mesmo tamanho, personagens, customização, bandeiras, animações, configurações e controles desktop/mobile |
| Assets               | Cópia física independente de todos os 731 assets arquivados: inclui 256 GLB, texturas, retratos, fontes, áudio, chunks e documentação                    |
| Multiplayer          | WebSocket v14, snapshots binários, lobby, presença, nomes, chat, modo espectador, reconexão e múltiplas abas                                             |
| Movimento            | Caminhada, corrida e veículos, índice espacial de colisão sincronizado com o cenário; adaptação de física terrestre e Roadster com boost/salto/rolagem   |
| Contas               | Login/logout por código de e-mail, apelido, sessões e visual persistente; fluxos legados com senha restritos ao desenvolvimento                          |
| Loja                 | 43 personagens, Premium, passes, veículos e objetos liberados para contas locais; resgates com pontos internos e persistência, sem pagamentos reais      |
| Cartazes e bandeiras | Editor original, upload, armazenamento, ativação, exclusão e texturas no mundo                                                                           |
| Telões               | 65 painéis com IDs e formatos preservados, poses adaptadas a Brasília, upload, reserva por pontos por 24h, rotação de campanhas e transmissão            |
| Social               | Amizades, pedidos, bloqueios, busca de contas locais, mensagens privadas persistentes com cotas de armazenamento e salas sociais                         |
| Atividades           | Spray persistente, missões, PvP consentido, corrida com fila/checkpoints/pódio, atrações, glitter e padaria                                              |
| Debates              | Mesas, anfitrião/convidado, fila, convites, permissões e relógio locais                                                                                  |
| Voz                  | Microfone único nos palanques e no palco do caminhão de som; uma pessoa por vez, escuta por proximidade até 60 m, ativação explícita                     |

A correção local desta rodada limita DMs a 2.000 mensagens por conversa (ambas as direções), 5.000 envios por conta e 50.000 mensagens no servidor. Ao atingir uma cota, novos envios são recusados com aviso; o histórico permanece preservado, sem expiração automática. Arquivamento ou ampliação requer política administrativa própria.

As correções de segurança validam poses com orçamento de movimento por tempo e trajetória, contam atividade uma vez por conta e permitem uma inscrição por conta em cada corrida. O histórico de entrada contém apenas chat global; mensagens locais continuam sendo entregues ao vivo por proximidade. Anúncios têm limite de 20 novas campanhas por hora e retenção de até 200 recibos por conta, removendo somente recibos cancelados ou expirados. Chaves de pedidos arquivados permanecem reservadas: retries não cobram novamente e retornam conflito quando o recibo já não está disponível. Essas alterações foram publicadas na release `20261017-10`, após 591 testes locais e validação isolada com PostgreSQL na VPS.

## Limites e diferenças

- O backend original, banco, moderação, operações e integrações privadas não foram obtidos. As regras locais foram inferidas ou criadas para compatibilidade; os relatórios por módulo explicitam as diferenças.
- Algumas colisões procedurais e interações físicas entre atores/veículos, atropelamentos, rampas e física aérea permanecem aproximações. A fidelidade visual do cliente não demonstra equivalência da simulação de servidor.
- Impactos com veículos e progressão de missões possuem implementação e testes próprios, incluindo jornada com reinícios. A física continua reconstruída: o servidor valida trajetórias previstas pelo cliente; não há equivalência comprovada com o backend original. Evidências em [revisão de interface e funcionalidades](docs/REVISAO-DESIGN.md).
- Não há população de jogadores externos. Somente abas e sessões conectadas a esta instalação compartilham o mundo. Personagens Premium não continuam simulados indefinidamente após fechar a conexão, embora parte do texto original do benefício permaneça na interface.
- Pagamentos reais, OAuth, YouTube, moderação por IA, TTS e transcodificação remota não são integrados. Resgates gastam pontos internos; em produção, uploads são decodificados e reprocessados com `sharp`, com aprovação automática técnica. O envio de e-mail depende do transporte configurado e está publicado em produção.
- A voz usa um painel local independente. Não replica automaticamente as salas e a espacialização de áudio do LiveKit original. Sinalização e permissões foram testadas; captura/reprodução com dois microfones reais não foi validada. Nenhuma permissão de microfone foi aberta durante a validação automatizada.
- Corridas conservam fila de 5 minutos do cliente; não começam imediatamente. Progresso por conta persiste; algumas atividades temporárias (mesas, salas, participantes) terminam ao desconectar.
- O servidor não usa o backend do site original. A aplicação permite as integrações configuradas de e-mail, Turnstile e STUN/TURN; a CSP autoriza o domínio do desafio Turnstile. Links informativos externos permanecem como links navegáveis por decisão do usuário.

## Validação histórica da implantação inicial

- **207 testes Node aprovados na rodada de produção**, incluindo HTTP e WebSocket reais em portas temporárias, dois jogadores, snapshots conformes aos parsers originais, contas, uploads, compras simuladas e persistência após reinício. A suíte inclui regressões de Brasília, superfícies de spray, volumes aéreos, posições de retomada, contratos reais do cliente e isolamento de sessões. `analysis/production/tests.txt` registra aquela rodada; `analysis/brasilia-tests.txt` preserva a rodada de cenário com 148 testes; `analysis/test-results.txt` preserva o registro histórico da versão inicial (63 testes).
- **731 assets da base incorporada conferidos por SHA-256, sem divergências**. Execute `node scripts/verify-assets.js` para repetir.
- Browser: entrada no cenário, texturas, login fictício, chat, carro, movimento e Roadster. Nenhum erro/warning do cliente nos fluxos verificados após corrigir a CSP de blobs.
- Observação de 89 eventos de rede durante recarga e entrada: nenhum destino externo observado. Esta evidência cobre os fluxos exercitados, não todos os caminhos possíveis do código.
- Evidências visuais em `analysis/screenshots/`.
- Brasília no navegador: login fictício em instalação isolada, chat, condução do carro pelos controles móveis, sobrevoo, Torre de TV, Congresso, Catedral corrigida, ministérios, upload e anúncio gratuito visível em telão 3D. Nenhum erro/warning nos fluxos exercitados. O servidor temporário e seus dados de QA foram removidos; o ambiente de desenvolvimento pode ser iniciado em `http://127.0.0.1:4173/`.
- Regeneração repetida produziu `public/client.js` e `public/index.html` idênticos por SHA-256.

```sh
npm test
node scripts/verify-assets.js
npm run prepare-client
```

O último comando regenera `public/client.js` e `public/index.html` com patches assertivos sobre a base local adaptada em `public/assets/index-DYj4UDIq.js` e `analysis/original-index.html`. Também extrai `src/paint-terrain.json`, usado para validar as superfícies de spray no servidor; não edite esse JSON manualmente. A extração executa trechos geométricos conhecidos somente na preparação, sem executar o bundle no servidor. Não exige acesso à pasta da extração inicial.

## Histórico de correções anteriores

A revisão foi corrigida e validada com testes de regressão, preservando os assets visuais e mantendo a adaptação da base documentada:

- Tickets de jogo agora são opacos e vinculados à sessão HTTP; IDs públicos e tickets legados não autenticam sockets. Logout, expiração, troca de login e reset revogam comandos, notificações privadas e progresso de todas as conexões da sessão, inclusive sockets substituídos durante o fechamento.
- Reconexão restaura veículo e inscrição em corrida durante uma queda de até 10 segundos; jogadores offline não avançam checkpoints. Sessões inválidas não recebem classificação.
- Superchat possui contrato completo sem TTS, abre o formulário e confirma a simulação local.
- Telões retornam autenticação, disponibilidade e audiência por painel; preservam o ID do telão na playlist e oferecem o contrato de cópias de mídia. O callback de compra paga é concluído uma única vez.
- Pintura salva responde por bandas numéricas do cliente; a borracha é localizada e mantém desenhos distantes/máscaras parciais. Ataques PvP possuem clipe e duração válidos.
- Skins e IDs de designs aprovados da própria conta persistem; troca para personagem base e limpeza explícita removem o modelo/desenho anterior.
- DMs só são marcadas como lidas após confirmação da conversa visível; a leitura sincroniza as abas. Expulsão de debate impede retorno à mesma mesa.
- URLs malformadas no upgrade fecham somente o socket inválido. Falhas de microfone permanecem visíveis antes de entrar na voz.

Validação adicional no navegador, em instalação temporária: login, publicação de superchat, seleção do MASP, upload de imagem pública, aprovação local, conclusão da compra e anúncio visível no telão 3D, sem erros de console nos fluxos exercitados. Evidências: `analysis/screenshots/correcoes-teloes.jpg` e `analysis/screenshots/correcoes-anuncio-3d.jpg`. Captura/reprodução real de microfone permanece sem validação de dispositivo.

## Estrutura e dados

- `src/server.js`: HTTP, arquivos estáticos/Range, estado, origem local e roteamento de upgrades.
- `src/realtime.js`, `src/protocol.js`: sincronização v14 e mensagens.
- `src/simulation.js`, `src/roadster.js`: física local.
- `src/auth.js`, `src/economy.js`: identidade, conta e benefícios.
- `src/media.js`, `src/world-actions.js`, `src/race.js`, `src/social.js`, `src/debate.js`, `src/stage-voice.js`: módulos de gameplay.
- `public/`: cliente adaptado e assets independentes da extração original.
- `data/state.json`: persistência JSON no desenvolvimento para contas, hashes legados de senha, sessões, benefícios, amizades, mensagens e progresso. Produção usa PostgreSQL. Gravação atômica com permissão de arquivo `0600`.
- `data/uploads/`: imagens e mídias criadas localmente.
- `data/catalog.json`, `data/media-screens.json`: catálogo e geometria recuperados.
- `analysis/`: cliente legível, engenharia reversa, contratos e notas de fidelidade por módulo.

Para preservar esta instalação, copie a pasta com o servidor parado, incluindo `data/`. Para recomeçar, faça uma cópia dos dados e remova apenas `data/state.json` e `data/uploads/`; os catálogos devem permanecer. Os testes usam diretórios temporários e não apagam o estado da instalação.

As licenças e créditos incluídos nos assets foram preservados. A disponibilidade pública dos arquivos não implica licença geral de redistribuição. A publicação inicial não incluiu commit ou push. O beta foi publicado em `https://manifestacoes.com/`; configuração, evidências e limites em `docs/PRODUCAO.md`.

## Git e desenvolvimento

Repositório: `dealni/manifestacao-local`. A linha destinada à publicação pública começa com um único commit-raiz revisado, sem vínculo com os commits anteriores; os backups completos da etapa privada ficam fora do repositório. A visibilidade efetiva é confirmada no GitHub após os gates de envio. O ambiente de qualidade usa Node.js 24.22.1 e npm 12.2.1, fixados em `.nvmrc`, `.node-version` e `packageManager`. Atualizações compatíveis dentro dos majors 24/12 são aceitas a partir desse baseline; Node 22 deixou de fazer parte do ambiente validado.

```sh
git clone https://github.com/dealni/manifestacao-local.git
cd manifestacao-local
npm ci
npm run check
npm start
```

O Lefthook confere arquivos privados, credenciais, lint e formatação do conteúdo preparado no índice antes do commit. A mensagem segue Conventional Commits e deve ser escrita em pt-BR. No pre-push, todos os objetos introduzidos no histórico enviado são inspecionados, inclusive conteúdos removidos em commits posteriores. Exclusões de branches não executam gates de código; tags anotadas são resolvidas até o commit validado. Atualizações de código exigem HEAD e checkout estáveis durante todo o gate.

`npm run check` verifica runtime, ESLint sem warnings, tipos, formatação, sintaxe, geração reproduzível sem modificar o checkout, assets e testes com cobertura. A cobertura obrigatória abrange todo `src/**/*.js`, com mínimos de 96% de linhas, 90% de branches e 91% de funções; arquivos não carregados pelos testes também reprovam. Geradores e bibliotecas arquivadas ficam fora dessa métrica de backend. A checagem de tipos é gradual: `strict`/`checkJs` validam protocolo e configuração de runtime, com contratos positivos e negativos em `types/`.

`npm test` e `npm run test:coverage` iniciam a suíte em ambiente isolado: configurações de banco, dados, origem pública, e-mail, Turnstile, Git e opções Node herdadas do shell são removidas antes dos testes. Fixtures que precisam de configuração usam valores explícitos e dados temporários. Prefira esses entrypoints aos comandos diretos de `node --test`; flags podem ser passadas com `npm test -- --test-name-pattern=...`.

`npm run check:all`, obrigatório no pre-push e antes de uma release, acrescenta PostgreSQL real, a matriz de navegadores desktop/mobile/tablet e reprodução de música no WebKit com perfil de iPhone. A integração cria e remove um cluster local privado, sem TCP, ignorando `DATABASE_URL` e variáveis `PG*` herdadas. Instale `initdb` e `pg_ctl` no PATH ou indique a pasta em `QUALITY_POSTGRES_BIN`; execute como usuário comum. A falta dessas dependências reprova o gate. Nenhum banco da instalação ou de produção é usado.

Para o navegador, execute `npx playwright install chromium webkit` após `npm ci`. O smoke inicia servidor próprio em `127.0.0.1:4179`, usa dados temporários e verifica entrada como visitante, WebGL, chat e reconexão. A matriz obrigatória de revisão cobre cinco contextos: desktop Chromium e WebKit, celular Chromium em retrato e paisagem e tablet WebKit com perfil iPad Mini. Para acrescentar Firefox desktop, instale o motor com `npx playwright install firefox` e execute `QUALITY_FIREFOX=1 npm run test:browser`; falhas desse projeto continuam reprovando a execução. Na revisão de 18/10/2026, o Firefox instalado terminou antes de abrir a aplicação com “Could not find profile folder”, inclusive em uma reprodução mínima isolada, ficando como pendência de ambiente. Os projetos `desktop-chromium` e `mobile-chromium` também executam os demais testes de navegador, exceto a regressão de música.

No macOS, o Chromium da matriz usa ANGLE Metal na GPU local; em Linux, mantém SwiftShader. O perfil gráfico padrão do produto, os limites de tempo e as verificações da suíte permanecem ativos. A validação local em Metal não comprova o desempenho do renderer por software em Linux.

A reprodução de música é verificada separadamente no WebKit com perfil iPhone 15 Pro Max: a regressão mede reprodução de MP3 e ausência de buscas corretivas contínuas por 15 segundos após a inicialização. A porta `4179` deve estar livre. Esses testes não homologam microfones, GPUs, saída acústica ou aparelhos físicos; celular e tablet usam emulação de viewport e dispositivos no Mac. Evidências de falha ficam em `.artifacts/browser/`, fora do Git.

Use `npm run format` para formatar fontes próprias e `npm run prepare-client` para atualizar os quatro artefatos gerados antes de preparar alterações. `npm run format:check` e `npm run check:generated` apenas conferem. Não formate o bundle original, saídas geradas ou vendor manualmente: os adaptadores dependem de contratos textuais. O GitHub Actions da conta está indisponível por cobrança; os gates são locais. Não use `--no-verify`. Commit, push e deploy são etapas separadas.

O histórico inclui os assets públicos e quatro arquivos públicos de análise necessários à reprodução/testes. Dados de jogadores, uploads, snapshots, credenciais, dumps e relatórios operacionais permanecem somente no ambiente local/servidor. Links históricos para evidências ignoradas pelo Git só funcionam no workspace original. Nenhuma credencial de produção é necessária para executar os testes locais.


## Limites de manutenção

A política local usa **500 linhas físicas por arquivo**, **complexidade ciclomática
15 por função** e **150 linhas efetivas por função** para registrar dívida. Linhas efetivas ignoram comentários e vazios;
marcação JSX não entra no tamanho da função, mas expressões e callbacks entram.
Funções aninhadas têm complexidade própria; seu texto ainda faz parte do tamanho
da função externa. Métricas identificam candidatos à revisão, não defeitos sozinhas.

`npm run check:complexity` mede o código e recusa dívida nova ou piora de cada
exceção individual. O legado está em `tools/quality/tamanho-baseline.json` e
`tamanho-funcoes-baseline.json`; reduzir uma função ao limite remove seu cap.
`CI=1` é somente leitura. `npm run complexity:baseline` é uma migração explícita
que exige revisão do diff, nunca uma etapa automática para destravar testes.
Os testes do gate rodam em `npm run test:quality`, dentro de `check`/`check:all`.

O escopo inclui `src/`, `scripts/` e `public/local-compat.js`. A varredura de
`public/` exclui `client.js` e `assets/`, saídas geradas/terceiros. `scripts/vendor/`,
testes, declarações e mocks também são excluídos. A simulação e seus módulos `simulation-geometry/` permanecem integralmente
medidos, inclusive os dados de geometria organizados por setores espaciais.
O agregador preserva a ordem original dos colisores.
A API AST usa o alias de desenvolvimento `typescript` (TypeScript 6.0.2),
porque o TypeScript 7.0 não oferece a Compiler API. O compilador nativo
TypeScript 7.0.2 usa o alias `@typescript/native`, como nos demais sistemas.

`typecheck` chama explicitamente `node node_modules/@typescript/native/bin/tsc`.
A ordem de instalação não pode escolher o compilador do projeto.

Instalações gravam versões exatas e exigem revisão dos scripts de dependências
por versão (`strict-allow-scripts`). O postinstall automático do Lefthook fica
bloqueado; o `prepare` do próprio projeto instala os hooks explicitamente.
