#!/usr/bin/env node

const DEFAULT_JUPITER_BASE = 'https://lite-api.jup.ag/swap/v1';
const DEFAULT_ZEROX_BASE = 'https://api.0x.org/swap/allowance-holder';
const DEFAULT_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const DEFAULT_PRIVY_BASE = 'https://api.privy.io/v1';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function redact(value) {
  if (!value) return value;
  const text = String(value);
  if (text.length <= 8) return '[REDACTED]';
  return `${text.slice(0, 4)}...[REDACTED]...${text.slice(-4)}`;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 240) };
  }
}

function pushResult(results, name, status, details = {}) {
  results.push({ name, status, ...details });
}

async function checkJupiter(results) {
  const baseUrl = (process.env.JUPITER_QUOTE_API_BASE || DEFAULT_JUPITER_BASE).replace(/\/$/, '');
  const url = new URL(`${baseUrl}/quote`);
  url.searchParams.set('inputMint', 'So11111111111111111111111111111111111111112');
  url.searchParams.set('outputMint', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  url.searchParams.set('amount', '1000000');
  url.searchParams.set('slippageBps', '50');

  const response = await fetch(url);
  const body = await readJsonResponse(response);
  if (!response.ok || !body.outAmount) {
    throw new Error(`Jupiter quote failed with HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
  }
  pushResult(results, 'jupiter_quote_public', 'passed', {
    statusCode: response.status,
    outAmount: body.outAmount,
  });
}

async function checkEvmRpc(results) {
  const rpcUrl = process.env.RPC_URL || DEFAULT_SEPOLIA_RPC;
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  });
  const body = await readJsonResponse(response);
  if (!response.ok || typeof body.result !== 'string') {
    throw new Error(`EVM RPC blockNumber failed with HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
  }
  pushResult(results, 'evm_rpc_block_number', 'passed', {
    statusCode: response.status,
    blockNumber: body.result,
    rpcUrl: rpcUrl === process.env.RPC_URL ? 'RPC_URL' : DEFAULT_SEPOLIA_RPC,
  });
}

function evaluatePolicy() {
  const maxCostUsd = Number(process.env.PAYMENT_MAX_PER_REQUEST_USD || 5);
  const minTrustScore = Number(process.env.TRUST_MIN_SCORE || 0.7);
  const amountUsd = 2;
  const trustScore = 0.9;
  const blocked = (process.env.PAYMENT_BLOCKED_RECIPIENTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const recipient = '0xabc';
  const violations = [];
  if (amountUsd > maxCostUsd) violations.push('max_cost_exceeded');
  if (trustScore < minTrustScore) violations.push('trust_score_too_low');
  if (blocked.includes(recipient)) violations.push('recipient_blocked');
  return {
    approved: violations.length === 0,
    violations,
    checks: { amountUsd, maxCostUsd, trustScore, minTrustScore, recipient },
  };
}

async function checkPolicy(results) {
  const policy = evaluatePolicy();
  if (!policy.approved) {
    throw new Error(`Policy smoke unexpectedly blocked: ${policy.violations.join(', ')}`);
  }
  pushResult(results, 'policy_preflight_local', 'passed', policy);
}

async function checkZeroEx(results) {
  const apiKey = process.env.ZEROX_API_KEY;
  if (!apiKey) {
    pushResult(results, 'zerox_quote_authenticated', 'skipped', {
      reason: 'ZEROX_API_KEY is not set',
      requiredEnv: ['ZEROX_API_KEY'],
    });
    return;
  }

  const baseUrl = (process.env.ZEROX_SWAP_API_BASE || DEFAULT_ZEROX_BASE).replace(/\/$/, '');
  const url = new URL(`${baseUrl}/price`);
  url.searchParams.set('chainId', process.env.CHAIN_ID || '1');
  url.searchParams.set('sellToken', '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
  url.searchParams.set('buyToken', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
  url.searchParams.set('sellAmount', '1000000000000000000');

  const response = await fetch(url, {
    headers: {
      '0x-version': 'v2',
      '0x-api-key': apiKey,
    },
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`0x quote failed with HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
  }
  pushResult(results, 'zerox_quote_authenticated', 'passed', {
    statusCode: response.status,
    buyAmount: body.buyAmount,
    zeroXApiKey: redact(apiKey),
  });
}

async function checkPrivy(results) {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    pushResult(results, 'privy_credentials', 'skipped', {
      reason: 'PRIVY_APP_ID and/or PRIVY_APP_SECRET are not set',
      requiredEnv: ['PRIVY_APP_ID', 'PRIVY_APP_SECRET'],
    });
    return;
  }

  const baseUrl = (process.env.PRIVY_BASE_URL || DEFAULT_PRIVY_BASE).replace(/\/$/, '');
  const walletId = process.env.PRIVY_LIVE_WALLET_ID;
  const path = walletId ? `/wallets/${encodeURIComponent(walletId)}` : '/wallets';
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
      'content-type': 'application/json',
    },
  });
  const body = await readJsonResponse(response);
  if (response.status === 401 || response.status === 403 || response.status >= 500) {
    throw new Error(`Privy credential check failed with HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
  }

  pushResult(results, walletId ? 'privy_wallet_read' : 'privy_wallets_reachability', 'passed', {
    statusCode: response.status,
    appId: redact(appId),
    walletId: walletId ? redact(walletId) : undefined,
    note: response.ok ? undefined : 'Privy responded without auth/server failure; endpoint support may vary by account/API version.',
  });
}

async function runCheck(results, name, fn) {
  try {
    await fn(results);
  } catch (error) {
    pushResult(results, name, 'failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const failOnSkippedCredential = args['fail-on-skipped-credential'] === 'true';
  const results = [];

  await runCheck(results, 'jupiter_quote_public', checkJupiter);
  await runCheck(results, 'evm_rpc_block_number', checkEvmRpc);
  await runCheck(results, 'policy_preflight_local', checkPolicy);
  await runCheck(results, 'zerox_quote_authenticated', checkZeroEx);
  await runCheck(results, 'privy_credentials', checkPrivy);

  const failed = results.filter((result) => result.status === 'failed');
  const skippedCredentials = results.filter((result) =>
    result.status === 'skipped'
    && Array.isArray(result.requiredEnv)
    && result.requiredEnv.length > 0
  );
  const ok = failed.length === 0 && (!failOnSkippedCredential || skippedCredentials.length === 0);

  console.log(JSON.stringify({
    ok,
    results,
  }, null, 2));

  if (!ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`live-template-smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
