/**
 * `npm run start:local` (S-85): `ng serve` em HTTPS com o certificado do `mkcert`, para o cookie de
 * refresh (sempre `Secure`) funcionar também no Safari/iPhone. Os certificados ficam FORA do
 * repositório, em `~/.moneylog/certs` (ou na pasta de `MONEYLOG_CERT_DIR`):
 *   moneylog.localhost.pem  e  moneylog.localhost-key.pem
 * O proxy de `/v1` para `http://localhost:8080` vem de `proxy.conf.json`. Passos de instalação no README.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = process.env.MONEYLOG_CERT_DIR ?? join(homedir(), '.moneylog', 'certs');
const cert = join(dir, 'moneylog.localhost.pem');
const key = join(dir, 'moneylog.localhost-key.pem');

if (!existsSync(cert) || !existsSync(key)) {
  console.error(
    [
      `start:local: certificados do mkcert não encontrados em ${dir}.`,
      '',
      'Gere-os uma vez (veja "HTTPS local com mkcert" no frontend/README.md):',
      `  mkdir -p "${dir}" && cd "${dir}"`,
      '  mkcert -install',
      '  mkcert -cert-file moneylog.localhost.pem -key-file moneylog.localhost-key.pem \\',
      '    moneylog.localhost localhost 127.0.0.1 <IP-da-sua-LAN>',
      '',
      'Depois rode "npm run start:local" de novo e abra https://moneylog.localhost:4200.',
    ].join('\n'),
  );
  process.exit(1);
}

const result = spawnSync(
  'npx',
  [
    'ng',
    'serve',
    '--configuration',
    'local',
    '--ssl',
    '--ssl-cert',
    cert,
    '--ssl-key',
    key,
    '--host',
    '0.0.0.0',
  ],
  { cwd: root, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
