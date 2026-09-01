# Observability and Incident Hooks

## What It Adds

1. Emit structured metric, trace, and incident signals.
2. Classify severity (`info`, `warning`, `critical`) and detect incidents.
3. Report whether an external hook is configured via `OBSERVABILITY_HOOK_URL`.

## Inputs

- `signal.type`: `metric` (default), `trace`, or `incident`
- `signal.name`: signal name
- `signal.severity`: `info` (default), `warning`, or `critical`
- `signal.value`: numeric value
- `signal.tags`: key/value tags

## Usage

1. Install with `saiso add observability_and_incident_hooks`.
2. Invoke action `OBSERVABILITY_AND_INCIDENT_HOOKS` with a signal.
3. The action returns the normalized signal; it does not call external systems.

## Output Contract

1. success
2. operation
3. chainFamily
4. data.signal
5. data.hookConfigured
6. meta