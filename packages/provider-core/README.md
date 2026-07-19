# @zura/provider-core

Shared, platform-neutral pieces used by ZuraAI provider adapters:

- Typed provider errors
- Stream and usage contracts
- Lossless usage aggregation
- Strict tool-call / JSON Schema validation (no `eval`)

This package must **not** import Electron, React, renderer settings, secure storage, or provider credentials.

```sh
bun run build
bun run typecheck
bun run test
```

Build output goes to `dist/` (JavaScript, maps, and TypeScript declarations). That folder is generated — do not hand-edit it.
