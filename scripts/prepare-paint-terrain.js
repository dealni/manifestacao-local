/** Extrai apenas geometria conhecida durante o build; nunca é importado pelo servidor. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

function literal(source, name, opening) {
  const match = new RegExp(`\\b${name} = (\\${opening})`).exec(source);
  assert.ok(match, `Geometria de terreno ausente: ${name}`);
  const start = match.index + match[0].length - 1;
  const closing = opening === '[' ? ']' : '}';
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === opening) depth++;
    if (char === closing && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Geometria de terreno incompleta: ${name}`);
}
function declaration(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Função geométrica ausente: ${name}`);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, `Função geométrica incompleta: ${name}`);
  return source.slice(start, end + 2);
}
function validateRoutes(routes, requiredNumbers) {
  assert.ok(Array.isArray(routes), 'Catálogo geométrico inválido: routes');
  for (const route of routes) {
    requiredNumbers(route, ['half'], 'route');
    assert.ok(route.half > 0, 'Domínio geométrico inválido: route.half');
    assert.ok(Array.isArray(route.pts) && route.pts.length >= 2, 'Geometria inválida: route.pts');
    if (Object.hasOwn(route, 'surface'))
      assert.equal(typeof route.surface, 'boolean', 'Geometria inválida: route.surface');
    for (const point of route.pts)
      assert.ok(
        Array.isArray(point) &&
          point.length === 2 &&
          point.every((value) => typeof value === 'number' && Number.isFinite(value)),
        'Geometria inválida: route.pts.point',
      );
  }
}

export function extractPaintTerrain(source) {
  const arrays = ['DC', 'IC', 'GC'].map((name) => literal(source, name, '['));
  const platform = [
    literal(source, 'Ba', '{'),
    declaration(source, 'FC'),
    declaration(source, 'V0'),
    literal(source, 'Pn', '['),
  ];
  // Somente literais e duas funções puras conhecidas; sem acesso ao Node ou ao bundle inteiro.
  const evaluate = (code) => vm.runInNewContext(code, Object.create(null), { timeout: 1000 });
  const [horizontal, vertical, routes] = arrays.map((code) => evaluate(`(${code})`));
  const [settings, platforms] = evaluate(
    `(()=>{const Ba=${platform[0]},Ni=.3;${platform[1]}\n${platform[2]}\nreturn [Ba,${platform[3]}];})()`,
  );
  const requiredNumbers = (value, fields, label) => {
    assert.ok(
      value && typeof value === 'object' && !Array.isArray(value),
      `Geometria inválida: ${label}`,
    );
    for (const field of fields)
      assert.ok(
        typeof value[field] === 'number' && Number.isFinite(value[field]),
        `Campo geométrico inválido: ${label}.${field}`,
      );
  };
  for (const [list, fields, label, lower, upper] of [
    [horizontal, ['z', 'half', 'x0', 'x1'], 'horizontal', 'x0', 'x1'],
    [vertical, ['x', 'half', 'z0', 'z1'], 'vertical', 'z0', 'z1'],
  ]) {
    assert.ok(Array.isArray(list), `Catálogo geométrico inválido: ${label}`);
    for (const road of list) {
      requiredNumbers(road, fields, label);
      assert.ok(
        road.half > 0 && road[lower] < road[upper],
        `Domínio geométrico inválido: ${label}`,
      );
    }
  }
  validateRoutes(routes, requiredNumbers);
  const segments = routes
    .filter((route) => route.surface !== false)
    .flatMap((route) =>
      route.pts.slice(1).flatMap(([bx, bz], index) => {
        const [ax, az] = route.pts[index];
        return Math.hypot(bx - ax, bz - az) < 0.2 ? [] : [{ ax, az, bx, bz, half: route.half }];
      }),
    );
  const scalar = (name) => {
    const match = new RegExp(`\\b${name} = ([\\d.]+)`).exec(source);
    assert.ok(match, `Parâmetro de terreno ausente: ${name}`);
    return Number(match[1]);
  };
  const params = {
    avenueHalf: scalar('_t'),
    cornerRadius: scalar('H4'),
    curbHeight: scalar('Mn'),
    deckHeight: settings.deck,
    stairsRun: settings.stairsRun,
  };
  const geometry = {
    horizontal: horizontal.map(({ z, half, x0, x1 }) => ({ z, half, x0, x1 })),
    vertical: vertical.map(({ x, half, z0, z1 }) => ({ x, half, z0, z1 })),
    segments,
    platforms: platforms.map(({ deck, stairs, foot }) => ({ deck, stairs, foot })),
    params,
  };
  assert.ok(
    horizontal.length > 10 &&
      vertical.length > 10 &&
      segments.length > 50 &&
      platforms.length === 3,
    'Catálogo geométrico incompleto',
  );
  for (const segment of segments) {
    requiredNumbers(segment, ['ax', 'az', 'bx', 'bz', 'half'], 'segment');
    assert.ok(
      segment.half > 0 && Math.hypot(segment.bx - segment.ax, segment.bz - segment.az) >= 0.2,
      'Segmento geométrico degenerado',
    );
  }
  for (const platform of geometry.platforms) {
    for (const name of ['deck', 'stairs']) {
      const rect = platform[name];
      requiredNumbers(rect, ['x0', 'x1', 'z0', 'z1'], `platform.${name}`);
      assert.ok(
        rect.x0 < rect.x1 && rect.z0 < rect.z1,
        `Domínio geométrico inválido: platform.${name}`,
      );
    }
    requiredNumbers(platform.foot, ['at'], 'platform.foot');
    assert.ok(['x', 'z'].includes(platform.foot.axis), 'Geometria inválida: platform.foot.axis');
    if (Object.hasOwn(platform.foot, 'down'))
      requiredNumbers(platform.foot, ['down'], 'platform.foot');
  }
  requiredNumbers(
    params,
    ['avenueHalf', 'cornerRadius', 'curbHeight', 'deckHeight', 'stairsRun'],
    'params',
  );
  assert.ok(
    Object.values(params).every((value) => value > 0) && params.stairsRun > 0.2,
    'Domínio geométrico inválido: params',
  );
  const sourceHash = createHash('sha256')
    .update(JSON.stringify([...arrays, ...platform, params]))
    .digest('hex');
  return JSON.parse(JSON.stringify({ sourceHash, ...geometry }));
}
export function writePaintTerrain(source) {
  const geometry = extractPaintTerrain(source);
  fs.writeFileSync(
    new URL('../src/paint-terrain.json', import.meta.url),
    JSON.stringify(geometry, null, 2) + '\n',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  writePaintTerrain(fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8'));
