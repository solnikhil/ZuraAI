# ZuraAI Command Center Extensions

ZuraAI extensions are small, manifest-driven products that run inside Command Center. Phase 1
prioritizes a narrow security model: third-party packages contribute data, not executable
JavaScript. ZuraAI validates that data in Electron main and renders it with trusted React
components.

This document is the developer and operator guide. The architectural decision and tradeoffs are
recorded in [EXTENSION_PLATFORM_ADR.md](./EXTENSION_PLATFORM_ADR.md), and the verification record
is in [EXTENSION_PLATFORM_VERIFICATION.md](./EXTENSION_PLATFORM_VERIFICATION.md).

## What an extension can do

An extension can contribute one or more searchable Command Center commands in three modes:

| Mode        | Behavior                                                                          | Intended use                                        |
| ----------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| `view`      | Opens a trusted, serializable ZuraAI view                                         | Lists, details, forms, navigation                   |
| `no-view`   | Executes one validated, non-navigation root action in main without opening a view | Small storage or no-op actions                      |
| `workspace` | Routes to a reviewed, first-party host capability                                 | GitHub Workspace and other privileged Zura products |

Ordinary packages cannot supply React components, HTML, CSS, preload code, Node modules, shell
commands, arbitrary IPC, raw paths, or OAuth tokens.

## Package layout

```text
my-extension/
├── zura-extension.json
├── ui/
│   └── home.json
├── assets/
│   └── icon.svg
├── tests/
├── README.md
└── CHANGELOG.md
```

Package limits are enforced before discovery:

- 5 MB total package size
- 500 filesystem entries
- 16 directory levels
- no symbolic links or junction escapes
- 64 KB manifest
- 512 KB per view document
- all referenced files must resolve inside the canonical package root

## Manifest

The current schema version is `1`.

```json
{
  "schemaVersion": 1,
  "id": "com.example.notes",
  "name": "Notes",
  "publisher": "@example",
  "version": "1.0.0",
  "description": "Keep a small local note inside Command Center.",
  "icon": "assets/icon.svg",
  "platforms": ["windows"],
  "categories": ["Productivity"],
  "commands": [
    {
      "id": "notes",
      "title": "Notes",
      "description": "Open notes",
      "mode": "view",
      "entry": "ui/notes.json",
      "keywords": ["notes", "memo"]
    }
  ],
  "permissions": ["storage.local"],
  "privacy": { "dataLeavesDevice": false },
  "changelog": "CHANGELOG.md"
}
```

Important fields:

- `id` is a stable reverse-domain identifier. An installed identity cannot be replaced by a
  different discovered package with the same ID.
- `version` uses semantic-version syntax. Any difference from the installed version is presented
  as an available update.
- `entry` is either a package-relative `ui/*.json` document or a reviewed `host:*` capability.
- `capabilities.host` is reserved for bundled, reviewed products. Development imports cannot
  request it.
- `networkDomains` contains hostnames only. Every domain must have a matching
  `network.<domain>` permission and vice versa.
- `changelog` is an optional package-relative Markdown file, bounded to 64 KB for Store display.

## Trusted UI documents

A UI entry is a versioned document containing named views:

```json
{
  "schemaVersion": 1,
  "rootViewId": "home",
  "views": {
    "home": {
      "id": "home",
      "kind": "list",
      "title": "Notes",
      "searchPlaceholder": "Search notes",
      "sections": [
        {
          "id": "recent",
          "title": "Recent",
          "items": [
            {
              "id": "first-note",
              "title": "First note",
              "subtitle": "Stored locally",
              "actions": [
                { "id": "open-note", "title": "Open", "kind": "navigate", "viewId": "detail" }
              ]
            }
          ]
        }
      ]
    },
    "detail": {
      "id": "detail",
      "kind": "detail",
      "title": "First note",
      "markdown": "# Hello\n\nRendered by ZuraAI."
    }
  }
}
```

Supported view kinds are:

- `list`, including sections, items, search, and item actions
- `detail`, with bounded Markdown content
- `form`, with text, password, textarea, checkbox, and select fields
- `empty`
- `loading`, with an optional trusted skeleton template (see below)
- `progress`
- `error`

### Loading skeletons

Authors cannot ship custom loading HTML/CSS/JS. Instead, a `loading` view may pick one of the
trusted skeleton templates ZuraAI already knows how to render:

| `skeleton` value | Shape                                              |
| ---------------- | -------------------------------------------------- |
| `rows` (default) | Command Center-style result rows                   |
| `list`           | Search field + result rows                         |
| `detail`         | Title + body lines + action chips                  |
| `form`           | Labeled fields + primary action                    |
| `workspace`      | Sidebar + detail pane + footer (GitHub-style host) |
| `emoji-grid`     | Compact glyph grid                                 |

Example:

```json
{
  "id": "booting",
  "kind": "loading",
  "title": "Loading notes…",
  "description": "Reading local storage",
  "skeleton": "list"
}
```

Omit `skeleton` to use `rows`. Unknown template values are rejected at validation time.

The host owns DOM construction, styling, keyboard focus, Escape/back navigation, and action
menus. Documents are capped at 64 views and 500 list items. Forms are capped at 64 fields, and
submitted values are bounded and revalidated in main.

## Actions

Phase 1 supports only these action kinds:

- `navigate`: open another validated view from the same document
- `storage.set`: store a literal value or a bounded form value
- `storage.remove`: remove one extension-owned key
- `noop`: complete without mutation

The renderer sends only extension, command, view, and action IDs. Main reloads the package,
locates the declared action, and rejects IDs that are absent or malformed. There is no action
that accepts a shell command, executable, arbitrary URL, path, or generic tool name.

A `no-view` command must point to a document whose root view contains exactly one non-navigation
action. Selecting the command executes that action in main and does not open the extension host.

## Permissions and capability brokers

Supported ordinary permissions are:

| Permission                       | Capability                                                         |
| -------------------------------- | ------------------------------------------------------------------ |
| `storage.local`                  | Bounded, namespaced non-secret key/value storage                   |
| `filesystem.file-selection`      | Main-owned file picker returning an opaque handle                  |
| `filesystem.directory-selection` | Main-owned directory picker returning an opaque handle             |
| `network.<domain>`               | HTTPS GET/POST through the broker for the matching declared domain |

Reviewed product permissions currently include GitHub account, repository, and repository-folder
selection capabilities. Declaring a permission does not create a generic IPC or runtime escape.

### Storage

Storage lives at:

```text
userData/zura-extension-storage/<sha256-extension-id>.json
```

Each namespace is limited to 128 KB and 256 keys. Only bounded strings and booleans are accepted.
Uninstall removes the extension namespace without touching external user data.

### Network

The network broker enforces:

- an exact manifest-declared hostname
- a separately approved `network.<hostname>` permission
- HTTPS only
- GET and POST only
- fixed request headers and allowlisted content types
- 15-second timeout
- 64 KB request body
- 1 MB response body
- no redirects, credentials in URLs, or renderer-selected protocols

It is not an OAuth broker. Authenticated GitHub calls remain inside the reviewed GitHub host.

### Files

File and directory pickers are owned by main. The renderer receives an expiring random handle,
display name, kind, and expiry—not a path. Text-file reads are limited to 1 MB and only work for
an unexpired file handle belonging to the requesting extension. Directory handles cannot be read
as files.

## Installation and updates

The Zura Store reads discovered package metadata from main. A product page shows artwork,
publisher, trust status, available and installed versions, commands and modes, permissions,
declared domains, privacy behavior, and package-contained version history.

Install, update, and uninstall use this flow:

1. The Store asks main to prepare a mutation for a discovered extension ID.
2. Main returns a short-lived, single-use confirmation ID and the exact reviewed manifest.
3. The Store presents the review.
4. Applying the ID opens a main-owned native approval dialog.
5. Only an affirmative native response allows main to re-discover the package and apply it.
6. A version or permission change between review and apply invalidates the operation.

Cancellation consumes the ID. Renderer code and coding agents can prepare and request a change,
but cannot approve it through extension IPC. Updates preserve the installed record when review or
validation fails. Enable/disable does not delete extension data. Uninstall removes namespaced
storage and invokes product-specific authorization cleanup.

Installed state is stored in `userData/zura-extensions.json`. The old GitHub-only
`zura-store-products.json` flag is migrated once.

## Development workflow

Create a package:

```sh
zuraai extension create ./my-extension com.example.my-extension
```

Validate it:

```sh
zuraai extension validate ./my-extension
```

`zuraai extension build` and `zuraai extension test` are currently validation aliases. They do
not transpile code or execute extension tests because Phase 1 packages contain no executable
third-party runtime.

In a development build of ZuraAI:

1. Open Command Center.
2. Open Zura Store.
3. Choose **Import Development Extension**.
4. Select the package directory in the main-owned picker.
5. Install it through the normal review and native approval flow.

Imported roots persist in the extension registry and are watched recursively. Manifest and UI
changes trigger debounced rediscovery and notify the Command Center renderer. Development import
is disabled in packaged builds.

## Agent workflow contracts

Shared contracts reserve these bounded operations:

- `extension_create`
- `extension_validate`
- `extension_preview`
- `extension_get_errors`
- `extension_run_tests`
- `extension_pack`
- `extension_request_install`
- `extension_request_publish`

These are contracts, not broad model-callable IPC. Phase 1 implements the CLI create and validate
subset plus development import/preview through the Store. Packing, signing, remote publishing,
and a generic OAuth broker are deliberately not implemented. Any future install, permission,
secret, or publish operation must retain an explicit user-owned approval boundary.

## GitHub Workspace

GitHub Workspace is packaged as `com.zuraai.github`. Its manifest contributes Store artwork,
metadata, permissions, and a `workspace` command. The `host:git-workspace` entry routes only to
the existing reviewed host implementation.

Its complete product lifecycle now goes through the generic extension registry and
`window.extensions`: install, update, enable, disable, permission review, and uninstall. The
dedicated `window.githubWorkspace` bridge contains runtime repository and account operations only;
there are no parallel GitHub-specific lifecycle channels. `zura-store-products.json` is retained
solely as a one-time input for users upgrading from the old Store-product implementation.

Git execution, bundled Dugite runtime, repository paths, filesystem watchers, OAuth device flow,
secure token storage, credentials, and GitHub network operations remain in Electron main. Tokens
and device codes never cross into the renderer. Uninstall clears GitHub authorization and ZuraAI
repository selection without deleting repositories.

The non-privileged `com.zuraai.welcome` package demonstrates the ordinary trusted UI and storage
path, including a real `no-view` command.

## Testing

Focused tests:

```sh
bunx vitest run src/extensions/validation.test.ts electron/extensions/extensionService.test.ts
bunx vitest run src/components/CommandCenterExtensionHost.test.tsx src/components/CommandCenterStore.test.tsx
node --test packages/zuraai/bin/zuraai.test.cjs
```

Release gates:

```sh
bun run typecheck
bun run test
bun run build:dir
```

The packaged manifests should exist under:

```text
release/win-unpacked/resources/extensions/
```

See [EXTENSION_PLATFORM_VERIFICATION.md](./EXTENSION_PLATFORM_VERIFICATION.md) for the current
claim-by-claim audit and known limits.
