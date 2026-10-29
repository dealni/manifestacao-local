/** Caronas usam veículos reais com motorista; a ambientação continua decorativa. */
export function vehicleSeatAction(action, context) {
  if (action?.action?.t !== 'seat' || !action.action.on) return action;
  if ([1, 5].includes(context.car?.kind) && context.car.driver) return action;
  const decorative = !context.car?.driver;
  return {
    ...action,
    cls: 'full',
    html: `<span>${decorative ? 'Veículo decorativo' : 'Sem assento de carona'}</span>`,
    title: decorative
      ? 'Este veículo faz parte da ambientação'
      : 'Este veículo não tem assento de carona',
    refusal: decorative
      ? 'Este veículo é decorativo. Para dirigir, escolha seu veículo na Garagem; para pegar carona, aproxime-se de um carro com motorista.'
      : 'Use um carro ou carro de som com motorista para pegar carona. Caminhões de som permitem embarque no palco.',
  };
}

/** Atalhos do mundo não devem disputar a digitação nem comandos de outros controles. */
export function seatShortcutBlocked(event) {
  return !!(
    event.defaultPrevented ||
    event.isComposing ||
    event.target?.isContentEditable ||
    event.target?.closest?.(
      'input,textarea,select,button,a[href],[contenteditable],[role="textbox"]',
    )
  );
}

export function applyVehicleSeatClient(source) {
  const before = 'const u = d(A);';
  if (source.indexOf(before) < 0 || source.indexOf(before) !== source.lastIndexOf(before))
    throw new Error('Controle contextual de embarque ausente ou ambíguo');
  const keyboard = 'A.target.matches?.("input,textarea,select")';
  if (source.indexOf(keyboard) < 0 || source.indexOf(keyboard) !== source.lastIndexOf(keyboard))
    throw new Error('Atalho contextual de embarque ausente ou ambíguo');
  source = source.replace(keyboard, 'seatShortcutBlocked(A)');
  // A regra de time dos caminhões não se aplica às caronas em carros.
  source = source.replace(
    'P.filter((we) => (we.kind === 1 || we.driver) && fx(v?.team, we))',
    'P.filter((we) => (we.kind === 1 || we.driver) && ([1, 5].includes(we.kind) || fx(v?.team, we)))',
  );
  // A ambientação ou um veículo sem assento não deve bloquear uma carona livre
  // dentro do alcance. A busca original fica como fallback para explicar a recusa.
  source = source.replace(
    'J = Q\n          ? IN(',
    'J = Q\n          ? IN(P.filter((we) => [1, 5].includes(we.kind) && we.driver && !we.passenger), ot.x, ot.z) || IN(',
  );
  // O motorista não pode embarcar no próprio veículo: o servidor exige outro condutor.
  source = source.replace('if (A.stage) return [Bw("E")];', 'if (A.stage) return null;');
  source = source.replace(
    'return A.own.deck\n          ? [rm(A.own.kind, "E"), Bw("F")]\n          : [rm(A.own.kind, "E")];',
    'return [rm(A.own.kind, "E")];',
  );
  source = source
    .replace('Pegue uma carona</b>', 'Veículos e palcos</b>')
    .replace(
      'E, ao lado de um carro com motorista, entra como passageiro (cabem dois); E de novo para sair. Ao lado de um caminhão de som, E sobe no palco (e desce). O seu caminhão de som, carreta ou carro de som fica estacionado onde você desce: E (ou o botão) volta ao volante; no seu caminhão, E ao volante sobe no palco e F volta a dirigir. O caminhão de som da equipe fica no início da avenida; só a equipe dirige.',
      'Escolha seu veículo na Garagem. A pé, aproxime-se de um carro conduzido por outra pessoa e use E ou Carona (passageiro) para entrar. Carros e carros de som levam motorista e um passageiro. Use E ou Sair do carro para desembarcar; o motorista também pode liberar o assento com E. Aproxime-se de um caminhão de som conduzido por outra pessoa e use E ou Subir no caminhão para embarcar no palco; E desce. Os veículos decorativos não permitem embarque. Nos palanques fixos, use E para subir. Já no palco ou palanque, use Falar no palco ou T para ligar e desligar o microfone. Uma pessoa fala por vez; o alcance da voz é de 60 m. Ative o som e a voz no painel Som para ouvir.',
    )
    .replace(
      'Ele permanece estacionado; voz será adicionada futuramente.',
      'Para falar, use um palanque ou o palco de um caminhão de som conduzido por outro jogador. O microfone é ativado em Falar no palco ou T.',
    )
    .replace(
      '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> andar no palco <span>·</span> <kbd>E</kbd> descer',
      '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> andar no palco <span>·</span> <kbd>T</kbd> microfone <span>·</span> <kbd>E</kbd> descer',
    );
  return (
    seatShortcutBlocked.toString() +
    '\n' +
    vehicleSeatAction.toString() +
    '\n' +
    source.replace(before, 'const u = d(A)?.map((action) => vehicleSeatAction(action, A));')
  );
}
