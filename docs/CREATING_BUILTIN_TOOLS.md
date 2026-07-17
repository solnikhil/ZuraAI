# Creating a Built-in Tool

ZuraAI built-in main-process tools use one hardened IPC channel: `execute-tool`. Do not add a new
IPC channel for an ordinary model-callable tool. MCP tools and renderer-owned artifact tools use
their existing separate execution paths.

## Required changes

1. Add the exact tool name to `src/tools/builtinMainToolContract.ts`.
2. Add its model-facing descriptor and complete JSON Schema to `src/tools/builtinTools.ts`.
3. Implement the privileged operation under `electron/tools/` and add its handler to the exhaustive
   `toolHandlers` record in `electron/tools/index.ts`.
4. Add the tool to the appropriate exposure policy in `src/hooks/useToolCalling.ts`. Exposure must
   state its supported mode, platform, extension gate, and whether older persisted settings should
   automatically receive it.
5. Mark mutating or high-risk tools with `requiresApproval: true` and implement main-owned argument,
   path, URL, command, and platform validation appropriate to the capability. The shared IPC boundary
   validates the declared JSON Schema but does not replace capability-specific checks.
6. Add focused handler tests and update the contract/exposure tests when introducing a new policy
   group.
7. Update the Architecture section of `AGENTS.md`; a new tool is a new application capability.

## Security invariants

- The preload accepts only exact names from `BUILTIN_MAIN_TOOL_NAMES`; prefixes do not grant tool
  access.
- The renderer executor rejects unknown names before IPC, and the typed generic IPC bridge accepts
  `BuiltinMainToolName` rather than an arbitrary string.
- Main independently checks the exact name and validates arguments against the manifest schema
  before dispatch.
- Tool schemas must describe every model-provided argument. Do not coerce, remove, or invent model
  arguments. The main boundary closes the top-level schema and rejects reserved execution fields.
- Approval authority must never be placed in tool arguments. In particular, do not add or honor
  model-provided `autoApprove`, `_agentSkills`, approval-token, or background-window run-ownership properties. Agent approval uses a
  separate one-use token issued by main after the user approves; it is bound to the sender, exact
  tool name, and exact validated arguments, then consumed before dispatch.
- Internal execution context is not model authority unless main has independently issued and
  validated it. A tool handler must continue to enforce its main-process approval and capability
  rules.
- Renderer code must never receive provider keys, MCP secrets, unrestricted filesystem authority,
  arbitrary shell authority, or arbitrary HTTP proxying.
- MCP namespaced tools must continue through `window.mcp.executeTool(...)`, not `execute-tool`.

## Verification

Run at minimum:

```powershell
bun run test -- electron/preload.test.ts electron/tools/index.test.ts electron/tools/toolApprovalAuthorizations.test.ts electron/tools/validateBuiltinToolInvocation.test.ts src/tools/builtinTools.test.ts src/hooks/useToolCalling.toolExposure.test.tsx
bun run typecheck
```

The contract tests ensure that every manifest tool has an exact preload name, every exact name has a
manifest descriptor, every schema compiles, unknown lookalike names fail closed, and the main handler
record remains exhaustive at compile time.
