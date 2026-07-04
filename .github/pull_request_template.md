## What changed

-

## Why

-

## Scope

- Type: `feat` / `fix` / `refactor` / `docs` / `chore` / `test` / `ci` / `build`
- Area: renderer / main / preload / IPC / providers / tools / settings / packaging / docs
- Related issue: closes #

## Testing

- [ ] `bun run typecheck`
- [ ] `bun run test`
- [ ] `bun run build` (required for packaging, Electron, or release-flow changes)
- ## Manual verification:

## UI notes

- [ ] No UI change
- [ ] UI change includes updated screenshots or recordings

## Security and architecture

- [ ] No new secrets, tokens, or `.env` files are included
- [ ] Renderer remains untrusted; privileged behavior stays behind narrow IPC boundaries
- [ ] `electron/preload.ts` allowlists and `src/electron.d.ts` were updated if exposed APIs changed
- [ ] `AGENTS.md` architecture section was updated if IPC, storage, tools, providers, windows, or data flow changed

## Notes for reviewers

-
