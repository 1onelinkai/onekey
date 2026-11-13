import React, { useRef, useState } from 'react';
import { Ellipsis, FileCode2, Trash2 } from 'lucide-react';

export default function AgentCardMenu({ client, disabled, onInspect, onUninstall }) {
  const trigger = useRef(null);
  const panel = useRef(null);
  const [open, setOpen] = useState(false);
  function dismiss() {
    panel.current.hidePopover();
    trigger.current.focus();
  }
  function show() {
    panel.current.togglePopover();
    if (!panel.current.matches(':popover-open')) return;
    const anchor = trigger.current.getBoundingClientRect();
    const size = panel.current.getBoundingClientRect();
    panel.current.style.left = Math.max(12, Math.min(anchor.right - size.width, innerWidth - size.width - 12)) + 'px';
    panel.current.style.top = Math.max(12, anchor.top >= size.height + 20 ? anchor.top - size.height - 8 : Math.min(anchor.bottom + 8, innerHeight - size.height - 12)) + 'px';
    panel.current.querySelector('button').focus();
  }
  return <>
    <button ref={trigger} type="button" className="icon-button agent-more-button" aria-label={client.name + ' 更多操作'} title="更多操作" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={show}><Ellipsis size={17} /></button>
    <div ref={panel} className="agent-card-menu" popover="auto" role="menu" aria-label={client.name + ' 更多操作'} onToggle={event => setOpen(event.newState === 'open')} onKeyDown={event => {
      const items = [...panel.current.querySelectorAll('button')];
      const current = items.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    }}>
      <button role="menuitem" aria-label={'查看 ' + client.name + ' 本机配置'} onClick={() => { dismiss(); onInspect(); }}><FileCode2 size={14} />本机配置</button>
      {client.installed && <button role="menuitem" className="agent-menu-danger" onClick={() => { dismiss(); onUninstall(); }}><Trash2 size={14} />卸载客户端</button>}
    </div>
  </>;
}
