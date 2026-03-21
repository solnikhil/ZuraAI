# MCP Guide

This guide covers the current shipped MCP shape in ZuraAI, including safe resource/prompt usage, test-server workflows, remote transport notes, and common troubleshooting steps.

## Current exposure model

- MCP tools can be model-callable only when the server is enabled, connected, trusted, and the active provider supports tools.
- MCP resources and prompts are user-visible only.
- Resources and prompts never bypass the app's system prompt controls.
- Resource reads and prompt expansion require explicit user action from the MCP library browser.
- Inserted MCP content goes into the composer draft only; it is never auto-sent.

## Quick test servers

## Validation commands

- `npm test` - full regression, including MCP runtime/unit/UI coverage
- `npm test -- electron/mcp/transports/remote.integration.test.ts` - SSE/WebSocket integration coverage against mock remote MCP servers
- `npm run build:dir` - unpacked Electron packaging build
- `npm run verify:mcp-release` - asserts the unpacked release does not bundle persisted user data files and that uninstall/update persistence assumptions stay intact

### Local filesystem server

- Transport: `stdio`
- Command: `npx`
- Arguments:

```text
-y
@modelcontextprotocol/server-filesystem
C:\Projects
```

Use this for low-risk local testing of tool execution and resource browsing.

### Local memory/demo server

- Transport: `stdio`
- Command: `npx`
- Arguments:

```text
-y
@modelcontextprotocol/server-memory
```

Use this to validate prompt/resource discovery without touching the local filesystem.

## Remote transport examples

### SSE server

- Transport: `sse`
- URL: `https://example.com/mcp`
- Optional headers:
  - `Authorization` as a secret-backed bearer token
  - `X-API-Key` or other provider-specific headers as secret-backed values

### WebSocket server

- Transport: `websocket`
- URL: `wss://example.com/mcp`
- Optional headers:
  - `Authorization` as a secret-backed bearer token

Do not embed credentials directly in the URL. Use secure header fields in Settings instead.

## Resources and prompts

### Resources

- Browse resources from Settings or the chat composer quick actions.
- Text resources can be previewed and inserted into the composer.
- Binary resources are preview-only and are not converted into attachments automatically.
- Resources are not exposed as tools.

### Prompts

- Browse prompts from Settings or the chat composer quick actions.
- Fill prompt arguments in the MCP library dialog, preview the expanded prompt, then insert it into the composer if needed.
- Prompts are not merged into the app system prompt and are not model-autonomous.

## Troubleshooting

### Local `stdio` servers

- `command not found`
  - Verify `node`, `npx`, or the target executable is installed and on `PATH`.
- exits immediately
  - Check the command arguments and working directory.
  - Review stderr diagnostics in the MCP server card error state.
- tools/resources/prompts not showing
  - Confirm the server is enabled, trusted, and connected.

### Remote SSE servers

- connection opens then drops
  - Verify the endpoint really returns `text/event-stream`.
  - Check that any reverse proxy does not buffer or terminate idle streams.
- POST tool/resource/prompt requests fail
  - Confirm the server sends an `endpoint` event when it expects POSTs on a different URL.
- auth failures
  - Re-check secret-backed headers in Settings; URLs with embedded credentials are blocked intentionally.

### Remote WebSocket servers

- handshake fails
  - Verify the URL uses `ws://` or `wss://` and that any auth headers are configured in Settings.
- disconnects after connecting
  - Check server support for ping/pong heartbeats and any upstream idle timeout.
- intermittent reconnects
  - Review `reconnectAttempts` and `reconnectDelayMs` on the server config.

## Support notes

- If a remote MCP server is unstable, start with `stdio` if that server also provides a local mode.
- Keep untrusted servers disabled until you have verified what they expose.
- For production support requests, capture:
  - transport type
  - sanitized server URL/host
  - whether the server is trusted
  - whether approval is required
  - the last connection error shown in Settings
