# Telemetry

ZuraAI analytics is **opt-in**. Nothing is sent until you turn on anonymous analytics in the first-run prompt or in Settings.

## What can be collected

Only after you opt in, the app may send event names such as:

- App first launch, start, and update installed
- Chat message sent
- Provider used / model used
- Tool used / web search used
- MCP server connected
- App error / crash

Shared metadata is limited to things like:

- App version
- OS platform and CPU architecture
- An anonymous install ID
- Timestamp

Event-specific fields stay coarse: provider or model name, assistant mode, whether an attachment was present, tool name, success or failure, duration, a coarse error category, and high-level MCP trust/transport state.

## What is never collected

ZuraAI does **not** collect:

- Prompts or AI replies
- Conversation content or titles
- API keys
- File paths
- Clipboard data
- MCP tool arguments or resource bodies
- Screenshots or uploaded/generated files

## How to turn it off

Open **Settings → Usage Intelligence → Anonymous analytics** and disable it any time.

## Where events go

Official builds can send opted-in events to PostHog Cloud US (`https://us.i.posthog.com`) using ZuraAI’s public project token.

Forks and custom builds can override the target with:

- `ZURA_POSTHOG_PROJECT_KEY`
- `ZURA_POSTHOG_HOST`

Setting the project key to an empty string disables transport even if a user opted in.

Download counts for installers are separate: GitHub’s own release download stats, outside the app.
