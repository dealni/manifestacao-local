import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleIdAllocator, MIN_VEHICLE_ID, MAX_VEHICLE_ID } from '../src/vehicle-ids.js';
import { encodeNear } from '../src/protocol.js';

test('IDs de veículos voltam ao intervalo sem colidir com sessões retomáveis', () => {
  const allocate = createVehicleIdAllocator();
  const reserved = [{ vehicle: MIN_VEHICLE_ID }, { vehicle: MIN_VEHICLE_ID + 1 }];
  for (let id = MIN_VEHICLE_ID + 2; id <= MAX_VEHICLE_ID; id++)
    assert.equal(allocate(reserved), id);
  assert.equal(allocate(reserved), MIN_VEHICLE_ID + 2);
  const packet = encodeNear([{ id: 1, vehicle: MAX_VEHICLE_ID }], 1);
  assert.equal(packet.readUInt16LE(25) + 99999, MAX_VEHICLE_ID);
});

test('pool de veículos esgotado falha sem devolver ID duplicado', () => {
  const reserved = Array.from({ length: MAX_VEHICLE_ID - MIN_VEHICLE_ID + 1 }, (_, i) => ({
    vehicle: MIN_VEHICLE_ID + i,
  }));
  assert.throws(() => createVehicleIdAllocator()(reserved), /identificadores/);
});
