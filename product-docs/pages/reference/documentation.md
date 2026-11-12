# 文档框架选型与运行

## 选择 VitePress

本说明站使用开源 **VitePress 1.6.4**（MIT许可证）。选型时项目npm发布标签的稳定线为1.6.4，另有2.0 alpha；这里固定稳定版本，避免文档站无意跟随预发布升级。

VitePress将Markdown构建成静态HTML与浏览器端导航，默认主题提供侧栏、页内目录、上一页下一页、主题切换和本地搜索。这份内容以长篇原理、字段和代码示例为主，采用它能直接维护文本并离线预览构建结果，不依赖文档服务账号或数据库。

| 方案 | 适用取舍 |
| --- | --- |
| VitePress（采用） | Markdown、静态发布、内置本地搜索，适合当前代码仓库维护与快速原理查询 |
| Docusaurus | 适合更复杂的多版本、多语言与React文档扩展，但当前没有必要为这份站点引入更重的维护面 |
| Wiki / 知识库服务 | 适合多人在线编辑，但通常多出服务器、账户或数据库维护；当前优先源码和文档一起核对 |

此选型不是对全部产品的评分。VitePress本身的能力以官方文档为准，本站主题与搜索配置以`.vitepress/config.mjs`为准。

## 项目结构

```text
product-docs/
  package.json / package-lock.json  独立文档依赖，不影响桌面包依赖
  .vitepress/config.mjs             导航、侧栏、本地搜索、站点设置
  .vitepress/theme/                 产品样式
  pages/                           用户文档、原理与15个Agent参考
  pages/public/                    品牌静态资源（随srcDir设置）
  .vitepress/dist/                 构建产物（忽略提交）
```

历史工程记录仍放在仓库原`docs/`，不把包含调查过程的旧报告直接全部暴露进用户导航。

## 本机运行

仓库根目录执行：

```sh
npm --prefix product-docs ci
npm run docs:dev
```

默认在本机 `127.0.0.1:5175` 提供站点，不向局域网所有网卡监听。首次需要安装依赖；之后Markdown编辑可直接预览。

## 构建与检查

```sh
npm run docs:generate
npm run docs:check
npm run docs:build
npm run docs:preview
```

`docs:build` 输出静态站，可发布到普通静态托管；本次任务不替用户上线，也没有创建远端站点。若部署到子目录，构建时设置`DOCS_BASE=/子目录/`。内部链接与图标应随base解析，页面链接包含`.html`，普通静态服务器不需要配置无扩展名路由重写。

`cleanUrls: false` 使用带`.html`的页面地址，避免静态服务器缺少路由重写时出现404。目录首页仍使用目录地址。直接双击dist/index.html不等价于通过HTTP服务器预览所有资源和导航。

重新构建后应重启预览进程并刷新浏览器，以加载新构建的页面与资源。`npm run docs:test-browser`逐个点击侧栏页面，并核对直接访问、刷新、本地搜索和窄屏布局。

## 搜索与隐私

使用VitePress本地搜索索引，不配置Algolia等远程搜索服务。站点没有添加统计、广告或远程字体脚本；搜索词由浏览器本地索引处理。首次访问仍需从托管站下载页面与索引，不是自动安装到电脑的离线应用。

## 官方依据

- VitePress官方：`https://vitepress.dev/guide/what-is-vitepress`
- 本地搜索设置：`https://vitepress.dev/reference/default-theme-search`
- 官方源码与许可证：`https://github.com/vuejs/vitepress`

选型信息核对日期：2026-11-11。外部框架说明只用于框架选型，产品功能解释仍以当前工作区源码为依据。
