const { test } = require('node:test');
const assert = require('node:assert/strict');
const { proxyEnvironment, createProxyBridge } = require('./install-network.cjs');
const http = require('node:http');
const net = require('node:net');
test('system HTTP proxy is propagated to Git, uv and npm without changing other environment', () => {
  const env = proxyEnvironment('PROXY 127.0.0.1:7890; DIRECT', { PATH: '/bin' });
  assert.equal(env.HTTPS_PROXY, 'http://127.0.0.1:7890');
  assert.equal(env.https_proxy, env.HTTPS_PROXY);
  assert.equal(env.npm_config_https_proxy, env.HTTPS_PROXY);
  assert.equal(env.PATH, '/bin');
  assert.equal(proxyEnvironment('DIRECT', {}).HTTPS_PROXY, undefined);
  assert.equal(proxyEnvironment('PROXY localhost:7890', { HTTPS_PROXY: 'http://localhost:9999' }).HTTPS_PROXY, 'http://localhost:9999');
});

test('SOCKS bridge carries HTTP and CONNECT through SOCKS, and closes sockets', async t => {
  const target = http.createServer((req, res) => res.end('via-socks'));
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await listen(target);
  const sockets = new Set();
  let connections = 0;
  const socks = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.once('data', () => {
      socket.write(Buffer.from([5, 0]));
      socket.once('data', () => {
        connections++;
        const remote = net.connect(target.address().port, '127.0.0.1', () => {
          socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
          socket.pipe(remote); remote.pipe(socket);
        });
        socket.on('close', () => remote.destroy()); remote.on('error', () => socket.destroy());
      });
    });
  });
  await listen(socks);
  const bridge = await createProxyBridge('SOCKS5 127.0.0.1:' + socks.address().port, {});
  t.after(async () => { await bridge.close(); for (const socket of sockets) socket.destroy(); await Promise.all([new Promise(r => socks.close(r)), new Promise(r => target.close(r))]); });
  const proxy = new URL(bridge.env.HTTPS_PROXY);
  const body = await new Promise((resolve, reject) => {
    http.get({ hostname: proxy.hostname, port: proxy.port, path: 'http://nonexistent.invalid/test' }, response => {
      let data = ''; response.on('data', chunk => data += chunk); response.on('end', () => resolve(data));
    }).on('error', reject);
  });
  assert.equal(body, 'via-socks');
  const tunnel = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: proxy.hostname, port: proxy.port, method: 'CONNECT', path: 'nonexistent.invalid:443' });
    request.on('connect', (response, socket) => { assert.equal(response.statusCode, 200); let data = ''; socket.on('data', chunk => data += chunk); socket.on('end', () => resolve(data)); socket.write('GET / HTTP/1.1\r\nHost: test\r\nConnection: close\r\n\r\n'); });
    request.on('error', reject); request.end();
  });
  assert.match(tunnel, /via-socks/);
  assert.equal(connections, 2);
});

test('explicit ALL_PROXY HTTP is propagated and DIRECT leaves environment intact', async () => {
  const bridge = await createProxyBridge('DIRECT', { ALL_PROXY: 'http://127.0.0.1:8999', PATH: '/bin' });
  assert.equal(bridge.env.HTTPS_PROXY, 'http://127.0.0.1:8999');
  assert.equal(bridge.env.PATH, '/bin');
  await bridge.close();
  assert.deepEqual((await createProxyBridge('DIRECT', { PATH: '/bin' })).env, { PATH: '/bin' });
});

test('unreachable SOCKS upstream returns failure instead of a successful tunnel', async t => {
  const closed = net.createServer();
  await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve));
  const port = closed.address().port; await new Promise(resolve => closed.close(resolve));
  const bridge = await createProxyBridge('SOCKS5 127.0.0.1:' + port, {});
  t.after(() => bridge.close());
  const proxy = new URL(bridge.env.HTTPS_PROXY);
  const status = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: proxy.hostname, port: proxy.port, method: 'CONNECT', path: 'example.com:443' });
    request.on('connect', (response, socket) => { socket.destroy(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(status, 502);
});
