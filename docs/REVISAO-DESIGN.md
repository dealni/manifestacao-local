# Revisão geral de interface e funcionalidades

Revisão local de 17/10/2026, ampliada após a primeira rodada. Não houve commit, push ou deploy por esta equipe. Dados e pontos usados no navegador são fictícios, em `/tmp/manifestacao-full-review/browser-data`; nenhuma conta, campanha, saldo ou servidor de produção foi usado.

## Referências e método

[Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls), [Modality](https://developer.apple.com/design/human-interface-guidelines/modality) e [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback).

Oito agentes receberam recortes de implementação: conta, loja/pontos, mídia, social, atividades, HUD, voz e missões/PvP. Dois agentes revisaram as correções independentemente; outros dois validaram contratos HTTP/WebSocket e regras do jogo com fixtures isoladas. O coordenador integrou o cliente reproduzível e verificou a interface em Chromium desktop, 390×844 e 844×390. As linhas abaixo distinguem inspeção visual de testes e leitura de contratos; não significam percurso manual de cada combinação de conteúdo ou de todos os itens.

## Matriz de cobertura

| Área / telas | Evidência e alterações |
| --- | --- |
| Entrada, times, visual, prévia e espectador | Navegador, contratos e testes. Tipografia, contraste, foco, dica do apelido e controles; personagem básico, entrada e saída. |
| Conta, código, reenvio, visitante e logout | Login local completo no navegador e testes de código inválido/expirado, cooldown, troca de e-mail, cancelamento, resposta tardia e erros. Logout preserva conta quando falha; envio repetido é bloqueado. Cadastro/recuperação ativos usam o mesmo código sem senha; endpoints legados têm testes próprios. Link de parceria não aparece quando `enabled:false`. |
| Carteira, extrato, convites | Saldo, movimentações e convite no navegador; testes de bônus bilateral, idempotência, limites e persistência. |
| Loja, Premium, passes e personagens | Catálogo de 43 personagens, filtros, busca vazia, prévia 3D, checkout insuficiente e Premium bem-sucedido no navegador; testes de posse e nove categorias de resgate. Seleção antiga não pode ser adquirida após busca vazia/erro, respostas tardias não reabrem fluxo ou restauram conta antiga. |
| Superchat | Formulário e resgate de texto com 100 pontos fictícios no navegador; required, mínimos, erros, envio único, foco e cancelamento em testes. Copy não promete TTS, preços ausentes ou moderação automática inexistente. |
| Cartaz, bandeira e editor | Texto, fundo, desenho, adesivos, abas por teclado, envio e aquisição de cartaz no navegador. Testes de modelos, undo/redo, validação de arquivo, posse, exclusão, foco, rascunho e resposta tardia. Fechamento bem-sucedido não recria rascunho já consumido. |
| Telões e campanhas | Inventário de 65 telas, escolha, upload PNG de QA, reutilização, prévia 3D, publicação, histórico e cancelamento proporcional no navegador. Testes de formatos, conteúdo inválido, permissões, saldo, idempotência e reinício. Publicar/cancelar após sair não captura a nova tela. |
| Social, amigos, pedidos, bloqueios, DM e denúncia | Painéis e busca vazia no navegador; fluxos com dois participantes, autorização, persistência, confirmação de leitura, reconexão e aba oculta em testes. Rascunho é isolado por contato; chegada de DM não perde foco/seleção. Ações usam semântica coerente com o teclado implementado. |
| Chat público e apelido | Troca de canal/estado acessível e entrada no navegador; testes de leitura, texto seguro e sessão. Apelido confirmado atualiza a conta. |
| Garagem, montarias, som, câmera, áudio, fullscreen e gráficos | Menu, garagem e opções personalizadas no navegador; contratos de veículos, aceleração, freio, Roadster, salto, boost, colisões e retomada em testes. Fullscreen padrão/WebKit e erros exercitados em VM; estado de áudio/atalhos mobile comunicado. Prévia respeita redução de movimento. |
| Spray e borracha | Painel, cores, espessuras, moldes e troca de modo no navegador; pintura, borracha, bandas, geometria e persistência em testes. Foco permanece nas atualizações; grupos e nomes corrigidos. |
| Missões e corrida | Painéis no navegador; testes de progresso, persistência, fila, contagem, checkpoints, pódio, abandono e reconexão. Recompensas com correspondência inequívoca entram no inventário sem duplicação, inclusive conclusões antigas, e atualizam a conta pelo fluxo HTTP existente. |
| PvP | Acesso e checkout fictício no navegador; consentimento, time, distância, cooldown e proteção de atacante/alvo na zona de paz em testes. Textos distinguem ativação do PvP de objetos vendidos separadamente. |
| Debates e atrações | Painel de mesas no navegador; anfitrião, fila, permissões, relógio, proximidade e limpeza em testes. Inventariadas 28 ações de 13 atrações; sete probes sequenciais verificam vento, fábrica, busca, ET, templo, mercado e banco. A correção posterior implementa viagens, projéteis, proteção, boss e portão/cofre, com testes específicos e revisão independente. |
| Voz | Lifecycle e sinalização em testes: permissão negada, captura tardia, cancelamento, SDP/ICE, mute, saída, timeout e reconexão. Sair do jogo encerra captura; controles não prometem áudio privado ou proximidade nas mesas. O botão flutuante foi removido a pedido; controles são abertos apenas por atalhos contextuais. |
| Ajuda, termos, privacidade, sobre e equipe | Rotas informativas, navegação, fechos e contratos inspecionados. Operações administrativas e códigos reais de equipe não foram usados. |

O aviso flutuante “Beta gratuito” também foi removido do HTML e dos estilos por pedido explícito. A informação sobre pontos e ausência de pagamentos reais permanece nas telas em que orienta decisões.

## Correção posterior: missões, atrações e recompensas

Após autorização específica, cinco agentes implementaram recortes pequenos, dois revisores independentes verificaram as correções e um validador executou a jornada de recompensas com servidor HTTP real e persistência temporária.

- Atropelamentos são detectados no servidor a cada 50 ms com geometria dos veículos, trajetória, tempo e limites de rotação/deslocamento. Exigem veículo liberado, alvo a pé do outro time e PvP consentido; respeitam área de paz, proteção, corrida, elevador e espectadores. O crédito exige contas e intervalo de 2 minutos por conta alvo, preservado na reconexão. Queda visual e crédito de missão são separados. Mensagens declarando impacto não geram progresso.
- As 11 recompensas canônicas têm concessão: veículos/objetos, duas bandeiras Premium na primeira coleção, coleção de bandeiras completa na última e designs gratuitos em Minha assinatura. Histórico é reparado sem duplicação ou confiança em um prêmio arbitrário salvo. Designs têm preço zero real no servidor e na interface, sem conceder Premium, publicidade ou superchat; autoria, aprovação e limite de imagens continuam validados.
- Elevador possui viagem, ocupação e saída; portais transportam o personagem; templo oferece proteção temporária; cadeiras têm trajetória, colisão e consentimento; boss tem ondas com dano progressivo, participação e recompensa por contribuição; banco tem efeitos locais; Congresso cobra 3 fichas fictícias para abrir o portão e permite coletar o cofre com recarga. A observação da baleia já possuía cinemática no cliente e foi preservada. Fichas de atrações são unidades fictícias separadas da carteira de pontos.
- A interface mantém status e recargas reais das atrações. Os bloqueios e avisos de funcionalidade ausente foram retirados apenas após a implementação correspondente.

A jornada automatizada conclui as 11 etapas com contadores de fixture explícitos, consulta inventário via HTTP e verifica dois reinícios e designs gratuitos sem débito. Não representa horas de gameplay manual. Colisões e efeitos possuem testes específicos independentes.

## Limites de verificação

- A física continua reconstruída localmente: o protocolo aceita poses previstas do cliente e o servidor valida a trajetória observada para conceder impactos. Não é uma simulação totalmente autoritativa ou equivalência comprovada com o servidor original.
- Grupos sociais lógicos de até 20 pessoas não são salas privadas de áudio. A voz local é compartilhada, com até 12 participantes, sem escuta espacial automática de mesas.
- Sem aparelhos físicos, VoiceOver, áudio entre dois microfones reais/TURN, entrega real de e-mail, testes de carga de produção ou condução manual de cada veículo. Física e regras continuam uma reconstrução local, não equivalência comprovada ao backend original.

## Validação

A rodada anterior passou com **447 testes, zero falhas**. Os **731 assets originais** mantêm seus hashes, sem divergências. A geração repetida produziu `public/client.js` e `public/index.html` idênticos. Revisores independentes aprovaram os patches finais; a voz contextual foi repetida separadamente em 20 testes. Evidências operacionais desta rodada ficam em `/tmp/manifestacao-full-review`; probes independentes em `/tmp/manifestacao-contract-probe.log` e `/tmp/manifestacao-gameflows-review/`. As contagens de subgrupos se sobrepõem; não devem ser somadas à suíte geral.

Alterações paralelas de outras tarefas já existiam no checkout e foram preservadas; esta equipe não realizou operações Git de publicação.

Verificação final de remoção: no Chromium móvel, `local-mode-notice` ausente, `local-voice.hidden === true`, sem transbordamento horizontal; abrir voz pelo social revela os controles e foca “Entrar na voz”, fechar oculta e devolve foco ao social, sem solicitar microfone.

HUD desktop em janelas baixas: corrigida sobreposição dos botões de atividade pelo dock. Medido em 844×390 e 844×360: três ações de 44px terminam em y=204; o dock começa em y=245 e y=215, respectivamente. Nenhuma ação foi ocultada. Revisão independente B aprovou o CSS e sua integração.

Validação final das correções de missões/atrações: **501 testes passaram, zero falhas ou skips**, incluindo jornada HTTP com dois reinícios. `npm run check`, sintaxe do cliente gerado e `git diff --check` aprovados; 731 assets originais íntegros. Evidências em `/tmp/manifestacao-missions-fixes/check-final.log`. Dois revisores independentes encerraram sem achados pendentes no recorte.

## Limpeza do HUD — 17/10/2026 (local, não publicada)

Três agentes implementaram desktop, Superchat e avisos móveis; dois outros fizeram revisão independente. Chat, minimapa e ações começam recolhidos no desktop, com botões de reabertura e preferências persistidas. Enter abre e foca a conversa. Localização permanece compacta com Sair acessível. Corrida, missões e debates ficam em Opções → Atividades, sem cartões permanentes no cenário.

Superchat vazio deixa de exibir a faixa e o acesso flutuante duplicado; envio permanece no topo, chat e menu. Mensagens automáticas ficam compactas e podem ser expandidas, com fila, progresso, histórico, áudio e moderação preservados pelo patch. A faixa permanece abaixo dos diálogos. Dicas móveis expiram em 6,5 segundos; ajuda completa continua em Como jogar. Avisos móveis são medidos e empilhados abaixo da barra superior, com conexão e corrida primeiro. Voz permanece opcional, abre apenas por ação, com fechamento e rolagem; não solicita microfone ao abrir os controles.

As revisões encontraram e corrigiram incompatibilidade de geração do Superchat, colisão da pilha com a barra superior e foco móvel após fechar corrida/missões. A validação visual identificou e removeu também a dica de teclado desktop que aparecia após alternar o tamanho da tela móvel.

`npm run check`: **577 testes aprovados**, zero falhas/skips, e **731 assets originais íntegros**. Sintaxe do cliente e `git diff --check` aprovados; nova geração produziu cliente e HTML idênticos. Navegador local: desktop 1280×720, portrait 390×844 e landscape móvel 740×390; verificados reabertura de chat/mapa/ações, Enter, manutenção do estado ao mudar viewport, atividades, foco após fechar missão e controles de voz abertos/fechados sem microfone. Superchat ativo, moderação e coexistência de todos os avisos foram cobertos por testes com DOM simulado, sem pagamento ou sessão de áudio real. Sem aparelho físico ou leitor de tela nesta rodada.

Evidências locais: `analysis/hud-limpo-desktop.png` e `analysis/hud-limpo-mobile.png`. Sem commit, push, deploy ou alteração de infraestrutura; backup externo continua desligado.

Publicação posterior autorizada: alterações do HUD em produção na release `20261017-09`, código `12f08cd`, com pre-push de 577 testes aprovado. Backup local restaurado, hashes públicos conferidos e smoke de WebSocket/reconexão aprovado. Detalhes em [produção](PRODUCAO.md). O registro acima descreve a etapa local anterior à autorização de publicação.
