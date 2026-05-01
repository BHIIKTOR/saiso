import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type {
  ChatRelayRequest,
  ChatRelayResult,
  HereticDaemonResolvedPaths,
  HereticIntegrationConfig,
  HereticSessionBinding,
} from './types.js';
import { HereticSaisoError } from './errors.js';

interface ProtocolRequestEnvelope {
  id: string;
  type: 'request';
  method: string;
  params: Record<string, unknown>;
}

interface ProtocolSuccessResultEnvelope {
  id: string;
  type: 'result';
  ok: true;
  data: Record<string, unknown>;
}

interface ProtocolErrorResultEnvelope {
  id: string;
  type: 'result';
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface ProtocolEventEnvelope {
  type: 'event';
  event: string;
  sessionId?: string;
  requestId?: string;
  data: Record<string, unknown>;
}

type ProtocolResultEnvelope = ProtocolSuccessResultEnvelope | ProtocolErrorResultEnvelope;

type ProtocolMessage = ProtocolResultEnvelope | ProtocolEventEnvelope;

interface PendingRequest {
  id: string;
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface EventSubscription {
  channels: string[];
  handler: (event: ProtocolEventEnvelope) => void;
}

const SUPPORTED_PROTOCOL_VERSIONS = new Set(['1']);
const REQUIRED_METHOD_SET_ID = 'heretic-saiso-required-methods-v1';
const HANDSHAKE_CACHE_TTL_MS = 60_000;
const DEFAULT_CHAT_RELAY_TIMEOUT_MS = 180_000;

const REQUIRED_METHOD_PROBES: Array<{ method: string; params: Record<string, unknown> }> = [
  { method: 'project.register', params: { __probe__: true } },
  { method: 'project.focus', params: { __probe__: true } },
  { method: 'project.create_session', params: { __probe__: true } },
  { method: 'session.create', params: { __probe__: true } },
  { method: 'session.set_cwd', params: { __probe__: true } },
  { method: 'runtime.set_profile', params: { __probe__: true } },
  { method: 'runtime.set_provider', params: { __probe__: true } },
  { method: 'runtime.set_model', params: { __probe__: true } },
  { method: 'query.model_catalog', params: { __probe__: true } },
  { method: 'query.reference_bundle', params: { __probe__: true } },
  { method: 'runtime.set_stream', params: { __probe__: true } },
  { method: 'turn.submit', params: { __probe__: true } },
  { method: 'turn.continue', params: { __probe__: true } },
];

const METHOD_PRESENT_ERROR_CODES = new Set([
  'INVALID_PARAMS',
  'SESSION_NOT_FOUND',
  'PROJECT_NOT_FOUND',
  'MESSAGE_NOT_FOUND',
  'QUESTION_NOT_FOUND',
  'APPROVAL_NOT_FOUND',
  'TURN_NOT_RECOVERABLE',
  'TURN_NOT_FOUND',
  'SESSION_BUSY',
  'INTERNAL_ERROR',
  'MCP_ERROR',
]);

const METHOD_MISSING_ERROR_CODES = new Set([
  'INVALID_ENVELOPE',
  'UNKNOWN_METHOD',
  'METHOD_NOT_FOUND',
]);

const handshakeCache = new Map<string, {
  protocolVersion: string;
  checkedAt: number;
  methodSetId: string;
}>();

function parseJsonLine(line: string): ProtocolMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new HereticSaisoError('HERETIC_PROTOCOL_ERROR', 'Invalid JSON from daemon', {
      line,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HereticSaisoError('HERETIC_PROTOCOL_ERROR', 'Daemon message is not an object');
  }

  return parsed as ProtocolMessage;
}

function expandHome(input: string): string {
  if (input === '~') {
    return os.homedir();
  }
  if (input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function resolveDefaultConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.HERETIC_CONFIG_DIR ?? env.HERETIC_HOME ?? '~/.heretic';
  return path.resolve(expandHome(configured));
}

function resolveSocketPath(configDir: string, integrationSocketPath: string | null, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.HERETIC_SOCKET_PATH;
  const selected = integrationSocketPath ?? fromEnv ?? path.join(configDir, 'heretic.sock');
  return path.resolve(expandHome(selected));
}

function getProtocolErrorCode(error: unknown): string | null {
  if (!(error instanceof HereticSaisoError)) {
    return null;
  }

  if (error.code !== 'HERETIC_PROTOCOL_ERROR') {
    return null;
  }

  if (typeof error.details?.code !== 'string') {
    return null;
  }

  return error.details.code;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function hasCapabilityMetadata(hello: Record<string, unknown>): boolean {
  return (
    typeof hello.capabilitiesVersion === 'string'
    || Array.isArray(hello.supportedMethods)
    || Array.isArray(hello.requiredMethods)
  );
}

async function withHandshakeTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new HereticSaisoError('HERETIC_PROTOCOL_HANDSHAKE_TIMEOUT', `Protocol handshake timed out after ${timeoutMs}ms`, {
            timeoutMs,
          }));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function probeRequiredMethods(client: HereticSocketClient): Promise<void> {
  for (const probe of REQUIRED_METHOD_PROBES) {
    try {
      await client.request(probe.method, probe.params);
      continue;
    } catch (error) {
      const protocolCode = getProtocolErrorCode(error);
      if (protocolCode && METHOD_PRESENT_ERROR_CODES.has(protocolCode)) {
        continue;
      }

      if (protocolCode && METHOD_MISSING_ERROR_CODES.has(protocolCode)) {
        throw new HereticSaisoError('HERETIC_PROTOCOL_CAPABILITY_MISSING', `Required method '${probe.method}' is missing`, {
          method: probe.method,
          methodSetId: REQUIRED_METHOD_SET_ID,
          protocolCode,
        });
      }

      throw new HereticSaisoError('HERETIC_PROTOCOL_CAPABILITY_MISSING', `Failed probing required method '${probe.method}'`, {
        method: probe.method,
        methodSetId: REQUIRED_METHOD_SET_ID,
        protocolCode,
        cause: getErrorMessage(error),
      });
    }
  }
}

async function verifyHandshake(
  client: HereticSocketClient,
  socketPath: string,
  helloResult: Record<string, unknown>,
  timeoutMs: number,
): Promise<void> {
  const protocolVersion = getString(helloResult.protocolVersion, 'protocolVersion');
  if (!SUPPORTED_PROTOCOL_VERSIONS.has(protocolVersion)) {
    throw new HereticSaisoError('HERETIC_PROTOCOL_INCOMPATIBLE', `Unsupported daemon protocol version '${protocolVersion}'`, {
      protocolVersion,
      supported: [...SUPPORTED_PROTOCOL_VERSIONS],
      methodSetId: REQUIRED_METHOD_SET_ID,
    });
  }

  const cached = handshakeCache.get(socketPath);
  if (
    cached
    && cached.protocolVersion === protocolVersion
    && cached.methodSetId === REQUIRED_METHOD_SET_ID
    && Date.now() - cached.checkedAt <= HANDSHAKE_CACHE_TTL_MS
  ) {
    return;
  }

  if (!hasCapabilityMetadata(helloResult)) {
    await withHandshakeTimeout(probeRequiredMethods(client), timeoutMs);
  }

  handshakeCache.set(socketPath, {
    protocolVersion,
    checkedAt: Date.now(),
    methodSetId: REQUIRED_METHOD_SET_ID,
  });
}

export function resolveHereticPaths(integration: HereticIntegrationConfig, env: NodeJS.ProcessEnv = process.env): HereticDaemonResolvedPaths {
  const configDir = path.resolve(expandHome(integration.daemon.configDir ?? resolveDefaultConfigDir(env)));
  const socketPath = resolveSocketPath(configDir, integration.daemon.socketPath, env);

  return {
    daemonPath: integration.daemon.daemonPath,
    configDir,
    socketPath,
  };
}

export class HereticSocketClient {
  private readonly pending = new Map<string, PendingRequest>();

  private readonly subscriptions = new Set<EventSubscription>();

  private closed = false;

  private requestCounter = 0;

  private buffer = '';

  private constructor(private readonly socket: net.Socket, private readonly requestTimeoutMs: number) {
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk) => {
      this.handleData(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });
    this.socket.on('error', (error) => {
      this.failAllPending(new HereticSaisoError('HERETIC_DAEMON_UNREACHABLE', 'daemon socket error', {
        cause: error.message,
      }));
    });
    this.socket.on('close', () => {
      this.closed = true;
      this.failAllPending(new HereticSaisoError('HERETIC_DAEMON_UNREACHABLE', 'daemon connection closed'));
    });
  }

  static async connect(options: {
    socketPath: string;
    requestTimeoutMs?: number;
    handshakeTimeoutMs?: number;
  }): Promise<HereticSocketClient> {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const next = net.createConnection(options.socketPath);
      next.once('connect', () => resolve(next));
      next.once('error', reject);
    }).catch((error) => {
      throw new HereticSaisoError('HERETIC_DAEMON_UNREACHABLE', `Failed to connect to daemon socket ${options.socketPath}`, {
        cause: error instanceof Error ? error.message : String(error),
      });
    });

    const client = new HereticSocketClient(socket, options.requestTimeoutMs ?? 30_000);
    try {
      const hello = await client.request('client.hello', {
        clientKind: 'other',
        clientVersion: 'heretic-saiso-protocol-client/1.0.0-rc5',
        capabilities: ['machine_output'],
      });

      await verifyHandshake(client, options.socketPath, hello, options.handshakeTimeoutMs ?? 5000);
      return client;
    } catch (error) {
      await client.close();
      if (error instanceof HereticSaisoError) {
        throw error;
      }
      throw new HereticSaisoError('HERETIC_PROTOCOL_ERROR', 'Protocol handshake failed', {
        cause: getErrorMessage(error),
      });
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.failAllPending(new HereticSaisoError('HERETIC_DAEMON_UNREACHABLE', 'client closed'));

    await new Promise<void>((resolve) => {
      if (this.socket.destroyed) {
        resolve();
        return;
      }
      this.socket.end(() => resolve());
      setTimeout(() => {
        if (!this.socket.destroyed) {
          this.socket.destroy();
        }
        resolve();
      }, 200);
    });
  }

  async request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.closed) {
      throw new HereticSaisoError('HERETIC_DAEMON_UNREACHABLE', 'client is closed');
    }

    this.requestCounter += 1;
    const id = `req-${this.requestCounter}`;
    const envelope: ProtocolRequestEnvelope = {
      id,
      type: 'request',
      method,
      params,
    };

    const resultPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new HereticSaisoError('HERETIC_TIMEOUT', `Request timed out: ${method}`, { id, method }));
      }, this.requestTimeoutMs);

      this.pending.set(id, {
        id,
        resolve,
        reject,
        timeout,
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.socket.write(`${JSON.stringify(envelope)}\n`, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(new HereticSaisoError('HERETIC_DAEMON_UNREACHABLE', `Failed to write request ${method}`, {
            id,
            cause: error.message,
          }));
          return;
        }
        resolve();
      });
    });

    return resultPromise;
  }

  async subscribe(channels: string[], handler: (event: ProtocolEventEnvelope) => void): Promise<() => Promise<void>> {
    const normalized = [...new Set(channels)].sort();
    await this.request('client.subscribe', {
      channels: normalized,
    });

    const sub: EventSubscription = {
      channels: normalized,
      handler,
    };
    this.subscriptions.add(sub);

    return async () => {
      this.subscriptions.delete(sub);
      await this.request('client.unsubscribe', {
        channels: normalized,
      });
    };
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;

    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) {
        return;
      }

      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;

      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    const parsed = parseJsonLine(line);

    if (parsed.type === 'result') {
      const pending = this.pending.get(parsed.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.pending.delete(parsed.id);

      if (parsed.ok) {
        pending.resolve(parsed.data);
        return;
      }

      pending.reject(new HereticSaisoError('HERETIC_PROTOCOL_ERROR', parsed.error.message, {
        code: parsed.error.code,
        details: parsed.error.details,
      }));
      return;
    }

    if (parsed.type === 'event') {
      for (const sub of this.subscriptions) {
        const allowed = new Set<string>(['daemon']);
        if (parsed.sessionId) {
          allowed.add(`session:${parsed.sessionId}`);
        }
        if (parsed.requestId) {
          allowed.add(`request:${parsed.requestId}`);
        }

        if (sub.channels.some((channel) => allowed.has(channel))) {
          try {
            sub.handler(parsed);
          } catch {
            // Subscriber errors should not break socket processing.
          }
        }
      }
    }
  }

  private failAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function getObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function getString(input: unknown, field: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new HereticSaisoError('HERETIC_PROTOCOL_ERROR', `Missing string field '${field}'`, {
      field,
      input,
    });
  }
  return input;
}

export async function healthcheckDaemon(integration: HereticIntegrationConfig): Promise<{
  socketPath: string;
  daemon: Record<string, unknown>;
}> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });
  try {
    const status = await client.request('daemon.status', {});
    return {
      socketPath: resolved.socketPath,
      daemon: getObject(status.daemon),
    };
  } finally {
    await client.close();
  }
}

export async function attachWorkspaceToDaemon(
  integration: HereticIntegrationConfig,
  options: {
    workspaceRoot: string;
    label?: string;
    sessionTitle?: string;
  },
): Promise<HereticSessionBinding> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });

  const projectRoot = path.resolve(options.workspaceRoot);
  const label = options.label?.trim() || path.basename(projectRoot) || 'workspace';
  const sessionTitle = options.sessionTitle?.trim() || `${label} session`;

  try {
    try {
      const registered = await client.request('project.register', {
        projectRoot,
        label,
        cwd: projectRoot,
        sessionTitle,
      });

      const session = getObject(registered.session);
      const project = getObject(registered.project);
      const sessionId = getString(session.id, 'session.id');
      return {
        hereticProjectRoot: projectRoot,
        projectId: typeof project.id === 'string' ? project.id : projectRoot,
        sessionId,
      };
    } catch {
      await client.request('project.focus', {
        projectRoot,
      });

      const created = await client.request('project.create_session', {
        projectRoot,
        cwd: projectRoot,
        title: sessionTitle,
      });

      const session = getObject(created.session);
      const sessionId = getString(session.id, 'session.id');
      await client.request('session.set_cwd', {
        sessionId,
        cwd: projectRoot,
      });

      return {
        hereticProjectRoot: projectRoot,
        projectId: projectRoot,
        sessionId,
      };
    }
  } finally {
    await client.close();
  }
}

export async function setRuntimeProvider(integration: HereticIntegrationConfig, sessionId: string, providerId: string): Promise<void> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });
  try {
    await client.request('runtime.set_provider', {
      sessionId,
      providerId,
    });
  } finally {
    await client.close();
  }
}

export async function setRuntimeModel(integration: HereticIntegrationConfig, sessionId: string, model: string): Promise<void> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });
  try {
    await client.request('runtime.set_model', {
      sessionId,
      model,
    });
  } finally {
    await client.close();
  }
}

export async function setRuntimeProfile(integration: HereticIntegrationConfig, sessionId: string, profileId: string): Promise<void> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });
  try {
    await client.request('runtime.set_profile', {
      sessionId,
      profileId,
    });
  } finally {
    await client.close();
  }
}

export async function setRuntimeStream(integration: HereticIntegrationConfig, sessionId: string, enabled: boolean): Promise<void> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });
  try {
    await client.request('runtime.set_stream', {
      sessionId,
      enabled,
    });
  } finally {
    await client.close();
  }
}

export async function queryReferenceBundle(integration: HereticIntegrationConfig, sessionId: string): Promise<Record<string, unknown>> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });
  try {
    const result = await client.request('query.reference_bundle', {
      sessionId,
    });
    return getObject(result);
  } finally {
    await client.close();
  }
}

export async function queryTools(integration: HereticIntegrationConfig, sessionId: string): Promise<Record<string, unknown>> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });
  try {
    const result = await client.request('query.tools', {
      sessionId,
      refresh: true,
    });
    return getObject(result);
  } finally {
    await client.close();
  }
}

export async function queryMcpStatus(integration: HereticIntegrationConfig, sessionId: string): Promise<Record<string, unknown>> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });
  try {
    const result = await client.request('query.mcp_status', {
      sessionId,
    });
    return getObject(result);
  } finally {
    await client.close();
  }
}

export async function queryModelCatalog(integration: HereticIntegrationConfig, sessionId: string): Promise<Record<string, unknown>> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });
  try {
    const result = await client.request('query.model_catalog', {
      sessionId,
      refresh: true,
    });
    return getObject(result.catalog);
  } finally {
    await client.close();
  }
}

export async function submitTurn(
  integration: HereticIntegrationConfig,
  request: ChatRelayRequest,
): Promise<{ turnId: string }> {
  const resolved = resolveHereticPaths(integration);
  const timeoutMs = request.timeoutMs ?? DEFAULT_CHAT_RELAY_TIMEOUT_MS;
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath, requestTimeoutMs: timeoutMs });
  try {
    const accepted = await client.request('turn.submit', {
      sessionId: request.sessionId,
      content: request.content,
      stream: false,
      approvalPolicy: request.approvalPolicy ?? 'interactive',
    });
    return {
      turnId: getString(accepted.turnId, 'turnId'),
    };
  } finally {
    await client.close();
  }
}

export async function querySessionSnapshot(integration: HereticIntegrationConfig, sessionId: string): Promise<Record<string, unknown>> {
  const resolved = resolveHereticPaths(integration);
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath });
  try {
    const result = await client.request('query.snapshot', {
      sessionId,
    });
    return getObject(result.snapshot);
  } finally {
    await client.close();
  }
}

function recoverAssistantAnswerFromSnapshotPayload(
  snapshot: Record<string, unknown>,
  turnId: string,
  submittedAtMs?: number,
): string | null {
  const session = getObject(snapshot.session);
  const messages = Array.isArray(session.messages) ? session.messages : [];
  let recoveredAnswer: string | null = null;
  let fallbackRecentAnswer: string | null = null;
  for (const message of messages) {
    const record = getObject(message);
    if (record.role !== 'assistant') {
      continue;
    }
    if (typeof record.content !== 'string' || !record.content.trim()) {
      continue;
    }

    const createdAtRaw = typeof record.createdAt === 'string'
      ? record.createdAt
      : typeof record.timestamp === 'string'
        ? record.timestamp
        : null;
    const createdAtMs = createdAtRaw ? Date.parse(createdAtRaw) : Number.NaN;
    if (
      submittedAtMs
      && Number.isFinite(createdAtMs)
      && createdAtMs >= (submittedAtMs - 2_000)
    ) {
      fallbackRecentAnswer = record.content;
    }

    const metadata = getObject(record.metadata);
    if (metadata.turnId !== turnId) {
      continue;
    }
    recoveredAnswer = record.content;
  }
  return recoveredAnswer || fallbackRecentAnswer;
}

export async function recoverTurnAnswerFromSnapshot(
  integration: HereticIntegrationConfig,
  request: {
    sessionId: string;
    turnId: string;
    submittedAtMs?: number;
  },
): Promise<string | null> {
  const snapshot = await querySessionSnapshot(integration, request.sessionId);
  return recoverAssistantAnswerFromSnapshotPayload(snapshot, request.turnId, request.submittedAtMs);
}

export async function submitTurnAndWait(integration: HereticIntegrationConfig, request: ChatRelayRequest): Promise<ChatRelayResult> {
  const resolved = resolveHereticPaths(integration);
  const timeoutMs = request.timeoutMs ?? DEFAULT_CHAT_RELAY_TIMEOUT_MS;
  const client = await HereticSocketClient.connect({ socketPath: resolved.socketPath, requestTimeoutMs: timeoutMs });

  const recoverAssistantAnswerFromSnapshot = async (turnId: string, submittedAtMs?: number): Promise<string | null> => {
    const result = await client.request('query.snapshot', {
      sessionId: request.sessionId,
    });
    const snapshot = getObject(result.snapshot);
    return recoverAssistantAnswerFromSnapshotPayload(snapshot, turnId, submittedAtMs);
  };

  try {
    const settled = new Promise<ChatRelayResult>((resolve, reject) => {
      let settledDone = false;
      let turnId = '';
      let turnAcceptedAtMs = 0;
      const buffered: Array<{ event: string; payload: Record<string, unknown>; eventTurnId: string }> = [];
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let unsubscribe: (() => Promise<void>) | null = null;

      const settleResolve = (result: ChatRelayResult): void => {
        if (settledDone) return;
        settledDone = true;
        if (timeout) {
          clearTimeout(timeout);
        }
        void (async () => {
          if (unsubscribe) {
            try {
              await unsubscribe();
            } catch {
              // Best effort unsubscribe on settle.
            }
          }
          resolve(result);
        })();
      };

      const settleReject = (error: unknown): void => {
        if (settledDone) return;
        settledDone = true;
        if (timeout) {
          clearTimeout(timeout);
        }
        void (async () => {
          if (unsubscribe) {
            try {
              await unsubscribe();
            } catch {
              // Best effort unsubscribe on settle.
            }
          }
          reject(error instanceof Error ? error : new Error(String(error)));
        })();
      };

      const armTimeout = (): void => {
        if (timeout) {
          clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
          void (async () => {
            try {
              if (turnId) {
                const recovered = await recoverAssistantAnswerFromSnapshot(turnId, turnAcceptedAtMs || undefined);
                if (recovered && recovered.trim()) {
                  settleResolve({
                    turnId,
                    answer: recovered,
                  });
                  return;
                }
              }
            } catch {
              // Ignore recovery errors and return deterministic timeout below.
            }
            settleReject(new HereticSaisoError('HERETIC_TIMEOUT', 'Timed out waiting for turn completion', {
              sessionId: request.sessionId,
              turnId,
            }));
          })();
        }, timeoutMs);
      };

      const handleTurnEvent = (eventName: string, payload: Record<string, unknown>, eventTurnId: string): void => {
        armTimeout();
        if (eventName === 'turn.completed') {
          const result = getObject(payload.result);
          const inlineCandidates = [
            result.answer,
            payload.answer,
            result.finalAnswer,
            payload.finalAnswer,
            result.content,
            payload.content,
          ];
          const inlineAnswer = inlineCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) as string | undefined;
          if (inlineAnswer) {
            settleResolve({
              turnId: eventTurnId,
              answer: inlineAnswer,
            });
            return;
          }

          void (async () => {
            try {
              const recovered = await recoverAssistantAnswerFromSnapshot(eventTurnId, turnAcceptedAtMs || undefined);
              if (recovered && recovered.trim()) {
                settleResolve({
                  turnId: eventTurnId,
                  answer: recovered,
                });
                return;
              }
            } catch {
              // Ignore recovery failure and return deterministic protocol error below.
            }

            settleReject(new HereticSaisoError('HERETIC_PROTOCOL_ERROR', 'Turn completed without assistant answer', {
              turnId: eventTurnId,
            }));
          })();
          return;
        }

        if (eventName === 'turn.failed' || eventName === 'turn.cancelled') {
          settleReject(new HereticSaisoError('HERETIC_PROTOCOL_ERROR', `Turn failed (${eventName})`, {
            turnId: eventTurnId,
            payload,
          }));
        }
      };

      void (async () => {
        unsubscribe = await client.subscribe([`session:${request.sessionId}`], (event) => {
          if (settledDone) {
            return;
          }
        const payload = getObject(event.data);
        const eventTurnId = typeof payload.turnId === 'string' ? payload.turnId : null;
          if (!eventTurnId) {
            return;
          }
          if (!turnId) {
            buffered.push({
              event: event.event,
              payload,
              eventTurnId,
            });
            return;
          }
          if (eventTurnId !== turnId) {
            return;
          }
          handleTurnEvent(event.event, payload, eventTurnId);
        });

        const accepted = await client.request('turn.submit', {
          sessionId: request.sessionId,
          content: request.content,
          stream: false,
          approvalPolicy: request.approvalPolicy ?? 'interactive',
        });
        turnId = getString(accepted.turnId, 'turnId');
        turnAcceptedAtMs = Date.now();
        armTimeout();

        for (const bufferedEvent of buffered) {
          if (bufferedEvent.eventTurnId !== turnId) {
            continue;
          }
          handleTurnEvent(bufferedEvent.event, bufferedEvent.payload, bufferedEvent.eventTurnId);
          if (settledDone) {
            return;
          }
        }
      })().catch((error) => {
        settleReject(error);
      });

      if (!timeout) {
        armTimeout();
      }
    });

    return await settled;
  } finally {
    await client.close();
  }
}

export function makeClientRequestId(): string {
  return `heretic-saiso-${randomUUID()}`;
}
