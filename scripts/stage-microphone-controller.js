/* global document, Ww, A2, AudioEncoder, AudioWorkletNode, Worker, F4, ci, addEventListener */
// Serializada pelo gerador para o cliente: os símbolos acima pertencem ao runtime do jogo.
export class StageMicrophoneController {
  constructor(n) {
    const ctx = this;
    ctx.n = n;
    ctx.setMonitor = ctx.setMonitor.bind(ctx);
    ctx.eligible = ctx.eligible.bind(ctx);
    ctx.occupied = ctx.occupied.bind(ctx);
    ctx.unavailableReason = ctx.unavailableReason.bind(ctx);
    ctx.render = ctx.render.bind(ctx);
    ctx.stop = ctx.stop.bind(ctx);
    ctx.start = ctx.start.bind(ctx);
    ctx.toggle = ctx.toggle.bind(ctx);
    ctx.initializeView(n);
    ctx.bindEvents();
  }
  initializeView(n) {
    const ctx = this;
    ctx.net = n.net;
    ctx.sound = n.sound;
    ctx.voice = n.voice;
    ctx.permission = { may: false, stage: 0 };
    ctx.stream = undefined;
    ctx.source = undefined;
    ctx.node = undefined;
    ctx.meter = undefined;
    ctx.samples = undefined;
    ctx.worker = undefined;
    ctx.monitorPending = false;
    ctx.monitorRequested = false;
    ctx.pending = false;
    ctx.generation = 0;
    ctx.seq = 0;
    ctx.sending = false;
    ctx.message = '';
    ctx.button = document.createElement('button');
    ctx.button.title = 'Pressione T para falar; pressione novamente para fechar o microfone.';
    ctx.button.type = 'button';
    ctx.button.className = 'palanque-button';
    ctx.button.hidden = true;
    ctx.button.setAttribute('aria-label', 'Microfone do palco');
    ctx.button.setAttribute('aria-pressed', 'false');
    ctx.status = document.createElement('div');
    ctx.status.className = 'palanque-onair';
    ctx.status.hidden = true;
    ctx.status.setAttribute('role', 'status');
    ctx.n.hud.append(ctx.status);
    ctx.label = document.createElement('span');
    ctx.level = document.createElement('meter');
    ctx.level.min = 0;
    ctx.level.max = 1;
    ctx.level.value = 0;
    ctx.level.hidden = true;
    ctx.level.setAttribute('aria-label', 'Nível da sua voz');
    ctx.level.style.cssText =
      'width:96px;height:12px;margin-left:8px;vertical-align:middle;accent-color:#22c55e';
    ctx.status.append(ctx.button, ctx.label, ctx.level);
    ctx.hear = document.createElement('button');
    ctx.hear.type = 'button';
    ctx.hear.textContent = 'Ouvir minha voz · use fones';
    ctx.hear.hidden = true;
    ctx.hear.setAttribute('aria-pressed', 'false');
    ctx.hear.onclick = () => {
      if (!ctx.sending || ctx.monitorPending) return;
      const on = !ctx.voice.monitorSelf;
      ctx.monitorRequested = on;
      ctx.monitorPending = true;
      ctx.hear.disabled = true;
      if (!on) ctx.setMonitor(false);
      ctx.net.send({ t: 'palanque_monitor', on });
    };
    ctx.status.append(ctx.hear);
    ctx.net.addEventListener('palanque_monitor', (event) => {
      ctx.monitorPending = false;
      ctx.hear.disabled = false;
      const on = ctx.sending && ctx.monitorRequested && event.detail?.on === true;
      ctx.setMonitor(on);
    });
  }
  setMonitor(on) {
    const ctx = this;
    const changed = ctx.voice.monitorSelf !== on;
    ctx.voice.monitorSelf = on;
    if (changed || ctx.voice.transmitting) {
      ctx.voice.closeAll?.();
      for (const output of ctx.voice.stages || []) {
        const gain = output.gain.gain,
          context = ctx.sound.audioContext;
        gain.cancelScheduledValues(context.currentTime);
        gain.setValueAtTime(0, context.currentTime);
      }
    }
    ctx.hear.setAttribute('aria-pressed', String(on));
    ctx.hear.textContent = on ? 'Desligar retorno da voz' : 'Ouvir minha voz · use fones';
  }
  eligible() {
    const ctx = this;
    return (
      ctx.permission.may &&
      !ctx.permission.muted &&
      !ctx.permission.off &&
      ctx.sound.voiceWanted() &&
      ctx.net.connected &&
      document.visibilityState !== 'hidden'
    );
  }
  occupied() {
    const ctx = this;
    return ctx.voice.live.some((person) => person.id !== ctx.net.id);
  }
  unavailableReason() {
    const ctx = this;
    if (!ctx.permission.may) return '';
    if (ctx.permission.off) return 'A voz dos palcos está indisponível nesta sala.';
    if (ctx.permission.muted) return 'Seu microfone está bloqueado nesta sala.';
    if (ctx.sound.enabled === false)
      return 'O som geral está desligado. Ative o som geral no menu Som para falar.';
    if (ctx.sound.debateMuted) return 'O áudio está temporariamente silenciado durante o debate.';
    if (!ctx.sound.voiceWanted())
      return 'A voz dos palcos está desligada. Ative-a no menu Som para falar.';
    if (!ctx.net.connected) return 'Aguarde a conexão para falar no palco.';
    if (ctx.occupied()) return 'Outra pessoa está usando o microfone.';
    return '';
  }
  statusText() {
    const ctx = this;
    const confirmed = ctx.voice.live.some((person) => person.id === ctx.net.id);
    return (
      ctx.message ||
      (ctx.sending
        ? confirmed
          ? '● NO AR · transmitindo até 60 m · T fecha o microfone'
          : '🎤 Captando · aguardando transmissão · T fecha o microfone'
        : ctx.permission.may
          ? ctx.unavailableReason() ||
            'Pressione T para falar; pressione novamente para fechar o microfone.'
          : '')
    );
  }
  render() {
    const ctx = this;
    ctx.button.hidden = !ctx.permission.may;
    ctx.button.disabled = !ctx.sending && !ctx.pending && (!ctx.eligible() || ctx.occupied());
    const buttonText = ctx.pending
      ? 'Cancelar preparação do microfone · T'
      : ctx.sending
        ? '🎤 Fechar microfone · T'
        : ctx.occupied()
          ? '🎤 Microfone ocupado'
          : '🎤 Falar no palco · T';
    if (ctx.button.textContent !== buttonText) ctx.button.textContent = buttonText;
    ctx.button.setAttribute('aria-pressed', String(ctx.sending));
    ctx.status.hidden = !ctx.permission.may && !ctx.sending && !ctx.message;
    const text = ctx.statusText();
    if (ctx.label.textContent !== text) ctx.label.textContent = text;
    ctx.level.hidden = !ctx.sending;
    ctx.hear.hidden = !ctx.sending;
  }
  stop() {
    const ctx = this;
    ctx.generation++;
    ctx.sending = false;
    ctx.pending = false;
    ctx.node?.port.postMessage({ on: false });
    ctx.node?.disconnect();
    ctx.node?.port.close();
    ctx.source?.disconnect();
    ctx.meter?.disconnect();
    ctx.worker?.terminate();
    ctx.stream?.getTracks().forEach((track) => track.stop());
    ctx.stream = ctx.source = ctx.node = ctx.meter = ctx.samples = ctx.worker = undefined;
    ctx.level.value = 0;
    ctx.monitorPending = false;
    ctx.monitorRequested = false;
    ctx.hear.disabled = false;
    ctx.setMonitor(false);
    ctx.voice.transmitting = false;
    ctx.net.send({ t: 'palanque_monitor', on: false });
    ctx.net.send({ t: 'palanque_stop' });
    ctx.render();
  }
  async captureConfig(context) {
    if (!context || typeof AudioEncoder === 'undefined' || !navigator.mediaDevices?.getUserMedia)
      throw new Error('Este navegador não oferece envio de voz. Use Chrome ou Edge.');
    if (
      !context.audioWorklet?.addModule ||
      typeof AudioWorkletNode === 'undefined' ||
      typeof Worker === 'undefined' ||
      typeof MessageChannel === 'undefined'
    )
      throw new Error('Este navegador não oferece os recursos de áudio necessários para falar.');
    const config = {
      codec: 'opus',
      sampleRate: context.sampleRate,
      numberOfChannels: 1,
      bitrate: Ww,
      bitrateMode: 'variable',
      opus: {
        frameDuration: A2 * 1e3,
        application: 'voip',
        signal: 'voice',
        complexity: 6,
        usedtx: false,
      },
    };
    if (!(await AudioEncoder.isConfigSupported(config)).supported)
      throw new Error('Este navegador não oferece envio de voz.');
    return config;
  }
  watchTracks(epoch) {
    const ctx = this;
    const tracks = ctx.stream.getAudioTracks();
    if (!tracks.length || tracks.some((track) => track.readyState === 'ended'))
      throw new Error('O microfone foi desconectado. Tente novamente.');
    // A captura pode terminar enquanto o módulo de áudio ainda está carregando.
    tracks.forEach((track) =>
      track.addEventListener(
        'ended',
        () => {
          if (epoch === ctx.generation) {
            ctx.message = 'O microfone foi desconectado. Tente novamente.';
            ctx.stop();
          }
        },
        { once: true },
      ),
    );
  }
  connectCapture(context, config, epoch) {
    const ctx = this;
    ctx.source = context.createMediaStreamSource(ctx.stream);
    ctx.node = new AudioWorkletNode(context, 'palanque-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    ctx.node.onprocessorerror = () => {
      if (epoch !== ctx.generation) return;
      ctx.message = 'O microfone parou. Tente novamente.';
      ctx.stop();
    };
    ctx.source.connect(ctx.node);
    ctx.meter = context.createAnalyser();
    ctx.meter.fftSize = 256;
    ctx.samples = new Float32Array(ctx.meter.fftSize);
    ctx.source.connect(ctx.meter);
    ctx.worker = new Worker(new URL('/assets/palanque-encoder-CLsDnBbS.js', import.meta.url), {
      type: 'module',
    });
    ctx.worker.onerror = () => {
      if (epoch !== ctx.generation) return;
      ctx.message = 'O microfone parou. Tente novamente.';
      ctx.stop();
    };
    ctx.worker.onmessage = (event) => {
      if (epoch !== ctx.generation) return;
      if (event.data.error) {
        ctx.message = 'O microfone parou. Tente novamente.';
        ctx.stop();
        return;
      }
      if (!ctx.sending || epoch !== ctx.generation || !ctx.eligible() || !event.data.opus) return;
      const packet = new Uint8Array(3 + event.data.opus.byteLength);
      packet[0] = F4;
      packet[1] = ctx.seq & 255;
      packet[2] = (ctx.seq >> 8) & 255;
      ctx.seq = (ctx.seq + 1) & 65535;
      packet.set(new Uint8Array(event.data.opus), 3);
      ctx.net.sendBinary(packet);
    };
    const channel = new MessageChannel();
    ctx.node.port.postMessage({ port: channel.port1 }, [channel.port1]);
    ctx.worker.postMessage({ config, port: channel.port2 }, [channel.port2]);
  }
  current(epoch) {
    return epoch === this.generation && this.eligible() && !this.occupied();
  }
  captureError(error, preparation) {
    return error?.name === 'NotAllowedError'
      ? preparation === 'capture'
        ? 'Permita o microfone no navegador para falar.'
        : preparation === 'audio'
          ? 'O navegador bloqueou a ativação do áudio. Tente novamente pelo botão Falar no palco.'
          : 'O navegador bloqueou a preparação do áudio. Tente novamente.'
      : error?.message || 'Não foi possível abrir o microfone.';
  }
  async start() {
    const ctx = this;
    if (!ctx.eligible() || ctx.occupied() || ctx.pending || ctx.sending) return;
    const epoch = ++ctx.generation;
    ctx.pending = true;
    ctx.message = '';
    ctx.render();
    let acquired,
      preparation = 'audio';
    try {
      await ctx.sound.unlock();
      const context = ctx.sound.audioContext;
      preparation = 'support';
      const config = await ctx.captureConfig(context);
      if (!ctx.current(epoch)) return;
      preparation = 'capture';
      acquired = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      preparation = 'processor';
      if (!ctx.current(epoch)) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      ctx.stream = acquired;
      ctx.watchTracks(epoch);
      await context.audioWorklet.addModule(ci('palanque-capture.js'));
      if (!ctx.current(epoch)) {
        acquired.getTracks().forEach((track) => track.stop());
        if (epoch === ctx.generation) ctx.stop();
        return;
      }
      ctx.connectCapture(context, config, epoch);
      ctx.voice.transmitting = true;
      ctx.setMonitor(false);
      ctx.sending = true;
      ctx.node.port.postMessage({ on: true });
    } catch (error) {
      acquired?.getTracks().forEach((track) => track.stop());
      if (epoch === ctx.generation) {
        ctx.message = ctx.captureError(error, preparation);
        ctx.stop();
      }
    } finally {
      if (epoch === ctx.generation) {
        ctx.pending = false;
        ctx.render();
      }
    }
  }
  toggle() {
    const ctx = this;
    if (ctx.sending || ctx.pending) {
      ctx.message = '';
      ctx.stop();
    } else void ctx.start();
  }
  bindEvents() {
    const ctx = this;
    ctx.button.onclick = ctx.toggle;
    addEventListener('keydown', (event) => {
      if (
        ctx.permission.may &&
        !event.defaultPrevented &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat &&
        !event.isComposing &&
        event.key?.toLowerCase() === 't' &&
        !event.target?.isContentEditable &&
        !event.target?.matches?.('input,textarea,select,[contenteditable="true"]') &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault();
        ctx.toggle();
      }
    });
    addEventListener('blur', ctx.stop);
    addEventListener('pagehide', ctx.stop);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') ctx.stop();
    });
    ctx.net.addEventListener('connection', (event) => {
      if (!event.detail.connected) {
        ctx.permission = { may: false };
        ctx.message = '';
        ctx.stop();
      }
    });
    ctx.net.addEventListener('leave', () => {
      ctx.permission = { may: false };
      ctx.message = '';
      ctx.stop();
    });
    ctx.net.addEventListener('welcome', () => {
      ctx.permission = { may: false };
      ctx.message = '';
      ctx.stop();
    });
    ctx.net.addEventListener('palanque_eu', (event) => {
      const old = ctx.permission;
      ctx.permission = event.detail || { may: false };
      if (
        !ctx.eligible() ||
        old.stage !== ctx.permission.stage ||
        old.truck !== ctx.permission.truck
      )
        ctx.stop();
      ctx.render();
    });
    ctx.voice.addEventListener('change', () => {
      if (ctx.occupied() && (ctx.sending || ctx.pending)) {
        ctx.message = 'Outra pessoa está usando o microfone.';
        ctx.stop();
      }
      ctx.render();
    });
  }
  controller() {
    const ctx = this;
    return {
      get access() {
        return ctx.permission.access || 0;
      },
      get may() {
        return !!ctx.permission.may;
      },
      update() {
        if ((ctx.sending || ctx.pending) && !ctx.eligible()) ctx.stop();
        ctx.render();
        if (ctx.sending && ctx.meter) {
          ctx.meter.getFloatTimeDomainData(ctx.samples);
          let sum = 0;
          for (const sample of ctx.samples) sum += sample * sample;
          ctx.level.value = Math.min(1, Math.sqrt(sum / ctx.samples.length) * 5);
        }
      },
      stats: () => ({
        sending: ctx.sending,
        onAir: ctx.voice.live.some((person) => person.id === ctx.net.id),
      }),
      stop: ctx.stop,
    };
  }
}
