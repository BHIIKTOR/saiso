# @saiso/heretic-saiso

Heretic integration plugin for SAISO.

## Plugin ID

`heretic-saiso`

## Core Command Surface

- `saiso heretic init`
- `saiso heretic workspace attach`
- `saiso heretic runtime catalog`
- `saiso heretic runtime set-provider <providerId>`
- `saiso heretic runtime set-model <model>`
- `saiso heretic runtime set-profile <profileId>`
- `saiso heretic runtime set-stream <true|false>`
- `saiso heretic chat transport list`
- `saiso heretic chat transport use <transportId> --identity <transportIdentity>`
- `saiso heretic chat relay <message> --channel-id <channelId> --transport-identity <identity>`
- `saiso heretic chat ingest --transport <transportId> --payload-json <json> --transport-identity <identity>`
- `saiso heretic goal start <objective>`
- `saiso heretic goal status <id>`
- `saiso heretic goal list`
- `saiso heretic goal stop <id>`
- `saiso heretic alert add --asset <asset> --rule <rule>`
- `saiso heretic alert list`
- `saiso heretic alert remove <id>`
- `saiso heretic alert pause <id>`
- `saiso heretic alert resume <id>`
- `saiso heretic alert check <id> --price <value>`
- `saiso heretic alert worker --prices-file <path> --interval <ms> --cycles <n>`
- `saiso heretic doctor`

## Policy Strict Mode

Strict mode precedence:

1. command flags (`--policy-strict` / `--policy-lax`)
2. `.saiso/heretic/integration.json` -> `policy.strict`
3. `SAISO_HERETIC_POLICY_STRICT=true|false`
4. default `false`

## Notes

- Correlation keys include transport identity: `<transport>:<transportIdentity>:<channelId>:<messageId>`.
- Unresolved transport records are tombstoned after unresolved TTL to prevent duplicate turn creation.
- State writes are guarded by lock + revision envelopes.
