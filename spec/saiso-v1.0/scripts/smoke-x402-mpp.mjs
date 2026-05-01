#!/usr/bin/env node

import { createServer } from 'node:http';
import { once } from 'node:events';

const X402_FACILITATOR_URL = (process.env.X402_FACILITATOR_URL || 'https://www.x402.org/facilitator').replace(/\/$/, '');
const MPP_TEMPO_RPC_URL = process.env.MPP_TEMPO_RPC_URL || 'https://rpc.tempo.xyz';
const SKIP_NETWORK = process.env.SAISO_SMOKE_SKIP_NETWORK === 'true';

async function postJson(url, body, timeoutMs = 15000) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
}

async function runX402ConnectivityCheck() {
  const verify = await postJson(`${X402_FACILITATOR_URL}/verify`, {});
  if (verify.response.status !== 400) {
    throw new Error(`x402 /verify expected 400, received ${verify.response.status}`);
  }
  if (!verify.payload || typeof verify.payload !== 'object') {
    throw new Error('x402 /verify did not return JSON payload');
  }

  const settle = await postJson(`${X402_FACILITATOR_URL}/settle`, {});
  if (settle.response.status !== 400) {
    throw new Error(`x402 /settle expected 400, received ${settle.response.status}`);
  }
  if (!settle.payload || typeof settle.payload !== 'object') {
    throw new Error('x402 /settle did not return JSON payload');
  }

  return {
    verifyStatus: verify.response.status,
    settleStatus: settle.response.status,
  };
}

async function runMppTempoChainCheck() {
  const { response, payload } = await postJson(MPP_TEMPO_RPC_URL, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_chainId',
    params: [],
  });

  if (!response.ok) {
    throw new Error(`Tempo RPC returned HTTP ${response.status}`);
  }
  if (!payload || typeof payload !== 'object' || typeof payload.result !== 'string') {
    throw new Error('Tempo RPC did not return a chain id result');
  }

  return {
    chainIdHex: payload.result,
  };
}

async function runLocalMppRetryCheck() {
  const token = 'signed-mpp-token';
  const server = createServer((req, res) => {
    const paymentHeader = req.headers.payment;
    if (!paymentHeader) {
      res.statusCode = 402;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        request: {
          amount: '0.1',
          network: 'eip155:98865',
          payTo: '0xmerchant',
        },
      }));
      return;
    }

    if (!String(paymentHeader).includes(token)) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'invalid payment credential' }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('failed to start local MPP smoke server');
  }

  const url = `http://127.0.0.1:${address.port}/mpp`;
  const first = await fetch(url);
  if (first.status !== 402) {
    server.close();
    throw new Error(`local MPP service expected 402 first response, received ${first.status}`);
  }

  const challenge = await first.json();
  if (!challenge || typeof challenge !== 'object' || !challenge.request) {
    server.close();
    throw new Error('local MPP challenge payload invalid');
  }

  const settled = await fetch(url, {
    headers: {
      Payment: JSON.stringify({ token }),
    },
  });

  server.close();
  if (settled.status !== 200) {
    throw new Error(`local MPP settled response expected 200, received ${settled.status}`);
  }

  return { settledStatus: settled.status };
}

async function main() {
  const summary = {
    timestamp: new Date().toISOString(),
    checks: {},
  };

  if (!SKIP_NETWORK) {
    summary.checks.x402 = await runX402ConnectivityCheck();
    summary.checks.mppTempo = await runMppTempoChainCheck();
  } else {
    summary.checks.network = 'skipped';
  }

  summary.checks.mppLocalRetry = await runLocalMppRetryCheck();

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`smoke-x402-mpp failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
