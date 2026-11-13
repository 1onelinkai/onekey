function keyMetadata(record, now = Date.now()) {
  const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const quota = number(record.quota);
  const used = number(record.spend ?? record.consumeQuota);
  const unlimited = record.quota === null || quota === -1;
  const exhausted = quota != null && quota >= 0 && (quota === 0 || used != null && used >= quota);
  const rawExpiry = record.expiredTime;
  const expiry = rawExpiry == null || rawExpiry === '' ? NaN : /^\d+$/.test(String(rawExpiry)) ? Number(rawExpiry) : Date.parse(String(rawExpiry).replace(' ', 'T'));
  const permanent = number(record.expired) === 9;
  const expired = !permanent && Number.isFinite(expiry) && now > expiry;
  const statuses = [];
  if (number(record.status) === 0) statuses.push({ label: '已禁用', tone: 'muted' });
  if (expired) statuses.push({ label: '已过期', tone: 'danger' });
  if (exhausted) statuses.push({ label: '预算已用完', tone: 'danger' });
  if (!statuses.length) statuses.push(number(record.status) === 1 ? { label: '已启用', tone: 'normal' } : { label: '状态未知', tone: 'muted' });
  return {
    statuses, canConfigure: number(record.status) === 1 && !expired && !exhausted,
    expiresAt: permanent ? 'permanent' : Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
    budget: { limit: quota, used, unlimited, remaining: !unlimited && quota != null && quota >= 0 && used != null ? Math.max(0, quota - used) : null,
      period: record.quotaMethodName || (number(record.quotaMethod) === 1 ? '总额' : ''),
      percent: !unlimited && quota != null && quota >= 0 && used != null ? quota === 0 ? 100 : Math.min(100, Math.max(0, used / quota * 100)) : null },
  };
}
module.exports = { keyMetadata };
