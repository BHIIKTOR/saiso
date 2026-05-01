# v1.0.0 Readiness Checklist

Use this checklist to decide whether the next release candidate is ready to become the stable `1.0.0` release.

## Release Invariants

- `main` is clean and pushed to `BHIIKTOR/saiso`.
- Root package remains private.
- Public package names are `@saiso/core`, `@saiso/plugin-sdk`, `@saiso/svm-mcp-server`, and `@saiso/cli`.
- Public package repository, homepage, and issue metadata point to `https://github.com/BHIIKTOR/saiso`.
- `@saiso/cli` uses workspace dependencies in git and concrete published versions only during npm publish.
- Package READMEs are synced into package manifests with `npm run release:package-readmes:check`.

## Required Local Gates

```bash
bun install
npm run templates:check-integrity
npm run templates:check-sync
npm run templates:regression
npx tsc -p packages/saiso-core/tsconfig.json --noEmit
npx tsc -p packages/saiso-cli/tsconfig.json --noEmit
npx tsc -p packages/saiso-svm-mcp-server/tsconfig.json --noEmit
bun test packages/saiso-core/tests
bun test packages/saiso-cli/src
bun test packages/saiso-svm-mcp-server/tests
npm run release:validate-rc -- --version <version>
```

## Live and Provider Gates

- Hosted 0x smoke has `ZEROX_API_KEY` configured and uses the v2 allowance-holder endpoint.
- Privy template smoke has `PRIVY_APP_ID` and `PRIVY_APP_SECRET` configured.
- x402 and MPP staging connectivity smoke passes or has a documented provider-side failure.
- Paid-run policy files pass `saiso policy validate`.

## Published Package Gates

After publish:

```bash
npm run release:verify-npm -- --version <version> --dist-tag latest
npm run release:post-rc-verify -- --version <version>
```

The npm verifier must confirm:

- expected dist-tags point at the target version
- each tarball includes a non-empty `README.md`
- package-page README metadata is non-empty when publishing with the `latest` tag

## Clean User Journey

Run this outside the repo from a temporary directory:

```bash
npm init -y
npm install @saiso/cli@rc
npx saiso new demo-agent --env testnet --yes
cd demo-agent
bun install
npx saiso add privy_client_base --yes
npx saiso add privy_wallet_lifecycle --yes
npx saiso add privy_balance_and_history --yes
npx saiso add privy_transfer --yes
npx saiso add privy_signing_evm --yes
npx saiso add gas_estimation --yes
npx tsc -p tsconfig.json --noEmit
```

## Stable Release Decision

Cut stable `1.0.0` only when the local gates, provider gates, published package gates, and clean user journey all pass from a clean clone or clean temporary install.
