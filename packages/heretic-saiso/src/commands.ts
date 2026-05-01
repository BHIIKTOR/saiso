import path from 'node:path';
import { access, readFile, realpath, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Command } from 'commander';
import type { SaisoPluginContext } from '@saiso/plugin-sdk';
import { getRuntimeWorkerStatus, heartbeatRuntimeWorker, startRuntimeWorker, stopRuntimeWorker } from '@saiso/heretic-saiso-runtime';
import {
  ChatTransportRegistry,
  ChatTransportRouter,
  GoalRunnerError,
  TelegramTransportAdapter,
  WebhookTransportAdapter,
} from '@saiso/core';
import type { AlertRuleDefinition, HereticIntegrationConfig } from './types.js';
import { formatAlertNotification } from './alert-summary.js';
import {
  attachWorkspaceToDaemon,
  healthcheckDaemon,
  makeClientRequestId,
  queryMcpStatus,
  queryModelCatalog,
  queryTools,
  recoverTurnAnswerFromSnapshot,
  setRuntimeModel,
  setRuntimeProfile,
  setRuntimeProvider,
  setRuntimeStream,
  submitTurn,
  submitTurnAndWait,
} from './daemon-client.js';
import { HereticSaisoError } from './errors.js';
import { inspectPolicyPresence, preflightPolicyCheck, resolveStrictMode } from './policy.js';
import { runProjectChatCommandHook } from './project-chat-command-hook.js';
import {
  addAlertRule,
  appendGoalPolicyEvent,
  bindWorkspace,
  evaluateAlertRule,
  getWorkspaceBinding,
  initializeIntegration,
  listAlertRules,
  loadGoalRunnerForProject,
  loadIntegration,
  processAlertEvent,
  removeAlertRule,
  requireWorkspaceBinding,
  runGoalTransition,
  setAlertStatus,
} from './services.js';
import {
  buildCorrelationKey,
  deleteTransportOutboxEntry,
  enqueueTransportOutboxEntry,
  getHereticStatePaths,
  markTransportFailedRecoverable,
  markTransportFailedTerminal,
  markTransportNeedsReview,
  markTransportPendingDelivery,
  markTransportTerminal,
  markTransportTurnId,
  pruneTransportIndex,
  readTransportIndexState,
  readTransportOutboxState,
  readWorkspaceMapState,
  reserveTransportCorrelation,
  tombstoneTransportCorrelation,
  updateTransportOutboxEntry,
  updateAlertsState,
  updateGoalsState,
} from './state.js';
import type { TransportFailureCode, TransportOutboxEntry } from './types.js';

interface TransportDescriptor {
  transport: string;
  capabilities: {
    supportsSync: boolean;
    supportsStream: boolean;
    supportsWebsocket: boolean;
    supportsButtons: boolean;
    supportsMedia: boolean;
    supportsTopics: boolean;
    supportsCallbacks: boolean;
  };
}

const TRANSPORT_CATALOG: TransportDescriptor[] = [
  {
    transport: 'telegram',
    capabilities: {
      supportsSync: true,
      supportsStream: false,
      supportsWebsocket: false,
      supportsButtons: true,
      supportsMedia: true,
      supportsTopics: true,
      supportsCallbacks: true,
    },
  },
  {
    transport: 'webhook',
    capabilities: {
      supportsSync: true,
      supportsStream: false,
      supportsWebsocket: false,
      supportsButtons: false,
      supportsMedia: false,
      supportsTopics: false,
      supportsCallbacks: false,
    },
  },
];

const DEFAULT_CHAT_TURN_TIMEOUT_MS = 180_000;
const DEFAULT_ALERT_NOTIFY_TIMEOUT_MS = 12_000;

function resolveChatTurnTimeoutMs(): number {
  const raw = process.env.SAISO_HERETIC_CHAT_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_CHAT_TURN_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 10_000) {
    return DEFAULT_CHAT_TURN_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

function resolveAlertNotifyTimeoutMs(): number {
  const raw = process.env.SAISO_HERETIC_ALERT_NOTIFY_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_ALERT_NOTIFY_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 2_000) {
    return DEFAULT_ALERT_NOTIFY_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

function asJsonOutput(options: { json?: boolean } | undefined, data: unknown, prettyText?: string): void {
  if (options?.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (prettyText) {
    console.log(prettyText);
    return;
  }

  console.log(data);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function sanitizeTransportAnswer(answer: string): string {
  const sanitized = answer
    .replace(/<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/gi, '')
    .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/gi, '')
    .replace(/<\|tool_call_argument_begin\|>[\s\S]*?<\|tool_call_argument_end\|>/gi, '')
    .replace(/<\|[^|>]+?\|>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return sanitized || answer.trim();
}

function normalizeWorkspaceRoot(context: SaisoPluginContext, input?: string): string {
  return path.resolve(input || context.paths.projectRoot);
}

function parseEnvText(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) continue;

    const key = normalized.slice(0, separator).trim();
    if (!key) continue;
    let value = normalized.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function hydrateProjectEnv(projectRoot: string): void {
  const files = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '.env.heretic'),
  ];

  for (const filePath of files) {
    try {
      const parsed = parseEnvText(readFileSync(filePath, 'utf-8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof process.env[key] !== 'undefined') continue;
        process.env[key] = value;
      }
    } catch {
      // Optional env files, ignored when absent/unreadable.
    }
  }
}

async function canonicalizePath(input: string): Promise<string> {
  const resolved = path.resolve(input);
  try {
    return await realpath(resolved);
  } catch {
    return resolved;
  }
}

async function resolveRuntimeWorkerProjectRoot(context: SaisoPluginContext, input?: string): Promise<string> {
  if (input) {
    const explicit = await canonicalizePath(input);
    try {
      await access(path.join(explicit, '.saiso', 'heretic', 'integration.json'));
      return explicit;
    } catch {
      throw new HereticSaisoError('HERETIC_PROJECT_ROOT_REQUIRED', `No integration state found at ${explicit}`);
    }
  }

  let current = await canonicalizePath(process.cwd());
  while (true) {
    try {
      await access(path.join(current, '.saiso', 'heretic', 'integration.json'));
      return await canonicalizePath(current);
    } catch {
      // continue search
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  try {
    const workspaceMap = await readWorkspaceMapState(context.paths.projectRoot);
    const cwd = await canonicalizePath(process.cwd());
    const matches = (await Promise.all(
      Object.values(workspaceMap.data.mappings).map(async (entry) => ({
        workspaceRoot: await canonicalizePath(entry.workspaceRoot),
        hereticProjectRoot: await canonicalizePath(entry.hereticProjectRoot),
      })),
    )).filter((entry) => cwd.startsWith(entry.workspaceRoot));
    if (matches.length === 1) {
      return matches[0].hereticProjectRoot;
    }
    if (matches.length > 1) {
      throw new HereticSaisoError('HERETIC_PROJECT_ROOT_AMBIGUOUS', 'Multiple workspace-map matches for runtime-worker project root');
    }
  } catch (error) {
    if (error instanceof HereticSaisoError) {
      if (error.code === 'HERETIC_PROJECT_ROOT_AMBIGUOUS') {
        throw error;
      }
      throw new HereticSaisoError('HERETIC_PROJECT_MAP_UNREADABLE', `Unable to read workspace-map.json: ${error.message}`);
    }
    throw new HereticSaisoError('HERETIC_PROJECT_MAP_UNREADABLE', `Unable to read workspace-map.json: ${error instanceof Error ? error.message : String(error)}`);
  }

  throw new HereticSaisoError('HERETIC_PROJECT_ROOT_REQUIRED', 'Unable to resolve runtime-worker project root; pass --project-root');
}

function resolveCliStrict(options: { policyStrict?: boolean; policyLax?: boolean }): boolean | undefined {
  if (options.policyStrict) return true;
  if (options.policyLax) return false;
  return undefined;
}

function ensureTransportIdentity(identity: string | null | undefined): string {
  if (!identity || !identity.trim()) {
    throw new HereticSaisoError(
      'HERETIC_TRANSPORT_IDENTITY_REQUIRED',
      'Transport identity is required. Set it with `saiso heretic chat transport use <id> --identity <transportIdentity>` or pass --transport-identity.'
    );
  }

  return identity.trim();
}

async function getBoundSessionId(context: SaisoPluginContext, workspaceRoot: string): Promise<string> {
  const binding = await requireWorkspaceBinding(context.paths.projectRoot, workspaceRoot);
  return binding.sessionId;
}

function makeGoalId(): string {
  return `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeAlertId(asset: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `alert-${asset.toLowerCase()}-${suffix}`;
}

function parseAlertRule(asset: string, ruleInput: string, intervalMs: number, cooldownMs: number): AlertRuleDefinition {
  const normalized = ruleInput.replace(/\s+/g, '').toLowerCase();
  const match = normalized.match(/^price(>=|<=|>|<)(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Unsupported alert rule '${ruleInput}'. Use forms like price>3000`);
  }

  const operatorMap: Record<string, AlertRuleDefinition['operator']> = {
    '>': 'gt',
    '>=': 'gte',
    '<': 'lt',
    '<=': 'lte',
  };

  return {
    asset,
    operator: operatorMap[match[1]],
    targetValue: Number(match[2]),
    intervalMs,
    cooldownMs,
  };
}

function formatAlertRule(rule: AlertRuleDefinition): string {
  const operatorMap: Record<AlertRuleDefinition['operator'], string> = {
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    crosses_up: 'crosses_up',
    crosses_down: 'crosses_down',
    pct_change_up: 'pct_change_up',
    pct_change_down: 'pct_change_down',
  };
  return `price${operatorMap[rule.operator]}${rule.targetValue}`;
}

const COINGECKO_ASSET_IDS: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
  BNB: 'binancecoin',
  MATIC: 'matic-network',
  POL: 'matic-network',
  AVAX: 'avalanche-2',
  OP: 'optimism',
  ARB: 'arbitrum',
  BASE: 'ethereum',
};

function resolveCoinGeckoAssetId(asset: string): string | null {
  const normalized = asset.trim().toUpperCase();
  return COINGECKO_ASSET_IDS[normalized] || null;
}

async function fetchCoinGeckoPriceMap(assets: string[], vsCurrency: string): Promise<Record<string, number>> {
  const symbolById = new Map<string, string>();
  for (const asset of assets) {
    const id = resolveCoinGeckoAssetId(asset);
    if (!id) continue;
    symbolById.set(id, asset.toUpperCase());
  }

  if (symbolById.size === 0) {
    return {};
  }

  const quote = vsCurrency.trim().toLowerCase() || 'usd';
  const url = new URL('https://api.coingecko.com/api/v3/simple/price');
  url.searchParams.set('ids', Array.from(symbolById.keys()).join(','));
  url.searchParams.set('vs_currencies', quote);

  const response = await fetch(url);
  if (!response.ok) {
    throw new HereticSaisoError('HERETIC_PROTOCOL_ERROR', `CoinGecko price fetch failed (${response.status})`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HereticSaisoError('HERETIC_PROTOCOL_ERROR', 'CoinGecko returned invalid payload');
  }

  const priceMap: Record<string, number> = {};
  for (const [id, symbol] of symbolById.entries()) {
    const row = (payload as Record<string, unknown>)[id];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const price = (row as Record<string, unknown>)[quote];
    if (typeof price === 'number' && Number.isFinite(price)) {
      priceMap[symbol] = price;
    }
  }
  return priceMap;
}

function parsePayloadJson(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch (error) {
    throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function csvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function parseTelegramMaxMessageChars(): number | undefined {
  const raw = process.env.SAISO_HERETIC_TELEGRAM_MAX_MESSAGE_CHARS?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

function createTransportRouter(): ChatTransportRouter {
  const registry = new ChatTransportRegistry();

  registry.register(new TelegramTransportAdapter({
    safeMode: process.env.SAISO_HERETIC_TELEGRAM_SAFE_MODE === 'true',
    allowedChatIds: csvEnv(process.env.SAISO_HERETIC_TELEGRAM_ALLOWED_CHAT_IDS),
    parseMode: 'MarkdownV2',
    maxMessageChars: parseTelegramMaxMessageChars(),
    send: async (request) => {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        throw new HereticSaisoError('HERETIC_INVALID_INPUT', 'TELEGRAM_BOT_TOKEN is required for telegram delivery');
      }

      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: request.chatId,
          text: request.text,
          parse_mode: request.parseMode,
          message_thread_id: request.threadId ? Number(request.threadId) : undefined,
        }),
      });

      const rawBody = await response.text();
      let payload: { ok?: boolean; result?: { message_id?: number }; description?: string } = {};
      try {
        payload = rawBody ? JSON.parse(rawBody) as { ok?: boolean; result?: { message_id?: number }; description?: string } : {};
      } catch {
        payload = {};
      }

      if (!response.ok) {
        const reason = payload.description
          ? payload.description
          : (rawBody.trim() || `HTTP ${response.status}`);
        throw new Error(`Telegram API HTTP ${response.status}: ${reason}`);
      }

      if (!payload.ok || typeof payload.result?.message_id !== 'number') {
        throw new Error(payload.description || 'Invalid Telegram API response');
      }

      return {
        messageId: String(payload.result.message_id),
      };
    },
  }));

  registry.register(new WebhookTransportAdapter({
    post: async (payload) => {
      const endpoint = process.env.SAISO_HERETIC_WEBHOOK_ENDPOINT;
      if (!endpoint) {
        return { messageId: `webhook-local-${Date.now().toString(36)}` };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook endpoint HTTP ${response.status}`);
      }

      const body = await response.json().catch(() => ({})) as { messageId?: string };
      return {
        messageId: body.messageId || `webhook-${Date.now().toString(36)}`,
      };
    },
  }));

  return new ChatTransportRouter(registry);
}

const TRANSPORT_DELIVERY_BACKOFF_MS = [1_000, 3_000, 10_000, 30_000, 90_000] as const;
const DEFAULT_TRANSPORT_RETRY_BUDGET = 5;

function inferTransportProfile(transportIdentity: string): 'prod' | 'smoke' | 'e2e' | 'debug' {
  const normalized = transportIdentity.trim().toLowerCase();
  if (normalized.startsWith('e2e-')) return 'e2e';
  if (normalized.startsWith('debug-')) return 'debug';
  if (normalized.startsWith('smoke-') || normalized.startsWith('local-smoke-')) return 'smoke';
  return 'prod';
}

function resolveExpectedTransportProfile(): 'prod' | 'smoke' | 'e2e' | 'debug' | null {
  const raw = (process.env.HERSO_TRANSPORT_PROFILE || process.env.SAISO_HERETIC_TRANSPORT_PROFILE || '').trim().toLowerCase();
  if (raw === 'prod' || raw === 'smoke' || raw === 'e2e' || raw === 'debug') {
    return raw;
  }
  return null;
}

function enforceTransportProfile(transportIdentity: string): void {
  const expected = resolveExpectedTransportProfile();
  if (!expected) {
    return;
  }

  const actual = inferTransportProfile(transportIdentity);
  if (expected === 'prod') {
    if (actual !== 'prod') {
      throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Configured transport profile 'prod' rejects non-prod transport identity '${transportIdentity}'.`);
    }
    return;
  }

  if (actual !== expected) {
    throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Configured transport profile '${expected}' requires a matching transport identity; received '${transportIdentity}' (${actual}).`);
  }
}

function resolveDeliveryRetryBudget(): number {
  const raw = process.env.SAISO_HERETIC_TRANSPORT_DELIVERY_MAX_ATTEMPTS?.trim();
  if (!raw) {
    return DEFAULT_TRANSPORT_RETRY_BUDGET;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_TRANSPORT_RETRY_BUDGET;
  }
  return Math.floor(parsed);
}

function resolveTurnRecoveryTimeoutMs(): number {
  const raw = process.env.SAISO_HERETIC_TRANSPORT_TURN_RECOVERY_TIMEOUT_MS?.trim();
  if (!raw) {
    return resolveChatTurnTimeoutMs();
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 10_000) {
    return resolveChatTurnTimeoutMs();
  }
  return Math.floor(parsed);
}

function computeDeliveryNextAttemptAt(attemptCount: number): string {
  const bucket = TRANSPORT_DELIVERY_BACKOFF_MS[Math.max(0, Math.min(TRANSPORT_DELIVERY_BACKOFF_MS.length - 1, attemptCount - 1))] ?? 90_000;
  const jitter = Math.floor(bucket * (0.15 * Math.random()));
  return new Date(Date.now() + bucket + jitter).toISOString();
}

function classifyTransportFailure(error: unknown): {
  code: TransportFailureCode;
  message: string;
  retryable: boolean;
  terminal: boolean;
} {
  const message = error instanceof Error ? error.message : String(error);
  const protocolCode = error instanceof HereticSaisoError ? error.code : null;
  const lowered = message.toLowerCase();
  const retryable = Boolean((error as { retryable?: boolean } | null)?.retryable);

  if (protocolCode === 'HERETIC_TIMEOUT' || /timed out|timeout/.test(lowered)) {
    return {
      code: 'TRANSPORT_TURN_TIMEOUT',
      message,
      retryable: true,
      terminal: false,
    };
  }

  if (/socket|connect|econn|enoent|daemon|unavailable/.test(lowered)) {
    return {
      code: 'TRANSPORT_DAEMON_UNAVAILABLE',
      message,
      retryable: true,
      terminal: false,
    };
  }

  if (/payload|invalid json|invalid telegram payload|invalid webhook payload|invalid_envelope/.test(lowered)) {
    return {
      code: 'TRANSPORT_PAYLOAD_INVALID',
      message,
      retryable: false,
      terminal: true,
    };
  }

  if (/401|403|auth|forbidden|unauthorized/.test(lowered)) {
    return {
      code: 'TRANSPORT_AUTH_FAILED',
      message,
      retryable: false,
      terminal: true,
    };
  }

  if (retryable || /delivery|telegram|webhook/.test(lowered)) {
    return {
      code: 'TRANSPORT_DELIVERY_FAILED',
      message,
      retryable: true,
      terminal: false,
    };
  }

  return {
    code: 'TRANSPORT_TURN_FAILED',
    message,
    retryable: false,
    terminal: true,
  };
}

function extractVisibleToolIds(payload: Record<string, unknown>): string[] {
  const tools = Array.isArray(payload.tools)
    ? payload.tools
    : Array.isArray(asObject(payload.result).tools)
      ? asObject(payload.result).tools as unknown[]
      : [];
  return tools
    .map((entry) => {
      const tool = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? entry as Record<string, unknown>
        : {};
      const id = typeof tool.id === 'string'
        ? tool.id
        : typeof tool.toolId === 'string'
          ? tool.toolId
          : '';
      return id.trim();
    })
    .filter(Boolean);
}

async function enqueueFinalTransportDelivery(
  projectRoot: string,
  record: {
    key: string;
    transport: string;
    transportIdentity: string;
    channelId: string;
    threadId?: string;
    turnId: string | null;
    answer: string;
  },
): Promise<TransportOutboxEntry> {
  const suffix = record.turnId || record.key;
  return enqueueTransportOutboxEntry(projectRoot, {
    outboxId: `outbox-${randomUUID()}`,
    correlationKey: record.key,
    turnId: record.turnId,
    transport: record.transport,
    transportIdentity: record.transportIdentity,
    channelId: record.channelId,
    ...(record.threadId ? { threadId: record.threadId } : {}),
    payloadType: 'final',
    payload: {
      text: record.answer,
    },
    idempotencyKey: `${record.transport}:${record.transportIdentity}:${record.channelId}:${suffix}:final`,
    status: 'queued',
    attemptCount: 0,
    maxAttempts: resolveDeliveryRetryBudget(),
    nextAttemptAt: new Date().toISOString(),
  });
}

async function flushTransportOutboxEntry(
  projectRoot: string,
  router: ChatTransportRouter,
  outboxEntry: TransportOutboxEntry,
): Promise<{ delivered: boolean; delivery?: unknown; errorCode?: TransportFailureCode; errorMessage?: string }> {
  const transportState = await readTransportIndexState(projectRoot);
  const record = transportState.data.entries[outboxEntry.correlationKey];
  if (!record) {
    await deleteTransportOutboxEntry(projectRoot, outboxEntry.outboxId);
    return {
      delivered: false,
      errorCode: 'TRANSPORT_DELIVERY_FAILED',
      errorMessage: `Missing correlation record ${outboxEntry.correlationKey}`,
    };
  }

  await updateTransportOutboxEntry(projectRoot, outboxEntry.outboxId, (entry) => ({
    ...entry,
    status: 'running',
    lastAttemptAt: new Date().toISOString(),
    attemptCount: entry.attemptCount + 1,
  }));

  const refreshedOutbox = (await readTransportOutboxState(projectRoot)).data.entries[outboxEntry.outboxId];
  if (!refreshedOutbox) {
    return {
      delivered: false,
      errorCode: 'TRANSPORT_DELIVERY_FAILED',
      errorMessage: `Outbox entry disappeared: ${outboxEntry.outboxId}`,
    };
  }

  try {
    const delivery = await router.send(refreshedOutbox.transport, {
      channelId: refreshedOutbox.channelId,
      ...(refreshedOutbox.threadId ? { threadId: refreshedOutbox.threadId } : {}),
      text: refreshedOutbox.payload.text,
    }, {
      idempotencyKey: refreshedOutbox.idempotencyKey,
      retries: 0,
    });

    await markTransportTerminal(
      projectRoot,
      refreshedOutbox.correlationKey,
      record.terminalAnswer || refreshedOutbox.payload.text,
      record.terminalCode || 'ok',
      {
        outboxId: refreshedOutbox.outboxId,
        idempotencyKey: refreshedOutbox.idempotencyKey,
        messageId: typeof asObject(delivery).messageId === 'string' ? String(asObject(delivery).messageId) : undefined,
        deliveredAt: typeof asObject(delivery).deliveredAt === 'string' ? String(asObject(delivery).deliveredAt) : new Date().toISOString(),
        attemptCount: refreshedOutbox.attemptCount,
        lastAttemptAt: refreshedOutbox.lastAttemptAt,
        nextAttemptAt: null,
      },
    );
    await deleteTransportOutboxEntry(projectRoot, refreshedOutbox.outboxId);
    return {
      delivered: true,
      delivery,
    };
  } catch (error) {
    const classified = classifyTransportFailure(error);
    const exhausted = refreshedOutbox.attemptCount >= refreshedOutbox.maxAttempts || !classified.retryable;

    await updateTransportOutboxEntry(projectRoot, refreshedOutbox.outboxId, (entry) => ({
      ...entry,
      status: exhausted ? 'failed' : 'queued',
      lastErrorCode: classified.code,
      lastErrorMessage: classified.message,
      nextAttemptAt: exhausted ? entry.nextAttemptAt : computeDeliveryNextAttemptAt(entry.attemptCount),
    }));

    if (exhausted) {
      await markTransportNeedsReview(projectRoot, refreshedOutbox.correlationKey, classified.message, classified.code);
    } else {
      await markTransportFailedRecoverable(projectRoot, refreshedOutbox.correlationKey, classified.message, classified.code);
    }

    return {
      delivered: false,
      errorCode: classified.code,
      errorMessage: classified.message,
    };
  }
}

async function resolveLatestTransportChannel(
  projectRoot: string,
  transport: string,
  transportIdentity: string,
): Promise<{ channelId: string } | null> {
  const transportState = await readTransportIndexState(projectRoot);
  const candidates = Object.values(transportState.data.entries)
    .filter((entry) =>
      entry.transport === transport
      && entry.transportIdentity === transportIdentity
      && typeof entry.channelId === 'string'
      && entry.channelId.trim().length > 0,
    )
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));

  const newest = candidates[0];
  if (!newest) return null;
  return {
    channelId: newest.channelId,
  };
}

async function deliverAlertTransportUpdate(
  projectRoot: string,
  integration: HereticIntegrationConfig,
  router: ChatTransportRouter,
  payload: { text: string; eventKey: string; occurredAt: string },
): Promise<void> {
  const transport = integration.transport.selected;
  const transportIdentity = integration.transport.transportIdentity;
  if (!transport || transport === 'none' || !transportIdentity) {
    return;
  }

  const target = await resolveLatestTransportChannel(projectRoot, transport, transportIdentity);
  if (!target) {
    return;
  }

  await router.send(transport, {
    channelId: target.channelId,
    text: payload.text,
  }, {
    idempotencyKey: `${transport}:${transportIdentity}:${target.channelId}:${payload.eventKey}:${payload.occurredAt}:alert`,
    retries: 2,
  });
}

function buildTransportSummary(entries: Array<{
  status: string;
  transportIdentity: string;
  updatedAt: string;
  createdAt: string;
  failure?: { code?: string; retryable?: boolean };
}>): {
  unresolvedCount: number;
  retryableCount: number;
  byStatus: Record<string, number>;
  byReasonCode: Record<string, number>;
  byIdentity: Record<string, number>;
  byProfile: Record<string, number>;
  oldestUnresolvedAt: string | null;
} {
  const summary = {
    unresolvedCount: 0,
    retryableCount: 0,
    byStatus: {} as Record<string, number>,
    byReasonCode: {} as Record<string, number>,
    byIdentity: {} as Record<string, number>,
    byProfile: {} as Record<string, number>,
    oldestUnresolvedAt: null as string | null,
  };

  for (const entry of entries) {
    summary.byStatus[entry.status] = (summary.byStatus[entry.status] ?? 0) + 1;
    summary.byIdentity[entry.transportIdentity] = (summary.byIdentity[entry.transportIdentity] ?? 0) + 1;
    const profile = inferTransportProfile(entry.transportIdentity);
    summary.byProfile[profile] = (summary.byProfile[profile] ?? 0) + 1;

    const unresolved = entry.status !== 'delivered_terminal' && entry.status !== 'tombstoned';
    if (!unresolved) {
      continue;
    }
    summary.unresolvedCount += 1;
    if (entry.failure?.code) {
      summary.byReasonCode[entry.failure.code] = (summary.byReasonCode[entry.failure.code] ?? 0) + 1;
    }
    if (entry.failure?.retryable) {
      summary.retryableCount += 1;
    }

    const candidateAt = entry.updatedAt || entry.createdAt;
    if (!summary.oldestUnresolvedAt || Date.parse(candidateAt) < Date.parse(summary.oldestUnresolvedAt)) {
      summary.oldestUnresolvedAt = candidateAt;
    }
  }

  return summary;
}

async function runTransportReconcileCycle(
  projectRoot: string,
  integration: HereticIntegrationConfig,
  sessionId: string | null,
  router: ChatTransportRouter,
): Promise<Record<string, unknown>> {
  const summary = {
    recoveredTurns: 0,
    queuedDeliveries: 0,
    delivered: 0,
    retryableFailures: 0,
    operatorReviews: 0,
    pendingTurns: 0,
  };
  const turnRecoveryTimeoutMs = resolveTurnRecoveryTimeoutMs();
  const transportState = await readTransportIndexState(projectRoot);

  for (const entry of Object.values(transportState.data.entries)) {
    if (entry.status === 'pending_turn') {
      summary.pendingTurns += 1;
    }

    if (!sessionId || !entry.lineage.turnId || typeof entry.terminalAnswer === 'string') {
      continue;
    }

    if (entry.status !== 'pending_turn' && entry.status !== 'failed_recoverable') {
      continue;
    }

    try {
      const recovered = await recoverTurnAnswerFromSnapshot(integration, {
        sessionId,
        turnId: entry.lineage.turnId,
        submittedAtMs: Date.parse(entry.updatedAt || entry.createdAt),
      });
      if (recovered && recovered.trim()) {
        const safeAnswer = sanitizeTransportAnswer(recovered);
        await markTransportPendingDelivery(projectRoot, entry.key, safeAnswer, 'ok');
        await enqueueFinalTransportDelivery(projectRoot, {
          key: entry.key,
          transport: entry.transport,
          transportIdentity: entry.transportIdentity,
          channelId: entry.channelId,
          threadId: entry.threadId,
          turnId: entry.lineage.turnId,
          answer: safeAnswer,
        });
        summary.recoveredTurns += 1;
        summary.queuedDeliveries += 1;
        continue;
      }
    } catch (error) {
      const classified = classifyTransportFailure(error);
      if (classified.retryable) {
        await markTransportFailedRecoverable(projectRoot, entry.key, classified.message, classified.code);
        summary.retryableFailures += 1;
      } else {
        await markTransportNeedsReview(projectRoot, entry.key, classified.message, classified.code);
        summary.operatorReviews += 1;
      }
      continue;
    }

    const ageMs = Date.now() - Date.parse(entry.updatedAt || entry.createdAt);
    if (Number.isFinite(ageMs) && ageMs > turnRecoveryTimeoutMs) {
      await markTransportFailedRecoverable(projectRoot, entry.key, `Timed out waiting for turn ${entry.lineage.turnId}`, 'TRANSPORT_TURN_TIMEOUT');
      summary.retryableFailures += 1;
    }
  }

  const refreshedTransportState = await readTransportIndexState(projectRoot);
  for (const entry of Object.values(refreshedTransportState.data.entries)) {
    if ((entry.status === 'pending_delivery' || entry.status === 'failed_recoverable') && typeof entry.terminalAnswer === 'string' && entry.terminalAnswer.trim()) {
      if (entry.status === 'failed_recoverable') {
        await markTransportPendingDelivery(projectRoot, entry.key, entry.terminalAnswer, entry.terminalCode || 'ok');
      }
      await enqueueFinalTransportDelivery(projectRoot, {
        key: entry.key,
        transport: entry.transport,
        transportIdentity: entry.transportIdentity,
        channelId: entry.channelId,
        threadId: entry.threadId,
        turnId: entry.lineage.turnId,
        answer: entry.terminalAnswer,
      });
      summary.queuedDeliveries += 1;
    }
  }

  const outboxState = await readTransportOutboxState(projectRoot);
  const dueEntries = Object.values(outboxState.data.entries)
    .filter((entry) => Date.parse(entry.nextAttemptAt) <= Date.now())
    .sort((left, right) => Date.parse(left.nextAttemptAt) - Date.parse(right.nextAttemptAt));

  for (const outboxEntry of dueEntries) {
    const result = await flushTransportOutboxEntry(projectRoot, router, outboxEntry);
    if (result.delivered) {
      summary.delivered += 1;
      continue;
    }
    if (result.errorCode === 'TRANSPORT_DELIVERY_FAILED' || result.errorCode === 'TRANSPORT_DAEMON_UNAVAILABLE' || result.errorCode === 'TRANSPORT_TURN_TIMEOUT') {
      summary.retryableFailures += 1;
    } else {
      summary.operatorReviews += 1;
    }
  }

  return summary;
}

export function registerHereticCommands(program: Command, context: SaisoPluginContext): void {
  hydrateProjectEnv(context.paths.projectRoot);
  const heretic = new Command('heretic').description('Heretic daemon integration (workspace/session/runtime/chat/goal/alert)');

  heretic.command('init')
    .description('Initialize Heretic integration profile for this SAISO project')
    .option('--daemon-path <path>', 'Path to local heretic-daemon checkout')
    .option('--config-dir <path>', 'Heretic config directory (maps to HERETIC_CONFIG_DIR/HERETIC_HOME)')
    .option('--socket-path <path>', 'Heretic daemon socket path')
    .option('--transport <transport>', 'Default transport id')
    .option('--transport-identity <identity>', 'Transport account identity (bot id/account id/instance id)')
    .option('--policy-strict', 'Enable strict policy mode in integration config')
    .option('--policy-lax', 'Disable strict policy mode in integration config')
    .option('--json', 'Emit JSON')
    .action(async (options: {
      daemonPath?: string;
      configDir?: string;
      socketPath?: string;
      transport?: string;
      transportIdentity?: string;
      policyStrict?: boolean;
      policyLax?: boolean;
      json?: boolean;
    }) => {
      const strict = resolveCliStrict(options);
      const daemonPatch: Partial<HereticIntegrationConfig['daemon']> = {};
      if (typeof options.daemonPath === 'string') daemonPatch.daemonPath = options.daemonPath;
      if (typeof options.configDir === 'string') daemonPatch.configDir = options.configDir;
      if (typeof options.socketPath === 'string') daemonPatch.socketPath = options.socketPath;

      const transportPatch: Partial<HereticIntegrationConfig['transport']> = {};
      if (typeof options.transport === 'string') transportPatch.selected = options.transport;
      if (typeof options.transportIdentity === 'string') transportPatch.transportIdentity = options.transportIdentity;

      const updated = await initializeIntegration(context.paths.projectRoot, {
        ...(Object.keys(daemonPatch).length > 0 ? { daemon: daemonPatch } : {}),
        ...(Object.keys(transportPatch).length > 0 ? { transport: transportPatch } : {}),
        ...(typeof strict === 'boolean' ? { policy: { strict } } : {}),
      });

      const health = await healthcheckDaemon(updated);
      asJsonOutput(options, {
        integration: updated,
        daemon: health,
      }, `Initialized heretic-saiso integration (socket=${health.socketPath})`);
    });

  const workspace = heretic.command('workspace').description('Bind local workspace roots to Heretic project/session records');

  workspace.command('attach')
    .description('Attach workspace to Heretic project/session and persist binding')
    .option('--project-root <path>', 'Workspace path (defaults to project root)')
    .option('--label <label>', 'Project label override')
    .option('--session-title <title>', 'Session title override')
    .option('--json', 'Emit JSON')
    .action(async (options: {
      projectRoot?: string;
      label?: string;
      sessionTitle?: string;
      json?: boolean;
    }) => {
      const integration = await loadIntegration(context.paths.projectRoot);
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);

      const binding = await attachWorkspaceToDaemon(integration, {
        workspaceRoot,
        label: options.label,
        sessionTitle: options.sessionTitle,
      });

      const saved = await bindWorkspace(context.paths.projectRoot, workspaceRoot, binding);
      asJsonOutput(options, { binding: saved }, `Attached workspace ${workspaceRoot} -> session ${saved.sessionId}`);
    });

  const runtime = heretic.command('runtime').description('Configure runtime provider/model/profile through Heretic daemon');

  runtime.command('catalog')
    .description('Fetch provider/model catalog for bound session')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--json', 'Emit JSON')
    .action(async (options: { projectRoot?: string; json?: boolean }) => {
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const integration = await loadIntegration(context.paths.projectRoot);
      const sessionId = await getBoundSessionId(context, workspaceRoot);
      const catalog = await queryModelCatalog(integration, sessionId);
      asJsonOutput(options, { sessionId, catalog });
    });

  runtime.command('set-provider <providerId>')
    .description('Set daemon runtime provider for bound session')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--json', 'Emit JSON')
    .action(async (providerId: string, options: { projectRoot?: string; json?: boolean }) => {
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const integration = await loadIntegration(context.paths.projectRoot);
      const sessionId = await getBoundSessionId(context, workspaceRoot);
      await setRuntimeProvider(integration, sessionId, providerId);
      asJsonOutput(options, { sessionId, providerId }, `Set provider '${providerId}' for session ${sessionId}`);
    });

  runtime.command('set-model <model>')
    .description('Set daemon runtime model for bound session')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--json', 'Emit JSON')
    .action(async (model: string, options: { projectRoot?: string; json?: boolean }) => {
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const integration = await loadIntegration(context.paths.projectRoot);
      const sessionId = await getBoundSessionId(context, workspaceRoot);
      await setRuntimeModel(integration, sessionId, model);
      asJsonOutput(options, { sessionId, model }, `Set model '${model}' for session ${sessionId}`);
    });

  runtime.command('set-profile <profileId>')
    .description('Set daemon runtime profile for bound session')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--json', 'Emit JSON')
    .action(async (profileId: string, options: { projectRoot?: string; json?: boolean }) => {
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const integration = await loadIntegration(context.paths.projectRoot);
      const sessionId = await getBoundSessionId(context, workspaceRoot);
      await setRuntimeProfile(integration, sessionId, profileId);
      asJsonOutput(options, { sessionId, profileId }, `Set profile '${profileId}' for session ${sessionId}`);
    });

  runtime.command('set-stream <enabled>')
    .description('Set daemon runtime stream mode for bound session (true|false)')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--json', 'Emit JSON')
    .action(async (enabled: string, options: { projectRoot?: string; json?: boolean }) => {
      const normalized = enabled.trim().toLowerCase();
      if (normalized !== 'true' && normalized !== 'false') {
        throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Invalid stream value '${enabled}', use true or false`);
      }
      const streamEnabled = normalized === 'true';
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const integration = await loadIntegration(context.paths.projectRoot);
      const sessionId = await getBoundSessionId(context, workspaceRoot);
      await setRuntimeStream(integration, sessionId, streamEnabled);
      asJsonOutput(options, { sessionId, streamEnabled }, `Set stream=${streamEnabled} for session ${sessionId}`);
    });

  const chat = heretic.command('chat').description('Transport configuration and chat relay');
  const transport = chat.command('transport').description('Manage selectable transport profile');

  transport.command('list')
    .description('List supported transport adapters')
    .option('--json', 'Emit JSON')
    .action((options: { json?: boolean }) => {
      asJsonOutput(options, { transports: TRANSPORT_CATALOG }, TRANSPORT_CATALOG.map((entry) => `- ${entry.transport}`).join('\n'));
    });

  transport.command('use <transportId>')
    .description('Select active transport and optional transport identity')
    .option('--identity <transportIdentity>', 'Adapter account identity (bot/account/instance)')
    .option('--json', 'Emit JSON')
    .action(async (transportId: string, options: { identity?: string; json?: boolean }) => {
      if (!TRANSPORT_CATALOG.find((entry) => entry.transport === transportId)) {
        throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Unsupported transport '${transportId}'`);
      }

      const integration = await initializeIntegration(context.paths.projectRoot, {
        transport: {
          selected: transportId,
          ...(typeof options.identity === 'string' ? { transportIdentity: options.identity } : {}),
        },
      });

      asJsonOutput(options, { transport: integration.transport }, `Selected transport '${transportId}'`);
    });

  chat.command('relay <message>')
    .description('Relay one inbound chat message to Heretic turn runtime')
    .requiredOption('--channel-id <channelId>', 'Transport channel id')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--transport <transportId>', 'Override selected transport')
    .option('--transport-identity <transportIdentity>', 'Transport account identity')
    .option('--message-id <messageId>', 'Inbound message id (idempotency key component)')
    .option('--approval-policy <policy>', 'interactive|auto_deny|never', 'interactive')
    .option('--json', 'Emit JSON')
    .action(async (message: string, options: {
      channelId: string;
      projectRoot?: string;
      transport?: string;
      transportIdentity?: string;
      messageId?: string;
      approvalPolicy?: 'interactive' | 'auto_deny' | 'never';
      json?: boolean;
    }) => {
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const integration = await loadIntegration(context.paths.projectRoot);

      const transportId = options.transport || integration.transport.selected;
      const transportIdentity = ensureTransportIdentity(options.transportIdentity || integration.transport.transportIdentity);
      enforceTransportProfile(transportIdentity);
      const messageId = options.messageId || `msg-${Date.now().toString(36)}`;

      const correlationKey = buildCorrelationKey({
        transport: transportId,
        transportIdentity,
        channelId: options.channelId,
        messageId,
      });

      await pruneTransportIndex(context.paths.projectRoot, {
        terminalTtlMs: integration.transport.terminalTtlMs,
        unresolvedTtlMs: integration.transport.unresolvedTtlMs,
      });

      const reservation = await reserveTransportCorrelation(context.paths.projectRoot, {
        key: correlationKey,
        transport: transportId,
        transportIdentity,
        channelId: options.channelId,
        messageId,
        clientRequestId: makeClientRequestId(),
      });

      if (reservation.kind === 'terminal') {
        const safeAnswer = sanitizeTransportAnswer(reservation.record.terminalAnswer || '');
        asJsonOutput(options, {
          reused: true,
          correlationKey,
          answer: safeAnswer,
          turnId: reservation.record.lineage.turnId,
        }, safeAnswer);
        return;
      }

      if (reservation.kind === 'existing') {
        asJsonOutput(options, {
          reused: true,
          correlationKey,
          status: reservation.record.status,
          turnId: reservation.record.lineage.turnId,
        }, `Existing correlation status: ${reservation.record.status}`);
        return;
      }

      const commandHook = await runProjectChatCommandHook({
        projectRoot: context.paths.projectRoot,
        workspaceRoot,
        mode: 'relay',
        message,
        transport: transportId,
        transportIdentity,
        channelId: options.channelId,
        correlationKey,
      });

      if (commandHook?.handled) {
        const safeAnswer = sanitizeTransportAnswer(commandHook.responseText || '');
        await markTransportTerminal(context.paths.projectRoot, correlationKey, safeAnswer, 'local_command');
        asJsonOutput(options, {
          reused: false,
          localCommand: true,
          correlationKey,
          answer: safeAnswer,
          data: commandHook.data ?? null,
        }, safeAnswer);
        return;
      }

      const binding = await requireWorkspaceBinding(context.paths.projectRoot, workspaceRoot);
      const chatTurnTimeoutMs = resolveChatTurnTimeoutMs();

      try {
        const result = await submitTurnAndWait(integration, {
          sessionId: binding.sessionId,
          content: message,
          approvalPolicy: options.approvalPolicy,
          timeoutMs: chatTurnTimeoutMs,
        });

        const safeAnswer = sanitizeTransportAnswer(result.answer);
        await markTransportTurnId(context.paths.projectRoot, correlationKey, result.turnId);
        await markTransportTerminal(context.paths.projectRoot, correlationKey, safeAnswer, 'ok');

        asJsonOutput(options, {
          reused: false,
          correlationKey,
          turnId: result.turnId,
          answer: safeAnswer,
        }, safeAnswer);
      } catch (error) {
        const classified = classifyTransportFailure(error);
        if (classified.retryable) {
          await markTransportFailedRecoverable(context.paths.projectRoot, correlationKey, classified.message, classified.code);
        } else if (classified.code === 'TRANSPORT_PAYLOAD_INVALID' || classified.code === 'TRANSPORT_AUTH_FAILED') {
          await markTransportNeedsReview(context.paths.projectRoot, correlationKey, classified.message, classified.code);
        } else {
          await markTransportFailedTerminal(context.paths.projectRoot, correlationKey, classified.message, classified.code);
        }
        throw error;
      }
    });

  chat.command('ingest')
    .description('Ingest transport payload, normalize via transport adapter, submit to daemon, and deliver reply')
    .option('--payload-json <payload>', 'Raw inbound transport payload as JSON string')
    .option('--payload-file <path>', 'Path to file containing inbound JSON payload')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--transport <transportId>', 'Transport id (defaults to selected transport)')
    .option('--transport-identity <transportIdentity>', 'Transport account identity')
    .option('--approval-policy <policy>', 'interactive|auto_deny|never', 'interactive')
    .option('--json', 'Emit JSON')
    .action(async (options: {
      payloadJson?: string;
      payloadFile?: string;
      projectRoot?: string;
      transport?: string;
      transportIdentity?: string;
      approvalPolicy?: 'interactive' | 'auto_deny' | 'never';
      json?: boolean;
    }) => {
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const integration = await loadIntegration(context.paths.projectRoot);
      const transportId = options.transport || integration.transport.selected;
      const transportIdentity = ensureTransportIdentity(options.transportIdentity || integration.transport.transportIdentity);
      enforceTransportProfile(transportIdentity);

      if (!options.payloadFile && !options.payloadJson) {
        throw new HereticSaisoError('HERETIC_INVALID_INPUT', 'Provide --payload-json or --payload-file');
      }

      const payload = options.payloadFile
        ? parsePayloadJson(await readFile(path.resolve(options.payloadFile), 'utf-8'))
        : parsePayloadJson(options.payloadJson || '');

      const router = createTransportRouter();
      const inbound = await router.ingest(transportId, payload);
      const correlationKey = buildCorrelationKey({
        transport: inbound.transport,
        transportIdentity,
        channelId: inbound.channelId,
        messageId: inbound.messageId,
      });

      await pruneTransportIndex(context.paths.projectRoot, {
        terminalTtlMs: integration.transport.terminalTtlMs,
        unresolvedTtlMs: integration.transport.unresolvedTtlMs,
      });

      const reservation = await reserveTransportCorrelation(context.paths.projectRoot, {
        key: correlationKey,
        transport: inbound.transport,
        transportIdentity,
        channelId: inbound.channelId,
        threadId: inbound.threadId,
        messageId: inbound.messageId,
        clientRequestId: makeClientRequestId(),
      });

      if (reservation.kind === 'terminal') {
        const safeAnswer = sanitizeTransportAnswer(reservation.record.terminalAnswer || '');
        asJsonOutput(options, {
          reused: true,
          inbound,
          answer: safeAnswer,
          turnId: reservation.record.lineage.turnId,
          correlationKey,
        }, safeAnswer);
        return;
      }

      if (reservation.kind === 'existing') {
        asJsonOutput(options, {
          reused: true,
          inbound,
          status: reservation.record.status,
          turnId: reservation.record.lineage.turnId,
          correlationKey,
        }, `Existing correlation status: ${reservation.record.status}`);
        return;
      }

      const commandHook = await runProjectChatCommandHook({
        projectRoot: context.paths.projectRoot,
        workspaceRoot,
        mode: 'ingest',
        message: inbound.text?.trim() || '',
        transport: inbound.transport,
        transportIdentity,
        channelId: inbound.channelId,
        threadId: inbound.threadId,
        correlationKey,
      });

      try {
        if (commandHook?.handled) {
          const safeAnswer = sanitizeTransportAnswer(commandHook.responseText || '');
          await markTransportPendingDelivery(context.paths.projectRoot, correlationKey, safeAnswer, 'local_command');
          const outbox = await enqueueFinalTransportDelivery(context.paths.projectRoot, {
            key: correlationKey,
            transport: inbound.transport,
            transportIdentity,
            channelId: inbound.channelId,
            threadId: inbound.threadId,
            turnId: null,
            answer: safeAnswer,
          });
          const delivery = await flushTransportOutboxEntry(context.paths.projectRoot, router, outbox);

          asJsonOutput(options, {
            reused: false,
            localCommand: true,
            inbound,
            answer: safeAnswer,
            delivery,
            correlationKey,
            data: commandHook.data ?? null,
          }, safeAnswer);
          return;
        }

        const binding = await requireWorkspaceBinding(context.paths.projectRoot, workspaceRoot);
        const content = inbound.text?.trim() || JSON.stringify(inbound.raw || payload);
        const submitted = await submitTurn(integration, {
          sessionId: binding.sessionId,
          content,
          approvalPolicy: options.approvalPolicy,
          timeoutMs: resolveChatTurnTimeoutMs(),
        });

        await markTransportTurnId(context.paths.projectRoot, correlationKey, submitted.turnId);

        asJsonOutput(options, {
          reused: false,
          accepted: true,
          pending: true,
          inbound,
          turnId: submitted.turnId,
          correlationKey,
          status: 'pending_turn',
        }, `Accepted transport message ${correlationKey} (turn ${submitted.turnId})`);
      } catch (error) {
        const classified = classifyTransportFailure(error);
        if (classified.retryable) {
          await markTransportFailedRecoverable(context.paths.projectRoot, correlationKey, classified.message, classified.code);
        } else if (classified.code === 'TRANSPORT_PAYLOAD_INVALID' || classified.code === 'TRANSPORT_AUTH_FAILED') {
          await markTransportNeedsReview(context.paths.projectRoot, correlationKey, classified.message, classified.code);
        } else {
          await markTransportFailedTerminal(context.paths.projectRoot, correlationKey, classified.message, classified.code);
        }
        throw error;
      }
    });

  const transportCommand = heretic.command('transport').description('Transport state inspection and reconciliation');

  transportCommand.command('list')
    .description('List transport correlation and outbox state')
    .option('--json', 'Emit JSON')
    .action(async (options: { json?: boolean }) => {
      const transportIndex = await readTransportIndexState(context.paths.projectRoot);
      const transportOutbox = await readTransportOutboxState(context.paths.projectRoot);
      const entries = Object.values(transportIndex.data.entries)
        .sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt));
      const summary = buildTransportSummary(entries);

      asJsonOutput(options, {
        summary,
        entries,
        outbox: Object.values(transportOutbox.data.entries),
      }, `Transport entries=${entries.length} unresolved=${summary.unresolvedCount} retryable=${summary.retryableCount}`);
    });

  transportCommand.command('reconcile')
    .description('Recover completed turns and flush due transport deliveries')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--run-once', 'Run one reconciliation pass', true)
    .option('--json', 'Emit JSON')
    .action(async (options: { projectRoot?: string; runOnce?: boolean; json?: boolean }) => {
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const integration = await loadIntegration(context.paths.projectRoot);
      const router = createTransportRouter();
      const binding = await getWorkspaceBinding(context.paths.projectRoot, workspaceRoot);
      const cycle = await runTransportReconcileCycle(
        context.paths.projectRoot,
        integration,
        binding?.sessionId ?? null,
        router,
      );
      const transportIndex = await readTransportIndexState(context.paths.projectRoot);
      const summary = buildTransportSummary(Object.values(transportIndex.data.entries));

      asJsonOutput(options, {
        cycle,
        summary,
      }, `Transport reconcile delivered=${String(cycle.delivered ?? 0)} recovered=${String(cycle.recoveredTurns ?? 0)} unresolved=${summary.unresolvedCount}`);
    });

  transportCommand.command('tombstone')
    .description('Tombstone unresolved transport entries by key or filter')
    .option('--key <correlationKey>', 'Exact correlation key to tombstone')
    .option('--older-than-hours <hours>', 'Only tombstone entries older than this age')
    .option('--profile <profile>', 'prod|smoke|e2e|debug')
    .option('--status <statuses>', 'CSV status filter (for example: pending_turn,failed_recoverable)')
    .option('--reason <reason>', 'Tombstone reason', 'operator_closed')
    .option('--dry-run', 'Report matches without mutating state')
    .option('--json', 'Emit JSON')
    .action(async (options: {
      key?: string;
      olderThanHours?: string;
      profile?: string;
      status?: string;
      reason?: string;
      dryRun?: boolean;
      json?: boolean;
    }) => {
      const requestedKey = (options.key || '').trim();
      const requestedProfile = (options.profile || '').trim().toLowerCase();
      const requestedReason = (options.reason || 'operator_closed').trim() || 'operator_closed';
      const statusFilter = new Set((options.status || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean));

      const hasAgeFilter = typeof options.olderThanHours === 'string' && options.olderThanHours.trim().length > 0;
      const olderThanHours = hasAgeFilter ? Number(options.olderThanHours) : null;
      if (!requestedKey && !hasAgeFilter) {
        throw new HereticSaisoError('HERETIC_INVALID_INPUT', 'Provide --key or --older-than-hours for transport tombstone.');
      }
      if (hasAgeFilter && (!Number.isFinite(olderThanHours) || olderThanHours === null || olderThanHours < 0)) {
        throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Invalid --older-than-hours value '${options.olderThanHours}'.`);
      }
      if (requestedProfile && !['prod', 'smoke', 'e2e', 'debug'].includes(requestedProfile)) {
        throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Invalid --profile value '${requestedProfile}'.`);
      }

      const cutoffMs = Number.isFinite(olderThanHours) && olderThanHours !== null
        ? Date.now() - (olderThanHours * 60 * 60 * 1000)
        : null;

      const transportIndex = await readTransportIndexState(context.paths.projectRoot);
      const outboxState = await readTransportOutboxState(context.paths.projectRoot);
      const candidates = Object.values(transportIndex.data.entries)
        .filter((entry) => entry.status !== 'delivered_terminal' && entry.status !== 'tombstoned')
        .filter((entry) => !requestedKey || entry.key === requestedKey)
        .filter((entry) => !requestedProfile || inferTransportProfile(entry.transportIdentity) === requestedProfile)
        .filter((entry) => statusFilter.size === 0 || statusFilter.has(entry.status))
        .filter((entry) => {
          if (cutoffMs === null) {
            return true;
          }
          const ageAnchor = Date.parse(entry.updatedAt || entry.createdAt);
          return Number.isFinite(ageAnchor) && ageAnchor <= cutoffMs;
        })
        .sort((left, right) => Date.parse(left.updatedAt || left.createdAt) - Date.parse(right.updatedAt || right.createdAt));

      if (!options.dryRun) {
        const candidateKeys = new Set(candidates.map((entry) => entry.key));
        for (const entry of candidates) {
          await tombstoneTransportCorrelation(context.paths.projectRoot, entry.key, requestedReason);
        }
        for (const outboxEntry of Object.values(outboxState.data.entries)) {
          if (candidateKeys.has(outboxEntry.correlationKey)) {
            await deleteTransportOutboxEntry(context.paths.projectRoot, outboxEntry.outboxId);
          }
        }
      }

      const refreshed = await readTransportIndexState(context.paths.projectRoot);
      const summary = buildTransportSummary(Object.values(refreshed.data.entries));
      asJsonOutput(options, {
        dryRun: options.dryRun === true,
        matched: candidates.length,
        keys: candidates.map((entry) => entry.key),
        summary,
      }, `${options.dryRun ? 'Matched' : 'Tombstoned'} ${candidates.length} transport entr${candidates.length === 1 ? 'y' : 'ies'}.`);
    });

  const goal = heretic.command('goal').description('Semi-autonomous goal lifecycle management');

  goal.command('start <objective>')
    .description('Create/start goal with policy preflight enforcement')
    .option('--id <id>', 'Goal id')
    .option('--actor <actor>', 'Actor id', 'operator')
    .option('--requires-approval', 'Require approval before running', true)
    .option('--no-requires-approval', 'Skip approval requirement')
    .option('--auto-approve', 'Auto-approve when approval is required', false)
    .option('--policy-strict', 'CLI override strict policy on')
    .option('--policy-lax', 'CLI override strict policy off')
    .option('--json', 'Emit JSON')
    .action(async (objective: string, options: {
      id?: string;
      actor?: string;
      requiresApproval?: boolean;
      autoApprove?: boolean;
      policyStrict?: boolean;
      policyLax?: boolean;
      json?: boolean;
    }) => {
      const integration = await loadIntegration(context.paths.projectRoot);
      const preflight = await preflightPolicyCheck(context.paths.projectRoot, integration, {
        operationClass: 'goal',
        cliStrict: resolveCliStrict(options),
      });

      const goalId = options.id || makeGoalId();
      await appendGoalPolicyEvent(context.paths.projectRoot, {
        goalId,
        actor: options.actor || 'operator',
        decision: preflight.decision,
        reason: preflight.reason,
      });

      if (preflight.decision === 'deny') {
        throw new HereticSaisoError('HERETIC_POLICY_DENIED', preflight.reason, {
          strict: preflight.strict,
          strictSource: preflight.strictSource,
        });
      }

      const requiresApproval = preflight.decision === 'require_approval' || options.requiresApproval === true;
      const goalRecord = await runGoalTransition(context.paths.projectRoot, {
        id: goalId,
        title: objective,
        actor: options.actor || 'operator',
        requiresApproval,
        autoApprove: Boolean(options.autoApprove),
      });

      asJsonOutput(options, {
        goal: goalRecord,
        policy: preflight,
      }, `Goal '${goalRecord.id}' state=${goalRecord.state}`);
    });

  goal.command('status <id>')
    .description('Inspect goal status')
    .option('--json', 'Emit JSON')
    .action(async (id: string, options: { json?: boolean }) => {
      const { runner } = await loadGoalRunnerForProject(context.paths.projectRoot);
      const record = runner.get(id);
      asJsonOutput(options, { goal: record }, `Goal '${record.id}' state=${record.state}`);
    });

  goal.command('list')
    .description('List all tracked goals')
    .option('--json', 'Emit JSON')
    .action(async (options: { json?: boolean }) => {
      const { runner } = await loadGoalRunnerForProject(context.paths.projectRoot);
      const goals = runner.list();
      asJsonOutput(options, { goals }, goals.map((goalEntry) => `- ${goalEntry.id} [${goalEntry.state}] ${goalEntry.title}`).join('\n') || 'No goals found');
    });

  goal.command('stop <id>')
    .description('Cancel a running/pending goal')
    .option('--actor <actor>', 'Actor id', 'operator')
    .option('--reason <reason>', 'Reason', 'stopped by operator')
    .option('--json', 'Emit JSON')
    .action(async (id: string, options: { actor?: string; reason?: string; json?: boolean }) => {
      const { runner } = await loadGoalRunnerForProject(context.paths.projectRoot);
      const record = runner.cancel(id, options.reason, options.actor || 'operator');
      await updateGoalsState(context.paths.projectRoot, (current) => ({
        ...current.data,
        goals: runner.list(),
      }));
      asJsonOutput(options, { goal: record }, `Goal '${record.id}' cancelled`);
    });

  const alert = heretic.command('alert').description('Alert rule management and scheduler checks');

  alert.command('add')
    .description('Add an alert rule')
    .requiredOption('--asset <asset>', 'Asset symbol, e.g. ETH')
    .requiredOption('--rule <rule>', 'Rule expression, e.g. price>3000')
    .option('--id <id>', 'Alert id')
    .option('--interval <ms>', 'Polling interval ms', '60000')
    .option('--cooldown <ms>', 'Cooldown ms', '30000')
    .option('--actor <actor>', 'Actor id', 'operator')
    .option('--approve', 'Approve creation when policy requires approval', false)
    .option('--policy-strict', 'CLI override strict policy on')
    .option('--policy-lax', 'CLI override strict policy off')
    .option('--json', 'Emit JSON')
    .action(async (options: {
      asset: string;
      rule: string;
      id?: string;
      interval?: string;
      cooldown?: string;
      actor?: string;
      approve?: boolean;
      policyStrict?: boolean;
      policyLax?: boolean;
      json?: boolean;
    }) => {
      const integration = await loadIntegration(context.paths.projectRoot);
      const preflight = await preflightPolicyCheck(context.paths.projectRoot, integration, {
        operationClass: 'alert',
        cliStrict: resolveCliStrict(options),
      });

      if (preflight.decision === 'deny') {
        throw new HereticSaisoError('HERETIC_POLICY_DENIED', preflight.reason, {
          strict: preflight.strict,
          strictSource: preflight.strictSource,
        });
      }

      const status = preflight.decision === 'require_approval' && !options.approve
        ? 'pending_approval'
        : 'active';
      const intervalMs = Math.max(1000, Number(options.interval || '60000'));
      const cooldownMs = Math.max(0, Number(options.cooldown || '30000'));
      const ruleDefinition = parseAlertRule(options.asset, options.rule, intervalMs, cooldownMs);

      const created = await addAlertRule(context.paths.projectRoot, {
        id: options.id || makeAlertId(options.asset),
        asset: options.asset,
        rule: ruleDefinition,
        intervalMs,
        cooldownMs,
        status,
      });

      asJsonOutput(options, { alert: created, policy: preflight }, `Created alert '${created.id}' status=${created.status}`);
    });

  alert.command('list')
    .description('List alert rules')
    .option('--json', 'Emit JSON')
    .action(async (options: { json?: boolean }) => {
      const rules = await listAlertRules(context.paths.projectRoot);
      asJsonOutput(options, { alerts: rules }, rules.map((entry) => `- ${entry.id} [${entry.status}] ${entry.asset} ${formatAlertRule(entry.rule)}`).join('\n') || 'No alerts found');
    });

  alert.command('remove <id>')
    .description('Remove alert rule')
    .option('--json', 'Emit JSON')
    .action(async (id: string, options: { json?: boolean }) => {
      const removed = await removeAlertRule(context.paths.projectRoot, id);
      asJsonOutput(options, { removed, id }, removed ? `Removed alert '${id}'` : `Alert '${id}' not found`);
    });

  alert.command('pause <id>')
    .description('Pause alert rule')
    .option('--json', 'Emit JSON')
    .action(async (id: string, options: { json?: boolean }) => {
      const updated = await setAlertStatus(context.paths.projectRoot, id, 'paused');
      asJsonOutput(options, { alert: updated }, `Paused alert '${updated.id}'`);
    });

  alert.command('resume <id>')
    .description('Resume alert rule')
    .option('--approve', 'Approve when rule is pending_approval', false)
    .option('--json', 'Emit JSON')
    .action(async (id: string, options: { approve?: boolean; json?: boolean }) => {
      const updated = await setAlertStatus(context.paths.projectRoot, id, options.approve ? 'active' : 'pending_approval');
      asJsonOutput(options, { alert: updated }, `Updated alert '${updated.id}' to ${updated.status}`);
    });

  alert.command('check <id>')
    .description('Evaluate one alert against current price and run scheduler')
    .requiredOption('--price <value>', 'Current price value')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--notify-daemon', 'Relay triggered alert into daemon session and selected transport channel', false)
    .option('--json', 'Emit JSON')
    .action(async (id: string, options: {
      price: string;
      projectRoot?: string;
      notifyDaemon?: boolean;
      json?: boolean;
    }) => {
      const price = Number(options.price);
      if (!Number.isFinite(price)) {
        throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Invalid price '${options.price}'`);
      }

      const rules = await listAlertRules(context.paths.projectRoot);
      const target = rules.find((rule) => rule.id === id);
      if (!target) {
        throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Alert '${id}' not found`);
      }

      if (target.status !== 'active') {
        asJsonOutput(options, {
          triggered: false,
          reason: `alert status is ${target.status}`,
          alert: target,
        }, `Alert '${id}' is ${target.status}`);
        return;
      }

      const triggered = evaluateAlertRule(target.rule, price);
      if (!triggered) {
        asJsonOutput(options, {
          triggered: false,
          alert: target,
          price,
        }, `Alert '${id}' not triggered at price ${price}`);
        return;
      }

      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const router = options.notifyDaemon ? createTransportRouter() : null;
      const alertNotifyTimeoutMs = resolveAlertNotifyTimeoutMs();

      const result = await processAlertEvent(
        context.paths.projectRoot,
        {
          id: target.id,
          key: target.asset,
              payload: {
                asset: target.asset,
                price,
                rule: formatAlertRule(target.rule),
              },
              occurredAt: new Date().toISOString(),
            },
        async (event) => {
          if (!options.notifyDaemon) {
            return;
          }
          const summary = formatAlertNotification(event);
          const integration = await loadIntegration(context.paths.projectRoot);
          try {
            const binding = await requireWorkspaceBinding(context.paths.projectRoot, workspaceRoot);
            await submitTurnAndWait(integration, {
              sessionId: binding.sessionId,
              content: summary,
              approvalPolicy: 'interactive',
              timeoutMs: alertNotifyTimeoutMs,
            });
          } catch {
            // Keep scheduler delivery resilient even when daemon turn submission stalls.
          }
          if (router) {
            await deliverAlertTransportUpdate(context.paths.projectRoot, integration, router, {
              text: summary,
              eventKey: event.key,
              occurredAt: event.occurredAt,
            });
          }
        },
      );

      await updateAlertsState(context.paths.projectRoot, (current) => ({
        ...current.data,
        rules: current.data.rules.map((rule) => {
          if (rule.id !== target.id) return rule;
          return {
            ...rule,
            lastTriggeredAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }),
      }));

      asJsonOutput(options, {
        triggered: true,
        alert: target,
        scheduler: result,
      }, `Alert '${id}' triggered (${result.reason})`);
    });

  alert.command('worker')
    .description('Run scheduled alert checks from a prices JSON source (asset->price) for one or more cycles')
    .requiredOption('--prices-file <path>', 'Path to JSON file map, e.g. {\"ETH\": 3200}')
    .option('--price-source <source>', 'Price source: file|coingecko', 'file')
    .option('--vs-currency <currency>', 'Fiat quote currency for coingecko source', 'usd')
    .option('--interval <ms>', 'Poll interval milliseconds', '60000')
    .option('--cycles <n>', 'Number of cycles (0 = run forever)', '0')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--notify-daemon', 'Relay triggered alerts into daemon session and selected transport channel', false)
    .option('--json', 'Emit JSON summary at end')
    .action(async (options: {
      pricesFile: string;
      priceSource?: string;
      vsCurrency?: string;
      interval?: string;
      cycles?: string;
      projectRoot?: string;
      notifyDaemon?: boolean;
      json?: boolean;
    }) => {
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const intervalMs = Math.max(1000, Number(options.interval || '60000'));
      const cycles = Math.max(0, Number(options.cycles || '0'));
      const router = options.notifyDaemon ? createTransportRouter() : null;
      const alertNotifyTimeoutMs = resolveAlertNotifyTimeoutMs();

      let completedCycles = 0;
      let triggeredCount = 0;
      let checkedCount = 0;
      const priceSource = (options.priceSource || 'file').trim().toLowerCase();
      const vsCurrency = (options.vsCurrency || 'usd').trim().toLowerCase();

      while (true) {
        await heartbeatRuntimeWorker(context.paths.projectRoot);
        const rules = await listAlertRules(context.paths.projectRoot);
        const activeRules = rules.filter((rule) => rule.status === 'active');

        let priceMap: Record<string, unknown> = {};
        if (priceSource === 'file') {
          const pricePayload = parsePayloadJson(await readFile(path.resolve(options.pricesFile), 'utf-8'));
          if (!pricePayload || typeof pricePayload !== 'object' || Array.isArray(pricePayload)) {
            throw new HereticSaisoError('HERETIC_INVALID_INPUT', '--prices-file must contain a JSON object map of asset->price');
          }
          priceMap = pricePayload as Record<string, unknown>;
        } else if (priceSource === 'coingecko') {
          const symbols = Array.from(new Set(activeRules.map((rule) => rule.asset.toUpperCase())));
          priceMap = await fetchCoinGeckoPriceMap(symbols, vsCurrency);
        } else {
          throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Unsupported --price-source '${priceSource}'. Use file|coingecko`);
        }

        for (const rule of activeRules) {
          const assetPrice = priceMap[rule.asset] ?? priceMap[rule.asset.toUpperCase()];
          if (typeof assetPrice !== 'number' || !Number.isFinite(assetPrice)) continue;

          checkedCount += 1;
          if (!evaluateAlertRule(rule.rule, assetPrice)) continue;

          const result = await processAlertEvent(
            context.paths.projectRoot,
            {
              id: rule.id,
              key: rule.asset,
              payload: {
                asset: rule.asset,
                price: assetPrice,
                rule: formatAlertRule(rule.rule),
              },
              occurredAt: new Date().toISOString(),
            },
            async (event) => {
              if (!options.notifyDaemon) return;
              const summary = formatAlertNotification(event);
              const integration = await loadIntegration(context.paths.projectRoot);
              try {
                const binding = await requireWorkspaceBinding(context.paths.projectRoot, workspaceRoot);
                await submitTurnAndWait(integration, {
                  sessionId: binding.sessionId,
                  content: summary,
                  approvalPolicy: 'interactive',
                  timeoutMs: alertNotifyTimeoutMs,
                });
              } catch {
                // Keep scheduler delivery resilient even when daemon turn submission stalls.
              }
              if (router) {
                await deliverAlertTransportUpdate(context.paths.projectRoot, integration, router, {
                  text: summary,
                  eventKey: event.key,
                  occurredAt: event.occurredAt,
                });
              }
            },
          );

          triggeredCount += 1;
          await updateAlertsState(context.paths.projectRoot, (current) => ({
            ...current.data,
            rules: current.data.rules.map((existing) => {
              if (existing.id !== rule.id) return existing;
              return {
                ...existing,
                lastTriggeredAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
            }),
          }));

          if (!options.json) {
            console.log(`Alert '${rule.id}' triggered (${result.reason})`);
          }
        }

        completedCycles += 1;
        if (cycles > 0 && completedCycles >= cycles) break;

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }

      asJsonOutput(options, {
        completedCycles,
        checkedCount,
        triggeredCount,
      }, `Alert worker completed cycles=${completedCycles} checked=${checkedCount} triggered=${triggeredCount}`);
    });

  const runtimeWorker = heretic.command('runtime-worker').description('Manage detached runtime worker lifecycle');

  runtimeWorker.command('start')
    .description('Start detached runtime worker for alert scheduling')
    .option('--project-root <path>', 'Project root override')
    .option('--prices-file <path>', 'Path to price source JSON (asset->price)')
    .option('--price-source <source>', 'Price source: file|coingecko', 'file')
    .option('--vs-currency <currency>', 'Fiat quote currency for coingecko source', 'usd')
    .option('--interval <ms>', 'Polling interval ms', '60000')
    .option('--notify-daemon', 'Relay triggered alerts to daemon and selected transport channel', false)
    .option('--foreground', 'Run worker in foreground', false)
    .option('--json', 'Emit JSON')
    .action(async (options: {
      projectRoot?: string;
      pricesFile?: string;
      priceSource?: string;
      vsCurrency?: string;
      interval?: string;
      notifyDaemon?: boolean;
      foreground?: boolean;
      json?: boolean;
    }) => {
      const projectRoot = await resolveRuntimeWorkerProjectRoot(context, options.projectRoot);
      const pricesFile = path.resolve(options.pricesFile || path.join(projectRoot, '.saiso', 'heretic', 'prices.json'));
      try {
        await access(pricesFile);
      } catch {
        await writeFile(pricesFile, '{}\\n', 'utf-8');
      }

      const status = await startRuntimeWorker({
        projectRoot,
        pricesFile,
        priceSource: options.priceSource || 'file',
        vsCurrency: options.vsCurrency || 'usd',
        intervalMs: Math.max(1000, Number(options.interval || '60000')),
        notifyDaemon: Boolean(options.notifyDaemon),
        foreground: Boolean(options.foreground),
        cliEntry: process.argv[1] || '',
        cliBin: process.execPath,
      });

      asJsonOutput(options, status, `Runtime worker ${status.state} (pid=${status.pid ?? 'n/a'}) projectRoot=${status.projectRoot}`);
    });

  runtimeWorker.command('status')
    .description('Show runtime worker status')
    .option('--project-root <path>', 'Project root override')
    .option('--json', 'Emit JSON')
    .action(async (options: { projectRoot?: string; json?: boolean }) => {
      const projectRoot = await resolveRuntimeWorkerProjectRoot(context, options.projectRoot);
      const status = await getRuntimeWorkerStatus(projectRoot);
      asJsonOutput(options, status, `Runtime worker ${status.state} (pid=${status.pid ?? 'n/a'}) projectRoot=${status.projectRoot}`);
    });

  runtimeWorker.command('stop')
    .description('Stop runtime worker')
    .option('--project-root <path>', 'Project root override')
    .option('--json', 'Emit JSON')
    .action(async (options: { projectRoot?: string; json?: boolean }) => {
      const projectRoot = await resolveRuntimeWorkerProjectRoot(context, options.projectRoot);
      const status = await stopRuntimeWorker(projectRoot);
      asJsonOutput(options, status, `Runtime worker ${status.state} projectRoot=${status.projectRoot}`);
    });

  heretic.command('doctor')
    .description('Inspect integration health, policy strict source, daemon reachability, and unresolved transport records')
    .option('--project-root <path>', 'Workspace root (defaults to project root)')
    .option('--json', 'Emit JSON')
    .action(async (options: { projectRoot?: string; json?: boolean }) => {
      const workspaceRoot = normalizeWorkspaceRoot(context, options.projectRoot);
      const integration = await loadIntegration(context.paths.projectRoot);
      const strict = resolveStrictMode(integration);
      const policyPresence = await inspectPolicyPresence(context.paths.projectRoot);
      const statePaths = getHereticStatePaths(context.paths.projectRoot);
      const workspaceMap = await readWorkspaceMapState(context.paths.projectRoot);
      const binding = await getWorkspaceBinding(context.paths.projectRoot, workspaceRoot);

      const pruneStats = await pruneTransportIndex(context.paths.projectRoot, {
        terminalTtlMs: integration.transport.terminalTtlMs,
        unresolvedTtlMs: integration.transport.unresolvedTtlMs,
      });

      const transportIndex = await readTransportIndexState(context.paths.projectRoot);
      const unresolved = Object.values(transportIndex.data.entries)
        .filter((entry) => entry.status !== 'delivered_terminal' && entry.status !== 'tombstoned');
      const transportSummary = buildTransportSummary(Object.values(transportIndex.data.entries));
      const prodUnresolved = unresolved.filter((entry) => inferTransportProfile(entry.transportIdentity) === 'prod');
      const prodUnresolvedAgeHours = prodUnresolved
        .map((entry) => (Date.now() - Date.parse(entry.updatedAt || entry.createdAt)) / (60 * 60 * 1000))
        .filter((value) => Number.isFinite(value));

      let daemonStatus: { ok: boolean; error?: string; socketPath?: string } = { ok: false };
      let mcpVisibleTools: { count: number; ids: string[]; byServer: Record<string, number> } = {
        count: 0,
        ids: [],
        byServer: {},
      };
      let mcpStatus: Record<string, unknown> | null = null;
      try {
        const health = await healthcheckDaemon(integration);
        daemonStatus = {
          ok: true,
          socketPath: health.socketPath,
        };
        if (binding?.sessionId) {
          try {
            const toolsPayload = await queryTools(integration, binding.sessionId);
            const ids = extractVisibleToolIds(toolsPayload);
            const byServer: Record<string, number> = {};
            for (const toolId of ids) {
              const parts = toolId.split('.');
              if (parts[0] !== 'mcp' || !parts[1]) continue;
              byServer[parts[1]] = (byServer[parts[1]] ?? 0) + 1;
            }
            mcpVisibleTools = {
              count: ids.length,
              ids,
              byServer,
            };
          } catch {
            mcpVisibleTools = {
              count: 0,
              ids: [],
              byServer: {},
            };
          }

          try {
            mcpStatus = await queryMcpStatus(integration, binding.sessionId);
          } catch {
            mcpStatus = null;
          }
        }
      } catch (error) {
        daemonStatus = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      asJsonOutput(options, {
        integration,
        strictMode: strict,
        daemonStatus,
        policyPresence,
        workspaceBinding: binding,
        workspaceBindingCount: Object.keys(workspaceMap.data.mappings).length,
        statePaths,
        mcp: {
          visibleTools: mcpVisibleTools,
          status: mcpStatus,
        },
        transport: {
          pruneStats,
          unresolvedCount: transportSummary.unresolvedCount,
          retryableCount: transportSummary.retryableCount,
          prodUnresolvedCount: prodUnresolved.length,
          prodMaxAgeHours: prodUnresolvedAgeHours.length > 0 ? Math.max(...prodUnresolvedAgeHours) : 0,
          summary: transportSummary,
          unresolved,
        },
      }, `Doctor: daemon=${daemonStatus.ok ? 'ok' : 'down'} strict=${strict.strict} (${strict.source}) unresolved=${transportSummary.unresolvedCount}`);
    });

  program.addCommand(heretic);
}

export async function pluginDoctor(context: SaisoPluginContext): Promise<Record<string, unknown>> {
  const integration = await loadIntegration(context.paths.projectRoot);
  const strict = resolveStrictMode(integration);
  const policyPresence = await inspectPolicyPresence(context.paths.projectRoot);
  const workspaceMap = await readWorkspaceMapState(context.paths.projectRoot);
  const transportIndex = await readTransportIndexState(context.paths.projectRoot);
  const transportSummary = buildTransportSummary(Object.values(transportIndex.data.entries));
  let daemonOk = true;
  let daemonError: string | null = null;

  try {
    await healthcheckDaemon(integration);
  } catch (error) {
    daemonOk = false;
    daemonError = error instanceof Error ? error.message : String(error);
  }

  return {
    daemonOk,
    daemonError,
    strictMode: strict,
    policyPresence,
    workspaceBindingCount: Object.keys(workspaceMap.data.mappings).length,
    transportRecordCount: Object.keys(transportIndex.data.entries).length,
    transportSummary,
  };
}
