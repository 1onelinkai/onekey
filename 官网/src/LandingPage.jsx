import React, { useState } from "react";
import { ArrowUpRight, ArrowRight, Check, ChevronDown, RotateCcw, Menu, X, Plus, Minus, FileCode2, ShieldCheck, Command } from "lucide-react";
import symbol from "./assets/brand/onelink-symbol.png";
import "./landing.css";

const workspaceUrl = import.meta.env.VITE_WORKSPACE_URL || "http://localhost:5174/";

const assets = import.meta.glob("./assets/clients/*.{png,svg,ico}", { eager: true, query: "?url", import: "default" });
const tools = [
  { id: "claude", name: "Claude Code", type: "终端 Agent", file: "~/.claude/settings.json", model: "claude-sonnet-4-5", models: ["claude-sonnet-4-5", "claude-opus-4-1"] },
  { id: "codex", name: "Codex", type: "终端 Agent", file: "~/.codex/config.toml", model: "gpt-5", models: ["gpt-5", "gpt-5-codex"] },
  { id: "opencode", name: "OpenCode", type: "开源 Agent", file: "~/.config/opencode/opencode.json", model: "claude-sonnet-4-5", models: ["claude-sonnet-4-5", "gpt-5"] },
  { id: "zed", name: "Zed", type: "代码编辑器", file: "~/.config/zed/settings.json", model: "claude-sonnet-4-5", models: ["claude-sonnet-4-5", "claude-opus-4-1"] },
];
const directory = [...tools, { id: "vscode", name: "VS Code", type: "安装与检测" }, { id: "hermes", name: "Hermes", type: "个人 Agent" }];
function ToolIcon({ id }) {
  const src = ["png", "svg", "ico"].map(ext => assets[`./assets/clients/${id}.${ext}`]).find(Boolean);
  return <img src={src} alt="" />;
}
function Brand() {
  return <a className="ol-brand" href="#top" aria-label="OneLinkAI 首页"><img src={symbol} alt="" /><span>OneLink<span>AI</span></span></a>;
}
function Configuration({ tool, model, compact = false }) {
  if (tool.id === "codex") return <pre className={compact ? "config-code compact" : "config-code"}><code><span className="code-muted"># OneLinkAI · 配置示意</span>{'\n'}<span className="code-key">model_provider</span> = <span className="code-value">"onelink"</span>{'\n'}<span className="code-key">model</span> = <span className="code-value">"{model}"</span>{'\n\n'}<span className="code-muted">[model_providers.onelink]</span>{'\n'}<span className="code-key">wire_api</span> = <span className="code-value">"responses"</span></code></pre>;
  const content = tool.id === "claude" ? [['ANTHROPIC_MODEL', model], ['ANTHROPIC_AUTH_TOKEN', '••••••••••••']] : tool.id === "opencode" ? [['provider', 'onelink'], ['model', `onelink/${model}`]] : [['default_model', model], ['provider', 'anthropic']];
  return <pre className={compact ? "config-code compact" : "config-code"}><code><span className="code-muted">// {tool.name} · 配置示意</span>{'\n'}{'{'}{'\n'}{content.map(([key, value], i) => <React.Fragment key={key}>{'  '}<span className="code-key">"{key}"</span>: <span className="code-value">"{value}"</span>{i < content.length - 1 ? ',' : ''}{'\n'}</React.Fragment>)}{'}'}</code></pre>;
}
function ConnectionConsole({ tool, setTool }) {
  const [stage, setStage] = useState(0);
  const [model, setModel] = useState(tool.model);
  const [done, setDone] = useState(false);
  const chooseTool = next => { setTool(next); setModel(next.model); setStage(0); setDone(false); };
  // Tool changes from the directory also reset this component through its key.
  return <div className="connection-console" id="console">
    <div className="console-top"><span><i /> CONNECTION CONSOLE</span><span>交互演示 / 非本机配置</span></div>
    <div className="console-routing"><div className="routing-source"><img src={symbol} alt="OneLinkAI" /><span>OneLinkAI</span><small>统一接入</small></div><div className="routing-wire"><span>API</span><svg viewBox="0 0 140 50" aria-hidden="true"><path d="M0 25H140" /><circle r="4" cy="25"><animate attributeName="cx" values="0;140" dur="3s" repeatCount="indefinite" /></circle></svg></div><div className="routing-target"><ToolIcon id={tool.id} /><span>{tool.name}</span><small>当前工具</small></div><span className="routing-number" aria-hidden="true">0{stage + 1}</span></div>
    <div className="console-sheet">
      <div className="console-tabs" role="tablist" aria-label="配置演示步骤">{["选择工具", "选择模型", "预览配置"].map((name, i) => <button key={name} id={`step-tab-${i}`} role="tab" aria-selected={stage === i} tabIndex={stage === i ? 0 : -1} onKeyDown={e => { const next = e.key === "ArrowRight" ? (i + 1) % 3 : e.key === "ArrowLeft" ? (i + 2) % 3 : e.key === "Home" ? 0 : e.key === "End" ? 2 : null; if (next !== null) { e.preventDefault(); setStage(next); document.getElementById(`step-tab-${next}`)?.focus(); } }} aria-controls="step-panel" onClick={() => setStage(i)}><span>0{i + 1}</span>{name}{stage > i && <Check size={12} />}</button>)}</div>
      <div className="console-step" id="step-panel" role="tabpanel" aria-labelledby={`step-tab-${stage}`}>
        {stage === 0 ? <><div className="step-heading"><h3>接通你熟悉的工具。</h3><span>01 / 03</span></div><div className="console-tools">{tools.map(t => <button key={t.id} className={t.id === tool.id ? 'selected' : ''} aria-pressed={t.id === tool.id} onClick={() => chooseTool(t)}><ToolIcon id={t.id} /><span>{t.name}<small>{t.type}</small></span>{t.id === tool.id ? <span className="tool-radio"><Check size={10} /></span> : <span className="tool-radio" />}</button>)}</div><div className="console-action"><span>安装、检测、配置，一处管理。</span><button onClick={() => setStage(1)}>选择模型 <ArrowRight size={14} /></button></div></> : stage === 1 ? <><div className="step-heading"><h3>为 {tool.name} 选择模型。</h3><span>02 / 03</span></div><div className="model-form"><label htmlFor="demo-key">平台 API Key</label><div className="demo-key" id="demo-key"><span>演示密钥</span><code>sk-••••••••••••</code><ShieldCheck size={15} /></div><label htmlFor="demo-model">模型</label><div className="model-select"><select id="demo-model" value={model} onChange={e => { setModel(e.target.value); setDone(false); }}>{tool.models.map(m => <option key={m}>{m}</option>)}</select><ChevronDown size={14} /></div><p>模型仅作交互示例，实际可用列表以平台账号为准。</p></div><div className="console-action"><button className="back-step" onClick={() => setStage(0)}>上一步</button><button onClick={() => setStage(2)}>预览配置 <ArrowRight size={14} /></button></div></> : <><div className="step-heading"><h3>{done ? "演示完成，配置已就绪。" : "写入之前，先看清楚。"}</h3><span>03 / 03</span></div><div className="code-file"><FileCode2 size={13} /><span>{tool.file}</span></div><Configuration tool={tool} model={model} compact /><div className="console-action"><span aria-live="polite">{done ? <><Check size={13} /> 仅完成页面演示</> : <><ShieldCheck size={13} /> 实际写入前自动备份</>}</span><button onClick={() => { if (done) { setDone(false); setStage(0); } else setDone(true); }}>{done ? <>重新体验 <RotateCcw size={13} /></> : <>完成演示 <Check size={14} /></>}</button></div></>}
      </div>
    </div><div className="console-bottom"><span>TOOL → MODEL → CONFIG</span><span>由你选择，由你确认。</span></div>
  </div>;
}
export default function LandingPage() {
  const [tool, setTool] = useState(tools[0]);
  const [menu, setMenu] = useState(false);
  const selectDirectory = item => { const next = tools.find(t => t.id === item.id); if (next) setTool(next); document.getElementById(next ? 'console' : 'tool-note')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  return <div className="landing" id="top">
    <header className="ol-header"><Brand /><nav aria-label="主导航" className={menu ? 'open' : ''}><a href="#tools" onClick={() => setMenu(false)}>工具目录</a><a href="#control" onClick={() => setMenu(false)}>配置保护</a><a href="#questions" onClick={() => setMenu(false)}>常见问题</a></nav><a className="header-link" href={workspaceUrl}>进入工作台 <ArrowUpRight size={16} /></a><button className="mobile-menu" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={menu ? '关闭导航' : '打开导航'}>{menu ? <X /> : <Menu />}</button></header>
    <main>
      <section className="ol-hero"><div className="hero-copy"><div className="edition"><span className="edition-mark" /> AI 工具的统一配置入口<span className="edition-no">DESKTOP / 01</span></div><h1>工具各有所长。<br />配置<span className="headline-blue">一处完成。</span></h1><p className="hero-description">Claude Code、Codex、OpenCode……<br />从工具安装到模型接入，把反复配置的时间，<br className="desktop-break" />还给真正要做的事。</p><a className="primary-link" href={workspaceUrl}>打开 OneLinkAI 工作台 <ArrowUpRight size={21} /></a><div className="hero-footnote"><Command size={14} /><span>桌面客户端 · macOS 优先验证</span></div><div className="hero-margin-note"><span>01 — 连接</span><p>熟悉的工具，<br />统一的入口。</p><svg viewBox="0 0 110 40" aria-hidden="true"><path d="M1 2 Q35 44 101 22 M88 15 L102 22 L92 34" /></svg></div></div><ConnectionConsole key={tool.id} tool={tool} setTool={setTool} /></section>
      <section className="tool-directory" id="tools"><div className="section-label"><span>01 / 工具目录</span><span>各有擅长，都在手边。</span></div><div className="directory-heading"><h2>不用换工具。<br /><span>换一种配置方式。</span></h2><p>继续使用你顺手的 Agent 和编辑器。<br />检测、安装与接入，交给同一个工作台。</p></div><div className="directory-list">{directory.map((t, i) => <button key={t.id} onClick={() => selectDirectory(t)} aria-label={`${t.name}，${tools.some(a => a.id === t.id) ? '体验配置演示' : '查看支持说明'}`}><span className="directory-index">0{i + 1}</span><ToolIcon id={t.id} /><strong>{t.name}</strong><span className="directory-type">{t.type}</span><ArrowUpRight size={17} /></button>)}</div><div className="directory-note" id="tool-note"><span>还支持 Pi、ZCode、WorkBuddy 等工具。</span><span>能力因工具而异；VS Code 当前支持安装与检测，暂不支持自动配置。</span></div></section>
      <section className="control-section" id="control"><div className="section-label"><span>02 / 配置保护</span><span>便利，也要有分寸。</span></div><div className="control-layout"><div className="control-copy"><h2>每一次修改，<br />都看得见。<br /><span>也有退路。</span></h2><p>配置文件不该成为黑盒。<br />写入前预览，变更时备份；需要时，<br />从配置记录里找回之前的版本。</p><a href="#console" className="underlined-link">在上方体验配置预览 <ArrowUpRight size={17} /></a></div><div className="diff-board"><div className="diff-top"><span><FileCode2 size={15} /> settings.json</span><span>变更预览 · 示例</span></div><div className="diff-context"><span>01</span><code>{'"env": {'}</code></div><div className="diff-line removed"><span>02</span><Minus size={12} /><code>"ANTHROPIC_MODEL": "previous-model"</code></div><div className="diff-line added"><span>02</span><Plus size={12} /><code>"ANTHROPIC_MODEL": "claude-sonnet-4-5"</code></div><div className="diff-context"><span>03</span><code>{'}'}</code></div><div className="backup-slip"><span className="slip-icon"><ShieldCheck size={22} /></span><div><strong>原配置，先留一份。</strong><p>确认写入前，自动创建备份。</p></div><Check size={16} /></div><div className="diff-bottom"><span>预览 → 备份 → 写入</span><span>你确认后，才会发生。</span></div></div></div><div className="protection-notes"><div><span>01</span><h3>失败时回滚</h3><p>多文件写入失败时，回滚已完成的变更。</p></div><div><span>02</span><h3>恢复前检查</h3><p>检查文件变化，避免覆盖后续修改。</p></div><div><span>03</span><h3>记录可追溯</h3><p>配置历史与请求记录，分别清晰查看。</p></div></div></section>
      <section className="start-section"><span className="section-label">03 / 开始使用</span><div className="start-heading"><h2>从安装到接入，<br />顺着做就好。</h2><a className="primary-link" href={workspaceUrl}>进入工作台 <ArrowUpRight size={21} /></a></div><ol className="start-steps"><li><span>01</span><div><h3>登录平台账号</h3><p>获取账号已有的 API Key 和可用模型。</p></div></li><li><span>02</span><div><h3>选择本机工具</h3><p>检测已安装的工具，或安装新的 Agent。</p></div></li><li><span>03</span><div><h3>预览并确认配置</h3><p>选择 Key 与模型，确认后写入本机配置。</p></div></li></ol></section>
      <section className="questions-section" id="questions"><div><span className="section-label">开始之前</span><h2>你可能还想问。</h2></div><div className="question-list">{[
        ['网页演示会修改我的电脑吗？', '不会。页面上的工具切换与配置确认只用于交互演示，不读取、不写入本机文件。工具检测、安装和真实配置需要通过 Electron 桌面客户端完成。'],
        ['API Key 从哪里来？', '使用你在 OneLinkAI 平台已有的 API Key。桌面客户端负责选择与使用，不提供密钥创建或删除功能。'],
        ['支持哪些操作系统？', '目前主要在 macOS ARM 上进行实机验证，自动安装需要 macOS 13 或更高版本。Windows、Linux 的实现与支持范围因工具而异，尚未完成全面实机验证。'],
        ['配置完成就代表模型可以使用吗？', '文件写入与模型连接是两个独立状态。配置生效可能需要重启工具或新建会话，真实连接测试需要可用 Key，并会消耗少量额度。']
      ].map(([q, a]) => <details key={q}><summary>{q}<Plus className="question-plus" size={17} /></summary><p>{a}</p></details>)}</div></section>
      <section className="closing-strip"><div><span>OneLinkAI / DESKTOP WORKSPACE</span><h2>工具就绪。开始做事。</h2></div><a href={workspaceUrl} aria-label="打开 OneLinkAI 工作台"><ArrowUpRight size={40} /></a></section>
    </main><footer className="ol-footer"><Brand /><span>让配置归于一处。</span><span>© {new Date().getFullYear()} OneLinkAI</span><a href="#top">回到顶部 ↑</a></footer>
  </div>;
}
