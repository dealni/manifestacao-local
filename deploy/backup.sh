#!/usr/bin/env bash
# Executar como root; autenticação PostgreSQL por peer, sem senha no ambiente.
set -Eeuo pipefail
umask 077

if [[ ${EUID} -ne 0 ]]; then
  echo 'O backup exige root para ler os uploads e usar o usuário postgres.' >&2
  exit 1
fi

backup_root=${MANIFESTACAO_BACKUP_DIR:-/var/backups/manifestacao-local}
uploads_dir=${MANIFESTACAO_UPLOADS_DIR:-/var/lib/manifestacao-local/uploads}
database=${MANIFESTACAO_DATABASE:-manifestacao_local}
retention=${MANIFESTACAO_BACKUP_RETENTION:-7}
[[ $database =~ ^[a-z][a-z0-9_]*$ && $retention =~ ^[1-9][0-9]*$ ]] || exit 2
[[ $backup_root = /* && $uploads_dir = /* && -d $uploads_dir && ! -L $uploads_dir ]] || exit 2

for program in runuser pg_dump pg_restore tar sha256sum flock find sort hostname install mktemp date chmod mv rm; do
  command -v "$program" >/dev/null
done
install -d -m 0700 "$backup_root"
exec 9>"$backup_root/.lock"
flock -n 9 || { echo 'Já existe um backup em andamento.' >&2; exit 1; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backup_root/backup-$stamp"
[[ ! -e $destination ]] || { echo 'Conjunto já existe.' >&2; exit 1; }
stage=$(mktemp -d "$backup_root/.incomplete-$stamp-XXXXXX")
trap 'rm -rf -- "$stage"' EXIT

# O dump deve preceder os arquivos: uploads novos sem referência não prejudicam
# o restore. Remoções concorrentes de mídia exigem uma janela sem escrita para
# garantir atomicidade entre banco e filesystem; ver deploy/BACKUP.md.
runuser -u postgres -- pg_dump --format=custom --no-owner --no-acl --dbname="$database" >"$stage/database.dump"
runuser -u postgres -- pg_restore --list <"$stage/database.dump" >"$stage/database.list"
tar --create --gzip --file="$stage/uploads.tar.gz" --directory="$uploads_dir" .
tar --list --gzip --file="$stage/uploads.tar.gz" >/dev/null
printf 'created_at_utc=%s\ndatabase=%s\nhost=%s\nformat=pg-custom+tar-gzip\n' \
  "$stamp" "$database" "$(hostname)" >"$stage/metadata.txt"
(
  cd "$stage"
  sha256sum database.dump database.list uploads.tar.gz metadata.txt >SHA256SUMS
  sha256sum --check --status SHA256SUMS
)
chmod 0600 "$stage"/*
mv -- "$stage" "$destination"
trap - EXIT

# Somente conjuntos atômicos deste projeto entram na retenção.
mapfile -t completed < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'backup-????????T??????Z' -printf '%f\n' | sort -r)
for ((index = retention; index < ${#completed[@]}; index++)); do
  rm -rf -- "${backup_root:?}/${completed[index]}"
done
echo "Backup concluído: $destination"
