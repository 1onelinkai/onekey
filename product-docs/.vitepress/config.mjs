import { defineConfig } from 'vitepress';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');
const agents = [
 ['claude','Claude Code'],['claude-desktop','Claude Desktop'],['codex','Codex'],['gemini','Gemini CLI'],['grok','Grok Build'],['opencode','OpenCode'],['openclaw','OpenClaw'],['pi','Pi'],['minimax','MiniMax Code'],['deepseek-harness','DeepSeek Harness'],['zed','Zed'],['vscode','VS Code'],['zcode','ZCode'],['workbuddy','WorkBuddy'],['hermes','Hermes'],
];
const group = (text, entries) => ({ text, items: entries.map(([text, link]) => ({ text, link })) });
export default defineConfig({
 lang: 'zh-CN', title: 'OneLinkAI 使用与原理', description: '理解 OneLinkAI 如何管理模型、凭据与本机 Agent：从首次配置到文件写入、安装更新与恢复。',
 srcDir: 'pages', cleanUrls: false, base: process.env.DOCS_BASE || '/',
 head: [['meta',{ name:'theme-color',content:'#176b50' }],['link',{rel:'icon',href:(process.env.DOCS_BASE || '/')+'favicon.png'}]],
 markdown: { lineNumbers: true },
 themeConfig: {
  logo: { src:'/symbol.png',width:28,height:28 }, siteTitle:'OneLinkAI / 文档',
  nav:[{text:'开始使用',link:'/guide/quickstart'},{text:'工作原理',link:'/principles/architecture'},{text:'Agent 参考',link:'/reference/agents/'},{text:`v${version}`,link:'/reference/status'}],
  sidebar:[
   group('开始使用', [['文档导读','/guide/reading'],['产品理念与边界','/guide/philosophy'],['第一次配置','/guide/quickstart'],['登录与组织','/guide/login'],['BYOK 与模型管理','/guide/byok'],['界面与日常操作','/guide/workspace']]),
   group('理解工作原理', [['整体架构与数据流','/principles/architecture'],['Agent 检测','/principles/detection'],['版本检测与升级','/principles/updates'],['安装流程','/principles/installation'],['卸载流程','/principles/uninstallation'],['配置写入与恢复','/principles/configuration'],['协议、地址与连接测试','/principles/protocols'],['凭据与本地数据','/principles/storage'],['配置文件查看器','/principles/inspector'],['平台接口与请求记录','/principles/platform']]),
   {text:'Agent 配置参考',collapsed:true,items:[{text:'能力总表',link:'/reference/agents/'},...agents.map(([id,text])=>({text,link:`/reference/agents/${id}`}))]},
   group('规格与排查', [['共用参数与默认值','/reference/parameters'],['路径、网络与接口清单','/reference/paths-network'],['当前能力与已知限制','/reference/status'],['故障排查','/help/troubleshooting'],['常见问题与术语','/help/faq'],['实现依据与文档维护','/reference/evidence'],['框架选型与运行','/reference/documentation']]),
  ],
  search:{provider:'local',options:{
   miniSearch:{options:{tokenize(text) {
    return Array.from(new Intl.Segmenter('zh-CN', { granularity:'word' }).segment(text)).filter(part => part.isWordLike).map(part => part.segment);
   }}},
   locales:{root:{translations:{button:{buttonText:'搜索文档',buttonAriaLabel:'搜索文档'},modal:{noResultsText:'没有找到相关内容',resetButtonTitle:'清空搜索',footer:{selectText:'选择',navigateText:'切换',closeText:'关闭'}}}}}
  }},
  outline:{level:[2,3],label:'本页目录'}, sidebarMenuLabel:'文档目录',returnToTopLabel:'返回顶部',darkModeSwitchLabel:'切换主题',docFooter:{prev:'上一篇',next:'下一篇'},
  footer:{message:'以当前实现为准 · 本地优先 · 行为可解释',copyright:`OneLinkAI Desktop v${version} · 核对日期 2026-11-11`},
 },
});
