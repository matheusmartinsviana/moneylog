# E-mail de convite: design e compatibilidade (T12b)

Fonte: `backend/src/main/resources/mail/invitation.html` e `invitation.txt`, renderizados por `EmailTemplateRenderer` (`infra/mail/template`). Direção: DS 00..01 (calma, direta, sem cifrão, cadeado ou escudo).

## Marca e assunto (pendente de decisão do dono)
Ponto único: constantes `BRAND_NAME` e `INVITATION_SUBJECT` em `EmailTemplateRenderer`. O HTML e o texto usam `{{brand}}`, `{{subject}}` e `{{preheader}}`. Para trocar, edite só `BRAND_NAME` (e o assunto, se quiser outro texto). Hoje: "Monelog" e "Você foi convidado para o Monelog". Os testes comparam com as constantes, mas ainda fixam o texto atual em `deveResolverPlaceholders`; atualize-o junto.

## Estrutura
- Tabelas com `role="presentation"`, estilo inline, largura fluida com `max-width:600px`; abaixo de 620 px o padding lateral encolhe.
- Ghost table para Outlook desktop (Word): `<!--[if mso]>` abre uma tabela fixa de 600 px e fecha depois do conteúdo. Os comentários condicionais MSO são diretivas e ficam.
- Botão "bulletproof": célula com `bgcolor`, `border-radius` (ignorado no Outlook, que mostra retângulo) e `mso-padding-alt:16px 40px`, link `display:block` com padding 16x40 e fonte 18/20 (altura de toque 52 px). Em telas estreitas (<620 px) ocupa a largura toda. Sem VML.
- Link também em texto visível (`https://<app>/convite#<token>`). O token só vai no fragmento; nada de rastreamento, pixel ou imagem remota.
- Cabeçalho: logo (`<img>` 48x48, `alt` = `{{brand}}`, `display:block;border:0`, `border-radius:12px`) ao lado do nome em texto (24 px, 700). A URL vem do placeholder `{{logoUrl}}` = `{appBaseUrl}/assets/icons/icon-192.png` (PNG quadrado verde-escuro, vale nos dois modos), escapada como os demais valores. É a única imagem: estática, sem pixel nem rastreio. O nome fica sempre em texto porque o Outlook bloqueia imagens até o usuário permitir; sem a imagem o cabeçalho continua legível e o layout não quebra.
- Hierarquia do cartão (padding 40/36, ritmo de 8/12/20/28 px): "Oi," suave, título 28/36 "Você foi convidado para o Monelog", texto 16/26 com quem convidou em negrito, botão, caixa de validade discreta (fundo `accent-soft` #e1eae2 claro, #1a2a20 escuro), link alternativo 14 px em monoespaçada, e fora do cartão o rodapé 13/20: "Se você não esperava este convite, ignore esta mensagem. Nada será criado." e "Enviado pelo Monelog a pedido de <quem> para <destinatário>."
- Preheader oculto (`display:none`, `mso-hide:all`, preenchimento com `&zwnj;&nbsp;`): "<quem convidou> convidou você para o Monelog. O convite vale por 7 dias."
- Fontes: pilha `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif` (a Geist do app não carrega em e-mail); link em `SF Mono, Menlo, Consolas, monospace`.
- Um único bloco `<style>` no `<head>` (só dark mode e a regra de largura estreita). Sem `position`, `flex`, `grid`, `<script>` ou CSS externo.

## Cores (tokens do app, `frontend/src/styles/tokens.css`)
| Papel | Claro | Escuro |
|---|---|---|
| fundo (canvas) | #f1f2ea | #0b1d15 |
| cartão (surface) | #fcfcf8 | #111b15 |
| borda | #dde1d3 | #243127 (equivalente opaco de branco 8% sobre o cartão) |
| texto | #14231c | #f2f3ea |
| texto suave | #4b5b51 | #a9b6ac |
| acento / botão | #1f4d3a | #a9cdb5 |
| texto do botão | #f6f7f0 | #0a1a12 |
| caixa de validade | #e1eae2 | #1a2a20 (opaco, derivado do cartão com acento) |

O cinza de borda escuro é a única cor que não existe como token opaco. Contraste do texto e do botão segue os pares já validados no app.

## Modo escuro
`color-scheme` e `supported-color-schemes` em `light dark`; `@media (prefers-color-scheme: dark)` (Apple Mail, Gmail mobile e web em parte) e seletores `[data-ogsc]`/`[data-ogsb]` (Outlook.com e apps Outlook). O visual claro está inline e é o padrão. Gmail com inversão automática pode alterar cores; conferir na revisão visual.

## Texto plano
`invitation.txt` traz o mesmo link, validade, aviso de "ignore" e destinatário, sem HTML, sem imagem e sem ponto de exclamação. Teste automatizado compara os dois.

## Segurança
Todo valor dinâmico é escapado no HTML (inclusive no atributo `href`); o token é validado como base64url antes de virar link.

## Testes que travam a estrutura
`EmailTemplateRendererTest`: ghost table e `mso-padding-alt`, 600 px, dark mode, preheader, escape, logo (alt, 48x48, url derivada do `appBaseUrl`, escapada, única imagem), layout íntegro sem a imagem, texto plano sem imagem, botão com padding generoso, lint sem script/link/flex/grid, marca e assunto centralizados, texto plano equivalente, voz sem termos proibidos.

## Pendente (T14, tester)
Capturas em Gmail web, Outlook desktop e web, Apple Mail e Gmail mobile (claro e escuro) em `docs/qa/`; entrega real via SES com SPF/DKIM/DMARC.
