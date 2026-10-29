import { test, expect } from '@playwright/test';

test('Missões mantém contraste e foco visível nas atividades, inclusive desabilitada', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#join')).toBeEnabled();
  await page.locator('#nickname').fill('MissoesQA');
  await page.locator('#join').click();
  await expect(page.locator('body')).toHaveClass(/playing/);
  // Exercita o mesmo diálogo nos dois layouts, sem depender da posição do atalho.
  await page.locator('#options').evaluate((button) => button.click());
  const mission = page.locator('#graphics-options .game-activities .mission-button');
  await mission.scrollIntoViewIfNeeded();
  await expect(mission).toBeVisible();
  for (const disabled of [false, true]) {
    await mission.evaluate((button, value) => {
      button.disabled = value;
    }, disabled);
    const appearance = await mission.evaluate((button) => {
      const luminance = (color) =>
        color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((value) => {
            const c = value / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const style = button.ownerDocument.defaultView.getComputedStyle(button);
      const values = [luminance(style.color), luminance(style.backgroundColor)];
      return {
        contrast: (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05),
        height: button.getBoundingClientRect().height,
        opacity: style.opacity,
      };
    });
    expect(appearance.contrast).toBeGreaterThanOrEqual(4.5);
    expect(appearance.height).toBeGreaterThanOrEqual(44);
    expect(appearance.opacity).toBe('1');
  }
  await mission.evaluate((button) => {
    button.disabled = false;
  });
  await page.keyboard.press('Tab');
  await mission.focus();
  await expect(mission).toBeFocused();
  expect(
    await mission.evaluate(
      (button) => button.ownerDocument.defaultView.getComputedStyle(button).outlineStyle,
    ),
  ).toBe('solid');
});
