import React, { useEffect, useState } from 'react';

export default function SoftwareUpdate() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const api = window.onelinkDesktop;
    if (!api?.softwareUpdateStatus) return;
    let active = true;
    const refresh = () => api.softwareUpdateStatus().then(result => {
      if (active && result.ok) setState(result.data);
    }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const labels = { idle: '检查软件更新', current: '暂无可用更新 · 重新检查', checking: '正在检查软件更新…',
    available: '发现新版 · 下载更新', downloading: `正在下载软件更新 ${state?.percent || 0}%`,
    preparing: '正在验证并准备软件更新…',
    ready: '更新已就绪 · 重启安装', installing: '正在重启安装…', error: '软件更新失败 · 重试', disabled: '当前运行方式不支持更新' };
  return <span className="software-update">
    {state?.currentVersion && <span className="version">v{state.currentVersion}</span>}
    {state && <button className="text-button" disabled={['disabled', 'checking', 'downloading', 'preparing', 'installing'].includes(state.status)}
      title={state.error || error || '检查 OneLinkAI 软件的新版本'} onClick={async () => {
        try {
          const result = await window.onelinkDesktop.checkSoftwareUpdate();
          if (result.ok) { setState(result.data); setError(''); }
          else setError(result.error);
        } catch (cause) { setError(cause.message); }
      }}>{labels[state.status]}</button>}
    {error && <span role="alert">{error}</span>}
  </span>;
}
