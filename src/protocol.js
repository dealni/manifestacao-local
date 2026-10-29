/** @typedef {import('../types/protocol.js').Actor} Actor */
/** @typedef {import('../types/protocol.js').Actors} Actors */
/** @typedef {import('../types/protocol.js').InputAck} InputAck */
/** @typedef {import('../types/protocol.js').InputMessage} InputMessage */
/** @typedef {import('../types/protocol.js').NearGroup} NearGroup */

/** Compatibilidade com o protocolo público v14 (client-readable.js:23355–23520,79318–79350).
 * Todos os inteiros multibyte usam little-endian; o header tem 11 bytes.
 */
export const PROTOCOL_VERSION = 14;
export const HEADER_BYTES = 11;
export const TYPES = Object.freeze({ NEAR: 1, OVERVIEW: 2, OVERVIEW_DELTA: 3, LOOKS: 5, INPUT: 7 });
const TAU = Math.PI * 2;
/** @param {number | undefined} v @param {number} [fallback] */
const finite = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** @param {number | undefined} v @param {number} scale @param {number} lo @param {number} hi */
const quantize = (v, scale, lo, hi) => clamp(Math.round(finite(v) * scale), lo, hi);
/** @param {Actors} players @returns {Actor[]} */
const list = (players) =>
  players instanceof Map ? [...players.values()] : Array.from(players ?? []);
/** @param {Actor} p */
const packedLook = (p) => ((p.character ?? 0) & 63) | (((p.team ?? 0) & 3) << 6);

// No cliente v14 este byte deixa de ser uma animação nos veículos especiais.
// gx(byte) restaura a articulação da carreta; _8(byte), a altura do dirigível.
/** @param {Actor} player */
function movementStateByte(player) {
  if (player.mode === 3) {
    const yaw = finite(player.yaw),
      trailer = finite(player.trailer, yaw);
    const turn = Math.atan2(Math.sin(yaw - trailer), Math.cos(yaw - trailer));
    return quantize(128 + (turn / Math.PI) * 127, 1, 1, 255);
  }
  if (player.mode === 4) return quantize(finite(player.alt, 27), 4, 0, 255);
  return (player.emote ?? 0) & 255;
}

/** @param {number} type @param {Actors} players @param {number} tick @param {number} stride @param {number} [self] @param {number} [tail] */
function packet(type, players, tick, stride, self = 0, tail = 0) {
  const actors = list(players);
  const maximum = type === TYPES.NEAR ? 1100 : 30000;
  if (actors.length > maximum) throw new RangeError(`Máximo de ${maximum} atores neste pacote`);
  const buffer = Buffer.alloc(HEADER_BYTES + actors.length * stride + tail);
  buffer.writeUInt8(type, 0);
  buffer.writeUInt32LE(tick >>> 0, 1);
  buffer.writeUInt16LE(actors.length, 5);
  buffer.writeUInt32LE(self >>> 0, 7);
  return { buffer, actors };
}

/** Snapshot completo de proximidade, registros de 16 bytes e ACK opcional de 8 bytes. */
/** @param {Actors} players @param {number} tick @param {number} [selfId] @param {InputAck} [ack] */
export function encodeNear(players, tick, selfId = 0, ack) {
  const { buffer, actors } = packet(TYPES.NEAR, players, tick, 16, selfId, ack ? 8 : 0);
  actors.forEach((p, index) => {
    const at = HEADER_BYTES + index * 16;
    buffer.writeUInt32LE(p.id >>> 0, at);
    buffer.writeInt16LE(quantize(p.x, 50, -32768, 32767), at + 4);
    buffer.writeInt16LE(quantize(p.z, 50, -32768, 32767), at + 6);
    const yaw = ((finite(p.yaw) % TAU) + TAU) % TAU;
    buffer.writeUInt16LE(Math.round((yaw / TAU) * 65536) & 65535, at + 8);
    buffer.writeInt16LE(quantize(p.speed, 100, -32768, 32767), at + 10);
    buffer.writeUInt8((p.mode ?? 0) & 255, at + 12);
    buffer.writeUInt8(movementStateByte(p), at + 13);
    // O cliente restaura o identificador de veículo somando 99999.
    const vehicle =
      typeof p.vehicle === 'number' && Number.isInteger(p.vehicle) && p.vehicle >= 100000
        ? clamp(p.vehicle - 99999, 1, 65535)
        : 0;
    buffer.writeUInt16LE(vehicle, at + 14);
  });
  if (ack) {
    const at = HEADER_BYTES + actors.length * 16;
    buffer.writeUInt32LE(ack.seq >>> 0, at);
    buffer.writeUInt32LE(ack.held >>> 0, at + 4);
  }
  return buffer;
}

/** Codifica vizinhos uma vez por região; cada destinatário só acrescenta seu ACK. */
/** @param {Actors} players @param {number} tick @returns {NearGroup} */
export function prepareNearGroup(players, tick) {
  const actors = list(players);
  return { buffer: encodeNear(actors, tick), indexes: new Map(actors.map((p, i) => [p.id, i])) };
}

/** @param {NearGroup} group @param {Actor} viewer @param {InputAck | undefined} ack @param {number} [maximum] */
export function encodeNearFromGroup(group, viewer, ack, maximum = 64) {
  const source = group.buffer,
    count = source.readUInt16LE(5);
  const own = group.indexes.get(viewer.id);
  const others = Math.min(count - (own === undefined ? 0 : 1), maximum - 1);
  const self = encodeNear([viewer], source.readUInt32LE(1), viewer.id, ack);
  const tail = ack ? 8 : 0,
    buffer = Buffer.alloc(HEADER_BYTES + (others + 1) * 16 + tail);
  self.copy(buffer, 0, 0, HEADER_BYTES + 16);
  buffer.writeUInt16LE(others + 1, 5);
  const ownIndex = own ?? count;
  const prefix = Math.min(ownIndex, others);
  source.copy(buffer, HEADER_BYTES + 16, HEADER_BYTES, HEADER_BYTES + prefix * 16);
  if (prefix < others)
    source.copy(
      buffer,
      HEADER_BYTES + (prefix + 1) * 16,
      HEADER_BYTES + (ownIndex + 1) * 16,
      HEADER_BYTES + (ownIndex + 1 + others - prefix) * 16,
    );
  if (ack) self.copy(buffer, HEADER_BYTES + (others + 1) * 16, HEADER_BYTES + 16);
  return buffer;
}

/** Aparência separada da posição, registros de 10 bytes. */
/** @param {Actors} players @param {number} tick */
export function encodeLooks(players, tick) {
  const { buffer, actors } = packet(TYPES.LOOKS, players, tick, 10);
  actors.forEach((p, index) => {
    const at = HEADER_BYTES + index * 10;
    buffer.writeUInt32LE(p.id >>> 0, at);
    buffer.writeUInt8(packedLook(p), at + 4);
    buffer.writeUInt8((p.shirt ?? 0) & 255, at + 5);
    buffer.writeUInt32LE((p.appearance ?? 1) >>> 0, at + 6);
  });
  return buffer;
}

/** Visão geral completa; o cliente limpa o baseline ao receber type=2. */
/** @param {Actors} players @param {number} tick */
export function encodeOverview(players, tick) {
  const { buffer, actors } = packet(TYPES.OVERVIEW, players, tick, 14);
  actors.forEach((p, index) => {
    const at = HEADER_BYTES + index * 14;
    const vx =
      typeof p.vx === 'number' && Number.isFinite(p.vx)
        ? p.vx
        : Math.sin(finite(p.yaw)) * finite(p.speed);
    const vz =
      typeof p.vz === 'number' && Number.isFinite(p.vz)
        ? p.vz
        : Math.cos(finite(p.yaw)) * finite(p.speed);
    buffer.writeUInt32LE(p.id >>> 0, at);
    buffer.writeInt16LE(quantize(p.x, 20, -32768, 32767), at + 4);
    buffer.writeInt16LE(quantize(p.z, 20, -32768, 32767), at + 6);
    buffer.writeInt8(quantize(vx, 10, -128, 127), at + 8);
    buffer.writeInt8(quantize(vz, 10, -128, 127), at + 9);
    buffer.writeUInt8(quantize(p.stop ?? 0.25, 10, 0, 255), at + 10);
    buffer.writeUInt8(packedLook(p), at + 11);
    buffer.writeUInt8((p.shirt ?? 0) & 255, at + 12);
    buffer.writeUInt8((p.mode ?? 0) & 255, at + 13);
  });
  return buffer;
}

/** Decodifica apenas os dois tamanhos efetivamente emitidos pelo cliente (10/29). */
/** @param {unknown} data @returns {InputMessage | null} */
export function decodeInput(data) {
  let b;
  if (data instanceof ArrayBuffer) b = Buffer.from(data);
  else if (ArrayBuffer.isView(data)) b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  else return null;
  if ((b.length !== 10 && b.length !== 29) || b[0] !== TYPES.INPUT || b[9] & ~3) return null;
  const x = clamp(b.readInt16LE(5) / 32767, -1, 1);
  const z = clamp(b.readInt16LE(7) / 32767, -1, 1);
  const run = Boolean(b[9] & 1);
  /** @type {InputMessage} */
  const result = {
    type: TYPES.INPUT,
    seq: b.readUInt32LE(1),
    x,
    z,
    dx: x,
    dz: z,
    run,
    sprint: run,
    vehicle: Boolean(b[9] & 2),
  };
  if (b.length === 29) {
    const px = b.readFloatLE(10),
      pz = b.readFloatLE(14);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) return null;
    const trailer = b.readInt16LE(22);
    result.pose = {
      x: px,
      z: pz,
      yaw: b.readInt16LE(18) / 10000,
      speed: b.readInt16LE(20) / 100,
      epoch: b[24],
      at: b.readUInt32LE(25),
    };
    if (trailer !== -32768) result.pose.trailer = trailer / 10000;
  }
  return result;
}
