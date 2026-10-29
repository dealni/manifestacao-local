export const FLAG_KEYS = [
  'brasil',
  'flavio',
  'capitao',
  'brasil-premium',
  'mito',
  'bolsonaro-17',
  'mito-22',
  'flavio-22',
  'eua-brasil',
  'lula-13',
  'pt',
  'mst',
  'pt-premium',
  'lula-la',
  'lula-2002',
  'amor-venceu',
  'brasil-pt',
  'missao',
  'missao-onca',
  'prendeu-matou',
  'bible',
  'tire',
  'yellow-book',
  'constitution',
  'generic-book',
  'ype',
];
export const BASIC_FLAG_KEYS = [
  'brasil',
  'flavio',
  'capitao',
  'lula-13',
  'pt',
  'mst',
  'missao',
  'missao-onca',
];
export const VEHICLE_KEYS = [
  'caixa',
  'carro',
  'moto',
  'chopper',
  'carrinho-pipoca',
  'tesla-roadster',
  'onca-pintada',
  'calango',
  'dinossauro',
  'carreta',
  'dirigivel',
  'carro-som',
  'caminhao-som',
];
export const OBJECT_KEYS = ['push', 'dialogo', 'foam', 'pillow', 'fish', 'blades'];
export const PASS_KEYS = ['personagens', 'garagem', 'total'];
export const unique = (...lists) => [...new Set(lists.flat().filter((x) => typeof x === 'string'))];
export const catalog = (ctx) =>
  Array.isArray(ctx.catalog) ? ctx.catalog : (ctx.catalog?.items ?? []);
export const POINT_COSTS = Object.freeze({
  acesso: 500,
  pvp: 150,
  objeto: 50,
  bandeira: 50,
  veiculo: 150,
  personagem: 300,
  tinta: 25,
});
export const PASS_COSTS = Object.freeze({ personagens: 600, garagem: 500, total: 1000 });
export function entitlements(ctx, user) {
  if (ctx.freeAccess === true)
    return {
      acesso: true,
      passes: [...PASS_KEYS],
      personagens: catalog(ctx).map((item) => item.key),
      bandeiras: [...FLAG_KEYS],
      veiculos: [...VEHICLE_KEYS],
      pvp: true,
      objetos: [...OBJECT_KEYS],
    };
  const owned = user?.owned ?? {},
    passes = unique(owned.passes);
  const all = passes.includes('total');
  return {
    acesso: user?.premium === true,
    passes,
    personagens: unique(
      owned.skins,
      all || passes.includes('personagens') ? catalog(ctx).map((i) => i.key) : [],
    ),
    bandeiras: unique(BASIC_FLAG_KEYS, owned.bandeiras),
    veiculos: unique(
      ['carro', 'moto'],
      owned.veiculos,
      all || passes.includes('garagem') ? VEHICLE_KEYS : [],
    ),
    pvp: owned.pvpEnabled === true || (owned.pvp?.length ?? 0) > 0,
    objetos: unique(['push'], owned.pvp, owned.objetos),
  };
}
export const hasFreeMissionDesigns = (user) => user?.owned?.designsFree === true;
export const localInk = (user) => ({
  unlimited: true,
  free: 1000000,
  bought: Math.max(0, Number(user?.ink) || 0),
  opened: 0,
  unlimitedOpened: 0,
  given: 0,
  givenOpened: 0,
});
