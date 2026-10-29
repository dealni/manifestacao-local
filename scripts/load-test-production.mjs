import { WebSocket } from 'ws';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

function validateLoadSize(options) {
  if (!Number.isFinite(options.duration) || options.duration < 1 || options.duration > 300)
    throw new Error('Duração deve estar entre 1 e 300 segundos por etapa.');
  if (
    !options.clients.length ||
    options.clients.length > 10 ||
    options.clients.some((n) => !Number.isInteger(n) || n < 1 || n > 1000)
  )
    throw new Error('Informe de 1 a 10 etapas, com 1 a 1000 clientes cada.');
}

function normalizeOrigin(options) {
  if (options.origin !== undefined) {
    const origin = new URL(options.origin);
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error(
        '--origin precisa ser uma origem HTTPS, sem caminho, credenciais ou parâmetros.',
      );
    options.origin = origin.origin;
  }
}

// Este harness só aceita loopback, inclusive quando executado dentro da VPS.
export function parseOptions(args = []) {
  const options = { url: 'ws://127.0.0.1:4173/ws', clients: [10, 20, 30], duration: 15 };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i],
      value = args[i + 1];
    if (!value || !['--url', '--clients', '--duration', '--origin'].includes(key))
      throw new Error(
        'Uso: --url ws://127.0.0.1:4173/ws --clients 10,20,30 --duration 15 [--origin https://manifestacoes.com]',
      );
    if (key === '--url') options.url = value;
    if (key === '--duration') options.duration = Number(value);
    if (key === '--clients') options.clients = value.split(',').map(Number);
    if (key === '--origin') options.origin = value;
  }
  const url = new URL(options.url);
  if (
    !['ws:', 'wss:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/ws'
  )
    throw new Error(
      'Carga permitida exclusivamente em localhost, no caminho /ws, sem credenciais.',
    );
  validateLoadSize(options);
  options.url = url.href;
  normalizeOrigin(options);
  return options;
}

export function connectionOptions(options, index) {
  // Revalidação impede que a API de importação direcione os headers para fora do loopback.
  const checked = parseOptions([
    '--url',
    options.url,
    ...(options.origin === undefined ? [] : ['--origin', options.origin]),
  ]);
  if (!Number.isInteger(index) || index < 0 || index >= 1000)
    throw new Error('Índice do cliente precisa estar entre 0 e 999.');
  const origin = new URL(checked.origin || checked.url);
  if (!checked.origin) origin.protocol = origin.protocol === 'wss:' ? 'https:' : 'http:';
  return {
    origin: origin.origin,
    followRedirects: false,
    handshakeTimeout: 5000,
    ...(checked.origin
      ? {
          headers: {
            Host: origin.host,
            'X-Forwarded-Proto': 'https',
            // Faixa reservada a benchmarks, nunca usada como destino de conexão.
            'X-Real-IP': `198.18.${Math.floor(index / 254)}.${(index % 254) + 1}`,
          },
        }
      : {}),
  };
}

export function decodeSelfPosition(data, id) {
  if (!Buffer.isBuffer(data) || data.length < 11 || data[0] !== 1) return null;
  const count = data.readUInt16LE(5);
  if (data.length < 11 + count * 16) return null;
  for (let i = 0; i < count; i++) {
    const offset = 11 + i * 16;
    if (data.readUInt32LE(offset) === id)
      return { x: data.readInt16LE(offset + 4) / 50, z: data.readInt16LE(offset + 6) / 50 };
  }
  return null;
}

export function distribution(values) {
  if (!values.length) return { samples: 0, p50: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => Math.round(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] * 100) / 100;
  return { samples: sorted.length, p50: at(0.5), p95: at(0.95), max: at(1) };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runStage(options, count) {
  // Validar também a API importada para impedir bypass da restrição da CLI.
  options = parseOptions([
    '--url',
    options.url,
    '--duration',
    String(options.duration),
    '--clients',
    String(count),
    ...(options.origin === undefined ? [] : ['--origin', options.origin]),
  ]);
  const clients = [],
    errors = [],
    joins = [],
    rtts = [];
  let receivedBytes = 0,
    sentBytes = 0,
    messages = 0,
    snapshots = 0,
    stopping = false;
  const startedAt = performance.now();
  try {
    for (let index = 0; index < count; index++) {
      const connectedAt = performance.now();
      const client = {
        id: null,
        seq: 0,
        first: null,
        maxDistance: 0,
        pendingPings: new Map(),
        timer: null,
        ws: null,
      };
      const ws = (client.ws = new WebSocket(options.url, connectionOptions(options, index)));
      clients.push(client);
      const send = (message) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const encoded = JSON.stringify(message);
        sentBytes += Buffer.byteLength(encoded);
        ws.send(encoded);
      };
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            clearTimeout(timeout);
            resolve();
          }
        };
        const timeout = setTimeout(() => {
          errors.push(`cliente ${index}: welcome excedeu 5 s`);
          ws.terminate();
          finish();
        }, 5000);
        ws.on('error', (error) => {
          errors.push(`cliente ${index}: ${error.message}`);
          finish();
        });
        ws.on('close', (code) => {
          if (!stopping) errors.push(`cliente ${index}: desconexão ${code}`);
          finish();
        });
        ws.on('open', () =>
          send({ t: 'join', nick: `Carga local ${index}`, team: index % 3, character: 0 }),
        );
        ws.on('message', (data, binary) => {
          receivedBytes += data.length;
          messages++;
          if (binary) {
            const pose = decodeSelfPosition(data, client.id);
            if (pose) {
              snapshots++;
              client.first ||= pose;
              client.maxDistance = Math.max(
                client.maxDistance,
                Math.hypot(pose.x - client.first.x, pose.z - client.first.z),
              );
            }
            return;
          }
          let message;
          try {
            message = JSON.parse(data.toString());
          } catch {
            errors.push(`cliente ${index}: JSON inválido`);
            return;
          }
          if (message.t === 'pong') {
            const since = client.pendingPings.get(message.at);
            if (since !== undefined) {
              rtts.push(performance.now() - since);
              client.pendingPings.delete(message.at);
            }
          }
          if (message.t === 'welcome' && client.id === null) {
            client.id = message.id;
            joins.push(performance.now() - connectedAt);
            client.timer = setInterval(() => {
              // Entradas normalizadas, sem informar pose/teleporte e sem publicar chat.
              const direction = Math.floor(client.seq / 20) % 2 ? -1 : 1;
              send({ t: 'input', x: 0, z: direction, seq: ++client.seq, run: false });
              if (client.seq % 10 === 0) {
                const at = Date.now();
                client.pendingPings.set(at, performance.now());
                send({ t: 'ping', at });
              }
            }, 100);
            finish();
          }
        });
      });
    }
    await sleep(options.duration * 1000);
  } finally {
    stopping = true;
    await Promise.all(
      clients.map(async (client) => {
        clearInterval(client.timer);
        if (client.ws.readyState === WebSocket.CLOSED) return;
        await new Promise((resolve) => {
          const timer = setTimeout(() => {
            client.ws.terminate();
            resolve();
          }, 1000);
          client.ws.once('close', () => {
            clearTimeout(timer);
            resolve();
          });
          client.ws.close(1000, 'Fim da carga local');
        });
      }),
    );
  }
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  return {
    requested: count,
    joined: joins.length,
    moved: clients.filter((c) => c.maxDistance >= 0.1).length,
    durationSeconds: options.duration,
    elapsedSeconds: Math.round(elapsedSeconds * 100) / 100,
    joinMs: distribution(joins),
    rttMs: distribution(rtts),
    receivedBytes,
    sentBytes,
    receivedBytesPerSecond: Math.round(receivedBytes / elapsedSeconds),
    messages,
    snapshots,
    pendingPings: clients.reduce((sum, c) => sum + c.pendingPings.size, 0),
    errors,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  console.log(
    JSON.stringify({
      target: options.url,
      ...(options.origin ? { simulatedProxyOrigin: options.origin } : {}),
      note: 'Carga sintética por loopback; não mede renderização, voz ou latência de internet. --origin simula headers do proxy, sem atravessar Cloudflare/Nginx.',
    }),
  );
  for (const count of options.clients) {
    const report = await runStage(options, count);
    console.log(JSON.stringify(report));
    if (
      report.errors.length ||
      report.joined !== count ||
      report.moved !== count ||
      !report.rttMs.samples
    )
      process.exitCode = 1;
    await sleep(500);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
