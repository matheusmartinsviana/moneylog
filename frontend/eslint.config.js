// @ts-check
const eslint = require('@eslint/js');
const { defineConfig, globalIgnores } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const importX = require('eslint-plugin-import-x');
const { createTypeScriptImportResolver } = require('eslint-import-resolver-typescript');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  globalIgnores([
    'dist/**',
    'coverage/**',
    '.angular/**',
    'node_modules/**',
    // Gerado por `npm run api:types` a partir de contracts/openapi.yaml (S-66).
    'src/util/api/schema.gen.ts',
  ]),
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    // O plugin import-x é registrado com o prefixo `import` para manter os nomes das regras do FE 01.
    plugins: { import: importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
      // O no-relative-parent-imports resolve o caminho final; sem isto ele acusaria também os imports
      // pelo alias `~/*` (que apontam para cima da pasta atual). Tratando `src` como pasta de módulos,
      // só o especificador `../` continua proibido, que é a regra do FE 01.
      'import-x/external-module-folders': ['node_modules', 'src'],
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        // Elemento, ou atributo em `li`/`tr` (ex.: `li[app-account-row]`), para manter a semântica de lista/tabela.
        { type: ['element', 'attribute'], prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-signals': 'error',
      'import/no-relative-parent-imports': 'error',
      'import/no-cycle': 'error',
      'import/no-duplicates': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [{ pattern: '~/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-console': ['error', { allow: ['error'] }],
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
      // UI própria (FE-S-112): nada de diálogos nativos do navegador.
      'no-restricted-globals': [
        'error',
        ...['alert', 'confirm', 'prompt'].map((name) => ({
          name,
          message: 'Use ConfirmDialog (nada de alert/confirm/prompt nativos).',
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...['alert', 'confirm', 'prompt'].flatMap((property) =>
          ['window', 'globalThis'].map((object) => ({
            object,
            property,
            message: 'Use ConfirmDialog (nada de alert/confirm/prompt nativos).',
          })),
        ),
      ],
    },
  },
  {
    // Dinheiro digitado nunca vira `number` (arquitetura §1, T32 CA1): o caminho texto → string
    // decimal da API é só manipulação de string.
    files: ['src/util/money-input.ts', 'src/app/common/components/forms/money-input/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['parseFloat', 'parseInt', 'Number', 'Math'].map((name) => ({
          name,
          message: 'Valor monetário não passa por number: use as funções de ~/util/money-input.',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSNumberKeyword',
          message: 'Valor monetário não é number: use a string decimal da API.',
        },
        {
          selector: "UnaryExpression[operator='+']",
          message: 'Conversão implícita para number é proibida no caminho do dinheiro.',
        },
        {
          selector: "CallExpression[callee.property.name='toFixed']",
          message: 'toFixed arredonda um number: use as funções de ~/util/money-input.',
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', 'src/test-setup.ts', 'src/testing/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // Nenhum texto fixo na UI (FE 04): todo texto vem do contrato AppI18n por binding.
      '@angular-eslint/template/no-inline-styles': 'error',
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/prefer-self-closing-tags': 'error',
    },
  },
  prettier,
]);
