# Proteção gratuita no Cloudflare

Implementação de 17/10/2026 para `manifestacoes.com`. Não usa R2 nem contrata plano pago.

## Regras já ativas no domínio

- WAF: bloqueia `/.env*`, `/.git`, `/.git/*`, `/wp-login.php`, `/wp-admin/*` e `/xmlrpc.php`, apenas no domínio e no www. Esses caminhos não são usados pelo jogo.
- Rate limiting: até 30 requisições por IP em 10 segundos em `/api/auth/*`; após exceder, bloqueio por 10 segundos com HTTP 429. O contador é por data center e pode haver atraso na aplicação do limite. Usa a única regra disponível no Free.
- Não inclui `/ws`, voz, arquivos estáticos, `/health`, `/ready` ou as APIs do jogo. Os limites internos por e-mail/IP, upload e WebSocket continuam necessários.
- Configuração reproduzível das duas regras: `deploy/cloudflare-security-rules.json`. Não substituir um ruleset inteiro para reaplicar: atualizar apenas a regra com o mesmo `ref`, preservando as demais. A chave `zone_settings.min_tls_version=1.2` no mesmo arquivo é configuração desejada separada: aplicar apenas `PATCH /zones/{zone_id}/settings/min_tls_version` com `{"value":"1.2"}` após autorização de produção. Não enviar o JSON completo ao endpoint de rulesets.

Validação pública: arquivos sensíveis retornaram 403, uma sondagem GET em rota de autenticação inexistente retornou 429 após excesso, `/health` e `/ready` permaneceram 200. Smoke com dois visitantes confirmou movimento, reconexão e rejeição de origem inválida; nenhum e-mail foi enviado.

## Integração do Turnstile

Widget Managed criado na conta, restrito a `manifestacoes.com` e `www.manifestacoes.com`, sem pre-clearance. A credencial está fora do Git em um arquivo privado de configuração do operador, com permissão 0600. Não imprimir nem registrar o segredo.

Na revisão da release `20261017-07`, as duas variáveis estavam presentes no ambiente privado da VPS e o widget estava configurado. Em futuras instalações, a publicação deve incluir backend e cliente gerado juntos e acrescentar as duas variáveis de `deploy/turnstile.env.example` ao arquivo privado `/etc/manifestacao-local.env`. Os valores vêm do arquivo privado acima (`sitekey` e `secret`). Não há segredo no bundle: `/api/me` e o payload de conta expõem somente a sitekey quando ambas as variáveis estão configuradas.

O widget é carregado sob demanda ao solicitar ou reenviar o código. Cada envio recebe um token novo; confirmar o OTP não exige outro CAPTCHA. O servidor valida o token no Siteverify, conferindo sucesso, hostname e `action=email_login`, com timeout e falha fechada antes de enviar e-mail. A autoridade do IP vem do proxy já confiável, nunca de um header arbitrário da internet. O widget usa tamanho compacto em espaços estreitos. CSP HTTP e meta permitem somente a origem adicional `https://challenges.cloudflare.com` para script, conexão e iframe.

Sem as variáveis, o desenvolvimento mantém o fluxo local atual. Configuração parcial causa erro ao iniciar para impedir uma falsa proteção. Para rollback, remover as duas variáveis e reiniciar a aplicação, ou restaurar a release e seu ambiente correspondentes. Não manter apenas uma das chaves.

Os testes cobrem recusa sem token, falhas do provider, replay, hostname/action incorretos, envio aprovado, confirmação OTP e renovação do widget. A conclusão do desafio real por um navegador no domínio deve ser validada após a publicação autorizada. A integração já está configurada na produção verificada; mudanças futuras de backend/cliente e ambiente devem permanecer coordenadas.

## Referências

- [Validação obrigatória no servidor](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
- [Limites do rate limiting por plano](https://developers.cloudflare.com/waf/rate-limiting-rules/).

## Endurecimento aplicado na publicação 20261017-08

Em 17/10/2026, após a revisão inicial, o TLS mínimo foi elevado de 1.0 para 1.2 por API, preservando Full (strict) e as regras existentes. TLS 1.0/1.1 foram recusados por alerta remoto; TLS 1.2 conectou. O template `zone_settings.min_tls_version` corresponde ao valor ativo.

DNSSEC foi habilitado na Cloudflare e o DS correspondente foi publicado na Hostinger. O registro `.com` devolveu o DS correto; o DNS do Google devolveu resposta autenticada e a API Cloudflare confirmou status `active`. O [estado de produção](PRODUCAO.md#plano-de-infraestrutura-e-homologação) registra as demais verificações. Não desativar a assinatura enquanto o DS ainda existir no registrador.
