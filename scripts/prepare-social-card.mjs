import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = new URL('./assets/social-card.svg', import.meta.url);
const destination = new URL('../public/og.png', import.meta.url);
await sharp(await readFile(source))
  .png()
  .toFile(fileURLToPath(destination));
console.log('Card social próprio preparado a partir do SVG local.');
