const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPlatformService } = require('./platform.cjs');

test('platform lists existing keys by organization without exposing credentials', async () => {
  const service = createPlatformService();
  const personal = await service.list('个人工作空间');
  const team = await service.list('OneLink 研发团队');
  assert.equal(personal.length, 2);
  assert.equal(team.length, 2);
  assert.ok(personal.every(key => !key.secret && !team.some(other => other.id === key.id)));
  assert.deepEqual(await service.list('unknown'), []);
  assert.equal((await service.get(personal[0].id)).secret.startsWith('sk-demo-platform-'), true);
  assert.equal((await service.models(personal[0].id)).length, 3);
  await assert.rejects(service.get('missing'), /不存在/);
  assert.equal(service.add, undefined);
  assert.equal(service.remove, undefined);
});
