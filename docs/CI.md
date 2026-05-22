# CI Workflows

This document is a contributor-facing index of every workflow under `.github/workflows/` plus the shared composite under `.github/actions/`. If you open a PR and don't recognize a check, find it here.

> **Tip:** all workflow IDs (the part before `/` in a status check name) come from the workflow's `name:` field. The `name:` shown in this doc is what GitHub's checks UI displays.

## Composite actions

### `.github/actions/setup-bun`

Installs Bun (pinned via `inputs.bun-version`, default `1.3.14`) and runs `bun install --frozen-lockfile`. Reused by every workflow that needs Bun. Pinned to `oven-sh/setup-bun@<sha>` for supply-chain hardening.

If you need to bump Bun, see `docs/MAINTENANCE.md` → "Rust-Bun upgrade".

---

## PR-time checks (run on every pull request to `main`)

| Workflow | File | Triggers | Path filter | Required? |
| --- | --- | --- | --- | --- |
| **CI** (`test`) | `ci.yml` | PR + push to main | none | yes |
| **Lint** (`lint`) | `lint.yml` | PR + push to main | excludes `**.md`, `LICENSE`, `images/**`, `docs/**`, `research/**` | informational (currently `continue-on-error: true`) |
| **Knip** (`knip`) | `knip.yml` | PR + push to main | same as Lint | informational (currently `continue-on-error: true`) |
| **Validate PR Title** (`validate`) | `pr-title.yml` | PR (`opened`/`edited`/`synchronize`/`reopened`) | n/a | yes |
| **Dependency Review** (`review`) | `dependency-review.yml` | PR | only `package.json`, `bun.lock`, `package-lock.json` | yes when triggered |
| **CI Cross-Platform** (`test (matrix)`) | `ci-cross-platform.yml` | PR | `electron/**`, `src/**`, `scripts/**`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `package.json`, `bun.lock`, this workflow, `setup-bun` composite | informational (Mac/Windows are extra coverage; Ubuntu duplicates `CI / test`) |
| **Package Smoke** (`build (matrix)`) | `ci-package-smoke.yml` | PR | `electron/**`, `installer/**`, `build/**`, `scripts/generate-icons.mjs`, `package.json`, `vite.config.ts`, this workflow, `setup-bun` composite | informational |
| **Pinned Actions** (`ensure-pinned`) | `actions-pinned.yml` | PR | `.github/workflows/**`, `.github/actions/**` | yes when triggered |
| **CodeQL** (`Analyze`) | `codeql.yml` | PR + push to main + weekly cron | none | yes |
| **Secret Scan** (`gitleaks`) | `secret-scan.yml` | PR + push to main + weekly cron | none | yes |
| **License Audit** (`audit`) | `license-audit.yml` | PR | `package.json`, `bun.lockb` (note: stale path; should be `bun.lock`) | yes when triggered |

Total worst-case per substantive PR: ~5 lightweight jobs (~3 min each) + 3-OS matrix (~5 min wall) + 2-OS package smoke (~8 min wall). Doc-only PRs skip Lint, Knip, the matrix, and the package smoke via `paths-ignore` / `paths` filters.

### Shared CI patterns

- **Concurrency cancel.** Every PR-time workflow declares `concurrency: { group: <name>-${{ github.ref }}, cancel-in-progress: true }` so that pushing a fix to a PR aborts the previous run instead of stacking up.
- **Path filters.** Heavy jobs (matrix, package smoke) only run when relevant files change. Doc-only PRs skip them entirely.
- **No external services.** Every status check is rendered by GitHub Actions itself; nothing posts to Codecov, Renovate, or any third-party SaaS.
- **SHA-pinned third parties.** Non-`actions/*` and non-`github/*` actions are pinned to a 40-character commit SHA (with the version tag preserved as a trailing comment). The `Pinned Actions` workflow enforces this on every workflow change.

---

## Bots and automation

| Workflow | File | When it runs |
| --- | --- | --- |
| **Labeler** (`label`) | `labeler.yml` | Every PR (uses `pull_request_target` so PRs from forks still get labeled) |
| **Stale** (`stale`) | `stale.yml` | Daily cron at 01:00 UTC + manual `workflow_dispatch` |
| **Scorecard** (`Scorecard analysis`) | `scorecard.yml` | Branch-protection rule changes + weekly Monday cron + push to main |

`Labeler` reads `.github/labeler.yml` and applies area labels (`area: ui`, `area: mcp`, `area: providers`, `dependencies`, ...) based on which files the PR touches.

`Stale` pings inactive issues after 60 days and PRs after 30 days. Add `pinned`, `security`, or `bug` (issues only) / `wip` (PRs only) to opt out. Closes 14 days after the stale notice.

`Scorecard` publishes OpenSSF Scorecard results to the Security tab and renders a public badge in the README.

`Dependabot` is configured via `.github/dependabot.yml` (a config file, not a workflow). It opens grouped PRs weekly on Mondays for `npm` (5 max open) and `github-actions` (3 max open). No auto-merge — every dependency bump is reviewed manually. Note that Dependabot writes to `package-lock.json`; you may need to run `bun install` locally after merge to update `bun.lock`.

---

## Release workflow

| Workflow | File | When it runs |
| --- | --- | --- |
| **Release** | `release.yml` | Push of `v*` tags (e.g. `v0.1.0`) |

This is unchanged by the recent CI hardening. It still validates that the tag matches `package.json` version, builds Windows + macOS artifacts, generates the changelog via `scripts/generate-changelog.mjs`, computes SHA-256 checksums, and uses `softprops/action-gh-release@<sha>` to publish a GitHub Release.

---

## How to fix common failures

### `Lint / lint` reports lots of errors / warnings

The repo had pre-existing ESLint and Prettier debt at the time these workflows landed. Until a dedicated cleanup PR resolves it, both `Lint` and `Knip` run with `continue-on-error: true` so they're informational, not gating. To see what's currently failing locally:

```bash
bun run lint           # ESLint
bun run format:check   # Prettier (check-only, no write)
bun run knip           # unused deps / exports
```

If your PR adds *new* lint errors, please fix them in your branch even though the workflow is technically informational right now. We'll flip these to required gates after the cleanup PR lands.

### `Validate PR Title / validate` failed

Your PR title doesn't match Conventional Commits. Edit the PR title to start with one of: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `ci`, `build`, `perf`, `revert`. Examples:

- `feat: add overlay window resize handle`
- `fix(mcp): handle disconnected server cleanly`
- `docs: clarify provider hub setup steps`

The check re-runs whenever you edit the title.

### `Dependency Review / review` blocked the PR

You added a dependency with a high-severity vulnerability or a denied license (GPL/AGPL). The action posts an inline comment listing the offending packages. Either:

- Bump to a clean version
- Remove the dependency
- Justify the exception in the PR description and ping a maintainer to discuss adjusting the deny-list

### `Pinned Actions / ensure-pinned` failed

You added or modified a third-party GitHub Action and referenced it by tag (e.g. `someorg/action@v1`) instead of a commit SHA. Replace it with:

```yaml
uses: someorg/action@<40-char-sha> # v1.2.3
```

Look up the SHA via the action's release page or:

```bash
curl -s https://api.github.com/repos/someorg/action/git/refs/tags/v1.2.3
```

If the type is `tag` (annotated), dereference once more via the `git/tags/<sha>` endpoint to get the underlying commit SHA.

`actions/*` and `github/*` are exempt from this rule.

### `CI Cross-Platform / test` fails on Windows or macOS but Ubuntu passes

Likely platform-specific. Common culprits:

- Path separators: use `path.join` / `path.sep`, not hardcoded `/`
- File-system case-sensitivity: imports are case-sensitive on Linux/macOS-with-CS-volume but not on Windows
- Native modules: rebuilding native deps under Bun differs across runners

### `Package Smoke / build` fails

The renderer or main bundle compiled but `electron-builder --dir` choked. Common causes:

- New file in `electron/` not exported correctly
- Icon generation script failed because `build/icon.ico` couldn't be regenerated
- A new asset path isn't included in `package.json` `build.files`

Reproduce locally with `bun run build:dir`.

---

## Recommended branch protection (maintainer-only)

GitHub branch-protection settings can't be configured via workflow; apply these manually under repo Settings → Branches → `main`:

**Required status checks:**

- `CI / test`
- `CodeQL / Analyze`
- `Validate PR Title / validate`
- `Secret Scan / gitleaks`

**Required when applicable** (these only run on certain paths, but require them when they do run):

- `Dependency Review / review`
- `Pinned Actions / ensure-pinned`

**Optional / informational** (don't require these — they're informational because of pre-existing debt or because they're an extra coverage layer):

- `Lint / lint`
- `Knip / knip`
- `CI Cross-Platform / test (ubuntu-latest)`, `(macos-14)`, `(windows-latest)`
- `Package Smoke / build (windows-latest)`, `(macos-14)`

**Other recommended branch settings:**

- Require a pull request before merging
- Require approvals: 1 (single-maintainer repos can leave at 0)
- Dismiss stale pull request approvals when new commits are pushed
- Require linear history
- Do not allow force pushes
- Do not allow deletions
- Require conversation resolution before merging

After a cleanup PR resolves the existing Lint / Knip findings, flip those to required as well.
