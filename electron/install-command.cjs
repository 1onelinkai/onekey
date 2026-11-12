const { spawn } = require('node:child_process');

function createInstallCommand(log) {
  return (file, args, { timeout = 900000, idleTimeout = 0, ...options } = {}) => new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    let failure;
    let idle;
    let settled = false;
    const stop = reason => {
      if (failure || settled) return;
      failure = reason;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
        killer.on('error', () => child.kill('SIGKILL'));
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    };
    const touch = () => {
      clearTimeout(idle);
      if (idleTimeout > 0) idle = setTimeout(() => stop(`安装命令连续 ${Math.round(idleTimeout / 1000)} 秒没有输出，已终止`), idleTimeout);
    };
    const timer = setTimeout(() => stop(`安装命令超过 ${Math.round(timeout / 1000)} 秒，已终止`), timeout);
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(idle);
      if (error) reject(error); else resolve(stdout);
    };
    touch();
    child.stdout.on('data', chunk => { touch(); stdout = (stdout + chunk).slice(-8 * 1024 * 1024); log(String(chunk)); });
    child.stderr.on('data', chunk => { touch(); stderr = (stderr + chunk).slice(-4000); log(String(chunk)); });
    child.on('error', error => finish(new Error('无法启动安装命令：' + error.message)));
    child.on('close', code => finish(failure || code !== 0 ? new Error(failure || `安装命令退出（${code}）：${(stderr || stdout).trim().slice(-1200)}`) : null));
  });
}
module.exports = { createInstallCommand };
