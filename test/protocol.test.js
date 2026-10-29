import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  encodeNear,
  encodeLooks,
  encodeOverview,
  decodeInput,
  PROTOCOL_VERSION,
} from '../src/protocol.js';

// Oráculo de conformidade: somente funções puras extraídas do cliente público,
// sem executar o bundle, o renderer ou qualquer código de rede.
const client = fs.readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
const decoder = client.slice(
  client.indexOf('function LB(n) {'),
  client.indexOf('function FB(n, e) {'),
);
const looks = client.slice(client.indexOf('function kB(n) {'), client.indexOf('const kx = 8,'));
const inputEncoder = client.slice(
  client.indexOf('function eH(n, e, t, i, a) {'),
  client.indexOf('const tH = 29,'),
);
const oracle = vm.runInNewContext(`(() => {
 const ca=11,Lm=2,Sx=3,ep=14,Dc=16,G8=20,U8=50,IB=Math.PI*2,DB=99999,Cx=5,N8=10,JG=7,tH=29,nH=-32768;
 ${decoder}\n${looks}\n${inputEncoder}
 return {decode:LB,looks:kB,input:eH};
})()`);
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

test('carreta transmite articulação em vez de inverter o reboque com emote zero', () => {
  for (const [yaw, trailer] of [
    [0, 0],
    [0.8, 0.2],
    [-0.8, -0.2],
    [Math.PI - 0.1, -Math.PI + 0.1],
  ]) {
    const original = { id: 1, x: 0, z: 100, yaw, trailer, mode: 3, emote: 0, vehicle: 100001 };
    const actor = oracle.decode(ab(encodeNear([original], 0, 1))).actors[0];
    const restored = actor.yaw - ((actor.emote - 128) / 127) * Math.PI;
    const error = Math.atan2(Math.sin(restored - trailer), Math.cos(restored - trailer));
    assert.ok(Math.abs(error) <= Math.PI / 254 + 0.0001, `${yaw}, ${trailer}: ${error}`);
    if (yaw === trailer) assert.equal(actor.emote, 128);
  }
});

test('dirigível transmite altura de voo, preservando animações dos outros veículos', () => {
  for (const [alt, expected] of [
    [undefined, 27],
    [34, 34],
    [12.5, 12.5],
    [-2, 0],
    [100, 63.75],
  ]) {
    const actor = oracle.decode(
      ab(encodeNear([{ id: 1, x: 0, z: 100, yaw: 0, mode: 4, alt, emote: 0 }], 0, 1)),
    ).actors[0];
    assert.equal(actor.emote / 4, expected);
  }
  for (const mode of [0, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
    const actor = oracle.decode(
      ab(encodeNear([{ id: 1, x: 0, z: 100, yaw: 0, mode, emote: 5 }], 0, 1)),
    ).actors[0];
    assert.equal(actor.emote, 5);
  }
});
const near = (actual, expected, epsilon) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('near v14 é consumido pelo decoder original, incluindo ACK e veículo', () => {
  assert.equal(PROTOCOL_VERSION, 14);
  const players = new Map([
    [
      1,
      { id: 1, x: -252.23, z: 590.79, yaw: -0.7, speed: 4.53, mode: 2, emote: 4, vehicle: 100042 },
    ],
  ]);
  const snapshot = oracle.decode(ab(encodeNear(players, 123456, 1, { seq: 42, held: 7 })));
  assert.equal(snapshot.type, 1);
  assert.equal(snapshot.tick, 123456);
  assert.equal(snapshot.self, 1);
  assert.equal(snapshot.inputAck.seq, 42);
  assert.equal(snapshot.inputAck.held, 7);
  const p = snapshot.actors[0];
  near(p.x, -252.23, 0.011);
  near(p.z, 590.79, 0.011);
  near(p.yaw, Math.PI * 2 - 0.7, 0.0001);
  assert.equal(p.speed, 4.53);
  assert.equal(p.mode, 2);
  assert.equal(p.emote, 4);
  assert.equal(p.vehicle, 100042);
});

test('looks preserva os bits de time/personagem e a aparência unsigned', () => {
  const entries = oracle.looks(
    ab(encodeLooks([{ id: 55, character: 61, team: 3, shirt: 255, appearance: 0xfedcba98 }], 9)),
  );
  assert.equal(entries[0][0], 55);
  assert.equal(entries[0][1].character, 61);
  assert.equal(entries[0][1].team, 3);
  assert.equal(entries[0][1].shirt, 255);
  assert.equal(entries[0][1].appearance, 0xfedcba98);
});

test('overview completo corresponde a registros originais de 14 bytes', () => {
  const snapshot = oracle.decode(
    ab(
      encodeOverview(
        [{ id: 7, x: 850, z: -600, yaw: Math.PI / 2, speed: 4, character: 5, team: 2, shirt: 3 }],
        99,
      ),
    ),
  );
  assert.equal(snapshot.type, 2);
  assert.equal(snapshot.removed.length, 0);
  const p = snapshot.actors[0];
  assert.equal(p.x, 850);
  assert.equal(p.z, -600);
  assert.equal(p.vx, 4);
  assert.equal(p.vz, 0);
  assert.equal(p.character, 5);
  assert.equal(p.team, 2);
  assert.equal(p.shirt, 3);
});

test('input é decodificado a partir do encoder original nos formatos 10 e 29 bytes', () => {
  const simple = decodeInput(oracle.input(0.5, -1, true, 123));
  assert.equal(simple.seq, 123);
  near(simple.x, 0.5, 0.00002);
  assert.equal(simple.z, -1);
  assert.equal(simple.run, true);
  assert.equal(simple.vehicle, false);
  const packet = oracle.input(0, 1, false, 321, {
    x: 12.5,
    z: -52.25,
    yaw: 0.71,
    speed: -1.25,
    trailer: -0.4,
    epoch: 257,
    at: 123456,
    vehicle: true,
  });
  const full = decodeInput(packet);
  assert.equal(full.vehicle, true);
  assert.deepEqual(full.pose, {
    x: 12.5,
    z: -52.25,
    yaw: 0.71,
    speed: -1.25,
    trailer: -0.4,
    epoch: 1,
    at: 123456,
  });
  const noTrailer = decodeInput(
    oracle.input(0, 0, false, 0, { x: 0, z: 0, yaw: 0, speed: 0, epoch: 0, at: 0 }),
  );
  assert.equal('trailer' in noTrailer.pose, false);
});

test('buffers com offsets, pacotes vazios e limites numéricos', () => {
  const original = Buffer.from(oracle.input(1, -1, false, 8));
  const framed = Buffer.concat([Buffer.alloc(3), original, Buffer.alloc(5)]);
  assert.equal(decodeInput(framed.subarray(3, 13)).seq, 8);
  assert.equal(oracle.decode(ab(encodeNear([], 0, 0))).actors.length, 0);
  assert.equal(oracle.looks(ab(encodeLooks([], 0))).length, 0);
  assert.equal(oracle.decode(ab(encodeOverview([], 0))).actors.length, 0);
  const p = oracle.decode(ab(encodeNear([{ id: 1, x: Infinity, z: -99999, speed: 99999 }], 0, 1)))
    .actors[0];
  assert.equal(p.x, 0);
  assert.equal(p.z, -655.36);
  assert.equal(p.speed, 327.67);
});

test('input rejeita comprimento, tipo, flags e poses não finitas inválidos', () => {
  assert.equal(decodeInput(Buffer.alloc(9)), null);
  assert.equal(decodeInput(Buffer.alloc(10)), null);
  assert.equal(decodeInput('input'), null);
  const flags = Buffer.from(oracle.input(0, 0, false, 0));
  flags[9] = 4;
  assert.equal(decodeInput(flags), null);
  const invalid = Buffer.from(
    oracle.input(0, 0, false, 0, { x: NaN, z: 0, yaw: 0, speed: 0, epoch: 0, at: 0 }),
  );
  assert.equal(decodeInput(invalid), null);
  assert.throws(
    () =>
      encodeNear(
        Array.from({ length: 1101 }, (_, id) => ({ id })),
        0,
      ),
    RangeError,
  );
});

test('pacote compartilhado preserva bytes, ACK, veículos e identidade própria', async () => {
  const { prepareNearGroup, encodeNearFromGroup } = await import('../src/protocol.js');
  for (const count of [0, 1, 12, 64]) {
    const actors = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      x: i / 3,
      z: -i,
      yaw: i / 4,
      speed: i / 10,
      mode: i % 2,
      vehicle: i % 2 ? 100001 + i : 0,
      emote: i % 4,
    }));
    const group = prepareNearGroup(actors, 123456);
    for (const viewer of [...actors, { id: 1000, x: 3, z: 4, yaw: 2, mode: 1, vehicle: 100007 }])
      for (const ack of [undefined, { seq: 99, held: 120 }]) {
        const expected = [viewer, ...actors.filter((p) => p.id !== viewer.id).slice(0, 63)];
        assert.deepEqual(
          encodeNearFromGroup(group, viewer, ack),
          encodeNear(expected, 123456, viewer.id, ack),
        );
      }
  }
});
