# Privacidade e aceite do convite: RASCUNHO

Data: 2026-10-20 · Pendência Q12 de `docs/planos/2026-10-18-multiusuario-convite.md` · Base: ADR-032 e ADR-033.

> **Este texto não é assessoria jurídica.** É um rascunho em linguagem simples, escrito a partir do que o sistema faz hoje. O dono deve revisá-lo (idealmente com apoio jurídico, por causa da LGPD) antes de habilitar o flag `moneylog.invitations.enabled` em produção. Itens marcados **[CONFIRMAR COM O DONO]** dependem de decisão jurídica ou de produto.

## Fatos verificados no sistema (base do texto)

| Afirmação | Fonte |
|---|---|
| Dados tratados: e-mail, senha (só hash), papel, status, datas (convite, criação, último acesso) e os dados financeiros do próprio usuário | ADR-032 seção 2 |
| Dados de cada conta são isolados (`user_id` em toda tabela); o dono vê só e-mail, papel, status e datas, não vê dados financeiros de convidados | ADR-032 seções 2 e 6 |
| Convite: link com token de uso único, validade de 7 dias, guardado só como hash; convites em estado final são apagados após 90 dias | ADR-032 seção 4 |
| Envio do e-mail pelo AWS SES, região us-east-1 (o e-mail do convidado passa pela AWS) | ADR-033 |
| Backup diário do banco inteiro, que contém dados de todos os usuários; restauração escopada ao próprio usuário; cifra opcional por chave (`BACKUP_ENCRYPTION_KEY`) e retenção padrão de 7 dias (`moneylog.backup.retention-days`) | ADR-032 seção 5 e 6; `application.yaml` |
| O backend resolve o IP do cliente (`ClientIpResolver`) para limitar tentativas de login; o contador fica em memória e some no restart | ADR-032 seção 6; código |
| O Caddy registra log de acesso (stdout) sem query string, sem `Authorization`, sem `Cookie` e sem `Set-Cookie`; o log de acesso contém, portanto, o IP e o caminho das requisições. O token do convite fica no fragmento da URL e não chega ao log | `infra/caddy/Caddyfile`; ADR-032 seção 4 |
| A Cloudflare fica na frente do domínio e também vê o tráfego (IP e requisições) | `docs/operacao/deploy-gratis-aws.md` seção 11 |
| Sessão por cookie de refresh, necessário para manter o login; sem analytics nem rastreamento de terceiros | ADR-003; busca no código por analytics/sentry não achou nada |
| Não há "esqueci minha senha", MFA, exclusão definitiva de conta nem cadastro público | ADR-032 "Fora do MVP" |
| O IA/análise por provedor externo é restrita ao dono; convidados não enviam dados à IA | ADR-032 seção 5 |

Não foi possível confirmar: período de guarda dos logs de acesso do Caddy/Docker e se o backup de produção está ligado e cifrado hoje (a configuração é por ambiente). Por isso esses pontos aparecem marcados.

Observação para o front: o arquivo `frontend/src/app/common/i18n/sections/access.ts` não existe na árvore atual; a chave `invitation.privacy.paragraphs` deve ser criada pela task T10 (as traduções ficam em `translations/pt.ts`, `en.ts` e `es.ts`). O texto abaixo está dividido em um item por parágrafo, pronto para o array.

---

## Português (pt)

**Título:** Privacidade

**Parágrafos**

1. O Monelog é um app de finanças pessoais de acesso por convite. Quem criou o convite (o dono, c@mviana.tech) é o responsável por este serviço e pode ser contatado nesse e-mail para qualquer dúvida ou pedido sobre seus dados. **[CONFIRMAR COM O DONO: se o dono responde como controlador pessoa física e se há outro canal de contato]**

2. Guardamos o seu e-mail, a sua senha (apenas em forma criptografada, nunca em texto), o seu papel e status na conta, as datas do convite, da criação da conta e do último acesso, e os dados financeiros que você mesmo cadastrar. Os dados financeiros de cada pessoa ficam separados dos de todas as outras. O dono vê apenas e-mail, papel, status e datas; não vê as suas finanças.

3. O e-mail do convite é enviado pelo serviço AWS SES (Amazon, região dos EUA), então o seu e-mail passa por ele. O link vale por 7 dias e só pode ser usado uma vez. Convites já usados, vencidos ou cancelados são apagados depois de 90 dias. Não usamos rastreamento, publicidade nem analytics de terceiros. Como em qualquer site, os servidores e a Cloudflare, que fica na frente do endereço, registram o seu IP e as páginas acessadas por motivos de segurança e funcionamento. **[CONFIRMAR COM O DONO: prazo de guarda desses logs e base legal]**

4. Fazemos uma cópia de segurança (backup) do banco inteiro, e ela contém os dados de todas as contas. Ela é protegida e usada só para recuperar o serviço. **[CONFIRMAR COM O DONO: backup ligado e cifrado em produção, onde fica guardado e por quantos dias; hoje o padrão é 7 dias]**

5. Ainda não há recuperação de senha por e-mail nem exclusão automática da conta: para recuperar o acesso, apagar a conta ou pedir seus dados, fale com c@mviana.tech. **[CONFIRMAR COM O DONO: prazo e procedimento de resposta a pedidos (LGPD), e o que acontece com os dados financeiros ao encerrar a conta, já que o ledger é imutável]**

**Linha de aceite:** Ao criar a conta, você concorda com o tratamento dos seus dados conforme descrito acima. **[CONFIRMAR COM O DONO: se basta o aceite por esta linha ou se é preciso uma página de termos completa]**

---

## English (en)

**Title:** Privacy

**Paragraphs**

1. Monelog is a personal finance app available by invitation only. The person who sent your invitation (the owner, c@mviana.tech) is responsible for this service and can be contacted at that address for any question or request about your data. **[CONFIRM WITH THE OWNER: whether the owner acts as an individual data controller and whether there is another contact channel]**

2. We store your email, your password (only in encrypted form, never as plain text), your role and status in the account, the dates of the invitation, account creation and last access, and the financial data you enter yourself. Each person's financial data is kept separate from everyone else's. The owner only sees email, role, status and dates; they cannot see your finances.

3. The invitation email is sent through AWS SES (Amazon, US region), so your email address passes through it. The link is valid for 7 days and can be used only once. Used, expired or cancelled invitations are deleted after 90 days. We use no tracking, advertising or third-party analytics. As with any website, the servers and Cloudflare, which sits in front of the address, record your IP and the pages accessed for security and operation. **[CONFIRM WITH THE OWNER: retention period of these logs and legal basis]**

4. We keep a backup of the whole database, which contains the data of all accounts. It is protected and used only to restore the service. **[CONFIRM WITH THE OWNER: backup enabled and encrypted in production, where it is stored and for how many days; the current default is 7 days]**

5. There is no password recovery by email or automatic account deletion yet: to regain access, delete your account or request your data, contact c@mviana.tech. **[CONFIRM WITH THE OWNER: response time and procedure for data requests (LGPD), and what happens to financial records when an account is closed, since the ledger is immutable]**

**Acceptance line:** By creating the account, you agree to the processing of your data as described above. **[CONFIRM WITH THE OWNER: whether this line is enough or a full terms page is needed]**

---

## Español (es)

**Título:** Privacidad

**Párrafos**

1. Monelog es una app de finanzas personales con acceso solo por invitación. Quien creó tu invitación (el dueño, c@mviana.tech) es el responsable de este servicio y puede ser contactado en ese correo para cualquier duda o solicitud sobre tus datos. **[CONFIRMAR CON EL DUEÑO: si responde como responsable persona física y si hay otro canal de contacto]**

2. Guardamos tu correo, tu contraseña (solo de forma cifrada, nunca en texto), tu rol y estado en la cuenta, las fechas de la invitación, de la creación de la cuenta y del último acceso, y los datos financieros que tú mismo registres. Los datos financieros de cada persona están separados de los de las demás. El dueño solo ve correo, rol, estado y fechas; no ve tus finanzas.

3. El correo de la invitación se envía mediante AWS SES (Amazon, región de EE. UU.), por lo que tu correo pasa por ese servicio. El enlace vale 7 días y solo puede usarse una vez. Las invitaciones usadas, vencidas o canceladas se eliminan después de 90 días. No usamos rastreo, publicidad ni analítica de terceros. Como en cualquier sitio, los servidores y Cloudflare, que está delante de la dirección, registran tu IP y las páginas visitadas por seguridad y funcionamiento. **[CONFIRMAR CON EL DUEÑO: plazo de conservación de esos registros y base legal]**

4. Hacemos una copia de seguridad de toda la base de datos, que contiene los datos de todas las cuentas. Está protegida y se usa solo para restaurar el servicio. **[CONFIRMAR CON EL DUEÑO: copia activa y cifrada en producción, dónde se guarda y por cuántos días; hoy el valor por defecto es 7 días]**

5. Aún no hay recuperación de contraseña por correo ni eliminación automática de la cuenta: para recuperar el acceso, borrar tu cuenta o pedir tus datos, escribe a c@mviana.tech. **[CONFIRMAR CON EL DUEÑO: plazo y procedimiento de respuesta a solicitudes (LGPD) y qué pasa con los registros financieros al cerrar la cuenta, ya que el libro mayor es inmutable]**

**Línea de aceptación:** Al crear la cuenta, aceptas el tratamiento de tus datos según lo descrito arriba. **[CONFIRMAR CON EL DUEÑO: si basta esta línea o se necesita una página completa de términos]**

---

## Antes de colar no front
- Remover os marcadores **[CONFIRMAR ...]** do texto final, depois que o dono decidir cada um.
- Se o dono não confirmar o backup, o prazo dos logs ou o pedido de dados, reduzir os parágrafos 3 a 5 ao que for verdadeiro no dia da liberação.
