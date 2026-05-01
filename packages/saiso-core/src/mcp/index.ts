/**
 * MCP Server Orchestration - Multi-Server Architecture
 */

// Core server orchestration surface
export { McpServerOrchestrator } from './orchestrator.js';
export { EvmMcpOrchestrator } from './evm-orchestrator.js';
export { SvmMcpOrchestrator } from './svm-orchestrator.js';

// New multi-server architecture
export { SaisoMcpManager } from './multi-server-manager.js';
export { ResourceTracker } from './resource-tracker.js';
export { McpServerRegistry } from './server-registry.js';
export * from './parity.js';
export * from './docker-runtime.js';

import type { SaisoConfig } from '../types/config.js';
import type { McpServerOrchestrator } from './orchestrator.js';
import { EvmMcpOrchestrator } from './evm-orchestrator.js';
import { SvmMcpOrchestrator } from './svm-orchestrator.js';

/**
 * Create the appropriate MCP orchestrator based on configuration
 */
export function createMcpOrchestrator(config: SaisoConfig): McpServerOrchestrator {
  const serverType = config.mcpServer?.type || 'evm';

  switch (serverType) {
    case 'evm':
      return new EvmMcpOrchestrator();
    case 'svm':
      return new SvmMcpOrchestrator();
    default:
      throw new Error(`Unsupported MCP server type: ${serverType}`);
  }
}
