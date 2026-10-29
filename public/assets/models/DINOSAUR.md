# Dinossauro montável

- Produto `veiculo:manifestacao:dinossauro`, R$ 200,00, permanente na conta.
- Modo 9. Somente o lado 0 (bolsonaristas) pode comprar e montar; o servidor valida o lado e a posse do ticket.
- Uma pessoa por montaria. O botão Dinossauro abre a loja ou monta. WASD move, Shift corre, E/A pé desmonta e H emite o som grave da criatura. Espaço (ou Morder no celular) executa a mordida; segurar repete após o intervalo de 5,1 s. Faz parte da montaria, sem passe PvP adicional.
- O dinossauro não entra na corrida de carros e motos.
- Colisão autoritativa em `shared/world.ts`, `shared/driving.ts` e `shared/collisions.ts`. O modelo visual nunca determina permissões ou empurra jogadores pelo cliente.

## Origem e refinamento

Modelo próprio gerado com TripoAI a partir do conceito inspirado nas referências do usuário. O conceito não inclui armas ou pessoas. Textura PBR, geometria, esqueleto, sela, estribos, rédeas e lenço são reunidos por `tools/dinosaur_prepare_blender.py` e `tools/dinosaur_rig_blender.py`, executados pelo Blender MCP (`tools/blender_mcp.py`).

O GLB atual é `dinosaur-v2.glb`, com `DinoIdle`, `DinoWalk`, `DinoRun` e a sequência completa `DinoBite`. `Seat`, `Grip_R`, `Grip_L`, `Peg_R` e `Peg_L` são os pontos de contato do passageiro; `BiteGrip` ancora a cintura de quem foi capturado. O avatar completo usa a mesma IK das motos, com postura própria, e acompanha os pontos do esqueleto. As duas marchas compartilham a fase para evitar troca abrupta da perna apoiada ao mudar de velocidade.

`tools/dinosaur_bite_blender.py` anima pescoço, cabeça, cauda e mandíbula, adiciona pesos à mandíbula e exporta `shared/dinosaur-mouth.json`. Servidor e renderizador usam o mesmo trajeto da boca. O servidor escolhe uma única pessoa à frente, confere as paredes durante todo o movimento, bloqueia movimentos/veículos/gestos e a prende durante a captura. A transição da captura é interpolada; o arremesso começa na altura real de soltura, com rotação, colisão e recuperação. A vítima fica fora dos colisores de pedestres apenas enquanto está presa. Desconexões liberam a vítima; uma mordida vazia termina normalmente. Não há sangue, HP ou morte.

`tools/dinosaur_mouth_blender.py` refina essa sequência: a cintura entra no vão entre a língua e os dentes superiores, a mandíbula mantém espaço durante a sustentação e abre na soltura. São 0,68 s até o contato, 0,45 s de encaixe, arremesso em 2,85 s e recuperação até 3,8 s. Os keyframes de caminhada, corrida e repouso são preservados sem rebake. O cliente conserva a pose anterior durante o encaixe, inclusive ao pegar uma pessoa caída, e mantém a montaria parada como o servidor. A queda só começa após soltar a pessoa.

A interpolação visual começa no recebimento da captura, a partir da pose desenhada no quadro anterior. Atrasos de rede não pulam diretamente para o meio do movimento. `node tools/dinosaur-bite-browser.mjs` cobre os seis personagens, captura no chão, encaixe na boca, soltura e cenários com 250 ms de atraso.

O projeto editável, os relatórios de contato com o chão e as capturas de validação ficam em `artifacts/dinosaur/`. O carregador compartilha geometria e texturas entre montarias e clona somente a pose do esqueleto.

Comprimento: 5,60 m. Largura da pele: 1,66 m. Sela compacta de couro (0,51 m de largura máxima), cabeçada projetada sobre a pele, rédeas com peso entre tronco e cabeça e apoios próprios para mãos e pés. 22 ossos, seis materiais por montaria, texturas até 2048 px; aproximadamente 4,2 MB no GLB. A cauda usa colisores de raio progressivamente menor.

TripoAI: conceito `a3fbfcdd-68a5-4d7a-ad8d-ba84c106c9d9`; malha PBR `cf60161a-84b6-47df-aabd-d5ae8e0f0846`. Preparação, soldagem das costuras UV, modelagem da sela e arreios, pesos, solução das pernas e animações feitas pelo Blender MCP. `tools/dinosaur_load_blender.py` abre a base em uma chamada separada antes de executar `tools/dinosaur_rig_blender.py`.

Validação: `pnpm exec tsx --test tests/dinosaur.test.ts`, `pnpm exec tsx tools/dinosaur-integration.ts`, `node tools/dinosaur-browser.mjs` e `pnpm exec tsx tools/dinosaur-e2e.ts`. O teste de compra usa cobrança simulada; não movimenta dinheiro real.
