# MCP in ZuraAI

MCP (Model Context Protocol) lets ZuraAI talk to external tool servers. Main owns the real connections and secrets. The UI only edits safe settings and shows status.

## Mental model

1. You **save** a server config.
2. You **connect** it.
3. Tools are discovered.
4. You **trust** the server/tools before the model can see them.
5. Mutating calls still go through normal approval rules when required.

Saving is not trust. Connecting is not trust. Trust is an explicit user step.

Per-server work (config, connect, OAuth, disconnect) is serialized so two edits do not stomp each other. Different servers can transition in parallel.

## Where things live

- Non-secret config: `mcp-servers.json` under Electron user data
- Secrets and OAuth tokens: main-process secure storage
- UI bridge: `window.mcp.*` (narrow channels only)

Opening the config file always opens ZuraAI’s own file. It does not accept arbitrary paths from the UI.

## Auth modes (short version)

| Mode | Idea |
| ---- | ---- |
| none | No credentials |
| env secret | Secret injected into a local stdio process env |
| header / bearer / basic | Secrets attached to remote requests in main |
| JSON credential / connection string | Typed secret wrappers; never plain in renderer storage |
| OAuth 2.1 PKCE | Main-owned browser/loopback flow for saved remote SSE servers |

The UI can start OAuth only by **saved server id**. It never sends authorization URLs, codes, verifiers, or tokens over IPC.

## OAuth network rules

Discovered OAuth endpoints are untrusted input:

- Prefer public HTTPS
- Loopback HTTP(S) only when the MCP resource itself is loopback
- No embedded credentials or fragments
- Hostnames are resolved and private/local results are rejected
- Redirects are refused; requests have short timeouts
- Callback `state` must match exactly

## Catalogue and “please add this server”

The in-app MCP library is a small, bundled catalogue. It does not scrape a remote registry at runtime, and it should not save placeholder secrets.

If the agent asks to add a server, it can only create a **pending review**. It cannot silently install, connect, trust, or authenticate a server.

## Troubleshooting

| Symptom | What to try |
| ------- | ----------- |
| Needs sign-in | Finish the OAuth action in Settings |
| Connected but no tools | Trust the server/tools in the MCP UI |
| Auth failed | Check sanitized status; re-auth rather than pasting tokens into JSON |
| Config read error | Fix the real filesystem problem; do not assume the file is empty |
| Reconnect loop | Disconnect, fix transport/auth, reconnect on purpose. There is no silent transport fallback. |

More architecture context: [`AGENTS.md`](../AGENTS.md).
