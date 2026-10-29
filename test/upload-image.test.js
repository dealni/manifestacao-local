import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { sanitizeUpload } from '../src/upload-image.js';

test('novos uploads decodificam PNG JPEG WebP e republicam apenas pixels WebP', async () => {
  for (const format of ['png', 'jpeg', 'webp']) {
    const encoder = sharp({
      create: { width: 12, height: 9, channels: 3, background: 'blue' },
    });
    const image = await encoder[format]().withMetadata().toBuffer();
    const result = await sanitizeUpload(image);
    assert.equal(result.mime, 'image/webp');
    assert.equal(result.ext, 'webp');
    const metadata = await sharp(result.bytes).metadata();
    assert.equal(metadata.width, 12);
    assert.equal(metadata.height, 9);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    await sharp(result.bytes).raw().toBuffer();
  }
});
test('uploads rejeitam SVG HTML vídeo GIF e arquivos truncados', async () => {
  const valid = await sharp({
    create: { width: 12, height: 9, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  for (const bad of [
    Buffer.from('<svg width="1" height="1"/>'),
    Buffer.from('<script>alert(1)</script>'),
    Buffer.from('0000ftypmp42'),
    Buffer.from('GIF89a000000000000000000'),
    valid.subarray(0, 30),
    valid.subarray(0, valid.length - 15),
  ]) {
    await assert.rejects(sanitizeUpload(bad), (error) => error.status === 400);
  }
});
test('limites de arquivo e dimensão são aplicados antes da publicação', async () => {
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(20 * 1024 * 1024 + 1)])
    await assert.rejects(sanitizeUpload(bytes), (error) => error.status === 413);
  const huge = await sharp({
    create: { width: 4097, height: 1, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
  await assert.rejects(sanitizeUpload(huge), (error) => error.status === 400);
});

test('cabeçalho anuncia imagem gigante sem alocar pixels e é recusado', async () => {
  const bytes = await sharp({
    create: { width: 2, height: 2, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  bytes.writeUInt32BE(2147483647, 16);
  bytes.writeUInt32BE(2147483647, 20);
  await assert.rejects(sanitizeUpload(bytes), (error) => error.status === 400);
});
test('conteúdo anexado e metadados não sobrevivem à conversão', async () => {
  const original = await sharp({
    create: { width: 2, height: 2, channels: 3, background: 'blue' },
  })
    .jpeg()
    .withMetadata()
    .toBuffer();
  const marker = '<script>UNTRUSTED_UPLOAD_CONTENT</script>';
  const result = await sanitizeUpload(Buffer.concat([original, Buffer.from(marker)]));
  assert.equal(result.bytes.includes(Buffer.from(marker)), false);
  assert.equal((await sharp(result.bytes).metadata()).exif, undefined);
});

test('WebP com vários quadros é recusado antes de publicar o primeiro quadro', async () => {
  const pixels = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]);
  const animated = await sharp(pixels, {
    raw: { width: 2, height: 2, channels: 3, pageHeight: 1 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(sanitizeUpload(animated), (error) => error.status === 400);
});

test('apenas duas decodificações são admitidas e as vagas são liberadas', async () => {
  const bytes = await sharp({
    create: { width: 12, height: 9, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  const first = sanitizeUpload(bytes);
  const second = sanitizeUpload(bytes);
  await assert.rejects(sanitizeUpload(bytes), (error) => error.status === 429);
  await Promise.all([first, second]);
  await assert.rejects(sanitizeUpload(Buffer.from('invalid')), (error) => error.status === 400);
  assert.equal((await sanitizeUpload(bytes)).mime, 'image/webp');
});

test('saída preserva proporção e limita texturas sem ampliar imagens menores', async () => {
  const large = await sharp({
    create: { width: 4096, height: 2048, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
  const standard = await sanitizeUpload(large);
  const screen = await sanitizeUpload(large, { maxDimension: 1024 });
  const standardMeta = await sharp(standard.bytes).metadata();
  const screenMeta = await sharp(screen.bytes).metadata();
  assert.equal(standardMeta.width, 2048);
  assert.equal(standardMeta.height, 1024);
  assert.equal(screenMeta.width, 1024);
  assert.equal(screenMeta.height, 512);
  const portrait = await sharp({
    create: { width: 300, height: 600, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  const portraitMeta = await sharp((await sanitizeUpload(portrait)).bytes).metadata();
  assert.equal(portraitMeta.width, 300);
  assert.equal(portraitMeta.height, 600);
  for (const invalid of [0, 4096, 1.5, '1024'])
    await assert.rejects(sanitizeUpload(portrait, { maxDimension: invalid }), TypeError);
});
