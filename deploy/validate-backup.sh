#!/usr/bin/env bash
# Restaura em banco TEMPORÁRIO; nunca modifica o banco da aplicação.
set -Eeuo pipefail
umask 077
[[ ${EUID} -eq 0 && $# -eq 1 ]] || { echo 'Uso: sudo validate-backup.sh /var/backups/manifestacao-local/backup-...'; exit 2; }
for program in realpath runuser sha256sum tar createdb dropdb pg_restore psql mktemp date tail rm; do
  command -v "$program" >/dev/null
done
backup=$(realpath -- "$1")
[[ -f $backup/SHA256SUMS && -f $backup/database.dump && -f $backup/uploads.tar.gz ]] || exit 2
validation_db="manifestacao_restore_check_$(date -u +%Y%m%d%H%M%S)_$$"
log=$(mktemp /var/tmp/manifestacao-restore-XXXXXX.log)
cleanup() { runuser -u postgres -- dropdb --if-exists "$validation_db" >/dev/null; }
trap cleanup EXIT
(
  cd "$backup"
  sha256sum --check --status SHA256SUMS
)
tar --list --gzip --file="$backup/uploads.tar.gz" >/dev/null
runuser -u postgres -- createdb --template=template0 "$validation_db"
if ! runuser -u postgres -- pg_restore --exit-on-error --no-owner --no-acl --dbname="$validation_db" <"$backup/database.dump" >"$log" 2>&1; then
  echo "Restauração de validação falhou; log privado: $log" >&2
  exit 1
fi
tables=$(runuser -u postgres -- psql -XAt --dbname="$validation_db" --command="SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
[[ $tables =~ ^[1-9][0-9]*$ ]] || { echo "Backup sem tabelas da aplicação; log privado: $log" >&2; exit 1; }
# Uma tabela qualquer não comprova que o estado do jogo foi preservado.
# Retornar somente contagens; o payload contém dados privados dos jogadores.
states=$(runuser -u postgres -- psql -XAt --set=ON_ERROR_STOP=1 --dbname="$validation_db" \
  --command="SET statement_timeout='15s'; SELECT count(*) FROM public.manifestacao_state WHERE schema_version = 1 AND revision >= 0 AND jsonb_typeof(payload) = 'object'" \
  2>>"$log" | tail -n 1)
[[ $states =~ ^[1-9][0-9]*$ ]] || { echo "Backup sem estado válido da aplicação; log privado: $log" >&2; exit 1; }
cleanup
trap - EXIT
rm -f -- "$log"
echo "Integridade e restauração verificadas: $tables tabela(s). Banco temporário removido."
