import { readFileSync } from 'node:fs';
import babel from 'prettier/plugins/babel';

const screens = JSON.parse(
  readFileSync(new URL('../data/media-screens.json', import.meta.url), 'utf8'),
);

// Os nomes originais são chaves da malha viária e da corrida, não conteúdo editorial.
export const streetDisplayNames = Object.freeze({
  'Avenida Paulista': 'Eixo Monumental',
  'Rua Augusta': 'Acesso da Torre de TV',
  'Rua Padre João Manuel': 'Acesso do Setor Comercial',
  'Alameda Ministro Rocha Azevedo': 'Via dos Jardins',
  'Rua Peixoto Gomide': 'Acesso do Pavilhão Cultural',
  'Alameda Casa Branca': 'Via do Conjunto Cultural',
  'Rua Itapeva': 'Via da Catedral',
  'Rua Pamplona': 'Acesso da Esplanada',
  'Rua Carlos Comenale': 'Via Cultural',
  'Alameda Santos': 'Via Lateral do Eixo',
});

export function brasiliaText(value) {
  if (Object.hasOwn(streetDisplayNames, value)) return value;
  return value
    .replaceAll('MUSEU DE ARTE DE SÃO PAULO', 'PAVILHÃO CULTURAL DE BRASÍLIA')
    .replaceAll('SÃO PAULO / AVENIDA PAULISTA', 'BRASÍLIA / EIXO MONUMENTAL')
    .replaceAll('AVENIDA PAULISTA', 'EIXO MONUMENTAL')
    .replaceAll('AV. PAULISTA', 'EIXO MONUMENTAL')
    .replaceAll('na Avenida Paulista', 'no Eixo Monumental')
    .replaceAll('da Avenida Paulista', 'do Eixo Monumental')
    .replaceAll('pela Avenida Paulista', 'pelo Eixo Monumental')
    .replaceAll('inspirado na Avenida Paulista', 'inspirado em Brasília')
    .replaceAll('Além da Paulista', 'Além do Eixo')
    .replaceAll('longe da Paulista', 'longe do Eixo')
    .replaceAll('80 m da Paulista', '80 m do Eixo')
    .replaceAll('na Paulista', 'em Brasília')
    .replaceAll('da Paulista', 'de Brasília')
    .replaceAll('para a Paulista', 'para Brasília')
    .replaceAll('Atualizando a Paulista', 'Atualizando Brasília')
    .replaceAll('Entrando na Paulista', 'Entrando em Brasília')
    .replaceAll('toda a Paulista', 'toda Brasília')
    .replaceAll('Brisa da Augusta', 'Brisa do Cerrado')
    .replaceAll('no Parque Mário Covas', 'nos Jardins da Torre')
    .replaceAll('no Parque Trianon', 'nos Jardins Centrais')
    .replaceAll('no Trianon', 'nos Jardins Centrais')
    .replaceAll('Parque Mário Covas', 'Jardins da Torre')
    .replaceAll('Parque Trianon', 'Jardins Centrais')
    .replaceAll('Trianon-Masp', 'Conjunto Cultural')
    .replaceAll('TRIANON-MASP', 'CONJUNTO CULTURAL')
    .replaceAll('Centro Cultural Fiesp', 'Centro Cultural da Esplanada')
    .replaceAll('FIESP', 'Esplanada')
    .replaceAll('Fiesp', 'Esplanada')
    .replaceAll('MASP', 'Pavilhão Cultural')
    .replaceAll('Trianon', 'Jardins Centrais')
    .replaceAll('Mário Covas', 'Jardins da Torre')
    .replaceAll('CONSOLAÇÃO', 'TORRE DE TV')
    .replaceAll('Avenida Paulista', 'Eixo Monumental')
    .replaceAll('Av. Paulista', 'Eixo Monumental')
    .replaceAll('Paulista', 'Brasília')
    .replaceAll('PAULISTA', 'BRASÍLIA')
    .replaceAll('SÃO PAULO <span>', 'BRASÍLIA <span>')
    .replaceAll('SÃO PAULO', 'BRASÍLIA')
    .replaceAll('São Paulo', 'Brasília')
    .replaceAll('BEM-VINDO À BRASÍLIA', 'BEM-VINDO A BRASÍLIA')
    .replaceAll(
      'Mapa estilizado inspirado na Eixo Monumental.',
      'Mapa compacto e estilizado inspirado em Brasília.',
    )
    .replaceAll(' · N ↑', ' · EIXO ↑')
    .replaceAll('CARLOS COMENALE', 'VIA CULTURAL');
}

function replaceOnce(source, before, after) {
  if (source.indexOf(before) < 0 || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error(`Patch Brasília conteúdo incompatível ou ambíguo: ${before.slice(0, 80)}`);
  }
  return source.replace(before, after);
}

/** Muda apenas textos e geometria aprovada dos painéis; IDs e lookup de ruas sobrevivem. */
export function applyBrasiliaContent(source) {
  const ast = babel.parsers.babel.parse(source);
  const edits = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'StringLiteral') {
      const next = brasiliaText(node.value);
      if (next !== node.value) edits.push([node.start, node.end, JSON.stringify(next)]);
      return;
    }
    if (node.type === 'TemplateElement') {
      const next = brasiliaText(node.value.raw);
      if (next !== node.value.raw) edits.push([node.start, node.end, next]);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'extra' || key === 'comments') continue;
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  }
  visit(ast.program);
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0]))
    source = source.slice(0, start) + value + source.slice(end);
  const helper = `\nfunction __brasiliaPlaceName(value) { return (${JSON.stringify(streetDisplayNames)})[value] ?? value; }\n`;
  source = replaceOnce(source, 'const Oe = Mn,', helper + 'const Oe = Mn,');
  source = replaceOnce(
    source,
    '  nG = (n) =>\n    n\n',
    '  nG = (n) =>\n    __brasiliaPlaceName(n)\n',
  );
  source = replaceOnce(
    source,
    '${A.street} → VIA CULTURAL',
    '${__brasiliaPlaceName(A.street)} → VIA CULTURAL',
  );
  source = replaceOnce(source, '${u.street}`', '${__brasiliaPlaceName(u.street)}`');
  source = replaceOnce(source, '${l.street}`', '${__brasiliaPlaceName(l.street)}`');
  source = replaceOnce(
    source,
    'new Map(ao.map((n) => [n.id, n]));',
    `// Identidade e poses compartilhadas com o servidor; IDs dos anúncios permanecem.\nconst __brasiliaScreens = ${JSON.stringify(screens)};\nao.splice(0, ao.length, ...__brasiliaScreens.map(local => Object.assign(ao.find(screen => screen.id === local.id) ?? {}, local)));\nnew Map(ao.map((n) => [n.id, n]));`,
  );
  // Fachada e galeria podem ocupar o mesmo ponto no chão, em alturas diferentes.
  // Separe seus alvos apenas no diagrama, preservando a pose real usada na câmera.
  source = replaceOnce(
    source,
    '      u = Gs("circle", {\n        cx: h.z,\n        cy: h.x,',
    `      overlaps = n.filter(screen => {
        const pose = ao.find(item => item.id === screen.id);
        return pose && Math.hypot(pose.x - h.x, pose.z - h.z) < 0.5;
      }),
      diagramX = h.z + (overlaps.findIndex(screen => screen.id === d.id) - (overlaps.length - 1) / 2) * 42,
      u = Gs("circle", {
        cx: diagramX,
        cy: h.x,`,
  );
  source = replaceOnce(
    source,
    '      r.append(u));\n  }\n  return r;\n}\nfunction HS(',
    `      diagramX !== h.z && r.append(Gs("line", {
        x1: h.z, y1: h.x, x2: diagramX, y2: h.x,
        stroke: "#a4f4ce", "stroke-width": 1, "pointer-events": "none",
      })),
      r.append(u));
  }
  return r;
}
function HS(`,
  );
  // Apenas 17 painéis cujas fachadas saíram do cenário recebem suportes urbanos.
  // Como os postes de iluminação existentes, são elementos delgados sem volume de colisão.
  source = replaceOnce(
    source,
    '      if (o.mount === "masp") {',
    `      if (o.brasiliaSupport) {\n        const supportBottom = bt(o.x, o.z);\n        const supportTop = o.y - o.h / 2 + 0.35;\n        const supportHeight = Math.max(0.35, supportTop - supportBottom);\n        i.set("color", 0.24, 0.28, 0.3);\n        for (const offset of [-0.32, 0.32]) {\n          const sx = o.x - c.x * 0.5 - c.z * o.w * offset;\n          const sz = o.z - c.z * 0.5 + c.x * o.w * offset;\n          i.box(sx, supportBottom + supportHeight / 2, sz, 0.32, supportHeight, 0.32);\n        }\n      }\n      if (o.mount === "masp") {`,
  );
  return source;
}
