// Fixtures somente de compilação: nenhuma saída JavaScript é gerada ou executada.
import { encodeNear, decodeInput, prepareNearGroup, encodeNearFromGroup } from '../src/protocol.js';
import { loadRuntimeConfig, clientIp, createRateLimiter } from '../src/runtime-config.js';

const actor = { id: 1, x: 0, z: 0 };
const config = loadRuntimeConfig({ port: 4173, production: false });
const request = { headers: { host: 'localhost:4173' }, socket: { remoteAddress: '127.0.0.1' } };
encodeNear([actor], 1, 1, { seq: 3, held: 0 });
encodeNearFromGroup(prepareNearGroup(new Map([[1, actor]]), 1), actor, undefined);
clientIp(request, config);
createRateLimiter(config).check(request, { limit: 2 });
const input = decodeInput(Buffer.alloc(10));
if (input?.pose) input.pose.x.toFixed();

// @ts-expect-error Coordenadas de rede devem ser numéricas.
encodeNear([{ id: 1, x: '0', z: 0 }], 1);
// @ts-expect-error ACK exige o número de inputs mantidos.
encodeNear([actor], 1, 1, { seq: 3 });
// @ts-expect-error Sobrescritas em código devem usar números, não strings do ambiente.
loadRuntimeConfig({ port: '4173' });
// @ts-expect-error Input decodificado pode ser inválido e exige tratar null.
decodeInput(Buffer.alloc(10)).seq;
// @ts-expect-error Custos do rate limiter devem ser numéricos.
createRateLimiter(config).check(request, { cost: '1' });
