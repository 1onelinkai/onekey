import React, { useId, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import './request-filters.css';

function showPanel(trigger, panel) {
  panel.showPopover();
  const anchor = trigger.getBoundingClientRect();
  const size = panel.getBoundingClientRect();
  panel.style.left = Math.max(12, Math.min(anchor.left, innerWidth - size.width - 12)) + 'px';
  panel.style.top = Math.max(12, anchor.bottom + size.height + 8 <= innerHeight - 12
    ? anchor.bottom + 8 : Math.min(anchor.top - size.height - 8, innerHeight - size.height - 12)) + 'px';
}

export function SearchFilter({ label, value, options = [], onChange }) {
  const id = useId();
  const trigger = useRef(null), panel = useRef(null), search = useRef(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const choices = [{ value: '', label }, ...options];
  const term = query.trim().toLowerCase();
  const matches = choices.filter(option => !term || `${option.label} ${option.value}`.toLowerCase().includes(term));
  const selected = choices.find(option => String(option.value) === String(value));
  function close() { panel.current.hidePopover(); trigger.current.focus(); }
  return <div className="request-filter-control">
    <button ref={trigger} type="button" className="request-filter-trigger" aria-label={label} aria-haspopup="listbox" aria-controls={id} aria-expanded={open} title={selected?.label || label} onClick={() => {
      if (open) return close();
      setQuery(''); showPanel(trigger.current, panel.current); search.current.focus();
    }}><span>{selected?.label || label}</span><ChevronDown size={14} /></button>
    <div ref={panel} popover="auto" className="request-filter-popover" onToggle={event => setOpen(event.newState === 'open')} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && (event.target !== search.current || ['ArrowDown', 'ArrowUp'].includes(event.key))) {
        event.preventDefault();
        const items = [...panel.current.querySelectorAll('[role="option"]')];
        const index = items.indexOf(document.activeElement);
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    }}>
      <div className="request-filter-search"><Search size={14} /><input ref={search} aria-label={`搜索${label.replace(/^全部\s*/, '')}`} placeholder="搜索名称或 ID…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); panel.current.querySelector('[role="option"]')?.click(); }
      }} /></div>
      <div id={id} role="listbox" aria-label={label} className="request-filter-options">
        {matches.map(option => <button type="button" role="option" aria-selected={String(option.value) === String(value)} key={option.value} title={option.label} onClick={() => { onChange(String(option.value)); close(); }}><span>{option.label}</span>{String(option.value) === String(value) && <Check size={14} />}</button>)}
        {!matches.length && <div className="request-filter-empty" role="status">没有匹配的选项</div>}
      </div>
    </div>
  </div>;
}

const pad = value => String(value).padStart(2, '0');
const dayId = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromDay = value => new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
const monthOf = date => new Date(date.getFullYear(), date.getMonth(), 1);

export function RequestDateRange({ startTime, endTime, onChange }) {
  const trigger = useRef(null), panel = useRef(null);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ start: '', end: '', startClock: '00:00', endClock: '23:59' });
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [selectingEnd, setSelectingEnd] = useState(false), [hover, setHover] = useState('');
  const label = startTime || endTime ? `${startTime.slice(0, 16) || '不限'} 至 ${endTime.slice(0, 16) || '不限'}` : '选择时间范围';
  const invalid = range.start && range.end && `${range.start} ${range.startClock}` > `${range.end} ${range.endClock}`;
  function close() { panel.current.hidePopover(); trigger.current.focus(); }
  function choose(day) {
    if (!selectingEnd) { setRange(current => ({ ...current, start: day, end: '' })); setSelectingEnd(true); }
    else {
      setRange(current => ({ ...current, start: day < current.start ? day : current.start, end: day < current.start ? current.start : day }));
      setSelectingEnd(false); setHover('');
    }
  }
  function shortcut(days) {
    const end = new Date(), start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days + 1);
    setRange({ start: dayId(start), end: dayId(end), startClock: '00:00', endClock: '23:59' });
    setMonth(monthOf(start)); setSelectingEnd(false); setHover('');
  }
  const previewEnd = selectingEnd && hover ? hover : range.end;
  const low = previewEnd && previewEnd < range.start ? previewEnd : range.start;
  const high = previewEnd && previewEnd < range.start ? range.start : previewEnd;
  return <div className="request-range-control">
    <button ref={trigger} type="button" className="request-filter-trigger request-range-trigger" aria-label="请求时间范围" aria-haspopup="dialog" aria-expanded={open} title={label} onClick={() => {
      if (open) return close();
      setRange({ start: startTime.slice(0, 10), end: endTime.slice(0, 10), startClock: startTime.slice(11, 16) || '00:00', endClock: endTime.slice(11, 16) || '23:59' });
      setMonth(monthOf(startTime ? fromDay(startTime) : new Date())); setSelectingEnd(false); setHover('');
      showPanel(trigger.current, panel.current); panel.current.querySelector('button').focus();
    }}><CalendarDays size={15} /><span>{label}</span><ChevronDown size={14} /></button>
    <div ref={panel} popover="auto" role="dialog" aria-label="选择请求时间范围" className="request-filter-popover request-range-popover" onToggle={event => setOpen(event.newState === 'open')} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
      <div className="request-range-shortcuts"><strong>时间范围</strong>{[[1, '今天'], [7, '近 7 天'], [30, '近 30 天']].map(([days, text]) => <button type="button" key={days} onClick={() => shortcut(days)}>{text}</button>)}</div>
      <div className="request-range-calendars">
        {[0, 1].map(offset => {
          const current = new Date(month.getFullYear(), month.getMonth() + offset, 1);
          const days = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
          const blank = (current.getDay() + 6) % 7;
          return <section className="request-range-month" key={offset} aria-label={`${current.getFullYear()}年${current.getMonth() + 1}月`}>
            <div className="request-range-month-title">
              {offset === 0 ? <button type="button" aria-label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={15} /></button> : <span />}
              <strong>{current.getFullYear()}年 {current.getMonth() + 1}月</strong>
              {offset === 1 ? <button type="button" aria-label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={15} /></button> : <span />}
            </div>
            <div className="request-range-days">
              {['一', '二', '三', '四', '五', '六', '日'].map(day => <span className="weekday" key={day}>{day}</span>)}
              {Array.from({ length: blank }, (_, i) => <span key={`blank-${i}`} />)}
              {Array.from({ length: days }, (_, index) => {
                const day = dayId(new Date(current.getFullYear(), current.getMonth(), index + 1));
                const edge = day === range.start || day === range.end;
                return <button type="button" key={day} aria-label={day} aria-pressed={edge} className={[edge && 'range-edge', low && high && day >= low && day <= high && 'in-range', day === dayId(new Date()) && 'is-today'].filter(Boolean).join(' ')} onMouseEnter={() => selectingEnd && setHover(day)} onClick={() => choose(day)}>{index + 1}</button>;
              })}
            </div>
          </section>;
        })}
      </div>
      <div className="request-range-times"><label><span>{range.start || '开始日期'}</span><input type="time" aria-label="范围开始时刻" required value={range.startClock} onChange={event => setRange(current => ({ ...current, startClock: event.target.value }))} /></label><span>至</span><label><span>{range.end || '结束日期'}</span><input type="time" aria-label="范围结束时刻" required value={range.endClock} onChange={event => setRange(current => ({ ...current, endClock: event.target.value }))} /></label></div>
      <div className="request-range-hint" role="status">{invalid ? '结束时间不能早于开始时间' : selectingEnd ? '请选择结束日期' : '依次选择开始、结束日期，可跨月选择'}</div>
      <div className="request-range-footer"><button type="button" onClick={() => { onChange('', ''); close(); }}>清除时间</button><div><button type="button" onClick={close}>取消</button><button type="button" className="range-confirm" disabled={!range.start || !range.end || !range.startClock || !range.endClock || invalid} onClick={() => { onChange(`${range.start} ${range.startClock}:00`, `${range.end} ${range.endClock}:59`); close(); }}>确定范围</button></div></div>
    </div>
  </div>;
}
