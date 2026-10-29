import { pruneReports } from './reports.js';

import { publishTick } from './realtime-publish.js';
import { integratePlayers } from './realtime-integrate.js';
export function tick(r) {
  if (r.closed || r.storageStopped) return;
  if (!r.storageAvailable()) {
    r.stopForStorage();
    return;
  }
  let batchStarted = false;
  try {
    const now = Date.now(),
      dt = Math.min(0.15, (now - r.lastTick) / 1000);
    r.lastTick = now;
    r.ticks++;
    r.tickUsers = new Map((r.ctx.state.users ?? []).map((user) => [user.id, user]));
    r.ctx.beginSaveBatch?.();
    batchStarted = true;
    if (now - r.lastReportCleanup >= 60000) {
      pruneReports(r.ctx, now);
      r.lastReportCleanup = now;
    }
    r.ctx.revalidateSessions();
    if (!integratePlayers(r, now, dt)) return;
    publishTick(r, now, dt);
    r.ctx.endSaveBatch?.();
    batchStarted = false;
    r.counters.lastTickMs = Date.now() - now;
    r.tickDurations.push(r.counters.lastTickMs);
    if (r.tickDurations.length > 600) r.tickDurations.shift();
    r.counters.maxTickMs = Math.max(r.counters.maxTickMs, r.counters.lastTickMs);
    if (r.counters.lastTickMs > 50) r.counters.tickOverruns++;
  } catch (error) {
    r.ctx.log?.('realtime-tick', error);
    if (!r.storageAvailable()) r.stopForStorage();
  } finally {
    r.tickUsers = null;
    if (batchStarted) {
      try {
        r.ctx.endSaveBatch?.();
      } catch (error) {
        r.ctx.log?.('realtime-save-batch', error);
        if (!r.storageAvailable()) r.stopForStorage();
      }
    }
  }
}
