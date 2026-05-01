export interface AlertEvent {
  id: string;
  key: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface AlertDeliveryResult {
  delivered: boolean;
  reason: 'sent' | 'deduped' | 'cooldown' | 'retry_scheduled';
  dedupeKey: string;
}

export interface AlertNotificationPayload {
  dedupeKey: string;
  alertId: string;
  alertKey: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface AlertSchedulerConfig {
  cooldownMs: number;
  dedupeWindowMs: number;
  retryBackoffMs: number;
  maxRetries: number;
}

export interface AlertSchedulerState {
  sentAtByDedupeKey: Record<string, number>;
  payloadHashByDedupeKey: Record<string, string>;
  retryQueue: Array<{
    event: AlertEvent;
    attempt: number;
    runAt: number;
  }>;
}

export interface AlertSchedulerStore {
  load(): Promise<AlertSchedulerState | undefined>;
  save(state: AlertSchedulerState): Promise<void>;
}

export type AlertSender = (event: AlertEvent) => Promise<void>;

const DEFAULT_CONFIG: AlertSchedulerConfig = {
  cooldownMs: 30_000,
  dedupeWindowMs: 5 * 60_000,
  retryBackoffMs: 2_000,
  maxRetries: 3,
};

export class AlertScheduler {
  private state: AlertSchedulerState;

  private readonly config: AlertSchedulerConfig;

  constructor(
    private readonly sender: AlertSender,
    private readonly store: AlertSchedulerStore,
    config: Partial<AlertSchedulerConfig> = {},
    initialState?: AlertSchedulerState,
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.state = initialState || {
      sentAtByDedupeKey: {},
      payloadHashByDedupeKey: {},
      retryQueue: [],
    };
  }

  async hydrate(): Promise<void> {
    const loaded = await this.store.load();
    if (loaded) {
      this.state = loaded;
    }
  }

  snapshot(): AlertSchedulerState {
    return JSON.parse(JSON.stringify(this.state)) as AlertSchedulerState;
  }

  async process(event: AlertEvent, nowMs = Date.now()): Promise<AlertDeliveryResult> {
    const dedupeKey = this.getDedupeKey(event);
    const previousSent = this.state.sentAtByDedupeKey[dedupeKey];

    if (typeof previousSent === 'number' && nowMs - previousSent < this.config.cooldownMs) {
      return { delivered: false, reason: 'cooldown', dedupeKey };
    }

    const currentHash = hashPayload(event.payload);
    const previousHash = this.state.payloadHashByDedupeKey[dedupeKey];

    if (
      typeof previousSent === 'number'
      && nowMs - previousSent < this.config.dedupeWindowMs
      && previousHash === currentHash
    ) {
      return { delivered: false, reason: 'deduped', dedupeKey };
    }

    try {
      await this.sender(event);
      this.state.sentAtByDedupeKey[dedupeKey] = nowMs;
      this.state.payloadHashByDedupeKey[dedupeKey] = currentHash;
      await this.store.save(this.snapshot());
      return { delivered: true, reason: 'sent', dedupeKey };
    } catch {
      this.scheduleRetry(event, nowMs, 1);
      await this.store.save(this.snapshot());
      return { delivered: false, reason: 'retry_scheduled', dedupeKey };
    }
  }

  async flushRetries(nowMs = Date.now()): Promise<number> {
    let delivered = 0;
    const pending = this.state.retryQueue
      .filter((entry) => entry.runAt <= nowMs)
      .sort((a, b) => a.runAt - b.runAt);

    this.state.retryQueue = this.state.retryQueue.filter((entry) => entry.runAt > nowMs);

    for (const entry of pending) {
      try {
        await this.sender(entry.event);
        const dedupeKey = this.getDedupeKey(entry.event);
        this.state.sentAtByDedupeKey[dedupeKey] = nowMs;
        this.state.payloadHashByDedupeKey[dedupeKey] = hashPayload(entry.event.payload);
        delivered += 1;
      } catch {
        if (entry.attempt < this.config.maxRetries) {
          this.scheduleRetry(entry.event, nowMs, entry.attempt + 1);
        }
      }
    }

    await this.store.save(this.snapshot());
    return delivered;
  }

  private scheduleRetry(event: AlertEvent, nowMs: number, attempt: number): void {
    this.state.retryQueue.push({
      event,
      attempt,
      runAt: nowMs + (this.config.retryBackoffMs * attempt),
    });
  }

  private getDedupeKey(event: AlertEvent): string {
    return `${event.key}:${event.id}`;
  }
}

export class InMemoryAlertSchedulerStore implements AlertSchedulerStore {
  private state: AlertSchedulerState | undefined;

  async load(): Promise<AlertSchedulerState | undefined> {
    return this.state ? JSON.parse(JSON.stringify(this.state)) as AlertSchedulerState : undefined;
  }

  async save(state: AlertSchedulerState): Promise<void> {
    this.state = JSON.parse(JSON.stringify(state)) as AlertSchedulerState;
  }
}

function hashPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

export function createAlertNotificationPayload(event: AlertEvent, dedupeKey: string): AlertNotificationPayload {
  return {
    dedupeKey,
    alertId: event.id,
    alertKey: event.key,
    occurredAt: event.occurredAt,
    payload: JSON.parse(JSON.stringify(event.payload)) as Record<string, unknown>,
  };
}
