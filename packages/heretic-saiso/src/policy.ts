import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { HereticIntegrationConfig, PolicyPreflightResult, StrictModeResolution } from './types.js';

interface PolicyPresence {
  paymentExists: boolean;
  trustExists: boolean;
  paymentValid: boolean;
  trustValid: boolean;
  paymentError?: string;
  trustError?: string;
}

function parseBoolean(input: string | undefined): boolean | undefined {
  if (input === undefined) return undefined;
  if (input === 'true') return true;
  if (input === 'false') return false;
  return undefined;
}

async function readJsonObjectIfPresent(filePath: string): Promise<{ exists: boolean; valid: boolean; error?: string }> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    if (!raw.trim()) {
      return { exists: true, valid: false, error: 'empty file' };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { exists: true, valid: false, error: 'must be a JSON object' };
    }

    return { exists: true, valid: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, valid: true };
    }

    return {
      exists: true,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function resolveStrictMode(
  integration: HereticIntegrationConfig,
  options: {
    cliStrict?: boolean;
    env?: NodeJS.ProcessEnv;
  } = {},
): StrictModeResolution {
  if (typeof options.cliStrict === 'boolean') {
    return {
      strict: options.cliStrict,
      source: 'cli',
    };
  }

  if (typeof integration.policy.strict === 'boolean') {
    return {
      strict: integration.policy.strict,
      source: 'config',
    };
  }

  const envStrict = parseBoolean((options.env ?? process.env).SAISO_HERETIC_POLICY_STRICT);
  if (typeof envStrict === 'boolean') {
    return {
      strict: envStrict,
      source: 'env',
    };
  }

  return {
    strict: false,
    source: 'default',
  };
}

export async function inspectPolicyPresence(projectRoot: string): Promise<PolicyPresence> {
  const paymentPath = path.join(projectRoot, '.saiso', 'payment-policy.json');
  const trustPath = path.join(projectRoot, '.saiso', 'trust-policy.json');

  const [payment, trust] = await Promise.all([
    readJsonObjectIfPresent(paymentPath),
    readJsonObjectIfPresent(trustPath),
  ]);

  return {
    paymentExists: payment.exists,
    trustExists: trust.exists,
    paymentValid: payment.valid,
    trustValid: trust.valid,
    paymentError: payment.error,
    trustError: trust.error,
  };
}

export async function preflightPolicyCheck(
  projectRoot: string,
  integration: HereticIntegrationConfig,
  options: {
    cliStrict?: boolean;
    operationClass: 'goal' | 'alert';
  },
): Promise<PolicyPreflightResult> {
  const strictMode = resolveStrictMode(integration, { cliStrict: options.cliStrict });
  const presence = await inspectPolicyPresence(projectRoot);

  if (strictMode.strict) {
    if (!presence.paymentExists || !presence.trustExists) {
      return {
        decision: 'deny',
        reason: 'strict mode requires both payment and trust policy files',
        strict: true,
        strictSource: strictMode.source,
      };
    }

    if (!presence.paymentValid || !presence.trustValid) {
      return {
        decision: 'deny',
        reason: `strict mode policy validation failed: payment=${presence.paymentError || 'ok'} trust=${presence.trustError || 'ok'}`,
        strict: true,
        strictSource: strictMode.source,
      };
    }
  }

  if (!presence.paymentExists || !presence.trustExists) {
    return {
      decision: 'require_approval',
      reason: 'policy files missing; explicit operator approval required',
      strict: strictMode.strict,
      strictSource: strictMode.source,
    };
  }

  if (!presence.paymentValid || !presence.trustValid) {
    return {
      decision: 'require_approval',
      reason: 'policy files invalid; explicit operator approval required',
      strict: strictMode.strict,
      strictSource: strictMode.source,
    };
  }

  return {
    decision: 'allow',
    reason: `${options.operationClass} policy preflight passed`,
    strict: strictMode.strict,
    strictSource: strictMode.source,
  };
}
