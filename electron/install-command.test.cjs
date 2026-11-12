const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createInstallCommand } = require('./install-command.cjs');

test('installation runner captures output and reports actionable command failures', async () => {
  const lines = [];
  const execute = createInstallCommand(line => lines.push(line));
  assert.match(await execute(process.execPath, ['-e', 'console.log("ready")']), /ready/);
  assert.ok(lines.length);
  await assert.rejects(execute(process.execPath, ['-e', 'console.error("dependency unavailable");process.exit(2)']), /dependency unavailable/);
});

test('installation runner terminates silent commands instead of waiting indefinitely', async () => {
  const execute = createInstallCommand(() => {});
  await assert.rejects(execute(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { idleTimeout: 100, timeout: 5000 }), /没有输出/);
});
test('silent downloads are allowed until the stage deadline by default', async () => {
  const execute = createInstallCommand(() => {});
  assert.equal(await execute(process.execPath, ['-e', 'setTimeout(()=>console.log("downloaded"),200)'], { timeout: 2000 }), 'downloaded\n');
});
