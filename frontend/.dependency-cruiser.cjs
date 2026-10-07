/**
 * Fronteiras de camada do frontend (FE 01 e docs/arquitetura/arquitetura.md §5.2).
 * Violação de camada ou ciclo é erro; arquivo órfão é aviso.
 *
 * Exceção explícita (S-31): só o bootstrap (`src/main.ts` e `src/app/app.config.ts`)
 * pode importar `src/modules/<ctx>/infra` para ligar a porta do core à implementação.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
const BOOTSTRAP = '^src/(main\\.ts|app/app\\.config\\.ts)$';

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Ciclos de dependência são proibidos em qualquer camada.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'app-not-to-infra',
      severity: 'error',
      comment:
        'A apresentação (src/app) não importa infra; usa a facade de negócio do core. Exceção: bootstrap (S-31).',
      from: { path: '^src/app/', pathNot: BOOTSTRAP },
      to: { path: '^src/modules/[^/]+/infra/' },
    },
    {
      name: 'app-not-to-mock-data',
      severity: 'error',
      comment: 'Mock data só é consumido pela infra (FE 01).',
      from: { path: '^src/app/', pathNot: BOOTSTRAP },
      to: { path: '^src/modules/[^/]+/mock-data/' },
    },
    {
      name: 'demo-data-only-dev',
      severity: 'error',
      comment:
        'Dados de demonstração (reports-demo.facade, mock-data/**) só podem ser importados por features/dev e por modules/reports (A1 da revisão): nada de dado fictício em tela de produto nem no bundle de produção. O provider de dev (`reports.providers.dev.ts`) é o único elo, trocado por `fileReplacements`.',
      from: { pathNot: '^src/(app/features/dev/|modules/reports/)' },
      to: { path: '^src/modules/reports/(infra/facades/reports-demo\\.facade|mock-data/)' },
    },
    {
      name: 'core-not-to-app',
      severity: 'error',
      comment: 'O core (negócio) não conhece a apresentação.',
      from: { path: '^src/modules/[^/]+/core/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'core-not-to-infra',
      severity: 'error',
      comment: 'O core define portas; a infra implementa. A dependência aponta numa direção só.',
      from: { path: '^src/modules/[^/]+/core/' },
      to: { path: '^src/modules/[^/]+/infra/' },
    },
    {
      name: 'infra-not-to-app',
      severity: 'error',
      comment: 'A infra não conhece a apresentação.',
      from: { path: '^src/modules/[^/]+/infra/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'modules-isolated',
      severity: 'error',
      comment: 'Um módulo de negócio não importa outro (core, infra ou mock-data).',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/[^/]+/', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'util-is-generic',
      severity: 'error',
      comment: 'util/ é genérico, sem regra de negócio nem apresentação.',
      from: { path: '^src/util/' },
      to: { path: '^src/(app|modules)/' },
    },
    {
      name: 'presentation-not-to-http',
      severity: 'error',
      comment: 'Componente nunca injeta HttpClient (FE 00 regra 1).',
      from: { path: '^src/app/(features|common/components)/' },
      to: { path: 'node_modules/@angular/common/[^/]*/?http' },
    },
    {
      name: 'core-not-to-http',
      severity: 'error',
      comment: 'O core é puro: o HTTP fica na facade de requisições (infra).',
      from: { path: '^src/modules/[^/]+/core/' },
      to: { path: 'node_modules/@angular/common/[^/]*/?http' },
    },
    {
      name: 'schema-only-from-infra',
      severity: 'error',
      comment:
        'Os tipos gerados do contrato (src/util/api/schema.gen.ts, S-66) só podem ser importados por src/modules/*/infra e pelo backend de exemplo do build `demo` (src/demo). App e core usam os tipos do core, mapeados pela infra.',
      from: { pathNot: '^src/(modules/[^/]+/infra/|demo/)' },
      to: { path: '^src/util/api/schema\\.gen\\.ts$' },
    },
    {
      name: 'not-to-spec',
      severity: 'error',
      comment: 'Código de produção não importa arquivos de teste.',
      from: { pathNot: '\\.spec\\.ts$|^src/testing/|^src/test-setup\\.ts$' },
      to: { path: '\\.spec\\.ts$|^src/testing/' },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Import que não resolve é erro.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Arquivo órfão (ninguém importa) é aviso.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '\\.spec\\.ts$',
          '^src/main\\.ts$',
          // Entra no build só por `fileReplacements` (S-67).
          '^src/app/config/environment\\.mock\\.ts$',
          '^src/test-setup\\.ts$',
          // Worker do service worker (não entra no grafo TypeScript; o build o copia como asset).
          '^src/sw-push\\.js$',
          '^src/testing/',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.(css|html|md|json|webmanifest)$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
