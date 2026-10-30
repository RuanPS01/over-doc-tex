/**
 * Verifica as proibições de docs/00-regras-para-ia.md que podem ser checadas por texto.
 * Uso: npm run check:conventions
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'lib', 'dev-dist', '.git', 'dist-screenshots']);

function walk(dir, extensions) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return IGNORED_DIRS.has(name) ? [] : walk(path, extensions);
    return extensions.some((ext) => name.endsWith(ext)) ? [path] : [];
  });
}

const rel = (path) => relative(ROOT, path).split(sep).join('/');
const failures = [];

const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

function check(files, pattern, message, allow = () => false, { codeOnly = false } = {}) {
  for (const file of files) {
    const path = rel(file);
    if (allow(path)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (codeOnly && isComment(line)) return;
        if (pattern.test(line)) failures.push(`${path}:${index + 1}  ${message}`);
      });
  }
}

const frontend = walk(join(ROOT, 'src'), ['.ts', '.tsx']);
const shared = walk(join(ROOT, 'shared'), ['.ts']);
const functions = walk(join(ROOT, 'functions', 'src'), ['.ts']);
const code = [...frontend, ...shared, ...functions];
const texts = [
  ...walk(join(ROOT, 'docs'), ['.md']),
  join(ROOT, 'README.md'),
  ...code,
  ...walk(join(ROOT, 'src'), ['.css']),
  ...walk(join(ROOT, '.github'), ['.yml']),
];

check(frontend, /#[0-9a-fA-F]{3,8}\b/, 'cor hexadecimal fixa: use tokens semânticos');
check(frontend, /\b(rgba?|hsla?)\(/, 'cor literal: use tokens semânticos');
check(frontend, /\bh-screen\b|100vh/, 'use .h-viewport (100dvh) em vez de h-screen/100vh');
check(
  frontend,
  /dangerouslySetInnerHTML/,
  'HTML bruto só em MarkdownContent',
  (path) => path === 'src/components/common/markdown-content.tsx',
);
check(
  frontend,
  /from ['"]firebase\//,
  'SDK do Firebase só em lib/firebase, features/*/hooks ou *-provider.tsx',
  (path) =>
    path.startsWith('src/lib/firebase/') ||
    /^src\/features\/[^/]+\/hooks\//.test(path) ||
    /^src\/features\/[^/]+\/components\/[^/]+-provider\.tsx$/.test(path),
);
check(
  code,
  /[`'"]projects\//,
  'caminho do Firestore/Storage fora de shared/firestore/paths.ts',
  (path) => path === 'shared/firestore/paths.ts',
  { codeOnly: true },
);
check(code, /^\s*(export\s+)?(const\s+)?enum\s/, 'use uniões de literais em vez de enum');
check(code, /:\s*any\b|\bas any\b|<any>/, 'evite any: use unknown com validação');
check(texts, /[\u2013\u2014]/, 'travessão ou meia-risca no texto');
check(texts, /[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2B00-\u2BFF]/, 'caractere de seta no texto');
check(texts, /\p{Extended_Pictographic}/u, 'emoji no texto');
check(
  texts.filter((file) => file.endsWith('.md')),
  /->/,
  'seta em ASCII no texto da documentação',
);

if (failures.length > 0) {
  console.error(`Convenções violadas (${failures.length}):\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Convenções OK em ${code.length} arquivos de código e ${texts.length} arquivos de texto.`);
