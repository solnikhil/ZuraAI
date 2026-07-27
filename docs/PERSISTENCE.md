# How ZuraAI saves data

Privileged and durable data is owned by the Electron main process under the OS user-data folder. This page is the short rulebook for JSON stores that can be rewritten at runtime.

## Writing safely

- Use atomic writes (`electron/utils/atomicFile.ts`): write a temp file, sync, then replace the real file.
- When several operations share the same on-disk state, put the whole read-modify-write cycle in a serialized queue. Serializing only the final rename is not enough — two callers can still compute updates from the same stale snapshot.
- Update in-memory caches only after the durable write succeeds.
- Never hand out mutable cache objects by reference.

### Chat index example

Session content is written before the index entry is published. If the index write fails, you might get an orphan session file, but you should not publish metadata for a half-written session. Ordinary reads treat the index as the source of truth.

### Secure storage

API keys and similar secrets are rewritten as whole encrypted documents. Reads and writes are serialized. Decrypted values stay inside main and are not returned by reference to callers or the UI.

## Reading failures

Treat errors by type:

| Situation                                                 | Correct behavior                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| File missing (`ENOENT`)                                   | Start with empty state                                            |
| Invalid JSON / wrong root shape                           | Treat as corruption (MCP may quarantine a proven-bad config file) |
| Permission, lock, device, or other operational I/O errors | Surface the error. Do **not** pretend the store is empty          |

That last rule matters: a temporary filesystem problem must not look like “user deleted everything,” then get saved permanently.

## Tests that should exist

For any new JSON store, cover at least:

- Concurrent independent mutations
- A failed task that does not block later work
- Invalid JSON
- Missing file
- Operational read failure

Document the authoritative file, who owns the cache, the transaction boundary, and recovery behavior either here or in a more specific guide.
