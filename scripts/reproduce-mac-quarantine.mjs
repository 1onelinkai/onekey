// Reproduce a delivery failure without changing the original DMG or host security.
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';

const execute = promisify(execFile);
if (process.platform !== 'darwin') throw new Error('This reproduction requires macOS.');
if (!process.argv[2]) throw new Error('Usage: node scripts/reproduce-mac-quarantine.mjs /path/to/release.dmg [report.json]');
const source = path.resolve(process.argv[2]);
const reportPath = path.resolve(process.argv[3] || 'artifacts/distribution-diagnostics/quarantine-reproduction.json');
const root = await mkdtemp(path.join(tmpdir(), 'onelink-quarantine-repro-'));
const run = async (file, args, timeout = 30000) => {
  try { return { code: 0, ...await execute(file, args, { timeout }) }; }
  catch (error) {
    if (error.killed || error.signal || typeof error.code !== 'number') throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const report = {
  source,
  testedAt: new Date().toISOString(),
  host: (await execute('/usr/bin/sw_vers')).stdout,
  gatekeeper: (await run('/usr/sbin/spctl', ['--status'])).stdout.trim(),
  note: 'Synthetic delivery attributes, not attributes inspected on a colleague’s download. This does not reproduce macOS 26.',
  cases: [],
};
let mounted;
try {
  for (const flags of ['0083', '0187']) {
    const image = path.join(root, `${flags}.dmg`);
    await copyFile(source, image);
    const sha256 = createHash('sha256').update(await readFile(image)).digest('hex');
    await execute('/usr/bin/xattr', ['-w', 'com.apple.quarantine', `${flags};${Math.floor(Date.now() / 1000).toString(16)};OneLinkTransferTest;`, image]);
    const mountpoint = path.join(root, `mounted-${flags}`);
    await mkdir(mountpoint);
    await execute('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountpoint, image]);
    mounted = mountpoint;
    const app = path.join(mountpoint, 'OneLinkAI.app');
    const signature = await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    const policy = await run('/usr/bin/syspolicy_check', ['distribution', app], 120000);
    const launch = async (target, phase) => {
      const output = path.join(root, `${flags}-${phase}.stdout`);
      const errors = path.join(root, `${flags}-${phase}.stderr`);
      const request = await run('/usr/bin/open', ['-n', '-W', '--stdout', output, '--stderr', errors, target,
        '--args', '--smoke-test', `--user-data-dir=${path.join(root, `${flags}-${phase}-profile`)}`]);
      const runtimeOutput = await readFile(output, 'utf8').catch(() => '');
      return { ...request, rendered: /"rendered":\s*true/.test(runtimeOutput), runtimeOutput };
    };
    const fromDmg = await launch(app, 'dmg');
    const extracted = path.join(root, `copied-${flags}`, 'OneLinkAI.app');
    await mkdir(path.dirname(extracted));
    await execute('/usr/bin/ditto', [app, extracted]);
    const inheritedQuarantine = await run('/usr/bin/xattr', ['-p', 'com.apple.quarantine', extracted]);
    const fromCopy = await launch(extracted, 'copied');
    report.cases.push({ flags, sha256, signature, policy, fromDmg, inheritedQuarantine, fromCopy });
    console.log(`${flags}: signature=${signature.code}, policy=${policy.code}, DMG rendered=${fromDmg.rendered}, copied app rendered=${fromCopy.rendered}`);
    await execute('/usr/bin/hdiutil', ['detach', mounted]);
    mounted = undefined;
  }
  const [normal, restricted] = report.cases;
  report.reproduced = normal.sha256 === restricted.sha256
    && report.cases.every(item => item.signature.code === 0 && item.policy.code === 0)
    && normal.fromDmg.rendered && normal.fromCopy.rendered
    && restricted.fromDmg.code !== 0 && restricted.fromCopy.code !== 0
    && restricted.fromDmg.stderr.includes('-10810') && restricted.fromCopy.stderr.includes('-10810');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Delivery isolation failure reproduced: ${report.reproduced}. Evidence: ${reportPath}`);
  if (!report.reproduced) process.exitCode = 1;
} finally {
  if (mounted) await execute('/usr/bin/hdiutil', ['detach', mounted]);
  await rm(root, { recursive: true, force: true });
}
