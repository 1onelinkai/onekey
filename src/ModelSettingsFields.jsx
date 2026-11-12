import React from 'react';
import efforts from './client-effort-levels.json';
const commonFields = ['contextWindow', 'maxTokens', 'supportsImages', 'supportsTools', 'supportsReasoning'];
export default function ModelSettingsFields({ value, onChange, supported = commonFields, client }) {
  const update = (field, next) => onChange(current => ({ ...current, [field]: next }));
  const numbers = [['contextWindow', '上下文窗口', '例如 128000'], ['maxTokens', '最大输出 Token', '例如 8192'], ['compactThreshold', '自动压缩阈值', '小于上下文窗口'], ['thinkingBudget', '思考 Token 预算', '0 表示关闭思考']];
  return <div className="model-settings-fields">
    {numbers.filter(([field]) => ['contextWindow', 'maxTokens'].includes(field) || supported.includes(field)).map(([field, label, placeholder]) => <label key={field}>
      <span>{label}{!supported.includes(field) && <em>由客户端或服务端管理</em>}</span>
      <input aria-label={label} type="number" min={field === 'thinkingBudget' ? 0 : 1} max="100000000" step="1" disabled={!supported.includes(field)} placeholder={placeholder} value={value[field] ?? ''} onChange={event => update(field, event.target.value)} />
    </label>)}
    {supported.includes('reasoningEffort') && <label><span>{client === 'claude-desktop' ? '最大推理档位' : '推理档位'}</span><select aria-label="推理档位" value={value.reasoningEffort || ''} onChange={event => update('reasoningEffort', event.target.value)}><option value="">沿用当前设置</option>{(efforts[client] || []).map(level => <option key={level} value={level}>{level}</option>)}</select></label>}
    {[['subagentModel', '子代理模型'], ['reviewModel', '审查模型']].filter(([field]) => supported.includes(field)).map(([field, label]) => <label key={field}><span>{label}</span><input aria-label={label} maxLength={200} placeholder="留空沿用当前设置" value={value[field] || ''} onChange={event => update(field, event.target.value)} /></label>)}
    {[['supportsImages', '图片输入'], ['supportsTools', '工具调用'], ['supportsReasoning', '推理能力'], ['supports1m', '1M 上下文变体']].filter(([field]) => supported.includes(field)).map(([field, label]) => <label key={field}><span>{label}</span><select aria-label={label} value={value[field] === undefined || value[field] === '' ? '' : String(value[field])} onChange={event => update(field, event.target.value === '' ? '' : event.target.value === 'true')}><option value="">使用默认能力</option><option value="true">支持</option><option value="false">不支持</option></select></label>)}
  </div>;
}
