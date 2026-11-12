# OneLinkAI 产品说明与原理文档

对应 Desktop 0.3.2，核对日期 2026-11-11。独立 VitePress 1.6.4（MIT）静态站，40页用户说明、工作原理和15个Agent参考。本地搜索，不配置远程搜索或统计。

在仓库根目录执行：

```sh
npm --prefix product-docs ci
npm run docs:dev
```

开发地址为本机 `http://127.0.0.1:5175`。内容从 [文档首页](pages/index.md) 进入。

```sh
npm run docs:generate  # 根据真实适配器生成示例与能力表
npm run docs:check     # 检查生成一致性、站内链接与源码依据
npm run docs:build     # 检查后生成静态站
npm run docs:preview   # 本机预览构建产物（重新构建后需重启）
npm run docs:test-browser # 检查全部侧栏页面、刷新、搜索和移动布局
```

生成示例只用临时HOME与虚构凭据，不读取真实用户配置。输出在 `.vitepress/dist`，不加入桌面打包，不改官网项目。部署到子目录可在构建时设置 `DOCS_BASE=/子目录/`，页面使用 `.html` 链接，可直接用于普通静态服务器，无需配置无扩展名路由重写。

内容结构：开始使用6页、工作原理10页、Agent总表及15个详情页、规格与排查7页，另有首页。维护流程和源码索引见 [实现依据](pages/reference/evidence.md)。历史工程验收资料保留在仓库原 `docs/`，不混为今天的最新测试结果。
