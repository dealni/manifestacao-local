import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyMediaDesign } from '../scripts/design-media.js';

const original = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const client = requireServedArtifact(original, 'preview.disabled = true;');

test('patch de mídia recusa fonte ausente ou aplicação duplicada', () => {
  assert.throws(() => applyMediaDesign(''), /incompatível ou ambíguo/);
  assert.throws(() => applyMediaDesign(client), /incompatível ou ambíguo/);
});

function keyboard() {
  let handler;
  const ctx = vm.createContext({
    h: {
      addEventListener(_name, callback) {
        handler = callback;
      },
    },
    t: { layers: [] },
  });
  const start = client.indexOf('    h.addEventListener("keydown", (ee) => {\n      const choice =');
  const end = client.indexOf('\n    (A(".se-close")', start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(client.slice(start, end).replace(/,\s*$/, ';'), ctx);
  const choices = Array.from({ length: 3 }, () => ({
    focus() {
      this.focused = true;
    },
    click() {
      this.clicked = true;
    },
  }));
  const group = { querySelectorAll: () => choices };
  for (const choice of choices) choice.closest = () => group;
  return {
    choices,
    send(at, key) {
      let prevented = false;
      handler({
        key,
        target: { closest: () => choices[at] },
        preventDefault() {
          prevented = true;
        },
        stopPropagation() {},
      });
      return prevented;
    },
  };
}

test('abas e opções do editor usam setas, Home e End sem sair do grupo', () => {
  for (const [from, key, target] of [
    [0, 'ArrowRight', 1],
    [0, 'ArrowLeft', 2],
    [1, 'Home', 0],
    [0, 'End', 2],
    [2, 'ArrowDown', 0],
  ]) {
    const view = keyboard();
    assert.equal(view.send(from, key), true);
    assert.equal(view.choices[target].focused, true);
    assert.equal(view.choices[target].clicked, true);
  }
});

function ads() {
  const elements = [];
  const T = (tag, className, textContent) => {
    const el = { tag, className, textContent, setAttribute() {} };
    elements.push(el);
    return el;
  };
  const ctx = vm.createContext({
    Zi() {},
    ah() {},
    _a: async () => ({ signedIn: true }),
    gn: () => true,
    Gr: () => [{ id: 'screen', name: 'Tela', aspect: '16:9' }],
    he: { selected: new Set(['screen']) },
    T,
    St: (className, text, onclick) => Object.assign(T('button', className, text), { onclick }),
    __adViewCurrent: (node) => ctx.Gi.open && ctx.Gi.contains(node),
    __adRules: () => '100 pontos',
    __formatPoints: (n) => String(n),
    Cj: () => [{ id: 'approved' }],
    __adCreatedAt: () => 0,
    la() {},
    No() {},
    an: '/api',
    Date,
    Math,
    w4() {},
    Bj() {},
    Gi: { open: true, contains: () => true },
    qt: async () => ({ status: 'paid' }),
    tr: async () => {},
  });
  const start = client.indexOf('async function __simpleAdOrder()');
  const end = client.indexOf('\nfunction No()', start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(client.slice(start, end), ctx);
  return { ctx, elements };
}

test('anúncio exige imagem validada antes da prévia e publicação; tipo inválido limpa seleção', async () => {
  const view = ads();
  await view.ctx.__simpleAdOrder();
  const preview = view.elements.find((el) => el.textContent === 'Ver anúncio no cenário 3D');
  const publish = view.elements.find((el) => el.textContent?.startsWith('Publicar 24h'));
  const library = view.elements.find((el) => el.textContent?.startsWith('Usar anúncio aprovado'));
  const file = view.elements.find((el) => el.type === 'file');
  assert.equal(preview.disabled, true);
  assert.equal(publish.disabled, true);
  library.onclick();
  assert.equal(preview.disabled, false);
  assert.equal(publish.disabled, false);
  file.files = [{ type: 'image/svg+xml', size: 100 }];
  await file.onchange();
  assert.equal(preview.disabled, true);
  assert.equal(publish.disabled, true);
  const status = view.elements.find((el) => el.className === 'sc-small');
  assert.match(status.textContent, /somente PNG/);
});

test('envio do editor congela imagem e metadados e cancela upload após fechar durante exportação', async () => {
  const start = client.indexOf('        const submitted = vV(t);');
  const end = client.indexOf('        if (ee.status === "rejected")', start);
  assert.ok(start > 0 && end > start);
  for (const mode of ['closed', 'replaced', 'current', 'empty']) {
    let finish;
    let uploaded;
    let rendered;
    const draft = { kind: 'cartaz', layers: [{ t: 'text', text: 'Inicial' }] };
    const dialog = { open: true };
    const ctx = vm.createContext({
      t: draft,
      h: dialog,
      Zh: dialog,
      vV: (value) => JSON.parse(JSON.stringify(value)),
      gV: (value) => {
        rendered = value;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      Rv: (value) => value.layers[0].text,
      ey: async (...args) => {
        uploaded = args;
        return {};
      },
    });
    const operation = vm.runInContext('(async () => {' + client.slice(start, end) + '})()', ctx);
    draft.kind = 'bandeira';
    draft.layers[0].text = 'Alterado durante exportação';
    dialog.open = mode !== 'closed';
    if (mode === 'replaced') ctx.Zh = {};
    const image = mode === 'empty' ? null : { type: 'image/png' };
    finish(image);
    if (mode === 'empty') await assert.rejects(operation, /preparar a imagem/);
    else await operation;
    assert.equal(rendered.kind, 'cartaz');
    assert.equal(rendered.layers[0].text, 'Inicial');
    if (mode === 'current') assert.deepEqual(uploaded, [image, 'cartaz', 'Inicial']);
    else assert.equal(uploaded, undefined);
  }
  assert.match(client, /\(__mediaDraftComplete \|\| H3\(t\), N\?\.dispose\(\), h.remove\(\)/);
});

test('resposta de upload tardia do editor não abre confirmação', async () => {
  const start = client.indexOf(
    '        const ee = await ey(image, submitted.kind, Rv(submitted));',
  );
  const end = client.indexOf('        if (ee.status === "rejected")', start);
  assert.ok(start > 0 && end > start);
  let reached = false;
  const ctx = vm.createContext({
    ey: async () => ({}),
    image: {},
    submitted: { kind: 'cartaz' },
    Rv: () => '',
    h: { open: false },
    Zh: {},
    reached: () => {
      reached = true;
    },
  });
  await vm.runInContext('(async () => {' + client.slice(start, end) + '\n reached();})()', ctx);
  assert.equal(reached, false);
});

test('fechar após aquisição não recria rascunho concluído; fechamento comum persiste', () => {
  const begin = client.indexOf(
    '      (__mediaDraftComplete || H3(t), N?.dispose(), h.remove(), Zh === h && (Zh = void 0));',
  );
  assert.ok(begin > 0);
  const statement = client.slice(begin, client.indexOf('\n', begin));
  for (const complete of [true, false]) {
    let saves = 0;
    const h = { remove() {} };
    const ctx = vm.createContext({
      __mediaDraftComplete: complete,
      H3() {
        saves++;
      },
      t: {},
      N: null,
      h,
      Zh: h,
    });
    vm.runInContext(statement, ctx);
    assert.equal(saves, complete ? 0 : 1);
  }
});

test('biblioteca mantém foco equivalente no refresh e usa título após excluir o item', () => {
  const begin = client.indexOf(
    '    if (focused && (document.activeElement === document.body || document.activeElement === i))',
  );
  const end = client.indexOf('\n  };', begin);
  assert.ok(begin > 0 && end > begin);
  for (const exists of [true, false]) {
    const doc = { body: {} };
    doc.activeElement = doc.body;
    const replacement = {
      dataset: { delete: 'design' },
      focus() {
        doc.activeElement = this;
      },
    };
    const title = {
      focus() {
        doc.activeElement = this;
      },
    };
    const i = { querySelectorAll: () => (exists ? [replacement] : []), querySelector: () => title };
    const ctx = vm.createContext({
      document: doc,
      focused: {},
      focusIdentity: 'delete',
      focusValue: 'design',
      i,
    });
    vm.runInContext(client.slice(begin, end), ctx);
    assert.equal(doc.activeElement, exists ? replacement : title);
    if (!exists) assert.equal(title.tabIndex, -1);
  }
});

test('publicação tardia confirma no servidor mas não reabre painel fechado ou substituído', async () => {
  for (const mode of ['closed', 'replaced', 'current']) {
    const view = ads();
    await view.ctx.__simpleAdOrder();
    const publish = view.elements.find((el) => el.textContent?.startsWith('Publicar 24h'));
    const library = view.elements.find((el) => el.textContent?.startsWith('Usar anúncio aprovado'));
    library.onclick();
    let finish,
      requests = 0,
      presentations = 0;
    view.ctx.qt = () => {
      requests++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    view.ctx.la = () => presentations++;
    const operation = publish.onclick();
    view.ctx.Gi.open = mode !== 'closed';
    view.ctx.Gi.contains = () => mode !== 'replaced';
    finish({ status: 'paid', points: 100 });
    await operation;
    assert.equal(requests, 1);
    assert.equal(presentations, mode === 'current' ? 1 : 0);
  }
});

test('cancelamento tardio preserva resultado sem reabrir outro diálogo', async () => {
  const begin = client.indexOf(
    '    const confirm = St("primary", "Confirmar cancelamento", async () => {',
  );
  const end = client.indexOf('\n    la(T("h2", "", "Cancelar campanha?")', begin);
  assert.ok(begin > 0 && end > begin);
  for (const mode of ['closed', 'replaced', 'current']) {
    let callback,
      finish,
      requests = 0,
      presentations = 0;
    const ctx = vm.createContext({
      St: (_cls, _text, handler) => {
        callback = handler;
        return { disabled: false };
      },
      qt: () => {
        requests++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      Gi: { open: true, contains: () => true },
      tr: async () => {},
      _a: async () => {},
      T: () => ({}),
      la: () => presentations++,
      __adViewCurrent: (node) => ctx.Gi.open && ctx.Gi.contains(node),
      __formatPoints: String,
      No() {},
      an: '/api',
      reference: 'one',
      status: {},
    });
    vm.runInContext(client.slice(begin, end), ctx);
    const operation = callback();
    ctx.Gi.open = mode !== 'closed';
    ctx.Gi.contains = () => mode !== 'replaced';
    finish({ refundedPoints: 10 });
    await operation;
    assert.equal(requests, 1);
    assert.equal(presentations, mode === 'current' ? 1 : 0);
  }
});

test('exclusão de cartaz preserva resposta e informa limpeza pendente sem prometer espaço', async () => {
  const begin = client.indexOf('const result = await ty(o.dataset.delete);');
  const end = client.indexOf('\n          } catch (r)', begin);
  assert.ok(begin > 0 && end > begin);
  for (const pending of [true, false]) {
    const status = { textContent: '' };
    const dialog = { open: true, querySelector: () => status };
    let refreshed = 0;
    const ctx = vm.createContext({
      ty: async () => ({ cleanupPending: pending }),
      o: { dataset: { delete: 'design' } },
      i: dialog,
      eu: dialog,
      a: () => refreshed++,
    });
    await vm.runInContext('(async () => {' + client.slice(begin, end) + '})()', ctx);
    assert.equal(refreshed, 1);
    assert.equal(status.textContent.includes('espaço ainda pode permanecer ocupado'), pending);
  }
});

test('cliente servido retorna sinal de limpeza da exclusão de cartaz', async () => {
  const begin = client.indexOf('async function ty(n) {');
  const end = client.indexOf('\nconst nA', begin);
  assert.ok(begin > 0 && end > begin);
  const result = { account: { id: 'account' }, cleanupPending: true };
  let account;
  const ctx = vm.createContext({
    an: '/api',
    qt: async () => result,
    ts: (value) => {
      account = value;
    },
  });
  vm.runInContext(client.slice(begin, end), ctx);
  assert.equal(await ctx.ty('design'), result);
  assert.equal(account, result.account);
});

test('editor substituído fecha pelo ciclo de vida e descarta aquisição tardia', async () => {
  assert.match(client, /\(Zh\?\.close\(\),/);
  for (const name of ['Ds', 'gg']) {
    const begin = client.indexOf(`          const I = await ${name}(`);
    const guard = '\n          if (!h.open || Zh !== h) return;';
    const end = client.indexOf(guard, begin) + guard.length;
    assert.ok(begin > 0 && end > begin, `Guarda de resposta tardia em ${name}`);
    const statement = client.slice(begin, end) + '\n accepted();';
    for (const mode of ['closed', 'replaced', 'current']) {
      let finish;
      let accepted = false;
      const dialog = { open: true };
      const ctx = vm.createContext({
        [name]: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
        ee: {},
        h: dialog,
        Zh: dialog,
        accepted: () => {
          accepted = true;
        },
      });
      const operation = vm.runInContext(`(async () => {${statement}})()`, ctx);
      dialog.open = mode !== 'closed';
      if (mode === 'replaced') ctx.Zh = {};
      finish({});
      await operation;
      assert.equal(accepted, mode === 'current');
    }
  }
});

test('render de canvas pendente ignora editor fechado ou substituído antes de criar texturas', () => {
  const start = client.indexOf('          E = !1;\n          if (Zh !== h || !h.open) return;');
  const end = client.indexOf('          const I = M(),', start);
  assert.ok(start > 0 && end > start);
  for (const mode of ['closed', 'replaced', 'current']) {
    let rendered = false;
    const dialog = { open: mode !== 'closed' };
    const ctx = vm.createContext({
      E: true,
      h: dialog,
      Zh: mode === 'replaced' ? {} : dialog,
      render: () => {
        rendered = true;
      },
    });
    vm.runInContext('(() => {' + client.slice(start, end) + 'render();})()', ctx);
    assert.equal(rendered, mode === 'current');
    assert.equal(ctx.E, false);
  }
});

function designCheckout() {
  let nodes = [],
    finish,
    fail,
    refresh,
    presentations = 0;
  const ctx = vm.createContext({
    T: (tag, className, textContent) => ({ tag, className, textContent }),
    qo() {},
    Br: () => false,
    Re: String,
    er: () => '100 pontos',
    xt: { user: { nick: 'Teste' }, ticket: 'ticket' },
    nA: 'Design',
    an: '/api',
    Gi: { open: true, contains: (node) => nodes.includes(node) },
    ii: (_label, ...content) => {
      nodes = content;
      presentations++;
    },
    qt: () =>
      new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      }),
    Ds: () =>
      new Promise((resolve) => {
        refresh = resolve;
      }),
    I1: (result, options) => options.paid(result),
    ts() {},
    ro() {},
  });
  const begin = client.indexOf('function gg(n) {');
  const end = client.indexOf('\nfunction h_(', begin);
  assert.ok(begin > 0 && end > begin);
  vm.runInContext(client.slice(begin, end), ctx);
  ctx.gg({ id: 'design', kind: 'bandeira', cents: 100, url: '/image' });
  return {
    ctx,
    button: () => nodes.find((node) => node.tag === 'button'),
    finish: () => finish({ status: 'paid', account: { ticket: 'ticket' } }),
    fail: () => fail(new Error('Indisponível')),
    conflict: () => fail(Object.assign(new Error('Este design já é seu'), { status: 409 })),
    refreshed: () => refresh(),
    presentations: () => presentations,
  };
}

test('aquisição de design não reabre confirmação após fechar ou substituir o painel', async () => {
  for (const outcome of ['finish', 'fail', 'conflict']) {
    for (const mode of ['closed', 'replaced', 'current']) {
      const view = designCheckout();
      const operation = view.button().onclick();
      if (mode === 'closed') view.ctx.Gi.open = false;
      if (mode === 'replaced') view.ctx.ii('Outro painel');
      const before = view.presentations();
      view[outcome]();
      if (outcome === 'conflict' && mode === 'current') {
        await new Promise((resolve) => setImmediate(resolve));
        view.refreshed();
      }
      await operation;
      assert.equal(
        view.presentations(),
        before + (mode === 'current' && outcome !== 'fail' ? 1 : 0),
      );
    }
  }
});

test('recuperação de design já adquirido descarta refresh terminado em outro painel', async () => {
  const view = designCheckout();
  const operation = view.button().onclick();
  view.conflict();
  await new Promise((resolve) => setImmediate(resolve));
  view.ctx.ii('Outro painel');
  const before = view.presentations();
  view.refreshed();
  await operation;
  assert.equal(view.presentations(), before);
});
