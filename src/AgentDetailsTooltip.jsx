import React, { useEffect, useRef } from 'react';
import { Info } from 'lucide-react';

export default function AgentDetailsTooltip({ client, children }) {
  const anchor = useRef(null);
  const tooltip = useRef(null);
  const timer = useRef(null);
  const id = 'agent-details-' + client.id;

  function hide() {
    clearTimeout(timer.current);
    tooltip.current?.hidePopover();
  }
  function position() {
    const panel = tooltip.current;
    if (!panel?.matches(':popover-open')) return;
    const bounds = anchor.current.getBoundingClientRect();
    const gutter = 12;
    const gap = 8;
    const below = window.innerHeight - bounds.bottom - gap - gutter;
    const above = bounds.top - gap - gutter;
    panel.style.maxHeight = Math.max(0, window.innerHeight - gutter * 2) + 'px';
    const naturalHeight = panel.getBoundingClientRect().height;
    const placeBelow = naturalHeight <= below || below >= above;
    panel.style.maxHeight = Math.max(0, placeBelow ? below : above) + 'px';
    const size = panel.getBoundingClientRect();
    panel.style.left = Math.max(gutter, Math.min(bounds.left - 12, window.innerWidth - size.width - gutter)) + 'px';
    panel.style.top = Math.max(gutter, placeBelow ? bounds.bottom + gap : bounds.top - size.height - gap) + 'px';
  }
  function show() {
    clearTimeout(timer.current);
    tooltip.current.showPopover();
    position();
  }
  function leave() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!anchor.current?.contains(document.activeElement)) hide();
    }, 120);
  }
  useEffect(() => {
    const dismissOnScroll = event => {
      if (!tooltip.current?.contains(event.target)) hide();
    };
    const escape = event => { if (event.key === 'Escape') hide(); };
    window.addEventListener('resize', position);
    document.addEventListener('scroll', dismissOnScroll, true);
    document.addEventListener('keydown', escape);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', dismissOnScroll, true);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return <span className="agent-tooltip-anchor" ref={anchor} onPointerEnter={show} onPointerLeave={leave}>
    <button type="button" className="agent-info-button" aria-label={client.name + ' 安装与更新详情'} aria-describedby={id} onFocus={show} onBlur={hide} onClick={show}><Info size={13} aria-hidden="true" /></button>
    <span className="agent-detail-tooltip" ref={tooltip} id={id} role="tooltip" popover="manual" onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={leave}>{children}</span>
  </span>;
}
