# Main-process persistence

ZuraAI keeps privileged and durable application state in Electron main. This document defines the
minimum invariants for JSON stores under `app.getPath('userData')`.

## Writes and transactions

- Use `electron/utils/atomicFile.ts` for runtime JSON replacement. It writes and syncs a unique
  temporary file before replacing the destination.
- Use `RecoverableSerializedTaskQueue` when operations share mutable state. A task failure is returned
  to its caller, but the queue absorbs that rejection for scheduling purposes so later work still runs.
- Put the complete read-modify-write operation inside the queue. Serializing only `writeFileAtomic`
  still permits two callers to derive different updates from the same stale snapshot.
- Publish a cache update only after the durable replacement succeeds, and cache copies rather than
  caller-owned mutable objects.

The chat index follows these rules for session metadata, deletes, and folder changes. Session content
is written before its index entry is published. A failed index write may therefore leave an orphaned
session file, but it must not publish metadata for an incomplete session write. Recovery tooling may
reconcile orphan files later; ordinary reads treat the index as authoritative.

Secure storage serializes reads and mutations because every key update rewrites the encrypted JSON
object. Decrypted values are cached briefly as an internal snapshot only. They are never exposed to
the renderer or returned by reference to another main-process caller.

## Read failures

Handle failures by category:

- `ENOENT`: the store has not been created; initialize empty state.
- Invalid JSON or an invalid root shape: report corruption. The MCP config store may move proven
  corrupt content to a timestamped `.corrupt-*` file before returning an empty configuration.
- Operational errors such as `EACCES`, `EBUSY`, `EIO`, or a directory at the expected file path:
  propagate the error. Do not return empty state and do not quarantine or overwrite the path.

This distinction prevents a transient filesystem problem from appearing to the renderer as deleted
user data and then being made permanent by a later save.

## Regression coverage

Persistence tests should include concurrent independent mutations, a failed task followed by a
successful queued task, invalid JSON, missing files, and an operational read failure. Any new JSON
store should document its authoritative file, cache ownership, transaction boundary, and recovery
behavior here or in a more specific subsystem document.
