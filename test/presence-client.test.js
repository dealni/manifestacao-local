import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { clearDisconnectedPlayers, presenceControls } from '../scripts/presence-client.js';

function network() {
  const net = new EventTarget();
  Object.assign(net, {
    connected: true,
    id: 7,
    actors: new Map([
      [7, { id: 7, x: 12, z: 30, yaw: 1, mode: 1, speed: 5 }],
      [8, { id: 8 }],
    ]),
    overview: new Map([[8, {}]]),
    nearBase: new Map([[8, {}]]),
    pendingNear: {},
    vehicles: [{}],
    seen: new Map([[9, {}]]),
    roadsters: new Map([[9, {}]]),
    far: {
      reset() {
        this.resetCount = (this.resetCount || 0) + 1;
      },
    },
    messages: [],
    send(message) {
      this.messages.push(message);
    },
  });
  net.emit = (name, detail) => {
    const event = new Event(name);
    event.detail = detail;
    net.dispatchEvent(event);
  };
  return net;
}

test('desconexão limpa atores remotos, veículos, overview e interpolação sem perder pose própria', () => {
  const net = network();
  let cleared = 0;
  clearDisconnectedPlayers(
    net,
    {
      clear() {
        cleared++;
      },
    },
    {
      clear() {
        cleared++;
      },
    },
  );
  assert.deepEqual([...net.actors.keys()], [7]);
  assert.deepEqual(net.actors.get(7), { id: 7, x: 12, z: 30, yaw: 1, mode: 1, speed: 0 });
  for (const key of ['overview', 'nearBase', 'seen', 'roadsters']) assert.equal(net[key].size, 0);
  assert.equal(net.vehicles.length, 0);
  assert.equal(net.pendingNear, undefined);
  assert.equal(net.far.resetCount, 1);
  assert.equal(cleared, 2);
  net.actors.clear();
  clearDisconnectedPlayers(net);
  assert.equal(net.actors.size, 0);
});

function ui() {
  const net = network(),
    elements = [],
    handlers = {};
  const document = {
    visibilityState: 'visible',
    body: { append() {} },
    createElement() {
      const element = { style: {}, hidden: false, setAttribute() {}, append() {} };
      elements.push(element);
      return element;
    },
  };
  let now = 0,
    reloads = 0,
    clears = 0;
  const sandbox = {
    document,
    performance: { now: () => now },
    location: {
      reload() {
        reloads++;
      },
    },
    window: {
      addEventListener(name, callback) {
        handlers[name] = callback;
      },
    },
    clearDisconnectedPlayers,
  };
  const bind = vm.runInNewContext(`(${presenceControls.toString()})`, sandbox);
  const control = bind(
    net,
    {
      clear() {
        clears++;
      },
    },
    {
      clear() {
        clears++;
      },
    },
  );
  return {
    net,
    control,
    document,
    handlers,
    elements,
    advance(ms) {
      now += ms;
    },
    get reloads() {
      return reloads;
    },
    get clears() {
      return clears;
    },
  };
}

test('aviso oferece continuação explícita e aguarda confirmação de atividade do servidor', () => {
  const h = ui(),
    [panel, text, button] = h.elements;
  h.net.emit('idle_warning', { remaining: 60000 });
  assert.equal(panel.hidden, false);
  assert.match(text.textContent, /9 minutos/);
  button.onclick();
  assert.equal(h.net.messages.at(-1).t, 'active');
  assert.equal(panel.hidden, false);
  h.net.emit('idle_warning', { remaining: 0 });
  assert.equal(panel.hidden, true);
});

test('atividade exige interação real, limita frequência e ignora aba oculta', () => {
  const h = ui();
  h.handlers.pointerdown({ isTrusted: false });
  assert.equal(h.net.messages.length, 0);
  h.handlers.pointerdown({ isTrusted: true });
  assert.equal(h.net.messages.length, 1);
  h.handlers.keydown({ isTrusted: true, repeat: true });
  h.handlers.wheel({ isTrusted: true });
  assert.equal(h.net.messages.length, 1);
  h.advance(15000);
  h.handlers.input({ isTrusted: true });
  assert.equal(h.net.messages.length, 2);
  h.document.visibilityState = 'hidden';
  h.advance(15000);
  h.control.active(true);
  assert.equal(h.net.messages.length, 2);
});

test('expiração não renova presença nem reconecta sozinha, e oferece voltar por clique', () => {
  const h = ui(),
    [panel, text, button] = h.elements;
  h.net.emit('connection', { connected: false, code: 1000, reason: 'Saída por inatividade' });
  assert.equal(panel.hidden, false);
  assert.match(text.textContent, /10 minutos/);
  assert.equal(h.clears, 2);
  h.control.active(true);
  assert.equal(h.net.messages.length, 0);
  assert.equal(h.reloads, 0);
  button.onclick();
  assert.equal(h.reloads, 1);
  h.net.emit('welcome', {});
  assert.equal(panel.hidden, true);
  assert.equal(button.textContent, 'Continuar no jogo');
});

test('sem internet limpa cena imediatamente; adaptador reproduzível integra o fechamento do socket', () => {
  const h = ui();
  h.handlers.offline();
  assert.equal(h.net.overview.size, 0);
  assert.equal(h.clears, 2);
  const source = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  assert.match(source, /clearDisconnectedPlayers\(this\);/);
  assert.match(source, /presenceControls\(Y, Vf, iC\);/);
});
