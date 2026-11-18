import { protocolOptions } from './ProtocolChoices.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import { Search, LoaderCircle, RefreshCw } from 'lucide-react';

function category(model) {
  const id = (model.id + ' ' + model.name).toLowerCase();
  if (/rerank/.test(id)) return '重排序';
  if (/embed|bge-|bce-/.test(id)) return '向量';
  if (/video|wan[\d-]|hunyuanvideo|cogvideo/.test(id)) return '视频';
  if (/tts|asr|speech|audio|whisper|cosyvoice|sensevoice/.test(id)) return '语音';
  if (/image|flux|stable.diffusion|kolors|dall-e|sdxl/.test(id)) return '图像';
  if (/vision|(?:^|[-/])vl(?:[-/]|$)|ocr/.test(id)) return '视觉';
  return '对话';
}

export default function ModelImportDialog({ provider, onClose, onConfirm, busy }) {
  const [protocol, setProtocol] = useState(provider.protocol);
  const [remote, setRemote] = useState([]);
  const [selected, setSelected] = useState(() => new Set(provider.models.map(model => model.id)));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('全部');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    window.onelinkDesktop.fetchLocalModels({ providerId: provider.id, protocol }).then(result => {
      if (!active) return;
      if (!result.ok) throw new Error(result.error);
      setRemote(current => {
        const merged = new Map(current.map(model => [model.id, model]));
        result.data.forEach(model => {
          const previous = merged.get(model.id);
          merged.set(model.id, { ...model, protocols: [...new Set([...(previous?.protocols || []), ...(model.protocols || [protocol])])] });
        });
        return [...merged.values()];
      });
    }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [provider.id, protocol, reload]);
  const existing = useMemo(() => new Set(provider.models.map(model => model.id)), [provider.models]);
  const models = useMemo(() => [...new Map([...remote, ...provider.models].map(model => [model.id, model])).values()], [remote, provider.models]);
  const categories = ['全部', ...new Set(models.map(category)), '已选择'];
  const visible = models.filter(model => (filter === '全部' || (filter === '已选择' ? selected.has(model.id) : category(model) === filter)) && (model.id + ' ' + model.name).toLowerCase().includes(query.toLowerCase()));
  const added = [...selected].filter(id => !existing.has(id)).length;
  const removed = [...existing].filter(id => !selected.has(id)).length;
  function toggle(id) { setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function selectVisible(value) { setSelected(current => { const next = new Set(current); visible.forEach(model => value ? next.add(model.id) : next.delete(model.id)); return next; }); }
  return <>
    <h2>选择模型</h2>
    <p className="model-import-caption">{provider.name} · 勾选加入，取消勾选移除。确认后生效。</p>
    <label className="model-fetch-protocol">拉取协议<select aria-label="拉取协议" value={protocol} disabled={busy || loading} onChange={event => setProtocol(event.target.value)}>{protocolOptions.filter(([id]) => (provider.protocols || [provider.protocol]).includes(id)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <p className="settings-help">新模型仅记录拉取时选择的协议，其他协议请在模型资料中确认后勾选。</p>
    <div className="model-import-tools"><label className="search"><Search size={15} /><input autoFocus aria-label="搜索待选模型" placeholder="搜索模型名称或 ID" value={query} onChange={event => setQuery(event.target.value)} /></label><button className="text-button" disabled={loading || busy} onClick={() => setReload(value => value + 1)}><RefreshCw size={14} className={loading ? 'spin' : ''} />重新拉取</button></div>
    <div className="model-category-tabs" role="tablist" aria-label="待选模型分类">{categories.map(item => <button key={item} role="tab" className={filter === item ? 'selected' : ''} aria-selected={filter === item} onClick={() => setFilter(item)}>{item}<span>{item === '全部' ? models.length : item === '已选择' ? selected.size : models.filter(model => category(model) === item).length}</span></button>)}</div>
    <div className="model-import-actions"><span>显示 {visible.length} 个 · 已选 {selected.size} 个</span><button className="text-button" disabled={busy || loading} onClick={() => selectVisible(true)}>全选当前结果</button><button className="text-button" disabled={busy || loading} onClick={() => selectVisible(false)}>取消当前结果</button></div>
    <div className="model-import-list" aria-busy={loading}>
      {loading ? <div className="model-loading"><LoaderCircle size={20} className="spin" />正在拉取可用模型…</div> : error ? <div className="notice error-message" role="alert">{error}</div> : visible.length ? visible.map(model => <label className={'model-import-row' + (selected.has(model.id) ? ' selected' : '')} key={model.id}><input type="checkbox" checked={selected.has(model.id)} disabled={busy} onChange={() => toggle(model.id)} /><span><strong>{model.name || model.id}</strong><small>{model.id}</small></span><em>{category(model)}</em>{existing.has(model.id) && <small>已加入</small>}</label>) : <div className="model-loading">没有匹配的模型</div>}
    </div>
    <div className="modal-footer model-import-footer"><span>新增 {added} 个 · 移除 {removed} 个</span><button className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy || loading || !!error} onClick={() => onConfirm(models.filter(model => selected.has(model.id)).map(model => ({ id: model.id, name: model.name || model.id, protocols: model.protocols || [protocol] })))}>{busy && <LoaderCircle size={14} className="spin" />}确认选择</button></div>
  </>;
}
