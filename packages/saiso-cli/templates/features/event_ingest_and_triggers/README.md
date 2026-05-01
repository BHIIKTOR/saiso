# Event Ingest and Triggers

## What It Adds

1. Drive workflows from event ingestion instead of polling only
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add event_ingest_and_triggers.
2. Invoke action EVENT_INGEST_AND_TRIGGERS with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
