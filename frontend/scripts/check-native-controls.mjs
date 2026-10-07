#!/usr/bin/env node
/**
 * Guarda estática "UI própria" (FE-S-112): nenhum controle nativo do navegador pode aparecer no
 * frontend. Não usa regex sobre HTML/TS: lê a AST do Angular (`@angular/compiler`, `parseTemplate`)
 * para templates e a AST do TypeScript para o código, então formas como `type=date` sem aspas,
 * `type="{{k}}"`, `bind-type`, `>` dentro de atributo, `template: '...'` com aspas simples,
 * `styles: [...]`, `host: {'[attr.title]': ...}` e `window['alert']` são pegas.
 *
 * Falha o `npm run lint` se encontrar:
 *  - tags `select datalist details summary dialog progress meter`;
 *  - `<input>` com `type` fora da lista PERMITIDA (`text`, `email`, `password`; sem `type` = text) e
 *    `type` dinâmico (`[type]`, `[attr.type]`, `bind-type`);
 *  - atributos/bindings `title`, `popover`, `popovertarget`, `popovertargetaction`, `contenteditable`,
 *    `ngNativeValidate`, `[innerHTML]`/`[outerHTML]`;
 *  - TS: `createElement` de tag proibida ou não literal, `setAttribute`/`setProperty`/`.type =` com
 *    tipo proibido ou dinâmico, `.title/.popover/.contentEditable/.innerHTML/.outerHTML =`,
 *    `insertAdjacentHTML`, `createContextualFragment`, `DOMParser`, `document.write`,
 *    `bypassSecurityTrustHtml`, `alert/confirm/prompt` (inclusive `window['alert']`), `showPicker`,
 *    `showModal`, e literais de texto/template com HTML nativo (cobre `innerHTML = '<select>'`);
 *  - CSS (arquivos, `styles` e literais): `::-webkit-calendar-picker-indicator`, `::-webkit-datetime-edit`,
 *    `accent-color`, `resize` diferente de `none`.
 * Alternativas: Select, DatePicker, MonthPicker, Checkbox, Switch, Disclosure, Tooltip, ConfirmDialog
 * (src/app/common/components). Permitidos: <input> de texto (text, email, password), <textarea>, <button>.
 * Única exceção (ALLOWLIST, FE-S-119): o <input type="file"> escondido do FilePicker.
 * O teste de runtime `e2e/native-controls.e2e.ts` cobre o que nenhuma análise estática alcança.
 *
 * Exceção: só por entrada em ALLOWLIST (arquivo, regra, motivo). Sem baseline: o conjunto é vazio.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTemplate } from '@angular/compiler';
import ts from 'typescript';

/** Tipos de `<input>` permitidos (texto). Tudo o mais tem componente próprio. */
export const ALLOWED_INPUT_TYPES = ['text', 'email', 'password'];
const BANNED_TAGS = ['select', 'datalist', 'details', 'summary', 'dialog', 'progress', 'meter'];
const BANNED_ATTRIBUTES = [
  'title',
  'popover',
  'popovertarget',
  'popovertargetaction',
  'contenteditable',
  'ngnativevalidate',
  'innerhtml',
  'outerhtml',
];
/** Propriedades do DOM cuja escrita fora de `this` é proibida. */
const BANNED_DOM_PROPS = ['popover', 'contenteditable', 'innerhtml', 'outerhtml'];
const DIALOG_FUNCTIONS = ['alert', 'confirm', 'prompt'];
const HTML_SINKS = ['insertAdjacentHTML', 'createContextualFragment', 'bypassSecurityTrustHtml'];

const ALTERNATIVE = {
  select: 'use app-select',
  datalist: 'use app-select com busca',
  details: 'use app-disclosure',
  summary: 'use app-disclosure',
  dialog: 'use app-confirm-dialog ou app-overlay-panel',
  progress: 'desenhe a barra com um elemento próprio e role="progressbar"',
  meter: 'desenhe a barra com um elemento próprio e role="meter"',
  'input-type':
    'use app-date-picker, app-month-picker, app-checkbox, app-switch ou app-text-field (type text|email|password)',
  'dynamic-input-type': 'o tipo do input precisa ser estático (text, email ou password)',
  title: 'use appTooltip (dica própria) e texto visível ou aria-label',
  'native-attr':
    'popover, contenteditable, ngNativeValidate e innerHTML dependem de UI nativa: use os componentes próprios',
  dialogs: 'use app-confirm-dialog (nada de alert/confirm/prompt/showModal)',
  'show-picker': 'use os seletores próprios (app-date-picker...)',
  'create-element':
    'crie o controle com o componente próprio equivalente (tag literal e permitida)',
  'dom-write':
    'não escreva atributos/HTML de controles nativos pelo DOM (type, title, innerHTML...): use os componentes',
  'native-css': 'estilize o componente próprio; não customize o controle nativo',
  'parse-error': 'o template não pôde ser analisado: corrija o HTML',
};

/** Exceções justificadas: { file (caminho relativo a frontend/), rule, detail? (só esse achado), reason }. */
export const ALLOWLIST = [
  {
    file: 'src/app/common/components/forms/text-field/text-field.component.ts',
    rule: 'dynamic-input-type',
    reason:
      'TextField é o campo de texto base: `[type]` é limitado pelo tipo TextFieldType a text, email e password (nenhum controle nativo com UI própria).',
  },
  {
    file: 'src/app/common/components/forms/file-picker/file-picker.component.ts',
    rule: 'input-type',
    // F8: a exceção vale só para o `type="file"` literal, não para a regra inteira no arquivo (um
    // `<input type="date">` dentro do FilePicker continua falhando).
    detail: '<input type="file">',
    reason:
      'FE-S-119: única exceção nativa. O seletor de arquivos é do sistema operacional e não tem substituto; o <input type="file"> fica escondido (hidden, fora da tabulação) dentro do FilePicker e é acionado pelo botão próprio.',
  },
];

/** @typedef {{ line: number, rule: string, detail: string }} Hit */

// --- Templates (AST do Angular) ---------------------------------------------------------------

// BindingType do compilador: 0 propriedade, 1 atributo (`[attr.x]`), 2 classe, 3 estilo, ...
const BINDING_PROPERTY = 0;
const BINDING_ATTRIBUTE = 1;

/** Percorre toda a árvore (elementos, `ng-template`, blocos `@if/@for/@switch/@defer`...). */
function walkNodes(node, visit, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) walkNodes(item, visit, seen);
    return;
  }
  if (Array.isArray(node.attributes) && Array.isArray(node.inputs)) visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (/Span$/.test(key) || key === 'i18n' || key === 'expression' || key === 'value') continue;
    if (value && typeof value === 'object') walkNodes(value, visit, seen);
  }
}

/**
 * @param {string} template
 * @param {number} baseLine linha (1-based) em que o texto começa no arquivo
 * @param {boolean} reportErrors erros de parse viram achado (só nos `.html`)
 * @returns {Hit[]}
 */
function scanTemplate(template, baseLine, reportErrors = false) {
  /** @type {Hit[]} */
  const found = [];
  const parsed = parseTemplate(template, 'template.html', { preserveWhitespaces: true });
  if (parsed.errors && parsed.errors.length > 0) {
    if (reportErrors) {
      for (const error of parsed.errors) {
        found.push({
          line: baseLine + (error.span?.start?.line ?? 0),
          rule: 'parse-error',
          detail: String(error.msg ?? error).split('\n')[0],
        });
      }
    }
    return found;
  }
  walkNodes(parsed.nodes, (node) => {
    const rawName = String(node.name ?? node.tagName ?? '');
    const isSvg = rawName.startsWith(':svg:');
    const name = rawName.replace(/^:[a-z]+:/, '').toLowerCase();
    const line = baseLine + (node.sourceSpan?.start?.line ?? 0);
    const push = (rule, detail) => found.push({ line, rule, detail });
    if (BANNED_TAGS.includes(name) && !isSvg) push(name, `<${name}>`);
    // Atributos estáticos e bindings (propriedade, `[attr.x]`, `bind-x`, interpolação).
    const statics = node.attributes.map((a) => ({ name: String(a.name), value: a.value ?? '' }));
    const bound = node.inputs
      .filter((i) => i.type === BINDING_PROPERTY || i.type === BINDING_ATTRIBUTE)
      .map((i) => String(i.name));
    const templateBound = (node.templateAttrs ?? []).map((a) => String(a.name));
    for (const attribute of statics) {
      const lower = attribute.name.toLowerCase();
      if (lower === 'title') push('title', 'atributo title');
      else if (BANNED_ATTRIBUTES.includes(lower)) push('native-attr', `atributo ${attribute.name}`);
    }
    for (const binding of [...bound, ...templateBound]) {
      const lower = binding.toLowerCase();
      if (lower === 'title') push('title', 'binding title');
      else if (BANNED_ATTRIBUTES.includes(lower)) push('native-attr', `binding ${binding}`);
    }
    if (name === 'input' && !isSvg) {
      const type = statics.find((a) => a.name.toLowerCase() === 'type');
      if (type && !ALLOWED_INPUT_TYPES.includes(type.value.trim().toLowerCase())) {
        push('input-type', `<input type="${type.value}">`);
      }
      if (bound.some((b) => b.toLowerCase() === 'type')) {
        push('dynamic-input-type', '<input [type]=...>');
      }
    }
  });
  return found;
}

// --- CSS ---------------------------------------------------------------------------------------

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** @returns {Hit[]} */
function scanCss(text, baseLine) {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const found = [];
  const pattern =
    /::-webkit-(?:calendar-picker-indicator|datetime-edit)[\w-]*|accent-color\s*:|(?<![\w-])resize\s*:\s*(?!none\b)[a-z-]+/g;
  for (const m of css.matchAll(pattern)) {
    found.push({
      line: baseLine + lineOf(css, m.index) - 1,
      rule: 'native-css',
      detail: m[0].trim(),
    });
  }
  return found;
}

// --- TypeScript (AST) --------------------------------------------------------------------------

const TAG_IN_TEXT = /<[a-zA-Z][\w-]*[\s>/]/;
const CSS_HINT = /::-webkit-|accent-color|resize\s*:/;

function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((s) => `X${s.literal.text}`).join('');
  }
  return null;
}

/** Nome chamado: `a.b(...)`, `a['b'](...)`, `b(...)`. */
function calleeOf(call) {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) {
    return { name: callee.name.text, object: callee.expression };
  }
  if (ts.isElementAccessExpression(callee) && literalText(callee.argumentExpression) !== null) {
    return { name: literalText(callee.argumentExpression), object: callee.expression };
  }
  if (ts.isIdentifier(callee)) return { name: callee.text, object: null };
  return { name: null, object: null };
}

const isThis = (node) => node != null && node.kind === ts.SyntaxKind.ThisKeyword;

/** @returns {Hit[]} */
function scanTypeScript(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  /** @type {Hit[]} */
  const found = [];
  const lineAt = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const push = (node, rule, detail) => found.push({ line: lineAt(node), rule, detail });
  // Nomes declarados no arquivo (um método `confirm()` próprio não é o `window.confirm`).
  const declared = new Set();
  const usesDom =
    /createElement|Renderer2|nativeElement|HTMLInputElement|querySelector|document\./.test(text);
  const collect = (node) => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      declared.add(node.name.text);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  /** `null` = permitido; senão o valor proibido (ou 'dinâmico'). */
  const bannedType = (node) => {
    const value = literalText(node);
    if (value === null) return 'dinâmico';
    return ALLOWED_INPUT_TYPES.includes(value.trim().toLowerCase()) ? null : value;
  };

  const visit = (node) => {
    // Literais com HTML ou CSS nativo (template inline, innerHTML = '<select>', styles, ...).
    const textValue = literalText(node);
    if (textValue !== null) {
      if (TAG_IN_TEXT.test(textValue)) found.push(...scanTemplate(textValue, lineAt(node)));
      if (CSS_HINT.test(textValue)) found.push(...scanCss(textValue, lineAt(node)));
    }

    // `host: { '[attr.title]': ..., popover: ... }`
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === 'host' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const raw =
          ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : '';
        const clean = raw.replace(/^\[(?:attr\.)?|\]$/g, '').toLowerCase();
        if (clean === 'title') push(prop, 'title', `host ${raw}`);
        else if (BANNED_ATTRIBUTES.includes(clean)) push(prop, 'native-attr', `host ${raw}`);
      }
    }

    if (ts.isCallExpression(node)) {
      const { name, object } = calleeOf(node);
      const args = node.arguments;
      if (name === 'createElement' || name === 'createElementNS') {
        const tag = literalText(name === 'createElementNS' ? args[1] : args[0]);
        if (tag === null) push(node, 'create-element', `${name}(<dinâmico>)`);
        else if (BANNED_TAGS.includes(tag.toLowerCase())) {
          push(node, 'create-element', `${name}('${tag}')`);
        }
      } else if (name === 'setAttribute' || name === 'setAttributeNS' || name === 'setProperty') {
        // `el.setAttribute(n, v)`, `el.setAttributeNS(ns, n, v)`, `renderer.setAttribute(el, n, v)`.
        let nameIndex = 0;
        if (name === 'setAttributeNS') nameIndex = 1;
        else if (args.length >= 3) nameIndex = 1;
        const attribute = literalText(args[nameIndex]);
        const lower = attribute?.toLowerCase() ?? null;
        if (attribute === null) push(node, 'dom-write', `${name}(<nome dinâmico>)`);
        else if (lower === 'type') {
          const bad = bannedType(args[nameIndex + 1]);
          if (bad) push(node, 'dom-write', `${name}('type', ${bad})`);
        } else if (lower && BANNED_ATTRIBUTES.includes(lower)) {
          push(node, 'dom-write', `${name}('${attribute}')`);
        }
      } else if (name === 'toggleAttribute') {
        const attribute = literalText(args[0]);
        if (attribute === null || BANNED_ATTRIBUTES.includes(attribute.toLowerCase())) {
          push(node, 'dom-write', 'toggleAttribute(...)');
        }
      } else if (name && HTML_SINKS.includes(name) && !isThis(object)) {
        push(node, 'dom-write', `${name}(...)`);
      } else if (name === 'showPicker') {
        push(node, 'show-picker', 'showPicker()');
      } else if (name === 'showModal') {
        push(node, 'dialogs', 'showModal()');
      } else if (name && DIALOG_FUNCTIONS.includes(name)) {
        // `alert(...)`, `window.alert(...)`, `window['alert'](...)`; `this.confirm()` é método próprio.
        if (object === null) {
          if (!declared.has(name)) push(node, 'dialogs', `${name}(...)`);
        } else if (!isThis(object)) {
          push(node, 'dialogs', `${name}(...)`);
        }
      } else if (
        (name === 'write' || name === 'writeln') &&
        object &&
        /\bdocument$/.test(object.getText(source)) &&
        !isThis(object)
      ) {
        push(node, 'dom-write', `document.${name}(...)`);
      }
    }

    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'DOMParser') push(node, 'dom-write', 'new DOMParser()');
    }

    // `x.type = 'date'`, `x.title = ...`, `x.innerHTML = ...`, `x['type'] = ...`.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
    ) {
      const left = node.left;
      const prop = ts.isPropertyAccessExpression(left)
        ? left.name.text
        : literalText(left.argumentExpression);
      const lower = prop?.toLowerCase() ?? null;
      if (prop === null) {
        if (usesDom) push(node, 'dom-write', 'atribuição a propriedade dinâmica do DOM');
      } else if (!isThis(left.expression)) {
        if (lower === 'type') {
          const bad = usesDom ? bannedType(node.right) : null;
          if (bad) push(node, 'dom-write', `.type = ${bad}`);
        } else if (lower === 'title') {
          if (usesDom) push(node, 'dom-write', '.title = ...');
        } else if (BANNED_DOM_PROPS.includes(lower)) {
          push(node, 'dom-write', `.${prop} = ...`);
        }
      }
    }

    // `window['alert']` referenciado sem chamar (`const a = window['alert']`).
    if (
      ts.isElementAccessExpression(node) &&
      DIALOG_FUNCTIONS.includes(literalText(node.argumentExpression) ?? '') &&
      !isThis(node.expression) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)
    ) {
      push(node, 'dialogs', `['${literalText(node.argumentExpression)}']`);
    }

    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

// --- API ---------------------------------------------------------------------------------------

/**
 * Procura controles nativos em um arquivo.
 * @param {string} file caminho relativo (usa a extensão e a lista de permissões)
 * @param {string} text conteúdo
 * @returns {{ file: string, line: number, rule: string, detail: string, hint: string }[]}
 */
export function scanFile(file, text) {
  /** @type {Hit[]} */
  let found = [];
  if (file.endsWith('.html')) found = scanTemplate(text, 1, true);
  else if (file.endsWith('.css')) found = scanCss(text, 1);
  else if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) found = scanTypeScript(file, text);
  const seen = new Set();
  return found
    .filter(
      (f) =>
        !ALLOWLIST.some(
          (a) =>
            a.file === file &&
            a.rule === f.rule &&
            (a.detail === undefined || a.detail === f.detail),
        ),
    )
    .filter((f) => {
      const key = `${f.line}|${f.rule}|${f.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((f) => ({ file, ...f, hint: ALTERNATIVE[f.rule] ?? '' }));
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = walk(join(root, 'src')).filter((f) => /\.(html|css|ts)$/.test(f));
  const problems = files.flatMap((f) => {
    const rel = relative(root, f).split(sep).join('/');
    return scanFile(rel, readFileSync(f, 'utf8'));
  });
  if (problems.length > 0) {
    console.error('Controles nativos do navegador não são permitidos (UI própria, FE-S-112):');
    for (const p of problems) {
      console.error(`  ${p.file}:${p.line}  ${p.detail}  ->  ${p.hint}`);
    }
    process.exit(1);
  }
  console.log('check-native-controls: nenhum controle nativo encontrado.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
