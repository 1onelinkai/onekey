import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const electron = require('electron');
const root = path.resolve(import.meta.dirname, '..');
const directory = await mkdtemp(path.join(tmpdir(), 'onelink-provider-restart-'));
let child, socket, sequence = 0;
const pending = new Map();

async function launch() {
  let output = '';
  child = spawn(electron, [root, `--user-data-dir=${directory}`, '--remote-debugging-port=0'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ONELINK_DEV_URL: '' },
  });
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  child.on('error', error => { output += error.message; });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Application exited: ${output}`);
    const match = output.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) {
      const pages = await (await fetch(`http://127.0.0.1:${match[1]}/json`)).json();
      const page = pages.find(page => page.type === 'page' && page.url.startsWith('file:'));
      if (page) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await once(socket, 'open');
        socket.addEventListener('message', event => {
          const message = JSON.parse(event.data);
          const request = pending.get(message.id);
          if (!request) return;
          pending.delete(message.id);
          if (message.error) request.reject(new Error(message.error.message));
          else request.resolve(message.result);
        });
        await evaluate(`new Promise(resolve => {
          const timer = setInterval(() => {
            if (window.onelinkDesktop && document.querySelector('.sidebar')) { clearInterval(timer); resolve(true); }
          }, 50);
        })`);
        return;
      }
    }
    await delay(100);
  }
  throw new Error(`Application startup timed out: ${output}`);
}

async function evaluate(expression) {
  const id = ++sequence;
  const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, timeout: 15000 } }));
  const result = await response;
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function stop() {
  socket?.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
}

try {
  await launch();
  // Exercise the actual React save button and production IPC, without --flow-test.
  await evaluate(`(async () => {
    [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '模型服务商').click();
    await new Promise(r => setTimeout(r, 100));
    const set = (selector, value) => {
      const input = document.querySelector(selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('.provider-fields input', 'Restart verification');
    set('.provider-fields input[type="password"]', 'verification-fake-secret');
    await new Promise(r => setTimeout(r, 100));
    document.querySelector('.provider-save').click();
    for (let i = 0; i < 100; i++) {
      if (document.querySelector('.provider-row strong')?.textContent === 'Restart verification') return true;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('Save button did not persist provider');
  })()`);
  const providerId = await evaluate(`(async () => {
    const api = window.onelinkDesktop;
    const call = async (method, input) => { const result = await api[method](input); if (!result.ok) throw new Error(result.error); return result.data; };
    const provider = (await call('localProviders'))[0];
    await call('createLocalModel', { providerId: provider.id, id: 'keep', name: 'Custom model', contextWindow: 128000, enabled: false });
    await call('selectLocalModels', { providerId: provider.id, models: [{ id: 'keep' }, { id: 'selected' }] });
    await call('setDefaultLocalModel', { providerId: provider.id, modelId: 'selected' });
    return provider.id;
  })()`);
  await stop();
  await launch();
  const restored = await evaluate(`(async () => {
    const result = await window.onelinkDesktop.localProviders();
    if (!result.ok) throw new Error(result.error);
    return result.data;
  })()`);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, providerId);
  assert.deepEqual(restored[0].models.map(model => model.id), ['keep', 'selected']);
  assert.equal(restored[0].models[0].name, 'Custom model');
  assert.equal(restored[0].models[0].contextWindow, 128000);
  assert.equal(restored[0].models[0].enabled, false);
  assert.equal(restored[0].models[1].isDefault, true);
  assert.equal(Object.hasOwn(restored[0], 'apiKey'), false);
  assert.equal(await evaluate(`(async () => {
    [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '模型服务商').click();
    await new Promise(r => setTimeout(r, 100));
    return document.querySelector('.provider-list')?.textContent.includes('Restart verification');
  })()`), true);
  // Check saved credentials using the same encrypted files, without printing secrets.
  const { createPersistentLocalProviderStore } = require('../electron/local-providers.cjs');
  const store = createPersistentLocalProviderStore(path.join(directory, 'local-providers'));
  assert.equal((await store.getCredential(providerId)).apiKey, 'verification-fake-secret');
  console.log('PASS: UI save → complete process exit → production startup restores provider, credentials, selected models and defaults.');
} finally {
  await stop();
  await rm(directory, { recursive: true, force: true });
}
