import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
const packageVersion = createRequire(import.meta.url)('../package.json').version;

async function digest(file) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('base64');
}

export function manifestName(platform, arch) {
  if (!['darwin', 'win32', 'linux'].includes(platform) || !['x64', 'arm64', 'ia32', 'arm'].includes(arch)) throw new Error('需要有效的 platform 和 arch');
  return platform === 'darwin' ? 'latest-mac.yml' : platform === 'win32' ? 'latest.yml' : `latest-linux${arch === 'x64' ? '' : '-' + arch}.yml`;
}

export async function prepareSoftwareUpdate({ platform, arch, source = 'release', output = 'release/software-updates', artifact, version = packageVersion, releaseNotes }) {
  const manifest = manifestName(platform, arch);
  let raw;
  if (platform === 'darwin') {
    const candidates = artifact ? [artifact] : (await fs.readdir(source)).filter(name => name.endsWith('.dmg'));
    if (candidates.length !== 1) throw new Error('发布目录需要唯一的 DMG，请使用单独的构建目录');
    const name = candidates[0];
    if (name !== path.basename(name) || /[\\/?#]/.test(name) || !name.endsWith('.dmg')) throw new Error('DMG 必须位于发布目录中');
    const file = path.join(source, name);
    const size = (await fs.stat(file)).size;
    const sha512 = await digest(file);
    raw = YAML.stringify({ version, files: [{ url: name, sha512, size }], path: name, sha512,
      releaseDate: new Date().toISOString(), ...(releaseNotes ? { releaseNotes } : {}) });
  } else {
    raw = await fs.readFile(path.join(source, manifest), 'utf8');
  }
  const info = YAML.parse(raw);
  if (!info?.version || !Array.isArray(info.files) || !info.files.length) throw new Error('发布清单缺少版本或安装包');
  const files = [];
  for (const file of info.files) {
    const name = decodeURIComponent(file.url);
    if (name !== path.basename(name) || /[\\/?#]/.test(name) || name === '.' || name === '..') throw new Error('安装包必须位于发布目录中');
    const sourceFile = path.join(source, name);
    if (file.size !== (await fs.stat(sourceFile)).size || await digest(sourceFile) !== file.sha512) throw new Error(`安装包大小或 SHA512 校验失败：${name}`);
    files.push({ name, sourceFile });
  }
  const extension = platform === 'darwin' ? '.dmg' : platform === 'win32' ? '.exe' : '.AppImage';
  if (!files.some(file => file.name.endsWith(extension))) throw new Error(`缺少全量更新包 ${extension}`);
  const destination = path.resolve(output, platform, arch);
  await fs.mkdir(destination, { recursive: true });
  for (const file of files) {
    if (path.resolve(file.sourceFile) !== path.join(destination, file.name)) await fs.copyFile(file.sourceFile, path.join(destination, file.name));
  }
  // Installers first, manifest last. Deployment must follow the same order.
  await fs.writeFile(path.join(destination, manifest), raw);
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [platform, arch, source, output] = process.argv.slice(2);
  console.log(await prepareSoftwareUpdate({ platform, arch, source, output }));
}
