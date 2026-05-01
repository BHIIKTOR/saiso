import { describe, expect, it } from 'bun:test';
import { summarizePaymentReceipts, toPaymentEventView } from './payment-observability.js';

describe('payment observability helpers', () => {
  it('emits stable event keys for machine parsing', () => {
    const event = toPaymentEventView({
      protocol: 'x402',
      success: false,
      outcomeClass: 'payment-required',
      reference: '0xref',
      timestamp: '2026-01-01T00:00:00.000Z',
      amount: '0.25',
      network: 'base',
      raw: {
        token: '[REDACTED]',
      },
    });

    expect(Object.keys(event).sort()).toEqual([
      'amount',
      'network',
      'outcomeClass',
      'protocol',
      'reference',
      'success',
      'timestamp',
    ]);
    expect(event.protocol).toBe('x402');
    expect(event.outcomeClass).toBe('payment-required');
  });

  it('summarizes receipts by protocol and outcome class deterministically', () => {
    const summary = summarizePaymentReceipts([
      {
        protocol: 'x402',
        success: true,
        outcomeClass: 'settled',
        reference: '0xok',
        timestamp: '2026-01-01T00:00:00.000Z',
        raw: {},
      },
      {
        protocol: 'x402',
        success: false,
        outcomeClass: 'payment-required',
        reference: '0xfail',
        timestamp: '2026-01-01T00:01:00.000Z',
        raw: {},
      },
      {
        protocol: 'mpp',
        success: false,
        outcomeClass: 'credential-error',
        reference: 'mpp-fail',
        timestamp: '2026-01-01T00:02:00.000Z',
        raw: {},
      },
    ], 2);

    expect(summary.total).toBe(3);
    expect(summary.successful).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.byProtocol.x402.total).toBe(2);
    expect(summary.byProtocol.x402.outcomeClasses['settled']).toBe(1);
    expect(summary.byProtocol.x402.outcomeClasses['payment-required']).toBe(1);
    expect(summary.byProtocol.mpp.outcomeClasses['credential-error']).toBe(1);
    expect(summary.recent.length).toBe(2);
    expect(summary.recent[1].reference).toBe('mpp-fail');
  });

  it('does not leak raw credential-like fields in observability output', () => {
    const summary = summarizePaymentReceipts([
      {
        protocol: 'mpp',
        success: false,
        timestamp: '2026-01-01T00:02:00.000Z',
        raw: {
          token: 'secret-token',
          signature: 'secret-signature',
        },
      },
    ]);

    const serialized = JSON.stringify(summary);
    expect(serialized.includes('secret-token')).toBe(false);
    expect(serialized.includes('secret-signature')).toBe(false);
    expect(serialized.includes('"raw"')).toBe(false);
  });
});
