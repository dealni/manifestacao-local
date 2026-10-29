import { requireServedArtifact } from './helpers/served-artifact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildAccount } from '../src/economy.js';
import babel from 'prettier/plugins/babel';
import {
  applyProductionHtml,
  applyProductionAvailabilityCopy,
  versionMutableAssets,
  applyEmailCodeLogin,
} from '../scripts/production-client.js';

const existing = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const client = requireServedArtifact(
  existing,
  'const __loopbackClient =',
  'data-beta-account',
  'function __emailLoginAvailable()',
);
const ast = babel.parsers.babel.parse(client);
function declaration(name) {
  const node = ast.program.body.find(
    (node) => node.type === 'FunctionDeclaration' && node.id.name === name,
  );
  assert.ok(node, name);
  return client.slice(node.start, node.end);
}
function emailContext(hostname = 'manifestacoes.com', available = true) {
  const dialogs = [];
  const forms = [];
  const requests = [];
  const elements = [];
  const context = vm.createContext({
    location: { hostname },
    xt: { auth: { emailLoginAvailable: available } },
    e_: 'Conta',
    __loopbackClient: hostname === 'localhost',
    __localAuthCodes: new Map(),
    Rx: 0,
    clearInterval() {},
    setInterval() {
      return 1;
    },
    Date,
    Number,
    __withReferral: (_path, body) => body,
    __clearReferral() {},
    Gi: { open: true, contains: (input) => context.currentField === input },
    ii: (...args) => dialogs.push(args),
    T: (tag, className, text) => ({ tag, text, setAttribute() {} }),
    Zr: (text, callback) => {
      const button = { text, callback, disabled: false };
      elements.push(button);
      return button;
    },
    Kr: (type, autocomplete) => ({
      type,
      autocomplete,
      value: '',
      checkValidity() {
        return this.value.includes('@');
      },
    }),
    go: (label, input) => ({ label, input }),
    Ch: (...args) => {
      context.currentField = args[2][0].input;
      forms.push(args);
    },
    qt: async (path, options) => {
      requests.push({ path, body: JSON.parse(options.body) });
      return context.response;
    },
    ro: () => {
      context.closed = true;
    },
    v2: async () => {
      context.loggedIn = true;
    },
  });
  context.response = { resendAfter: 60 };
  vm.runInContext(
    applyEmailCodeLogin('function Ea(n = "entrar", e = "", t = "") {}\nfunction t_(n, e) {}'),
    context,
  );
  return { context, dialogs, forms, requests, elements };
}

test('conta pública de produção informa disponibilidade real ao formulário de login', () => {
  const ctx = {
    state: {},
    config: { production: true, emailCodeSecret: 's'.repeat(32) },
    emailDelivery: { available: true },
  };
  const account = buildAccount(ctx, null);
  assert.equal(account.auth.emailLoginAvailable, true);
  assert.equal(account.auth.registrationAvailable, false);
  const { context, forms } = emailContext();
  context.xt = account;
  context.Ea();
  assert.equal(forms.at(-1)[0], 'Entrar com e-mail');
  ctx.emailDelivery.available = false;
  context.xt = buildAccount(ctx, null);
  const before = forms.length;
  context.Ea();
  assert.equal(forms.length, before);
});

test('login indisponível mantém visitante e não constrói formulário nem promete código', () => {
  const { context, dialogs, forms } = emailContext('manifestacoes.com', false);
  context.Ea();
  assert.equal(forms.length, 0);
  assert.equal(dialogs[0][1].text, 'Login temporariamente indisponível');
  assert.match(dialogs[0][2].text, /visitante/);
  dialogs[0][3].callback();
  assert.equal(context.closed, true);
});

test('e-mail válido solicita código; código inválido não envia; confirmação usa contrato sem senha', async () => {
  const { context, forms, requests, elements } = emailContext();
  context.Ea();
  const emailForm = forms.at(-1);
  assert.equal(emailForm[0], 'Entrar com e-mail');
  assert.equal(emailForm[2].length, 1);
  await assert.rejects(emailForm[4](), /e-mail válido/);
  emailForm[2][0].input.value = ' Pessoa@Exemplo.com ';
  await emailForm[4]();
  assert.equal(requests[0].path, '/api/auth/email/request');
  assert.deepEqual(requests[0].body, { email: 'pessoa@exemplo.com' });
  const codeForm = forms.at(-1);
  assert.equal(codeForm[0], 'Digite o código');
  assert.equal(codeForm[2][0].input.autocomplete, 'one-time-code');
  await assert.rejects(codeForm[4](), /6 dígitos/);
  const resend = elements.find((element) => element.text === 'Reenviar código');
  assert.equal(resend.disabled, true);
  await resend.callback();
  assert.equal(requests.length, 1, 'cooldown impede reenvio');
  codeForm[2][0].input.value = '123456';
  await codeForm[4]();
  assert.equal(requests[1].path, '/api/auth/email/verify');
  assert.deepEqual(requests[1].body, { email: 'pessoa@exemplo.com', code: '123456' });
  assert.equal(context.loggedIn, true);
});

test('código de desenvolvimento nunca aparece em público e trocar e-mail preserva valor', () => {
  for (const hostname of ['manifestacoes.com', 'localhost']) {
    const { context, forms } = emailContext(hostname);
    context.Ea('email-codigo', 'pessoa@exemplo.com', '', { localCode: '654321', resendAfter: 30 });
    const codeForm = forms.at(-1);
    assert.equal(codeForm[5][0].textContent.includes('654321'), hostname === 'localhost');
    codeForm[5][2].callback();
    assert.equal(forms.at(-1)[2][0].input.value, 'pessoa@exemplo.com');
  }
});

test('resposta atrasada de envio não substitui outro diálogo aberto após fechar login', async () => {
  const { context, forms } = emailContext();
  let resolve;
  context.response = new Promise((done) => {
    resolve = done;
  });
  context.Ea();
  const emailForm = forms.at(-1);
  emailForm[2][0].input.value = 'pessoa@exemplo.com';
  const pending = emailForm[4]();
  context.Gi.open = false;
  context.currentField = null;
  context.Gi.open = true; // Outro diálogo usa o mesmo elemento Gi, com novo conteúdo.
  resolve({ resendAfter: 60 });
  await pending;
  assert.equal(forms.length, 1);
  assert.equal(forms.at(-1)[0], 'Entrar com e-mail');
});

test('confirmação atrasada não fecha nem atualiza outro diálogo aberto', async () => {
  const { context, forms } = emailContext();
  let resolve;
  context.response = new Promise((done) => {
    resolve = done;
  });
  context.Ea('email-codigo', 'pessoa@exemplo.com');
  const form = forms.at(-1);
  form[2][0].input.value = '123456';
  const pending = form[4]();
  context.currentField = null; // ii substituiu o conteúdo do diálogo durante a verificação.
  resolve({ user: { nick: 'Pessoa' } });
  await pending;
  assert.equal(context.loggedIn, undefined);
});

test('WebSocket utiliza HTTPS/WSS público e continua suportando localhost', () => {
  for (const [href, expected] of [
    ['https://manifestacoes.com/', 'wss://manifestacoes.com/ws'],
    ['http://127.0.0.1:4173/', 'ws://127.0.0.1:4173/ws'],
  ]) {
    const ctx = vm.createContext({
      URL,
      Ps: '/',
      Om: 0,
      Um: '',
      location: { href, protocol: new URL(href).protocol },
    });
    vm.runInContext(declaration('ig'), ctx);
    assert.equal(ctx.ig(), expected);
  }
  assert.match(client, /fetch\(`\$\{Ps\}servidores`/);
  assert.match(client, /"manifestacoes.com", "www.manifestacoes.com"\]\.includes\(s_\)/);
});

test('transformação HTML adiciona a origem WSS pública a uma fixture local', () => {
  const fixture =
    "connect-src 'self' blob: data: ws://127.0.0.1:* ws://localhost:*; Modo local, sem pagamentos reais.";
  const html = applyProductionHtml(fixture);
  assert.match(html, /wss:\/\/manifestacoes.com/);
  assert.match(html, /Beta gratuito, sem pagamentos reais/);
  assert.equal(applyProductionHtml(html), html);
});

test('HTML informa beta sem pagamentos e CSP permite apenas WebSocket público esperado', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /id="local-mode-notice"/);
  assert.match(html, /wss:\/\/manifestacoes.com/);
  assert.doesNotMatch(html, /wss:\/\/\*/);
});

test('beta público esclarece visitante, acesso com código e permanência offline sem mudar controles locais', () => {
  const fixture =
    'globalThis.copy = ["Personagem fica sempre conectado", "Jogue grátis sem login. Entre para guardar compras e seu visual.", "Entre para comprar", "Seu visual fica salvo: você volta para a avenida do jeito que estava."];';
  // Inclui os trechos reais de onboarding, obrigatórios no patch assertivo.
  const originalBundle = readFileSync(
    new URL('../analysis/client-readable.js', import.meta.url),
    'utf8',
  );
  const rawStatus = originalBundle.match(/<p id="access-status"[\s\S]*?<\/p>/)[0];
  const rawBenefits = originalBundle.match(/<p id="access-benefits"[\s\S]*?<\/p>/)[0];
  const requiredRaw = `;const onboarding = \`${rawStatus}${rawBenefits}<small class="character-price">Grátis · beta · permanente</small>\`;`;
  const patched = applyProductionAvailabilityCopy(fixture + requiredRaw);
  for (const loopback of [true, false]) {
    const context = vm.createContext({ __loopbackClient: loopback });
    vm.runInContext(patched, context);
    assert.equal(context.copy[0], 'Personagem ativo enquanto você joga');
    assert.match(context.copy[1], loopback ? /guardar compras/ : /código enviado ao seu e-mail/);
    assert.equal(
      context.copy[2],
      loopback ? 'Entre para comprar' : 'Benefício para contas confirmadas',
    );
    assert.match(context.copy[3], loopback ? /visual fica salvo/ : /personagem básico.*visitante/);
  }
  const disclaimer = applyProductionAvailabilityCopy(
    '"Mesmo quando você sai, seu personagem continua passeando pela avenida."' + requiredRaw,
  );
  assert.match(disclaimer, /permanência offline não está disponível/);
  assert.doesNotMatch(disclaimer, /continua passeando/);
});

test('HTML real de onboarding gerado informa limites do beta e preserva opções locais', () => {
  const source = client;
  for (const loopback of [true, false]) {
    const ctx = vm.createContext({ __loopbackClient: loopback });
    for (const id of ['access-status', 'access-benefits']) {
      const markup = source.match(new RegExp(`<p id="${id}"[\\s\\S]*?<\\/p>`))[0];
      const rendered = vm.runInContext('`' + markup + '`', ctx);
      assert.match(
        rendered,
        loopback ? /pontos|código.*e-mail|e-mail.*código/i : /código.*e-mail|e-mail.*código/i,
      );
      assert.doesNotMatch(rendered, /compra opcional|próprios preços/);
    }
  }
});

test('HTML versiona cliente e CSS pelo conteúdo sem alterar assets originais', () => {
  const html =
    '<script src="/local-compat.js"></script><script src="/client.js"></script><link href="/local.css"><link href="/assets/index-CyQa0fiC.css">';
  const files = new Map([
    ['/client.js', 'client v1'],
    ['/local.css', 'css v1'],
    ['/local-compat.js', 'compat js'],
  ]);
  const first = versionMutableAssets(html, files);
  const version = (result, filename) =>
    result.match(new RegExp(filename.replaceAll('.', '\\.') + '\\?v=([a-f0-9]{12})'))?.[1];
  for (const filename of files.keys()) assert.match(version(first, filename), /^[a-f0-9]{12}$/);
  assert.match(first, /href="\/assets\/index-CyQa0fiC\.css"/);
  assert.equal(versionMutableAssets(first, files), first);
  files.set('/client.js', 'client v2');
  const second = versionMutableAssets(first, files);
  assert.notEqual(version(first, '/client.js'), version(second, '/client.js'));
  assert.equal(version(first, '/local.css'), version(second, '/local.css'));
  files.set('/local.css', 'css v2');
  const third = versionMutableAssets(second, files);
  assert.notEqual(version(second, '/local.css'), version(third, '/local.css'));
  assert.equal(version(second, '/client.js'), version(third, '/client.js'));
  assert.throws(() => versionMutableAssets(html, new Map()), /Conteúdo ausente/);
});

test('HTML versiona também folhas adicionais de design', () => {
  const files = new Map([
    ['/client.js', 'client'],
    ['/local.css', 'base'],
    ['/local-compat.js', 'compat'],
    ['/design-entry.css', 'entry'],
    ['/design-controls.css', 'controls'],
  ]);
  const html = [...files.keys()].map((file) => `<link href="${file}">`).join('');
  const first = versionMutableAssets(html, files);
  assert.match(first, /design-entry\.css\?v=[a-f0-9]{12}/);
  files.set('/design-entry.css', 'entry updated');
  const second = versionMutableAssets(first, files);
  assert.notEqual(first, second);
  assert.equal(first.match(/design-controls[^"]+/)[0], second.match(/design-controls[^"]+/)[0]);
});
