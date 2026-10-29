import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../public/local.css', import.meta.url), 'utf8');

function declarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'g')),
    (match) => match[1],
  ).join('\n');
}

test('barra compacta mantém ações acessíveis por rolagem e conta antes das secundárias', () => {
  assert.match(css, /@media\s*\(max-width:\s*1200px\)/);
  const actions = declarations('body .topbar .top-actions');
  assert.match(actions, /min-width:\s*0\s*;/);
  assert.match(actions, /flex-shrink:\s*1\s*;/);
  assert.match(actions, /overflow-x:\s*auto\s*;/);
  assert.doesNotMatch(actions, /display:\s*none|overflow-x:\s*(hidden|clip)/);
  assert.match(declarations('body .topbar .brand'), /flex-shrink:\s*0\s*;/);
  assert.match(declarations('body .topbar .account-top'), /order:\s*-3\s*;/);
  assert.match(declarations('body .topbar .points-top'), /order:\s*-2\s*;/);
  assert.match(declarations('body .topbar #social-open'), /order:\s*-1\s*;/);
});

test('interface antiga de voz compartilhada não é distribuída', () => {
  for (const filename of ['local-voice.js', 'local-voice.css']) {
    assert.equal(fs.existsSync(new URL(`../public/${filename}`, import.meta.url)), false);
  }
});
