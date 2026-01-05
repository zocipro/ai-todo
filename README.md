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

## AI 功能配置（豆包大模型）

AI 功能通过 Cloudflare Pages Functions 代理请求豆包接口，避免在前端暴露密钥。默认模型为 `doubao-seed-1-8-251228`，可通过环境变量覆盖。

需要配置的环境变量：

- `DOUBAO_API_KEY`：豆包 API Key（或使用 `ARK_API_KEY`）
- `DOUBAO_MODEL`：模型名称（可选，默认 `doubao-seed-1-8-251228`）
- `DOUBAO_API_BASE_URL`：可选，默认 `https://ark.cn-beijing.volces.com/api/v3`

页面支持直接填写 API Key，密钥仅保存在本机浏览器中，未填写时将使用服务器环境变量。

本地调试建议：

- 使用 `wrangler pages dev` 运行时，在 `.dev.vars` 中填写上述变量。
- 仅执行 `npm run dev` 只会启动前端页面，`/api/ai-todo` 不会生效。
- 建议：先执行 `npm run dev`，再另开终端执行 `wrangler pages dev --proxy 5173` 以启用 Functions。
