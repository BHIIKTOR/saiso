# Heretic SAISO Plugin Plan v1.1 (Split Architecture)

## 1) Goal

1. Deliver a Heretic integration surface on top of SAISO's plugin host that provides a seamless operator flow to:
   1. connect to a local `heretic-daemon`
   2. bind a workspace directory as Heretic project/session context
   3. configure provider/model/runtime profiles
   4. use chat transports in a universal, selectable way (Telegram included as a transport adapter, not a hardcoded special case)
   5. enable semi-autonomous goal and alert flows through provider+model conversation
2. Keep SAISO core scope clean:
   1. SAISO plugin host owns generic plugin lifecycle and safety gates
   2. `heretic-saiso` owns Heretic-specific operator UX and command surface
   3. long-running workers live outside plugin bootstrap in a dedicated runtime package
   4. protocol bridge ownership is explicit and versioned
   5. Heretic daemon remains sole runtime authority for sessions/projects/orchestration
3. Preserve and reuse current work in `packages/heretic-saiso`:
   1. keep current command surface and state model as baseline
   2. patch drift by moving runtime and worker responsibilities out of the plugin package
   3. avoid rewriting proven flows unless boundary correction is required

## 2) Why This Lane Exists

1. We want merge-level UX across Heretic + SAISO + ElizaOS-style transport ergonomics without forcing SAISO core to own Heretic runtime orchestration.
2. `spec/saiso-plugins-sdk` is implemented in parallel, so this lane needs low host-coupling and clear seams.
3. A split architecture reduces drift and improves developer experience:
   1. plugin/control-plane package for command UX and config
   2. runtime package for long-running loops and supervision
   3. protocol-client package for contract-safe daemon communication

## 3) Scope (v1)

1. Package split plan and migration for:
   1. `packages/heretic-saiso` (plugin/control-plane)
   2. `packages/heretic-saiso-runtime` (workers/supervisor)
   3. `packages/heretic-saiso-protocol-client` (typed daemon bridge)
2. Daemon connection management (attach/connect + optional local process lifecycle wrapper; no daemon runtime duplication).
3. Workspace/project/session bootstrap flows against Heretic protocol operations.
4. Runtime provider/model/profile setup flows.
5. Chat transport bridge using SAISO transport abstraction; Telegram selectable via transport config.
6. Goal-runner and alert-scheduler integration paths with runtime worker ownership.
7. SAISO plugin adapter registration and command surface for all above.
8. Deterministic local state, explicit diagnostics, and recovery/doctor commands.
9. Developer-experience hardening with package scripts, local runbook, and migration checklist.

## 4) Out of Scope (v1)

1. Re-implementing Heretic runtime internals inside SAISO.
2. Bypassing Heretic daemon ownership of session/project/prompt/tool orchestration.
3. Forcing Telegram-only transport semantics.
4. Fully autonomous trading without operator approval and policy guardrails.
5. Multi-tenant orchestration control plane.
6. Custom fork of SAISO plugin host internals.
7. Hard sandboxing and signature PKI for plugin trust beyond current SAISO plugin model.

## 5) Ownership and Boundary Contract

1. SAISO plugin host (`saiso-plugins-sdk` lane) owns:
   1. plugin manifest compatibility, install, enable, disable, and load order
   2. lockfile authority and integrity gates
   3. plugin context API and command collision policy
2. `heretic-saiso` package (plugin/control-plane) owns:
   1. Heretic integration commands and config model
   2. workspace/session/provider/model setup orchestration
   3. transport profile selection and command-level transport controls
   4. goal and alert command APIs and operator workflows
   5. doctor and reconciliation entrypoints
3. `heretic-saiso-runtime` package owns:
   1. long-running transport relay loops
   2. alert scheduler workers
   3. retry, idempotency, and liveness supervision
   4. runtime loop health signals consumed by plugin doctor
4. `heretic-saiso-protocol-client` package owns:
   1. Heretic wire/client API consumed by plugin and runtime packages
   2. request/result/event typing and compatibility checks
   3. fallback compatibility layer when upstream `@heretic/protocol` is unavailable
5. Heretic daemon owns:
   1. runtime truth for sessions/projects/messages/context/tool loop
   2. provider/model execution
   3. orchestration and persistence
6. Boundary rule:
   1. plugin package must never become a hidden worker runtime
   2. runtime package must never duplicate daemon orchestration policy
   3. protocol-client package must remain transport and contract focused and stateless

### 5.1 Packaging and Distribution Contract (Frozen for v1)

1. Package names are frozen:
   1. `@saiso/heretic-saiso` (plugin/control-plane)
   2. `@saiso/heretic-saiso-runtime` (worker/supervisor)
   3. `@saiso/heretic-saiso-protocol-client` (protocol bridge)
2. Plugin ID is frozen:
   1. plugin id value: `heretic-saiso`
   2. this id is immutable for v1 and is used for manifest identity, config roots, and compatibility fixtures
3. Plugin manifest ownership is frozen:
   1. plugin manifest file lives in `packages/heretic-saiso/saiso-plugin.json`
   2. only `@saiso/heretic-saiso` is installed through `saiso plugin add`
4. Publish order is frozen:
   1. publish `@saiso/heretic-saiso-protocol-client`
   2. publish `@saiso/heretic-saiso-runtime`
   3. publish `@saiso/heretic-saiso`
5. Version coupling policy is frozen:
   1. all three packages ship in lockstep `major.minor`
   2. patch versions may differ only for emergency fixes and must preserve API compatibility
   3. plugin package pins runtime/protocol-client as exact workspace version during RC phase
   4. post-RC dependency policy is frozen:
      1. plugin package may use `~major.minor.0` for runtime/protocol-client within same `major.minor`
      2. startup compatibility check must enforce supported version window and fail closed on skew
6. P7 release gate is blocked unless:
   1. package names, publish order, and version policy are encoded in release scripts
   2. plugin install flow succeeds from clean environment with lockfile integrity checks

### 5.2 Deterministic Error Registry Contract

1. All deterministic error codes are centralized in one versioned registry source:
   1. canonical source path: `packages/heretic-saiso-protocol-client/src/contracts/error-codes.ts`
   2. plugin/runtime packages import from this source and must not define conflicting codes
2. Registry categories are frozen:
   1. state (`HERETIC_STATE_*`)
   2. transport (`HERETIC_TRANSPORT_*`)
   3. policy (`HERETIC_POLICY_*`)
   4. runtime worker (`HERETIC_WORKER_*`)
   5. protocol handshake (`HERETIC_PROTOCOL_*`)
3. Error-code lifecycle policy:
   1. codes are append-only in v1
   2. changing code meaning requires new code and deprecation note
   3. removed codes are forbidden until next major version

### 5.3 Canonical Error Code Matrix (Frozen for v1)

1. State category:
   1. `HERETIC_STATE_CONFLICT`: optimistic revision mismatch after retry budget
   2. `HERETIC_STATE_LOCK_TIMEOUT`: lock acquisition exceeded timeout
   3. `HERETIC_STATE_STALE_LOCK`: stale lock cannot be safely reclaimed
   4. `HERETIC_STATE_HISTORY_COMPACTION_FAILED`: history compaction failed and state was preserved
   5. `HERETIC_STATE_SCHEMA_UNSUPPORTED`: state file schema version is unknown and no migrator is available
   6. `HERETIC_STATE_PARSE_INVALID`: state file contains malformed JSON and cannot be parsed
   7. `HERETIC_STATE_SCHEMA_INVALID`: state file parsed successfully but payload violates frozen schema
2. Runtime-worker category:
   1. `HERETIC_WORKER_STALE_LEASE`: worker lease cannot be safely reclaimed
   2. `HERETIC_WORKER_PLATFORM_UNSUPPORTED`: runtime-worker invoked on unsupported platform
3. Project-root resolution category:
   1. `HERETIC_PROJECT_ROOT_REQUIRED`: no project root could be resolved
   2. `HERETIC_PROJECT_ROOT_AMBIGUOUS`: multiple equal-precedence roots were resolved
   3. `HERETIC_PROJECT_MAP_UNREADABLE`: `workspace-map.json` exists but is unreadable or malformed during root resolution
4. Protocol category:
   1. `HERETIC_PROTOCOL_INCOMPATIBLE`: daemon protocol is outside supported range
   2. `HERETIC_PROTOCOL_CAPABILITY_MISSING`: required capability or method is missing
   3. `HERETIC_PROTOCOL_HANDSHAKE_TIMEOUT`: handshake exceeded timeout budget
   4. `HERETIC_DEPENDENCY_SKEW_UNSUPPORTED`: plugin/runtime/protocol-client versions violate supported compatibility window
5. Transport and policy category:
   1. `HERETIC_TRANSPORT_IDENTITY_REQUIRED`: selected transport cannot provide required identity
   2. `HERETIC_POLICY_DENIED`: policy denied side-effecting action

## 6) Key Constraints from Current Reality

1. Heretic is not fixed to `~/.heretic`; runtime paths are environment and flag configurable.
2. Integration must honor configurable path inputs (for example `HERETIC_CONFIG_DIR`, `HERETIC_CONFIG_PATH`, `HERETIC_DB_PATH`, `AGENTS_CWD`, `TOOLS_CWD`) and never assume a single default.
3. Provider/model setup should use daemon runtime operations (`runtime.set_profile`, `runtime.set_provider`, `runtime.set_model`) instead of local SAISO shadow state.
4. Project/session setup should use daemon project/session operations (`project.register`, `project.focus`, `project.create_session`, `session.create`, `session.set_cwd`).
5. Transport UX should stay universal and selector-driven and leverage SAISO chat transport abstraction with Telegram as one adapter.
6. Current `packages/heretic-saiso` already includes command and state primitives; migration should be incremental instead of greenfield rewrite.

## 7) Target Operator UX (v1)

1. Install and enable plugin:
   1. `saiso plugin add <heretic-saiso-package>`
   2. `saiso plugin enable <plugin-id>`
2. Initialize Heretic integration in a project:
   1. `saiso heretic init --daemon-path ./heretic-daemon --config-dir <dir>`
   2. validates daemon reachability and records integration profile
3. Bind workspace to Heretic project/session:
   1. `saiso heretic workspace attach --project-root <dir>`
   2. creates or focuses project and session in daemon and stores mapping metadata
4. Configure model runtime:
   1. `saiso heretic runtime catalog`
   2. `saiso heretic runtime set-provider <provider>`
   3. `saiso heretic runtime set-model <model>`
   4. optional `saiso heretic runtime set-profile <profile>`
5. Configure chat transport:
   1. `saiso heretic chat transport list`
   2. `saiso heretic chat transport use telegram`
   3. `saiso heretic chat transport use <other-registered-transport>`
6. Run semi-autonomous flows:
   1. `saiso heretic goal start "<objective>"`
   2. `saiso heretic goal status`
   3. `saiso heretic alert add --asset <symbol> --rule <rule> --interval <dur>`
   4. `saiso heretic alert list`
7. Operate runtime workers:
   1. `saiso heretic runtime-worker start [--project-root <dir>]`
   2. `saiso heretic runtime-worker status [--project-root <dir>]`
   3. `saiso heretic runtime-worker stop [--project-root <dir>]`
8. Troubleshoot:
   1. `saiso heretic doctor`
   2. deterministic diagnostic output and next-action guidance

## 8) Architecture (Low Drift by Design)

### 8.1 Package Layout

1. `packages/heretic-saiso/`:
   1. plugin and control-plane package
   2. owns command registration and operator-facing workflows
   3. depends on runtime and protocol-client packages through explicit interfaces
2. `packages/heretic-saiso-runtime/`:
   1. worker and supervisor package
   2. owns transport relay loops and alert scheduler execution
   3. exposes start, stop, and status APIs and CLI runner entrypoints
3. `packages/heretic-saiso-protocol-client/`:
   1. protocol bridge package
   2. owns wire envelope handling, typed request helpers, and compatibility checks
4. Shared conventions:
   1. project state root remains `<project>/.saiso/heretic/`
   2. all packages consume the same error taxonomy and state envelope contracts
   3. plugin package stays testable without live worker loops

### 8.2 Thin Adapter Rule

1. Command and business logic must not live in plugin registration code.
2. SAISO plugin API drift should impact only plugin wiring and command bootstrap.
3. Worker-loop drift should be isolated to `heretic-saiso-runtime`.
4. Protocol drift should be isolated to `heretic-saiso-protocol-client`.
5. This keeps integration progress stable while plugin host lane is finalized.

### 8.3 State Files

1. Project-scoped state under `<project>/.saiso/heretic/`.
2. Files:
   1. `integration.json` (daemon path and config profile, selected transport, defaults)
   2. `workspace-map.json` (workspace root to Heretic project/session references)
   3. `goals.json` (goal runner metadata envelope)
   4. `alerts.json` (alert scheduler metadata envelope)
   5. `transport-index.json` (transport correlation and replay metadata)
3. Writes are atomic and deterministic.

### 8.4 State Concurrency Contract

1. Every state file uses an envelope: `{ schemaVersion, revision, updatedAt, data }`.
2. All read-modify-write operations are optimistic:
   1. caller reads current `revision`
   2. write succeeds only if revision matches expected value
   3. mismatch fails with deterministic `HERETIC_STATE_CONFLICT` and requires retry
3. Multi-file mutations require a project-local lock file `<project>/.saiso/heretic/.state.lock`.
4. Lock acquisition is bounded with timeout and stale-lock recovery metadata (`holderHost`, `pid`, `processStartTime`, `createdAt`).
5. If process crashes mid-write, startup doctor detects orphan temp files and recovers from last known-good atomic commit.
6. Lock defaults are frozen for v1:
   1. lock timeout: `5000ms`
   2. retry backoff: exponential from `50ms` to `400ms` with jitter `+/-20%`
   3. stale lock TTL: `30000ms`
   4. optimistic write retries after conflict: `3`
7. Deterministic lock errors are frozen:
   1. lock timeout -> `HERETIC_STATE_LOCK_TIMEOUT`
   2. stale lock cannot be safely recovered -> `HERETIC_STATE_STALE_LOCK`
   3. optimistic revision mismatch after retry budget -> `HERETIC_STATE_CONFLICT`

### 8.5 Runtime Worker Lifecycle Contract (Frozen for v1)

1. Worker scope is per-project singleton:
   1. exactly one active runtime worker per `<project>/.saiso/heretic`
   2. concurrent `start` commands for same project are idempotent and return existing worker status
2. Process model:
   1. default mode for `runtime-worker start` is detached background child process
   2. explicit `--foreground` mode runs in current terminal for debugging
3. Identity and lease files:
   1. PID file: `<project>/.saiso/heretic/runtime-worker.pid`
   2. lease file: `<project>/.saiso/heretic/runtime-worker.lease.json`
   3. lease includes `holderHost`, `pid`, `processStartTime`, `startedAt`, `version`, `projectRoot`
4. Signal and shutdown behavior:
   1. on POSIX hosts, `runtime-worker stop` sends `SIGTERM`, waits `8000ms`, then escalates to `SIGKILL` if still alive
   2. on Windows hosts, `runtime-worker stop` sends cooperative shutdown over worker IPC, waits `8000ms`, then escalates with process-tree force kill
   3. graceful shutdown flushes in-flight state and updates lease status before exit
   4. worker handles `SIGINT` and `SIGTERM` identically on POSIX and handles IPC shutdown identically on Windows
5. Restart and orphan cleanup:
   1. startup checks PID and lease consistency before acquiring singleton ownership
   2. stale PID or orphan lease is reclaimed only after stale checks pass
   3. unsafe reclaim path returns `HERETIC_WORKER_STALE_LEASE` and requires operator action
6. Status contract:
   1. `runtime-worker status` returns `running|stopped|degraded|unknown`
   2. response includes pid, uptime, lastHeartbeatAt, activeTransport, and pendingAlertCount
7. Platform scope and fail-closed behavior:
   1. supported runtime-worker platforms for v1 are Linux, macOS, and Windows
   2. unsupported platforms fail with deterministic `HERETIC_WORKER_PLATFORM_UNSUPPORTED`

### 8.6 Runtime-Worker Project Root Resolution Contract (Frozen for v1)

1. `runtime-worker` commands are project-scoped and must resolve exactly one project root.
2. Resolution precedence is frozen:
   1. explicit `--project-root <dir>` flag
   2. nearest ancestor of current working directory containing `.saiso/heretic/integration.json`
   3. nearest workspace mapping match from `workspace-map.json` using canonicalized real path ancestry
3. `workspace-map.json` read behavior is deterministic:
   1. if precedence step 3 is needed and `workspace-map.json` is unreadable or malformed, fail with `HERETIC_PROJECT_MAP_UNREADABLE`
   2. if precedence step 2 already resolved a root, unreadable `workspace-map.json` is non-blocking and reported as a doctor warning
4. If resolution yields no project root, command fails with `HERETIC_PROJECT_ROOT_REQUIRED`.
5. If resolution yields conflicting candidates at same precedence, command fails with `HERETIC_PROJECT_ROOT_AMBIGUOUS`.
6. Nested directory behavior is deterministic:
   1. nearest ancestor wins
   2. symlinked paths are resolved to canonical real paths before comparison
7. `start|status|stop` must print resolved project root in human output and include `projectRoot` in JSON output.

### 8.7 Frozen State Schemas (v1)

1. Common envelope schema for all state files is frozen:
   1. `schemaVersion: string` (required)
   2. `revision: integer >= 0` (required)
   3. `updatedAt: ISO-8601 string` (required)
   4. `data: object` (required)
2. `integration.json` data schema is frozen:
   1. `daemon.path: string` (required)
   2. `daemon.configDir: string` (optional)
   3. `runtimeDefaults.provider: string` (optional)
   4. `runtimeDefaults.model: string` (optional)
   5. `runtimeDefaults.profile: string` (optional)
   6. `runtimeDefaults.stream: boolean` (optional)
   7. `transport.selected: string` (required; default value is `none` at init)
   8. `transport.identity: string` (optional; required only when selected transport is enabled and identity cannot be discovered from adapter runtime)
   9. `policy.strict: boolean` (required)
   10. bootstrap and migration defaults are frozen:
      1. `saiso heretic init` must write `transport.selected = "none"` and `policy.strict = false`
      2. legacy files missing `policy.strict` are read as `false` and rewritten with explicit `policy.strict = false` on next successful write
   11. validation rule is frozen:
      1. if `transport.selected != "none"` and runtime adapter discovery is unavailable, missing `transport.identity` must fail validation with `HERETIC_TRANSPORT_IDENTITY_REQUIRED`
3. `workspace-map.json` data schema is frozen:
   1. `workspaces: Record<string, WorkspaceBinding>` (required)
   2. `WorkspaceBinding.projectRoot: string` (required)
   3. `WorkspaceBinding.projectId: string` (required)
   4. `WorkspaceBinding.sessionId: string` (required)
   5. `WorkspaceBinding.attachedAt: ISO-8601 string` (required)
4. `goals.json` data schema is frozen:
   1. `goals: Record<string, GoalRecord>` (required)
   2. `history: GoalEvent[]` (required)
   3. `GoalRecord.status: pending|running|paused|completed|failed|cancelled` (required)
   4. `GoalRecord.objective: string` (required)
   5. `GoalRecord.updatedAt: ISO-8601 string` (required)
5. `GoalEvent` schema is frozen:
   1. `eventId: string` (required)
   2. `goalId: string` (required)
   3. `at: ISO-8601 string` (required)
   4. `type: created|started|progress|approval_required|paused|resumed|completed|failed|cancelled|policy_denied` (required)
   5. `actor: operator|runtime|daemon` (required)
   6. `summary: string` (required)
   7. `metadata: Record<string, string|number|boolean|null>` (optional)
6. `alerts.json` data schema is frozen:
   1. `alerts: Record<string, AlertRecord>` (required)
   2. `history: AlertEvent[]` (required)
   3. `AlertRecord.status: active|paused|triggered|disabled` (required)
   4. `AlertRecord.rule: AlertRule` (required)
   5. `AlertRecord.updatedAt: ISO-8601 string` (required)
7. `AlertRule` schema is frozen:
   1. `asset: string` (required)
   2. `operator: gt|gte|lt|lte|crosses_up|crosses_down|pct_change_up|pct_change_down` (required)
   3. `targetValue: number` (required)
   4. `intervalMs: integer >= 1000` (required)
   5. `cooldownMs: integer >= 0` (required)
   6. `windowMs: integer >= 1000` (optional; required for pct-change operators)
   7. `source: string` (optional)
8. `AlertEvent` schema is frozen:
   1. `eventId: string` (required)
   2. `alertId: string` (required)
   3. `at: ISO-8601 string` (required)
   4. `type: created|updated|triggered|delivery_succeeded|delivery_failed|paused|resumed|removed|policy_denied` (required)
   5. `actor: operator|runtime|daemon` (required)
   6. `summary: string` (required)
   7. `metadata: Record<string, string|number|boolean|null>` (optional)
9. `transport-index.json` data schema is frozen:
   1. `entries: Record<string, TransportEntry>` (required)
   2. `tombstones: Record<string, TransportTombstone>` (required)
   3. `TransportEntry.clientRequestId: string` (required)
   4. `TransportEntry.turnId: string` (optional)
   5. `TransportEntry.status: pending|submitted|completed|failed|needs_operator_review` (required)
10. Canonical schemaVersion values and migrators are frozen:
   1. `integration.json -> integration.v1` (`migrateIntegrationState`)
   2. `workspace-map.json -> workspace-map.v1` (`migrateWorkspaceMapState`)
   3. `goals.json -> goals.v1` (`migrateGoalsState`)
   4. `alerts.json -> alerts.v1` (`migrateAlertsState`)
   5. `transport-index.json -> transport-index.v1` (`migrateTransportIndexState`)
11. Schema policy:
   1. these schemas are authoritative for v1 and must be encoded as JSON schemas in code
   2. additions require schema version bump and migration notes
   3. destructive key/type changes require major version bump

## 9) Heretic Integration Contract

1. Runtime methods used by integration flows:
   1. setup: `project.register`, `project.focus`, `project.create_session`, `session.create`, `session.set_cwd`
   2. runtime config: `runtime.set_profile`, `runtime.set_provider`, `runtime.set_model`, `runtime.set_stream`
   3. capability discovery: `query.model_catalog`, `query.reference_bundle`
   4. interaction path: `turn.submit`, `turn.continue`
2. No direct imports from Heretic daemon internals.
3. No SAISO-local shadow orchestration of tool loops or prompt assembly.
4. `daemonPath` handling rules:
   1. plugin validates and records daemon target profile
   2. runtime package can use the profile to attach, and optionally start local daemon in explicit operator mode
   3. daemon lifecycle ownership stays explicit and observable, never implicit side effects

### 9.1 Runtime Protocol Handshake and Compatibility Policy

1. Every new runtime connection performs deterministic handshake before normal operations.
2. Handshake steps are frozen:
   1. transport connect and hello exchange
   2. protocol capability read (`protocolVersion`, `capabilitiesVersion`, and required method availability)
   3. compatibility evaluation against client-supported range
3. Handshake fallback rule:
   1. if capability fields are unavailable, client executes a minimal required-method probe set
   2. probe failures are treated as incompatible runtime
4. Failure policy is fail-closed:
   1. incompatible runtime -> `HERETIC_PROTOCOL_INCOMPATIBLE`
   2. missing required capabilities -> `HERETIC_PROTOCOL_CAPABILITY_MISSING`
   3. handshake timeout -> `HERETIC_PROTOCOL_HANDSHAKE_TIMEOUT`
5. Worker start and command operations that depend on daemon communication are blocked until handshake success.

### 9.2 Required Method Set Contract (Frozen for v1)

1. Required method set ID is frozen: `heretic-saiso-required-methods-v1`.
2. Required method probe set for handshake fallback is frozen:
   1. `project.register`
   2. `project.focus`
   3. `project.create_session`
   4. `session.create`
   5. `session.set_cwd`
   6. `runtime.set_profile`
   7. `runtime.set_provider`
   8. `runtime.set_model`
   9. `query.model_catalog`
   10. `query.reference_bundle`
   11. `runtime.set_stream`
   12. `turn.submit`
   13. `turn.continue`
3. Method-set versioning policy:
   1. adding required methods requires new method-set ID and minor version bump
   2. removing or changing required methods requires major version bump
   3. runtime and client must report negotiated method-set ID in diagnostics
4. Handshake succeeds only when runtime satisfies required method set for current plugin version.

## 10) Transport Model (ElizaOS-Aligned Direction)

1. Transport is a selectable adapter surface, not hardcoded to Telegram.
2. Integration uses SAISO chat registry and router and treats Telegram as one registered transport.
3. Transport selection is stored in integration profile and can be changed per project.
4. Bridge flow:
   1. inbound message from selected transport -> normalize envelope -> submit to Heretic turn
   2. daemon response -> outbound formatted response through same transport
5. Transport-specific auth and secrets are kept out of tracked files.

### 10.1 Correlation and Idempotency Contract

1. Inbound correlation key is canonical: `<transport>:<transportIdentity>:<channelId>:<messageId>`.
2. `transportIdentity` is required and maps to adapter account identity (for example Telegram bot id, webhook account id, or configured adapter instance id).
3. Identity source and bootstrap semantics are frozen:
   1. when `integration.transport.selected = "none"`, transport is not enabled and identity may be absent
   2. when transport is enabled, identity must resolve from `integration.transport.identity` or adapter discovery before processing inbound traffic
4. If adapter cannot provide identity, plugin rejects transport enablement with deterministic `HERETIC_TRANSPORT_IDENTITY_REQUIRED`.
5. Each inbound key maps to one Heretic request lineage:
   1. `clientRequestId` (plugin-generated deterministic request id)
   2. accepted `turnId` (when available from daemon)
6. Duplicate inbound keys never create a second turn; integration reuses stored lineage and returns cached terminal status when present.
7. Outbound deliveries use idempotency key `<transport>:<transportIdentity>:<channelId>:<turnId>:<phase>`.
8. Correlation index is persisted in `transport-index.json` with bounded pruning rules.

### 10.2 Replay and Reconnect Rules

1. On transport retry and reconnect, unresolved inbound keys are replayed only if no terminal turn outcome exists.
2. If daemon accepted a turn but transport acknowledgement failed, integration retries outbound delivery only and does not resubmit inbound content.
3. If both daemon and transport outcomes are unknown after timeout, state becomes `NEEDS_OPERATOR_REVIEW` and is surfaced by `saiso heretic doctor`.
4. Replay attempts are bounded and emit deterministic diagnostics for exhausted retries.
5. TTL pruning rules:
   1. terminal entries can be pruned after `terminalTtl` (default `7d`, min `1d`, max `30d`)
   2. unresolved entries are not hard-deleted on TTL and transition to tombstones with lineage metadata retained
   3. unresolved tombstone threshold `unresolvedTtl` defaults to `30d` (min `7d`, max `180d`)
   4. tombstones prevent duplicate turn creation after pruning windows
   5. tombstone retention `tombstoneTtl` defaults to `180d` (min `30d`, max `365d`)
   6. doctor surfaces unresolved tombstones older than `unresolvedTtl` as operator actions

## 11) Semi-Autonomous Goal and Alert Model (v1)

1. Goals:
   1. objective and constraints are defined in chat or CLI
   2. progress is managed by goal-runner state machine
   3. side-effecting steps remain approval and policy gated
2. Alerts:
   1. rule model includes asset selector, condition, interval, and cooldown
   2. scheduler runs deterministic polling and trigger evaluation
   3. dedupe, cooldown, and restart recovery semantics are deterministic
3. Execution model:
   1. plugin package creates and updates goal and alert intents
   2. runtime package executes loops and emits deterministic status events
4. Both flows must produce audit-friendly state and deterministic status output.

### 11.1 Policy and Approval Enforcement Contract

1. Policy source of truth is project-local SAISO policy files:
   1. `.saiso/payment-policy.json`
   2. `.saiso/trust-policy.json`
2. Policy resolution precedence is CLI flags, then policy files, then environment defaults.
3. Every side-effecting goal and alert action must execute `preflightPolicyCheck` before dispatch.
4. Policy decision outcomes are explicit:
   1. `allow`: proceed
   2. `require_approval`: create pending approval record and block execution until operator confirms
   3. `deny`: fail operation with deterministic `HERETIC_POLICY_DENIED`
5. Policy-check failures (invalid or missing policy in strict mode) fail closed with deterministic error and no side effects.
6. Approval and policy decisions are persisted in goal and alert event history for audit and replay safety.

### 11.2 Strict Mode Contract

1. Strict mode for policy presence and validity is controlled by:
   1. CLI flag: `--policy-strict`
   2. project config key: `.saiso/heretic/integration.json -> policy.strict`
   3. environment variable: `SAISO_HERETIC_POLICY_STRICT=true|false`
2. Precedence is CLI flag, then project config key, then environment variable, then default (`false`).
3. When strict mode is enabled:
   1. missing policy files are blocking errors
   2. invalid policy files are blocking errors
   3. side-effecting goal and alert execution is denied until policy state is valid
4. `saiso heretic doctor` must report strict-mode source (cli, config, env, or default) for debugging.

### 11.3 Goal and Alert History Retention and Compaction

1. History growth policy is frozen for `goals.json` and `alerts.json`.
2. Default retention windows:
   1. retain full event records for `90d`
   2. retain compact summaries for up to `365d`
3. Size caps:
   1. max `10000` raw events per file before compaction
   2. compaction runs on worker startup and every `24h` while running
4. Safety constraints:
   1. events tied to unresolved approvals, unresolved failures, or active goals and alerts are never compacted away
   2. compaction must preserve deterministic replay metadata and latest terminal status per entity
5. Doctor behavior:
   1. warns when history exceeds soft threshold before compaction
   2. emits deterministic `HERETIC_STATE_HISTORY_COMPACTION_FAILED` on compaction failure

## 12) Security and Trust Guardrails

1. Plugin remains disabled by default after install (host behavior).
2. Any automation action with side effects remains explicit and policy-aware.
3. No provider keys in repository files; environment-based secret usage only.
4. Path handling rejects traversal and unsafe writes outside project scope.
5. Clear warnings are emitted when daemon path or config profile is invalid or untrusted.

## 13) Detailed Implementation Phases

### P0) Contract Freeze and Decision Log (Blocking Gate)

1. Freeze package names and plugin ID.
2. Freeze command namespace root (`saiso heretic ...`).
3. Freeze split boundaries and ownership:
   1. plugin and control-plane in `heretic-saiso`
   2. long-running loops in `heretic-saiso-runtime`
   3. daemon bridge in `heretic-saiso-protocol-client`
4. Record protocol client strategy decision:
   1. Option A: consume published `@heretic/protocol`
   2. Option B: keep protocol-compatible bridge in `heretic-saiso-protocol-client`
5. Freeze state file schemas with version keys.
6. Freeze canonical per-file schemaVersion values and migrator mapping.
7. Freeze worker lifecycle model:
   1. per-project singleton scope
   2. pid and lease file contract
   3. stop and restart semantics
8. Freeze packaging and publish contract:
   1. package names
   2. publish order
   3. version coupling policy
   4. plugin id `heretic-saiso`
9. Freeze deterministic error registry path and append-only policy.
10. Freeze canonical error code matrix in Section 5.3.
11. Freeze backward-compatibility matrix scope (commands, flags, and JSON outputs).
12. Freeze performance measurement methodology for SLO checks.
13. P0 exit gate is mandatory before P1 merge:
   1. selected strategy documented with rationale and tradeoffs
   2. owner assigned
   3. deadline recorded
   4. compatibility test matrix approved
14. If P0 gate is not met, P1 and later implementation work is blocked except non-implementation spikes.

### P1) Package Split Scaffold and Compatibility Layer

1. Keep `packages/heretic-saiso` as existing baseline package.
2. Scaffold `packages/heretic-saiso-runtime` with build, typecheck, test, and dev scripts.
3. Scaffold `packages/heretic-saiso-protocol-client` with build, typecheck, test, and dev scripts.
4. Extract shared errors and state contracts into shared internal boundaries.
5. Add compatibility shims so current command surface continues to work during migration.

### P2) Protocol Client Extraction and Connector Consolidation

1. Move daemon wire and request logic from `heretic-saiso` into `heretic-saiso-protocol-client`.
2. Implement runtime handshake and capability negotiation contract.
3. Implement compatibility contract tests against local daemon.
4. Add handshake negative-path tests for incompatible versions and missing capabilities.
5. Preserve daemon discovery and attach config model (`daemon path`, env overrides, profile).
6. Keep existing workspace attach behavior stable:
   1. register or focus project
   2. create or focus session
   3. set session cwd from workspace root
7. Add doctor checks for daemon reachability and workspace mapping integrity.

### P3) Runtime Worker Extraction

1. Move alert worker loop and transport relay loop into `heretic-saiso-runtime`.
2. Expose `runtime-worker start`, `runtime-worker stop`, and `runtime-worker status` commands in plugin package.
3. Ensure runtime package consumes shared state locks and protocol-client contracts.
4. Add liveness heartbeat and crash-recovery reconciliation in doctor output.
5. Implement singleton lease ownership and duplicate-start prevention.
6. Implement pid and lease persistence and stale-lease recovery rules.
7. Implement stop semantics per lifecycle contract:
   1. POSIX: `SIGTERM` then bounded `SIGKILL`
   2. Windows: cooperative IPC shutdown then bounded force kill
8. Implement deterministic status payloads.

### P4) Provider and Model Configuration Hardening

1. Preserve and harden catalog and read operations.
2. Preserve and harden provider, model, and profile set commands and state reconciliation.
3. Add idempotent update behavior and deterministic CLI output in human and JSON modes.
4. Ensure plugin package stores only operator defaults while daemon remains runtime truth.

### P5) Chat Transport Bridge (Universal and Selectable)

1. Keep transport selection command set in plugin package.
2. Wire selected transport to runtime package worker entrypoints.
3. Start with Telegram plus one second transport to validate universal adapter behavior.
4. Add conformance tests for normalize, send, retry, and error mapping behavior.
5. Enforce account-aware correlation keys and replay and tombstone semantics.

### P6) Goal and Alert Flows

1. Keep goal lifecycle commands (`start`, `status`, `stop`) in plugin package.
2. Keep alert lifecycle commands (`add`, `list`, `remove`, `pause`, `resume`) in plugin package.
3. Execute polling and trigger loops in runtime package.
4. Add reliability tests for dedupe, cooldown, and restart hydrate and recovery.

### P7) SAISO Plugin Adapter and Command Registration

1. Implement plugin manifest and entrypoint aligned with SAISO plugin SDK.
2. Register `saiso heretic` command tree with collision-safe names and aliases.
3. Bind plugin context (`paths`, `logger`, `config`, `fs`, `env`) to package adapters.
4. Add plugin doctor output with deterministic error codes.
5. Add command compatibility snapshot gates for pre-split and post-split command outputs.

### P8) Hardening, Drift Pass, and DX Finish

1. Cross-check against `spec/saiso-plugins-sdk/README.md` final frozen contract.
2. Validate command and config behavior against real daemon scenarios.
3. Publish package-level runbook:
   1. run plugin-only commands without workers
   2. run runtime worker locally with deterministic state paths
   3. run integration smoke end-to-end
4. Document migration notes for any API or name changes.

## 14) Gaps and Risk Controls

1. Gap: plugin host contract may drift while this lane is in progress.
   1. Control: keep thin adapter seam and avoid deep host coupling until host freeze.
2. Gap: `@heretic/protocol` availability and versioning may drift.
   1. Control: explicit P0 decision log and compatibility matrix with fallback strategy.
3. Gap: transport complexity can sprawl into transport-specific hacks.
   1. Control: enforce transport registry contract and shared normalized envelope.
4. Gap: autonomous flows can bypass safety.
   1. Control: approval and policy gates remain mandatory for side-effecting operations.
5. Gap: state drift between plugin-local files and daemon runtime.
   1. Control: startup reconciliation, doctor checks, and deterministic conflict reporting.
6. Gap: package split can degrade developer ergonomics.
   1. Control: shared scripts, explicit runbook, and staged migration checklist with compatibility shims.
7. Gap: split may create duplicate logic if extraction is ad hoc.
   1. Control: move code instead of rewriting and enforce shim expiry milestones.

## 15) Acceptance Criteria

1. Operator can initialize Heretic integration in a SAISO project without manual file edits.
2. Workspace attach deterministically creates or focuses daemon project and session and sets cwd.
3. Provider, model, and profile can be listed and set via plugin commands and are reflected by daemon runtime state.
4. Transport is selectable and Telegram works as one adapter without hardcoded runtime branching.
5. Transport correlation and replay behavior is deterministic and avoids duplicate turn creation on retries and reconnects.
6. Goal and alert commands enforce policy and approval contract and fail closed on policy errors.
7. State writes are concurrency-safe (revision checks plus lock discipline) and recover cleanly after crash.
8. Plugin command namespace does not collide with base SAISO commands.
9. Plugin behavior remains deterministic across restart with project-scoped state.
10. No SAISO core runtime ownership drift and no Heretic daemon behavior duplication.
11. Existing `saiso heretic` commands remain backward compatible during migration.
12. Worker loops run from `heretic-saiso-runtime`, not plugin bootstrap.
13. Protocol request and response handling is owned by `heretic-saiso-protocol-client`.
14. End-to-end local development is documented and runnable with one command per package.
15. Worker lifecycle behavior is deterministic and contract-compliant:
   1. per-project singleton enforcement
   2. pid and lease file behavior
   3. stop and restart semantics
16. Packaging and release flow is deterministic:
   1. package names and publish order match frozen contract
   2. plugin installation resolves runtime/protocol-client dependencies without manual steps
17. Backward compatibility snapshot matrix passes for frozen command and JSON output set.
18. Runtime handshake blocks incompatible daemon versions with deterministic protocol error codes.
19. Frozen state schemas for all five state files pass schema validation and migration checks.
20. Runtime-worker project-root resolution is deterministic for nested paths and explicit overrides.
21. `integration.json` bootstrap defaults are deterministic (`transport.selected = "none"`, `policy.strict = false`).
22. `GoalEvent`, `AlertEvent`, and `AlertRule` payloads conform to frozen schemas.
23. Canonical error code matrix in Section 5.3 is implemented without cross-package drift.

## 16) Validation Plan (v1)

1. Typecheck:
   1. `npx tsc -p packages/heretic-saiso/tsconfig.json`
   2. `npx tsc -p packages/heretic-saiso-runtime/tsconfig.json`
   3. `npx tsc -p packages/heretic-saiso-protocol-client/tsconfig.json`
2. Unit tests:
   1. `bun test packages/heretic-saiso/tests`
   2. `bun test packages/heretic-saiso-runtime/tests`
   3. `bun test packages/heretic-saiso-protocol-client/tests`
3. Plugin host compatibility checks:
   1. plugin add, enable, list, disable, remove lifecycle tests
   2. startup load, collision, and doctor flows
   3. command compatibility smoke across pre-split and post-split behavior
   4. plugin install and load from clean environment using published package graph order
4. Integration smoke:
   1. local daemon attach
   2. workspace bind
   3. runtime set provider and model
   4. selected transport message round-trip
   5. goal and alert lifecycle
   6. runtime-worker start, stop, and status lifecycle
   7. runtime-worker scope resolution from nested path and explicit `--project-root` override
5. Failure-injection integration tests:
   1. daemon disconnect after turn accept and before final response
   2. transport outage with outbound retry and idempotency validation
   3. duplicate inbound delivery replay with no duplicate turn creation
   4. stale or malformed `workspace-map.json` reconciliation on startup
   5. partial-write crash recovery for `.saiso/heretic/*.json`
   6. duplicate alert trigger suppression across restart boundaries
   7. duplicate `runtime-worker start` race for same project produces single worker ownership
   8. stale pid and orphan lease recovery follows lifecycle contract and emits deterministic errors
6. Policy and approval tests:
   1. allow path executes
   2. require-approval path blocks until explicit operator confirmation
   3. deny path emits `HERETIC_POLICY_DENIED` and performs no side effects
   4. strict-mode missing or invalid policy fails closed
7. Concurrency and contention tests:
   1. parallel inbound messages for same correlation key produce exactly one turn and one lineage record
   2. parallel inbound messages for different keys avoid lock starvation and persist valid independent records
   3. lock contention on multi-file mutation surfaces deterministic `HERETIC_STATE_CONFLICT` or lock-timeout error without partial logical state
8. Protocol handshake tests:
   1. compatible daemon handshake passes and records negotiated capability metadata
   2. unsupported protocol version fails with `HERETIC_PROTOCOL_INCOMPATIBLE`
   3. missing required capabilities fails with `HERETIC_PROTOCOL_CAPABILITY_MISSING`
   4. handshake timeout fails with `HERETIC_PROTOCOL_HANDSHAKE_TIMEOUT`
9. Backward compatibility snapshot matrix:
   1. freeze and verify command text output fixtures for top-level `saiso heretic` commands
   2. freeze and verify JSON output schema snapshots for commands with `--json`
   3. enforce deprecation window of one minor release for changed flags or fields
10. State schema conformance tests:
   1. validate `integration.json`, `workspace-map.json`, `goals.json`, `alerts.json`, and `transport-index.json` against frozen JSON schemas
   2. migration tests prove unsupported schema versions fail closed with deterministic `HERETIC_STATE_SCHEMA_UNSUPPORTED`
   3. bootstrap tests prove `saiso heretic init` writes `transport.selected = "none"` and `policy.strict = false`
   4. migration tests prove missing `policy.strict` is read as false and rewritten on next successful write
11. Error matrix conformance tests:
   1. each canonical error code in Section 5.3 has at least one deterministic trigger test
   2. error code/category mapping remains stable across plugin/runtime/protocol-client packages
12. Invalid state payload tests:
   1. malformed JSON in any state file fails with `HERETIC_STATE_PARSE_INVALID`
   2. schema-invalid payload with supported schemaVersion fails with `HERETIC_STATE_SCHEMA_INVALID`
13. Project-root resolution error-path tests:
   1. unreadable or malformed `workspace-map.json` in precedence step 3 fails with `HERETIC_PROJECT_MAP_UNREADABLE`
14. Dependency skew tests:
   1. post-RC version skew outside supported window fails with `HERETIC_DEPENDENCY_SKEW_UNSUPPORTED`

## 17) Performance and SLO Targets (v1)

1. CLI command responsiveness:
   1. `saiso heretic runtime catalog` p95 <= 1500 ms in local daemon healthy state
   2. `saiso heretic workspace attach` p95 <= 2500 ms excluding first daemon cold start
2. Transport bridge latency:
   1. inbound normalized message to daemon submit start p95 <= 300 ms
   2. completed daemon response to outbound delivery attempt start p95 <= 300 ms
3. Alert scheduler timeliness:
   1. eligible alert trigger emitted within polling interval plus 2 seconds under healthy transport and daemon
4. Reliability budgets:
   1. outbound retry budget defaults to 3 attempts with bounded backoff
   2. unresolved correlation entries older than TTL are surfaced by doctor with explicit remediation hints

### 17.1 SLO Measurement Contract

1. Measurement environment defaults:
   1. local daemon on loopback
   2. no network shaping
   3. machine profile captured in artifact metadata
2. Sampling policy:
   1. run `5` suites per scenario
   2. each suite executes at least `30` samples
   3. report median-of-runs p95 for gate decisions
3. Warm and cold definitions:
   1. cold run is first execution after worker and daemon start
   2. warm run excludes first execution and uses established session state
4. Gate policy:
   1. p95 regressions over `10%` vs baseline require implementation revision
   2. p95 regressions over `15%` are blocking by default unless explicitly approved
5. Artifacts:
   1. write measurements under `artifacts/heretic-saiso-slo/`
   2. include command, sample count, environment profile, and warm/cold labels
6. Baseline ownership and update policy:
   1. canonical baseline file is `spec/heretic-saiso-plugin/baselines/slo-baseline.json`
   2. baseline updates require:
      1. attached measurement artifacts for before and after
      2. explicit rationale in change notes
      3. approval by one Heretic-SAISO maintainer
   3. baseline updates without the above are blocking and must not be merged

## 18) Deliverables

1. `spec/heretic-saiso-plugin/README.md` (this plan).
2. `packages/heretic-saiso` package (plugin and control-plane).
3. `packages/heretic-saiso-runtime` package (workers and supervisor).
4. `packages/heretic-saiso-protocol-client` package (daemon bridge).
5. Command surface under `saiso heretic ...` with backward-compatible migration behavior.
6. Tests and docs for daemon bootstrap, runtime setup, transport selection, and goal and alert operations.
7. Migration checklist with status tracking.

## 19) Migration Checklist (Package Split)

1. Pre-migration freeze:
   1. lock command contract and fixture snapshots for current `saiso heretic` commands
   2. tag extraction boundaries in current code with TODO markers and owner
2. Extract protocol client:
   1. move daemon request and response envelope code to `heretic-saiso-protocol-client`
   2. expose stable client API consumed by plugin and runtime packages
   3. add contract tests against a local daemon
3. Extract runtime workers:
   1. move alert polling and trigger loops to `heretic-saiso-runtime`
   2. move transport relay loops and retry logic to `heretic-saiso-runtime`
   3. keep plugin package as command and control entrypoint only
4. Compatibility shims:
   1. keep old imports and entrypoints in `heretic-saiso` temporarily
   2. re-export moved APIs with deprecation notes
   3. remove shims only after passing integration gates
5. Scripts and DX:
   1. add per-package `dev`, `typecheck`, `test`, and `smoke` scripts
   2. add root scripts that run split package suites together
   3. document one local happy-path runbook
6. Final cutover:
   1. switch plugin implementation to runtime and protocol-client dependencies only
   2. confirm no worker loops execute from plugin bootstrap
   3. update docs and spec references and mark migration complete
7. Rollback criteria and order:
   1. trigger rollback when any blocking gate fails:
      1. command compatibility snapshot break without approved deprecation path
      2. duplicate worker ownership bug in singleton tests
      3. protocol handshake false-positive compatibility in integration tests
      4. state corruption or recovery failures involving `HERETIC_STATE_*` blocking errors
      5. lock recovery regressions causing partial logical state after crash tests
   2. rollback order:
      1. revert plugin package dependency switch to pre-split wiring
      2. disable runtime worker path by default in plugin commands
      3. keep protocol-client extraction behind compatibility shim until fixed
      4. restore last known-good state handling paths and rerun state recovery gates before retrying cutover
