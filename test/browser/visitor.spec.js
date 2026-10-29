import { test, expect } from '@playwright/test';

test('visitante entra no mundo WebGL, conversa e retoma a sessão após queda', async ({
  page,
  isMobile,
}) => {
  const errors = [];
  const externalRequests = [];
  const welcomes = [];
  const messages = [];
  let activeSocket;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4179') {
      externalRequests.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });
  // Proxy the real backend unchanged; close both ends once to exercise recovery.
  await page.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url());
    if (url.origin !== 'ws://127.0.0.1:4179') {
      externalRequests.push(url.origin);
      void socket.close({ code: 1008, reason: 'QA exige loopback' });
      return;
    }
    const server = socket.connectToServer();
    activeSocket = { socket, server };
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const data = JSON.parse(message);
        if (data.t === 'welcome') welcomes.push(data);
        if (data.t === 'chat') messages.push(data);
      }
      socket.send(message);
    });
  });
  await page.goto('/');
  await page.locator('#nickname').fill(isMobile ? 'TesteMobile' : 'TesteDesktop');
  await expect(page.locator('#join')).toBeEnabled();
  await page.locator('#join').click();
  await expect(page.locator('body')).toHaveClass(/playing/);
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => welcomes.length).toBe(1);
  const original = welcomes[0];
  expect(original.id).toBeTruthy();
  expect(original.token).toBeTruthy();
  await expect
    .poll(() =>
      page.locator('#world').evaluate((canvas) => {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        return Boolean(
          gl &&
          !gl.isContextLost() &&
          gl.drawingBufferWidth > 0 &&
          gl.drawingBufferHeight > 0 &&
          gl.getParameter(gl.CURRENT_PROGRAM),
        );
      }),
    )
    .toBe(true);
  if (isMobile) {
    await expect(page.locator('body')).toHaveClass(/mobile-hud/);
    await page.locator('[data-mobile="chat"]').click();
  } else {
    await page.locator('#chat-toggle').click();
  }
  const chat = page.getByRole('textbox', { name: 'Sua mensagem', exact: true });
  await expect(chat).toBeVisible();
  await chat.fill('Olá avenida, teste de navegador');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.locator('#messages')).toContainText('Olá avenida, teste de navegador');
  await expect
    .poll(() => messages.some((message) => message.text === 'Olá avenida, teste de navegador'))
    .toBe(true);
  await activeSocket.server.close({ code: 1012, reason: 'Queda simulada para QA' });
  await activeSocket.socket.close({ code: 1012, reason: 'Queda simulada para QA' });
  await expect.poll(() => welcomes.length).toBe(2);
  expect(welcomes[1].id).toBe(original.id);
  expect(welcomes[1].token).toBe(original.token);
  await expect(page.locator('body')).toHaveClass(/playing/);
  await chat.fill('Voltei após reconectar');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.locator('#messages')).toContainText('Voltei após reconectar');
  await expect
    .poll(() => messages.some((message) => message.text === 'Voltei após reconectar'))
    .toBe(true);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
