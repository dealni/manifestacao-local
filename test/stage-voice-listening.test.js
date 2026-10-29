import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { requireServedArtifact } from './helpers/served-artifact.js';

test('religar escuta atualiza banner de orador parado sem aguardar novo evento do servidor', () => {
  const source = requireServedArtifact(
    readFileSync(new URL('../public/client.js', import.meta.url), 'utf8'),
    'e ? this.renderBanner() : this.closeAll()',
  );
  const body = source
    .match(/class tY extends EventTarget \{[\s\S]*?\n}\nconst nY/)[0]
    .replace(/\nconst nY$/, '');
  const element = () => ({ hidden: true, setAttribute() {}, append() {} });
  const Receiver = vm.runInNewContext(`${body}; tY`, {
    EventTarget,
    Event,
    Map,
    document: { createElement: element },
    addEventListener() {},
    Pn: [{ team: 0 }],
    nY: (value) => value,
  });
  const sent = [];
  const net = new EventTarget();
  net.connected = true;
  net.send = (message) => sent.push(message);
  let wanted = false;
  const receiver = new Receiver(net, { voiceWanted: () => wanted, duck() {} }, element());
  receiver.apply({ live: [{ id: 5, nick: 'Orador', stage: 0 }] });
  receiver.listen();
  assert.match(receiver.banner.innerHTML, /desligad[oa]/);
  wanted = true;
  receiver.listen();
  assert.doesNotMatch(receiver.banner.innerHTML, /desligad[oa]/);
  assert.match(receiver.banner.innerHTML, /Orador/);
  assert.equal(sent.at(-1).on, true);
  const count = sent.length;
  receiver.listen();
  assert.equal(sent.length, count);
  wanted = false;
  receiver.listen();
  assert.match(receiver.banner.innerHTML, /desligad[oa]/);
  assert.equal(sent.at(-1).on, false);
});
