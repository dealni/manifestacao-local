export function replaceOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || first !== source.lastIndexOf(before))
    throw new Error(`Patch de pontos incompatível ou ambíguo: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}

export function replaceRegion(source, start, end, replacement) {
  const at = source.indexOf(start),
    until = source.indexOf(end, at + start.length);
  if (at < 0 || until < 0 || at !== source.lastIndexOf(start))
    throw new Error(`Região de mídia incompatível: ${start}`);
  return source.slice(0, at) + replacement + '\n' + source.slice(until);
}
