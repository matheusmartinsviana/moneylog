#!/usr/bin/env node
/**
 * A marca vive em um lugar só (T192, ADR-011): `BRAND_NAME` em src/app/config/brand.ts.
 * - `index.html` (`<title>`, `application-name`, `apple-mobile-web-app-title`) e o manifest são arquivos
 *   estáticos que não leem TypeScript: precisam repetir a constante (este script falha se divergirem);
 * - nenhuma string de marca escrita à mão em ts/html da interface, fora da constante e dos specs: nem
 *   sozinha ("moneylog" entre aspas ou entre tags) nem **no meio de uma frase** (`\bmoneylog\b` dentro de uma
 *   string ou de uma linha de tradução). As traduções interpolam `BRAND_NAME`. Exceção documentada: a **chave
 *   reservada do frontmatter** das notas, que se chama "moneylog" e não é a marca (ver `RESERVED_KEY`);
 * - os espaços reservados do logo (`.sidebar__logo-slot`, `.login__logo-slot`) continuam vazios: sem
 *   decisão do dono, nenhuma marca entra neles, nem como filho, nem por `background-image`, `content:` ou
 *   `url(...)` no CSS do componente.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src');
const brand = /BRAND_NAME\s*=\s*'([^']+)'/.exec(
  readFileSync(join(src, 'app/config/brand.ts'), 'utf8'),
)?.[1];
const problems = [];
if (!brand) {
  console.error('check-brand: BRAND_NAME não encontrado em src/app/config/brand.ts');
  process.exit(1);
}

const html = readFileSync(join(src, 'index.html'), 'utf8');
for (const needle of [
  `<title>${brand}</title>`,
  `<meta name="application-name" content="${brand}" />`,
  `<meta name="apple-mobile-web-app-title" content="${brand}" />`,
]) {
  if (!html.includes(needle)) problems.push(`src/index.html não contém ${needle}`);
}
const manifest = JSON.parse(readFileSync(join(src, 'manifest.webmanifest'), 'utf8'));
for (const field of ['name', 'short_name']) {
  if (manifest[field] !== brand)
    problems.push(`src/manifest.webmanifest ${field} (${manifest[field]}) difere de BRAND_NAME`);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const literal = new RegExp(`(['"\`])${brand}\\1|>\\s*${brand}\\s*<`, 'i');
/** `moneylog.language`, `moneylog:note-draft`, `moneylog-vault.zip`: identificadores técnicos, não a marca em texto. */
const ident = '(?![.:_-]\\w)';
const word = new RegExp(`\\b${brand}\\b${ident}`, 'i');
/** A chave reservada do frontmatter das notas (`moneylog:`) é um nome técnico, não a marca. */
const RESERVED_KEY = new RegExp(
  `(chave|key|clave)\\s+${brand}\\b|\\b${brand}\\s+key\\b|${brand}\\s+das propriedades|${brand}\\s+in the properties`,
  'i',
);
const quoted = new RegExp(`(['"\`])(?:(?!\\1).)*\\b${brand}\\b${ident}(?:(?!\\1).)*\\1`, 'i');
const comment = /^\s*(\/\/|\*|\/\*|<!--)/;
for (const file of walk(join(src, 'app'))) {
  const rel = relative(root, file).split(sep).join('/');
  if (!/\.(ts|html)$/.test(file) || file.endsWith('.spec.ts') || rel.endsWith('config/brand.ts'))
    continue;
  const translation = /\/i18n\/translations\/[^/]+\.ts$/.test(rel);
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (comment.test(line)) return;
      const bare = literal.test(line);
      // Traduções: qualquer menção à marca fora de `BRAND_NAME` (frase inteira, inclusive linha quebrada).
      const inSentence = translation ? word.test(line) : quoted.test(line);
      if ((bare || inSentence) && !RESERVED_KEY.test(line))
        problems.push(`${rel}:${index + 1} marca escrita à mão: ${line.trim()}`);
    });
}

for (const [file, cls] of [
  ['src/app/common/components/app-shell/sidebar/sidebar.component.html', 'sidebar__logo-slot'],
  ['src/app/features/login/pages/login.page.html', 'login__logo-slot'],
]) {
  const text = readFileSync(join(root, file), 'utf8');
  if (!new RegExp(`<span class="${cls}" aria-hidden="true"></span>`).test(text))
    problems.push(`${file}: o espaço do logo (.${cls}) precisa continuar vazio (sem marca)`);
  // O logo também não pode entrar pelo CSS: imagem de fundo, `content:` ou `url(...)` no slot.
  const css = readFileSync(join(root, file.replace(/\.html$/, '.css')), 'utf8');
  for (const [, body] of css.matchAll(new RegExp(`\\.${cls}[^{]*\\{([^}]*)\\}`, 'g'))) {
    if (
      /background(-image)?\s*:[^;]*(url\(|image-set|gradient)|content\s*:|url\(|mask(-image)?\s*:/i.test(
        body,
      )
    )
      problems.push(
        `${file.replace(/\.html$/, '.css')}: .${cls} não pode ter imagem de fundo, content ou url() (logo sem decisão do dono)`,
      );
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problema(s) de marca.`);
  process.exit(1);
}
console.log(`check-brand: marca "${brand}" em um só lugar; espaços de logo vazios.`);
