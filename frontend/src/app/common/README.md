# `src/app/common`

Peças reutilizadas por várias features.

| Pasta                   | Conteúdo                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n/`                 | contrato `AppI18n` (`i18n.ts`), `I18nService`, providers, `interpolate` e `translations/{pt,en,es}.ts`                                                                                                                                                         |
| `components/`           | presentational: `empty-state`, `page-layout`, `section-container`, `icon`, `money`, `confirm-dialog`, `toast` e o `app-shell` (`bottom-nav`, `sidebar`); `components/forms/`: `money-input`, `date-picker`, `segmented-control`, `select`, `field-error` (T32) |
| `pipes/`                | `MoneyPipe` (formata pela moeda do dado; só formata)                                                                                                                                                                                                           |
| `services/`             | `ThemeService`, `I18nTitleStrategy`, `ToastService`                                                                                                                                                                                                            |
| `guards/`, `resolvers/` | funcionais (vazios na Etapa 1)                                                                                                                                                                                                                                 |

Regras:

- Componentes standalone, OnPush, só `input()`/`output()`, sem serviço de dados.
- Nenhum texto fixo: toda string vem de `AppI18n`, em sentence case, nos três idiomas.
- `data-cy` em todo elemento interativo.
- Cobertura mínima de 80% de linhas (configurada em `vitest-base.config.mts`).
