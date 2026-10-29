function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before))
    throw new Error(`Patch de acesso livre incompatível ou ambíguo: ${before.slice(0, 90)}`);
  return source.replace(before, after);
}

/** Os catálogos são avaliados antes de let xt; metadados não consultam estado de conta. */
export function freeAccessMetadata(source) {
  return source
    .replaceAll(
      '(__freeAccess() ? "Designs gratuitos com conta · até 20 salvos" : "Designs próprios: 100 pontos por design, até 20 salvos")',
      '"Designs gratuitos com conta · até 20 salvos"',
    )
    .replaceAll(
      '(__freeAccess() ? "Bandeiras liberadas; designs gratuitos com conta" : "Bandeiras incluídas; designs próprios por 100 pontos")',
      '"Bandeiras liberadas; designs gratuitos com conta"',
    )
    .replaceAll(
      '"Designs próprios: 100 pontos por design, até 20 salvos"',
      '"Designs gratuitos com conta · até 20 salvos"',
    )
    .replaceAll(
      '"Bandeiras incluídas; designs próprios por 100 pontos"',
      '"Bandeiras liberadas; designs gratuitos com conta"',
    )
    .replaceAll(
      '"Toda a garagem. Designs próprios por 100 pontos cada."',
      '"Toda a garagem liberada. Designs pessoais gratuitos com conta."',
    );
}

/** Preços pessoais descrevem o login sem conceder identidade ou direitos de upload ao visitante. */
export function freeAccessCopy(source) {
  return source
    .replaceAll(
      'function __designPriceLabel() {\n  return __designsFree()',
      'function __designPriceLabel() {\n  if (__freeAccess()) return gn() ? "Sem custo com conta" : "Grátis com login";\n  return __designsFree()',
    )
    .replaceAll('Premium · pontos', 'Benefícios liberados')
    .replaceAll('guardar compras e seu visual', 'guardar progresso e seu visual')
    .replaceAll('guardar o Premium e os benefícios da compra', 'guardar o progresso e seu visual');
}

/** Acesso ao jogo é separado da identidade: visitantes continuam sem usuário/ticket. */
export function applyFreeAccessClient(source) {
  source = freeAccessMetadata(source);
  source = once(
    source,
    'function $i() {',
    `function __freeAccess() { return xt?.freeAccess === true; }
function __gameAccess() { return __freeAccess() ? (xt?.access ?? {}) : null; }
function __gamePvp() { return __gameAccess()?.pvp ?? !!xt?.user?.pvp; }
function __gameObjects() { return __gameAccess()?.objetos ?? xt?.user?.pvpItems ?? []; }
function $i() {`,
  );
  for (const [before, after] of [
    [
      'return xt?.user?.acesso?.active === !0;',
      'return __gameAccess()?.acesso === true || xt?.user?.acesso?.active === !0;',
    ],
    ['return xt?.user?.passes ?? [];', 'return __gameAccess()?.passes ?? xt?.user?.passes ?? [];'],
    [
      'return xt?.user?.bandeiras ?? [];',
      'return __gameAccess()?.bandeiras ?? xt?.user?.bandeiras ?? [];',
    ],
    [
      'return xt?.user?.veiculos ?? [];',
      'return __gameAccess()?.veiculos ?? xt?.user?.veiculos ?? [];',
    ],
    [
      'const zi = () => xt?.user?.personagens ?? [],',
      'const zi = () => __gameAccess()?.personagens ?? xt?.user?.personagens ?? [],',
    ],
    ['owned: () => (xt?.user?.pvp ? ["pvp"] : []),', 'owned: () => (__gamePvp() ? ["pvp"] : []),'],
    ['owned: () => xt?.user?.pvpItems ?? [],', 'owned: __gameObjects,'],
    ['!e.price || !!gn()?.bandeiras.includes(e.key)', '!e.price || $x().includes(e.key)'],
    [
      'async function Wr(n, e, t) {',
      `async function Wr(n, e, t) {
  if (__freeAccess() && ["personagem", "veiculo", "bandeira", "pvp", "objeto", "passe", "acesso"].includes(n.endpoint) && n.owned().includes(e)) {
    ro();
    return Vc() ?? { freeAccess: true };
  }`,
    ],
    ['function ol(n) {\n  !n ||', 'function ol(n) {\n  typeof n !== "string" || !n ||'],
    [
      '  const t = !!gn();\n  ((e.innerHTML = `<button class="dialog-close"',
      '  const t = __freeAccess() || !!gn();\n  ((e.innerHTML = `<button class="dialog-close"',
    ],
    [
      '  const a = !!gn();\n  ((i.innerHTML = `<button class="dialog-close"',
      '  const a = __freeAccess() || !!gn();\n  ((i.innerHTML = `<button class="dialog-close"',
    ],
    [
      '      s = !!gn(),\n      o = this.net.actors.get(this.net.id),',
      '      s = __freeAccess() || !!gn(),\n      o = this.net.actors.get(this.net.id),',
    ],
    [
      '        "Entre na sua conta",\n        "A conta salva sua pontuação no ranking global.",',
      '        __freeAccess() ? "Participação liberada" : "Entre na sua conta",\n        "A conta é opcional para jogar e permite guardar sua pontuação no ranking global.",',
    ],
    [
      'const d = `${!!gn()}:${this.net.actors.get(this.net.id)?.mode}`;',
      'const d = `${__freeAccess() || !!gn()}:${this.net.actors.get(this.net.id)?.mode}`;',
    ],
    [
      '      !gn())\n    ) {\n      s.append(',
      '      !gn() && !__freeAccess())\n    ) {\n      s.append(',
    ],
    [
      '        N = !!gn(),\n        O = P?.playlist?.tracks ?? [],',
      '        N = __freeAccess() || !!gn(),\n        O = P?.playlist?.tracks ?? [],',
    ],
  ]) {
    source = once(source, before, after);
  }
  // Adapta somente apresentação dos benefícios; uploads e identidade mantêm seus gates.
  source = source
    .replaceAll('"Na sua conta"', '(__freeAccess() ? "Liberado grátis" : "Na sua conta")')
    .replaceAll('"✓ Na sua conta"', '(__freeAccess() ? "✓ Liberado grátis" : "✓ Na sua conta")')
    .replaceAll('${o.name} liberado na sua conta.', '${o.name} liberado para jogar.')
    .replaceAll(
      'Escolha para usar. Os itens comprados ou recebidos ficam na sua conta.',
      'Escolha para usar. Personagens, veículos, bandeiras e objetos estão liberados gratuitamente.',
    )
    .replaceAll('Denunciar esta mensagem à IA', 'Denunciar esta mensagem')
    .replaceAll('Denúncia enviada', 'Solicitação de denúncia enviada')
    .replaceAll('B pega o spray (com conta)', 'B pega o spray')
    .replaceAll(
      'Todos os passes incluem o Premium. As restrições de time dos personagens continuam valendo. Imagens ilustrativas. Cada design de cartaz ou bandeira custa 100 pontos para ativar. Anúncios, doações e superchats usam pontos separadamente.',
      'Personagens, veículos, bandeiras e objetos estão liberados gratuitamente. As regras dos times continuam valendo. Entre com e-mail para salvar progresso, enviar imagens e usar os recursos de conta.',
    )
    .replaceAll(
      '"Falta entrar na conta para liberar a inscrição."',
      '"Conecte-se ao jogo para participar."',
    );

  source = source
    .replaceAll(
      '(pe("#access-price").textContent = l?.active',
      '(pe("#access-price").textContent = __freeAccess() ? "Jogo liberado grátis" : l?.active',
    )
    .replaceAll(
      '(pe("#access-status").textContent = l?.active',
      '(pe("#access-status").textContent = __freeAccess() ? "Todos os personagens, veículos, bandeiras e objetos estão liberados. Conta por e-mail é opcional para salvar e usar recursos pessoais. O personagem sai ao desconectar." : l?.active',
    )
    .replaceAll(
      '"O personagem sai do mundo ao desconectar. Moto, carro comum, caixa de som básica e spray com recargas ilimitadas incluídos. Cada design de cartaz ou bandeira custa 100 pontos para ativar, inclusive para Premium, salvo recompensa de missão: até 20 salvos, com uso ilimitado após adquirir. Exclua um para criar outro."',
      '(__freeAccess() ? "Explore Brasília com todos os personagens, veículos, bandeiras, objetos e spray liberados gratuitamente. Entre com sua conta para salvar o progresso, publicar imagens e conversar em privado." : "O personagem sai do mundo ao desconectar. Moto, carro comum, caixa de som básica e spray com recargas ilimitadas incluídos. Cada design de cartaz ou bandeira custa 100 pontos para ativar, inclusive para Premium, salvo recompensa de missão: até 20 salvos, com uso ilimitado após adquirir. Exclua um para criar outro.")',
    )
    .replaceAll(
      '"As recompensas ficam na sua conta. Confira os itens liberados e os próximos objetivos abaixo."',
      '(__freeAccess() ? "As missões continuam disponíveis. Todos os itens já estão liberados; entre com sua conta para salvar o progresso." : "As recompensas ficam na sua conta. Confira os itens liberados e os próximos objetivos abaixo.")',
    )
    .replaceAll(
      '"Designs próprios: 100 pontos cada, até 20 salvos"',
      '(__freeAccess() ? "Designs gratuitos com conta · até 20 salvos" : "Designs próprios: 100 pontos cada, até 20 salvos")',
    )
    .replaceAll(
      '"Designs próprios: 100 pontos cada"',
      '(__freeAccess() ? "Designs gratuitos com conta" : "Designs próprios: 100 pontos cada")',
    )
    .replaceAll(
      'Designs próprios por 100 pontos · até 20 salvos',
      'Designs gratuitos com conta · até 20 salvos',
    )
    .replaceAll('Conhecer Premium e passes →', 'Ver itens liberados →');

  // Pontos continuam exclusivos das publicações: anúncios e destaques mantêm valores e débito.
  source = source
    .replaceAll('Sem custo · recompensa de missão', 'Sem custo com conta')
    .replaceAll(
      'Use seus pontos nos benefícios do jogo. Pontos não são dinheiro, não permitem saque e a compra de pontos ainda não está disponível.',
      'Use pontos para anúncios nos telões e destaques no chat. Personagens, veículos, bandeiras, objetos e designs pessoais são gratuitos. Pontos não são dinheiro, não permitem saque e a compra de pontos ainda não está disponível.',
    )
    .replaceAll(
      'Estampa HD em cetim, franja e mastro dourados. Fica na sua conta para sempre.',
      'Estampa HD em cetim, franja e mastro dourados. Liberada gratuitamente para usar no jogo.',
    );
  source = once(
    source,
    'if (!cn || !gn()) return Me();',
    'if (!cn || (!gn() && !__freeAccess())) return Me();',
  );
  return freeAccessCopy(source);
}
