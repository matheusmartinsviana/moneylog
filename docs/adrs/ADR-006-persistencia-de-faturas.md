---
tags: [moneylog, adr, dominio, backend, cartao]
status: aceito (S-119 a validar com o usuário)
data: 2026-10-05
task: T50 (plano da Etapa 3)
relacionado: docs/arquitetura/dominio-financeiro.md (D1 §2.5.1, §2.5.3), ADR-002, S-13, S-37, S-42, S-119
---

# ADR-006: persistência de faturas (id determinístico, materialização preguiçosa, mudança de dias)

## Contexto

O domínio identifica a fatura por `(cardId, closingDate)` (S-13) e **calcula** tudo o que não é identidade: status, total, pago, `carryIn`, `outstanding`, `creditCarry` (S-37). O schema, por outro lado, exige uma linha em `credit_card_invoices` (V1.04) para onde apontam `transaction_installments.invoice_id` (NOT NULL) e `transactions.invoice_id` (pagamento e reembolso no cartão), e a API expõe `/v1/invoices/{id}`. Precisamos decidir **quando** a linha existe, **qual** é o id dela, e o que acontece com as linhas quando o usuário muda fechamento/vencimento (S-42).

## Decisão

### 1. Regra de fronteira

O domínio fala em `closingDate`; **só o mapper e o gateway da infra conhecem `invoice_id`**. Nenhum agregado do `core` guarda id de linha de fatura. A única exceção é a **função pura** `InvoiceIds.of(cardId, closingDate)` (no `core.card.domain`), que os casos de uso de leitura usam para devolver o `id` de uma fatura que ainda não tem linha (§3) e que o gateway usa para gravar a linha: as duas pontas calculam o mesmo valor.

### 2. Id determinístico (UUID v5)

`invoiceId = UUIDv5(namespace, cardId + "|" + closingDate)`:

- namespace fixo e documentado: `c0a8f5d2-6e1b-4a73-9d54-2f8e7b1a3c60` (nunca muda; mudar invalida todos os ids);
- nome = `cardId` em minúsculas, `|`, `closingDate` em ISO-8601 (`2026-10-25`), em UTF-8;
- SHA-1 de `bytes(namespace) ‖ bytes(nome)`, bits de versão (5) e variante (RFC 4122) aplicados, como na RFC 4122 §4.3.

O id é estável entre recálculos, entre réplicas e depois de apagar e recriar a linha. É de **mão única**: do id não se extrai `(cardId, closingDate)` (resolução em §6).

### 3. Materialização preguiçosa

A linha de `credit_card_invoices` é criada **só quando recebe um item** (parcela ou crédito) **ou um pagamento**, na mesma transação da movimentação que a exige. Fatura sem nenhum movimento (a `OPEN` vazia, as `FUTURE` sem parcela) **não tem linha**: é calculada na leitura (`InvoiceChain.invoice(closingDate)`) e responde com o mesmo id determinístico e `total` 0,00. Consequência: não existe job de "abrir fatura do mês" nem linha vazia para limpar.

### 4. `findOrCreate(cardId, closingDate)` sem exceção de unicidade

Implementado em `infra/card/gateways/InvoiceRowGateway`, dentro da transação do chamador:

```sql
INSERT INTO credit_card_invoices (id, user_id, card_id, period_start, closing_date, due_date, reference_month, created_at, updated_at, version)
VALUES (:id, :userId, :cardId, :periodStart, :closingDate, :dueDate, :referenceMonth, :now, :now, 0)
ON CONFLICT DO NOTHING;

SELECT id FROM credit_card_invoices WHERE card_id = :cardId AND closing_date = :closingDate;
```

- `period_start`, `due_date` e `reference_month` vêm do calendário do cartão (`InvoiceCalendar.periodClosingIn`); o gateway confere que o fechamento calculado é o pedido (senão `IllegalStateException`: bug de ligação, vira 500).
- Duas transações concorrentes no mesmo ciclo: a segunda espera a primeira confirmar (índice único), cai no `DO NOTHING` e o `SELECT` (cada instrução em `READ COMMITTED` enxerga o commit) devolve a linha da outra. Nenhuma violação de unicidade chega ao chamador.
- Como o id é determinístico, as duas tentativas tentam inserir **o mesmo id** e o mesmo `(card_id, closing_date)`: a corrida colide na chave primária e na unicidade ao mesmo tempo. Por isso o `ON CONFLICT` **não nomeia** a restrição (`ON CONFLICT (card_id, closing_date)` deixaria escapar a violação da chave primária; verificado pelo IT de concorrência, 20 repetições). A linha única tem o id esperado por `InvoiceIds`.

### 5. Concorrência: trava no cartão, não na fatura

A fatura não existe como linha antes do primeiro item, então **não há o que travar nela**. A serialização das escritas na cadeia (compra, pagamento, estorno, cancelamento, mudança de dias) é a trava `SELECT ... FOR UPDATE` na **linha de `credit_cards`**. Ordem global de travas (a mesma da Etapa 2, estendida): **linhas de movimentação → linha do cartão → linhas das contas em ordem de id**. Sem a trava no cartão, uma compra "para a fatura que acabou de ser quitada" por um pagamento concorrente seria alocada pelo status antigo (D1 §2.5.3, S-14).

### 6. Resolução de `GET /v1/invoices/{id}` (o id não é invertível)

1. Busca `credit_card_invoices` por `id` **e** `user_id`. Achou: a linha dá `(cardId, closingDate)`.
2. Não achou: para cada cartão do usuário, calcula o id (`InvoiceIds.of`) de cada fechamento do calendário na janela **[hoje − 24 meses, hoje + 36 meses]**, alargada para cobrir a cadeia inteira do cartão (da primeira à última fatura com movimento), e compara com o id pedido. Achou: a fatura é montada pela cadeia (vazia ou não).
3. Fora da janela (já alargada), ou sem cartão correspondente (inclusive cartão de outro usuário): `404 INVOICE_NOT_FOUND`.

A lista de faturas de um cartão (`/v1/cards/{id}/invoices`) só devolve ids de fechamentos dentro dessa janela alargada (a cadeia do cartão mais a janela fixa), então todo id devolvido por ela resolve, inclusive as faturas vazias de uma lacuna maior que 24 meses (B4, S-221).

### 7. Mudança de dias (S-42)

Executada por `CardBillingChanges.changeBillingDays` (cartão + movimentações na mesma transação, trava do cartão):

- as regras de fechamento do cartão são trocadas; a fatura corrente e as fechadas **não mudam** (nem data, nem id);
- parcelas e créditos das faturas `FUTURE` são **realocados** pelo domínio. Para cada novo fechamento, `findOrCreate` cria a linha nova (id novo, porque o fechamento mudou);
- linhas cujo fechamento **não** mudou, mas cujas colunas derivadas (`period_start`, `due_date`, `reference_month`) mudaram com a regra nova, **têm essas colunas atualizadas** (a identidade é o fechamento; as colunas são só cache de exibição);
- linhas `FUTURE` que ficaram **sem nenhuma referência** (nenhuma parcela, crédito ou pagamento, **contando também itens inativos**, porque estorno e cancelamento não apagam histórico) são **removidas** na mesma transação. Linha com item inativo referenciando-a é mantida;
- `INVOICE_CHAIN_INCONSISTENT` (item ou pagamento apontando para um fechamento que o calendário não tem) **nunca é silenciado**: a transação inteira dá rollback e a resposta é 500. Perder um item em silêncio seria dupla contagem às avessas.

### 8. Migrações e ordem

Nenhuma migração desta ADR muda tabela existente. As migrações da Etapa 3 usam `V3.*`: existem `V3.01` (índices de cartão, parcelas e lançamentos) e `V3.02` (índice de movimentações por fatura); a `V3.00` do plano nunca foi criada (as tabelas existiam desde a `V1.03`/`V1.04`) e `V3.03` a `V3.05` ficam reservadas. `spring.flyway.out-of-order: true` **só** em `application-dev.yaml`, nunca no padrão nem em `prod`.

## Consequências

- **Positivas:** ids estáveis para a URL; zero linhas vazias; a concorrência vira uma trava só (a do cartão); a leitura (`Invoice`, `Card.currentInvoice`) não depende de a linha existir; o domínio não conhece ids de persistência.
- **Negativas / custos:** resolver um id sem linha custa uma varredura de até 60 fechamentos por cartão (barata: só aritmética de datas); a mudança de dias precisa podar e atualizar linhas (T58); o id não é invertível (não dá para depurar pela URL).

## Alternativas consideradas

| Alternativa                                               | Por que não                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uma linha por mês pré-criada (job ou criação do cartão)   | Linhas vazias para limpar, job para manter, e a mudança de dias precisaria recriar as linhas de todos os meses futuros. O benefício (id sempre existente) é obtido de graça pelo id determinístico.                 |
| Id gerado (UUID v4) e busca por `(card_id, closing_date)` | O id da fatura sem linha não existiria: a URL `/v1/invoices/{id}` da fatura corrente vazia não teria o que apontar, e `Card.currentInvoice` precisaria de uma linha criada numa leitura (GET com efeito colateral). |
| Trava na linha da fatura (`FOR UPDATE`)                   | A linha pode não existir; criar a linha só para travá-la reintroduz a materialização antecipada. A trava no cartão cobre também a cadeia inteira (carry entre faturas).                                             |
| Gravar status/valores na fatura                           | Contradiz S-37 e criaria uma segunda fonte de verdade (PR 01, regra 10).                                                                                                                                            |
