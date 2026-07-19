# Adding a built-in tool

Built-in tools that need main-process power share one hardened channel: `execute-tool`. Do not invent a new IPC channel for a normal model-callable tool.

MCP tools use `window.mcp.executeTool(...)`. Artifact tools that only touch chat state can stay renderer-side.

## Steps

1. Add the exact name to `src/tools/builtinMainToolContract.ts`.
2. Add the model-facing description and full JSON Schema in `src/tools/builtinTools.ts`.
3. Implement the work under `electron/tools/` and wire it into the exhaustive handler map in `electron/tools/index.ts`.
4. Decide when the tool is exposed in `src/hooks/useToolCalling.ts` (mode, platform, feature toggle, migration of old settings).
5. Mark mutating or high-risk tools with `requiresApproval: true`, and add real validation for paths, URLs, commands, or platform limits.
6. Add tests for the handler and for contract/exposure.
7. Update the Architecture section of `AGENTS.md` — a new tool is a new product capability.

## Security rules (non-negotiable)

- Preload accepts only exact names from the built-in list. Prefix matching is not access.
- Renderer and main both reject unknown names.
- Schemas must describe every model argument. Do not coerce, drop, or invent fields.
- Approval never lives inside model arguments (`autoApprove`, tokens, run ownership, and friends).
- Main issues one-use approval tokens after a real user decision.
- Renderer code never gets provider keys, MCP secrets, free filesystem, free shell, or a free HTTP proxy.

## Minimum verification

```bash
bun run test -- electron/preload.test.ts electron/tools/index.test.ts electron/tools/toolApprovalAuthorizations.test.ts electron/tools/validateBuiltinToolInvocation.test.ts src/tools/builtinTools.test.ts src/hooks/useToolCalling.toolExposure.test.tsx
bun run typecheck
```

Contract tests should prove: every schema tool has a preload name, every name has a schema, unknown lookalikes fail, and the main handler map stays exhaustive.
