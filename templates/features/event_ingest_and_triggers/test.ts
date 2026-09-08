import { describe, it, expect, mock } from 'bun:test';
import { eventIngestTriggersAction } from './action';

describe('event_ingest_and_triggers action scaffold', () => {
  it('returns normalized workflow envelope', async () => {
    const runtime = {
      getSetting: mock((_key: string) => undefined),
    } as any;

    const message = {
      content: {
        chainFamily: 'evm',
        dryRun: true,
        payload: { foo: 'bar' },
      },
    } as any;

    const result = await eventIngestTriggersAction.handler(runtime, message, {} as any, {} as any, undefined as any);
    expect(result.success).toBe(true);
    expect(result.operation).toBe('event_ingest_and_triggers');
    expect(result.chainFamily).toBe('evm');
    expect(result.meta.requestId).toBeDefined();
  });
});

describe('event_ingest_and_triggers behavior', () => {

  it('normalizes event types and matches only relevant or wildcard triggers', async () => {
    const result = await eventIngestTriggersAction.handler({ getSetting: () => undefined } as any, { content: { event: { type: 'Wallet Created', source: 'local', payload: { id: 'wallet_1' } }, triggers: [{ id: 'match', eventType: 'wallet_created', action: 'notify' }, { id: 'other', eventType: 'transaction.failed' }, { id: 'wildcard', eventType: '*', action: 'audit' }] } } as any, undefined, {});
    expect(result.data.event.type).toBe('wallet_created');
    expect(result.data.event.payload).toEqual({ id: 'wallet_1' });
    expect(result.data.matchedTriggers.map((trigger: { id: string }) => trigger.id)).toEqual(['match', 'wildcard']);
  });
});
