# Encerramento da produção — 29/10/2026

A produção do Manifestação foi encerrada por solicitação do mantenedor em 29/10/2026. O código permanece disponível para desenvolvimento e estudo local; as descrições de releases anteriores são registros históricos.

## Operação

Na VPS Apps, os serviços `manifestacao-local.service` e `manifestacao-turn.service`, além de `manifestacao-backup.service` e `manifestacao-backup.timer`, foram parados e mascarados. As unidades originais foram preservadas no diretório de encerramento de acesso exclusivo de root; os nomes ativos apontam para `/dev/null`. Isso impede inicialização automática e execução acidental por dependências. A aplicação e o TURN não permanecem atendendo conexões. O domínio responde HTTP 410 com `Cache-Control: no-store` pelo Nginx; o processo compartilhado do Nginx continua atendendo os outros projetos.

O cache das zonas dos dois projetos foi invalidado. Bancos, uploads, credenciais externas e backups existentes foram preservados. Nenhum dado de usuário foi incluído no repositório como parte do encerramento. O PostgreSQL compartilhado não foi parado. Uma eventual reativação exige autorização específica, restauração das unidades e nova revisão da configuração antes de executar a aplicação.

## Publicação do código e informações de terceiros

A revisão para publicação pública preserva bibliotecas, licenças e registros necessários de procedência. Referências técnicas a fontes e aos arquivos incorporados não equivalem a autorização de redistribuição. O projeto contém cliente e assets públicos de terceiros adaptados para execução local; sua presença deve ser avaliada separadamente de segredos e dados pessoais.

A solicitação de limpeza de textos, links e dados identificáveis não autoriza declarar autoria exclusiva, retirar avisos obrigatórios de licença ou mudar a procedência dos arquivos. Os nomes e URLs de fontes usados em verificações de integridade e nos metadados dos áudios têm função documental. A etapa inicial de limpeza do checkout não removia os commits anteriores. Em seguida, o mantenedor autorizou preparar uma nova linha pública com um único commit-raiz sanitizado; o histórico anterior foi preservado somente em backups externos privados, sem integrar essa linha.

Os textos do cliente gerado não encaminham mais o jogador ao domínio do serviço de origem. A oferta comercial de benefícios por assinatura de canais externos também foi retirada. Na etapa inicial, o gerador aplicava essas adaptações sem alterar sua base. A revisão posterior para publicação também retirou os identificadores opcionais da base incorporada, com hash e tamanho explicitamente atualizados no inventário. O registro de preparação pública descreve essa adaptação; a base atual não é apresentada como cópia byte a byte da captura. Fontes técnicas, créditos e procedência permanecem preservados.

## Validação

A evidência operacional e os resultados da revisão desta tarefa ficam em `output/encerramento-apurar-manifestacao-2026-10-29/`, fora do repositório. Testes locais não enviam e-mails reais nem reativam produção.

Na revisão local de 29/10/2026, `npm run check` passou com 980 testes e cobertura de 97,66% das linhas e 92,00% das branches. A integração PostgreSQL passou em cluster temporário isolado e removeu a fixture ao terminar. Os 47 cenários de navegador passaram: 34 em Chromium e 13 em WebKit, incluindo desktop, celular, tablet, música e voz com sinal sintético. A primeira tentativa WebKit não iniciou por falta do motor local; após instalar a versão compatível, os 13 cenários foram repetidos com sucesso. Isso não homologa microfones ou aparelhos físicos.

Após o ajuste final de texto, a geração reproduzível foi conferida em duas execuções isoladas, com lint, formatação e sintaxe dos arquivos afetados aprovados. A base incorporada e seus 731 assets passaram na verificação de integridade daquela etapa. Os hooks de commit, mensagem e pre-push foram instalados no clone local. Na etapa inicial de revisão não houve commit, push ou deploy. A preparação posterior do novo histórico e seu envio ao GitHub foram autorizados separadamente, mantendo os hooks locais obrigatórios; isso não reativa a produção nem autoriza deploy.
