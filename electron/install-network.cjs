const http = require('node:http');
const { SocksClient } = require('socks');

function proxyEnvironment(resolved, env = process.env) {
  const explicit = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  const match = String(resolved || '').match(/(?:^|;\s*)(?:PROXY|HTTPS)\s+([^;\s]+)/);
  const proxy = explicit || (match ? 'http://' + match[1] : '');
  if (!proxy) return { ...env };
  return { ...env, HTTP_PROXY: proxy, HTTPS_PROXY: proxy, http_proxy: proxy, https_proxy: proxy,
    npm_config_proxy: proxy, npm_config_https_proxy: proxy };
}

async function createProxyBridge(resolved, env = process.env) {
  const explicit = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy;
  const match = String(resolved || '').match(/(?:^|;\s*)(SOCKS5?|PROXY|HTTPS)\s+([^;\s]+)/i);
  const address = explicit || (match ? (match[1].startsWith('SOCKS') ? 'socks5h://' : 'http://') + match[2] : '');
  if (!/^socks/i.test(address)) return { env: proxyEnvironment(resolved, address ? { ...env, HTTPS_PROXY: address } : env), close: async () => {} };
  const upstream = new URL(address);
  const sockets = new Set();
  const track = socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); return socket; };
  const connect = async (host, port) => {
    const { socket } = await SocksClient.createConnection({
      proxy: { host: upstream.hostname, port: Number(upstream.port) || 1080, type: upstream.protocol.startsWith('socks4') ? 4 : 5,
        userId: decodeURIComponent(upstream.username), password: decodeURIComponent(upstream.password) },
      command: 'connect', destination: { host, port }, timeout: 15000,
    });
    return track(socket);
  };
  const server = http.createServer(async (request, response) => {
    try {
      const target = new URL(request.url);
      if (target.protocol !== 'http:') throw new Error('Use CONNECT for HTTPS');
      const socket = await connect(target.hostname, Number(target.port) || 80);
      const headers = { ...request.headers }; delete headers['proxy-authorization']; delete headers['proxy-connection'];
      const agent = new http.Agent({ keepAlive: false });
      agent.createConnection = () => socket;
      const outgoing = http.request({ hostname: target.hostname, port: Number(target.port) || 80, path: target.pathname + target.search, method: request.method, headers, agent }, upstreamResponse => {
        response.writeHead(upstreamResponse.statusCode, upstreamResponse.headers); upstreamResponse.pipe(response);
      });
      outgoing.on('error', () => response.destroy()); response.on('close', () => { outgoing.destroy(); socket.destroy(); agent.destroy(); }); request.pipe(outgoing);
    } catch { response.writeHead(502); response.end('Proxy connection failed'); }
  });
  server.on('connection', track);
  server.on('connect', async (request, client, head) => {
    try {
      const target = new URL('http://' + request.url);
      const socket = await connect(target.hostname, Number(target.port) || 443);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) socket.write(head);
      socket.on('error', () => client.destroy()); client.on('error', () => socket.destroy());
      client.on('close', () => socket.destroy()); socket.on('close', () => client.destroy());
      client.pipe(socket); socket.pipe(client);
    } catch { client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const proxy = 'http://127.0.0.1:' + server.address().port;
  return { env: proxyEnvironment('', { ...env, HTTPS_PROXY: proxy }), close: () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(resolve); }) };
}
module.exports = { proxyEnvironment, createProxyBridge };
