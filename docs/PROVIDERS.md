# Provider integrations

How model providers plug into ZuraAI, and what “done” looks like when you add or change one.

## Who owns what

| Piece | Responsibility |
| ----- | -------------- |
| `src/providers/providerRegistry.ts` | Identity, capabilities, endpoints, settings fields, model-list wiring |
| `src/providers/providerRuntime.ts` | Platform-neutral dispatch for generate/stream |
| `src/services/<provider>.ts` | Request shaping and response parsing for that provider |
| `electron/ipc/providerRuntimeHandlers.ts` | Privileged network boundary, credentials, request validation |
| `packages/provider-core` | Shared errors, usage aggregation, tool validation, stream contracts |
| `electron/providers/` | Main-only exceptions such as ChatGPT Codex OAuth |

Do not hardcode long undated lists of live model IDs in runtime dispatch. If a provider needs a small curated catalog, date it, cite the source, and define behavior for unknown models.

## Adding or changing a provider

1. Update the registry entry (auth, capabilities, endpoints, retries, model lists, settings).
2. Implement a service adapter. Bad stream frames should fail visibly — not be silently repaired.
3. Map request options on purpose: abort, token limits, temperature, tools, reasoning, images, cache fields.
4. Normalize output into provider-core shapes without dropping usage fields.
5. Resolve credentials only in main. UI requests must not carry secrets or arbitrary URLs/headers.
6. Write request and parser tests before shipping the Settings UI.
7. Update `AGENTS.md` if secrets, endpoints, or data flow changed.

## Adapter tests worth having

- Streaming and non-streaming parity
- Token limit and temperature mapping
- Abort actually cancels work
- Text, reasoning, and tool-call deltas
- Images when supported
- Usage aggregation without loss
- Malformed SSE/NDJSON fails closed
- Retries only before any visible output
- Explicit behavior for unknown models

Use fake model IDs in ordinary tests. Real IDs belong only in dated catalog tests that protect documented transport rules.

## provider-core package

```bash
bun run build:provider-core
bun run --cwd packages/provider-core typecheck
bun run --cwd packages/provider-core test
```

Root builds compile this package first. Generated `dist/` output is not committed.
