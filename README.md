# AI 待办 (Vite + React)

一款轻量、本地优先的待办清单。原项目缺少 `src/` 入口文件，因此本仓库补齐了一个精简但完整的应用，可在 Cloudflare Pages 上顺利构建。

## 本地开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
npm run preview
```

## Cloudflare Pages

- 构建命令：`npm run build`
- 输出目录：`dist`
- Node 版本：18 或 20

无需后端；数据保存在 `localStorage` 中。
