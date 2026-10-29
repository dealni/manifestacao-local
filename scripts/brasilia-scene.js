import { brasiliaSceneRuntimeSource } from './brasilia-scene-runtime.js';
import { brasiliaModelRuntimeSource } from './brasilia-model-client.js';
import { brasiliaLayout } from '../src/brasilia-layout.js';
export { brasiliaLayout };

// Executado apenas na preparação: mantém o bundle e os assets públicos intactos.
export function applyBrasiliaScene(source) {
  const patch = (name, before, after) => {
    if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before))
      throw new Error(`Patch Brasília incompatível ou ambíguo: ${name}`);
    source = source.replace(before, after);
  };
  const runtime = brasiliaSceneRuntimeSource();
  source = runtime + brasiliaModelRuntimeSource() + source;
  patch(
    'atualização progressiva dos modelos Brasília',
    '    (_1.update(ot.x, ot.z),',
    '    (__brasiliaModelController?.update(Ue?Mt.x:ot.x,Ue?Mt.z:ot.z), _1.update(ot.x, ot.z),',
  );
  patch(
    'remoção de lotes no renderer',
    'if (!(e && !h.walk && h.h < 14))',
    'if (!__brasiliaRemoved.has(h.id) && !(e && !h.walk && h.h < 14))',
  );
  patch(
    'marcos e Brasília',
    '      this.conjunto(t),\n      this.fiesp(t),\n      K1 && this.antenna(K1.x, K1.z, Mn + K1.roof),',
    '      __brasiliaScene(this),',
  );
  patch(
    'colisões dos lotes antigos',
    'for (let n = 0; n < dl.length; n += 5)\n  lh.push(',
    'for (let n = 0; n < dl.length; n += 5)\n  if (!__brasiliaIsClearedCollider(dl[n],dl[n+1],dl[n+2],dl[n+3],__brasiliaLayout)) lh.push(',
  );
  patch(
    'marcos no índice comum de prédios',
    'const tt = {\n    x: yi.masp.x,',
    'lh.push(...__brasiliaSolids);\nconst tt = {\n    x: yi.masp.x,',
  );
  patch(
    'colisões de solo independem dos componentes aéreos',
    '    ...lh,\n    ...V4.map',
    '    ...lh.filter(s=>!s.brasilia),\n    ...__brasiliaGroundSolids,\n    ...V4.map',
  );
  patch(
    'volume aéreo dos componentes',
    '      new _(n.x - n.w / 2 - 0.4, 0, n.z - n.d / 2 - 0.4),',
    '      new _(n.x - n.w / 2 - 0.4, n.bottom ? Mn+n.bottom : 0, n.z - n.d / 2 - 0.4),',
  );
  patch(
    'Roadster usa prédios restantes e marcos por componente',
    '    ...Kk.flatMap((n) =>',
    `    ...[...Kk.filter(n=>!__brasiliaShouldClearBuilding(n.points,__brasiliaLayout)),
      ...__brasiliaSolids.map(s=>({points:[[s.x-s.w/2,s.z-s.d/2],[s.x+s.w/2,s.z-s.d/2],[s.x+s.w/2,s.z+s.d/2],[s.x-s.w/2,s.z+s.d/2]],height:s.height,bottom:s.bottom,inset:false,walk:false}))
    ].flatMap((n) =>`,
  );
  patch(
    'fachadas sem letreiros suspensos',
    '    jE.forEach((s, o) => {\n      const r = s.nz,',
    '    jE.forEach((s, o) => {\n      if (__brasiliaClearPoint(s.x, s.z) || __brasiliaInPlot(s.x,s.z)) return;\n      const r = s.nz,',
  );
  patch(
    'pilares claros pavilhão',
    'new At({ color: "#d42a1e", roughness: 0.5, metalness: 0.02 })',
    'new At({ color: "#e8e5d9", roughness: 0.65, metalness: 0.02 })',
  );
  patch(
    'marca do pavilhão',
    '{ text: "MASP", font: "900 230px Arial", y: 150, color: "#b2271f" }',
    '{ text: "PAVILHÃO", font: "900 150px Arial", y: 150, color: "#315c68" }',
  );
  patch(
    'subtítulo do pavilhão',
    'text: "MUSEU DE ARTE DE SÃO PAULO",',
    'text: "CULTURA E CONVIVÊNCIA",',
  );
  // Não remover segmentos da lista: IDs de pintura w<índice>.<tile> continuam estáveis.
  patch(
    'superfícies desativadas preservam índices',
    '          t.push({\n            ax: d,',
    '          t.push({\n            disabled: __brasiliaLayout.removedBuildings.some(b=>b.index===a),\n            ax: d,',
  );
  patch(
    'superfícies removidas não recebem pintura',
    '    if (!a || i * Ot >= a.L) return null;',
    '    if (!a || a.disabled || i * Ot >= a.L) return null;',
  );
  patch(
    'arborização e colisões juntas',
    '  j2(Mi[n].x, Mi[n].z) && Mi.splice(n, 1);',
    '  (!__brasiliaKeepTree(Mi[n].x,Mi[n].z) || j2(Mi[n].x, Mi[n].z)) && Mi.splice(n, 1);',
  );
  patch(
    'colisões de árvores removidas',
    '  Yt[n].kind === "tree" && j2(Yt[n].x, Yt[n].z) && Yt.splice(n, 1);',
    '  Yt[n].kind === "tree" && (!__brasiliaKeepTree(Yt[n].x,Yt[n].z) || j2(Yt[n].x, Yt[n].z)) && Yt.splice(n, 1);',
  );
  patch(
    'arborização aberta',
    '(this.all = [...Mi, ...i].filter((a) => !j2(a.x, a.z) && !G4(a.x, a.z)))',
    '(this.all = [...Mi, ...i].filter((a) => __brasiliaKeepTree(a.x,a.z) && !j2(a.x, a.z) && !G4(a.x, a.z)))',
  );
  const garden = brasiliaLayout.clearedPlots
    .map(
      (p) =>
        `(p.x>${p.x - p.w / 2}&&p.x<${p.x + p.w / 2}&&p.y>${p.z - p.d / 2}&&p.y<${p.z + p.d / 2})`,
    )
    .join('||');
  patch(
    'gramados do minimapa antes das ruas',
    '  ((s.fillStyle = r), A(-_t, ht.minZ, _t, ht.maxZ));',
    `  s.fillStyle = "#597b56";
  for (const plot of __brasiliaLayout.clearedPlots)
    A(plot.x-plot.w/2,plot.z-plot.d/2,plot.x+plot.w/2,plot.z+plot.d/2);
  ((s.fillStyle = r), A(-_t, ht.minZ, _t, ht.maxZ));`,
  );
  patch(
    'marcos no minimapa',
    '  for (const u of lh)\n    A(u.x - u.w / 2, u.z - u.d / 2, u.x + u.w / 2, u.z + u.d / 2);\n  return (',
    '  for (const u of lh)\n    A(u.x - u.w / 2, u.z - u.d / 2, u.x + u.w / 2, u.z + u.d / 2);\n  __brasiliaMapLandmarks(s,A);\n  return (',
  );
  patch('pavilhão claro no minimapa', '(s.fillStyle = "#c0473a")', '(s.fillStyle = "#d8d5c9")');
  patch(
    'gramados da Esplanada',
    '        diffuseColor.rgb=col; blockN=nrm; blockRough=rough;',
    `        if((${garden})&&!aveWalk&&cd>3.2){ col=vec3(0.24,0.36,0.16)*(0.9+0.2*nzMacro.g); nrm=vec3(0.0,0.0,1.0); rough=0.96; }\n        diffuseColor.rgb=col; blockN=nrm; blockRough=rough;`,
  );
  return source;
}
