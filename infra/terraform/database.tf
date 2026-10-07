# Recomendação da ADR-005: RDS PostgreSQL gerenciado (backup automático, patches, sem administrar o Postgres na EC2).
# O usuário mestre é o dono do banco: necessário para o Flyway executar `CREATE EXTENSION unaccent` (V6.01).
resource "aws_db_subnet_group" "main" {
  name       = "moneylog-${var.environment}"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_db_instance" "main" {
  identifier        = "moneylog-${var.environment}"
  engine            = "postgres"
  engine_version    = "17"
  instance_class    = var.db_instance_class
  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = var.db_name
  username = var.db_username
  # A senha é gerada e guardada pelo próprio RDS no Secrets Manager: não passa pelo Terraform nem pelo estado.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false
  multi_az               = false
  storage_encrypted      = true

  backup_retention_period    = 7
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "moneylog-${var.environment}-final"
  auto_minor_version_upgrade = true
}
