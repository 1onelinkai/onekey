const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { ensureWindowsGit, releaseURL } = require('./windows-git-installer.cjs');
async function fixture(t, { arch = 'x64', corrupt = false, extractionFails = false, existing = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onekey-git-install-test-'));
  t.after(() => fs.rm(root, { recursive:true, force:true }));
  const target = path.join(root, 'git');
  const bytes = Buffer.from('official test archive');
  let extracted, published = existing, downloads = 0, executions = 0;
  if (existing) await fs.mkdir(target);
  const normalize = value => path.win32.normalize(value);
  const options = {root,system:{arch},env:{PATH:'C:\\managed'},log:()=>{},state:{},
    fetcher:async url=>{
      downloads++;
      if(url===releaseURL) return {ok:true,json:async()=>({assets:[{name:`PortableGit-2.56.1-${arch==='arm64'?'arm64':'64-bit'}.7z.exe`,digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,browser_download_url:'https://github.com/git-for-windows/git/releases/download/v2.56.1.windows.1/git.exe'}]})};
      return {ok:true,body:[corrupt?Buffer.from('corrupt'):bytes]};
    },
    execute:async(file,args)=>{
      if(file.endsWith('PortableGit.exe')) {
        executions++; if(extractionFails) throw Error('extract failed');
        assert.deepEqual(args.slice(0,2),['-y','-gm2']);
        extracted=args[2].slice('-InstallPath='.length); await fs.mkdir(extracted); return '';
      }
      if(file==='powershell.exe') { await fs.rename(extracted,target);published=true;return ''; }
      const active = published?target:extracted;
      if(active && normalize(file).startsWith(normalize(active)+'\\')) return file.endsWith('bash.exe')?'GNU bash, version 5.2':'git version 2.56.1';
      throw Error('missing');
    }};
  return {options,target,root,stats:()=>({downloads,executions})};
}
for(const arch of ['x64','arm64']) test('downloads, verifies, installs and reuses managed Git on '+arch,async t=>{
  const f=await fixture(t,{arch});
  const env=await ensureWindowsGit(f.options);
  assert.equal(env.CLAUDE_CODE_GIT_BASH_PATH,path.win32.join(f.target,'bin','bash.exe'));
  assert.equal(f.stats().downloads,2);
  await ensureWindowsGit(f.options);assert.equal(f.stats().downloads,2);
  assert.deepEqual(await fs.readdir(f.root),['git']);
});
test('reuses existing working Git without network',async t=>{
 const f=await fixture(t,{existing:true});await ensureWindowsGit(f.options);assert.equal(f.stats().downloads,0);
});
for(const failure of ['corrupt','extractionFails']) test('failed '+failure+' leaves no installed Git or temporary files',async t=>{
 const f=await fixture(t,{[failure]:true});await assert.rejects(ensureWindowsGit(f.options),/Git for Windows 自动安装失败/);
 assert.deepEqual(await fs.readdir(f.root),[]);if(failure==='corrupt') assert.equal(f.stats().executions,0);
});
test('rejects unofficial download URLs before executing',async t=>{
 const f=await fixture(t);f.options.fetcher=async()=>({ok:true,json:async()=>({assets:[{name:'PortableGit-2.56.1-64-bit.7z.exe',digest:'sha256:'+'a'.repeat(64),browser_download_url:'https://example.com/git.exe'}]})});
 await assert.rejects(ensureWindowsGit(f.options),/安装包信息/);assert.equal(f.stats().executions,0);assert.deepEqual(await fs.readdir(f.root),[]);
});
