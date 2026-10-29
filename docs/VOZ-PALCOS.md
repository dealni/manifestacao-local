# Microfone dos palcos

Implementação de 18/10/2026. Procedimento de publicação em `deploy/README.md`.

## Uso

- Suba em um dos três palanques fixos ou no palco de um caminhão de som de jogador.
- O controle **Falar no palco** aparece em um painel próprio ao subir no palco, inclusive no celular e com o menu Ações recolhido. Clique nele ou pressione **T**. A captura só começa após essa ação e a permissão do navegador.
- A barra de nível mostra a captura; **NO AR** aparece após confirmação do servidor. A opção **Ouvir minha voz · use fones** ativa o retorno real do servidor, pelo mesmo pacote Opus e receptor da plateia. Fica desligada por padrão e reinicia desligada a cada captura. O botão aguarda confirmação do servidor. Não há escuta direta do microfone; o retorno tem o atraso da conexão e do buffer de áudio. Use fones para evitar realimentação acústica.
- Uma pessoa fala por vez nesta instalação. Quem estiver a até 60 metros pode ouvir com o áudio e a voz do jogo habilitados, sem fornecer acesso ao próprio microfone.
- Durante a preparação, o mesmo botão permite cancelar sem teclado; uma permissão concedida depois do cancelamento não inicia a captura. Clique novamente ou pressione **T** para encerrar. Sair do palco, silenciar o jogo, perder a conexão, ocultar a página ou tirar seu foco interrompe a captura e libera os dispositivos.

O palco móvel é o modelo de caminhão de som com plataforma (`kind=6`), próximo ao qual o jogador pode embarcar. Ele acompanha o veículo conduzido por outro jogador. Veículos decorativos da ambientação não são embarcáveis e não concedem autorização para falar.

## Revisão da escuta de 18/10/2026 — alterações locais

O aviso de voz desligada podia permanecer na tela depois de reativar a escuta com um orador já transmitindo. O receptor agora atualiza o aviso ao religar, sem esperar mudança de orador no servidor. O painel Som distingue o som geral, a preferência de escuta e o volume das vozes; oferece um controle explícito para o som geral e informa a causa do silêncio. Ativar o som geral também tenta retomar o contexto de áudio durante o clique.

Para ouvir, mantenha o som geral ativado, use **Ouvir** na linha **Voz dos palcos** e ajuste o volume acima de zero. Silenciar a plateia não desliga o palco nem o microfone de outra pessoa. O volume da escuta não impede transmitir: uma pessoa pode falar com esse volume em zero. O retorno da própria voz continua desligado até a ativação explícita.

O controle de microfone explica quando a preferência de voz, o som geral ou uma restrição da sala impedem a captura. Recursos de áudio ausentes são detectados antes de solicitar o microfone; a desconexão do dispositivo mostra um aviso. Uma falha ao ativar ou preparar o áudio não é apresentada como negação de acesso ao microfone: a orientação de permissão é reservada à captura. Os testes desta rodada usam sinal sintético, incluindo dois clientes e os controles reais de silenciar/reativar, sem abrir microfones físicos. Logs locais em `.artifacts/revisao-voz-escuta-*.log`. Essas alterações ainda não foram publicadas.

A investigação de WebKit também reproduziu um problema anterior à voz: o clique central no texto de **Iniciar partida** podia não gerar `click` nem envio do formulário. Os descendentes decorativos desse botão agora deixam o próprio botão receber o clique. A regressão exige entrada com um único clique central e exatamente um envio, preservando a navegação por teclado.

As regressões de áudio usam a configuração gráfica personalizada leve disponível no jogo e navegadores independentes para orador e plateia. Assim, operar os controles da plateia não tira o foco do orador: perder o foco continua fechando o microfone por segurança. A execução com renderização por software e gravação de trace apresentou interrupções de vários segundos e falhas de transporte; os resultados dessa execução não homologam a voz sob essa carga. A validação funcional sem trace deve ser distinguida dessa limitação de desempenho.

A interface informa quando o navegador não oferece o codificador necessário. O envio usa WebCodecs/Opus de 40 ms; não foi homologado em todos os navegadores ou aparelhos. Não há gravação de conversas no servidor.

## Usos removidos

A sala compartilhada de 12 pessoas, o endpoint `/local-voice`, seu cliente WebRTC, seus estilos e os microfones/testes de mesas de debate, grupos e palco legado da carreta foram retirados do runtime. O palco móvel usa o mesmo controlador dos palanques. Mesas, filas, grupos, texto, veículos, músicas e efeitos permanecem.

Os assets originais arquivados continuam íntegros, mas o cliente ativo não inicializa os antigos módulos LiveKit ou capturas alternativas. `scripts/design-voice-copy.js` permanece apenas como transformação intermediária de compatibilidade; seu conteúdo de sala antiga é removido do cliente final por `scripts/stage-voice-client.js`.

## Servidor

`src/stage-voice.js` valida posição canônica, ocupação do palco e vínculo com o caminhão. Mensagens do navegador não definem identidade, origem ou destinatários do áudio. Há apenas um orador global; concorrentes aguardam liberação e a sessão expira após 1,2 s sem quadros válidos.

O áudio efêmero usa o WebSocket `/ws` existente e o formato binário de voz do cliente. São aceitos até 60 pacotes/s e 45 KB/s por emissor, com máximo de 1.275 bytes de Opus por quadro. Há controle de sequência e descarte para receptores congestionados. Apenas ouvintes próximos e com escuta habilitada recebem quadros. Este transporte não depende de TURN ou de um serviço LiveKit.

O embarque usa a plataforma canônica do caminhão, com coordenadas locais limitadas, acompanhamento do veículo e desembarque validado contra colisões. Poses forjadas enviadas pelo cliente são ignoradas no palco móvel.

## Validação

A suíte completa passou com 675 testes, sem falhas ou skips. Testes cobrem proximidade, exclusividade, falsificação de posição, WebSocket real, sequência, interrupção, palco móvel, desembarque, permissão tardia e descarte de dispositivos de captura. Os testes da antiga sala foram removidos junto com a funcionalidade correspondente.

O teste de navegador com sinal artificial confirmou codificação Opus de 40 ms, transporte para o participante próximo, ausência de entrega ao distante e decodificação com energia de áudio válida, sem solicitar microfone. Evidências em `analysis/palcos-20261018/`. Conversa com microfones reais em dois aparelhos e redes diferentes ainda precisa de homologação.

As configurações e os serviços da produção anterior não foram alterados nesta etapa. Uma publicação futura deve revisar os documentos operacionais antigos de voz/TURN e verificar novamente o transporte público.

## Revisão local complementar de 18/10/2026

Corrigidos o cancelamento durante a preparação, confirmações atrasadas do retorno, encerramento por falha do processador de áudio e reprodução de decodificações após fechar o fluxo. A voz do caminhão conserva a autorização entre a atualização do motorista e o próximo tick do passageiro. Ajuda, grupos sociais e painel Som descrevem os usos atuais; o motorista não recebe um comando impossível de embarque no próprio palco.

Validação desta revisão: `npm run check` aprovado com 901 testes (98,15% de linhas, 92,76% de branches e 93,81% de funções no backend). O novo teste `test/browser/stage-voice.spec.js` passou nos perfis desktop e celular Chromium: captura sintética pela interface, Opus real, confirmação NO AR, retorno via servidor com áudio decodificado e liberação das tracks ao fechar. O celular também conferiu visibilidade em retrato e paisagem. A execução usou servidor temporário isolado na porta 4187 porque a porta padrão estava ocupada por outra validação. Não houve acesso a microfones físicos, produção, commit, push ou deploy.
