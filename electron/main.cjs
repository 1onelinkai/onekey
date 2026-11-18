const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  session,
  Tray,
  Menu,
  nativeImage,
  net,
  dialog,
  safeStorage,
  autoUpdater: nativeAutoUpdater,
} = require("electron");
const { createAgentService, testConnection } = require("./agents.cjs");
const { createPlatformService } = require("./platform.cjs");
const { createLivePlatform } = require("./platform-live.cjs");
const { createLocalProviderStore, createPersistentLocalProviderStore } = require("./local-providers.cjs");
const { createPlatformLogin } = require("./platform-login.cjs");
const { createInstaller } = require("./installer.cjs");
const { createUninstaller } = require("./uninstaller.cjs");
const path = require("node:path");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const { pathToFileURL } = require("node:url");

// Keep existing user data when changing the public application name.
const legacyData = path.join(app.getPath("appData"), "onelink-desktop-demo");
const installedData = path.join(app.getPath("appData"), "OneLinkAI");
if (!process.argv.some(arg => arg.startsWith('--user-data-dir'))) {
  app.setPath("userData", fsSync.existsSync(installedData) ? installedData : legacyData);
}
app.setName("One Key");

const smokeTest = process.argv.includes("--smoke-test");
const flowTest = process.argv.includes("--flow-test");
let testRoot;
const agentLaunchRequests = [];
let modelServer;
const developmentUrl = !app.isPackaged && process.env.ONELINK_DEV_URL;
const entryUrl =
  developmentUrl ||
  pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
let mainWindow;
let tray;
let quitting = false;
let dockIconApplied = false;

function showWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  let icon;
  if (process.platform === "darwin") {
    icon = nativeImage.createFromPath(path.join(__dirname, "../build/icons/tray-template.png"));
    icon.addRepresentation({
      scaleFactor: 2,
      width: 36,
      height: 36,
      dataURL: `data:image/png;base64,${fsSync.readFileSync(path.join(__dirname, "../build/icons/tray-template@2x.png")).toString("base64")}`,
    });
    icon.setTemplateImage(true);
  } else {
    icon = nativeImage.createFromPath(path.join(__dirname, "../build/icon.png"));
  }
  tray = new Tray(icon);
  tray.setToolTip("One Key");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 One Key", click: showWindow },
    { label: "检测客户端", click: () => {
      showWindow();
      mainWindow.webContents.send("onelink:scan");
    } },
    { type: "separator" },
    { label: "退出 One Key", click: () => app.quit() },
  ]));
  tray.on("double-click", showWindow);
}

function isTrustedFrame(event) {
  return (
    event.sender === mainWindow?.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame
  );
}

function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === "https:" &&
      ["www.onelinkai.cloud", "onelinkai.cloud", "zed.dev", "code.visualstudio.com", "zcode.z.ai", "www.workbuddy.cn", "www.deepseek.com", "git-scm.com", "github.com", "claude.ai", "claude.com"].includes(parsed.hostname)
    ) {
      shell.openExternal(parsed.href).catch(console.error);
    }
  } catch {
    /* Ignore malformed links from the renderer. */
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: "One Key",
    icon: path.join(__dirname, process.platform === "darwin" ? "../build/icons/mac-icon.png" : "../build/icon.png"),
    backgroundColor: "#fafbfc",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== entryUrl) {
      event.preventDefault();
      openExternal(url);
    }
  });
  mainWindow.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  mainWindow.once("ready-to-show", () => {
    if (!smokeTest && !flowTest) mainWindow.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on("close", (event) => {
    if (!quitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.loadURL(entryUrl).catch((error) => {
    console.error(error);
    if (smokeTest) app.exit(1);
  });
  if (smokeTest) {
    mainWindow.webContents.on("console-message", (_event, details) => {
      console.error("[renderer]", details.message);
    });
    mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
      console.error("[load-failed]", code, description, url);
    });
    const timeout = setTimeout(() => app.exit(1), 20000);
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        mainWindow.show(); mainWindow.focus();
        const result = await mainWindow.webContents
          .executeJavaScript(`(async () => {
          const deadline = Date.now() + 10000;
          while (!document.querySelector('.app') && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
          return ({
          rendered: !!document.querySelector('.app'),
          info: await window.onelinkDesktop.getAppInfo(),
          softwareUpdate: await window.onelinkDesktop.softwareUpdateStatus(),
          isolated: typeof window.require === 'undefined' && typeof window.process === 'undefined'
        })})()`);
        console.log(JSON.stringify({ ...result, dockIconApplied }, null, 2));
        clearTimeout(timeout);
        app.exit(
          result.rendered && result.isolated && !result.info.demo && result.softwareUpdate.ok && result.softwareUpdate.data.status === 'disabled' && (process.platform !== 'darwin' || dockIconApplied) ? 0 : 1,
        );
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
    });
  }
  if (flowTest) {
    const timer = setTimeout(() => app.exit(1), 120000);
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        mainWindow.show(); mainWindow.focus();
        const result = await mainWindow.webContents
          .executeJavaScript(`(async () => {
          await new Promise(r=>setTimeout(r,500));
          let lastAction = 'start';
          try {
          const wait = async fn => { for(let i=0;i<400;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,50))}throw new Error('UI state timed out after '+lastAction+': '+document.body.innerText.slice(-2500)) };
          const click = async text => {const button=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===text||b.getAttribute('title')===text||b.textContent.trim()===text);if(!button)throw new Error('Missing button '+text);if(button.disabled)throw new Error('Disabled button '+text);lastAction=text;button.click();await new Promise(r=>setTimeout(r,80))};
          const setInput = (element, value) => { Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', {bubbles:true})); };
          await wait(()=>document.querySelector('.app'));
          if ([...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='登录 OneLinkAI 账号')) await click('登录 OneLinkAI 账号');
          await wait(() => document.querySelector('.agent-management'));
          if (document.querySelector('button[title="检查客户端版本更新"]')) throw new Error('Manual update-check button must be removed');
          await wait(() => document.querySelector('[data-update-state="error"]'));
          const management = document.querySelector('.agent-management');
          if (management.innerText.includes('安装：') || management.innerText.includes('此安装由')) throw new Error('Management explanations must stay in tooltip');
          const tooltip = management.querySelector('[role="tooltip"]');
          const info = management.querySelector('.agent-info-button');
          if (!tooltip?.textContent.includes('安装：') || !info) throw new Error('Missing installation and update tooltip');
          if (getComputedStyle(tooltip).visibility !== 'hidden') throw new Error('Tooltip must be hidden initially');
          info.focus(); info.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 50));
          if (getComputedStyle(tooltip).visibility !== 'visible') throw new Error('Tooltip must show on keyboard focus');
          info.blur(); info.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 50));
          if (getComputedStyle(tooltip).visibility !== 'hidden') throw new Error('Tooltip must hide after focus leaves');
          await click('Codex 更多操作');
          await click('查看 Codex 本机配置');
          await wait(() => document.querySelector('.config-file-code'));
          if (!document.querySelector('.config-file-code').textContent.includes('local-config-flow')) throw new Error('Config reader must show actual disk contents');
          if (!document.querySelector('.config-file-code [class*=hljs-]')) throw new Error('Config reader has no syntax highlighting');
          const reader = document.querySelector('.config-reader-modal');
          if (document.querySelector('.config-reader-heading').getBoundingClientRect().height > 34) throw new Error('Reader title consumes too much space');
          if (document.querySelector('.config-file-code').getBoundingClientRect().height < reader.getBoundingClientRect().height * 0.6) throw new Error('Code must occupy most of the reader');
          const search = document.querySelector('.config-file-toolbar input');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'local-config-flow');
          search.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 50));
          if (!document.querySelector('.config-line-match [class*=hljs-]')) throw new Error('Search must preserve syntax highlighting');

          if (document.body.innerText.includes('reader-private-fixture')) throw new Error('Config reader leaked a credential');
          await click('重新读取');
          await wait(() => !document.querySelector('.config-reader-layout')?.getAttribute('aria-busy') || document.querySelector('.config-reader-layout').getAttribute('aria-busy') === 'false');
          const authFile = [...document.querySelectorAll('.config-file-list button')].find(button => button.textContent.includes('auth.json'));
          authFile.click();
          await wait(() => document.querySelector('.config-file-empty'));
          if (!document.querySelector('.config-file-empty').textContent.includes('认证文件已存在')) throw new Error('Credential-file status missing');
          await click('关闭');
          await click('查看 Gemini CLI 本机配置');
          await wait(() => document.querySelector('.config-file-empty'));
          if (!document.querySelector('.config-file-empty').textContent.includes('尚未创建')) throw new Error('Missing config status missing');
          await click('关闭');
          await click('API Keys');
          if([...document.querySelectorAll('button')].some(b=>b.textContent.includes('添加 API Key')))throw new Error('Manual key entry must not be offered');
          await wait(()=>document.querySelector('.table-actions button'));document.querySelector('.table-actions button').click();
          await wait(()=>document.querySelector('.model-picker button') && !document.querySelector('.model-loading'));
          [...document.querySelectorAll('.client-picker button')].find(button => button.textContent.includes('Codex')).click();
          await new Promise(resolve => setTimeout(resolve, 50));
          if (document.querySelector('.model-picker button.picked')) throw new Error('Missing configured model must not select a replacement');
          if (![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='预览配置')?.disabled) throw new Error('Missing model must block preview');
          if(document.querySelector('input[type=password]'))throw new Error('Configuration asks for key again');
          const modelSearch = document.querySelector('input[aria-label="搜索模型"]');
          if (document.querySelector('.model-picker').textContent.includes('gpt-6.1-sol-k')) throw new Error('Hidden model displayed before search');
          setInput(modelSearch, 'gpt-6.1-sol-k');
          await wait(() => [...document.querySelectorAll('.model-picker button')].some(button => button.textContent.includes('OpenAI: GPT 6.1 SOL K')));
          const hiddenModel = [...document.querySelectorAll('.model-picker button')].find(button => button.textContent.includes('OpenAI: GPT 6.1 SOL K'));
          hiddenModel.click(); await new Promise(resolve => setTimeout(resolve, 50));
          if (!document.querySelector('.config-selection-summary').textContent.includes('gpt-6.1-sol-k')) throw new Error('Hidden search result cannot be selected');
          setInput(modelSearch, '');
          await wait(() => !document.querySelector('.model-picker').textContent.includes('OpenAI: GPT 6.1 SOL K'));

          const sourceSelect = document.querySelector('select[aria-label="配置来源"]');
          const secondKey = [...sourceSelect.options].filter(option => option.value.startsWith('key:'))[1];
          if (!secondKey) throw new Error('Missing second key fixture');
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sourceSelect, secondKey.value);
          sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(() => document.querySelector('.model-picker button') && !document.querySelector('.model-loading'));
          if (document.querySelector('.model-picker button.picked')) throw new Error('Hidden model must not select a replacement when switching sources');
          document.querySelector('.model-picker button').click();
          await wait(() => document.querySelector('.model-picker button.picked'));
          if (document.querySelector('.model-picker').textContent.includes('密钥列表已失效')) throw new Error('Switching keys invalidates the model list');
          await click('预览配置');
          await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='确认写入'));await click('确认写入');
          await wait(()=>[...document.querySelectorAll('h2')].some(h=>h.textContent==='配置文件已写入并回读校验'));
          await click('完成');await wait(()=>document.querySelector('.restore-button'));
          await click('恢复备份');await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='确认恢复'));
          await click('手动修改'); await wait(()=>document.querySelector('.manual-restore-files code'));
          if (![...document.querySelectorAll('.restore-file-actions button')].some(b=>b.textContent==='打开当前文件位置')) throw new Error('Manual restore must expose current file locations');
          await click('返回'); await click('强制恢复');
          if (!document.querySelector('.modal').innerText.includes('自动备份当前文件')) throw new Error('Forced restore must explain safety backups');
          if (![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='确认强制恢复')) throw new Error('Forced restore must require confirmation');
          await click('返回'); await click('确认恢复');
          await wait(()=>document.querySelector('.data-table .pill')?.textContent==='已恢复');
          await click('请求记录');await wait(()=>document.querySelector('.request-empty'));
          await wait(()=>document.querySelector('button[aria-label="全部用户"]'));
          if (document.querySelector('.request-filters select, .request-filters input[type="datetime-local"]')) throw new Error('Request filters must use custom controls');
          document.querySelector('button[aria-label="全部模型"]').click();
          await wait(()=>document.querySelector('.request-filter-popover:popover-open input'));
          setInput(document.querySelector('.request-filter-popover:popover-open input'), 'no-match');
          await wait(()=>document.querySelector('.request-filter-empty'));
          setInput(document.querySelector('.request-filter-popover:popover-open input'), 'GPT-REQUEST-TEST');
          await wait(()=>document.querySelectorAll('.request-filter-popover:popover-open [role="option"]').length===1);
          document.querySelector('.request-filter-popover:popover-open input').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true}));
          await wait(()=>document.querySelector('button[aria-label="全部模型"]').textContent.includes('Request model'));
          document.querySelector('button[aria-label="请求时间范围"]').click();
          await wait(()=>document.querySelector('.request-range-popover:popover-open'));
          await click('今天');
          await new Promise(r=>setTimeout(r,30));
          setInput(document.querySelector('input[aria-label="范围开始时刻"]'), '20:00');
          setInput(document.querySelector('input[aria-label="范围结束时刻"]'), '10:00');
          await wait(()=>document.querySelector('.range-confirm').disabled);
          setInput(document.querySelector('input[aria-label="范围结束时刻"]'), '23:59');
          await wait(()=>!document.querySelector('.range-confirm').disabled);
          await click('确定范围');
          await wait(()=>document.querySelector('.request-range-trigger').textContent.includes('20:00'));
          const savedRange = document.querySelector('.request-range-trigger').textContent;
          document.querySelector('.request-range-trigger').click();
          await wait(()=>document.querySelector('.request-range-popover:popover-open'));
          await click('近 7 天'); await click('取消');
          if(document.querySelector('.request-range-trigger').textContent!==savedRange) throw new Error('Cancelling must preserve committed range');
          document.querySelector('.request-range-trigger').click();
          await wait(()=>document.querySelector('.request-range-popover:popover-open'));
          const rangeDays = document.querySelectorAll('.request-range-days button');
          rangeDays[12].click(); await new Promise(r=>setTimeout(r,30)); rangeDays[5].click();
          await wait(()=>!document.querySelector('.range-confirm').disabled);
          await click('确定范围');
          document.querySelector('button[aria-label="重置筛选"]').click();
          await wait(()=>document.querySelector('.request-range-trigger').textContent.includes('选择时间范围'));
          if(!document.querySelector('button[aria-label="全部模型"]').textContent.includes('全部模型')) throw new Error('Reset must clear model filter');

          const invoke = async (name, input) => { const r = await window.onelinkDesktop[name](input); if(!r.ok) throw new Error(r.error); return r.data; };

          await click('模型服务商');
          if (document.querySelector('.provider-fields')) throw new Error('Provider form must not occupy the list page');
          await click('添加服务商');
          await wait(() => document.querySelector('.provider-editor-modal'));
          if (document.activeElement !== document.querySelector('.provider-fields input')) throw new Error('Provider name must receive initial focus');
          if (document.querySelector('.provider-optional').open) throw new Error('Optional provider fields must start collapsed');
          setInput(document.querySelector('.provider-fields input'), 'Discarded draft');
          setInput(document.querySelector('.provider-fields input[type="password"]'), 'discarded-secret');
          document.querySelector('.provider-optional summary').click();
          await new Promise(r=>setTimeout(r,50));
          await click('取消');
          await wait(() => !document.querySelector('.provider-editor-modal'));
          if ((await invoke('localProviders')).length) throw new Error('Cancel must not create a provider');
          await click('添加服务商');
          await wait(() => document.querySelector('.provider-editor-modal'));
          if (document.querySelector('.provider-fields input').value || document.querySelector('.provider-fields input[type="password"]').value || document.querySelector('.provider-optional').open) throw new Error('New provider dialog retained a cancelled draft');
          const saveButton = document.querySelector('.provider-editor-footer button[type="submit"]');
          setInput(document.querySelector('.provider-fields input'), 'Flow provider');
          setInput(document.querySelector('.provider-fields input[type="url"]'), 'http://127.0.0.1:${modelServer?.address()?.port}');
          setInput(document.querySelector('.provider-fields input[type="password"]'), 'flow-test-secret');
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(document.querySelector('.provider-fields select'), 'anthropic');
          document.querySelector('.provider-fields select').dispatchEvent(new Event('change', { bubbles:true }));
          await new Promise(r=>setTimeout(r,50));
          document.querySelectorAll('.provider-editor-modal .protocol-choices input:not(:checked)').forEach(input => input.click());
          await new Promise(r=>setTimeout(r,50));
          saveButton.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key:'Tab', bubbles:true, cancelable:true }));
          if (document.activeElement !== document.querySelector('.modal-close')) throw new Error('Provider dialog must contain keyboard focus');
          await click('保存服务商');
          await wait(() => document.querySelector('.provider-summary strong')?.textContent === 'Flow provider');
          if (document.querySelector('.provider-editor-modal')) throw new Error('Saved provider dialog must close');
          const provider = (await invoke('localProviders'))[0];
          await click('编辑');
          await wait(() => document.querySelector('.provider-editor-modal'));
          if (document.querySelector('.provider-fields input[type="password"]').value) throw new Error('Editing provider must not expose its saved credential');
          document.querySelector('.provider-optional summary').click();
          setInput(document.querySelector('.provider-fields input'), 'Edited provider');
          setInput(document.querySelector('input[placeholder="例如 工作账号、备用线路"]'), 'Shared account');
          setInput(document.querySelector('input[placeholder="https://example.com"]'), 'https://example.com/account');
          await new Promise(r=>setTimeout(r,50));
          await click('保存服务商');
          await wait(()=>document.querySelector('.provider-summary strong')?.textContent==='Edited provider');
          if(document.querySelector('.provider-notes')?.textContent!=='Shared account') throw new Error('Provider notes missing');
          if(document.querySelector('.provider-website')?.title!=='https://example.com/account') throw new Error('Provider website missing');
          await click('编辑');
          await wait(() => document.querySelector('.provider-editor-modal'));
          if (!document.querySelector('.provider-optional').open) throw new Error('Existing provider details must be expanded when editing');
          document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
          await wait(() => !document.querySelector('.provider-editor-modal'));

          await click('一键拉取模型'); await wait(()=>document.querySelector('.model-import-row'));
          if (document.querySelector('.provider-model-row')) throw new Error('Fetch must not import automatically');
          const importSearch = document.querySelector('input[aria-label="搜索待选模型"]');
          setInput(importSearch, 'no-matching-model'); await new Promise(resolve => setTimeout(resolve, 50));
          if (document.querySelector('.model-import-row')) throw new Error('Model import search did not filter');
          setInput(importSearch, 'claude'); await new Promise(resolve => setTimeout(resolve, 50));
          if (!document.querySelector('.model-import-row')) throw new Error('Model import search lost matching model');
          await click('全选当前结果');
          if (!document.querySelector('.model-import-row input').checked) throw new Error('Filtered selection failed');
          await click('取消');
          if (document.querySelector('.provider-model-row')) throw new Error('Cancel changed saved models');
          await click('一键拉取模型'); await wait(()=>document.querySelector('.model-import-row'));
          if (document.querySelector('.model-import-row input').checked) throw new Error('New models must not be preselected');
          document.querySelector('.model-import-row input').click();
          await click('确认选择'); await wait(()=>document.querySelector('.provider-model-row'));
          await click('停用模型'); await wait(() => document.querySelector('.provider-model-row.is-disabled'));
          if (!document.querySelector('.provider-model-row .model-default-button').disabled) throw new Error('Disabled models must not become default');
          await click('启用模型'); await wait(() => !document.querySelector('.provider-model-row.is-disabled'));
          await click('设为默认'); await wait(()=>document.querySelector('.provider-model-row.is-default'));
          if (document.querySelector('.provider-model-status').textContent !== '默认模型') throw new Error('Default model status is missing');
          if (!document.querySelector('.provider-model-row .model-default-button').disabled) throw new Error('Current default action must be disabled');
          await click('一键配置'); await wait(()=>document.querySelector('.client-picker'));
          document.querySelector('.client-picker button[title="Codex"]').click();
          await wait(()=>document.querySelector('#protocol')?.value === '');
          if (![...document.querySelectorAll('button')].find(button => button.textContent.trim() === '预览配置')?.disabled) throw new Error('Incompatible model must block preview');
          const incompatible = await window.onelinkDesktop.preview({ providerId: provider.id, client: 'codex', model: 'claude-sonnet-flow-test', protocol: 'responses' });
          if (incompatible.ok || !incompatible.error.includes('不支持')) throw new Error('IPC must reject unsupported model protocol');
          await click('关闭');
          await click('编辑模型资料'); await wait(()=>document.querySelector('input[aria-label="模型显示名称"]'));
          document.querySelectorAll('.model-settings-editor .protocol-choices input:not(:checked)').forEach(input => input.click());
          setInput(document.querySelector('input[aria-label="模型显示名称"]'), 'Renamed model');
          setInput(document.querySelector('.model-settings-editor input[aria-label="上下文窗口"]'), '256000');
          setInput(document.querySelector('.model-settings-editor input[aria-label="最大输出 Token"]'), '16000');
          await new Promise(r=>setTimeout(r,50)); await click('保存模型参数');
          await wait(()=>document.querySelector('.provider-model-row')?.textContent.includes('Renamed model'));
          await click('一键配置'); await wait(()=>document.querySelector('.model-picker button') && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='预览配置'&&!b.disabled));
          if (!document.querySelector('#protocol')?.value || document.querySelector('#protocol option:checked')?.disabled) throw new Error('Compatible model protocol not selected');
          document.querySelector('button[aria-label="刷新模型"]').click(); await new Promise(resolve => setTimeout(resolve, 50)); await wait(()=>!document.querySelector('button[aria-label="刷新模型"]')?.disabled);
          if (!document.querySelector('.model-picker button')?.textContent.includes('Renamed model')) throw new Error('Model sync discarded local name');
          const savedModels = await invoke('localModels');
          const savedModel = savedModels.find(model => model.providerId === provider.id);
          if(savedModel.contextWindow!==256000 || savedModel.maxTokens!==16000) throw new Error('Model sync discarded limits');
          document.querySelector('.client-picker button[title="Claude Code"]').click();
          await new Promise(resolve => setTimeout(resolve, 50));
          if (!document.querySelector('.model-picker button.picked')) {
            document.querySelector('.model-picker button').click();
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          document.querySelector('.configuration-advanced').open = true;
          setInput(document.querySelector('.configuration-advanced input[aria-label="最大输出 Token"]'), '12000');
          await new Promise(resolve => setTimeout(resolve, 50));
          await click('本机配置');
          await wait(() => document.querySelector('.config-pane-content .config-file-list'));
          if (!document.querySelector('.configuration-advanced')) throw new Error('Embedded file viewer hid settings');
          if (document.querySelector('.configuration-advanced input[aria-label="最大输出 Token"]').value !== '12000') throw new Error('File viewer discarded configuration draft');
          if(!document.querySelector('.configuration-advanced input[aria-label="上下文窗口"]')?.disabled) throw new Error('Claude context is server-managed');
          if(document.querySelector('.configuration-advanced input[aria-label="最大输出 Token"]')?.disabled) throw new Error('Claude output must be editable');
          const advanced = await invoke('preview', { providerId: provider.id, model: savedModel.id, client: 'codex', protocol: 'responses' });
          if(!advanced.files[0].content.replaceAll('_', '').includes('modelcontextwindow = 256000')) throw new Error('Shared model context not passed through IPC');
          if(!advanced.notice.includes('最大输出 Token')) throw new Error('Unsupported settings must be explained');
          await click('预览配置'); await wait(()=>document.querySelector('.preview-editor'));
          if (document.querySelector('.preview-editor').readOnly || document.querySelector('.preview-editor').disabled) throw new Error('Preview must be directly editable');
          const editable = document.querySelector('.preview-editor');
          const edited = JSON.parse(editable.value); edited.onekey_preview_test = true;
          setInput(editable, JSON.stringify(edited, null, 2));
          await click('查看高亮'); await wait(()=>document.querySelector('.preview-code')?.textContent.includes('onekey_preview_test'));
          await click('还原此文件');
          await wait(()=>!document.querySelector('.preview-code')?.textContent.includes('onekey_preview_test'));
          const dialog = document.querySelector('.configure-workflow');
          const bounds = dialog.getBoundingClientRect();
          const footer = document.querySelector('.config-workspace-footer').getBoundingClientRect();
          if (dialog.scrollHeight > dialog.clientHeight + 2 || footer.bottom > bounds.bottom) throw new Error('Workspace footer clipped');
          if (getComputedStyle(document.querySelector('.client-picker')).display !== 'flex') throw new Error('Application tabs must stay in one row');
          await click('本机配置'); await wait(()=>document.querySelector('.config-file-list'));
          if (!document.querySelector('.configuration-advanced')) throw new Error('Preview replaced configuration controls');
          document.querySelectorAll('.config-pane-tabs button')[1].click();
          setInput(document.querySelector('.configuration-advanced input[aria-label="最大输出 Token"]'), '13000');
          await new Promise(resolve => setTimeout(resolve, 60));
          if ([...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='确认写入')) throw new Error('Stale preview remains writable');
          await click('关闭');
          // Check every application's controls through the real renderer and IPC.
          const clients = [
            ['claude', 'Claude Code', 'anthropic'], ['claude-desktop', 'Claude Desktop', 'anthropic'], ['codex', 'Codex', 'responses'],
            ['gemini', 'Gemini CLI', 'gemini'], ['grok', 'Grok Build', 'responses'], ['opencode', 'OpenCode', 'openai'], ['openclaw', 'OpenClaw', 'openai'],
            ['pi', 'Pi', 'openai'], ['minimax', 'MiniMax Code', 'openai'], ['deepseek-harness', 'DeepSeek Harness CLI', 'openai'], ['deepseek-harness-desktop', 'DeepSeek Harness Desktop', 'openai'], ['zed', 'Zed', 'openai'],
            ['vscode', 'VS Code', 'openai'], ['zcode', 'ZCode', 'openai'], ['workbuddy', 'WorkBuddy', 'openai'], ['hermes', 'Hermes', 'openai'],
          ];
          const setSelect = (element, value) => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('change', { bubbles: true })); };
          const verifiedClients = [];
          for (const [id, name, protocol] of clients) {
            await click('一键配置');
            await wait(() => document.querySelector('.client-picker'));
            const button = [...document.querySelectorAll('.client-picker button')].find(button => button.title === name);
            if (!button || button.disabled) throw new Error('Application not selectable: ' + name);
            button.click(); await new Promise(resolve => setTimeout(resolve, 50));
            if (!document.querySelector('.model-picker button.picked')) {
              document.querySelector('.model-picker button').click();
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            setSelect(document.querySelector('#protocol'), protocol); await new Promise(resolve => setTimeout(resolve, 50));
            if (id === 'deepseek-harness') {
              const profileInput = document.querySelector('input[aria-label="DSH CLI Profile"]');
              if (!profileInput || profileInput.value !== 'web') throw new Error('DSH CLI must default to web profile');
              if (!profileInput.closest('.config-details-column') || profileInput.closest('.config-controls')) throw new Error('DSH CLI profile must stay in advanced settings');
              const label = profileInput.closest('label').querySelector('span').getBoundingClientRect();
              const field = profileInput.getBoundingClientRect();
              if (field.top < label.bottom || field.width > profileInput.closest('.configuration-advanced').clientWidth) throw new Error('DSH profile layout overlaps or overflows');
              setInput(profileInput, 'flow-custom');
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            const advanced = document.querySelector('.configuration-advanced');
            advanced.open = true;
            for (const [field, label] of [['contextWindow', '上下文窗口'], ['maxTokens', '最大输出 Token']]) {
              const input = advanced.querySelector('input[aria-label="' + label + '"]');
              if (!input) throw new Error('Missing spec field: ' + name + ' ' + label);
              if (!input.disabled) setInput(input, field === 'contextWindow' ? '256000' : '16000');
            }
            const effort = advanced.querySelector('select[aria-label="推理档位"]');
            if (effort) setSelect(effort, 'high');
            await new Promise(resolve => setTimeout(resolve, 50));
            await click('预览配置');
            await wait(() => document.querySelector('.preview-editor') || document.querySelector('.preview-code'));
            if (document.querySelector('.preview-editor')) await click('查看高亮');
            let preview = '';
            for (const fileTab of document.querySelectorAll('.preview-file-tabs button')) {
              fileTab.click(); await new Promise(resolve => setTimeout(resolve, 30));
              if (document.querySelector('.preview-editor')) await click('查看高亮');
              preview += document.querySelector('.preview-code').textContent;
            }
            if (!document.querySelector('.preview-code [class*=hljs-]')) throw new Error('Missing preview highlighting: ' + name);
            if (!preview.includes('claude-sonnet-flow-test')) throw new Error('Preview missing selected model: ' + name);
            if (id === 'deepseek-harness' && !document.body.innerText.includes('flow-custom')) throw new Error('DSH CLI profile was lost over IPC');
            if (id === 'deepseek-harness-desktop' && document.querySelector('input[aria-label="DSH CLI Profile"]')) throw new Error('Desktop must not use the CLI profile control');
            if (id === 'vscode' && !document.body.innerText.includes('密钥尚未写入')) throw new Error('Missing VS Code credential step');
            verifiedClients.push(id);
            await click('关闭');
          }
          if (verifiedClients.length !== 16) throw new Error('Incomplete application coverage');
          await click('概览');await wait(()=>document.querySelector('.overview-stats'));
          const launchSelect = document.querySelector('select[aria-label="运行 Codex"]');
          if (!launchSelect || launchSelect.disabled || !launchSelect.querySelector('option[value="cli"]') || !launchSelect.querySelector('option[value="desktop"]')) throw new Error('Codex must offer launch targets directly in a dropdown');
          for (const target of ['desktop', 'cli']) {
            setSelect(launchSelect, target);
            await wait(() => !launchSelect.disabled);
            if (document.querySelector('[role=dialog]')) throw new Error('Launching must not open a choice dialog');
          }

          for (const [name, message] of [['DeepSeek Harness CLI', 'DSH CLI'], ['DeepSeek Harness Desktop', '桌面应用']]) {
            const launch = document.querySelector('button[aria-label="运行 ' + name + '"]');
            if (!launch || launch.disabled) throw new Error('Missing launch button: ' + name);
            launch.click();
            await wait(() => document.querySelector('.toast')?.textContent.includes(message));
          }
          await click('模型服务商'); await click('刷新'); await wait(()=>document.querySelector('.provider-model-row'));
          await click('编辑模型资料'); await wait(()=>document.querySelector('.model-settings-editor'));
          document.querySelector('.model-settings-editor').scrollIntoView({block:'start'});
          return {uiFlow:true, automaticBackgroundUpdates:true, installationCapabilitiesVisible:true, compactManagementTooltip:true, localConfigReader:true, providerEditSyncDefaultAndConfig:true, sharedModelLimitsAndCapabilities:true, allApplicationControls:verifiedClients, platformKeyReused:true, modelsFetched:true, history:await window.onelinkDesktop.history()};
          } catch (error) { throw new Error(lastAction + ': ' + error.stack); }
        })()`);
        if (!agentLaunchRequests.some(value => value.kind === 'terminal') || !agentLaunchRequests.some(value => value.kind === 'desktop' && value.target.endsWith('DeepSeek Harness.app')))
          throw new Error('Agent launch IPC did not reach the expected terminal and desktop targets');
        const exists = await fs
          .access(path.join(testRoot, ".claude/settings.json"))
          .then(
            () => true,
            () => false,
          );
        mainWindow.close();
        const trayResident = !!tray && !tray.isDestroyed() && !mainWindow.isDestroyed() && !mainWindow.isVisible();
        showWindow();
        const trayReopened = mainWindow.isVisible();
        console.log(
          JSON.stringify({ ...result, originalFileRestored: !exists, trayResident, trayReopened }, null, 2),
        );
        await fs.mkdir(path.join(__dirname, "../artifacts"), {
          recursive: true,
        });
        mainWindow.show();
        await new Promise(resolve => setTimeout(resolve, 700));
        const screenshot = await mainWindow.webContents.capturePage();
        await fs.writeFile(
          path.join(__dirname, "../artifacts/desktop-real-flow.png"),
          screenshot.toPNG(),
        );
        await mainWindow.webContents.executeJavaScript(`(async () => {
          document.querySelector('.provider-model-section')?.scrollIntoView();
          [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '一键配置').click();
          for (let i = 0; i < 100 && !document.querySelector('.client-picker'); i++) await new Promise(resolve => setTimeout(resolve, 50));
          document.querySelector('.client-picker button[title="Codex"]').click();
          for (let i = 0; i < 100 && !document.querySelector('.config-file-code [class*=hljs-]'); i++) await new Promise(resolve => setTimeout(resolve, 50));
          const right = document.querySelector('.config-details-column');
          const advanced = right.querySelector('.configuration-advanced');
          const inspector = right.querySelector('.config-inspector');
          if (!advanced || !inspector || document.querySelector('.config-controls .configuration-advanced')) throw new Error('Advanced settings must be in the right column');
          if (advanced.getBoundingClientRect().bottom > inspector.getBoundingClientRect().top) throw new Error('Files must follow advanced settings');
          if (getComputedStyle(right).overflowY !== 'auto' || right.scrollHeight <= right.clientHeight) throw new Error('Right column must scroll through settings and files');
          const pane = document.querySelector('.config-pane-content').getBoundingClientRect();
          const code = document.querySelector('.config-file-code').getBoundingClientRect();
          if (code.top - pane.top > 115 || code.height < pane.height * 0.6) throw new Error('Embedded reader header consumes too much space');
        })()`);
        await new Promise(resolve => setTimeout(resolve, 300));
        await fs.writeFile(path.join(__dirname, '../artifacts/config-workspace.png'), (await mainWindow.webContents.capturePage()).toPNG());
        await mainWindow.webContents.executeJavaScript(`(async () => {
          document.querySelector('.client-picker button[title="DeepSeek Harness CLI"]').click();
          const query = document.querySelector('input[aria-label="搜索模型"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(query, 'no-matching-model-layout-check');
          query.dispatchEvent(new Event('input', { bubbles: true }));
          for (let i = 0; i < 100 && !document.querySelector('.model-picker-empty'); i++) await new Promise(resolve => setTimeout(resolve, 50));
          const empty = document.querySelector('.model-picker-empty');
          if (!empty?.closest('.model-picker') || document.querySelector('.config-model-layout > .inline-empty')) throw new Error('Empty model message must stay inside the list');
        })()`);
        await new Promise(resolve => setTimeout(resolve, 300));
        await fs.writeFile(path.join(__dirname, '../artifacts/dsh-config-workspace.png'), (await mainWindow.webContents.capturePage()).toPNG());
        await mainWindow.webContents.executeJavaScript(`document.querySelector('.modal-close').click()`);
        await mainWindow.webContents.executeJavaScript(`(async () => {
          [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '概览').click();
          for (let i = 0; i < 100 && !document.querySelector('.agent-management'); i++) await new Promise(resolve => setTimeout(resolve, 50));
          document.querySelector('.agents-section').scrollIntoView({ block: 'start' });
        })()`);
        await new Promise(resolve => setTimeout(resolve, 300));
        const infoPoint = await mainWindow.webContents.executeJavaScript(`(() => { const rect = document.querySelector('.agent-info-button').getBoundingClientRect(); return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }; })()`);
        mainWindow.focus();
        mainWindow.webContents.debugger.attach('1.3');
        await mainWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...infoPoint });
        await new Promise(resolve => setTimeout(resolve, 150));
        const tooltipVisible = await mainWindow.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.agent-detail-tooltip')).visibility === 'visible'`);
        if (!tooltipVisible) throw new Error('Tooltip did not open on real mouse hover');
        mainWindow.webContents.debugger.detach();
        const managementScreenshot = await mainWindow.webContents.capturePage();
        await fs.writeFile(path.join(__dirname, '../artifacts/agent-management.png'), managementScreenshot.toPNG());
        const tooltipChecks = [];
        for (const [width, height] of [[800, 600], [1100, 720]]) {
          mainWindow.setSize(width, height);
          await new Promise(resolve => setTimeout(resolve, 150));
          tooltipChecks.push(await mainWindow.webContents.executeJavaScript(`(async () => {
            for (const footer of document.querySelectorAll('.agent-tile-footer')) {
              if (footer.scrollWidth > footer.clientWidth + 1) throw new Error('Card footer overflows');
              if (footer.querySelectorAll(':scope > button').length > 3) throw new Error('Too many visible card actions');
              for (const button of footer.querySelectorAll(':scope > button')) {
                if (button.getBoundingClientRect().height > 34) throw new Error('Card action wrapped');
              }
            }
            const more = document.querySelector('.agent-more-button');
            more.click();
            const menu = [...document.querySelectorAll('.agent-card-menu')].find(panel => panel.matches(':popover-open'));
            if (!menu || !menu.textContent.includes('本机配置') || !menu.textContent.includes('卸载客户端')) throw new Error('Missing secondary card actions');
            const menuBounds = menu.getBoundingClientRect();
            if (menuBounds.left < 0 || menuBounds.top < 0 || menuBounds.right > innerWidth || menuBounds.bottom > innerHeight) throw new Error('Card menu clipped');
            menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            if (menu.matches(':popover-open') || document.activeElement !== more) throw new Error('Menu Escape must restore trigger focus');
            const info = document.querySelector('.agent-info-button');
            const anchor = info.parentElement;
            const panel = anchor.querySelector('[role="tooltip"]');
            const tile = anchor.closest('.agent-tile');
            const originalStyle = anchor.style.cssText;
            const originalOverflow = tile.style.overflow;
            const originalText = panel.textContent;
            tile.style.overflow = 'hidden';
            let checked = 0;
            for (const [x, y] of [[12, 12], [innerWidth - 32, 12], [12, innerHeight - 32], [innerWidth - 32, innerHeight - 32]]) {
              anchor.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:5';
              info.focus(); info.click();
              await new Promise(resolve => setTimeout(resolve, 30));
              const rect = panel.getBoundingClientRect();
              if (!panel.matches(':popover-open') || rect.left < 11 || rect.top < 11 || rect.right > innerWidth - 11 || rect.bottom > innerHeight - 11) throw new Error('Tooltip outside viewport at ' + x + ',' + y);
              const hit = document.elementFromPoint(rect.left + 8, rect.top + 8);
              if (hit !== panel && !panel.contains(hit)) throw new Error('Tooltip clipped by ancestor');
              info.blur(); checked++;
            }
            panel.textContent = originalText + ('\\nLong detail / very-long-installation-path-abcdefghijklmnopqrstuvwxyz').repeat(80);
            info.focus(); info.click(); await new Promise(resolve => setTimeout(resolve, 30));
            if (panel.scrollHeight <= panel.clientHeight || getComputedStyle(panel).overflowY !== 'auto') throw new Error('Long tooltip must be scrollable');
            info.blur(); panel.textContent = originalText;
            anchor.style.cssText = originalStyle; tile.style.overflow = originalOverflow;
            return { width: innerWidth, height: innerHeight, corners: checked, clipping: false, longContentScrollable: true };
          })()`));
        }
        console.log(JSON.stringify({ tooltipViewportChecks: tooltipChecks }));
        mainWindow.setSize(960, 720);
        await mainWindow.webContents.executeJavaScript(`(async () => {
          document.querySelector('button[aria-label="Codex 更多操作"]').click();
          document.querySelector('button[aria-label="查看 Codex 本机配置"]').click();
          for (let i = 0; i < 100 && !document.querySelector('.config-file-code'); i++) await new Promise(resolve => setTimeout(resolve, 50));
        })()`);
        await new Promise(resolve => setTimeout(resolve, 200));
        const configScreenshot = await mainWindow.webContents.capturePage();
        await fs.writeFile(path.join(__dirname, '../artifacts/local-config-reader.png'), configScreenshot.toPNG());
        await mainWindow.webContents.executeJavaScript(`(async () => {
          document.querySelector('.modal-close')?.click();
          [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='请求记录').click();
          for(let i=0;i<100&&!document.querySelector('.request-range-trigger');i++) await new Promise(r=>setTimeout(r,50));
          document.querySelector('.request-range-trigger').click();
        })()`);
        await new Promise(resolve => setTimeout(resolve, 200));
        await fs.writeFile(path.join(__dirname, '../artifacts/request-range.png'), (await mainWindow.webContents.capturePage()).toPNG());
        await mainWindow.webContents.executeJavaScript(`document.querySelector('button[aria-label="全部模型"]').click()`);
        await new Promise(resolve => setTimeout(resolve, 200));
        await fs.writeFile(path.join(__dirname, '../artifacts/request-search.png'), (await mainWindow.webContents.capturePage()).toPNG());
        clearTimeout(timer);
        await fs.rm(testRoot, { recursive: true, force: true });
        modelServer?.close();
        app.exit(result.uiFlow && !exists && trayResident && trayReopened ? 0 : 1);
      } catch (error) {
        console.error(error);
        clearTimeout(timer);
        if (testRoot) await fs.rm(testRoot, { recursive: true, force: true });
        app.exit(1);
      }
    });
  }
}

app.whenReady().then(async () => {
  const softwareUpdatesEnabled = app.isPackaged && !smokeTest && !flowTest &&
    (process.platform !== 'linux' || !!process.env.APPIMAGE);
  const softwareUpdater = !softwareUpdatesEnabled ? null : process.platform === 'darwin'
    ? new (require('./mac-dmg-update.cjs').createMacDmgUpdaterClass())()
    : require('electron-updater').autoUpdater;
  const softwareUpdates = require('./software-updates.cjs').createSoftwareUpdates({
    updater: softwareUpdater,
    dialog, getWindow: () => mainWindow, version: app.getVersion(), enabled: softwareUpdatesEnabled,
    baseURL: process.env.ONELINK_SOFTWARE_UPDATE_URL,
    apiURL: process.env.ONELINK_SOFTWARE_UPDATE_API_URL || require('../build/software-update.json').apiURL,
  });
  let updateCleanupStarted = false;
  app.on('before-quit', event => {
    if (!softwareUpdater?.disposePreparedUpdate || updateCleanupStarted) return;
    event.preventDefault();
    updateCleanupStarted = true;
    // Wait for an active read-only mount to detach before exiting the process.
    softwareUpdater.disposePreparedUpdate().catch(console.error).finally(() => app.quit());
  });
  // Squirrel.Mac closes windows before app.before-quit; bypass close-to-tray then.
  nativeAutoUpdater.on('before-quit-for-update', () => { quitting = true; });
  // BrowserWindow.icon does not replace the macOS Dock icon in a source launch.
  if (process.platform === 'darwin' && app.dock) {
    const icon = nativeImage.createFromPath(path.join(__dirname, '../build/icons/mac-icon.png'));
    if (!icon.isEmpty()) {
      app.dock.setIcon(icon);
      dockIconApplied = true;
    }
  }
  if (!developmentUrl) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'",
          ],
        },
      }),
    );
  }
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle("onelink:app-info", (event) => {
    if (!isTrustedFrame(event)) throw new Error("Untrusted IPC sender");
    return {
      version: app.getVersion(),

      platform: process.platform,
      desktop: true,
      demo: false,
    };
  });
  let testOptions = {};
  if (flowTest) {
    modelServer=require('node:http').createServer((req,res)=>{
      res.setHeader('Content-Type','application/json');
      if (req.url === '/v1/public/models/grouped-by-month') {
        res.end(JSON.stringify({ code: 0, data: { data: [{ month: '2026-11', models: [
          { modelId: 'claude-sonnet-flow-test', name: 'Flow model', type: '文本模型', showInSquare: true },
          { modelId: 'gpt-6.1-sol-k', name: 'OpenAI: GPT 6.1 SOL K', type: '文本模型', showInSquare: false },
        ] }] } }));
      } else if (req.url.startsWith('/api/v1/models')) {
        res.end(JSON.stringify({ code: 0, data: { models: [] } }));
      } else res.end(JSON.stringify({data:[{id:'claude-sonnet-flow-test',owned_by:'test'}]}));
    });
    await new Promise(resolve=>modelServer.listen(0,'127.0.0.1',resolve));
    testRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onelink-electron-flow-"),
    );
    const bin = path.join(testRoot, "bin");
    await fs.mkdir(bin);
    await fs.writeFile(
      path.join(bin, "claude"),
      '#!/bin/sh\nprintf "2.1.0\\n"\n',
      { mode: 0o700 },
    );
    await fs.writeFile(path.join(bin, 'codex'), '#!/bin/sh\nprintf "1.0.0\\n"\n', { mode: 0o700 });
    for (const name of ['claude-desktop', 'gemini', 'grok', 'opencode', 'openclaw', 'pi', 'mcode', 'dsh', 'zed', 'code', 'zcode', 'workbuddy', 'hermes']) await fs.writeFile(path.join(bin, name), '#!/bin/sh\nprintf "1.122.0\\n"\n', { mode: 0o700 });
    await fs.mkdir(path.join(testRoot, '.codex'), { recursive: true });
    await fs.writeFile(path.join(testRoot, '.codex/config.toml'), 'model = "local-config-flow"\nmodel_context_window = 128000\n[model_providers.custom]\nbase_url = "https://example.com/v1"\nexperimental_bearer_token = "reader-private-fixture"\n');
    await fs.writeFile(path.join(testRoot, '.codex/auth.json'), '{"token":"reader-auth-private-fixture"}');
    await fs.mkdir(path.join(testRoot, "Applications/DeepSeek Harness.app"), { recursive: true });
    await fs.mkdir(path.join(testRoot, 'Applications/Codex.app/Contents'), { recursive: true });
    await fs.writeFile(path.join(testRoot, 'Applications/Codex.app/Contents/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.openai.codex</string><key>CFBundleShortVersionString</key><string>1.0.0</string></dict></plist>');
    testOptions = {
      home: testRoot,
      env: { PATH: bin },
      applicationDirs: [path.join(testRoot, "Applications")],
      dataDir: path.join(testRoot, "state"),
    };
  }
  const workbuddySelection = require('./workbuddy-selection.cjs').createWorkbuddySelectionReader({
    BrowserWindow, session,
    configDirectory: process.env.WORKBUDDY_CONFIG_DIR || path.join(require('node:os').homedir(), '.workbuddy'),
    legacySessionDirectory: path.join(app.getPath('appData'), 'WorkBuddy'),
  });
  const zcodeSelection = require('./workbuddy-selection.cjs').createLocalSelectionReader({
    BrowserWindow, session, client: 'zcode',
    directories: [path.join(app.getPath('appData'), 'ZCode/session')],
  });
  const agents = createAgentService({
    ...(!flowTest && process.platform === 'darwin' ? {
      credentials: require('./credentials.cjs').macCredentials(safeStorage),
    } : {}),
    ...(!flowTest ? { readClientSelection: (client, directory) => {
      if (client === 'workbuddy') return workbuddySelection();
      if (client === 'zcode') return zcodeSelection();
      if (client === 'vscode') return require('./vscode-selection.cjs').readVscodeSelection(directory);
      return null;
    } } : {}),
    dataDir: path.join(app.getPath("userData"), "agent-config"),
    ...testOptions,
  });
  const launcher = require('./agent-launcher.cjs').createAgentLauncher({
    detect: () => agents.detect(), history: () => agents.history(),
    openPath: value => flowTest ? (agentLaunchRequests.push({ kind: 'desktop', target: value }), '') : shell.openPath(value),
    ...(flowTest ? { home: testRoot, env: testOptions.env,
      execute: async (file, args) => { agentLaunchRequests.push({ kind: 'terminal', file, args }); if (file === '/usr/bin/open') await fs.rm(path.dirname(args.at(-1)), { recursive: true, force: true }); },
      start: async (file, args) => { agentLaunchRequests.push({ kind: 'process', file, args }); },
    } : {}),
  });
  const keyStore = flowTest ? createPlatformService({
    modelEndpoint: flowTest ? 'http://127.0.0.1:' + modelServer.address().port : undefined,
  }) : createLivePlatform({ sessionStore: require('./session-store.cjs').createSessionStore(path.join(app.getPath('userData'), 'platform')) });
  const localProviders = flowTest ? createLocalProviderStore()
    : createPersistentLocalProviderStore(path.join(app.getPath('userData'), 'local-providers'));
  const platformLogin = createPlatformLogin({ BrowserWindow, session, platform: keyStore });
  const demoStatus = { authenticated: true, demo: true, user: { nickname: 'Demo 工作空间' } };
  const { createProxyBridge } = require('./install-network.cjs');
  const installer = createInstaller({ detect: () => agents.detect(),
    fetcher: (url, options) => net.fetch(url, options),
    resolveEnvironment: async () => createProxyBridge(await session.defaultSession.resolveProxy('https://github.com')),
  });
  const uninstaller = createUninstaller({ detect: () => agents.detect(), trashItem: value => shell.trashItem(value),
    execute: require('node:util').promisify(require('node:child_process').execFile) });
  const updates = require('./agent-updates.cjs').createAgentUpdates({ detect: () => agents.detect(), installer,
    uninstallPlan: (client, item) => item ? uninstaller.describe(item) : uninstaller.plan(client), fetcher: (url, options) => {
      if (flowTest) return Promise.reject(new Error('流程测试：版本服务暂时不可用'));
      return net.fetch(url, options);
    } });
  const withKey = async (input) => {
    if (input?.providerId) {
      const provider = await localProviders.getCredential(input.providerId);
      const savedModel = provider.models.find(model => model.id === input.model && model.enabled);
      if (!savedModel) throw new Error('请选择此服务商已启用的模型');
      const modelSettings = input.modelSettings === undefined ? savedModel : { name: savedModel.name, ...input.modelSettings };
      return { client: input.client, model: input.model, protocol: require('./provider-protocols.cjs').resolveModelProtocol(provider, savedModel, input.protocol), apiKey: provider.apiKey, baseURL: provider.baseURL, modelSettings, dshProfile: input.dshProfile };
    }
    const key = await keyStore.get(input?.keyId);
    return {
      client: input.client,
      model: input.model,
      protocol: input.protocol,
      apiKey: key.secret,
      baseURL: key.baseURL,
      modelSettings: input.modelSettings,
      dshProfile: input.dshProfile,
    };
  };
  for (const [channel, handler] of Object.entries({
    'software-update-status': () => softwareUpdates.status(),
    'software-update-check': () => softwareUpdates.check(true),
    detect: async () => updates.describe(await agents.detect()),
    'launch-agent': client => launcher.launch(client),
    "inspect-config": client => agents.inspectConfig(client),
    "auth-status": () => flowTest ? demoStatus : keyStore.status(),
    login: () => flowTest ? demoStatus : platformLogin.login(mainWindow),
    logout: () => flowTest ? demoStatus : platformLogin.logout(),
    organizations: () => flowTest ? [{ id: '个人工作空间', name: '个人工作空间' }, { id: 'OneLink 研发团队', name: 'OneLink 研发团队' }] : keyStore.orgs(),
    "install-plan": (client) => installer.plan(client),
    install: (client) => installer.install(client),
    "install-status": () => installer.status(),
    "check-updates": client => updates.check(client),
    "update-plan": client => updates.plan(client),
    "upgrade-agent": client => updates.upgrade(client),
    "uninstall-plan": client => uninstaller.plan(client),
    uninstall: input => {
      if (installer.status().running) throw new Error('安装任务正在执行，请完成后再卸载');
      return uninstaller.uninstall(input);
    },
    preview: async (input) => agents.preview(await withKey(input)),
    apply: (token) => agents.apply(token),
    restore: input => typeof input === 'string' ? agents.restore(input) : agents.restore(input?.id, { force: input?.force === true }),
    'restore-files': id => agents.restoreFiles(id),
    'reveal-restore-file': async input => {
      const files = await agents.restoreFiles(input?.id);
      const file = files.find(item => item.index === input?.index);
      const target = input?.backup === true ? file?.backupPath : file?.exists ? file.path : null;
      if (!target) throw new Error('文件不存在，无法打开位置');
      await fs.access(target);
      shell.showItemInFolder(target);
      return { revealed: true };
    },
    history: () => agents.history(),
    test: async (input) => testConnection(await withKey(input)),
    keys: (org) => keyStore.list(org),
    wallet: (org) => keyStore.wallet(org),
    models: (id) => keyStore.models(id),
    "search-models": input => keyStore.searchModels(input),
    localProviders: () => localProviders.listProviders(),
    openLocalProviderWebsite: async input => {
      const provider = (await localProviders.listProviders()).find(item => item.id === input?.id);
      if (!provider?.website) throw new Error('此服务商没有官网链接');
      const url = new URL(provider.website);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('官网链接格式无效');
      await shell.openExternal(url.href);
      return { opened: true };
    },
    createLocalProvider: input => localProviders.createProvider(input),
    updateLocalProvider: input => localProviders.updateProvider(input.id, input),
    deleteLocalProvider: input => localProviders.deleteProvider(input.id),
    localModels: () => localProviders.listModels(),
    fetchLocalModels: async input => {
      const provider = await localProviders.getCredential(input.providerId);
      const protocol = input.protocol || provider.protocol;
      if (!require('./provider-protocols.cjs').providerProtocols(provider).includes(protocol)) throw new Error('服务商不支持所选拉取协议');
      const models = (await require('./provider-models.cjs').fetchProviderModels({ ...provider, protocol }, net.fetch.bind(net))).map(model => ({ ...model, protocols: [protocol] }));
      return models;
    },
    selectLocalModels: input => localProviders.selectModels(input.providerId, input.models),
    createLocalModel: input => localProviders.createModel(input.providerId, input),
    updateLocalModel: input => localProviders.updateModel(input.providerId, input.id, input),
    deleteLocalModel: input => localProviders.deleteModel(input.providerId, input.id),
    setDefaultLocalModel: input => localProviders.setDefaultModel(input.providerId, input.modelId),
    requests: (query) => flowTest ? { connected: true, items: [], total: 0 } : keyStore.requests(query),
    "request-options": (query) => flowTest ? { models: [{ value: "gpt-request-test", label: "Request model" }], users: [{ value: "flow-user", label: "Test user" }], suppliers: [{ value: "flow-supplier", label: "Test supplier" }], types: [{ value: "text", label: "文本" }] } : keyStore.requestOptions(query),
    "request-detail": (query) => flowTest ? {} : keyStore.requestDetail(query),
  })) {
    ipcMain.handle("onelink:" + channel, async (event, input) => {
      if (!isTrustedFrame(event)) throw new Error("Untrusted IPC sender");
      try {
        return { ok: true, data: await handler(input) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
  }
  createTray();
  createWindow();
  if (softwareUpdatesEnabled) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => softwareUpdates.check(), 1500).unref();
    });
  }
  if (process.argv.includes('--platform-login') && !flowTest && !smokeTest) {
    mainWindow.webContents.once('did-finish-load', () => {
      platformLogin.login(mainWindow).then(() => mainWindow?.webContents.reload()).catch(() => {});
    });
  }
  app.on("activate", () => {
    showWindow();
  });
});
app.on("window-all-closed", () => {
  if (!tray && process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => { quitting = true; });
