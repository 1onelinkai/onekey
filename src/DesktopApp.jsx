import React, { useEffect, useRef, useState } from "react";
import {
  Link2,
  KeyRound,
  House,
  Clock3,
  Activity,
  RefreshCw,
  Zap,
  Check,
  X,
  ArrowRight,
  ShieldCheck,
  LoaderCircle,
  ArrowLeft,
  RotateCcw,
  Monitor,
  CheckCircle2,
  Search,
  ChevronDown,
  ArrowUpRight,
  Server,
  ExternalLink,
  Download,
  LogIn,
  LogOut,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Pencil,
  FileCode2,
  Play,
} from "lucide-react";
import "./desktop.css";
import "./soft-theme.css";
import { parseConfigSource, selectAvailableModel, configModelPresentation } from "./config-selection.mjs";
import requestFields from "./request-fields.json";
import clientCapabilities from "./client-capabilities.json";
import clientSettingNotes from "./client-setting-notes.json";
import ModelSettingsFields from "./ModelSettingsFields.jsx";
import ModelImportDialog from "./ModelImportDialog.jsx";
import ClientConfigViewer from "./ClientConfigViewer.jsx";
import ConfigCode from "./ConfigCode.jsx";
import AgentCardMenu from "./AgentCardMenu.jsx";
import AgentDetailsTooltip from "./AgentDetailsTooltip.jsx";
import SoftwareUpdate from "./SoftwareUpdate.jsx";
const emptyProvider = () => ({ name: "", baseURL: "https://api.openai.com", protocol: "openai", apiKey: "", notes: "", website: "" });
const emptyModel = () => ({ id: "", name: "", contextWindow: "", maxTokens: "", supportsImages: "", supportsTools: "", supportsReasoning: "" });
import brandSymbol from "./assets/brand/onelink-symbol.png";
import brandWordmark from "./assets/brand/onelink-wordmark.png";

function requestValue(key, value) {
  if (value == null || value === "") return "—";
  if (key === "invokeTime") return time(value);
  const labels = {
    dataRetentionSwitch: { 0: '完整日志', 1: '隐私模式（不保留正文）' },
    consumptionType: { 1: '余额', 2: '赠金', 3: '组合', 4: '免费', 5: '信用支付' },
    endReason: { stop: '正常结束', length: '长度限制', content_filter: '内容过滤', tool_calls: '工具调用', all_failed: '所有供应商均失败' },
    callType: { async: '异步', sync: '同步' },
    taskStatus: { processing: '处理中', success: '成功', failed: '失败' },
    responseStatus: { success: '成功', processing: '处理中' },
  };
  if (labels[key]?.[value]) return labels[key][value];
  if (key === "trainPolicy") return Number(value) === 1 ? "有数据培训" : Number(value) === 0 ? "无数据培训" : String(value);
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}
function keyTypeLabel(key) { return key.keyType === 1 ? '组织密钥' : key.keyType === 0 ? '个人密钥' : '类型未返回'; }
const usageFields = requestFields.slice(7, 22);
const emptyRequestFilters = () => ({ userId: '', modelId: '', supplierId: '', modelTypes: '', startTime: '', endTime: '' });
const clientLogos = import.meta.glob("./assets/clients/*.{png,svg,ico}", {
  eager: true,
  query: "?url",
  import: "default",
});

const catalog = [
  ["workbuddy", "WorkBuddy", "腾讯", "W", "green"],
  ["claude", "Claude Code", "Anthropic", "✳", "peach"],
  ["claude-desktop", "Claude Desktop", "Anthropic", "✳", "peach"],
  ["codex", "Codex", "OpenAI", "⌘", "mint"],
  ["gemini", "Gemini CLI", "Google", "✦", "blue"],
  ["grok", "Grok Build", "xAI", "◌", "gray"],
  ["opencode", "OpenCode", "Open source", "▣", "gray"],
  ["openclaw", "OpenClaw", "Open source", "◆", "rose"],
  ["pi", "Pi", "Terminal agent", "π", "yellow"],
  ["minimax", "MiniMax Code", "MiniMax", "〽", "peach"],
  ["deepseek-harness", "DeepSeek Harness CLI", "DeepSeek", "◈", "mint"],
  ["deepseek-harness-desktop", "DeepSeek Harness Desktop", "DeepSeek", "◈", "mint"],
  ["zed", "Zed", "Code editor", "Z", "blue"],
  ["vscode", "VS Code", "Microsoft", "⌁", "sky"],
  ["zcode", "ZCode", "智谱 AI", "Z", "lavender"],
  ["hermes", "Hermes", "Nous Research", "H", "rose"],
].map(([id, name, sub, glyph, color]) => ({ id, name, sub, glyph, color }));
const pages = {
  home: {
    title: "工作空间概览",
    subtitle: "你的模型、密钥与 AI 工具，尽在一处。",
  },
  keys: { title: "API Keys", subtitle: "查看当前空间的个人密钥与组织密钥。" },
  history: { title: "配置记录", subtitle: "查看本机配置变更与备份。" },
  requests: { title: "请求记录", subtitle: "查看 API Key 的请求与使用情况。" },
  providers: { title: "模型服务商", subtitle: "管理自己的 API 地址、密钥和模型，一键配置到本机客户端。" },
};
const api = window.onelinkDesktop;
async function invoke(method, value) {
  if (!api) throw new Error("请在 OneLinkAI 桌面应用中操作");
  const r = await api[method](value);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
function Icon({ c }) {
  const logoId = c.id === "claude-desktop" ? "claude" : c.id === "deepseek-harness-desktop" ? "deepseek-harness" : c.id;
  const logo = ["png", "svg", "ico"]
    .map((extension) => clientLogos[`./assets/clients/${logoId}.${extension}`])
    .find(Boolean);
  return (
    <span className={"client-icon " + c.color}>
      <img src={logo} alt="" aria-hidden="true" draggable="false" />
    </span>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <img src={brandSymbol} alt="" aria-hidden="true" />
      </span>
      <img className="brand-wordmark" src={brandWordmark} alt="OneLinkAI" />
    </div>
  );
}
const time = (value) => {
  if (value == null || value === "") return "—";
  const normalized = typeof value === "number" || /^\d{10,13}$/.test(String(value))
    ? Number(value) * (Number(value) < 1e12 ? 1000 : 1)
    : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
      ? value.replace(" ", "T") + "+08:00"
      : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
export default function DesktopApp() {
  const [logged, setLogged] = useState(false),
    [page, setPage] = useState("home"),
    [org, setOrg] = useState(""),
    [organizations, setOrganizations] = useState([]),
    [account, setAccount] = useState(null),
    [keys, setKeys] = useState([]),
    [wallet, setWallet] = useState(null),
    [detected, setDetected] = useState([]),
    [history, setHistory] = useState([]),
    [busy, setBusy] = useState(""),
    [scanning, setScanning] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [showAll, setShowAll] = useState(false),
    [lastScan, setLastScan] = useState(null);
  const [modal, setModal] = useState(null),
    [installPlan, setInstallPlan] = useState(null),
    [installation, setInstallation] = useState(null),
    [updates, setUpdates] = useState({}),
    [checkingUpdates, setCheckingUpdates] = useState(false),
    [logDetail, setLogDetail] = useState(null),
    [uninstallPlan, setUninstallPlan] = useState(null),
    [activeKey, setActiveKey] = useState(""),
    [clientId, setClientId] = useState(""),
    [model, setModel] = useState(""),
    [protocol, setProtocol] = useState("anthropic"),
    [models, setModels] = useState([]),
    [modelsLoading, setModelsLoading] = useState(false),
    [modelError, setModelError] = useState(""),
    [modelQuery, setModelQuery] = useState(""),
    [modelCategory, setModelCategory] = useState("全部"),
    [plan, setPlan] = useState(null),
    [result, setResult] = useState(null),
    [tested, setTested] = useState(false),
    [requests, setRequests] = useState({
      connected: false,
      items: [],
      total: null,
    }),
    [requestKey, setRequestKey] = useState(""),
    [requestPage, setRequestPage] = useState(1),
    [requestPageSize, setRequestPageSize] = useState(20),
    [keyTypeFilter, setKeyTypeFilter] = useState(''),
    [requestDraft, setRequestDraft] = useState(emptyRequestFilters),
    [requestFilters, setRequestFilters] = useState(emptyRequestFilters),
    [requestOptions, setRequestOptions] = useState({ models: [], suppliers: [], types: [] }),
    [requestOptionsError, setRequestOptionsError] = useState(''),
    [requestLoading, setRequestLoading] = useState(false),
    [requestReload, setRequestReload] = useState(0);
  const [localProviders, setLocalProviders] = useState([]),
    [localModels, setLocalModels] = useState([]),
    [providerId, setProviderId] = useState(""),
    [providerDraft, setProviderDraft] = useState(emptyProvider),
    [modelDraft, setModelDraft] = useState(emptyModel);
  const [modelOverrides, setModelOverrides] = useState({});
  const [configPane, setConfigPane] = useState('local');
  const [previewPath, setPreviewPath] = useState('');
  const [dshProfile, setDshProfile] = useState('web');
  useEffect(() => { setPlan(null); setTested(false); }, [clientId, model, protocol, activeKey, providerId, modelOverrides, dshProfile]);
  const returningModelOverrides = useRef(null);
  const configDetailsRef = useRef(null);
  const configInspectorRef = useRef(null);
  useEffect(() => {
    if (plan && configPane === 'preview' && configDetailsRef.current && configInspectorRef.current) {
      configDetailsRef.current.scrollTo({ top: configInspectorRef.current.offsetTop, behavior: 'smooth' });
    }
  }, [plan, configPane]);
  useEffect(() => { setModelOverrides(returningModelOverrides.current || {}); returningModelOverrides.current = null; }, [model, clientId, providerId, activeKey, modal?.type]);
  const [editingProvider, setEditingProvider] = useState("");
  const [editingModel, setEditingModel] = useState(null);
  const [requestSummary, setRequestSummary] = useState(null);
  const [requestError, setRequestError] = useState("");
  const [collapsedProviders, setCollapsedProviders] = useState({});
  const preferredModel = useRef('');
  const modelClient = useRef('');
  const modelPickerRef = useRef(null);
  const loadId = useRef(0),
    orgId = useRef(0);
  const orgName = organizations.find(item => item.id === org)?.name || "选择组织";
  const modelCategories = ["全部", ...new Set(models.map(item => item.category || "其他"))];
  const filteredModels = models.filter(item =>
    (modelCategory === "全部" || (item.category || "其他") === modelCategory) &&
    (item.id + item.name).toLowerCase().includes(modelQuery.toLowerCase()));
  async function acceptAccount(status) {
    setAccount(status);
    setLogged(!!status.authenticated);
    if (status.authenticated) {
      const list = await invoke("organizations");
      setOrganizations(list);
      setOrg(list[0]?.id || "");
      setLogged(true);
    }
  }
  async function refreshLocal() {
    const [providers, models] = await Promise.all([invoke("localProviders"), invoke("localModels")]);
    setLocalProviders(providers); setLocalModels(models); setProviderId(current => providers.some(p => p.id === current) ? current : providers[0]?.id || "");
  }
  const clients = catalog.map((c) => ({
      ...c,
      ...detected.find((d) => d.id === c.id),
    })),
    installed = clients.filter((c) => c.installed),
    selected = clients.find((c) => c.id === clientId),
    key = keys.find((k) => k.id === activeKey);
  const visibleKeys = keys.filter(k => (keyTypeFilter === '' || String(k.keyType) === keyTypeFilter) && (k.name + k.masked).toLowerCase().includes(query.toLowerCase()));
  const connected = new Map();
  for (const client of clients) {
    if (client.configuration?.state === 'configured') connected.set(client.id, client.configuration);
  }
  const notify = (text) => {
    setToast(text);
    setTimeout(() => setToast(""), 3500);
  };
  async function run(label, fn) {
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy("");
    }
  }
  async function scan() {
    setScanning(true);
    try {
      setDetected(await invoke("detect"));
      setLastScan(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }
  async function openInstall(client, update = false) {
    setInstallPlan(null);
    if (installation?.client !== client.id || !installation?.running) setInstallation(null);
    setError("");
    setModal({ type: "install", client, update });
    await run("install-plan", async () => {
      const value = await invoke(update ? 'updatePlan' : 'installPlan', client.id);
      setInstallPlan(value);
      if (update) setUpdates(previous => ({ ...previous, [client.id]: value }));
    });
  }
  async function openUninstall(client) {
    setUninstallPlan(null);
    setError('');
    setModal({ type: 'uninstall', client });
    await run('uninstall-plan', async () => setUninstallPlan(await invoke('uninstallPlan', client.id)));
  }
  async function openRequest(record) {
    const currentOrg = org;
    const currentId = orgId.current;
    setLogDetail(record.fields || {});
    setModal({ type: "request", record });
    await run("request-detail", async () => {
      const detail = await invoke("requestDetail", { org: currentOrg, id: record.id });
      if (currentId === orgId.current) setLogDetail(previous => ({ ...previous, ...Object.fromEntries(Object.entries(detail).filter(([, value]) => value != null)) }));
    });
  }
  useEffect(() => {
    if (!installation?.running) return;
    let disposed = false;
    const timer = setInterval(async () => {
      try {
        const status = await invoke("installStatus");
        if (disposed) return;
        setInstallation(status);
        if (!status.running) {
          scan();
        }
      } catch (e) { if (!disposed) setError(e.message); }
    }, 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, [installation?.running]);
  useEffect(() => {
    if (!api || !lastScan || installation?.running) return;
    let disposed = false, running = false, lastChecked = 0;
    async function checkInBackground() {
      if (disposed || running) return;
      running = true;
      setCheckingUpdates(true);
      try {
        const results = await invoke('checkUpdates');
        if (!disposed) setUpdates(Object.fromEntries(results.map(item => [item.client, item])));
      } catch {
        if (!disposed) setUpdates(Object.fromEntries(detected.filter(item => item.installed).map(item => [item.id, { status: 'error', error: '版本服务暂不可用，将在后台重试。' }])));
      } finally {
        lastChecked = Date.now();
        running = false;
        if (!disposed) setCheckingUpdates(false);
      }
    }
    const onFocus = () => { if (Date.now() - lastChecked >= 5 * 60 * 1000) checkInBackground(); };
    checkInBackground();
    const timer = setInterval(checkInBackground, 15 * 60 * 1000);
    window.addEventListener('focus', onFocus);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [lastScan, installation?.running]);
  useEffect(() => {
    return api?.onScan(() => { setPage("home"); scan(); });
  }, []);
  useEffect(() => {
    if (api) {
      invoke('installStatus').then(status => { if (status.client) setInstallation(status); }).catch(e => setError(e.message));
      invoke("authStatus").then(status => {
        // The test fixture retains the explicit demo entry button.
        if (status.demo) setAccount(status);
        else return acceptAccount(status);
      }).catch(e => setError(e.message));
      scan();
      invoke("history")
        .then(setHistory)
        .catch((e) => setError(e.message));
      refreshLocal().catch((e) => setError(e.message));
    }
  }, []);
  useEffect(() => {
    const id = ++orgId.current;
    setKeys([]);
    setKeyTypeFilter('');
    setWallet(null);
    setRequestKey("");
    setRequestPage(1);
    setRequestDraft(emptyRequestFilters());
    setRequestFilters(emptyRequestFilters());
    setRequestSummary(null);
    setRequests({ connected: false, items: [], total: null });
    if (api && logged && org) {
      invoke("requests", { org, page: 1, pageSize: 20 }).then(data => { if (id === orgId.current) setRequestSummary(data); }).catch(() => { if (id === orgId.current) setRequestSummary({ failed: true }); });
      invoke("keys", org)
        .then((data) => {
          if (id === orgId.current) setKeys(data);
        })
        .catch((e) => { if (id === orgId.current) setError(e.message); });
      invoke("wallet", org)
        .then((data) => {
          if (id === orgId.current) setWallet(data);
        })
        .catch((e) => { if (id === orgId.current) setError(e.message); });
    }
  }, [org, logged]);
  useEffect(() => {
    let active = true;
    setRequestOptions({ models: [], suppliers: [], types: [] });
    setRequestOptionsError('');
    if (page === 'requests' && api && logged && org) invoke('requestOptions', { org })
      .then(value => { if (active) setRequestOptions(value); })
      .catch(e => { if (active) setRequestOptionsError(e.message); });
    return () => { active = false; };
  }, [page, org, logged]);
  useEffect(() => {
    let active = true;
    setRequestLoading(false);
    setRequestError("");
    if (page === "requests" && api && logged && org) {
      setRequestLoading(true);
      invoke("requests", { org, keyId: requestKey, page: requestPage, pageSize: requestPageSize, ...requestFilters })
        .then(data => { if (active) { setRequests(data); setError(''); } })
        .catch(e => { if (active) { setRequests({ connected: false, items: [], total: null }); setRequestError(e.message); } })
        .finally(() => { if (active) setRequestLoading(false); });
    }
    return () => { active = false; };
  }, [page, org, requestKey, logged, requestPage, requestPageSize, requestFilters, requestReload]);
  const chooseClient = (id, platformSource = !!activeKey) => {
    modelClient.current = id;
    preferredModel.current = connected.get(id)?.model || '';
    if (id !== clientId) {
      setModel(selectAvailableModel(models, preferredModel.current));
      setModelQuery(''); setModelCategory('全部');
    }
    setClientId(id);
    setPlan(null);
    setTested(false);
    const preferred = id === "gemini" ? "gemini"
      : ["claude", "claude-desktop"].includes(id) ? "anthropic"
      : ["codex", "grok"].includes(id) ? "responses" : "openai";
    const allowed = id === "gemini" ? ["gemini"]
      : ["claude", "claude-desktop"].includes(id) ? ["anthropic"]
      : ["codex", "grok"].includes(id) ? ["responses"]
      : ["zed", "workbuddy", "hermes"].includes(id) ? ["openai"]
      : ["anthropic", "openai", "responses"];
    setProtocol(current => platformSource || !allowed.includes(current) ? preferred : current);
  };
  useEffect(() => {
    if (modal?.type === "configure" && !clientId) {
      const first = installed.find(client => client.supported);
      if (first) chooseClient(first.id);
    }
  }, [detected, modal?.type, clientId]);
  useEffect(() => {
    modelPickerRef.current?.querySelector('button.picked')?.scrollIntoView({ block: 'nearest' });
  }, [model, modelsLoading, clientId]);
  async function loadModels(id, preferred = model || preferredModel.current) {
    const current = ++loadId.current;
    const requestedClient = modelClient.current;
    setTested(false); setPlan(null);
    setModelQuery('');
    setModels([]);
    setModelCategory("全部");
    setModel("");
    setModelsLoading(true);
    setModelError("");
    try {
      let list;
      if (id) list = await invoke("models", id);
      else {
        list = (await invoke("localModels")).filter(item => item.providerId === providerId && item.enabled);
        await refreshLocal();
      }
      if (current === loadId.current) {
        setModels(list);
        setModel(selectAvailableModel(list, requestedClient === modelClient.current ? preferred : preferredModel.current));
        if (!list.length) setModelError(id ? "此密钥没有可用模型" : "此服务商没有已启用模型，请在模型服务商页面添加或启用模型");
      }
    } catch (e) {
      if (current === loadId.current) setModelError(e.message);
    } finally {
      if (current === loadId.current) setModelsLoading(false);
    }
  }
  function selectProvider(value, preferred = model || preferredModel.current) {
    ++loadId.current;
    setActiveKey(""); setProviderId(value); setModelsLoading(false); setModelError("");
    const list = localModels.filter(item => item.providerId === value && item.enabled);
    setModels(list); setModel(selectAvailableModel(list, preferred));
    setProtocol(localProviders.find(item => item.id === value)?.protocol || "openai");
  }
  function openConfig(k, client, provider) {
    if (k?.canConfigure === false) { notify((k.statuses || []).map(s => s.label).join('、') + '，无法配置'); return; }
    ++loadId.current;
    const targetClient = client?.id || installed.find(c => c.supported)?.id || "";
    chooseClient(targetClient, !!k);
    setPlan(null); setResult(null); setTested(false); setError(""); setModelQuery(""); setModelCategory("全部"); setModelError(""); setModelsLoading(false);
    setConfigPane("local"); setPreviewPath("");
    setDshProfile(connected.get(client?.id)?.dshProfile || "web");
    setModal({ type: "configure" });
    if (k) { setActiveKey(k.id); loadModels(k.id, preferredModel.current); }
    else selectProvider(provider?.id || localModels.find(item => item.isDefault && item.enabled)?.providerId || localProviders[0]?.id || "", preferredModel.current);
  }
  function close() {
    ++loadId.current;
    if (modal?.type === 'config-files' && modal.returnTo) {
      returningModelOverrides.current = modal.modelOverrides;
      setModal(modal.returnTo);
      setError('');
      return;
    }
    setModal(null);
    setPlan(null);
    setError("");
    setResult(null);
  }
  const selectedModelSettings = activeKey ? {} : localModels.find(item => item.providerId === providerId && item.id === model) || {};
  const modelSettings = { contextWindow: selectedModelSettings.contextWindow || "", maxTokens: selectedModelSettings.maxTokens || "", supportsImages: selectedModelSettings.supportsImages ?? "", supportsTools: selectedModelSettings.supportsTools ?? "", supportsReasoning: selectedModelSettings.supportsReasoning ?? "", ...modelOverrides };
  const input = () => ({ ...(activeKey ? { keyId: activeKey } : { providerId }), client: clientId, model, protocol, modelSettings, ...(clientId === "deepseek-harness" ? { dshProfile } : {}) });
  const refreshHistory = async () => {
    const [entries, clients] = await Promise.all([invoke('history'), invoke('detect')]);
    setHistory(entries); setDetected(clients);
  };
  async function restore(entry, force = false) {
    const ok = await run("restore", async () => {
      await invoke("restore", force ? { id: entry.id, force: true } : entry.id);
      await refreshHistory();
      return true;
    });
    if (ok) {
      close();
      notify("已恢复配置前的文件");
    }
  }
  const label = pages[page];
  return (
    <div className="app workspace-app">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-wrap">
          <span className="org-label">当前组织</span>
          <select
            className="workspace"
            aria-label="组织"
            value={org}
            onChange={(e) => {
              setOrg(e.target.value);
              setQuery("");
            }}
          >
            {!organizations.length && <option value="">选择组织</option>}
            {organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="nav-caption">工作空间</div>
        <nav>
          {[
            ["home", "概览", House],
            ["keys", "API Keys", KeyRound],
            ["history", "配置记录", Clock3],
            ["requests", "请求记录", Activity],
            ["providers", "模型服务商", Server],
          ].map(([id, text, Symbol]) => (
            <button
              key={id}
              aria-label={text}
              title={text}
              className={"nav-item " + (page === id ? "active" : "")}
              onClick={() => {
                setPage(id);
                setQuery("");
                setError("");
              }}
            >
              <Symbol size={18} />
              <span>{text}</span>
              {id === "keys" && <small>{keys.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            className="nav-item"
            href="https://www.onelinkai.cloud"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={17} />
            <span>OneLinkAI 控制台</span>
            <ArrowUpRight size={13} />
          </a>
          <div className={`user-row ${logged ? "is-logged-in" : "is-logged-out"}`}>
            {logged ? <>
              <span className="avatar">{account?.user?.nickname?.slice(0, 1) || "U"}</span>
              <span>
                <strong>{account?.user?.nickname || "已登录"}</strong>
                <small>{account?.demo ? "本地体验账号" : "OneLinkAI 账号"}</small>
              </span>
              <button className="icon-button" title="退出登录" onClick={() => run("logout", async () => {
              await invoke("logout"); ++orgId.current; ++loadId.current;
              setLogged(false); setAccount(null); setOrganizations([]); setOrg(""); setKeys([]); setModal(null);
              setRequests({ connected: false, items: [], total: null });
              })}><LogOut size={14} /></button>
            </> : api && <button className="text-button login-account-button" title="登录 OneLinkAI 账号" aria-label="登录 OneLinkAI 账号" onClick={() => run("login", async () => acceptAccount(await invoke("login")))}><LogIn size={15} /><span>登录 OneLinkAI 账号</span></button>}
          </div>
        </div>
      </aside>
      <div className={"main" + (page !== "home" ? " list-main" : "")}>
        <header className="topbar">
          <span>{orgName}</span>
          <span className="crumb-divider">/</span>
          <strong>{page === "home" ? "概览" : label.title}</strong>
          <div className="topbar-right">
            {installation?.running && <button className="installation-task" onClick={() => openInstall(catalog.find(c => c.id === installation.client), installation.operation === 'update')}><LoaderCircle size={14} className="spin" />{catalog.find(c => c.id === installation.client)?.name} {installation.operation === 'update' ? '升级中' : '安装中'}</button>}
            <Monitor size={14} />
            <span>本地环境</span>
            <span className="top-divider" />
            <span className={"status-dot " + (api ? "is-connected" : "is-preview")} />
            {api ? "本机服务可用" : "网页预览"}
          </div>
        </header>
        <main className={page === "home" ? "home-page" : page === "providers" ? "list-page providers-page" : "list-page"}>
          {page === "home" && <div className="page-heading">
            <div className="eyebrow">ONELINK WORKSPACE</div>
            <div className="title-line">
              <div>
                <h1>{label.title}</h1>
                <p>{label.subtitle}</p>
              </div>
              {page === "home" ? (
                <button className="button" disabled={scanning} onClick={scan}>
                  <RefreshCw size={15} className={scanning ? "spin" : ""} />
                  {scanning ? "检测中…" : "检测客户端"}
                </button>
              ) : (
                <button
                  className="button"
                  disabled={!!busy}
                  onClick={() =>
                    run("refresh", async () => {
                      if (page === "history") await refreshHistory();
                      else setRequestReload(value => value + 1);
                    })
                  }
                >
                  <RefreshCw size={15} />
                  刷新
                </button>
              )}
            </div>
          </div>}
          {error && !modal && (
            <div className="notice error-message" role="alert">
              {error}
            </div>
          )}
          {page === "home" && (
            <>
              <div className="overview-stats">
                {[
                  {
                    label: "API Keys",
                    value: keys.length,
                    suffix: "个密钥",
                    icon: KeyRound,
                    color: "mint",
                    note: "当前组织",
                  },
                  {
                    label: "已安装 Agent",
                    value: installed.length,
                    suffix: `/ ${catalog.length} 个客户端`,
                    icon: Monitor,
                    color: "blue",
                    note: lastScan ? "更新于 " + time(lastScan) : "等待检测",
                  },
                  {
                    label: "已配置 Agent",
                    value: connected.size,
                    suffix: "个客户端",
                    icon: Zap,
                    color: "peach",
                    note: "本机配置",
                  },
                  {
                    label: "API 请求",
                    value: requestSummary?.total ?? "—",
                    suffix: "次",
                    icon: Activity,
                    color: "lavender",
                    note: !logged ? "登录后查看" : requestSummary?.failed ? "请求统计加载失败" : requestSummary?.connected ? "当前组织全部请求" : "等待加载",
                  },
                ].map((s) => (
                  <div className="overview-stat" key={s.label}>
                    <div className="stat-top">
                      <span>{s.label}</span>
                      <span className={"stat-glyph " + s.color}>
                        <s.icon size={17} />
                      </span>
                    </div>
                    <strong>
                      {s.value}
                      <small>{s.suffix}</small>
                    </strong>
                    <span className="stat-foot">{s.note}</span>
                  </div>
                ))}
              </div>
              <section className="agents-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      Agent 客户端{" "}
                      <span className="count-chip">
                        {installed.length} 已安装
                      </span>
                    </h2>
                    <p>后台自动检测版本，发现新版后可一键更新</p>
                  </div>
                  <div className="segment">
                    <button
                      className={!showAll ? "selected" : ""}
                      onClick={() => setShowAll(false)}
                    >
                      已安装
                    </button>
                    <button
                      className={showAll ? "selected" : ""}
                      onClick={() => setShowAll(true)}
                    >
                      全部
                    </button>
                  </div>
                </div>
                <div className="agent-dashboard-grid">
                  {(showAll ? clients : installed).map((c) => {
                    const installing = installation?.client === c.id && installation.running;
                    const config = connected.get(c.id);
                    const management = c.management;
                    const update = updates[c.id];
                    const canUpdate = management?.upgradable;
                    const managementDetails = [
                      '安装：' + (!management ? '正在确认支持情况' : management.installable ? '支持一键安装' : '需手动安装'),
                      management?.installReason,
                      management?.installLocation && '安装位置：' + management.installLocation,
                      c.installed ? '更新：' + (!management ? '正在确认安装来源' : canUpdate ? '支持一键更新，点击后确认执行' : '使用原安装渠道或客户端内置更新') : '更新能力将在安装后按来源判断',
                      management?.origin && '当前安装来源：' + management.origin,
                      management?.reason,
                      c.version && '当前版本：' + c.version,
                      update?.latestVersion && '最新稳定版：' + update.latestVersion,
                      update?.source && '版本查询来源：' + update.source,
                      update?.error && '查询失败：' + update.error + '；将在后台自动重试',
                      update?.status === 'unknown' && '无法读取当前版本，暂不能可靠判断或执行更新',
                    ].filter(Boolean).join('\n');
                    const configuredCount = config?.count || 0;
                    return (
                      <div
                        className={
                          "agent-tile " +
                          (!c.installed ? "agent-unavailable" : "")
                        }
                        key={c.id}
                      >
                        <div className="client-card-top">
                          <Icon c={c} />
                          <span
                            className={
                              "pill " +
                              (installing ? "installing-pill" : config
                                ? "success"
                                : c.installed
                                  ? "installed-pill"
                                  : "inactive")
                            }
                          >
                            <span />
                            {installing ? (installation.operation === 'update' ? '升级中' : "安装中") : config
                              ? `已配置 ${configuredCount} 个`
                              : c.installed
                                ? "已安装"
                                : "未安装"}
                          </span>
                        </div>
                        <h3>
                          {c.name}
                          <small>{c.version ? "v" + c.version : c.sub}</small>
                        </h3>
                        <div className="agent-management agent-update-status" data-update-state={c.installed ? update?.status || 'checking' : 'not-installed'}>
                          {c.installed && update?.status === 'available' && canUpdate
                            ? <button className="text-button update-available" disabled={installation?.running} onClick={() => openInstall(c, true)}>更新至 v{update.latestVersion}<ArrowUpRight size={13} /></button>
                            : c.installed && management && !canUpdate && ['available', 'unsupported'].includes(update?.status)
                            ? <button className="text-button update-available" onClick={() => setModal({ type: 'manual-update', client: c, update })}>{update.status === 'available' ? '有新版本 · 需手动更新' : '需手动更新'}<ArrowUpRight size={13} /></button>
                            : <span className="agent-status-summary">
                              {!c.installed ? !management ? '确认安装支持中' : management.installable ? '可一键安装' : '需手动安装'
                                : !update ? checkingUpdates ? '检测版本中' : '等待检测'
                                : update.status === 'available' ? '有新版本 · 需手动更新'
                                : update.status === 'error' ? '版本暂未查到'
                                : update.status === 'unknown' ? '版本未知'
                                : update.status === 'unsupported' ? '需手动更新'
                                : update.status === 'ahead' ? '高于稳定版' : '已是最新版'}
                            </span>}
                          <AgentDetailsTooltip client={c}>{managementDetails}</AgentDetailsTooltip>
                        </div>
                        <div className="agent-model">
                          <span>{config ? configModelPresentation(config, c.id).label : '模型配置'}</span>
                          <strong title={config ? configModelPresentation(config, c.id).title : undefined}>
                            {config ? configModelPresentation(config, c.id).text : c.configuration?.state === 'unreadable' ? '配置暂无法读取' : '未检测到模型配置'}
                          </strong>
                        </div>
                        <div className="agent-tile-footer">
                          {c.installed && <button className="text-button agent-launch-button" aria-label={'运行 ' + c.name} title={c.bundle || ['claude-desktop', 'deepseek-harness-desktop', 'vscode', 'zed', 'zcode', 'workbuddy'].includes(c.id) ? '打开或切换到 ' + c.name : '在系统终端启动 ' + c.name} disabled={!!busy || installing} onClick={() => run('launch-' + c.id, async () => { const result = await invoke('launchAgent', c.id); notify(result.message); })}>
                            {busy === 'launch-' + c.id ? <LoaderCircle size={12} className="spin" /> : <Play size={12} />}运行
                          </button>}
                          <AgentCardMenu client={c} disabled={!!busy || installing} onInspect={() => { setError(''); setModal({ type: 'config-files', client: c }); }} onUninstall={() => openUninstall(c)} />
                          <button
                            className="text-button agent-config-button"
                            disabled={c.installed && !c.supported}
                            title={c.reason || undefined}
                            onClick={() => installing ? openInstall(c, installation.operation === 'update') : c.installed ? openConfig(keys[0], c) : openInstall(c)}
                          >
                            {installing ? "查看进度" : c.installed ? (!c.supported ? "暂不支持" : "配置") : (management?.installable ? "一键安装" : "安装说明")}
                            {installing ? <LoaderCircle size={14} className="spin" /> : c.installed ? <ArrowRight size={14} /> : <Download size={14} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!installed.length && !showAll && (
                  <div className="empty home-empty">
                    <Monitor size={30} />
                    <h3>
                      {scanning
                        ? "正在检测本机客户端"
                        : "尚未发现已安装的 Agent"}
                    </h3>
                    <button
                      className="text-button"
                      onClick={() => setShowAll(true)}
                    >
                      查看支持的客户端
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </section>
              <section className="recent-section">
                <div className="section-heading">
                  <h2>最近配置</h2>
                  <button
                    className="text-button"
                    onClick={() => setPage("history")}
                  >
                    全部记录
                    <ArrowRight size={14} />
                  </button>
                </div>
                {history.length ? (
                  <div className="recent-list">
                    {history.slice(0, 3).map((h) => (
                      <div key={h.id}>
                        <span className={"recent-dot " + (h.restored ? "" : "is-success")}>
                          <Check size={13} />
                        </span>
                        <strong>
                          {catalog.find((c) => c.id === h.client)?.name}
                        </strong>
                        <span className="recent-model">{h.model}</span>
                        <span
                          className={
                            "pill " + (h.restored ? "inactive" : "success")
                          }
                        >
                          {h.restored ? "已恢复" : "配置成功"}
                        </span>
                        <time>{time(h.time)}</time>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="inline-empty">暂无配置记录</div>
                )}
              </section>
            </>
          )}
          {page === "keys" && (
            <>
              {!logged && <div className="notice">未登录 OneLinkAI。你仍可使用本地模型服务商、模型管理和一键配置；登录后才能查看云端 API Key、预算和请求记录。</div>}
              {wallet && <section className="key-wallet-summary" aria-label="账户可用预算">
                <div className="key-wallet-heading">
                  <span>账户可用总预算</span>
                  <strong>{wallet.unlimited ? "不限额" : wallet.available != null ? `${org === 'personal' ? '¥' : ''}${Number(wallet.available).toLocaleString("zh-CN", { maximumFractionDigits: 4 })}${org === 'personal' ? '' : ' 积分'}` : "未返回"}</strong>
                </div>
                <div className="key-wallet-meta">
                  <span>{wallet.unlimited ? "当前账户不设预算上限" : `预算上限 ${wallet.limit != null ? `${org === 'personal' ? '¥' : ''}${Number(wallet.limit).toLocaleString("zh-CN", { maximumFractionDigits: 4 })}${org === 'personal' ? '' : ' 积分'}` : "未返回"}`}</span>
                  <span>已用 {wallet.used != null ? `${org === 'personal' ? '¥' : ''}${Number(wallet.used).toLocaleString("zh-CN", { maximumFractionDigits: 4 })}${org === 'personal' ? '' : ' 积分'}` : "未返回"}</span>
                  {wallet.organizationBalance != null && <span>账户余额 {org === 'personal' ? '¥' : ''}{Number(wallet.organizationBalance).toLocaleString("zh-CN", { maximumFractionDigits: 4 })}{org === 'personal' ? '' : ' 积分'}</span>}
                </div>
                {wallet.percent != null && <progress aria-label="账户预算使用比例" max="100" value={wallet.percent} />}
              </section>}
              <div className="section-toolbar">
                <span className="table-count">
                  全部密钥 <span>{visibleKeys.length} / {keys.length}</span>
                </span>
                <div className="key-toolbar-actions">
                <select className="key-type-filter" aria-label="密钥类型" value={keyTypeFilter} onChange={e => setKeyTypeFilter(e.target.value)}>
                  <option value="">全部类型</option><option value="0">个人密钥</option><option value="1">组织密钥</option>
                </select>
                <label className="search">
                  <Search size={15} />
                  <input
                    aria-label="搜索密钥"
                    placeholder="搜索名称或密钥…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>

                <button
                  className="button"
                  disabled={!!busy}
                  onClick={() => {
                    const currentOrg = org;
                    const currentId = orgId.current;
                    run("keys", async () => {
                      const data = await invoke("keys", currentOrg);
                      if (currentId === orgId.current) setKeys(data);
                    });
                  }}
                >
                  <RefreshCw size={16} className={busy === "keys" ? "spin" : ""} />
                  刷新密钥
                </button>
                </div>
              </div>
              <div className="data-table-wrap list-scroll">
                <table className="data-table key-metadata-table">
                  <thead>
                    <tr>
                      <th>密钥名称</th>
                      <th>类型</th>
                      <th>API Key</th>
                      <th>状态</th>
                      <th>预算 / 用量</th>
                      <th>有效期</th>
                      <th>接口地址</th>
                      <th>创建时间</th>
                      <th className="align-right key-action-column">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleKeys
                      .map((k) => (
                        <tr key={k.id}>
                          <td>
                            <span className="table-key-name">
                              <span className="key-icon">
                                <KeyRound size={17} />
                              </span>
                              <strong>{k.name}</strong>
                            </span>
                          </td>
                          <td><span className="key-state muted" title={k.keyType === 1 ? '费用由组织账户承担' : k.keyType === 0 && org !== 'personal' ? '调用消耗当前成员的预算' : '个人使用'}>{keyTypeLabel(k)}</span></td>
                          <td>
                            <code>{k.masked}</code>
                          </td>
                          <td><div className="key-statuses">{(k.statuses || [{ label: '状态未知', tone: 'muted' }]).map(s => <span key={s.label} className={'key-state ' + s.tone}>{s.label}</span>)}</div></td>
                          <td><div className="key-budget">
                            <strong>{k.budget?.unlimited ? '不限额' : k.budget?.limit != null ? `${org === 'personal' ? '¥' : ''}${Number(k.budget.limit).toLocaleString('zh-CN', { maximumFractionDigits: 4 })}${org === 'personal' ? '' : ' 积分'}${k.budget.period ? ' / ' + k.budget.period : ''}` : '预算未返回'}</strong>
                            <small>已用 {k.budget?.used != null ? `${org === 'personal' ? '¥' : ''}${Number(k.budget.used).toLocaleString('zh-CN', { maximumFractionDigits: 4 })}${org === 'personal' ? '' : ' 积分'}` : '未返回'}{k.budget?.remaining != null ? ` · 剩余 ${org === 'personal' ? '¥' : ''}${Number(k.budget.remaining).toLocaleString('zh-CN', { maximumFractionDigits: 4 })}${org === 'personal' ? '' : ' 积分'}` : ''}</small>
                            {k.budget?.percent != null && <progress aria-label={k.name + '预算使用比例'} max="100" value={k.budget.percent} />}
                          </div></td>
                          <td><time>{k.expiresAt === 'permanent' ? '永久有效' : k.expiresAt ? time(k.expiresAt) : '未返回'}</time></td>
                          <td>
                            <span className="endpoint-cell" title={k.baseURL}>
                              {k.baseURL.replace("https://", "")}
                            </span>
                          </td>
                          <td>
                            <time>{time(k.createdAt)}</time>
                          </td>
                          <td className="key-action-column">
                            <div className="table-actions">
                              <button
                                className="button configure-button"
                                disabled={k.canConfigure === false}
                                title={k.canConfigure === false ? (k.statuses || []).map(s => s.label).join('、') : '配置客户端'}
                                onClick={() => openConfig(k)}
                              >
                                <Zap size={14} />
                                配置
                                <ChevronDown size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!keys.length ? (
                  <div className="empty">
                    <KeyRound size={28} />
                    <h3>还没有 API Key</h3>
                    <p>当前组织暂无密钥，请在 OneLinkAI 平台创建后刷新。</p>
                  </div>
                ) : (
                  !visibleKeys.length && <div className="empty">没有匹配的密钥</div>
                )}
                <div className="table-footer">
                  <ShieldCheck size={13} />
                  {account?.demo ? "演示账号 · 模拟平台数据" : logged ? "当前组织的平台密钥" : "登录后同步平台密钥"}<span>{orgName}</span>
                </div>
              </div>
            </>
          )}
          {page === "providers" && (
            <>
              <div className="section-toolbar"><span className="table-count">模型服务商 <span>{localProviders.length}</span></span><button className="button" disabled={!!busy} onClick={() => run("refresh-local", refreshLocal)}><RefreshCw size={15} className={busy === "refresh-local" ? "spin" : ""} />刷新</button></div>
              <section className="provider-editor">
                <div className="provider-editor-heading"><div><span className="eyebrow">BYOK</span><h3>{editingProvider ? "编辑模型服务商" : "添加模型服务商"}</h3><p>保存后可从服务商接口同步模型，也可以手动添加模型 ID。</p></div><ShieldCheck size={22} /></div>
                <div className="provider-fields">
                  <label><span>模型服务商名称</span><input placeholder="例如 OpenAI、硅基流动" value={providerDraft.name} onChange={e => setProviderDraft(v => ({ ...v, name: e.target.value }))} /></label>
                  <label className="provider-url-field"><span>接口地址</span><input placeholder="https://api.openai.com" value={providerDraft.baseURL} onChange={e => setProviderDraft(v => ({ ...v, baseURL: e.target.value }))} /></label>
                  <label><span>接口协议</span><select value={providerDraft.protocol} onChange={e => setProviderDraft(v => ({ ...v, protocol: e.target.value }))}><option value="openai">OpenAI Chat Completions</option><option value="responses">OpenAI Responses</option><option value="anthropic">Anthropic Messages</option><option value="gemini">Google Gemini 原生协议</option></select></label>
                  <label><span>API Key</span><input type="password" placeholder={editingProvider ? "留空保留原密钥" : "仅加密保存"} value={providerDraft.apiKey} onChange={e => setProviderDraft(v => ({ ...v, apiKey: e.target.value }))} /></label>
                  <label><span>备注 <em>可选</em></span><input placeholder="例如 工作账号、备用线路" maxLength={1000} value={providerDraft.notes} onChange={e => setProviderDraft(v => ({ ...v, notes: e.target.value }))} /></label>
                  <label><span>官网链接 <em>可选</em></span><input type="url" placeholder="https://example.com" maxLength={2048} value={providerDraft.website} onChange={e => setProviderDraft(v => ({ ...v, website: e.target.value }))} /></label>
                  <button className="button primary provider-save" disabled={!!busy} onClick={() => run("create-provider", async () => { await invoke(editingProvider ? "updateLocalProvider" : "createLocalProvider", { ...providerDraft, ...(editingProvider ? { id: editingProvider } : {}) }); setEditingProvider(""); setProviderDraft(emptyProvider()); await refreshLocal(); notify("模型服务商已保存"); })}><Zap size={14} />保存模型服务商</button>{editingProvider && <button className="button" onClick={() => { setEditingProvider(""); setProviderDraft(emptyProvider()); }}>取消编辑</button>}
                </div>
              </section>
              {editingModel && <section className="model-settings-editor">
                <div className="provider-model-heading"><div><strong>编辑模型资料</strong><small>请求 ID：{editingModel.id}</small></div><button className="icon-button" aria-label="取消编辑模型" onClick={() => setEditingModel(null)}><X size={16} /></button></div>
                <label className="model-name-field">模型显示名称<input aria-label="模型显示名称" maxLength={120} value={editingModel.name} onChange={e => setEditingModel(v => ({ ...v, name: e.target.value }))} /></label>
                <ModelSettingsFields value={editingModel} onChange={setEditingModel} />
                <p className="settings-help">按模型的实际规格填写。保存为共用资料，各应用仅写入已支持的参数；留空沿用适配器默认值或现有配置。</p>
                <button className="button primary" disabled={!!busy} onClick={() => run("edit-model", async () => { await invoke("updateLocalModel", editingModel); setEditingModel(null); await refreshLocal(); notify("模型资料已保存"); })}>保存模型参数</button>
              </section>}
              <div className="provider-list">
                {localProviders.map(provider => { const collapsed = collapsedProviders[provider.id]; return <section className={"provider-row" + (collapsed ? " is-collapsed" : "")} key={provider.id}>
                  <div className="provider-summary"><div className="provider-avatar"><Server size={18} /></div><div><strong>{provider.name}</strong><small>{provider.protocol} · {provider.baseURL}</small>{provider.notes && <p className="provider-notes">{provider.notes}</p>}{provider.website && <button className="text-button provider-website" title={provider.website} onClick={() => run("provider-website", () => invoke("openLocalProviderWebsite", { id: provider.id }))}>官网 <ExternalLink size={11} /></button>}</div><div className="provider-actions"><button className="icon-button provider-toggle" title={collapsed ? "展开模型服务商" : "收起模型服务商"} aria-label={collapsed ? "展开模型服务商" : "收起模型服务商"} onClick={() => setCollapsedProviders(value => ({ ...value, [provider.id]: !value[provider.id] }))}><ChevronDown size={17} /></button><button className="button" disabled={!!busy} onClick={() => { setError(''); setModal({ type: 'import-models', provider }); }}><RefreshCw size={14} />一键拉取模型</button><button className="text-button" onClick={() => openConfig(null, null, provider)}>一键配置</button><button className="text-button" disabled={!!busy} onClick={() => { setEditingProvider(provider.id); setProviderDraft({ name: provider.name, baseURL: provider.baseURL, protocol: provider.protocol, apiKey: "", notes: provider.notes || "", website: provider.website || "" }); }}>编辑</button><button className="icon-button" disabled={!!busy} title="删除模型服务商" onClick={() => run("delete-provider", async () => { await invoke("deleteLocalProvider", { id: provider.id }); if (editingModel?.providerId === provider.id) setEditingModel(null); if (editingProvider === provider.id) { setEditingProvider(""); setProviderDraft(emptyProvider()); } await refreshLocal(); })}><Trash2 size={15} /></button></div></div>
                  {!collapsed && <div className="provider-model-section"><div className="provider-model-heading"><div><strong>模型</strong><small>{provider.models.length ? `${provider.models.filter(item => item.enabled).length} / ${provider.models.length} 个已启用` : "还没有模型"}</small></div><span>支持选择导入或手动录入</span></div><div className="provider-models">{provider.models.length ? provider.models.map(item => <span className={item.isDefault ? "pill success" : "pill"} key={item.id}>{item.name}{(item.contextWindow || item.maxTokens) && <small className="model-limits" title={`上下文 ${item.contextWindow || "默认"} / 输出 ${item.maxTokens || "默认"}`}>{item.contextWindow ? `${Number(item.contextWindow).toLocaleString()} 上下文` : `${Number(item.maxTokens).toLocaleString()} 输出`}</small>}{!item.enabled ? " · 已停用" : item.isDefault ? " · 默认" : ""}<button className="text-button" disabled={!!busy} title={item.enabled ? "停用模型" : "启用模型"} onClick={() => run("toggle-model", async () => { await invoke("updateLocalModel", { providerId: provider.id, id: item.id, enabled: !item.enabled }); await refreshLocal(); })}>{item.enabled ? "停用" : "启用"}</button>{item.enabled && !item.isDefault && <button className="text-button" disabled={!!busy} title="设为默认模型" onClick={() => run("default-model", async () => { await invoke("setDefaultLocalModel", { providerId: provider.id, modelId: item.id }); await refreshLocal(); })}>默认</button>}<button className="icon-button" title="编辑模型资料" onClick={() => setEditingModel({ providerId: provider.id, id: item.id, name: item.name, contextWindow: item.contextWindow || "", maxTokens: item.maxTokens || "", supportsImages: item.supportsImages ?? "", supportsTools: item.supportsTools ?? "", supportsReasoning: item.supportsReasoning ?? "" })}><Pencil size={11} /></button><button className="icon-button" title="删除模型" onClick={() => run("delete-model", async () => { await invoke("deleteLocalModel", { providerId: provider.id, id: item.id }); await refreshLocal(); })}><X size={12} /></button></span>) : <span className="inline-empty">暂无模型，请手动添加或点击一键拉取</span>}</div><div className="provider-model-add"><label><span>模型 ID</span><input placeholder="例如 gpt-4o、deepseek-chat" value={providerId === provider.id ? modelDraft.id : ""} onChange={e => { setProviderId(provider.id); setModelDraft(v => ({ ...(providerId === provider.id ? v : emptyModel()), id: e.target.value })); }} /></label><label><span>显示名称 <em>可选</em></span><input placeholder="默认使用模型 ID" value={providerId === provider.id ? modelDraft.name : ""} onChange={e => { setProviderId(provider.id); setModelDraft(v => ({ ...(providerId === provider.id ? v : emptyModel()), name: e.target.value })); }} /></label><button className="button" disabled={!!busy || providerId !== provider.id || !modelDraft.id.trim()} onClick={() => run("create-model", async () => { await invoke("createLocalModel", { ...modelDraft, providerId: provider.id, id: modelDraft.id.trim() }); setModelDraft(emptyModel()); await refreshLocal(); })}><Pencil size={14} />手动添加模型</button></div><details className="model-advanced"><summary>模型规格 <span>可选</span></summary><ModelSettingsFields value={providerId === provider.id ? modelDraft : emptyModel()} onChange={updater => { setProviderId(provider.id); setModelDraft(current => typeof updater === "function" ? updater(providerId === provider.id ? current : emptyModel()) : updater); }} /><p className="settings-help">模型规格用于所有应用的一键配置；请填写服务商公布的实际限制。</p></details></div>}
                </section>; })}
                {!localProviders.length && <div className="empty"><Server size={28} /><h3>还没有模型服务商</h3><p>添加模型服务商后即可使用 BYOK，不需要登录 OneLinkAI。</p></div>}
              </div>
            </>
          )}
          {page === "history" && (
            <>
            <div className="section-toolbar">
              <span className="table-count">全部配置 <span>{history.length}</span></span>
              <button className="button" disabled={!!busy} onClick={() => run("refresh", refreshHistory)}>
                <RefreshCw size={15} className={busy === "refresh" ? "spin" : ""} />刷新
              </button>
            </div>
            <div className="data-table-wrap list-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>客户端</th>
                    <th>模型</th>
                    <th>配置时间</th>
                    <th>状态</th>
                    <th className="align-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <strong>
                          {catalog.find((c) => c.id === h.client)?.name}
                        </strong>
                        <details className="path-details">
                          <summary>{h.files.length} 个配置文件</summary>
                          {h.files.map((f) => (
                            <div key={f.path}>{f.path}</div>
                          ))}
                        </details>
                      </td>
                      <td>
                        <code>{h.model}</code>
                      </td>
                      <td>
                        <time>{time(h.time)}</time>
                      </td>
                      <td>
                        <span
                          className={
                            "pill " + (h.restored ? "inactive" : "success")
                          }
                        >
                          <span />
                          {h.restored ? "已恢复" : "配置成功"}
                        </span>
                      </td>
                      <td className="align-right">
                        <button
                          className="button restore-button"
                          disabled={!!busy || h.restored}
                          onClick={() => {
                            setError("");
                            setModal({ type: "restore", entry: h });
                          }}
                        >
                          <RotateCcw size={14} />
                          恢复备份
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!history.length && (
                <div className="empty history-empty">
                  <Clock3 size={30} />
                  <h3>暂无配置记录</h3>
                </div>
              )}
            </div>
            </>
          )}
          {page === "requests" && (
            <>
              <div className="section-toolbar">
                <form className="request-filters" onSubmit={e => { e.preventDefault(); setRequestPage(1); setRequestFilters({ ...requestDraft }); }}>
                  <select
                    aria-label="筛选请求密钥"
                    value={requestKey}
                    onChange={(e) => { setRequestPage(1); setRequestKey(e.target.value); }}
                  >
                    <option value="">全部 API Keys</option>
                    {keys.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name} · {keyTypeLabel(k)}
                      </option>
                    ))}
                  </select>
                  {requestOptions.users?.length > 0 && <select aria-label="筛选请求用户" value={requestDraft.userId} onChange={e => setRequestDraft(value => ({ ...value, userId: e.target.value }))}><option value="">全部用户</option>{requestOptions.users.map(user => <option key={user.value} value={user.value}>{user.label}</option>)}</select>}
                  {[["modelId", "全部模型", requestOptions.models], ["supplierId", "全部模型服务商", requestOptions.suppliers], ["modelTypes", "全部模型类型", requestOptions.types]].map(([field, label, options]) => (
                    <select key={field} aria-label={label} value={requestDraft[field]} onChange={e => setRequestDraft(value => ({ ...value, [field]: e.target.value }))}>
                      <option value="">{label}</option>
                      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ))}
                  <label className="request-date">开始时间<input type="datetime-local" aria-label="开始时间" value={requestDraft.startTime.replace(' ', 'T').slice(0, 16)} onChange={e => setRequestDraft(value => ({ ...value, startTime: e.target.value ? e.target.value.replace('T', ' ') + ':00' : '' }))} /></label>
                  <label className="request-date">结束时间<input type="datetime-local" aria-label="结束时间" value={requestDraft.endTime.replace(' ', 'T').slice(0, 16)} onChange={e => setRequestDraft(value => ({ ...value, endTime: e.target.value ? e.target.value.replace('T', ' ') + ':59' : '' }))} /></label>
                  <button className="button" type="submit" disabled={requestLoading}><Filter size={14} />筛选</button>
                  <button className="icon-button" type="button" title="重置筛选" aria-label="重置筛选" onClick={() => { setRequestKey(''); setRequestPage(1); setRequestDraft(emptyRequestFilters()); setRequestFilters(emptyRequestFilters()); }}><RotateCcw size={15} /></button>
                </form>
                <div className="record-toolbar-actions">
                <span className="backend-badge">
                  <Server size={13} />
                  {!logged ? "登录后查看" : requestLoading ? "正在加载" : requestError ? "加载失败" : requests.connected ? "已同步" : "尚未加载"}
                </span>
                <button className="button" disabled={requestLoading} onClick={() => setRequestReload(value => value + 1)}>
                  <RefreshCw size={15} className={requestLoading ? "spin" : ""} />刷新
                </button>
                </div>
              </div>
              {requestOptionsError && <div className="notice warning" role="alert">筛选选项加载失败：{requestOptionsError}<button className="text-button" onClick={() => run('request-options', async () => { setRequestOptions(await invoke('requestOptions', { org })); setRequestOptionsError(''); })}>重试</button></div>}
              <div className="data-table-wrap list-scroll" aria-busy={requestLoading}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>请求时间</th>
                      <th>API Key</th>
                      <th>模型</th>
                      <th>模型服务商</th>
                      <th>应用程序</th>
                      <th>用户</th>
                      <th>Tokens</th>
                      <th>缓存命中</th>
                      <th>费用</th>
                      <th>生成速度</th>
                      <th>首字延迟</th>
                      <th>端到端耗时</th>
                      <th>结束原因</th>
                      <th>日志模式</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.items.map((r) => (
                      <tr key={r.id}>
                        <td>{time(r.time)}</td>
                        <td>{r.keyName}</td>
                        <td>{r.model}</td>
                        <td>{r.fields?.supplierName ?? "—"}</td>
                        <td>{r.fields?.requestApp ?? "—"}</td>
                        <td>{r.fields?.userName ?? "—"}</td>
                        <td><div className="request-usage">{usageFields.some(([field]) => r.fields?.[field] != null)
                          ? usageFields.filter(([field]) => r.fields?.[field] != null).map(([field, label]) => <span key={field}>{label}：{requestValue(field, r.fields[field])}</span>)
                          : r.tokens}</div></td>
                        <td>{r.fields?.tokenCacheHit ?? "—"}</td>
                        <td>{r.cost}</td>
                        <td>{r.fields?.throughput != null ? r.fields.throughput + " tps" : "—"}</td>
                        <td>{r.fields?.firstLatency != null ? r.fields.firstLatency + ' ms' : '—'}</td>
                        <td>{r.fields?.totalLatency != null ? r.fields.totalLatency + ' ms' : '—'}</td>
                        <td>{requestValue('endReason', r.fields?.endReason)}</td>
                        <td>{requestValue('dataRetentionSwitch', r.fields?.dataRetentionSwitch)}</td>
                        <td><span className="request-status" title={requestValue("responseStatus", r.status)}>{requestValue("responseStatus", r.status)}</span></td>
                        <td><button className="text-button" onClick={() => openRequest(r)}>详情<ArrowRight size={13} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {requestLoading && <div className="request-loading" role="status"><LoaderCircle size={16} className="spin" />正在加载请求记录…</div>}
                {!requestLoading && !requests.items.length && (
                  <div className="empty request-empty">
                    <span className="request-empty-icon">
                      <Activity size={28} />
                    </span>
                    <h3>
                      {!logged ? "登录后查看请求记录" : requestError || (requestLoading ? "正在加载请求记录" : requests.connected ? "当前条件下暂无请求记录" : "暂无请求数据")}
                    </h3>
                    <p>
                      {requests.connected
                        ? "当前筛选条件下没有请求。"
                        : "API Key 的调用、Tokens 与费用将在此显示。"}
                    </p>
                    <span className="empty-badge">
                      {requests.connected
                        ? "0 条记录"
                        : "数据源：OneLinkAI 后端"}
                    </span>
                  </div>
                )}
              </div>
              <div className="request-pagination">
                <span>{requests.total != null ? `共 ${requests.total} 条` : '共 — 条'} · 第 {requestPage} 页{requests.total != null ? ` / ${Math.max(1, Math.ceil(requests.total / requestPageSize))} 页` : ''}</span>
                <div>
                  <select aria-label="每页条数" value={requestPageSize} disabled={requestLoading} onChange={e => { setRequestPage(1); setRequestPageSize(Number(e.target.value)); }}>
                    {[20, 50, 100].map(size => <option key={size} value={size}>{size} 条 / 页</option>)}
                  </select>
                  <button className="button" title="上一页" aria-label="上一页" disabled={requestLoading || requestPage <= 1} onClick={() => setRequestPage(value => value - 1)}><ChevronLeft size={16} /></button>
                  <button className="button" title="下一页" aria-label="下一页" disabled={requestLoading || !requests.connected || (requests.total != null ? requestPage * requestPageSize >= requests.total : requests.items.length < requestPageSize)} onClick={() => setRequestPage(value => value + 1)}><ChevronRight size={16} /></button>
                </div>
              </div>
            </>
          )}
          <footer>
            <span>
              <Link2 size={13} />
              OneLinkAI Desktop <SoftwareUpdate />
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <div className="overlay">
          <div
            className={
              "modal " +
              (modal.type === "configure"
                ? "config-modal configure-workflow"
                : modal.type === 'import-models' ? 'model-import-modal' : modal.type === 'config-files' ? 'config-reader-modal' : "")
            }
            role="dialog"
            aria-modal="true"
            aria-label={
              modal.type === "configure" ? "配置客户端" : modal.type === "config-files" ? "本机配置文件" : "确认操作"
            }
          >
            <button
              className="modal-close icon-button"
              title="关闭"
              disabled={!!busy}
              onClick={close}
            >
              <X size={19} />
            </button>
            {error && (
              <div className="notice error-message" role="alert">
                {error}
              </div>
            )}
            {modal.type === 'import-models' && <ModelImportDialog provider={modal.provider} onClose={close} onConfirm={selection => run('select-models', async () => { await invoke('selectLocalModels', { providerId: modal.provider.id, models: selection }); await refreshLocal(); close(); notify('模型选择已更新'); })} busy={!!busy} />}
            {modal.type === 'config-files' && <ClientConfigViewer client={modal.client} />}
            {modal.type === 'manual-update' && <>
              <div className="modal-eyebrow"><RefreshCw size={14} />手动更新</div>
              <h2>更新 {modal.client.name}</h2>
              <p>当前版本：{modal.client.version || '未读取'}{modal.update?.latestVersion ? ` · 最新版本：${modal.update.latestVersion}` : ''}</p>
              <div className="notice">{modal.client.management?.reason || '当前安装不支持在 OneLinkAI 中一键更新，请通过客户端内置更新或原安装渠道更新。'}</div>
              <p>打开客户端，在应用菜单或设置中检查更新；也可从官方下载并按原安装方式更新。</p>
              <div className="modal-actions">
                <button className="button primary" disabled={!!busy} onClick={() => run('launch-update', async () => { const result = await invoke('launchAgent', modal.client.id); notify(result.message); })}>打开客户端<ExternalLink size={14} /></button>
                {modal.client.management?.guide && <a className="button" href={modal.client.management.guide} target="_blank" rel="noreferrer">官方下载<ExternalLink size={14} /></a>}
              </div>
            </>}
            {modal.type === "request" && (
              <>
                <div className="modal-eyebrow"><Activity size={14} />调用日志</div>
                <h2>请求详情</h2>
                {busy === "request-detail" && <div className="notice"><LoaderCircle size={14} className="spin" />正在获取完整日志…</div>}
                {Number(logDetail?.dataRetentionSwitch) === 1 && <div className="notice">此请求启用了隐私模式，平台不保留请求和响应正文。</div>}
                <dl className="request-details">
                  {requestFields.map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{requestValue(field, logDetail?.[field])}</dd></div>)}
                </dl>
              </>
            )}
            {modal.type === 'uninstall' && <>
              <div className="modal-eyebrow"><Trash2 size={14} />卸载客户端</div>
              <h2>卸载 {modal.client.name}</h2>
              {!uninstallPlan ? <div className="model-loading">正在检查安装来源…</div> : <>
                {uninstallPlan.source && <p>安装来源：{uninstallPlan.source}</p>}
                <p className="uninstall-path">{uninstallPlan.target}</p>
                <div className="notice">{uninstallPlan.notice}</div>
                <div className="modal-footer">
                  <button className="button" disabled={!!busy} onClick={close}>取消</button>
                  {uninstallPlan.supported && <button className="button primary" disabled={!!busy} onClick={() => run('uninstall', async () => {
                    const result = await invoke('uninstall', { client: modal.client.id, target: uninstallPlan.target });
                    await scan(); close(); notify(result.message);
                  })}>{busy === 'uninstall' ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />}{busy === 'uninstall' ? '正在卸载…' : '确认卸载'}</button>}
                </div>
              </>}
            </>}
            {modal.type === "install" && (
              <>
                <div className="modal-eyebrow"><Download size={14} />{modal.update ? '客户端升级' : '安装客户端'}</div>
                <h2>{modal.update ? '升级' : '安装'} {modal.client.name}</h2>
                {!installPlan ? <div className="model-loading"><LoaderCircle className="spin" />正在检查环境</div> : (
                  <>
                    <p>{installPlan.system.label}</p>
                    {modal.update && <div className="update-version-detail"><span>当前版本 <strong>{installPlan.currentVersion || '未知'}</strong></span><ArrowRight size={14} /><span>最新版本 <strong>{installPlan.latestVersion || '查询失败'}</strong></span><small>{installPlan.origin} · {installPlan.source}</small><code>{installPlan.target}</code></div>}
                    {installPlan.supported ? (
                      <>
                        <ol className="install-steps">{installPlan.steps.map(step => <li key={step}>{step}</li>)}</ol>
                        <div className="notice">{installPlan.notice}</div>
                      </>
                    ) : <div className="notice warning">{installPlan.reason}</div>}
                    {installation && (
                      <div className="install-progress" role="status">
                        <strong>{installation.running ? (modal.update ? '升级中…' : "安装中…") : installation.phase === "complete" ? (modal.update ? '升级完成并已校验' : "已安装并检测到客户端") : (modal.update ? '升级未完成' : "安装未完成")}</strong>
                        {installation.routes && Object.entries(installation.routes).map(([kind, routes]) => routes?.length ? (
                          <div className="route-status" key={kind}>
                            <span>{kind === "node" ? "Node.js 下载线路" : kind === "npm" ? "npm 包线路" : kind === "repositories" ? "源码线路" : "脚本线路"}</span>
                            <div>{routes.map(route => <span className={`route-chip ${route.selected ? "selected" : route.available ? "available" : "unavailable"}`} key={route.name}>{route.name}{route.selected ? " · 当前" : route.available && route.latency ? ` · ${route.latency}ms` : route.available ? " · 可用" : " · 不可用"}</span>)}</div>
                          </div>
                        ) : null)}
                        <pre>{installation.logs.join("\n")}</pre>
                        {installation.error && <p className="error-message">{installation.error}</p>}
                      </div>
                    )}
                    <div className="modal-footer">
                      <span>{installation?.running ? "请保持应用运行" : "用户目录安装"}</span>
                      {installation?.phase === "complete" ? (
                        <button className="button primary" onClick={() => openConfig(keys[0], modal.client)}>配置客户端<ArrowRight size={14} /></button>
                      ) : installPlan.supported ? (
                        <button className="button primary" disabled={!!busy || installation?.running} onClick={() => run("install", async () => setInstallation(await invoke(modal.update ? 'upgradeAgent' : "install", modal.client.id)))}>
                          {installation?.running ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}
                          {installation?.running ? (modal.update ? '正在升级' : "正在安装") : modal.update ? (installation ? '重试升级' : '确认升级') : installation ? "重试安装" : "安装客户端"}
                        </button>
                      ) : installPlan.guide ? <a className="button" href={installPlan.guide} target="_blank" rel="noreferrer">官方下载<ExternalLink size={14} /></a> : <button className="button" onClick={() => setModal(null)}>关闭</button>}
                    </div>
                  </>
                )}
              </>
            )}
            {modal.type === "restore" && (
              <>
                <h2>{modal.force ? "强制恢复原始配置？" : "恢复原始配置？"}</h2>
                <p>恢复 {catalog.find(c => c.id === modal.entry.client)?.name} 配置前的文件。{modal.force ? "将覆盖后续修改，恢复前会自动备份当前文件及相关凭据。原先不存在的配置文件将被删除。" : "发现后续修改时会停止恢复，也可以选择强制恢复或手动修改。"}</p>
                {modal.force && <div className="notice warning">请确认当前修改可以被覆盖。原始备份缺失时仍会停止恢复。</div>}
                <div className="modal-footer restore-actions">
                  <button className="button" disabled={!!busy} onClick={modal.force ? () => { setError(""); setModal({ ...modal, force: false }); } : close}>{modal.force ? "返回" : "取消"}</button>
                  {!modal.force && <>
                    <button className="button" disabled={!!busy} onClick={() => run("restore-files", async () => {
                      const files = await invoke("restoreFiles", modal.entry.id);
                      setModal({ type: "manual-restore", entry: modal.entry, files });
                    })}><Pencil size={14} />手动修改</button>
                    <button className="button danger" disabled={!!busy} onClick={() => { setError(""); setModal({ ...modal, force: true }); }}>强制恢复</button>
                  </>}
                  <button className={"button " + (modal.force ? "danger" : "primary")} disabled={!!busy} onClick={() => restore(modal.entry, modal.force === true)}>
                    {busy === "restore" ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
                    {busy === "restore" ? "正在恢复…" : modal.force ? "确认强制恢复" : "确认恢复"}
                  </button>
                </div>
              </>
            )}
            {modal.type === "manual-restore" && <>
              <h2>手动修改配置</h2>
              <p>打开文件位置后，用本机编辑器对照原始备份修改当前文件。备份以 .bak 保存，请保留原始备份。</p>
              {modal.entry.credential && <div className="notice warning">此备份还包含 Zed 系统凭据。手动修改文件不会恢复系统凭据，请在 Zed 中单独处理，或返回选择恢复。</div>}
              <div className="manual-restore-files">
                {modal.files.map(file => <section key={file.index}>
                  <code>{file.path}</code>
                  <div className="restore-file-actions">
                    <button className="button" disabled={!!busy || !file.exists} onClick={() => run("reveal-restore-file", () => invoke("revealRestoreFile", { id: modal.entry.id, index: file.index }))}>{file.exists ? "打开当前文件位置" : "当前文件不存在"}</button>
                    {file.backupPath && <button className="button" disabled={!!busy} onClick={() => run("reveal-restore-file", () => invoke("revealRestoreFile", { id: modal.entry.id, index: file.index, backup: true }))}>打开原始备份位置</button>}
                  </div>
                  {file.backupPath ? <small>原始备份：{file.backupPath}</small> : <small>配置前不存在此文件；完全恢复原状需删除当前文件。</small>}
                </section>)}
              </div>
              <p>手动修改后，请在客户端确认配置。此操作不会自动标记备份为已恢复。</p>
              <div className="modal-footer">
                <button className="button" disabled={!!busy} onClick={() => { setError(""); setModal({ type: "restore", entry: modal.entry }); }}>返回</button>
                <button className="button primary" disabled={!!busy} onClick={close}>完成</button>
              </div>
            </>}
            {modal.type === "configure" && (
              <>
                <h2>
                  {result ? "配置成功" : "配置客户端"}
                </h2>
                {key && <p className="modal-description">{key.name} <span className="key-inline">{key.masked}</span></p>}
                {result ? (
                  <>
                    <span className="success-symbol">
                      <Check size={28} />
                    </span>
                    <h2 className="success-title">{["vscode", "zed"].includes(clientId) ? "模型定义已写入，待在客户端填写密钥" : "配置文件已写入并回读校验"}</h2>
                    <div className="notice">{result.notice}</div>
                    <p>{tested ? "模型接口测试通过；请在客户端新会话中确认加载" : "尚未验证客户端加载与模型请求"}</p>
                    <div className="modal-footer">
                      <button
                        className="button"
                        disabled={!!busy}
                        onClick={() => { setError(""); setModal({ type: "restore", entry: result }); }}
                      >
                        <RotateCcw size={14} />
                        恢复本次配置
                      </button>
                      <button
                        className="button primary"
                        onClick={() => {
                          close();
                          setPage("history");
                        }}
                      >
                        完成
                        <Check size={15} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="config-key-select">
                      <KeyRound size={15} />
                      <select aria-label="配置来源" value={activeKey ? `key:${activeKey}` : `provider:${providerId}`} onChange={(e) => {
                        const { kind, id: value } = parseConfigSource(e.target.value); setTested(false); setPlan(null);
                        if (kind === "key") { setActiveKey(value); chooseClient(clientId, true); loadModels(value); }
                        else selectProvider(value);
                      }}>
                        {logged && keys.map(k => <option key={k.id} value={`key:${k.id}`}>OneLinkAI · {k.name} · {k.masked}</option>)}
                        {localProviders.map(provider => <option key={provider.id} value={`provider:${provider.id}`}>我的模型服务商 · {provider.name}</option>)}
                      </select>
                      <ShieldCheck size={14} />
                    </div>
                    <div className="client-tab-strip">
                      <button type="button" className="icon-button" aria-label="向左滚动应用" onClick={event => event.currentTarget.nextElementSibling.scrollBy({ left: -260, behavior: 'smooth' })}><ChevronLeft size={16} /></button>
                    <div className="client-picker" role="tablist" aria-label="选择客户端" onKeyDown={event => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                      const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]:not(:disabled)')];
                      const index = tabs.indexOf(document.activeElement);
                      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                      event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click(); tabs[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    }}>
                      {installed.map((c) => (
                        <button
                          key={c.id}
                          className={clientId === c.id ? "picked" : ""}
                          role="tab" aria-selected={clientId === c.id} tabIndex={clientId === c.id ? 0 : -1}
                          disabled={!c.supported}
                          title={c.reason || c.name}
                          onClick={event => { chooseClient(c.id); event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }}
                        >
                          <Icon c={c} />
                          <span>
                            {c.name}
                            <small>
                              {c.version ? "v" + c.version : "已安装"}
                            </small>
                          </span>
                          {clientId === c.id && <CheckCircle2 size={14} />}
                        </button>
                      ))}
                    </div>
                      <button type="button" className="icon-button" aria-label="向右滚动应用" onClick={event => event.currentTarget.previousElementSibling.scrollBy({ left: 260, behavior: 'smooth' })}><ChevronRight size={16} /></button>
                    </div>
                    <div className="config-workspace-grid">
                    <fieldset className="config-controls" disabled={!!busy}>
                    {!installed.length && (
                      <div className="notice">
                        未发现已安装的客户端
                        <button className="text-button" onClick={scan}>
                          重新检测
                        </button>
                      </div>
                    )}
                    <div className="model-label">
                      <label className="field-label">选择模型</label>
                      <button
                        className="text-button"
                        disabled={modelsLoading}
                        onClick={() => loadModels(activeKey)}
                      >
                        <RefreshCw
                          size={12}
                          className={modelsLoading ? "spin" : ""}
                        />
                        刷新模型
                      </button>
                    </div>
                    <label className="search model-search">
                      <Search size={14} />
                      <input
                        aria-label="搜索模型"
                        placeholder="搜索可用模型…"
                        value={modelQuery}
                        onChange={(e) => setModelQuery(e.target.value)}
                      />
                      <span>{models.length}</span>
                    </label>
                    {!modelsLoading && !modelError && models.length > 0 && (
                      <div className="model-category-tabs" role="tablist" aria-label="模型分类">
                        {modelCategories.map(category => <button key={category} role="tab" aria-selected={modelCategory === category}
                          onClick={() => setModelCategory(category)} className={modelCategory === category ? "selected" : ""}>
                          {category}<span>{category === "全部" ? models.length : models.filter(item => (item.category || "其他") === category).length}</span>
                        </button>)}
                      </div>
                    )}
                    <div className="model-picker" ref={modelPickerRef}>
                      {modelsLoading ? (
                        <div className="model-loading">
                          <LoaderCircle size={19} className="spin" />
                          正在拉取模型
                        </div>
                      ) : modelError ? (
                        <div
                          className="model-loading error-message"
                          role="alert"
                        >
                          {modelError}
                          <button
                            className="text-button"
                            onClick={() => loadModels(activeKey)}
                          >
                            重试
                            <RefreshCw size={12} />
                          </button>
                        </div>
                      ) : (
                        filteredModels
                          .map((m) => (
                            <button
                              key={m.id}
                              className={model === m.id ? "picked" : ""}
                              onClick={() => {
                                setModel(m.id);
                                setTested(false);
                              }}
                            >
                              <span className="model-dot">
                                {m.id.toLowerCase().includes("claude")
                                  ? "✳"
                                  : m.id.toLowerCase().includes("gpt")
                                    ? "⌘"
                                    : "M"}
                              </span>
                              <span>
                                <strong>{m.name}</strong>
                                <small>{m.owner || m.id}</small>
                              </span>
                              <span className="radio">
                                {model === m.id && <i />}
                              </span>
                            </button>
                          ))
                      )}
                    </div>
                    {!modelsLoading && !modelError && preferredModel.current && models.length > 0 && !models.some(item => item.id === preferredModel.current) && <small className="settings-help">当前模型 {preferredModel.current} 不在此来源的可用列表中，请选择可用模型。</small>}
                    {!modelsLoading && !modelError && models.length > 0 && !filteredModels.length && <div className="inline-empty">该分类下没有匹配的模型</div>}
                    {clientId === "deepseek-harness" && <label>CLI Profile<input aria-label="DSH CLI Profile" value={dshProfile} placeholder="web" onChange={e => setDshProfile(e.target.value)} /><small>WebUI 使用 web；自定义 profile 请填写启动时的名称。使用 dsh --profile {dshProfile || "web"} 启动。</small></label>}
                    {clientId === "deepseek-harness-desktop" && <div className="notice">配置目标：桌面版 desktop profile。配置后完全退出并重启 DeepSeek Harness Desktop。</div>}
                    <div className="protocol-row">
                      <label htmlFor="protocol">接口协议</label>
                      <select
                        id="protocol"
                        value={protocol}
                        onChange={(e) => {
                          setProtocol(e.target.value);
                          setTested(false);
                        }}
                      >
                        <option
                          value="anthropic"
                          disabled={[
                            "codex",
                            "grok",
                            "gemini",
                            "zed",
                            "workbuddy",
                            "hermes",
                          ].includes(clientId)}
                        >
                          Anthropic Messages
                        </option>
                        <option
                          value="openai"
                          disabled={["claude", "claude-desktop", "codex", "grok", "gemini"].includes(clientId)}
                        >
                          OpenAI Chat Completions
                        </option>
                        <option
                          value="responses"
                          disabled={[
                            "claude",
                            "claude-desktop",
                            "gemini",
                            "zed",
                            "workbuddy",
                            "hermes",
                          ].includes(clientId)}
                        >
                          OpenAI Responses
                        </option>
                        <option value="gemini" disabled={clientId !== "gemini"}>Google Gemini 原生协议</option>
                      </select>
                    </div>
                    {tested && (
                      <div className="notice">
                        <CheckCircle2 size={15} />
                        模型连接测试通过
                      </div>
                    )}
                    </fieldset>
                    <aside className="config-details-column" ref={configDetailsRef} aria-label="高级设置与配置文件">
                    <fieldset className="config-advanced-controls" disabled={!!busy}>
                    <section className="model-advanced configuration-advanced">
                      <div className="config-section-heading">模型参数 <span>{(clientCapabilities[clientId] || []).some(field => field !== "name") ? "按应用适配" : "当前应用暂无可写入的规格参数"}</span></div>
                      <ModelSettingsFields value={modelSettings} client={clientId} supported={clientCapabilities[clientId] || []} onChange={updater => { setModelOverrides(current => { const value = { ...modelSettings, ...current }; return typeof updater === "function" ? updater(value) : updater; }); setPlan(null); setTested(false); }} />
                      <p className="settings-help" title={clientSettingNotes[clientId]}>参数仅用于本次配置，留空沿用现有设置。<span className="config-help" tabIndex={0} aria-label={clientSettingNotes[clientId] || '灰色参数由客户端或服务端管理'}>ⓘ<span role="tooltip">{clientSettingNotes[clientId]} 长期规格可在模型服务商中编辑；灰色参数由客户端或服务端管理。</span></span></p>
                    </section>
                    {clientId === "claude-desktop" && <div className="notice">Claude Desktop 直连使用 Anthropic Messages，模型 ID 需为 claude-sonnet-*、claude-opus-*、claude-haiku-* 或 claude-fable-*。配置后请完全退出并重启 Claude Desktop。</div>}
                    {clientId === "vscode" && <div className="notice">此流程写入模型定义；密钥需在 VS Code 管理模型中保存到其密钥存储。请使用包含 Custom Endpoint 的新版 VS Code。</div>}
                    {clientId === "grok" && <div className="notice">Grok Build 使用 OpenAI Responses 接口，配置后请开启新会话。</div>}
                    </fieldset>
                    <section className="config-inspector" ref={configInspectorRef}>
                      <div className="config-pane-tabs" role="tablist" aria-label="配置文件视图">
                        <button role="tab" aria-selected={configPane === 'local'} onClick={() => setConfigPane('local')}><FileCode2 size={14} />本机配置</button>
                        <button role="tab" aria-selected={configPane === 'preview'} onClick={() => setConfigPane('preview')}><ShieldCheck size={14} />写入预览{plan && <span>{plan.files.length}</span>}</button>
                      </div>
                      <div className="config-pane-content" role="tabpanel" aria-label={configPane === 'local' ? '本机配置' : '写入预览'}>
                        {configPane === 'local' ? selected ? <ClientConfigViewer key={clientId} client={selected} embedded /> : <div className="config-pane-empty">选择应用后查看本机配置</div> : plan ? <>
                          <nav className="preview-file-tabs" aria-label="预览文件">{plan.files.map(file => <button key={file.path} className={(previewPath || plan.files[0]?.path) === file.path ? 'selected' : ''} title={file.path} onClick={() => setPreviewPath(file.path)}>{file.path.split(/[\\/]/).pop()}</button>)}</nav>
                          <div className="config-file-meta"><code>{(plan.files.find(file => file.path === previewPath) || plan.files[0])?.path}</code><span>写入前预览 · 自动备份原文件</span></div>
                          <ConfigCode className="preview-code" content={(plan.files.find(file => file.path === previewPath) || plan.files[0])?.content} path={(plan.files.find(file => file.path === previewPath) || plan.files[0])?.path} />
                          <div className="notice config-preview-notice"><ShieldCheck size={14} />{plan.notice}{plan.credential && <p>{plan.credential}</p>}</div>
                        </> : <div className="config-pane-empty"><ShieldCheck size={28} /><strong>先预览，再确认写入</strong><p>选择模型、调整参数后，点击底部“预览配置”查看实际变更。</p></div>}
                      </div>
                    </section>
                    </aside>
                    </div>
                    <div className="modal-footer config-workspace-footer">
                      <span className="config-selection-summary" title={model}>{selected?.name || '未选择应用'} · {model || '未选择模型'}</span>
                      <button
                        className="text-button"
                        title="发送少量测试请求，会消耗 API 额度"
                        disabled={!!busy || !model || !clientId}
                        onClick={() =>
                          run("test", async () => {
                            await invoke("test", input());
                            setTested(true);
                          })
                        }
                      >
                        {busy === "test" ? (
                          <LoaderCircle className="spin" size={14} />
                        ) : (
                          <Activity size={14} />
                        )}
                        测试连接
                      </button>
                      <button
                        className="button primary"
                        disabled={
                          !!busy || modelsLoading || !model || !clientId
                        }
                        onClick={() =>
                          run("preview", async () => {
                            setPlan(await invoke("preview", input())); setPreviewPath(''); setConfigPane('preview');
                          })
                        }
                      >
                        {busy === "preview" ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <ArrowRight size={15} />
                        )}
                        {plan ? '重新预览' : '预览配置'}
                      </button>
                      {plan && <button className="button primary" disabled={!!busy} onClick={() => run('apply', async () => { setResult(await invoke('apply', plan.token)); await refreshHistory(); })}>{busy === 'apply' ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />}确认写入</button>}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
