# Deploy por GitHub Actions com OIDC (sem chave de longa duração)

Os valores reais (conta, instância, bucket, domínio) não ficam no repositório: use os placeholders `<...>` abaixo e
preencha no console e nas variáveis do Environment.

Objetivo: publicar front e backend sem nenhuma chave da AWS guardada em disco ou no GitHub. O GitHub Actions troca um
token de curta duração (OIDC) por credenciais temporárias de uma role que só ele pode assumir, a partir do Environment
`production`. Os três repositórios são **públicos** desde 2026-10-17; a condição `sub` da role garante que só a `main`
do repositório principal consegue assumi-la.

Situação de partida: o deploy é manual, do Mac, com a chave do usuário `matheus-admin` (AdministratorAccess). Ao fim
deste plano essa chave é desativada e depois apagada.

## 0. Pré-requisitos (nesta ordem)

1. **GitHub Actions funcionando.** Em 2026-10-17 os jobs morriam com "account is locked due to a billing issue": é a conta
   do GitHub, não o repositório. Ver github.com/settings/billing. Sem isso nada abaixo roda.
2. **Segredo `SUBMODULES_TOKEN`** só se `backend/` e `frontend/` voltarem a ser privados: PAT *fine-grained*
   (github.com/settings/personal-access-tokens) com **Contents: Read-only** nos dois repositórios, validade de 90 dias.
   Com os repositórios públicos o `GITHUB_TOKEN` do workflow basta.
3. **Environment `production`** no repositório `moneylog`: `scripts/setup-github-environment.sh` cria tudo pelo `gh`
   (idempotente). O que ele configura (Settings > Environments, se preferir à mão):
   - Deployment branches and tags: apenas `main`.
   - Required reviewers: nenhum por padrão (push na `main` publica sozinho). Rode com `EXIGIR_APROVACAO=1` para cada
     deploy esperar o seu ok na aba Actions.
   - Variables: `AWS_REGION=us-east-1`, `AWS_DEPLOY_ROLE_ARN` (saída do item 2), `ARTIFACTS_BUCKET=<BUCKET-DE-ARTEFATOS>`,
     `INSTANCE_ID=<ID-DA-INSTANCIA>`, `DOMAIN=<seu-dominio>`.
   - Secrets (do repositório): `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` (aviso de deploy no Telegram; os mesmos valores
     ficam no SSM como `MONEYLOG_TELEGRAM_*` para os scripts locais) e, se voltar a precisar, `SUBMODULES_TOKEN`.

## 1. Provedor OIDC na AWS (uma vez)

`INSTANCE_ID=<ID-DA-INSTANCIA> ARTIFACTS_BUCKET=<BUCKET-DE-ARTEFATOS> scripts/setup-github-oidc.sh` faz os itens 1 e 2
de uma vez (idempotente) e imprime o ARN da role. À mão, pelo console:

Console > IAM > Provedores de identidade > Adicionar provedor:

- Tipo: OpenID Connect
- URL do provedor: `https://token.actions.githubusercontent.com`
- Público: `sts.amazonaws.com`

## 2. Role de deploy

Console > IAM > Funções > Criar função > Identidade da web > provedor acima, público `sts.amazonaws.com`. Nome:
`moneylog-github-deploy`. Duração máxima da sessão: 1 hora.

**Política de confiança** (edite depois de criada; só o Environment `production` do repositório principal assume):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ID-DA-CONTA>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:matheusmartinsviana/moneylog:environment:production"
        }
      }
    }
  ]
}
```

**Política de permissões** (em linha, nome `deploy`; só o necessário para publicar):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:DescribeImages"
      ],
      "Resource": "arn:aws:ecr:us-east-1:<ID-DA-CONTA>:repository/moneylog-backend"
    },
    {
      "Sid": "FrontendArtifacts",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::<BUCKET-DE-ARTEFATOS>/frontend/*"
    },
    {
      "Sid": "RunOnInstance",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:us-east-1::document/AWS-RunShellScript",
        "arn:aws:ec2:us-east-1:<ID-DA-CONTA>:instance/<ID-DA-INSTANCIA>"
      ]
    },
    {
      "Sid": "ReadCommandResult",
      "Effect": "Allow",
      "Action": [
        "ssm:GetCommandInvocation",
        "ssm:ListCommandInvocations",
        "ssm:ListCommands"
      ],
      "Resource": "*"
    }
  ]
}
```

Copie o ARN da role para a variável `AWS_DEPLOY_ROLE_ARN` do Environment.

O que a role **não** pode: ler ou gravar parâmetros do SSM (segredos), criar ou apagar recursos, mexer em IAM, no Budget
ou no banco. Quem rouba um token OIDC só consegue repetir um deploy, e só durante a sessão de 1 hora.

## 3. Workflow

`.github/workflows/deploy.yml` (já adaptado ao seu desenho manual: Cloudflare + EC2, front por zip no bucket de
artefatos, backend por `instance-setup.sh`). Dispara de dois jeitos:

- **Automático:** push na `main` do repositório principal que mexa nos ponteiros `backend`/`frontend`, em
  `scripts/deploy-frontend.sh`, `infra/caddy/**` ou no próprio workflow. Publica os dois (`ambos`). É o fluxo normal:
  merge no backend ou no frontend, depois PR no principal avançando o ponteiro (`git add backend frontend`); o merge
  desse PR publica.
- **Manual:** Actions > deploy > Run workflow, escolhendo o alvo (`front`, `back` ou `ambos`) e a ref.

Um deploy por vez (`concurrency: deploy-production`). Ao final, sucesso ou falha, `scripts/notify-deploy.sh` avisa no
Telegram com a versão e o link do run.

Particularidades do seu ambiente que o workflow respeita:

- A instância não tem `/opt/moneylog/deploy.sh` (isso existe só no desenho com Terraform). O backend é atualizado por
  `bash /root/instance-setup.sh app <TAG>`, mandado por SSM. A tag é o SHA curto do commit do backend.
- O front usa `scripts/deploy-frontend.sh` com `EDGE_MODE=cloudflare`, o mesmo que você roda hoje.
- Tags do ECR são imutáveis: o build do backend só reenvia a imagem se a tag ainda não existe.

Não foi possível testar o workflow antes de o Actions voltar a rodar: o primeiro uso é o teste.

## 4. Ordem de execução

1. Resolver o Actions (item 0.1) e confirmar que um run qualquer (o CI) inicia.
2. `scripts/setup-github-oidc.sh` (provedor e role) e, com o ARN impresso, `scripts/setup-github-environment.sh`.
3. Merge do PR com o workflow novo (esse merge já dispara o primeiro deploy automático, se mexer nos caminhos vigiados).
4. **Primeiro teste só do front:** Actions > deploy > Run workflow > alvo `front`. Conferir `https://moneylog.mviana.tech`.
5. Teste do backend (alvo `back`): a instância faz o health check; se falhar, `scripts/deploy-backend.sh --rollback`
   não serve aqui (depende do `deploy.sh`), então o retorno é rodar `instance-setup.sh app <TAG-ANTERIOR>` na instância.
6. Com os dois funcionando: **desativar** a chave de `matheus-admin` (IAM > Credenciais de segurança > Desativar). Uma semana
   depois, sem ninguém sentir falta, **apagar**, e remover `~/.aws/credentials` do Mac.
7. Reduzir o usuário `matheus-admin` a acesso ao console com MFA (sem chave). Para o terminal, usar IAM Identity Center
   (SSO) quando precisar, com credenciais de poucas horas.

## 5. O que este plano não resolve

- O console: quem entra como `matheus-admin` ou como root ainda faz tudo. Mantenha o MFA e a senha só no gerenciador.
- Repositórios públicos: a condição `sub` com `environment:production` e a política de branch (`main`) impedem que um PR
  de terceiro dispare o deploy; só quem faz merge na `main` publica. Revise o histórico de vez em quando (`gitleaks`).
- Um deploy que atualiza o backend direto na instância (`instance-setup.sh app` pelo Session Manager) não passa pelo
  workflow nem pelos scripts e, por isso, não avisa no Telegram.
