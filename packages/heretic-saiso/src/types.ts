import type { GoalRunRecord, AlertSchedulerState } from '@saiso/core';

export type HereticStateFileName =
  | 'integration.json'
  | 'workspace-map.json'
  | 'goals.json'
  | 'alerts.json'
  | 'transport-index.json'
  | 'transport-outbox.json';

export interface StateEnvelope<T> {
  schemaVersion: string;
  revision: number;
  updatedAt: string;
  data: T;
}

export interface HereticIntegrationConfig {
  daemon: {
    daemonPath: string | null;
    configDir: string | null;
    socketPath: string | null;
  };
  transport: {
    selected: string;
    transportIdentity: string | null;
    terminalTtlMs: number;
    unresolvedTtlMs: number;
    tombstoneTtlMs: number;
  };
  policy: {
    strict: boolean;
  };
}

export interface WorkspaceMapEntry {
  workspaceRoot: string;
  hereticProjectRoot: string;
  projectId: string;
  sessionId: string;
  updatedAt: string;
}

export interface WorkspaceMapData {
  mappings: Record<string, WorkspaceMapEntry>;
}

export interface GoalPolicyEvent {
  eventId: string;
  goalId: string;
  at: string;
  actor: string;
  decision: 'allow' | 'require_approval' | 'deny';
  reason: string;
}

export interface GoalEvent {
  eventId: string;
  goalId: string;
  at: string;
  type: 'created' | 'started' | 'progress' | 'approval_required' | 'paused' | 'resumed' | 'completed' | 'failed' | 'cancelled' | 'policy_denied';
  actor: 'operator' | 'runtime' | 'daemon';
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GoalsStateData {
  goals: GoalRunRecord[];
  policyEvents: GoalPolicyEvent[];
  history: GoalEvent[];
}

export type AlertRuleStatus = 'active' | 'paused' | 'pending_approval' | 'triggered' | 'disabled';

export type AlertOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'crosses_up' | 'crosses_down' | 'pct_change_up' | 'pct_change_down';

export interface AlertRuleDefinition {
  asset: string;
  operator: AlertOperator;
  targetValue: number;
  intervalMs: number;
  cooldownMs: number;
  windowMs?: number;
  source?: string;
}

export interface AlertEvent {
  eventId: string;
  alertId: string;
  at: string;
  type: 'created' | 'updated' | 'triggered' | 'delivery_succeeded' | 'delivery_failed' | 'paused' | 'resumed' | 'removed' | 'policy_denied';
  actor: 'operator' | 'runtime' | 'daemon';
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AlertRule {
  id: string;
  asset: string;
  rule: AlertRuleDefinition;
  intervalMs: number;
  cooldownMs: number;
  status: AlertRuleStatus;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string;
}

export interface AlertsStateData {
  rules: AlertRule[];
  schedulerState: AlertSchedulerState;
  history: AlertEvent[];
}

export type CorrelationStatus =
  | 'pending_submit'
  | 'pending_turn'
  | 'pending_delivery'
  | 'delivered_terminal'
  | 'failed_recoverable'
  | 'failed_terminal'
  | 'needs_operator_review'
  | 'tombstoned';

export type TransportFailureCode =
  | 'TRANSPORT_TURN_TIMEOUT'
  | 'TRANSPORT_TURN_FAILED'
  | 'TRANSPORT_DAEMON_UNAVAILABLE'
  | 'TRANSPORT_DELIVERY_FAILED'
  | 'TRANSPORT_PAYLOAD_INVALID'
  | 'TRANSPORT_AUTH_FAILED';

export interface TransportLineage {
  clientRequestId: string;
  turnId: string | null;
}

export interface TransportFailureReason {
  code: TransportFailureCode;
  message: string;
  retryable: boolean;
  at: string;
}

export interface TransportDeliveryState {
  outboxId?: string;
  idempotencyKey?: string;
  messageId?: string;
  deliveredAt?: string;
  attemptCount: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string | null;
}

export interface TransportCorrelationRecord {
  key: string;
  transport: string;
  transportIdentity: string;
  channelId: string;
  threadId?: string;
  messageId: string;
  status: CorrelationStatus;
  createdAt: string;
  updatedAt: string;
  lineage: TransportLineage;
  terminalAnswer?: string;
  terminalCode?: string;
  failure?: TransportFailureReason;
  delivery?: TransportDeliveryState;
  needsReviewReason?: string;
  tombstoneReason?: string;
}

export interface TransportIndexData {
  entries: Record<string, TransportCorrelationRecord>;
}

export type TransportOutboxStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface TransportOutboxEntry {
  outboxId: string;
  correlationKey: string;
  turnId: string | null;
  transport: string;
  transportIdentity: string;
  channelId: string;
  threadId?: string;
  payloadType: 'final' | 'progress' | 'alert';
  payload: {
    text: string;
  };
  idempotencyKey: string;
  status: TransportOutboxStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  lastErrorCode?: TransportFailureCode | string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransportOutboxData {
  entries: Record<string, TransportOutboxEntry>;
}

export type StrictModeSource = 'cli' | 'config' | 'env' | 'default';

export interface StrictModeResolution {
  strict: boolean;
  source: StrictModeSource;
}

export interface PolicyPreflightResult {
  decision: 'allow' | 'require_approval' | 'deny';
  reason: string;
  strict: boolean;
  strictSource: StrictModeSource;
}

export interface HereticDaemonResolvedPaths {
  daemonPath: string | null;
  configDir: string;
  socketPath: string;
}

export interface HereticSessionBinding {
  hereticProjectRoot: string;
  projectId: string;
  sessionId: string;
}

export interface ChatRelayRequest {
  sessionId: string;
  content: string;
  approvalPolicy?: 'interactive' | 'auto_deny' | 'never';
  timeoutMs?: number;
}

export interface ChatRelayResult {
  turnId: string;
  answer: string;
}

export interface LockMetadata {
  holderHost: string;
  pid: number;
  processStartTime: string;
  createdAt: string;
}
