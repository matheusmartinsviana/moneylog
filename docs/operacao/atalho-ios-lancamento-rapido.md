# Atalho do iPhone: lançamento rápido

Lança um gasto ou uma receita com Toque Duplo nas costas do iPhone, sem abrir o app. O Atalho chama `POST /v1/quick-entries` com um token pessoal (ADR-034).

## Caminho rápido (Atalho pronto)

1. No app, abra Ajustes > Atalhos, escolha a conta e gere o token.
2. No diálogo do token, toque em **Copiar e adicionar atalho**: o token é copiado e o link do iCloud abre.
3. No app Atalhos, toque em Adicionar Atalho e, quando ele perguntar "Cole o token gerado em Ajustes > Atalhos no Monelog", cole o token.
4. Rode uma vez com R$ 1,00 e confira o lançamento em Registros, com o selo "Atalho".

O Atalho pronto nunca carrega token: o token é pergunta de importação, então o mesmo link serve para qualquer pessoa. Link público: https://www.icloud.com/shortcuts/93e52273b18040b3bc472db4ed753cb5 (constante `SHORTCUT_INSTALL_URL` em `frontend/src/app/config/shortcut.ts`). O guia completo está no app em Ajustes > Atalhos > Como ativar o toque duplo.

Se o link do iCloud mudar, atualize só a constante `SHORTCUT_INSTALL_URL`. Antes de publicar um Atalho novo, baixe o registro (`https://www.icloud.com/shortcuts/api/records/<id>`) e confirme que não há `mlq_` dentro e que a pergunta de importação do token está presente.

## 1. Gerar o token

1. No app, abra Ajustes > Atalhos e gere um token escolhendo a conta e a validade (padrão 30 dias, máximo 90).
2. Copie o token na hora: ele aparece uma única vez. No banco fica só o hash.
3. Limite de 3 tokens ativos por pessoa. Revogar libera a vaga.

## 2. Montar o Atalho à mão (alternativa)

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
| 401 `QUICK_TOKEN_INVALID` | Token expirado, revogado, errado ou usuário desativado (o corpo é igual nos quatro casos); caractere trocado na colagem (hífen virar travessão); cabeçalho diferente de `Bearer <token>`. O servidor já ignora espaço e tab nas pontas | Gerar outro token e colar de novo; conferir o cabeçalho `Authorization` |
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
| Link de importação do iCloud com pergunta de importação do token | Funciona: o Atalho compartilhado não leva token e pede o token ao importar |
| Ação UUID/aleatório, abrir o PWA, falha de rede | Ainda não medidos |

O botão "Adicionar atalho" e o "Copiar e adicionar atalho" do diálogo do token abrem o link do iCloud.

## 7. Riscos aceitos

Quem pegar o iPhone bloqueado pode lançar pelo Toque Duplo. A mitigação é revogar o token e estornar. Os limites de taxa ficam em memória e valem para uma única instância do backend.
