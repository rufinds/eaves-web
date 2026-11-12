// Inserts or updates the analytics snippet before </head> in the static pages and
// in the two page generators. Safe to run again: an existing block between the
// markers is replaced, so a changed snippet (for example a new tool) is picked up.
// The snippet is read from scripts/analytics-snippet.html.
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
const START = '<!-- analytics -->';
const END = '<!-- /analytics -->';

const snippet = (await readFile('scripts/analytics-snippet.html', 'utf8')).trim();
if (/`|\$\{/.test(snippet)) {
  console.error('The snippet must not contain backticks or ${ }, because it is inserted into template strings.');
  process.exit(1);
}
const block = `${START}\n${snippet}\n<script defer src="/assets/analytics.js?v=1"></script>\n${END}\n`;

for (const file of FILES) {
  const src = await readFile(file, 'utf8');
  const start = src.indexOf(START);
  const end = src.indexOf(END);

  let out;
  if (start !== -1 && end > start) {
    // Replace the existing block (including the newline after the end marker).
    const after = src[end + END.length] === '\n' ? end + END.length + 1 : end + END.length;
    out = src.slice(0, start) + block + src.slice(after);
  } else {
    const i = src.indexOf('</head>');
    if (i === -1) {
      console.warn(`no </head> found: ${file}`);
      continue;
    }
    out = src.slice(0, i) + block + src.slice(i);
  }

  if (out === src) {
    console.log(`unchanged: ${file}`);
    continue;
  }
  await writeFile(file, out, 'utf8');
  console.log(`${start !== -1 ? 'updated' : 'added'}: ${file}`);
}