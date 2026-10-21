# Atalho do iPhone: lançamento rápido

Lança um gasto ou uma receita com Toque Duplo nas costas do iPhone, sem abrir o app. O Atalho chama `POST /v1/quick-entries` com um token pessoal (ADR-034).

## 1. Gerar o token

1. No app, abra Ajustes > Atalhos e gere um token escolhendo a conta e a validade (padrão 30 dias, máximo 90).
2. Copie o token na hora: ele aparece uma única vez. No banco fica só o hash.
3. Limite de 3 tokens ativos por pessoa. Revogar libera a vaga.

## 2. Montar o Atalho

Ações, nesta ordem:

1. **Escolher do Menu** com `Despesa` e `Receita`.
2. Dentro de cada ramo, uma ação **Texto** com `EXPENSE` (Despesa) ou `INCOME` (Receita). A ação Texto precisa estar dentro de cada ramo.
3. **Pedir Entrada** do tipo Número: o valor.
4. **Pedir Entrada** do tipo Texto: a descrição (nome).
5. **Data atual** formatada com formato personalizado `yyyyMMddHHmmss`: vira a chave de idempotência.
6. **Obter conteúdo de URL**:
   - URL: `https://moneylog.mviana.tech/v1/quick-entries`
   - Método: `POST`
   - Cabeçalhos: `Authorization: Bearer <token>`, `Idempotency-Key: <data formatada>`, `Content-Type: application/json`
   - Corpo JSON, com as chaves exatamente assim:

```json
{ "kind": "EXPENSE", "description": "Mercado", "amount": 54.6 }
```

`kind` é `EXPENSE` ou `INCOME`. `amount` aceita número JSON (o campo Número do Atalhos manda com ponto) ou texto brasileiro (`35,50`, `1.234,56`, `R$ 35,00`). Campos opcionais: `category` (chave do sistema ou nome, sem diferenciar acento e caixa), `method` (só no gasto) e `date`. Sem categoria, vai para Outros; sem `method`, grava `OTHER`.

A chave de idempotência tem de 8 a 64 caracteres entre letras, dígitos, `_` e `-`. Duas execuções no mesmo segundo repetem a chave e a segunda não cria outro lançamento.

## 3. Ativar o Toque Duplo

Ajustes > Acessibilidade > Toque > Toque nas Costas > Toque Duplo > escolha o Atalho. Funciona com o aparelho bloqueado, sem Face ID, e roda uma vez por toque.

## 4. Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| 401 `QUICK_TOKEN_INVALID` | Token expirado, revogado, errado ou usuário desativado (o corpo é igual nos quatro casos) | Gerar outro token e atualizar o cabeçalho |
| 400 | Chave ou campo desconhecido, `amount` vazio ou com mais de 40 caracteres, `Idempotency-Key` ausente ou fora do formato | Conferir `kind`, `description`, `amount` e a chave |
| 422 `QUICK_AMOUNT_AMBIGUOUS` | Texto como `1.234` ou `35.500` | Usar vírgula nos centavos ou mandar número |
| 422 `QUICK_AMOUNT_INVALID` | Zero, negativo, mais de 2 casas, notação científica | Corrigir o valor |
| 422 `QUICK_CATEGORY_NOT_FOUND` | Categoria inexistente ou arquivada | Remover `category` ou usar um nome existente |
| 422 `QUICK_ACCOUNT_NOT_ALLOWED` | Conta do token arquivada ou de tipo não permitido | Gerar token para outra conta |
| 422 `QUICK_LIMIT_REACHED` | Só ocorre se o servidor tiver teto configurado | Ver `detail` |
| 429 | Limite de chamadas (20 por minuto por token) ou de falhas por IP | Esperar e tentar de novo |
| Sem rede | Atalho falha e nada é lançado | Lançar depois pelo app; reenviar com a mesma chave não duplica |

## 5. Revogar

Ajustes > Atalhos > revogar o token. Desativar o usuário revoga todos os tokens; reativar não os ressuscita; trocar a senha não os revoga. Lançamento indevido se estorna no app.

## 6. Medido no iPhone do dono (21/10/2026)

| Item | Resultado |
|---|---|
| Toque Duplo com aparelho bloqueado | Roda direto, sem Face ID |
| Execuções por toque | Uma |
| Campo Número | Manda número JSON com ponto (`54.6`) |
| Menu | Exige ação Texto dentro de cada ramo |
| Ação UUID/aleatório, link de importação iCloud, abrir o PWA, falha de rede | Ainda não medidos |

O botão "Adicionar Atalho" só entra se o link de importação do iCloud for viável; por ora o guia do app descreve a montagem manual.

## 7. Riscos aceitos

Quem pegar o iPhone bloqueado pode lançar pelo Toque Duplo. A mitigação é revogar o token e estornar. Os limites de taxa ficam em memória e valem para uma única instância do backend.
