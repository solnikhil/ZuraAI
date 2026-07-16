# @zura/provider-core

Platform-neutral contracts shared by ZuraAI provider adapters.

The package contains typed provider errors, stream and usage contracts, lossless usage aggregation, and strict tool-call validation. It must not import Electron, React, renderer settings, secure storage, or provider credentials.

Commands:

```sh
bun run build
bun run typecheck
bun run test
```

The build emits JavaScript, source maps, and TypeScript declarations to `dist/`.
