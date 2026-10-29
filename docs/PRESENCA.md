# Presença e inatividade

A sessão do jogo é encerrada após **10 minutos sem interação**, com aviso no último minuto e botão **Continuar no jogo**. Após sair por inatividade, voltar exige uma ação do jogador; não há reconexão automática nessa situação.

Movimentos, ações, interação com a interface e transmissão de voz aceita renovam a presença. Ping, movimento zerado e consultas automáticas não renovam. Apenas manter a aba aberta não garante permanência. O controle também vale para visitantes e espectadores.

Conexões sem resposta ao ping WebSocket são encerradas em até aproximadamente **20 segundos**: verificação a cada 10 segundos, encerramento no ciclo seguinte sem pong. Fechamento normal remove o jogador imediatamente.

Ao perder a conexão, o cliente limpa os personagens remotos, veículos, visão distante e interpolação, preservando a pose própria necessária à reconexão. O evento de navegador sem internet também limpa a cena imediatamente. Figurantes decorativos não são jogadores e continuam compondo o cenário.

Validação local: testes de relógio controlado, WebSocket real, heartbeat sem pong e ciclo de aviso/continuação/expiração no navegador, com evidências em `analysis/presenca-20261018/`. Nenhum teste deixa servidor local permanente.
