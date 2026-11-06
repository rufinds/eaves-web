// One-off: inserts the analytics snippet before </head> in the static pages and in
// the two page generators. Safe to run twice. The snippet is read from
// scripts/analytics-snippet.html (copy it from your analytics dashboard).
//
// Deliberately NOT added to 404.html (claim and deep links carry a token in the
// URL) and to auth/reset-password (the recovery token is in the URL).
import { readFile, writeFile } from 'node:fs/promises';

const FILES = [
  'index.html',
  'privacy.html',
  'terms.html',
  'delete-account.html',
  'app/index.html',
  'scripts/build-events.mjs',
  'scripts/build-role-pages.mjs',
];
const MARK = '<!-- analytics -->';

const snippet = (await readFile('scripts/analytics-snippet.html', 'utf8')).trim();
if (/`|\$\{/.test(snippet)) {
  console.error('The snippet must not contain backticks or ${ }, because it is inserted into template strings.');
  process.exit(1);
}
const block = `${MARK}\n${snippet}\n<script defer src="/assets/analytics.js?v=1"></script>\n<!-- /analytics -->\n`;

for (const file of FILES) {
  const src = await readFile(file, 'utf8');
  if (src.includes(MARK)) {
    console.log(`skip (already there): ${file}`);
    continue;
  }
  const i = src.indexOf('</head>');
  if (i === -1) {
    console.warn(`no </head> found: ${file}`);
    continue;
  }
  await writeFile(file, src.slice(0, i) + block + src.slice(i), 'utf8');
  console.log(`added: ${file}`);
}