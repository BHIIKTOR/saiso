export interface ExecutionIntent {
  fromToken: string;
  toToken: string;
  amountUsd: number;
  slippageBps: number;
}

export interface ExecutionPolicy {
  maxNotionalUsd: number;
  maxSlippageBps: number;
  requireSimulation: boolean;
  maxRetries: number;
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
}

export type ExecutionStatus =
  | 'queued'
  | 'simulated'
  | 'broadcasted'
  | 'confirmed'
  | 'replaced'
  | 'failed';

export interface ExecutionRecord {
  id: string;
  intent: ExecutionIntent;
  status: ExecutionStatus;
  attempts: number;
  createdAtIso: string;
  updatedAtIso: string;
  failureClass?: 'policy' | 'simulation' | 'network' | 'settlement' | 'unknown';
}

export interface ExecuteOptions {
  simulationPassed: boolean;
  broadcastAccepted: boolean;
  confirmed: boolean;
}

export function validateIntent(intent: ExecutionIntent, policy: ExecutionPolicy): string[] {
  const errors: string[] = [];

  if (intent.amountUsd > policy.maxNotionalUsd) {
    errors.push('amount exceeds max notional');
  }
  if (intent.slippageBps > policy.maxSlippageBps) {
    errors.push('slippage exceeds limit');
  }
  if (intent.amountUsd <= 0) {
    errors.push('amount must be positive');
  }
  if (!intent.fromToken || !intent.toToken) {
    errors.push('token symbols are required');
  }

  return errors;
}

export function runPreflight(intent: ExecutionIntent, policy: ExecutionPolicy, simulationPassed: boolean): PreflightResult {
  const errors = validateIntent(intent, policy);

  if (policy.requireSimulation && !simulationPassed) {
    errors.push('simulation is required and did not pass');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function createExecutionRecord(intent: ExecutionIntent, nowIso: string = new Date().toISOString()): ExecutionRecord {
  return {
    id: 'exec-' + Date.now().toString(36),
    intent,
    status: 'queued',
    attempts: 0,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

export function transitionStatus(
  record: ExecutionRecord,
  nextStatus: ExecutionStatus,
  nowIso: string = new Date().toISOString(),
  failureClass?: ExecutionRecord['failureClass']
): ExecutionRecord {
  return {
    ...record,
    status: nextStatus,
    updatedAtIso: nowIso,
    failureClass,
  };
}

export function canRetry(record: ExecutionRecord, policy: ExecutionPolicy): boolean {
  if (record.status !== 'failed') {
    return false;
  }
  return record.attempts < policy.maxRetries;
}

export function registerAttempt(record: ExecutionRecord, nowIso: string = new Date().toISOString()): ExecutionRecord {
  return {
    ...record,
    attempts: record.attempts + 1,
    updatedAtIso: nowIso,
  };
}

export function classifyFailure(errorMessage: string): ExecutionRecord['failureClass'] {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('slippage') || msg.includes('notional') || msg.includes('policy')) {
    return 'policy';
  }
  if (msg.includes('simulation')) {
    return 'simulation';
  }
  if (msg.includes('timeout') || msg.includes('rpc') || msg.includes('network')) {
    return 'network';
  }
  if (msg.includes('settle') || msg.includes('payment')) {
    return 'settlement';
  }
  return 'unknown';
}

export function defaultExecutionPolicy(): ExecutionPolicy {
  return {
    maxNotionalUsd: 750,
    maxSlippageBps: 80,
    requireSimulation: true,
    maxRetries: 2,
  };
}

export function executeIntentOnce(
  intent: ExecutionIntent,
  policy: ExecutionPolicy,
  options: ExecuteOptions,
  nowIso: string = new Date().toISOString()
): ExecutionRecord {
  let record = createExecutionRecord(intent, nowIso);
  record = registerAttempt(record, nowIso);

  const preflight = runPreflight(intent, policy, options.simulationPassed);
  if (!preflight.ok) {
    return transitionStatus(
      record,
      'failed',
      nowIso,
      classifyFailure(preflight.errors.join(', '))
    );
  }

  record = transitionStatus(record, 'simulated', nowIso);

  if (!options.broadcastAccepted) {
    return transitionStatus(record, 'failed', nowIso, 'network');
  }

  record = transitionStatus(record, 'broadcasted', nowIso);

  if (!options.confirmed) {
    return transitionStatus(record, 'failed', nowIso, 'settlement');
  }

  return transitionStatus(record, 'confirmed', nowIso);
}
