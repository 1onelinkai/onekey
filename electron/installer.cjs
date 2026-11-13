const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createInstallCommand } = require('./install-command.cjs');
const { nodeRoutes, npmRoutes, probeRoutes, configurePath } = require('./install-environment.cjs');
const { installGrok } = require('./grok-installer.cjs');
const { installHermes } = require('./hermes-installer.cjs');
const { desktops, installDesktop } = require('./desktop-installer.cjs');

const packages = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
  opencode: 'opencode-ai',
  pi: '@earendil-works/pi-coding-agent',
  gemini: '@google/gemini-cli',
  openclaw: 'openclaw',
  'deepseek-harness': '@deepseek-ai/dsh',
  minimax: '@minimax-ai/code',
};
const commandNames = { 'deepseek-harness': 'dsh', minimax: 'mcode' };
const runtimeSupported = version => {
  const match = /^v24\.(\d+)\.(\d+)$/.exec(version.trim());
  return !!match && (Number(match[1]) > 22 || Number(match[1]) === 22 && Number(match[2]) >= 1);
};
const installScripts = ['@anthropic-ai/claude-code', '@minimax-ai/code', '@vscode/ripgrep', 'better-sqlite3', 'opencode-ai', '@deepseek-ai/dsh-subprocess-local', 'openclaw', 'esbuild', 'koffi', 'protobufjs', '@google/genai', 'node-pty', '@github/keytar'];

async function preflight(home, client, io = fs) {
  const stat = await io.statfs(home);
  const required = (client === 'hermes' ? 5 : 2) * 1024 ** 3;
  const available = Number(stat.bavail) * Number(stat.bsize);
  if (available < required) throw new Error(`磁盘可用空间不足：需要至少 ${required / 1024 ** 3} GiB，可用 ${(available / 1024 ** 3).toFixed(1)} GiB`);
  const probe = path.join(home, '.onelink-write-' + crypto.randomUUID());
  try { await io.writeFile(probe, '', { flag: 'wx', mode: 0o600 }); }
  catch (error) { throw new Error('用户目录不可写：' + error.message); }
  finally { await io.rm(probe, { force: true }); }
  return available;
}
const guides = {
  zed: 'https://zed.dev/download',
  vscode: 'https://code.visualstudio.com/download',
  zcode: 'https://zcode.z.ai/',
  workbuddy: 'https://www.codebuddy.ai/',
  hermes: 'https://github.com/NousResearch/hermes-agent',
  'claude-desktop': 'https://claude.ai/download',
  gemini: 'https://github.com/google-gemini/gemini-cli',
  grok: 'https://github.com/xai-org/grok-build',
  openclaw: 'https://github.com/openclaw/openclaw',
  minimax: 'https://github.com/MiniMax-AI/MiniMax-M2',
  'deepseek-harness': 'https://github.com/deepseek-ai/deepseek-harness',
  'deepseek-harness-desktop': 'https://github.com/deepseek-ai/deepseek-harness',
};

function environment({ platform = process.platform, arch = process.arch, machine = os.machine(), release = os.release(), env = process.env } = {}) {
  // A translated x64 process may be running on an ARM machine.
  if (/arm64|aarch64/i.test(machine) || env.PROCESSOR_ARCHITEW6432 === 'ARM64' || env.PROCESSOR_ARCHITECTURE === 'ARM64') arch = 'arm64';
  return { platform, arch, release, label: `${platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : platform} · ${arch === 'arm64' ? 'ARM64' : arch === 'x64' ? 'Intel / AMD 64 位' : '32 位'}` };
}

function installationPlan(client, system) {
  if (!packages[client] && !guides[client]) throw new Error('未知客户端');
  const base = { client, system, supported: false, guide: guides[client] };
  if (!['darwin', 'win32'].includes(system.platform)) return { ...base, reason: '当前自动安装仅支持 macOS 和 Windows' };
  if (!['x64', 'arm64'].includes(system.arch)) return { ...base, reason: '此客户端未提供可靠的 32 位安装支持；请使用 64 位系统' };
  if (system.platform === 'darwin' && Number(system.release.split('.')[0]) < 22) return { ...base, reason: '自动安装环境需要 macOS 13 或更新系统' };
  if (system.platform === 'win32' && Number(system.release.split('.')[0]) < 10) return { ...base, reason: '自动安装需要 Windows 10 / 11 或更新系统' };
  if (desktops[client] && system.platform === 'darwin') return { ...base, supported: true, steps: ['获取当前架构的官方安装版本与 SHA-256', '下载官方安装包，GitHub 资源失败时尝试代理线路', '校验哈希、应用签名和硬件架构', '安装到用户 Applications 目录并重新检测'], notice: '无需管理员权限，不覆盖已有应用。下载信息来自 Homebrew Cask 元数据，文件来自厂商官方 CDN 或经过哈希校验的代理。', location: '~/Applications' };
  if (client === 'hermes') return { ...base, supported: true, steps: ['探测 GitHub、GitClone、GHProxy、GHFast、GitMirror 等源码线路', '选择可用线路，固定提交并校验安装脚本', '检查 Git，准备 uv 和 Python 环境', '下载 Hermes 源码、安装依赖，失败自动切换', '生成命令入口、配置 PATH 并验证运行'], notice: '源码阶段会优先选择可用的国内代理；依赖使用清华 PyPI 镜像，并对源码阶段设置超时。首次安装可能较久；缺少系统开发工具时可能需要系统安装确认。基础安装跳过浏览器和电脑控制可选组件，模型由 OneLinkAI 配置。', location: system.platform === 'win32' ? '%LOCALAPPDATA%/hermes' : '~/.hermes' };
  if (client === 'grok') return { ...base, supported: true, steps: ['获取 Grok 官方 stable 版本', '下载当前系统架构的官方二进制，失败切换官方 GCS', '验证文件格式、架构和运行版本', '配置用户 PATH 并重新检测'], location: '~/.onelinkai/managed/bin', notice: '直接安装官方 Grok Build，无需 Node.js。通过 HTTPS 获取官方文件，安装失败清理程序；保留现有配置。首次使用仍需官方登录。' };
  if (!packages[client]) return { ...base, reason: '此桌面客户端暂未接入经过验证的自动安装渠道' };
  return { ...base, supported: true, package: packages[client], steps: ['检测系统架构与下载线路，选择可用的低延迟源', '下载并校验独立 Node.js 24 LTS 环境', '安装客户端与依赖，线路失败自动切换', '配置用户 PATH、验证命令入口并复检版本'], location: '~/.onelinkai/managed', notice: '首次安装需要联网下载。自动选择官方或国内镜像；修改用户 PATH 前保留备份，不替换系统 Node.js 或 npm 源。Windows 的 Claude Code / Pi 还可能需要 Git Bash。' };
}

function createInstaller({ home = os.homedir(), system = environment(), detect, fetcher = fetch, runner, resolveEnvironment = async () => ({ ...process.env }) } = {}) {
  const root = path.join(home, '.onelinkai', 'managed');
  const runtime = path.join(root, 'runtime');
  const prefix = path.join(root, 'clients');
  const bin = path.join(root, 'bin');
  const state = { running: false, client: null, phase: 'idle', logs: [], error: '', detected: null, routes: {} };
  const phaseTimeouts = { probe: 15000, runtimeCheck: 30000, runtimeDownload: 5 * 60 * 1000, runtimeExtract: 120000, npmInstall: 15 * 60 * 1000, verify: 30000 };
  const log = (line) => { state.logs.push(String(line).slice(-2000)); state.logs = state.logs.slice(-100); };
  let installEnv = { ...process.env };
  const commandRunner = runner || createInstallCommand(log);
  const execute = (file, args, options = {}) => commandRunner(file, args, { ...options, env: { ...installEnv, ...options.env, ...Object.fromEntries(Object.entries(installEnv).filter(([key]) => /proxy/i.test(key))) } });
  async function download(url, destination) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(phaseTimeouts.runtimeDownload), redirect: 'follow' });
    if (!response.ok) throw new Error('下载失败：HTTP ' + response.status);
    const handle = await fs.open(destination, 'wx', 0o600);
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    try {
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 150 * 1024 * 1024) throw new Error('下载文件超过大小限制');
        hash.update(chunk);
        await handle.writeFile(chunk);
      }
    } finally { await handle.close(); }
    return hash.digest('hex');
  }
  const node = () => path.join(runtime, system.platform === 'win32' ? 'node.exe' : 'bin/node');
  async function ensureRuntime(routes) {
    try {
      const version = await execute(node(), ['--version'], { timeout: phaseTimeouts.runtimeCheck });
      if (runtimeSupported(version)) { log('独立 Node.js 环境已就绪：' + version.trim()); return; }
    } catch { /* Provision the managed runtime when absent or invalid. */ }
    const manifestRoutes = routes.filter(route => route.available && route.body);
    if (!manifestRoutes.length) throw new Error('所有 Node.js 下载线路均不可用');
    const suffix = `${system.platform === 'win32' ? 'win' : 'darwin'}-${system.arch}.${system.platform === 'win32' ? 'zip' : 'tar.gz'}`;
    const entries = manifestRoutes.map(route => ({ route, entry: route.body.split('\n').map(line => line.trim().split(/\s+/)).find(([hash, name]) => /^[a-f0-9]{64}$/.test(hash) && new RegExp('^node-v24\\.\\d+\\.\\d+-' + suffix.replaceAll('.', '\\.')).test(name) && name.endsWith(suffix)) })).filter(item => item.entry);
    if (!entries.length) throw new Error('线路清单未提供当前系统 / 架构的 Node.js 安装包');
    const staging = await fs.mkdtemp(path.join(root, 'runtime-'));
    try {
      let downloaded = false;
      let entry;
      let selectedRoute;
      let archive;
      for (const candidate of entries) {
        const [hash, filename] = candidate.entry;
        archive = path.join(staging, filename);
        const version = filename.match(/^node-(v24\.\d+\.\d+)-/)[1];
        try {
          log('下载运行环境：' + candidate.route.name + ' · ' + filename);
          if (await download(candidate.route.url + version + '/' + filename, archive) !== hash) throw new Error('文件 SHA-256 校验失败');
          entry = candidate.entry;
          selectedRoute = candidate.route;
          downloaded = true;
          break;
        } catch (error) {
          log(candidate.route.name + ' 下载失败，切换线路：' + error.message);
          await fs.rm(archive, { force: true });
        }
      }
      if (!downloaded) throw new Error('所有 Node.js 下载线路均失败，请检查网络后重试');
      state.routes.node = state.routes.node.map(route => ({ ...route, selected: route.name === selectedRoute.name }));
      const extracted = path.join(staging, 'extracted');
      await fs.mkdir(extracted);
      if (system.platform === 'win32') {
        const quote = value => "'" + value.replaceAll("'", "''") + "'";
        const script = `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extracted)} -ErrorAction Stop`;
        await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: phaseTimeouts.runtimeExtract });
      } else await execute('/usr/bin/tar', ['-xzf', archive, '-C', extracted], { timeout: phaseTimeouts.runtimeExtract });
      const directories = await fs.readdir(extracted);
      if (directories.length !== 1) throw new Error('运行环境压缩包结构异常');
      const candidate = path.join(extracted, directories[0]);
      const installedVersion = await execute(path.join(candidate, system.platform === 'win32' ? 'node.exe' : 'bin/node'), ['--version'], { timeout: phaseTimeouts.runtimeCheck });
      if (!runtimeSupported(installedVersion)) throw new Error('运行环境版本校验失败，需要 Node.js 24.22 或更新的 24.x');
      const backup = path.join(staging, 'previous-runtime');
      let saved = false;
      try { await fs.rename(runtime, backup); saved = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try { await fs.rename(candidate, runtime); }
      catch (error) { if (saved) await fs.rename(backup, runtime); throw error; }
      log('Node.js 校验完成：' + installedVersion.trim());
    } finally { await fs.rm(staging, { recursive: true, force: true }); }
  }
  async function install(client, update = {}) {
    const plan = installationPlan(client, system);
    if (!plan.supported) throw new Error(plan.reason);
    if (state.running) throw new Error('另一个安装任务正在进行');
    Object.assign(state, { running: true, client, operation: update.update ? 'update' : 'install', phase: 'checking', logs: [], error: '', detected: null, routes: {} });
    void (async () => {
      let network;
      let backup;
      let restoreTarget;
      let claudeNativeLink;
      let claudeNativeBackup;
      const oldShims = new Map();
      try {
        log(system.label);
        network = await resolveEnvironment();
        installEnv = network.env || network;
        log(installEnv.HTTPS_PROXY || installEnv.https_proxy ? '已接入系统 / 环境 HTTP 代理（Git、npm、uv 和下载请求）' : '未检测到 HTTP 代理，使用系统网络与可用镜像');
        const existing = (await detect()).find(item => item.id === client && item.installed);
        if (update.update) {
          if (!existing || (update.kind === 'desktop' ? existing.bundle : existing.executable) !== update.expectedTarget) throw new Error('安装位置已变化，请重新检查更新');
          if (update.kind === 'npm' && ![client, commandNames[client]].filter(Boolean).some(name => existing.executable === path.join(bin, name + (system.platform === 'win32' ? '.cmd' : '')))) throw new Error('拒绝升级非托管 npm 安装');
          if (update.kind === 'desktop' && existing.bundle !== path.join(home, 'Applications', desktops[client]?.app || '')) throw new Error('拒绝替换外部应用目录');
          if (update.kind === 'claude-native') {
            if (client !== 'claude' || system.platform !== 'darwin' || existing.executable !== path.join(home, '.local/bin/claude')) throw new Error('拒绝升级未经确认来源的 Claude 安装');
            const versions = await fs.realpath(path.join(home, '.local/share/claude/versions'));
            const resolved = await fs.realpath(existing.executable);
            const link = await fs.readlink(existing.executable);
            if (path.dirname(resolved) !== versions || resolved !== update.expectedVersionPath || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(path.basename(resolved))) throw new Error('Claude 原生安装位置已变化，请重新检查更新');
            const linkTarget = await fs.realpath(path.resolve(path.dirname(existing.executable), link));
            if (linkTarget !== resolved) throw new Error('Claude 原生安装入口已变化，请重新检查更新');
            claudeNativeLink = link;
          }
          if (update.kind === 'opencode-native') {
            const expected = path.join(await fs.realpath(home), '.opencode/bin/opencode');
            if (client !== 'opencode' || system.platform === 'win32' || existing.executable !== path.join(home, '.opencode/bin/opencode') || !(await fs.lstat(existing.executable)).isFile() || await fs.realpath(existing.executable) !== expected) throw new Error('OpenCode 独立安装位置已变化，请重新检查更新');
          }
          if (update.kind === 'grok' && (client !== 'grok' || existing.executable !== path.join(bin, system.platform === 'win32' ? 'grok.exe' : 'grok'))) throw new Error('拒绝升级非托管 Grok 安装');
          if (!require('semver').valid(update.expectedVersion || '')) throw new Error('升级目标版本无效');
          if (!['npm', 'desktop', 'hermes', 'claude-native', 'opencode-native', 'grok'].includes(update.kind)) throw new Error('无效升级来源');
          await preflight(home, client);
          await fs.mkdir(root, { recursive: true, mode: 0o700 });
          if (update.kind === 'claude-native') {
            await preflight(home, client);
          } else if (update.kind !== 'hermes') {
            if (update.kind === 'npm') {
              for (const name of new Set([client, commandNames[client]].filter(Boolean))) {
                const file = path.join(bin, name + (system.platform === 'win32' ? '.cmd' : ''));
                oldShims.set(file, await fs.readFile(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; }));
              }
            }
            restoreTarget = update.kind === 'npm' ? prefix : ['opencode-native', 'grok'].includes(update.kind) ? existing.executable : existing.bundle;
            const candidateBackup = path.join(path.dirname(restoreTarget), '.onelink-upgrade-' + crypto.randomUUID());
            if (update.kind === 'npm') {
              try { await fs.cp(restoreTarget, candidateBackup, { recursive: true, verbatimSymlinks: true }); }
              catch (error) { await fs.rm(candidateBackup, { recursive: true, force: true }); throw error; }
            } else if (update.kind === 'opencode-native') await fs.copyFile(restoreTarget, candidateBackup, fs.constants.COPYFILE_EXCL);
            else await fs.rename(restoreTarget, candidateBackup);
            backup = candidateBackup;
            log('已备份旧程序，升级失败将恢复：' + backup);
          }
        }
        if (existing && !update.update) {
          state.detected = existing;
          log('客户端已经安装，无需重复安装');
          if (existing.executable?.startsWith(bin + path.sep)) {
            if (commandNames[client]) {
              const extension = system.platform === 'win32' ? '.cmd' : '';
              const canonical = path.join(bin, commandNames[client] + extension);
              const legacy = path.join(bin, client + extension);
              if (existing.executable === legacy) await fs.copyFile(legacy, canonical);
              else if (existing.executable === canonical) await fs.copyFile(canonical, legacy);
            }
            await configurePath({ home, bin, platform: system.platform, execute, log });
          }
          if (client === 'hermes') await configurePath({ home, bin: system.platform === 'win32' ? path.dirname(existing.executable) : path.join(home, '.local/bin'), platform: system.platform, execute, log });
        }
        else if (client === 'opencode' && update.update && update.kind === 'opencode-native') {
          state.phase = 'updating';
          log('执行 OpenCode 官方升级器，固定版本：' + update.expectedVersion);
          await execute(existing.executable, ['upgrade', update.expectedVersion, '--method', 'curl'], { timeout: 20 * 60 * 1000 });
          const output = await execute(existing.executable, ['--version'], { timeout: 30000 });
          if (output.trim() !== update.expectedVersion) throw new Error('升级后 OpenCode 版本未达到目标：' + output.trim());
          if (!(await fs.lstat(existing.executable)).isFile() || await fs.realpath(existing.executable) !== path.join(await fs.realpath(home), '.opencode/bin/opencode')) throw new Error('升级后 OpenCode 入口已变化');
          state.detected = (await detect()).find(item => item.id === client && item.installed && item.executable === update.expectedTarget && item.version === update.expectedVersion);
          if (!state.detected) throw new Error('OpenCode 更新后复检版本不一致');
          log('OpenCode 更新后运行验证通过：' + output.trim());
        }
        else if (client === 'grok') {
          await preflight(home, client);
          await fs.mkdir(root, { recursive: true, mode: 0o700 });
          await installGrok({ home, root, system, fetcher, execute, log, state, detect, expectedVersion: update.expectedVersion });
        }
        else if (desktops[client]) {
          log('可用磁盘空间：' + (await preflight(home, client) / 1024 ** 3).toFixed(1) + ' GiB；用户目录可写');
          await fs.mkdir(root, { recursive: true, mode: 0o700 });
          await installDesktop({ client, home, root, system, fetcher, execute, log, state, detect });
        }
        else if (client === 'hermes' && update.update) {
          state.phase = 'updating';
          const cache = path.join(root, 'hermes-npm-cache');
          await fs.mkdir(cache, { recursive: true, mode: 0o700 });
          log('执行 Hermes 官方升级与恢复流程');
          await execute(existing.executable, ['update', '--yes', '--channel', 'stable'], { env: { ...installEnv, npm_config_cache: cache, NPM_CONFIG_CACHE: cache, CI: '1' }, timeout: 30 * 60 * 1000 });
          const output = await execute(existing.executable, ['--version'], { timeout: 120000 });
          const version = output.match(/\bv?(\d+\.\d+\.\d+(?:-[\w.-]+)?)/)?.[1];
          if (version !== update.expectedVersion) throw new Error('升级后版本未达到目标：' + output.trim());
          state.detected = (await detect()).find(item => item.id === client && item.installed);
          if (!state.detected) throw new Error('升级后未检测到 Hermes');
          log('升级后运行验证通过：' + output.trim());
        }
        else if (client === 'claude' && update.update && update.kind === 'claude-native') {
          state.phase = 'updating';
          const oldProgram = await fs.realpath(existing.executable);
          const oldStat = await fs.stat(oldProgram);
          const available = await preflight(home, client);
          if (available < oldStat.size + 512 * 1024 ** 2) throw new Error('磁盘空间不足，无法安全保留 Claude Code 原版本');
          await fs.mkdir(root, { recursive: true, mode: 0o700 });
          claudeNativeBackup = path.join(root, '.claude-version-backup-' + crypto.randomUUID());
          await fs.copyFile(oldProgram, claudeNativeBackup, fs.constants.COPYFILE_EXCL);
          await fs.chmod(claudeNativeBackup, oldStat.mode & 0o777);
          log('已备份 Claude Code 原版本；如果官方更新校验失败，将恢复旧版本');
          log('执行 Anthropic Claude Code 官方更新器');
          await execute(existing.executable, ['update'], { timeout: 20 * 60 * 1000 });
          const output = await execute(existing.executable, ['--version'], { timeout: 30000 });
          const version = output.match(/(?:^|\s)(\d+\.\d+\.\d+(?:-[\w.-]+)?)/)?.[1];
          if (version !== update.expectedVersion) throw new Error('升级后 Claude Code 版本未达到目标：' + output.trim());
          const resolved = await fs.realpath(existing.executable);
          if (path.dirname(resolved) !== await fs.realpath(path.join(home, '.local/share/claude/versions'))) throw new Error('更新后 Claude Code 入口已离开原生版本目录');
          state.detected = (await detect()).find(item => item.id === client && item.installed);
          if (!state.detected || state.detected.version !== update.expectedVersion) throw new Error('Claude Code 更新后复检版本不一致');
          await fs.rm(claudeNativeBackup, { force: true });
          claudeNativeBackup = null;
          log('Claude Code 更新后运行验证通过：' + output.trim());
        }
        else if (client === 'hermes') {
          log('可用磁盘空间：' + (await preflight(home, client) / 1024 ** 3).toFixed(1) + ' GiB；用户目录可写');
          await fs.mkdir(root, { recursive: true, mode: 0o700 });
          await installHermes({ home, root, system, execute, fetcher, log, state, detect });
        } else {
          log('可用磁盘空间：' + (await preflight(home, client) / 1024 ** 3).toFixed(1) + ' GiB；用户目录可写');
          await fs.mkdir(root, { recursive: true, mode: 0o700 });
          state.phase = 'network';
          log('探测 Node.js 与 npm 官方 / 国内镜像线路…');
          const [nodeResults, npmResults] = await Promise.all([
            probeRoutes(nodeRoutes, 'latest-v24.x/SHASUMS256.txt', body => /[a-f0-9]{64}\s+node-v24\./.test(body), fetcher),
            probeRoutes(npmRoutes, '/' + encodeURIComponent(packages[client]) + '/latest', body => { try { const data = JSON.parse(body); return data.name === packages[client] && !!data.version; } catch { return false; } }, fetcher),
          ]);
          const officialChecksums = nodeResults.find(route => route.name === 'Node.js 官方' && route.available)?.body;
          if (officialChecksums) {
            const official = new Map(officialChecksums.split('\n').map(line => line.trim().split(/\s+/)).map(([hash, filename]) => [filename, hash]));
            for (const route of nodeResults.filter(route => route.available)) {
              route.body = route.body.split('\n').filter(line => { const [hash, filename] = line.trim().split(/\s+/); return official.get(filename) === hash; }).join('\n');
            }
          }
          state.routes = { node: nodeResults.map(({ body, ...route }) => route), npm: npmResults.map(({ body, ...route }) => route) };
          for (const result of [...nodeResults, ...npmResults]) log(result.name + '：' + (result.available ? result.latency + 'ms' : '不可用 · ' + result.error));
          const registries = npmResults.filter(route => route.available);
          if (!registries.length) throw new Error('所有 npm 下载线路均不可用');
          const pinnedVersion = update.expectedVersion || JSON.parse((registries.find(route => route.name === 'npm 官方') || registries[0]).body).version;
          if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(pinnedVersion)) throw new Error('客户端版本格式无效');
          log('固定客户端版本：' + pinnedVersion);
          state.phase = 'runtime';
          await ensureRuntime(nodeResults.filter(route => route.available));
          const nodeBin = system.platform === 'win32' ? runtime : path.join(runtime, 'bin');
          const env = { ...installEnv, PATH: [nodeBin, bin, installEnv.PATH || ''].join(path.delimiter) };
          // Git Bash is a runtime dependency for Claude Code on Windows.
          if (system.platform === 'win32' && ['claude', 'pi'].includes(client)) {
            await execute('git.exe', ['--version'], { env }).catch(() => { throw new Error('缺少 Git for Windows，请先安装 Git（含 Git Bash），再重试'); });
          }
          state.phase = 'installing';
          const npm = path.join(runtime, system.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js');
          const moduleRoot = path.join(prefix, system.platform === 'win32' ? 'node_modules' : 'lib/node_modules', packages[client]);
          const clientTarget = system.platform === 'win32' ? path.join(prefix, (commandNames[client] || client) + '.cmd') : path.join(prefix, 'bin', commandNames[client] || client);
          let installed = false;
          let version = '';
          for (const route of registries) {
            try {
              state.routes.npm = state.routes.npm.map(candidate => ({ ...candidate, selected: candidate.name === route.name }));
              log('使用 ' + route.name + ' 安装 ' + packages[client]);
              await execute(node(), [npm, 'install', '--global', '--prefix', prefix, '--cache', path.join(root, 'cache'), '--registry=' + route.url, '--fetch-retries=1', '--fetch-timeout=45000', '--foreground-scripts', '--allow-scripts=' + installScripts.join(','), '--no-fund', '--no-audit', packages[client] + '@' + pinnedVersion], { env, timeout: phaseTimeouts.npmInstall });
              const manifest = JSON.parse(await fs.readFile(path.join(moduleRoot, 'package.json'), 'utf8'));
              if (manifest.version !== pinnedVersion) throw new Error('安装包版本与目标不一致');
              const binary = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[commandNames[client] || client];
              if (typeof binary !== 'string') throw new Error('安装包缺少客户端命令入口');
              const entry = path.resolve(moduleRoot, binary);
              if (!entry.startsWith(moduleRoot + path.sep)) throw new Error('客户端命令路径无效');
              version = await execute(/\.[cm]?js$/.test(entry) ? node() : entry, /\.[cm]?js$/.test(entry) ? [entry, '--version'] : ['--version'], { env, timeout: 30000 });
              if (!/\d+\.\d+/.test(version)) throw new Error('客户端版本运行检查失败');
              if (update.update && version.match(/\d+\.\d+\.\d+(?:-[\w.-]+)?/)?.[0] !== pinnedVersion) throw new Error('运行版本与升级目标不一致');
              installed = true;
              break;
            } catch (error) {
              state.routes.npm = state.routes.npm.map(candidate => candidate.name === route.name ? { ...candidate, selected: false, error: error.message, failed: true } : candidate);
              log(route.name + ' 安装失败，切换线路：' + error.message);
              await fs.rm(moduleRoot, { recursive: true, force: true });
              await fs.rm(clientTarget, { force: true });
            }
          }
          if (!installed) throw new Error('所有 npm 安装线路均失败，请查看日志后重试');
          log('运行检查通过：' + version.trim());
          await fs.mkdir(bin, { recursive: true });
          const target = system.platform === 'win32' ? path.join(prefix, (commandNames[client] || client) + '.cmd') : path.join(prefix, 'bin', commandNames[client] || client);
          if (system.platform === 'win32') {
            if (/[\r\n%!"]/u.test(root)) throw new Error('当前用户路径含不支持的命令字符');
            await fs.writeFile(path.join(bin, client + '.cmd'), `@echo off\r\nset "PATH=${nodeBin};%PATH%"\r\ncall "${target}" %*\r\n`, { mode: 0o700 });
          } else {
            const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
            await fs.writeFile(path.join(bin, client), `#!/bin/sh\nexport PATH=${quote(nodeBin)}:"$PATH"\nexec ${quote(target)} "$@"\n`, { mode: 0o700 });
          }
          if (commandNames[client]) await fs.copyFile(path.join(bin, client + (system.platform === 'win32' ? '.cmd' : '')), path.join(bin, commandNames[client] + (system.platform === 'win32' ? '.cmd' : '')));
          state.phase = 'verifying';
          await configurePath({ home, bin, platform: system.platform, execute, log });
          const commandEnv = { ...env, PATH: [bin, env.PATH].join(path.delimiter) };
          if (system.platform !== 'win32') {
            const commandVersion = await execute(client, ['--version'], { env: commandEnv, timeout: 30000 });
            if (!/\d+\.\d+/.test(commandVersion)) throw new Error('PATH 命令执行验证失败');
          } else {
            const quote = value => "'" + value.replaceAll("'", "''") + "'";
            const script = `$ErrorActionPreference='Stop'; $env:Path=${quote(bin + ';')} + [Environment]::GetEnvironmentVariable('Path','User') + ';' + $env:Path; & ${client} --version; if ($LASTEXITCODE -ne 0) { throw 'Client command failed' }`;
            const commandVersion = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env: commandEnv, timeout: 30000 });
            if (!/\d+\.\d+/.test(commandVersion)) throw new Error('Windows PATH 命令执行验证失败');
          }
          state.detected = (await detect()).find(item => item.id === client && item.installed);
          if (!state.detected) throw new Error('安装已执行，但未检测到可运行的客户端；请查看日志后重试');
          log('安装后复检通过：' + (state.detected.version || state.detected.evidence));
          log('命令目录已加入用户 PATH：' + bin);
        }
        if (update.update && update.kind === 'desktop') {
          const version = await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(restoreTarget, 'Contents/Info.plist')], { timeout: 10000 });
          if (version.trim() !== update.expectedVersion) throw new Error('升级后应用版本与目标不一致');
        }
        if (backup) { await fs.rm(backup, { recursive: true, force: true }); backup = null; }
        state.phase = 'complete';
      } catch (error) {
        state.phase = 'failed'; state.error = error.message; log(error.message);
        if (claudeNativeLink) {
          try {
            const current = await fs.readlink(path.join(home, '.local/bin/claude')).catch(() => null);
            if (current !== claudeNativeLink) {
              const backupTarget = path.resolve(path.join(home, '.local/bin'), claudeNativeLink);
              await fs.access(backupTarget).catch(async error => {
                if (error.code !== 'ENOENT' || !claudeNativeBackup) throw error;
                await fs.copyFile(claudeNativeBackup, backupTarget, fs.constants.COPYFILE_EXCL);
                await fs.chmod(backupTarget, 0o700);
              });
              const restoreLink = path.join(home, '.local/bin', '.claude-restore-' + crypto.randomUUID());
              try { await fs.symlink(claudeNativeLink, restoreLink); await fs.rename(restoreLink, path.join(home, '.local/bin/claude')); }
              finally { await fs.rm(restoreLink, { force: true }); }
              log('已恢复 Claude Code 升级前版本入口');
            }
            if (claudeNativeBackup) { await fs.rm(claudeNativeBackup, { force: true }); claudeNativeBackup = null; }
          } catch (rollback) { state.error += '；恢复失败：' + rollback.message + (claudeNativeBackup ? '；原版本备份保留在 ' + claudeNativeBackup : ''); log(state.error); }
        }
        if (backup) {
          try {
            await fs.rm(restoreTarget, { recursive: true, force: true });
            await fs.rename(backup, restoreTarget);
            for (const [file, content] of oldShims) {
              if (content === null) await fs.rm(file, { force: true });
              else await fs.writeFile(file, content, { mode: 0o700 });
            }
            log('已恢复升级前程序');
          } catch (rollback) { state.error += '；恢复失败，备份保留在 ' + backup + '：' + rollback.message; log(state.error); }
        }
      }
      finally {
        try { if (network?.close) await network.close(); }
        catch (error) { log('释放安装网络资源失败：' + error.message); }
        state.running = false;
      }
    })();
    return snapshot();
  }
  function snapshot() { return { ...state, logs: [...state.logs] }; }
  return { plan: async client => installationPlan(client, system), install, status: snapshot };
}
module.exports = { createInstaller, installationPlan, environment, packages, commandNames, runtimeSupported, preflight, installScripts };
