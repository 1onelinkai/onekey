const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const { runAuthorized } = require('./uninstall-authorization.cjs');
const { packages, commandNames } = require('./installer.cjs');
function createUninstaller({ detect, execute, trashItem, home = os.homedir(), platform = process.platform }) {
  const root = path.join(home, '.onelinkai/managed');
  const bin = path.join(root, 'bin');
  const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
  async function writable(paths) {
    try { for (const file of paths) await fs.access(file, fs.constants.W_OK); return true; }
    catch { return false; }
  }
  async function windowsNpmTarget(item) {
    const packageName = packages[item.id];
    if (!packageName || !/\.cmd$/i.test(item.executable || '')) return null;
    try {
      const prefix = path.dirname(item.executable);
      const module = path.join(prefix, 'node_modules', packageName);
      const manifest = JSON.parse(await fs.readFile(path.join(module, 'package.json'), 'utf8'));
      const command = path.basename(item.executable).replace(/\.cmd$/i, '');
      const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[command];
      if (manifest.name !== packageName || typeof entry !== 'string') return null;
      const realModule = await fs.realpath(module);
      const executable = await fs.realpath(path.resolve(module, entry));
      if (!executable.startsWith(realModule + path.sep)) return null;
      const shim = (await fs.readFile(item.executable, 'utf8')).replaceAll('\\', '/').toLowerCase();
      const relativeEntry = path.relative(prefix, path.resolve(module, entry)).replaceAll('\\', '/').toLowerCase();
      if (!shim.includes(relativeEntry)) return null;
      const nodes = [path.join(prefix, 'node.exe')];
      try {
        const result = await execute('where.exe', ['node.exe'], { timeout: 10000, windowsHide: true });
        const output = typeof result === 'string' ? result : result.stdout;
        nodes.push(...String(output || '').trim().split(/\r?\n/).filter(value => path.isAbsolute(value)));
      } catch { /* Check the colocated runtime. */ }
      for (const node of nodes) {
        const candidates = [path.join(prefix, 'node_modules/npm'), path.join(path.dirname(node), 'node_modules/npm')];
        for (const npmRoot of new Set(candidates)) {
          try {
            await fs.access(node);
            const npmManifest = JSON.parse(await fs.readFile(path.join(npmRoot, 'package.json'), 'utf8'));
            if (npmManifest.name !== 'npm') continue;
            const npm = path.join(npmRoot, 'bin/npm-cli.js');
            await fs.access(npm);
            return { supported: true, client: item.id, kind: 'external-npm', target: item.executable,
              executable: await fs.realpath(item.executable), manager: node,
              args: [npm, 'uninstall', '--global', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', packageName],
              source: 'npm · ' + packageName,
              notice: '使用 npm 卸载此客户端，保留配置、会话、项目和共享 Node.js。请先退出客户端及后台服务；安装目录需要管理员权限时会弹出 Windows 系统授权窗口，授权后继续卸载。' };
          } catch { /* Try the runtime associated with the installed npm. */ }
        }
      }
    } catch { /* Unknown shims are handled through Windows application management. */ }
    return null;
  }
  async function externalTarget(item) {
    if (platform === 'win32') return windowsNpmTarget(item);
    if (!item.executable) return null;
    const packageName = packages[item.id];
    try {
      const executable = await fs.realpath(item.executable);
      if (item.id === 'opencode' && item.executable === path.join(home, '.opencode/bin/opencode')) {
        const realHome = await fs.realpath(home);
        if (executable === path.join(realHome, '.opencode/bin/opencode') && (await fs.lstat(item.executable)).isFile()) {
          return { supported: true, client: item.id, kind: 'native-file', target: item.executable,
            source: 'OpenCode 独立安装',
            notice: '将 OpenCode 独立程序移到废纸篓，保留配置、会话、项目和其他用户数据。请先退出 OpenCode。' };
        }
      }
      // A Homebrew receipt establishes ownership; never remove Cellar files directly.
      const match = executable.match(/^(.*)\/Cellar\/([^/]+)\/([^/]+)\//);
      if (match) {
        const [, prefix, formula, version] = match;
        if (!/^[\w@.+-]+$/.test(formula)) return null;
        await fs.access(path.join(prefix, 'Cellar', formula, version, 'INSTALL_RECEIPT.json'));
        const brew = path.join(prefix, 'bin/brew');
        await fs.access(brew, fs.constants.X_OK);
        const canWrite = await writable([path.join(prefix, 'Cellar', formula), path.dirname(item.executable)]);
        return { supported: canWrite, client: item.id, kind: 'brew', target: item.executable,
          executable, manager: brew, args: ['uninstall', formula], source: 'Homebrew · ' + formula,
          command: quote(brew) + ' uninstall ' + quote(formula),
          notice: '通过 Homebrew 卸载此客户端，保留用户配置和会话。' + (canWrite ? '请先退出客户端及后台服务。' : '当前目录不可写，请在终端以安装此软件的用户执行下方命令。') };
      }
      if (packageName) { try {
        const prefix = path.dirname(path.dirname(item.executable));
        const module = path.join(prefix, 'lib/node_modules', packageName);
        const manifest = JSON.parse(await fs.readFile(path.join(module, 'package.json'), 'utf8'));
        const name = path.basename(item.executable);
        const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[name];
        if (manifest.name === packageName && typeof entry === 'string' &&
            await fs.realpath(path.resolve(module, entry)) === executable &&
            executable.startsWith(await fs.realpath(module) + path.sep)) {
          const node = path.join(prefix, 'bin/node');
          const npm = path.join(prefix, 'lib/node_modules/npm/bin/npm-cli.js');
          await fs.access(node, fs.constants.X_OK);
          await fs.access(npm);
          const args = [npm, 'uninstall', '--global', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', packageName];
          const canWrite = await writable([path.dirname(module), module, path.dirname(item.executable)]);
          const command = [node, ...args].map(quote).join(' ');
          return { supported: canWrite || platform === 'darwin', requiresAuthorization: !canWrite && platform === 'darwin', client: item.id, kind: 'external-npm', target: item.executable,
            executable, manager: node, args, source: 'npm · ' + packageName,
            command: (canWrite ? '' : 'sudo ') + command,
            notice: '通过原安装目录的 npm 卸载 ' + packageName + '，保留配置、会话和共享 Node.js。' +
              (canWrite ? '请先退出客户端及后台服务。' : (platform === 'darwin' ? '点击确认卸载后将弹出 macOS 系统授权窗口，授权后自动完成卸载。' : '此安装目录需要管理员权限。')) };
        }
      } catch { /* Not an npm installation; check native ownership next. */ } }
      if (item.id === 'claude' && item.executable === path.join(home, '.local/bin/claude')) {
        const versions = path.join(home, '.local/share/claude/versions');
        const realHome = await fs.realpath(home);
        if (await fs.realpath(path.dirname(versions)) === path.join(realHome, '.local/share/claude') &&
            await fs.realpath(versions) === path.join(realHome, '.local/share/claude/versions') &&
            path.dirname(executable) === await fs.realpath(versions) && /^\d+\.\d+\.\d+[\w.-]*$/.test(path.basename(executable))) {
          return { supported: true, client: item.id, kind: 'native', target: item.executable,
            executable, source: 'Claude 官方独立安装', program: path.dirname(versions),
            notice: '将 Claude 独立程序目录移到废纸篓，并移除命令入口。保留 ~/.claude 的配置和会话，请先退出 Claude Code。' };
        }
      }
    } catch { /* Unknown ownership must not turn into a recursive delete. */ }
    return null;
  }
  async function hermesTarget(item) {
    if (platform === 'win32' || item.executable !== path.join(home, '.local/bin/hermes')) return null;
    const source = path.join(home, '.hermes/hermes-agent');
    const launcher = path.join(source, '.hermes/bin/hermes');
    try {
      // Refuse redirected trees and launchers belonging to another installation.
      const realHome = await fs.realpath(home);
      if (await fs.realpath(source) !== path.join(realHome, '.hermes/hermes-agent') || !(await fs.stat(launcher)).isFile()) return null;
      if (await fs.realpath(launcher) !== path.join(realHome, '.hermes/hermes-agent/.hermes/bin/hermes')) return null;
      const entry = await fs.lstat(item.executable);
      const matches = entry.isSymbolicLink()
        ? await fs.realpath(item.executable) === await fs.realpath(launcher)
        : (await fs.readFile(item.executable, 'utf8')).trim() === '#!/bin/sh\nexec ' + launcher + ' "$@"';
      if (!matches) return null;
      const gitConfig = await fs.readFile(path.join(source, '.git/config'), 'utf8');
      if (!/NousResearch\/hermes-agent(?:\.git)?(?:[\s"/]|$)/i.test(gitConfig)) return null;
      return source;
    } catch { return null; }
  }
  async function plan(client) {
    const item = (await detect()).find(item => item.id === client);
    return describe(item, client);
  }
  async function describe(item, client = item?.id) {
    if (!item?.installed) throw new Error('未检测到已安装的客户端');
    if (client === 'hermes') {
      const source = await hermesTarget(item);
      if (source) return {
        supported: true, client, kind: 'hermes', target: item.executable, source,
        notice: '移除 Hermes 命令入口，将源码和程序环境移到废纸篓。保留 ~/.hermes 中的 API 配置、会话、技能及其他用户数据，也保留共享运行环境和 PATH。请先退出 Hermes 及其后台服务。',
      };
    }
    if (client === 'grok' && item.executable === path.join(bin, platform === 'win32' ? 'grok.exe' : 'grok')) {
      const realHome = await fs.realpath(home);
      if ((await fs.lstat(item.executable)).isFile() && await fs.realpath(item.executable) === path.join(realHome, '.onelinkai/managed/bin', platform === 'win32' ? 'grok.exe' : 'grok')) return {
        supported: true, client, kind: 'native-file', target: item.executable,
        notice: '将 OneLinkAI 安装的 Grok Build 程序移到废纸篓，保留配置、登录信息和会话。请先退出 Grok。',
      };
    }
    const shim = path.join(bin, client + (platform === 'win32' ? '.cmd' : ''));
    const alias = path.join(bin, (commandNames[client] || client) + (platform === 'win32' ? '.cmd' : ''));
    if (packages[client] && [shim, alias].includes(item.executable)) return {
      supported: true, client, kind: 'managed', target: shim,
      notice: '卸载 OneLinkAI 管理的客户端程序和命令入口。保留配置、会话、项目及共享 Node 环境；共享 PATH 保留供其他客户端使用。请先退出该客户端。',
    };
    if (platform === 'darwin' && item.bundle &&
      [path.join(home, 'Applications'), '/Applications'].includes(path.dirname(item.bundle)) && item.bundle.endsWith('.app')) return {
      supported: true, client, kind: 'app', target: item.bundle,
      notice: '将应用移到废纸篓，保留配置、会话和项目。请先退出该应用；恢复时可从废纸篓取回。',
    };
    const external = await externalTarget(item);
    if (external) return external;
    if (platform === 'win32') return { supported: true, client, kind: 'system-settings', target: item.executable || item.bundle,
      source: 'Windows 外部安装',
      notice: '打开 Windows“已安装的应用”，搜索此客户端并使用系统卸载入口。npm 命令未能确认安装来源时，请使用原包管理器卸载。' };
    return { supported: false, client, target: item.executable || item.bundle,
      notice: '该客户端由外部安装工具管理，暂不能可靠自动卸载。请使用原安装工具或系统应用管理卸载；不会直接删除未知来源的程序。' };
  }
  async function uninstall({ client, target }) {
    const current = await plan(client);
    if (!current.supported) throw new Error(current.notice);
    if (target !== current.target) throw new Error('安装位置已变化，请重新打开卸载窗口');
    if (current.kind === 'system-settings') {
      await execute('explorer.exe', ['ms-settings:appsfeatures'], { timeout: 15000, windowsHide: true });
      return { removed: false, remaining: true, message: '已打开 Windows 应用管理，请搜索客户端并完成卸载' };
    }
    if (current.kind === 'external-npm' || current.kind === 'brew') {
      try {
        const options = { timeout: 120000, windowsHide: true,
          env: { ...process.env, PATH: [path.dirname(current.manager), process.env.PATH || ''].join(path.delimiter) } };
        if (current.requiresAuthorization) await runAuthorized(execute, current.manager, current.args, platform);
        else {
          try { await execute(current.manager, current.args, options); }
          catch (error) {
            if (!['darwin', 'win32'].includes(platform) || current.kind !== 'external-npm' || !/EACCES|EPERM|permission denied/i.test([error.code, error.message, error.stderr].join(' '))) throw error;
            await runAuthorized(execute, current.manager, current.args, platform);
          }
        }
      } catch (error) {
        throw new Error(/-128|cancell?ed|用户取消/i.test([error.message, error.stderr].join(' '))
          ? '已取消系统授权，尚未完成卸载。可再次点击确认卸载。'
          : '卸载失败：' + (error.stderr || error.message || '请重试'));
      }
      try {
        if (await fs.realpath(current.target) === current.executable) throw new Error('客户端命令仍存在，卸载尚未完成');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    } else if (current.kind === 'native') {
      await trashItem(current.program);
      await fs.unlink(current.target);
    } else if (current.kind === 'hermes') {
      await trashItem(current.source);
      await fs.unlink(current.target);
    } else if (current.kind === 'app' || current.kind === 'native-file') await trashItem(current.target);
    else {
      const runtime = path.join(root, 'runtime');
      const node = path.join(runtime, platform === 'win32' ? 'node.exe' : 'bin/node');
      const npm = path.join(runtime, platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js');
      await execute(node, [npm, 'uninstall', '--global', '--prefix', path.join(root, 'clients'), '--ignore-scripts', '--no-audit', '--no-fund', packages[client]], {
        timeout: 120000, env: { ...process.env, PATH: [path.dirname(node), process.env.PATH || ''].join(path.delimiter) },
      });
      await fs.rm(current.target, { force: true });
      await fs.rm(path.join(bin, client + (platform === 'win32' ? '.cmd' : '')), { force: true });
      if (commandNames[client]) await fs.rm(path.join(bin, commandNames[client] + (platform === 'win32' ? '.cmd' : '')), { force: true });
    }
    if (!['external-npm', 'brew'].includes(current.kind)) {
      try {
        await fs.lstat(current.target);
        throw new Error('程序或命令入口仍存在，卸载尚未完成，请重试');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const remaining = (await detect()).find(item => item.id === client && item.installed);
    return { removed: true, remaining: !!remaining, message: remaining ? '已移除所选安装，但本机仍检测到另一份客户端' : '已卸载客户端，配置和数据已保留' };
  }
  return { plan, describe, uninstall };
}
module.exports = { createUninstaller };
