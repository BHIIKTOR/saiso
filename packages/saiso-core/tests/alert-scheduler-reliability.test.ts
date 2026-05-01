import { describe, expect, it } from 'bun:test';
import {
  AlertScheduler,
  InMemoryAlertSchedulerStore,
  createAlertNotificationPayload,
  type AlertEvent,
} from '../src/conversational/alert-scheduler.js';

function buildEvent(id: string, payload: Record<string, unknown>): AlertEvent {
  return {
    id,
    key: 'price-threshold',
    payload,
    occurredAt: new Date().toISOString(),
  };
}

describe('alert scheduler reliability', () => {
  it('dedupes repeated payloads within dedupe window and cooldown', async () => {
    const sentIds: string[] = [];
    const store = new InMemoryAlertSchedulerStore();
    const scheduler = new AlertScheduler(async (event) => {
      sentIds.push(event.id);
    }, store, {
      cooldownMs: 1000,
      dedupeWindowMs: 10_000,
    });

    await scheduler.hydrate();

    const first = await scheduler.process(buildEvent('evt-1', { token: 'ETH', price: 3100 }), 1_000);
    expect(first.delivered).toBe(true);
    expect(first.reason).toBe('sent');

    const cooldown = await scheduler.process(buildEvent('evt-1', { token: 'ETH', price: 3100 }), 1_500);
    expect(cooldown.delivered).toBe(false);
    expect(cooldown.reason).toBe('cooldown');

    const deduped = await scheduler.process(buildEvent('evt-1', { token: 'ETH', price: 3100 }), 4_000);
    expect(deduped.delivered).toBe(false);
    expect(deduped.reason).toBe('deduped');

    const changedPayload = await scheduler.process(buildEvent('evt-1', { token: 'ETH', price: 3200 }), 5_500);
    expect(changedPayload.delivered).toBe(true);
    expect(changedPayload.reason).toBe('sent');

    expect(sentIds).toEqual(['evt-1', 'evt-1']);
  });

  it('schedules retries and flushes backoff queue deterministically', async () => {
    let attempts = 0;
    const store = new InMemoryAlertSchedulerStore();
    const scheduler = new AlertScheduler(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error('transient notifier failure');
      }
    }, store, {
      cooldownMs: 500,
      dedupeWindowMs: 5_000,
      retryBackoffMs: 100,
      maxRetries: 3,
    });

    await scheduler.hydrate();

    const scheduled = await scheduler.process(buildEvent('evt-2', { token: 'SOL', movePct: -5 }), 10_000);
    expect(scheduled.delivered).toBe(false);
    expect(scheduled.reason).toBe('retry_scheduled');

    const firstFlush = await scheduler.flushRetries(10_050);
    expect(firstFlush).toBe(0);

    const secondFlush = await scheduler.flushRetries(10_200);
    expect(secondFlush).toBe(1);
    expect(attempts).toBe(2);
  });

  it('restores persisted retry state across restart and avoids duplicate side effects', async () => {
    const store = new InMemoryAlertSchedulerStore();
    let sentCount = 0;

    const schedulerA = new AlertScheduler(async () => {
      throw new Error('first process down');
    }, store, {
      retryBackoffMs: 100,
      maxRetries: 2,
      cooldownMs: 100,
      dedupeWindowMs: 1_000,
    });

    await schedulerA.hydrate();
    await schedulerA.process(buildEvent('evt-3', { token: 'BTC', movePct: 4 }), 20_000);

    const schedulerB = new AlertScheduler(async () => {
      sentCount += 1;
    }, store, {
      retryBackoffMs: 100,
      maxRetries: 2,
      cooldownMs: 100,
      dedupeWindowMs: 1_000,
    });

    await schedulerB.hydrate();
    const delivered = await schedulerB.flushRetries(20_200);
    expect(delivered).toBe(1);
    expect(sentCount).toBe(1);

    const postRestartDuplicate = await schedulerB.process(buildEvent('evt-3', { token: 'BTC', movePct: 4 }), 20_250);
    expect(postRestartDuplicate.delivered).toBe(false);
    expect(postRestartDuplicate.reason).toBe('cooldown');
  });

  it('emits deterministic alert notification payload shape', () => {
    const event = buildEvent('evt-4', { token: 'ETH', threshold: 3000, direction: 'above' });
    const payload = createAlertNotificationPayload(event, 'price-threshold:evt-4');

    expect(payload).toEqual({
      dedupeKey: 'price-threshold:evt-4',
      alertId: 'evt-4',
      alertKey: 'price-threshold',
      occurredAt: event.occurredAt,
      payload: { token: 'ETH', threshold: 3000, direction: 'above' },
    });
  });
});
