import { copyFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { prepareSoftwareUpdate } from './prepare-software-update.mjs';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const profile = process.env.APPLE_KEYCHAIN_PROFILE;
if (!profile) throw new Error('Set APPLE_KEYCHAIN_PROFILE before building a release.');

const source = path.resolve(`release/One Key-${version}-arm64.dmg`);
const output = path.resolve(`release/distribution/One Key-${version}-arm64-notarized.dmg`);
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
run('xcrun', ['stapler', 'validate', path.resolve('release/mac-arm64/One Key.app')]);
await mkdir(path.dirname(output), { recursive: true });
await copyFile(source, output);
run('codesign', ['--force', '--timestamp', '--sign', 'Developer ID Application: Shanghai Wanlian Easy Computing Technology Co., Ltd (7HHXUC392K)', '--identifier', 'cloud.onelinkai.desktop.dmg', output]);
run('xcrun', ['notarytool', 'submit', output, '--keychain-profile', profile, '--wait']);
run('xcrun', ['stapler', 'staple', output]);
run('xcrun', ['stapler', 'validate', output]);
run('codesign', ['--verify', '--verbose=2', output]);
console.log(`Release DMG: ${output}`);
// Hash the FINAL signed/stapled DMG. This exact file serves both installation and updates.
console.log(`Update files: ${await prepareSoftwareUpdate({ platform: 'darwin', arch: 'arm64', source: path.dirname(output), artifact: path.basename(output), version })}`);
