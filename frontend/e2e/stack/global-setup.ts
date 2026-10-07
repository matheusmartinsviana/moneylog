import { ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Stack do projeto `integration` (T44): um `postgres:17` descartável (docker compose, projeto
 * `moneylog-e2e-run`, volume apagado no fim), o backend real com o perfil `dev` e variáveis de teste.
 * O `ng serve --configuration local` sobe pelo `webServer` do `playwright.config.ts`.
 *
 * Segredos (JWT, senha do banco, senha e hash do dono) são gerados a cada execução e vivem só nas
 * variáveis de ambiente dos processos (o hash vai para um arquivo temporário fora do repositório).
 * Nada disso é versionado. `E2E_STACK=external` pula tudo: o ambiente (Postgres, backend e as variáveis
 * `E2E_OWNER_*`, `DB_*`, `E2E_PG_CONTAINER`, `JWT_SECRET`) já foi preparado à mão.
 */
const ROOT = resolve(__dirname, '..', '..', '..');
const PROJECT = 'moneylog-e2e-run';
const PG_PORT = '55433';
const ORIGIN = 'http://localhost:4400';

function bcrypt(password: string): string {
  const attempts: [string, string[]][] = [
    ['htpasswd', ['-bnBC', '10', '', password]],
    [
      'python3',
      [
        '-c',
        `import bcrypt,sys;print(':'+bcrypt.hashpw(sys.argv[1].encode(),bcrypt.gensalt(10)).decode())`,
        password,
      ],
    ],
  ];
  for (const [cmd, args] of attempts) {
    try {
      const out = execFileSync(cmd, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      // htpasswd gera `$2y$`; o Spring aceita `$2a$` e `$2y$`. Sai ":$2y$..." (usuário vazio).
      return out
        .trim()
        .replace(/^:/, '')
        .replace(/^\$2y\$/, '$2a$');
    } catch {
      // tenta o próximo
    }
  }
  throw new Error(
    'E2E stack: precisa de `htpasswd` (apache2-utils) ou `python3` com o pacote bcrypt para gerar o hash do dono.',
  );
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `E2E stack: ${url} não respondeu em ${timeoutMs / 1000}s (veja e2e/.results/backend.log)`,
  );
}

export default async function globalSetup(): Promise<(() => Promise<void>) | void> {
  if (process.env['E2E_STACK'] === 'external') {
    for (const v of ['E2E_OWNER_EMAIL', 'E2E_OWNER_PASSWORD']) {
      if (!process.env[v]) throw new Error(`E2E_STACK=external exige ${v}`);
    }
    return;
  }

  const javaHome =
    process.env['JAVA_HOME'] ?? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
  const password = `E2e-${randomBytes(9).toString('base64url')}!`;
  const secrets = {
    DB_NAME: 'moneylog_e2e',
    DB_PORT: PG_PORT,
    DB_USER: 'moneylog',
    DB_PASSWORD: randomBytes(12).toString('hex'),
    JWT_SECRET: randomBytes(48).toString('base64'),
    MONEYLOG_OWNER_EMAIL: 'dono-e2e@moneylog.test',
  };
  const workDir = mkdtempSync(join(tmpdir(), 'moneylog-e2e-'));
  const hashFile = join(workDir, 'owner.hash');
  writeFileSync(hashFile, bcrypt(password), { mode: 0o600 });

  const env = {
    ...process.env,
    ...secrets,
    JAVA_HOME: javaHome,
    DB_URL: `jdbc:postgresql://localhost:${PG_PORT}/${secrets.DB_NAME}`,
    MONEYLOG_OWNER_PASSWORD_HASH_FILE: hashFile,
    MONEYLOG_ALLOWED_ORIGINS: `${ORIGIN},https://localhost:4200`,
    MONEYLOG_TRUSTED_PROXIES: '',
  };
  Object.assign(process.env, {
    ...secrets,
    DB_URL: env.DB_URL,
    JWT_SECRET: secrets.JWT_SECRET,
    E2E_OWNER_EMAIL: secrets.MONEYLOG_OWNER_EMAIL,
    E2E_OWNER_PASSWORD: password,
    E2E_PG_CONTAINER: `${PROJECT}-postgres-1`,
  });

  execFileSync(
    'docker',
    ['compose', '-p', PROJECT, '-f', join(ROOT, 'docker-compose.yml'), 'up', '-d', '--wait'],
    {
      env,
      stdio: 'inherit',
    },
  );

  mkdirSync(resolve(__dirname, '..', '.results'), { recursive: true });
  const logPath = resolve(__dirname, '..', '.results', 'backend.log');
  const log = openSync(logPath, 'w');
  const backend: ChildProcess = spawn(
    './mvnw',
    ['-q', 'spring-boot:run', '-Dspring-boot.run.profiles=dev'],
    {
      cwd: join(ROOT, 'backend'),
      env,
      detached: true,
      stdio: ['ignore', log, log],
    },
  );
  closeSync(log);

  try {
    await waitFor('http://localhost:8080/actuator/health', 180_000);
  } catch (error) {
    await teardown();
    throw error;
  }

  async function teardown(): Promise<void> {
    if (backend.pid) {
      try {
        process.kill(-backend.pid, 'SIGTERM');
      } catch {
        // já encerrado
      }
    }
    try {
      execFileSync(
        'docker',
        ['compose', '-p', PROJECT, '-f', join(ROOT, 'docker-compose.yml'), 'down', '-v'],
        {
          env,
          stdio: 'ignore',
        },
      );
    } catch {
      // melhor esforço
    }
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
  }

  return teardown;
}
