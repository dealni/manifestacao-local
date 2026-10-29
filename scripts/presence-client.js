/** Remove cópias remotas sem perder a pose usada na reconexão. */
export function clearDisconnectedPlayers(net, interpolation, smoothing) {
  const own = net.actors.get(net.id);
  net.actors = new Map(own ? [[net.id, { ...own, speed: 0 }]] : []);
  net.overview.clear();
  net.far.reset();
  net.nearBase.clear();
  net.pendingNear = undefined;
  net.vehicles = [];
  net.seen.clear();
  net.roadsters.clear();
  interpolation?.clear();
  smoothing?.clear();
}

export function presenceControls(net, interpolation, smoothing) {
  const panel = document.createElement('section');
  panel.className = 'presence-warning';
  panel.hidden = true;
  panel.setAttribute('role', 'status');
  panel.style.cssText =
    'position:fixed;z-index:150;left:50%;bottom:88px;transform:translateX(-50%);width:min(360px,calc(100% - 32px));box-sizing:border-box;padding:16px;border-radius:14px;background:#172c25;color:#fff;box-shadow:0 4px 24px #0008;text-align:center';
  const text = document.createElement('p'),
    button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Continuar no jogo';
  button.style.cssText =
    'padding:10px 16px;border:0;border-radius:8px;background:#e4d488;color:#172c25;font:inherit;cursor:pointer';
  panel.append(text, button);
  document.body.append(panel);
  let last = -Infinity,
    expired = false;
  function active(force = false) {
    if (!net.connected || expired || document.visibilityState === 'hidden') return;
    const now = performance.now();
    if (!force && now - last < 15000) return;
    last = now;
    net.send({ t: 'active' });
  }
  button.onclick = () => (expired ? location.reload() : active(true));
  for (const name of ['pointerdown', 'keydown', 'wheel', 'input'])
    window.addEventListener(
      name,
      (event) => {
        if (event.isTrusted && !event.repeat) active();
      },
      { passive: true },
    );
  net.addEventListener('idle_warning', (event) => {
    if (expired) return;
    panel.hidden = !(event.detail.remaining > 0);
    text.textContent =
      'Você está sem interagir há 9 minutos. Continue no jogo para não sair por inatividade.';
  });
  net.addEventListener('connection', (event) => {
    if (event.detail.connected) return;
    clearDisconnectedPlayers(net, interpolation, smoothing);
    panel.hidden = true;
    if (event.detail.code === 1000 && /inatividade/i.test(event.detail.reason || '')) {
      expired = true;
      panel.hidden = false;
      text.textContent = 'Você saiu da sala após 10 minutos sem interação.';
      button.textContent = 'Voltar ao jogo';
    }
  });
  window.addEventListener('offline', () => clearDisconnectedPlayers(net, interpolation, smoothing));
  net.addEventListener('welcome', () => {
    expired = false;
    panel.hidden = true;
    last = -Infinity;
    button.textContent = 'Continuar no jogo';
  });
  net.addEventListener('leave', () => {
    panel.hidden = true;
  });
  return { active };
}

export function applyPresenceClient(source) {
  function patch(before, after) {
    if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before))
      throw new Error('Âncora de presença incompatível: ' + before.slice(0, 70));
    source = source.replace(before, after);
  }
  patch(
    'class rH extends EventTarget {',
    clearDisconnectedPlayers.toString() +
      '\n' +
      presenceControls.toString() +
      '\nclass rH extends EventTarget {',
  );
  patch(
    '((this.connected = !1), clearInterval(this.timer));',
    '((this.connected = !1), clearInterval(this.timer));\n        clearDisconnectedPlayers(this);',
  );
  patch(
    'Y.addEventListener("connection", () => Kn(!1));',
    'presenceControls(Y, Vf, iC);\nY.addEventListener("connection", () => Kn(!1));',
  );
  return source;
}
