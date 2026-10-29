import { entitlements } from './economy.js';

const premiumCharacters = Object.freeze({
  5: 'flavio-hipotetico',
  6: 'lula-prime',
  7: 'bolsonaro-peixe',
  10: 'renan-santos',
  11: 'ana-hering',
  12: 'super-xandao',
  13: 'renato-battista',
  14: 'kim-kataguiri',
});
const vehicleKeys = Object.freeze({
  3: 'carreta',
  4: 'dirigivel',
  5: 'carro-som',
  6: 'caminhao-som',
  8: 'chopper',
  9: 'dinossauro',
  10: 'calango',
  11: 'onca-pintada',
  12: 'tesla-roadster',
  13: 'carrinho-pipoca',
});
export function playerUser(player, ctx) {
  const id = player.userId ?? player.user?.id;
  return ctx.state.users?.find((user) => String(user.id) === String(id)) ?? null;
}
export function playerEntitlements(player, ctx) {
  return entitlements(ctx, playerUser(player, ctx));
}
export function canUseCharacter(player, ctx, character) {
  if (!Number.isInteger(character) || character < 0 || character > 14) return false;
  return (
    !premiumCharacters[character] ||
    playerEntitlements(player, ctx).personagens.includes(premiumCharacters[character])
  );
}
export function canUseSkin(player, ctx, key) {
  if (key == null || key === '') return true;
  const items = Array.isArray(ctx.catalog) ? ctx.catalog : (ctx.catalog?.items ?? []);
  return (
    typeof key === 'string' &&
    items.some((item) => item.key === key) &&
    playerEntitlements(player, ctx).personagens.includes(key)
  );
}
export function canUseVehicle(player, ctx, mode) {
  // Carro e moto mantêm o transporte básico e as missões disponíveis.
  if ([0, 1, 7].includes(mode)) return true;
  return (
    !!vehicleKeys[mode] && playerEntitlements(player, ctx).veiculos.includes(vehicleKeys[mode])
  );
}
export function canUsePvp(player, ctx, weapon = 'push') {
  const rights = playerEntitlements(player, ctx);
  return rights.pvp && (weapon === 'push' || rights.objetos.includes(weapon));
}

const flagKeys = Object.freeze({
  1: 'brasil',
  2: 'flavio',
  3: 'capitao',
  4: 'brasil-premium',
  5: 'mito',
  6: 'bolsonaro-17',
  7: 'mito-22',
  8: 'flavio-22',
  9: 'eua-brasil',
  10: 'lula-13',
  11: 'pt',
  12: 'mst',
  13: 'pt-premium',
  14: 'lula-la',
  15: 'lula-2002',
  16: 'amor-venceu',
  17: 'brasil-pt',
  18: 'missao',
  19: 'missao-onca',
  20: 'prendeu-matou',
  21: 'bible',
  22: 'tire',
  23: 'yellow-book',
  24: 'constitution',
  25: 'generic-book',
  26: 'ype',
});
const basicFlags = new Set([0, 1, 2, 3, 10, 11, 12, 18, 19]);
export function sanitizeAppearance(player, ctx, value) {
  const appearance = Number(value) >>> 0;
  const flag = ((appearance >>> 12) & 15) | (((appearance >>> 19) & 1) << 4);
  if (basicFlags.has(flag)) return appearance;
  if (flagKeys[flag] && playerEntitlements(player, ctx).bandeiras.includes(flagKeys[flag]))
    return appearance;
  if (flag === 30 || flag === 31) {
    const user = playerUser(player, ctx);
    if (
      user &&
      (ctx.state.designs ?? []).some(
        (design) =>
          design.id === player.design &&
          String(design.userId ?? design.owner) === String(user.id) &&
          design.paid === true &&
          design.status === 'approved' &&
          design.kind === (flag === 30 ? 'cartaz' : 'bandeira'),
      )
    )
      return appearance;
  }
  // As bandeiras usam somente os quatro bits baixos de flag e o bit adicional 19.
  return (appearance & ~((15 << 12) | (1 << 19))) >>> 0;
}
