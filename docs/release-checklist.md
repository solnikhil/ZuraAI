# Release Checklist

## Pre-release

- Confirm `package.json` version bump
- Run `npm run typecheck`
- Run `npm test`
- Run `npm run build`
- Confirm updater config points to the correct GitHub repo owner/name

## Security

- Verify no secrets are staged (`.env`, API keys, local snapshots)
- Confirm CI and secret scan workflows pass
- Review dependency update PRs and security alerts

## Packaging and publishing

- Ensure Windows signing setup is configured for production builds
- Create a GitHub release with release notes
- Upload build artifacts from CI or local trusted build

## Post-release

- Verify auto-update path from previous version
- Monitor issues for regressions
