# Conversational Runtime and Transport Lane

## Mission

Deliver a universal conversational runtime that supports multiple transports with one deterministic contract, starting with Telegram, then layering semi-autonomous goal execution and reliable alert delivery.

## Scope

In scope:

1. Transport core contract and adapter registry (`T-006`).
2. Telegram adapter MVP over transport core (`T-007`).
3. Goal-runner lifecycle for approval-safe execution over chat (`T-009`).
4. Alert scheduler reliability validation, coordinated with testing lane (`T-010`).

Out of scope:

1. Transport-specific business logic embedded in core orchestration.
2. Undocumented capability fallbacks that differ per adapter.

## Design Contract

1. One canonical message envelope across all transports.
2. Explicit capability declaration per adapter:
   - `supportsStream`, `supportsButtons`, `supportsMedia`, `supportsTopics`, `supportsCallbacks`
3. Deterministic response mode negotiation:
   - requested mode `sync|stream|websocket`
   - adapter fallback path with explicit reason code
4. Idempotent inbound and outbound semantics using stable message/update keys.
5. Deterministic machine-readable failure classes for transport and lifecycle errors.

## Phase CR1: Transport Core + Telegram MVP

### Workstream CR1-A: Transport Core (`T-006`)

Objective:

1. Provide adapter-agnostic runtime interfaces and canonical envelope mapping.

Implementation:

1. Define transport interfaces for ingress, egress, and capability handshake.
2. Add adapter registry with deterministic adapter selection rules.
3. Add canonical envelope fields:
   - `transport`, `channelId`, `threadId`, `senderId`, `messageId`, `timestamp`, `attachments`
4. Add normalized error classes for unsupported capability and delivery failures.

Target paths:

1. `packages/saiso-core/src/**` transport contracts/registry
2. `packages/saiso-cli/src/**` transport wiring and command interfaces

Acceptance criteria:

1. Core can ingest and emit normalized envelopes independent of adapter type.
2. Capability negotiation and mode fallback are deterministic and testable.

### Workstream CR1-B: Telegram Adapter (`T-007`)

Objective:

1. Ship Telegram as first concrete adapter while preserving transport neutrality.

Implementation:

1. Implement inbound mapping for private chat, group chat, and topic/thread contexts.
2. Implement outbound messaging with callback/button and media metadata support.
3. Enforce allowlist/safe-mode policy hooks at adapter boundary.
4. Ensure webhook/event ingress maps cleanly into canonical envelope.

Target paths:

1. Telegram adapter modules under runtime and CLI integration points
2. Telegram test fixtures for ingress/egress mapping

Acceptance criteria:

1. Telegram behavior conforms to shared transport contracts.
2. Telegram-specific edge cases do not leak into core abstractions.

## Phase CR2: Goal Runner + Alert Reliability

### Workstream CR2-A: Goal Runner Lifecycle (`T-009`)

Objective:

1. Add operator-safe semi-autonomous execution over chat sessions.

Implementation:

1. Define lifecycle states:
   - `draft`, `awaiting_approval`, `running`, `paused`, `failed`, `completed`, `cancelled`
2. Add approval gates for mutating actions with policy/trust checks before execution.
3. Add run-context persistence:
   - goal intent, chain context, decision trace, action receipts, and final summary
4. Add cancellation and pause/resume semantics with deterministic state transitions.

Target paths:

1. goal-runner modules in `packages/saiso-core/src/**`
2. CLI/runtime control commands and lifecycle views

Acceptance criteria:

1. Mutating steps cannot execute without explicit approval when required.
2. Goal lifecycle transitions are deterministic and auditable.

### Workstream CR2-B: Alert Scheduler Reliability (`T-010`, with testing lane)

Objective:

1. Ensure scheduled alerts are deduped, cooldown-safe, and restart-safe.

Implementation:

1. Define deterministic dedupe key strategy per alert type.
2. Add cooldown enforcement and bounded retry/backoff behavior.
3. Add restart recovery semantics to avoid duplicate notifications and missed alerts.
4. Normalize alert payload shape for all chat adapters.

Target paths:

1. scheduler/alerts modules in `packages/saiso-core/src/**`
2. transport-facing notification adapters and fixtures
3. paired test coverage in testing lane artifacts

Acceptance criteria:

1. Alerts fire once per dedupe window unless state truly changes.
2. Restart and retry behavior is deterministic and observable.

## Validation and Gate Commands

Phase CR1 required:

```bash
bun test packages/saiso-core/tests/transport-conformance.test.ts
bun test packages/saiso-cli/src --test-name-pattern "telegram|transport"
```

Phase CR2 required:

```bash
bun test packages/saiso-core/tests/goal-runner-lifecycle.test.ts
bun test packages/saiso-core/tests/alert-scheduler-reliability.test.ts
```

## Risks and Mitigation

1. Risk: Adapter behavior divergence over time.
   - Mitigation: enforce one shared conformance suite for all adapters.
2. Risk: Goal runner introduces unsafe automation.
   - Mitigation: mandatory approval state and explicit policy/trust checks.
3. Risk: Alert spam or missed notifications under retries/restarts.
   - Mitigation: dedupe keys, cooldown windows, and restart-recovery tests.

## Definition of Done

1. `T-006`, `T-007`, and `T-009` are implemented and validated with deterministic tests.
2. `T-010` reliability behavior is codified and validated with restart/cooldown/dedupe scenarios.
3. Conversational runtime is transport-agnostic, auditable, and operator-safe.
