import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.platform === 'darwin') {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const headers = [process.env.ONELINK_NODE_HEADERS, '/usr/local/include/node', '/opt/homebrew/include/node'].filter(Boolean).find(p => existsSync(path.join(p, 'node_api.h')));
  if (!headers) throw new Error('Set ONELINK_NODE_HEADERS to a directory containing node_api.h');
  execFileSync('xcrun', ['clang++', '-std=c++17', '-bundle', '-undefined', 'dynamic_lookup', '-Wno-deprecated-declarations', '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=12.0', '-I', headers, '-framework', 'Security', '-framework', 'CoreFoundation', path.join(root, 'electron/native/keychain.cc'), '-o', path.join(root, 'electron/native/keychain.node')], { stdio: 'inherit' });
}
