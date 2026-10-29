# Acesso livre no jogo

Implementação local de 18/10/2026. Sem commit, push ou deploy nesta etapa.

## Regras atuais

| Recurso | Visitante | Conta por e-mail |
| --- | --- | --- |
| Personagens e skins catalogados, veículos e sons incluídos, bandeiras e objetos | Gratuitos | Gratuitos |
| PvP | Gratuito, com consentimento e respeitando área de paz | Mesmas regras |
| Corrida | Participação e resultado na sessão, até 24 pilotos | Também salva ranking global |
| Missões e atrações | Progresso temporário da conexão | Progresso persistente |
| Chat público/local, spray e voz | Disponíveis; voz mantém limite de 12 | Mesmas regras |
| Visual e progresso salvos entre sessões, amigos e mensagens privadas | Exige conta | Disponíveis |
| Cartazes e bandeiras personalizados | Exige conta | Gratuitos, com quotas e validação das imagens |
| Anúncios nos telões | Exige conta | 100 pontos por telão durante 24 horas |
| Destaques/superchat | Exige conta | A partir de 100 pontos, intervalo mínimo de 30 segundos |

Os pontos e convites continuam existentes; não há compra de pontos com dinheiro ou pagamentos reais. Nenhum saldo anterior foi apagado ou convertido. Itens de gameplay não consomem mais pontos.

Uploads continuam exigindo conta confirmada, apelido, sessão válida e propriedade da mídia. Limites de quantidade, frequência e formatos permanecem. Liberar o catálogo não libera uso do design de outra conta nem remove consentimento, limites do mapa ou regras de combate. Os modelos novos de Brasília continuam sendo cenário externo, sem criação de interiores navegáveis.

## Implementação

O servidor usa `freeAccess: true` por padrão. O contrato `/conta` separa `access` (direitos públicos de jogo) de `user`, `authenticated` e `ticket` (identidade real). Visitantes continuam com usuário e ticket nulos. Não são criadas contas ou sessões artificiais para liberar itens.

`scripts/free-access-client.js` é aplicado depois dos demais adaptadores do cliente, que é regenerado por `npm run prepare-client`. Servidor e cliente consultam o mesmo catálogo. Identidades de corrida distinguem participantes de conta e de conexão; somente contas recebem ranking persistente. Visitantes usam progresso temporário fora do estado durável.

O parâmetro interno `createLocalServer({freeAccess:false})` mantém o contrato anterior para regressão de dados, compras antigas e testes de compatibilidade. Não é controlado por pedidos do navegador. As configurações públicas de anúncios e destaques continuam em pontos nos dois modos.

## Denúncias e limites

Denúncias de chat somente aceitam mensagens realmente entregues ao denunciante. A opção no menu do participante corresponde à última mensagem recente recebida desse participante. Denúncias de spray verificam pintura existente e proximidade. Conteúdo e autoria são obtidos pelo servidor, sem confiar no texto enviado pelo navegador.

São mantidos até 1.000 registros, com janela de 30 dias e limpeza automática a cada minuto enquanto o servidor está ativo (inclusive ao iniciar), além de limites por identidade e global. O estado existente salva os registros em JSON no desenvolvimento ou PostgreSQL quando configurado. A consulta administrativa dos registros não equivale a um painel de moderação ou a uma equipe de atendimento; nenhum processamento por IA foi integrado.

## Validação

Testes específicos cobrem contrato anônimo HTTP, seleção e equipamentos por WebSocket real, conta com saldo preservado, designs próprios gratuitos, anúncios e destaques cobrados em pontos, reembolsos, corrida de visitantes, progresso temporário e denúncias válidas e inválidas. Os testes antigos de compras com pontos usam explicitamente o modo de compatibilidade. A suíte completa passou com 637 testes, sem falhas ou skips. Assets antigos e novos foram conferidos por SHA-256. Evidência local: `analysis/acesso-livre-20261018/check.txt`.

Voz entre aparelhos e redes diferentes, desempenho em celulares físicos e carga pública com 1.000 pessoas ainda precisam de homologação real. Esta mudança não altera o mapa de 520 × 1.280 nem publica alterações em produção.
