# OneLinkAI 官网

独立的 React + Vite 产品介绍网站。此目录包含完整源码、所需图片、图标与依赖配置，可单独复制使用。

## 开发

```sh
cd 官网
npm install
npm run dev
```

预览地址：http://localhost:5173 。

## 构建

```sh
npm run build
npm run preview
```

静态部署产物位于本目录的 `dist/`，与桌面应用的构建产物独立。

## 工作台链接

“进入工作台”默认打开 http://localhost:5174/ 。在项目根目录执行 `npm run dev` 可启动该预览。部署官网时，复制 `.env.example` 为 `.env.local`，将 `VITE_WORKSPACE_URL` 设置为实际入口后重新构建。

官网的工具切换、模型选择、配置预览只用于交互演示，不调用本机接口，也不包含桌面工作台代码。

- `src/LandingPage.jsx`：页面与交互
- `src/landing.css`：样式和响应式布局
- `src/assets/`：本网站使用的品牌和工具素材
- `public/`：网站图标
