import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

// Use production styles without starting the game or touching persisted data.
const styles = await Promise.all(
  ['assets/index-CyQa0fiC.css', 'local.css', 'design-entry.css'].map((file) =>
    readFile(new URL(`../../public/${file}`, import.meta.url), 'utf8'),
  ),
);
const fixture = `<main id="welcome">
  <section class="team-selector" aria-labelledby="team-title">
    <p class="eyebrow">PERSONALIZE SUA EXPERIÊNCIA</p><h2 id="team-title">Escolha seu time</h2>
    <fieldset class="sides"><legend>Escolha seu time</legend>${[
      'Bolsonaristas',
      'Petistas',
      'Missão',
    ]
      .map(
        (name, index) => `<label class="side side-${index}">
      <input type="radio" name="team" value="${index}" ${index === 0 ? 'checked' : ''}>
      <span class="side-mark" aria-hidden="true"></span><span class="side-name">${name}</span>
      <span class="side-count">— online</span></label>`,
      )
      .join('')}</fieldset>
  </section>
</main>`;

for (const viewport of [
  { width: 400, height: 300 },
  { width: 600, height: 320 },
]) {
  test(`times permanecem legíveis em paisagem estreita ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.setContent(`<style>${styles.join('\n')}</style>${fixture}`);
    for (const name of await page.locator('.side-name').all()) {
      const lines = await name.evaluate(
        (el) =>
          el.getBoundingClientRect().height /
          Number.parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).lineHeight),
      );
      expect(lines).toBeLessThanOrEqual(2.01);
    }
    await page.getByRole('radio').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio').nth(1)).toBeChecked();
    const card = page.locator('.side').nth(1);
    await expect(card).toBeInViewport();
    expect(await page.locator('#welcome').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
  });
}
