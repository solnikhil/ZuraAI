# Extension Platform Claim Verification

Audit date: 2026-07-12

This is an adversarial verification record for the Phase 1 extension platform. It distinguishes
implemented behavior from planned behavior and maps every public claim to direct evidence. A
green build alone is not treated as proof unless the relevant test or artifact covers the claim.

## Claim matrix

| Claim                                                    | Evidence inspected                                                                                               | Result                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Manifests are versioned and strictly validated           | `src/extensions/validation.ts`; manifest validation tests                                                        | Verified                                           |
| Third-party JavaScript is not executed                   | Entries accept only `ui/*.json` or reviewed `host:*`; no package script loader exists                            | Verified for Phase 1                               |
| Package traversal and symlink escapes are rejected       | Canonical-root resolution and tree walk; real Windows junction rejection test                                    | Verified                                           |
| Oversized packages and UI metadata are rejected          | Size/count/depth limits; oversized package and document tests                                                    | Verified                                           |
| Duplicate and stale identities cannot gain execution     | Duplicate import and stale-registry tests; commands resolve only from discovered packages                        | Verified                                           |
| UI is rendered by trusted components                     | `CommandCenterExtensionHost.tsx`; host behavior/accessibility tests                                              | Verified                                           |
| `view`, `no-view`, and `workspace` have runtime behavior | Generic host, main-owned no-view resolver, GitHub host routing; service/overlay tests                            | Verified                                           |
| Arbitrary actions and IPC names are rejected             | Action allowlist, dedicated preload set, unknown action/IPC tests                                                | Verified                                           |
| Storage is namespaced and isolated                       | SHA-256 namespace path, bounds, two-extension isolation test                                                     | Verified                                           |
| Network access is constrained                            | Exact domain/permission checks, HTTPS construction, method/size/timeout/redirect limits, undeclared-domain tests | Verified                                           |
| Filesystem paths do not cross the extension bridge       | Opaque handle contract and cross-extension ownership; returned-handle test                                       | Verified                                           |
| Installation and permissions require user approval       | Short-lived review plus main-owned native dialog; self-approval cancellation test                                | Verified                                           |
| Permission changes invalidate stale review               | Manifest re-discovery and permission comparison; escalation test                                                 | Verified                                           |
| Rejected updates preserve installed state                | Installed-version/update test verifies version remains unchanged after stale review failure                      | Verified                                           |
| Install/disable/enable/update/uninstall lifecycle works  | Service lifecycle tests and Store tests                                                                          | Verified                                           |
| Development import and reload works                      | Main-owned picker, dev-only gate, watcher callback reload test                                                   | Verified                                           |
| GitHub migrated without renderer token exposure          | Manifest registry migration, dedicated host, safe-storage architecture, GitHub security/full regression suite    | Verified within existing GitHub coverage           |
| GitHub has no parallel legacy Store lifecycle            | Migration test asserts the manifest/registry path and absence of GitHub-specific lifecycle IPC                   | Verified                                           |
| CLI can scaffold and validate packages                   | Seven Node CLI tests                                                                                             | Verified                                           |
| Packaged builds ship both reference extensions           | `build:dir` output and direct `release/win-unpacked/resources/extensions` inspection                             | Verified on Windows x64                            |
| Agents cannot publish extensions                         | No publish runtime or IPC exists                                                                                 | Verified by absence; publishing is not implemented |

## Commands executed

The following checks passed against the same worktree documented here:

```text
bun run typecheck
  PASS

bun run test
  259 test files passed
  2,257 tests passed

node --test packages/zuraai/bin/zuraai.test.cjs
  7 tests passed

bun run build:dir
  renderer, Electron main, and preload built
  Windows x64 unpacked application packaged successfully

git diff --check
  PASS (line-ending conversion notices only)
```

Changed extension-platform files were also checked with ESLint. There were zero errors and one
pre-existing `console` warning in `electron/preload.ts`.

## Packaged artifact inspection

The Windows unpacked build contains:

```text
resources/extensions/github-workspace/zura-extension.json
resources/extensions/github-workspace/assets/icon.svg
resources/extensions/github-workspace/README.md
resources/extensions/github-workspace/CHANGELOG.md
resources/extensions/welcome/zura-extension.json
resources/extensions/welcome/assets/icon.svg
resources/extensions/welcome/ui/welcome.json
resources/extensions/welcome/ui/remember-visit.json
resources/extensions/welcome/README.md
resources/extensions/welcome/CHANGELOG.md
```

## Corrections and limits

The audit intentionally narrows several phrases that could otherwise overstate the implementation:

- `extension build` and `extension test` are validation aliases, not compilers or third-party test
  runners.
- Agent operation types are shared contracts. There is no broad model-callable extension tool
  surface in Phase 1.
- `extension_pack`, signing, remote Store publishing, and `extension_publish` are not implemented.
- Ordinary extensions do not receive a generic OAuth broker. GitHub OAuth remains inside the
  reviewed GitHub host.
- The network broker is unauthenticated unless a future reviewed host owns authentication.
- Directory handles establish selection and ownership but expose no directory-enumeration API.
- Rollback evidence covers rejected/stale updates preserving the installed record. This is not a
  general package snapshot or downgrade system.
- The packaged artifact was verified on Windows x64. macOS and Linux packaging were not executed
  in this Windows environment.
- No untrusted executable extension runtime exists, so “crashed extension runtime” is handled by
  rejecting malformed documents and presenting host error state rather than recovering a worker
  process.

These are current product boundaries, not silent fallbacks.
