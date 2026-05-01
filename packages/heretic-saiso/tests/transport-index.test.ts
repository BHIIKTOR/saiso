import { describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildCorrelationKey,
  enqueueTransportOutboxEntry,
  markTransportFailedRecoverable,
  markTransportPendingDelivery,
  markTransportTerminal,
  pruneTransportIndex,
  readTransportIndexState,
  readTransportOutboxState,
  reserveTransportCorrelation,
} from '../src/state.js';

describe('transport correlation index', () => {
  it('deduplicates parallel reserve for same correlation key', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'heretic-saiso-correlation-'));

    const key = buildCorrelationKey({
      transport: 'telegram',
      transportIdentity: 'bot-1',
      channelId: 'channel-1',
      messageId: 'msg-1',
    });

    const [first, second] = await Promise.all([
      reserveTransportCorrelation(projectRoot, {
        key,
        transport: 'telegram',
        transportIdentity: 'bot-1',
        channelId: 'channel-1',
        messageId: 'msg-1',
        clientRequestId: 'req-a',
      }),
      reserveTransportCorrelation(projectRoot, {
        key,
        transport: 'telegram',
        transportIdentity: 'bot-1',
        channelId: 'channel-1',
        messageId: 'msg-1',
        clientRequestId: 'req-b',
      }),
    ]);

    expect([first.kind, second.kind].sort()).toEqual(['created', 'existing']);

    const state = await readTransportIndexState(projectRoot);
    expect(Object.keys(state.data.entries)).toHaveLength(1);
  });

  it('allows parallel reserve for different keys without starvation', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'heretic-saiso-correlation-many-'));

    const keyA = buildCorrelationKey({
      transport: 'telegram',
      transportIdentity: 'bot-1',
      channelId: 'channel-2',
      messageId: 'msg-a',
    });
    const keyB = buildCorrelationKey({
      transport: 'telegram',
      transportIdentity: 'bot-1',
      channelId: 'channel-2',
      messageId: 'msg-b',
    });

    const [resA, resB] = await Promise.all([
      reserveTransportCorrelation(projectRoot, {
        key: keyA,
        transport: 'telegram',
        transportIdentity: 'bot-1',
        channelId: 'channel-2',
        messageId: 'msg-a',
        clientRequestId: 'req-a',
      }),
      reserveTransportCorrelation(projectRoot, {
        key: keyB,
        transport: 'telegram',
        transportIdentity: 'bot-1',
        channelId: 'channel-2',
        messageId: 'msg-b',
        clientRequestId: 'req-b',
      }),
    ]);

    expect(resA.kind).toBe('created');
    expect(resB.kind).toBe('created');

    const state = await readTransportIndexState(projectRoot);
    expect(Object.keys(state.data.entries).sort()).toEqual([keyA, keyB].sort());
  });

  it('prunes terminal entries and tombstones unresolved entries', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'heretic-saiso-prune-'));

    const terminalKey = buildCorrelationKey({
      transport: 'telegram',
      transportIdentity: 'bot-1',
      channelId: 'ch-1',
      messageId: 'm-1',
    });

    const unresolvedKey = buildCorrelationKey({
      transport: 'telegram',
      transportIdentity: 'bot-1',
      channelId: 'ch-1',
      messageId: 'm-2',
    });

    await reserveTransportCorrelation(projectRoot, {
      key: terminalKey,
      transport: 'telegram',
      transportIdentity: 'bot-1',
      channelId: 'ch-1',
      messageId: 'm-1',
      clientRequestId: 'req-1',
    });

    await reserveTransportCorrelation(projectRoot, {
      key: unresolvedKey,
      transport: 'telegram',
      transportIdentity: 'bot-1',
      channelId: 'ch-1',
      messageId: 'm-2',
      clientRequestId: 'req-2',
    });

    await markTransportTerminal(projectRoot, terminalKey, 'done');

    const oldNow = Date.now() + 100_000;
    const stats = await pruneTransportIndex(projectRoot, {
      terminalTtlMs: 1000,
      unresolvedTtlMs: 1000,
      nowMs: oldNow,
    });

    expect(stats.removedTerminal).toBe(1);
    expect(stats.convertedToTombstone).toBe(1);

    const state = await readTransportIndexState(projectRoot);
    expect(state.data.entries[terminalKey]).toBeUndefined();
    expect(state.data.entries[unresolvedKey]?.status).toBe('tombstoned');
  });

  it('migrates legacy transport statuses and reasons into typed states', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'heretic-saiso-legacy-transport-'));
    await mkdir(path.join(projectRoot, '.saiso', 'heretic'), { recursive: true });
    const transportPath = path.join(projectRoot, '.saiso', 'heretic', 'transport-index.json');

    await writeFile(transportPath, `${JSON.stringify({
      schemaVersion: 'transport-index.v1',
      revision: 1,
      updatedAt: '2026-04-21T00:00:00.000Z',
      data: {
        entries: {
          'legacy:timeout': {
            transport: 'telegram',
            transportIdentity: 'e2e-bot',
            channelId: 'channel-1',
            messageId: 'msg-timeout',
            status: 'needs_operator_review',
            createdAt: '2026-04-21T00:00:00.000Z',
            updatedAt: '2026-04-21T00:01:00.000Z',
            lineage: {
              clientRequestId: 'req-1',
              turnId: 'turn-1',
            },
            needsReviewReason: 'Timed out waiting for turn completion',
          },
        },
      },
    }, null, 2)}\n`, 'utf8');

    const state = await readTransportIndexState(projectRoot);
    const entry = state.data.entries['legacy:timeout'];
    expect(entry?.status).toBe('failed_recoverable');
    expect(entry?.failure?.code).toBe('TRANSPORT_TURN_TIMEOUT');
    expect(entry?.failure?.retryable).toBe(true);
  });

  it('deduplicates final delivery outbox entries by correlation and idempotency key', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'heretic-saiso-outbox-'));

    const first = await enqueueTransportOutboxEntry(projectRoot, {
      outboxId: 'outbox-1',
      correlationKey: 'telegram:bot-1:channel-1:msg-1',
      turnId: 'turn-1',
      transport: 'telegram',
      transportIdentity: 'bot-1',
      channelId: 'channel-1',
      payloadType: 'final',
      payload: {
        text: 'hello',
      },
      idempotencyKey: 'telegram:bot-1:channel-1:turn-1:final',
      status: 'queued',
      attemptCount: 0,
      maxAttempts: 5,
      nextAttemptAt: '2026-04-21T00:00:00.000Z',
    });

    const second = await enqueueTransportOutboxEntry(projectRoot, {
      outboxId: 'outbox-2',
      correlationKey: 'telegram:bot-1:channel-1:msg-1',
      turnId: 'turn-1',
      transport: 'telegram',
      transportIdentity: 'bot-1',
      channelId: 'channel-1',
      payloadType: 'final',
      payload: {
        text: 'hello',
      },
      idempotencyKey: 'telegram:bot-1:channel-1:turn-1:final',
      status: 'queued',
      attemptCount: 0,
      maxAttempts: 5,
      nextAttemptAt: '2026-04-21T00:00:00.000Z',
    });

    expect(first.outboxId).toBe('outbox-1');
    expect(second.outboxId).toBe('outbox-1');

    const outbox = await readTransportOutboxState(projectRoot);
    expect(Object.keys(outbox.data.entries)).toHaveLength(1);
  });

  it('can recover a retryable entry back into pending delivery and terminal state', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'heretic-saiso-recovery-'));

    const key = buildCorrelationKey({
      transport: 'telegram',
      transportIdentity: 'prod-bot',
      channelId: 'channel-1',
      messageId: 'msg-1',
    });

    await reserveTransportCorrelation(projectRoot, {
      key,
      transport: 'telegram',
      transportIdentity: 'prod-bot',
      channelId: 'channel-1',
      messageId: 'msg-1',
      clientRequestId: 'req-1',
    });

    await markTransportFailedRecoverable(projectRoot, key, 'Timed out waiting for turn completion', 'TRANSPORT_TURN_TIMEOUT');
    await markTransportPendingDelivery(projectRoot, key, 'Recovered answer', 'ok');
    await markTransportTerminal(projectRoot, key, 'Recovered answer', 'ok');

    const state = await readTransportIndexState(projectRoot);
    expect(state.data.entries[key]?.status).toBe('delivered_terminal');
    expect(state.data.entries[key]?.failure).toBeUndefined();
    expect(state.data.entries[key]?.needsReviewReason).toBeUndefined();
  });
});
