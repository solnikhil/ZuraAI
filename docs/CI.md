# Continuous integration

This is a plain-language map of the GitHub Actions under `.github/workflows/`. If a check fails on your PR and the name looks unfamiliar, start here.

The name you see in the GitHub checks list comes from each workflow’s `name:` field.

## Shared setup

### `.github/actions/setup-bun`

Installs a pinned Bun version (default matches `package.json`) and runs `bun install --frozen-lockfile`. Almost every job that needs dependencies uses this action.

Third-party actions are pinned to full commit SHAs for supply-chain safety.

## Checks that run on pull requests

| Check                 | Workflow file           | Roughly when                             | Notes                                                                           |
| --------------------- | ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| **CI / test**         | `ci.yml`                | Every PR and push to main                | Typecheck, unit tests (Vitest **and** `node --test`), renderer build. Required. |
| **Lint**              | `lint.yml`              | PRs that touch code (docs-only can skip) | Required. Fails on lint/format findings that are not in `quality-baseline.json` |
| **Knip**              | `knip.yml`              | Same path idea as lint                   | Required. Fails on dead-code findings that are not in `quality-baseline.json`   |
| **Validate PR Title** | `pr-title.yml`          | Title changes                            | Must use Conventional Commits (`feat:`, `fix:`, …)                              |
| **Dependency Review** | `dependency-review.yml` | Dependency files change                  | Blocks risky licenses/vulns when it runs                                        |
| **CI Cross-Platform** | `ci-cross-platform.yml` | Code/config paths change                 | Extra Mac/Windows/Linux coverage                                                |
| **Package Smoke**     | `ci-package-smoke.yml`  | Packaging-related paths                  | Unpacked electron-builder smoke builds                                          |
| **Pinned Actions**    | `actions-pinned.yml`    | Workflow files change                    | Enforces SHA-pinned third-party actions                                         |
| **CodeQL**            | `codeql.yml`            | PR, main, weekly                         | Static analysis                                                                 |
| **Secret Scan**       | `secret-scan.yml`       | PR, main, weekly                         | gitleaks                                                                        |
| **License Audit**     | `license-audit.yml`     | Dependency changes                       | Production license policy                                                       |

Docs-only PRs usually skip the heavy matrix and package jobs.

### Patterns we rely on

- **Cancel in progress:** new pushes cancel older runs on the same PR.
- **Path filters:** packaging and matrix jobs only run when relevant files change.
- **No mystery third-party status bots** for core checks — GitHub Actions itself reports status.

## Automation bots

| Workflow      | What it does                                                 |
| ------------- | ------------------------------------------------------------ |
| **Labeler**   | Applies area labels from changed paths                       |
| **Stale**     | Nudges inactive issues/PRs, then closes after a grace period |
| **Scorecard** | OpenSSF Scorecard results for the public badge               |

Dependabot is configured in `.github/dependabot.yml` (not a workflow). It opens weekly dependency PRs; we review them by hand.

## Release workflow

Tagging `v*` (for example `v0.0.6`) runs `release.yml`: version check against `package.json`, build artifacts, changelog generation, checksums, and a GitHub Release upload.

## Fixing common failures

### Lint, format, or Knip failures

These gates are **required**, but they only fail on findings your change
introduced. Pre-existing debt is recorded in `quality-baseline.json`.

Reproduce the exact gate locally:

```bash
bun run quality:ratchet            # all three checks
bun run quality:ratchet --only=knip
```

It prints the specific new findings. Fix them - do not add them to the baseline.

Full reports, including the existing debt:

```bash
bun run lint
bun run format:check
bun run knip
```

If you _fixed_ baseline findings, shrink the baseline:

```bash
bun run quality:baseline
```

The baseline may only ever get smaller. Once a check reaches zero, drop it from
the baseline and enforce the raw command directly in the workflow.

### PR title rejected

Edit the title so it starts with a Conventional Commits type:

- `feat: add resize handle to overlay`
- `fix(mcp): handle disconnect cleanly`
- `docs: rewrite support guide`

### Dependency Review blocked you

A new dependency has a serious vulnerability or a disallowed license. Bump it, replace it, or remove it.

### Secret scan failed

A secret-looking string landed in the diff. Rotate anything real, remove it from history if needed, and use env vars or secure storage patterns instead.
