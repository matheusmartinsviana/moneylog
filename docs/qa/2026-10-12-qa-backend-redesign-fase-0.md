# QA backend: redesign fase 0 (T190), relatório PARCIAL (pausado a pedido do dono)

**Parecer até aqui: 🟡 Aprovado com ressalvas, QA incompleta.** Nenhum 🔴. Um 🟠 (HTTP 500 em percent-encoding inválido). Sem `BUILD SUCCESS` de um `clean verify` completo nesta rodada.

## 1. Resultados reais das execuções
- `./mvnw clean verify` (completo): unitários **1.408 verdes**. ITs: 90 de 95 classes antes de eu interromper (684 testes; 2 falhas em `NoteVolumeQaIT`: renomear 157 s > 120 s e NOTE_SEARCH_TIMEOUT 422, ambas por carga da máquina e do banco). Interrompi porque `CardPropertyQaIT` passou a levar minutos por verificação (BUG-QA-02).
- Meus 6 ITs, última execução (todos verdes, `@Disabled` onde há bug):
  - `RedesignFase0PropertyQaIT`: **1/1 verde (539 s)**. 5 épocas (horário de verão 2018 e 2019, 29/02/2028, virada de ano, 2026), 160 operações cada, relógio em 23:59:59 e 00:00:00 locais, oráculo SQL em `ledger_postings`: D7/D30/M3/M12, M12 = dashboard = entries = resumo, `spending-by-category` (itens, other, base, share), `inAccountsChange` = inAccounts em `since`, taxa de poupança e delta, razão intacto, 0 violações. Livros INCOME/EXPENSE só recebem EXPENSE, INCOME, CARD_PURCHASE, REFUND e DEBT_RECOGNITION.
  - `RedesignFase0SearchQaIT`: 13 testes, 3 `@Disabled`, 0 falhas (isolamento nos 5 grupos com dados gêmeos, 50 cargas úteis, NFC/NFD de termo, tamanhos, parâmetros, determinismo, notas só título/caminho, arquivados, concorrência: 59 buscas e 24 escritas sem problema).
  - `RedesignFase0SearchTimeoutQaIT`: 1/1 verde. 100 buscas estouradas seguidas (100 truncated), 8 threads x 40 em paralelo, todas 200; o pool volta com statement_timeout 0, sem conexão presa.
  - `RedesignFase0SearchLimitsQaIT`: 1/1 verde (120/min da busca e 6/min da exportação independentes nos dois sentidos, 401 não consome, 400 de `q` consome, janela deslizante, Retry-After 0..60).
  - `RedesignFase0BordersQaIT`: 8/8 verdes (month/limit/period/asOf inválidos, valor máximo S-78, base zero, categoria negativa, arquivados, 488 janelas de 2027 a 2028 contra SQL, DST, opcionais ausentes x null).
  - `RedesignFase0HttpQaIT` (Tomcat real): 4 testes, 2 `@Disabled`, 0 falhas. Sem CORS aberto, `Cache-Control: no-store` em todas as rotas, nosniff, 401 em JSON.
- Volume (RedesignVolumeQaIT, máquina carregada), 50.000 movimentações: D7 1,96 s; D30 2,95 s; M3 2,35 s; M12 3,10 s; dashboard 3,3 s; resumo 2,7 s; spending-by-category 7,5 s (CPU 3 s); busca 41 a 321 ms; Início (4 cargas) 16,8 s; heap estável. 10.000: Início 2,15 s.
- Frontend (só leitura): `api:check` ok; `tsc --noEmit -p tsconfig.app.json` exit 0. Sem commits no repositório, então "nada removido vs 2.5.x" não é provável por diff.

## 2. Bugs
| Id | Sev | Descrição e reprodução |
|---|---|---|
| BUG-QA-05 | 🟠 | `GET /v1/search?q=ab%ZZ` (também `%C0%AF` e `%` solto) contra o Tomcat real responde **HTTP 500** (corpo problem+json). Percent-encoding inválido tem de dar 400. Camada: back (tratamento do firewall/decodificação). Teste: `RedesignFase0HttpQaIT.percentInvalidoNaoDa500` (@Disabled). Provavelmente atinge outras rotas também (não medido). |
| BUG-QA-06 | 🟡 | Termo vaza para log: `GET /v1/search?q=segredo\|x` (caractere cru recusado pelo Tomcat: `\|`, `{`, `[`, `^`) faz o container logar "Invalid character found in the request target [/v1/search?q=segredo\|x ]". 23 linhas com o termo na execução. Quebra a promessa S-287 ("q fora de todos os logs") para clientes que não codificam a URL (o Angular codifica). Teste: `termoNaoVazaNoLogDoTomcat` (@Disabled). Tomcat também responde 400 em HTML, fora do contrato. |
| BUG-QA-01 | 🟡 | `unaccent` roda depois do escape do LIKE e transforma U+2216, U+FE68, U+FE6A, U+FF05, U+FF3C, U+FF3F em `\`, `%`, `_`: `％` e `＿` de largura total viram curinga ("0％" achou 5 contra 2 do oráculo literal). Só dados do próprio usuário. Testes: `larguraTotalNaoViraCuringa`, `unaccentNaoGeraCuringa` (@Disabled). |
| BUG-QA-04 | 🟡 | Descrição gravada em NFD (letra + marca combinante) não é achada por `acucar` nem `açúcar` (o `unaccent` não remove a marca solta). Termo NFD contra base NFC funciona. Teste: `descricaoEmNfd` (@Disabled). |
| BUG-QA-02 | 🟡 (infra de teste) | `RedesignVolumeQaIT` e `GoalVolumeQaIT` não limpam o que semeiam: ~150 mil lançamentos no Postgres compartilhado fazem `CardPropertyQaIT` (consulta sem `user_id`) levar minutos e `NoteVolumeQaIT` estourar tempos. |
| BUG-QA-03 | 🟢 | `limit=0x2`, `#2`, ` 3`, `+3`, `٣` e `limit=` (vazio) são aceitos (conversão do Spring); decimal fracionário e notação científica dão 400. |
| Notas | 🟢 | `M3` pode ter 15 pontos (contrato 13 a 15; plano ainda diz 13 ou 14). `asOf` só 2000-01-01 a 2100-12-31; `month` recusa 1900-01 e 9999-12 (400). `snippet` de nota mostra o começo do corpo da própria nota (B-2 da revisão). Arquivar conta com saldo dá 422 (então arquivadas têm saldo zero). |

Reabertos do relatório da revisão de código, confirmados por teste: o desempenho de A-1 (Início com 50.000 = 16,8 s sob carga) e a promessa de log de A-2 (BUG-QA-06 é a versão dentro da aplicação).

## 3. O que NÃO foi coberto
- `clean verify` completo verde (a 1ª tentativa foi interrompida; nenhuma segunda rodada completa).
- `RedesignVolumeQaIT` e `GoalVolumeQaIT` isolados, sem poluição, para números de tempo limpos (os acima vêm de máquina carregada).
- Propriedade só com 1 semente por época (160 operações); sem várias sementes, sem despesa dividida com 20 partes, sem mudança de dias em época de DST controlada além do que o acaso gerou.
- `%00` no corpo (GET não tem corpo), ILIKE contra `İ`/`ß` além dos casos listados, memória medida por requisição.
- Validação de exemplos do contrato além do que `Redesign260ContractTest` e as chamadas validadas já fazem; `Account.appearance` (T189) não foi implementado, não testado.
- Percent-encoding inválido nas outras rotas novas (relatórios, resumo).

## 4. Próximos passos para retomar
1. Dev-backend: BUG-QA-05 (400 em vez de 500), BUG-QA-06 (silenciar/redigir o log do Tomcat para `/v1/search`, ou `POST`, ou ajustar a promessa do contrato), BUG-QA-01 (desacentuar o termo antes do escape), BUG-QA-04 (normalizar NFC no termo e na gravação ou na consulta). Depois remover os `@Disabled` correspondentes e rodar.
2. Corrigir BUG-QA-02 (limpar por `user_id` nos testes de volume).
3. Um Maven por vez: `./mvnw clean verify`; depois `-Dit.test=RedesignVolumeQaIT` e `-Dit.test=GoalVolumeQaIT` sozinhos; ampliar `qa.ops` e sementes do `RedesignFase0PropertyQaIT` (`-Dqa.ops=400`).

Arquivos: `backend/src/test/java/com/moneylog/qa/RedesignFase0{Property,Search,SearchTimeout,SearchLimits,Http,Borders}QaIT.java`. Nenhum código de produção, `frontend/` ou `contracts/` alterado. Sem commits.
