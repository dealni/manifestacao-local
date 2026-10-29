import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { once } from 'node:events';

function actor(packet, id) {
  if (typeof packet === 'string' || packet[0] !== 1) return null;
  const bytes = Buffer.from(packet);
  for (let i = 0; i < bytes.readUInt16LE(5); i++) {
    const at = 11 + i * 16;
    if (bytes.readUInt32LE(at) !== id) continue;
    return {
      x: bytes.readInt16LE(at + 4) / 50,
      z: bytes.readInt16LE(at + 6) / 50,
      mode: bytes[at + 12],
      vehicle: bytes.readUInt16LE(at + 14) + 99999,
    };
  }
  return null;
}

test('carona embarca pelo controle real, acompanha motorista e desembarca', async ({
  page,
  isMobile,
}) => {
  const errors = [];
  let id;
  let own;
  let driverPose;
  let driverId;
  let driver;
  let upstream;
  const sent = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('paulista-install-depois-v1', String(Date.now() + 86_400_000));
  });
  await page.routeWebSocket('**/*', (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      if (typeof message === 'string') sent.push(JSON.parse(message));
      server.send(message);
    });
    server.onMessage((message) => {
      if (typeof message === 'string' && JSON.parse(message).t === 'welcome') {
        id = JSON.parse(message).id;
        upstream = server;
      }
      own = actor(message, id) ?? own;
      driverPose = actor(message, driverId) ?? driverPose;
      socket.send(message);
    });
  });
  try {
    await page.goto('/');
    await page.locator('#nickname').fill('CaronaQA');
    await expect(page.locator('#join')).toBeEnabled();
    await page.locator('#join').click();
    await expect.poll(() => own?.mode).toBe(0);
    driver = new WebSocket('ws://127.0.0.1:4179/ws');
    let vehicle;
    driver.on('message', (data, binary) => {
      if (binary) return;
      const message = JSON.parse(data.toString());
      if (message.t === 'welcome') driverId = message.id;
      if (message.t === 'stats') vehicle = message.vehicles.find((v) => v.owner === driverId);
    });
    await once(driver, 'open');
    driver.send(
      JSON.stringify({
        t: 'join',
        nick: 'MotoristaQA',
        team: 1,
        resume: { x: own.x + 2, z: own.z, yaw: 0, mode: isMobile ? 5 : 1 },
      }),
    );
    await expect.poll(() => vehicle?.kind).toBe(isMobile ? 5 : 1);
    const enter = page.getByRole('button', { name: 'Carona (passageiro) (E)', exact: true });
    await expect(enter).toBeVisible();
    await expect(enter).toBeInViewport();
    if (isMobile) await enter.click();
    else await page.keyboard.press('e');
    await expect.poll(() => sent.some((m) => m.t === 'seat' && m.on === true)).toBe(true);
    await expect.poll(() => own?.mode).toBe(33);
    expect(own.vehicle).toBe(vehicle.id);
    const exit = page.getByRole('button', { name: /^(Sair do carro \(E\)|Sair da carona)$/ });
    await expect(exit).toBeVisible();
    const initial = { ...own };
    const accelerate = setInterval(() => {
      if (driver.readyState === WebSocket.OPEN)
        driver.send(JSON.stringify({ t: 'input', x: 0, z: 1 }));
    }, 100);
    try {
      await expect.poll(() => Math.hypot(own.x - initial.x, own.z - initial.z)).toBeGreaterThan(1);
      await expect
        .poll(() => Math.hypot(own.x - driverPose.x, own.z - driverPose.z))
        .toBeLessThan(3);
    } finally {
      clearInterval(accelerate);
      driver.send(JSON.stringify({ t: 'input', x: 0, z: 0 }));
    }
    await exit.click();
    await expect.poll(() => own?.mode).toBe(0);
    await expect(exit).toBeHidden();
    // Reconectar a carona por protocolo ainda exige proximidade e permite
    // conferir a limpeza automática quando o carro desaparece.
    upstream.send(JSON.stringify({ t: 'seat', on: true, id: vehicle.id }));
    await expect.poll(() => own?.mode).toBe(33);
    driver.close();
    await expect.poll(() => own?.mode).toBe(0);
    await expect(exit).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    driver?.terminate();
  }
});
