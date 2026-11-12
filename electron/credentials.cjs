const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const exec = promisify(execFile);

function macCredentials(safeStorage) {
  return {
    async get(url) {
      try {
        const { stdout } = await exec(
          "/usr/bin/security",
          ["find-internet-password", "-s", url, "-a", "Bearer", "-w"],
          { timeout: 15000 },
        );
        return stdout.replace(/\r?\n$/, "");
      } catch (error) {
        if (error.code === 44) return null;
        throw new Error("无法读取 Zed 钥匙串凭据");
      }
    },
    async set(url, key) {
      try {
        if (key === null) {
          try {
            await exec(
              "/usr/bin/security",
              ["delete-internet-password", "-s", url, "-a", "Bearer"],
              { timeout: 15000 },
            );
          } catch (error) {
            if (error.code !== 44) throw error;
          }
        } else {
          // Pass the password over stdin to security's interactive mode, not process arguments.
          const quote = (value) =>
            '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
          if (/[\r\n\0]/.test(key + url)) throw new Error("Invalid credential");
          await new Promise((resolve, reject) => {
            const child = execFile(
              "/usr/bin/security",
              ["-i"],
              { timeout: 15000 },
              (error) => (error ? reject(error) : resolve()),
            );
            child.stdin.end(
              "add-internet-password -U -s " +
                quote(url) +
                " -a Bearer -w " +
                quote(key) +
                "\n",
            );
          });
        }
        if ((await this.get(url)) !== key)
          throw new Error("Keychain verification failed");
      } catch {
        throw new Error("Zed 钥匙串写入失败，请检查系统授权");
      }
    },
    encrypt(text) {
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("系统加密不可用");
      return safeStorage.encryptString(text);
    },
    decrypt(buffer) {
      return safeStorage.decryptString(buffer);
    },
  };
}
module.exports = { macCredentials };
