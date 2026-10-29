# Caronas e embarque

Carros e carros de som de jogadores (tipos 1 e 5) aceitam motorista e um passageiro. A pé, aproxime-se da carroceria e use **E** ou **Carona (passageiro)**. O servidor confere proximidade, assento livre e estado dos dois jogadores; o passageiro acompanha a posição do carro sem controlar sua direção.

Use **E** ou **Sair do carro** para desembarcar. O motorista também pode usar **Deixar o passageiro**. A saída procura uma posição caminhável ao lado do veículo. Desconexão, troca de veículo, modo espectador e teleportes encerram o vínculo de carona. O deslocamento como passageiro não concede progresso de caminhada ou condução.

Os veículos da ambientação são decorativos: para dirigir, escolha um veículo na Garagem. Motos e carretas continuam sem assento de passageiro. O caminhão de som usa seu próprio palco, com **Subir no caminhão** e **Descer do caminhão**, independentemente da carona dos carros.

Os testes cobrem o contrato WebSocket, limite de ocupação, poses controladas pelo servidor, limpeza de vínculos e controles reais no navegador em desktop e celular. A validação emulada não substitui uma partida com aparelhos físicos.
