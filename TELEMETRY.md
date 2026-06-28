# ZuraAI Telemetry

ZuraAI analytics is opt-in. No usage events are sent unless the user enables anonymous analytics from the first-run prompt or Settings.

## What Is Collected

Events:

- `app_first_launch`
- `app_start`
- `app_update_installed`
- `chat_message_sent`
- `provider_used`
- `model_used`
- `tool_used`
- `web_search_used`
- `mcp_server_connected`
- `app_error`
- `app_crash`

Common metadata:

- App version
- OS platform
- CPU architecture
- Anonymous install ID
- Timestamp

Event-specific metadata is limited to provider/model names, assistant mode, whether attachments were present, tool name, success/failure, duration, coarse error category, and MCP transport/trust state.

## What Is Never Collected

ZuraAI does not collect prompts, AI responses, conversation content, conversation titles, API keys, file paths, clipboard data, MCP tool arguments, MCP resource contents, screenshots, or uploaded/generated files.

## How To Disable

Anonymous analytics can be disabled at any time from Settings > Usage Intelligence > Anonymous analytics.

Official builds send events to PostHog Cloud US ingestion (`https://us.i.posthog.com`) using ZuraAI's public PostHog project token, and only after the user opts in. `ZURA_POSTHOG_PROJECT_KEY` and `ZURA_POSTHOG_HOST` can override the built-in analytics target for forks, testing, or self-managed builds. Setting `ZURA_POSTHOG_PROJECT_KEY` to an empty value disables analytics transport even if the user opts in.

Download counts are tracked outside the app through GitHub Release asset download counts.
