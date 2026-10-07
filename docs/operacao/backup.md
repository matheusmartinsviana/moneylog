# Backup e restauração do banco

Implementação: T176. Código em `backend/src/main/java/com/moneylog/core/backup` (regras, porta `BackupStorage`, cifra, retenção) e `infra/backup` (diretório local, S3, `pg_dump`).

## Como funciona

- **Automático (recomendado)**: o job do backend roda `pg_dump --format=custom`, cifra (opcional), grava no `BackupStorage` sob `PREFIXO/AAAA/MM/DD/moneylog-AAAAMMDDTHHMMSSZ.dump[.enc]` e aplica a retenção (**7 dias com backup**; só apaga dentro do prefixo do app). Desligado por padrão.
- **Manual/emergência**: `scripts/backup.sh` e `scripts/restore.sh` (sem cifra, sem S3).

| Variável | Padrão | Observação |
|---|---|---|
| `MONEYLOG_BACKUP_ENABLED` | `false` | liga o job |
| `BACKUP_STORAGE` | `local` | `local` ou `s3` |
| `BACKUP_DIR` | `/var/backups/moneylog` | só no modo local |
| `BACKUP_PREFIX` | `moneylog/` | a retenção só enxerga este prefixo |
| `BACKUP_RETENTION_DAYS` | `7` | dias com backup mantidos |
| `BACKUP_CRON` | `0 0 3 * * *` | UTC |
| `BACKUP_ENCRYPTION_KEY` | vazio | >= 16 caracteres; AES-256-GCM |
| `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET` | vazios | obrigatórios com `s3` |
| `BACKUP_S3_ENDPOINT` | vazio | vazio = endpoint oficial da AWS |
| `BACKUP_S3_ACCESS_KEY/SECRET_KEY/SESSION_TOKEN` | vazios | vazios na AWS: a role da EC2 fornece as credenciais |

A imagem Docker já traz `pg_dump`/`pg_restore` 17.

## RPO e RTO esperados (a confirmar com o dono)

- **RPO**: até 24 h com o job diário (perde-se o que foi lançado desde as 03:00 UTC). No RDS, o PITR automático reduz para minutos; o dump diário continua sendo a cópia fora do RDS.
- **RTO**: 30 a 60 min para criar uma base vazia, baixar, restaurar e apontar o app (dump pequeno: o restore leva segundos; o resto é o procedimento).

## Restaurar, passo a passo

1. Crie uma base **vazia** (o restore recusa base com tabelas). No RDS: `CREATE DATABASE moneylog_restore OWNER moneylog;`.
2. Escolha o backup: liste o prefixo (`aws s3 ls s3://BUCKET/moneylog/ --recursive` ou `ls` no `BACKUP_DIR`).
3. Baixe o arquivo. Se terminar em `.dump.enc`, ele é cifrado: o restaurador do backend (`BackupService.restore`) descriptografa com a mesma `BACKUP_ENCRYPTION_KEY` e só então chama o `pg_restore`; **chave errada falha sem tocar na base**. Para restaurar à mão, descriptografe primeiro com a mesma classe (`BackupCrypto`) ou restaure um backup não cifrado.
4. Rode `scripts/restore.sh arquivo.dump` com `DB_*` apontando para a base vazia.
5. Suba o app contra a base restaurada e confira: saldos das contas, razão (soma zero), faturas, dívidas, metas e notas.
6. Só então troque o `DB_URL` de produção (ou renomeie as bases).

## Prova automatizada

`BackupRestoreIT` (Testcontainers): migra uma base, grava dados (conta com saldo, razão, meta, nota), faz backup cifrado, restaura numa base vazia e compara por consultas os saldos, a soma do razão e um hash de **todas as linhas de todas as tabelas**; verifica ainda que a chave errada falha e deixa a base vazia intacta.

## Teste de restauração periódico

Faça uma restauração de teste a cada trimestre e antes do go-live (item do checklist de `deploy-aws.md`).
