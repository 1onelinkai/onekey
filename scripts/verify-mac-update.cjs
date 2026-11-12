// Integration check: signed DMG -> local ZIP -> updater's actual loopback bridge.
// It never invokes native checkForUpdates / quitAndInstall or replaces an app.
const { app } = require('electron');
// Treat the extracted app.asar as a file during cleanup, not a virtual directory.
const fs = require('original-fs').promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const { EventEmitter } = require('node:events');
const { promisify } = require('node:util');
const execute = promisify(require('node:child_process').execFile);
const { CancellationToken } = require('builder-util-runtime');
const { createMacDmgUpdaterClass, APP_ID, TEAM_ID } = require('../electron/mac-dmg-update.cjs');

app.whenReady().then(async () => {
  let updater, root;
  let exitCode = 0;
  try {
    const [input, version = require('../package.json').version, arch = process.arch] = process.argv.slice(2);
    if (!input) throw new Error('Usage: electron scripts/verify-mac-update.cjs <signed.dmg> [version] [arch]');
    const source = path.resolve(input);
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'onelink-mac-update-check-'));
    const checksum = crypto.createHash('sha512');
    for await (const chunk of createReadStream(source)) checksum.update(chunk);
    const sha512 = checksum.digest('base64');
    const size = (await fs.stat(source)).size;
    const Updater = createMacDmgUpdaterClass();
    updater = new Updater(null, null, { tempDir: root, arch });
    updater.autoInstallOnAppQuit = false;
    updater.disableDifferentialDownload = true;
    updater.logger = null;
    let feed, ready = false;
    const native = new EventEmitter();
    native.setFeedURL = value => { feed = value; };
    native.checkForUpdates = () => { throw new Error('Native installation must not run during verification'); };
    native.quitAndInstall = native.checkForUpdates;
    updater.nativeUpdater = native;
    updater.on('update-downloaded', () => { ready = true; });
    // Local input replaces network I/O only. Preparation and the HTTP bridge are real.
    updater.httpExecutor = { download: async (_url, destination, options) => {
      if (options.sha512 !== sha512) throw new Error('DMG checksum was not forwarded');
      await fs.copyFile(source, destination);
    } };
    await updater.doDownloadUpdate({ cancellationToken: new CancellationToken(), updateInfoAndProvider: {
      info: { version }, provider: { resolveFiles: () => [{ url: new URL('https://example.com/OneLinkAI.dmg'), info: { size, sha512 } }] },
    } });
    if (!ready || !feed) throw new Error('Update was not prepared');
    const rejected = await fetch(feed.url);
    if (rejected.status !== 401) throw new Error('Loopback feed must require authorization');
    const response = await fetch(feed.url, { headers: feed.headers });
    const metadata = await response.json();
    const archive = await fetch(metadata.url);
    if (!archive.ok || !metadata.url.startsWith(feed.url + '/')) throw new Error('Invalid local ZIP URL');
    const data = Buffer.from(await archive.arrayBuffer());
    if (data.length !== Number(archive.headers.get('content-length'))) throw new Error('ZIP Content-Length mismatch');
    const zipFile = path.join(root, 'served.zip');
    await fs.writeFile(zipFile, data);
    const extracted = path.join(root, 'extracted');
    await fs.mkdir(extracted);
    await execute('/usr/bin/ditto', ['-x', '-k', zipFile, extracted]);
    const names = (await fs.readdir(extracted)).filter(name => name.endsWith('.app'));
    if (names.length !== 1) throw new Error('Invalid converted ZIP payload');
    const requirement = `anchor apple generic and identifier "${APP_ID}" and certificate leaf[subject.OU] = "${TEAM_ID}"`;
    await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', `-R=${requirement}`, path.join(extracted, names[0])], { timeout: 120000 });
    console.log(JSON.stringify({ dmg: path.basename(source), version, arch, ready, zipBytes: data.length,
      signaturePreserved: true, loopbackFeedProtected: true, installed: false }, null, 2));
  } catch (error) {
    console.error(error);
    if (error.preserveUpdateDirectory) root = null;
    exitCode = 1;
  } finally {
    await updater?.disposePreparedUpdate().catch(error => { console.error(error); exitCode = 1; });
    if (root) await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => { console.error(error); exitCode = 1; });
    app.exit(exitCode);
  }
});
