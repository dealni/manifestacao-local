/** Presença efêmera: pacotes automáticos não provam interação humana. */
export const IDLE_TIMEOUT = 10 * 60 * 1000;
export const IDLE_WARNING = 60 * 1000;
export const HEARTBEAT_INTERVAL = 10 * 1000;

export function isPresenceAction(msg) {
  if (!msg || typeof msg.t !== 'string') return false;
  if (msg.t === 'active') return true;
  if (msg.t === 'chat') return typeof msg.text === 'string' && !!msg.text.trim();
  if (msg.t === 'input') return false; // Movimento é validado no ponto de consumo.
  if (
    [
      'nick',
      'style',
      'spectate',
      'emote',
      'vehicle',
      'unstuck',
      'attack',
      'deck',
      'seat',
      'palanque_ir',
      'px_mark',
      'px',
      'glitter',
      'bakery',
      'chat_report',
      'report',
    ].includes(msg.t)
  )
    return true;
  if (msg.t === 'horn') return msg.on === true;
  if (msg.t === 'roadster')
    return (
      ['boost', 'jump'].includes(msg.a) ||
      (msg.a === 'roll' && Number.isFinite(msg.roll) && Math.abs(msg.roll) > 0.01)
    );
  if (msg.t === 'som') return ['play', 'stop', 'pause', 'volume'].includes(msg.a);
  if (msg.t === 'race') return ['join', 'leave'].includes(msg.action);
  return isSocialPresenceAction(msg);
}

function isSocialPresenceAction(msg) {
  if (msg.t === 'cm')
    return [
      'create',
      'request',
      'leave',
      'end',
      'topic',
      'accept',
      'reject',
      'kick',
      'timer',
      'pause',
      'resume',
    ].includes(msg.a ?? msg.action);
  if (msg.t === 'social')
    return [
      'dm',
      'request',
      'accept',
      'decline',
      'cancel',
      'remove',
      'block',
      'unblock',
      'voice_open',
      'voice_decline',
      'voice_invite',
      'voice_join',
      'voice_leave',
      'voice_kick',
    ].includes(msg.a);
  return false;
}

export function createPresence({ send, disconnect }) {
  const states = new WeakMap();
  function join(player, now = Date.now()) {
    states.set(player, { at: now, warned: false, expired: false });
  }
  function active(player, now = Date.now()) {
    const state = states.get(player);
    if (!state || state.expired) return;
    state.at = now;
    if (state.warned) {
      state.warned = false;
      send(player, { t: 'idle_warning', remaining: 0 });
    }
  }
  function tick(player, now = Date.now()) {
    const state = states.get(player);
    if (!state || state.expired) return;
    const remaining = IDLE_TIMEOUT - (now - state.at);
    if (remaining <= 0) {
      state.expired = true;
      disconnect(player, 1000, 'Você saiu por inatividade. Entre novamente para continuar.');
    } else if (remaining <= IDLE_WARNING && !state.warned) {
      state.warned = true;
      send(player, { t: 'idle_warning', remaining });
    }
  }
  return { join, active, tick };
}
