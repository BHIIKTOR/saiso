import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { executeTool, supportedTools, type ToolContext } from './tools.js';

export interface SvmMcpServerConfig {
  host: string;
  port: number;
  network: string;
  rpcUrl: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
  privateKey?: string;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

function getClusterRpcForNetwork(network: string): string {
  switch (network.toLowerCase()) {
    case 'solana-mainnet':
    case 'mainnet':
    case 'mainnet-beta':
      return clusterApiUrl('mainnet-beta');
    case 'solana-testnet':
    case 'testnet':
      return clusterApiUrl('testnet');
    case 'solana-devnet':
    case 'devnet':
    default:
      return clusterApiUrl('devnet');
  }
}

function json(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage): Promise<JsonRpcRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as JsonRpcRequest;
}

function toJsonRpcResult(id: string | number | null | undefined, result: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  };
}

function toJsonRpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: Record<string, unknown>
) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  };
}

export function resolveServerConfigFromEnv(partial: Partial<SvmMcpServerConfig> = {}): SvmMcpServerConfig {
  const network = partial.network ?? process.env.NETWORK ?? 'solana-devnet';
  const rpcUrl = partial.rpcUrl ?? process.env.RPC_URL ?? getClusterRpcForNetwork(network);
  const portValue = partial.port ?? Number.parseInt(process.env.PORT ?? process.env.MCP_SERVER_PORT ?? '3001', 10);

  const commitmentRaw = partial.commitment
    ?? ((process.env.SVM_COMMITMENT as SvmMcpServerConfig['commitment'] | undefined) ?? 'confirmed');
  const commitment = commitmentRaw === 'processed' || commitmentRaw === 'finalized' ? commitmentRaw : 'confirmed';

  return {
    host: partial.host ?? process.env.HOST ?? '127.0.0.1',
    port: Number.isFinite(portValue) ? portValue : 3001,
    network,
    rpcUrl,
    commitment,
    privateKey: partial.privateKey ?? process.env.PRIVATE_KEY,
  };
}

export async function startSvmMcpServer(
  partial: Partial<SvmMcpServerConfig> = {}
): Promise<ReturnType<typeof createServer>> {
  const config = resolveServerConfigFromEnv(partial);
  const connection = new Connection(config.rpcUrl, config.commitment);

  const ctx: ToolContext = {
    connection,
    network: config.network,
    privateKey: config.privateKey,
  };

  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && (request.url === '/health' || request.url === '/healthz' || request.url === '/readyz')) {
        json(response, 200, {
          ok: true,
          service: '@saiso/svm-mcp-server',
          network: config.network,
          rpcUrl: config.rpcUrl,
        });
        return;
      }

      if (request.method !== 'POST') {
        json(response, 405, { error: 'method_not_allowed' });
        return;
      }

      const payload = await readJsonBody(request);

      if (payload.method === 'tools/list') {
        json(
          response,
          200,
          toJsonRpcResult(payload.id, {
            tools: supportedTools.map((name) => ({
              name,
              description: `SAISO SVM tool: ${name}`,
              inputSchema: {
                type: 'object',
                additionalProperties: true,
              },
            })),
          })
        );
        return;
      }

      if (payload.method !== 'tools/call') {
        json(response, 400, toJsonRpcError(payload.id, -32601, `Unsupported method: ${payload.method ?? 'unknown'}`));
        return;
      }

      const toolName = payload.params?.name;
      if (!toolName || typeof toolName !== 'string') {
        json(response, 400, toJsonRpcError(payload.id, -32602, 'Missing params.name for tools/call'));
        return;
      }

      const args = payload.params?.arguments && typeof payload.params.arguments === 'object'
        ? payload.params.arguments
        : {};

      const result = await executeTool(toolName, args, ctx);

      if (!result.success) {
        const message = result.error?.message || 'Tool execution failed';
        json(
          response,
          200,
          toJsonRpcResult(payload.id, {
            isError: true,
            structuredContent: {
              ...result,
              message,
            },
            content: [{ type: 'text', text: message }],
          })
        );
        return;
      }

      json(
        response,
        200,
        toJsonRpcResult(payload.id, {
          structuredContent: result,
          content: [{ type: 'text', text: `Executed ${toolName}` }],
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      json(response, 500, toJsonRpcError(null, -32000, message));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, config.host, () => resolve());
  });

  return server;
}
