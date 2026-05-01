import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { GoalRunner, AlertSchedulerState } from '@saiso/core';
import type {
  AlertRule,
  AlertsStateData,
  GoalPolicyEvent,
  GoalsStateData,
  HereticIntegrationConfig,
  HereticStateFileName,
  LockMetadata,
  StateEnvelope,
  TransportCorrelationRecord,
  TransportFailureCode,
  TransportIndexData,
  TransportOutboxData,
  TransportOutboxEntry,
  WorkspaceMapData,
} from './types.js';
import { HereticSaisoError } from './errors.js';

const PROCESS_START_TIME = new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString();

const SCHEMA_VERSION_BY_FILE: Record<HereticStateFileName, string> = {
  'integration.json': 'integration.v1',
  'workspace-map.json': 'workspace-map.v1',
  'goals.json': 'goals.v1',
  'alerts.json': 'alerts.v1',
  'transport-index.json': 'transport-index.v1',
  'transport-outbox.json': 'transport-outbox.v1',
};

const LEGACY_SCHEMA_NUMBER = 1;
const STATE_LOCK_NAME = '.state.lock';

const DEFAULT_INTEGRATION: HereticIntegrationConfig = {
  daemon: {
    daemonPath: null,
    configDir: null,
    socketPath: null,
  },
  transport: {
    selected: 'none',
    transportIdentity: null,
    terminalTtlMs: 7 * 24 * 60 * 60 * 1000,
    unresolvedTtlMs: 30 * 24 * 60 * 60 * 1000,
    tombstoneTtlMs: 180 * 24 * 60 * 60 * 1000,
  },
  policy: {
    strict: false,
  },
};

const DEFAULT_WORKSPACE_MAP: WorkspaceMapData = {
  mappings: {},
};

const DEFAULT_GOALS_STATE: GoalsStateData = {
  goals: [],
  policyEvents: [],
  history: [],
};

const DEFAULT_ALERTS_STATE: AlertsStateData = {
  rules: [],
  schedulerState: {
    sentAtByDedupeKey: {},
    payloadHashByDedupeKey: {},
    retryQueue: [],
  },
  history: [],
};

const DEFAULT_TRANSPORT_INDEX: TransportIndexData = {
  entries: {},
};

const DEFAULT_TRANSPORT_OUTBOX: TransportOutboxData = {
  entries: {},
};

interface LockOptions {
  timeoutMs?: number;
  staleMs?: number;
  retryDelayMs?: number;
}

function parseJson<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new HereticSaisoError('HERETIC_STATE_PARSE_INVALID', `Invalid JSON at ${context}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

const TRANSPORT_FAILURE_CODES = new Set<TransportFailureCode>([
  'TRANSPORT_TURN_TIMEOUT',
  'TRANSPORT_TURN_FAILED',
  'TRANSPORT_DAEMON_UNAVAILABLE',
  'TRANSPORT_DELIVERY_FAILED',
  'TRANSPORT_PAYLOAD_INVALID',
  'TRANSPORT_AUTH_FAILED',
]);

const TRANSPORT_ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  pending_submit: new Set(['pending_submit', 'pending_turn', 'pending_delivery', 'delivered_terminal', 'failed_recoverable', 'failed_terminal', 'needs_operator_review', 'tombstoned']),
  pending_turn: new Set(['pending_turn', 'pending_delivery', 'failed_recoverable', 'failed_terminal', 'needs_operator_review', 'tombstoned']),
  pending_delivery: new Set(['pending_delivery', 'delivered_terminal', 'failed_recoverable', 'needs_operator_review', 'tombstoned']),
  delivered_terminal: new Set(['delivered_terminal', 'tombstoned']),
  failed_recoverable: new Set(['failed_recoverable', 'pending_turn', 'pending_delivery', 'delivered_terminal', 'needs_operator_review', 'failed_terminal', 'tombstoned']),
  failed_terminal: new Set(['failed_terminal', 'needs_operator_review', 'tombstoned']),
  needs_operator_review: new Set(['needs_operator_review', 'tombstoned']),
  tombstoned: new Set(['tombstoned']),
};

function classifyLegacyTransportReason(message: string): {
  code: TransportFailureCode;
  retryable: boolean;
  status: TransportCorrelationRecord['status'];
} {
  const normalized = message.trim().toLowerCase();
  if (/timeout|timed out/.test(normalized)) {
    return {
      code: 'TRANSPORT_TURN_TIMEOUT',
      retryable: true,
      status: 'failed_recoverable',
    };
  }
  if (/daemon|socket|connect|econn|enoent|unavailable/.test(normalized)) {
    return {
      code: 'TRANSPORT_DAEMON_UNAVAILABLE',
      retryable: true,
      status: 'failed_recoverable',
    };
  }
  if (/delivery|telegram|webhook/.test(normalized)) {
    return {
      code: 'TRANSPORT_DELIVERY_FAILED',
      retryable: true,
      status: 'failed_recoverable',
    };
  }
  if (/invalid.*payload|payload.*invalid|malformed/.test(normalized)) {
    return {
      code: 'TRANSPORT_PAYLOAD_INVALID',
      retryable: false,
      status: 'needs_operator_review',
    };
  }
  if (/auth|401|403|forbidden|unauthorized/.test(normalized)) {
    return {
      code: 'TRANSPORT_AUTH_FAILED',
      retryable: false,
      status: 'needs_operator_review',
    };
  }
  return {
    code: 'TRANSPORT_TURN_FAILED',
    retryable: false,
    status: 'failed_terminal',
  };
}

function normalizeTransportFailure(
  value: unknown,
  legacyReason: string | undefined,
  legacyStatus: string,
): TransportCorrelationRecord['failure'] | undefined {
  const candidate = asObject(value);
  const candidateCode = typeof candidate.code === 'string' ? candidate.code : null;
  const candidateMessage = typeof candidate.message === 'string'
    ? candidate.message
    : typeof legacyReason === 'string'
      ? legacyReason
      : '';
  if (candidateCode && TRANSPORT_FAILURE_CODES.has(candidateCode as TransportFailureCode)) {
    return {
      code: candidateCode as TransportFailureCode,
      message: candidateMessage || candidateCode,
      retryable: typeof candidate.retryable === 'boolean' ? candidate.retryable : false,
      at: isIsoString(candidate.at) ? candidate.at : nowIso(),
    };
  }

  if (typeof legacyReason === 'string' && legacyReason.trim()) {
    const classified = classifyLegacyTransportReason(legacyReason);
    return {
      code: classified.code,
      message: legacyReason,
      retryable: classified.retryable,
      at: nowIso(),
    };
  }

  if (legacyStatus === 'failed_terminal') {
    return {
      code: 'TRANSPORT_TURN_FAILED',
      message: 'Turn failed without persisted failure reason',
      retryable: false,
      at: nowIso(),
    };
  }

  return undefined;
}

function normalizeTransportStatus(entry: Record<string, unknown>): TransportCorrelationRecord['status'] {
  const rawStatus = typeof entry.status === 'string' ? entry.status : '';
  if (rawStatus === 'pending') return 'pending_turn';
  if (rawStatus === 'terminal') return 'delivered_terminal';
  if (rawStatus === 'tombstone') return 'tombstoned';
  if (rawStatus === 'needs_operator_review') {
    const legacyReason = typeof entry.needsReviewReason === 'string' ? entry.needsReviewReason : '';
    return classifyLegacyTransportReason(legacyReason).status;
  }

  if (TRANSPORT_ALLOWED_TRANSITIONS[rawStatus]) {
    return rawStatus as TransportCorrelationRecord['status'];
  }

  throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Invalid transport status '${rawStatus || '<missing>'}'`);
}

function assertTransportTransitionAllowed(
  current: TransportCorrelationRecord['status'],
  next: TransportCorrelationRecord['status'],
): void {
  const allowed = TRANSPORT_ALLOWED_TRANSITIONS[current];
  if (allowed?.has(next)) {
    return;
  }
  throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Illegal transport transition ${current} -> ${next}`);
}

function envelope<T>(schemaVersion: string, revision: number, data: T): StateEnvelope<T> {
  return {
    schemaVersion,
    revision,
    updatedAt: nowIso(),
    data,
  };
}

function getStateDir(projectRoot: string): string {
  return path.join(projectRoot, '.saiso', 'heretic');
}

function getStateFilePath(projectRoot: string, fileName: HereticStateFileName): string {
  return path.join(getStateDir(projectRoot), fileName);
}

function getLockFilePath(projectRoot: string): string {
  return path.join(getStateDir(projectRoot), STATE_LOCK_NAME);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asNumberRecord(value: unknown, context: string): Record<string, number> {
  const source = asObject(value);
  const normalized: Record<string, number> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `${context}.${key} must be a finite number`);
    }
    normalized[key] = entry;
  }
  return normalized;
}

function asStringRecord(value: unknown, context: string): Record<string, string> {
  const source = asObject(value);
  const normalized: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry !== 'string') {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `${context}.${key} must be a string`);
    }
    normalized[key] = entry;
  }
  return normalized;
}

function normalizeRetryQueue(value: unknown): AlertSchedulerState['retryQueue'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entryValue, index) => {
    const entry = asObject(entryValue);
    const event = asObject(entry.event);

    const payload = event.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `schedulerState.retryQueue[${index}].event.payload must be an object`);
    }

    if (typeof event.id !== 'string' || typeof event.key !== 'string' || !isIsoString(event.occurredAt)) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Invalid schedulerState.retryQueue[${index}].event`);
    }

    if (typeof entry.attempt !== 'number' || !Number.isInteger(entry.attempt) || entry.attempt < 0) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `schedulerState.retryQueue[${index}].attempt must be a non-negative integer`);
    }

    if (typeof entry.runAt !== 'number' || !Number.isFinite(entry.runAt)) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `schedulerState.retryQueue[${index}].runAt must be a finite number`);
    }

    return {
      event: {
        id: event.id,
        key: event.key,
        payload: payload as Record<string, unknown>,
        occurredAt: event.occurredAt,
      },
      attempt: entry.attempt,
      runAt: entry.runAt,
    };
  });
}

function isIsoString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function validateAlertRule(rule: unknown): void {
  const candidate = asObject(rule);
  const op = candidate.operator;
  const targetValue = candidate.targetValue;
  const intervalMs = candidate.intervalMs;
  const cooldownMs = candidate.cooldownMs;

  if (typeof op !== 'string') {
    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', 'Alert rule missing operator');
  }
  if (typeof targetValue !== 'number' || !Number.isFinite(targetValue)) {
    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', 'Alert rule missing targetValue');
  }
  if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs)) {
    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', 'Alert rule missing intervalMs');
  }
  if (typeof cooldownMs !== 'number' || !Number.isFinite(cooldownMs)) {
    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', 'Alert rule missing cooldownMs');
  }
}

function validateIntegrationData(data: unknown): HereticIntegrationConfig {
  const root = asObject(data);
  const daemon = asObject(root.daemon);
  const transport = asObject(root.transport);
  const policy = asObject(root.policy);

  const normalized: HereticIntegrationConfig = {
    daemon: {
      daemonPath: typeof daemon.daemonPath === 'string' ? daemon.daemonPath : null,
      configDir: typeof daemon.configDir === 'string' ? daemon.configDir : null,
      socketPath: typeof daemon.socketPath === 'string' ? daemon.socketPath : null,
    },
    transport: {
      selected: typeof transport.selected === 'string' ? transport.selected : DEFAULT_INTEGRATION.transport.selected,
      transportIdentity: typeof transport.transportIdentity === 'string' ? transport.transportIdentity : null,
      terminalTtlMs: typeof transport.terminalTtlMs === 'number' ? transport.terminalTtlMs : DEFAULT_INTEGRATION.transport.terminalTtlMs,
      unresolvedTtlMs: typeof transport.unresolvedTtlMs === 'number' ? transport.unresolvedTtlMs : DEFAULT_INTEGRATION.transport.unresolvedTtlMs,
      tombstoneTtlMs: typeof transport.tombstoneTtlMs === 'number' ? transport.tombstoneTtlMs : DEFAULT_INTEGRATION.transport.tombstoneTtlMs,
    },
    policy: {
      strict: typeof policy.strict === 'boolean' ? policy.strict : false,
    },
  };

  if (normalized.transport.selected !== 'none' && !normalized.transport.transportIdentity) {
    // valid in bootstrap only when adapter can resolve identity dynamically; keep state valid but explicit.
  }

  return normalized;
}

function validateWorkspaceMapData(data: unknown): WorkspaceMapData {
  const root = asObject(data);
  const mappings = asObject(root.mappings);
  const normalized: WorkspaceMapData = { mappings: {} };

  for (const [key, value] of Object.entries(mappings)) {
    const entry = asObject(value);
    if (typeof entry.workspaceRoot !== 'string' || typeof entry.sessionId !== 'string') {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Invalid workspace map entry '${key}'`);
    }

    normalized.mappings[key] = {
      workspaceRoot: entry.workspaceRoot,
      hereticProjectRoot: typeof entry.hereticProjectRoot === 'string' ? entry.hereticProjectRoot : entry.workspaceRoot,
      projectId: typeof entry.projectId === 'string' ? entry.projectId : entry.workspaceRoot,
      sessionId: entry.sessionId,
      updatedAt: isIsoString(entry.updatedAt) ? entry.updatedAt : nowIso(),
    };
  }

  return normalized;
}

function validateGoalsData(data: unknown): GoalsStateData {
  const root = asObject(data);
  const goals = Array.isArray(root.goals) ? root.goals : [];
  const policyEvents = Array.isArray(root.policyEvents) ? root.policyEvents : [];
  const history = Array.isArray(root.history) ? root.history : [];

  const normalizedPolicyEvents: GoalPolicyEvent[] = policyEvents.map((event) => {
    const candidate = asObject(event);
    if (typeof candidate.goalId !== 'string' || typeof candidate.actor !== 'string') {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', 'Invalid goal policy event');
    }
    return {
      eventId: typeof candidate.eventId === 'string' ? candidate.eventId : `event-${randomUUID()}`,
      goalId: candidate.goalId,
      at: isIsoString(candidate.at) ? candidate.at : nowIso(),
      actor: candidate.actor,
      decision: (candidate.decision === 'allow' || candidate.decision === 'require_approval' || candidate.decision === 'deny') ? candidate.decision : 'deny',
      reason: typeof candidate.reason === 'string' ? candidate.reason : 'unknown',
    };
  });

  return {
    goals: goals as GoalsStateData['goals'],
    policyEvents: normalizedPolicyEvents,
    history: history as GoalsStateData['history'],
  };
}

function migrateLegacyAlertRule(asset: string, rule: unknown, intervalMs: number, cooldownMs: number): AlertRule['rule'] {
  if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
    validateAlertRule(rule);
    return rule as AlertRule['rule'];
  }

  if (typeof rule !== 'string') {
    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', 'Invalid legacy alert rule');
  }

  const normalized = rule.replace(/\s+/g, '').toLowerCase();
  const match = normalized.match(/^price(>=|<=|>|<)(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Unsupported legacy alert rule '${rule}'`);
  }

  const operator = match[1];
  const target = Number(match[2]);
  const map: Record<string, AlertRule['rule']['operator']> = {
    '>': 'gt',
    '>=': 'gte',
    '<': 'lt',
    '<=': 'lte',
  };

  return {
    asset,
    operator: map[operator],
    targetValue: target,
    intervalMs,
    cooldownMs,
  };
}

function validateAlertsData(data: unknown): AlertsStateData {
  const root = asObject(data);
  const rules = Array.isArray(root.rules) ? root.rules : [];
  const schedulerState = asObject(root.schedulerState);
  const history = Array.isArray(root.history) ? root.history : [];

  const normalizedRules: AlertRule[] = rules.map((ruleValue) => {
    const rule = asObject(ruleValue);
    const asset = typeof rule.asset === 'string' ? rule.asset : '';
    const intervalMs = typeof rule.intervalMs === 'number' ? rule.intervalMs : 60_000;
    const cooldownMs = typeof rule.cooldownMs === 'number' ? rule.cooldownMs : 30_000;

    const normalizedRule = migrateLegacyAlertRule(asset, rule.rule, intervalMs, cooldownMs);

    const status = (rule.status === 'active' || rule.status === 'paused' || rule.status === 'pending_approval' || rule.status === 'triggered' || rule.status === 'disabled')
      ? rule.status
      : 'pending_approval';

    return {
      id: typeof rule.id === 'string' ? rule.id : `alert-${randomUUID()}`,
      asset,
      rule: normalizedRule,
      intervalMs,
      cooldownMs,
      status,
      createdAt: isIsoString(rule.createdAt) ? rule.createdAt : nowIso(),
      updatedAt: isIsoString(rule.updatedAt) ? rule.updatedAt : nowIso(),
      ...(isIsoString(rule.lastTriggeredAt) ? { lastTriggeredAt: rule.lastTriggeredAt } : {}),
    };
  });

  return {
    rules: normalizedRules,
    schedulerState: {
      sentAtByDedupeKey: asNumberRecord(schedulerState.sentAtByDedupeKey, 'schedulerState.sentAtByDedupeKey'),
      payloadHashByDedupeKey: asStringRecord(schedulerState.payloadHashByDedupeKey, 'schedulerState.payloadHashByDedupeKey'),
      retryQueue: normalizeRetryQueue(schedulerState.retryQueue),
    },
    history: history as AlertsStateData['history'],
  };
}

function validateTransportIndexData(data: unknown): TransportIndexData {
  const root = asObject(data);
  const entries = asObject(root.entries);
  const normalized: TransportIndexData = { entries: {} };

  for (const [key, value] of Object.entries(entries)) {
    const entry = asObject(value);
    if (typeof entry.transport !== 'string' || typeof entry.channelId !== 'string' || typeof entry.messageId !== 'string') {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Invalid transport entry '${key}'`);
    }

    const status = normalizeTransportStatus(entry);
    const legacyReason = typeof entry.needsReviewReason === 'string' ? entry.needsReviewReason : undefined;
    const failure = normalizeTransportFailure(entry.failure, legacyReason, status);
    const delivery = asObject(entry.delivery);
    const normalizedDelivery = Object.keys(delivery).length > 0
      ? {
          ...(typeof delivery.outboxId === 'string' ? { outboxId: delivery.outboxId } : {}),
          ...(typeof delivery.idempotencyKey === 'string' ? { idempotencyKey: delivery.idempotencyKey } : {}),
          ...(typeof delivery.messageId === 'string' ? { messageId: delivery.messageId } : {}),
          ...(isIsoString(delivery.deliveredAt) ? { deliveredAt: delivery.deliveredAt } : {}),
          attemptCount: typeof delivery.attemptCount === 'number' && Number.isInteger(delivery.attemptCount) && delivery.attemptCount >= 0
            ? delivery.attemptCount
            : 0,
          ...(isIsoString(delivery.lastAttemptAt) ? { lastAttemptAt: delivery.lastAttemptAt } : {}),
          ...(delivery.nextAttemptAt === null
            ? { nextAttemptAt: null }
            : isIsoString(delivery.nextAttemptAt)
              ? { nextAttemptAt: delivery.nextAttemptAt }
              : {}),
        }
      : undefined;

    normalized.entries[key] = {
      key,
      transport: entry.transport,
      transportIdentity: typeof entry.transportIdentity === 'string' ? entry.transportIdentity : '',
      channelId: entry.channelId,
      ...(typeof entry.threadId === 'string' ? { threadId: entry.threadId } : {}),
      messageId: entry.messageId,
      status,
      createdAt: isIsoString(entry.createdAt) ? entry.createdAt : nowIso(),
      updatedAt: isIsoString(entry.updatedAt) ? entry.updatedAt : nowIso(),
      lineage: {
        clientRequestId: typeof asObject(entry.lineage).clientRequestId === 'string' ? String(asObject(entry.lineage).clientRequestId) : `req-${randomUUID()}`,
        turnId: typeof asObject(entry.lineage).turnId === 'string' ? String(asObject(entry.lineage).turnId) : null,
      },
      ...(typeof entry.terminalAnswer === 'string' ? { terminalAnswer: entry.terminalAnswer } : {}),
      ...(typeof entry.terminalCode === 'string' ? { terminalCode: entry.terminalCode } : {}),
      ...(failure ? { failure } : {}),
      ...(normalizedDelivery ? { delivery: normalizedDelivery } : {}),
      ...(typeof legacyReason === 'string' ? { needsReviewReason: legacyReason } : {}),
      ...(typeof entry.tombstoneReason === 'string' ? { tombstoneReason: entry.tombstoneReason } : {}),
    };
  }

  return normalized;
}

function validateTransportOutboxData(data: unknown): TransportOutboxData {
  const root = asObject(data);
  const entries = asObject(root.entries);
  const normalized: TransportOutboxData = { entries: {} };

  for (const [outboxId, value] of Object.entries(entries)) {
    const entry = asObject(value);
    if (
      typeof entry.correlationKey !== 'string'
      || typeof entry.transport !== 'string'
      || typeof entry.transportIdentity !== 'string'
      || typeof entry.channelId !== 'string'
      || typeof entry.idempotencyKey !== 'string'
    ) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Invalid transport outbox entry '${outboxId}'`);
    }

    const payload = asObject(entry.payload);
    const payloadType = typeof entry.payloadType === 'string' ? entry.payloadType : '';
    if ((payloadType !== 'final' && payloadType !== 'progress' && payloadType !== 'alert') || typeof payload.text !== 'string') {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Invalid transport outbox payload '${outboxId}'`);
    }

    const status = typeof entry.status === 'string' ? entry.status : '';
    if (status !== 'queued' && status !== 'running' && status !== 'succeeded' && status !== 'failed') {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Invalid transport outbox status '${outboxId}'`);
    }

    normalized.entries[outboxId] = {
      outboxId,
      correlationKey: entry.correlationKey,
      turnId: typeof entry.turnId === 'string' ? entry.turnId : null,
      transport: entry.transport,
      transportIdentity: entry.transportIdentity,
      channelId: entry.channelId,
      ...(typeof entry.threadId === 'string' ? { threadId: entry.threadId } : {}),
      payloadType,
      payload: {
        text: payload.text,
      },
      idempotencyKey: entry.idempotencyKey,
      status,
      attemptCount: typeof entry.attemptCount === 'number' && Number.isInteger(entry.attemptCount) && entry.attemptCount >= 0
        ? entry.attemptCount
        : 0,
      maxAttempts: typeof entry.maxAttempts === 'number' && Number.isInteger(entry.maxAttempts) && entry.maxAttempts > 0
        ? entry.maxAttempts
        : 5,
      nextAttemptAt: isIsoString(entry.nextAttemptAt) ? entry.nextAttemptAt : nowIso(),
      ...(isIsoString(entry.lastAttemptAt) ? { lastAttemptAt: entry.lastAttemptAt } : {}),
      ...(typeof entry.lastErrorCode === 'string' ? { lastErrorCode: entry.lastErrorCode } : {}),
      ...(typeof entry.lastErrorMessage === 'string' ? { lastErrorMessage: entry.lastErrorMessage } : {}),
      createdAt: isIsoString(entry.createdAt) ? entry.createdAt : nowIso(),
      updatedAt: isIsoString(entry.updatedAt) ? entry.updatedAt : nowIso(),
    };
  }

  return normalized;
}

function validateDataByFile(fileName: HereticStateFileName, data: unknown): unknown {
  switch (fileName) {
    case 'integration.json':
      return validateIntegrationData(data);
    case 'workspace-map.json':
      return validateWorkspaceMapData(data);
    case 'goals.json':
      return validateGoalsData(data);
    case 'alerts.json':
      return validateAlertsData(data);
    case 'transport-index.json':
      return validateTransportIndexData(data);
    case 'transport-outbox.json':
      return validateTransportOutboxData(data);
    default:
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Unsupported state file '${fileName}'`);
  }
}

function resolveSchemaVersion(fileName: HereticStateFileName, value: unknown): string {
  if (typeof value === 'string') {
    if (value !== SCHEMA_VERSION_BY_FILE[fileName]) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_UNSUPPORTED', `Unsupported schemaVersion '${value}' for ${fileName}`);
    }
    return value;
  }

  if (typeof value === 'number') {
    if (value === LEGACY_SCHEMA_NUMBER) {
      return SCHEMA_VERSION_BY_FILE[fileName];
    }
    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_UNSUPPORTED', `Unsupported numeric schemaVersion '${value}' for ${fileName}`);
  }

  throw new HereticSaisoError('HERETIC_STATE_SCHEMA_UNSUPPORTED', `Missing schemaVersion for ${fileName}`);
}

async function readEnvelope<T>(projectRoot: string, fileName: HereticStateFileName, fallback: T): Promise<StateEnvelope<T>> {
  const filePath = getStateFilePath(projectRoot, fileName);
  try {
    const raw = await readFile(filePath, 'utf-8');
    if (!raw.trim()) {
      return envelope(SCHEMA_VERSION_BY_FILE[fileName], 0, clone(fallback));
    }

    const parsed = parseJson<Record<string, unknown>>(raw, filePath);
    const schemaVersion = resolveSchemaVersion(fileName, parsed.schemaVersion);

    const revision = parsed.revision;
    if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Invalid revision in ${filePath}`);
    }

    if (!isIsoString(parsed.updatedAt)) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Invalid updatedAt in ${filePath}`);
    }

    const data = validateDataByFile(fileName, parsed.data) as T;

    return {
      schemaVersion,
      revision,
      updatedAt: parsed.updatedAt,
      data,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return envelope(SCHEMA_VERSION_BY_FILE[fileName], 0, clone(fallback));
    }

    if (error instanceof HereticSaisoError) {
      throw error;
    }

    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Failed reading ${filePath}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function writeEnvelopeAtomic<T>(projectRoot: string, fileName: HereticStateFileName, value: StateEnvelope<T>): Promise<void> {
  const stateDir = getStateDir(projectRoot);
  const filePath = getStateFilePath(projectRoot, fileName);
  await mkdir(stateDir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${process.pid}.${randomUUID()}`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  await rename(tmpPath, filePath);
}

async function readLockMetadata(lockPath: string): Promise<LockMetadata | null> {
  try {
    const raw = await readFile(lockPath, 'utf-8');
    return parseJson<LockMetadata>(raw, lockPath);
  } catch {
    return null;
  }
}

export async function acquireStateLock(projectRoot: string, options: LockOptions = {}): Promise<() => Promise<void>> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const staleMs = options.staleMs ?? 30_000;
  const retryDelayMs = options.retryDelayMs ?? 50;

  const stateDir = getStateDir(projectRoot);
  await mkdir(stateDir, { recursive: true });

  const lockPath = getLockFilePath(projectRoot);
  const startedAt = Date.now();
  const metadata: LockMetadata = {
    holderHost: os.hostname(),
    pid: process.pid,
    processStartTime: PROCESS_START_TIME,
    createdAt: nowIso(),
  };

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const handle = await open(lockPath, 'wx');
      try {
        await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
      } finally {
        await handle.close();
      }

      return async () => {
        await rm(lockPath, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }

      const existing = await readLockMetadata(lockPath);
      if (!existing?.createdAt) {
        const jitter = 1 + (Math.random() * 0.4 - 0.2);
        const sleepMs = Math.min(400, retryDelayMs) * jitter;
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
        continue;
      }

      const ageMs = Date.now() - Date.parse(existing.createdAt);
      if (Number.isFinite(ageMs) && ageMs > staleMs) {
        const sameHost = existing.holderHost === os.hostname();
        const pidAlive = Number.isInteger(existing.pid) ? processAlive(existing.pid) : false;
        if (sameHost && !pidAlive) {
          await rm(lockPath, { force: true });
          continue;
        }

        throw new HereticSaisoError('HERETIC_STATE_STALE_LOCK', `Stale lock cannot be safely reclaimed at ${lockPath}`, {
          lockMetadata: existing,
        });
      }

      const jitter = 1 + (Math.random() * 0.4 - 0.2);
      const sleepMs = Math.min(400, retryDelayMs) * jitter;
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }

  throw new HereticSaisoError('HERETIC_STATE_LOCK_TIMEOUT', `Timed out waiting for lock ${lockPath}`, {
    timeoutMs,
    lockPath,
  });
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function withStateLock<T>(projectRoot: string, fn: () => Promise<T>, options?: LockOptions): Promise<T> {
  const release = await acquireStateLock(projectRoot, options);
  try {
    return await fn();
  } finally {
    await release();
  }
}

async function updateEnvelope<T>(
  projectRoot: string,
  fileName: HereticStateFileName,
  fallback: T,
  mutator: (current: StateEnvelope<T>) => T,
  expectedRevision?: number,
): Promise<StateEnvelope<T>> {
  return withStateLock(projectRoot, async () => {
    const current = await readEnvelope(projectRoot, fileName, fallback);
    if (typeof expectedRevision === 'number' && current.revision !== expectedRevision) {
      throw new HereticSaisoError('HERETIC_STATE_CONFLICT', `${fileName} revision mismatch`, {
        expectedRevision,
        actualRevision: current.revision,
      });
    }

    const nextData = validateDataByFile(fileName, mutator(clone(current))) as T;
    const nextEnvelope = envelope(SCHEMA_VERSION_BY_FILE[fileName], current.revision + 1, nextData);
    await writeEnvelopeAtomic(projectRoot, fileName, nextEnvelope);
    return nextEnvelope;
  });
}

export async function readIntegrationState(projectRoot: string): Promise<StateEnvelope<HereticIntegrationConfig>> {
  return readEnvelope(projectRoot, 'integration.json', DEFAULT_INTEGRATION);
}

export async function updateIntegrationState(
  projectRoot: string,
  mutator: (current: StateEnvelope<HereticIntegrationConfig>) => HereticIntegrationConfig,
  expectedRevision?: number,
): Promise<StateEnvelope<HereticIntegrationConfig>> {
  return updateEnvelope(projectRoot, 'integration.json', DEFAULT_INTEGRATION, mutator, expectedRevision);
}

export async function readWorkspaceMapState(projectRoot: string): Promise<StateEnvelope<WorkspaceMapData>> {
  return readEnvelope(projectRoot, 'workspace-map.json', DEFAULT_WORKSPACE_MAP);
}

export async function updateWorkspaceMapState(
  projectRoot: string,
  mutator: (current: StateEnvelope<WorkspaceMapData>) => WorkspaceMapData,
  expectedRevision?: number,
): Promise<StateEnvelope<WorkspaceMapData>> {
  return updateEnvelope(projectRoot, 'workspace-map.json', DEFAULT_WORKSPACE_MAP, mutator, expectedRevision);
}

export async function readGoalsState(projectRoot: string): Promise<StateEnvelope<GoalsStateData>> {
  return readEnvelope(projectRoot, 'goals.json', DEFAULT_GOALS_STATE);
}

export async function updateGoalsState(
  projectRoot: string,
  mutator: (current: StateEnvelope<GoalsStateData>) => GoalsStateData,
  expectedRevision?: number,
): Promise<StateEnvelope<GoalsStateData>> {
  return updateEnvelope(projectRoot, 'goals.json', DEFAULT_GOALS_STATE, mutator, expectedRevision);
}

export async function saveGoalRunnerState(projectRoot: string, runner: GoalRunner): Promise<StateEnvelope<GoalsStateData>> {
  return updateGoalsState(projectRoot, (current) => ({
    ...current.data,
    goals: runner.list(),
  }));
}

export async function readAlertsState(projectRoot: string): Promise<StateEnvelope<AlertsStateData>> {
  return readEnvelope(projectRoot, 'alerts.json', DEFAULT_ALERTS_STATE);
}

export async function updateAlertsState(
  projectRoot: string,
  mutator: (current: StateEnvelope<AlertsStateData>) => AlertsStateData,
  expectedRevision?: number,
): Promise<StateEnvelope<AlertsStateData>> {
  return updateEnvelope(projectRoot, 'alerts.json', DEFAULT_ALERTS_STATE, mutator, expectedRevision);
}

export async function readTransportIndexState(projectRoot: string): Promise<StateEnvelope<TransportIndexData>> {
  return readEnvelope(projectRoot, 'transport-index.json', DEFAULT_TRANSPORT_INDEX);
}

export async function updateTransportIndexState(
  projectRoot: string,
  mutator: (current: StateEnvelope<TransportIndexData>) => TransportIndexData,
  expectedRevision?: number,
): Promise<StateEnvelope<TransportIndexData>> {
  return updateEnvelope(projectRoot, 'transport-index.json', DEFAULT_TRANSPORT_INDEX, mutator, expectedRevision);
}

export async function readTransportOutboxState(projectRoot: string): Promise<StateEnvelope<TransportOutboxData>> {
  return readEnvelope(projectRoot, 'transport-outbox.json', DEFAULT_TRANSPORT_OUTBOX);
}

export async function updateTransportOutboxState(
  projectRoot: string,
  mutator: (current: StateEnvelope<TransportOutboxData>) => TransportOutboxData,
  expectedRevision?: number,
): Promise<StateEnvelope<TransportOutboxData>> {
  return updateEnvelope(projectRoot, 'transport-outbox.json', DEFAULT_TRANSPORT_OUTBOX, mutator, expectedRevision);
}

export async function reserveTransportCorrelation(
  projectRoot: string,
  input: {
    key: string;
    transport: string;
    transportIdentity: string;
    channelId: string;
    threadId?: string;
    messageId: string;
    clientRequestId: string;
  },
): Promise<{ kind: 'created' | 'terminal' | 'existing'; record: TransportCorrelationRecord }> {
  let response: { kind: 'created' | 'terminal' | 'existing'; record: TransportCorrelationRecord } | null = null;

  await updateTransportIndexState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    const existing = entries[input.key];
    if (existing) {
      if (existing.status === 'delivered_terminal') {
        response = { kind: 'terminal', record: existing };
        return {
          entries,
        };
      }

      response = { kind: 'existing', record: existing };
      return {
        entries,
      };
    }

    const now = nowIso();
    const created: TransportCorrelationRecord = {
      key: input.key,
      transport: input.transport,
      transportIdentity: input.transportIdentity,
      channelId: input.channelId,
      ...(typeof input.threadId === 'string' ? { threadId: input.threadId } : {}),
      messageId: input.messageId,
      status: 'pending_submit',
      createdAt: now,
      updatedAt: now,
      lineage: {
        clientRequestId: input.clientRequestId,
        turnId: null,
      },
    };
    entries[input.key] = created;
    response = { kind: 'created', record: created };
    return {
      entries,
    };
  });

  if (!response) {
    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', 'Failed to reserve transport correlation');
  }

  return response;
}

export async function markTransportTurnId(projectRoot: string, key: string, turnId: string): Promise<void> {
  await updateTransportIndexState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    const existing = entries[key];
    if (!existing) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Missing transport correlation ${key}`);
    }
    assertTransportTransitionAllowed(existing.status, 'pending_turn');
    entries[key] = {
      ...existing,
      status: 'pending_turn',
      updatedAt: nowIso(),
      failure: undefined,
      lineage: {
        ...existing.lineage,
        turnId,
      },
    };
    return { entries };
  });
}

export async function markTransportPendingDelivery(projectRoot: string, key: string, answer: string, code = 'ok'): Promise<void> {
  await updateTransportIndexState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    const existing = entries[key];
    if (!existing) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Missing transport correlation ${key}`);
    }
    assertTransportTransitionAllowed(existing.status, 'pending_delivery');
    entries[key] = {
      ...existing,
      status: 'pending_delivery',
      terminalAnswer: answer,
      terminalCode: code,
      updatedAt: nowIso(),
      failure: undefined,
      needsReviewReason: undefined,
    };
    return { entries };
  });
}

export async function markTransportTerminal(
  projectRoot: string,
  key: string,
  answer: string,
  code = 'ok',
  delivery?: Partial<TransportCorrelationRecord['delivery']>,
): Promise<void> {
  await updateTransportIndexState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    const existing = entries[key];
    if (!existing) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Missing transport correlation ${key}`);
    }
    assertTransportTransitionAllowed(existing.status, 'delivered_terminal');
    entries[key] = {
      ...existing,
      status: 'delivered_terminal',
      terminalAnswer: answer,
      terminalCode: code,
      updatedAt: nowIso(),
      ...(delivery
        ? {
            delivery: {
              outboxId: typeof delivery.outboxId === 'string' ? delivery.outboxId : existing.delivery?.outboxId,
              idempotencyKey: typeof delivery.idempotencyKey === 'string' ? delivery.idempotencyKey : existing.delivery?.idempotencyKey,
              messageId: typeof delivery.messageId === 'string' ? delivery.messageId : existing.delivery?.messageId,
              deliveredAt: typeof delivery.deliveredAt === 'string' ? delivery.deliveredAt : existing.delivery?.deliveredAt,
              attemptCount: typeof delivery.attemptCount === 'number' ? delivery.attemptCount : existing.delivery?.attemptCount ?? 0,
              ...(typeof delivery.lastAttemptAt === 'string'
                ? { lastAttemptAt: delivery.lastAttemptAt }
                : existing.delivery?.lastAttemptAt
                  ? { lastAttemptAt: existing.delivery.lastAttemptAt }
                  : {}),
              ...(typeof delivery.nextAttemptAt === 'string' || delivery.nextAttemptAt === null
                ? { nextAttemptAt: delivery.nextAttemptAt }
                : typeof existing.delivery?.nextAttemptAt === 'string' || existing.delivery?.nextAttemptAt === null
                  ? { nextAttemptAt: existing.delivery.nextAttemptAt }
                  : {}),
            },
          }
        : {}),
      failure: undefined,
      needsReviewReason: undefined,
    };
    return { entries };
  });
}

export async function markTransportFailedRecoverable(
  projectRoot: string,
  key: string,
  reason: string,
  code: TransportFailureCode,
): Promise<void> {
  await updateTransportIndexState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    const existing = entries[key];
    if (!existing) {
      return { entries };
    }
    assertTransportTransitionAllowed(existing.status, 'failed_recoverable');
    entries[key] = {
      ...existing,
      status: 'failed_recoverable',
      updatedAt: nowIso(),
      failure: {
        code,
        message: reason,
        retryable: true,
        at: nowIso(),
      },
      needsReviewReason: reason,
    };
    return { entries };
  });
}

export async function markTransportFailedTerminal(
  projectRoot: string,
  key: string,
  reason: string,
  code: TransportFailureCode = 'TRANSPORT_TURN_FAILED',
): Promise<void> {
  await updateTransportIndexState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    const existing = entries[key];
    if (!existing) {
      return { entries };
    }
    assertTransportTransitionAllowed(existing.status, 'failed_terminal');
    entries[key] = {
      ...existing,
      status: 'failed_terminal',
      updatedAt: nowIso(),
      failure: {
        code,
        message: reason,
        retryable: false,
        at: nowIso(),
      },
      needsReviewReason: reason,
    };
    return { entries };
  });
}

export async function markTransportNeedsReview(
  projectRoot: string,
  key: string,
  reason: string,
  code: TransportFailureCode = 'TRANSPORT_TURN_FAILED',
): Promise<void> {
  await updateTransportIndexState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    const existing = entries[key];
    if (!existing) {
      return { entries };
    }
    assertTransportTransitionAllowed(existing.status, 'needs_operator_review');
    entries[key] = {
      ...existing,
      status: 'needs_operator_review',
      needsReviewReason: reason,
      updatedAt: nowIso(),
      failure: {
        code,
        message: reason,
        retryable: false,
        at: nowIso(),
      },
    };
    return { entries };
  });
}

export async function tombstoneTransportCorrelation(projectRoot: string, key: string, reason: string): Promise<void> {
  await updateTransportIndexState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    const existing = entries[key];
    if (!existing) {
      return { entries };
    }
    assertTransportTransitionAllowed(existing.status, 'tombstoned');
    entries[key] = {
      ...existing,
      status: 'tombstoned',
      tombstoneReason: reason,
      updatedAt: nowIso(),
    };
    return { entries };
  });
}

export interface TransportPruneStats {
  removedTerminal: number;
  convertedToTombstone: number;
  removedTombstone: number;
  unresolvedTombstones: number;
}

export async function pruneTransportIndex(
  projectRoot: string,
  options: {
    terminalTtlMs: number;
    unresolvedTtlMs: number;
    tombstoneTtlMs?: number;
    nowMs?: number;
  },
): Promise<TransportPruneStats> {
  const nowMs = options.nowMs ?? Date.now();
  const tombstoneTtlMs = options.tombstoneTtlMs ?? (180 * 24 * 60 * 60 * 1000);

  const stats: TransportPruneStats = {
    removedTerminal: 0,
    convertedToTombstone: 0,
    removedTombstone: 0,
    unresolvedTombstones: 0,
  };

  await updateTransportIndexState(projectRoot, (current) => {
    const entries: Record<string, TransportCorrelationRecord> = {};

    for (const [key, entry] of Object.entries(current.data.entries)) {
      const ageMs = nowMs - Date.parse(entry.updatedAt || entry.createdAt);

      if (entry.status === 'delivered_terminal' && Number.isFinite(ageMs) && ageMs > options.terminalTtlMs) {
        stats.removedTerminal += 1;
        continue;
      }

      if (
        (entry.status === 'pending_submit'
          || entry.status === 'pending_turn'
          || entry.status === 'pending_delivery'
          || entry.status === 'failed_recoverable'
          || entry.status === 'failed_terminal'
          || entry.status === 'needs_operator_review')
        && Number.isFinite(ageMs)
        && ageMs > options.unresolvedTtlMs
      ) {
        stats.convertedToTombstone += 1;
        entries[key] = {
          ...entry,
          status: 'tombstoned',
          tombstoneReason: `${entry.status}_ttl_elapsed`,
          updatedAt: new Date(nowMs).toISOString(),
        };
        continue;
      }

      if (entry.status === 'tombstoned' && Number.isFinite(ageMs) && ageMs > options.unresolvedTtlMs) {
        stats.unresolvedTombstones += 1;
      }

      if (entry.status === 'tombstoned' && Number.isFinite(ageMs) && ageMs > tombstoneTtlMs) {
        stats.removedTombstone += 1;
        continue;
      }

      entries[key] = entry;
    }

    return { entries };
  });

  return stats;
}

export async function enqueueTransportOutboxEntry(
  projectRoot: string,
  input: Omit<TransportOutboxEntry, 'createdAt' | 'updatedAt'>,
): Promise<TransportOutboxEntry> {
  let created: TransportOutboxEntry | null = null;
  await updateTransportOutboxState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    const existing = Object.values(entries).find((entry) =>
      entry.correlationKey === input.correlationKey
      && entry.idempotencyKey === input.idempotencyKey
      && entry.payloadType === input.payloadType,
    );
    if (existing) {
      created = existing;
      return { entries };
    }

    created = {
      ...input,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    entries[input.outboxId] = created;
    return { entries };
  });

  if (!created) {
    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', 'Failed to enqueue transport outbox entry');
  }

  return created;
}

export async function updateTransportOutboxEntry(
  projectRoot: string,
  outboxId: string,
  mutator: (entry: TransportOutboxEntry) => TransportOutboxEntry,
): Promise<void> {
  await updateTransportOutboxState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    const existing = entries[outboxId];
    if (!existing) {
      throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Missing transport outbox entry ${outboxId}`);
    }
    entries[outboxId] = {
      ...mutator(existing),
      outboxId,
      updatedAt: nowIso(),
    };
    return { entries };
  });
}

export async function deleteTransportOutboxEntry(projectRoot: string, outboxId: string): Promise<void> {
  await updateTransportOutboxState(projectRoot, (current) => {
    const entries = { ...current.data.entries };
    delete entries[outboxId];
    return { entries };
  });
}

export function buildCorrelationKey(input: {
  transport: string;
  transportIdentity: string;
  channelId: string;
  messageId: string;
}): string {
  return `${input.transport}:${input.transportIdentity}:${input.channelId}:${input.messageId}`;
}

export function getHereticStatePaths(projectRoot: string): {
  stateDir: string;
  lockPath: string;
  integrationPath: string;
  workspaceMapPath: string;
  goalsPath: string;
  alertsPath: string;
  transportIndexPath: string;
  transportOutboxPath: string;
} {
  const stateDir = getStateDir(projectRoot);
  return {
    stateDir,
    lockPath: getLockFilePath(projectRoot),
    integrationPath: getStateFilePath(projectRoot, 'integration.json'),
    workspaceMapPath: getStateFilePath(projectRoot, 'workspace-map.json'),
    goalsPath: getStateFilePath(projectRoot, 'goals.json'),
    alertsPath: getStateFilePath(projectRoot, 'alerts.json'),
    transportIndexPath: getStateFilePath(projectRoot, 'transport-index.json'),
    transportOutboxPath: getStateFilePath(projectRoot, 'transport-outbox.json'),
  };
}

export function getDefaultAlertsState(): AlertsStateData {
  return clone(DEFAULT_ALERTS_STATE);
}

export function getDefaultGoalsState(): GoalsStateData {
  return clone(DEFAULT_GOALS_STATE);
}

export function getDefaultIntegrationState(): HereticIntegrationConfig {
  return clone(DEFAULT_INTEGRATION);
}

export function getDefaultTransportOutboxState(): TransportOutboxData {
  return clone(DEFAULT_TRANSPORT_OUTBOX);
}
