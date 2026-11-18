import ProtocolChoices, { protocolOptions } from './ProtocolChoices.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle, ShieldCheck } from 'lucide-react';

export default function ProviderEditorDialog({ provider, busy, onClose, onSave }) {
  const editing = !!provider;
  const [draft, setDraft] = useState(() => ({
    name: provider?.name || '',
    baseURL: provider?.baseURL || 'https://api.openai.com',
    protocol: provider?.protocol || 'openai',
    protocols: provider?.protocols || [provider?.protocol || 'openai'],
    apiKey: '',
    notes: provider?.notes || '',
    website: provider?.website || '',
  }));
  const [detailsOpen, setDetailsOpen] = useState(!!(provider?.notes || provider?.website));
  const formRef = useRef(null);
  const nameRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const previous = document.activeElement;
    const dialog = formRef.current.closest('[role="dialog"]');
    nameRef.current.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
      } else if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(element => element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      requestAnimationFrame(() => { if (previous?.isConnected) previous.focus(); });
    };
  }, []);

  const field = name => ({ value: draft[name], onChange: event => setDraft(current => ({ ...current, [name]: event.target.value })) });
  return <>
    <h2 id="provider-editor-title">{editing ? '编辑服务商' : '添加服务商'}</h2>
    <p className="provider-editor-caption">保存后可同步模型，也可以手动添加模型 ID。</p>
    <form ref={formRef} onInvalidCapture={event => { const details = event.target.closest('details'); if (details) { details.open = true; setDetailsOpen(true); } }} onSubmit={event => { event.preventDefault(); if (!busy) onSave(draft); }}>
      <fieldset className="provider-editor-fields" disabled={busy}>
        <div className="provider-fields">
          <label><span>服务商名称</span><input ref={nameRef} required maxLength={100} placeholder="例如 OpenAI、硅基流动" {...field('name')} /></label>
          <label><span>接口地址</span><input type="url" required placeholder="https://api.openai.com" spellCheck={false} {...field('baseURL')} /></label>
          <label><span>默认拉取协议</span><select value={draft.protocol} onChange={event => { const protocol = event.target.value; setDraft(current => ({ ...current, protocol, protocols: [...new Set([...current.protocols, protocol])] })); }}>{protocolOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label><span>API Key{editing && <em>留空保留原密钥</em>}</span><input type="password" autoComplete="new-password" required={!editing} minLength={8} maxLength={2048} placeholder={editing ? '留空保留原密钥' : '输入服务商的 API Key'} {...field('apiKey')} /></label>
        </div>
        <ProtocolChoices value={draft.protocols} onChange={protocols => setDraft(current => ({ ...current, protocols, protocol: protocols.includes(current.protocol) ? current.protocol : protocols[0] || '' }))} />
        <p className="settings-help">选择服务商实际支持的协议；每个模型可单独设置。多个协议共用此接口地址和密钥。</p>
        <details className="provider-optional" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
          <summary>更多信息<span>可选</span><ChevronDown size={14} /></summary>
          <div className="provider-fields">
            <label><span>备注</span><input placeholder="例如 工作账号、备用线路" maxLength={1000} {...field('notes')} /></label>
            <label><span>官网链接</span><input type="url" placeholder="https://example.com" maxLength={2048} {...field('website')} /></label>
          </div>
        </details>
      </fieldset>
      <div className="modal-footer provider-editor-footer">
        <span><ShieldCheck size={13} />密钥仅在本机加密保存</span>
        <div><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={busy || !draft.protocols.length || !draft.name.trim() || !draft.baseURL.trim() || (!editing && !draft.apiKey)}>{busy && <LoaderCircle size={14} className="spin" />}{busy ? '保存中…' : '保存服务商'}</button></div>
      </div>
    </form>
  </>;
}
