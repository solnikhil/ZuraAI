# MCP Lifecycle, Trust, and Authentication

MCP is a main-owned integration boundary. The renderer edits sanitized configuration and displays state; main owns persistence, processes/connections, credentials, OAuth, approvals, and tool execution.

## Lifecycle

```text
saved -> disconnected -> connecting -> connected -> error/disconnected
                       -> tools discovered -> explicitly trusted -> model-visible
```

Saving a server does not trust it. Connecting a server does not expose its tools. Discovered tools become model-visible only after explicit trust is recorded. Mutating MCP calls still follow approval policy after trust.

Manager state transitions must be serialized per server. Configuration persistence, connection supervision, OAuth, tool exposure, content caching, and snapshot publication are separate responsibilities even when composed by `mcpManager`.

The coordinator uses focused modules: `mcpConfigRepository.ts` defines the configuration repository
over `mcpStorage.ts`,
`mcpConnection.ts` supervises one transport connection, `mcpOAuth.ts` owns OAuth coordination,
`mcpManagerPolicies.ts` owns exposure policy, `mcpContentCache.ts` owns bounded content caches,
`mcpSnapshotPublisher.ts` owns subscriptions, and `mcpTransitionQueue.ts` serializes config, OAuth,
connect, disconnect, and runtime-metadata transitions independently per server. Code inside a server
transition calls unlocked coordinator helpers rather than recursively queueing the same key.

## Persistence and external editing

Non-secret configuration is stored atomically in `mcp-servers.json` under Electron `userData`. Secrets and OAuth tokens are referenced by deterministic keys and stored through secure storage.

The “open config file” action opens only ZuraAI's own file. External edits are not live configuration mutations unless the manager explicitly reloads and validates them; users should use Settings for supported changes. Parse/schema corruption may be quarantined. Missing files initialize empty state. Permission, lock, and other operational read failures are surfaced and do not replace the store with empty data.

## Authentication modes

- `none`: no credentials
- `envSecret`: secure values injected into an approved local stdio environment
- `headerSecret` / `bearerToken` / `basicAuth`: secure main-owned remote request headers
- `jsonCredential` / `connectionString`: typed secure wrappers, never renderer-persisted plaintext
- `oauth2Pkce`: main-owned PKCE flow for saved SSE servers

The renderer may initiate OAuth only by saved server ID and receives sanitized status. It never supplies discovery targets, endpoints, state, verifier, authorization codes, tokens, refresh tokens, or client secrets over IPC.

## OAuth network policy

OAuth metadata is untrusted network input.

- Public endpoints require HTTPS.
- Loopback HTTP(S) is allowed only when the saved MCP resource itself is loopback.
- Credentials, fragments, private/link-local/local literal targets, and unsafe DNS results are rejected.
- Discovery, registration, exchange, and refresh requests reject redirects and have bounded deadlines.
- Callback state must match exactly; PKCE verifier and codes remain main-only.

Adding another transport or OAuth mode requires an architecture update and threat-model tests.

## Catalogue and agent requests

The bundled catalogue is code-owned and offline. Catalogue entries never fetch registry metadata at runtime and never persist placeholder secrets.

The model-callable `mcp_request_add` capability creates a pending review only. It cannot add, connect, authenticate, trust, or expose a server. Main owns pending request IDs and approval payloads.

## Troubleshooting

- **Needs sign-in:** complete the explicit OAuth action in Settings.
- **Connected but tools unavailable:** review and trust the server/tools.
- **Auth failed:** inspect sanitized status; reauthenticate rather than copying tokens into config.
- **Configuration read error:** resolve the reported filesystem error. Do not recreate the store unless corruption was explicitly diagnosed.
- **Reconnect loop:** disconnect, inspect transport/auth configuration, and reconnect explicitly. There is no transport fallback.
