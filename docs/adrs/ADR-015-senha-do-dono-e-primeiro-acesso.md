# ADR-015: senha do dono no banco e primeiro acesso por código de uso único

Status: aceita (2026-10-07). Altera o ADR-003 (a senha deixa de viver só no ambiente). Contrato 2.15.0 (só acréscimos).

## Contexto
O ADR-003 guardava o hash BCrypt da senha do dono só no ambiente (`MONEYLOG_OWNER_PASSWORD_HASH`): para trocar a senha era preciso gerar o hash fora do app, editar o `.env` (com o problema do `$`) e reiniciar, e a troca não derrubava as sessões. O dono quer escolher a própria senha no primeiro login, e trocar o e-mail do dono mantendo o `id` e os dados.

## Decisão
1. **Senha no banco.** `users` ganha `password_hash` (BCrypt custo 12), `password_setup_pending`, `setup_code_hash` e `setup_code_expires_at` (migração V8.10, aditiva).
2. **Ordem de verificação do login.** (a) senha do banco, se definida: é a única que vale; (b) redefinição pendente (`password_setup_pending`): ninguém entra, nem pelo hash do ambiente; (c) senão, o hash do ambiente (`MONEYLOG_OWNER_PASSWORD_HASH[_FILE]`), por retrocompatibilidade. O hash do ambiente passou a ser opcional.
3. **Primeiro acesso.** `GET /v1/auth/status` (público) devolve `{passwordSetupRequired}`; é `true` quando não há senha no banco e (há redefinição pendente ou não existe hash no ambiente). `POST /v1/auth/setup-password {email, setupCode, newPassword}` define a senha, devolve a sessão como o login e revoga todos os refresh tokens.
4. **Código de uso único.** Gerado no boot quando o setup é necessário (256 bits aleatórios), gravado só como SHA-256, válido por 24 h (`moneylog.owner.setup-code-ttl`) e apagado ao ser usado (a gravação é um `UPDATE` condicional, então dois pedidos simultâneos não o consomem duas vezes). Comparação em tempo constante (`MessageDigest.isEqual`). O código gerado é impresso **uma vez e só no log do perfil dev**; em outros perfis nada é impresso e o operador informa `MONEYLOG_OWNER_SETUP_CODE` (ou `_FILE`, para secrets), com no mínimo 16 caracteres. Reiniciar com o setup pendente gera outro código (o anterior deixa de valer).
5. **Defesas.** E-mail errado, código errado, expirado, já usado ou setup não necessário respondem igual: `401 INVALID_SETUP_CODE`. Reuso do rate limit do login (5 falhas por IP em 15 min, `429` + `Retry-After`; só falha de código conta). Senha fraca (`422 WEAK_PASSWORD`: menos de 12 caracteres, mais de 72 bytes ou igual ao e-mail) é verificada **depois** do código e não o consome. Corpo e logs nunca ecoam senha nem código.
6. **Troca de e-mail e redefinição.** Subir com outro `MONEYLOG_OWNER_EMAIL` já renomeava o dono; a ADR-032 §3.2 substituiu isso: agora a subida falha com erro claro e a troca de e-mail é manual, e nunca cria segundo usuário. Com `MONEYLOG_OWNER_RESET_PASSWORD=true` o boot também apaga a senha do banco, marca o setup como pendente e revoga todas as sessões. É de **uso único**: idempotente enquanto o setup está pendente, mas deve ser removida do ambiente depois, porque com a senha já escolhida ela redefiniria de novo a cada reinício (o boot avisa no log). Sem a variável, a senha atual é mantida. Dados de negócio não são tocados.

## Modelo de ameaça
- **Tomada de conta antes do dono (janela do primeiro acesso).** Quem alcança a API não escolhe a senha sem o código, que só existe no log local do dev, no secret do operador e como hash no banco. Brute force: 256 bits no código gerado, mais o limite por IP. Exige também o e-mail do dono.
- **Vazamento do banco.** Só hashes: BCrypt da senha e SHA-256 de um código de alta entropia (um hash rápido basta, não é senha escolhida) que expira e é apagado no uso.
- **Vazamento de log.** O código só é impresso no dev; no log estruturado de produção nunca. Mascaramento de e-mail mantido.
- **Sessões antigas.** A definição e a redefinição revogam todos os refresh tokens; o access token (15 min) expira sozinho.
- **Enumeração.** `status` revela só se o setup é necessário (o estado de uma instalação sem senha); as recusas do setup são idênticas, e o login mantém o hash fictício de mesmo custo.
- **Limites aceitos.** O rate limit é em memória por instância (pendência de deploy do ADR-003). Quem tem acesso ao ambiente do operador (variáveis, secrets, log do dev) já é equivalente ao dono. Não há endpoint de "trocar senha" autenticado ainda: trocar é pedir a redefinição pelo operador; um endpoint próprio é trabalho futuro.

## Consequências
Cálculos financeiros intactos. `PasswordVerifier` ganhou `matches`/`encode`/`hasEnvironmentHash`; `UserGateway` ganhou `findAccess`, `resetPassword`, `storeSetupCode`, `completeSetup`; `RefreshTokenGateway.revokeAllByUser`. O front precisa de uma tela de primeiro acesso (decidida por `status`).
