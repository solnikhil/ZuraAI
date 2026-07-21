# ZuraAI v0.0.27

ZuraAI v0.0.27 is a major reliability and agent-capability release. It makes desktop automation safer and steadier, improves ChatGPT Codex reasoning and tool use, and expands schedules, MCP, memory, artifacts, and the chat experience.

## What’s new

- **Agent Mode that stays grounded:** background-window ownership, OCR-assisted UI state, approval-gated actions, and bounded verification prevent repeated action loops and thinking-block spam.
- **Better ChatGPT Codex support:** select reasoning effort per supported model and use native tools with reliable result follow-ups.
- **Controlled autonomy:** Fully autonomous mode is confirmed by a native dialog and still uses narrowly scoped, one-use authorizations.
- **AI automations and schedules:** create reminders, lookouts, and model-directed recurring tasks, then inspect run history or open the generated chat.
- **Stronger MCP workflows:** bundled server discovery, OAuth, connection management, approvals, and agent-requested setup.
- **Richer working context:** folder-scoped memory, improved retrieval, persistent artifacts, and external artifact opening.
- **Faster, clearer chat:** smoother streaming, virtualized history, resilient persistence, improved tool cards, and better failure reporting.
- **A broad UI refresh:** updated dashboard, settings, menus, command surfaces, window chrome, accessibility, and packaging.

## Reliability and security

This release tightens Electron IPC validation, secure storage, provider networking, tool schemas, shell failure handling, Computer Use targeting, and release artifact verification. It also adds extensive test coverage across the main process and renderer.

## Known limitation

macOS builds are currently unsigned and un-notarized. Install the downloaded DMG manually; in-app macOS auto-update is not available yet.

## X post

ZuraAI v0.0.27 is here 🚀 Safer Agent Mode, per-model ChatGPT Codex reasoning controls, reliable native tool calls, AI automations, stronger MCP workflows, folder memory, better artifacts, and smoother chat—plus a fix for repeated thinking-block spam.
