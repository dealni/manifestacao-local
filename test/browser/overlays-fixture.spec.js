import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { applyCleanSuperchat } from '../../scripts/hud-clean-superchat.js';

const css = [
  '../../public/assets/index-CyQa0fiC.css',
  '../../public/hud-clean-superchat.css',
  '../../public/hud-clean-overlays.css',
]
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n');
const source = applyCleanSuperchat(
  readFileSync(new URL('../../analysis/client-readable.js', import.meta.url), 'utf8'),
);
const start = source.indexOf('function oj(');
const preview = source.slice(start, source.indexOf('\n}', start) + 2);

test('histórico e cartão de superchat cabem em paisagem e permitem rolagem por teclado', async ({
  page,
}) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.setContent(`
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${css}</style>
    <body class="playing">
      <div class="sc-bar" style="--clean-notice-top:64px">
        <div class="sc-row"><button class="sc-chip">Histórico</button></div>
        <div class="sc-peek" hidden></div>
        <div class="sc-card">
          <div class="sc-card-head">Mensagem atual</div><p>Texto atual</p>
          <button class="sc-details">Ver mensagem completa</button>
        </div>
      </div>
    </body>`);
  await page.addScriptTag({
    content: `
      const ji = document.querySelector('.sc-peek');
      let $v = 0;
      const z0 = () => 1, Re = String;
      function T(tag, className, text) {
        const el = document.createElement(tag);
        el.className = className || '';
        el.textContent = text || '';
        return el;
      }
      const X6 = item => T('p', '', item.message);
      ${preview}
      oj({id:'history',cents:100,nick:'Pessoa',message:'Mensagem longa do histórico. '.repeat(14)});
    `,
  });
  const bar = page.locator('.sc-bar');
  const bounds = await bar.boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(308.5);
  const peek = page.getByLabel('Prévia do superchat');
  await peek.focus();
  await expect(peek).toBeFocused();
  await page.keyboard.press('End');
  await expect.poll(() => peek.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const details = page.getByRole('button', { name: 'Ver mensagem completa' });
  await details.focus();
  await expect(details).toBeInViewport();
  await expect(details).toBeFocused();
});
