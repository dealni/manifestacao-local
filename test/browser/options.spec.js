import { test, expect } from '@playwright/test';

test('menus expõem som, atividades e mapa sem perder controles ao atualizar', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await page.goto('/');
  await expect(page.locator('#join')).toBeEnabled();
  await page.locator('#nickname').fill('OpcoesQA');
  await page.locator('#join').click();
  await expect(page.locator('body')).toHaveClass(/playing/);
  const mobileMenu = () => page.locator('[data-mobile="menu"]');
  const openActivities = async () => {
    if (isMobile) {
      await mobileMenu().click();
      await page.locator('[data-mobile-action="activities"]').click();
    } else {
      await page.locator('#desktop-activities-shortcut').click();
    }
    await expect(page.locator('#graphics-options .game-activities')).toBeVisible();
  };
  if (isMobile) {
    await page.locator('[data-mobile="actions"]').click();
    await page.locator('#mobile-menu').getByRole('button', { name: 'Som', exact: true }).click();
  } else {
    await page.locator('#desktop-actions-toggle').click();
    await page.locator('#desktop-sound-shortcut').click();
  }
  const sound = page.locator('.som-panel');
  await expect(sound).toBeVisible();
  await sound.locator('[data-som-item="caixa"]').click();
  await expect(sound.locator('.som-tracks button')).toHaveCount(9);
  await sound.locator('.som-equipment summary').click();
  const next = sound.locator('[data-som="next"]');
  const selectedBefore = await sound
    .locator('.som-tracks button.on')
    .evaluateAll((buttons) => buttons[0]?.dataset.somTrack ?? null);
  await next.click();
  await expect
    .poll(() =>
      sound
        .locator('.som-tracks button.on')
        .evaluateAll((buttons) => buttons[0]?.dataset.somTrack ?? null),
    )
    .not.toBe(selectedBefore);
  await expect(sound.locator('.som-tracks button.on')).toHaveCount(1);
  await expect(sound.locator('.som-equipment')).toHaveAttribute('open', '');
  await expect(next).toBeFocused();
  await sound.locator('.som-close').click();
  await openActivities();
  await page.locator('.game-activities .race-button').click();
  await expect(page.locator('.race-panel')).toBeVisible();
  await expect(page.locator('.race-panel')).toContainText('Ranking');
  await page.keyboard.press('Escape');
  await openActivities();
  await page.locator('.game-activities .mission-button').click();
  await expect(page.locator('.mission-panel')).toBeVisible();
  await page.keyboard.press('Escape');

  // O contexto desktop também exercita a troca de layout com o mapa aberto.
  if (!isMobile) await page.setViewportSize({ width: 390, height: 844 });
  await mobileMenu().click();
  await page.locator('[data-mobile-action="map"]').click();
  await expect(page.locator('#mobile-menu #minimap')).toBeVisible();
  await expect(page.locator('#minimap')).toHaveCount(1);
  if (isMobile) {
    for (const viewport of [
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      // O handler usa a caixa inteira: margens de object-fit deslocariam o clique.
      const geometry = await page.locator('#minimap').evaluate((canvas) => {
        const box = canvas.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          ratio: canvas.width / canvas.height,
        };
      });
      expect(geometry.width).toBeGreaterThan(0);
      expect(geometry.height).toBeGreaterThan(0);
      expect(geometry.width / geometry.height).toBeCloseTo(geometry.ratio, 2);
      expect(geometry.height).toBeLessThanOrEqual(Math.max(120, viewport.height - 180) + 1);
    }
  }
  if (!isMobile) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('#mobile-menu')).not.toBeVisible();
    await expect(page.locator('#hud .map-panel #minimap')).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await mobileMenu().click();
    await page.locator('[data-mobile-action="map"]').click();
  }
  await page.locator('#mobile-menu .mobile-sheet-close').click();
  await expect(page.locator('#hud .map-panel #minimap')).toHaveCount(1);
  await expect(mobileMenu()).toHaveAttribute('aria-expanded', 'false');
  expect(errors).toEqual([]);
});
