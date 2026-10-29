/* global window, document, AudioContext, AudioDecoder */
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

let audienceBrowser;
let audiencePage;
const transportEvents = [];
test.afterEach(async ({ page }, testInfo) => {
  try {
    const audio = [];
    for (const client of [page, audiencePage]) {
      audio.push(
        await client
          ?.evaluate(() => {
            const qa = window.__listeningQA;
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
          .catch(() => null),
      );
    }
    const diagnosticPath = testInfo.outputPath('diagnostico-escuta.json');
    await writeFile(diagnosticPath, JSON.stringify({ audio, transportEvents }, null, 2));
    await testInfo.attach('diagnostico-escuta', {
      path: diagnosticPath,
      contentType: 'application/json',
    });
  } finally {
    await audienceBrowser?.close();
  }
});

test('plateia recebe voz de outro cliente e restaura a escuta após silenciar voz e som geral', async ({
  page: speaker,
  browser,
  isMobile,
}, testInfo) => {
  test.setTimeout(120_000);
  // Dois processos representam dois aparelhos: trocar a interface da plateia não
  // deve tirar o foco do orador, cujo encerramento por blur continua ativo.
  audienceBrowser = await browser.browserType().launch(testInfo.project.use.launchOptions);
  const listener = await audienceBrowser.newPage({
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport,
    userAgent: testInfo.project.use.userAgent,
    deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
    hasTouch: testInfo.project.use.hasTouch,
    isMobile,
  });
  audiencePage = listener;
  const errors = [];
  const peers = [];
  for (const [page, nickname] of [
    [listener, 'PlateiaQA'],
    [speaker, 'OradorQA'],
  ]) {
    const peer = { page, server: null, frames: 0, commands: [] };
    peers.push(peer);
    page.on('websocket', (socket) => {
      socket.on('close', () =>
        transportEvents.push({ client: nickname, type: 'close', at: Date.now() }),
      );
      socket.on('socketerror', (error) =>
        transportEvents.push({ client: nickname, type: 'socketerror', error, at: Date.now() }),
      );
    });
    page.on('pageerror', (error) => errors.push(`${nickname}: ${error.message}`));
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
      window.__listeningQA = { captures: 0, decoded: 0, energy: 0 };
      window.__listeningQA.events = [];
      for (const type of ['blur', 'focus', 'pagehide', 'visibilitychange']) {
        const target = type === 'visibilitychange' ? document : window;
        target.addEventListener(type, () =>
          window.__listeningQA.events.push({
            type,
            at: performance.now(),
            visibility: document.visibilityState,
            focused: document.hasFocus(),
          }),
        );
      }
      const mediaDevices = navigator.mediaDevices;
      const fakeGetUserMedia = async () => {
        window.__listeningQA.captures++;
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const destination = audio.createMediaStreamDestination();
        gain.gain.value = 0.08;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        await audio.resume();
        for (const track of destination.stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            stop();
            oscillator.stop();
            void audio.close();
          };
        }
        return destination.stream;
      };
      // Retém o wrapper e cobre instâncias recriadas pelo WebKit sem acesso físico.
      Object.defineProperty(Object.getPrototypeOf(mediaDevices), 'getUserMedia', {
        configurable: true,
        writable: true,
        value: fakeGetUserMedia,
      });
      Object.assign(window.__listeningQA, { mediaDevices, fakeGetUserMedia });
      window.AudioDecoder = new Proxy(AudioDecoder, {
        construct(Target, [config]) {
          return new Target({
            ...config,
            output(data) {
              const pcm = new Float32Array(data.numberOfFrames);
              data.copyTo(pcm, { planeIndex: 0, format: 'f32-planar' });
              for (const value of pcm) window.__listeningQA.energy += value * value;
              window.__listeningQA.decoded++;
              config.output(data);
            },
          });
        },
      });
    });
    await page.routeWebSocket('**/*', (socket) => {
      const upstream = socket.connectToServer();
      socket.onMessage((message) => {
        if (typeof message === 'string') peer.commands.push(JSON.parse(message));
        upstream.send(message);
      });
      upstream.onMessage((message) => {
        if (typeof message === 'string' && JSON.parse(message).t === 'welcome')
          peer.server = upstream;
        if (typeof message !== 'string' && message[0] === 4) peer.frames++;
        socket.send(message);
      });
    });
    await page.goto('/');
    await page.locator('#nickname').fill(nickname);
    await expect(page.locator('#join')).toBeEnabled();
    await page.locator('#join').click();
    await expect.poll(() => !!peer.server).toBe(true);
    peer.server.send(JSON.stringify({ t: 'palanque_ir' }));
  }
  const [audience] = peers;
  const microphone = speaker.getByRole('button', { name: 'Microfone do palco', exact: true });
  await expect(microphone).toBeEnabled();
  for (const { page } of peers)
    expect(
      await page.evaluate(
        () => navigator.mediaDevices.getUserMedia === window.__listeningQA.fakeGetUserMedia,
      ),
    ).toBe(true);
  await microphone.click();
  await expect(speaker.locator('.palanque-onair')).toContainText('NO AR');
  await expect.poll(() => audience.frames).toBeGreaterThan(3);
  await expect.poll(() => listener.evaluate(() => window.__listeningQA.energy)).toBeGreaterThan(0);
  expect(await listener.evaluate(() => window.__listeningQA.captures)).toBe(0);

  if (isMobile) {
    await listener.locator('[data-mobile="actions"]').click();
    await listener
      .locator('#mobile-menu')
      .getByRole('button', { name: 'Som', exact: true })
      .click();
  } else {
    await listener.locator('#desktop-actions-toggle').click();
    await listener.locator('#desktop-sound-shortcut').click();
  }
  const mute = listener.locator('.som-panel .pal-mute');
  const volume = listener.locator('#som-palanque');
  const originalVolume = await volume.inputValue();
  async function checkListeningToggle(control, preservesVoice = false) {
    await expect(control).toBeVisible();
    expect(
      await control.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    await expect(control).toHaveAttribute('aria-pressed', 'false');
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await expect(listener.locator('.palanque-muted')).toHaveText('(voz dos palcos desligada)');
    await expect(listener.locator('.som-panel [role="status"]')).toContainText(
      preservesVoice ? 'Som geral desligado' : 'Escuta dos palcos desligada',
    );
    await expect.poll(() => audience.commands.filter((m) => m.t === 'voz').at(-1)?.on).toBe(false);
    if (preservesVoice) {
      await expect(mute).toHaveAttribute('aria-pressed', 'false');
      await expect(volume).toHaveValue(originalVolume);
    }
    // Aguarda quadros já em trânsito antes de verificar ausência de novas entregas.
    await listener.waitForTimeout(300);
    const mutedFrames = audience.frames;
    await listener.waitForTimeout(400);
    expect(audience.frames).toBe(mutedFrames);
    await expect(microphone).toHaveAttribute('aria-pressed', 'true');

    const decodedBefore = await listener.evaluate(() => window.__listeningQA.decoded);
    const energyBefore = await listener.evaluate(() => window.__listeningQA.energy);
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'false');
    await expect(listener.locator('.palanque-muted')).toHaveCount(0);
    await expect.poll(() => audience.commands.filter((m) => m.t === 'voz').at(-1)?.on).toBe(true);
    await expect.poll(() => audience.frames).toBeGreaterThan(mutedFrames + 3);
    await expect
      .poll(() => listener.evaluate(() => window.__listeningQA.decoded))
      .toBeGreaterThan(decodedBefore);
    await expect
      .poll(() => listener.evaluate(() => window.__listeningQA.energy))
      .toBeGreaterThan(energyBefore);
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await expect(volume).toHaveValue(originalVolume);
    expect(await listener.evaluate(() => window.__listeningQA.captures)).toBe(0);
  }
  await checkListeningToggle(mute);
  await checkListeningToggle(listener.locator('.som-panel [data-som-global]'), true);
  await listener.screenshot({ path: testInfo.outputPath('painel-som.png') });
  await microphone.click();
  await expect(microphone).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});
