---
tags: [moneylog, adr, backend, desempenho, concorrencia]
status: aceito (adiado: sem otimização nesta etapa)
data: 2026-10-05
task: correção da revisão e da QA do backend da Etapa 5 (A2, observação de desempenho, S-263, S-264)
relacionado: docs/arquitetura/dominio-financeiro.md (D1 §8.5: S-79, S-252, S-257, S-263, S-264), ADR-002
---

# ADR-008: carregar o razão inteiro a cada leitura e escrita; ordem de travas

## Contexto

Toda leitura de dashboard, resumo, projeção, lista de metas e contas e toda escrita de meta (reservar, liberar) carregam o `FinancialRecords` inteiro do usuário e calculam em memória (S-79): é isso que garante que lista, dashboard, resumo e projeção usem as mesmas calculadoras (PR 01, regra 10). O custo é linear no número de movimentações.

## Medição (QA T98 e esta rodada)

`GoalVolumeQaIT`, Postgres real em Testcontainers, heap de 2 GB, 12 reservas, máquina com carga média ~5:

| Movimentações | Reservar                   | Leituras (dashboard, resumo, projeção, metas, contas) | CSV            | Backup        | Heap    |
| ------------- | -------------------------- | ----------------------------------------------------- | -------------- | ------------- | ------- |
| 10.000        | ~0,7 s                     | 0,25 a 0,3 s                                          | 0,3 s (0,9 MB) | 0,7 s (11 MB) | +25 MB  |
| 50.000        | ~7,5 s (5 a 6 s sem carga) | 1,7 a 2,0 s                                           | 2,1 s (4,8 MB) | 3,5 s (57 MB) | +122 MB |

## Decisão

**Adiar a otimização.** Não mudar a arquitetura agora: o custo é linear e previsível, 50.000 movimentações são muitos anos de uso de uma pessoa, a integridade (uma só calculadora) vale mais que 5 s numa escrita rara (reserva), e o limite de 200.000 movimentações da exportação (S-260) e o limite de taxa protegem a instância pequena. Revisitar com **uso real** ou quando um usuário passar de ~100 mil movimentações. Caminhos já mapeados, em ordem de custo/benefício: (1) a escrita de meta não precisa do razão para validar (só de `goal_reservations` da meta e da conta) e só o `GoalViews` do retorno o carrega: devolver a meta sem os campos que dependem do razão, ou calcular `uncovered` por SQL; (2) saldo por conta e consumo do mês por agregação SQL em vez de materializar movimentações; (3) cache por usuário invalidado na escrita.

## Ordem de travas (S-252, S-263)

Movimentações → recorrência → cartão → dívidas → pessoas → **metas → contas por id**. A reserva e a liberação travam a meta e depois a conta; o arquivamento da conta trava só a conta e lê as metas sem travá-las (não há ciclo, e reserva × arquivar nunca deixam os dois valerem). Protegida por teste, não só por comentário: `GoalUseCasesTest` registra as travas na ordem; `GoalLockConcurrencyIT` exige só `200`/`422` (nunca `500` nem `409` de deadlock) em reserva × arquivar conta, reserva × liberação, liberações cruzadas e metas diferentes na mesma conta.

## Consequências

- Escrita de meta com 50.000 movimentações custa segundos; aceitável até a revisita.
- Quem inverter a ordem de travas quebra os testes antes de gerar deadlock em produção.
