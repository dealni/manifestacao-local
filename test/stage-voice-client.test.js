import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { stageMicrophoneSource, stageVoiceMayPlay } from '../scripts/stage-voice-client.js';

function setup({
  latePermission = false,
  lateWorklet = false,
  endedTrack = false,
  missingCapability,
  permissionError,
  unlockError,
  workletError,
} = {}) {
  const targets = {};
  const net = new EventTarget();
  net.connected = true;
  net.id = 5;
  net.messages = [];
  net.send = (m) => net.messages.push(m);
  net.sendBinary = (m) => net.messages.push(m);
  const voice = new EventTarget();
  voice.live = [];
  const elements = [];
  function element() {
    const e = {
      hidden: false,
      style: {},
      children: [],
      append(...children) {
        this.children.push(...children);
        for (const child of children) child.parentElement = this;
      },
      setAttribute() {},
    };
    elements.push(e);
    return e;
  }
  const document = new EventTarget();
  document.visibilityState = 'visible';
  document.createElement = element;
  document.querySelector = () => null;
  let calls = 0,
    stops = 0,
    resolvePermission,
    resolveWorklet;
  const endedCallbacks = [];
  const track = new EventTarget();
  track.readyState = endedTrack ? 'ended' : 'live';
  const listen = track.addEventListener.bind(track);
  track.addEventListener = (name, callback, options) => {
    if (name === 'ended') endedCallbacks.push(callback);
    listen(name, callback, options);
  };
  track.stop = () => {
    stops++;
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const mediaDevices = {
    getUserMedia: () => {
      calls++;
      if (permissionError) return Promise.reject(permissionError);
      return latePermission
        ? new Promise((resolve) => (resolvePermission = () => resolve(stream)))
        : Promise.resolve(stream);
    },
  };
  const node = () => ({
    connect() {
      return this;
    },
    disconnect() {},
    gain: { value: 1 },
    port: { postMessage() {}, close() {} },
  });
  const gains = [];
  const workers = [];
  const worklets = [];
  let workerConfig, workletOptions;
  const context = {
    sampleRate: 48000,
    audioWorklet: {
      addModule: () =>
        workletError
          ? Promise.reject(workletError)
          : lateWorklet
            ? new Promise((resolve) => (resolveWorklet = resolve))
            : Promise.resolve(),
    },
    createMediaStreamSource: node,
    createGain: () => {
      const gain = node();
      gains.push(gain);
      return gain;
    },
    createAnalyser: () => ({ ...node(), getFloatTimeDomainData: (values) => values.fill(0.1) }),
    destination: {},
  };
  let audible = true;
  const sound = {
    unlock: async () => {
      if (unlockError) throw unlockError;
    },
    audioContext: context,
    voiceWanted: () => audible,
  };
  const sandbox = {
    document,
    navigator: { mediaDevices },
    Ww: 32000,
    A2: 40,
    F4: 4,
    AudioEncoder: { isConfigSupported: async () => ({ supported: true }) },
    AudioWorkletNode: class {
      constructor(context, name, options) {
        workletOptions = options;
        const worklet = node();
        worklets.push(worklet);
        return worklet;
      }
    },
    Worker: class {
      constructor() {
        workers.push(this);
      }
      postMessage(message) {
        workerConfig = message.config;
      }
      terminate() {}
    },
    MessageChannel: class {
      port1 = {};
      port2 = {};
    },
    URL,
    Uint8Array,
    Float32Array,
    addEventListener: (name, cb) => (targets[name] = cb),
    ci: (path) => path,
  };
  const code = stageMicrophoneSource().replace(
    'import.meta.url',
    JSON.stringify('http://localhost/client.js'),
  );
  if (missingCapability === 'audioWorklet') delete context.audioWorklet;
  else if (missingCapability) delete sandbox[missingCapability];
  const factory = vm.runInNewContext(`${code}; stageMicrophone`, sandbox);
  const controller = factory({ net, sound, voice, dock: element(), hud: element() });
  const emit = (name, detail) => {
    const e = new Event(name);
    e.detail = detail;
    net.dispatchEvent(e);
  };
  const eligible = (stage = 0, truck) => emit('palanque_eu', { may: true, stage, truck });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  return {
    controller,
    eligible,
    emit,
    targets,
    document,
    elements,
    voice,
    sound,
    net,
    tick,
    mute() {
      audible = false;
      controller.update();
    },
    unmute() {
      audible = true;
      controller.update();
    },
    get calls() {
      return calls;
    },
    get stops() {
      return stops;
    },
    gains,
    workers,
    worklets,
    endedCallbacks,
    endTrack() {
      track.readyState = 'ended';
      track.dispatchEvent(new Event('ended'));
    },
    get workletOptions() {
      return workletOptions;
    },
    get config() {
      return workerConfig;
    },
    click() {
      return elements[2].onclick();
    },
    resolvePermission: () => resolvePermission?.(),
    resolveWorklet: () => resolveWorklet?.(),
  };
}

test('microfone e retorno permanecem no HUD fora das ações recolhidas e do dock móvel oculto', () => {
  const h = setup();
  h.eligible();
  const [dock, hud, microphone, panel, label, level, monitor] = h.elements;
  assert.equal(microphone.hidden, false);
  assert.equal(microphone.parentElement, panel);
  assert.equal(monitor.parentElement, panel);
  assert.equal(label.parentElement, panel);
  assert.equal(level.parentElement, panel);
  assert.equal(panel.parentElement, hud);
  assert.equal(dock.children.length, 0);
  dock.hidden = true;
  assert.equal(panel.hidden, false);
  assert.equal(microphone.hidden, false);
});

test('ouvintes nunca solicitam microfone; captação exige gesto e posição autorizada', async () => {
  const h = setup();
  h.controller.update();
  await h.tick();
  assert.equal(h.calls, 0);
  h.click();
  await h.tick();
  assert.equal(h.calls, 0);
  h.eligible();
  assert.equal(h.calls, 0);
  h.click();
  await h.tick();
  assert.equal(h.calls, 1);
  assert.equal(h.controller.stats().sending, true);
  assert.equal(h.config.opus.frameDuration, 40000);
  h.controller.stop();
  assert.equal(h.stops, 1);
});
test('voz desligada bloqueia abertura do microfone antes do próximo frame', async () => {
  const h = setup();
  h.mute();
  h.eligible();
  assert.equal(h.elements[2].disabled, true);
  assert.match(h.elements[4].textContent, /desligada.*menu Som/);
  h.click();
  await h.tick();
  assert.equal(h.calls, 0);
  assert.equal(h.controller.stats().sending, false);
  h.unmute();
  assert.equal(h.elements[2].disabled, false);
  assert.doesNotMatch(h.elements[4].textContent, /desligada/);
  h.click();
  await h.tick();
  assert.equal(h.calls, 1);
  h.controller.stop();
});
test('atalho T respeita atalhos do navegador, eventos tratados e editores herdados', async () => {
  const h = setup();
  h.eligible();
  let prevented = 0;
  for (const extra of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { defaultPrevented: true },
    { isComposing: true },
    { target: { isContentEditable: true } },
  ]) {
    h.targets.keydown({ key: 't', preventDefault: () => prevented++, ...extra });
    await h.tick();
    assert.equal(h.calls, 0);
  }
  assert.equal(prevented, 0);
  h.targets.keydown({ key: 'T', preventDefault: () => prevented++ });
  await h.tick();
  assert.equal(prevented, 1);
  assert.equal(h.calls, 1);
  assert.equal(h.controller.stats().sending, true);
  h.controller.stop();
});
test('permissão tardia libera tracks se jogador sair antes de aceitar', async () => {
  const h = setup({ latePermission: true });
  h.eligible();
  h.click();
  await h.tick();
  h.emit('palanque_eu', { may: false });
  h.resolvePermission();
  await h.tick();
  assert.equal(h.stops, 1);
  assert.equal(h.controller.stats().sending, false);
});
test('saída durante worklet, desconexão e aba oculta encerram captura', async () => {
  const h = setup({ lateWorklet: true });
  h.eligible();
  h.click();
  await h.tick();
  h.emit('connection', { connected: false });
  h.resolveWorklet();
  await h.tick();
  assert.ok(h.stops >= 1);
  assert.equal(h.controller.stats().sending, false);
  const h2 = setup();
  h2.eligible(3, 42);
  h2.click();
  await h2.tick();
  assert.equal(h2.controller.stats().sending, true);
  h2.document.visibilityState = 'hidden';
  h2.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h2.stops, 1);
});
test('microfone desconectado durante carregamento do worklet não inicia uma captura morta', async () => {
  const h = setup({ lateWorklet: true });
  h.eligible();
  h.click();
  await h.tick();
  h.endTrack();
  assert.equal(h.stops, 1);
  assert.match(h.elements[4].textContent, /microfone foi desconectado/);
  h.resolveWorklet();
  await h.tick();
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.workers.length, 0);
  assert.equal(h.elements[2].disabled, false);
});

test('recursos de áudio ausentes falham antes de solicitar acesso ao microfone', async () => {
  for (const missingCapability of [
    'AudioEncoder',
    'audioWorklet',
    'AudioWorkletNode',
    'Worker',
    'MessageChannel',
  ]) {
    const h = setup({ missingCapability });
    h.eligible();
    h.click();
    await h.tick();
    assert.equal(h.calls, 0, missingCapability);
    assert.equal(h.controller.stats().sending, false);
    assert.equal(h.elements[2].disabled, false);
    assert.match(h.elements[4].textContent, /navegador não oferece/);
  }
});

test('negação de permissão informa como liberar microfone e mantém nova tentativa disponível', async () => {
  const h = setup({
    permissionError: Object.assign(new Error('Denied'), { name: 'NotAllowedError' }),
  });
  h.eligible();
  h.click();
  await h.tick();
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.elements[2].disabled, false);
  assert.match(h.elements[4].textContent, /Permita o microfone no navegador/);
  assert.equal(h.workers.length, 0);
});

test('bloqueio de ativação de áudio não é atribuído à permissão do microfone', async () => {
  const h = setup({
    unlockError: Object.assign(new Error('Audio blocked'), { name: 'NotAllowedError' }),
  });
  h.eligible();
  h.click();
  await h.tick();
  assert.equal(h.calls, 0);
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.elements[2].disabled, false);
  assert.match(h.elements[4].textContent, /bloqueou a ativação do áudio/);
  assert.doesNotMatch(h.elements[4].textContent, /Permita o microfone/);
});

test('bloqueio do processador após permissão não pede para autorizar o microfone novamente', async () => {
  const h = setup({
    workletError: Object.assign(new Error('Module blocked'), { name: 'NotAllowedError' }),
  });
  h.eligible();
  h.click();
  await h.tick();
  assert.equal(h.calls, 1);
  assert.equal(h.controller.stats().sending, false);
  assert.ok(h.stops > 0);
  assert.match(h.elements[4].textContent, /bloqueou a preparação do áudio/);
  assert.doesNotMatch(h.elements[4].textContent, /Permita o microfone/);
});

test('autorização indisponível explica por que o controle está bloqueado', () => {
  for (const [flag, expected] of [
    ['muted', /bloqueado/],
    ['off', /indisponível/],
  ]) {
    const h = setup();
    h.emit('palanque_eu', { may: true, stage: 0, [flag]: true });
    assert.equal(h.elements[2].disabled, true);
    assert.match(h.elements[4].textContent, expected);
  }
});

test('palco distingue som geral desligado do silêncio temporário do debate', () => {
  for (const [state, expected] of [
    [{ enabled: false }, /som geral.*desligado/],
    [{ enabled: true, debateMuted: true }, /temporariamente.*debate/],
  ]) {
    const h = setup();
    h.eligible();
    h.mute();
    Object.assign(h.sound, state);
    h.controller.update();
    assert.equal(h.elements[2].disabled, true);
    assert.match(h.elements[4].textContent, expected);
  }
});

test('volume de escuta zero não impede nem descreve como bloqueado o envio de voz', async () => {
  const h = setup();
  h.sound.voiceVolume = 0;
  h.eligible();
  h.controller.update();
  assert.equal(h.elements[2].disabled, false);
  assert.match(h.elements[4].textContent, /Pressione T para falar/);
  h.click();
  await h.tick();
  assert.equal(h.controller.stats().sending, true);
  assert.equal(h.calls, 1);
  h.controller.stop();
});
test('track já encerrada na aquisição é descartada com aviso antes de criar o encoder', async () => {
  const h = setup({ endedTrack: true });
  h.eligible();
  h.click();
  await h.tick();
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.workers.length, 0);
  assert.match(h.elements[4].textContent, /microfone foi desconectado/);
});
test('trocar palco ou outro orador assumir fecha microfone', async () => {
  const h = setup();
  h.eligible();
  h.click();
  await h.tick();
  h.eligible(3, 9);
  assert.equal(h.stops, 1);
  h.click();
  await h.tick();
  h.voice.live = [{ id: 6, stage: 0 }];
  h.voice.dispatchEvent(new Event('change'));
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.stops, 2);
});
test('blur, pagehide, som desligado e saída encerram todas as tracks', async () => {
  for (const action of ['blur', 'pagehide', 'mute', 'leave']) {
    const h = setup();
    h.eligible();
    h.click();
    await h.tick();
    if (action === 'mute') {
      h.mute();
    } else if (action === 'leave') h.emit('leave', {});
    else h.targets[action]();
    assert.equal(h.controller.stats().sending, false);
    assert.equal(h.stops, 1);
  }
});

test('captura não tem saída de áudio e orador bloqueia reprodução até fechar microfone', async () => {
  const h = setup();
  let closed = 0;
  h.voice.closeAll = () => closed++;
  h.eligible();
  h.click();
  await h.tick();
  assert.equal(h.workletOptions.numberOfOutputs, 0);
  assert.equal(h.voice.transmitting, true);
  assert.equal(closed, 1);
  h.controller.stop();
  assert.equal(h.voice.transmitting, false);
});

test('retorno visual mede captura e só anuncia NO AR após confirmação do servidor', async () => {
  const h = setup();
  h.eligible();
  h.click();
  await h.tick();
  const label = h.elements[4],
    level = h.elements[5];
  assert.match(label.textContent, /aguardando transmissão/);
  assert.equal(level.hidden, false);
  h.controller.update();
  assert.ok(level.value > 0.45 && level.value < 0.55);
  h.voice.live = [{ id: 5, stage: 0 }];
  h.voice.dispatchEvent(new Event('change'));
  assert.match(label.textContent, /NO AR/);
  h.controller.stop();
  assert.equal(level.value, 0);
  assert.equal(level.hidden, true);
});

test('retorno exige servidor, fica desligado por padrão e não cria saída local do microfone', async () => {
  const h = setup();
  h.eligible();
  h.click();
  await h.tick();
  const hear = h.elements[6];
  assert.equal(h.gains.length, 0);
  assert.equal(h.voice.monitorSelf, false);
  assert.equal(hear.hidden, false);
  hear.onclick();
  assert.equal(h.voice.monitorSelf, false);
  assert.equal(h.net.messages.at(-1).t, 'palanque_monitor');
  assert.equal(h.net.messages.at(-1).on, true);
  h.emit('palanque_monitor', { on: true });
  assert.equal(h.voice.monitorSelf, true);
  hear.onclick();
  assert.equal(h.voice.monitorSelf, false);
  h.emit('palanque_monitor', { on: false });
  h.controller.stop();
  assert.equal(hear.hidden, true);
  h.emit('palanque_monitor', { on: true });
  assert.equal(h.voice.monitorSelf, false);
});

test('receptor só toca a própria voz com retorno explícito e impede mistura durante fala', () => {
  const receiver = { net: { id: 7 }, transmitting: false, monitorSelf: false };
  assert.equal(stageVoiceMayPlay(receiver, 7), false);
  assert.equal(stageVoiceMayPlay(receiver, 8), true);
  receiver.transmitting = true;
  assert.equal(stageVoiceMayPlay(receiver, 8), false);
  assert.equal(stageVoiceMayPlay(receiver, 7), false);
  receiver.monitorSelf = true;
  assert.equal(stageVoiceMayPlay(receiver, 7), true);
  assert.equal(stageVoiceMayPlay(receiver, 8), false);
});

test('palco informa explicitamente que T abre e fecha o microfone', () => {
  const h = setup();
  h.eligible();
  assert.match(h.elements[4].textContent, /Pressione T para falar/);
  assert.match(h.elements[2].title, /novamente para fechar/);
});

test('receptor real do cliente só encaminha retorno próprio após opt-in e continua ouvindo plateia normalmente', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const body = source
    .match(/class tY extends EventTarget \{[\s\S]*?\n}\nconst nY/)[0]
    .replace(/\nconst nY$/, '');
  const node = () => ({ className: '', hidden: true, setAttribute() {}, append() {} });
  const Receiver = vm.runInNewContext(`${body}; tY`, {
    EventTarget,
    Map,
    document: { createElement: node },
    addEventListener() {},
    stageVoiceMayPlay,
    Pn: [{}, {}, {}],
    F4: 4,
    DataView,
    Uint8Array,
  });
  const net = new EventTarget();
  net.id = 7;
  const receiver = new Receiver(
    net,
    { audioContext: { state: 'running' }, voiceWanted: () => true },
    node(),
  );
  let frames = 0;
  receiver.frame = () => frames++;
  const packet = new ArrayBuffer(12),
    view = new DataView(packet);
  view.setUint8(0, 4);
  view.setUint8(1, 1);
  view.setUint32(3, 7, true);
  view.setUint16(9, 1, true);
  receiver.transmitting = true;
  receiver.monitorSelf = false;
  receiver.receive(packet);
  assert.equal(frames, 0);
  receiver.monitorSelf = true;
  receiver.receive(packet);
  assert.equal(frames, 1);
  view.setUint32(3, 8, true);
  receiver.receive(packet);
  assert.equal(frames, 1);
  receiver.transmitting = false;
  receiver.receive(packet);
  assert.equal(frames, 2);
  view.setUint32(3, 7, true);
  receiver.receive(packet);
  assert.equal(frames, 2);
});

test('erros e término de tracks de uma captura anterior não fecham a sessão nova', async () => {
  const h = setup();
  h.eligible();
  h.click();
  await h.tick();
  const previousError = h.workers[0].onmessage;
  const previousEnded = h.endedCallbacks[0];
  h.controller.stop();
  h.click();
  await h.tick();
  previousError({ data: { error: 'encoder antigo' } });
  previousEnded();
  assert.equal(h.controller.stats().sending, true);
  h.workers[1].onmessage({ data: { error: 'encoder atual' } });
  assert.equal(h.controller.stats().sending, false);
});

test('falha de carregamento do worker fecha a captura e erro antigo não afeta nova sessão', async () => {
  const h = setup();
  h.eligible();
  h.click();
  await h.tick();
  const previousError = h.workers[0].onerror;
  previousError();
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.stops, 1);
  h.click();
  await h.tick();
  previousError();
  assert.equal(h.controller.stats().sending, true);
  h.workers[1].onerror();
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.stops, 2);
});

test('botão permite cancelar preparação sem teclado e descarta permissão tardia', async () => {
  const h = setup({ latePermission: true });
  h.eligible();
  h.click();
  await h.tick();
  assert.equal(h.elements[2].disabled, false);
  assert.match(h.elements[2].textContent, /Cancelar preparação/);
  h.click();
  h.resolvePermission();
  await h.tick();
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.stops, 1);
  assert.equal(h.workers.length, 0);
});

test('confirmação antiga do retorno não habilita escuta na captura seguinte', async () => {
  const h = setup();
  h.eligible();
  h.click();
  await h.tick();
  h.elements[6].onclick();
  h.controller.stop();
  h.click();
  await h.tick();
  h.emit('palanque_monitor', { on: true });
  assert.equal(h.voice.monitorSelf, false);
  h.elements[6].onclick();
  // A confirmação do desligamento anterior pode anteceder a confirmação atual.
  h.emit('palanque_monitor', { on: false });
  h.emit('palanque_monitor', { on: true });
  assert.equal(h.voice.monitorSelf, true);
  h.controller.stop();
});

test('falha do processador encerra captura e callback antigo respeita nova sessão', async () => {
  const h = setup();
  h.eligible();
  h.click();
  await h.tick();
  const previousError = h.worklets[0].onprocessorerror;
  previousError();
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.stops, 1);
  h.click();
  await h.tick();
  previousError();
  assert.equal(h.controller.stats().sending, true);
  h.worklets[1].onprocessorerror();
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.stops, 2);
});

test('receptor descarta decodificação atrasada após fechar fluxo e ao desligar voz', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const body = source
    .match(/class tY extends EventTarget \{[\s\S]*?\n}\nconst nY/)[0]
    .replace(/\nconst nY$/, '');
  const element = () => ({ setAttribute() {}, append() {} });
  const Receiver = vm.runInNewContext(`${body}; tY`, {
    EventTarget,
    Map,
    document: { createElement: element },
    addEventListener() {},
    stageVoiceMayPlay,
  });
  const net = new EventTarget();
  net.id = 7;
  let audible = true,
    played = 0;
  const receiver = new Receiver(net, { voiceWanted: () => audible }, element());
  const stream = { stage: 0, id: 8, due: new Map([[1, 1]]) };
  const context = {
    state: 'running',
    currentTime: 0,
    createBuffer: () => ({ copyToChannel() {} }),
    createBufferSource: () => ({ connect() {}, start: () => played++ }),
  };
  receiver.stages = [{ filter: {} }];
  receiver.streams.set(8, stream);
  receiver.play(context, stream, new Float32Array(10), 1);
  assert.equal(played, 1);
  stream.due.set(2, 1);
  receiver.streams.clear();
  receiver.play(context, stream, new Float32Array(10), 2);
  assert.equal(played, 1);
  receiver.streams.set(8, stream);
  audible = false;
  receiver.play(context, stream, new Float32Array(10), 2);
  assert.equal(played, 1);
});

// A fonte usada na geração deve carregar a classe e preservar callbacks destacados.
test('fonte serializada preserva stats e stop público sem depender de globais', async () => {
  const h = setup();
  h.eligible();
  assert.equal(h.controller.stats().sending, false);
  h.click();
  await h.tick();
  assert.equal(h.controller.stats().sending, true);
  const stop = h.controller.stop;
  stop();
  assert.equal(h.controller.stats().sending, false);
  assert.equal(h.stops, 1);
});
