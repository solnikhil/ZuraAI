# Changelog

All notable changes to ZuraAI are documented here.

## [0.0.8] - 2026-07-22

### Added

- `npx zuraai` now installs the matching desktop release from GitHub when ZuraAI is not already installed, then opens the app.
- Added an explicit `zuraai install` command for reinstalling the matching desktop version.

### Security and reliability

- Installer downloads use fixed ZuraAI GitHub release assets and must match the SHA-256 checksum published with that release before execution or extraction.
- Windows installation remains visible and user-controlled; macOS installs the verified universal app under the current user's `Applications` directory.
- Marked the Electron workspace package as private so running `npm publish` from the repository root cannot accidentally target the unrelated `zura` registry package.

## [0.0.7] - 2026-07-22

### Highlights

- Reworked Agent Mode with safer background-window ownership, approval-gated computer control, OCR-assisted grounding, and bounded verification that no longer floods chats with repeated thinking blocks.
- Upgraded ChatGPT Codex support with per-model reasoning controls, native tool calls, reliable tool-result follow-ups, and stricter response normalization.
- Added main-owned Fully autonomous approval controls with explicit native confirmation and exact, one-use authorization tokens.
- Added scheduled AI automations, richer reminders and lookouts, run history, and chat-linked automation results.
- Expanded MCP support with a bundled server catalogue, OAuth flows, approval handling, connection hardening, and an Agent Mode request flow.
- Added folder-scoped memories, improved memory retrieval, richer artifact management, and external artifact opening.
- Improved chat streaming, virtualized message scrolling, session persistence, deep links, tool-result cards, and system-failure handling.
- Refreshed the dashboard, settings, command surfaces, native window chrome, accessibility behavior, and cross-platform packaging workflows.

### Security and reliability

- Hardened privileged IPC validation, secure storage, provider networking, built-in tool schemas, shell error propagation, and release packaging checks.
- Added broad automated coverage for providers, tools, MCP, storage, streaming, accessibility, and Electron process boundaries.

### Changed

- Provider and extension settings now apply immediately.
- The Perplexity provider and the legacy extension-store/Command Center implementation were removed as the capability model was simplified.
- macOS packages remain unsigned and un-notarized; install them manually because in-app auto-update is not yet supported on macOS.

[0.0.8]: https://github.com/solnikhil/ZuraAI/releases/tag/v0.0.8
[0.0.7]: https://github.com/solnikhil/ZuraAI/releases/tag/v0.0.7
