# Provider Integration Guide

This document describes the supported extension points and verification contract for ZuraAI model providers.

## Ownership boundaries

- `src/providers/providerRegistry.ts` owns provider identity, settings fields, capabilities, endpoints, retry policy, and model-list integration.
- `src/providers/providerRuntime.ts` dispatches platform-neutral generation and streaming requests.
- `src/services/<provider>.ts` owns provider-specific request shaping and response parsing.
- `electron/ipc/providerRuntimeHandlers.ts` owns the privileged network boundary, credentials, and renderer request validation.
- `packages/provider-core` owns platform-neutral errors, usage aggregation, tool-call validation, and stream contracts.
- Main-only providers such as ChatGPT Codex remain under `electron/providers/`.

Runtime dispatch must not contain an undated list of live model IDs. When an API does not expose required capability or protocol metadata, place the smallest possible dated catalog in `src/providers/`, identify its source, and define explicit behavior for unknown models.

## Adding or changing a provider

1. Add or update the registry descriptor, including auth, capability, endpoint, retry, model-list, and settings metadata.
2. Implement a service adapter. Reject malformed provider frames; do not silently skip or repair them.
3. Map all supported request options deliberately: abort signal, output-token limit, temperature, tools, tool choice, reasoning, images, and provider-specific cache/session metadata.
4. Normalize streaming and non-streaming output into the provider-core contracts without losing usage fields.
5. Resolve credentials only in main. Renderer requests must not include secrets, arbitrary endpoints, headers, or methods.
6. Add request-shaping and parser tests before exposing the provider in Settings.
7. Update `AGENTS.md` whenever the provider, secret boundary, endpoint policy, or data flow changes.

## Adapter conformance tests

Every provider adapter should cover the applicable cases:

- Streaming and non-streaming request parity
- Output-token and temperature mapping
- Abort propagation
- Text, reasoning, and tool-call deltas
- Image input/output when supported
- Lossless usage aggregation
- Malformed SSE or NDJSON frames
- Retry only before visible output
- Explicit unknown-model behavior when catalog metadata affects transport

Use obviously fake model IDs in ordinary tests. A real ID is acceptable only in a dated curated-catalog test whose purpose is to protect documented transport metadata.

## Provider-core package

`packages/provider-core` is independently buildable and produces declarations under `dist/`:

```sh
bun run build:provider-core
bun run --cwd packages/provider-core typecheck
bun run --cwd packages/provider-core test
```

The root build runs the provider-core build before bundling the Electron application. Generated `dist/` output is not committed.
