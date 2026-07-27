# Renderer architecture

This is about ownership inside the React UI. The hard security rule still comes from `AGENTS.md`: the UI is untrusted, and privileged work only happens through narrow preload bridges.

## Who owns which state

`DashboardApp` stacks React providers. Put state in the narrowest owner that needs to coordinate it:

- **Settings** — sanitized preferences, model lists, “is a key present?” markers. Never readable secrets.
- **Chat history** — session index, folders metadata, loaded message windows, chat/artifact edits.
- **Streaming** — temporary output for the active run. Finished output is committed through chat history.
- **MCP / approvals** — UI state only; main still owns real permission.
- **Shell** — navigation and layout only.

Prefer selector hooks for hot paths. Mutation APIs should hide persistence details from components.

## Chat loading and saving

Electron main is the real chat database. The UI keeps a light index and loads a recent message window for the active chat. Inactive chats prune back to metadata so huge histories do not sit in renderer memory forever.

Inside `ChatHistoryProvider`:

| Helper                         | Job                                                        |
| ------------------------------ | ---------------------------------------------------------- |
| `chatHistoryDomain.ts`         | Pure normalize / project / folder operations               |
| `chatHistoryRepository.ts`     | IPC and local-storage adaptation                           |
| `useTransactionalState.ts`     | Once-only transitions with a synchronous authoritative ref |
| `useChatHistoryPersistence.ts` | Dirty flags, debounce, self-change accounting, final flush |
| `useLoadedSessionCache.ts`     | Windowed load, prune, artifact merge                       |

Tests should drive the real provider public API — not a copy of the transform logic.

### Persistence invariants

1. A failed write stays pending; the next mutation retries the newest snapshot.
2. A newer snapshot must not be overwritten by an older in-flight write.
3. Unmount attempts a best-effort flush.
4. Each self-originated store mutation accounts for the matching `chat-store:changed` event so external reloads are not skipped.
5. External reloads do not clobber unsaved local revisions.
6. Session/folder reducers run once outside React updater callbacks; the authoritative ref advances
   before React publishes the state and persistence is scheduled only from the committed result.
7. Electron repository failures remain Electron failures. Local storage is used only by the
   non-Electron adapter and one-time migration path, never as an operational fallback.

Renderer teardown cannot await React cleanup. Durable shutdown guarantees belong in main.

## Streaming lifecycle

Preparation → provider stream → optional tool/research rounds → finalization. Shared rules live in [`CHAT_RUNTIME.md`](CHAT_RUNTIME.md). `useStreamingChat` is the React adapter; controllers and finalizers own the hard invariants.

## Settings schema

`zura-settings` in localStorage is sanitized only. Numbered `settingsSchemaVersion` migrations live in `src/contexts/settingsMigrations.ts`. Legacy aliases (for example old `skills` vs `extensions` keys) need an explicit retirement plan — do not keep dual shapes forever without a removal version.

## Settings UI layout

Settings CSS is section-owned and imported in a fixed order. Sidebar chat/folder rows should come from pure list models so tests do not need a full DOM tree to assert structure.

## Provider hub

Provider settings compose registry metadata + secret presence + model lists. Adding a provider means registry + service adapter + main runtime support + tests — not only a new card in the UI. See [`PROVIDERS.md`](PROVIDERS.md).
