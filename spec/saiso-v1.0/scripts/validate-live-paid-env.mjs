#!/usr/bin/env node

function parseJsonObject(raw, key) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error(`${key} must be valid JSON object text.`);
  }
}

function parseCredential(raw, key) {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${key} must not be empty.`);
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
    // Allow literal header strings for protocols that require encoded payloads.
    return trimmed;
  }
}

function requiredMissing(vars) {
  return vars.filter((name) => !process.env[name]);
}

function validateProtocol(prefix) {
  const urlKey = `LIVE_${prefix}_URL`;
  const credentialKey = `LIVE_${prefix}_CREDENTIAL_JSON`;
  const methodKey = `LIVE_${prefix}_REQUEST_METHOD`;
  const bodyKey = `LIVE_${prefix}_REQUEST_BODY_JSON`;

  const url = process.env[urlKey];
  const credentialRaw = process.env[credentialKey];

  if (!url && !credentialRaw) {
    return { configured: false };
  }

  const missing = requiredMissing([urlKey, credentialKey]);
  if (missing.length > 0) {
    throw new Error(`Incomplete ${prefix} config. Missing: ${missing.join(', ')}`);
  }

  // Validate optional payloads up front to avoid later smoke failures.
  parseCredential(credentialRaw, credentialKey);
  parseJsonObject(process.env[bodyKey] || '{}', bodyKey);

  const method = (process.env[methodKey] || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new Error(`${methodKey} must be one of GET, POST, PUT, PATCH, DELETE.`);
  }

  return {
    configured: true,
    url,
    method,
  };
}

function main() {
  const x402 = validateProtocol('X402');
  const mpp = validateProtocol('MPP');

  if (!x402.configured && !mpp.configured) {
    throw new Error('No live paid protocol is configured. Set LIVE_X402_* and/or LIVE_MPP_* values.');
  }

  const summary = {
    ok: true,
    configured: {
      x402: x402.configured,
      mpp: mpp.configured,
    },
    notes: [
      'Credentials parsed successfully.',
      'Ready to run node spec/saiso-v1.0/scripts/smoke-paid-live.mjs',
    ],
  };

  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`validate-live-paid-env failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
