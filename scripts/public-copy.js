/** Textos da instalação sem encaminhamento comercial ao serviço de origem. */
export function applyPublicCopy(source) {
  return source
    .replaceAll('Abrir referencia.invalid', 'Abrir o jogo')
    .replaceAll('A loja fica no referencia.invalid', 'A loja fica neste jogo')
    .replaceAll('Compre pelo endereço referencia.invalid', 'Use a loja deste jogo')
    .replaceAll('pelo endereço referencia.invalid', 'neste endereço')
    .replaceAll('adicione referencia.invalid às exceções', 'adicione este site às exceções')
    .replaceAll('para referencia.invalid', 'para este site')
    .replaceAll('>referencia.invalid</a>', '>este jogo</a>')
    .replaceAll('A conta abre no referencia.invalid', 'A conta abre neste jogo')
    .replaceAll('O superchat é feito pelo referencia.invalid', 'O superchat é feito neste jogo')
    .replaceAll('A conta fica no referencia.invalid', 'A conta fica neste jogo');
}
