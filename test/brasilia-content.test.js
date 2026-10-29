import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import babel from 'prettier/plugins/babel';
import {
  applyBrasiliaContent,
  brasiliaText,
  streetDisplayNames,
} from '../scripts/brasilia-content.js';
import { RACE_GATES } from '../src/race.js';
import { brasiliaLayout, landmarkSolids } from '../src/brasilia-layout.js';

const screens = JSON.parse(
  readFileSync(new URL('../data/media-screens.json', import.meta.url), 'utf8'),
);

function clientDeclaration(source, name, kind = 'function') {
  const ast = babel.parsers.babel.parse(source);
  const declaration = ast.program.body.find(
    (node) =>
      node.type === (kind === 'class' ? 'ClassDeclaration' : 'FunctionDeclaration') &&
      node.id?.name === name,
  );
  assert.ok(declaration, `${name} existe no cliente`);
  return source.slice(declaration.start, declaration.end);
}

test('mapa original distingue fachada e galeria empilhadas sem alterar seus IDs ou poses reais', () => {
  const source = applyBrasiliaContent(
    readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8'),
  );
  const selected = [];
  const node = (tag, attrs = {}) => ({
    tag,
    attrs,
    children: [],
    events: {},
    append(...children) {
      this.children.push(...children);
    },
    addEventListener(type, fn) {
      this.events[type] = fn;
    },
  });
  const context = vm.createContext({
    Gs: node,
    ht: { minZ: -640, maxZ: 640 },
    so: [],
    sk: [],
    _t: 20,
    Ut: { minX: 30, maxX: 90, minZ: -100, maxZ: 100 },
    tt: { x: -40, z: 0, w: 20, d: 30 },
    ao: structuredClone(screens),
    Hc: screens[0].id,
    Re: String,
  });
  vm.runInContext(clientDeclaration(source, 'GS'), context);
  const svg = context.GS(
    screens.map((screen) => ({ ...screen, size: screen.kind, min: 100 })),
    [],
    (id) => selected.push(id),
    new Set(),
  );
  const dots = svg.children.filter((child) => child.tag === 'circle');
  assert.equal(dots.length, 65);
  const facade = dots.find((dot) => dot.attrs['data-id'] === 'consolacao-torre');
  const gallery = dots.find((dot) => dot.attrs['data-id'] === 'consolacao-torre-galeria');
  assert.ok(Math.abs(facade.attrs.cx - gallery.attrs.cx) > 26);
  facade.events.click();
  gallery.events.keydown({ key: 'Enter', preventDefault() {} });
  assert.deepEqual(selected, ['consolacao-torre', 'consolacao-torre-galeria']);
  assert.deepEqual(context.ao, screens);
});

test('câmera original procura a pose canônica por ID ao abrir cada painel', () => {
  const source = applyBrasiliaContent(
    readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8'),
  );
  class Vector {
    constructor(x = 0, y = 0, z = 0) {
      Object.assign(this, { x, y, z });
    }
    clone() {
      return new Vector(this.x, this.y, this.z);
    }
  }
  const calls = [];
  const context = vm.createContext({
    _: Vector,
    oi: class {},
    NS: 49,
    ao: structuredClone(screens),
    performance: { now: () => 0 },
    Kv: (pose) => {
      calls.push(pose);
      return {
        pos: new Vector(pose.x, pose.y, pose.z),
        target: new Vector(pose.x, pose.y, pose.z),
      };
    },
  });
  vm.runInContext(clientDeclaration(source, 'uj', 'class') + ';globalThis.Camera = uj;', context);
  const camera = new context.Camera({ domElement: { clientWidth: 480, clientHeight: 800 } }, {});
  for (const id of ['consolacao-torre', 'consolacao-torre-galeria', 'trianon-outdoor-1']) {
    camera.go(id);
    const expected = screens.find((screen) => screen.id === id);
    assert.equal(calls.at(-1).id, id);
    assert.deepEqual(
      [camera.flight.to.target.x, camera.flight.to.target.y, camera.flight.to.target.z],
      [expected.x, expected.y, expected.z],
    );
  }
});

test('Brasília mantém os portais, larguras e coordenadas originais da corrida', () => {
  assert.equal(
    createHash('sha256').update(JSON.stringify(RACE_GATES)).digest('hex'),
    '9fe98c028ec6246b385f6e95973f3d3e5eac5418a21b28410e9a4dbda7fea3f7',
  );
  assert.equal(streetDisplayNames['Avenida Paulista'], 'Eixo Monumental');
});

test('identidade editorial muda sem trocar nomes técnicos de ruas, arquivos ou chaves locais', () => {
  assert.equal(
    brasiliaText('Brasília Livre · MASP · Parque Trianon'),
    'Brasília Livre · Pavilhão Cultural · Jardins Centrais',
  );
  assert.equal(brasiliaText('Avenida Paulista'), 'Avenida Paulista');
  assert.equal(brasiliaText('Rua Itapeva'), 'Rua Itapeva');
  assert.equal(brasiliaText('paulista-audience'), 'paulista-audience');
  assert.equal(brasiliaText('models/trianon-billboard-v1.glb'), 'models/trianon-billboard-v1.glb');
  assert.equal(brasiliaText('© OSM · N ↑'), '© OSM · EIXO ↑');
  assert.equal(brasiliaText('AV. PAULISTA'), 'EIXO MONUMENTAL');
  assert.equal(
    brasiliaText('Escolha um lugar no MASP, no Trianon ou no Parque Mário Covas.'),
    'Escolha um lugar no Pavilhão Cultural, nos Jardins Centrais ou nos Jardins da Torre.',
  );
  assert.equal(brasiliaText('no Parque Trianon'), 'nos Jardins Centrais');
});

test('gerador aplica conteúdo no cliente original e mantém JavaScript válido e lookup de corrida', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const result = applyBrasiliaContent(original);
  assert.doesNotThrow(() => babel.parsers.babel.parse(result));
  assert.ok(result.includes('so.find((o) => o.name === "Rua Carlos Comenale")'));
  assert.ok(result.includes('localStorage.getItem("paulista-audience")'));
  assert.ok(result.includes('EIXO ↑'));
  assert.ok(result.includes('Brasília Livre'));
  assert.ok(result.includes('${__brasiliaPlaceName(u.street)}'));
  const prefix = result.slice(
    result.indexOf('function __brasiliaPlaceName('),
    result.indexOf('function Xh('),
  );
  const context = vm.createContext({
    Mn: 0,
    Uc: [{ name: 'Rua Augusta' }, { name: 'Avenida Paulista' }],
  });
  vm.runInContext(prefix + ';globalThis.labels=iG;', context);
  assert.deepEqual(Array.from(context.labels), ['ACESSO DA TORRE DE TV', 'EIXO MONUMENTAL']);
});

test('65 painéis preservam identidade e formato e os17 suportes mantêm escala urbana', () => {
  assert.equal(screens.length, 65);
  assert.equal(new Set(screens.map((s) => s.id)).size, 65);
  assert.equal(screens.filter((s) => s.brasiliaSupport).length, 17);
  for (const screen of screens) {
    assert.ok(screen.name && screen.where);
    assert.ok(!/Paulista|MASP|Trianon|FIESP/.test(screen.name + ' ' + screen.where));
    assert.ok(Math.abs(screen.w / screen.h - (screen.aspect === '16:9' ? 16 / 9 : 9 / 16)) < 0.002);
    if (screen.brasiliaSupport) {
      assert.ok(screen.w <= 10 && screen.h <= 8);
      assert.ok(screen.y - screen.h / 2 >= 2.9999);
      assert.ok(screen.y + screen.h / 2 <= 22);
    }
  }
});

test('painéis adaptados e suas duas colunas ficam fora dos novos volumes monumentais', () => {
  const solids = landmarkSolids(brasiliaLayout);
  for (const screen of screens.filter((s) => s.brasiliaSupport)) {
    const points = [];
    for (let i = 0; i <= 20; i++) {
      const offset = (i / 20 - 0.5) * screen.w;
      points.push([screen.x - screen.nz * offset, screen.z + screen.nx * offset]);
    }
    for (const offset of [-0.32, 0.32])
      points.push([
        screen.x - screen.nx * 0.5 - screen.nz * screen.w * offset,
        screen.z - screen.nz * 0.5 + screen.nx * screen.w * offset,
      ]);
    for (const [px, pz] of points)
      for (const [x, z, w, d] of solids) {
        assert.ok(
          !(Math.abs(px - x) < w / 2 + 0.18 && Math.abs(pz - z) < d / 2 + 0.18),
          `${screen.id} cruza o volume ${x},${z}`,
        );
      }
  }
});
