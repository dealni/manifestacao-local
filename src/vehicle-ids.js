// O snapshot v14 usa zero para ausência e 16 bits para id - 99999.
export const MIN_VEHICLE_ID = 100000;
export const MAX_VEHICLE_ID = 165534;

/** Reserva IDs enquanto existir uma sessão ativa ou retomável que ainda os use. */
export function createVehicleIdAllocator() {
  let next = MIN_VEHICLE_ID;
  return (sessions) => {
    const reserved = new Set(Array.from(sessions, (player) => player.vehicle));
    for (let attempts = 0; attempts <= MAX_VEHICLE_ID - MIN_VEHICLE_ID; attempts++) {
      const candidate = next;
      next = next === MAX_VEHICLE_ID ? MIN_VEHICLE_ID : next + 1;
      if (!reserved.has(candidate)) return candidate;
    }
    throw new Error('Não há identificadores de veículo disponíveis.');
  };
}
