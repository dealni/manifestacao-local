# Revisões e publicações — 17/10/2026

## Publicação 20261017-08

Publicada em 17/10/2026 às 22h18 de Brasília, com código do commit `d137a4b7c24d84202d9667645d6dbe52a51ab7db`, enviado à `main` pelos hooks normais. O pre-push passou com 562 testes, 731 assets íntegros e geração reproduzível. Esta documentação posterior registra o resultado; não representa outra versão do runtime.

- Candidata: 794 arquivos conferidos por SHA-256 na VPS, instalação congelada de dependências, sintaxe Node e conversão Sharp no Linux aprovadas. PostgreSQL dedicado confirmou bloqueio do segundo escritor, persistência, reabertura e recuperação após perda da própria conexão. O runtime candidato abriu dois WebSockets e preservou estado após reabertura; banco e diretório temporários removidos.
- Ativação: jogo parado para backup coordenado `backup-20261018T011820Z`, restaurado integralmente em banco temporário e removido ao finalizar. Symlink trocado atomicamente; release 07 preservada para rollback. Serviço e TURN ativos, sem reinícios inesperados nem erros de prioridade `err` no journal do jogo após a ativação.
- Público: `/health`, `/ready` e `/api/me` responderam 200, com `no-store`, sem cache do edge e com HSTS. Dois visitantes próprios trocaram 127 snapshots; o segundo recebeu movimento de 2,16 m. Ping observado de 22 ms, reconexão preservada e origem inválida recusada. O cliente servido corresponde ao hash da URL.
- Login e voz: formulário de login disponível no navegador, sem erros ou avisos no fluxo de abertura observado; solicitação sem Turnstile retornou 403 antes de enviar e-mail. Dois clientes próprios receberam credenciais temporárias de relay e trocaram sinal de voz. Nenhum e-mail real, compra com saldo real ou microfone foi acionado.
- Cloudflare: TLS mínimo 1.2 aplicado por API, Full (strict) preservado; TLS 1.0/1.1 recusados e 1.2 aceito. DNSSEC ativo com DS publicado na Hostinger e validado no registro `.com` e por resposta autenticada do DNS do Google. Regras WAF e rate limiting preservadas.
- Backups: serviço systemd executado manualmente com sucesso; timer habilitado, aguardando 18/10 às 04h50 de Brasília. A execução agendada ainda não havia ocorrido. Backup externo mantido desligado, conforme instrução do usuário.

Evidências sem credenciais em `analysis/release-20261017-08/`, fora do Git. Limites: esta rodada não homologa mil navegadores reais, microfones em duas redes, nova entrega de OTP nem recuperação funcional de login/mídia a partir do backup. O teste de persistência do runtime usou dados fictícios em banco isolado, sem modificar contas para teste em produção.

## Histórico da revisão 20261017-07 e preparação da publicação 08

Na revisão geral de 17/10/2026, a release ativa era `20261017-07`; serviço, PostgreSQL e TURN estavam ativos e `/health` e `/ready` responderam 200. Foram conferidos 28 módulos, 745 arquivos públicos e três catálogos iguais ao local. A suíte baseline tinha 501 testes aprovados; após as correções locais, `npm run check` passou com **562 testes**, sem falhas ou testes ignorados, e os 731 assets originais permaneceram íntegros.

Na etapa inicial desta revisão, as correções ainda eram locais; depois foram publicadas na release 08, conforme o registro acima. A revisão identificou spray fora do mapa e por espectadores, ataque PvP de espectadores, compra que podia terminar após logout e referência visual persistida para design excluído. O histórico da release 05 abaixo registra correções anteriores; não comprova resolução desses casos encontrados depois.

O perfil era 1.000 jogadores/1.200 WebSockets, com aprovação automática dos uploads, Turnstile configurado e TURN dedicado sem TLS. Na revisão anterior à publicação 08, TLS mínimo Cloudflare ainda era 1.0 e DNSSEC estava desativado; ambos foram ajustados depois, conforme o registro da publicação acima. Permanecem sem homologação mil jogadores reais pela internet, microfones entre aparelhos/redes e malha de 12 vozes.

Sete backups estavam disponíveis e o último passou em hashes, tar e catálogo do dump. A primeira execução diária e uma restauração nova não foram validadas nesta revisão. Backup externo permanece **desativado por decisão do usuário**; a perda integral da VPS não está coberta.

A correção local de DMs limita armazenamento a 2.000 mensagens por conversa (ambas as direções), 5.000 mensagens enviadas por conta e 50.000 no servidor. Atingir qualquer cota impede novos envios com aviso; não apaga histórico nem introduz expiração automática. Contas/estado legados acima do limite também ficam impedidos de enviar. Expansão ou arquivamento exige política administrativa futura e preservação dos dados.

### Validação das correções locais

- Sessões: requisições HTTP reais em servidor isolado confirmam resposta 401 sem débito ou alteração após logout, expiração e troca de identidade durante o corpo da requisição. Uploads revalidam a sessão após sanitização e escrita; as recusas removem o arquivo, preservam a cota e liberam a reserva. Repetir o envio com sessão válida continua funcionando.
- Designs: excluir limpa as referências independentes de `visual`, `appearance` e jogadores conectados; a conta consultada e o estado serializado não conservam o design removido.
- Gameplay: espectador não ativa PvP, ataca, recebe impacto nem pinta. Spray próximo continua funcionando; coordenadas remotas, fora do mapa ou no nível inexistente são recusadas sem persistência nem progresso. Borracha não cria áreas vazias nem concede missão, preservando remoções legítimas. O alcance é horizontal porque a altura a pé não é autoritativa no servidor.
- Terreno: `src/paint-terrain.json` é gerado junto do cliente; fórmulas puras do servidor foram comparadas ao terreno do cliente em mais de 3.500 pontos. A extração e a validação de schema rodam somente na preparação; o runtime não executa o bundle.
- Revisão: agentes independentes revisaram sessões/mídia, gameplay, social e documentação. Os resíduos encontrados foram corrigidos com regressões. `git diff --check` passou; a preparação do cliente, a conferência dos assets e a suíte completa passaram no gate final.

Na etapa de preparação, os testes usaram dados fictícios e armazenamento temporário, sem commit, push, deploy ou alteração na Cloudflare. A publicação posterior e a aplicação efetiva de TLS/DNSSEC estão registradas no início deste documento. Os testes não homologam carga de mil navegadores, áudio real ou recuperação de desastre.

## Histórico da publicação 20261017-05

Revisão com 24 agentes especializados, correções locais e publicação na VPS de apps com Cloudflare. Release daquela rodada: `20261017-05`; a `20261017-04` foi a primeira ativação desta rodada. Naquela rodada não houve commit ou push; o repositório Git foi configurado posteriormente.

## Resultado funcional

- Mantidos mapa de 520 × 1280, missões, veículos, social e funcionalidades existentes.
- Login único por código de e-mail preservado. Sessões, logout e convites com testes de regressão; nenhuma nova mensagem de e-mail real foi enviada nesta rodada.
- Compras exigem elegibilidade em produção; passe completo não cobra novamente por um passe menor já coberto.
- Cartazes e bandeiras por 100 pontos/design; telões por 100 pontos/tela/24h, rotação, cancelamento e devolução proporcional. Sem pagamentos reais.
- Corrigidos idempotência de campanhas, limites de uploads concorrentes, ações de espectadores e validação de apelidos via WebSocket.
- Imagens são reprocessadas, com processamento limitado: até 1024 px em telões e 2048 px em designs. Texturas legadas também são reduzidas no cliente.
- Cache com revalidação HTTP, broadcasts com menos serialização, menus compatíveis com navegadores sem Popover API.
- Entrada, diálogos, alvos de toque, menu mobile e cabeçalho ajustados para telas menores. Ações do cabeçalho continuam acessíveis por rolagem horizontal quando necessário.
- Páginas institucionais e metadados descrevem os pontos e a infraestrutura atuais.

## Infraestrutura e voz

VPS `srv924325`, PostgreSQL e serviço `manifestacao-local.service`, acessíveis pelo domínio `manifestacoes.com` através do Cloudflare. Unidade atualizada para recuperar após indisponibilidade prolongada do banco. Arquivos de produção conferidos por SHA-256; Sharp importado e transcodificação real testada no Linux antes da ativação.

Relay dedicado `manifestacao-turn.service` instalado via pacote oficial Ubuntu, DNS-only `turn.manifestacoes.com`, autenticação temporária HMAC. Acesso UDP/TCP 3478 e faixa UDP 49160–49659, mantendo regras de SSH e origem Cloudflare. Serviço coturn compartilhado permanece mascarado. Não foi aberto acesso anônimo ao relay.

Voz validada por alocação e troca sintética relay↔relay UDP/TCP, também entre o Mac e o IP público; credenciais expiradas e destinos privados rejeitados. O WebSocket público fornece credenciais temporárias e retransmite sinais entre dois participantes próprios. Isso não substitui teste de microfone em dois aparelhos/redes e não garante passagem em redes que bloqueiam todas essas portas. Não há relay TLS na porta 443.

## Validações e evidências

- Suíte completa: **336/336 testes passaram**, zero falhas ou testes ignorados. [Relatório](../analysis/review-production/tests.txt).
- Carga local: 30 clientes WebSocket, todos movimentando e respondendo heartbeat, cinco reconexões, 31º recusado corretamente; zero erros. RTT p95 2,91 ms **em loopback**, não latência da internet. [Resultado](../analysis/review-production/load-local.json).
- PostgreSQL real em banco temporário dedicado: snapshot, revisão, segundo escritor recusado, perda apenas da conexão própria e recuperação. Banco temporário removido. [Relatório](../analysis/production-review/postgres-real.txt).
- Navegador: 360×800, 800×360, 768×1024 e desktop. Entrada, configurações, login disponível, câmera aérea e menu exercitados. São tamanhos simulados no Chrome, não aparelhos físicos ou Safari real.
- Produção: health/ready PostgreSQL, hashes dos seis arquivos mutáveis, regras por pontos e 65 telas; [checagens](../analysis/review-production/public-checks.json).
- Multiplayer público com dois visitantes próprios: snapshots compartilhados, movimento, ping, reconexão e recusa de origem indevida. [Smoke](../analysis/review-production/smoke.json).
- Voz pública: [sinalização](../analysis/review-production/voice-public.json); relay [externo](../analysis/audit-turn-infra/external-relay.json).
- Backups anteriores às ativações: `backup-20261018T000235Z` e `backup-20261018T000532Z`, ambos com integridade e restauração isolada confirmadas. [Relatório final](../analysis/review-production/restore-final.txt).

## Limites

Não houve compra usando saldo de usuário real nem nova autenticação completa por recebimento de e-mail nesta rodada; esses fluxos tiveram regressões locais, e o envio real havia sido homologado na publicação anterior. Naquela rodada não havia homologação acima de 30 jogadores. O perfil posterior de 1.000 teve benchmark sintético local, descrito em [capacidade](CAPACIDADE-1000.md), sem homologação de pessoas reais pela internet ou de voz com 12 navegadores. Uploads têm validação técnica, sem moderação humana. Backups permanecem somente na VPS; offsite foi mantido desativado por decisão do usuário. Pagamentos reais continuam desativados.
