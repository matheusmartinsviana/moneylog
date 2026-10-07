import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ALLOWLIST, scanFile } from './check-native-controls.mjs';

const rules = (file, text) => scanFile(file, text).map((f) => f.rule);

test('dispara em cada controle nativo proibido (html)', () => {
  const cases = {
    select: '<select><option>a</option></select>',
    datalist: '<datalist id="x"></datalist>',
    details: '<details><summary>x</summary></details>',
    summary: '<summary>x</summary>',
    dialog: '<dialog open></dialog>',
    progress: '<progress value="1"></progress>',
    meter: '<meter value="1"></meter>',
  };
  for (const [rule, html] of Object.entries(cases)) {
    assert.ok(rules('src/x.html', html).includes(rule), `deveria disparar ${rule}`);
  }
  for (const type of [
    'date',
    'month',
    'week',
    'time',
    'datetime-local',
    'checkbox',
    'radio',
    'color',
    'range',
    'file',
    'search',
    'number',
  ]) {
    assert.deepEqual(rules('src/x.html', `<input type="${type}" class="a">`), ['input-type'], type);
  }
  assert.deepEqual(rules('src/x.html', '<input [type]="kind()">'), ['dynamic-input-type']);
  assert.deepEqual(rules('src/x.html', '<input type="tel">'), ['input-type']);
  assert.deepEqual(rules('src/x.html', '<input type="url">'), ['input-type']);
  assert.deepEqual(rules('src/x.html', '<input type="hidden">'), ['input-type']);
  assert.deepEqual(rules('src/x.html', '<button title="oi">x</button>'), ['title']);
  assert.deepEqual(rules('src/x.html', '<button [attr.title]="a">x</button>'), ['title']);
});

test('lista permitida de input: text, email, password e sem type', () => {
  for (const type of ['text', 'email', 'password']) {
    assert.deepEqual(rules('src/x.html', `<input type="${type}">`), [], type);
  }
  assert.deepEqual(rules('src/x.html', '<input>'), []);
  assert.deepEqual(rules('src/x.html', '<input type="TEXT">'), []);
});

test('burlas conhecidas do regex: todas são pegas (templates)', () => {
  const cases = {
    'type sem aspas': ['<input type=date>', 'input-type'],
    'type interpolado': ['<input type="{{k}}">', 'dynamic-input-type'],
    '">" dentro de atributo': ['<input [disabled]="a > b" type="date">', 'input-type'],
    '">" antes do title': ['<button (click)="a>b" title="x">x</button>', 'title'],
    'bind-type': ['<input bind-type="k">', 'dynamic-input-type'],
    '[attr.type]': ['<input [attr.type]="k">', 'dynamic-input-type'],
    'title interpolado': ['<button title="{{x}}">x</button>', 'title'],
    'bind-title': ['<button bind-title="x">x</button>', 'title'],
    'select em @if': ['@if (a) { <select></select> }', 'select'],
    'select em @for': ['@for (a of b; track a) { <select></select> }', 'select'],
    'select em ng-template': ['<ng-template><select></select></ng-template>', 'select'],
    'select em *ngIf': ['<div *ngIf="a"><details></details></div>', 'details'],
    popover: ['<div popover>x</div>', 'native-attr'],
    popovertarget: ['<button popovertarget="p">x</button>', 'native-attr'],
    '[popover]': ['<div [popover]="m">x</div>', 'native-attr'],
    contenteditable: ['<div contenteditable="true">x</div>', 'native-attr'],
    ngNativeValidate: ['<form ngNativeValidate></form>', 'native-attr'],
    '[innerHTML]': ['<div [innerHTML]="h"></div>', 'native-attr'],
  };
  for (const [name, [html, rule]] of Object.entries(cases)) {
    assert.ok(rules('src/x.html', html).includes(rule), `${name}: deveria disparar ${rule}`);
  }
  // O `title` de SVG e a classe `title` não são o atributo nativo.
  assert.deepEqual(rules('src/x.html', '<svg><title>x</title></svg><b [class.title]="a"></b>'), []);
  // HTML inválido num .html é falha, não silêncio.
  assert.deepEqual(rules('src/x.html', '<details/>'), ['parse-error']);
});

test('burlas conhecidas do regex: todas são pegas (TypeScript)', () => {
  const cases = {
    'template com aspas simples': ["@Component({ template: '<select></select>' })", 'select'],
    'template com aspas duplas': ['@Component({ template: "<input type=date>" })', 'input-type'],
    'template com interpolação': ['const t = `<input type="${k}">`;', 'input-type'],
    'template concatenado em variável': [
      "const html = '<details><summary>x</summary></details>';",
      'details',
    ],
    'styles array': ["@Component({ styles: ['input{accent-color:red}'] })", 'native-css'],
    'styles array com template': [
      '@Component({ styles: [`input::-webkit-datetime-edit{}`] })',
      'native-css',
    ],
    'createElement com backtick': ['document.createElement(`select`);', 'create-element'],
    'createElement com variável': ['document.createElement(tag);', 'create-element'],
    'renderer.createElement': ["this.renderer.createElement('details');", 'create-element'],
    'el.type = date': [
      "const el = document.createElement('input'); el.type = 'date';",
      'dom-write',
    ],
    'el.type dinâmico': [
      "const el = document.createElement('input'); el.type = kind;",
      'dom-write',
    ],
    'el["type"] = date': [
      "const el = document.createElement('input'); el['type'] = 'date';",
      'dom-write',
    ],
    setAttribute: ["el.setAttribute('type', 'date');", 'dom-write'],
    'renderer.setAttribute': ["this.renderer.setAttribute(el, 'type', 'month');", 'dom-write'],
    'setAttribute dinâmico': ['el.setAttribute(name, value);', 'dom-write'],
    'setAttribute title': ["el.setAttribute('title', 'x');", 'dom-write'],
    'setAttribute popover': ["el.setAttribute('popover', '');", 'dom-write'],
    'setProperty type': ["this.renderer.setProperty(el, 'type', 'checkbox');", 'dom-write'],
    'innerHTML com select': ["el.innerHTML = '<select></select>';", 'select'],
    'innerHTML qualquer': ['el.innerHTML = html;', 'dom-write'],
    outerHTML: ['el.outerHTML = html;', 'dom-write'],
    insertAdjacentHTML: ["el.insertAdjacentHTML('beforeend', html);", 'dom-write'],
    createContextualFragment: ['range.createContextualFragment(html);', 'dom-write'],
    DOMParser: ["new DOMParser().parseFromString(h, 'text/html');", 'dom-write'],
    'document.write': ['document.write(h);', 'dom-write'],
    bypassSecurityTrustHtml: ['this.sanitizer.bypassSecurityTrustHtml(h);', 'dom-write'],
    'el.title =': ["const e = document.createElement('div'); e.title = 'x';", 'dom-write'],
    'el.popover =': ["e.popover = 'auto';", 'dom-write'],
    'el.contentEditable =': ["e.contentEditable = 'true';", 'dom-write'],
    'host [attr.title]': ["@Component({ host: { '[attr.title]': 'x' } })", 'title'],
    'host title': ["@Component({ host: { title: 'x' } })", 'title'],
    'host popover': ["@Component({ host: { popover: '' } })", 'native-attr'],
    "window['alert']": ["window['alert']('x');", 'dialogs'],
    "globalThis['confirm']": ["if (globalThis['confirm']('x')) {}", 'dialogs'],
    'window.prompt': ["window.prompt('x');", 'dialogs'],
    'alias de alert': ["const a = window['alert'];", 'dialogs'],
    showModal: ['dialog.showModal();', 'dialogs'],
    showPicker: ['input.showPicker();', 'show-picker'],
  };
  for (const [name, [code, rule]] of Object.entries(cases)) {
    assert.ok(rules('src/a.ts', code).includes(rule), `${name}: deveria disparar ${rule}`);
  }
});

test('CSS: resize e controles nativos', () => {
  assert.deepEqual(rules('src/a.css', 'textarea { resize: vertical; }'), ['native-css']);
  assert.deepEqual(rules('src/a.css', 'textarea { resize: none; }'), []);
  assert.deepEqual(rules('src/a.css', 'input::-webkit-datetime-edit-day-field {}'), ['native-css']);
  assert.deepEqual(rules('src/a.css', '/* accent-color: red; */ a { color: red }'), []);
});

test('dispara em templates inline, TS e CSS, com a linha certa', () => {
  const ts = [
    '@Component({',
    '  template: `',
    '    <div>',
    '      <select></select>',
    '    </div>',
    '  `,',
    '})',
  ].join('\n');
  const [hit] = scanFile('src/a.component.ts', ts);
  assert.equal(hit?.rule, 'select');
  assert.equal(hit?.line, 4);
  assert.match(hit?.hint ?? '', /app-select/);

  assert.ok(rules('src/a.ts', 'const ok = window.confirm("x");').includes('dialogs'));
  assert.ok(rules('src/a.ts', 'alert("x");').includes('dialogs'));
  assert.ok(rules('src/a.ts', 'if (confirm("x")) {}').includes('dialogs'));
  assert.ok(rules('src/a.ts', 'input.showPicker();').includes('show-picker'));
  assert.ok(rules('src/a.ts', "document.createElement('select');").includes('create-element'));
  assert.ok(rules('src/a.ts', "document.createElement('div');").length === 0);
  assert.deepEqual(rules('src/a.css', 'input::-webkit-calendar-picker-indicator { opacity: 0 }'), [
    'native-css',
  ]);
  assert.deepEqual(rules('src/a.css', 'input { accent-color: red; }'), ['native-css']);
});

test('não dispara nos componentes próprios nem em falsos positivos', () => {
  const good = `
    <app-select fieldId="a" label="A" [options]="o" />
    <app-date-picker fieldId="d" label="D" />
    <app-checkbox fieldId="c" label="C" />
    <app-disclosure fieldId="x" heading="H"></app-disclosure>
    <input type="text" inputmode="numeric" role="searchbox" />
    <app-number-stepper fieldId="n" label="N" [min]="1" [max]="36" />
    <input type="text" role="spinbutton" inputmode="numeric" autocomplete="off" />
    <app-radio-group fieldId="r" label="R" [options]="o" />
    <app-tabs label="T" fieldId="t" [tabs]="tabs"><ng-template appTabPanel="a"></ng-template></app-tabs>
    <app-progress-bar label="P" fieldId="p" [value]="0.4" />
    <div role="progressbar" aria-valuenow="40"></div>
    <app-menu label="M" fieldId="m" [items]="items" />
    <app-dialog heading="D" [open]="open"></app-dialog>
    <app-sheet heading="S" [open]="open"></app-sheet>
    <input type="password" />
    <textarea></textarea>
    <svg><title>ícone</title></svg>
    <!-- <select> comentado -->
    <button type="button" (click)="confirm()">ok</button>`;
  assert.deepEqual(rules('src/x.html', good), []);
  const ts = [
    '/** No lugar de `<details>` e window.confirm(). */',
    'class A {',
    '  protected confirm(): void { this.confirm(); }',
    "  protected title = 'x'; run() { this.title = 'y'; }",
    '  // alert("x")',
    '}',
  ].join('\n');
  assert.deepEqual(rules('src/a.ts', ts), []);
});

test('os controles que os novos componentes substituem continuam proibidos', () => {
  assert.deepEqual(rules('src/x.html', '<input type="number" />'), ['input-type']);
  assert.deepEqual(rules('src/x.html', '<input type="radio" name="a" />'), ['input-type']);
  assert.deepEqual(rules('src/x.html', '<progress value="1"></progress>'), ['progress']);
  assert.deepEqual(rules('src/x.html', '<meter value="1"></meter>'), ['meter']);
  assert.deepEqual(rules('src/x.html', '<dialog open></dialog>'), ['dialog']);
});

test('a lista de permissões exige motivo e é só o necessário', () => {
  for (const entry of ALLOWLIST) {
    assert.ok(entry.reason.length > 20, `motivo curto em ${entry.file}`);
  }
  const textField = ALLOWLIST[0];
  assert.deepEqual(
    rules(textField.file, '@Component({ template: `<input [type]="type()" />` })'),
    [],
  );
  // A mesma construção em outro arquivo falha.
  assert.deepEqual(
    rules('src/outro.component.ts', '@Component({ template: `<input [type]="type()" />` })'),
    ['dynamic-input-type'],
  );
});

test('FilePicker: o input file só passa dentro do componente (FE-S-119)', () => {
  const picker = 'src/app/common/components/forms/file-picker/file-picker.component.ts';
  assert.ok(ALLOWLIST.some((entry) => entry.file === picker && entry.rule === 'input-type'));
  const template = '@Component({ template: `<input type="file" hidden />` })';
  assert.deepEqual(rules(picker, template), []);
  // Em qualquer outro lugar (template, .ts ou outro componente de forms) continua proibido.
  assert.deepEqual(rules('src/app/features/notes/x.component.ts', template), ['input-type']);
  assert.deepEqual(rules('src/app/features/notes/x.html', '<input type="file">'), ['input-type']);
  assert.deepEqual(
    rules('src/app/common/components/forms/text-field/text-field.component.ts', template),
    ['input-type'],
  );
  assert.deepEqual(rules(picker, "const el = document.createElement('input'); el.type = 'file';"), [
    'dom-write',
  ]);
});

test('FilePicker: a exceção é só para type="file", não para a regra input-type no arquivo todo (F8)', () => {
  const picker = 'src/app/common/components/forms/file-picker/file-picker.component.ts';
  for (const type of ['date', 'checkbox', 'radio', 'month', 'number', 'range']) {
    assert.deepEqual(
      rules(picker, `@Component({ template: \`<input type="${type}" hidden />\` })`),
      ['input-type'],
      `${type} dentro do FilePicker deve falhar`,
    );
  }
  // Um `<input type="date">` ao lado do `file` no mesmo arquivo também falha; o `file` segue liberado.
  assert.deepEqual(
    rules(picker, '@Component({ template: `<input type="file" hidden /><input type="date" />` })'),
    ['input-type'],
  );
  assert.deepEqual(rules(picker, '@Component({ template: `<input type="file" hidden />` })'), []);
  // E o tipo dinâmico continua pegando (outra regra, que a exceção nunca cobriu).
  assert.deepEqual(rules(picker, '@Component({ template: `<input [type]="kind()" />` })'), [
    'dynamic-input-type',
  ]);
});
