const fs = require('node:fs/promises');
const path = require('node:path');
const { configurePath } = require('./install-environment.cjs');
const sources = ['https://x.ai/cli', 'https://storage.googleapis.com/grok-build-public-artifacts/cli'];
const validVersion = value => /^\d+\.\d+\.\d+(?:-[A-Za-z0-9._]+)?$/.test(value);
function validateBinary(bytes, system) {
  if (system.platform === 'darwin') {
    if (bytes.length < 32 || bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== (system.arch === 'arm64' ? 0x100000c : 0x1000007)) throw new Error('Grok 安装文件格式或架构不匹配');
  } else {
    if (bytes.length < 64 || bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error('Grok Windows 安装文件格式无效');
    const offset = bytes.readUInt32LE(60);
    if (offset > bytes.length - 6 || bytes.readUInt32LE(offset) !== 0x4550 || bytes.readUInt16LE(offset + 4) !== (system.arch === 'arm64' ? 0xaa64 : 0x8664)) throw new Error('Grok Windows 安装文件架构不匹配');
  }
}
async function installGrok({ home, root, system, fetcher, execute, log, state, detect, expectedVersion }) {
  const staging = await fs.mkdtemp(path.join(root, 'grok-install-'));
  const bin = path.join(root, 'bin');
  const target = path.join(bin, system.platform === 'win32' ? 'grok.exe' : 'grok');
  let published = false;
  try {
    state.phase = 'network';
    let version = expectedVersion;
    if (version && !validVersion(version)) throw new Error('Grok 目标版本无效');
    for (const base of version ? [] : sources) {
      try {
        const response = await fetcher(base + '/stable', { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const value = (await response.text()).trim();
        if (!validVersion(value)) throw new Error('官方版本响应无效');
        version = value; break;
      } catch (error) { log('版本线路不可用：' + base + ' · ' + error.message); }
    }
    if (!version) throw new Error('Grok 官方版本线路均不可用，请检查网络后重试');
    log('固定 Grok stable 版本：' + version);
    const filename = `grok-${version}-${system.platform === 'darwin' ? 'macos' : 'windows'}-${system.arch === 'arm64' ? 'aarch64' : 'x86_64'}${system.platform === 'win32' ? '.exe' : ''}`;
    const candidate = path.join(staging, system.platform === 'win32' ? 'grok.exe' : 'grok');
    let downloaded = false;
    state.phase = 'installing';
    for (const base of sources) {
      try {
        log('下载 Grok 官方二进制：' + base + '/' + filename);
        const response = await fetcher(base + '/' + filename, { signal: AbortSignal.timeout(5 * 60 * 1000) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        let size = 0; const chunks = [];
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 512 * 1024 ** 2) throw new Error('安装文件超过大小限制');
          chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks);
        validateBinary(bytes, system);
        await fs.writeFile(candidate, bytes, { mode: 0o700 });
        const output = await execute(candidate, ['--version'], { timeout: 30000 });
        if (String(output).match(/\d+\.\d+\.\d+(?:-[A-Za-z0-9._]+)?/)?.[0] !== version) throw new Error('Grok 运行版本与目标不一致');
        downloaded = true; break;
      } catch (error) { log('Grok 下载或运行检查失败：' + error.message); await fs.rm(candidate, { force: true }); }
    }
    if (!downloaded) throw new Error('Grok 官方下载线路均失败，请查看日志后重试');
    await fs.mkdir(bin, { recursive: true });
    // Publish exclusively: never overwrite a concurrently installed program.
    await fs.copyFile(candidate, target, fs.constants.COPYFILE_EXCL);
    published = true;
    await fs.chmod(target, 0o700);
    state.phase = 'verifying';
    await configurePath({ home, bin, platform: system.platform, execute, log });
    state.detected = (await detect()).find(item => item.id === 'grok' && item.installed && item.executable === target);
    if (!state.detected || (expectedVersion && state.detected.version !== expectedVersion)) throw new Error('Grok 安装后检测未通过');
    log('Grok 安装完成：' + version);
  } catch (error) {
    if (published) await fs.rm(target, { force: true });
    throw error;
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}
module.exports = { installGrok, validateBinary, sources };
