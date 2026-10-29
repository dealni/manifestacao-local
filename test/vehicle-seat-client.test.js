import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyVehicleSeatClient } from '../scripts/vehicle-seat-client.js';

function makeSeatControls() {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const start = original.indexOf('function UY(');
  const end = original.indexOf('\nclass GY', start);
  assert.ok(start >= 0 && end > start);
  const elements = [];
  const element = () => {
    const node = {
      hidden: false,
      classList: { add() {}, toggle() {} },
      attributes: {},
      append() {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
    };
    elements.push(node);
    return node;
  };
  const sent = [],
    notices = [],
    listeners = [];
  let now = 1000;
  const sandbox = {
    document: { createElement: element, querySelector: () => null },
    addEventListener(name, handler) {
      if (name === 'keydown') listeners.push(handler);
    },
    performance: { now: () => now },
    wu: '',
    au: '',
    om: '',
    kw: '',
    ri: 7,
    Si: 3,
  };
  vm.runInNewContext(
    applyVehicleSeatClient(original.slice(start, end)) + '\nglobalThis.make = UY;',
    sandbox,
  );
  const controls = sandbox.make({
    area: { prepend() {} },
    send: (message) => sent.push(message),
    toast: (text) => notices.push(text),
  });
  return {
    controls,
    primary: elements[1],
    sent,
    notices,
    keyboard: listeners[0],
    advance() {
      now += 500;
    },
  };
}

test('veículo decorativo informa seu uso sem transmitir seat', () => {
  const { controls, primary, sent, notices } = makeSeatControls();
  for (const car of [{ id: 100000, kind: 1 }]) {
    controls.update({ car });
    assert.equal(primary.hidden, false);
    assert.equal(primary.attributes['aria-disabled'], 'true');
    assert.match(primary.innerHTML, /Veículo decorativo/);
    primary.onclick();
    assert.match(notices.at(-1), /escolha seu veículo na Garagem/);
    assert.equal(sent.length, 0);
  }
});

test('atalho de carona preserva digitação, composição e eventos tratados', () => {
  const { controls, keyboard, sent } = makeSeatControls();
  controls.update({ car: { id: 9, kind: 1, driver: true } });
  for (const target of [
    { isContentEditable: true },
    { closest: () => ({ tagName: 'BUTTON' }) },
    { closest: () => ({ tagName: 'TEXTAREA' }) },
  ]) {
    const previous = sent.length;
    keyboard({
      key: 'e',
      target,
      preventDefault() {
        assert.fail('Não deve capturar a digitação');
      },
    });
    assert.equal(sent.length, previous);
  }
  for (const flag of ['defaultPrevented', 'isComposing']) {
    const previous = sent.length;
    keyboard({
      key: 'e',
      target: {},
      [flag]: true,
      preventDefault() {
        assert.fail('Evento deve ser preservado');
      },
    });
    assert.equal(sent.length, previous);
  }
  let prevented = false;
  keyboard({
    key: 'e',
    target: {},
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].t, 'seat');
  assert.equal(sent[0].on, true);
});

test('carona permite embarque, desembarque e liberação pelo motorista', () => {
  const { controls, primary, sent, notices, advance } = makeSeatControls();
  for (const kind of [1, 5]) {
    controls.update({ car: { id: 9, kind, driver: true } });
    assert.equal(primary.hidden, false);
    assert.equal(primary.attributes['aria-disabled'], 'false');
    assert.match(primary.innerHTML, /Carona|garupa/);
    advance();
    primary.onclick();
    assert.equal(sent.at(-1).t, 'seat');
    assert.equal(sent.at(-1).on, true);
    assert.equal(sent.at(-1).id, 9);
    controls.update({ seat: kind });
    advance();
    primary.onclick();
    assert.equal(sent.at(-1).t, 'seat');
    assert.equal(sent.at(-1).on, false);
  }
  controls.update({ passenger: true });
  assert.match(primary.innerHTML, /Deixar o passageiro/);
  advance();
  primary.onclick();
  assert.equal(sent.at(-1).on, false);
  assert.equal(notices.length, 0);
});

test('carro cheio preserva o aviso de lotação e não transmite entrada', () => {
  const { controls, primary, sent, notices } = makeSeatControls();
  controls.update({ car: { id: 9, kind: 1, driver: true, full: true } });
  assert.equal(primary.attributes['aria-disabled'], 'true');
  assert.match(primary.innerHTML, /Carro cheio/);
  primary.onclick();
  assert.equal(sent.length, 0);
  assert.match(notices.at(-1), /já tem motorista e passageiro/);
});

test('controles de carona preservam montaria e embarque no caminhão', () => {
  const { controls, primary, sent, advance } = makeSeatControls();
  controls.update({ mount: true });
  assert.equal(primary.attributes['aria-disabled'], 'false');
  primary.onclick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].t, 'vehicle');
  assert.equal(sent[0].kind, 0);
  controls.update({ stage: true });
  assert.equal(primary.hidden, true, 'motorista não recebe embarque impossível no próprio palco');
  controls.update({ truck: { riders: 0, capacity: 8 } });
  assert.equal(primary.hidden, false);
  assert.match(primary.innerHTML, /Subir no caminhão/);
  advance();
  primary.onclick();
  assert.equal(sent.at(-1).t, 'deck');
  assert.equal(sent.at(-1).on, true);
});

test('ajuda descreve carona, palco móvel e voz atuais', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const source = applyVehicleSeatClient(original);
  assert.ok(source.includes('use Falar no palco ou T para ligar e desligar o microfone'));
  assert.ok(source.includes('o alcance da voz é de 60 m'));
  assert.ok(source.includes('Carros e carros de som levam motorista e um passageiro'));
  assert.ok(!source.includes('Caronas não estão disponíveis'));
  assert.ok(!source.includes('Embarque indisponível'));
  assert.ok(!source.includes('voz será adicionada futuramente'));
  assert.ok(!source.includes('E ao volante sobe no palco'));
});

test('moto e carreta não oferecem entrada de passageiro sem suporte no servidor', () => {
  const { controls, primary, sent, notices } = makeSeatControls();
  for (const kind of [3, 7]) {
    controls.update({ car: { id: 9, kind, driver: true } });
    assert.equal(primary.attributes['aria-disabled'], 'true');
    assert.match(primary.innerHTML, /Sem assento de carona/);
    primary.onclick();
    assert.match(notices.at(-1), /Use um carro ou carro de som com motorista/);
  }
  assert.equal(sent.length, 0);
});

test('busca contextual oferece carros de outro time sem mudar permissão do palco', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const source = applyVehicleSeatClient(original);
  const start = source.indexOf('P.filter((we) => (we.kind === 1 || we.driver)');
  const end = source.indexOf(',\n', start);
  assert.ok(start >= 0 && end > start);
  const P = [
    { id: 1, kind: 1, driver: 1, team: 1 },
    { id: 2, kind: 5, driver: 2, team: 1 },
    { id: 3, kind: 6, driver: 3, team: 1 },
    { id: 4, kind: 6, driver: 4, team: 0 },
  ];
  const found = vm.runInNewContext(source.slice(start, end), {
    P,
    v: { team: 0 },
    fx: (team, vehicle) => vehicle.team === team,
  });
  assert.deepEqual(
    Array.from(found, (vehicle) => vehicle.id),
    [1, 2, 4],
  );
  const deckFilter = 'if (!fx(i, c) || !JM(c.deck, c.pose, e, t)) continue;';
  assert.ok(original.includes(deckFilter));
  assert.ok(source.includes(deckFilter));
});

test('carona livre próxima prevalece sobre veículos decorativos ou sem assento', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const source = applyVehicleSeatClient(original);
  const start = source.indexOf('J = Q\n');
  const end = source.indexOf(': void 0;', start);
  assert.ok(start >= 0 && end > start);
  const expression = source.slice(start + 'J = '.length, end) + ': void 0';
  const nearest = (cars, x, z) => {
    const reachable = cars
      .map((car) => ({ car, gap: Math.hypot(car.x - x, car.z - z) }))
      .filter(({ gap }) => gap <= 3)
      .sort((a, b) => a.gap - b.gap);
    return reachable[0];
  };
  const decorative = { id: 1, kind: 1, x: 0, z: 0 };
  const motorcycle = { id: 2, kind: 7, driver: 10, x: 0, z: 0 };
  const full = { id: 3, kind: 1, driver: 11, passenger: 12, x: 0, z: 0 };
  const available = { id: 4, kind: 5, driver: 13, x: 2, z: 0 };
  const evaluate = (P, Q = true) =>
    vm.runInNewContext(expression, {
      P,
      Q,
      ot: { x: 0, z: 0 },
      v: { team: 0 },
      fx: () => true,
      IN: nearest,
    });
  for (const obstruction of [decorative, motorcycle, full]) {
    assert.equal(evaluate([obstruction, available]).car.id, available.id);
    assert.equal(
      evaluate([obstruction, { ...available, x: 4 }]).car.id,
      obstruction.id,
      'veículo disponível fora do alcance não remove a explicação contextual',
    );
  }
  assert.equal(evaluate([available], false), undefined, 'espectador não recebe embarque');
});
