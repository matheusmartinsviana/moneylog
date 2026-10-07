# Revisão de código: Etapa 5, frontend (T99 a T104)

Revisor: agente `revisor` · Escopo: `frontend/` (metas, `reserved` no Início, resumo mensal, projeções, saúde financeira, exportação) · Referências: plano da Etapa 5 (anexo FE-S-154 a FE-S-166), `openapi.yaml` 2.3.0, revisões anteriores, ADR-007, PR 00..02, DS, FE 00..10.

Verificações rodadas (somente leitura): `npm run lint:deps` (0 violações), `check-native-controls` (nenhum controle nativo), `check-styles` (ok), `tsc -p tsconfig.app.json --noEmit` (ok). Não rodei `api:types`, testes de integração nem E2E.

## 1. Resumo

O front da Etapa 5 está bem construído no que importa: nenhuma conta financeira no cliente (só `Number()` na escala da sparkline e na largura da barra, ambos só de desenho), `Idempotency-Key` em reserva e criação de meta com reuso da chave após falha ambígua (via `IdempotencyTracker`), `exhaustMap` contra clique duplo, `switchMap` em horizonte e mês, download por `fetch` + Bearer + Blob sem token na URL, `Accept-Language` no CSV, UI própria sem controle nativo, abas como links com `aria-current`, tabela acessível com a sparkline `aria-hidden`.

O problema de **escopo** é real: o módulo `health` e a rota `/planning/health` implementam um endpoint (`GET /v1/health/score`) que não existe no contrato nem no backend, sobre um formato inventado. Isso viola "não implementar funcionalidades fictícias" e o PR 02 (score é pós-MVP). Recomendo remover (seção 3, A1). Além disso há um problema de plataforma (iOS PWA no download) e duas divergências com o backend (idioma `es` do CSV; `Content-Disposition` não é allowlist).

Nenhum 🔴. Dois 🟠 (A1 saúde fictícia, A2 download no iPhone/PWA sem rota de saída).

## 2. Itens conformes

- **Front não calcula:** `progress`, `percent`, `savingsRate`, `monthlyNeeded`, `remaining`, séries e totais vêm da API. `util/ratio.ts` só formata (`Intl.NumberFormat` recebe a string; sem `Number()` nem multiplicação); `ratioForBar` converte só para a largura (0 a 100, grampeada no `ProgressBar`); `ratioSign` lê o texto. `ComparisonRow` lê o sinal do texto de `amount`, mostra o valor sem sinal e o percentual sem sinal, sem recalcular. Mappers só copiam campos. A sparkline usa `Number()` apenas para posicionar pontos (apresentação pura; ver B2).
- **Idempotência:** `GoalReserveFacade` (chave por tentativa, reutilizada no retry e ao reabrir a folha para a mesma meta; dados diferentes geram chave nova; 422 gera chave nova) e `GoalFormFacade.create` (mesmo padrão); `exhaustMap` nos dois. O header sai só quando há chave (reserva, criação). `409 CONFLICT` é tratado como ambíguo (correto: reter a chave é seguro).
- **Códigos de erro:** os 26 códigos `GOAL_*`/`SUMMARY_*`/etc. do backend têm tradução em pt, en e es (conferi um a um); o único ausente, `GOAL_STATE_INCONSISTENT`, é erro interno e cai na mensagem genérica por status.
- **Exportação:** `HttpClient.get` com `responseType: 'blob'` e Bearer pelo interceptor; mesma origem (sem CORS), então o `Content-Disposition` é legível; `problemFromBlobError` lê o JSON do erro em Blob e não lança; `exhaustMap` contra clique duplo; progresso com `role="status"`; revogação do `ObjectURL` após 10 s; `canShare` guardado por `try/catch`; aviso de privacidade do backup; CSV leva `Accept-Language`; o backend manda `Cache-Control: no-store` e o `ngsw-config` não cacheia `/v1`.
- **Projeção/Resumo:** banner "projeção, não certeza" fixo; premissas por chave traduzida (chave desconhecida cai em texto honesto); `partial` com banner e nota; `isProjection` com banner; `savingsRate` nulo mostra "—" com explicação; "Estimativa" na tendência e em `monthlyNeeded`; `uncovered` é aviso em texto e não bloqueia; horizonte, tendência e mês ficam na URL; "Analisar com IA" desabilitado conforme o plano.
- **Robustez de tela:** `GoalDetailFacade.apply(goal)` usa a meta da resposta como estado (sem recarga e sem M5); `VERSION_CONFLICT` não recarrega sozinho; `reserved` no Início vem de `balances.reserved`, com a fórmula em `Tooltip` focável e o link só com `reserved` positivo (lê sinal, não soma).
- **Camadas:** `dependency-cruiser` limpo; `core` sem `HttpClient`; `infra` só com os `*.facade.ts` HTTP; `provide*` só no bootstrap.
- **Testes:** os de facade cobrem reuso de chave, clique duplo, 422 não retentável; os de componente cobrem exportação (progresso, erro com retry, share, axe), formulário de meta, Início com `reserved`. Sem tautologias relevantes.

## 3. Achados

### 🟠 A1 · Módulo e tela de "saúde financeira" contra endpoint que não existe

- **Onde:** `src/modules/health/**`, `src/app/features/planning/pages/health.page.*`, `planning.routes.ts:9,19`, `planning-nav.component.ts` (quinta aba), `app.config.ts:33,72`, `testing/modules-testing.ts:9,32`, `testing/etapa5-testing.ts` (`aHealth`, `HealthGatewayStub`, `provideHealthStub`), i18n, E2E.
- **Problema:** `GET /v1/health/score` não está em `contracts/openapi.yaml` 2.3.0 nem no backend; o formato (`score`, `reason{code,factor,delta}`, `factors[]`, `tone`, `points`) foi inventado pelo front (FE-S-157 admite). O PR 02 e o plano põem o score como pós-MVP; o requisito proíbe funcionalidade fictícia. Em produção a aba "Saúde financeira" aparece para o usuário e mostra "ainda não disponível" (404) ou, se o backend um dia expuser um `/v1/health/score` diferente, o mapper desserializa um formato não acordado. `health.page.ts:59` ainda faz `Math.abs(reason.delta)` (cálculo sobre valor, ainda que "pontos"). A fábrica de mock já devolve score no ambiente mock, ou seja, mostra um número que ninguém calculou.
- **Impacto:** promessa de produto sem lastro; custo de manutenção e de testes; quinta aba que força o layout a quebrar em duas linhas em 375 px (FE-S-163); risco de o front "chutar" um estado financeiro (PR 00 §21).
- **Correção: remover.** Lista exata:
  1. Apagar `src/modules/health/` inteiro (`core/`, `infra/`, `mock-data/`, specs).
  2. Apagar `src/app/features/planning/pages/health.page.{ts,html,css}` e `health.page.spec.ts`.
  3. `planning.routes.ts`: remover o `import { HealthPage }` e a rota `health`.
  4. `planning-nav.component.ts`: remover o link `planning-tab-health` e `'health'` do tipo de `current`; ajustar o comentário "Cinco abas" (com quatro, o `flex-wrap` pode ficar por segurança, mas o motivo cai).
  5. `app.config.ts`: remover `import { provideHealth }` e `provideHealth()`; idem `testing/modules-testing.ts`.
  6. `testing/etapa5-testing.ts`: remover `aHealth`, `HealthGatewayStub`, `provideHealthStub` e o import de `HealthGateway`/`HealthScore`.
  7. i18n: `i18n.ts:1223` (`tabs.health`) e `:1559` (bloco `health`); `pt.ts:1374` e `:1712` (e os equivalentes em `en.ts` e `es.ts`); `translations.spec.ts:119` (`'health'` na lista de chaves).
  8. E2E: `e2e/etapa5.e2e.ts:206` (o `describe('/planning/health')`) e a rota `/planning/health` na lista de `:276`; `e2e/support.ts:120` (tirar `health` da regex de chaves).
  9. Plano: marcar FE-S-157 como "removido" e acertar FE-S-163 (quatro abas).
  - Se o produto quiser manter a tela para uma etapa futura, o mínimo aceitável é guardar o código fora do bundle (branch ou pasta fora de `src/`) e **não** rotear nem listar a aba; nunca uma aba visível para um endpoint sem contrato.

### 🟠 A2 · Download no iPhone / PWA instalado pode deixar o usuário preso (sem gesto, sem saída)

- **Onde:** `file-download.service.ts:20-33` e `export-section.component.ts:63-66`.
- **Problema:** o arquivo é salvo por `<a download>.click()` disparado **depois** de uma requisição assíncrona (sem ativação do usuário) e sem `target`. No iOS, `download` em `blob:` é ignorado em parte das versões e, em PWA instalado (standalone), a navegação para o `blob:` pode abrir o arquivo na própria janela do app, sem barra de volta. O toast "pronto" aparece de qualquer forma. O "Compartilhar" só surge depois (e só com `canShare`), mas o `click()` automático já pode ter tirado o usuário da tela. O plano deixa o teste no aparelho como pendência.
- **Impacto:** backup (a única saída dos dados do usuário) potencialmente inutilizável no alvo principal (PWA mobile-first).
- **Correção:** (a) quando `canShare(file)` for verdadeiro, **não** chamar `save()` automático: mostrar "Compartilhar" / "Salvar" como botão (o `share()` roda dentro de um clique real) e deixar o `save()` como segundo botão; (b) onde `canShare` for falso, manter o clique automático. (c) Exigir o teste manual no iPhone (Safari e PWA instalado) como critério de aceite antes do merge e registrá-lo em `docs/qa/`. (d) Revogar o `ObjectURL` ao destruir o componente também.

### 🟡 M1 · `es` no `Accept-Language` do CSV não tem efeito (cabeçalho continua em português)

- **Onde:** `exports-requests.facade.ts:39-41`, `export.ts:12`; backend `CsvHeaders.java:16` (só `en` e `pt`).
- **Problema:** o comentário do tipo promete que o cabeçalho segue o idioma do app (`pt`, `en`, `es`), mas o backend cai em português para `es`. Usuário em espanhol recebe CSV em português; o contrato diz só "pt padrão, en inglês".
- **Correção:** Produto/Backend decidem: ou o backend ganha `ES` (S-153), ou o front documenta que `es` cai em português e corrige o comentário. Hoje o front está certo; o texto é que é enganoso.

### 🟡 M2 · Nome do arquivo do `Content-Disposition` só tira caminho e controles

- **Onde:** `content-disposition.ts:15-18`.
- **Problema:** não remove `: * ? " < > |`, ponto inicial, espaços/pontos finais, caracteres bidi (`U+202E`, que inverte a extensão exibida) nem limita o comprimento; não garante a extensão esperada. O navegador também saneia o `download`, e o nome vem do nosso backend (risco baixo), mas a defesa em profundidade é barata e o nome aparece no toast.
- **Correção:** allowlist `[^\p{L}\p{N}._-]` -> `_`, máx. 100 caracteres, remover `[‪-‮⁦-⁩]`, e cair no nome padrão se o resultado não terminar em `.csv`/`.json` conforme o tipo exportado. Cobrir com teste (`..%2f`, `evil‮gnp.exe`, nome só de pontos, nome enorme).

### 🟡 M3 · Conflito de versão na meta ainda descarta o digitado (M4 da Etapa 4 só pela metade)

- **Onde:** `goal-form.page.ts:131-137` (`reloadLatest`) e o efeito de `:104-119`.
- **Problema:** o formulário não recarrega sozinho (bom), mas a única saída é "recarregar a versão mais recente", que sobrescreve o digitado; salvar de novo sem recarregar manda a `version` velha e dá conflito outra vez. O usuário não consegue "manter o meu texto e só atualizar a versão".
- **Correção:** no conflito, buscar a meta, atualizar só `version` (guardada à parte do formulário) e oferecer "Salvar de novo com os meus valores" / "Descartar e usar a versão do servidor". Aceitável para o MVP se o UX confirmar; anotar em FE-S.

### 🟡 M4 · Início: folha de reserva é destruída e recriada a cada recarga de metas

- **Onde:** `home.page.html:177-184` (`@if (goals.data(); as list)`), `home.page.ts:afterGoalReserve`, `goals-list.facade.ts` (`startWith(LOADING)`).
- **Problema:** `goals.load('ACTIVE')` passa por `loading`, `data()` vira `null` e a folha some do DOM, levando consigo a `GoalReserveFacade` (e a chave pendente). Hoje só ocorre após sucesso (sem perda), mas uma recarga disparada com a folha aberta (ex.: retry) a fecha. A lista também não tem recarga silenciosa (M5 da Etapa 4): um erro na recarga troca `ready` por `error`.
- **Correção:** manter a folha montada fora do `@if` (passar `[goals]="goals.data() ?? []"` e só abrir com dados) ou dar ao `GoalsListFacade` um `reload` silencioso que preserva o último `ready`.

### 🟡 M5 · Resumo: botão "Analisar" é um botão que não faz nada

- **Onde:** `summary.page.html:11-19`.
- **Problema:** `aria-disabled` sem `disabled`, mantém-se focável e clicável sem efeito; o texto "IA desligada" está em `aria-describedby`, ok, mas um controle morto na tela é ruído até a Etapa 8. Segue o plano, então não é desvio.
- **Correção:** decidir com Produto: manter (conforme o plano) com `disabled` real e `Tooltip`, ou tirar até a Etapa 8.

### 🟢 B1 · Detalhes

- `sparkline.component.ts:148-160`: a série de tendência é normalizada em x pelo seu próprio tamanho; se tiver menos pontos que a base, os eixos não se alinham. Hoje o backend devolve o mesmo horizonte; amarrar o x ao `competence` evita surpresa. `@if (zeroY(); as y)` falha se `y` for `0` (praticamente impossível; trocar por `!== null`).
- `reserve-sheet.component.ts:lastKind`: o toast (reservado/liberado) usa o último tipo enviado; num "tentar de novo" após reabrir a folha com outro tipo pode errar a frase. Guardar o tipo no comando da facade.
- `archive`/`unarchive` não levam chave: um clique repetido após falha ambígua pode mostrar `GOAL_ALREADY_ARCHIVED` quando na verdade deu certo; tratar esse código como sucesso e recarregar.
- `lastFile` (Blob do backup inteiro) fica em memória enquanto a seção existir; zerar após o download/compartilhar.
- `ReserveSheet` (feature `goals`) importado pelo Início: aceitável, no mesmo padrão do `RealizeSheet` de `planning` no Início (depcruise limpo); se aparecer um terceiro uso, promover para `common/`.
- `GOAL_STATE_INCONSISTENT` sem tradução: cai na mensagem genérica (ok); adicionar só se virar caso de UX.

## 4. Riscos

- Aba "Saúde financeira" visível sem contrato (A1).
- Backup indisponível ou confuso em iPhone/PWA (A2): o teste manual no aparelho ainda não foi feito.
- CSV em espanhol com cabeçalho em português (M1).
- Divergência de i18n entre `es` do app e idiomas do CSV até o backend decidir.

## 5. Pendências por dono

- **Produto:** confirmar que o score fica fora do MVP (A1); decidir `es` no CSV (M1); manter ou ocultar "Analisar com IA" (M5); decidir a política de conflito de versão (M3).
- **UX:** fluxo de download/compartilhar no iOS PWA (A2); confirmar o aviso de conflito (M3).
- **Backend:** CSV `es` (M1); confirmar que não haverá `/v1/health/score` antes do pós-MVP.
- **Arquitetura:** nada bloqueante; reavaliar `common/` para `ReserveSheet` se surgir um terceiro uso.
- **Dev frontend:** A1, A2, M2, M3, M4, B1. **QA:** teste manual no iPhone (Safari e PWA instalado) e registro em `docs/qa/`.

## 6. Parecer

🟡 **Aprovado com ajustes.** O núcleo (nenhuma conta no cliente, idempotência com reuso de chave, UI própria, projeção honesta, download autenticado por Blob) está correto e coberto por testes, e as camadas estão limpas. Antes do merge: remover o módulo, a rota e a aba de saúde financeira (A1, lista acima) e corrigir o fluxo de download no iOS com o teste manual no aparelho (A2). Os 🟡 (M1 a M5) podem entrar como ajustes na mesma rodada ou ficar registrados como pendências.
