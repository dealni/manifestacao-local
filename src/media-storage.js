import fs from 'node:fs';
import path from 'node:path';
import { sanitizeUpload } from './upload-image.js';
import { id, fail, owner, production } from './media-common.js';

export const uploadAttempts = new WeakMap();

export const pendingDesigns = new WeakMap();

export const pendingRemovals = new WeakMap();

export const pendingUploads = new WeakMap();

export function reserveDesign(ctx, user, kind) {
  let pending = pendingDesigns.get(ctx);
  if (!pending) {
    pending = new Map();
    pendingDesigns.set(ctx, pending);
  }
  const key = `${user.id}:${kind}`;
  const count = pending.get(key) ?? 0;
  if (ctx.state.designs.filter((d) => owner(d, user) && d.kind === kind).length + count >= 20)
    throw fail(409, 'Limite de 20 imagens. Exclua uma antes de criar outra.');
  pending.set(key, count + 1);
  return () => {
    const remaining = (pending.get(key) ?? 1) - 1;
    if (remaining) pending.set(key, remaining);
    else pending.delete(key);
  };
}

export function permitUpload(ctx, user, attempt = false) {
  if (!production(ctx) && ctx.freeAccess !== true) return;
  if (!user.verified || user.nickPending || !user.nick)
    throw fail(403, 'Confirme seu e-mail e escolha um apelido para enviar imagens.');
  const now = Date.now();
  if (attempt) {
    const attempts = (uploadAttempts.get(user) ?? []).filter((at) => at > now - 60000);
    if (attempts.length >= 20) throw fail(429, 'Aguarde antes de tentar enviar mais imagens.');
    uploadAttempts.set(user, [...attempts, now]);
  }
  const recent = (user.mediaUploadTimes ?? []).filter(
    (at) => Number.isFinite(at) && at > now - 3600000,
  );
  const pending = [...(pendingUploads.get(ctx) ?? [])].filter((entry) => owner(entry, user)).length;
  if (
    recent.length + pending >= 40 ||
    recent.filter((at) => at > now - 60000).length + pending >= 10
  )
    throw fail(429, 'Aguarde antes de enviar mais imagens.');
}

export function recordUpload(ctx, user) {
  if (!production(ctx) && ctx.freeAccess !== true) return;
  const now = Date.now();
  user.mediaUploadTimes = [
    ...(user.mediaUploadTimes ?? []).filter((at) => Number.isFinite(at) && at > now - 3600000),
    now,
  ].slice(-40);
}

export function checkQuota(ctx, user, bytes) {
  const records = [...ctx.state.designs, ...ctx.state.media, ...(pendingUploads.get(ctx) ?? [])];
  const unique = [
    ...new Map(records.filter((r) => owner(r, user)).map((r) => [r.filename, r])).values(),
  ];
  if (unique.reduce((sum, r) => sum + (r.size ?? 0), 0) + bytes > 200 * 1024 * 1024)
    throw fail(413, 'Limite de armazenamento da conta atingido (200 MB).');
  const dir = path.join(ctx.dataDir, 'uploads');
  const total = fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .reduce(
          (sum, entry) => sum + (entry.isFile() ? fs.statSync(path.join(dir, entry.name)).size : 0),
          0,
        )
    : 0;
  if (total + bytes > (ctx.config?.maxUploadsBytes ?? 2 * 1024 * 1024 * 1024))
    throw fail(507, 'Armazenamento de mídia cheio. Tente novamente mais tarde.');
}

export async function persistRemoval(ctx, filenames, rollback) {
  const unique = new Set(filenames);
  let pending = pendingRemovals.get(ctx);
  if (!pending) {
    pending = new Map();
    pendingRemovals.set(ctx, pending);
  }
  for (const filename of unique) pending.set(filename, (pending.get(filename) ?? 0) + 1);
  try {
    await ctx.save();
    await ctx.persistence?.flush();
  } catch (error) {
    // Restaure referências antes de liberar a reserva para outras exclusões.
    rollback();
    throw error;
  } finally {
    for (const filename of unique) {
      const remaining = pending.get(filename) - 1;
      if (remaining) pending.set(filename, remaining);
      else pending.delete(filename);
    }
  }
  let cleanupPending = false;
  for (const filename of unique) {
    if (!/^[a-f0-9]{24}\.(png|webp|jpg|gif|mp4|webm)$/.test(filename)) continue;
    if (pending.has(filename)) continue;
    if ([...ctx.state.media, ...ctx.state.designs].some((entry) => entry.filename === filename))
      continue;
    try {
      fs.rmSync(path.join(ctx.dataDir, 'uploads', filename), { force: true });
    } catch {
      // Metadados já confirmados: falha de limpeza só pode deixar bytes órfãos.
      cleanupPending = true;
    }
  }
  return cleanupPending;
}

const signatures = [
  {
    matches: (bytes) =>
      bytes.length >= 24 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.toString('ascii', 12, 16) === 'IHDR',
    type: ['image/png', 'png'],
  },
  {
    matches: (bytes) =>
      bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP',
    type: ['image/webp', 'webp'],
  },
  {
    matches: (bytes) =>
      bytes.length >= 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217,
    type: ['image/jpeg', 'jpg'],
  },
  {
    matches: (bytes) => bytes.length >= 13 && /^GIF8[79]a/.test(bytes.toString('ascii', 0, 6)),
    type: ['image/gif', 'gif'],
  },
  {
    matches: (bytes) => bytes.length >= 24 && bytes.toString('ascii', 4, 8) === 'ftyp',
    type: ['video/mp4', 'mp4'],
  },
  {
    matches: (bytes) =>
      bytes.length >= 16 && bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])),
    type: ['video/webm', 'webm'],
  },
];
export function contentType(bytes) {
  for (const signature of signatures) if (signature.matches(bytes)) return signature.type;
  throw fail(400, 'Arquivo inválido. Envie PNG, WebP, JPEG, GIF, MP4 ou WebM.');
}

export async function store(ctx, bytes, imageOnly = false, user, requireSession) {
  requireSession();
  if (!bytes.length || bytes.length > 20 * 1024 * 1024)
    throw fail(413, 'Arquivo vazio ou maior que 20 MB.');
  let mime, ext;
  if (production(ctx)) {
    const sanitized = await sanitizeUpload(bytes, {
      maxDimension: imageOnly ? 2048 : 1024,
    });
    bytes = sanitized.bytes;
    [mime, ext] = [sanitized.mime, sanitized.ext];
    requireSession();
  } else [mime, ext] = contentType(bytes);
  if (imageOnly && !mime.startsWith('image/'))
    throw fail(400, 'Cartazes e bandeiras precisam de uma imagem.');
  // Revalide após a leitura/decodificação assíncrona; a reserva antecede o próximo await.
  // Arquivos pendentes ocupam cotas de frequência e bytes até publicarmos os metadados.
  permitUpload(ctx, user);
  checkQuota(ctx, user, bytes.length);
  const filename = `${id()}.${ext}`;
  const dir = path.join(ctx.dataDir, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), bytes, {
    flag: 'wx',
    mode: 0o600,
  });
  const record = { filename, mime, size: bytes.length, userId: user.id };
  let pending = pendingUploads.get(ctx);
  if (!pending) {
    pending = new Set();
    pendingUploads.set(ctx, pending);
  }
  pending.add(record);
  return record;
}

export function saveUpload(ctx, user, record, collection, entries) {
  const previousTimes = user.mediaUploadTimes;
  recordUpload(ctx, user);
  ctx.state[collection].push(...entries);
  pendingUploads.get(ctx)?.delete(record);
  try {
    ctx.save();
  } catch (error) {
    // A gravação local pode falhar antes de confirmar o novo snapshot.
    // Desfaça apenas esta publicação, preservando outros registros da conta.
    ctx.state[collection] = ctx.state[collection].filter((entry) => !entries.includes(entry));
    if (previousTimes === undefined) delete user.mediaUploadTimes;
    else user.mediaUploadTimes = previousTimes;
    // A falha pode ocorrer após o rename do snapshot, durante o fsync do diretório.
    // Preserve os bytes: o estado em disco ainda pode referenciar este upload.
    throw error;
  }
}

export function fileResponse(req, res, ctx, record) {
  if (!record || !/^[a-f0-9]{24}\.(png|webp|jpg|gif|mp4|webm)$/.test(record.filename))
    throw fail(404, 'Arquivo não encontrado.');
  const target = path.join(ctx.dataDir, 'uploads', record.filename);
  if (!fs.existsSync(target)) throw fail(404, 'Arquivo não encontrado.');
  const size = fs.statSync(target).size;
  const headers = {
    'content-type': record.mime,
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
    'accept-ranges': 'bytes',
  };
  const range = resolveRange(req, size);
  if (!range) {
    res.writeHead(416, { 'content-range': `bytes */${size}` });
    res.end();
    return;
  }
  const { start, end, status } = range;
  if (status === 206) headers['content-range'] = `bytes ${start}-${end}/${size}`;
  headers['content-length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || !size) res.end();
  else {
    const stream = fs.createReadStream(target, { start, end });
    const closeStream = () => stream.destroy();
    res.once('close', closeStream);
    stream.once('close', () => res.off('close', closeStream));
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}

function resolveRange(req, size) {
  let start = 0,
    end = size - 1,
    status = 200;
  if (req.method === 'GET' && req.headers.range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!m || (!m[1] && !m[2])) {
      return null;
    }
    start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : end;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      end < start ||
      start >= size
    ) {
      return null;
    }
    status = 206;
  }
  return { start, end, status };
}
