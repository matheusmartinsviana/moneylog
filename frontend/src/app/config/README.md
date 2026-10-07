# `src/app/config`

Configuração de ambiente da apresentação: URL base da API, flags de ambiente, configuração de auth.

**Entra:** constantes e tokens de configuração, sem lógica.
**Não entra:** segredo ou token (tudo que vai para o bundle é público, FE 06).

- `environment.ts`: `apiMocks: false` (API real). `environment.mock.ts` (`apiMocks: true`) entra no lugar dele
  por `fileReplacements` nas configurações `mock` e `production-mock` do `angular.json` (S-67). O valor chega à
  infra pelo token `API_MOCKS` (`src/util/api-mocks.ts`), fornecido em `app.config.ts`. Com `true`, as facades de
  requisições respondem com `mock-data` e nenhuma chamada a `/v1` acontece.

O proxy `/v1` para `http://localhost:8080` está em `proxy.conf.json` (usado por `npm start` e `npm run start:local`).
