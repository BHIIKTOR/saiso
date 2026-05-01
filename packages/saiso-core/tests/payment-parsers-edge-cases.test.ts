import { describe, expect, it } from 'bun:test';
import { parseMcpPaymentChallenge, parseMcpPaymentReceipt } from '../src/payments/parsers/mcp-payment.js';
import { parseJsonRpcPaymentChallenge } from '../src/payments/parsers/jsonrpc-payment.js';

describe('payment parser edge cases', () => {
  it('returns null when MCP payload is not an error challenge', () => {
    const challenge = parseMcpPaymentChallenge({
      isError: false,
      structuredContent: {
        x402Version: '2',
        accepts: [{ amount: '0.1' }],
      },
    });

    expect(challenge).toBeNull();
  });

  it('parses MPP challenge from content JSON text payload', () => {
    const challenge = parseMcpPaymentChallenge({
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            challenges: [
              {
                request: {
                  amount: '0.25',
                  network: 'eip155:11155111',
                  payTo: 'tempo.xyz',
                },
              },
            ],
          }),
        },
      ],
    });

    expect(challenge?.protocol).toBe('mpp');
    expect(challenge?.requirements.length).toBe(1);
    expect(challenge?.requirements[0].amount).toBe('0.25');
  });

  it('returns null for invalid MCP JSON content', () => {
    const challenge = parseMcpPaymentChallenge({
      isError: true,
      content: [
        {
          type: 'text',
          text: '{ this-is-not-json ',
        },
      ],
    });

    expect(challenge).toBeNull();
  });

  it('uses safe defaults when x402 amount fields are malformed', () => {
    const challenge = parseJsonRpcPaymentChallenge({
      error: {
        code: 402,
        data: {
          x402Version: '2',
          accepts: [{ payTo: 'merchant.example' }],
        },
      },
    });

    expect(challenge?.protocol).toBe('x402');
    expect(challenge?.requirements[0].amount).toBe('0');
    expect(challenge?.requirements[0].payTo).toBe('merchant.example');
  });

  it('returns null when no receipt meta is present', () => {
    const receipt = parseMcpPaymentReceipt({
      _meta: {},
    });
    expect(receipt).toBeNull();
  });

  it('prioritizes x402 receipt when both receipt metas are present', () => {
    const receipt = parseMcpPaymentReceipt({
      _meta: {
        'x402/payment-response': {
          success: true,
          transaction: '0xsettled',
          network: 'eip155:1',
        },
        'org.paymentauth/receipt': {
          status: 'success',
          reference: 'mpp-ref',
        },
      },
    });

    expect(receipt?.protocol).toBe('x402');
    expect(receipt?.reference).toBe('0xsettled');
  });
});
