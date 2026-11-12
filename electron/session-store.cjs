const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createSessionStore(directory) {
  const file = path.join(directory, 'session.local.enc');
  const keyFile = path.join(directory, 'session.local.key');
  function key(create) {
    if (create) {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      try { fs.writeFileSync(keyFile, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    const value = fs.readFileSync(keyFile);
    if (value.length !== 32) throw new Error('本地登录密钥损坏，请重新登录');
    return value;
  }
  return {
    load() {
      let bytes;
      try { bytes = fs.readFileSync(file); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      if (bytes.length < 32 || bytes.subarray(0, 4).toString() !== 'OLS1') throw new Error('本地登录会话损坏，请重新登录');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key(false), bytes.subarray(4, 16));
      decipher.setAAD(Buffer.from('OLS1'));
      decipher.setAuthTag(bytes.subarray(16, 32));
      return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(32)), decipher.final()]).toString('utf8'));
    },
    save(value) {
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key(true), nonce);
      cipher.setAAD(Buffer.from('OLS1'));
      const content = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      const bytes = Buffer.concat([Buffer.from('OLS1'), nonce, cipher.getAuthTag(), content]);
      const tmp = file + '.' + crypto.randomUUID();
      try {
        fs.writeFileSync(tmp, bytes, { mode: 0o600, flag: 'wx' });
        fs.renameSync(tmp, file);
      } finally { fs.rmSync(tmp, { force: true }); }
    },
    clear() { fs.rmSync(file, { force: true }); },
  };
}
module.exports = { createSessionStore };
