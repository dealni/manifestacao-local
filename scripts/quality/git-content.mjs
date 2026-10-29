import { TextDecoder } from 'node:util';

export const MAX_GIT_FILE_BYTES = 100 * 1024 * 1024;

const allowedData = new Set([
  'data/catalog.json',
  'data/music-tracks.json',
  'data/media-screens.json',
  'data/brasilia-layout.json',
  'data/brasilia-model-assets.json',
]);
const secret =
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b|\bAKIA[0-9A-Z]{16}\b/;
const utf16Prefixes = [
  '-----BEGIN ',
  'ghp_',
  'gho_',
  'ghu_',
  'ghs_',
  'ghr_',
  'github_pat_',
  'AKIA',
].flatMap((prefix) => {
  const littleEndian = Buffer.from(prefix, 'utf16le');
  return [littleEndian, Buffer.from(littleEndian).swap16()];
});

// Shared by index and outgoing-history checks. Diagnostics must never include bytes.
export function inspectGitPath(name, size) {
  const issues = [];
  const forbidden =
    name
      .split('/')
      .some((part) => /^(?:node_modules|uploads|snapshots|\.env(?:\..*)?)$/.test(part)) ||
    (name.startsWith('data/') && !allowedData.has(name)) ||
    /\.(?:pem|key|p12|pfx|dump|sql|tar\.gz)$/i.test(name);
  if (forbidden)
    issues.push({
      code: 'forbidden-path',
      message: `Arquivo não permitido no Git: ${JSON.stringify(name)}`,
    });
  if (size >= MAX_GIT_FILE_BYTES)
    issues.push({
      code: 'oversized-file',
      message: `Arquivo excede o limite do Git: ${JSON.stringify(name)}`,
    });
  return issues;
}

function containsCredential(content) {
  // Binary classification must not hide contiguous ASCII signatures around NULs.
  if (secret.test(content.toString('latin1'))) return true;
  if (!content.includes(0)) return false;
  // Avoid decoding whole GLBs, textures and audio unless an encoded signature exists.
  if (!utf16Prefixes.some((prefix) => content.includes(prefix))) return false;
  const bigEndian = new TextDecoder('utf-16be', { ignoreBOM: true });
  // Both alignments also cover UTF-16 text embedded after a binary header.
  for (const offset of [0, 1]) {
    if (
      secret.test(content.toString('utf16le', offset)) ||
      secret.test(bigEndian.decode(content.subarray(offset)))
    )
      return true;
  }
  return false;
}

export function inspectGitContent(name, content) {
  const issues = inspectGitPath(name, content.length);
  if (issues.length) return issues;
  if (containsCredential(content)) {
    issues.push({
      code: 'credential',
      message: `Possível credencial no arquivo: ${JSON.stringify(name)}. Conteúdo omitido.`,
    });
  }
  return issues;
}
