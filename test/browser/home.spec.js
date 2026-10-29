import { test, expect } from '@playwright/test';

test('início mostra time e prévia antes da entrada e mantém personalização acessível', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const launch = page.locator('.entry-launch');
  const join = page.locator('#join');
  await expect(join).toBeEnabled();
  // A roda precisa rolar a página; scrollIntoView sozinho mascara overflow bloqueado.
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => page.locator('#welcome').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);

  await expect(page.locator('#welcome h1')).toHaveCount(1);
  await expect(launch.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    await page
      .locator('#welcome')
      .evaluate((el) => [...el.children].map((child) => child.className)),
  ).toEqual(['team-selector', 'avatar-stage', 'entry-launch', 'entry-card']);
  await join.scrollIntoViewIfNeeded();
  const box = await join.boundingBox();

  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator('#nickname').evaluate((el) => el.form.id)).toBe('join-form');
  expect(await join.evaluate((el) => el.form.id)).toBe('join-form');
  await page.locator('#nickname').focus();
  await page.keyboard.press('Tab');
  await expect(join).toBeFocused();
  await page.locator('input[name="team"]').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[name="team"]').nth(1)).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Homem', exact: true })).toHaveCount(1);
  expect(await page.locator('html').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // A conta continua opcional e acessível após o caminho de entrada.
  const account = launch.locator('.account-box');
  await account.getByRole('button', { name: 'Entrar na sua conta', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(
    account.getByRole('button', { name: 'Entrar na sua conta', exact: true }),
  ).toBeFocused();
});
