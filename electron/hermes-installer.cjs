const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { probeRoutes, configurePath } = require('./install-environment.cjs');

const HERMES_REPOSITORIES = [
  { name: 'GitHub 官方', url: 'https://github.com/NousResearch/hermes-agent.git' },
  { name: 'GitClone 国内代理', url: 'https://gitclone.com/github.com/NousResearch/hermes-agent.git' },
  { name: 'GHProxy 代理', url: 'https://gh-proxy.com/https://github.com/NousResearch/hermes-agent.git' },
  { name: 'GHFast 代理', url: 'https://ghfast.top/https://github.com/NousResearch/hermes-agent.git' },
  { name: 'GitMirror 代理', url: 'https://mirror.ghproxy.com/https://github.com/NousResearch/hermes-agent.git' },
];
const HERMES_SCRIPT_ROUTES = [
  { name: 'GitHub Raw', url: (sha) => `https://raw.githubusercontent.com/NousResearch/hermes-agent/${sha}/scripts/` },
  { name: 'jsDelivr CDN', url: (sha) => `https://cdn.jsdelivr.net/gh/NousResearch/hermes-agent@${sha}/scripts/` },
  { name: 'GHFast Raw', url: (sha) => `https://ghfast.top/https://raw.githubusercontent.com/NousResearch/hermes-agent/${sha}/scripts/` },
  { name: 'GitMirror Raw', url: (sha) => `https://raw.gitmirror.com/NousResearch/hermes-agent/${sha}/scripts/` },
];

async function installHermes({ home, root, system, execute, fetcher, log, state, detect }) {
  state.phase = 'network';
  log('探测 Hermes 源码仓库线路…');
  const repoRoutes = [];
  let sha = '';
  for (const route of HERMES_REPOSITORIES) {
    try {
      const output = await execute('git', ['ls-remote', route.url, 'refs/heads/main'], { timeout: 15000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      const candidate = String(output).trim().split(/\s+/)[0];
      if (!/^[a-f0-9]{40}$/.test(candidate)) throw new Error('未返回有效提交');
      repoRoutes.push({ ...route, available: true, latency: 0, sha: candidate });
      if (!sha) sha = candidate;
    } catch (error) {
      repoRoutes.push({ ...route, available: false, error: error.message });
    }
  }
  state.routes = { repositories: repoRoutes.map(({ sha: _sha, ...route }) => route) };
  for (const route of repoRoutes) log(route.name + '：' + (route.available ? '可用' : '不可用'));
  const selectedRepo = repoRoutes.find(route => route.available && route.sha === sha);
  if (!selectedRepo || !sha) throw new Error('所有 Hermes 源码线路均不可用，请检查网络后重试');
  log('源码线路：' + selectedRepo.name);
  /* The API is only an optional confirmation. A reachable git mirror is enough
     to determine and later pin the commit when api.github.com is blocked. */
  const release = await fetcher('https://api.github.com/repos/NousResearch/hermes-agent/commits/' + sha, {
    headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (release?.ok) {
    const data = await release.json();
    if (data?.sha === sha) log('官方提交校验通过');
  }
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Hermes 官方版本响应无效');
  const filename = system.platform === 'win32' ? 'install.ps1' : 'install.sh';
  const routes = await probeRoutes(HERMES_SCRIPT_ROUTES.map(route => ({ name: route.name, url: route.url(sha) })), filename, body => body.includes('stage') && body.includes('Hermes') && body.length > 1000, fetcher);
  state.routes.scripts = routes.map(({ body, ...route }) => route);
  for (const route of routes) log(route.name + '：' + (route.available ? route.latency + 'ms' : '不可用'));
  const available = routes.filter(route => route.available);
  if (!available.length) throw new Error('Hermes 安装脚本下载线路均不可用');
  const official = available.find(route => route.name === 'GitHub Raw');
  const selected = available.find(route => !official || route.body === official.body);
  if (!selected) throw new Error('Hermes 安装脚本内容校验失败');
  log('固定源码版本：' + sha);
  log('脚本下载线路：' + selected.name + '；SHA-256：' + crypto.createHash('sha256').update(selected.body).digest('hex'));
  const staging = await fs.mkdtemp(path.join(root, 'hermes-install-'));
  const hermesHome = system.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData/Local'), 'hermes')
    : path.join(home, '.hermes');
  const source = path.join(hermesHome, 'hermes-agent');
  const npmCache = path.join(root, 'hermes-npm-cache');
  await fs.mkdir(npmCache, { recursive: true, mode: 0o700 });
  const env = { ...process.env, HOME: home, HERMES_HOME: hermesHome, HERMES_INSTALL_VERBOSE: '1', NO_COLOR: '1', CI: '1',
    npm_config_cache: npmCache, NPM_CONFIG_CACHE: npmCache,
    HERMES_REPO_URL: selectedRepo.url,
    UV_INDEX_URL: 'https://pypi.tuna.tsinghua.edu.cn/simple',
    PIP_INDEX_URL: 'https://pypi.tuna.tsinghua.edu.cn/simple',
    PIP_DEFAULT_TIMEOUT: '30',
    PATH: [path.join(home, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].join(path.delimiter) };
  try {
    log('Hermes 使用独立 npm 缓存：' + npmCache);
    const script = path.join(staging, filename);
    await fs.writeFile(script, selected.body, { mode: 0o700 });
    const windows = system.platform === 'win32';
    const command = windows ? 'powershell.exe' : '/bin/bash';
    const optional = windows
      ? ['SkipBrowser', 'SkipComputerUse'].filter(name => new RegExp(`\\$${name}\\b`, 'i').test(selected.body)).map(name => '-' + name)
      : ['--skip-browser', '--skip-computer-use', '--verbose'].filter(flag => selected.body.includes(flag));
    const args = windows
      ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Commit', sha, '-HermesHome', hermesHome, '-InstallDir', source, '-NonInteractive', ...optional]
      : [script, '--commit', sha, '--dir', source, '--hermes-home', hermesHome, '--non-interactive', ...optional];
    log('检查官方安装参数和阶段协议…');
    const manifest = JSON.parse(await execute(command, [...args, windows ? '-Manifest' : '--manifest'], { env, timeout: 30000 }));
    if (manifest.protocol_version !== 1 || !Array.isArray(manifest.stages)) throw new Error('Hermes 官方安装协议发生变化');
    for (const stage of manifest.stages) {
      if (stage.needs_user_input) { log('由 OneLinkAI 接管配置，跳过：' + stage.name); continue; }
      if (!/^[a-z-]+$/.test(stage.name)) throw new Error('安装阶段无效');
      state.phase = 'hermes-' + stage.name;
      log('执行 Hermes 安装阶段：' + stage.name);
      const stageTimeout = stage.name === 'repository' ? 6 * 60 * 1000 : 30 * 60 * 1000;
      if (stage.name === 'repository') {
        let completed = false;
        for (const route of repoRoutes.filter(route => route.available && route.sha === sha)) {
          state.routes.repositories = state.routes.repositories.map(item => ({ ...item, selected: item.url === route.url }));
          // Git's per-process URL rewrite covers official scripts that hardcode GitHub.
          const configFile = path.join(staging, 'git-route.config');
          const quote = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
          const oldSources = [...HERMES_REPOSITORIES.map(item => item.url), 'git@github.com:NousResearch/hermes-agent.git'].filter(url => url !== route.url);
          await fs.writeFile(configFile, `[url ${quote(route.url)}]\n${oldSources.map(url => '\tinsteadOf = ' + quote(url)).join('\n')}\n[http]\n\tlowSpeedLimit = 1024\n\tlowSpeedTime = 60\n`, { mode: 0o600 });
          const routeEnv = { ...env, HERMES_REPO_URL: route.url, GIT_CONFIG_GLOBAL: configFile, GIT_TERMINAL_PROMPT: '0' };
          try {
            log('下载源码：' + route.name);
            await execute(command, [...args, windows ? '-Stage' : '--stage', stage.name], { env: routeEnv, timeout: stageTimeout });
            completed = true;
            break;
          } catch (error) { log(route.name + ' 失败，切换下一条源码线路：' + error.message); }
        }
        if (!completed) throw new Error('所有 Hermes 源码线路安装失败，请查看阶段日志');
      } else {
        await execute(command, [...args, windows ? '-Stage' : '--stage', stage.name], { env, timeout: stageTimeout, idleTimeout: 0 });
      }
    }
    state.phase = 'verifying';
    const bin = windows ? path.join(hermesHome, 'bin') : path.join(home, '.local/bin');
    await configurePath({ home, bin, platform: system.platform, execute, log });
    let version;
    if (windows) {
      const quote = value => "'" + value.replaceAll("'", "''") + "'";
      const script = `$ErrorActionPreference='Stop'; $env:Path=${quote(bin + ';')}+$env:Path; & hermes --version; if ($LASTEXITCODE -ne 0) { throw 'Hermes verification failed' }`;
      version = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, timeout: 120000 });
    } else version = await execute(path.join(bin, 'hermes'), ['--version'], { env, timeout: 120000 });
    if (!/\d+\.\d+/.test(version)) throw new Error('Hermes 安装已执行，但版本运行检查失败');
    log('Hermes 运行验证通过：' + version.trim());
    state.detected = (await detect()).find(item => item.id === 'hermes' && item.installed);
    if (!state.detected) throw new Error('Hermes 命令运行成功，但本机检测未通过');
    log('Hermes 安装和 PATH 配置完成，可以继续配置模型');
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}
module.exports = { installHermes };
