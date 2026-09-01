# Event Ingest and Triggers

## What It Adds

1. Ingest normalized events from any source and match them against trigger rules.
2. Support exact event-type matches and wildcard (`*`) triggers.
3. Configure triggers via the `EVENT_TRIGGERS` env var (`eventType:action;...`) or inline.

## Inputs

- `event.type`: normalized event type
- `event.source`: event source identifier
- `event.payload`: event payload
- `triggers`: inline trigger rules (merged with env config)

## Usage

1. Install with `saiso add event_ingest_and_triggers`.
2. Invoke action `EVENT_INGEST_AND_TRIGGERS` with an event and optional trigger rules.
3. The action returns matched triggers; it does not execute the trigger actions.

## Output Contract

1. success
2. operation
3. chainFamily
4. data.event
5. data.matchedTriggers
6. data.triggerCount
7. meta