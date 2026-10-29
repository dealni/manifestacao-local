# Produção — Brasília Livre

Este documento descreve a implantação de `https://manifestacoes.com`, com Cloudflare na entrada e o servidor Node na VPS de apps. O estado abaixo foi verificado em 17/10/2026; configurações e testes são evidências desse momento, não garantia de disponibilidade futura.

## Publicação atual — 17/10/2026, 23h19: release 20261017-10

Código `13b045266309e2f9becd355b40f847a2813b33f9`, com correções de orçamento/colisão das poses previstas, atividade única por conta, inscrição e recompensa únicas por conta/corrida, histórico de entrada somente global e retenção/cotas de anúncios por conta com chaves de idempotência preservadas. Commit e push passaram pelos hooks: 591 testes e 731 assets originais sem divergências; CI remoto não foi usado como evidência.

Pacote de 798 arquivos, SHA-256 `dd5c4c720775707c2c4d91112cf7a0231936e40c7fbfaad9ee3c476a03ec907b`. Hashes por arquivo, sintaxe Node e `sharp` sob o usuário do serviço aprovados. Na VPS, 62 testes de regressão passaram. A candidata também passou em runtime de produção com **banco PostgreSQL descartável separado**: sessão HTTP de conta fictícia, upload/reprocessamento WebP, ativação de design, compra/cancelamento/retry de anúncio, rejeição de pose inválida, chat local, unicidade da inscrição e persistência de conta/mídia/idempotência após reabertura. O banco e os arquivos temporários dessa fixture foram removidos; o banco de produção não foi usado na homologação.

Backup coordenado com somente o jogo parado: `backup-20261018T021953Z`, integridade e restauração real aprovadas em banco temporário, removido ao finalizar. Ativação em `2026-10-18T02:19:54Z` (17/10, 23h19 de Brasília), com a release 09 preservada para rollback. Saúde local e pública com PostgreSQL prontas; zero reinícios automáticos e nenhum aviso/erro do serviço no intervalo pós-deploy verificado. Os demais serviços e as configurações privadas não foram alterados. Backup externo permanece desligado.

Smoke público aprovado: dois visitantes próprios, 130 snapshots, movimento de 1,98 m recebido pelo par, ping observado de 21 ms, reconexão e recusa de origem inválida. Um segundo smoke confirmou recusa de poses adulteradas em JSON, array e binário, histórico contendo somente canal global, sinalização entre dois peers próprios e emissão de credenciais temporárias TURN. O navegador abriu o cenário, entrou como visitante, abriu/fechou a garagem e exercitou o controle de movimento. Evidências privadas em `analysis/release-20261017-10/`.

**Limites:** não foram enviados chat público ou e-mail real, feitos uploads/compras em contas de produção, nem aberto o microfone. Os fluxos autenticados foram exercitados somente na candidata isolada, com o mesmo código e dependências publicados. Entrega real de OTP/Turnstile, áudio entre aparelhos/redes e capacidade de mil jogadores continuam sem homologação nesta rodada. Não se infere funcionamento de todos os fluxos apenas pela saúde HTTP.

## Histórico — 17/10/2026, 22h57: release 20261017-09

Código `12f08cd48d1da9cff562609a8647d7fb84dd7d8b`, publicado após pre-push local com 577 testes e 731 assets originais íntegros. Limpeza do HUD: mapa, ações e conversa recolhíveis; atividades em Opções; Superchat compacto e avisos móveis empilhados. Backend, catálogo e dependências são idênticos à release 08.

Pacote com 797 arquivos conferidos por SHA-256 na candidata; sintaxe e `sharp` aprovados. Backup local `backup-20261018T015737Z` criado com serviço parado e restauração validada em banco temporário. Release 08 preservada para rollback. Serviço ativo, PostgreSQL pronto e zero reinícios automáticos no pós-deploy. HTML, cliente e quatro CSS alterados conferem com o código publicado através do domínio público.

Smoke público aprovado: dois clientes próprios, 132 snapshots, movimento recebido pelo par (2,06 m), ping observado de 19 ms, reconexão e rejeição de origem inválida. Navegador confirmou HUD compacto e reabertura de mapa, ações, conversa e menu de atividades. Sem envio de chat, compra, e-mail ou microfone real nesta rodada. Evidências privadas em `analysis/release-20261017-09/`. Backup externo continua desligado.

## Histórico verificado em 17/10/2026: release 20261017-08

Serviço, PostgreSQL e TURN ativos; `/health` e `/ready` responderam 200. A release foi ativada às 22h18 de Brasília, com código do commit `d137a4b` e 794 arquivos conferidos por SHA-256. O perfil configurado é `MAX_PLAYERS=1000` e `WS_MAX_CONNECTIONS=1200`. Os hooks locais passaram com 562 testes e 731 assets íntegros; isso não homologa mil pessoas reais pela internet. O runtime Linux passou com PostgreSQL dedicado, dois WebSockets e persistência após reabertura, sem usar o banco de produção na homologação.

Login por código de e-mail, pontos, convites, cartazes/bandeiras e reserva de telões estão publicados. Pagamentos reais permanecem desativados. Uploads de imagens passam por reprocessamento técnico e aprovação automática, sem moderação humana. As variáveis de Turnstile estão presentes no ambiente e o widget Managed está configurado; presença de configuração não substitui desafio e entrega de e-mail de ponta a ponta. O relay TURN dedicado está ativo por UDP/TCP 3478, sem TLS; microfone real em duas redes ainda exige homologação.

Cloudflare possui proxy, Full (strict), HTTPS obrigatório, WAF e rate limiting de autenticação. APIs foram verificadas sem cache e HSTS está presente. TLS mínimo foi elevado para 1.2: tentativas TLS 1.0/1.1 receberam alerta remoto de versão e TLS 1.2 conectou. DNSSEC está ativo, com DS publicado na Hostinger, confirmado no registro `.com` e resposta autenticada pelo DNS do Google.

O backup local `backup-20261018T011820Z`, feito com o jogo parado antes da ativação, passou em integridade e restauração em banco temporário, removido ao finalizar. O serviço de backup foi executado manualmente pelo systemd e terminou com status zero; o timer está habilitado e aguardava 18/10 às 04h50 de Brasília. A primeira execução diária automática ainda depende desse horário futuro. Backup externo permanece desligado por decisão do usuário.

As correções de sessões HTTP, uploads, exclusão de designs, spray, PvP de espectadores e cotas de DMs foram publicadas. O smoke público confirmou dois clientes, 127 snapshots, movimento de 2,16 m recebido pelo par, ping observado de 22 ms, reconexão e recusa de origem inválida. A voz pública entregou credenciais temporárias de relay e retransmitiu sinal entre dois clientes próprios; microfone não foi aberto. Evidências operacionais privadas em `analysis/release-20261017-08/`. Os relatos das releases 03, 05, 06 e da revisão 07 são históricos.

## Histórico da release 20261017-03

Login por e-mail e economia com pontos/convites foram publicados com 266 testes aprovados. Houve recebimento real em destinatário autorizado e login; a conta com 300 pontos foi preservada após reinício. Backup `backup-20261017T234500Z` foi restaurado em banco temporário naquela rodada. Evidências em `analysis/release-20261017-03/`. As restrições iniciais de uploads e anúncios foram substituídas nas releases posteriores.

## Histórico da primeira implantação

- Serviço do jogo ativo na VPS de apps, com PostgreSQL local e origem Node em loopback.
- DNS Cloudflare apontando para o IPv4 público configurado da VPS, com proxy habilitado, SSL/TLS Full (strict) e redirecionamento obrigatório para HTTPS.
- Certificado de origem com vencimento em 17/10/2027. Monitorar e renovar antes dessa data.
- Cadastro, recuperação e demais fluxos de e-mail indisponíveis; uploads públicos bloqueados. O acesso inicial permanece como beta gratuito para visitantes.
- Timer de backup instalado: 07:40 UTC, equivalente a 04:40 em Brasília, com atraso aleatório de até 15 minutos. Restauração real do dump em banco temporário aprovada, incluindo a tabela de estado.
- PostgreSQL real validado: exclusão do segundo escritor, reabertura de estado persistido e tratamento de falha. Em teste controlado do serviço, o encerramento da conexão de banco provocou saída com código 1; o systemd reiniciou o jogo após cinco segundos e a saúde voltou a responder. A unidade registrou um reinício nesse exercício.
- Suíte final: 207 de 207 testes aprovados. O smoke público identificou o entrypoint com prefixo SHA-256 `4511c14b98be` e confirmou os bytes correspondentes ao artefato esperado.
- Smoke público com dois clientes WebSocket: 133 snapshots recebidos, movimento de 2,06 m, ping observado de 25 ms e reconexão aprovada. Origem inválida foi rejeitada. Esse smoke não enviou chat.
- Navegador público: após erro 525 durante aproximadamente três a quatro minutos de propagação, o jogo abriu; entrada como visitante, movimento de cerca de 2 m e inspeção aérea da Catedral e do Congresso foram verificados. O espaçamento entre chat e HUD foi ajustado para 17 px. O console teve zero erros e um aviso `THREE.Material` por `map` opcional indefinido, sem falha nos fluxos exercitados; não equivale a console sem avisos. Evidência: [captura pública final](../analysis/production/brasilia-publica-final.png).

Foi executado teste sintético na própria VPS, com cada faixa mantida por 15 segundos:

| Clientes | Entrada e movimento | Erros | RTT p95 |
| --- | --- | --- | --- |
| 10 | Todos | 0 | 1,56 ms |
| 20 | Todos | 0 | 1,90 ms |
| 30 | Todos | 0 | 1,75 ms |

Uma rodada adicional manteve 30 clientes por 30 segundos: todos entraram e se moveram, sem erros; RTT p95 de 3,65 ms e tráfego agregado de 471.492 bytes/s, aproximadamente 0,45 MiB/s.

As medições de carga usam loopback e clientes sintéticos. Elas não incluem internet, Cloudflare, renderização, dispositivos móveis, microfone ou permanência prolongada. Não homologam 30 pessoas reais em redes distintas nem uma sala maior. O smoke público e a revisão no navegador acima são evidências separadas, com poucos clientes.

## Arquitetura

```text
Navegador → Cloudflare DNS/proxy HTTPS → nginx TLS na VPS
                                         └─ Node em 127.0.0.1:4180
                                              ├─ PostgreSQL local
                                              └─ uploads persistentes em disco
```

HTTP, APIs e os WebSockets `/ws` e `/local-voice` usam a mesma origem. A simulação continua em um processo Node; o Cloudflare não executa uma segunda cópia da sala. PostgreSQL e a porta Node ficam restritos à VPS. O nginx confia somente nos intervalos de rede oficiais do Cloudflare para obter o IP do visitante e sobrescreve o cabeçalho entregue ao Node. Uma conexão direta à origem não pode escolher arbitrariamente seu IP de jogador.

A configuração inicial usa o proxy e cache do Cloudflare, sem Worker ou Durable Object. Os assets públicos continuam na release da VPS; uploads permanecem em diretório persistente. R2 não é requisito desta implantação nem está automaticamente configurado. APIs, autenticação, saúde e WebSockets não devem receber uma regra de cache geral.

Os quatro recursos mutáveis próprios referenciados pelo HTML — `/client.js`, `/local.css`, `/local-voice.css` e `/local-voice.js` — recebem versão na URL com os primeiros 12 caracteres do SHA-256. Isso evita reaproveitar o cliente antigo após uma atualização. Na verificação pública, o JavaScript recebeu `max-age=14400` do Cloudflare apesar do `no-cache` da origem; portanto não assumir ausência de cache nesses recursos. O HTML respondeu `no-cache`, e API/saúde usam `no-store`. Os assets originais conservam seus caminhos com hash e `max-age=86400`.

O Praça Livre foi uma referência arquitetural de Workers/Durable Objects, não um backend intercambiável: sua sala e persistência eram menores. Sua configuração antiga não deve ser reaplicada ao domínio. A implantação atual usa DNS com proxy para a VPS; conferir novamente rotas, DNS e certificados antes de cada alteração de infraestrutura.

## O que muda no beta público

- Entrada como visitante e funcionalidades disponíveis ao visitante permanecem acessíveis.
- Criação e acesso à conta usam código de e-mail. Produção não entrega códigos locais. O cadastro/recuperação clássicos com senha continuam desligados; não importar contas de desenvolvimento.
- Pontos internos permitem resgatar benefícios. Bônus iniciais e de convite estão documentados em `PONTOS-CONVITES.md`. Não há Pix, cartão, compra de pontos ou pagamento real.
- Uploads públicos de imagens estão habilitados para contas elegíveis, com validação, reprocessamento e cotas. A aprovação é automática; não há moderação humana de conteúdo.
- A sinalização de voz e o relay TURN estão disponíveis. O relay não usa TLS; testes sintéticos não garantem áudio real em todos os aparelhos/redes.

O mapa continua com 520 × 1.280 unidades e os mesmos contratos de jogo. A adaptação de produção não acrescenta mapa, interiores, integração comercial ou equivalência com o backend original.

## PostgreSQL

`src/persistence.js` conserva o contrato de estado atual em um documento JSONB versionado na tabela `manifestacao_state`: `state_key`, `schema_version`, `revision`, `payload` e `updated_at`. Cada snapshot confirmado usa transação. Isso é persistência PostgreSQL real, mas ainda não é um modelo relacional normalizado para contas, mensagens e compras.

Uma conexão dedicada mantém um advisory lock por chave de estado; uma segunda simulação tentando escrever na mesma chave é recusada. A fila de gravação conserva somente o snapshot pendente mais recente para limitar memória. A aplicação deve concluir o flush antes de confirmar alterações duráveis e no encerramento. Uma falha de persistência exige interromper alterações e tratar a instância como indisponível, em vez de continuar aceitando progresso sem armazenamento.

Produção exige `DATABASE_URL` e não importa nem sobrescreve `data/state.json`. A inicialização parte dos defaults quando a chave não existe. Uma eventual migração de dados locais deve ser deliberada, com servidor parado, validação e cópia privada; não copiar contas fictícias, sessões, desafios ou snapshots de desenvolvimento. `DATABASE_STATE_KEY` identifica a sala persistida e deve permanecer estável entre releases.

Não executar duas instâncias para a mesma sala nem escalar por processos compartilhando a chave. Múltiplas chaves criariam mundos separados; não constituem balanceamento transparente. Posições transitórias e salas continuam em memória e são interrompidas no reinício.

## Configuração e diretórios

Os templates e o procedimento operacional estão em [`deploy/README.md`](../deploy/README.md).

| Item | Valor previsto |
| --- | --- |
| VPS | alias `vps-apps`, identidade esperada `srv924325` |
| Serviço/usuário | `manifestacao-local` |
| Releases | `/opt/manifestacao-local/releases/<identificador>` |
| Release ativa | `/opt/manifestacao-local/current` |
| Estado/arquivos graváveis | `/var/lib/manifestacao-local`, modo `0700` |
| Ambiente privado | `/etc/manifestacao-local.env`, root, modo `0600` |
| PostgreSQL | banco exclusivo `manifestacao_local`, acesso local |
| Node | loopback `127.0.0.1:4180` |
| nginx | `/etc/nginx/sites-available/manifestacao-local` |
| Certificado de origem | `/etc/ssl/manifestacao-local/origin.pem` e chave privada irmã |
| Cloudflare | registros com proxy; SSL/TLS Full (strict); WebSockets habilitados |

Variáveis sem segredo para a instalação:

```dotenv
NODE_ENV=production
PUBLIC_ORIGIN=https://manifestacoes.com
HOST=127.0.0.1
PORT=4180
DATA_DIR=/var/lib/manifestacao-local
DATABASE_STATE_KEY=manifestacao
MAX_PLAYERS=1000
WS_MAX_CONNECTIONS=1200
```

`DATABASE_URL` deve ser preenchida exclusivamente no arquivo de ambiente privado; não registrar seu conteúdo em comandos, relatórios ou Git. O usuário PostgreSQL deve ser exclusivo da aplicação. `PUBLIC_DIR` permite separar a pasta pública, e `TRUST_PROXY=false` desliga a leitura de cabeçalhos confiáveis. A confiança em proxy deve permanecer restrita a loopback.

`www.manifestacoes.com` deve redirecionar para a origem canônica antes de chegar à aplicação; o host de produção autorizado é o configurado em `PUBLIC_ORIGIN`. O certificado deve cobrir os nomes utilizados pelo nginx. Certificado Origin CA não equivale a certificado público para conexão direta de navegador.

## Limites operacionais

Os defaults atuais de `src/runtime-config.js` incluem 1.000 jogadores, 1.200 conexões WebSocket totais, 10 conexões por IP, 120 mensagens por segundo por conexão, 8 chats por 10 segundos, 20 ações por segundo e 30 entradas por minuto. O limite HTTP geral é 600 requisições por minuto por IP; uploads têm corpo máximo de 20 MiB e orçamento de 2 GiB, com validação e cotas próprias para envios públicos. Manter os limites coordenados entre nginx e aplicação.

Esses números são configurações de proteção, não capacidade homologada. Snapshots detalhados usam seleção espacial e limites de atores; a visão geral é compartilhada. O custo e a banda continuam crescendo com a população da sala. A RAM de 32 GB da VPS não comprova CPU, latência, banda nem isolamento dos demais sistemas. Para homologar o perfil configurado, medir tick, atraso, buffer, CPU, memória e tráfego sob carga e com pessoas reais.

Os resgates de benefícios com pontos possuem intervalo mínimo de dois segundos e limite de 60 por hora por conta. Seus recibos usam `free:false` e registram o débito em pontos, sem cobrança de dinheiro real. Recibos são limitados a 100 por conta e 10.000 no total; a poda do histórico não revoga benefícios já concedidos. Esses controles limitam abuso dos resgates e não constituem integração de pagamentos.

Variáveis opcionais de voz: `VOICE_STUN_URLS`, `VOICE_TURN_URLS`, `VOICE_TURN_SECRET` e `VOICE_TURN_TTL_SECONDS`. O segredo TURN não pode ir ao cliente; a aplicação gera credenciais temporárias. Não habilitar um relay compartilhado sem autenticação, cotas e observação de banda. Captura/reprodução em duas redes deve ser validada separadamente dos testes de sinalização.

## Backup e recuperação

[`deploy/BACKUP.md`](../deploy/BACKUP.md) detalha o procedimento. `deploy/backup.sh` produz `pg_dump` custom e tar de uploads, com hashes e publicação atômica do conjunto em `/var/backups/manifestacao-local`. O timer instalado roda diariamente às 07:40 UTC, equivalente a 04:40 de Brasília, com atraso aleatório de até 15 minutos, retendo sete conjuntos completos. Diretórios têm modo `0700`; arquivos, `0600`.

O dump é consistente no PostgreSQL, mas banco e uploads online não formam uma transação conjunta: exclusões concorrentes podem deixar referências sem arquivo. Para uma cópia estritamente coordenada, parar somente `manifestacao-local.service`, copiar e reiniciar inclusive se houver falha. Não parar PostgreSQL nem os outros projetos. O timer não provoca essa interrupção diária.

`deploy/validate-backup.sh` verifica hashes, tar e restauração em banco temporário isolado, removido ao finalizar. Confirmar restauração não comprova todos os fluxos da aplicação; complementar com login/mídia em ambiente isolado. Os backups locais não protegem contra perda integral da VPS: backup externo permanece desativado por decisão do usuário.

## Ativação, validação e rollback

1. Conferir identidade da VPS, recursos, portas e inventário Cloudflare. Preservar os outros serviços e virtual hosts.
2. Gerar release candidata, instalar dependências congeladas, executar testes e verificar os 731 assets originais. Nunca incluir `data/state.json`, snapshots, contas ou uploads locais no pacote.
3. Validar PostgreSQL com banco descartável, falha de armazenamento, exclusão de segundo escritor e reinício. Criar o banco de produção com estado limpo.
4. Instalar serviço, nginx, certificado e ambiente privado. Validar unidades e `nginx -t` antes de ativar.
5. Guardar backup e comprovar restauração. Registrar release e versão do esquema sem credenciais.
6. Trocar o symlink ativo atomicamente e reiniciar `manifestacao-local`. A parada deve fechar sockets e aguardar o flush; reinício interrompe a sala.
7. Verificar saúde local com `Host: manifestacoes.com`, saúde HTTPS pública, entrada visitante, dois WebSockets, movimento, chat, reconexão, restrições de autenticação/upload, Turnstile e comportamento do host/origem inválidos. Confirmar cache e ausência de erro no navegador.
8. Registrar resultados efetivos, incluindo limites ainda não validados. Testes locais não provam microfone, carga ou comportamento em todas as redes.

Para rollback, parar somente o jogo e selecionar a release anterior compatível com o esquema e estado atuais; depois reiniciar e repetir os checks. Restaurar banco é uma ação distinta e pode descartar alterações posteriores ao backup. Nunca apagar estado de produção ou voltar para `state.json` para contornar erro. Uma mudança de DNS/Cloudflare pode precisar de retorno próprio, preservando a política de TLS.

## Plano de infraestrutura e homologação

TLS e DNSSEC foram aplicados na publicação 08. As demais etapas indicam decisões preservadas ou homologações ainda necessárias.

1. **TLS mínimo Cloudflare aplicado:** alteração isolada de 1.0 para 1.2 via `PATCH /zones/{zone_id}/settings/min_tls_version`, preservando Full (strict), WAF e demais configurações. O template `deploy/cloudflare-security-rules.json` reflete o valor ativo. HTTPS, APIs, WebSocket e recusa de TLS 1.0/1.1 foram conferidos. [Documentação oficial](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/minimum-tls/).
2. **DNSSEC aplicado:** assinatura ativada na Cloudflare e DS publicado na Hostinger; cadeia de confiança conferida externamente e status Cloudflare ativo. Em rollback, retirar o DS do registrador e aguardar sua propagação antes de desativar a assinatura da zona. Só ativar a assinatura no Cloudflare não conclui o processo; [procedimento oficial](https://developers.cloudflare.com/dns/dnssec/).
3. **Backup externo desativado por decisão do usuário:** manter offsite desligado, sem configurar destino ou integração. Os conjuntos permanecem exclusivamente na VPS e não protegem contra perda integral dela. Uma futura ativação exige nova instrução, escolha de destino, retenção, cifragem e validação de recuperação.
4. **Timer e restauração:** após o próximo horário agendado, conferir execução real, conclusão sem erro e conjunto novo completo. Restaurar banco e uploads em ambiente isolado e executar login/mídia com dados de teste, sem sobrescrever produção. Registrar data, conjunto e resultados; catálogo legível não é restauração.
5. **Capacidade e voz:** homologar o perfil de 1.000 jogadores em instância isolada com banco de testes, carga externa autorizada e métricas de CPU, tick, PostgreSQL e banda. Validar voz bidirecional em dois aparelhos/redes, caminho `relay`, reconexão e saída; testar UDP bloqueado e registrar limite do TURN TCP sem TLS. Carga de 12 microfones e eventual TURN TLS precisam de etapa própria.

Pagamentos, moderação humana, armazenamento de objetos externo e licença de redistribuição dos assets extraídos continuam exigindo decisões específicas. Disponibilidade pública dos arquivos não estabelece autorização geral. A integração com PostgreSQL preserva as limitações funcionais descritas no README.
