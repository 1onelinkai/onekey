import React, { useEffect, useRef, useState } from 'react';
import { Copy, FileCode2, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import ConfigCode from './ConfigCode.jsx';
const statusLabels = { present: '已读取', missing: '未创建', protected: '凭据文件', error: '无法展示' };
export default function ClientConfigViewer({ client, embedded = false }) {
  const [snapshot, setSnapshot] = useState(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const codeRef = useRef(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setSnapshot(null);
    window.onelinkDesktop.inspectConfig(client.id).then(result => {
      if (!active) return;
      if (!result.ok) throw new Error(result.error);
      setSnapshot(result.data);
      setSelectedPath(current => result.data.files.some(file => file.path === current) ? current : result.data.files[0]?.path || '');
    }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client.id, reload]);
  const file = snapshot?.files.find(item => item.path === selectedPath);
  useEffect(() => { setQuery(''); setCopyStatus(''); }, [selectedPath]);
  useEffect(() => { if (query) codeRef.current?.querySelector('.config-line-match')?.scrollIntoView({ block: 'nearest' }); }, [query]);
  async function copyContent() {
    try { await navigator.clipboard.writeText(file.content); setCopyStatus('已复制脱敏内容'); }
    catch { setCopyStatus('复制失败，请选择文本复制'); }
  }
  return <>
    {!embedded && <div className="config-reader-heading"><FileCode2 size={16} /><h2>{client.name} 配置文件</h2><span className="config-reader-caption">只读 · 密钥已脱敏</span></div>}
    {error && <div className="notice error-message" role="alert">{error}</div>}
    {loading && !snapshot ? <div className="model-loading"><LoaderCircle size={16} className="spin" />正在读取配置文件…</div> : snapshot && <>
      <div className="config-reader-layout" aria-busy={loading}>
        <div className="config-reader-filebar"><nav className="config-file-list" aria-label="配置文件列表">
          {snapshot.files.map(item => <button key={item.path} className={selectedPath === item.path ? 'selected' : ''} aria-pressed={selectedPath === item.path} title={item.path} onClick={() => setSelectedPath(item.path)}><span>{item.label}</span><small>{statusLabels[item.status]}</small></button>)}
        </nav><button className="text-button config-reload" title="重新读取本机文件" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={13} className={loading ? 'spin' : ''} />重新读取</button></div>
        <section className="config-file-body">
          {file && <>
            <div className="config-file-meta" title={file.path + (file.modifiedAt ? '\n修改时间：' + new Date(file.modifiedAt).toLocaleString('zh-CN') : '')}><code>{file.path}</code><span>{file.format.toUpperCase()} · 已脱敏</span></div>
            {file.status === 'present' ? <>
              <div className="config-file-toolbar"><label><Search size={13} /><input aria-label="搜索当前配置文件" placeholder="查找参数或内容" value={query} onChange={event => setQuery(event.target.value)} /></label><button className="text-button" onClick={copyContent}><Copy size={13} />复制脱敏内容</button></div>
              {copyStatus && <span className="config-copy-status" role="status">{copyStatus}</span>}
              <ConfigCode content={file.content} format={file.format} path={file.path} query={query} codeRef={codeRef} />
            </> : <div className="config-file-empty"><FileCode2 size={24} /><strong>{statusLabels[file.status]}</strong><p>{file.message}</p>{file.status === 'missing' && <small>此应用可能尚未生成该文件，或使用了其他 Profile / 项目配置。</small>}</div>}
          </>}
        </section>
      </div>
      <details className="config-reader-notes"><summary>读取范围与脱敏说明</summary>{snapshot.notes.map(note => <p key={note}>{note}</p>)}</details>
    </>}
  </>;
}
