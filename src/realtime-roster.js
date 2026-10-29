import { createInterestIndex, LARGE_ROOM_THRESHOLD } from './interest.js';
import { vehiclePassengers } from './vehicle-seats.js';
import { encodeNear, encodeLooks } from './protocol.js';
import { roadsterVehicle } from './roadster.js';

export function vehicles(r) {
  const passengers = vehiclePassengers(r.ctx);
  return [...r.players.values()]
    .filter((p) => p.vehicle && p.mode > 0 && p.mode < 32)
    .map((p) =>
      p.mode === 12
        ? roadsterVehicle(p)
        : {
            id: p.vehicle,
            kind: p.mode,
            owner: p.id,
            driver: p.id,
            passenger: passengers.get(p.vehicle) ?? 0,
            team: p.team,
            x: p.x,
            z: p.z,
            yaw: p.yaw,
            speed: p.speed,
            trailer: p.trailer ?? p.yaw,
          },
    );
}

export function stats(r) {
  const list = [...r.players.values()];
  return {
    t: 'stats',
    online: list.length,
    participants: list.filter((p) => !p.spectator).length,
    spectators: list.filter((p) => p.spectator).length,
    teams: [0, 1, 2].map((t) => list.filter((p) => !p.spectator && p.team === t).length),
    capacity: r.capacity,
    vehicles: r.vehicles(),
    activity: [0, 0, 0],
  };
}

export function person(r, p) {
  return {
    id: p.id,
    nick: p.nick,
    ...(p.skin ? { skin: p.skin } : {}),
    look: [(p.character & 63) | ((p.team & 3) << 6), p.shirt, p.appearance >>> 0],
    ...(p.design ? { design: p.design } : {}),
  };
}

export function identityPacket(r, actors, recipient) {
  const roster = { t: 'names', people: actors.map(r.person) };
  const looks = encodeLooks(actors, Date.now() >>> 0);
  if (recipient) {
    r.sendPlayer(recipient, roster);
    r.sendPlayer(recipient, looks);
  } else {
    r.broadcast(roster);
    r.broadcast(looks);
  }
}

export function names(r, changed, newcomer = false) {
  if (r.players.size <= LARGE_ROOM_THRESHOLD) r.identityPacket([...r.players.values()]);
  else {
    if (newcomer) r.identityPacket([...r.players.values()], changed);
    if (changed) r.pendingNames.set(changed.id, changed);
  }
}

export function snapshot(r, p, now = Date.now(), index) {
  const ack = {
    seq: p.inputSeq || 0,
    held: Math.max(0, now - (p.inputAt || now)),
  };
  const packet =
    r.players.size > LARGE_ROOM_THRESHOLD
      ? (index ?? createInterestIndex(r.players.values())).packet(p, now >>> 0, ack)
      : encodeNear(
          [...r.players.values()].filter((actor) => !actor.spectator || actor.id === p.id),
          now >>> 0,
          p.id,
          ack,
        );
  r.counters.nearPackets++;
  r.counters.maxNearActors = Math.max(r.counters.maxNearActors, packet.readUInt16LE(5));
  r.sendPlayer(p, packet);
}
