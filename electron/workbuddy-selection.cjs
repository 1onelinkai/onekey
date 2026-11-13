const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const prefix = 'cb-newtask:model';
const modelId = value => typeof value === 'string' && value.length > 0 && value.length <= 300 && !/[\s\0<>]/.test(value) ? value : '';
function resolveSelection(entries) {
  // The optional second suffix is a buddy-app scope, not the ordinary new-task default.
  const scoped = entries.filter(item => new RegExp('^' + prefix + ':[\\w-]+$').test(item.key));
  if (scoped.length > 1) return null; // Do not guess which account is currently active.
  const entry = scoped[0] || entries.find(item => item.key === prefix);
  const id = modelId(entry?.id);
  return id ? { model: id, selectionSource: 'new-task-default' } : null;
}

async function storageFiles(directory) {
  const root = await fs.lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Invalid storage directory');
  const names = (await fs.readdir(directory)).filter(name => /^(?:CURRENT|MANIFEST-\d+|\d+\.(?:log|ldb|sst))$/.test(name)).sort();
  if (names.length > 100) throw new Error('Storage snapshot exceeds file limit');
  const files = await Promise.all(names.map(async name => {
    const stat = await fs.lstat(path.join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid storage file');
    return { name, size: stat.size, mtime: stat.mtimeMs };
  }));
  if (!names.includes('CURRENT') || files.reduce((total, item) => total + item.size, 0) > 16 * 1024 * 1024) throw new Error('Storage snapshot unavailable');
  return files;
}
async function copySnapshot(source, destination) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await storageFiles(source);
    await fs.rm(destination, { recursive: true, force: true });
    await fs.mkdir(destination, { recursive: true });
    await Promise.all(before.map(file => fs.copyFile(path.join(source, file.name), path.join(destination, file.name))));
    const after = await storageFiles(source);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
  }
  throw new Error('Storage changed while copying');
}

function createLocalSelectionReader({ BrowserWindow, session, directories, client = 'workbuddy' }) {
  let pending;
  async function readSnapshot(source) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-model-choice-'));
    let window, timer;
    try {
      const profile = path.join(root, 'snapshot');
      await copySnapshot(source, path.join(profile, 'Local Storage/leveldb'));
      const isolated = session.fromPath(profile, { cache: false });
      isolated.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
      isolated.setPermissionCheckHandler(() => false);
      isolated.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
      const blank = path.join(root, 'blank.html');
      await fs.writeFile(blank, '<!doctype html><title>Model preference snapshot</title>', { mode: 0o600 });
      window = new BrowserWindow({ show: false, webPreferences: { session: isolated, nodeIntegration: false, contextIsolation: true, sandbox: true } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const work = (async () => {
        await window.loadURL(pathToFileURL(blank).href);
        // Read only the known model preference, never authentication or conversation data.
        return window.webContents.executeJavaScript(client === 'zcode' ? `Object.keys(localStorage).filter(key => /^zcode-last-agent-model:(glm|claude|codex|gemini|opencode):/.test(key)).slice(0, 100).map(key => ({ key: key.endsWith(':__global__') ? key : 'session-scoped', id: key.endsWith(':__global__') ? localStorage.getItem(key)?.slice(0, 4096) : null }))` : `Object.keys(localStorage).filter(key => key === 'cb-newtask:model' || /^cb-newtask:model:[\\w-]+$/.test(key)).slice(0, 50).map(key => { try { const value = localStorage.getItem(key); return { key, id: value.length <= 4096 ? JSON.parse(value).id : null }; } catch { return { key }; } })`);
      })();
      const timeout = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Model preference read timed out')), 5000); });
      const entries = await Promise.race([work, timeout]);
      return client === 'zcode' ? resolveZcodeSelection(entries) : resolveSelection(entries);
    } finally {
      clearTimeout(timer);
      window?.destroy();
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    }
  }
  return async function readSelection() {
    if (pending) return pending;
    pending = (async () => {
      // Modern desktop uses this session; only fall back if it does not exist.
      for (const directory of directories.filter(Boolean)) {
        const source = path.join(directory, 'Local Storage/leveldb');
        try { await fs.lstat(source); } catch (error) { if (error.code === 'ENOENT') continue; return null; }
        try { return await readSnapshot(source); } catch { return { selectionStatus: 'unreadable' }; }
      }
      return null;
    })().finally(() => { pending = null; });
    return pending;
  };
}
function resolveZcodeSelection(entries) {
  const models = new Set();
  for (const entry of entries) {
    if (!/^zcode-last-agent-model:(glm|claude|codex|gemini|opencode):__global__$/.test(entry.key)) continue;
    let id = modelId(entry.id);
    if (id.startsWith('custom:')) {
      const parts = id.slice(7).split(':');
      // ZCode supports legacy builtin:<vendor>:<model> as well as encoded provider IDs.
      const encoded = parts[0] === 'builtin' ? parts.slice(2).join(':') : parts.slice(1).join(':');
      try { id = modelId(decodeURIComponent(encoded)); } catch { id = ''; }
    }
    if (id) models.add(id);
  }
  if (models.size === 1) return { model: [...models][0], selectionSource: 'last-selection' };
  return models.size > 1 ? { selectionStatus: 'multiple-agents' } : entries.some(entry => entry.key === 'session-scoped') ? { selectionStatus: 'session-scoped' } : null;
}
function createWorkbuddySelectionReader({ configDirectory, legacySessionDirectory, ...options }) {
  return createLocalSelectionReader({ ...options, directories: [path.join(configDirectory, 'app/session'), legacySessionDirectory] });
}
module.exports = { createLocalSelectionReader, createWorkbuddySelectionReader, resolveSelection, resolveZcodeSelection, copySnapshot };
