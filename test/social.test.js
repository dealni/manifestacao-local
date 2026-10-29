import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleSocialMessage,
  initSocial,
  cleanupSocial,
  SOCIAL_MESSAGE_LIMITS,
} from '../src/social.js';

function fixture() {
  const sent = [],
    a = { id: 1, userId: 'a', nick: 'Ana' },
    b = { id: 2, userId: 'b', nick: 'Beto' },
    c = { id: 3, userId: 'c', nick: 'Caio' };
  const ctx = {
    state: { users: [a, b, c].map((p) => ({ id: p.userId, nick: p.nick })) },
    players: new Map([
      [1, a],
      [2, b],
      [3, c],
    ]),
    save() {},
    sendPlayer(p, m) {
      sent.push({ id: p.id, ...m });
    },
  };
  const act = (p, a, extra = {}) => handleSocialMessage(p, { t: 'social', a, ...extra }, ctx);
  return { ctx, sent, a, b, c, act };
}
test('amizades exigem pedido e aceite do destinatário e persistem no estado', () => {
  const { ctx, a, b, c, act } = fixture();
  act(a, 'request', { uid: 'b' });
  act(c, 'accept', { uid: 'b' });
  assert.equal(ctx.state.social.friends.length, 0);
  act(a, 'accept', { uid: 'b' });
  assert.equal(ctx.state.social.friends.length, 0);
  act(b, 'accept', { uid: 'a' });
  assert.deepEqual(ctx.state.social.friends, [['b', 'a']]);
  act(a, 'request', { uid: 'b' });
  assert.equal(ctx.state.social.requests.length, 0);
});
test('mensagens só entre amigos, histórico e não lidas por destinatário', () => {
  const { ctx, sent, a, b, c, act } = fixture();
  act(a, 'dm', { uid: 'b', text: 'antes' });
  assert.equal(ctx.state.social.messages.length, 0);
  act(a, 'request', { uid: 'b' });
  act(b, 'accept', { uid: 'a' });
  act(a, 'dm', { uid: 'b', text: 'Oi Beto' });
  assert.equal(initSocial(b, ctx).unread, 1);
  assert.equal(initSocial(c, ctx).unread, 0);
  act(c, 'thread', { uid: 'b' });
  assert.deepEqual(sent.at(-1).messages, []);
  act(b, 'thread', { uid: 'a' });
  assert.equal(sent.at(-1).messages[0].text, 'Oi Beto');
  assert.equal(initSocial(b, ctx).unread, 1);
  act(b, 'thread_focus', { uid: 'a', on: true });
  act(b, 'read', { uid: 'a', mid: ctx.state.social.messages[0].id });
  assert.equal(initSocial(b, ctx).unread, 0);
  act(b, 'block', { uid: 'a' });
  act(a, 'dm', { uid: 'b', text: 'bloqueado' });
  assert.equal(ctx.state.social.messages.length, 1);
  assert.equal(ctx.state.social.friends.length, 0);
});
test('leitura exige conversa visível e ACK, sincroniza abas sem ler mensagens posteriores', () => {
  const { ctx, sent, a, b, act } = fixture();
  const secondTab = { ...b, id: 4 };
  ctx.players.set(4, secondTab);
  act(a, 'request', { uid: 'b' });
  act(b, 'accept', { uid: 'a' });
  act(b, 'thread_focus', { uid: 'a', on: true });
  act(a, 'dm', { uid: 'b', text: 'Primeira' });
  const mid = ctx.state.social.messages[0].id;
  act(a, 'dm', { uid: 'b', text: 'Ainda não renderizada' });
  act(secondTab, 'read', { uid: 'a', mid });
  assert.equal(initSocial(b, ctx).unread, 2);
  act(b, 'read', { uid: 'a', mid });
  assert.equal(initSocial(b, ctx).unread, 1);
  assert.ok(sent.some((m) => m.id === 4 && m.a === 'hello' && m.unread === 1));
  act(b, 'thread_focus', { uid: 'a', on: false });
  const latest = ctx.state.social.messages[1].id;
  act(b, 'read', { uid: 'a', mid: latest });
  assert.equal(initSocial(b, ctx).unread, 1);
  act(b, 'thread', { uid: 'a' });
  assert.equal(initSocial(b, ctx).unread, 1);
  act(secondTab, 'thread_focus', { uid: 'a', on: true });
  act(secondTab, 'read', { uid: 'a', mid: latest });
  assert.equal(initSocial(b, ctx).unread, 0);
  cleanupSocial(secondTab, ctx);
  assert.equal(secondTab.socialThread, undefined);
});
test('foco e leitura não contornam amizade, bloqueio ou conversa de outro remetente', () => {
  const { ctx, a, b, c, act } = fixture();
  act(b, 'thread_focus', { uid: 'a', on: true });
  assert.equal(b.socialThread, undefined);
  act(a, 'request', { uid: 'b' });
  act(b, 'accept', { uid: 'a' });
  act(a, 'dm', { uid: 'b', text: 'Privada' });
  const mid = ctx.state.social.messages[0].id;
  act(c, 'thread_focus', { uid: 'a', on: true });
  act(c, 'read', { uid: 'a', mid });
  assert.equal(initSocial(b, ctx).unread, 1);
  act(b, 'thread_focus', { uid: 'a', on: true });
  act(a, 'block', { uid: 'b' });
  assert.equal(b.socialThread, undefined);
  act(b, 'thread_focus', { uid: 'a', on: true });
  act(b, 'read', { uid: 'a', mid });
  assert.equal(initSocial(b, ctx).unread, 0);
  assert.equal(ctx.state.social.messages[0].read, false);
});
test('busca não revela emails ou dados privados, convidados não podem adicionar', () => {
  const { ctx, sent, a, act } = fixture();
  ctx.state.users[1].email = 'privado@local.invalid';
  act(a, 'find', { nick: 'bet' });
  assert.equal(sent.at(-1).people[0].nick, 'Beto');
  assert.equal(JSON.stringify(sent.at(-1)).includes('privado'), false);
  act({ id: 4, nick: 'Visitante' }, 'request', { uid: 'a' });
  assert.equal(sent.at(-1).a, 'guest');
});
test('sala exige convite e permissões de proprietário; limpeza transfere sala', () => {
  const { ctx, sent, a, b, c, act } = fixture();
  act(a, 'request', { uid: 'b' });
  act(b, 'accept', { uid: 'a' });
  act(a, 'voice_open');
  const room = [...ctx.socialRooms.values()][0];
  act(c, 'voice_join', { room: room.id });
  assert.equal(room.members.size, 1);
  act(a, 'voice_invite', { uid: 'b' });
  act(b, 'voice_join', { room: room.id });
  assert.equal(room.members.size, 2);
  act(b, 'voice_kick', { id: 1 });
  assert.equal(room.members.size, 2);
  act(a, 'voice_mute', { id: 2, on: true });
  assert.equal(room.muted, undefined);
  assert.equal(
    sent.filter((m) => m.a === 'voice').every((m) => m.publish === false),
    true,
  );
  cleanupSocial(a, ctx);
  assert.equal(room.owner, 'b');
  ctx.players.delete(1);
  ctx.players.delete(2);
  cleanupSocial(b, ctx);
  assert.equal(ctx.socialRooms.size, 0);
  assert.equal(
    sent.some((m) => m.a === 'voice_end'),
    true,
  );
});
test('mensagem sem ação e tipos alheios não derrubam transporte', () => {
  const { ctx, a, act } = fixture();
  assert.equal(handleSocialMessage(a, { t: 'move' }, ctx), false);
  assert.doesNotThrow(() => act(a, undefined));
});

function messageHistory(count, from = 'a', to = 'b') {
  return Array.from({ length: count }, (_, i) => ({
    id: `${from}-${to}-${i}`,
    from,
    to,
    text: `Mensagem ${i}`,
    at: i,
    read: false,
  }));
}

function quotaFixture(messages) {
  const f = fixture();
  let saves = 0;
  initSocial(f.a, f.ctx);
  f.ctx.state.social.friends = [
    ['a', 'b'],
    ['a', 'c'],
  ];
  f.ctx.state.social.messages = messages;
  f.ctx.save = () => saves++;
  return { ...f, saves: () => saves };
}

test('cota por conversa aceita o último envio e recusa ambas direções sem salvar ou notificar destinatário', () => {
  const { ctx, sent, a, b, c, act, saves } = quotaFixture(
    messageHistory(SOCIAL_MESSAGE_LIMITS.conversation - 1),
  );
  act(b, 'dm', { uid: 'a', text: 'Última permitida' });
  assert.equal(ctx.state.social.messages.length, SOCIAL_MESSAGE_LIMITS.conversation);
  assert.equal(saves(), 1);
  assert.equal(sent.filter((m) => m.a === 'dm').length, 2);
  const before = structuredClone(ctx.state.social.messages);
  sent.length = 0;
  act(a, 'dm', { uid: 'b', text: 'Acima do limite' });
  act(b, 'dm', { uid: 'a', text: 'Também recusada' });
  assert.deepEqual(ctx.state.social.messages, before);
  assert.equal(saves(), 1);
  assert.deepEqual(
    sent.map((m) => m.a),
    ['notice', 'notice'],
  );
  assert.ok(sent.every((m) => /Esta conversa.*limite/.test(m.text)));
  act(a, 'dm', { uid: 'c', text: 'Outra conversa continua disponível' });
  assert.equal(ctx.state.social.messages.at(-1).to, c.userId);
  assert.equal(saves(), 2);
});

test('cota por remetente soma conversas e não impede o destinatário de responder', () => {
  const messages = Array.from({ length: SOCIAL_MESSAGE_LIMITS.sender - 1 }, (_, i) => ({
    ...messageHistory(1)[0],
    id: `sent-${i}`,
    to: `peer-${i % 4}`,
  }));
  const { ctx, sent, a, b, act, saves } = quotaFixture(messages);
  act(a, 'dm', { uid: 'b', text: 'Última da conta' });
  assert.equal(ctx.state.social.messages.length, SOCIAL_MESSAGE_LIMITS.sender);
  assert.equal(saves(), 1);
  sent.length = 0;
  act(a, 'dm', { uid: 'c', text: 'Nova conversa não contorna cota' });
  assert.equal(ctx.state.social.messages.length, SOCIAL_MESSAGE_LIMITS.sender);
  assert.equal(saves(), 1);
  assert.deepEqual(
    sent.map((m) => m.a),
    ['notice'],
  );
  assert.match(sent[0].text, /Sua conta.*limite/);
  act(b, 'dm', { uid: 'a', text: 'Resposta ainda disponível' });
  assert.equal(ctx.state.social.messages.length, SOCIAL_MESSAGE_LIMITS.sender + 1);
  assert.equal(saves(), 2);
});

test('cota global soma outras contas e recusa sem apagar, gravar ou enviar DM', () => {
  const { ctx, sent, a, b, act, saves } = quotaFixture(
    messageHistory(SOCIAL_MESSAGE_LIMITS.total - 1, 'other', 'another'),
  );
  act(a, 'dm', { uid: 'b', text: 'Última do servidor' });
  assert.equal(ctx.state.social.messages.length, SOCIAL_MESSAGE_LIMITS.total);
  assert.equal(saves(), 1);
  const before = structuredClone(ctx.state.social.messages);
  sent.length = 0;
  act(b, 'dm', { uid: 'a', text: 'Não cabe' });
  assert.deepEqual(ctx.state.social.messages, before);
  assert.equal(saves(), 1);
  assert.deepEqual(
    sent.map((m) => m.a),
    ['notice'],
  );
  assert.match(sent[0].text, /servidor.*limite/);
});

for (const limit of ['conversation', 'sender', 'total']) {
  test(`estado legado acima da cota ${limit} preserva histórico, paginação e leitura`, () => {
    const historic = messageHistory(SOCIAL_MESSAGE_LIMITS.conversation + 1);
    const messages =
      limit === 'conversation'
        ? historic
        : [
            ...historic,
            ...messageHistory(
              SOCIAL_MESSAGE_LIMITS[limit],
              limit === 'sender' ? 'a' : 'other',
              'another',
            ),
          ];
    const { ctx, sent, a, b, act, saves } = quotaFixture(messages);
    const before = structuredClone(messages);
    act(a, 'dm', { uid: 'b', text: 'Recusada no legado' });
    assert.deepEqual(ctx.state.social.messages, before);
    assert.equal(saves(), 0);
    assert.deepEqual(
      sent.map((m) => m.a),
      ['notice'],
    );
    act(b, 'thread', { uid: 'a' });
    const newestPage = sent.at(-1);
    assert.equal(newestPage.messages.length, 100);
    assert.equal(newestPage.messages.at(-1).id, historic.at(-1).id);
    assert.equal(newestPage.next, historic.at(-100).id);
    act(b, 'thread', { uid: 'a', before: newestPage.next });
    assert.equal(sent.at(-1).messages.at(-1).id, historic.at(-101).id);
    assert.equal(initSocial(b, ctx).unread, historic.length);
    act(b, 'thread_focus', { uid: 'a', on: true });
    act(b, 'read', { uid: 'a', mid: historic.at(-1).id });
    assert.equal(initSocial(b, ctx).unread, 0);
    assert.equal(ctx.state.social.messages.length, messages.length);
    assert.equal(saves(), 1);
  });
}

test('cursor inexistente ou de outra conversa retorna página vazia e limitada', () => {
  const { ctx, sent, a, b, act } = fixture();
  initSocial(a, ctx);
  ctx.state.social.messages = Array.from({ length: 2000 }, (_, i) => ({
    id: `m-${i}`,
    from: 'a',
    to: 'b',
    text: 'Mensagem',
    at: i,
  }));
  ctx.state.social.messages.push({ id: 'outra', from: 'a', to: 'c', text: 'Outra' });
  for (const before of ['inexistente', 'outra']) {
    act(b, 'thread', { uid: 'a', before });
    const page = sent.at(-1);
    assert.deepEqual(page.messages, []);
    assert.equal(page.next, null);
    assert.equal(page.before, before);
  }
  act(b, 'thread', { uid: 'a' });
  assert.equal(sent.at(-1).messages.length, 100);
  assert.equal(sent.at(-1).next, 'm-1900');
});

test('inbox agrega direções, prévia e não lidas sem expor conversas bloqueadas ou alheias', () => {
  const { ctx, sent, a, act } = fixture();
  initSocial(a, ctx);
  ctx.state.social.messages = [
    { id: '1', from: 'b', to: 'a', text: 'Recebida', at: 1, read: false },
    { id: '2', from: 'a', to: 'b', text: 'Enviada', at: 2, read: false },
    { id: '3', from: 'c', to: 'a', text: 'Já lida', at: 3, read: true },
    { id: '4', from: 'b', to: 'c', text: 'Privada alheia', at: 4, read: false },
    { id: '5', from: 'b', to: 'a', text: 'Mais recente', at: 5, read: true },
  ];
  act(a, 'inbox');
  assert.deepEqual(
    sent.at(-1).threads.map(({ uid, preview, at, unread }) => ({ uid, preview, at, unread })),
    [
      { uid: 'b', preview: 'Mais recente', at: 5, unread: 1 },
      { uid: 'c', preview: 'Já lida', at: 3, unread: 0 },
    ],
  );
  ctx.state.social.blocks.push(['b', 'a']);
  act(a, 'inbox');
  assert.deepEqual(
    sent.at(-1).threads.map(({ uid }) => uid),
    ['c'],
  );
});

test('reentrada na própria sala é idempotente e preserva proprietário e outros membros', () => {
  const { ctx, a, b, act } = fixture();
  act(a, 'request', { uid: 'b' });
  act(b, 'accept', { uid: 'a' });
  act(a, 'voice_open');
  const room = [...ctx.socialRooms.values()][0];
  act(a, 'voice_invite', { uid: 'b' });
  act(b, 'voice_join', { room: room.id });
  act(b, 'voice_invite', { uid: 'a' });
  act(a, 'voice_join', { room: room.id });
  assert.equal(room.owner, 'a');
  assert.deepEqual([...room.members], ['a', 'b']);
  assert.equal(ctx.socialRooms.get(room.id), room);
  act(a, 'voice_join', { room: room.id });
  assert.equal(room.owner, 'a');
});

for (const blocker of ['a', 'b']) {
  test(`bloqueio de ${blocker} revoga convite de sala e desbloqueio exige novo convite`, () => {
    const { ctx, sent, a, b, act } = fixture();
    act(a, 'request', { uid: 'b' });
    act(b, 'accept', { uid: 'a' });
    act(a, 'voice_open');
    const room = [...ctx.socialRooms.values()][0];
    act(a, 'voice_invite', { uid: 'b' });
    assert.equal(room.invited.has('b'), true);
    const blockingPlayer = blocker === 'a' ? a : b;
    const target = blocker === 'a' ? 'b' : 'a';
    act(blockingPlayer, 'block', { uid: target });
    assert.equal(room.invited.has('b'), false);
    act(blockingPlayer, 'unblock', { uid: target });
    act(b, 'voice_join', { room: room.id });
    assert.equal(room.members.has('b'), false);
    assert.match(sent.at(-1).text, /Convite inválido/);
    act(a, 'request', { uid: 'b' });
    act(b, 'accept', { uid: 'a' });
    act(a, 'voice_invite', { uid: 'b' });
    act(b, 'voice_join', { room: room.id });
    assert.equal(room.members.has('b'), true);
  });
}

test('mensagens bloqueadas saem do contador e retornam intactas após desbloquear', () => {
  const { ctx, sent, a, b, c, act } = fixture();
  act(a, 'request', { uid: 'b' });
  act(b, 'accept', { uid: 'a' });
  act(c, 'request', { uid: 'b' });
  act(b, 'accept', { uid: 'c' });
  act(a, 'dm', { uid: 'b', text: 'Oculta por bloqueio' });
  act(c, 'dm', { uid: 'b', text: 'Visível' });
  assert.equal(initSocial(b, ctx).unread, 2);
  act(a, 'block', { uid: 'b' });
  assert.equal(initSocial(b, ctx).unread, 1);
  act(b, 'thread_focus', { uid: 'c', on: true });
  act(b, 'read', { uid: 'c', mid: ctx.state.social.messages.at(-1).id });
  assert.equal(sent.findLast((m) => m.id === b.id && m.a === 'read').unread, 0);
  assert.equal(initSocial(b, ctx).unread, 0);
  assert.equal(ctx.state.social.messages[0].read, false);
  act(a, 'unblock', { uid: 'b' });
  assert.equal(initSocial(b, ctx).unread, 1);
});

test('histórico de amizade encerrada permite confirmar leitura sem reautorizar envios', () => {
  const { ctx, sent, a, b, act } = fixture();
  act(a, 'request', { uid: 'b' });
  act(b, 'accept', { uid: 'a' });
  act(a, 'dm', { uid: 'b', text: 'Recebida antes da remoção' });
  const mid = ctx.state.social.messages[0].id;
  act(a, 'remove', { uid: 'b' });
  act(b, 'thread', { uid: 'a' });
  assert.equal(sent.at(-1).messages[0].id, mid);
  act(b, 'thread_focus', { uid: 'a', on: true });
  act(b, 'read', { uid: 'a', mid });
  assert.equal(initSocial(b, ctx).unread, 0);
  act(b, 'dm', { uid: 'a', text: 'Ainda exige amizade' });
  assert.equal(ctx.state.social.messages.length, 1);
  assert.match(sent.at(-1).text, /entre amigos/);
});

test('denúncia privada confirma somente mensagem realmente recebida e evita duplicatas', () => {
  const { ctx, sent, a, b, c, act } = fixture();
  act(a, 'request', { uid: 'b' });
  act(b, 'accept', { uid: 'a' });
  act(a, 'dm', { uid: 'b', text: 'Mensagem denunciável' });
  const mid = ctx.state.social.messages[0].id;
  for (const [player, id] of [
    [a, mid],
    [c, mid],
    [b, 'inexistente'],
  ]) {
    act(player, 'report', { mid: id });
    assert.match(sent.at(-1).text, /não está disponível/);
    assert.equal(ctx.state.social.reports.length, 0);
  }
  act(b, 'report', { mid });
  assert.match(sent.at(-1).text, /Registro salvo/);
  assert.equal(ctx.state.social.reports.length, 1);
  act(b, 'report', { mid });
  assert.equal(ctx.state.social.reports.length, 1);
});
test('ações com nomes herdados continuam desconhecidas no despacho social', () => {
  const { sent, a, act } = fixture();
  for (const action of ['constructor', 'toString', '__proto__']) {
    assert.equal(act(a, action), true);
    assert.equal(sent.at(-1).a, 'notice');
    assert.equal(sent.at(-1).text, 'Ação social local desconhecida.');
  }
});
