#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  print 'Node.js 22 ou superior é necessário para iniciar.'
  exit 1
fi
if [[ ! -d node_modules/ws ]]; then
  print 'Execute npm ci nesta pasta antes de iniciar.'
  exit 1
fi
print 'Abra http://127.0.0.1:4173 no navegador. Ctrl+C encerra o servidor.'
exec node src/server.js
