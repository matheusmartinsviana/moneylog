# ADR-020: Início em vidro (glass) sobre fundo verde escuro, tema escuro como principal

Status: **Aceito** (2026-10-13), aprovado pelo dono.

## Contexto
O dono pediu um Início "premium finance dashboard" com vidro fosco, mais escuro, fundo verde escuro profundo, poucos detalhes brancos, minimalista, com um detalhe de luz WebGL (SideRays) discreto. Entrada em verde, saída em vermelho, nunca só por cor. Tokens da demanda: ink `#10172B`, cyan `#A9EAF5`/`#65CFE3`, emerald `#69D4A1`, success `#21885E`, danger `#D85B68`; raios 12/20/28/36; Inter/Geist com numerais tabulares.

Estado vigente (ADR-011 com as emendas "Nova linguagem visual (DS 03)" e "Fatia 2 do visual", e `frontend/src/styles/tokens.css`): gradiente permitido só como token (`--gradient-*`), utilitários `.glass`/`.glass-lens`, `html[data-glass]`, **superfície sólida no Safari/WebKit** e blur barato em celular/toque (`glass-support.ts`), `prefers-reduced-transparency` e `prefers-reduced-motion` já tratados, `--radius-window: 28px`, `--radius-card: 20px`, `--radius-control: 12px`, sidebar em trilho. O ADR-011 descreve acento lilás `#6948d2` no tema claro derivado, enquanto o `tokens.css` usa `--color-accent: #094360`: esta decisão reconcilia os dois tomando o **`tokens.css` como verdade** e emendando o texto do ADR-011.

Conflitos com o DS 00 e o ADR-011: (1) o DS 00 reserva vermelho a risco e saldo negativo e verde a estado positivo; (2) raio 36 px excede a faixa do DS 00 (12 a 18) e do ADR-011 (28); (3) o Safari recebe vidro sólido por custo de compositor; (4) o DS 00 proíbe "dashboard bancário" e "visual cripto". PR 01 e PR 02 não mudam.

## Decisão (proposta)

### 1. Escopo
O visual vale **só no Início**. As demais telas permanecem como estão; levar o glass a elas é decisão futura do dono (Q-34 do plano), em plano próprio.

### 2. Tema e fundo
- **Tema escuro é o principal.** Fundo do Início: verde escuro profundo por **token** (cor sólida e, se preciso, `--gradient-*` em `tokens.css`), **sem fotografia e sem imagem**. Nenhum asset de imagem, licença de foto ou entrada no `ngsw`.
- Tema claro: variante derivada por token, sem SideRays, com os mesmos pares de contraste verificados.
- Detalhe de luz **SideRays** (DG-02B): componente Angular standalone, `ogl` via `import()` dinâmico atrás de `IntersectionObserver`; anima só com WebGL, `prefers-reduced-motion: no-preference`, fora de mobile/toque, sem `Save-Data`/conexão lenta e em aparelho não fraco; senão, fallback estático `--gradient-rays-static`. Opacidade baixa. Cores por nome de token, lidas de `getComputedStyle`.

### 3. Dependência nova
`ogl` (MIT), versão exata e lockfile (FE 08), carregado só pelo chunk do SideRays. Meta: bundle inicial +1 kB gzip no máximo; chunk do `ogl` <= 30 kB gzip (a medir na DG-02B e registrar aqui). Exceção ao "sem novas dependências de runtime". A **licença do componente React Bits colado** é conferida pela sessão principal antes de o código entrar no repositório.

### 4. Cor de receita e despesa
Receita em verde e **despesa de consumo** em vermelho (pedido do dono), **sempre com ícone, sinal e texto**; nos gráficos também por forma de marcador e traço; a série vermelha se chama **"Despesas"**. **O vermelho é exclusivo de despesa de consumo** (`EXPENSE` e `CARD_PURCHASE`). Fatura paga, aplicação, resgate, empréstimo concedido, dinheiro recebido, quitação de dívida, ajuste, transferência e reembolso usam **tom neutro** com o rótulo do tipo (tabela na DG-08 do plano). Isto mantém PR 01 (esses tipos não são despesa) e é uma **exceção consciente** ao DS 00 e ao ADR-011, limitada ao Início. A justificativa do DS 00 (despesa comum não é alerta) é de UX, não de integridade, e cabe ao dono aceitá-la.

### 5. Tokens e contraste (valores a confirmar no `check-contrast`)
Fundo escuro proposto `#06241D`; painel de vidro sólido equivalente a branco a 8% sobre o fundo (`#1A362F`) e a 14% (`#29433D`) para superfícies elevadas. Contrastes calculados (WCAG, valores aproximados porque a mistura real depende da alfa do token):

| Cor | Uso | Sobre fundo `#06241D` | Sobre painel 8% | Sobre painel 14% | Sobre branco | Resultado |
|---|---|---|---|---|---|---|
| texto `#F2F7F5` | texto principal | 15,2 | 12,0 | 9,9 | n/a | passa |
| `#A8C4BC` | texto secundário | 8,8 | 7,0 | 5,8 | n/a | passa |
| emerald `#69D4A1` | receita, positivo | 9,0 | 7,2 | 5,9 | 1,8 | passa no escuro; **no claro só preenchimento/gráfico** |
| cyan `#65CFE3`/`#A9EAF5` | destaque | 9,1 / 12,3 | 7,2 / 9,8 | 5,9 / 8,0 | 1,8 | passa no escuro; **no claro só preenchimento** |
| danger `#D85B68` | despesa | 4,4 | **3,5** | **2,9** | 3,7 | **falha como texto** nos painéis e sobre branco; serve como preenchimento/ícone (>= 3:1) só sobre fundo ou painel 8% |
| success `#21885E` | positivo no claro | 3,7 | 2,9 | 2,4 | **4,4** | **falha** no escuro; **falha por pouco** sobre branco |
| ink `#10172B` | texto sobre cyan/emerald | n/a | n/a | n/a | 17,8 | passa (9,8 sobre emerald/cyan) |

**Ajustes propostos (registro obrigatório do que falha em AA):**
- `--color-expense-text-on-dark`: `#EE8A94` (6,8 no fundo, 5,4 no painel 8%, 4,4 no painel 14%: usar só até o painel 8% ou clarear mais se o painel elevado for usado com texto de despesa). `#D85B68` fica para ícone, marcador e traço do gráfico.
- `--color-income-text-on-dark`: emerald `#69D4A1` (já passa).
- Tema claro: `--color-success-text` `#1C7A53` (5,3 sobre branco) em vez de `#21885E`; `--color-expense-text` `#C23B49` (5,2) em vez de `#D85B68`; emerald e cyan só como preenchimento ou gráfico (>= 3:1 com borda).
- O dono decide se aceita os ajustes ou prefere outro verde/vermelho; o `check-contrast` é a autoridade final e **o token que falhar escurece** (regra do ADR-011).
- Pares de gradiente e do efeito: o `check-contrast` calcula nos pontos mais claro e mais escuro do gradiente do fundo e, para o SideRays, usa a cor da luz na opacidade máxima (`--rays-opacity-max`) sob a alfa **mínima** do painel e exige >= 4,5:1 (texto) e >= 3:1 (gráfico/UI). Uma captura do canvas no frame de pior caso é anexada só como auditoria visual.

### 6. Forma
Raio 36 px **somente no painel central de carteira**; 28 (janela), 20 (cartão) e 12 (controle) nos demais painéis do Início; sombras suaves por token. Fora do Início vale o DS 00 e o ADR-011.

### 7. Política de vidro
- `backdrop-filter` permitido nos painéis **não fixos** do Início, também em Safari/WebKit e no mobile; no máximo **3 painéis com blur ao mesmo tempo** no mobile; nenhum blur em lista rolável.
- Barra inferior e qualquer elemento fixo: translúcido **sem blur** (blur permanente em elemento fixo é o problema documentado no ADR-011).
- Sólido quando: sem suporte, `prefers-reduced-transparency`, ou se a medição em **iPhone real** não cumprir o orçamento (rolagem >= 50 fps com CPU 4x mais lenta; LCP do Início <= 2,5 s no perfil mobile/4G do Lighthouse com mocks). Nesse caso volta ao comportamento atual do Safari e o relatório do tester diz isso.
- `prefers-reduced-motion`: sem parallax, sem transição de transform, sem animação de entrada, sem SideRays animado.

### 8. Tipografia, marca e voz
Mantém a pilha atual (SF no Apple, Geist/Inter nos demais), numerais tabulares. Wordmark em texto via `BRAND_NAME`, sem logo (espaço reservado vazio). Cópia em pt, en e es com paridade, voz calma e factual; a palavra "premium" não aparece na interface.

### 9. Cartões
Cartões reais do usuário, emissor pelo nome (`Card.institution`), sem logos de terceiros, com variação sutil do cartão escuro por token (`--card-issuer-*`) para Itaú, Nubank, Banco do Brasil e Mercado Pago; outro emissor ou nulo usa o neutro. Sem número, validade ou bandeira inventados.

### 10. O que não muda
O front não calcula nada financeiro; dinheiro em string decimal formatada por `Intl` (`R$ 12.450,90`; `-R$ 120,50`); BRL apenas (o "seletor de moeda" é rótulo estático); valores podem ser ocultados no Início e nas notificações (`maskable`); `check-styles` (nenhuma cor ou gradiente literal fora de `tokens.css`), `check-native-controls` e i18n com paridade continuam valendo.

## Alternativas consideradas
1. **Foto de paisagem** (demanda original): descartada pelo dono em favor de fundo por token (peso, licença, contraste).
2. **Manter Safari sempre sólido**: mais seguro e sem custo, mas o visual premium não apareceria em iPhone/Mac Safari; por isso a política 7 tenta blur limitado e mede antes de aceitar.
3. **Vermelho para toda saída de caixa**: rejeitada, pois pintaria fatura paga, aplicação e empréstimo como despesa (viola PR 01).
4. **Biblioteca de gráficos/WebGL maior**: rejeitada; só `ogl`, lazy, para um único efeito decorativo.

## Consequências
- Positivas: identidade escura coerente, sem asset de imagem, contraste auditável por token, política de desempenho mensurável.
- Custo: nova dependência `ogl`; exceção documentada ao DS 00 (vermelho); manutenção de tokens de tema claro e escuro; risco de desempenho do blur em iPhone, mitigado por medição e fallback sólido.
- Os textos do ADR-011 que mudam: acento do tema claro (reconciliado com `tokens.css`), cor de saída no Início, `backdrop-filter` em Safari/mobile nos painéis não fixos do Início, raio do painel central. O restante do ADR-011 continua valendo.

## Plano de quitação
Ao aprovar: emendar o ADR-011 e o DS 00 (nota de exceção do Início). Após a entrega 1: registrar neste ADR o tamanho real do chunk do `ogl`, os números de contraste finais do `check-contrast` e o resultado das medições em iPhone. Se o dono estender o glass a outras telas (Q-34), abrir ADR próprio.

## O que o dono precisa aprovar
1. Escopo só no Início.
2. Tokens da demanda como tokens novos do Início e os **ajustes de valor** da seção 5 (danger e success).
3. Receita em verde e despesa de consumo em vermelho, com a regra de vermelho exclusivo e neutro para os demais tipos.
4. Raio 36 só no painel central.
5. Política de vidro (blur limitado em Safari/mobile, medido em iPhone, com recuo para sólido).
6. Dependência `ogl` e o SideRays com as condições de animação.

## Emenda de implementação (DG-01, 2026-10-13): valores finais

Fonte da verdade dos valores: `frontend/src/styles/tokens.css`. O que mudou em relação ao proposto na seção 5, sempre por falha de contraste AA no `check-contrast`; o tema escuro é o bloco `prefers-color-scheme: dark`/`data-theme`, o claro é o padrão.

| Token | Proposto | Final | Motivo |
|---|---|---|---|
| `--color-expense-text` (escuro) | `#EE8A94` | `#F7B0B7` | `#EE8A94` ficava em ~4,4:1 no painel de 14%; o final passa em AA nos painéis de 8% e 14% |
| `--color-expense-mark` (escuro) | `#D85B68` | `#EE7E89` | `#D85B68` dava ~2,9:1 no painel de 14%, abaixo de 3:1 para marca/ícone |
| `--color-expense-text` e `-mark` (claro) | `#C23B49` | `#B3303E` | `#C23B49` não passava AA sobre o vidro claro composto |
| `--color-income-text` e `-mark` (claro) | `#1C7A53` | `#17694A` | `#1C7A53` não passava AA sobre o vidro claro composto |
| `--color-home-text-muted` (escuro) | `#A8C4BC` | `#B4CEC6` | texto secundário precisava de margem sobre o painel de 14% |
| `--rays-opacity-max` (escuro) | 28% | 10% | acima disso o texto sobre o pior caso do efeito caía abaixo de 4,5:1 |
| `--rays-opacity-max` (claro) | n/a | 0% | raios desligados no tema claro; `--gradient-rays-static: none` |

Sem divergência: receita no escuro `#69D4A1`, texto `#F2F7F5`, fundo `#06241D` com `-lift #0A3128` e `-deep #041A15`, alfa do vidro 8% (forte 14%) no escuro e 62% (forte 82%) no claro.

Nomes finais dos tokens do Início: `--color-home-bg`, `-bg-lift`, `-bg-deep`, `-veil`, `-glass-tint`, `-rays`, `-text`, `-text-muted`, `-action`, `-on-action`; `--color-income-text`, `--color-income-mark`, `--color-expense-text`, `--color-expense-mark`; `--home-glass-alpha`, `--home-glass-alpha-strong`, `--home-veil-alpha`; `--rays-opacity-max`; `--gradient-rays-static`; e os de cartão abaixo.

**Cartões por emissor** (mesmos valores nos dois temas; texto `--card-issuer-fg: #F2F7F5`): neutro fundo `#1B2A27` e marca `#69D4A1`; Itaú `#33220F` / `#F08A24`; Nubank `#2B1A44` / `#B88CF0`; Banco do Brasil `#2C2A0E` / `#F2D230`; Mercado Pago `#0F2A3F` / `#52B2F0`. Tokens: `--card-issuer-{neutral,itau,nubank,bb,mercadopago}-{bg,mark}`. Sem logos; a marca é só acento de cor. **O dono ainda pode rever os tons dos cartões** (são escolha estética, passam em AA).

**Exceção temporária:** o blur da barra inferior (`bottom-nav`), que a seção 7 proíbe em elemento fixo, permanece até a DG-11, que o remove (translúcido sem blur).

**Convenção:** o limite de **3 painéis com blur ao mesmo tempo** no mobile é convenção de código e revisão, não imposto por ferramenta; é verificado na medição da DG-15/DG-16.
