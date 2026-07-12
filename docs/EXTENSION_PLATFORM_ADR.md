# ADR: Command Center Extension Platform

Status: Accepted for Phase 1

## Decision

ZuraAI extensions are versioned packages described by `zura-extension.json`. Phase 1 does not
execute third-party JavaScript. Packages contribute validated serializable views and commands;
the trusted Command Center renderer maps those documents to Zura-owned List, Detail, Form,
Actions, Empty, Loading, Progress, Error, and navigation components.

Extension discovery, validation, installation, permissions, namespaced storage, development
imports, and action dispatch are owned by Electron main. The renderer sends only extension,
command, view, action, confirmation, and bounded form-value identifiers through a dedicated
preload bridge. Main resolves package paths and action definitions itself.

GitHub Workspace is the first product extension. Its package contributes metadata and a
`workspace` command, while the reviewed `git-workspace` host capability continues to own Git,
OAuth, credentials, repository paths, watchers, and native processes.
All GitHub lifecycle operations use the generic extension registry and approval flow. The
dedicated GitHub preload surface contains runtime operations only; the previous GitHub-specific
install-state, install, and uninstall channels are removed. The old product file remains only as
a one-time migration source.

## Runtime boundary

- Bundled packages are shipped as read-only resources.
- Development packages are explicitly selected with a main-owned folder picker and watched for
  reload. Symlinked packages and paths escaping the selected root are rejected.
- Standard packages cannot access Node, Electron, IPC, the shell, filesystem paths, OAuth
  tokens, or the network.
- Phase 1 actions are an allowlist: navigate, namespaced storage set/remove, and no-op.
- Installation, update, and removal use short-lived main-owned confirmation IDs. The renderer's
  apply request always triggers a main-owned native approval dialog, and cancellation consumes the
  ID. Preparing and invoking a mutation therefore cannot let an agent or compromised renderer
  approve its own request.
- Declared-domain HTTPS and user-selected filesystem access use separate typed brokers with
  bounded requests and opaque handles. OAuth remains host-owned (currently GitHub Workspace);
  generic OAuth, MCP, and additional privileged capabilities require separate reviewed contracts
  and architecture updates rather than generic IPC.

## Persistence

- `userData/zura-extensions.json`: installed/enabled versions, approved permissions, and
  explicitly imported development package roots.
- `userData/zura-extension-storage/<sha256-extension-id>.json`: bounded, namespaced non-secret
  extension values. Secrets remain in `safeStorage` and are not part of this Phase 1 API.

## Packaging

`extensions/bundled` is copied to the packaged application's `resources/extensions` directory.
Development resolves the same directory from the application root.

## Consequences

This deliberately favors a constrained, agent-generatable package format over Raycast-compatible
arbitrary Node execution. It provides a complete safe lifecycle now and leaves executable worker
runtimes, generic OAuth, package signing, and remote publishing for reviewed follow-up decisions.
