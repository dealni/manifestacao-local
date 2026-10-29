import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  keepActivityFocus,
  applyActivitiesDesign,
  activityLocalNotice,
} from '../scripts/design-activities.js';

function fixture() {
  const doc = { body: {}, activeElement: null };
  const panel = {
    hidden: false,
    tagName: 'DIALOG',
    open: true,
    scrollTop: 71,
    children: [],
    contains(element) {
      return this.children.includes(element);
    },
    querySelectorAll() {
      return this.children;
    },
  };
  const control = (key, disabled = false) => ({
    dataset: { testid: key },
    disabled,
    focus() {
      doc.activeElement = this;
    },
  });
  globalThis.document = doc;
  return {
    doc,
    panel,
    control,
    render(next) {
      panel.children = next;
      doc.activeElement = doc.body;
      panel.scrollTop = 0;
    },
  };
}

test('atualização preserva o controle selecionado e rolagem da corrida/PvP', () => {
  const f = fixture(),
    before = f.control('race-join'),
    after = f.control('race-join');
  f.panel.children = [f.control('close'), before];
  f.doc.activeElement = before;
  keepActivityFocus(f.panel, () => f.render([after, f.control('close')]));
  assert.equal(f.doc.activeElement, after);
  assert.equal(f.panel.scrollTop, 71);
});
test('não captura foco que foi para outro modal ou que estava fora do painel', () => {
  for (const originallyInside of [true, false]) {
    const f = fixture(),
      external = {},
      before = f.control('weapon');
    f.panel.children = [before];
    f.doc.activeElement = originallyInside ? before : external;
    keepActivityFocus(f.panel, () => {
      f.render([f.control('weapon')]);
      f.doc.activeElement = external;
    });
    assert.equal(f.doc.activeElement, external);
  }
});
test('controle desaparecido usa primeiro botão disponível; painel fechado não recupera foco', () => {
  for (const open of [true, false]) {
    const f = fixture(),
      before = f.control('join'),
      close = f.control('close');
    f.panel.children = [before];
    f.doc.activeElement = before;
    keepActivityFocus(f.panel, () => {
      f.render([f.control('disabled', true), close]);
      f.panel.open = open;
    });
    assert.equal(f.doc.activeElement, open ? close : f.doc.body);
  }
});
test('seleção do spray preserva foco por data attribute inclusive zero', () => {
  const f = fixture(),
    before = { dataset: { mode: '0' }, textContent: 'Tinta' },
    after = f.control('');
  after.dataset = { mode: '0' };
  f.panel.tagName = 'DIV';
  f.panel.children = [before];
  f.doc.activeElement = before;
  keepActivityFocus(f.panel, () => f.render([after]));
  assert.equal(f.doc.activeElement, after);
});
test('patch gerado é assertivo e configura grupos de botões, rótulos e contrato PvP', () => {
  const source = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const patched = applyActivitiesDesign(source);
  assert.throws(() => applyActivitiesDesign(''), /ausente/);
  assert.throws(() => applyActivitiesDesign(patched), /incompatível ou ambíguo/);
  assert.equal((patched.match(/return __activitiesKeepFocus\(this.panel/g) || []).length, 3);
  assert.match(patched, /spray-mode" role="group"/);
  assert.match(patched, /data-size="\$\{kt\}"[^>]*aria-label="\$\{Ke\}"/);
  assert.match(patched, /outro time que também ativaram o PvP/);
});

test('debate devolve foco ao gatilho no Escape/fechar, mas preserva clique em controle externo', async () => {
  const vm = await import('node:vm');
  const source = applyActivitiesDesign(
    readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8'),
  );
  const start = source.indexOf('  showPanel() {'),
    end = source.indexOf('  async devices()', start);
  assert.ok(start > 0 && end > start);
  const methods = source.slice(start, end);
  for (const leaveByExternalControl of [false, true]) {
    const doc = { activeElement: null },
      external = {},
      inside = {
        blur() {
          doc.activeElement = doc.body;
        },
      };
    const opener = {
      isConnected: true,
      closest: () => null,
      focus() {
        doc.activeElement = this;
      },
    };
    const ctx = vm.createContext({ document: doc });
    vm.runInContext(`globalThis.Panel = class { ${methods} };`, ctx);
    const panel = new ctx.Panel();
    panel.dialog = {
      hidden: true,
      contains: (element) => element === inside,
      querySelector: () => ({
        focus() {
          doc.activeElement = inside;
        },
      }),
    };
    panel.action = () => {};
    doc.activeElement = opener;
    panel.showPanel();
    assert.equal(doc.activeElement, inside);
    if (leaveByExternalControl) doc.activeElement = external;
    panel.hidePanel();
    assert.equal(panel.dialog.hidden, true);
    assert.equal(doc.activeElement, leaveByExternalControl ? external : opener);
  }
});

test('missão de atropelamentos exibe progresso e conclusão reais sem bloqueio artificial', async () => {
  const { default: vm } = await import('node:vm');
  const source = applyActivitiesDesign(
    readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8'),
  );
  const classStart = source.indexOf('class tU {');
  const methodStart = source.indexOf('  __activities_renderPanel() {', classStart);
  const methodEnd = source.indexOf('\n}\nconst PE', methodStart);
  assert.ok(methodStart > classStart && methodEnd > methodStart);
  const T = (tag, className = '', textContent = '') => ({
    tag,
    className,
    textContent,
    children: [],
    dataset: {},
    append(...items) {
      this.children.push(...items);
    },
    replaceChildren(...items) {
      this.children = items;
    },
    setAttribute() {},
  });
  const ctx = vm.createContext({
    T,
    gn: () => true,
    JA: (mission) => ({ ...mission.goals }),
    Wh: (counts, key) => counts[key] || 0,
    jl: (key, value) => String(value),
    w3: { vehicleHits: 'Atropelamentos' },
  });
  vm.runInContext(`globalThis.Panel = class { ${source.slice(methodStart, methodEnd)} };`, ctx);
  const catalog = [
    {
      id: 'contatos',
      title: 'Na avenida',
      rewardLabel: 'Moto',
      description: 'Conduza.',
      goals: { vehicleHits: 3 },
    },
  ];
  for (const complete of [false, true]) {
    const panel = new ctx.Panel();
    Object.assign(panel, {
      panel: T('dialog'),
      state: { index: complete ? 1 : 0, counts: { vehicleHits: 2 } },
      completed: new Set(complete ? ['contatos'] : []),
      catalog: () => catalog,
      reward: (mission) => mission.rewardLabel,
      saveStatus: () => 'Progresso salvo.',
    });
    panel.__activities_renderPanel();
    const flatten = (element) => [element, ...element.children.flatMap(flatten)];
    const elements = flatten(panel.panel),
      text = elements.map((element) => element.textContent).join(' ');
    assert.doesNotMatch(text, /indisponível|não pode ser concluída|ainda não são contados/i);
    assert.match(text, /Moto/);
    if (complete) assert.match(text, /Concluída · recompensa liberada/);
    else {
      assert.equal(elements.find((element) => element.tag === 'progress').value, 2);
      assert.match(text, /2 \/ 3/);
      assert.match(text, /Ambos precisam ter conta, estar com PvP ligado e fora da área de paz/);
      assert.match(text, /Repetir a mesma pessoa só conta novamente após 2 minutos/);
    }
  }
});

test('instruções das atrações descrevem mecânicas e custos locais funcionais', () => {
  assert.match(activityLocalNotice('triplex'), /viagem do elevador/);
  assert.match(activityLocalNotice('liberty'), /desafio cooperativo/);
  assert.match(activityLocalNotice('chair-plaza'), /PvP ativo/);
  assert.match(activityLocalNotice('whale-pool'), /12 segundos/);
  assert.match(activityLocalNotice('tire-camp'), /portais a pé/);
  assert.match(activityLocalNotice('congress'), /3 fichas fictícias/);
  assert.match(activityLocalNotice('congress'), /ganhar 5 fichas/);
  assert.match(activityLocalNotice('temple'), /proteção.*10 segundos/);
  assert.match(activityLocalNotice('bank'), /não há transferência real/);
  assert.equal(activityLocalNotice('alien'), '');
  assert.equal(activityLocalNotice('unknown'), '');
});

test('atrações preservam status dinâmico e executam câmera da baleia sem ação duplicada', async () => {
  const { default: vm } = await import('node:vm');
  const source = applyActivitiesDesign(
    readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8'),
  );
  const start = source.indexOf('  render() {', source.indexOf('class sW {'));
  const end = source.indexOf('\n}\nconst ou', start);
  assert.ok(start > 0 && end > start);
  const element = () => ({
    dataset: {},
    children: [],
    setAttribute() {},
    append(item) {
      this.children.push(item);
    },
    querySelector(selector) {
      return this.children.find((item) => selector.includes(`"${item.dataset.action}"`));
    },
    querySelectorAll() {
      return this.children;
    },
  });
  let whaleAt = null,
    sends = 0;
  const ctx = vm.createContext({
    performance: { now: () => 1000 },
    document: { createElement: element },
    __activitiesLocalNotice: activityLocalNotice,
  });
  vm.runInContext(`globalThis.Panel = class { ${source.slice(start, end)} };`, ctx);
  const panel = new ctx.Panel();
  Object.assign(panel, {
    net: {
      id: 'me',
      serverNow: () => 1000,
      send() {
        sends++;
      },
    },
    state: {
      wind: { fill: 0 },
      factory: {},
      rides: [{ place: 'triplex', owner: 'me', at: 0, requested: 9, actual: 6 }],
      wards: [{ owner: 'me', until: 10000 }],
    },
    progress: { sitio: {}, coins: 3, ready: {}, hp: 100 },
    local: { x: 0, z: 0 },
    open: true,
    button: element(),
    panel: element(),
    title: element(),
    description: element(),
    status: element(),
    actions: element(),
    world: {
      watchWhale(at) {
        whaleAt = at;
      },
    },
  });
  panel.current = { id: 'temple', name: 'Altar', description: '', actions: [] };
  panel.render();
  assert.equal(panel.status.textContent, 'Proteção ativa: 9 s');
  panel.current = { id: 'triplex', name: 'Elevador', description: '', actions: [] };
  panel.render();
  assert.match(panel.status.textContent, /Você pediu 9º · subindo/);
  panel.current = {
    id: 'congress',
    name: 'Congresso',
    description: '',
    x: 0,
    z: 0,
    actions: [
      { key: 'open-gate', label: 'Abrir com 3 fichas', x: 0, z: 0, radius: 3 },
      { key: 'collect-emenda', label: 'Examinar cofre', x: 0, z: 0, radius: 3 },
    ],
  };
  panel.actions = element();
  panel.state.gate = { until: 0 };
  panel.progress.coins = 2;
  panel.render();
  assert.deepEqual(
    panel.actions.children.map((item) => item.disabled),
    [true, true],
  );
  panel.progress.coins = 3;
  panel.render();
  assert.deepEqual(
    panel.actions.children.map((item) => item.disabled),
    [false, true],
  );
  panel.state.gate = { openedAt: 500, until: 10000 };
  panel.render();
  assert.deepEqual(
    panel.actions.children.map((item) => item.disabled),
    [true, true],
    'aguarda abertura visual de 700 ms',
  );
  panel.state.gate.openedAt = 200;
  panel.render();
  assert.deepEqual(
    panel.actions.children.map((item) => item.disabled),
    [true, false],
  );
  panel.progress.ready.congress = 50000;
  panel.render();
  assert.deepEqual(
    panel.actions.children.map((item) => item.disabled),
    [true, true],
    'cofre respeita recarga individual',
  );
  panel.current = {
    id: 'chair-plaza',
    name: 'Cadeiras',
    description: '',
    x: 0,
    z: 0,
    actions: [{ key: 'launch-chair', label: 'Lançar', x: 0, z: 0, radius: 3 }],
  };
  panel.actions = element();
  panel.progress.ready['chair-plaza'] = 2000;
  panel.render();
  assert.equal(panel.actions.children[0].disabled, true);
  panel.progress.ready['chair-plaza'] = 1000;
  panel.render();
  assert.equal(panel.actions.children[0].disabled, false);
  panel.net.options = { spectate: true };
  panel.render();
  assert.equal(panel.actions.children[0].disabled, true);
  assert.match(panel.status.textContent, /Saia do modo espectador/);
  panel.actions.children[0].onclick();
  assert.equal(sends, 0);
  panel.actions = element();
  panel.current = {
    id: 'whale-pool',
    name: 'Baleia',
    description: '',
    x: 0,
    z: 0,
    actions: [{ key: 'watch-whale', label: 'Observar', x: 0, z: 0, radius: 3 }],
  };
  panel.render();
  const watch = panel.actions.children[0];
  watch.onclick();
  assert.equal(whaleAt, 1000);
  assert.equal(panel.open, false);
  assert.equal(sends, 0);
});

test('restauração ignora controles ocultos, inertes e removidos da navegação por teclado', () => {
  const f = fixture();
  const before = f.control('choice');
  const hidden = f.control('choice');
  hidden.closest = () => ({});
  const inert = f.control('inert');
  inert.closest = () => ({});
  const excluded = f.control('excluded');
  excluded.getAttribute = () => '-1';
  const fieldsetDisabled = f.control('fieldset-disabled');
  fieldsetDisabled.matches = () => true;
  const available = f.control('close');
  f.panel.children = [before];
  f.doc.activeElement = before;
  keepActivityFocus(f.panel, () =>
    f.render([hidden, inert, excluded, fieldsetDisabled, available]),
  );
  assert.equal(f.doc.activeElement, available);
});

test('restauração não escolhe controles sem layout ou com visibility oculto por CSS', () => {
  for (const visibility of ['hidden', 'collapse']) {
    const f = fixture();
    const before = f.control('join');
    const withoutLayout = f.control('join');
    withoutLayout.getClientRects = () => [];
    const invisible = f.control('join');
    invisible.getClientRects = () => [{}];
    const visible = f.control('close');
    visible.getClientRects = () => [{}];
    f.doc.defaultView = {
      getComputedStyle: (element) => ({
        visibility: element === invisible ? visibility : 'visible',
      }),
    };
    f.panel.children = [before];
    f.doc.activeElement = before;
    keepActivityFocus(f.panel, () => f.render([withoutLayout, invisible, visible]));
    assert.equal(f.doc.activeElement, visible);
  }
});

test('Escape de atrações fecha apenas o painel que detém o foco e devolve ao gatilho', async () => {
  const { default: vm } = await import('node:vm');
  const source = applyActivitiesDesign(
    readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8'),
  );
  const original = 'l.key === "Escape" && !l.defaultPrevented';
  const start = source.indexOf(original);
  const end = source.indexOf(';', start);
  assert.ok(start > 0 && end > start);
  for (const context of ['inside', 'trigger', 'outside', 'modal', 'prevented']) {
    const inside = {},
      outside = {};
    const doc = { activeElement: null, querySelector: () => (context === 'modal' ? {} : null) };
    const button = {
      focus() {
        doc.activeElement = this;
      },
    };
    const panel = {
      open: true,
      panel: { contains: (item) => item === inside },
      button,
      render() {},
    };
    doc.activeElement = context === 'trigger' ? button : context === 'outside' ? outside : inside;
    let prevented = false;
    const event = {
      key: 'Escape',
      defaultPrevented: context === 'prevented',
      preventDefault() {
        prevented = true;
      },
    };
    const execute = vm.runInNewContext(`(function(l) { ${source.slice(start, end + 1)} })`, {
      document: doc,
    });
    execute.call(panel, event);
    const closes = context === 'inside' || context === 'trigger';
    assert.equal(panel.open, !closes, context);
    assert.equal(prevented, closes, context);
    if (closes) assert.equal(doc.activeElement, button);
  }
});
