const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createKeyStore}=require('./keys.cjs');
test('encrypted keys persist, remain masked and fetch models with stored credentials',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'onelink-keys-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const key=crypto.randomBytes(32);const encryption={isEncryptionAvailable:()=>true,encryptString:text=>{const iv=crypto.randomBytes(16);const cipher=crypto.createCipheriv('aes-256-cbc',key,iv);return Buffer.concat([iv,cipher.update(text),cipher.final()])},decryptString:buf=>{const decipher=crypto.createDecipheriv('aes-256-cbc',key,buf.subarray(0,16));return Buffer.concat([decipher.update(buf.subarray(16)),decipher.final()]).toString()}};
 const fetcher=async(url,options)=>{assert.equal(url,'https://api.example.com/v1/models');assert.equal(options.headers.Authorization,'Bearer sk-real-test-secret');return {ok:true,json:async()=>({data:[{id:'b'},{id:'a'},{id:'a'}]})}};
 const store=createKeyStore({directory,encryption,fetcher});const saved=await store.add({name:'dev',secret:'sk-real-test-secret',org:'个人工作空间',baseURL:'https://api.example.com/v1'});
 assert.equal(saved.secret,undefined);assert.equal(saved.masked,'sk-••••••••cret');assert.ok(!(await fs.readFile(path.join(directory,'keys.enc'))).includes('sk-real-test-secret'));
 const reopened=createKeyStore({directory,encryption,fetcher});assert.equal((await reopened.list('个人工作空间')).length,1);assert.equal((await reopened.list('OneLink 研发团队')).length,0);
 assert.deepEqual((await reopened.models(saved.id)).map(m=>m.id),['a','b']);await reopened.remove(saved.id);assert.equal((await reopened.list()).length,0);await assert.rejects(reopened.get(saved.id),/不存在/);
});
test('key store refuses plaintext fallback when system encryption unavailable',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'onelink-keys-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const store=createKeyStore({directory,encryption:{isEncryptionAvailable:()=>false}});
 await assert.rejects(store.add({name:'dev',secret:'sk-test-secret',org:'个人工作空间',baseURL:'https://api.example.com'}),/加密不可用/);
});
