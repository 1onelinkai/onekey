const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = async function prepareMacApp(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const macos = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app', 'Contents/MacOS');
  await fs.rm(path.join(macos, '../Resources/default_app.asar'), { force: true });
  const executable = path.join(macos, context.packager.appInfo.productFilename);
  const runtime = path.join(macos, 'OneLinkAI Runtime');
  // The universal merge, if requested, already includes both prepared binaries.
  if (await fs.stat(runtime).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) return;
  await fs.rename(executable, runtime);
  const architectures = context.arch === 4 ? ['arm64', 'x86_64'] : [context.arch === 3 ? 'arm64' : 'x86_64'];
  execFileSync('xcrun', ['clang', '-fobjc-arc', '-mmacosx-version-min=12.0', ...architectures.flatMap(arch => ['-arch', arch]), '-framework', 'AppKit', '-framework', 'Foundation', path.resolve(__dirname, '../electron/native/launcher.m'), '-o', executable], { stdio: 'inherit' });
  await fs.chmod(executable, 0o755);
};
