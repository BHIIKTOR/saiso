import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { PaymentChallenge } from '../payments/types.js';
import type { ToolCallOptions } from '../mcp/orchestrator.js';
import type { PaymentConfig } from '../types/config.js';

type JsonMap = Record<string, unknown>;

export interface ServiceBlueprintOrchestrator {
  invokeTool(toolName: string, params: Record<string, unknown>, options?: ToolCallOptions): Promise<Record<string, unknown>>;
}

export interface ServiceBlueprintConfig {
  agentName: string;
  network: string;
  serverType: 'evm' | 'svm';
  payment?: PaymentConfig;
}

export interface ServiceBlueprintOptions {
  config: ServiceBlueprintConfig;
  orchestrator: ServiceBlueprintOrchestrator;
  projectPath: string;
  registrationPath?: string;
  isReady?: () => boolean;
  isShuttingDown?: () => boolean;
  maxBodyBytes?: number;
}

class ServiceHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ServiceHttpError';
  }
}

function readHeader(headers: IncomingMessage['headers'], key: string): string | undefined {
  const value = headers[key];
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

async function parseBody(req: IncomingMessage, maxBodyBytes: number): Promise<JsonMap> {
  return await new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      const next = Buffer.from(chunk);
      totalBytes += next.byteLength;
      if (totalBytes > maxBodyBytes) {
        reject(new ServiceHttpError(413, 'REQUEST_BODY_TOO_LARGE', `Request body exceeds ${maxBodyBytes} bytes`));
        return;
      }
      chunks.push(next);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new ServiceHttpError(400, 'INVALID_REQUEST_BODY', 'Request body must be a JSON object'));
          return;
        }
        resolve(parsed as JsonMap);
      } catch {
        reject(new ServiceHttpError(400, 'INVALID_REQUEST_BODY', 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function parseCredentialFromHeader(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      throw new ServiceHttpError(402, 'PAYMENT_REQUIRED', 'Invalid credential header JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ServiceHttpError(402, 'PAYMENT_REQUIRED', 'Credential header JSON must be an object');
    }
    if (
      'payload' in parsed
      && typeof (parsed as { payload?: unknown }).payload === 'object'
      && (parsed as { payload?: unknown }).payload !== null
    ) {
      return (parsed as { payload: Record<string, unknown> }).payload;
    }
    return parsed as Record<string, unknown>;
  }
  return { token: trimmed };
}

function writeJson(res: ServerResponse, statusCode: number, payload: JsonMap): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
}

export function createServiceBlueprintServer(options: ServiceBlueprintOptions): Server {
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  const registrationPath = options.registrationPath || '.well-known/agent-registration.json';
  const readiness = options.isReady || (() => true);
  const shuttingDown = options.isShuttingDown || (() => false);

  return createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/healthz') {
        writeJson(res, 200, {
          status: 'ok',
          service: options.config.agentName,
          serverType: options.config.serverType,
          network: options.config.network,
          ready: readiness(),
        });
        return;
      }

      if (req.method === 'GET' && req.url === '/readyz') {
        const ready = readiness() && !shuttingDown();
        writeJson(res, ready ? 200 : 503, {
          ready,
          serverType: options.config.serverType,
          shuttingDown: shuttingDown(),
        });
        return;
      }

      if (req.method === 'GET' && req.url === '/.well-known/agent-registration.json') {
        try {
          const content = await readFile(registrationPath, 'utf-8');
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(content);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new ServiceHttpError(404, 'REGISTRATION_NOT_FOUND', 'Discovery registration not found');
          }
          throw error;
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/paid/tool') {
        const body = await parseBody(req, maxBodyBytes);
        const tool = typeof body.tool === 'string' ? body.tool : '';
        if (!tool) {
          throw new ServiceHttpError(400, 'TOOL_REQUIRED', 'tool is required');
        }

        const params = (body.params && typeof body.params === 'object' && !Array.isArray(body.params))
          ? body.params as JsonMap
          : {};
        const payment = (body.payment && typeof body.payment === 'object' && !Array.isArray(body.payment))
          ? body.payment as JsonMap
          : {};

        const amountUsd = typeof payment.amountUsd === 'number'
          ? payment.amountUsd
          : undefined;
        const recipient = typeof payment.recipient === 'string'
          ? payment.recipient
          : undefined;
        const operationClass = typeof payment.operationClass === 'string'
          ? payment.operationClass
          : undefined;

        const result = await options.orchestrator.invokeTool(
          tool,
          params,
          {
            payment: {
              ...(options.config.payment || {}),
              enabled: true,
              preferredProtocol: (
                payment.preferredProtocol === 'x402'
                || payment.preferredProtocol === 'mpp'
                || payment.preferredProtocol === 'auto'
              )
                ? payment.preferredProtocol
                : (options.config.payment?.preferredProtocol || 'auto'),
              maxPerRequestUsd: typeof payment.maxPerRequestUsd === 'number'
                ? payment.maxPerRequestUsd
                : options.config.payment?.maxPerRequestUsd,
            },
            paymentContext: {
              resource: typeof payment.resource === 'string' ? payment.resource : `tool://${tool}`,
              amountUsd,
              recipient,
              metadata: {
                toolName: tool,
                ...(operationClass ? { operationClass } : {}),
              },
            },
            resolveCredential: async (challenge: PaymentChallenge) => {
              const headerName = challenge.protocol === 'x402' ? 'x-payment' : 'payment';
              const headerValue = readHeader(req.headers, headerName);
              if (!headerValue) {
                throw new ServiceHttpError(
                  402,
                  'PAYMENT_REQUIRED',
                  `Missing ${headerName} header for ${challenge.protocol} settlement`
                );
              }
              return {
                protocol: challenge.protocol,
                payload: parseCredentialFromHeader(headerValue),
              };
            },
            projectPath: options.projectPath,
            timeoutMs: 15000,
          }
        );

        writeJson(res, 200, {
          ok: true,
          tool,
          result,
        });
        return;
      }

      throw new ServiceHttpError(404, 'NOT_FOUND', 'Not found');
    } catch (error) {
      if (error instanceof ServiceHttpError) {
        writeJson(res, error.statusCode, {
          error: error.message,
          code: error.code,
        });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLowerCase();
      if (lower.includes('json body') || lower.includes('request body')) {
        writeJson(res, 400, {
          error: message,
          code: 'INVALID_REQUEST_BODY',
        });
        return;
      }
      if (lower.includes('payment') || lower.includes('credential')) {
        writeJson(res, 402, {
          error: message,
          code: 'PAYMENT_REQUIRED',
        });
        return;
      }
      writeJson(res, 500, {
        error: message,
        code: 'INTERNAL_ERROR',
      });
    }
  });
}
