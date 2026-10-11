# Deploy por GitHub Actions com OIDC (sem chave de longa duração)

Os valores reais (conta, instância, bucket, domínio) não ficam no repositório: use os placeholders `<...>` abaixo e
preencha no console e nas variáveis do Environment.

Objetivo: publicar front e backend sem nenhuma chave da AWS guardada em disco ou no GitHub. O GitHub Actions troca um
token de curta duração (OIDC) por credenciais temporárias de uma role que só ele pode assumir, e só depois que você
aprova o Environment `production`. Os três repositórios continuam **privados**.

Situação de partida: o deploy é manual, do Mac, com a chave do usuário `matheus-admin` (AdministratorAccess). Ao fim
deste plano essa chave é desativada e depois apagada.

## 0. Pré-requisitos (nesta ordem)

1. **GitHub Actions funcionando.** Hoje todos os runs terminam em `startup_failure` (provável bloqueio de cobrança do
   Actions em repositório privado). Ver github.com/settings/billing. Sem isso nada abaixo roda.
2. **Segredo `SUBMODULES_TOKEN`.** `backend/` e `frontend/` são submódulos privados e o `GITHUB_TOKEN` do workflow não os
   lê. Crie um PAT *fine-grained* (github.com/settings/personal-access-tokens): repositórios `moneylog-backend` e
   `moneylog-frontend`, permissão **Contents: Read-only**, validade de 90 dias. Anote a data para renovar.
3. **Environment `production`** no repositório `moneylog` (Settings > Environments):
   - Required reviewers: você.
   - Deployment branches and tags: apenas `main`.
   - Variables: `AWS_REGION=us-east-1`, `AWS_DEPLOY_ROLE_ARN` (preencher no passo 2), `ARTIFACTS_BUCKET=<BUCKET-DE-ARTEFATOS>`,
     `INSTANCE_ID=<ID-DA-INSTANCIA>`, `DOMAIN=<seu-dominio>`.
   - Secrets: `SUBMODULES_TOKEN`.

## 1. Provedor OIDC na AWS (uma vez)

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
artefatos, backend por `instance-setup.sh`). Dispara só por `workflow_dispatch`, pede aprovação do Environment e escolhe
o alvo (`front`, `back` ou `ambos`).

Particularidades do seu ambiente que o workflow respeita:

- A instância não tem `/opt/moneylog/deploy.sh` (isso existe só no desenho com Terraform). O backend é atualizado por
  `bash /root/instance-setup.sh app <TAG>`, mandado por SSM. A tag é o SHA curto do commit do backend.
- O front usa `scripts/deploy-frontend.sh` com `EDGE_MODE=cloudflare`, o mesmo que você roda hoje.
- Tags do ECR são imutáveis: o build do backend só reenvia a imagem se a tag ainda não existe.

Não foi possível testar o workflow antes de o Actions voltar a rodar: o primeiro uso é o teste.

## 4. Ordem de execução

1. Resolver o Actions (item 0.1) e confirmar que um run qualquer (o CI) inicia.
2. Criar o PAT e o Environment (item 0.2 e 0.3), sem a variável da role.
3. Provedor OIDC e role (itens 1 e 2); preencher `AWS_DEPLOY_ROLE_ARN`.
4. Merge do PR com o workflow novo.
5. **Primeiro teste só do front:** Actions > deploy > Run workflow > alvo `front`, aprovar. Conferir `https://moneylog.mviana.tech`.
6. Teste do backend (alvo `back`): a instância faz o health check; se falhar, `scripts/deploy-backend.sh --rollback`
   não serve aqui (depende do `deploy.sh`), então o retorno é rodar `instance-setup.sh app <TAG-ANTERIOR>` na instância.
7. Com os dois funcionando: **desativar** a chave de `matheus-admin` (IAM > Credenciais de segurança > Desativar). Uma semana
   depois, sem ninguém sentir falta, **apagar**, e remover `~/.aws/credentials` do Mac.
8. Reduzir o usuário `matheus-admin` a acesso ao console com MFA (sem chave). Para o terminal, usar IAM Identity Center
   (SSO) quando precisar, com credenciais de poucas horas.

## 5. O que este plano não resolve

- O console: quem entra como `matheus-admin` ou como root ainda faz tudo. Mantenha o MFA e a senha só no gerenciador.
- O PAT `SUBMODULES_TOKEN` é uma credencial de longa duração, mas só de leitura nos dois repositórios privados.
- Se o repositório principal virar público no futuro, a condição `sub` com `environment:production` continua valendo:
  PRs de terceiros não conseguem aprovar o Environment. Mesmo assim, revise o histórico antes (`gitleaks`).
