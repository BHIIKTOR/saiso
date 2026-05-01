# SAISO v1.0.0-rc1 Risk and Priority Tracking

## Purpose

Provide one auditable source for P0/P1/P2 items used by the release readiness criteria in `README.md`.

Release rule:

1. No open `P0` or `P1` items at release gate.

## Severity Definitions

1. `P0`: release-blocking correctness, security, or severe stability issue.
2. `P1`: high-risk issue that can materially degrade production behavior.
3. `P2`: medium/low risk improvement that can be deferred if needed.

## Status Definitions

1. `open`
2. `in_progress`
3. `blocked`
4. `done`

## Tracking Table

| ID | Priority | Lane | Item | Owner | Status | Notes |
|---|---|---|---|---|---|---|
| T-001 | P1 | Consolidation | Ensure `saiso dev` launch path cannot recurse through `dev` script | unassigned | done | `dev` now launches `agent:dev` or `start` |
| T-002 | P1 | Consolidation | Align feature import/dependency contract for `@elizaos/core` | unassigned | done | template deps and add-command auto-heal in place |
| T-003 | P1 | Testing | Expand SVM MCP server branch coverage for tool and transport paths | unassigned | done | Added deep tool + server transport test suites; full svm suite green with Bun |
| T-004 | P1 | Testing | Build Foundry localnet scenario matrix for complex flows | unassigned | done | Scenario matrix + artifacts implemented (`actionTrace`, `txStatuses`, `decisionLog`, `assertionSummary`); docker localnet smoke green |
| T-005 | P2 | New features | Introduce benchmark runner and `perf:bench` CI threshold gating | unassigned | done | Added benchmark runner/baseline, npm script, and blocking CI benchmark lane |
| T-006 | P1 | Conversational Runtime | Ship chat transport core contract, registry, and normalized message envelope | unassigned | done | Transport contracts/registry/router implemented with deterministic mode fallback and envelope checks |
| T-007 | P1 | Conversational Runtime | Deliver Telegram adapter MVP over transport core | unassigned | done | Telegram adapter implemented for canonical message/callback ingress, outbound delivery, allowlist, and safe-mode restrictions |
| T-008 | P1 | Testing | Add transport conformance and Telegram e2e test harness | unassigned | done | Transport conformance + Telegram mapping/allowlist/safe-mode + stream-fallback tests green in Bun suite |
| T-009 | P1 | Conversational Runtime | Implement goal-runner lifecycle with approval-safe execution over chat | unassigned | done | Goal runner lifecycle implemented with approval gates, deterministic transitions, and CLI runtime goal controls |
| T-010 | P1 | Testing | Add alert scheduler reliability tests (dedupe/cooldown/restart recovery) | unassigned | done | Alert scheduler reliability tests (dedupe/cooldown/restart/retry) green |
| T-011 | P2 | New features | Add second chat transport adapter to prove extensibility | unassigned | done | Webhook adapter implemented and validated by shared transport conformance tests |

## Audit Procedure

1. Before release, filter rows where `Priority in (P0, P1)` and `Status != done`.
2. Release cannot proceed if any such rows exist.
3. During implementation, update owner, status, and notes in this file with every merge touching tracked items.
