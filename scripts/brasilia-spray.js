/** Mantém os IDs persistidos, mas exclui fachadas removidas da mira de tinta/borracha. */
export function applyBrasiliaSpray(source) {
  const before = '    const h = H1[d],\n      A = i * h.nx + s * h.nz;';
  const after =
    '    const h = H1[d];\n    if (h.disabled) continue;\n    const A = i * h.nx + s * h.nz;';
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before))
    throw new Error('Patch Brasília incompatível ou ambíguo: mira de spray sem fachadas removidas');
  return source.replace(before, after);
}
