import { prepareNearGroup, encodeNearFromGroup } from './protocol.js';
// Em salas grandes, detalhes são locais; a visão geral continua incluindo todos.
export const LARGE_ROOM_THRESHOLD = 128;
export const MAX_NEAR_ACTORS = 64;
const CELL = 80;

export function createInterestIndex(actors) {
  const cells = new Map(),
    selections = new Map(),
    candidateCells = new Map();
  for (const actor of actors) {
    if (actor.spectator) continue;
    const key = `${Math.floor(actor.x / CELL)},${Math.floor(actor.z / CELL)}`;
    const bucket = cells.get(key) ?? [];
    bucket.push(actor);
    cells.set(key, bucket);
  }
  function select(viewer) {
    const x = Math.floor(viewer.x / CELL),
      z = Math.floor(viewer.z / CELL);
    const cellKey = `${x},${z}`;
    // Reutiliza candidatos por célula, mas a prioridade depende da posição real.
    const key = `${viewer.x},${viewer.z}`;
    let selected = selections.get(key);
    if (!selected) {
      let candidates = candidateCells.get(cellKey);
      if (!candidates) {
        candidates = [];
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++)
            candidates.push(...(cells.get(`${x + dx},${z + dz}`) ?? []));
        candidateCells.set(cellKey, candidates);
      }
      // Heap limitado: examina todos os candidatos sem ordenar a multidão inteira.
      const heap = [];
      const compare = (a, b) => a.distance - b.distance || a.actor.id - b.actor.id;
      for (const actor of candidates) {
        const entry = {
          actor,
          distance: (actor.x - viewer.x) ** 2 + (actor.z - viewer.z) ** 2,
        };
        if (heap.length < MAX_NEAR_ACTORS) {
          let at = heap.length;
          heap.push(entry);
          while (at > 0) {
            const parent = (at - 1) >> 1;
            if (compare(heap[parent], entry) >= 0) break;
            heap[at] = heap[parent];
            at = parent;
          }
          heap[at] = entry;
        } else if (compare(entry, heap[0]) < 0) {
          let at = 0;
          while (at * 2 + 1 < heap.length) {
            let child = at * 2 + 1;
            if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) > 0) child++;
            if (compare(entry, heap[child]) >= 0) break;
            heap[at] = heap[child];
            at = child;
          }
          heap[at] = entry;
        }
      }
      selected = heap.sort(compare).map((entry) => entry.actor);
      selections.set(key, selected);
    }
    return selected;
  }
  const packets = new Map();
  return {
    near(viewer) {
      return [
        viewer,
        ...select(viewer)
          .filter((actor) => actor.id !== viewer.id)
          .slice(0, MAX_NEAR_ACTORS - 1),
      ];
    },
    packet(viewer, tick, ack) {
      const actors = select(viewer);
      let group = packets.get(actors);
      if (!group) {
        group = prepareNearGroup(actors, tick);
        packets.set(actors, group);
      }
      return encodeNearFromGroup(group, viewer, ack, MAX_NEAR_ACTORS);
    },
  };
}
