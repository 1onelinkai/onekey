import React from 'react';
import { protocolOptions } from './ProtocolChoices.jsx';
import { Check, Pencil, Trash2 } from 'lucide-react';

export default function ProviderModelList({ provider, busy, onToggle, onSetDefault, onEdit, onDelete }) {
  if (!provider.models.length) return <div className="provider-models-empty">暂无模型，请手动添加或点击一键拉取</div>;
  return <ul className="provider-models" aria-label={provider.name + ' 的模型'}>
    {provider.models.map(item => <li className={'provider-model-row' + (item.isDefault ? ' is-default' : '') + (!item.enabled ? ' is-disabled' : '')} key={item.id}>
      <div className="provider-model-info">
        <div className="provider-model-title">
          <strong title={[
            item.name || item.id,
            item.name && item.name !== item.id ? item.id : '',
            item.contextWindow ? `上下文 ${Number(item.contextWindow).toLocaleString()} tokens` : '',
            item.maxTokens ? `最大输出 ${Number(item.maxTokens).toLocaleString()} tokens` : '',
          ].filter(Boolean).join('\n')}>{item.name || item.id}</strong>
          <span className={'provider-model-status ' + (item.isDefault ? 'is-default' : item.enabled ? 'is-enabled' : 'is-disabled')}>
            {item.isDefault && <Check size={11} />}{item.isDefault ? '默认模型' : item.enabled ? '已启用' : '已停用'}
          </span>
          <span className="model-protocols" title={(item.protocols || [provider.protocol]).map(id => protocolOptions.find(option => option[0] === id)?.[1] || id).join(' · ')}>{(item.protocols || [provider.protocol]).map(id => protocolOptions.find(option => option[0] === id)?.[2] || id).join(' / ')}</span>
        </div>
      </div>
      <div className="provider-model-actions">
        <button type="button" className="button" disabled={busy} title={item.enabled ? '停用模型' : '启用模型'} aria-label={(item.enabled ? '停用 ' : '启用 ') + (item.name || item.id)} onClick={() => onToggle(item)}>{item.enabled ? '停用' : '启用'}</button>
        <button type="button" className="button model-default-button" disabled={busy || !item.enabled || item.isDefault} title={item.isDefault ? '当前默认模型' : !item.enabled ? '启用后可设为默认' : '设为默认模型'} onClick={() => onSetDefault(item)}>设为默认</button>
        <button type="button" className="button model-icon-action" disabled={busy} title="编辑模型资料" aria-label={'编辑 ' + (item.name || item.id) + ' 的模型资料'} onClick={() => onEdit(item)}><Pencil size={14} /></button>
        <button type="button" className="button model-icon-action model-remove-action" disabled={busy} title="删除模型" aria-label={'删除 ' + (item.name || item.id)} onClick={() => onDelete(item)}><Trash2 size={14} /></button>
      </div>
    </li>)}
  </ul>;
}
