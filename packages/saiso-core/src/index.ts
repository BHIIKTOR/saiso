/**
 * SAISO Core - EVM-Agnostic Blockchain Agent Toolkit
 */

// Export all types
export * from './types/index.js';

// Export constants
export * from './constants/index.js';

// Export utilities
export * from './utils/index.js';

// Export MCP orchestration
export * from './mcp/index.js';
export { createMcpOrchestrator } from './mcp/index.js';

// Export configuration management
export * from './config/index.js';

// Export payments
export * from './payments/index.js';

// Export identity and trust
export * from './identity/index.js';
export * from './trust/index.js';
export * from './service/index.js';
export * from './chat/index.js';
export * from './conversational/index.js';

// Export environment management
export * from './env/multi-chain-manager.js';

// Export memory management
export * from './memory/agent-memory-manager.js';

// Export multi-server management
export { SaisoMcpManager } from './mcp/multi-server-manager.js';

// Re-export commonly used items for convenience
export { logger, createLogger } from './utils/logger.js';
export { getNetworkConfig, getSupportedNetworks, isNetworkSupported } from './constants/networks.js';
export { getEvmNetwork, isEvmNetworkSupported } from './constants/evm-networks.js';
export { getSvmNetwork, isSvmNetworkSupported } from './constants/svm-networks.js';
export { DEFAULT_CONFIG, SUPPORTED_ENVIRONMENTS } from './constants/defaults.js';

// Explicit re-exports for commonly used config functions
export { saisoConfig, loadConfig, validateConfig } from './config/manager.js';
