import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const capabilities = require('../src/client-capabilities.json');
const { labels } = require('../electron/model-settings.cjs');
const file = new URL('../product-docs/pages/reference/parameters.md', import.meta.url);
const text = await readFile(file, 'utf8');
const start = '<!-- CAPABILITY_MATRIX -->';
const end = '<!-- /CAPABILITY_MATRIX -->';
const table = '| Agent | 当前允许写入的共用字段 |\n| --- | --- |\n' + Object.entries(capabilities).map(([id, fields]) =>
  `| [${id}](/reference/agents/${id}) | ${fields.map(field => labels[field]).join('、')} |`).join('\n');
const block = `${start}\n\n${table}\n\n${end}`;
const next = text.includes(end)
  ? text.slice(0, text.indexOf(start)) + block + text.slice(text.indexOf(end) + end.length)
  : text.replace(start, block);
if (process.argv.includes('--check')) {
  if (text !== next) throw new Error('参数能力表已过期，请运行 npm run docs:generate');
} else await writeFile(file, next);
console.log('Capability matrix matches current client capabilities.');
