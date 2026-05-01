# Implementation Plan: Paid Staging + User-Facing Paid Tool Calls

This plan covers:

1. Point 2: true paid staging with secrets
2. Point 4: user-facing paid tool execution command

## A) Point 2: True Paid Staging With Secrets

## Requirements

1. A live smoke script must execute real payment challenge/retry flows against staging-paid endpoints.
2. Script must support both protocols:
   - x402 (`X-PAYMENT` retry header path)
   - MPP (`Payment` retry header path)
3. Credentials must be sourced from CI secrets, not checked into repo.
4. Script must fail if configured flow fails, and fail if no live flow is configured.

## Deliverables

1. `spec/saiso-v1.0/scripts/smoke-paid-live.mjs`
2. `spec/saiso-v1.0/live-paid-staging.md` with required secret contract
3. `package.json` script entry: `smoke:staging:paid-live`
4. `.github/workflows/live-paid-smoke.yml` (manual dispatch)

## Testing Requirements

1. Local dry run:
   - invoke script without secrets and verify explicit failure
2. CI/manual run:
   - with x402 secrets configured, one paid request succeeds
   - with MPP secrets configured, one paid request succeeds
3. Result artifact:
   - JSON output includes challenge status + settled status per protocol

## B) Point 4: User-Facing Paid Tool Command

## Requirements

1. Add CLI command to execute MCP tools from configured servers:
   - explicit server path
   - routed path by capability/network criteria
2. Command must optionally enable payment context and credential resolution.
3. Command should auto-start server for execution when requested.
4. Output must include:
   - selected server
   - tool result
   - receipt summary (if paid)
5. `saiso status` should show derived trust/payment reliability impact from receipts.

## Deliverables

1. `saiso mcp call` command in `packages/saiso-cli/src/commands/mcp.ts`
2. Receipt/trust summary enhancements in `packages/saiso-cli/src/commands/status.ts`
3. Manager execution path usage via `executeTool` / `routeAndExecuteTool`

## Testing Requirements

1. Compile validation:
   - `npx tsc -p packages/saiso-cli/tsconfig.json`
2. Core regression:
   - existing orchestrator payment tests remain green
3. Manual command tests:
   - unpaid call against local MCP tool
   - paid call with injected credential JSON and receipt output
   - `saiso status` reflects updated receipt metrics and derived trust score
