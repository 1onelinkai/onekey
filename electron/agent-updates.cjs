const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { packages, commandNames, environment, installationPlan } = require('./installer.cjs');
const { desktops, resolveArtifact } = require('./desktop-installer.cjs');
const { npmRoutes, probeRoutes } = require('./install-environment.cjs');
const semver = require('semver');

function parseVersion(value) {
  const text = String(value || '').trim().replace(/^v/, '');
  return semver.valid(/^\d+\.\d+$/.test(text) ? text + '.0' : text);
}
function compareVersions(a, b) {
  a = parseVersion(a); b = parseVersion(b);
  return a && b ? semver.compare(a, b) : null;
}

function createAgentUpdates({ detect, installer, uninstallPlan, home = os.homedir(), system = environment(), fetcher = fetch }) {
  system = { ...environment(), ...system };
  async function latest(client) {
    if (client === 'deepseek-harness-desktop') throw new Error('DSH 桌面版请使用应用内置更新或原安装渠道；CLI npm 版本不适用于桌面版');
    if (packages[client]) {
      const routes = await probeRoutes(npmRoutes, '/' + encodeURIComponent(packages[client]) + '/latest', text => {
        try { const data = JSON.parse(text); return data.name === packages[client] && !!parseVersion(data.version); } catch { return false; }
      }, fetcher);
      const selected = routes.find(r => r.available && r.name === 'npm 官方') || routes.find(r => r.available);
      if (!selected) throw new Error('官方及国内 npm 镜像均查询失败');
      return { latestVersion: JSON.parse(selected.body).version, source: selected.name };
    }
    if (client === 'grok') {
      for (const base of require('./grok-installer.cjs').sources) {
        try {
          const response = await fetcher(base + '/stable', { signal: AbortSignal.timeout(15000) });
          const version = response.ok && (await response.text()).trim();
          if (parseVersion(version)) return { latestVersion: version, source: 'xAI 官方稳定版' };
        } catch { /* Try the second official endpoint. */ }
      }
      throw new Error('Grok 官方版本线路均不可用');
    }
    let url;
    if (client === 'hermes') url = 'https://api.github.com/repos/NousResearch/hermes-agent/releases/latest';
    else if (desktops[client]) url = client === 'workbuddy'
      ? 'https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-' + system.arch
      : 'https://formulae.brew.sh/api/cask/' + desktops[client].cask + '.json';
    else throw new Error('暂无经过确认的版本查询渠道');
    const response = await fetcher(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('版本查询失败：HTTP ' + response.status);
    const data = await response.json();
    const rawVersion = client === 'hermes' ? data.tag_name?.replace(/^v/, '') : String(data.version || '').split(',')[0];
    const version = client === 'workbuddy' && /^\d+\.\d+\.\d+\.\d+$/.test(rawVersion) ? rawVersion.split('.').slice(0, 3).join('.') : rawVersion;
    if (!parseVersion(version)) throw new Error('官方返回的版本格式无效');
    if (desktops[client]) resolveArtifact(client, { ...data, sha256: data.sha256 || data.sha256hash }, system.arch);
    return { latestVersion: version, releaseVersion: rawVersion, source: client === 'hermes' ? 'GitHub 官方稳定版' : client === 'workbuddy' ? 'WorkBuddy 官方' : 'Homebrew Cask / 官方安装包' };
  }
  async function target(item) {
    if (item.id === 'deepseek-harness-desktop') return { upgradable: false, origin: 'DSH 桌面应用', target: item.bundle, reason: '请使用桌面版内置更新或原安装渠道。' };
    const install = installationPlan(item.id, system);
    if (!install.supported) return { upgradable: false, origin: '当前系统不支持', reason: install.reason };
    const bin = path.join(home, '.onelinkai/managed/bin');
    const ext = system.platform === 'win32' ? '.cmd' : '';
    if (packages[item.id] && [item.id, commandNames[item.id]].filter(Boolean).some(name => item.executable === path.join(bin, name + ext)))
      return { upgradable: true, kind: 'npm', target: item.executable, origin: 'OneLinkAI 托管 npm' };
    if (item.id === 'grok' && item.executable === path.join(bin, system.platform === 'win32' ? 'grok.exe' : 'grok'))
      return { upgradable: true, kind: 'grok', target: item.executable, origin: 'OneLinkAI 托管 Grok' };
    if (item.id === 'opencode' && system.platform !== 'win32' && item.executable === path.join(home, '.opencode/bin/opencode')) {
      try {
        const realHome = await fs.realpath(home);
        if ((await fs.lstat(item.executable)).isFile() && await fs.realpath(item.executable) === path.join(realHome, '.opencode/bin/opencode'))
          return { upgradable: true, kind: 'opencode-native', target: item.executable, origin: 'OpenCode 独立安装' };
      } catch { /* Refuse redirected or incomplete installations. */ }
    }
    if (desktops[item.id] && system.platform === 'darwin' && item.bundle === path.join(home, 'Applications', desktops[item.id].app))
      return { upgradable: true, kind: 'desktop', target: item.bundle, origin: '用户 Applications' };
    if (item.id === 'claude' && system.platform === 'darwin' && item.executable === path.join(home, '.local/bin/claude')) {
      try {
        const resolved = await fs.realpath(item.executable);
        const versions = await fs.realpath(path.join(home, '.local/share/claude/versions'));
        const version = path.basename(resolved);
        if (path.dirname(resolved) === versions && parseVersion(version))
          return { upgradable: true, kind: 'claude-native', target: item.executable, versionPath: resolved, origin: 'Anthropic Claude Code 原生安装器' };
      } catch { /* Do not classify an incomplete or redirected installation as managed. */ }
    }
    if (item.id === 'hermes' && uninstallPlan) {
      const plan = await uninstallPlan(item.id);
      if (plan.kind === 'hermes') return { upgradable: true, kind: 'hermes', target: plan.target, origin: 'Hermes 官方源码安装' };
    }
    return { upgradable: false, target: item.executable || item.bundle, origin: '外部安装', reason: '此安装由其他工具管理，请使用原安装渠道或客户端内置更新。' };
  }
  // Local capability checks never wait for a network version query.
  async function describe(items) {
    return Promise.all(items.map(async item => {
      const install = installationPlan(item.id, system);
      let update;
      if (item.installed) {
        try { update = await target(item); }
        catch { update = { upgradable: false, reason: '安装来源暂未确认，请使用原安装渠道更新。' }; }
      }
      return { ...item, management: {
        installable: install.supported, installReason: install.reason || '', guide: install.guide,
        installLocation: install.location || '',
        ...(update || {}),
      } };
    }));
  }
  async function check(client) {
    const items = (await detect()).filter(item => item.installed && (!client || item.id === client));
    const results = await Promise.all(items.map(async item => {
      const result = { client: item.id, currentVersion: item.version || '', checkedAt: new Date().toISOString() };
      try {
        Object.assign(result, await target(item));
        if (desktops[item.id] && system.platform !== 'darwin') {
          result.status = 'unsupported';
          result.reason = '此平台的桌面应用请使用客户端内置更新或原安装渠道。';
          return result;
        }
        if (item.id === 'deepseek-harness-desktop') { result.status = 'unsupported'; return result; }
        Object.assign(result, await latest(item.id));
        const comparison = compareVersions(result.latestVersion, result.currentVersion);
        result.status = comparison === null ? 'unknown' : comparison > 0 ? 'available' : comparison < 0 ? 'ahead' : 'current';
      } catch (error) { result.status = 'error'; result.error = error.message; }
      return result;
    }));
    if (client && !results.length) throw new Error('未检测到已安装的客户端');
    return client ? results[0] : results;
  }
  async function plan(client) {
    const result = await check(client);
    const supported = result.upgradable && result.status === 'available';
    return { ...result, client, supported, system, steps: ['检查安装来源和目标路径', result.kind === 'opencode-native' ? '调用 OpenCode 官方内置升级器并固定版本' : result.kind === 'claude-native' ? '调用 Claude Code 官方内置更新器' : '查询官方版本与可用下载线路', '执行更新并保留配置和用户数据', '运行命令或读取应用版本，校验升级结果'],
      notice: result.kind === 'hermes' ? '使用 Hermes 官方 update 命令及其恢复机制。请先退出 Hermes 和后台服务，升级期间保持 OneLinkAI 运行。' : result.kind === 'claude-native' ? '通过 Claude Code 自带更新器升级；升级失败时恢复原版本入口。您的设置、会话和插件保持不变。请保持 OneLinkAI 运行直至校验完成。' : '请先退出客户端。升级前保留旧程序，下载或版本验证失败时恢复；配置、会话和共享环境保留。',
      reason: result.error || result.reason || (result.status === 'unknown' ? '未读取到当前版本，无法可靠判断更新。' : result.status === 'ahead' ? '本机版本高于当前稳定版，无需降级。' : '已是最新版本。') };
  }
  async function upgrade(client) {
    const value = await plan(client);
    if (!value.supported) throw new Error(value.reason);
    return installer.install(client, { update: true, expectedTarget: value.target, expectedVersion: value.latestVersion, expectedVersionPath: value.versionPath, kind: value.kind });
  }
  return { describe, check, plan, upgrade };
}
module.exports = { createAgentUpdates, compareVersions, parseVersion };
