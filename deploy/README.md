# Produção: Cloudflare + VPS apps

O nginx termina TLS e encaminha HTTP e WebSocket ao único processo Node em
`127.0.0.1:4180`. O domínio público é `https://manifestacoes.com`. O Cloudflare
fica em proxy com SSL/TLS **Full (strict)**. PostgreSQL permanece acessível apenas
localmente; nenhum banco ou porta de aplicação deve ser publicado na internet.

Release ativa verificada em 17/10/2026: `20261017-10`, código `13b0452`, com as cinco correções de segurança, 591 testes locais e 62 regressões aprovadas no Linux da VPS. O runtime da candidata foi validado com PostgreSQL descartável, sessão HTTP, uploads, anúncios, WebSockets e reabertura durável. O perfil de 1.000 jogadores/1.200 WebSockets, TURN dedicado sem TLS e a configuração de Turnstile foram preservados. Backup externo permanece desligado. Este procedimento descreve instalação/atualização; executá-lo exige autorização específica de deploy. Estado e pendências em [produção](../docs/PRODUCAO.md).

## Estrutura e instalação

- Serviço e usuário sem login: `manifestacao-local`.
- Releases imutáveis: `/opt/manifestacao-local/releases/<identificador>`.
- Release ativa: symlink `/opt/manifestacao-local/current`.
- Estado gravável e uploads: `/var/lib/manifestacao-local`, modo `0700`.
- Variáveis e credenciais: `/etc/manifestacao-local.env`, root, modo `0600`.
- Node 24: `/usr/bin/node`; PostgreSQL e nginx já existem na VPS apps.
- Certificado de origem, incluindo domínio e www: `/etc/ssl/manifestacao-local/origin.pem`.
- Chave: `/etc/ssl/manifestacao-local/origin.key`, root, modo `0600`.

A conferência inicial somente leitura encontrou `srv924325`, Node `v24.21.0`
e porta 4180 livre. Conferir novamente antes de instalar. Não alterar clusters,
serviços, certificados ou bancos dos demais sistemas.

Gerar o cliente e executar a suíte localmente antes de empacotar com
`npm run prepare-client` e `npm run check:all` (incluindo PostgreSQL temporário e Chromium desktop/mobile). O pacote contém o cliente pronto; os
geradores de desenvolvimento e os testes não fazem parte da release. Na VPS,
instalar as dependências com `npm ci --omit=dev --ignore-scripts` antes de ativar
a candidata e validar o módulo nativo `sharp` nessa arquitetura, por exemplo:
`node --input-type=module -e 'import sharp from "sharp"; await sharp({create:{width:1,height:1,channels:4,background:"white"}}).webp().toBuffer(); console.log("sharp OK")'`. Publicar
apenas código, catálogos necessários e `public/`: não copiar `data/state.json`,
uploads ou snapshots da máquina de desenvolvimento. Criar banco e usuário
PostgreSQL exclusivos e realizar a migração de produção antes do primeiro acesso.
Não gravar `DATABASE_URL`, códigos de conta ou tokens em comandos exibidos,
documentação, artefatos ou Git. A aplicação deve receber `DATABASE_URL` pelo arquivo
privado de ambiente, além da configuração de origem e proxy do runtime.

Instalar `manifestacao-local.service` em `/etc/systemd/system/`. Instalar
`nginx.conf` em `/etc/nginx/sites-available/manifestacao-local`, com symlink em
`sites-enabled`. O certificado precisa existir antes de habilitar esse site.
Executar `systemd-analyze verify`, `nginx -t` e só então recarregar as configurações.
Manter os outros virtual hosts e unidades intactos.

O arquivo de ambiente deve definir os nomes efetivamente suportados pelo runtime,
incluindo `NODE_ENV=production`, `PORT=4180`, `DATA_DIR=/var/lib/manifestacao-local`,
`PUBLIC_ORIGIN=https://manifestacoes.com` e `TRUST_PROXY=true` (a aplicação aceita
esse proxy somente em loopback). Usar `DATABASE_STATE_KEY=manifestacao` ou preservar
o mesmo valor nas atualizações. O serviço já fixa valores
não secretos de porta e diretório; o arquivo de ambiente pode sobrescrevê-los.

## Cloudflare

Configurar DNS com proxy para a VPS, Full (strict) e WebSockets habilitados.
Remover rotas Worker antigas que interceptem o domínio. Não criar regra "cache
everything": contas, API, mídia privada, saúde e WebSockets devem ignorar cache.
O cliente e os assets públicos podem usar as políticas de cache emitidas pela
aplicação. Uma origem Cloudflare não é um certificado público de navegador: testar
a origem com CA adequada e testar o domínio público com validação TLS normal.

Configurar real IP do nginx somente com os CIDRs oficiais e atuais do Cloudflare
antes de depender do IP do jogador para limites. Nunca confiar irrestritamente em
`CF-Connecting-IP` ou em um `X-Forwarded-For` enviado diretamente à origem.

## Saúde, atualização e retorno

1. Executar os testes, geração de assets e empacotamento localmente. Na candidata
   da VPS, verificar hashes do pacote, sintaxe Node e carregamento do `sharp`.
2. Validar o runtime com banco de homologação e dados descartáveis antes de migrar.
3. Guardar backup do banco e uploads com permissões restritas e testar restauração.
4. Trocar o symlink de forma atômica; `systemctl restart manifestacao-local` envia
   SIGTERM e aguarda até 45 segundos pelo fechamento dos sockets e persistência.
5. Conferir `systemctl is-active manifestacao-local`, logs com `journalctl -u
   manifestacao-local`, saúde local em `http://127.0.0.1:4180/health` com cabeçalho
   `Host: manifestacoes.com`, saúde pública, login, dois clientes WebSocket,
   reconexão e um upload autorizado.
6. Para rollback, parar o serviço e apontar para a release anterior. Reverter
   migração de banco somente com procedimento compatível ou restauração validada;
   restaurar um backup pode perder alterações recebidas depois dele.

A unidade mantém tentativas de recuperação a cada 5 segundos, inclusive depois
de indisponibilidade prolongada do PostgreSQL. Não executar uma segunda instância
com a mesma chave de estado durante a validação da candidata.

Um reinício de processo interrompe a sala corrente; clientes devem reconectar.
Nenhuma continuidade sem interrupção é prometida. Manter uma só instância da sala
até a implementação de coordenação entre processos. A capacidade de jogadores
depende de teste de carga com CPU, latência e tráfego, não apenas dos 32 GB de RAM.
