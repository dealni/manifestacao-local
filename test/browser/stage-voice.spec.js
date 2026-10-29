/* global window, document, AudioContext, AudioDecoder */
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const transportEvents = [];
test.afterEach(async ({ page }, testInfo) => {
  const audio = await page
    .evaluate(() => {
      const qa = window.__stageQA;
      return (
        qa && {
          captures: qa.captures,
          decoded: qa.decoded,
          energy: qa.energy,
          events: qa.events,
          visibility: document.visibilityState,
          focused: document.hasFocus(),
        }
      );
    })
    .catch(() => null);
  const diagnosticPath = testInfo.outputPath('diagnostico-voz.json');
  await writeFile(diagnosticPath, JSON.stringify({ audio, transportEvents }, null, 2));
  await testInfo.attach('diagnostico-voz', {
    path: diagnosticPath,
    contentType: 'application/json',
  });
});

test('palco captura sinal sintético, transmite Opus e reproduz retorno somente por opt-in', async ({
  page,
  isMobile,
}) => {
  const errors = [];
  page.on('websocket', (socket) => {
    socket.on('close', () => transportEvents.push({ type: 'close', at: Date.now() }));
    socket.on('socketerror', (error) =>
      transportEvents.push({ type: 'socketerror', error, at: Date.now() }),
    );
  });
  let server;
  let welcomed = false;
  let sentFrames = 0;
  let receivedFrames = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('paulista-install-depois-v1', String(Date.now() + 86_400_000));
    localStorage.setItem('paulista-graficos-v1', 'custom');
    localStorage.setItem('paulista-alcance-v1', 'near');
    localStorage.setItem(
      'paulista-graficos-custom-v1',
      JSON.stringify({
        resolution: 0.5,
        shadows: 0,
        people: 6,
        crowd3d: false,
        effects: 0.15,
        animation: 20,
        maxFps: 30,
      }),
    );
    const state = { captures: 0, decoded: 0, energy: 0, tracks: [] };
    window.__stageQA = state;
    window.__stageQA.events = [];
    for (const type of ['blur', 'focus', 'pagehide', 'visibilitychange']) {
      const target = type === 'visibilitychange' ? document : window;
      target.addEventListener(type, () =>
        window.__stageQA.events.push({
          type,
          at: performance.now(),
          visibility: document.visibilityState,
          focused: document.hasFocus(),
        }),
      );
    }
    // Sinal gerado localmente: exercita o pipeline real sem acessar microfone físico.
    const mediaDevices = navigator.mediaDevices;
    const fakeGetUserMedia = async () => {
      state.captures++;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      gain.gain.value = 0.08;
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      await context.resume();
      const tracks = destination.stream.getTracks();
      state.tracks.push(...tracks);
      for (const track of tracks) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          oscillator.stop();
          void context.close();
        };
      }
      return destination.stream;
    };
    // WebKit pode recriar o wrapper e perder propriedades da instância durante awaits.
    Object.defineProperty(Object.getPrototypeOf(mediaDevices), 'getUserMedia', {
      configurable: true,
      writable: true,
      value: fakeGetUserMedia,
    });
    Object.assign(state, { mediaDevices, fakeGetUserMedia });
    window.AudioDecoder = new Proxy(AudioDecoder, {
      construct(Target, [config]) {
        return new Target({
          ...config,
          output(data) {
            const pcm = new Float32Array(data.numberOfFrames);
            data.copyTo(pcm, { planeIndex: 0, format: 'f32-planar' });
            for (const value of pcm) state.energy += value * value;
            state.decoded++;
            config.output(data);
          },
        });
      },
    });
  });
  await page.routeWebSocket('**/*', (socket) => {
    const upstream = socket.connectToServer();
    socket.onMessage((message) => {
      if (typeof message !== 'string' && message[0] === 4) sentFrames++;
      upstream.send(message);
    });
    upstream.onMessage((message) => {
      if (typeof message === 'string' && JSON.parse(message).t === 'welcome') {
        welcomed = true;
        server = upstream;
      }
      if (typeof message !== 'string' && message[0] === 4) receivedFrames++;
      socket.send(message);
    });
  });
  await page.goto('/');
  await page.locator('#nickname').fill('PalcoQA');
  await expect(page.locator('#join')).toBeEnabled();
  await page.locator('#join').click();
  await expect(page.locator('body')).toHaveClass(/playing/);
  // Usa o comando canônico do mapa; posição e autorização vêm do servidor real.
  await expect.poll(() => welcomed).toBe(true);
  server.send(JSON.stringify({ t: 'palanque_ir' }));
  const microphone = page.getByRole('button', { name: 'Microfone do palco', exact: true });
  await expect(microphone).toBeVisible();
  await expect(microphone).toBeEnabled();
  if (isMobile) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(microphone).toBeInViewport();
      expect(
        await microphone.evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  expect(await page.evaluate(() => window.__stageQA.captures)).toBe(0);
  expect(
    await page.evaluate(
      () => navigator.mediaDevices.getUserMedia === window.__stageQA.fakeGetUserMedia,
    ),
  ).toBe(true);
  await microphone.click();
  await expect(microphone).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.palanque-onair')).toContainText('NO AR');
  await expect.poll(() => sentFrames).toBeGreaterThan(3);
  expect(receivedFrames).toBe(0);
  const monitor = page.getByRole('button', {
    name: /^(Ouvir minha voz · use fones|Desligar retorno da voz)$/,
  });
  await monitor.click();
  await expect(monitor).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => receivedFrames).toBeGreaterThan(3);
  await expect.poll(() => page.evaluate(() => window.__stageQA.decoded)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__stageQA.energy)).toBeGreaterThan(0);
  await microphone.click();
  await expect(microphone).toHaveAttribute('aria-pressed', 'false');
  await expect(monitor).toBeHidden();
  expect(
    await page.evaluate(() => window.__stageQA.tracks.every((t) => t.readyState === 'ended')),
  ).toBe(true);
  expect(errors).toEqual([]);
});
