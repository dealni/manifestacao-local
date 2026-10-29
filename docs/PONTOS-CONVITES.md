# Pontos e convites

Publicado inicialmente em `manifestacoes.com` na release `20261017-03`, em 17/10/2026, e preservado na ativa `20261017-08`. Pontos e convites estão ativos; pagamentos reais permanecem desativados. A suíte daquela publicação passou com 266 testes. O teste com e-mail real confirmou a carteira de 300 pontos, preservada após a atualização do serviço. Os testes bilaterais de convites continuam sendo os testes isolados descritos abaixo; não foram criadas contas adicionais em produção para gerar bônus.

## Validação realizada

Seis agentes participaram da implementação e revisão. A suíte completa passou com **264 testes**, sem falhas; a revisão independente executou 37 testes dos módulos envolvidos, também aprovados. `npm audit --omit=dev` não encontrou vulnerabilidades nas dependências de produção. O cliente foi regenerado pelo script do projeto.

O teste HTTP criou duas contas isoladas, confirmou o convite e o apelido, verificou os créditos de ambos, resgatou um personagem e reiniciou o servidor. O saldo e a propriedade permaneceram corretos; repetir o resgate não cobrou novamente. As consultas e tentativas de crédito público também foram verificadas.

No Chrome local, uma conta fictícia recebeu 300 pontos, resgatou o Tesla Roadster por 150 e abriu a carteira com saldo de 150 e lançamento de débito no extrato. O console não registrou erros nessa jornada. Nenhum e-mail ou pagamento real foi realizado. Evidências: [testes](../analysis/points/tests.txt) e [carteira](../analysis/points/carteira.png). Os dados usados são temporários e não foram publicados.

## Carteira

Cada conta possui uma carteira de pontos inteiros. Pontos não têm equivalência com reais, não podem ser sacados, transferidos entre jogadores ou comprados nesta versão. Não existe endpoint público para adicionar saldo.

A conta recebe **300 pontos de boas-vindas**, uma única vez, depois de confirmar o e-mail e concluir a escolha do apelido. A regra também permite inicializar a carteira de uma conta existente que cumpra esses requisitos. Abrir novamente a conta ou reiniciar o servidor não repete o bônus.

O servidor valida produto, preço e saldo antes de conceder o benefício. Saldo insuficiente não gera crédito negativo. Os itens já registrados em `user.owned` e benefícios anteriores, como acesso Premium já concedido, são preservados. O catálogo deixa de tratar toda conta como proprietária automática de todos os itens.

Visitantes continuam podendo jogar, andar de carro ou moto e usar o spray sem gastar pontos. A tinta permanece ilimitada; sua compra fica desativada para evitar descontar pontos por um recurso que já é gratuito. `push` também permanece como objeto básico gratuito.

## Convites

O jogador autenticado recebe um código e um link no formato `/?convite=CODIGO`. O código acompanha a criação de uma nova conta pelo fluxo de e-mail. Contas antigas não podem anexar um convite posteriormente.

Depois que o convidado confirma o e-mail e conclui o apelido:

- Quem convidou recebe **100 pontos**.
- O convidado recebe **100 pontos**, além dos 300 pontos de boas-vindas, totalizando 400 pontos iniciais.
- A recompensa ocorre uma vez por convidado.

Quem convida pode receber até **100 recompensas de convite** na versão atual da regra, ou 10.000 pontos. Após esse limite, novos convidados elegíveis continuam recebendo seus 100 pontos; quem convidou deixa de receber novos bônus. Códigos inválidos, autoindicação, mesmo e-mail e convites repetidos não concedem recompensas extras.

Confirmar um e-mail comprova acesso àquela caixa postal, não a existência de uma pessoa diferente. Uma pessoa pode controlar várias contas e e-mails. O limite de convites e os controles do login reduzem abuso, mas não constituem um sistema completo de prevenção a fraude. Premiações comerciais futuras exigirão regras adicionais.

## Preços atuais

Os preços vêm do servidor; valores enviados pelo navegador não substituem o catálogo.

| Recurso                                                                       |                              Pontos |
| ----------------------------------------------------------------------------- | ----------------------------------: |
| Acesso Premium                                                                |                                 500 |
| Passe de personagens                                                          |                                 600 |
| Passe de garagem                                                              |                                 500 |
| Passe total                                                                   |                               1.000 |
| Acesso a PvP                                                                  |                                 150 |
| Objeto adicional                                                              |                                  50 |
| Bandeira do catálogo                                                          |                                  50 |
| Veículo adicional                                                             |                                 150 |
| Personagem padrão                                                             |                                 300 |
| Personagem com preço original do catálogo igual ou superior a 10.000 centavos |                                 500 |
| Cartaz ou bandeira personalizada aprovada, na primeira ativação               |                                 100 |
| Superchat                                                                     | Valor escolhido entre 100 e 100.000 |

Carro, moto e `push` são exceções gratuitas. A compra de um benefício que a conta já possui não desconta pontos novamente. O preço de referência da tinta continua representado no contrato de compatibilidade, mas a operação de compra é recusada sem débito.

Cartazes existentes já aprovados e pagos continuam utilizáveis sem nova cobrança. A política de uploads de produção continua condicionada à configuração e à aprovação existentes; introduzir pontos não libera uploads públicos. Superchat consome pontos do jogo, respeita os limites de texto e frequência e não realiza pagamento nem geração de voz paga.

**Novos lances e impulsos de telões ficam desativados.** Um leilão não deve consumir pontos sem reservas, liquidação, tratamento de disputa e devolução para lances não vencedores. A consulta de registros existentes permanece disponível.

## Persistência e idempotência

`src/points.js` concentra a carteira, concessões e débitos internos. `src/points-api.js` expõe a consulta autenticada de pontos e convites. O endpoint de pagamentos informa indisponibilidade; não existe recarga ou checkout real.

Na configuração de produção, carteiras, benefícios, recompensas e registros de pontos integram o mesmo estado JSONB no PostgreSQL. O servidor opera com um único escritor, protegido pelo mecanismo de persistência existente. A atualização do estado é salva atomicamente; o envio da resposta JSON aguarda o `flush` da persistência. A carteira não constitui uma transação financeira independente em tabelas relacionais.

Cada lançamento registra identidade da conta, direção, quantidade, motivo, referência, saldo resultante, data, sequência e hashes encadeados. O histórico global retém os últimos **10.000 lançamentos**. Portanto, esse histórico é uma trilha operacional limitada, não um arquivo completo e imutável de toda a vida do sistema. O hash encadeado auxilia a conferir a continuidade dos registros disponíveis; sozinho não impede que alguém com acesso de escrita ao estado altere os dados.

As referências de operações permanecem na carteira mesmo quando o histórico de exibição é podado. Repetir a mesma referência e conteúdo não repete o débito ou crédito; reutilizar a referência com conteúdo diferente é recusado. Cada carteira admite até **10.000 referências duráveis**. Ao atingir esse teto, novas operações são recusadas em vez de apagar a proteção contra repetição. Essa capacidade exige evolução antes de uso comercial continuado.

A aplicação de um convite pré-valida o crédito dos dois participantes antes de realizar os lançamentos elegíveis. A marca de recompensa concluída permanece na conta do convidado. Boas-vindas e convites têm referências próprias, persistidas e independentes do histórico podado.

Campos antigos como `cents`, `paid`, `local` e `simulation` ainda aparecem onde o cliente original exige compatibilidade. Nas operações novas de resgate, `currency: "points"` e os campos explícitos de pontos definem a unidade. `paid` significa resgate com pontos concluído; não comprova pagamento em reais.

## Preparação para pagamentos futuros

Esta alteração separa o saldo de pontos, os preços e a concessão de benefícios do conceito de pagamento real. Ela **não** torna um gateway pronto para ativação por variável de ambiente.

Uma implementação comercial futura precisará, pelo menos, de:

- Pedidos de compra e tabelas de lançamentos permanentes, com restrições de unicidade e transações apropriadas.
- Integração explícita com um provedor, sem confiar na confirmação enviada pelo navegador.
- Webhooks com assinatura verificada, proteção contra repetição e idempotência durável.
- Conciliação entre pedidos, cobranças e créditos efetivamente liquidados.
- Regras de estorno, reembolso, cancelamento e chargeback que preservem a consistência de saldo e benefícios.
- Tratamento de falhas e resultados ambíguos, observabilidade, recuperação e evolução além do limite de referências por carteira.
- Revisão de abuso de convites, limites, termos, privacidade e requisitos comerciais aplicáveis antes de oferecer dinheiro ou recompensas com valor externo.

A publicação desta mudança e a habilitação futura de pagamentos são etapas separadas e dependem de autorização específica.
