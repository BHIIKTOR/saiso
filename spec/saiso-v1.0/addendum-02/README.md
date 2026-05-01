# SAISO v1.0 Addendum 02: Feature Expansion Backlog (Point 5 Excluded)

This addendum captures the next feature track after addendum-01 hardening.

Included items:

1. Premium Tool Packs (paid by default)
2. Policy-as-Code for payments/trust
3. Identity-first agent distribution
4. Trust-aware routing profiles
6. SVM parity on premium paid flows
7. Deployable Agent Service blueprint

Excluded by request:

- Point 5 (payment analytics UX)

## Phase A: Premium Tool Packs

## Scope

1. Ship production-ready premium tool templates for EVM/SVM:
   - premium simulation and risk checks
   - paid market intelligence hooks
   - route optimization hooks
2. Keep env-driven credential injection for `x402` and `mpp`.

## Acceptance Criteria

1. A new project scaffold can enable premium probe flows with env-only setup.
2. At least one premium tool path works in both EVM and SVM templates.
3. Live paid smoke evidence is documented for premium tool invocation.

## Phase B: Policy-as-Code Runtime

## Scope

1. Upgrade policy files from passive config to enforceable runtime constraints:
   - per-tool spend limits
   - recipient restrictions by protocol
   - operation-class trust floors (read/write/high-risk)
2. Add policy validation + deterministic failure messages.

## Acceptance Criteria

1. Policy rejects out-of-policy paid calls before spend.
2. CLI exposes policy validation with actionable diagnostics.
3. Tests cover deny/allow paths for x402 and mpp.

## Phase C: Identity-First Distribution

## Scope

1. Make `saiso identity build|validate|sync` part of standard project lifecycle.
2. Add optional signing metadata for discovery bundle publication.
3. Ensure `.well-known/agent-registration.json` remains scaffolded by default.

## Acceptance Criteria

1. CI can fail on identity drift with `identity sync --dry-run --strict`.
2. Registration artifacts can be generated and validated without manual JSON editing.
3. Identity metadata includes runtime endpoints and payment support flags.

## Phase D: Trust Routing Profiles

## Scope

1. Add named routing profiles:
   - `trust-first`
   - `cost-first`
   - `balanced`
2. Apply profile defaults in `saiso mcp call` and manager routing criteria.

## Acceptance Criteria

1. Profile selection changes routing outcome predictably in tests.
2. CLI and docs describe profile semantics clearly.
3. Profile defaults remain overridable by explicit flags.

## Phase E: SVM Premium Parity

## Scope

1. Ensure SVM premium paths match EVM feature depth for paid operations.
2. Add SVM-focused examples and validation commands.

## Acceptance Criteria

1. SVM premium probe path has equivalent payment and policy behavior.
2. SVM docs include the same operational steps as EVM where applicable.
3. Integration tests cover both server families with same acceptance gates.

## Phase F: Deployable Agent Service Blueprint

## Scope

1. Add a scaffold option for a service-ready agent endpoint:
   - paid endpoint behavior (`x402`/`mpp`)
   - readiness/health endpoints
   - discovery metadata included
2. Keep deployment target-agnostic (container-friendly baseline).

## Acceptance Criteria

1. A generated service project can run locally with paid endpoint challenge/retry behavior.
2. Health/readiness and identity metadata are available by default.
3. Release checklist includes a service blueprint validation step.

## Recommended Delivery Order

1. Phase A
2. Phase B
3. Phase C
4. Phase D
5. Phase E
6. Phase F

This preserves momentum by building on already-integrated payment, trust, and identity primitives.

## Implementation Status

- [x] Phase A: Premium tool pack probes are scaffolded for EVM + SVM templates and run via env-only credentials.
- [x] Phase B: Runtime policy enforcement now includes tool-level limits, protocol recipient controls, and operation-class trust floors; `saiso policy validate` added.
- [x] Phase C: Identity generation includes runtime endpoints, payment support metadata, optional signing metadata, and optional CI drift gate wiring.
- [x] Phase D: Routing profiles (`trust-first`, `cost-first`, `balanced`) are implemented in registry logic and surfaced in `saiso mcp call`.
- [x] Phase E: SVM premium probe path/docs mirror EVM behavior and parity tests cover shared acceptance behavior.
- [x] Phase F: Optional `saiso new --service-blueprint` scaffold adds paid endpoint, health/readiness probes, discovery serving, and container baseline files.
