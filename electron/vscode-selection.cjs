const fs = require('node:fs/promises');
const path = require('node:path');

function resolveVscodeSelection(rows) {
  const saved = new Map(rows.map(row => [row.key, row.value instanceof Uint8Array ? Buffer.from(row.value).toString('utf8') : String(row.value)]));
  const key = 'chat.currentLanguageModel.panel';
  // Other chat locations and remote session targets have independent choices.
  const value = saved.get(key);
  if (!value || value.length > 300 || /[\s\0<>]/.test(value) || saved.get(key + '.isDefault') === 'true') return null;
  const model = value.replace(/^[^:]+:/, '');
  return model ? { model, selectionSource: 'last-selection', selectionScope: '默认 Profile · 聊天面板' } : null;
}

async function readVscodeSelection(directory) {
  const file = path.join(directory, 'globalStorage/state.vscdb');
  let db;
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) return null;
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(file, { readOnly: true, timeout: 200 });
    // Exact keys only: do not load credentials, chat content or other extension state.
    const rows = db.prepare('SELECT key, value FROM ItemTable WHERE key IN (?, ?)').all('chat.currentLanguageModel.panel', 'chat.currentLanguageModel.panel.isDefault');
    return resolveVscodeSelection(rows);
  } catch { return null; }
  finally { db?.close(); }
}
module.exports = { readVscodeSelection, resolveVscodeSelection };
