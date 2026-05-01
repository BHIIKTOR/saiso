import { describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PaymentReceiptStore } from '../src/payments/receipts-store.js';

describe('payment receipt hygiene', () => {
  it('redacts sensitive credential-like fields before persisting receipts', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-receipt-hygiene-'));
    const store = new PaymentReceiptStore(projectPath);

    await store.append({
      protocol: 'x402',
      success: false,
      reference: '0xfailed',
      timestamp: new Date().toISOString(),
      raw: {
        status: 402,
        authorization: 'Bearer secret-auth',
        payment: {
          token: 'secret-token',
          signature: 'secret-signature',
        },
        headers: {
          'x-payment': 'secret-header',
        },
      },
    });

    const receipts = await store.readAll(10);
    expect(receipts.length).toBe(1);
    expect(receipts[0].outcomeClass).toBe('payment-required');

    const raw = receipts[0].raw as Record<string, unknown>;
    expect(raw.authorization).toBe('[REDACTED]');
    expect(raw.payment).toBe('[REDACTED]');
    expect(((raw.headers as Record<string, unknown>)['x-payment'])).toBe('[REDACTED]');

    const serialized = JSON.stringify(receipts[0]);
    expect(serialized.includes('secret-auth')).toBe(false);
    expect(serialized.includes('secret-token')).toBe(false);
    expect(serialized.includes('secret-signature')).toBe(false);
    expect(serialized.includes('secret-header')).toBe(false);
  });

  it('assigns deterministic outcome class for successful receipts', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-receipt-outcome-'));
    const store = new PaymentReceiptStore(projectPath);

    await store.append({
      protocol: 'mpp',
      success: true,
      reference: 'mpp-ok-1',
      timestamp: new Date().toISOString(),
      raw: {
        status: 'success',
      },
    });

    const [receipt] = await store.readAll(1);
    expect(receipt.outcomeClass).toBe('settled');
  });
});
