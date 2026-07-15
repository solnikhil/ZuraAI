# Provider Pipeline Audit

Reviewed: 2026-07-15

Scope: provider registry and dispatch, provider HTTP services, streaming parsers, tool-call adapters and execution, settings/catalog flows, secure storage, preload/IPC, title and memory generations, usage accounting, retries, and the chat research/tool loop.

## Outcome

The pre-audit implementation was functional but not state of the art. The audit identified **23 distinct bandages, unsafe repairs, or correctness defects** in the provider path. All 23 are corrected in the current change. Five larger design debts remain and are listed separately; they are not silent fallbacks or security fixes.

## Corrected findings

|   # | Finding                                                                                                       | Resolution                                                                                                                                          |
| --: | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Stored provider secrets could be read or batch-read by the renderer.                                          | The bridge is write/presence-only; provider operations resolve credentials in main.                                                                 |
|   2 | Provider networking was split between renderer fetches, a one-off OpenCode proxy, and an NVIDIA CORS rewrite. | Chat, lightweight generation, catalogs, connectivity, and Ollama discovery use one narrow, cancelable main runtime. Proxy and CORS rewrite removed. |
|   3 | Alibaba catalog sent the API key to a documentation page and scraped private `self.__next_f` data.            | Replaced with a small, dated, credential-free catalog sourced from documented IDs/capabilities.                                                     |
|   4 | Unknown/missing provider IDs silently routed to OpenRouter.                                                   | Unknown providers fail explicitly.                                                                                                                  |
|   5 | XML/DSML-looking model text was repaired into executable tool calls.                                          | Pseudo markup is display-only diagnostic data and never executable.                                                                                 |
|   6 | Tool arguments were coerced and only partially validated.                                                     | Native JSON is validated with Ajv against the full declared schema; no coercion, removal, or invented values.                                       |
|   7 | Groq `failed_generation` text was parsed into fabricated calls/assistant content.                             | The provider error is surfaced as a typed `invalid_tool_call` error.                                                                                |
|   8 | Failed Ollama streams silently repeated the request non-streaming.                                            | Stream failure is returned; no duplicate request.                                                                                                   |
|   9 | Ollama thinking defaulted to `true` even when not requested.                                                  | `think` is omitted unless explicitly configured.                                                                                                    |
|  10 | Ollama tool arguments were assumed to be JSON strings.                                                        | Native object arguments are preserved and normalized at the runtime boundary.                                                                       |
|  11 | Missing Ollama context metadata silently became 4096.                                                         | Missing context is an explicit catalog error.                                                                                                       |
|  12 | OpenCode “streaming” through the old proxy buffered the whole response.                                       | Main reads the real response stream incrementally and supports cancellation.                                                                        |
|  13 | Every OpenCode model was sent to Chat Completions despite documented Messages-only models.                    | Exact documented model IDs route to Anthropic Messages; others use OpenAI Chat Completions.                                                         |
|  14 | DeepSeek reasoning effort was nested in an unsupported object shape.                                          | `reasoning_effort` uses the documented top-level field.                                                                                             |
|  15 | Forced DeepSeek tool choices were downgraded to `auto`.                                                       | Explicit forced choices are preserved.                                                                                                              |
|  16 | Several providers treated every unknown model as tool-capable.                                                | Unknown capability is conservative unless catalog metadata or an explicit configured-model override says otherwise.                                 |
|  17 | NVIDIA capabilities/context were guessed from model-name regexes.                                             | The model-list mapper reports only metadata it actually knows.                                                                                      |
|  18 | Multi-round chats recorded only the visible final round's usage.                                              | Usage aggregates all research/tool/synthesis requests and preserves every usage field.                                                              |
|  19 | Per-run settings overrides were ignored in favor of hook-closure temperature/token settings.                  | Every round uses its supplied runtime settings.                                                                                                     |
|  20 | Hand-rolled SSE/NDJSON parsing repaired non-standard frames and silently dropped malformed records.           | Maintained `eventsource-parser` handles SSE with a bounded buffer; malformed SSE/NDJSON fails visibly.                                              |
|  21 | Empty answer content fell back to provider reasoning text.                                                    | Reasoning content is never exposed as the answer/title.                                                                                             |
|  22 | Large chunks and non-stream responses were split with sleeps to simulate token streaming.                     | Provider transport boundaries are preserved; no fake delay.                                                                                         |
|  23 | Registry retry policies were mostly decorative and Retry-After was inconsistently honored.                    | Typed errors carry status/request ID/Retry-After; safe pre-output retries use bounded exponential backoff with jitter and never retry after output. |

## Current architecture

`packages/provider-core` is the private, platform-neutral contract layer. It owns provider message/event types, typed errors, lossless usage merging, and strict tool validation. Electron main owns credentials and network execution. The renderer sends serializable requests and receives sanitized stream events.

The runtime applies a ten-minute hard deadline, caps request size and concurrency per renderer, restricts Ollama to loopback, validates Alibaba regions against a fixed allowlist, and ties cancellation to the requesting renderer. Streaming orchestration now delegates pure message/timeline support and bounded final-synthesis retries to separate modules; the React hook retains lifecycle coordination and the research/tool state transitions.

ChatGPT Codex uses the signed-in user's ChatGPT Codex allowance through the same Responses backend used by ChatGPT-authenticated Codex clients. It is intentionally main-only: an explicit Settings action starts a bounded PKCE browser login, OAuth credentials are encrypted with Electron `safeStorage`, refreshes are serialized, the renderer sees only a signed-in boolean, and a fixed-host transport can call only the Codex Responses/model endpoints. Vercel AI SDK 7 and `@ai-sdk/openai` provide current Responses streaming and usage semantics. Zura sends no tools or images on this provider and strips fields currently rejected by the ChatGPT Codex backend.

This is an unofficial integration. The exact community package the user referenced, `openai-oauth-provider`, confirms the protocol and offers an AI SDK provider, but it is AGPL-3.0-only and reads password-equivalent Codex auth files. Embedding it would create material licensing/distribution obligations for this MIT Electron app. Zura therefore uses the current Apache-licensed Vercel SDK and an independently implemented narrow transport based on the actively maintained MIT OpenCode OAuth pattern. It does not read `~/.codex/auth.json`, ship a Codex executable, or expose a localhost proxy.

## SDK decision

An internal SDK is appropriate now; a public provider SDK is not ready yet.

The private `@zura/provider-core` package is the right first extraction because it has no Electron or React dependency and establishes stable contracts. Publishing the current provider services would expose application-specific settings, UI message shapes, prompt-cache policy, and Electron assumptions as accidental public API.

Before public release, add:

1. A provider-adapter conformance suite covering streaming, abort, usage, tools, reasoning, images, and typed errors.
2. A semver policy and generated API documentation.
3. Package-boundary builds instead of source aliases.
4. Credential injection interfaces that never assume Electron.
5. At least two independent consumers outside the desktop app.

Vercel AI SDK 7 was evaluated against its current provider and OpenAI Responses documentation. It is now used for ChatGPT Codex, where its Responses stream model is a clean fit. A wholesale replacement would still require custom handling for OpenCode's split protocols, provider-specific reasoning/cache fields, image outputs, and Zura's multi-round usage/tool timeline. Adopt it provider-by-provider only after adapter conformance tests show no semantic loss. Maintained focused components such as Ajv and `eventsource-parser` remain appropriate where they cleanly replace bespoke infrastructure.

The ChatGPT-account adapter should not be folded into a public provider SDK while it relies on an unofficial subscription endpoint and application-owned OAuth client behavior. Its auth and fixed-host transport belong to the Electron host; `@zura/provider-core` remains platform-neutral.

## Remaining design debt

- The streaming hook has been decomposed into orchestration, pure support, and final-synthesis modules, but the remaining one-round event reducer and research/tool transition loop should move into explicit state-machine modules in a later behavior-preserving pass.
- Provider request shaping remains duplicated across several OpenAI-compatible service files. Consolidate behind the adapter contract after conformance fixtures exist.
- Catalog capability quality depends on each provider's metadata. Unknown values intentionally remain unknown; add signed/versioned capability snapshots only where official APIs omit the data.
- Public SDK readiness requires the five gates above. Do not publish the internal package merely because it now has a package name.
- The ChatGPT Codex subscription endpoint and accepted client-version header are not a public stable API. Keep the protocol version pin reviewed and tested; if OpenAI changes the contract, surface the failure instead of falling back to API billing, a local proxy, or a CLI agent.

## Primary references

- [Vercel AI SDK providers](https://ai-sdk.dev/providers/ai-sdk-providers)
- [Vercel OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
- [Community `openai-oauth-provider`](https://github.com/EvanZhouDev/openai-oauth)
- [OpenCode Codex OAuth implementation](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/plugin/codex.ts)
- [OpenAI: Unrolling the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [Using Codex with a ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-chatgpt)
- [Vercel OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)
- [OpenRouter AI SDK provider](https://ai-sdk.dev/providers/community-providers/openrouter)
- [Alibaba Model Studio base URLs](https://www.alibabacloud.com/help/en/model-studio/base-url)
- [Alibaba function calling](https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling)
- [Alibaba deep thinking](https://www.alibabacloud.com/help/en/model-studio/deep-thinking)
- [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode)
- [Ollama chat API](https://docs.ollama.com/api/chat)
- [OpenCode Go](https://opencode.ai/docs/go/)
- [`eventsource-parser`](https://github.com/rexxars/eventsource-parser)
