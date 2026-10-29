#!/usr/bin/env bash
# Configura somente o relay dedicado deste jogo. Executar manualmente após revisão.
set -euo pipefail
if [[ ${1:-} != --apply || $# -gt 2 || ( $# == 2 && ${2:-} != --defer-game-restart ) ]]; then
  echo 'Uso: sudo env MANIFESTACAO_TURN_PUBLIC_IP=<ipv4-publico> bash deploy/setup-turn.sh --apply [--defer-game-restart] (somente srv924325; requer coturn já instalado)'
  exit 2
fi
[[ $(hostname -s) == srv924325 ]] || { echo 'Host diferente da VPS de apps esperada.' >&2; exit 1; }
[[ $EUID == 0 ]] || { echo 'Execute como root.' >&2; exit 1; }
for tool in turnserver openssl python3 systemctl ufw; do command -v "$tool" >/dev/null || { echo "Dependência ausente: $tool. Instale/revise antes de aplicar." >&2; exit 1; }; done
[[ -f /etc/manifestacao-local.env ]] || { echo 'Ambiente privado do jogo não encontrado.' >&2; exit 1; }
[[ ! -L /etc/manifestacao-local.env ]] || { echo 'Ambiente não pode ser symlink.' >&2; exit 1; }
# Não assumir controle de uma instância coturn existente de outros sistemas.
if systemctl is-active --quiet coturn.service; then echo 'coturn compartilhado já ativo; revise manualmente antes de configurar outro relay.' >&2; exit 1; fi
MANIFESTACAO_TURN_ACTIVE=0
if systemctl is-active --quiet manifestacao-turn.service; then MANIFESTACAO_TURN_ACTIVE=1; fi
export MANIFESTACAO_TURN_ACTIVE
: "${MANIFESTACAO_TURN_PUBLIC_IP:?Defina o IPv4 público autorizado para este relay.}"
export MANIFESTACAO_TURN_PUBLIC_IP
python3 - <<'PY'
import socket,os,ipaddress
public_ip=os.environ["MANIFESTACAO_TURN_PUBLIC_IP"]
try:
    if not ipaddress.IPv4Address(public_ip).is_global: raise ValueError()
except ValueError: raise SystemExit("Informe um IPv4 público válido para o relay.")
addresses={item[4][0] for item in socket.getaddrinfo('turn.manifestacoes.com',3478,socket.AF_INET)}
if addresses != {public_ip}: raise SystemExit('Crie primeiro A DNS-only turn.manifestacoes.com para o IPv4 informado; não publicar AAAA sem relay IPv6.')
try:
    if socket.getaddrinfo('turn.manifestacoes.com',3478,socket.AF_INET6): raise SystemExit('Remova/revise AAAA: este helper configura somente IPv4.')
except socket.gaierror: pass
# Recusar conflito de portas antes de alterar arquivos.
if os.environ['MANIFESTACAO_TURN_ACTIVE'] != '1':
    for kind in [socket.SOCK_STREAM,socket.SOCK_DGRAM]:
        with socket.socket(socket.AF_INET,kind) as check: check.bind((public_ip,3478))
PY
id manifestacao-turn >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin manifestacao-turn
install -d -m 0750 -o root -g manifestacao-turn /etc/manifestacao-turn
if [[ ! -f /etc/manifestacao-turn/secret ]]; then
  (umask 077; openssl rand -hex 32 > /etc/manifestacao-turn/secret)
fi
[[ ! -L /etc/manifestacao-turn/secret ]] || { echo 'Segredo não pode ser symlink.' >&2; exit 1; }
chmod 0600 /etc/manifestacao-turn/secret
chown root:root /etc/manifestacao-turn/secret
export MANIFESTACAO_TURN_BINARY
MANIFESTACAO_TURN_BINARY=$(command -v turnserver)
python3 - <<'PY'
from pathlib import Path
import os,re,tempfile
folder=Path('/etc/manifestacao-turn')
secret=(folder/'secret').read_text().strip()
if not re.fullmatch('[0-9a-f]{64}',secret): raise SystemExit('Segredo TURN inesperado; preserve e revise manualmente.')
config='''listening-port=3478
listening-ip=PUBLIC_IP
relay-ip=PUBLIC_IP
realm=turn.manifestacoes.com
fingerprint
use-auth-secret
static-auth-secret=SECRET
min-port=49160
max-port=49659
user-quota=24
total-quota=300
no-cli
no-multicast-peers
no-tls
no-dtls
no-tcp-relay
max-bps=1000000
stale-nonce=600
'''.replace('SECRET',secret).replace('PUBLIC_IP',os.environ['MANIFESTACAO_TURN_PUBLIC_IP'])
for blocked in ['0.0.0.0-0.255.255.255','10.0.0.0-10.255.255.255','100.64.0.0-100.127.255.255','127.0.0.0-127.255.255.255','169.254.0.0-169.254.255.255','172.16.0.0-172.31.255.255','192.168.0.0-192.168.255.255','224.0.0.0-255.255.255.255','::1','fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff']:
    config+=f'denied-peer-ip={blocked}\n'
# Dois participantes podem usar relay neste mesmo servidor. Não bloquear o IP
# público do relay: os candidatos remotos também podem ter esse endereço.
# Serviços internos continuam bloqueados pelas faixas privadas e pelo firewall.
path=folder/'turnserver.conf';path.write_text(config);path.chmod(0o640)
import grp
os.chown(path,0,grp.getgrnam('manifestacao-turn').gr_gid)
env=Path('/etc/manifestacao-local.env')
text=env.read_text();lines=[line for line in text.splitlines() if not re.match(r'^(?:export\s+)?VOICE_(?:STUN_URLS|TURN_URLS|TURN_SECRET|TURN_TTL_SECONDS)=',line)]
lines+=['VOICE_STUN_URLS=stun:turn.manifestacoes.com:3478','VOICE_TURN_URLS=turn:turn.manifestacoes.com:3478?transport=udp,turn:turn.manifestacoes.com:3478?transport=tcp',f'VOICE_TURN_SECRET={secret}','VOICE_TURN_TTL_SECONDS=3600']
# Atomic rewrite, keeping unrelated environment entries and a private recovery copy.
backup=Path('/etc/manifestacao-turn/environment.before-turn')
if not backup.exists(): backup.write_bytes(env.read_bytes());backup.chmod(0o600)
fd,tmp=tempfile.mkstemp(dir='/etc',prefix='.manifestacao-turn-env-')
with os.fdopen(fd,'w') as handle: handle.write('\n'.join(lines)+'\n')
os.chmod(tmp,0o600);os.replace(tmp,env)
unit='''[Unit]
Description=TURN dedicado Manifestacao
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=manifestacao-turn
Group=manifestacao-turn
RuntimeDirectory=manifestacao-turn
ExecStart=BINARY -c /etc/manifestacao-turn/turnserver.conf --pidfile=/run/manifestacao-turn/turnserver.pid --log-file=syslog --simple-log
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
[Install]
WantedBy=multi-user.target
'''.replace('BINARY',os.environ['MANIFESTACAO_TURN_BINARY'])
Path('/etc/systemd/system/manifestacao-turn.service').write_text(unit)
PY
# Regras aditivas e limitadas às portas deste relay; não abrir 443 nem alterar SSH.
ufw allow 3478/udp comment 'manifestacao-turn'
ufw allow 3478/tcp comment 'manifestacao-turn'
ufw allow 49160:49659/udp comment 'manifestacao-turn'
systemctl daemon-reload
systemctl enable manifestacao-turn.service
systemctl restart manifestacao-turn.service
systemctl is-active --quiet manifestacao-turn.service
# Somente o serviço do jogo; nenhum outro app é reiniciado.
if [[ ${2:-} == --defer-game-restart ]]; then
  echo 'Ambiente TURN atualizado; reinício do jogo adiado para a publicação coordenada.'
else
  systemctl restart manifestacao-local.service
  systemctl is-active --quiet manifestacao-local.service
fi
echo 'TURN dedicado ativo; segredos privados preservados. Homologue áudio entre redes e relay autenticado conforme deploy/VOICE.md.'
