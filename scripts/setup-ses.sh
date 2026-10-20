#!/usr/bin/env bash
# Prepara o Amazon SES para os e-mails de convite pelo AWS CLI, sem Terraform (a produção foi criada à mão).
# Espelha infra/terraform/mail.tf: identidade do domínio com Easy DKIM, MAIL FROM, configuration set,
# tópico SNS de bounce/reclamação e a política mínima de envio no papel da instância.
# Idempotente: pode rodar de novo. Não cria registros DNS: imprime o que criar na Cloudflare.
#
#   ! scripts/setup-ses.sh
#
# Variáveis opcionais: MAIL_DOMAIN, MAIL_FROM_ADDRESS, ALERT_EMAIL, ENV_NAME, ROLE_NAME, REGION.
set -euo pipefail

MAIL_DOMAIN="${MAIL_DOMAIN:-moneylog.mviana.tech}"
MAIL_FROM_ADDRESS="${MAIL_FROM_ADDRESS:-convite@${MAIL_DOMAIN}}"
ALERT_EMAIL="${ALERT_EMAIL:-c@mviana.tech}"
ENV_NAME="${ENV_NAME:-prod}"
ROLE_NAME="${ROLE_NAME:-moneylog-prod-backend}"
REGION="${REGION:-us-east-1}"
MAIL_FROM_DOMAIN="bounce.${MAIL_DOMAIN}"
CONFIG_SET="moneylog-${ENV_NAME}"
TOPIC_NAME="moneylog-${ENV_NAME}-mail-events"

say() { printf '\n== %s\n' "$*"; }
aws_ses() { aws sesv2 --region "$REGION" "$@"; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
IDENTITY_ARN="arn:aws:ses:${REGION}:${ACCOUNT_ID}:identity/${MAIL_DOMAIN}"
CONFIG_SET_ARN="arn:aws:ses:${REGION}:${ACCOUNT_ID}:configuration-set/${CONFIG_SET}"
echo "conta ${ACCOUNT_ID}, região ${REGION}, domínio ${MAIL_DOMAIN}, remetente ${MAIL_FROM_ADDRESS}"

say "1/7 identidade do domínio com Easy DKIM (RSA 2048)"
if aws_ses get-email-identity --email-identity "$MAIL_DOMAIN" >/dev/null 2>&1; then
  echo "já existe"
else
  aws_ses create-email-identity --email-identity "$MAIL_DOMAIN" \
    --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT >/dev/null
  echo "criada"
fi

say "2/7 MAIL FROM ${MAIL_FROM_DOMAIN}"
aws_ses put-email-identity-mail-from-attributes --email-identity "$MAIL_DOMAIN" \
  --mail-from-domain "$MAIL_FROM_DOMAIN" --behavior-on-mx-failure REJECT_MESSAGE

say "3/7 tópico SNS ${TOPIC_NAME}"
TOPIC_ARN="$(aws sns create-topic --region "$REGION" --name "$TOPIC_NAME" --query TopicArn --output text)"
POLICY="$(cat <<EOF
{"Version":"2012-10-17","Statement":[{"Sid":"AllowSesPublish","Effect":"Allow","Principal":{"Service":"ses.amazonaws.com"},"Action":"sns:Publish","Resource":"${TOPIC_ARN}","Condition":{"StringEquals":{"AWS:SourceAccount":"${ACCOUNT_ID}"},"ArnLike":{"AWS:SourceArn":"${CONFIG_SET_ARN}"}}}]}
EOF
)"
aws sns set-topic-attributes --region "$REGION" --topic-arn "$TOPIC_ARN" \
  --attribute-name Policy --attribute-value "$POLICY"
echo "$TOPIC_ARN"

say "4/7 inscrição do alerta por e-mail (${ALERT_EMAIL}): confirme no link que chegar"
aws sns subscribe --region "$REGION" --topic-arn "$TOPIC_ARN" --protocol email \
  --notification-endpoint "$ALERT_EMAIL" --query SubscriptionArn --output text

say "5/7 configuration set ${CONFIG_SET}"
if aws_ses get-configuration-set --configuration-set-name "$CONFIG_SET" >/dev/null 2>&1; then
  echo "já existe"
else
  aws_ses create-configuration-set --configuration-set-name "$CONFIG_SET" \
    --delivery-options TlsPolicy=REQUIRE \
    --reputation-options ReputationMetricsEnabled=true \
    --sending-options SendingEnabled=true \
    --suppression-options SuppressedReasons=BOUNCE,COMPLAINT
  echo "criado"
fi

say "6/7 destino de eventos BOUNCE, COMPLAINT e REJECT"
if aws_ses get-configuration-set-event-destinations --configuration-set-name "$CONFIG_SET" \
  --query "EventDestinations[?Name=='bounces-and-complaints'].Name" --output text | grep -q bounces; then
  echo "já existe"
else
  aws_ses create-configuration-set-event-destination --configuration-set-name "$CONFIG_SET" \
    --event-destination-name bounces-and-complaints \
    --event-destination "Enabled=true,MatchingEventTypes=BOUNCE,COMPLAINT,REJECT,SnsDestination={TopicArn=${TOPIC_ARN}}"
  echo "criado"
fi

say "7/7 política mínima de envio no papel ${ROLE_NAME}"
SEND_POLICY="$(cat <<EOF
{"Version":"2012-10-17","Statement":[{"Sid":"SendInvitationFromConfiguredSenderOnly","Effect":"Allow","Action":"ses:SendEmail","Resource":["${IDENTITY_ARN}","${CONFIG_SET_ARN}"],"Condition":{"StringEquals":{"ses:FromAddress":"${MAIL_FROM_ADDRESS}"}}}]}
EOF
)"
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name moneylog-mail-send --policy-document "$SEND_POLICY"
echo "ok"

say "REGISTROS DNS para criar na Cloudflare (nuvem cinza, sem proxy)"
aws_ses get-email-identity --email-identity "$MAIL_DOMAIN" \
  --query 'DkimAttributes.Tokens' --output text | tr '\t' '\n' | while read -r token; do
  [ -n "$token" ] && printf 'CNAME  %s._domainkey.%s  ->  %s.dkim.amazonses.com\n' "$token" "$MAIL_DOMAIN" "$token"
done
printf 'MX     %s  ->  10 feedback-smtp.%s.amazonses.com\n' "$MAIL_FROM_DOMAIN" "$REGION"
printf 'TXT    %s  ->  "v=spf1 include:amazonses.com ~all"\n' "$MAIL_FROM_DOMAIN"
printf 'TXT    _dmarc.%s  ->  "v=DMARC1; p=none; rua=mailto:%s"\n' "$MAIL_DOMAIN" "$ALERT_EMAIL"

say "Depois de criar os registros, confira (minutos a horas):"
echo "aws sesv2 get-email-identity --region ${REGION} --email-identity ${MAIL_DOMAIN} --query '{verif:VerifiedForSendingStatus,dkim:DkimAttributes.Status,mailfrom:MailFromAttributes.MailFromDomainStatus}'"
