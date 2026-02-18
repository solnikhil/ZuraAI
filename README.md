# Zura AI

Windows-first desktop AI assistant built with Electron, React, Vite, and TypeScript.

![Zura AI](public/icon.png)

## What it does

- Multi-provider chat (OpenRouter, Ollama, Perplexity, Groq, NVIDIA, Alibaba Cloud)
- Streaming responses with tool support (`web_search`, `research_plan`)
- Local chat history persistence through the Electron main process
- Secure key storage using Electron `safeStorage` when available
- Provider hub with per-model enable/disable controls

## Tech stack

- Electron + Vite + React + TypeScript
- Radix UI primitives with shadcn-style components
- Vitest for tests

## Requirements

- Node.js 18+
- npm 9+
- Windows 10/11 (primary target)

## Quick start

```bash
git clone https://github.com/solnikhil/ZuraAI.git
cd ZuraAI
npm install
npm run dev
```

## API keys

No `.env` setup is required.

Add provider/search API keys in the app under Settings.

## Scripts

- `npm run dev` - start development server
- `npm run typecheck` - run TypeScript checks (`tsc --noEmit`)
- `npm run test` - run Vitest test suite
- `npm run test:watch` - run tests in watch mode
- `npm run build:renderer` - typecheck + renderer build only
- `npm run build` - full production build + Electron package
- `npm run build:dir` - package as unpacked directory
- `npm run preview` - preview renderer build

## Security model

- Renderer is treated as untrusted
- Privileged operations live in Electron main process
- Preload exposes a narrow allowlisted IPC surface

See `AGENTS.md` for architecture details.

## Contributing

Please read:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`

## Support

See `SUPPORT.md`.

## License

MIT - see `LICENSE`.
