import type { PaymentConfig } from '../types/config.js';
import type { PaymentCredential } from './types.js';
import { mppFetch } from './adapters/mpp-http.js';
import { PaymentReceiptStore } from './receipts-store.js';

export interface PaidHttpClientOptions {
  payment?: PaymentConfig;
  createMppCredential?: (challenge: Record<string, unknown>) => Promise<PaymentCredential>;
  createX402Credential?: (challenge: Record<string, unknown>) => Promise<PaymentCredential>;
  receiptStoreBasePath?: string;
}

export async function paidFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: PaidHttpClientOptions = {}
): Promise<Response> {
  if (!options.payment?.enabled) {
    return fetch(input, init);
  }

  const maybePersist = async (protocol: 'mpp' | 'x402', response: Response): Promise<void> => {
    if (!options.receiptStoreBasePath) {
      return;
    }
    if (
      !response.headers.has('x-payment-reference')
      && !response.headers.has('x402-settlement-tx')
      && !response.headers.has('x-payment-amount')
      && !response.headers.has('x-payment-network')
      && !response.headers.has('x-payment-payer')
    ) {
      return;
    }
    const store = new PaymentReceiptStore(options.receiptStoreBasePath);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    await store.append({
      protocol,
      success: response.ok,
      outcomeClass: response.ok
        ? 'settled'
        : response.status === 402
          ? 'payment-required'
          : 'upstream-error',
      reference: response.headers.get('x-payment-reference') || response.headers.get('x402-settlement-tx') || undefined,
      amount: response.headers.get('x-payment-amount') || undefined,
      network: response.headers.get('x-payment-network') || undefined,
      payer: response.headers.get('x-payment-payer') || undefined,
      timestamp: new Date().toISOString(),
      raw: {
        status: response.status,
        headers,
      },
    });
  };

  if (options.payment.preferredProtocol === 'auto') {
    const response = await fetch(input, init);
    if (response.status !== 402) {
      await maybePersist('mpp', response);
      return response;
    }

    const challenge = await parsePaymentChallenge(response);
    if (!challenge) {
      return response;
    }

    if (isX402Challenge(challenge)) {
      if (!options.createX402Credential) {
        return response;
      }
      const settled = await retryWithPaymentHeader(input, init, 'X-PAYMENT', await options.createX402Credential(challenge));
      await maybePersist('x402', settled);
      return settled;
    }

    if (isMppChallenge(challenge)) {
      if (!options.createMppCredential) {
        return response;
      }
      const settled = await retryWithPaymentHeader(input, init, 'Payment', await options.createMppCredential(challenge));
      await maybePersist('mpp', settled);
      return settled;
    }

    return response;
  }

  if (options.payment.preferredProtocol === 'mpp') {
    if (options.createMppCredential) {
      const response = await mppFetch(input, init, options.createMppCredential);
      await maybePersist('mpp', response);
      return response;
    }
  }

  if (options.payment.preferredProtocol === 'x402') {
    const response = await fetch(input, init);
    if (response.status !== 402 || !options.createX402Credential) {
      return response;
    }

    let challenge: Record<string, unknown>;
    try {
      challenge = await response.clone().json() as Record<string, unknown>;
    } catch {
      return response;
    }

    if (!challenge.x402Version || !Array.isArray(challenge.accepts)) {
      return response;
    }

    const settled = await retryWithPaymentHeader(
      input,
      init,
      'X-PAYMENT',
      await options.createX402Credential(challenge)
    );
    await maybePersist('x402', settled);
    return settled;
  }

  return fetch(input, init);
}

async function parsePaymentChallenge(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return await response.clone().json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isX402Challenge(challenge: Record<string, unknown>): boolean {
  return Boolean(challenge.x402Version) && Array.isArray(challenge.accepts);
}

function isMppChallenge(challenge: Record<string, unknown>): boolean {
  return Array.isArray(challenge.challenges)
    || (typeof challenge.request === 'object' && challenge.request !== null);
}

async function retryWithPaymentHeader(
  input: RequestInfo | URL,
  init: RequestInit,
  headerName: string,
  credential: PaymentCredential
): Promise<Response> {
  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set(headerName, JSON.stringify(credential.payload));

  return fetch(input, {
    ...init,
    headers: retryHeaders,
  });
}
