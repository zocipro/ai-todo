# AI Todo (Vite + React)

A lightweight, local-first todo list. The original project was missing the `src/` entry files, so this repo now includes a minimal but complete app that builds cleanly for Cloudflare Pages.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Node version: 18 or 20

No backend is required; data is stored in `localStorage`.
