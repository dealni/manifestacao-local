import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ehPasta, listarEntradas, nomeDaEntrada, type Listar } from '../comum/arvore.ts';

// ---- Dados deste repositório ----

/*
 * Contrato do bloco: o código comum abaixo dele só conhece `ALVOS`,
 * `IGNORAR_PASTAS` (nome de pasta em que a varredura não entra, em qualquer
 * profundidade), `FONTES` (as extensões que contam como código aqui),
 * `LIMITE_LINHAS`, `LIMITE_COMPLEXIDADE` e o predicado
 * `dentroDoRecorte(relativo, alvo)`, que recebe o caminho relativo à raiz de
 * cada arquivo de fonte já filtrado pelo piso comum e decide se ele é medido.
 */

/**
 * Escopo próprio deste repositório; testes, gerados e vendor saem pelo piso comum.
 * Os scripts incluídos implementam o cliente/runtime distribuído ao usuário.
 */
const ALVOS = ['src', 'scripts', 'public'];

const IGNORAR_PASTAS = new Set(['node_modules']);

/** Extensões das fontes próprias; declarações, testes e gerados são excluídos. */
const FONTES = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

/**
 * Caminhos, relativos à raiz, que ficam fora da medição. Teste, `.d.ts`,
 * gerado, vendorizado e mock já saem pelo piso comum, logo abaixo do bloco;
 * aqui entra só o que é desta árvore.
 */
const IGNORAR_CAMINHOS: readonly RegExp[] = [
  /^scripts\/vendor\//u,
  /^public\/(?:client\.js|assets\/)/u,
];

/**
 * A partir daqui um arquivo é "grande" e uma função é "complexa". Não são
 * tetos: são as faixas cujo TAMANHO o ratchet não deixa crescer. A política
 * usa 500 linhas físicas por arquivo e complexidade ciclomática 15 por função. Este gate AST é a autoridade de tamanho/complexidade do produto;
 * não há teto ESLint paralelo com outra forma de contar decisões.
 */
export const LIMITE_LINHAS = 500;
export const LIMITE_COMPLEXIDADE = 15;

/** Tudo dentro dos alvos é produto, menos o que a lista acima recusa. */
export const dentroDoRecorte: (relativo: string, alvo: string) => boolean = (relativo) =>
  !IGNORAR_CAMINHOS.some((padrao) => padrao.test(relativo));

// ---- Fim dos dados deste repositório ----

/** Seção exclusiva do ratchet de tamanho e complexidade dentro do baseline. */
export const SECAO = 'tamanho';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));

/** Piso comum: exclui testes, declarações, código gerado e vendorizado. */
const EXCLUIDOS_COMUNS: readonly RegExp[] = [
  /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/u,
  /\.d\.[cm]?ts$/u,
  /\/generated\//u,
  /\/vendor\//u,
  /\/__tests__\//u,
  /\/__mocks__\//u,
];

export type Funcao = {
  readonly caminho: string;
  readonly nome: string;
  readonly identidade?: string;
  readonly linha: number;
  readonly complexidade: number;
};

export type Arquivo = { readonly caminho: string; readonly linhas: number };

export type Medicao = {
  readonly por_arquivo: Readonly<Record<string, number>>;
  readonly por_funcao: Readonly<Record<string, readonly number[]>>;
  readonly arquivos: number;
  readonly linhas: number;
  readonly maior_arquivo: Arquivo;
  readonly arquivos_grandes: number;
  readonly funcoes: number;
  readonly maior_funcao: Funcao;
  readonly funcoes_complexas: number;
};

const ehFonte = (nome: string, relativo: string): boolean =>
  FONTES.test(nome) && !EXCLUIDOS_COMUNS.some((padrao) => padrao.test(relativo));

/** Os arquivos medidos, em caminho relativo à raiz. */
export function descobrirFontes(
  raiz: string = RAIZ,
  alvos: readonly string[] = ALVOS,
  listar: Listar = listarEntradas,
): readonly string[] {
  const achados: string[] = [];
  for (const alvo of alvos) {
    const pilha = [join(raiz, alvo)];
    while (pilha.length > 0) {
      const atual = pilha.pop();
      if (atual === undefined) break;
      let entradas: readonly string[];
      try {
        entradas = listar(atual);
      } catch {
        continue;
      }
      for (const entrada of entradas) {
        const nome = nomeDaEntrada(entrada);
        const caminho = join(atual, nome);
        if (ehPasta(entrada)) {
          if (!IGNORAR_PASTAS.has(nome)) pilha.push(caminho);
          continue;
        }
        const relativo = relative(raiz, caminho).replace(/\\/gu, '/');
        if (ehFonte(nome, relativo) && dentroDoRecorte(relativo, alvo)) {
          achados.push(relativo);
        }
      }
    }
  }
  return achados.sort();
}

const RAMOS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
]);

/**
 * `case` entra e `default` não: `default` não cria caminho novo, é o caminho
 * que já existia. `&&`, `||` e `??` entram porque são desvio de fluxo — a
 * diferença para um `if` é sintática, não de caminho executado.
 */
const OPERADORES = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

const ehFuncao = (no: ts.Node): boolean =>
  ts.isFunctionDeclaration(no) ||
  ts.isFunctionExpression(no) ||
  ts.isArrowFunction(no) ||
  ts.isMethodDeclaration(no) ||
  ts.isConstructorDeclaration(no) ||
  ts.isGetAccessor(no) ||
  ts.isSetAccessor(no);

/** Um ponto de decisão a mais, um caminho a mais para testar. */
function pontosDeDecisao(no: ts.Node): number {
  if (RAMOS.has(no.kind)) return 1;
  return ts.isBinaryExpression(no) && OPERADORES.has(no.operatorToken.kind) ? 1 : 0;
}

/** Complexidade por função: funções aninhadas são medidas separadamente. */
export function complexidadeDe(funcao: ts.Node): number {
  let total = 1;
  const visitar = (no: ts.Node): void => {
    if (no !== funcao && ehFuncao(no)) return;
    total += pontosDeDecisao(no);
    ts.forEachChild(no, visitar);
  };
  ts.forEachChild(funcao, visitar);
  return total;
}

function nomeDe(no: ts.Node): string {
  const nomeado = no as { readonly name?: ts.Node };
  if (nomeado.name !== undefined && ts.isIdentifier(nomeado.name)) {
    return nomeado.name.text;
  }
  const pai = no.parent as ts.Node | undefined;
  if (pai !== undefined && ts.isVariableDeclaration(pai) && ts.isIdentifier(pai.name)) {
    return pai.name.text;
  }
  if (pai !== undefined && ts.isPropertyAssignment(pai) && ts.isIdentifier(pai.name)) {
    return pai.name.text;
  }
  return nomeado.name?.getText().replace(/\s+/gu, '') ?? '<anônima>';
}

/** Identidade lexical, independente de linhas, formatação e corpo da função. */
function segmentoDe(no: ts.Node): string {
  const nome = nomeDe(no);
  if (nome !== '<anônima>') return `${ts.SyntaxKind[no.kind]}:${nome}`;
  const pai = no.parent;
  if (ts.isCallExpression(pai)) {
    return `callback:${calleeDe(pai.expression)}:${pai.arguments.indexOf(no as ts.Expression)}`;
  }
  if (ts.isConstructorDeclaration(no)) return 'constructor';
  return ts.SyntaxKind[no.kind];
}

function elementoAncora(no: ts.Node): boolean {
  return (
    ts.isIdentifier(no) ||
    ts.isStringLiteral(no) ||
    ts.isNumericLiteral(no) ||
    (ts.isPropertyAccessExpression(no) && elementoAncora(no.expression))
  );
}

/** Só o alvo lexical: chamadas anteriores nunca carregam seus argumentos. */
function calleeDe(no: ts.Expression): string {
  if (ts.isIdentifier(no) || ts.isPrivateIdentifier(no)) return no.text;
  if (ts.isPropertyAccessExpression(no)) return `${calleeDe(no.expression)}.${no.name.text}`;
  if (ts.isElementAccessExpression(no))
    return `${calleeDe(no.expression)}[${calleeDe(no.argumentExpression)}]`;
  if (ts.isCallExpression(no) || ts.isNewExpression(no)) return `${calleeDe(no.expression)}()`;
  return alvoAtomico(no);
}

function alvoAtomico(no: ts.Expression): string {
  if (
    ts.isParenthesizedExpression(no) ||
    ts.isAsExpression(no) ||
    ts.isTypeAssertionExpression(no) ||
    ts.isNonNullExpression(no) ||
    ts.isSatisfiesExpression(no)
  )
    return calleeDe(no.expression);
  if (ts.isStringLiteral(no)) return JSON.stringify(no.text);
  if (ts.isNumericLiteral(no)) return no.text;
  if (no.kind === ts.SyntaxKind.ThisKeyword) return 'this';
  if (no.kind === ts.SyntaxKind.SuperKeyword) return 'super';
  return `<${ts.SyntaxKind[no.kind]}>`;
}

function ancoraDeChamada(no: ts.CallExpression): string {
  const literais = no.arguments
    .filter(
      (arg) =>
        ts.isStringLiteral(arg) ||
        ts.isNumericLiteral(arg) ||
        (ts.isArrayLiteralExpression(arg) && arg.elements.every(elementoAncora)),
    )
    .map((arg) =>
      ts.isStringLiteral(arg)
        ? JSON.stringify(arg.text)
        : ts.isArrayLiteralExpression(arg)
          ? `[${arg.elements.map((elemento) => calleeDe(elemento)).join(',')}]`
          : calleeDe(arg),
    );
  return `chamada:${calleeDe(no.expression)}:${literais.join(',')}`;
}

export function identidadeDe(no: ts.Node): string {
  const partes = [segmentoDe(no)];
  let pai: ts.Node | undefined = no.parent;
  while (pai !== undefined && !ts.isSourceFile(pai)) {
    if (ehFuncao(pai)) partes.unshift(segmentoDe(pai));
    else if (ts.isCallExpression(pai)) partes.unshift(ancoraDeChamada(pai));
    else if (
      ts.isClassDeclaration(pai) ||
      ts.isClassExpression(pai) ||
      ts.isVariableDeclaration(pai) ||
      ts.isPropertyAssignment(pai)
    ) {
      partes.unshift(pai.name?.getText().replace(/\s+/gu, '') ?? '<classe>');
    }
    pai = pai.parent;
  }
  return partes.join('/');
}

/** Todas as funções de um arquivo, com a complexidade de cada uma. */
export function funcoesDoArquivo(caminho: string, conteudo: string): readonly Funcao[] {
  const fonte = ts.createSourceFile(
    caminho,
    conteudo,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/u.test(caminho) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const funcoes: Funcao[] = [];
  const visitar = (no: ts.Node): void => {
    if (ehFuncao(no)) {
      funcoes.push({
        caminho,
        nome: nomeDe(no),
        identidade: identidadeDe(no),
        linha: fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1,
        complexidade: complexidadeDe(no),
      });
    }
    ts.forEachChild(no, visitar);
  };
  ts.forEachChild(fonte, visitar);
  return funcoes;
}
