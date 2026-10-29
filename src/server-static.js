import { createReadStream } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import { MIME } from './server-values.js';
export async function staticFile(r, req, res, file) {
  let stat;
  try {
    file = await fs.promises.realpath(file);
    const relative = path.relative(r.canonicalPublicDir, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      return false;
    stat = await fs.promises.stat(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  res.setHeader(
    'Content-Type',
    MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
  );
  res.setHeader(
    'Cache-Control',
    file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=86400' : 'no-cache',
  );
  res.setHeader('Accept-Ranges', 'bytes');
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  const lastModified = stat.mtime.toUTCString();
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', lastModified);
  if (notModified(req, stat, etag)) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  // A stale If-Range requires the complete representation; weak ETags cannot
  // validate byte ranges, so only an unchanged modification date is accepted.
  const ifRange = req.headers['if-range'];
  const range =
    req.method === 'GET' && (!ifRange || ifRange === lastModified) ? req.headers.range : undefined;
  const extent = parseRange(range, stat);
  if (!extent) {
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
    res.end();
    return true;
  }
  const { start, end } = extent;
  if (range) {
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  }
  streamFile(req, res, file, stat, start, end);
  return true;
}
function notModified(req, stat, etag) {
  // Weak validators are enough to avoid transferring unchanged bundles again.
  // If-None-Match takes precedence over the less precise date validator.
  const noneMatch = req.headers['if-none-match'];
  const matchesTag = noneMatch
    ?.split(',')
    .some((tag) => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag.slice(2));
  const modifiedSince = Date.parse(req.headers['if-modified-since'] ?? '');
  return (
    matchesTag ||
    (!noneMatch &&
      Number.isFinite(modifiedSince) &&
      Math.floor(stat.mtimeMs / 1000) <= Math.floor(modifiedSince / 1000))
  );
}
function parseRange(range, stat) {
  let start = 0,
    end = stat.size - 1;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) {
      return null;
    }
    start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= stat.size
    ) {
      return null;
    }
  }
  return { start, end };
}

function streamFile(req, res, file, stat, start, end) {
  res.setHeader('Content-Length', stat.size ? end - start + 1 : 0);
  if (req.method === 'HEAD' || !stat.size) res.end();
  else {
    const stream = createReadStream(file, { start, end });
    // A disconnected client otherwise leaves pipe() paused with its file open.
    const closeStream = () => stream.destroy();
    res.once('close', closeStream);
    stream.once('close', () => res.off('close', closeStream));
    stream.on('error', () => res.destroy()).pipe(res);
  }
}
