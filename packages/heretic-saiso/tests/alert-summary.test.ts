import { describe, expect, it } from 'bun:test';
import { formatAlertNotification } from '../src/alert-summary.js';

describe('formatAlertNotification', () => {
  it('formats threshold alerts without raw JSON payloads', () => {
    const result = formatAlertNotification({
      id: 'eth-support',
      key: 'ETH',
      payload: {
        asset: 'ETH',
        price: 2299.5,
        rule: 'price<=2300',
      },
      occurredAt: '2026-04-21T20:10:38.144Z',
    });

    expect(result).toBe('ETH alert hit: price=2,299.5 rule=price<=2300');
  });

  it('formats periodic synthetic rules as scheduled updates', () => {
    const result = formatAlertNotification({
      id: 'alert-eth-periodic',
      key: 'ETH',
      payload: {
        asset: 'ETH',
        price: 2299.5,
        rule: 'price>=0',
      },
      occurredAt: '2026-04-21T20:10:50.503Z',
    });

    expect(result).toBe('ETH scheduled update: price=2,299.5');
  });
});
