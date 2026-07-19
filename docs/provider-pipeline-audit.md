# Provider pipeline audit (historical)

Reviewed: 2026-07-15

This is a snapshot of a large provider-path cleanup. It is kept so contributors understand **why** certain rules exist. Current behavior still lives in code plus [`PROVIDERS.md`](PROVIDERS.md) and [`AGENTS.md`](../AGENTS.md).

## Outcome

The audit found **23** real defects or unsafe “bandages” in the provider path. Those were fixed. A few larger design debts remain intentional (for example main-only Codex OAuth is not folded into a public SDK package).

## What was wrong, in plain language

1. The UI could read stored provider secrets — now write/presence only; main resolves keys.
2. Networking was scattered (renderer fetch, one-off proxies, CORS hacks) — now one main provider runtime.
3. Alibaba catalog scraped private page payloads with a credential — replaced with a small dated catalog.
4. Unknown providers silently became OpenRouter — now fail clearly.
5. XML-looking text was “repaired” into tool calls — display only; never executable.
6. Tool args were coerced — now full schema validation, no invention.
7. Groq failure text was turned into fake tool calls — now a typed error.
8. Ollama stream failure silently retried non-streaming — no duplicate request.
9. Ollama thinking defaulted on — only when configured.
10. Ollama tool args assumed strings — objects preserved.
11. Missing Ollama context silently became 4096 — explicit catalog error.
12. OpenCode “stream” through an old proxy buffered everything — real incremental stream + cancel.
13. OpenCode always used Chat Completions — documented models route correctly.
14. DeepSeek reasoning shape was wrong — top-level field per docs.
15. Forced tool choice downgraded to auto — forced choices kept.
16. Unknown models treated as tool-capable — conservative unless metadata says otherwise.
17. NVIDIA capabilities guessed from name regexes — only report known metadata.
18. Usage only counted the last visible round — aggregate every round.
19. Per-run settings ignored — each round uses supplied settings.
20. Hand-rolled SSE repaired frames — maintained parser; malformed fails visibly.
21. Empty answers fell back to reasoning text — reasoning is not the answer.
22. Fake typing delays on large chunks — no simulated streaming.
23. Retry policy was decorative — typed errors, bounded pre-output retries only.

## Design debts that stayed on purpose

- ChatGPT Codex remains main-only OAuth + fixed host rewrite, not a general ChatGPT proxy.
- A public multi-runtime provider SDK is not a goal yet; `provider-core` stays platform-neutral.
- Curated catalogs exist only where APIs do not expose what we need, and they must stay dated and small.

If you reintroduce silent fallbacks, secret leakage, or “helpful” tool-call repair, you are undoing this audit.
