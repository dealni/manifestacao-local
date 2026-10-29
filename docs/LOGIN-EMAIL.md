# Login com código por e-mail

Publicado inicialmente em `manifestacoes.com`, release `20261017-03`, em 17/10/2026, e preservado na release ativa `20261017-08`. Recebimento real do código, confirmação, apelido, carteira, WebSocket autenticado, rejeição de reutilização e logout foram validados. O remetente é `acesso@manifestacoes.com`; Cloudflare Email Sending está habilitado com preview de conteúdo desativado.

## Fluxo

O visitante informa seu e-mail, recebe um código de seis dígitos e o digita na mesma tela. Não precisa escolher uma senha. O servidor normaliza o endereço e usa o mesmo transporte de e-mail Cloudflare adotado nos outros sistemas: a API de envio da conta, chamada pelo backend. O token nunca é enviado ao navegador.

- `POST /api/auth/email/request`, com `email`, solicita o código.
- `POST /api/auth/email/verify`, com `email` e `code`, verifica e inicia a sessão.
- O código vale por dez minutos, permite até cinco tentativas e só pode ser utilizado uma vez. Um novo envio exige espera mínima de sessenta segundos e invalida o código anterior.
- A conta só é criada depois de verificar o código. Uma conta existente é localizada pelo e-mail normalizado e conserva seu ID, inventário e progresso. Contas de demonstração continuam bloqueadas em produção.
- Uma conta nova recebe um apelido provisório e `nickPending: true`; a escolha do apelido conclui essa etapa. A sessão conserva o cookie `HttpOnly`, `Secure` em produção e `SameSite=Strict`.

O desafio é persistido no estado da aplicação usando digest HMAC, sem guardar o código em texto puro. A verificação consome o desafio de forma durável antes de criar a sessão; a resposta só entrega o cookie depois da gravação da conta e da sessão. O segredo HMAC deve permanecer estável entre reinícios. Trocar esse segredo invalida os códigos pendentes.

Em desenvolvimento, sem transporte configurado, a resposta pode trazer `localCode` para exercitar o fluxo. Produção não retorna esse campo. Com transporte configurado, o código deve ser obtido pelo e-mail, inclusive em desenvolvimento; não registrar códigos em logs.

## Configuração privada

Configurar estas variáveis no ambiente privado do serviço. Não copiar valores de credenciais para esta documentação, arquivos públicos, comandos registrados ou Git.

| Variável | Uso |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare que dispõe do serviço de envio. |
| `CLOUDFLARE_EMAIL_API_TOKEN` | Token autorizado a enviar e-mails nessa conta. Usar credencial de escopo mínimo, sem expor o token administrativo geral. |
| `CLOUDFLARE_EMAIL_FROM` | Endereço remetente autorizado pelo domínio de envio verificado. |
| `CLOUDFLARE_EMAIL_REPLY_TO` | Opcional: endereço válido para respostas. |
| `EMAIL_CODE_SECRET` | Segredo estável, com pelo menos 32 caracteres, para os desafios de login. |
| `EMAIL_DELIVERY_TIMEOUT_MS` | Opcional: tempo limite da chamada, padrão `20000` ms; configuração aceita de `1000` a `60000` ms. |

O servidor exige um `EMAIL_CODE_SECRET` válido quando há token de envio em produção. A disponibilidade também depende de conta, token e remetente válidos; conferir `GET /api/me`, campos `auth.emailLoginAvailable` e `auth.emailCodeAvailable`, após qualquer configuração. Esses campos indicam que a aplicação está configurada, não comprovam permissão remota, domínio verificado ou entrega na caixa postal.

O domínio do remetente precisa estar verificado no serviço de envio Cloudflare e ter os registros DNS exigidos pelo provedor. A presença do domínio na conta Cloudflare ou de um token administrativo não substitui essa verificação. A liberação de produção depende de confirmar o estado do remetente e das permissões da credencial, sem modificar os remetentes dos outros sistemas.

Na inspeção inicial, anterior à publicação da release 03, o serviço Email Sending não retornou configuração de envio para `manifestacoes.com` nem subdomínios. O DNS observado tinha apenas o registro A do domínio principal e o CNAME de `www`, sem SPF, DKIM, DMARC ou MX. Email Routing também não estava configurado. Habilitar um domínio remetente no Email Sending é uma etapa própria; Email Routing não substitui essa configuração. Seguir os registros e a verificação descritos na [documentação de domínios do Cloudflare Email Service](https://developers.cloudflare.com/email-service/configuration/domains/). A inspeção não alterou Cloudflare ou DNS.

## Turnstile publicado

As variáveis de Turnstile estavam presentes no ambiente da VPS e o widget Managed estava configurado na revisão de 17/10/2026. Solicitar/reenviar código exige token do desafio quando habilitado; verificar o código OTP não exige outro token. Consulte [configuração e validação](CLOUDFLARE-SEGURANCA.md). O teste de desafio real e entrega de e-mail não foi repetido nesta rodada; testes automatizados usam transporte simulado.

## Envio e falhas

O adaptador usa `POST /accounts/{account_id}/email/sending/send`, com nome de remetente Manifestações, assunto, texto e HTML. Não aceita redirecionamento da chamada autenticada. A resposta precisa confirmar sucesso e incluir o destinatário entre os endereços aceitos, enfileirados ou entregues; bloqueios permanentes e supressões são rejeitados.

Aceitação pelo provedor não garante recebimento na caixa de entrada. Timeout, erro de rede, resposta ilegível ou falha de persistência podem ocorrer depois do envio. O servidor invalida o desafio nesse caso e não repete a chamada automaticamente, evitando duplicações. O usuário deve aguardar o intervalo e solicitar outro código. Limites por IP, identidade e janela global reduzem abuso; não substituem acompanhamento de quota, reputação e custos do serviço de e-mail.

O transporte trata credenciais e respostas do provedor no backend e apresenta erros genéricos ao visitante. O login por código é o fluxo novo; os caminhos antigos de cadastro e recuperação com senha continuam sujeitos às restrições de produção existentes.

## Verificação antes de publicar

Os testes automatizados devem usar transporte simulado e estados isolados. Nenhum envio para endereço real é necessário para testar solicitação, expiração, tentativas, reenvio, consumo único, preservação de conta, sessão e falhas de entrega/persistência. Testar também ausência de `localCode` em produção e manter o modo local funcional.

Antes de uma publicação autorizada, conferir a suíte completa, regenerar o cliente com `npm run prepare-client`, validar o artefato e manter backup e possibilidade de retorno à release anterior. Depois da configuração e publicação, um teste real controlado com destinatário autorizado ainda é necessário para comprovar entrega e entrada de ponta a ponta. Os testes com transporte simulado não comprovam essa entrega.

Na implementação local inicial descrita nesta seção, o login não alterou o tamanho do mapa, a simulação, o limite de jogadores, PostgreSQL ou a política de uploads públicos. Essa etapa local não incluiu commit, push, deploy nem envio de mensagem de teste real. A publicação e a validação posteriores com e-mail real estão registradas em “Publicação verificada” abaixo.

## Histórico da validação local inicial em 17/10/2026

Seis agentes participaram da implementação e revisão. A suíte completa passou com **231 testes**, sem falhas; `npm audit --omit=dev` não encontrou vulnerabilidades. O cliente público foi regenerado pelo script do projeto. O teste HTTP verificou conta, apelido pendente, sessão conservada após reinício, consumo único e logout; os testes específicos exercitaram concorrência, quotas persistentes e falhas de envio/gravação.

No Chrome local, com estado temporário e e-mail fictício, foi exercitado o fluxo completo de solicitação, código local, escolha de apelido e entrada autenticada no jogo. Nenhum e-mail real foi enviado. Foi corrigido `buildAccount`, que antes forçava `nickPending: false` e impedia a escolha de apelido da conta nova. A captura está em [login-jogo.png](../analysis/email-login/login-jogo.png), e a suíte em [tests.txt](../analysis/email-login/tests.txt).

O envio tem cotas persistentes de cinco solicitações por hora por e-mail e vinte por hora por IP, além dos limites curtos e globais. Identidades diferentes não aguardam uma mesma chamada lenta ao provedor; operações da mesma identidade são serializadas com fila limitada.

## Publicação verificada

O domínio foi habilitado no Cloudflare com MX de retorno, SPF, DKIM e DMARC. As credenciais ficam exclusivamente no ambiente privado da VPS; foi utilizada uma credencial de envio existente da conta, sem colocar o token administrativo no runtime. Essa credencial é compartilhada com o transporte já configurado do Citrya; coordenar uma eventual rotação para não interromper outro sistema. Não houve alteração no ambiente do Citrya.

`authAvailability(ctx)` agora alimenta tanto `/api/me` quanto a conta do jogo consumida pelo front. Isso corrige a indisponibilidade visual observada no primeiro smoke público. O Chrome confirmou o formulário de código disponível após a correção. A suíte final passou com 266 testes. O cadastro clássico com senha continua desabilitado em produção; criação e retorno de conta usam o mesmo fluxo por código.
