import { constants, VEHICLE_TUNING, canTraversePlayer } from './simulation.js';

function maximumSpeed(player) {
  if (!player.mode) return constants.RUN_SPEED;
  if (player.mode === 4) return 7;
  const tuning = VEHICLE_TUNING[player.race ? 1 : player.mode] ?? VEHICLE_TUNING[1];
  return Math.max(tuning.forward, tuning.reverse, [9, 10, 11].includes(player.mode) ? 8.5 : 0);
}

/** Orçamento compartilhado pela previsão e pela simulação, nunca por pacote. */
export function createMovementValidator() {
  const budgets = new WeakMap();
  const refill = (player, now) => {
    let budget = budgets.get(player);
    if (!budget) {
      budget = { at: now, credit: 0.2 };
      budgets.set(player, budget);
    }
    const rate = maximumSpeed(player) * 1.35;
    budget.credit = Math.min(
      rate * 0.35 + 0.2,
      budget.credit + (Math.max(0, now - budget.at) / 1000) * rate,
    );
    budget.at = Math.max(budget.at, now);
    return budget;
  };
  return {
    start(player, previous, now = Date.now()) {
      if (previous && budgets.has(previous)) budgets.set(player, budgets.get(previous));
      refill(player, now);
    },
    spend(player, distance, now = Date.now()) {
      const budget = refill(player, now);
      budget.credit = Math.max(0, budget.credit - distance);
    },
    accept(player, pose, ctx, now = Date.now()) {
      const budget = refill(player, now);
      if (![pose.x, pose.z, pose.yaw, pose.speed].every(Number.isFinite)) return false;
      const b = constants.BOUNDS;
      if (
        pose.x < b.minX ||
        pose.x > b.maxX ||
        pose.z < b.minZ ||
        pose.z > b.maxZ ||
        Math.abs(pose.speed) > maximumSpeed(player) * 1.35
      )
        return false;
      const distance = Math.hypot(pose.x - player.x, pose.z - player.z);
      if (distance > budget.credit + 1e-6) return false;
      const next = {
        ...player,
        x: pose.x,
        z: pose.z,
        yaw: Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw)),
        speed: pose.speed,
      };
      if (Number.isFinite(pose.trailer) && pose.trailer !== 99)
        next.trailer = Math.atan2(Math.sin(pose.trailer), Math.cos(pose.trailer));
      if (!canTraversePlayer(player, next, ctx)) return false;
      budget.credit = Math.max(0, budget.credit - distance);
      Object.assign(player, { x: next.x, z: next.z, yaw: next.yaw, speed: next.speed });
      if (next.trailer !== undefined) player.trailer = next.trailer;
      return true;
    },
  };
}
