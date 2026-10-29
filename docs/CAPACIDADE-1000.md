# Perfil para 1.000 jogadores simultâneos

Implementado e validado localmente em 17/10/2026. Perfil publicado na release `20261017-06` e preservado na ativa `20261017-08`, com `MAX_PLAYERS=1000` e `WS_MAX_CONNECTIONS=1200`. Os resultados pós-publicação ficam em `analysis/release-20261017-06/` no workspace operacional, fora do Git. O perfil não transforma a RAM disponível em garantia de capacidade pela internet.

## Ajustes

- Padrão de 1.000 participantes, incluindo espectadores, e 1.200 sockets para acomodar lobby e reconexões. Removido o teto interno de 256 que contradizia a configuração.
- Simulação permanece a 20 Hz. Com mais de 128 participantes, snapshots detalhados vão a 10 Hz, com até 64 atores por destinatário e posição/ACK próprios obrigatórios. Uma grade espacial compartilha a seleção por região, evitando classificar mil pessoas para cada conexão. Aglomerações usam nível de detalhe; todos continuam na visão geral do mapa a 2 Hz; a partir de 512 participantes, a visão geral usa 1 Hz.
- Visão geral compartilhada por grupos, com entregas distribuídas entre os ticks para evitar picos. Os vizinhos são codificados uma vez por região; cada conexão acrescenta somente sua posição e ACK. Novas conexões recebem o cadastro completo; mudanças de aparência/apelido são enviadas em lote incremental a cada 500 ms, conforme o protocolo já aceito pelo cliente.
- Consultas de identidade usam índice por usuário durante o tick; revogações e expiração continuam verificadas. Alterações de progresso no mesmo tick geram um snapshot persistente; o progresso periódico é distribuído entre ticks e coalescido por até 500 ms. Respostas HTTP e débitos continuam com gravação imediata. Heartbeat usa tempo real, não quantidade de ticks. O catálogo fixo de missões é incluído nas respostas, sem repetição por usuário no documento persistido.
- Mapa 520 × 1280, missões, login, pontos, uploads, anúncios, veículos e regras existentes preservados. Limites por IP e backpressure mantidos. Voz continua com até 12 participantes, sem malha de mil microfones.

## Evidência local

Comando reproduzível, restrito a loopback e dados fictícios:

```sh
node scripts/benchmark-capacity.mjs 1000 60
```

Servidor e clientes executam em processos separados. São 1.000 contas fictícias autenticadas, movendo por 60 segundos na rodada final, com heartbeat, 20 reconexões e tentativa excedente. Persistência JSON em diretório temporário, removido no encerramento. Nenhum jogador, banco ou servidor de produção participa.

As duas rodadas, de 35 e 60 segundos, passaram. A suíte completa também passou: **346/346 testes**. Resultado da rodada final de 60 segundos:

| Verificação | Resultado |
| --- | --- |
| Conectados / movimentando / heartbeat | 1.000 / 1.000 / 1.000 |
| Reconexões preservando identidade | 20 |
| Conexão 1.001 | recusada corretamente, código 1013 |
| RTT p95 / máximo | 25,90 / 30,01 ms em loopback |
| Tick p95 / máximo | 31 / 80 ms |
| Ticks acima de 50 ms | 37 de 1.244, cerca de 3% |
| Consumidores lentos / erros de conexão | zero / zero |
| RSS do servidor | cerca de 268 MiB |
| Saída agregada de mensagens | cerca de 41,5 MB/s, 332 Mbit/s antes de overhead |
| Estado serializado | cerca de 1,15 MB |
| Jogadores após limpeza | zero |

Log detalhado local: `analysis/capacity-1000/benchmark-1000.json` (ignorado no Git). O benchmark usa JSON, não PostgreSQL, e não renderiza o jogo. Ele não homologa navegadores físicos, envio simultâneo de e-mail, uploads, chat/PvP em massa, voz ou a rede pública. Houve picos de tick de 80 ms: o resultado não garante ausência de atraso sob todas as cargas.

## Configuração publicada e próxima homologação

[Perfil sem segredos](../deploy/capacity-1000.env.example): aplicar somente as três variáveis indicadas, preservando todo o ambiente privado. O código novo precisa estar ativo junto da configuração; aumentar apenas o ambiente na release antiga mantém o teto de 256 e o fanout anterior.

Inventário somente leitura da VPS de apps: oito vCPUs, 32 GB de RAM, Node com `LimitNOFILE=65536`; Nginx com workers automáticos e `worker_connections=768`. A configuração é compartilhada com outros sistemas e não foi alterada. Além de usuários, cada WebSocket com proxy consome uma conexão externa e uma conexão upstream. Conferir distribuição por worker, CPU, buffers, throughput contratado e consumo dos outros apps antes de homologar a capacidade pública. Não rodar carga sintética no domínio público.

A próxima homologação deve usar instância isolada e banco de testes na VPS, carga distribuída externa autorizada, conexão móvel e desktop reais, tráfego durante entradas/saídas, chat, veículos/PvP, uploads e acompanhamento de latência do PostgreSQL. Validar o orçamento de banda, já que a amostra local usa aproximadamente 332 Mbit/s. Preservar backups e rollback para a release e configuração anteriores. Limite por IP continua 10; uma rede compartilhada não pode abrir mil conexões sob o mesmo IP sem revisão específica.
