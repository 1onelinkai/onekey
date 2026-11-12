import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '../product-docs');
const pages = path.join(root, 'pages');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
const files = (await walk(pages)).filter(file => file.endsWith('.md'));
const checkRoute = async (route, from) => {
  const target = route.split('#')[0].split('?')[0];
  if (!target || !target.startsWith('/')) return;
  const file = path.join(pages, target.endsWith('/') ? target + 'index.md' : target + '.md');
  try { await access(file); }
  catch { throw new Error(`失效文档链接 ${route}，来源 ${from}`); }
};
let characters = 0;
for (const file of files) {
  const text = await readFile(file, 'utf8');
  assert.ok(text.trim().length > 100, `空文档：${file}`);
  assert.ok(!/\/Users\/pony\/|\/var\/folders\/|sk-documentation-fictional-secret/.test(text), `本机路径或内部示例凭据未隐藏：${file}`);
  const prose = text.replace(/```[\s\S]*?```/g, '');
  for (const [, route] of prose.matchAll(/\]\((\/[^\s)]+)\)/g)) await checkRoute(route, file);
  for (const [, route] of prose.matchAll(/^\s+link:\s*(\/\S+)/gm)) await checkRoute(route, file);
  assert.equal((text.match(/^```/gm) || []).length % 2, 0, `未闭合代码块：${file}`);
  characters += text.length;
}
const config = await readFile(path.join(root, '.vitepress/config.mjs'), 'utf8');
for (const [, route] of config.matchAll(/(?:link:|,)[\s]*['"](\/[^'"$]+)['"]/g)) await checkRoute(route, 'config.mjs');
assert.ok(files.length >= 35, '文档页面缺失');
for (const source of ['agents.cjs', 'platform-login.cjs', 'platform-live.cjs', 'session-store.cjs', 'local-providers.cjs', 'provider-models.cjs', 'installer.cjs', 'desktop-installer.cjs', 'grok-installer.cjs', 'hermes-installer.cjs', 'uninstaller.cjs', 'agent-updates.cjs', 'config-inspector.cjs'])
  await access(path.resolve(root, '../electron', source));
console.log(`Checked ${files.length} pages, ${characters.toLocaleString()} characters, local links, code fences and implementation references.`);
