import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordReport,
  rememberReportableChat,
  handleChatReport,
  pruneReports,
  REPORT_LIMIT,
  REPORT_RETENTION_MS,
} from '../src/reports.js';
import { handleWorldMessage, initWorld } from '../src/world-actions.js';
function fixture() {
  const messages = [];
  let saves = 0;
  return {
    ctx: {
      state: { users: [], world: {} },
      save() {
        saves++;
      },
      sendPlayer(player, msg) {
        messages.push(msg);
      },
    },
    player: { id: 1, nick: 'Visitante', x: 216, z: -529, team: 0 },
    messages,
    saves: () => saves,
  };
}
test('limpeza periódica remove denúncias expiradas sem depender de novas denúncias', () => {
  const f = fixture(),
    at = Date.now();
  f.ctx.state.reports = [
    { at: at - REPORT_RETENTION_MS - 1 },
    { at: at - REPORT_RETENTION_MS },
    { at: at - 1000 },
  ];
  assert.equal(pruneReports(f.ctx, at), true);
  assert.equal(f.ctx.state.reports.length, 1);
  assert.equal(f.saves(), 1);
  assert.equal(pruneReports(f.ctx, at), false);
  assert.equal(f.saves(), 1);
});

test('retenção remove registros inválidos do estado sem descartar evidências válidas', () => {
  const f = fixture();
  const at = Date.now();
  const valid = { at: at - 1000, kind: 'chat', targetKey: 'kept', reporter: 'other' };
  f.ctx.state.reports = [null, false, {}, { at: 'inválido' }, valid];
  assert.equal(pruneReports(f.ctx, at), true);
  assert.deepEqual(f.ctx.state.reports, [valid]);
  assert.equal(f.saves(), 1);
  f.ctx.state.reports.unshift(null);
  const result = recordReport(
    f.ctx,
    f.player,
    'chat',
    { mid: 'new', id: 2, text: 'evidência nova', at },
    at,
  );
  assert.equal(result.ok, true);
  assert.equal(f.ctx.state.reports.length, 2);
  assert.deepEqual(f.ctx.state.reports[0], valid);
  assert.equal(f.ctx.state.reports[1].content.text, 'evidência nova');
});
const chat = {
  mid: 'server-mid',
  id: 2,
  nick: 'Autor',
  text: 'Conteúdo original',
  channel: 'global',
  at: Date.now(),
};
test('denúncia de chat salva conteúdo e identidade do servidor, ignora payload forjado e duplicatas', () => {
  const f = fixture();
  rememberReportableChat(f.player, chat);
  assert.equal(
    handleChatReport(f.ctx, f.player, { mid: chat.mid, text: 'forjado', userId: 'admin' }).ok,
    true,
  );
  const report = f.ctx.state.reports[0];
  assert.equal(report.content.text, chat.text);
  assert.match(report.reporter, /^connection:[0-9a-f-]{36}$/);
  assert.equal(report.content.nick, 'Autor');
  assert.equal(f.saves(), 1);
  assert.equal(handleChatReport(f.ctx, f.player, { mid: chat.mid }).ok, false);
  assert.equal(f.saves(), 1);
  assert.match(f.messages[0].text, /Não há análise automática/);
});
test('denúncia rejeita chat não recebido, próprio ou expirado e limita referência por conexão', () => {
  const f = fixture();
  assert.equal(handleChatReport(f.ctx, f.player, { mid: 'inventado' }).ok, false);
  rememberReportableChat(f.player, { ...chat, id: 1 });
  assert.equal(handleChatReport(f.ctx, f.player, { mid: chat.mid }).ok, false);
  rememberReportableChat(f.player, { ...chat, at: Date.now() - 16 * 60000 });
  assert.equal(handleChatReport(f.ctx, f.player, { mid: chat.mid }).ok, false);
  for (let i = 0; i < 100; i++) rememberReportableChat(f.player, { ...chat, mid: String(i) });
  assert.equal(f.player.reportableChat.size, 80);
  assert.equal(f.ctx.state.reports, undefined);
});
test('denúncias têm limite por conta e global, retenção e capacidade limitadas', () => {
  const f = fixture(),
    at = Date.now();
  f.player.user = { id: 'account' };
  for (let i = 0; i < 5; i++)
    assert.equal(recordReport(f.ctx, f.player, 'chat', { ...chat, mid: String(i) }, at).ok, true);
  assert.equal(
    recordReport(f.ctx, { ...f.player, id: 20 }, 'chat', { ...chat, mid: 'six' }, at).ok,
    false,
  );
  const g = fixture();
  g.ctx.state.reports = Array.from({ length: REPORT_LIMIT + 5 }, (_, i) => ({
    kind: 'chat',
    at,
    targetKey: `old${i}`,
    reporter: 'other',
  }));
  g.ctx.state.reports.unshift({ at: at - REPORT_RETENTION_MS - 1 });
  assert.equal(recordReport(g.ctx, g.player, 'chat', chat, at).ok, true);
  assert.equal(g.ctx.state.reports.length, REPORT_LIMIT);
  for (let i = 1; i < 60; i++)
    assert.equal(
      recordReport(g.ctx, { ...g.player, id: i + 1 }, 'chat', { ...chat, mid: `many${i}` }, at).ok,
      true,
    );
  assert.equal(recordReport(g.ctx, { ...g.player, id: 999 }, 'chat', chat, at).ok, false);
  const restored = structuredClone(g.ctx.state);
  assert.equal(restored.reports.at(-1).content.text, chat.text);
});
test('denúncia de spray persiste cópia de pintura próxima e existente; rejeita alvo falso e distante', () => {
  const f = fixture();
  initWorld(f.player, f.ctx);
  handleWorldMessage(f.player, { t: 'px', m: 0, c: 2, s: 1, d: ['g1.54.-133', 120, 150] }, f.ctx);
  const saves = f.saves();
  handleWorldMessage(
    f.player,
    { t: 'px_denuncia', k: 'g1.54.-133', u: 120, v: 150, userId: 'fake' },
    f.ctx,
  );
  assert.equal(f.ctx.state.reports[0].kind, 'spray');
  assert.equal(f.saves(), saves + 1);
  f.ctx.state.world.paint['g1.54.-133'].layers[0].length = 0;
  assert.equal(f.ctx.state.reports[0].content.layers[0].length, 1);
  handleWorldMessage(f.player, { t: 'px_denuncia', k: '__proto__', u: 0, v: 0 }, f.ctx);
  f.player.x = -250;
  handleWorldMessage(f.player, { t: 'px_denuncia', k: 'g1.54.-133', u: 120, v: 150 }, f.ctx);
  assert.equal(f.ctx.state.reports.length, 1);
});
test('modo livre mantém progresso de visitante apenas na conexão e limpa somente resíduos guest', () => {
  const f = fixture();
  f.ctx.freeAccess = true;
  f.ctx.state.world.progress = {
    'guest:1': { secret: { hp: 10 } },
    account: { secret: { hp: 80 } },
  };
  initWorld(f.player, f.ctx);
  assert.equal(f.ctx.state.world.progress['guest:1'], undefined);
  assert.equal(f.ctx.state.world.progress.account.secret.hp, 80);
  assert.equal(Object.keys(f.ctx.state.world.progress).length, 1);
  assert.equal(initWorld({ ...f.player }, f.ctx).secretProgress.hp, 100);
});

test('menu de jogador usa última mensagem realmente recebida e identidade canônica da conexão', () => {
  const f = fixture();
  f.player.userId = 'canonical';
  f.player.user = { id: 'stale-cache' };
  rememberReportableChat(f.player, { ...chat, mid: 'older', text: 'anterior' });
  rememberReportableChat(f.player, { ...chat, mid: 'newer', text: 'última recebida' });
  rememberReportableChat(f.player, { ...chat, id: 3, mid: 'other-player', text: 'outro jogador' });
  const result = handleChatReport(f.ctx, f.player, {
    t: 'report',
    id: 2,
    text: 'forjado',
    userId: 'admin',
  });
  assert.equal(result.ok, true);
  assert.match(result.text, /última mensagem recente/);
  assert.equal(f.ctx.state.reports[0].content.mid, 'newer');
  assert.equal(f.ctx.state.reports[0].content.text, 'última recebida');
  assert.equal(f.ctx.state.reports[0].reporter, 'account:canonical');
  assert.equal(handleChatReport(f.ctx, f.player, { t: 'report', id: 4 }).ok, false);
  assert.equal(handleChatReport(f.ctx, f.player, { t: 'report', id: '2' }).ok, false);
  assert.equal(handleChatReport(f.ctx, f.player, { t: 'report', id: 1 }).ok, false);
  assert.equal(f.ctx.state.reports.length, 1);
});
