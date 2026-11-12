const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createMacStorage, migrateFile } = require('./credential-storage.cjs');
const { createLocalProviderStore } = require('./local-providers.cjs');
function fixture() {
  const items = new Map(); let disabled = false;
  const keychain = { disableUI() { disabled = true; }, read(s,a) { assert.ok(disabled); return items.get(s+'|'+a) ?? null; }, add(s,a,b) { assert.ok(disabled); if (!items.has(s+'|'+a)) items.set(s+'|'+a,b); } };
  return { items, keychain, storage: createMacStorage({ keychain }) };
}
function legacy(text, password) {
  const cipher = crypto.createCipheriv('aes-128-cbc', crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1'), Buffer.alloc(16,32));
  return Buffer.concat([Buffer.from('v10'), cipher.update(text), cipher.final()]);
}
test('credentials survive restart, use independent nonces and reject tampering/wrong keys', () => {
  const f = fixture(); const encrypted = f.storage.encryptString('secret-token');
  assert.ok(!encrypted.includes('secret-token'));
  assert.notDeepEqual(encrypted, f.storage.encryptString('secret-token'));
  assert.equal(createMacStorage({ keychain: f.keychain }).decryptString(encrypted), 'secret-token');
  const tampered = Buffer.from(encrypted); tampered[20] ^= 1;
  assert.throws(() => f.storage.decryptString(tampered));
  assert.throws(() => fixture().storage.decryptString(encrypted));
  assert.throws(() => f.storage.decryptString(Buffer.from('OLK1')));
});
test('locked/denied keychain fails closed without calling an interactive fallback', () => {
  const storage = createMacStorage({ keychain: { disableUI() {}, read() { throw new Error('denied'); }, add() { assert.fail('must not replace inaccessible key'); } } });
  assert.throws(() => storage.encryptString('secret'), /denied/);
});
test('legacy provider migration handles nested credentials, preserves original and survives restart', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-storage-')); t.after(() => fs.rm(directory, {recursive:true,force:true}));
  const file = path.join(directory,'providers.enc'); const f = fixture(); const password = Buffer.from('legacy-key');
  f.items.set('onelink-desktop-demo Safe Storage|onelink-desktop-demo Key', password);
  const raw = legacy(JSON.stringify({ providers:[{id:'p',name:'test',models:[],apiKey:legacy('sk-provider-secret',password).toString('base64')}],defaultModel:null }),password);
  await fs.writeFile(file,raw);
  await migrateFile(file,f.storage,{providers:true});
  const storage = createMacStorage({keychain:f.keychain});
  const store = createLocalProviderStore({file,encryption:{encrypt:storage.encryptString,decrypt:storage.decryptString}});
  assert.equal((await store.getCredential('p')).apiKey,'sk-provider-secret');
  const names = await fs.readdir(directory); assert.equal(names.length,2);
  assert.deepEqual(await fs.readFile(path.join(directory,names.find(n=>n.includes('.legacy-')))),raw);
  assert.equal(await migrateFile(file,storage,{providers:true}),null);
  assert.ok(!(await fs.readFile(file)).includes('sk-provider-secret'));
});
test('unreadable legacy data is archived intact so new login can save without password prompt',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'onelink-legacy-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const file=path.join(directory,'session.enc'); const raw=legacy('{"accessToken":"old"}',Buffer.from('unavailable'));
  await fs.writeFile(file,raw); const f=fixture();
  assert.match(await migrateFile(file,f.storage),/重新登录/);
  const names=await fs.readdir(directory);assert.equal(names.length,1);assert.ok(names[0].includes('.legacy-'));
  assert.deepEqual(await fs.readFile(path.join(directory,names[0])),raw);
  assert.equal(f.storage.decryptString(f.storage.encryptString('new-login')),'new-login');
});
test('corrupt and new-format files are preserved rather than reset',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'onelink-corrupt-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const file=path.join(directory,'session.enc');const f=fixture();const raw=Buffer.from('invalid');await fs.writeFile(file,raw);
  await assert.rejects(migrateFile(file,f.storage));assert.deepEqual(await fs.readFile(file),raw);
  const encrypted=f.storage.encryptString('saved');await fs.writeFile(file,encrypted);assert.equal(await migrateFile(file,f.storage),null);assert.deepEqual(await fs.readFile(file),encrypted);
});
test('recovery backups remain encrypted and readable after restart', () => {
  const { macCredentials } = require('./credentials.cjs');
  const f = fixture();
  const restarted = createMacStorage({ keychain: f.keychain });
  const backup = macCredentials(f.storage).encrypt('{"secret":"backup-secret"}');
  assert.ok(!backup.includes('backup-secret'));
  assert.equal(macCredentials(restarted).decrypt(backup), '{"secret":"backup-secret"}');
});
