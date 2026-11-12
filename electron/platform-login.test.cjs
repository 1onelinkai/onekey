const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPlatformLogin } = require('./platform-login.cjs');

test('login captures paused response before resuming navigation and validates session afterward', async () => {
  const commands = [];
  let instance;
  class Window extends EventEmitter {
    constructor() {
      super(); instance = this;
      const debug = new EventEmitter();
      debug.attach = () => {};
      debug.sendCommand = async (method, args) => {
        commands.push(method);
        if (method === 'Fetch.getResponseBody') {
          assert.equal(args.requestId, 'paused');
          return { body: Buffer.from(JSON.stringify({ code: 200, data: { access_token: 'test-token', refresh_token: 'test-refresh' } })).toString('base64'), base64Encoded: true };
        }
      };
      this.webContents = new EventEmitter();
      this.webContents.debugger = debug;
      this.webContents.getURL = () => 'https://onelinkai.cloud/Login';
      this.webContents.setWindowOpenHandler = () => {};
    }
    async loadURL() { assert.equal(commands[0], 'Fetch.enable'); }
    close() { this.emit('closed'); }
  }
  const service = createPlatformLogin({ BrowserWindow: Window,
    session: { fromPartition: () => ({ setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }) },
    platform: { acceptSession: async candidate => {
      assert.equal(commands.at(-1), 'Fetch.continueRequest');
      assert.deepEqual(candidate, { accessToken: 'test-token', refreshToken: 'test-refresh' });
      return { authenticated: true };
    } },
  });
  const login = service.login();
  await new Promise(resolve => setImmediate(resolve));
  instance.webContents.debugger.emit('message', {}, 'Fetch.requestPaused', {
    requestId: 'paused', request: { url: 'https://api.onelinkai.cloud/sso/client/token?clientType=router', method: 'POST' }, responseStatusCode: 200,
  });
  assert.deepEqual(await login, { authenticated: true });
  assert.deepEqual(commands, ['Fetch.enable', 'Fetch.getResponseBody', 'Fetch.continueRequest']);
});
