/* global window, HTMLMediaElement */
import { test, expect } from '@playwright/test';

test('música no perfil iPhone toca sem buscas corretivas contínuas no WebKit', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('paulista-install-depois-v1', String(Date.now() + 86_400_000));
    const state = { elements: [], seeks: [] };
    window.__musicQA = state;
    window.Audio = new Proxy(window.Audio, {
      construct(Target, args) {
        const element = new Target(...args);
        state.elements.push(element);
        return element;
      },
    });
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
      ...descriptor,
      set(value) {
        state.seeks.push({
          at: performance.now(),
          corrective: new Error().stack.includes('keepInStep'),
          delta: value - descriptor.get.call(this),
        });
        descriptor.set.call(this, value);
      },
    });
  });
  await page.goto('/');
  await page.locator('#nickname').fill('MusicaQA');
  await page.locator('#nickname').blur();
  await expect(page.locator('#join')).toBeEnabled();
  // Aciona o formulário real; este cenário mede a mídia, não a emulação do toque.
  await page.locator('#join').evaluate((button) => button.click());
  await expect(page.locator('body')).toHaveClass(/playing/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__musicQA.elements.some(
          (element) =>
            element.currentSrc.includes('.mp3') && element.readyState >= 3 && !element.paused,
        ),
      ),
    )
    .toBe(true);
  // Deixa a busca inicial concluir, depois mede quinze segundos de reprodução real.
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => ({
    at: performance.now(),
    audio: window.__musicQA.elements
      .filter((element) => element.currentSrc.includes('.mp3') && !element.paused)
      .map((element) => ({ src: element.currentSrc, time: element.currentTime })),
  }));
  await page.waitForTimeout(15_000);
  const after = await page.evaluate(() => ({
    at: performance.now(),
    audio: window.__musicQA.elements
      .filter((element) => element.currentSrc.includes('.mp3') && !element.paused)
      .map((element) => ({ src: element.currentSrc, time: element.currentTime })),
    seeks: window.__musicQA.seeks,
  }));
  expect(after.seeks.filter((seek) => seek.corrective && seek.at >= before.at)).toEqual([]);
  expect(
    after.audio.some((last) =>
      before.audio.some((first) => first.src === last.src && last.time - first.time > 10),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
