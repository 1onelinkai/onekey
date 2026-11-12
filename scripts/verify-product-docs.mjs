// Verify the built documentation using an isolated Electron browser, not the desktop app profile.
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const url = process.env.DOCS_TEST_URL || 'http://127.0.0.1:5175/';
const directory = await mkdtemp(path.join(tmpdir(), 'onelink-doc-browser-'));
const artifacts = path.resolve(import.meta.dirname, '../artifacts/product-docs');
await mkdir(artifacts, { recursive: true });
const entry = path.join(directory, 'verify.cjs');
await writeFile(entry, `
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = ${JSON.stringify(url)};
const artifacts = ${JSON.stringify(artifacts)};
app.setPath('userData', ${JSON.stringify(path.join(directory, 'profile'))});
app.whenReady().then(async () => {
 const window = new BrowserWindow({ width:1440, height:1000, show:false, frame:false, webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false} });
 const errors = [];
 window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
 const evaluate = code => window.webContents.executeJavaScript(code, true);
 const wait = condition => evaluate('(async()=>{for(let i=0;i<120;i++){if('+condition+')return true;await new Promise(r=>setTimeout(r,50));}throw new Error("Timed out: "+'+JSON.stringify(condition)+');})()');
 const load = async route => { await window.loadURL(base + route); await wait('!!document.querySelector(".VPNav")'); await new Promise(r=>setTimeout(r,150)); };
 const capture = async name => fs.writeFile(path.join(artifacts,name+'.png'), (await window.webContents.capturePage()).toPNG());
 const layout = () => evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,heading:document.querySelector("h1")?.textContent})');
 try {
  await load('');
  await wait('[...document.images].every(image => image.complete && image.naturalWidth > 0)');
  assert.ok(await evaluate('document.body.textContent.includes("从会用，到理解每一步")'));
  let size = await layout(); assert.ok(size.scroll <= size.width + 1, JSON.stringify(size));
  await capture('home-desktop');
  await load('guide/reading.html');
  const routes = await evaluate('[...new Set([...document.querySelectorAll(".VPSidebar a[href]")].map(a=>a.href))]');
  assert.ok(routes.length >= 39, 'Missing sidebar routes');
  for (const target of routes) {
   const expected = await evaluate('(async()=>{const r=await fetch('+JSON.stringify(target)+');if(!r.ok)throw new Error("HTTP "+r.status+" "+r.url);const d=new DOMParser().parseFromString(await r.text(),"text/html");return d.querySelector(".vp-doc h1")?.textContent;})()');
   assert.ok(expected, 'Missing page content: '+target);
   await evaluate('(()=>{const a=[...document.querySelectorAll(".VPSidebar a[href]")].find(a=>a.href==='+JSON.stringify(target)+');if(!a)throw new Error("Missing sidebar link");a.click();})()');
   await wait('document.querySelector(".vp-doc h1")?.textContent==='+JSON.stringify(expected));
   await window.loadURL(target);
   await wait('document.querySelector(".vp-doc h1")?.textContent==='+JSON.stringify(expected));
   console.log('Sidebar click + direct load: PASS '+new URL(target).pathname);
  }

  await load('principles/architecture');
  await wait('!!document.querySelector(".flow-explorer")');
  await evaluate('document.querySelectorAll(".flow-modes button")[1].click(); document.querySelectorAll(".flow-steps button")[1].click()');
  await wait('document.querySelector(".flow-detail").textContent.includes("Key 接口")');
  await capture('architecture-desktop');
  await evaluate('document.querySelector(".flow-explorer").scrollIntoView({block:"center"})');
  await new Promise(r => setTimeout(r, 200));
  await capture('data-flow-desktop');
  await load('reference/agents/codex');
  assert.ok(await evaluate('document.querySelectorAll("div.language-toml .line").length > 10'));
  size = await layout(); assert.ok(size.scroll <= size.width + 1, JSON.stringify(size));
  await capture('codex-desktop');
  await evaluate('document.querySelector(".DocSearch-Button").click()');
  await wait('!!document.querySelector(".VPLocalSearchBox input")');
  for (const query of ['钥匙串','BYOK']) {
   await evaluate('(()=>{const input=document.querySelector(".VPLocalSearchBox input");input.value='+JSON.stringify(query)+';input.dispatchEvent(new Event("input",{bubbles:true}));})()');
   await new Promise(r => setTimeout(r, 700));
   await wait('document.querySelectorAll(".VPLocalSearchBox .result").length > 0');
   console.log('Search '+query+': PASS');
   if(query==='钥匙串') await capture('chinese-search');
  }
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await wait('!document.querySelector(".VPLocalSearchBox")');
  window.setContentSize(390,844);
  await load('principles/architecture');
  size = await layout(); assert.ok(size.scroll <= size.width + 1, JSON.stringify(size));
  await capture('architecture-mobile');
  await evaluate('document.querySelector(".VPLocalNav .menu").click()');
  await wait('document.querySelector(".VPSidebar").classList.contains("open")');
  await capture('navigation-mobile');
  await evaluate('document.querySelector(".VPBackdrop").click()');
  await load('reference/agents/codex');
  size = await layout(); assert.ok(size.scroll <= size.width + 1, JSON.stringify(size));
  await capture('codex-mobile');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({home:true,sidebarPages:routes.length,allSidebarLinks:true,directPageLoads:true,adapterExample:true,chineseSearch:true,englishSearch:true,flowInteraction:true,mobileNavigation:true,noHorizontalPageClipping:true,browserErrors:errors}, null, 2));
  app.exit(0);
 } catch(error) { console.error(error.stack); app.exit(1); }
}).catch(error=>{console.error(error);app.exit(1)});
`);
try {
 const child = spawn(require('electron'), [entry], { stdio: 'inherit', cwd: path.resolve(import.meta.dirname, '..') });
 const timeout = setTimeout(() => child.kill('SIGKILL'), 60000);
 const [code] = await once(child, 'exit'); clearTimeout(timeout);
 if (code !== 0) throw new Error('Documentation browser verification failed: ' + code);
} finally { await rm(directory, { recursive: true, force: true }); }
