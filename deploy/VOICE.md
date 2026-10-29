# Voz opcional

A voz mantém uma sala de até 12 pessoas, com WebRTC em malha, consentimento de microfone, silenciar e sair. Ela não custa pontos: não há cobrança de uma conexão que pode falhar por restrições da rede. O WebSocket só transporta sinalização; o áudio segue entre participantes ou através do TURN. A implementação fecha microfone ao sair, perder sinalização ou desconectar dispositivo; limita filas e conexões; tenta até duas recuperações ICE no lado que iniciou a conexão.

O relay dedicado permanece ativo na release `20261017-08`, verificada em 17/10/2026, por UDP/TCP 3478, sem TLS. A sinalização pública entre dois clientes e a oferta de credenciais temporárias foram verificadas novamente; alocação relay e microfone real não foram repetidos nesta rodada. A descrição de instalação abaixo é referência operacional.

## Relay para redes distintas

Sem TURN configurado, a tela avisa que a conexão direta pode falhar. O helper abaixo prepara a infraestrutura dedicada quando executado explicitamente. Não se considera homologado áudio entre redes diferentes apenas por testes da sinalização.

O backend gera credenciais TURN REST temporárias por participante com HMAC-SHA1. Configurar no arquivo privado de ambiente do serviço, com o mesmo segredo do coturn, nunca no front ou em Git:

```ini
VOICE_STUN_URLS=stun:turn.manifestacoes.com:3478
VOICE_TURN_URLS=turn:turn.manifestacoes.com:3478?transport=udp,turn:turn.manifestacoes.com:3478?transport=tcp
VOICE_TURN_TTL_SECONDS=3600
# VOICE_TURN_SECRET deve receber segredo aleatório com pelo menos 24 caracteres.
```

Exemplo de configuração coturn para uma VPS com IP público diretamente na interface, sem NAT. Substituir os campos antes de usar, revisar a versão do pacote e preservar nginx/443:

```ini
listening-port=3478
listening-ip=IP_PUBLICO_DA_INTERFACE
relay-ip=IP_PUBLICO_DA_INTERFACE
realm=turn.manifestacoes.com
fingerprint
use-auth-secret
# static-auth-secret recebe o mesmo segredo privado de VOICE_TURN_SECRET
min-port=49160
max-port=49659
user-quota=24
total-quota=300
no-cli
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
no-tls
no-dtls
```

A faixa de 500 portas comporta as até 132 alocações de uma malha de 12 participantes e deixa margem para a coleta UDP/TCP e reconexões; essa estimativa não substitui o teste de carga.

Se houver NAT, consultar `external-ip=IP_PUBLICO/IP_PRIVADO`; as portas de relay precisam manter o mesmo número no encaminhamento. Abrir somente 3478 UDP/TCP e 49160–49659 UDP no firewall dedicado ao TURN. Não substituir regras existentes. O A/AAAA de `turn.manifestacoes.com` deve ser **DNS only**, apontando diretamente ao relay: o proxy HTTP comum do Cloudflare não transporta TURN. Verificar que DNS AAAA também chega a uma interface configurada antes de publicá-lo.

TLS é opcional em 5349 com certificado público válido para o hostname TURN, `cert`, `pkey`, `no-tlsv1`, `no-tlsv1_1` e remoção de `no-tls`; acrescentar `turns:turn.manifestacoes.com:5349?transport=tcp` e permitir 5349/TCP. O certificado Origin CA do nginx é destinado à conexão Cloudflare→origem e não deve ser usado como certificado público de TURN.

O serviço Cloudflare Realtime TURN é uma alternativa gerenciada, mas exige geração de credenciais pela API própria. Seu segredo não é intercambiável com o segredo HMAC do coturn deste adaptador. Não colar uma chave Realtime em `VOICE_TURN_SECRET` e presumir compatibilidade.

## Homologação de áudio ainda pendente

1. Testar alocação TURN autenticada, credenciais expiradas recusadas e acesso a destinos privados recusado.
2. Em dois navegadores de redes distintas, entrar na voz e falar nos dois sentidos; verificar candidato selecionado `relay` em WebRTC internals, não apenas WebSocket aberto.
3. Repetir usando rede com UDP bloqueado para testar TCP/TLS, silenciar/reativar, desconectar rede e sair; conferir que o microfone se desliga e a vaga é liberada.
4. Verificar consumo de banda/CPU com 12 participantes. O limite de jogadores no mapa é independente: o perfil atual é 1.000 jogadores e 1.200 WebSockets. Isso não homologa essa população pela internet.

Testes locais cobrem credenciais temporárias, limite de 12, identidade do emissor, validação de candidatos, saída e limitação de mensagens; não substituem a homologação de áudio acima.

Fontes: [coturn oficial](https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf), [credenciais Cloudflare Realtime](https://developers.cloudflare.com/realtime/turn/generate-credentials/), [domínios TURN Cloudflare](https://developers.cloudflare.com/realtime/turn/custom-domains/).

## Helper de instalação dedicado

`sudo env MANIFESTACAO_TURN_PUBLIC_IP=<ipv4-publico> bash deploy/setup-turn.sh --apply` aplica a configuração em **srv924325** somente quando executado explicitamente pelo operador. Na preparação de produção em 17/10/2026 no horário de Brasília (18/10 UTC), o helper foi executado na VPS com `--defer-game-restart`: o relay dedicado ficou ativo e o ambiente foi preparado, mantendo o reinício do jogo para a publicação coordenada. O serviço compartilhado `coturn.service` permanece mascarado. O endereço deve ser informado explicitamente; o helper valida IPv4 público e confere DNS e bind antes de alterar arquivos. Requer pacote coturn já instalado, ambiente privado do jogo presente e DNS-only A de `turn.manifestacoes.com` previamente apontado à VPS; não cria DNS nem instala pacotes. Recusa coturn compartilhado ativo e conflito da porta 3478. Cria serviço e usuário próprios, segredo estável em arquivo privado, cópia privada do ambiente anterior e regras UFW aditivas apenas 3478 UDP/TCP e 49160–49659 UDP. Recusa destinos internos e multicast no relay. O IP público do próprio relay permanece permitido para conectar dois participantes que dependem do mesmo TURN; os demais serviços da VPS continuam sujeitos ao firewall existente. Reexecutar preserva o segredo; reinicia apenas os dois serviços deste jogo. TCP na porta 3478 é transporte cliente→TURN, enquanto o relay de mídia permanece UDP; TLS não é habilitado pelo helper.

Para preparar o relay junto de uma publicação, use `--apply --defer-game-restart`: o serviço TURN é ativado e o ambiente é preparado, mas o jogo só passa a usar as variáveis quando o operador reiniciá-lo na publicação.

Após aplicar, testar alocação e áudio antes de considerar a voz homologada; se necessário interromper somente `manifestacao-turn.service` e restaurar as quatro variáveis `VOICE_*` a partir de `/etc/manifestacao-turn/environment.before-turn`, sem sobrescrever outras mudanças do ambiente. Não desative UFW nem altere nginx para o relay.

## Evidência da ativação

Em 17/10/2026 no horário de Brasília (18/10 UTC) foram validados alocação autenticada e tráfego relay entre duas alocações por UDP e TCP, tanto com as ferramentas coturn na VPS quanto com um cliente externo no Mac pela rede pública. As ferramentas coturn enviaram e receberam 16 pacotes em cada transporte, sem perdas. Credenciais expiradas foram recusadas e tentativa de acesso a `127.0.0.1:4180` foi recusada com 403. Evidências sem segredos em `analysis/audit-turn-infra/`. Esses testes provam o relay e o firewall; captura de microfone, reprodução de áudio e carga com 12 navegadores continuam exigindo homologação própria.
