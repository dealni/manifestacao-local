import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleVehicleSeat,
  releaseVehicleSeats,
  tickVehicleSeats,
  vehiclePassengers,
} from '../src/vehicle-seats.js';
import { canOccupyPlayer } from '../src/simulation.js';

function fixture() {
  const driver = { id: 1, x: 0, z: 100, yaw: 0, mode: 1, vehicle: 100000, speed: 0, team: 0 };
  const rider = { id: 2, x: 2, z: 100, yaw: 0, mode: 0, vehicle: 0, team: 0 };
  const messages = [];
  const ctx = {
    players: new Map([
      [1, driver],
      [2, rider],
    ]),
    sendPlayer(p, msg) {
      messages.push({ id: p.id, ...msg });
    },
  };
  const board = () => handleVehicleSeat(rider, { t: 'seat', on: true, id: driver.vehicle }, ctx);
  return { driver, rider, ctx, board, messages };
}

test('carona reserva único passageiro e segue pose, rotação e velocidade autoritativas', () => {
  const { driver, rider, ctx, board } = fixture();
  assert.equal(board(), true);
  assert.equal(rider.mode, 33);
  assert.equal(rider.vehicle, driver.vehicle);
  assert.equal(vehiclePassengers(ctx).get(driver.vehicle), rider.id);
  const other = { ...rider, id: 3, mode: 0, vehicle: 0, vehicleSeat: undefined };
  ctx.players.set(3, other);
  handleVehicleSeat(other, { t: 'seat', on: true, id: driver.vehicle }, ctx);
  assert.equal(other.mode, 0);
  Object.assign(driver, { x: 3, z: 104, yaw: 1.2, speed: 6 });
  tickVehicleSeats(ctx);
  assert.deepEqual([rider.x, rider.z, rider.yaw, rider.speed], [3, 104, 1.2, 6]);
  handleVehicleSeat(driver, { t: 'seat', on: false }, ctx);
  assert.equal(rider.mode, 0);
  assert.equal(rider.vehicle, 0);
  assert.equal(rider.vehicleSeat, undefined);
  assert.ok(Math.hypot(rider.x - driver.x, rider.z - driver.z) >= 2.6);
});

test('embarque rejeita distância, veículo inexistente, tipo sem assento e estados incompatíveis', () => {
  for (const mutation of [
    ({ rider }) => {
      rider.x = 30;
    },
    ({ driver }) => {
      driver.vehicle = 0;
    },
    ({ driver }) => {
      driver.mode = 6;
    },
    ({ driver }) => {
      driver.spectator = true;
    },
    ({ driver }) => {
      driver.race = true;
    },
    ({ rider }) => {
      rider.spectator = true;
    },
    ({ rider }) => {
      rider.raceFrozen = true;
    },
    ({ rider }) => {
      rider.secretRide = true;
    },
    ({ rider }) => {
      rider.mode = 1;
    },
    ({ rider }) => {
      rider.stageDeck = {};
    },
    ({ rider }) => {
      rider.x = NaN;
    },
    ({ ctx }) => {
      ctx.debateSessions = new Map([[1, { host: { id: 2 } }]]);
    },
  ]) {
    const f = fixture();
    mutation(f);
    f.board();
    assert.equal(f.rider.vehicleSeat, undefined);
  }
  const f = fixture();
  assert.equal(handleVehicleSeat(f.rider, { t: 'other' }, f.ctx), false);
  handleVehicleSeat(f.rider, { t: 'seat', on: 'true', id: 100000 }, f.ctx);
  assert.equal(f.rider.vehicleSeat, undefined);
  handleVehicleSeat(f.rider, { t: 'seat', on: true, id: '100000' }, f.ctx);
  assert.equal(f.rider.vehicleSeat, undefined);
});

test('troca de carro, corrida, espectador, desconexão ou transição de passageiro libera assento', () => {
  for (const mutate of [
    ({ driver }) => {
      driver.vehicle++;
    },
    ({ driver }) => {
      driver.mode = 0;
      driver.vehicle = 0;
    },
    ({ driver }) => {
      driver.raceFrozen = true;
    },
    ({ ctx }) => {
      ctx.players.delete(1);
    },
    ({ rider }) => {
      rider.spectator = true;
    },
    ({ rider }) => {
      rider.mode = 0;
      rider.vehicle = 0;
    },
    ({ ctx }) => {
      ctx.debateSessions = new Map([[1, { host: { id: 1 } }]]);
    },
  ]) {
    const f = fixture();
    f.board();
    mutate(f);
    tickVehicleSeats(f.ctx);
    assert.equal(f.rider.vehicleSeat, undefined);
    assert.notEqual(f.rider.mode, 33);
  }
  const f = fixture();
  f.driver.mode = 5;
  f.board();
  assert.equal(f.rider.mode, 33);
  releaseVehicleSeats(f.rider, f.ctx);
  assert.equal(f.rider.mode, 0);
  releaseVehicleSeats(f.rider, f.ctx);
});

test('desembarque sem saída lateral procura spawn livre com os bloqueios atuais', () => {
  const f = fixture();
  f.board();
  f.ctx.colliders = [
    { x: 0, z: 100, w: 20, d: 20 },
    { x: -8, z: 28, w: 1, d: 1 },
  ];
  releaseVehicleSeats(f.rider, f.ctx);
  assert.equal(f.rider.mode, 0);
  assert.equal(f.rider.vehicle, 0);
  assert.equal(f.rider.vehicleSeat, undefined);
  assert.equal(canOccupyPlayer(f.rider, f.ctx), true);
  assert.notDeepEqual([f.rider.x, f.rider.z], [-8, 28]);
});
