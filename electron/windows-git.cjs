const path = require('node:path').win32;

async function windowsGitEnvironment(env, execute, extraRoots = []) {
  const read = name => Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  const roots = [
    ...extraRoots,
    read('CLAUDE_CODE_GIT_BASH_PATH') && path.dirname(path.dirname(read('CLAUDE_CODE_GIT_BASH_PATH'))),
    read('ProgramW6432') && path.join(read('ProgramW6432'), 'Git'),
    read('ProgramFiles') && path.join(read('ProgramFiles'), 'Git'),
    read('ProgramFiles(x86)') && path.join(read('ProgramFiles(x86)'), 'Git'),
    read('LOCALAPPDATA') && path.join(read('LOCALAPPDATA'), 'Programs', 'Git'),
    'C:\\Program Files\\Git',
  ].filter(Boolean);
  try {
    const execPath = (await execute('git.exe', ['--exec-path'], { env, timeout: 10000 })).trim();
    if (path.isAbsolute(execPath)) roots.unshift(path.resolve(execPath, '../../..'));
  } catch { /* Explorer can retain an old PATH after Git was installed. */ }
  for (const root of new Set(roots)) {
    for (const folder of ['bin', 'usr\\bin']) {
      const bash = path.join(root, folder, 'bash.exe');
      const candidate = Object.fromEntries(Object.entries(env).filter(([key]) => !['path', 'claude_code_git_bash_path'].includes(key.toLowerCase())));
      candidate.PATH = [path.join(root, 'cmd'), path.join(root, 'bin'), read('PATH') || ''].join(';');
      candidate.CLAUDE_CODE_GIT_BASH_PATH = bash;
      try {
        const git = await execute(path.join(root, 'cmd', 'git.exe'), ['--version'], { env: candidate, timeout: 10000 });
        const version = await execute(bash, ['--version'], { env: candidate, timeout: 10000 });
        if (/git version/i.test(git) && /GNU bash/i.test(version)) return candidate;
      } catch { /* Try the next supported Git for Windows layout. */ }
    }
  }
  throw new Error('缺少可用的 Git for Windows（含 Git Bash）。请点击“下载 Git for Windows”完成安装后重试；已安装的用户请确认包含 Git Bash。');
}
module.exports = { windowsGitEnvironment };
