import sharp from 'sharp';

let processing = 0;
const invalid = (
  message = 'Imagem inválida. Envie PNG, JPEG ou WebP estático de até 4096 × 4096 pixels.',
) => Object.assign(new Error(message), { status: 400 });
function validateImageMetadata(metadata) {
  if (
    !['png', 'jpeg', 'webp'].includes(metadata.format) ||
    !metadata.width ||
    !metadata.height ||
    metadata.width > 4096 ||
    metadata.height > 4096 ||
    (metadata.pages ?? 1) !== 1
  )
    throw invalid();
}
// Decode before publication. Fresh WebP strips metadata and trailing content; SVG,
// videos and animated raster formats are intentionally unavailable for new uploads.
export async function sanitizeUpload(bytes, { maxDimension = 2048 } = {}) {
  if (!Number.isInteger(maxDimension) || maxDimension < 1 || maxDimension > 2048)
    throw new TypeError('maxDimension deve estar entre 1 e 2048 pixels.');
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 20 * 1024 * 1024)
    throw Object.assign(new Error('Arquivo vazio ou maior que 20 MB.'), {
      status: 413,
    });
  if (processing >= 2)
    throw Object.assign(new Error('Envio ocupado. Aguarde alguns segundos e tente novamente.'), {
      status: 429,
    });
  processing++;
  try {
    const options = {
      failOn: 'warning',
      limitInputPixels: 16777216,
      sequentialRead: true,
    };
    const metadata = await sharp(bytes, options).metadata();
    validateImageMetadata(metadata);
    const output = await sharp(bytes, options)
      .timeout({ seconds: 10 })
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85, effort: 1 })
      .toBuffer();
    if (output.length > 20 * 1024 * 1024) throw invalid();
    return { bytes: output, mime: 'image/webp', ext: 'webp' };
  } catch (error) {
    if (error.status) throw error;
    throw invalid();
  } finally {
    processing--;
  }
}
