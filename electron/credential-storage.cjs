const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const MAGIC = Buffer.from('OLK1');
const SERVICE = 'cloud.onelinkai.desktop.credentials.v1';
const ACCOUNT = 'encryption-key';

function createMacStorage({ keychain, service = SERVICE }) {
  keychain.disableUI();
  let key;
  let legacyKey;
  function currentKey() {
    if (key) return key;
    let value;
    try {
      value = keychain.read(service, ACCOUNT);
      if (value === null) {
        keychain.add(service, ACCOUNT, crypto.randomBytes(32));
        value = keychain.read(service, ACCOUNT);
      }
    } catch (cause) {
      if (!['KEYCHAIN_ACCESS_DENIED', 'KEYCHAIN_UNAVAILABLE'].includes(cause.code)) throw cause;
      throw Object.assign(new Error('macOS 钥匙串暂时无法访问，请解锁登录钥匙串，或使用已授权的应用版本后重试'), { code: cause.code, cause });
    }
    if (!Buffer.isBuffer(value) || value.length !== 32) throw new Error('无法静默访问本地加密密钥，请解锁系统登录会话后重试');
    return key = value;
  }
  function decryptLegacy(buffer) {
    if (buffer.subarray(0, 3).toString() !== 'v10') throw new Error('无法识别的本地加密格式');
    if (!legacyKey) {
      let password;
      try { password = keychain.read('onelink-desktop-demo Safe Storage', 'onelink-desktop-demo Key'); }
      catch (cause) { throw Object.assign(new Error('旧凭据无法静默迁移，请重新登录或重新填写密钥；原文件已保留'), { code: 'LEGACY_CREDENTIAL_UNAVAILABLE', cause }); }
      if (!password) throw Object.assign(new Error('旧加密密钥不可用，原文件已保留'), { code: 'LEGACY_CREDENTIAL_UNAVAILABLE' });
      legacyKey = crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
    }
    const decipher = crypto.createDecipheriv('aes-128-cbc', legacyKey, Buffer.alloc(16, 0x20));
    return Buffer.concat([decipher.update(buffer.subarray(3)), decipher.final()]).toString('utf8');
  }
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString(text) {
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', currentKey(), nonce);
      cipher.setAAD(MAGIC);
      const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), encrypted]);
    },
    decryptString(buffer) {
      if (!Buffer.isBuffer(buffer)) throw new TypeError('Expected encrypted Buffer');
      if (!buffer.subarray(0, 4).equals(MAGIC)) return decryptLegacy(buffer);
      if (buffer.length < 32) throw new Error('本地加密数据损坏');
      const decipher = crypto.createDecipheriv('aes-256-gcm', currentKey(), buffer.subarray(4, 16));
      decipher.setAAD(MAGIC);
      decipher.setAuthTag(buffer.subarray(16, 32));
      return Buffer.concat([decipher.update(buffer.subarray(32)), decipher.final()]).toString('utf8');
    },
  };
  return storage;
}

// Only archive unreadable legacy data. Never replace corrupt data or rotate a missing new key.
async function migrateFile(file, storage, { providers = false } = {}) {
  let raw;
  try { raw = await fs.readFile(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (raw.subarray(0, 4).equals(MAGIC)) return null;
  let text;
  try {
    text = storage.decryptString(raw);
    if (providers) {
      const data = JSON.parse(text);
      for (const provider of data.providers) provider.apiKey = storage.encryptString(storage.decryptString(Buffer.from(provider.apiKey, 'base64'))).toString('base64');
      text = JSON.stringify(data);
    } else JSON.parse(text);
  } catch (error) {
    if (error.code !== 'LEGACY_CREDENTIAL_UNAVAILABLE') throw error;
    const archive = file + '.legacy-' + crypto.randomUUID();
    await fs.rename(file, archive);
    return '旧版凭据无法静默迁移，已保留原文件。请重新登录，并重新添加本地服务商密钥。';
  }
  const encrypted = storage.encryptString(text);
  // Preserve an exact encrypted original before replacing anything.
  await fs.copyFile(file, file + '.legacy-' + crypto.randomUUID(), require('node:fs').constants.COPYFILE_EXCL);
  const temporary = file + '.' + crypto.randomUUID();
  try {
    await fs.writeFile(temporary, encrypted, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
  return null;
}
module.exports = { createMacStorage, migrateFile };
