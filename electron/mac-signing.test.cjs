const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

test('mac signing passes a functional resource filter and preserves the runtime credential identity', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-signing-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const app = path.join(directory, 'OneLinkAI.app'); await fs.mkdir(app);
  const resource = path.join(directory, 'locale.pak'); await fs.writeFile(resource, Buffer.from([5,0,0,0,0,1,2]));
  const runtime = path.join(directory, 'OneLinkAI Runtime'); await fs.writeFile(runtime, Buffer.from('cffaedfe00000000','hex'));
  const ignored = path.join(directory, 'ignored.node'); await fs.writeFile(ignored, Buffer.from('cffaedfe00000000','hex'));
  let actual;
  const module = { exports: {} };
  const script = fsSync.readFileSync(path.join(__dirname, '../scripts/sign-mac-app.cjs'), 'utf8');
  vm.runInNewContext(script, { module, exports: module.exports, __dirname: path.resolve(__dirname,'../scripts'), Buffer, require: name => name === '@electron/osx-sign' ? { signAsync: async options => { actual = options; } } : require(name) });
  await module.exports({ app, ignore: file => file === ignored, optionsForFile: () => ({ entitlements:'runtime.plist', hardenedRuntime:true }) });
  // @electron/osx-sign normalizes a single function; an array is dropped by the installed version.
  assert.equal(typeof actual.ignore, 'function');
  assert.equal(actual.ignore(resource), true);
  assert.equal(actual.ignore(runtime), false);
  assert.equal(actual.ignore(app), false);
  assert.equal(actual.ignore(ignored), true);
  assert.deepEqual(Array.from(actual.optionsForFile(runtime).additionalArguments), ['--identifier','cloud.onelinkai.desktop']);
  assert.equal(actual.optionsForFile(runtime).entitlements, 'runtime.plist');
  assert.match(actual.optionsForFile(app).entitlements, /entitlements\.launcher\.mac\.plist$/);
});
