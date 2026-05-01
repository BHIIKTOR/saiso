# SAISO v1.0 Publish Pipeline

This pipeline publishes `@saiso/core` first, then publishes `saiso` (CLI), and blocks publish when release invariants fail.

## Workflow

- File: `.github/workflows/publish.yml`
- Trigger: `workflow_dispatch`
- Inputs:
  - `version` (required): exact package version to publish (example: `1.0.0-rc1`)
  - `dist_tag` (optional, default `latest`): npm distribution tag
  - `dry_run` (optional, default `true`): run npm publish in dry-run mode

## Jobs

1. `verify-release`
   - Installs dependencies.
   - Runs `scripts/release/validate-release.mjs`.
   - Runs `scripts/release/smoke-pack-install.mjs` to prove the tarballs install and run.

2. `publish-core`
   - Builds `packages/saiso-core`.
   - Publishes `@saiso/core` with provenance.

3. `publish-cli`
   - Rewrites `packages/saiso-cli/package.json` dependency from `workspace:*` to the release version.
   - Builds and publishes `saiso` with provenance.
   - For non-dry-run publishes, waits until `@saiso/core@version` is visible in npm before publishing CLI.

## Required Secrets

- `NPM_TOKEN`: npm automation token with publish rights to `@saiso/core` and `saiso`.

## Local Preflight

```bash
npm run release:validate -- --version 1.0.0-rc1
npm run release:smoke-pack -- --version 1.0.0-rc1
```

## Safety Notes

- Root `package.json` is marked `"private": true` to prevent accidental root publish.
- Publish is package-scoped (`packages/saiso-core`, `packages/saiso-cli`) only.
- Use `dry_run=true` for every new release branch before first real publish.
