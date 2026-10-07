# moneylog: frontend

Angular 22 (standalone, zoneless, OnPush) + `@angular/pwa`. Node 24 (`.nvmrc`), npm 11, versões fixas e `package-lock.json`.

| Script                          | O que faz                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm start`                     | servidor de desenvolvimento com a **API real** (proxy de `/v1` para `http://localhost:8080`)     |
| `npm run start:local`           | idem, em **HTTPS** com certificado do `mkcert` (veja abaixo); é o caminho para testar no iPhone  |
| `npm run start:mock`            | ambiente **mock** (`environment.mock.ts`): sem backend, sem chamada a `/v1`, sessão falsa        |
| `npm run build`                 | build de produção, API real (gera `ngsw-worker.js` e `manifest.webmanifest`)                     |
| `npm run build:production-mock` | build de produção com o ambiente mock (só para o projeto Playwright `prod`)                      |
| `npm run api:types`             | gera `src/util/api/schema.gen.ts` a partir de `../contracts/openapi.yaml` (`openapi-typescript`) |
| `npm run api:check`             | falha se `schema.gen.ts` está desatualizado em relação ao contrato                               |
| `npm test`                      | Vitest + Angular Testing Library, com cobertura e `coverageThreshold`                            |
| `npm run e2e`                   | Playwright: projetos `mock` e `prod` (sem backend)                                               |
| `npm run e2e:integration`       | Playwright `integration`: Postgres + backend reais (veja "E2E com backend real")                 |
| `npm run lint`                  | ESLint + regras visuais (`scripts/check-styles.mjs`) + contraste (`scripts/check-contrast.mjs`)  |
| `npm run lint:deps`             | fronteiras de camada e ciclos (`.dependency-cruiser.cjs`)                                        |
| `npm run typecheck`             | `ngc` (templates estritos) + `tsc` dos testes                                                    |
| `npm run format`                | Prettier                                                                                         |
| `npm run icons`                 | gera os PNGs do PWA a partir dos SVGs em `src/assets/icons`                                      |

## Contrato e ambientes

- **Contrato primeiro (S-66):** `../contracts/openapi.yaml` é a fonte da verdade. Mudou o contrato:
  `npm run api:types` e versione o `schema.gen.ts`. Só `src/modules/*/infra` importa esse arquivo
  (`lint:deps`, regra `schema-only-from-infra`); o resto do app usa os tipos do `core`.
- **Mock só por build (S-67):** `src/app/config/environment.ts` tem `apiMocks: false` (API real).
  As configurações `mock` e `production-mock` do `angular.json` trocam o arquivo por
  `environment.mock.ts` (`apiMocks: true`) com `fileReplacements`. A tela nunca sabe qual é.

## HTTPS local com mkcert (S-85)

O cookie de refresh é sempre `Secure`, e o Safari/WebKit o descarta em `http://localhost`. Por isso o
caminho de desenvolvimento com backend é HTTPS local:

1. `brew install mkcert` e `mkcert -install` (instala a CA local no Mac).
2. Gere o certificado **fora do repositório** (nunca versione `*.pem`):
   `mkdir -p ~/.moneylog/certs && cd ~/.moneylog/certs && mkcert -cert-file moneylog.localhost.pem -key-file moneylog.localhost-key.pem moneylog.localhost localhost 127.0.0.1 <IP-da-sua-LAN>`
   (a pasta pode ser outra, informada em `MONEYLOG_CERT_DIR`).
3. No iPhone: envie o `rootCA.pem` (`mkcert -CAROOT`), instale o perfil e ative-o em
   Ajustes > Geral > Sobre > Configurações de certificado confiável.
4. `npm run start:local` e abra `https://moneylog.localhost:4200` (ou `https://<IP-da-LAN>:4200` no celular).

Sem os certificados, `npm run start:local` explica o que falta e termina; `npm start` (HTTP) segue
funcionando no Chrome/Firefox.

## E2E com backend real (T44)

`npm run e2e:integration` (`E2E_INTEGRATION=1`, projeto `integration`; nesse modo `mock` e `prod` não rodam).
O `e2e/stack/global-setup.ts` sobe um `postgres:17` descartável (compose, projeto `moneylog-e2e-run`, porta 55433,
volume apagado no fim), o backend (`./mvnw spring-boot:run`, perfil `dev`) e o `webServer` sobe o
`ng serve --configuration local` na porta 4400 (proxy `/v1` para `:8080`). Senha do dono, hash BCrypt (via
`htpasswd` ou `python3`+bcrypt), `JWT_SECRET` e senha do banco são gerados a cada execução e ficam só no ambiente
dos processos (o hash em arquivo temporário fora do repositório). Requer Docker, JDK 21 (`JAVA_HOME`) e `htpasswd`.

- O cookie `ml_refresh` é `Secure`; o Chromium o aceita em `http://localhost`, então a suíte **não precisa do `mkcert`**
  (o HTTPS local continua sendo o caminho para Safari/iPhone).
- `E2E_STACK=external`: usa um stack já de pé (exige `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`, `JWT_SECRET`, `DB_*`
  e `E2E_PG_CONTAINER`). `E2E_REUSE_SERVER=1` reaproveita o `ng serve` da porta 4400. `E2E_EVIDENCE=1` grava as
  capturas em `docs/qa/evidencias/etapa-2/`.
- `z-rate-limit.e2e.ts` bloqueia o IP por 15 min no backend (limite em memória): rode a suíte inteira uma vez por backend.

Hooks (Husky, instalados pelo `prepare` na raiz do repositório): `commit-msg` roda o commitlint
(Conventional Commits) e `pre-commit` roda o lint-staged + `lint:deps` quando o commit toca `frontend/`.

Estrutura e regras de cada camada: veja os README em `src/app`, `src/modules`, `src/util`, `src/styles` e `src/assets`.
