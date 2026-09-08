import { describe, it, expect, mock } from 'bun:test';
import { observabilityIncidentHooksAction } from './action';

describe('observability_and_incident_hooks action scaffold', () => {
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

    const result = await observabilityIncidentHooksAction.handler(runtime, message, {} as any, {} as any, undefined as any);
    expect(result.success).toBe(true);
    expect(result.operation).toBe('observability_and_incident_hooks');
    expect(result.chainFamily).toBe('evm');
    expect(result.meta.requestId).toBeDefined();
  });
});

describe('observability_and_incident_hooks behavior', () => {

  it('classifies critical signals as incidents', async () => {
    const result = await observabilityIncidentHooksAction.handler({ getSetting: () => undefined } as any, { content: { signal: { type: 'metric', name: 'failures', severity: 'critical', value: 3 } } } as any, undefined, {});
    expect(result.data.signal).toMatchObject({ name: 'failures', value: 3, severity: 'critical', incident: true });
    expect(result.data.hookConfigured).toBe(false);
  });
});
