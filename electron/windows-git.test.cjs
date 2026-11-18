const { test } = require('node:test');
const assert = require('node:assert/strict');
const { windowsGitEnvironment } = require('./windows-git.cjs');
test('finds Git Bash installed outside a stale Explorer PATH and preserves managed tools', async () => {
  const result = await windowsGitEnvironment({ Path: 'C:\\managed', LOCALAPPDATA: 'C:\\Users\\Test' }, async (file, args, options) => {
    if (!file.startsWith('C:\\Users\\Test\\Programs\\Git\\')) throw Error('missing');
    assert.match(options.env.PATH, /C:\\managed/);
    return file.endsWith('bash.exe') ? 'GNU bash, version 5.2' : 'git version 2.50';
  });
  assert.equal(result.CLAUDE_CODE_GIT_BASH_PATH, 'C:\\Users\\Test\\Programs\\Git\\bin\\bash.exe');
  assert.equal(result.Path, undefined);
});
test('uses custom Git location discovered by --exec-path', async () => {
  const result = await windowsGitEnvironment({ PATH: 'D:\\Tools\\Git\\cmd' }, async file => {
    if (file === 'git.exe') return 'D:/Tools/Git/mingw64/libexec/git-core\n';
    if (!file.startsWith('D:\\Tools\\Git\\')) throw Error('missing');
    return file.endsWith('bash.exe') ? 'GNU bash' : 'git version 2.50';
  });
  assert.equal(result.CLAUDE_CODE_GIT_BASH_PATH, 'D:\\Tools\\Git\\bin\\bash.exe');
});
test('requires working Bash even when git is available', async () => {
  await assert.rejects(windowsGitEnvironment({}, async file => {
    if (file.endsWith('bash.exe')) throw Error('missing Bash');
    return file === 'git.exe' ? 'C:/Program Files/Git/mingw64/libexec/git-core' : 'git version 2.50';
  }), /Git for Windows.*Git Bash/);
});
