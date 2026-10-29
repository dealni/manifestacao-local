import { test, expect } from '@playwright/test';

async function prepareLocalPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === 'http://127.0.0.1:4179' ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('paulista-install-depois-v1', String(Date.now() + 86_400_000));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#join')).toBeEnabled();
  return errors;
}

async function expectDialogFits(dialog) {
  await expect(dialog).toBeVisible();
  const bounds = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: element.ownerDocument.defaultView.innerWidth,
      height: element.ownerDocument.defaultView.innerHeight,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.top).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
}

test('conta fictícia entra por código local, persiste e encerra a sessão pela interface', async ({
  page,
}, testInfo) => {
  const errors = await prepareLocalPage(page);
  await page
    .locator('.entry-launch')
    .getByRole('button', { name: 'Entrar na sua conta', exact: true })
    .click();
  await page.locator('dialog[open]').getByRole('link', { name: 'E-mail', exact: true }).click();
  let dialog = page.locator('dialog[open]');
  await expect(
    dialog.getByRole('heading', { name: 'Entrar com e-mail', exact: true }),
  ).toBeVisible();
  const email = `rodada2-${testInfo.project.name}-${Date.now()}@example.invalid`;
  await dialog.locator('input[type="email"]').fill(email);
  await dialog.getByRole('button', { name: 'Enviar código', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Digite o código', exact: true })).toBeVisible();
  const localStatus = dialog.getByRole('status');
  await expect(localStatus).toContainText(/Código local: \d{6}/);
  const code = (await localStatus.textContent()).match(/Código local: (\d{6})/)[1];
  await dialog.locator('input[autocomplete="one-time-code"]').fill(code);
  await expectDialogFits(dialog);
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
  const account = page.locator('.entry-launch .account-box');
  await expect(
    account.getByRole('button', { name: 'Abrir a sua conta', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    account.getByRole('button', { name: 'Abrir a sua conta', exact: true }),
  ).toBeVisible();
  await account.getByRole('button', { name: 'Abrir a sua conta', exact: true }).click();
  dialog = page.locator('dialog[open]');
  await expectDialogFits(dialog);
  await dialog.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(
    account.getByRole('button', { name: 'Entrar na sua conta', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    account.getByRole('button', { name: 'Entrar na sua conta', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('catálogo recupera busca vazia e seleciona personagem com diálogo adaptável', async ({
  page,
}) => {
  const errors = await prepareLocalPage(page);
  const open = page.getByRole('button', { name: 'Ver mais personagens na loja', exact: true });
  // Safari não transfere foco aos botões por clique: estabeleça o foco a ser restaurado.
  await open.focus();
  await expect(open).toBeFocused();
  await open.press('Enter');
  const shop = page.getByRole('dialog', { name: 'Loja de personagens', exact: true });
  await expectDialogFits(shop);
  const cards = shop.locator('.skin-card');
  await expect(cards.first()).toBeVisible();
  const search = shop.getByRole('searchbox', { name: 'Buscar personagem', exact: true });
  await search.fill('personagem-inexistente-rodada2');
  await expect(shop.locator('.skin-empty')).toContainText('Nenhum personagem encontrado');
  await expect(shop.locator('.skin-feature')).toBeHidden();
  await expect(shop.locator('[data-buy]')).toBeDisabled();
  await search.fill('');
  await expect(cards.first()).toBeVisible();
  await expect(shop.locator('.skin-feature')).toBeVisible();
  await cards.first().click();
  await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await expectDialogFits(shop);
    expect(await page.locator('html').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    const close = shop.getByRole('button', { name: 'Fechar loja', exact: true });
    await close.scrollIntoViewIfNeeded();
    await expect(close).toBeInViewport();
  }
  await page.keyboard.press('Escape');
  await expect(shop).toBeHidden();
  await expect(open).toBeFocused();
  expect(errors).toEqual([]);
});
