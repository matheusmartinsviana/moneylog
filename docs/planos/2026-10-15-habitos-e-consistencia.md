---
titulo: Hábitos, mapa de consistência, integração com atividade (GitHub) e metas em 4 passos
data: 2026-10-15
status: proposto (modo rápido; aguarda decisões da seção 3)
base: docs/adrs/ADR-016-metas-de-medida-estagio-e-plano.md, docs/adrs/ADR-012-notificacoes-e-push.md, docs/planos/2026-10-05-etapa-7-importacao-notificacoes.md
---

# Plano: hábitos, mapa de consistência e metas guiadas

Todos os exemplos são sintéticos (hábitos "Hábito A", "Hábito B", repositório `usuario-exemplo/treino-codigo`). Nada de dado pessoal.

## 1. Objetivo
Dar ao dono um rastreador de hábitos diários, com mapa de consistência estilo GitHub na Home, check-in vinculável às ações das metas e detecção automática (opcional) dos dias em que programou, e fazer toda meta nascer pelos 4 passos (meta, prazo, plano, ações consistentes).

## 2. Escopo
Entra:
- Módulo isolado `core/habit` (hábito BOOLEAN ou QUANTITY, check-in por dia local, sequência, taxa).
- Heatmap calculado só no backend (`GET /v1/habits/heatmap`), faixa na Home e tela própria com o ano.
- Ação de meta vinculada a um hábito (sem dupla contagem).
- Porta `ActivityProvider`: provider `MANUAL` (padrão) e `GITHUB` (opcional, por `.env`), job de sincronização diário idempotente.
- Assistente de 4 passos no modal da meta, com prazo sugerido e ritmo sugerido pelo servidor.
- Lembrete diário opcional de hábitos pendentes (central dentro do app; push segue preparado e desligado).

Não entra (MVP desta fatia):
- Nenhuma escrita no razão, contas, saldos ou resumo financeiro. Hábito não é dinheiro.
- LeetCode por API ou raspagem (sem API oficial). Webhook do GitHub. Raspar perfil público. Token em tabela cifrada ou digitado pela UI.
- Hábitos com horário, múltiplos check-ins por dia, hábitos compartilhados, gamificação (pontos, medalhas).
- Notificação push real (continua Noop).
- IA analisando hábitos.

### Escopo de produto e ADR
Hábitos não aparecem em PR 00..03 (o vault é finanças) e PR 02 proíbe "funcionalidade fictícia". Aqui é funcionalidade real pedida pelo dono, mas fora do escopo financeiro. Recomendação: **exige ADR de escopo (ADR-018)**: registra que hábitos são módulo de "consistência pessoal" separado, sem acoplamento ao razão, ligado às metas só por uma porta de leitura (as metas de dinheiro já têm "ações", ADR-016), e que a regra do PR 01 não se aplica a ele porque não move dinheiro. O Produto adiciona uma nota no vault (PR 00) apontando para a ADR. Regra de dependência: `core/habit` não importa nada de `finance`, `transaction`, `sk/ledger`; `core/goal` lê hábitos por uma porta própria (`HabitPeriodReader`), nunca o contrário. Teste de arquitetura (ArchUnit ou verificação de imports) garante.

## 3. Perguntas em aberto (decisão do dono) e recomendação
| # | Pergunta | Dono | Recomendação |
|---|---|---|---|
| Q1 | O assistente bloqueia salvar sem prazo, plano e ao menos uma ação, ou só orienta (Fantasia/Objetivo/Estratégia)? | Produto | **Bloquear no assistente de criação** ("sempre tem que ter"). A API continua permissiva (backup, metas antigas e importações não quebram; o estágio segue derivado). Metas antigas incompletas ganham o chip "complete o plano" que reabre o assistente no passo faltante. Sem "salvar rascunho". |
| Q2 | Hábito conta como cumprido só ao atingir o alvo, ou parcial conta? | Produto | Só atingir o alvo (BOOLEAN: marcado; QUANTITY: valor >= alvo). Parcial fica registrado e visível ("2,5 de 4 L"), mas conta 0 no mapa. |
| Q3 | Peso igual entre hábitos? | Produto | Sim, peso igual (1 hábito = 1). Sem prioridade nem pesos nesta fatia. |
| Q4 | GitHub entra nesta fatia ou depois? | Produto/Arquitetura | Entra a **porta** e o provider MANUAL (T271). O provider GitHub (T272) é a última task do back, atrás de flag desligada; pode ser adiado sem afetar o resto. |
| Q5 | Quais dias da semana cada hábito vale? | Produto | Padrão: todos os dias. Seleção de dias é opcional por hábito. O dono diz quais hábitos não são diários (ex.: academia e cardio). |
| Q6 | Dia de hoje incompleto no mapa? | UX | Hoje aparece com contorno e a intensidade parcial atual; nunca como "falha". Só dias encerrados entram em sequência e taxa. |
| Q7 | Escopo dos repositórios do GitHub | Produto/Arquitetura | Lista explícita `owner/nome` por hábito (ex.: o repositório de treino). Sem "todos os repositórios". Token fine-grained "only select repositories", somente leitura. |
| Q8 | Limite para editar dias passados | Produto | 30 dias (config `moneylog.habits.edit-window-days=30`); futuro é recusado. |
| Q9 | Regra de cumprimento de ação vinculada a hábito | Produto | Período (semana ou mês) cumprido se `feitos / aplicáveis >= minRatio`, `minRatio` por ação, padrão 0,80. Dono confirma o padrão. |
| Q10 | Mudar os dias da semana de um hábito reescreve o passado? | Produto | Não: vale a partir do dia da mudança (tabela de vigência). |
| Q11 | O dia do commit usa a data do autor ou do committer? | Arquitetura | Data do autor convertida para `America/Sao_Paulo`. |
| Q12 | Hábitos da lista do dono (estudar programação, trabalhar, gravar vídeo, academia, cardio, 4 L de água, 7 h de sono, treino de código) | Produto | O app não vem com hábitos pré-criados; o dono cria. Sugestões na tela vazia como atalhos de criação (BOOLEAN ou QUANTITY com alvo). Nicho do YouTube fica fora (é só o nome do hábito). |
| Q13 | Um hábito "pausado" (férias) | Produto | Fora desta fatia; arquivar encerra a vigência no dia. |

## 4. Modelo (a)

### 4.1 Hábito e registro
- `Habit`: `id`, `userId`, `name` (<= 60), `icon` (chave de um conjunto fixo), `color` (token do tema, nunca hex livre), `kind` BOOLEAN | QUANTITY, `target` e `unit` (só QUANTITY; ex.: 4 L, 7 h; `target > 0`, unidade <= 8 chars), `startsOn` (dia local), `archivedOn` (nulo = ativo), `activity` opcional `{ provider: MANUAL|GITHUB, sourceRef }` (GITHUB: lista de repositórios), `version`.
- `HabitSchedule` (vigência): `habitId`, `effectiveFrom`, `weekdays` (conjunto de 1..7, vazio inválido). Padrão: todos os dias.
- `HabitEntry`: `(habitId, date)` único, `value` (BOOLEAN = 1; QUANTITY = decimal 3 casas), `source` MANUAL | ACTIVITY, `updatedAt`. `done` é **derivado** (nunca gravado): BOOLEAN `value = 1`; QUANTITY `value >= target`. Mudar o alvo vale para frente (o `target` do dia é congelado no registro: coluna `targetAtDay`).
- Migração aditiva `V9.01__habits.sql` (tabelas `habits`, `habit_schedules`, `habit_entries`; índices `(user_id)`, `(habit_id, date)`; sem FK para tabelas financeiras).

### 4.2 Dia local
- `HabitDay.of(Instant, ZoneId)` usando o `Clock` injetado (já existe `TimeConfig`) e a zona `moneylog.habits.zone=America/Sao_Paulo`. Corte à meia-noite local. A data do check-in vem do cliente como `LocalDate`, mas o servidor valida contra o "hoje" local: futuro = `422 HABIT_DATE_IN_FUTURE`; mais antigo que a janela = `422 HABIT_DATE_TOO_OLD`; antes de `startsOn` = `422 HABIT_DATE_BEFORE_START`; dia fora da frequência = `422 HABIT_NOT_SCHEDULED`.
- Horário de verão: toda aritmética em `LocalDate`, nunca em `24h`; o teste usa uma zona com transição de DST para provar que o dia local nunca tem 0 ou 2 chaves.

### 4.3 Sequência e taxa (somente backend)
- Dias aplicáveis de um hábito = dias com `startsOn <= d`, antes de `archivedOn`, e dia da semana na vigência.
- `streak`: dias aplicáveis consecutivos cumpridos, contados de ontem para trás; hoje soma se já estiver cumprido e **não quebra** se ainda não estiver. Dias não aplicáveis são pulados (não quebram nem somam).
- `rate30`: cumpridos / aplicáveis nos últimos 30 dias encerrados (4 casas; `null` se zero aplicáveis).

### 4.4 Como um hábito alimenta uma ação de meta
- `GoalAction` ganha `habitId` (opcional) e `minRatio` (0,01..1, padrão 0,80). Migração `V9.02` aditiva em `goal_actions`.
- Ação vinculada **não guarda** check-ins próprios (`doneIn` vazio no banco): o `GoalReadModel` preenche `doneIn` em memória a partir de `HabitPeriodReader.periods(habitId, frequency, range)`. Fonte única, sem dupla contagem; estágio, `consistency` e `streak` da ADR-016 continuam funcionando sem mudança.
- Regra por período: `WEEKLY` (semana ISO `AAAA-Www`, formato atual) e `MONTHLY` (`AAAA-MM`). Período entra em `doneIn` quando **encerrado** e `feitos/aplicáveis >= minRatio`. Período corrente devolve `progress { done, applicable, ratio, met }` para a UI mostrar "12 de 20", sem entrar em `doneIn`/sequência antes de fechar. `applicable = 0` no período = sem dado (nunca "cumprido").
- Check-in manual numa ação vinculada = `409 GOAL_ACTION_LINKED_TO_HABIT` (marque o hábito). Desvincular copia nada (volta a ser ação manual vazia; avisar na UI).
- `ONE_TIME` não pode ser vinculada (`422`).

## 5. Mapa de consistência (b)

### 5.1 Cálculo de intensidade (só backend)
Para cada dia `d` da janela:
- `total` = hábitos aplicáveis em `d` (ativos, dentro da vigência e do dia da semana). Hábito não aplicável **não entra** em `total`: dia de folga de um hábito não penaliza.
- `done` = aplicáveis cumpridos (regra Q2).
- `ratio = done / total` (decimal, 4 casas) ou `null` se `total = 0`.
- `level` (inteiro, aritmética inteira, sem float): `total = 0` ou `done = 0` -> 0; `done = total` -> 4; senão `done*3 < total` -> 1; `done*3 < 2*total` -> 2; senão 3.
  Invariantes (teste de propriedade): `level` monotônico em `done` para `total` fixo; `level = 4` se e somente se `done = total > 0`; `level = 0` se e somente se `done = 0` ou `total = 0`; `0 <= ratio <= 1`.
- Dia de hoje: calculado com o estado atual, `today: true`. Dias futuros não são devolvidos (`from..to` é cortado em hoje).
- Hábito arquivado continua contando nos dias anteriores a `archivedOn` (o histórico não se reescreve).

### 5.2 Endpoint
`GET /v1/habits/heatmap?from=AAAA-MM-DD&to=AAAA-MM-DD`, janela máxima 400 dias (`400 HEATMAP_RANGE_TOO_LARGE`), `from > to` = `400`.

```json
{
  "zone": "America/Sao_Paulo", "from": "2026-05-11", "to": "2026-10-15",
  "days": [ { "date": "2026-10-14", "done": 5, "total": 8, "ratio": "0.6250", "level": 3, "today": false },
            { "date": "2026-10-15", "done": 2, "total": 8, "ratio": "0.2500", "level": 1, "today": true } ],
  "totals": { "activeDays": 120, "perfectDays": 31, "bestStreakDays": 12 }
}
```
Janelas: Home 22 semanas no celular e 26 no desktop (o cliente pede `from` = segunda-feira da semana inicial); tela própria `/habits/map` 53 semanas.

### 5.3 Acessibilidade
- Não só cor: rampa de 5 tons com contraste mínimo de 3:1 contra o fundo em tema claro e escuro (tokens `--habit-level-0..4` no tema, conforme DS), e padrão de preenchimento (pontos, densidade crescente) como segunda pista; contorno para "hoje".
- Cada célula é focável (`button` em grid navegável por setas), com `aria-label` do tipo "terça, 14 de outubro: 5 de 8 hábitos cumpridos" e tooltip por foco, hover e toque. Legenda "menos .. mais" com os 5 níveis.
- Alternativa em tabela: botão "Ver como tabela" (data, cumpridos, total, nível) na tela própria; a Home tem link para ela. `prefers-reduced-motion` respeitado.

## 6. Integração com atividade (GitHub) (c)

### 6.1 Opções avaliadas
| Opção | Veredito |
|---|---|
| REST `GET /repos/{owner}/{repo}/commits?author&since&until` com PAT fine-grained, somente leitura (Metadata + Contents: read), só nos repositórios escolhidos | **Escolhida.** Escopo mínimo e explícito; dia por commit; paginação; ETag/`If-None-Match` (304 não gasta limite). |
| GraphQL `contributionsCollection.contributionCalendar` (contagem por dia, inclusive privadas sem detalhe) | Alternativa/futuro: mais "contribuições do dia", mas exige validar se o PAT fine-grained expõe o calendário do viewer; fica como spike (risco R3), não bloqueia. |
| Webhook (push event) | Fora: exige endpoint público com HTTPS e segredo, aumenta superfície de ataque numa instância única; o job diário basta. |
| Raspar perfil público | **Proibido** (frágil, viola termos). |

### 6.2 Porta e providers
- `core/habit/app/gateways/ActivityProvider`: `ProviderStatus status()` e `List<DailyActivity> activity(String sourceRef, LocalDate from, LocalDate to, ZoneId zone)` (`DailyActivity { date, count }`; só contagem, nunca mensagem nem conteúdo de commit).
- `ManualActivityProvider` (padrão, devolve vazio, `status = MANUAL`). `GitHubActivityProvider` em `infra/habit/github` (cliente HTTP com timeout de conexão 3 s e leitura 10 s, base URL configurável para testes).
- `.env`: `ACTIVITY_PROVIDER=manual|github` (padrão `manual`), `GITHUB_TOKEN`, `GITHUB_USER`, `GITHUB_API_BASE_URL` (padrão `https://api.github.com`). Mesmo padrão de `AI_*`; token vem do SSM no deploy (ADR-001).

### 6.3 Token e privacidade
- Só em variável de ambiente (`GITHUB_TOKEN`), lida pelo backend. **Nunca** em tabela, resposta, front, log, backup ou exceção. Redação: `toString` sem o token, filtro de logs para `ghp_`/`github_pat_`, `management.endpoint.env`/`configprops` sanitizando `*token*`, mensagens de erro mapeadas para códigos (`ACTIVITY_PROVIDER_UNAUTHORIZED`, `..._RATE_LIMITED`, `..._UNAVAILABLE`).
- A UI mostra apenas estado: "GitHub configurado / não configurado / token recusado", último sync. Tabela cifrada fica como pós (exigiria chave de cifra e UI de entrada; ganho pequeno num usuário único).
- Repositórios privados só são lidos se o dono listar o repositório e o token tiver acesso a ele. Sem listar = não lê. Guarda-se somente `(habitId, date, count)`.

### 6.4 Sincronização
- Job `@Scheduled` às 23:50 (zona do usuário, uma instância) e botão "Sincronizar agora" (`POST /v1/habits/activity/sync`, com intervalo mínimo de 5 min entre execuções).
- Janela: últimos 7 dias (pega push atrasado), idempotente: faz upsert por `(habitId, date)`. Regra de vitória: **marcação manual vence**: se existe `HabitEntry` MANUAL no dia, o sync não toca (inclusive desmarcação manual). Sync nunca apaga (force-push não remove check-in). Entrada de atividade: BOOLEAN = `count >= 1`; QUANTITY (não usado em GitHub nesta fatia) fora do escopo (`422` ao configurar).
- Falhas: timeout, 5xx, 401/403, 429 (respeita `Retry-After`/`X-RateLimit-Reset`) viram `SyncResult.FAILED/…` registrado em `habit_sync_runs` (data, resultado, código); o app **nunca** bloqueia nem atrasa a Home por causa do provider (a leitura não chama o GitHub). Check-in manual segue funcionando. Limite de 5000 req/h; o sync de 7 dias com poucos repositórios usa algumas requisições e ETag.
- LeetCode: sem API oficial e sem raspagem. Caminho: o dono versiona a solução no repositório de treino e o hábito "treino de código" usa o provider GitHub nesse repositório; ou marca manualmente.

## 7. Fluxo guiado da meta (d)
Assistente em 4 passos no modal da meta, com barra de progresso "Passo N de 4" e botão Voltar; cada passo valida antes de avançar (Q1: sem pular).
1. **O que e quanto**: tipo (medida do sistema, reserva etc.) e alvo. Reaproveita os campos atuais.
2. **Até quando**: data-limite com atalhos 3 / 6 / 12 meses; ao escolher, mostra o ritmo exigido (vem do servidor).
3. **Plano**: ritmo sugerido pelo servidor (`requiredPace`, `monthsLeft`, marco do próximo mês) + `planNote` (<= 500). Usuário confirma o ritmo.
4. **Ações consistentes**: escolher/criar hábitos e criar ações (vinculadas ao hábito ou manuais) com frequência. Mínimo 1 ação para concluir.

O estágio (Fantasia/Objetivo/Estratégia) aparece como chip que sobe a cada passo concluído, reaproveitando `stage`. "Sucesso" (`CONSISTENT`) continua sendo conquistado ao longo do tempo.

Backend de apoio: `POST /v1/goals/plan-preview` (sem persistir; usa o `GoalPlanner`) para calcular ritmo sem criar a meta. Nenhum cálculo no front.

## 8. Contrato de API (rascunho; fechado em T265, contrato 2.19.0)
Segue BE 04 / FE 05: escrita devolve o recurso, edição de verdade, ações devolvem o recurso atualizado, `version` com `409` em conflito.

| Método | Caminho | Corpo | Resposta |
|---|---|---|---|
| GET | `/v1/habits?status=ACTIVE|ARCHIVED|ALL` | | `Habit[]` com `streak`, `rate30`, `weekdays` |
| POST | `/v1/habits` | `{ name, icon, color, kind, target?, unit?, weekdays?, startsOn?, activity? }` | `201 Habit` |
| GET | `/v1/habits/{id}` | | `Habit` |
| PATCH | `/v1/habits/{id}` | campos opcionais + `version` | `200 Habit` (`409` versão velha) |
| POST | `/v1/habits/{id}/archive` e `/unarchive` | | `200 Habit` |
| GET | `/v1/habits/today` | | `{ date, done, total, items: [HabitToday] }` (`HabitToday`: habit, `value`, `done`, `applicable`, `streak`) |
| PUT | `/v1/habits/{id}/entries/{date}` | `{ value }` (BOOLEAN: 1) | `200 HabitToday` (idempotente) |
| DELETE | `/v1/habits/{id}/entries/{date}` | | `200 HabitToday` |
| GET | `/v1/habits/{id}/entries?from&to` | | `HabitEntry[]` |
| GET | `/v1/habits/heatmap?from&to` | | `Heatmap` (5.2) |
| GET | `/v1/habits/activity/status` | | `{ provider, configured, lastSyncAt, lastResult, lastErrorCode? }` |
| POST | `/v1/habits/activity/sync` | | `200 { result, daysUpdated }` ou `429` se antes de 5 min |
| POST | `/v1/goals/plan-preview` | `{ kind, metric?, target, deadline }` | `{ requiredPace, monthsLeft, nextMilestone, deadlineOptions:[{months,date,requiredPace}] }` |
| POST/PATCH | `/v1/goals/{id}/actions[/{actionId}]` | + `habitId?`, `minRatio?` | `200 Goal`; ação traz `habitId`, `progress`. Check-in em vinculada = `409 GOAL_ACTION_LINKED_TO_HABIT` |

Notificações: novo `NotificationKind.HABIT_PENDING` (chaves i18n + params, como S-34).

## 9. Home (e) e lembretes (f)
- **Home**: um único cartão "Hábitos" de altura máxima fixa (orçamento ~190 px no celular): título + "3 de 8 hoje"; mapa de 22 semanas (7 linhas x 10 px + folga, ~90 px); linha de "hábitos de hoje" como grade de botões-ícone de 44 px (toque marca; QUANTITY abre um passo rápido +1 / valor). Se houver mais de 8 hábitos, mostra os 8 primeiros pendentes e "+N" que leva à tela `/habits`. Sem hábitos: uma linha com CTA "Criar primeiro hábito". Nada de rolagem; o cartão se encaixa na Home `fit` atual. Dependência: `docs/planos/2026-10-15-telas-sucintas.md` ainda não existe na pasta; a T278 só começa depois que o novo layout da Home estiver fechado, para não disputar espaço com o outro agente (decidir qual bloco cede).
- **Telas**: `/habits` (abas Hoje | Mapa | Gerenciar), acessível pela Home e por "Mais".
- **Lembretes**: job de notificação (Etapa 7) gera, às 20:00 (configurável), uma `HABIT_PENDING` agrupada ("N hábitos pendentes hoje") apenas se houver pendência. Chave de idempotência `(user, HABIT_PENDING, -, dia)`, respeita janela de silêncio e limite de 5 por dia; padrão: central ligada, push desligado (`PushSender` Noop).

## 10. Tasks

Numeração a partir de T265. Cada task cabe em um PR. Definição de pronto: PR 02.

### T265 · dev-backend · Contrato 2.19.0, ADR-018 e ADR-019
Arquivos: `contracts/openapi.yaml`, `docs/adrs/ADR-018-habitos-escopo-e-isolamento.md`, `docs/adrs/ADR-019-activity-provider-e-github.md`. Sem código de produção.
Aceite:
1. Dado o contrato, quando validado, então todos os endpoints da seção 8 existem com códigos de erro e exemplos sintéticos, e o spec passa no validador do projeto.
2. Dado a ADR-018, então registra o isolamento de `core/habit`, a porta `HabitPeriodReader` e que hábitos não tocam o razão.
3. Dado a ADR-019, então registra as opções da 6.1, o token só por ambiente, a regra "manual vence" e o descarte de LeetCode/raspagem/webhook.
Depende de: Q1 a Q13 respondidas (as que travam o contrato: Q2, Q8, Q9, Q10).

### T266 · dev-backend · Domínio puro de hábitos
Arquivos: `core/habit/domain/{Habit, HabitKind, HabitSchedule, HabitEntry, HabitDay, StreakCalculator, HeatmapCalculator, DayCell}`, `exception`, testes unitários e de propriedade. Sem Spring nem banco.
Aceite:
1. Dado hábito BOOLEAN, quando `value = 1`, então `done`; QUANTITY alvo 4 com valor 3,9 -> não cumprido; 4,0 -> cumprido.
2. Dado `total` e `done` quaisquer (propriedade, >= 1000 casos), então valem os invariantes de nível da 5.1.
3. Dado hábito só de segunda a sexta, quando o dia é sábado, então não conta em `total` nem quebra a sequência.
4. Dado hoje incompleto, quando se calcula `streak`, então hoje não quebra; ontem sem cumprir zera.
5. Dado `Clock` fixo em 23:59:59 e 00:00:00 de `America/Sao_Paulo`, então o dia local muda exatamente na meia-noite; numa zona com DST de teste, o dia da transição tem uma só data local.
6. Dado mudança de dias da semana em D, então dias antes de D usam a vigência antiga.
Depende de: T265.

### T267 · dev-backend · Persistência, CRUD e check-in de hábitos
Arquivos: `V9.01__habits.sql`, `core/habit/app/{gateways, usecase}`, `infra/habit/{controller, gateways}`, testes de integração (Testcontainers).
Aceite:
1. Dado `POST /v1/habits` válido, então `201` com o recurso (id, `version`); nome vazio ou `QUANTITY` sem alvo -> `400/422` com código.
2. Dado `PATCH` com `version` velha, então `409`.
3. Dado `PUT /entries/{hoje-3}` dentro da janela, então `200` e o dia reflete o valor; repetir a mesma chamada não muda nada (idempotente); `{hoje+1}` -> `422 HABIT_DATE_IN_FUTURE`; `{hoje-31}` -> `422 HABIT_DATE_TOO_OLD`.
4. Dado dois usuários, quando um lê ou grava hábito do outro, então `404`; listas nunca vazam.
5. Dado arquivar, então some de `today` e dos novos dias, mas permanece no histórico anterior.
Depende de: T266.

### T268 · dev-backend · Heatmap e resumo de hoje
Arquivos: `GetHeatmapUseCase`, `GetTodayHabitsUseCase`, controller, testes.
Aceite:
1. Dado 8 hábitos aplicáveis e 1 cumprido no dia, então `{done:1,total:8,level:1}`; todos cumpridos -> `level:4`; um só hábito cumprido de um só -> `level:4`.
2. Dado um hábito que não se aplica ao dia, então `total` o exclui.
3. Dado `from`..`to` de 401 dias, então `400 HEATMAP_RANGE_TOO_LARGE`; datas futuras são cortadas em hoje.
4. Dado dados de outro usuário, então não entram nas contagens.
5. Dado 3 consultas em carga (1 ano, 8 hábitos), então usa 2 consultas ao banco no máximo (sem N+1) e responde em < 200 ms em teste local.
Depende de: T267.

### T269 · dev-backend · Ação de meta vinculada a hábito
Arquivos: `V9.02` (`goal_actions.habit_id`, `min_ratio`), `core/goal/app/gateways/HabitPeriodReader`, adaptador em `infra`, `GoalReadModel`, `GoalAction`, testes.
Aceite:
1. Dado ação semanal vinculada a hábito diário e `minRatio 0,80`, quando a semana encerrada teve 6 de 7 dias aplicáveis cumpridos, então a semana entra em `doneIn`; com 5 de 7 (71%) não entra.
2. Dado a semana corrente, então `progress` mostra feitos/aplicáveis e **não** entra em `doneIn` nem na `streak`.
3. Dado ação vinculada, quando se tenta check-in manual, então `409 GOAL_ACTION_LINKED_TO_HABIT`; o mesmo dia nunca é contado duas vezes (feitos do hábito = única fonte).
4. Dado período sem dias aplicáveis, então "sem dado", nunca cumprido.
5. Dado `ONE_TIME` com `habitId`, então `422`.
6. Dado verificação de arquitetura, então `core/habit` não importa `core/goal` nem `finance`.
Depende de: T267. Em paralelo com T268.

### T270 · dev-backend · Pré-visualização do plano da meta
Arquivos: `POST /v1/goals/plan-preview` (usa `GoalPlanner`/`GoalMetricValues`), testes.
Aceite:
1. Dado meta de dívida total com alvo e prazo em 6 meses, então `requiredPace` = distância ÷ meses, arredondado para cima ao centavo, igual ao que a meta criada com os mesmos dados devolveria.
2. Dado `deadlineOptions`, então 3, 6 e 12 meses com data e ritmo de cada.
3. Dado prazo no passado ou alvo = valor atual, então `422` com o mesmo código da criação.
4. Dado a chamada, então nada é gravado (contagem de metas e instantâneos inalterada).
Depende de: T265. Em paralelo com T267.

### T271 · dev-backend · Porta ActivityProvider, provider manual e job de sync
Arquivos: `core/habit/app/gateways/ActivityProvider`, `ManualActivityProvider`, `SyncHabitActivityUseCase`, `habit_sync_runs` (V9.03), job, endpoints de status/sync, testes com provider falso.
Aceite:
1. Dado `ACTIVITY_PROVIDER` ausente, então provider `MANUAL`, `status.configured=false`, e o app inicia normalmente.
2. Dado provider falso com commits em 3 dias, quando o job roda duas vezes, então as entradas são as mesmas (idempotente) e o número de linhas não aumenta.
3. Dado entrada MANUAL no dia, então o sync não a altera; dado dia sem commit, então o sync não apaga check-in existente.
4. Dado provider que lança erro/timeout, então `lastResult=FAILED`, Home e check-in manual continuam respondendo, e o job não propaga a exceção.
5. Dado `POST /sync` duas vezes em 5 min, então a segunda devolve `429`.
Depende de: T267.

### T272 · dev-backend · Provider GitHub (REST) atrás de flag
Arquivos: `infra/habit/github/GitHubActivityProvider` (+ config `GITHUB_*`), redação de logs, testes com servidor HTTP falso (MockWebServer ou WireMock).
Aceite:
1. Dado repositório falso com commits em 2 dias (um às 23:30 e outro às 00:30 UTC-3 do dia seguinte), então a contagem por dia respeita `America/Sao_Paulo` e a data do autor.
2. Dado resposta paginada (Link header), então todas as páginas são lidas; dado `304`, então reaproveita o cache e não conta como erro.
3. Dado `401`, `403 rate limit` (com `X-RateLimit-Reset`), `429`, `5xx` e timeout, então cada um vira o código correspondente sem exceção vazando e sem repetir em laço.
4. Dado qualquer cenário, então o valor do token não aparece em logs, mensagens de erro, `/actuator/env`, respostas ou backup (teste que varre a saída capturada).
5. Dado repositório que não está na lista do hábito, então nenhuma requisição é feita a ele.
6. Dado só `owner/nome` na lista, então mensagem de commit e conteúdo nunca são armazenados (somente `date,count`).
Depende de: T271.

### T273 · dev-backend · Lembrete de hábitos pendentes
Arquivos: `NotificationKind.HABIT_PENDING`, gerador no job de notificações (Etapa 7), `NotificationSettings.kinds`, testes.
Aceite:
1. Dado 3 hábitos pendentes às 20:00, então 1 notificação agrupada com `params.count = 3`.
2. Dado rodar o job duas vezes no dia, então continua 1 notificação.
3. Dado todos cumpridos ou nenhum aplicável, então nenhuma notificação.
4. Dado `kinds.HABIT_PENDING=false` ou janela de silêncio, então não gera push; push segue Noop.
Depende de: T268.

### T274 · dev-backend · Backup inclui hábitos e semente de demonstração
Arquivos: exportação JSON (bump de `schemaVersion`), perfil `demo` com dados sintéticos, testes.
Aceite:
1. Dado hábitos e registros, quando exporta o backup, então vêm hábitos, vigências e registros, sem token e sem `GITHUB_*`.
2. Dado o perfil `demo`, então cria 8 hábitos genéricos ("Hábito A".."Hábito H": 6 booleanos, 2 de quantidade) e 26 semanas de registros determinísticos; reexecutar não duplica.
3. Dado perfil de produção, então a semente não roda.
Depende de: T268, T269.

### T275 · dev-frontend · Tipos, serviços e estado de hábitos
Arquivos: `features/habits/{services, models}` (tipos do contrato 2.19.0), i18n pt/en/es, testes de serviço.
Aceite:
1. Dado os tipos gerados do contrato, então compilam sem `any`; o front não calcula `level`, `streak` nem `ratio`.
2. Dado falha do servidor num check-in, então o estado volta ao valor anterior e mostra mensagem (atualização otimista com rollback).
3. Dado resposta `422 HABIT_DATE_*`, então mensagem traduzida.
Depende de: T265 (contrato) e, para integração real, T267/T268.

### T276 · dev-frontend · Tela de hábitos (Hoje e Gerenciar)
Arquivos: `features/habits/pages/habits.page`, formulário de hábito (criar/editar/arquivar), entrada de quantidade, edição de dia passado (seletor limitado a 30 dias), rota e item em "Mais".
Aceite:
1. Dado hábitos do dia, quando toca no BOOLEAN, então marca com um toque e atualiza o contador "N de M".
2. Dado hábito de água (alvo 4 L), quando informa 2,5, então mostra "2,5 de 4 L" e não cumprido; 4 -> cumprido.
3. Dado hábito não aplicável hoje, então aparece desabilitado com o motivo.
4. Dado edição de dia passado, então o seletor bloqueia datas fora da janela e do futuro.
5. Dado tela vazia, então mostra atalhos de criação sugeridos (BOOLEAN/QUANTITY) e não cria nada sozinha.
Depende de: T275.

### T277 · dev-frontend · Componente de mapa de consistência e tela do ano
Arquivos: `shared` ou `features/habits/components/consistency-map`, tela `/habits/map`, tokens de nível claro e escuro, testes (unidade e acessibilidade).
Aceite:
1. Dado a resposta do heatmap, então renderiza uma célula por dia com o `level` recebido, sem recalcular.
2. Dado teclado, então setas navegam entre células e cada uma tem `aria-label` com data, cumpridos e total; tooltip por foco e toque.
3. Dado tema claro e escuro, então os 5 níveis têm contraste >= 3:1 (verificado) e há segunda pista não cromática (padrão).
4. Dado "Ver como tabela", então lista data, cumpridos, total e nível, com os mesmos dados.
5. Dado hoje, então contorno distinto e sem estilo de "falha".
Depende de: T275.

### T278 · dev-frontend · Faixa de hábitos na Home
Arquivos: `features/home/components/habits-strip`, integração na `home.page`.
Aceite:
1. Dado viewport 360 x 640, então a Home continua sem rolagem vertical com o cartão (teste de layout).
2. Dado mapa de 22 semanas, então cabe na largura de 360 px sem rolagem horizontal; 26 semanas no desktop.
3. Dado toque em hábito pendente, então marca e atualiza mapa e contador sem recarregar a página.
4. Dado mais de 8 pendentes, então mostra 8 e "+N" com link para `/habits`.
5. Dado sem hábitos, então uma linha com CTA; dado erro do endpoint, então o cartão mostra erro local e o restante da Home funciona.
Depende de: T277, T276 e do fechamento do layout em `docs/planos/2026-10-15-telas-sucintas.md`.

### T279 · dev-frontend · Assistente de meta em 4 passos
Arquivos: `features/goals/components/goal-wizard` (substitui o formulário de criação), reaproveita `plan-preview`.
Aceite:
1. Dado passo 1 incompleto, quando clica em Avançar, então não avança e mostra o erro do campo.
2. Dado passo 2, quando escolhe "6 meses", então exibe o ritmo vindo do servidor (nada calculado no front).
3. Dado passo 3, então mostra `requiredPace`, `monthsLeft` e marco, e aceita `planNote` <= 500.
4. Dado passo 4 sem nenhuma ação, então "Concluir" fica bloqueado (Q1); com 1 ação, cria a meta e a ação e mostra o chip de estágio `STRATEGY`.
5. Dado Voltar, então os dados dos passos anteriores são mantidos; fechar com dados preenchidos pede confirmação.
6. Dado meta antiga incompleta, então o chip "complete o plano" abre o assistente no passo que falta.
Depende de: T270, T275 (e T269 para vincular hábito no passo 4).

### T280 · dev-frontend · Ação vinculada a hábito no detalhe da meta
Arquivos: componente de ações da meta, seletor de hábito e `minRatio`.
Aceite:
1. Dado ação vinculada, então mostra "12 de 20 dias (60%)" do período corrente e a sequência por períodos.
2. Dado ação vinculada, então o botão de check-in manual não existe e há link "marcar no hábito".
3. Dado `409 GOAL_ACTION_LINKED_TO_HABIT`, então mensagem explicativa.
Depende de: T269, T275.

### T281 · dev-frontend · Configurações de atividade e lembrete
Arquivos: `features/settings` (seção "Hábitos e atividade"), seletor de repositórios por hábito, botão "Sincronizar agora", toggle de lembrete.
Aceite:
1. Dado provider `MANUAL`, então mostra "GitHub desligado" e como ligar por `.env`, sem campo de token.
2. Dado `GITHUB` configurado, então mostra estado, último sync e resultado; "Sincronizar agora" desabilita por 5 min e trata `429`.
3. Dado falha do provider, então aviso discreto e check-in manual intacto.
4. Dado o toggle do lembrete, então grava em `PUT /v1/settings/notifications`.
Depende de: T271, T272, T273, T275.

### T282 · tester · Backend: integridade, fuso, segurança e isolamento
Aceite:
1. Dado `Clock` em 23:59 e 00:01 locais, o check-in cai no dia certo; em zona com DST, nenhum dia duplica ou some.
2. Dado edição de dia passado (limites 30/31 dias, futuro, antes de `startsOn`), então as respostas da seção 4.2.
3. Dado hábito QUANTITY, alvo 4: 3,999 não cumpre, 4,000 cumpre; mudança de alvo não reescreve dias antigos.
4. Propriedade: para combinações aleatórias de hábitos, vigências e registros, o `level` obedece 5.1 e soma de `done` do mapa = registros cumpridos aplicáveis.
5. GitHub com servidor falso: paginação, 304, 401, 403/429, 5xx, timeout, idempotência de 2 execuções, manual vence; token ausente de logs, erros, actuator e backup.
6. Dois usuários: nenhum endpoint de hábito, mapa, sync ou ação vinculada vaza dados.
7. Meta com ação vinculada: sem dupla contagem; zero impacto em saldo, razão e resumo financeiro (snapshot do dashboard igual antes e depois de marcar hábitos).
Relatório em `docs/qa/`. Depende de: T268, T269, T271, T272, T273, T274.

### T283 · tester · Frontend/E2E: assistente, Home, acessibilidade
Aceite:
1. Dado o assistente, percorre os 4 passos e a meta nasce `STRATEGY`; sem ação não conclui.
2. Dado a Home em 360 x 640 e em desktop, sem rolagem, com e sem hábitos, tema claro e escuro.
3. Dado o mapa, passa em auditoria de acessibilidade (axe), navegação por teclado, `aria-label` por dia e tabela alternativa.
4. Dado a demo (perfil `demo`), o mapa mostra tons variados e o check-in da Home altera o dia de hoje.
5. Dado provider fora do ar (simulado), a Home carrega e o check-in manual funciona.
Depende de: T278, T279, T280, T281, T274.

## 11. Ordem de execução
1. Decisões Q1, Q2, Q8, Q9, Q10 (travam o contrato) -> **T265** (sequencial).
2. Em paralelo após T265: **T266** (domínio), **T270** (plan-preview) e **T275** (tipos/serviços do front).
3. Após T266: **T267**. Após T267: **T268**, **T269**, **T271** em paralelo.
4. Front, conforme o back avança: **T276** e **T277** (após T275; integram com T267/T268), depois **T278** (também espera o layout da Home do plano de telas sucintas), **T279** (após T270 e, no passo 4, T269), **T280** (T269).
5. Depois de T271: **T272** (GitHub) e **T273** (lembrete, após T268); **T281** após T272 e T273; **T274** após T268/T269.
6. Teste por último: **T282** (back) e **T283** (front).
Caminho crítico: T265, T266, T267, T268, T277, T278, T283. T272 e T281 (parte GitHub) podem ser entregues depois sem bloquear o restante.

## 12. Riscos
- R1 Home já apertada e em reforma por outro agente: conflito de layout. Mitigação: T278 depende do plano de telas sucintas; o cartão tem orçamento de altura fixo.
- R2 Escopo creep (hábitos viram um app dentro do app). Mitigação: ADR-018, lista "não entra", sem gamificação.
- R3 PAT fine-grained pode não expor o calendário de contribuições; por isso a opção escolhida é REST de commits em repositórios listados. Spike curto dentro de T272 antes de implementar.
- R4 Commits feitos fora do repositório listado, ou squash/force-push alteram contagens: o app mostra "detectado por atividade" e o dono pode corrigir manualmente (manual vence).
- R5 Token vazado em log/erro: testes de varredura (T272/T282) e filtro de redação.
- R6 Rate limit e instabilidade do GitHub: ETag, janela curta, nunca na rota de leitura.
- R7 Mudar regras retroativamente reescreve a consistência: mitigado por vigência de dias, `targetAtDay` e arquivamento com data.
- R8 Migrações V9.xx: numeração `V9` nova para o módulo; conferir conflito com as migrações de fotos de metas (T254 em diante) antes de fechar o número.
- ADRs necessárias: **ADR-018** (escopo e isolamento de hábitos), **ADR-019** (ActivityProvider, GitHub, token). Nota em ADR-012 sobre o novo `HABIT_PENDING`.

## Decisões do dono (2026-10-08)
- **Q1:** o assistente de criar meta BLOQUEIA a conclusão sem prazo, plano e ações (a API segue permissiva para metas antigas e importações; metas antigas incompletas ganham o chip "complete o plano").
- **Q2 (altera a recomendação do plano):** hábito PARCIAL conta PROPORCIONAL. O cumprimento diário de cada hábito é `min(valor/alvo, 1)`; o nível do mapa (0 a 4) deriva da média dos cumprimentos dos hábitos aplicáveis do dia, em aritmética inteira só no backend; nível 4 só com todos 100%. Hábito booleano vale 0 ou 1. O hoje incompleto aparece com contorno, nunca como falha.
- **Q9:** a ação de meta ligada a um hábito fecha o período como cumprida com >= 80% de cumprimento (média do cumprimento diário dos dias aplicáveis).
- **Q4:** a integração com o GitHub fica FORA da primeira entrega, atrás de flag (provider manual padrão; porta `ActivityProvider` já prevista).
- **Demais (Q3, Q5 a Q8, Q10 a Q13):** conforme a recomendação do plano (peso igual; dias da semana opcionais; repositórios um a um quando o GitHub entrar; edição de dias passados até 30 dias; mudança de dias só vale dali em diante; data do commit em America/Sao_Paulo; sem hábitos pré-criados, só atalhos; pausado fica fora).
