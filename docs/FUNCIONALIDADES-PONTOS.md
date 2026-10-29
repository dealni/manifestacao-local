# Funcionalidades com pontos

Funcionalidades publicadas a partir da release `20261017-05`, preservadas na release ativa `20261017-08` conferida em 17/10/2026. Consulte [estado atual e publicação das correções](REVISAO-PRODUCAO.md). As evidências de 295 testes abaixo pertencem à implementação inicial, não à rodada atual.

## Cartazes e bandeiras

Contas com e-mail confirmado e apelido definido podem enviar imagens e criar designs sem comprar Premium antes. O envio não consome pontos; a aquisição/ativação do design custa normalmente 100 pontos, uma única vez. Contas com a recompensa de missões `owned.designsFree` têm aquisição gratuita, com custo zero em pontos. Os designs já adquiridos continuam utilizáveis. A correção desta rodada limpa também a referência na aparência persistida ao excluir; foi publicada na release `20261017-08`.

Novos uploads públicos aceitam PNG, JPEG ou WebP estáticos de até 20 MB e 4096 × 4096 pixels. O backend decodifica e reprocessa com `sharp`, removendo metadados e conteúdo anexado e gerando WebP. Arquivos corrompidos, SVG, vídeos e GIF novos são recusados; mídias antigas continuam legíveis. São permitidos dois processamentos simultâneos, dez envios concluídos por minuto e quarenta por hora, com cotas de 200 MB por conta e 2 GB globais. A aprovação é automática após validação técnica, sem avaliação humana do conteúdo.

As respostas de arquivos usam `no-store`, permitindo que a exclusão na origem não mantenha novas cópias em cache por uma hora. Cópias carregadas anteriormente podem persistir no navegador até sua atualização.

## Telões

Cada tela custa **100 pontos por 24 horas**. O modelo novo usa reserva por período e rotação, sem leilão, ofertas maiores ou impulsos. Todos os anúncios novos ativos entram na playlist; o renderer foi corrigido para não esconder campanhas após a quinta. O limite é 50 campanhas por tela, 100 por conta e 300 globais para limitar o volume transmitido aos jogadores.

A compra valida conta, propriedade e aprovação da mídia, formato da tela, preço, capacidade e saldo no servidor. Repetir o pedido não desconta pontos novamente. O cancelamento interrompe a campanha e devolve a parte proporcional do tempo restante, arredondada para baixo; repetir o cancelamento não repete o crédito. Os lançamentos e a programação são gravados no mesmo snapshot. Registros antigos continuam consultáveis e mantêm sua ordenação de compatibilidade.

Compra e cancelamento transmitem o evento `screens`, consumido pelo cliente, atualizando o cenário sem reconectar. A gestão mostra até 100 campanhas ativas primeiro e separa as últimas 50 históricas. O preço é confirmado antes de gastar pontos.

## Voz

A sinalização WebRTC ganhou serialização de SDP/ICE, tentativa de recuperação de conexão, heartbeat, filas limitadas, proteção contra conexões lentas e limpeza de áudio/microfone ao encerrar. O helper [setup-turn.sh](../deploy/setup-turn.sh) e [VOICE.md](../deploy/VOICE.md) preparam um relay coturn dedicado, com credenciais temporárias, limites de uso e bloqueio de destinos privados.

O relay foi instalado em uma publicação posterior e estava ativo na revisão da release `20261017-07`, com DNS sem proxy, autenticação temporária, UDP/TCP 3478 e faixa de relay UDP. Não usa TLS. Os testes sintéticos de alocação e troca de pacotes já realizados não substituem áudio real entre dois dispositivos/redes; essa homologação permanece pendente.

## Validação histórica da implementação inicial

- 295 testes passaram na suíte completa; relatório em [tests.txt](../analysis/complete-features/tests.txt).
- Teste HTTP + WebSocket real em porta temporária: criação de design, gasto de 100 pontos, publicação por 100, atualização imediata da cena, cancelamento, devolução, repetição e preservação após reinício.
- Teste do método real do renderer com seis campanhas e listagem com 100 ativas após histórico extenso.
- Sanitização com imagens reais, arquivos truncados, cabeçalhos gigantes e metadados; isolamento entre contas, limites e saldo.
- Cinco testes de voz e validação de sintaxe/revisão estática do helper TURN. Naquela etapa inicial não houve teste de microfone real nem instalação do relay; os testes posteriores do relay estão em [VOICE.md](../deploy/VOICE.md).
- No Chrome local, conta fictícia sem Premium criou e adquiriu um cartaz por 100 pontos, com saldo de 300 para 200, e abriu a seleção de telão e a confirmação de publicação por 100 pontos. O envio de arquivo pelo seletor automatizado do Chrome foi bloqueado pela permissão de arquivos da extensão; não alteramos essa permissão. O upload de anúncio, compra e cancelamento foram validados no teste HTTP.
- Nenhum erro de console observado nessa jornada local. [Captura](../analysis/complete-features/cartaz-pontos.png).

Pagamentos reais, compra de pontos e saques permanecem desativados. O mapa, as missões e os benefícios já adquiridos foram preservados. A etapa local inicial não incluiu commit, push ou deploy; a publicação posterior está descrita no início deste documento.
