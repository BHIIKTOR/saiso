# RC Release Checklist

Use this checklist for `1.0.0-rc5` and later RCs.

## 1. Credentialed Live Template Smoke

Configure provider credentials locally or in GitHub Actions secrets:

```bash
ZEROX_API_KEY=...
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
```

Optional provider overrides:

```bash
ZEROX_SWAP_API_BASE=https://api.0x.org/swap/allowance-holder
JUPITER_QUOTE_API_BASE=https://lite-api.jup.ag/swap/v1
PRIVY_BASE_URL=https://api.privy.io/v1
PRIVY_LIVE_WALLET_ID=...
RPC_URL=...
CHAIN_ID=1
```

Run:

```bash
npm run smoke:templates:live -- --fail-on-skipped-credential
```

## 2. Live Smoke CI

GitHub Actions exposes `Live Template Smoke`, which runs manually and nightly.

Manual runs default to failing when hosted 0x or Privy credentials are missing. The nightly schedule also fails on missing credentials so secret drift is visible.

## 3. Final RC Gate

Run the full local release gate:

```bash
npm run release:validate-rc -- --version 1.0.0-rc5
```

This includes template integrity, sync drift, generated template regression, typechecks, tests, live template smoke, release metadata validation, and pack-install smoke.

## 4. Publish RC

Use the `Publish Packages` workflow:

- `version`: `1.0.0-rc5`
- `dist_tag`: `rc`
- `dry_run`: `true` for rehearsal, then `false` for publish
- `require_live_template_credentials`: `true` once `ZEROX_API_KEY`, `PRIVY_APP_ID`, and `PRIVY_APP_SECRET` are configured

The workflow publishes package dependencies first and publishes the `saiso` CLI after dependency packages are visible in npm.

## 5. Post-RC Verification

After npm publish completes, verify the advertised install path from a clean project:

```bash
npm run release:post-rc-verify -- --version 1.0.0-rc5
```

The verifier installs `@saiso/cli@<version>` from npm, creates a new project, adds the advertised Privy and gas-estimation features, and typechecks the generated project.
