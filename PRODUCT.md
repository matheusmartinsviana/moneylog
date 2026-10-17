# Product

> Inferido de CLAUDE.md, das notas DS 00/DS 01, de `src/styles/tokens.css` e de preferências ditas pelo dono (a home é "mt poluída, mt coisa pra ler"). Não houve entrevista. O dono pode refinar qualquer seção.

## Register

product

## Produto

O Moneylog é um app de finanças pessoais (PWA mobile-first, uso diário) com cálculos feitos só no backend. O front exibe o que a API calcula. Posicionamento: "Your money, logged with context". Não é app de banco: é um espaço de trabalho financeiro privado, calmo e estruturado.

## Usuários

O próprio dono e pessoas próximas. Abrem o app várias vezes ao dia, no celular, em momentos curtos: ver quanto está disponível, registrar um gasto, checar o que vence. A home precisa responder "como estou?" em poucos segundos, sem leitura.

## Personalidade e estética

Calma, minimalista, sobriedade "old money". Paleta verde-floresta, sálvia e marfim. Vidro fosco (liquid glass) com luz suave, aurora e granulado animados sutis. Tipografia Geist (DS aceita Geist/Inter). Voz curta, direta, sem jargão financeiro.

Referências: Apple Notes, Ajustes do macOS, Linear, Numbers.

## Anti-referências

- Baixo contraste, texto cinza claro sobre vidro.
- Sombras duras.
- Layout poluído, excesso de informação, muitos cards iguais.
- Cores vivas, neon, verde "financeiro" agressivo, qualquer azul.
- Dashboard bancário tradicional, cofrinho, cadeado, escudo, cifrão decorativo, logos de emissores.

## Princípios

1. Um foco por tela: na home, o saldo disponível. O resto é apoio.
2. Menos blocos, mais respiro. O que não muda a decisão do dia sai da home.
3. O vidro agrega onde há hierarquia (o foco); não é revestimento de tudo.
4. Números grandes e calmos; rótulos curtos.
5. Dinheiro vem da API, nunca calculado no front.

## Acessibilidade

WCAG AA (o repo roda check-contrast). Movimento reduzido respeitado. Sem rolagem aninhada. Sem `backdrop-filter` em elemento `position: fixed`.
