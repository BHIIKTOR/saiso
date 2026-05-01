import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PaymentConfig } from '@saiso/core';

export type RoutingProfile = 'trust-first' | 'cost-first' | 'balanced';
export type PaymentProtocol = 'x402' | 'mpp' | 'auto';

export interface TrustPolicyFile {
  enabled?: boolean;
  minTrustScore?: number;
  routingProfile?: RoutingProfile;
  reputationSource?: string;
  validationSource?: string;
}

export interface LoadedPolicies {
  payment?: Partial<PaymentConfig>;
  trust?: TrustPolicyFile;
  paymentPath: string;
  trustPath: string;
}

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PolicyPrecedenceLayers<T> {
  cli?: T;
  policyFile?: T;
  env?: T;
  defaults?: T;
}

export interface McpCallPolicyInputs {
  paid?: boolean;
  paymentProtocol?: PaymentProtocol;
  minTrustScore?: number;
  maxCostUsd?: number;
  routingProfile?: RoutingProfile;
  operationClass?: string;
}

export interface McpCallRuntimePolicyConfig {
  payment?: Partial<PaymentConfig>;
  trust?: {
    enabled?: boolean;
    minTrustScore?: number;
    routingProfile?: RoutingProfile;
  };
}

export interface ResolvedMcpCallPolicies {
  paymentEnabled: boolean;
  paymentConfig?: PaymentConfig;
  defaultMinTrustScore?: number;
  defaultMaxCostUsd?: number;
  defaultRoutingProfile: RoutingProfile;
  defaultOperationClass?: string;
}

export function resolveWithPrecedence<T>(layers: PolicyPrecedenceLayers<T>): T | undefined {
  if (layers.cli !== undefined) {
    return layers.cli;
  }
  if (layers.policyFile !== undefined) {
    return layers.policyFile;
  }
  if (layers.env !== undefined) {
    return layers.env;
  }
  return layers.defaults;
}

export function resolveMcpCallPolicies(
  cli: McpCallPolicyInputs,
  loadedPolicies: LoadedPolicies,
  runtimeConfig: McpCallRuntimePolicyConfig,
): ResolvedMcpCallPolicies {
  const paymentEnabled = resolveWithPrecedence<boolean>({
    cli: cli.paid === true ? true : undefined,
    policyFile: loadedPolicies.payment?.enabled,
    env: runtimeConfig.payment?.enabled,
    defaults: false,
  }) ?? false;

  const paymentProtocol = resolveWithPrecedence<PaymentProtocol>({
    cli: cli.paymentProtocol,
    policyFile: loadedPolicies.payment?.preferredProtocol,
    env: runtimeConfig.payment?.preferredProtocol,
    defaults: 'auto',
  }) || 'auto';

  const paymentConfig = paymentEnabled
    ? {
        ...(runtimeConfig.payment || {}),
        ...(loadedPolicies.payment || {}),
        enabled: true,
        preferredProtocol: paymentProtocol,
      } as PaymentConfig
    : undefined;

  const defaultMinTrustScore = typeof cli.minTrustScore === 'number'
    ? cli.minTrustScore
    : loadedPolicies.trust?.enabled === false
      ? undefined
      : resolveWithPrecedence<number>({
          policyFile: loadedPolicies.trust?.minTrustScore,
          env: runtimeConfig.trust?.enabled ? runtimeConfig.trust.minTrustScore : undefined,
        });

  const defaultRoutingProfile = resolveWithPrecedence<RoutingProfile>({
    cli: cli.routingProfile,
    policyFile: loadedPolicies.trust?.routingProfile,
    env: runtimeConfig.trust?.routingProfile,
    defaults: 'trust-first',
  }) || 'trust-first';

  const defaultOperationClass = typeof cli.operationClass === 'string' && cli.operationClass.trim()
    ? cli.operationClass.trim()
    : undefined;

  const defaultMaxCostUsd = typeof cli.maxCostUsd === 'number'
    ? cli.maxCostUsd
    : undefined;

  return {
    paymentEnabled,
    paymentConfig,
    defaultMinTrustScore,
    defaultRoutingProfile,
    defaultOperationClass,
    defaultMaxCostUsd,
  };
}

async function readJsonIfPresent(filePath: string): Promise<unknown | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function ensureStringArray(value: unknown, field: string, errors: string[]): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of strings`);
    return undefined;
  }

  const items = value
    .filter(item => typeof item === 'string')
    .map(item => (item as string).trim())
    .filter(Boolean);

  if (items.length !== value.length) {
    errors.push(`${field} contains non-string entries`);
  }

  return items;
}

function ensureNumber(value: unknown, field: string, errors: string[]): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    errors.push(`${field} must be a number`);
    return undefined;
  }
  return value;
}

function ensureObject(value: unknown, field: string, errors: string[]): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${field} must be a JSON object`);
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function validatePaymentPolicy(input: unknown): PolicyValidationResult & { normalized?: Partial<PaymentConfig> } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: ['payment policy must be a JSON object'],
      warnings,
    };
  }

  const obj = input as Record<string, unknown>;
  const normalized: Partial<PaymentConfig> = {};

  if (obj.enabled !== undefined) {
    if (typeof obj.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    } else {
      normalized.enabled = obj.enabled;
    }
  }

  if (obj.preferredProtocol !== undefined) {
    if (obj.preferredProtocol !== 'x402' && obj.preferredProtocol !== 'mpp' && obj.preferredProtocol !== 'auto') {
      errors.push('preferredProtocol must be one of: x402, mpp, auto');
    } else {
      normalized.preferredProtocol = obj.preferredProtocol;
    }
  }

  const maxPerRequestUsd = ensureNumber(obj.maxPerRequestUsd, 'maxPerRequestUsd', errors);
  if (maxPerRequestUsd !== undefined) {
    if (maxPerRequestUsd < 0) {
      errors.push('maxPerRequestUsd must be non-negative');
    } else {
      normalized.maxPerRequestUsd = maxPerRequestUsd;
    }
  }

  const dailyBudgetUsd = ensureNumber(obj.dailyBudgetUsd, 'dailyBudgetUsd', errors);
  if (dailyBudgetUsd !== undefined) {
    if (dailyBudgetUsd < 0) {
      errors.push('dailyBudgetUsd must be non-negative');
    } else {
      normalized.dailyBudgetUsd = dailyBudgetUsd;
    }
  }

  normalized.allowedRecipients = ensureStringArray(obj.allowedRecipients, 'allowedRecipients', errors);
  normalized.blockedRecipients = ensureStringArray(obj.blockedRecipients, 'blockedRecipients', errors);

  const toolMax = ensureObject(obj.toolMaxPerRequestUsd, 'toolMaxPerRequestUsd', errors);
  if (toolMax) {
    const next: Record<string, number> = {};
    for (const [tool, value] of Object.entries(toolMax)) {
      if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
        errors.push(`toolMaxPerRequestUsd.${tool} must be a non-negative number`);
        continue;
      }
      next[tool] = value;
    }
    normalized.toolMaxPerRequestUsd = next;
  }

  const operationClassMinTrustScore = ensureObject(obj.operationClassMinTrustScore, 'operationClassMinTrustScore', errors);
  if (operationClassMinTrustScore) {
    const next: Record<string, number> = {};
    for (const [operationClass, value] of Object.entries(operationClassMinTrustScore)) {
      if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
        errors.push(`operationClassMinTrustScore.${operationClass} must be between 0 and 1`);
        continue;
      }
      next[operationClass] = value;
    }
    normalized.operationClassMinTrustScore = next;
  }

  const protocolAllow = ensureObject(obj.protocolAllowedRecipients, 'protocolAllowedRecipients', errors);
  if (protocolAllow) {
    const x402 = ensureStringArray(protocolAllow.x402, 'protocolAllowedRecipients.x402', errors);
    const mpp = ensureStringArray(protocolAllow.mpp, 'protocolAllowedRecipients.mpp', errors);
    normalized.protocolAllowedRecipients = {
      ...(x402 ? { x402 } : {}),
      ...(mpp ? { mpp } : {}),
    };
  }

  const protocolBlock = ensureObject(obj.protocolBlockedRecipients, 'protocolBlockedRecipients', errors);
  if (protocolBlock) {
    const x402 = ensureStringArray(protocolBlock.x402, 'protocolBlockedRecipients.x402', errors);
    const mpp = ensureStringArray(protocolBlock.mpp, 'protocolBlockedRecipients.mpp', errors);
    normalized.protocolBlockedRecipients = {
      ...(x402 ? { x402 } : {}),
      ...(mpp ? { mpp } : {}),
    };
  }

  if (!normalized.enabled) {
    warnings.push('payment policy is present but enabled=false; paid calls will be disabled unless CLI flags enable them');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function validateTrustPolicy(input: unknown): PolicyValidationResult & { normalized?: TrustPolicyFile } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: ['trust policy must be a JSON object'],
      warnings,
    };
  }

  const obj = input as Record<string, unknown>;
  const normalized: TrustPolicyFile = {};

  if (obj.enabled !== undefined) {
    if (typeof obj.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    } else {
      normalized.enabled = obj.enabled;
    }
  }

  if (obj.minTrustScore !== undefined) {
    if (typeof obj.minTrustScore !== 'number' || Number.isNaN(obj.minTrustScore)) {
      errors.push('minTrustScore must be a number');
    } else if (obj.minTrustScore < 0 || obj.minTrustScore > 1) {
      errors.push('minTrustScore must be between 0 and 1');
    } else {
      normalized.minTrustScore = obj.minTrustScore;
    }
  }

  if (obj.routingProfile !== undefined) {
    if (obj.routingProfile !== 'trust-first' && obj.routingProfile !== 'cost-first' && obj.routingProfile !== 'balanced') {
      errors.push('routingProfile must be one of: trust-first, cost-first, balanced');
    } else {
      normalized.routingProfile = obj.routingProfile;
    }
  }

  if (obj.reputationSource !== undefined) {
    if (typeof obj.reputationSource !== 'string') {
      errors.push('reputationSource must be a string');
    } else {
      normalized.reputationSource = obj.reputationSource;
    }
  }

  if (obj.validationSource !== undefined) {
    if (typeof obj.validationSource !== 'string') {
      errors.push('validationSource must be a string');
    } else {
      normalized.validationSource = obj.validationSource;
    }
  }

  if (normalized.enabled && normalized.minTrustScore === undefined) {
    warnings.push('trust policy enabled=true with no minTrustScore; routing/profile constraints may be too permissive');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export async function loadProjectPolicies(projectRoot: string): Promise<LoadedPolicies> {
  const paymentPath = path.join(projectRoot, '.saiso', 'payment-policy.json');
  const trustPath = path.join(projectRoot, '.saiso', 'trust-policy.json');

  const paymentRaw = await readJsonIfPresent(paymentPath);
  const trustRaw = await readJsonIfPresent(trustPath);

  const loaded: LoadedPolicies = {
    paymentPath,
    trustPath,
  };

  if (paymentRaw !== null) {
    const result = validatePaymentPolicy(paymentRaw);
    if (!result.valid) {
      throw new Error(`Invalid payment policy at ${paymentPath}: ${result.errors.join('; ')}`);
    }
    loaded.payment = result.normalized;
  }

  if (trustRaw !== null) {
    const result = validateTrustPolicy(trustRaw);
    if (!result.valid) {
      throw new Error(`Invalid trust policy at ${trustPath}: ${result.errors.join('; ')}`);
    }
    loaded.trust = result.normalized;
  }

  return loaded;
}
