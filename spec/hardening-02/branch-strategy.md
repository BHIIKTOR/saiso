# Branch Strategy

## Default Branches

1. `main`: production-ready branch; release tags are cut from here.
2. `develop`: integration branch for upcoming release work.

## Working Branches

1. `feature/<topic>`: net-new implementation work.
2. `fix/<topic>`: bug fixes and hardening patches.
3. `release/<version>`: pre-release stabilization branch when needed.

## Merge Policy

1. Require CI green for merge to `main` and `develop`.
2. Require hardening gates:
- core typecheck
- CLI typecheck
- core tests
- CLI tests
- policy strict validation gate
- staging payments smoke
3. Prefer squash merge for feature branches to keep history compact.

## Tagging Policy

1. Tag format: `v<semver>` (example: `v1.0.0-rc1`).
2. Create tags from `main` only.
3. Publish workflows consume signed tags after CI passes.
