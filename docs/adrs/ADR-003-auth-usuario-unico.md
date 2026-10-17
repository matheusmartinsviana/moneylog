---
tags: [moneylog, adr, seguranca, backend, frontend]
status: aceito (decisões de segurança do plano da Etapa 2; S-65, S-82 a S-86 ainda dependem de validação do usuário)
data: 2026-10-04
task: T22a (plano da Etapa 2)
relacionado: S-65, S-82 a S-86, §4.2), docs/arquitetura/arquitetura.md (§3.5, §4.5), vault FE 06 e BE 06
---

# ADR-003: autenticação de usuário único (JWT curto em memória + refresh rotativo em cookie)

## Contexto

- O moneylog tem **um usuário** (o dono) por instância, sem cadastro público (BE 06: "qualquer um pode criar usuário" é antipadrão). Os dados são financeiros e a API fica exposta na internet atrás do CloudFront (D2 §6).
- O FE 06 recomenda OIDC + PKCE com um provedor de identidade. Para um único usuário, um IdP (Keycloak, Cognito, Auth0) acrescenta infraestrutura, custo e uma dependência externa sem ganho de segurança proporcional (S-30).
- O front é um PWA Angular. O token de acesso não pode ficar em `localStorage`/`sessionStorage` (qualquer XSS o lê), e o refresh precisa sobreviver ao fechamento do app.
- Em produção o front e a API ficam no **mesmo domínio** (CloudFront serve `/*` e `/v1/*`), então não há CORS. Em dev o proxy do Angular encaminha `/v1`.
- O hash BCrypt tem `$`, que o Docker Compose e o shell interpolam (D2 §3.5), e o app roda numa instância só (EC2 t3.micro, D2 §6).
- A Etapa 2 (T22b) implementa. Esta ADR fecha as decisões antes do código, para a implementação não decidir regra.

## Decisão

### 1. Desvio do FE 06: login próprio, sem IdP (S-30)

Login com e-mail e senha do dono, **JWT de acesso curto + refresh opaco rotativo**. É um desvio consciente da recomendação OIDC + PKCE do FE 06, justificado pelo usuário único. A reavaliação acontece antes do deploy (seção 9).

### 2. O dono e a senha (S-65, S-82)

- Não existe cadastro público. O dono é criado no primeiro boot a partir de `MONEYLOG_OWNER_EMAIL`, e `OwnerCreated` é publicado (dispara o seed de categorias, S-38/S-59, depois do commit).
- **O hash BCrypt da senha fica só no ambiente** (`MONEYLOG_OWNER_PASSWORD_HASH` ou `MONEYLOG_OWNER_PASSWORD_HASH_FILE`, com o caminho de um arquivo), **nunca no banco**. Trocar a senha é trocar o `.env`/o parâmetro e reiniciar. Comparação com `BCryptPasswordEncoder`.
- No `.env` o hash vai entre **aspas simples** (`MONEYLOG_OWNER_PASSWORD_HASH='$2a$10$...'`); escrito direto no compose, cada `$` vira `$$`. A alternativa `_FILE` evita o problema. T22b tem teste lendo um hash com `$` dos dois jeitos.
- **O dono é a única linha de `users`.** No boot: se `users` está vazia, cria o dono com o e-mail do ambiente e publica `OwnerCreated`; se a linha existe com **outro e-mail**, o e-mail é **atualizado mantendo o `id`** (log `INFO` com o e-mail antigo mascarado) e `OwnerCreated` **não** é publicado. O app nunca insere uma segunda linha (o `EnsureOwnerUseCase` só insere com a tabela vazia, e um IT prova isso). Motivo: todos os dados são filtrados por `userId`; trocar o e-mail no `.env` não pode deixar tudo órfão. Não há constraint de linha única no banco, porque os ITs de isolamento precisam de um segundo usuário.

### 3. Token de acesso

- **JWT HS256 de 15 minutos**, claim `sub` = `userId`, validado pelo Spring Security Resource Server (Nimbus, sem `jjwt`: o menor número de bibliotecas novas). O segredo é `JWT_SECRET` (variável de ambiente), **no mínimo 32 bytes**; com menos, **a aplicação não sobe** e o log diz por quê, sem imprimir o segredo.
- O front guarda o token **só em memória** (nunca em storage) e o anexa como `Authorization: Bearer` apenas às chamadas para `/v1`. Quem precisa de sessão persistente usa o refresh.
- Todo gateway filtra pelo `userId` do token. Sem token, expirado ou com assinatura inválida: `401 UNAUTHENTICATED` (`ProblemDetail`). Recurso de outro usuário: `404`.

### 4. Refresh token (cookie `ml_refresh`)

- **Opaco**, aleatório, de **30 dias**, **rotativo** (cada uso emite um novo e marca o anterior como substituído) e guardado **só como hash SHA-256**, com `family_id`, `expires_at`, `revoked_at`, `replaced_by`, `replaced_at` e `user_id` (FK para `users`).
- Cookie: **`HttpOnly`, `Secure` sempre, `SameSite=Strict`, `Path=/v1/auth`, `Max-Age=2592000`**. **Sem o prefixo `__Host-`**: ele exige `Path=/`, que expõe o cookie a todas as rotas e conflita com `Path=/v1/auth`.
- Rotas: `POST /v1/auth/login` (corpo `{email, password}` → `200 {accessToken, expiresAt}` + cookie), `POST /v1/auth/refresh` (cookie → `200` + cookie novo) e `POST /v1/auth/logout` (`204`, cookie expirado, família revogada). São as únicas rotas públicas de negócio, além de `GET /actuator/health/**` e do Swagger no perfil `dev`.

### 5. Detecção de reuso com janela de tolerância (S-83)

- Um refresh **já rotacionado** que reaparece é suspeito de roubo: **reuso revoga a família inteira**.
- **Mas** duas abas abrindo juntas, F5 durante um refresh ou o `provideAppInitializer` rodando em duas abas fazem uma segunda requisição legítima apresentar o cookie que acabou de ser rotacionado. Por isso há uma **janela de tolerância de 30 s** (`moneylog.auth.refresh.reuse-grace`, padrão `PT30S`):
  - **Dentro da janela** (reapresentado em até 30 s depois da rotação): **não é reuso**. Gera um novo par **da mesma família**, o sucessor emitido antes continua válido até expirar ou ser rotacionado, e nada é revogado.
  - **Fora da janela** (mais de 30 s), ou se o token já tinha sido **revogado por logout ou por reuso**: vale a regra de reuso (`401 REFRESH_INVALID` e a família inteira é revogada). A tolerância **não** vale para tokens revogados.
  - Duas requisições de refresh em paralelo com o mesmo cookie recebem `200` as duas e a família continua válida (a rotação é serializada por linha no banco).
- Single-flight entre abas no front (Web Locks API / `BroadcastChannel`) é opcional e fica no T33.

### 6. CSRF: verificação de `Origin` em `refresh` e `logout` (S-86)

Como o refresh viaja em cookie, **`/v1/auth/refresh` e `/v1/auth/logout`** conferem o header `Origin` contra `MONEYLOG_ALLOWED_ORIGINS` (lista separada por vírgula); fora da lista: `403 ORIGIN_NOT_ALLOWED` e **nada** é revogado nem rotacionado. O restante da API é stateless com `Bearer` e **não** usa cookie, então o CSRF fica desabilitado nele. **Sem CORS** (mesmo domínio em produção, proxy em dev).

### 7. Rate limit do login e resolução do IP (S-65, S-86)

- **5 falhas de login por IP em 15 minutos** → `429 TOO_MANY_ATTEMPTS` com `Retry-After` (a 6ª tentativa recebe `429` mesmo com a senha certa). Contador **em memória**: correto para uma instância. **Se houver mais de uma instância, o contador passa para um armazenamento compartilhado** (Redis, DynamoDB ou o próprio Postgres) antes do segundo nó; isso fica registrado como pendência do deploy.
- **O IP do cliente só vem de `X-Forwarded-For` quando a conexão chega de um proxy confiável**: `server.forward-headers-strategy=NATIVE` mais `moneylog.security.trusted-proxies` (lista de CIDRs do CloudFront/ALB). Com a lista **vazia**, usa o IP remoto e **ignora o header**. Sem isso, atrás do CloudFront todos os clientes teriam o mesmo IP (um erro de qualquer pessoa bloquearia o dono) ou o limite seria contornável forjando o header.
- **Tempo constante:** login com e-mail que não confere compara a senha com um **hash BCrypt fictício**, para que e-mail errado e senha errada tenham o mesmo custo e a mesma resposta (`401 INVALID_CREDENTIALS`, corpo idêntico).

### 8. HTTPS em dev e o cookie `Secure` (S-85)

Chromium e Firefox tratam `http://localhost` como contexto seguro e aceitam o cookie `Secure`; **Safari/WebKit o descarta**, e um iPhone na LAN (`http://192.168...`) nunca é contexto seguro.

- **Caminho principal:** HTTPS local com **`mkcert`** (CA local instalada no Mac e, por perfil, no iPhone): `ng serve --ssl` com o certificado, host `moneylog.localhost` e o IP da LAN no certificado, proxy `/v1` igual. O cookie é **sempre `Secure`**, sem toggle. T30 documenta no `frontend/README.md` (FE 06: "login que só funciona num host de dev, sem documentação" é antipadrão).
- **Plano B** (só se o caminho principal não servir): `moneylog.auth.cookie.secure`, padrão `true`, aceito como `false` **somente com o perfil `dev` ativo e todas as `MONEYLOG_ALLOWED_ORIGINS` em `localhost`/`127.0.0.1`**. Em qualquer outro caso o **app não sobe** e o log diz por quê. Um IT garante `Secure` no perfil padrão. Isso impede que um `secure=false` chegue à produção.

### 9. Reavaliação antes do deploy

**TOTP (segundo fator) e bloqueio progressivo por conta** ficam **fora da Etapa 2**, mas esta ADR registra que serão reavaliados **antes do deploy** (ADR-005), porque o app financeiro fica exposto na internet. Recomendação (a validar com o usuário, S-65): se a API for pública na internet, TOTP entra antes do primeiro dado real.

## Consequências

- Sem dependência de IdP, com poucas peças novas: Spring Security Resource Server, um `JwtDecoder` HS256, um rate limiter em memória e uma tabela (`refresh_tokens`, migração `V2.01`).
- O front mantém o access token em memória: um F5 perde o token e o `provideAppInitializer` faz um **refresh silencioso** no boot. Erro de rede (`status 0`) nesse refresh **não** limpa a sessão (PWA aberto offline), e só `401 REFRESH_INVALID` leva ao `/login` (S-93, T33).
- O interceptor do front **não** dispara refresh para `401` vindo de `/v1/auth/login`, `refresh` ou `logout` (T33).
- O cookie sempre `Secure` exige HTTPS em dev (mkcert) e tem documentação própria; o plano B existe mas é restrito.
- Trocar a senha ou o e-mail do dono é mudança de ambiente + reinício; os dados continuam visíveis (mesmo `id`). Trocar a senha **não** invalida os refresh existentes por si só; para derrubar todas as sessões, trocar o `JWT_SECRET` (invalida os access tokens) e limpar `refresh_tokens`.
- O rate limit em memória zera ao reiniciar e não serve a duas instâncias (item 7).
- `JWT_SECRET`, o hash e `DB_PASSWORD` só por variável de ambiente (SSM Parameter Store em produção, D2 §6), com `gitleaks` na pipeline.
- **Não contradiz o plano:** §4.2 e S-65 foram conferidos; esta ADR só detalha o comportamento (a tolerância de S-83, o `Origin` também no `logout` de S-86 e as propriedades de configuração). O D2 §3.5 dizia "5 tentativas/min por IP" como exemplo; vale o do plano e desta ADR (**5 falhas em 15 min por IP**), e o D2 foi ajustado.

## Alternativas consideradas

| Alternativa                                       | Por que não                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| OIDC + PKCE com Keycloak/Cognito/Auth0 (FE 06)    | infraestrutura, custo e dependência externa desproporcionais para um usuário; reavaliar se surgirem múltiplos usuários              |
| Access token em `localStorage`/`sessionStorage`   | qualquer XSS lê o token; em memória + refresh em cookie `HttpOnly` reduz a superfície                                               |
| Sessão de servidor com cookie de sessão para tudo | exige CSRF em toda a API e estado no servidor; o `Bearer` stateless é mais simples de escalar e de testar                           |
| Refresh token também em memória (sem cookie)      | o usuário teria de fazer login a cada F5/abertura do PWA                                                                            |
| Refresh não rotativo                              | um refresh roubado valeria 30 dias sem ser notado; a rotação com detecção de reuso o denuncia                                       |
| Detecção de reuso sem tolerância                  | derruba a sessão em corridas legítimas (duas abas, F5 durante o refresh), comum em PWA                                              |
| Prefixo `__Host-` no cookie                       | exige `Path=/`, conflita com `Path=/v1/auth` e expõe o cookie às demais rotas                                                       |
| Toggle `secure=false` livre em dev                | pode vazar para produção; fica só como plano B restrito (perfil `dev` + origens `localhost`)                                        |
| Rate limit por e-mail em vez de IP                | permitiria a um atacante bloquear o dono errando o e-mail dele de propósito                                                         |
| Hash da senha no banco                            | o dono é único e a troca de senha é um ato de operação; manter no ambiente evita uma rota de troca de senha e uma superfície a mais |
| `jjwt` ou outra lib JWT                           | o Resource Server do Spring já traz o Nimbus; uma dependência a menos                                                               |
