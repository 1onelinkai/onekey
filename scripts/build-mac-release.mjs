import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = require('../package.json');
const manifest = require('../build/electron-runtime.json');
if (process.platform !== 'darwin') throw new Error('macOS release builds require macOS');
if (!process.env.APPLE_KEYCHAIN_PROFILE) throw new Error('APPLE_KEYCHAIN_PROFILE must name the existing notarization keychain profile');
if (pkg.devDependencies.electron !== manifest.version) throw new Error('Pin Electron and update the official runtime checksum together');
const expected = manifest['darwin-arm64'];
const name = `electron-v${manifest.version}-darwin-arm64.zip`;
const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const cache = path.join(os.homedir(), 'Library/Caches/electron');
let archive;
const directories = await fs.readdir(cache, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
for (const entry of directories) {
  if (!entry.isDirectory()) continue;
  const candidate = path.join(cache, entry.name, name);
  try { if (await hash(candidate) === expected) { archive = candidate; break; } }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!archive) {
  const { downloadArtifact } = require('@electron/get');
  archive = await downloadArtifact({ version: manifest.version, platform: 'darwin', arch: 'arm64', artifactName: 'electron' });
}
if (await hash(archive) !== expected) throw new Error('Electron runtime does not match the official release checksum');
console.log(`Official Electron ${manifest.version} darwin-arm64 ZIP SHA256 verified: ${expected}`);
const run = (file, args) => execFileSync(file, args, { cwd: root, stdio: 'inherit', env: process.env });
run('npm', ['run', 'build']);
run(process.execPath, [path.join(root, 'node_modules/electron-builder/cli.js'), '--mac', '--arm64', '--publish', 'never', `--config.electronDist=${archive}`]);
run(process.execPath, [path.join(root, 'scripts/notarize-mac-dmg.mjs')]);
run(process.execPath, [path.join(root, 'scripts/verify-mac-package.mjs'), '--require-gatekeeper']);
