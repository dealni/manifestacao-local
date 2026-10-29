import { test, expect } from '@playwright/test';

test('guardar objeto mantém contraste na entrada e no visual durante o jogo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#join')).toBeEnabled();
  const check = async (selector) => {
    const button = page.locator(selector);
    await button.scrollIntoViewIfNeeded();
    for (const team of ['', 'side-left', 'side-missao']) {
      await page.locator('body').evaluate((body, value) => {
        body.classList.remove('side-left', 'side-missao');
        if (value) body.classList.add(value);
      }, team);
      for (const hovered of [false, true]) {
        if (hovered) await button.hover();
        else await page.mouse.move(0, 0);
        const contrast = await button.evaluate((el) => {
          const luminance = (color) => {
            const channels = color
              .match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number);
            return channels
              .map((value) => {
                const c = color.startsWith('color(srgb') ? value : value / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              })
              .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
          };
          const style = el.ownerDocument.defaultView.getComputedStyle(el);
          const values = [luminance(style.color), luminance(style.backgroundColor)];
          return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
        });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
    }
  };
  await check('#entry-look .held-store');
  await page.locator('#nickname').fill('ContrasteQA');
  await page.locator('#join').click();
  await expect(page.locator('body')).toHaveClass(/playing/);
  const actions = page.locator('#desktop-actions-toggle');
  if (await actions.isVisible()) {
    await actions.click();
    await page.locator('[data-group="signs"]').click();
    await page.locator('[data-item="objetos"]').click();
  } else {
    await page.locator('[data-mobile="actions"]').click();
    await page
      .locator('#mobile-menu')
      .getByRole('button', { name: 'Objetos de mão', exact: true })
      .click();
  }
  await check('#live-look .held-store');
});
