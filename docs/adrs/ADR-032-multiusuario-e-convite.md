# ADR-032: multiusuário por convite por e-mail (papéis, ciclo do convite e modelo de ameaça)

Status: **PROPOSTA** (2026-10-18). Decisões Q1, Q2, Q3, Q5, Q6, Q10, Q13 e Q15 tomadas pelo dono; as demais seguem o padrão do plano e podem ser ajustadas por ele. Altera o ADR-003 (autenticação de usuário único) e o ADR-015 (senha do dono e primeiro acesso). Contrato: 2.38.0 (só acréscimos). Plano: `docs/planos/2026-10-18-multiusuario-convite.md`. Revisão: `docs/revisoes/2026-10-18-multiusuario-convite.md`.

## Contexto
O moneylog nasceu como produto de uso pessoal, "não SaaS multiusuário" (PR 00), com um único usuário definido pelo ambiente (`MONEYLOG_OWNER_EMAIL`, ADR-003 e ADR-015). O dono quer convidar outras pessoas por e-mail, cada uma com conta própria e dados financeiros e ledger totalmente isolados dos demais, inclusive do dono.

O que já existe e não muda: `user_id NOT NULL` com FK em toda tabela de negócio, FKs compostas `(id, user_id)` como segunda barreira, `@CurrentUser` resolvido do `sub` do JWT, refresh rotativo, jobs de notificação e de meta que iteram por usuário. Os pressupostos de usuário único que mudam estão no plano (`findOwner()`, `OwnerBootstrap`, `JwtOwnerValidator`, rate limit só por IP, unicidade de e-mail sensível a caixa).

A integridade financeira (PR 01) não é tocada: nenhum cálculo, lançamento ou regra do ledger muda; o que muda é a garantia de que o conjunto de dados de um usuário nunca entra na conta de outro.

## Decisão

### 1. Posicionamento (Q1) e alteração de ADR anteriores
- O produto deixa de ser "uso pessoal, não SaaS multiusuário". **Continua sem cadastro público**: só entra quem o dono convidou.
- **ADR-003** passa a valer para vários usuários: o que era "usuário único" vira "o dono (`OWNER`) mais convidados (`MEMBER`)". JWT curto em memória, refresh rotativo em cookie e a política de revogação permanecem. O rate limit de login ganha chave por e-mail normalizado além do IP.
- **ADR-015** continua válido para o dono (primeiro acesso por código, `MONEYLOG_OWNER_RESET_PASSWORD`). Convidados definem a senha no aceite do convite e não usam o código de primeiro acesso (`setup-password` de um `MEMBER` responde `401 INVALID_SETUP_CODE`).
- Texto novo sugerido ao dono para o **PR 00** (os agentes não editam o vault): "Um Personal Finance & Life Management PWA, instalável na tela inicial, com ótima experiência no celular e no desktop. Por padrão é de uso pessoal; o dono pode convidar, por e-mail, outras pessoas que passam a ter conta própria, com dados totalmente separados. Não há cadastro público nem compartilhamento de dados entre contas." Atualizações análogas sugeridas para BE 06 (convite como única via de criação de usuário) e DS 01 (telas de gestão e de aceite).

### 2. Papéis e status (Q2, Q3, Q5)
| Item | Regra |
|---|---|
| `OWNER` | Exatamente um, garantido por índice único parcial no banco. Definido pelo ambiente (`MONEYLOG_OWNER_EMAIL`). Gerencia convites e usuários. Troca de dono fica fora do MVP. |
| `MEMBER` | Convidado, acesso total aos **próprios** dados. Perfil somente leitura é pós-MVP. |
| `ACTIVE` / `DISABLED` | Desativar bloqueia login e refresh, revoga as sessões e **não apaga dados** (Q8). Reativar devolve o acesso com a mesma senha e os mesmos dados. O dono não se desativa (`409 CANNOT_DISABLE_OWNER`). |
| O que o dono vê | Só e-mail, papel, status e datas de convite, criação e último acesso. Nenhum dado financeiro de convidado (Q3). |
| Autorização | Papel e status são lidos **do banco a cada requisição autenticada**. A claim `role` do JWT é só dica para a interface e nunca autoriza nada: um JWT com `role=OWNER` de um `MEMBER` recebe `403`; um usuário reativado volta a ser aceito com o access token ainda válido, com o papel do banco. |
| Gestão | Só `OWNER` chama `/v1/users/**` e `/v1/invitations/**`, exceto `preview` e `accept`, que são públicos. `MEMBER` recebe `403 FORBIDDEN`. |

### 3. Regra do dono e do backfill (N4)
1. **Backfill da V9.27.** Executa só se ainda não houver `OWNER`. Promove o usuário cujo `lower(email)` é igual ao placeholder do Flyway `owner-email` (ligado à variável de ambiente `MONEYLOG_OWNER_EMAIL`) quando existir. Só cai em `ORDER BY created_at, id LIMIT 1` quando a variável estiver vazia ou não houver correspondência. Banco vazio não altera nada. Nenhuma linha de negócio muda (os dados atuais ficam na conta do dono, mesmo `id`, Q4).
2. **`OwnerBootstrap` em runtime.** Nunca renomeia nem promove um `MEMBER` silenciosamente.
   - Se já existe `OWNER` cujo e-mail difere de `MONEYLOG_OWNER_EMAIL` (definida), o app **falha na subida** com mensagem clara.
   - Se não há `OWNER` e existe usuário com o e-mail do ambiente, promove esse usuário (banco vazio ou migrado sem correspondência).
   - Se não há `OWNER` nem usuário com o e-mail, cria o dono com `role=OWNER`.
   - Se o `OWNER` tem o e-mail do ambiente, nada muda.
3. Troca de dono segue fora do MVP (Q5).

### 4. Convite: token, ciclo de vida e matriz de transições (Q6, Q15)
- Token aleatório de 256 bits (`SecureRandom`, URL-safe), guardado **só como SHA-256**; validade de **7 dias**; uso único; um convite pendente por e-mail.
- **Fragmento da URL (Q15):** o link é `https://moneylog.mviana.tech/convite#<token>`. O fragmento nunca é enviado ao servidor, então não chega a log de acesso do Caddy nem da Cloudflare. O front lê o token, remove-o da URL (`history.replaceState`) e o envia **só no corpo** de `POST /v1/invitations/preview` e `POST /v1/invitations/accept`. Nenhum endpoint recebe o token em caminho ou query. Fica descartado o `GET /v1/invitations/accept/{token}`.
- A página estática do aceite responde com `Referrer-Policy: no-referrer` e `Cache-Control: no-store`; as respostas da API também.
- `EXPIRED` é **gravado**: a leitura trata `PENDING` com `expires_at <= now()` como `EXPIRED` e o job de retenção persiste a mudança. Todo convite e todo `resend` executam, na mesma transação e antes de inserir ou atualizar, `UPDATE ... SET status='EXPIRED' WHERE lower(email)=? AND status='PENDING' AND expires_at <= now()`. O índice único parcial `(lower(email)) WHERE status='PENDING'` fica como rede de segurança.

| Estado atual | Evento | Resultado |
|---|---|---|
| (nenhum) | convidar | `PENDING` |
| `PENDING` não expirado | convidar o mesmo e-mail | `409 INVITATION_PENDING` (com `invitationId`) |
| `PENDING` expirado | convidar o mesmo e-mail | anterior vira `EXPIRED`, novo `PENDING` |
| `PENDING` | `resend` | continua `PENDING`, novo token e novo `expiresAt` (token antigo morto) |
| `EXPIRED` | `resend` | reavalia as regras de convidar na mesma transação: e-mail já usuário -> `409 EMAIL_ALREADY_REGISTERED`; outro `PENDING` não expirado -> `409 INVITATION_PENDING` (com o id dele); teto atingido (descontado este convite) -> `409 USER_LIMIT_REACHED`; senão volta a `PENDING`, novo token e novo `expiresAt` |
| `PENDING` | revogar | `REVOKED` |
| `EXPIRED` | revogar | `REVOKED` (idempotente) |
| `REVOKED` | revogar | `REVOKED` (idempotente) |
| `PENDING` não expirado | aceite válido | `ACCEPTED` e usuário criado |
| `EXPIRED`, `REVOKED`, `ACCEPTED` | aceite | `404 INVALID_INVITATION` |
| `ACCEPTED` | `resend` | `409 INVITATION_NOT_RESENDABLE` |
| `REVOKED` | `resend` | `409 INVITATION_NOT_RESENDABLE` |
| `ACCEPTED` | revogar | `409 INVITATION_NOT_REVOCABLE` |

- **Aceite atômico:** consumo por `UPDATE ... WHERE token_hash=? AND status='PENDING' AND expires_at > now()` (dois aceites simultâneos criam um só usuário); `INSERT users` (unicidade por `lower(email)`), consumo do convite e semeadura de categorias na **mesma transação** (listener síncrono do `UserCreated`); falha em qualquer parte faz rollback e o token continua válido. Senha fraca (`422 WEAK_PASSWORD`) não consome o token. Se o e-mail passou a existir entre o convite e o aceite, a resposta é `404 INVALID_INVITATION` (não revela) e o convite vira `REVOKED` em transação própria (`REQUIRES_NEW`), **commitada mesmo com o 404**.
- **Falha de envio:** o convite é gravado com `deliveryStatus=FAILED` e a resposta é `502 EMAIL_DELIVERY_FAILED` com `invitationId` no `problem+json`; `resend` o reenvia sem duplicar.
- **Teto (Q17):** `moneylog.users.max` (padrão 10) conta usuários (`ACTIVE` e `DISABLED`) mais convites `PENDING` não expirados; `EXPIRED`, `REVOKED` e `ACCEPTED` não contam.
- **Retenção:** convites em estado final são apagados após `moneylog.invitations.retention-days` (90), por privacidade do e-mail.
- **Chave de desligamento:** `moneylog.invitations.enabled` (padrão `true` em dev e `false` em produção até cumprir o portão de liberação do plano, seção 6). Desligada, convidar e `resend` respondem `404 INVITATIONS_DISABLED` (a rota é só do dono, então não há enumeração); `preview` e `accept` respondem `404 INVALID_INVITATION`, indistinguível de token inválido; a gestão de usuários continua.
- **Listas sem paginação:** `GET /v1/users` é limitado pelo teto de usuários (`moneylog.users.max`, padrão 10) e `GET /v1/invitations` por esse mesmo teto somado à retenção de 90 dias dos estados finais; lista curta, sem paginação, filtrável por `status`. Reavaliar se o teto subir.
- **E-mail do convite:** formato inválido cai em `400 VALIDATION_FAILED` pelo schema; não existe `INVITATION_EMAIL_INVALID`, pois `User.normalize` só rejeita e-mail em branco, que o schema já barra.
- Convidar e-mail que já é usuário (inclusive desativado) recusa com `409 EMAIL_ALREADY_REGISTERED`; reativar é ação própria (Q7).

### 5. IA, MCP e backup global só para o dono (Q10, N8)
- IA, MCP e o backup global (o `pg_dump` diário que cobre todos os usuários, Q11) ficam restritos ao `OWNER`. Push e importação ficam liberados ao convidado.
- Exceção: `GET /v1/ai/status` é a sonda de capacidade do front e responde `200 {enabled:false}` para `MEMBER`, sem `403`; previews, análises e `/v1/settings/ai` (GET e PUT) respondem `403`.
- No contrato 2.38.0 o `403` (`application/problem+json`, `code=FORBIDDEN`) passa a constar nos endpoints de IA (`/v1/ai/previews`, `/v1/ai/analyses` e `/v1/settings/ai`), para o front tratar. É aditivo: nenhum payload de sucesso muda. O `403` de `MEMBER` em MCP e em backup global entra no contrato junto com o endpoint, caso ele passe a existir na API (hoje não há rota de MCP nem de backup global no contrato; a exportação e a restauração por usuário continuam escopadas ao próprio `userId` e abertas a qualquer usuário).
- Cotas por usuário só serão necessárias se a IA for liberada a convidados no futuro.

### 6. Modelo de ameaça
| Ameaça | Mitigação | Risco residual |
|---|---|---|
| Token vazado em log de borda (Caddy, Cloudflare) | Token no fragmento, nunca em caminho ou query; envio só por POST; teste varre também o log do Caddy | Quem tem o e-mail ou o histórico do navegador ainda tem o link |
| Link encaminhado ou convite ao e-mail errado | TTL de 7 dias, uso único, revogação e reenvio que mata o token anterior | Entrega acesso a quem receber o link antes do convidado |
| Enumeração de e-mail por resposta | Login com a mesma resposta para inexistente, errado e `DISABLED`; aceite e prévia com `404 INVALID_INVITATION` idêntico nos quatro casos; `429` idêntico | O dono pode sondar e-mails pelo `409 EMAIL_ALREADY_REGISTERED`: aceito e registrado aqui; o convidado não tem acesso a esse endpoint |
| Enumeração de e-mail por tempo | Hash fictício de custo igual quando o usuário não existe; prévia sem consulta extra para token inexistente; testes de latência equivalente | Tolerância estatística |
| E-mail falsificado ou phishing com o domínio | SPF, DKIM e DMARC no domínio, remetente `convite@moneylog.mviana.tech`, `Reply-To` `c@mviana.tech` (Q13) | Depende da configuração de DNS e da reputação do SES |
| Consumo concorrente do mesmo token | `UPDATE` condicional atômico; teste de dois aceites simultâneos | Nenhum conhecido |
| Senha fraca escolhida por terceiros, sem MFA e sem reset | Mesma política do ADR-015 (12 a 72 bytes, diferente do e-mail); perda de senha exige intervenção do dono | **Risco aceito** (MFA e reset por e-mail fora do MVP, pendência de produto) |
| Rate limit em memória | Chave por IP e por hash do e-mail (login) ou do token apresentado (`preview` e `accept`) | **Risco aceito**: o contador some no restart e é contornável com vários IPs (pendência do ADR-003); a entropia de 256 bits do token cobre o aceite |
| Papel obsoleto no JWT | Papel e status lidos do banco a cada requisição; `role` do JWT só dica de UI | Nenhum |
| Sessão de desativado | Desativar revoga refresh na mesma transação; rotação em andamento confere `ACTIVE` na mesma transação | Access token vale até a próxima chamada, que recebe `401` |
| Vazamento entre usuários (PR 01) | `user_id` com FK em toda tabela, FKs compostas, testes de isolamento T7a a T7f e casos da tabela de referência do PR 01 por usuário | `ledger_postings.book_id` é polimórfico (sem FK): garantido pela aplicação e por teste direto |
| CSRF no aceite público | POST sem sessão e sem cookie de autenticação prévio: não é alvo de CSRF | Nenhum |
| Backup único com dados de terceiros | Informado no texto de privacidade (Q12); restauração escopada ao próprio `userId` | A chave de cifra do backup passa a proteger dados de terceiros |

## O que fica fora do MVP
Cadastro público; "esqueci minha senha" por e-mail; verificação de e-mail fora do convite; login social e MFA; compartilhamento de dados entre usuários, famílias ou workspaces; papéis além de `OWNER` e `MEMBER`; troca de dono; visão do dono sobre dados financeiros de convidados; cobrança, planos e limites por usuário além do teto; migração entre contas e "entrar como"; exclusão definitiva de conta (exige decisão sobre ledger imutável, PR 01). A redefinição de senha de convidado já existente é pendência de produto e não existe no MVP.

## Porta de e-mail e SES
Recomenda-se registrar a porta `EmailSender` (core), os adaptadores (SES em produção, log em dev, fake em teste), a região `us-east-1` e a política de remetente em uma **ADR-033 separada**, escrita junto das tasks T4 e T8, para manter esta ADR focada na decisão de produto e de segurança. Alternativas a avaliar lá: SMTP genérico e Resend. O dono pode preferir juntá-las aqui.

## Consequências
- O contrato ganha convites, usuários, `AuthToken.user`, `Problem.invitationId` e os `403`/`502`/`409` novos; só acréscimos, o front antigo ignora o que não conhece.
- A V9.27 (papéis, status, convites e unicidade de e-mail por `lower(email)`) é aditiva e não toca dados existentes.
- Texto de termos e privacidade (Q12) é do dono e é portão de liberação do flag em produção, não de desenvolvimento.
- Aprovação do SES (saída do sandbox, Q16) é manual e bloqueia só a liberação a convidados reais.
