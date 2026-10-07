/**
 * Ambiente mock (S-67): arquivos mínimos e fixos (sem dado nenhum), para a tela de exportação ser testável
 * sem backend. O CSV traz o BOM e o cabeçalho; o backup, o JSON versionado vazio.
 */
export const MOCK_CSV = '﻿data;tipo;descrição;categoria;conta/cartão;método;valor;status\r\n';
export const MOCK_CSV_FILENAME = 'moneylog-transactions.csv';
export const MOCK_BACKUP = JSON.stringify({ schemaVersion: 1, accounts: [], transactions: [] });
export const MOCK_BACKUP_FILENAME = 'moneylog-backup.json';
