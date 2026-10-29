# Backup do Manifestação

`backup.sh` usa `pg_dump` no formato custom via autenticação local peer do usuário
`postgres`, sem carregar a URL ou senha da aplicação. O conjunto contém banco,
uploads e metadados de data/host; nenhum arquivo de ambiente é incluído.

O diretório `/var/backups/manifestacao-local` e os conjuntos têm modo 0700; os
arquivos têm modo 0600. Cada conjunto só recebe nome definitivo depois de todos
os comandos e hashes concluírem. Falhas não executam retenção. O timer diário
usa horário de Brasília e mantém os sete conjuntos completos mais recentes.
Backup externo/offsite está desativado por decisão do usuário. Não configurar destino ou integração nesta rodada. Os conjuntos locais não protegem contra perda da VPS inteira.

O dump possui snapshot consistente do PostgreSQL. A cópia de uploads online
não é uma transação junto com o banco: uma exclusão concorrente pode retirar
um arquivo ainda referenciado no snapshot. Para backup estritamente consistente,
parar apenas `manifestacao-local.service`, executar o backup e reiniciar o serviço
mesmo em caso de falha. Não parar PostgreSQL nem outros projetos. Isso não é feito
automaticamente pelo timer, para evitar indisponibilidade diária.

Instalar scripts executáveis, ajustar o caminho `ExecStart` à release real e
instalar os dois units em `/etc/systemd/system/`. Validar com
`systemd-analyze verify` e só então habilitar o timer. Rodar uma primeira cópia e
`sudo deploy/validate-backup.sh /var/backups/manifestacao-local/backup-...`.
A validação confere hashes e arquivo tar e restaura integralmente em banco
temporário próprio, removido ao finalizar. Ela confirma que o dump pode ser
restaurado, mas não substitui teste funcional de login e mídia com uma aplicação
isolada. Logs de erro ficam privados em `/var/tmp/manifestacao-restore-*.log`.

Variáveis opcionais: `MANIFESTACAO_BACKUP_DIR`, `MANIFESTACAO_UPLOADS_DIR`,
`MANIFESTACAO_DATABASE`, `MANIFESTACAO_BACKUP_RETENTION`. Os defaults são
`/var/backups/manifestacao-local`, `/var/lib/manifestacao-local/uploads`,
`manifestacao_local` e `7`. Nunca apontar para pastas ou bancos de outros projetos.

## Cadastro no monitor central da VPS

Em 22/10/2026, a leitura da VPS `srv924325` confirmou o timer diário e a execução
bem-sucedida às 07h48 UTC, com conjunto `backup-20261022T074801Z`. A rotina não
estava em `/etc/vps-backup-policy.json`: o resultado de 13/13 daquele monitor
não abrangia o Manifestacao. Esta correção está preparada apenas localmente.

`node scripts/prepare-backup-policy.mjs /caminho/politica-atual.json` lê uma cópia
atual da política e emite uma candidata em stdout, sem instalar nem alterar
arquivos. Preserva as outras rotinas e campos, recusa host incorreto, cadastros
duplicados ou incompatíveis e aceita reaplicação sem duplicar a entrada.
Usar arquivos privados e revisar o diff antes de uma publicação autorizada;
nunca redirecionar a saída sobre o próprio arquivo de entrada.

O cadastro acrescenta somente `manifestacao-backup.service`, limite de 26 horas,
e `/var/backups/manifestacao-local/backup-????????T??????Z/SHA256SUMS`. Esse arquivo
é gravado após dump, tar e hashes; o diretório final só aparece pela promoção
atômica do conjunto completo em `backup.sh`. O health atual usa o mtime desse
arquivo como idade: não tocar ou recopiá-lo para renovar artificialmente a data.
Diretórios `.incomplete-*` ficam fora do padrão. Se os caminhos do backup forem
personalizados, revisar o cadastro manualmente em vez de aplicar o padrão.

Na futura publicação, reler a política da VPS imediatamente antes de preparar a
candidata, confirmar host, `Result=success`, timer ativo/habilitado, próxima
execução e idade do conjunto. Aplicar a política revisada de forma atômica com
proprietário root e modo 0600, preservando todos os outros campos; aguardar a
próxima coleta automática do health e conferir a nova rotina. Cadastro, hashes
antigos ou sucesso do serviço não comprovam restauração. Backup externo continua
desativado por decisão do usuário; esta entrada monitora somente a cópia local.

## Estado da revisão de 17/10/2026

Na publicação `20261017-08`, o backup `backup-20261018T011820Z` foi criado com o jogo parado e validado por integridade e restauração real em banco temporário, removido ao finalizar. O serviço systemd de backup também foi executado manualmente e terminou com sucesso. O timer estava habilitado, com próxima execução em 18/10 às 04h50 de Brasília; a primeira execução diária automática ainda precisa ser comprovada após esse horário. A restauração testada não equivale a um fluxo completo de login/mídia sobre o backup. Não sobrescrever produção nem dados dos demais projetos. Backup externo continua desligado.
