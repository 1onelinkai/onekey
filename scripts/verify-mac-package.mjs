import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const arguments_ = process.argv.slice(2);
const requireGatekeeper = arguments_.includes('--require-gatekeeper');
const source = path.resolve(arguments_.find(argument => !argument.startsWith('--')) || `release/distribution/One Key-${version}-arm64-notarized.dmg`);
const isolated = await mkdtemp(path.join(tmpdir(), 'onelink-package-check-'));
let mounted;
const { stdout: policyStatus } = await execute('/usr/sbin/spctl', ['--status']).catch(error => {
  if (error.code === 1 && error.stdout?.trim() === 'assessments disabled') return error;
  throw error;
});
const gatekeeperEnabled = policyStatus.trim() === 'assessments enabled';
console.log(`Host Gatekeeper: ${policyStatus.trim()}`);
if (!gatekeeperEnabled) console.warn('LIMITATION: Gatekeeper is disabled on this host. Local launches do not prove first-download security approval.');
async function launchThroughFinder(app, label, profile) {
  const output = path.join(isolated, `${profile}.stdout`);
  const errors = path.join(isolated, `${profile}.stderr`);
  await execute('/usr/bin/open', ['-n', '-W', '--stdout', output, '--stderr', errors, app,
    '--args', '--smoke-test', `--user-data-dir=${path.join(isolated, profile)}`], { timeout: 30000 });
  // open reports LaunchServices success even if the launched process fails.
  const result = await readFile(output, 'utf8').catch(() => '');
  if (!/"rendered":\s*true/.test(result) || !/"isolated":\s*true/.test(result)) {
    const detail = await readFile(errors, 'utf8').catch(() => 'No runtime output');
    throw new Error(`${label} did not render after the LaunchServices request: ${detail}`);
  }
  console.log(`${label}, rendered UI through LaunchServices: PASS`);
}
try {
  if (source.endsWith('.dmg')) {
    const mountpoint = path.join(isolated, 'disk-image');
    await mkdir(mountpoint);
    await execute('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountpoint, source], { timeout: 30000 });
    mounted = mountpoint;
    const payload = path.join(mounted, 'One Key.app');
    await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', payload]);
    await launchThroughFinder(payload, 'Read-only DMG payload', 'disk-image-profile');
    await execute('/usr/bin/ditto', [payload, path.join(isolated, 'One Key.app')]);
  } else if (source.endsWith('.app'))
    await execute('/usr/bin/ditto', [source, path.join(isolated, 'One Key.app')]);
  else
    await execute('/usr/bin/ditto', ['-x', '-k', source, isolated]);
  const app = path.join(isolated, 'One Key.app');
  await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  const distributionPolicy = await execute('/usr/bin/syspolicy_check', ['distribution', app], { timeout: 120000 });
  console.log(`Apple pre-distribution assessment: ${(distributionPolicy.stdout + distributionPolicy.stderr).trim()}`);
  await execute('/usr/bin/xattr', ['-w', 'com.apple.quarantine', `0083;${Math.floor(Date.now() / 1000).toString(16)};OneLinkDistributionTest;`, app]);
  await launchThroughFinder(app, 'Extracted application with download quarantine', 'quarantined-profile');
  let binary = path.join(app, 'Contents/MacOS/One Key');
  const { stdout: architecture } = await execute('/usr/bin/file', [binary]);
  const { stdout } = await execute(binary, ['--smoke-test', `--user-data-dir=${path.join(isolated, 'fresh-user-data')}`], {
    cwd: isolated,
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: tmpdir() },
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  if (!/"rendered":\s*true/.test(stdout) || !/"isolated":\s*true/.test(stdout))
    throw new Error(`Packaged application did not pass startup checks: ${stdout}`);
  for (const phase of ['write', 'read']) {
    if (phase === 'read') {
      const relocated = path.join(isolated, 'relocated/One Key.app');
      await execute('/usr/bin/ditto', [app, relocated]);
      binary = path.join(relocated, 'Contents/MacOS/One Key');
    }
    const { stdout: storageResult } = await execute(binary, ['--storage-self-test', `--user-data-dir=${path.join(isolated, 'storage-test-profile')}`], {
      cwd: isolated, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: tmpdir() }, timeout: 15000,
    });
    if (!storageResult.includes(`"phase":"${phase}"`) || !storageResult.includes('"storage":true'))
      throw new Error(`Credential persistence failed: ${storageResult}`);
    console.log(`Native noninteractive credential storage ${phase}: PASS`);
  }
  console.log(architecture.trim());
  console.log('Archive signature integrity: PASS');
  console.log('Extracted application, fresh profile, system-only PATH, no project working directory: PASS');
  console.log(stdout.trim());
  if (requireGatekeeper && !gatekeeperEnabled) throw new Error('Release readiness is unverified: repeat first-download testing on a host with Gatekeeper enabled. Functional checks passed, but this is not release approval.');
  console.log('Local checks do not reproduce another machine’s OS, Gatekeeper enforcement or hardware. The native launcher captures runtime failures for users without Terminal; do not claim another machine’s failure is fixed until verified.');
} finally {
  if (mounted) await execute('/usr/bin/hdiutil', ['detach', mounted]);
  await rm(isolated, { recursive: true, force: true });
}
