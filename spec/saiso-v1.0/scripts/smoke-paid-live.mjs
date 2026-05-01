#!/usr/bin/env node

/**
 * Live paid smoke checks using real staging endpoints and secret credentials.
 *
 * This script intentionally does not generate credentials. It consumes credential
 * payloads from environment variables so CI can inject secret-backed values.
 */

function parseBodyJson(raw, envKey) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error(`${envKey} must contain a valid JSON object.`);
  }
}

function parseCredentialInput(raw, envKey) {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${envKey} must not be empty.`);
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed === null
      || (typeof parsed !== 'object' && typeof parsed !== 'string')
      || Array.isArray(parsed)
    ) {
      throw new Error();
    }
    return parsed;
  } catch {
    // Allow literal encoded header values for protocol-specific formats.
    return trimmed;
  }
}

function createRequestInit(method, body, extraHeaders = {}) {
  const upperMethod = method.toUpperCase();
  const headers = new Headers({
    accept: 'application/json',
    ...extraHeaders,
  });

  const init = {
    method: upperMethod,
    headers,
    signal: AbortSignal.timeout(30000),
  };

  if (upperMethod === 'GET' || upperMethod === 'HEAD') {
    return init;
  }

  headers.set('content-type', 'application/json');
  return {
    ...init,
    body: JSON.stringify(body || {}),
  };
}

async function requestWithoutPayment(url, method, body) {
  return fetch(url, createRequestInit(method, body));
}

function isHeaderMap(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const values = Object.values(input);
  if (values.length === 0) return false;
  return values.every((value) => typeof value === 'string');
}

function buildPaymentHeaders(protocol, credential) {
  const defaultHeader = protocol === 'x402' ? 'X-PAYMENT' : 'Payment';

  if (typeof credential === 'string') {
    return { [defaultHeader]: credential };
  }

  if (isHeaderMap(credential)) {
    return credential;
  }

  if (credential && typeof credential === 'object') {
    const headers = credential.headers;
    if (isHeaderMap(headers)) {
      return headers;
    }
  }

  return { [defaultHeader]: JSON.stringify(credential) };
}

async function requestWithHeader(url, method, body, headers) {
  return fetch(url, createRequestInit(method, body, headers));
}

function toBase64(value) {
  return value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
}

function decodeHeaderJson(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
  } catch {}

  try {
    const decoded = Buffer.from(toBase64(trimmed), 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
  } catch {}

  return null;
}

function extractSettlement(response) {
  const directReference = response.headers.get('x402-settlement-tx')
    || response.headers.get('x-payment-reference')
    || undefined;

  const encodedPayload = response.headers.get('payment-response')
    || response.headers.get('x-payment-response')
    || response.headers.get('payment-receipt')
    || null;
  const decoded = decodeHeaderJson(encodedPayload);

  const decodedReference = decoded && typeof decoded.reference === 'string'
    ? decoded.reference
    : decoded && typeof decoded.transaction === 'string'
      ? decoded.transaction
      : decoded && typeof decoded.txHash === 'string'
        ? decoded.txHash
        : undefined;

  return {
    settlementReference: directReference || decodedReference,
    settlementPayload: decoded || undefined,
  };
}

async function runX402Flow(config) {
  const first = await requestWithoutPayment(config.url, config.method, config.body);
  if (first.status !== 402) {
    throw new Error(`x402 expected initial 402 from ${config.url}, received ${first.status}`);
  }

  const settled = await requestWithHeader(
    config.url,
    config.method,
    config.body,
    buildPaymentHeaders('x402', config.credential)
  );

  if (!settled.ok) {
    const body = await settled.text().catch(() => '');
    throw new Error(`x402 paid retry failed (${settled.status})${body ? `: ${body}` : ''}`);
  }

  const settlement = extractSettlement(settled);
  return {
    initialStatus: first.status,
    settledStatus: settled.status,
    settlementReference: settlement.settlementReference,
    settlementPayload: settlement.settlementPayload,
  };
}

async function runMppFlow(config) {
  const first = await requestWithoutPayment(config.url, config.method, config.body);
  if (first.status !== 402) {
    throw new Error(`MPP expected initial 402 from ${config.url}, received ${first.status}`);
  }

  const settled = await requestWithHeader(
    config.url,
    config.method,
    config.body,
    buildPaymentHeaders('mpp', config.credential)
  );

  if (!settled.ok) {
    const body = await settled.text().catch(() => '');
    throw new Error(`MPP paid retry failed (${settled.status})${body ? `: ${body}` : ''}`);
  }

  const settlement = extractSettlement(settled);
  return {
    initialStatus: first.status,
    settledStatus: settled.status,
    settlementReference: settlement.settlementReference,
    settlementPayload: settlement.settlementPayload,
  };
}

async function main() {
  const x402Url = process.env.LIVE_X402_URL;
  const mppUrl = process.env.LIVE_MPP_URL;

  const x402Credential = parseCredentialInput(process.env.LIVE_X402_CREDENTIAL_JSON, 'LIVE_X402_CREDENTIAL_JSON');
  const mppCredential = parseCredentialInput(process.env.LIVE_MPP_CREDENTIAL_JSON, 'LIVE_MPP_CREDENTIAL_JSON');

  const x402Body = parseBodyJson(process.env.LIVE_X402_REQUEST_BODY_JSON || '{}', 'LIVE_X402_REQUEST_BODY_JSON') || {};
  const mppBody = parseBodyJson(process.env.LIVE_MPP_REQUEST_BODY_JSON || '{}', 'LIVE_MPP_REQUEST_BODY_JSON') || {};

  const x402Method = (process.env.LIVE_X402_REQUEST_METHOD || 'GET').toUpperCase();
  const mppMethod = (process.env.LIVE_MPP_REQUEST_METHOD || 'GET').toUpperCase();

  const runX402 = Boolean(x402Url && x402Credential);
  const runMpp = Boolean(mppUrl && mppCredential);

  if (!runX402 && !runMpp) {
    throw new Error('No live paid flow configured. Set LIVE_X402_* and/or LIVE_MPP_* variables.');
  }

  const summary = {
    timestamp: new Date().toISOString(),
    flows: {},
  };

  if (runX402) {
    summary.flows.x402 = await runX402Flow({
      url: x402Url,
      method: x402Method,
      body: x402Body,
      credential: x402Credential,
    });
  } else {
    summary.flows.x402 = { skipped: true };
  }

  if (runMpp) {
    summary.flows.mpp = await runMppFlow({
      url: mppUrl,
      method: mppMethod,
      body: mppBody,
      credential: mppCredential,
    });
  } else {
    summary.flows.mpp = { skipped: true };
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`smoke-paid-live failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
