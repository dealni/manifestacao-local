import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hasFreeMissionDesigns } from './economy.js';

export const prefix = '/api/jogos/manifestacao';

export const screenDefinitions = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL('../data/media-screens.json', import.meta.url)), 'utf8'),
);

export const rules = {
  floors: { large: 100, medium: 100, small: 100 },
  stepCents: 100,
  maxCents: 100000000,
  maxSeconds: 30,
  maxMB: 20,
  slots: 5,
};

export const id = () => randomBytes(12).toString('hex');

export const fail = (status, message) => Object.assign(new Error(message), { status });

export const superchatRules = { min: 100, max: 100000, maxChars: 400 };

export const designPoints = 100;

export const freeDesign = (ctx, user) => ctx.freeAccess === true || hasFreeMissionDesigns(user);

export const owner = (item, user) => item?.userId === user?.id;

export const production = (ctx) => ctx.config?.production ?? process.env.NODE_ENV === 'production';

export function state(ctx) {
  ctx.state.designs ??= [];
  ctx.state.media ??= [];
  ctx.state.mediaBids ??= [];
  ctx.state.mediaPurchases ??= {};
  ctx.state.superchats ??= [];
}
