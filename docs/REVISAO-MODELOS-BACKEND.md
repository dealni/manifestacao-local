# Revisão do backend durante a integração dos modelos de Brasília

Data: 18/10/2026. Escopo: revisão estática e testes locais, sem banco de produção, envio real de e-mail, commit, push ou deploy.

## Resultado

Não foi encontrado defeito comprovado que exigisse alterar regras do backend nesta revisão. A troca visual dos modelos deve manter o contrato e as coordenadas atuais das atrações, do movimento e da pintura. Foram preservados os arquivos em implementação paralela.

## Contratos conferidos

- O servidor mantém o mapa de 520 × 1.280 metros: X de -260 a 260, Z de -640 a 640. Velocidades, raio do jogador e área de paz seguem em `src/simulation.js`.
- A física recorta os lotes e acessos das atrações antes de recolocar seus sólidos. O portão do Congresso interativo, elevador, portais e demais ações dependem das coordenadas existentes de `world-data.json`; modelos decorativos não devem deslocar esses contratos.
- Login por código consome o desafio e persiste a sessão antes de entregar o cookie, mantém limites e rejeita replay, expiração e falha de persistência. O envio real não foi acionado.
- Pontos e convites mantêm saldo inteiro, referências duráveis de idempotência, bônus condicionado a conta confirmada e apelido, teto do convidante e pré-validação dos dois créditos.
- PostgreSQL mantém um único escritor por chave com advisory lock; a aplicação recusa mutações se a persistência falha. A revisão executou os testes locais de adaptadores, sem acessar PostgreSQL de produção.
- Uploads continuam exigindo conta elegível, validação de imagem, cotas e reserva contra concorrência. Permissões de personagens, veículos, objetos e bandeiras seguem verificadas no servidor.
- Missões continuam concedendo itens do catálogo canônico, sem confiar em recompensa enviada pelo cliente. Atrações, corrida, pintura, PvP e desconexão mantêm seus testes de comportamento.

## Evidências

Primeira execução local: **161 testes passaram**, zero falhas, zero ignorados. Arquivos: `points*.test.js`, `referral-invariants.test.js`, `email-login*.test.js`, `persistence.test.js`, `attractions-functional.test.js`, `mission-rewards-review.test.js`, `http-mutation-session.test.js`, `production-realtime.test.js`, `production-media.test.js` e `session-boundaries.test.js`.

Segunda execução local: **122 testes passaram**, zero falhas, zero ignorados. Arquivos: `movement.test.js`, `simulation.test.js`, `paint-terrain.test.js`, `brasilia-attractions-access.test.js`, `world-actions.test.js`, `race.test.js`, `vehicle-hits.test.js`, `pvp-peace-review.test.js`, `media.test.js`, `ads-points.test.js`, `upload-image.test.js` e `turnstile.test.js`.

As duas execuções ocorreram antes da conclusão dos arquivos visuais em paralelo; a validação integrada final deve ser executada pelo agente coordenador após reunir as alterações. Estes resultados comprovam os comportamentos locais exercitados, sem afirmar homologação de produção ou gameplay visual em todos os dispositivos.
