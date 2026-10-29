import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

async function expectInsideViewport(locator) {
  await expect(locator).toBeVisible();
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: element.ownerDocument.defaultView.innerWidth,
      height: element.ownerDocument.defaultView.innerHeight,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
}

test('matriz de entrada, teclado, visitante e preferências sem recorte de controles', async ({
  page,
  browserName,
}, testInfo) => {
  const visualDir = path.resolve('.artifacts/revisao-geral');
  await mkdir(visualDir, { recursive: true });
  const capture = (stage) =>
    page.screenshot({ path: path.join(visualDir, `visual-${testInfo.project.name}-${stage}.png`) });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Evita que a sugestão temporizada de instalação interrompa um fluxo de teclado.
  await page.addInitScript(() => {
    localStorage.setItem('paulista-install-depois-v1', String(Date.now() + 86_400_000));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const nickname = page.locator('#nickname');
  const join = page.locator('#join');
  await expect(join).toBeEnabled();
  await nickname.fill('MatrizQA');
  await nickname.focus();
  // Safari no macOS usa Option+Tab para incluir botões na navegação por teclado.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(join).toBeFocused();
  await expectInsideViewport(join);
  expect(await page.locator('html').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await capture('entrada');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveClass(/playing/);
  await expectInsideViewport(page.locator('#world'));
  await capture('jogo');

  // O modo do HUD segue o layout efetivo, inclusive tablet e paisagem.
  const mobileChat = page.locator('[data-mobile="chat"]');
  const mobile = await mobileChat.isVisible();
  await (mobile ? mobileChat : page.locator('#chat-toggle')).click();
  const chat = page.getByRole('textbox', { name: 'Sua mensagem', exact: true });
  await chat.fill('Mensagem da matriz local');
  await expectInsideViewport(chat);
  const send = page.getByRole('button', { name: 'Enviar mensagem', exact: true });
  await expectInsideViewport(send);
  await send.click();
  await expect(page.locator('#messages')).toContainText('Mensagem da matriz local');
  if (mobile) await mobileChat.click();
  else await page.locator('#chat-toggle').click();

  if (mobile) {
    await page.locator('[data-mobile="menu"]').click();
    await page.locator('[data-mobile-action="activities"]').click();
  } else {
    await page.locator('#options').click();
  }
  const options = page.locator('#graphics-options');
  await expectInsideViewport(options);
  await expect(options).toHaveAttribute('aria-labelledby', 'graphics-title');
  await capture('opcoes');
  const custom = options.locator('input[name="graphics-mode"][value="custom"]');
  await custom.check();
  const fps = options.locator('select[name="custom-maxFps"]');
  await fps.selectOption('30');
  await expect(fps).toHaveValue('30');
  const close = options.getByRole('button', { name: 'Fechar opções', exact: true });
  await close.scrollIntoViewIfNeeded();
  await expectInsideViewport(close);
  await close.focus();
  await page.keyboard.press('Escape');
  await expect(options).not.toBeVisible();

  // Preferências sobrevivem à recarga e não impedem uma nova entrada.
  await page.reload();
  await expect(join).toBeEnabled();
  await expect(nickname).toHaveValue('MatrizQA');
  await join.click();
  await expect(page.locator('body')).toHaveClass(/playing/);
  if (await mobileChat.isVisible()) {
    await page.locator('[data-mobile="menu"]').click();
    await page.locator('[data-mobile-action="activities"]').click();
  } else {
    await page.locator('#options').click();
  }
  await expect(custom).toBeChecked();
  await expect(fps).toHaveValue('30');
  await expectInsideViewport(options);
  expect(errors).toEqual([]);
});

test('clique único no centro de Iniciar partida envia o formulário e entra no jogo', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('paulista-install-depois-v1', String(Date.now() + 86_400_000));
  });
  await page.goto('/');
  await page.locator('#nickname').fill('CliqueCentro');
  const join = page.locator('#join');
  await expect(join).toBeEnabled();
  await join.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    globalThis.__entrySubmitCount = 0;
    globalThis.document.querySelector('#join-form').addEventListener('submit', () => {
      globalThis.__entrySubmitCount++;
    });
  });
  // O centro atinge o rótulo, atualizado a cada frame. Não usar Enter,
  // clique programático ou a borda: esses caminhos escondem a falha no WebKit.
  await join.click();
  await expect(page.locator('body')).toHaveClass(/playing/);
  expect(await page.evaluate(() => globalThis.__entrySubmitCount)).toBe(1);
});
