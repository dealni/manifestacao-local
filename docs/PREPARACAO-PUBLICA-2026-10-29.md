# Preparação da versão pública — 29/10/2026

A revisão retirou nomes e hostnames opcionais dos sites de referência do README, metadados do pacote, geradores, testes, cliente, HTML de entrada da geração e inventários. Licenças, avisos de copyright e créditos dos assets foram preservados. Endereços oficiais de bibliotecas, dados geográficos, autores creditados e fontes de áudio não são sites usados como referência de produto e permanecem quando documentam a procedência dos arquivos.

## Base e integridade

O arquivo `public/assets/index-DYj4UDIq.js` é uma base incorporada de terceiros que recebeu somente substituições editoriais de identificadores, sem mudança da lógica, geografia ou dos assets visuais. A propriedade interna que nomeava a origem também foi renomeada de forma coerente nos quatro consumidores; seu comportamento e contrato continuam locais. Os hostnames de origem usados apenas como alvos dos patches foram substituídos por nomes reservados `.invalid`; os patches continuam apontando a aplicação gerada para sua própria origem. Esses nomes de exemplo não são fontes reais nem serviços de produção.

O inventário registra explicitamente SHA-256 anterior, SHA-256 atual, tamanho e motivo da adaptação do bundle. Nas entradas da captura, URLs viraram caminhos relativos; nos modelos, `source` contém o caminho local do asset e o catálogo informa que o endereço externo foi omitido. Os hashes dos modelos, imagens de jogo, áudios e demais arquivos não foram recalculados para encobrir alterações: seus bytes continuam preservados. O card social é a exceção visual explícita: `public/og.png` continha a marca e o domínio do produto de referência. Ele foi substituído por arte própria em `scripts/assets/social-card.svg`, exportada por `node scripts/prepare-social-card.mjs`; seu inventário também registra hashes anterior e atual.

Os bytes anteriores do bundle e dos documentos alterados foram preservados em um recibo externo privado desta revisão. A geração legível e o cliente final são reconstruídos da base adaptada por `npm run prepare-client`; a verificação de geração continua executando duas reconstruções isoladas. Não se afirma que a base adaptada seja o arquivo original sem modificações.

## Limites

IDs de vias, chaves de preferências e namespaces técnicos herdados que mencionam a geografia de origem foram preservados para manter compatibilidade. Eles não identificam um site ou contam como promoção externa. Não houve alteração de nomes de pessoas representadas nos assets públicos.

O mantenedor autorizou a substituição do histórico destinado à publicação por um único commit-raiz revisado. Essa linha não tem vínculo com os commits anteriores e contém somente a árvore sanitizada. O histórico e o checkout da etapa privada foram preservados em backups externos privados, sem publicar referências de backup. O envio deve usar proteção explícita contra alteração remota concorrente e os hooks locais completos; a visibilidade efetiva do repositório é conferida no GitHub após o envio.

Retirar identificadores de apresentação e de metadados não concede licença de redistribuição nem transforma arquivos de terceiros em obra de autoria exclusiva. O projeto não passa a declarar licença permissiva geral sobre a base capturada. A aptidão técnica para publicar deve ser distinguida da comprovação de direitos sobre cada material incorporado.

## Validação

`npm run check` passou após a limpeza ampliada com 980 testes e cobertura de 97,66% das linhas e 92,09% das branches. Os 47 cenários de navegador passaram em Chromium e WebKit. Após a renomeação coerente da propriedade interna da origem, a geração reproduzível passou em duas execuções isoladas e os dois cenários Chromium de conta e catálogo passaram novamente. Limites, lint, tipos, formato, sintaxe e inventário de 732 entradas da base/card mais 108 arquivos de Brasília também passaram. O novo card foi inspecionado visualmente.

A busca nos arquivos rastreados e novos, incluindo bytes de arquivos binários, não encontrou os nomes de produto/domínios dos sites de referência usados como alvos da limpeza. A revisão não equivale a uma inspeção visual individual de todos os assets. O histórico anterior não integra a nova linha destinada à publicação e permanece somente no backup externo privado. Nenhum arquivo de licença ou crédito obrigatório foi alterado.

Os logs e a cópia privada dos bytes anteriores ficam no recibo externo da revisão. Nenhum comando desta revisão reativou serviços ou publicou código em produção.
