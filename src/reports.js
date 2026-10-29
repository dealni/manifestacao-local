import { randomUUID } from 'node:crypto';

// O mesmo estado é salvo em JSON local ou PostgreSQL. Não é uma fila de IA nem
// promete atendimento: oferece evidência limitada para consulta administrativa.
export const REPORT_LIMIT = 1000;
export const REPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const limits = new WeakMap();
const guestIdentities = new WeakMap();
// eslint-disable-next-line no-control-regex -- Remove ou rejeita controles ASCII recebidos do usuário.
const controls = /[\u0000-\u001f\u007f]/g;
const clean = (value, maximum) =>
  String(value ?? '')
    .replace(controls, ' ')
    .slice(0, maximum);

export function pruneReports(ctx, at = Date.now()) {
  if (!Array.isArray(ctx.state.reports)) return false;
  const kept = ctx.state.reports
    .filter((row) => row && Number.isFinite(row.at) && at - row.at < REPORT_RETENTION_MS)
    .slice(-REPORT_LIMIT);
  if (kept.length === ctx.state.reports.length) return false;
  ctx.state.reports = kept;
  ctx.save();
  return true;
}

function reportAllowance(ctx, reporter, at) {
  let limiter = limits.get(ctx);
  if (!limiter) {
    limiter = { users: new Map(), global: { at, count: 0 } };
    limits.set(ctx, limiter);
  }
  for (const [key, bucket] of limiter.users)
    if (at - bucket.at >= 300000) limiter.users.delete(key);
  if (at - limiter.global.at >= 60000) limiter.global = { at, count: 0 };
  const bucket = limiter.users.get(reporter) ?? { at, count: 0 };
  if (
    bucket.count >= 5 ||
    limiter.global.count >= 60 ||
    (!limiter.users.has(reporter) && limiter.users.size >= 10000)
  )
    return null;
  return { limiter, bucket };
}

export function recordReport(ctx, player, kind, target, at = Date.now()) {
  if (!['chat', 'spray'].includes(kind) || !target || typeof target !== 'object')
    return { ok: false, text: 'Não foi possível localizar o conteúdo denunciado.' };
  const userId = player.userId ?? player.user?.id;
  if (userId == null && !guestIdentities.has(player)) guestIdentities.set(player, randomUUID());
  const reporter =
    userId == null ? `connection:${guestIdentities.get(player)}` : `account:${userId}`;
  const allowed = reportAllowance(ctx, reporter, at);
  if (!allowed) return { ok: false, text: 'Limite de denúncias atingido. Aguarde alguns minutos.' };
  const { limiter, bucket } = allowed;
  const reports = Array.isArray(ctx.state.reports) ? ctx.state.reports : [];
  const key = kind === 'chat' ? clean(target.mid, 64) : clean(target.key, 24);
  if (!key) return { ok: false, text: 'Não foi possível localizar o conteúdo denunciado.' };
  if (
    reports.some(
      (report) =>
        report &&
        report.kind === kind &&
        report.targetKey === key &&
        report.reporter === reporter &&
        at - report.at < REPORT_RETENTION_MS,
    )
  )
    return { ok: false, text: 'Você já registrou uma denúncia deste conteúdo.' };
  bucket.count++;
  limiter.users.set(reporter, bucket);
  limiter.global.count++;
  const content =
    kind === 'chat'
      ? {
          mid: key,
          playerId: target.id,
          nick: clean(target.nick, 20),
          text: clean(target.text, 280),
          channel: target.channel === 'local' ? 'local' : 'global',
          at: target.at,
        }
      : { key, u: target.u, v: target.v, layers: structuredClone(target.layers) };
  const report = {
    id: randomUUID(),
    kind,
    targetKey: key,
    reporter,
    reporterNick: clean(player.nick, 20),
    at,
    status: 'recorded',
    content,
  };
  ctx.state.reports = reports
    .filter((row) => row && Number.isFinite(row.at) && at - row.at < REPORT_RETENTION_MS)
    .slice(-(REPORT_LIMIT - 1));
  ctx.state.reports.push(report);
  ctx.save();
  return {
    ok: true,
    text: 'Denúncia registrada para consulta pela administração. Não há análise automática nem prazo de resposta.',
  };
}

export function rememberReportableChat(player, chat) {
  const recent = (player.reportableChat ??= new Map());
  recent.set(chat.mid, chat);
  if (recent.size > 80) recent.delete(recent.keys().next().value);
}

export function handleChatReport(ctx, player, msg) {
  const byPlayer = msg.t === 'report' && msg.mid == null;
  // O menu de jogador envia apenas seu ID. Correlacione com a última evidência
  // já entregue a este denunciante; o payload nunca fornece autoria/conteúdo.
  const chat = byPlayer
    ? Number.isInteger(msg.id) && msg.id > 0
      ? [...(player.reportableChat?.values() ?? [])].reverse().find((row) => row.id === msg.id)
      : null
    : typeof msg.mid === 'string' && player.reportableChat?.get(msg.mid);
  const result =
    chat && chat.id !== player.id && Date.now() - chat.at <= 15 * 60000
      ? recordReport(ctx, player, 'chat', chat)
      : {
          ok: false,
          text: byPlayer
            ? 'Não há mensagem recente deste jogador disponível para denúncia. Use a bandeira ao lado de uma mensagem que você recebeu.'
            : 'Esta mensagem não está disponível para denúncia. Denuncie uma mensagem recente que você recebeu.',
        };
  if (byPlayer && result.ok)
    result.text += ' Foi registrada a última mensagem recente deste jogador que você recebeu.';
  ctx.sendPlayer?.(player, { t: 'notice', text: result.text });
  return result;
}
