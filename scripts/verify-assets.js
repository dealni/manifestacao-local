import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(
  await fs.readFile(path.join(root, 'analysis/inventario-original.json'), 'utf8'),
);
let count = 0;
const errors = [];
for (const [url, item] of Object.entries(inventory)) {
  if (!url.startsWith('/assets/') && url !== '/og.png') continue;
  try {
    const bytes = await fs.readFile(path.join(root, 'public', item.local));
    if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) errors.push(url);
    count++;
  } catch {
    errors.push(url);
  }
}
console.log(`${count} assets da base incorporada conferidos; ${errors.length} divergências.`);
const brasilia = JSON.parse(
  await fs.readFile(path.join(root, 'data/brasilia-model-assets.json'), 'utf8'),
);
let modelCount = 0;
for (const item of brasilia.files) {
  const filename = path.resolve(root, 'public', item.path.slice(1));
  if (
    !item.path.startsWith('/assets/brasilia/') ||
    !filename.startsWith(path.join(root, 'public', 'assets', 'brasilia') + path.sep)
  ) {
    errors.push(item.path);
    continue;
  }
  try {
    const bytes = await fs.readFile(filename);
    if (
      bytes.length !== item.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== item.sha256
    )
      errors.push(item.path);
    modelCount++;
  } catch {
    errors.push(item.path);
  }
}
console.log(
  `${modelCount} arquivos novos de Brasília conferidos; ${errors.length} divergências no total.`,
);
if (errors.length) {
  console.error(errors);
  process.exitCode = 1;
}
