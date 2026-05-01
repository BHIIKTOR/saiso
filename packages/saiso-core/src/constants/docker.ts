import type { McpServerType } from '../types/mcp.js';

export const DEFAULT_MCP_DOCKER_IMAGES: Record<McpServerType, string> = {
  evm: 'ghcr.io/mcpdotdirect/evm-mcp-server:latest',
  svm: 'ghcr.io/saiso/svm-mcp-server:latest',
};

export const DEFAULT_MCP_DOCKER_PULL_POLICY = 'if-not-present' as const;
export const DEFAULT_MCP_DOCKER_HEALTH_PATH = '/health' as const;
export const DEFAULT_MCP_DOCKER_STARTUP_TIMEOUT_MS = 30_000;

export function getDefaultMcpDockerImage(serverType: McpServerType): string {
  return DEFAULT_MCP_DOCKER_IMAGES[serverType];
}
