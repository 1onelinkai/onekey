const fs = require('node:fs');
const path = require('node:path');
const { signAsync } = require('@electron/osx-sign');
const MACHO = new Set(['feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']);

function isCode(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) return false;
  if (stat.isDirectory()) return true;
  const fd = fs.openSync(file, 'r');
  try { const header = Buffer.alloc(4); return fs.readSync(fd, header, 0, 4, 0) === 4 && MACHO.has(header.toString('hex')); }
  finally { fs.closeSync(fd); }
}
module.exports = async function signMacApp(options) {
  const originalIgnore = options.ignore;
  const originalOptions = options.optionsForFile;
  return signAsync({
    ...options,
    preAutoEntitlements: false,
    ignore: file => (typeof originalIgnore === 'function' && originalIgnore(file)) || !isCode(file),
    optionsForFile(file) {
      const current = originalOptions ? originalOptions(file) : {};
      if (file === options.app) return { ...current, entitlements: path.resolve(__dirname, '../build/entitlements.launcher.mac.plist') };
      if (path.basename(file) === 'OneLinkAI Runtime') {
        // Preserve the original Electron app's designated identity for saved credentials.
        return { ...current, additionalArguments: [...(current.additionalArguments || []), '--identifier', 'cloud.onelinkai.desktop'] };
      }
      return current;
    },
  });
};
module.exports.isCode = isCode;
