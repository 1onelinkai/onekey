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

const smokeTest = process.argv.includes("--smoke-test");
const flowTest = process.argv.includes("--flow-test");
let testRoot;
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
  tray.setToolTip("OneLinkAI");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 OneLinkAI", click: showWindow },
    { label: "检测客户端", click: () => {
      showWindow();
      mainWindow.webContents.send("onelink:scan");
    } },
    { type: "separator" },
    { label: "退出 OneLinkAI", click: () => app.quit() },
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
      ["www.onelinkai.cloud", "onelinkai.cloud", "zed.dev", "code.visualstudio.com", "zcode.z.ai", "www.codebuddy.ai", "github.com", "claude.ai", "claude.com"].includes(parsed.hostname)
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
    title: "OneLinkAI",
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
          const wait = async fn => { for(let i=0;i<400;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,50))}throw new Error('UI state timed out after '+lastAction+': '+document.body.innerText.slice(-2500)) };
          const click = async text => {const button=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===text||b.getAttribute('title')===text||b.textContent.trim()===text);if(!button)throw new Error('Missing button '+text);if(button.disabled)throw new Error('Disabled button '+text);lastAction=text;button.click();await new Promise(r=>setTimeout(r,80))};
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
          await wait(()=>document.querySelector('.model-picker button') && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='预览配置'&&!b.disabled));
          if(document.querySelector('input[type=password]'))throw new Error('Configuration asks for key again');
          await click('预览配置');
          await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='确认写入'));await click('确认写入');
          await wait(()=>[...document.querySelectorAll('h2')].some(h=>h.textContent==='配置文件已写入并回读校验'));
          await click('完成');await wait(()=>document.querySelector('.restore-button'));
          await click('恢复备份');await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='确认恢复'));await click('确认恢复');
          await wait(()=>document.querySelector('.data-table .pill')?.textContent==='已恢复');
          await click('请求记录');await wait(()=>document.querySelector('.request-empty'));
          const invoke = async (name, input) => { const r = await window.onelinkDesktop[name](input); if(!r.ok) throw new Error(r.error); return r.data; };
          const provider = await invoke('createLocalProvider', { name: 'Flow provider', baseURL: 'http://127.0.0.1:${modelServer?.address()?.port}', protocol: 'anthropic', apiKey: 'flow-test-secret' });
          await click('模型服务商'); await click('刷新');
          await wait(()=>document.querySelector('.provider-summary strong')?.textContent==='Flow provider');
          await click('编辑');
          const setInput = (element, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', {bubbles:true})); };
          setInput(document.querySelector('.provider-fields input'), 'Edited provider');
          setInput(document.querySelector('input[placeholder="例如 工作账号、备用线路"]'), 'Shared account');
          setInput(document.querySelector('input[placeholder="https://example.com"]'), 'https://example.com/account');
          await new Promise(r=>setTimeout(r,50));
          await click('保存模型服务商');
          await wait(()=>document.querySelector('.provider-summary strong')?.textContent==='Edited provider');
          if(document.querySelector('.provider-notes')?.textContent!=='Shared account') throw new Error('Provider notes missing');
          if(document.querySelector('.provider-website')?.title!=='https://example.com/account') throw new Error('Provider website missing');
          await click('一键拉取模型'); await wait(()=>document.querySelector('.model-import-row'));
          if (document.querySelector('.provider-models .pill')) throw new Error('Fetch must not import automatically');
          const importSearch = document.querySelector('input[aria-label="搜索待选模型"]');
          setInput(importSearch, 'no-matching-model'); await new Promise(resolve => setTimeout(resolve, 50));
          if (document.querySelector('.model-import-row')) throw new Error('Model import search did not filter');
          setInput(importSearch, 'claude'); await new Promise(resolve => setTimeout(resolve, 50));
          if (!document.querySelector('.model-import-row')) throw new Error('Model import search lost matching model');
          await click('全选当前结果');
          if (!document.querySelector('.model-import-row input').checked) throw new Error('Filtered selection failed');
          await click('取消');
          if (document.querySelector('.provider-models .pill')) throw new Error('Cancel changed saved models');
          await click('一键拉取模型'); await wait(()=>document.querySelector('.model-import-row'));
          if (document.querySelector('.model-import-row input').checked) throw new Error('New models must not be preselected');
          document.querySelector('.model-import-row input').click();
          await click('确认选择'); await wait(()=>document.querySelector('.provider-models .pill'));
          await click('默认'); await wait(()=>document.querySelector('.provider-models .pill.success'));
          await click('编辑模型资料'); await wait(()=>document.querySelector('input[aria-label="模型显示名称"]'));
          setInput(document.querySelector('input[aria-label="模型显示名称"]'), 'Renamed model');
          setInput(document.querySelector('.model-settings-editor input[aria-label="上下文窗口"]'), '256000');
          setInput(document.querySelector('.model-settings-editor input[aria-label="最大输出 Token"]'), '16000');
          await new Promise(r=>setTimeout(r,50)); await click('保存模型参数');
          await wait(()=>document.querySelector('.provider-models .pill')?.textContent.includes('Renamed model'));
          await click('一键配置'); await wait(()=>document.querySelector('.model-picker button') && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='预览配置'&&!b.disabled));
          if (document.querySelector('#protocol')?.value !== 'anthropic') throw new Error('Provider protocol not selected');
          await click('刷新模型'); await wait(()=>!document.querySelector('.model-label button')?.disabled);
          if (!document.querySelector('.model-picker button')?.textContent.includes('Renamed model')) throw new Error('Model sync discarded local name');
          const savedModels = await invoke('localModels');
          const savedModel = savedModels.find(model => model.providerId === provider.id);
          if(savedModel.contextWindow!==256000 || savedModel.maxTokens!==16000) throw new Error('Model sync discarded limits');
          document.querySelector('.client-picker button[title="Claude Code"]').click();
          await new Promise(resolve => setTimeout(resolve, 50));
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
          await click('预览配置'); await wait(()=>document.querySelector('.preview-code'));
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
            ['pi', 'Pi', 'openai'], ['minimax', 'MiniMax Code', 'openai'], ['deepseek-harness', 'DeepSeek Harness', 'openai'], ['zed', 'Zed', 'openai'],
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
            setSelect(document.querySelector('#protocol'), protocol); await new Promise(resolve => setTimeout(resolve, 50));
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
            await wait(() => document.querySelector('.preview-code'));
            let preview = '';
            for (const fileTab of document.querySelectorAll('.preview-file-tabs button')) {
              fileTab.click(); await new Promise(resolve => setTimeout(resolve, 30));
              preview += document.querySelector('.preview-code').textContent;
            }
            if (!document.querySelector('.preview-code [class*=hljs-]')) throw new Error('Missing preview highlighting: ' + name);
            if (!preview.includes('claude-sonnet-flow-test')) throw new Error('Preview missing selected model: ' + name);
            if (id === 'vscode' && !document.body.innerText.includes('密钥尚未写入')) throw new Error('Missing VS Code credential step');
            verifiedClients.push(id);
            await click('关闭');
          }
          if (verifiedClients.length !== 15) throw new Error('Incomplete application coverage');
          await click('概览');await wait(()=>document.querySelector('.overview-stats'));
          await click('模型服务商'); await click('刷新'); await wait(()=>document.querySelector('.provider-models .pill'));
          await click('编辑模型资料'); await wait(()=>document.querySelector('.model-settings-editor'));
          document.querySelector('.model-settings-editor').scrollIntoView({block:'start'});
          return {uiFlow:true, automaticBackgroundUpdates:true, installationCapabilitiesVisible:true, compactManagementTooltip:true, localConfigReader:true, providerEditSyncDefaultAndConfig:true, sharedModelLimitsAndCapabilities:true, allApplicationControls:verifiedClients, platformKeyReused:true, modelsFetched:true, history:await window.onelinkDesktop.history()};
        })()`);
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
          document.querySelector('button[aria-label="查看 Codex 本机配置"]').click();
          for (let i = 0; i < 100 && !document.querySelector('.config-file-code'); i++) await new Promise(resolve => setTimeout(resolve, 50));
        })()`);
        await new Promise(resolve => setTimeout(resolve, 200));
        const configScreenshot = await mainWindow.webContents.capturePage();
        await fs.writeFile(path.join(__dirname, '../artifacts/local-config-reader.png'), configScreenshot.toPNG());
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
    modelServer=require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'claude-sonnet-flow-test',owned_by:'test'}]}))});
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
    testOptions = {
      home: testRoot,
      env: { PATH: bin },
      applicationDirs: [],
      dataDir: path.join(testRoot, "state"),
    };
  }
  const agents = createAgentService({
    dataDir: path.join(app.getPath("userData"), "agent-config"),
    ...testOptions,
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
    uninstallPlan: client => uninstaller.plan(client), fetcher: (url, options) => {
      if (flowTest) return Promise.reject(new Error('流程测试：版本服务暂时不可用'));
      return net.fetch(url, options);
    } });
  const withKey = async (input) => {
    if (input?.providerId) {
      const provider = await localProviders.getCredential(input.providerId);
      const savedModel = provider.models.find(model => model.id === input.model && model.enabled);
      if (!savedModel) throw new Error('请选择此服务商已启用的模型');
      const modelSettings = input.modelSettings === undefined ? savedModel : { name: savedModel.name, ...input.modelSettings };
      return { client: input.client, model: input.model, protocol: input.protocol || provider.protocol, apiKey: provider.apiKey, baseURL: provider.baseURL, modelSettings };
    }
    const key = await keyStore.get(input?.keyId);
    return {
      client: input.client,
      model: input.model,
      protocol: input.protocol,
      apiKey: key.secret,
      baseURL: key.baseURL,
      modelSettings: input.modelSettings,
    };
  };
  for (const [channel, handler] of Object.entries({
    'software-update-status': () => softwareUpdates.status(),
    'software-update-check': () => softwareUpdates.check(true),
    detect: async () => updates.describe(await agents.detect()),
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
    restore: (id) => agents.restore(id),
    history: () => agents.history(),
    test: async (input) => testConnection(await withKey(input)),
    keys: (org) => keyStore.list(org),
    wallet: (org) => keyStore.wallet(org),
    models: (id) => keyStore.models(id),
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
      const models = await require('./provider-models.cjs').fetchProviderModels(provider, net.fetch.bind(net));
      return models;
    },
    selectLocalModels: input => localProviders.selectModels(input.providerId, input.models),
    createLocalModel: input => localProviders.createModel(input.providerId, input),
    updateLocalModel: input => localProviders.updateModel(input.providerId, input.id, input),
    deleteLocalModel: input => localProviders.deleteModel(input.providerId, input.id),
    setDefaultLocalModel: input => localProviders.setDefaultModel(input.providerId, input.modelId),
    requests: (query) => flowTest ? { connected: true, items: [], total: 0 } : keyStore.requests(query),
    "request-options": (query) => flowTest ? { models: [], suppliers: [], types: [] } : keyStore.requestOptions(query),
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
