# Telas sucintas: um propósito por tela, só o essencial acima da dobra

Pedido do dono (2026-10-15): o Início tinha informação demais. Ele quer **só as principais**, de modo que **tudo caiba
na tela sem rolar**, e levar o mesmo conceito (tela sucinta, nada complexo) para **todas as outras páginas**.
Decisão de produto já tomada para o Início (abaixo). Nenhuma funcionalidade foi removida: o que saiu de uma tela
continua acessível em outra. O front não calcula nada financeiro: tudo o que aparece é o que a API devolveu.

Os valores citados abaixo são sintéticos (nenhum dado real).

## Regra

1. **Um propósito principal por tela.** Acima da dobra: título, de 1 a 3 números ou ações-chave e a lista principal.
2. **O secundário vai para "Mais"** (`app-disclosure` fechado, chave `brief.more`), abas ou páginas internas.
3. **Filtros recolhidos** e **textos de ajuda curtos**; sem blocos redundantes.
4. **Densidade (1280×720):** a informação principal aparece sem rolar a página; listas longas rolam **dentro do
   próprio painel** (barra fina do app), nunca a página inteira.
5. **O Início não rola em nenhum viewport testado** (1280×720, 1440×800, 390×844), nos temas claro e escuro.

Mecanismo (ADR-011, `src/styles/README.md`): `PageLayout fit` (a página enche a janela por `flex`/`grid` com
`min-height: 0`, sem altura fixa em px, `100dvh`, safe-area), `.fit-stack`/`.fit-scroll` para a lista que rola por
dentro, `SectionContainer` com `fill`, `dense` e `scroll`, e `app-disclosure` para o "Mais". A faixa do modo demo
entra no fluxo (a altura vem da cadeia `body` > `app-root` > `app-shell` > janela).

## Início (decisão de produto)

Fica só isto, em uma tela sem rolagem:

| Bloco                      | Conteúdo (tudo do servidor)                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| Saldo em contas            | `balances.inAccounts` com a variação `inAccountsChange` (texto "vs fim do mês passado")                  |
| Mês                        | Gasto (`month.consumption`), receita (`month.income`) e resultado (`month.net`, do servidor) lado a lado |
| Taxa de poupança           | `savingsRate` do resumo mensal, num medidor pequeno                                                      |
| Você deve                  | total das dívidas (`debt-overview.total`) com link para as dívidas totais                                |
| Próximos compromissos      | até 3 itens com `bucket` vencido, hoje, amanhã ou próximos 7 dias (classificação do servidor), na ordem  |
| Meta em destaque           | por ora, a primeira meta ativa (ordem do servidor) com o selo do degrau e o progresso; sem fotos ainda   |
| Gráfico de entradas/saídas | compacto, 7 dias, 30 dias e 12 meses, a altura é o que sobra da janela                                   |
| "+ Registrar"              | botão primário que abre o modal de Novo registro; o menu ao lado tem receita, crédito e **Emprestei**    |

O que saiu do Início e onde está agora:

| Saiu do Início                                     | Onde está                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Lista de contas e fatura dos cartões               | **Contas** (`/accounts`) e **Cartões** (`/cards`)                                           |
| Gasto por categoria                                | **Planejamento > Resumo do mês** (`/planning/summary/:mês`), logo abaixo dos números do mês |
| Movimentações recentes                             | **Movimentações** (`/transactions`); o gráfico do Início tem o link "Ver movimentações"     |
| Insight e "Perguntar à IA"                         | **Insights** (`/insights`)                                                                  |
| "Compromissos e patrimônio" (legado)               | **Planejamento > Panorama** (`/planning/overview`), com os mesmos `data-cy` e o "Realizar"  |
| Disponível, comprometido, mês, patrimônio, cartões | Panorama (mês, patrimônio e cartões em "Mais")                                              |
| Lista completa de "a seguir"                       | Panorama (com parcelas, "Realizar" e o aviso de vencidos truncados)                         |
| "A receber de terceiros"                           | **Planejamento > A receber** (`/planning/third-parties`)                                    |
| Cartão de metas e atalho "Meta"                    | **Metas** (`/goals`); a reserva rápida fica no detalhe da meta                              |
| Cartão de orçamento ("em breve")                   | **Orçamentos** (`/budgets`)                                                                 |
| Captura rápida expandida                           | modal de Novo registro (botão "+ Registrar", a sidebar e a barra inferior)                  |
| Mensagem do dia                                    | **Notificações** (`/notifications`), no topo da central                                     |
| Atalhos do legado (resumo, projeções)              | abas de Planejamento                                                                        |

## Auditoria das demais telas (1280×720, dados sintéticos do modo demo)

"Fica" é o que está acima da dobra; "Movido" é o que foi para "Mais", aba ou outra tela. Onde diz "rola no painel", a
lista principal rola dentro do próprio painel e a página não rola.

| Tela                           | Propósito principal           | O que ficou                                                                                   | O que foi movido                                                                |
| ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Movimentações                  | Achar e abrir um registro     | Título, "Novo registro", abas de visão e pílulas de filtro numa linha, resumo compacto, lista | A lista rola no painel (o resumo fica fixo em cima)                             |
| Contas                         | Ver e arquivar contas         | Título, "Nova conta", abas, lista                                                             | Rola no painel                                                                  |
| Cartões                        | Ver cartões e faturas         | Sem mudança (já cabia)                                                                        | -                                                                               |
| Detalhe do cartão              | Ver faturas do cartão         | Cabeçalho (limite), abas Faturas e Parcelas futuras (rola no painel)                          | Notas ligadas em "Mais"                                                         |
| Fatura                         | Ver o que há na fatura        | Totais, itens e pagamentos (rola no painel)                                                   | Notas ligadas em "Mais"                                                         |
| Metas                          | Acompanhar metas              | Sem mudança (cartões de meta em 3 colunas)                                                    | Reserva rápida saiu do Início para o detalhe da meta                            |
| Detalhe da meta                | Acompanhar uma meta           | Resumo com progresso e as reservas (rola no painel)                                           | Degrau, plano, consistência e notas ligadas em "Mais"                           |
| Planejamento > Panorama (novo) | Ver o que vence e o que sobra | "A seguir" (rola no painel), disponível, comprometido por horizonte                           | Mês, patrimônio e cartões em "Mais"                                             |
| Planejamento > Recorrências    | Ver recorrências              | Abas, custo fixo, lista                                                                       | Rola no painel                                                                  |
| Planejamento > Pendentes       | Realizar ou pular ocorrências | Abas e lista                                                                                  | Rola no painel                                                                  |
| Planejamento > Resumo do mês   | Ver o mês                     | Seletor de mês, números do mês, **gasto por categoria** (veio do Início)                      | Maior gasto, cartão, notas e comparação com o mês anterior em "Mais"            |
| Planejamento > Projeções       | Ver o saldo projetado         | Aviso de projeção, horizonte, saldo inicial, gráfico                                          | Tabela mês a mês, tendência, premissas e metas em "Mais"; rola no painel        |
| Planejamento > Dívidas totais  | Saber quanto devo             | Total, partes, ações, custo fixo mensal                                                       | Comparação, cartões, pessoas, outras, acompanhados, cronograma e meta em "Mais" |
| Planejamento > A receber       | Saber o que me devem          | Total a receber, pessoas, "Registrar recebimento"                                             | Consumo do mês por terceiros em "Mais"; rola no painel                          |
| Planejamento > Compromissos    | Acompanhar compromissos       | Sem mudança                                                                                   | -                                                                               |
| Detalhe do compromisso         | Acompanhar um compromisso     | Totais, progresso e cronograma (rola no painel)                                               | -                                                                               |
| Pessoas                        | Ver pessoas e saldos          | Sem mudança                                                                                   | -                                                                               |
| Detalhe da pessoa              | Ver o que há com a pessoa     | Resumo e abas (rola no painel)                                                                | Notas ligadas em "Mais"                                                         |
| Notas                          | Achar e abrir notas           | Abas, busca e tags, pastas, lista                                                             | Aviso de onde ficam guardadas e o cofre em "Mais"; a lista rola no painel       |
| Vault                          | Navegar o cofre               | Título, última alteração, pastas, notas e prévia                                              | Importar/exportar o cofre em "Mais"; rola no painel                             |
| IA                             | Ver o estado e pedir à IA     | Estado da IA e ações                                                                          | Histórico, configuração, como ligar e privacidade em "Mais"                     |
| MCP                            | Saber o que vem               | Aviso "em breve" e as ferramentas previstas em 2 colunas                                      | Texto sobre o acesso em "Mais"                                                  |
| Configurações                  | Idioma, tema e sair           | Preferências e sessão lado a lado, atalhos para categorias, notificações, IA e cofre          | Exportar, cofre e o estado vazio da IA em "Mais"; textos de ajuda removidos     |
| Importar                       | Enviar um extrato             | Formatos e o envio                                                                            | Importações recentes em "Mais"                                                  |
| Notificações                   | Ler e marcar como lida        | Filtros e lista (rola no painel); marcar tudo e configurar no cabeçalho                       | Lembretes em "Mais"                                                             |
| Orçamentos                     | "Em breve"                    | Sem mudança                                                                                   | -                                                                               |
| Insights                       | Ler os insights do mês        | Insights                                                                                      | Ações de IA em "Mais"                                                           |
| Mais (celular)                 | Navegar                       | Sem mudança (hub de links da barra inferior; não é uma tela de desktop)                       | -                                                                               |

Telas de formulário (nova conta, novo cartão, nova movimentação, nova meta...) abrem em modal e não entraram na
auditoria de altura; ficam como estavam. O editor de nota (`/notes/:id`) e o detalhe da movimentação também ficam como
estavam: o texto de um documento rola com a página.

**Defeito encontrado e corrigido na auditoria.** Detalhe do cartão, fatura, Resumo do mês, detalhe da meta,
detalhes de dívida e de pessoa e detalhe da movimentação quebravam com `NG0201: No provider found for NotesGateway`
(o bloco de notas ligadas lê `NotesGateway`, que nenhuma dessas rotas fornecia). `provideNotes()` entrou nos provedores
de rota de Planejamento, Cartões (detalhe e fatura), Metas, Dívidas, Pessoas e Movimentações (`lazy-providers.ts`).

## Teste de "cabe na tela"

`frontend/e2e/fit-screen.e2e.ts`: abre o Início em 1280×720, 1440×800 e 390×844, nos temas claro e escuro e em
português, nos projetos `mock` e `prod` (respostas do contrato semeadas, com os 3 compromissos do pior caso) e `demo`
(o backend de exemplo, dados sintéticos). Falha se `document.documentElement.scrollHeight > window.innerHeight`, se a
página rola na horizontal, se algum elemento do conteúdo tem corte ou rolagem horizontal ou se o painel do Início
precisou de rolagem própria. Em 390 px o Início ainda cabe com 3 compromissos até cerca de 780 px de altura; abaixo
disso (barras do Safari) o painel rola por dentro, nunca a página.

## Perguntas em aberto (não decididas aqui)

1. **Meta em destaque.** O servidor ainda não tem o marcador de destaque. Hoje é a primeira meta ativa. A tarefa de
   fotos/slider define o marcador (campo no contrato) e o seletor.
2. **Gasto e receita com variação.** O Início compacto mostra só o saldo com variação; as variações de gasto, receita e
   poupança (que o servidor devolve) ficam no Resumo do mês. Se o dono quiser um chip também no Início, é espaço que o
   celular não tem.
3. **Resultado do mês.** Usa `month.net` do dashboard (receita menos gasto do consumo, como o servidor define). O nome
   no Início é "Resultado"; confirmar se o dono prefere "Saldo do mês" (nome do legado).
4. **Telas de detalhe e de formulário** (detalhe de meta, pessoa, nota, movimentação, fatura) não foram reduzidas além
   de abrir o dado principal: entram em outra rodada se o dono quiser a mesma densidade.
5. **Celular nas demais telas.** A meta de "sem rolar" foi medida em 1280×720; em 390×844 Metas, Dívidas totais,
   Compromissos, Pessoas e Mais ainda rolam a página (só o Início tem a regra estrita).
