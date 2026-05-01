/**
 * Multi-chain environment manager - manages environment variables for multi-chain MCP servers
 */

export interface ServerConfig {
  name: string;
  displayName: string;
  description: string;
  type: string;
  category: string;
  autoStart: boolean;
  port: number;
  envPrefix: string;
  capabilities: string[];
  createdAt: Date;
  updatedAt: Date;
  serverConfig: Record<string, any>;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  serverResults?: Record<string, EnvValidationResult>;
}

export class MultiChainEnvManager {
  private projectPath: string;
  private servers: Map<string, ServerConfig> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  registerServer(config: ServerConfig): void {
    this.servers.set(config.name, config);
  }

  async generateEnvTemplate(serverName: string): Promise<string> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server '${serverName}' not found`);
    }

    const protocolVars = this.getServerSpecificTemplateVars(server.type, server.envPrefix);

    const template = [
      `# Environment configuration for ${server.displayName}`,
      `# Server type: ${server.type}`,
      `# Generated on: ${new Date().toISOString()}`,
      '',
      `# Server configuration`,
      `${server.envPrefix}PORT=${server.port}`,
      `${server.envPrefix}HOST=localhost`,
      '',
      `# Payment policy (optional)`,
      `${server.envPrefix}PAYMENT_ENABLED=false`,
      `${server.envPrefix}PAYMENT_PROTOCOL=auto`,
      `${server.envPrefix}PAYMENT_MAX_PER_REQUEST_USD=5`,
      '',
      `# Trust policy (optional)`,
      `${server.envPrefix}TRUST_ENABLED=false`,
      `${server.envPrefix}TRUST_MIN_SCORE=0.6`,
      '',
      ...protocolVars,
      `# Add your server-specific environment variables below`,
      `# ${server.envPrefix}API_KEY=your_api_key_here`,
      `# ${server.envPrefix}SECRET=your_secret_here`,
      ''
    ].join('\n');

    return template;
  }

  validateServerEnvironment(serverName: string): EnvValidationResult {
    const server = this.servers.get(serverName);
    if (!server) {
      return {
        valid: false,
        errors: [`Server '${serverName}' not found`],
        warnings: []
      };
    }

    // Basic validation - can be extended
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if required environment variables exist
    const requiredVars = [`${server.envPrefix}PORT`, `${server.envPrefix}HOST`];
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        errors.push(`Missing required environment variable: ${varName}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  validateAllServerEnvironments(): EnvValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const serverResults: Record<string, EnvValidationResult> = {};

    for (const [serverName] of this.servers) {
      const result = this.validateServerEnvironment(serverName);
      serverResults[serverName] = result;
      
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      serverResults
    };
  }

  getServerEnvironment(serverName: string): Record<string, string> {
    const server = this.servers.get(serverName);
    if (!server) {
      return {};
    }

    const env: Record<string, string> = {};
    const prefix = server.envPrefix;

    // Get all environment variables with the server's prefix
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value) {
        env[key] = value;
      }
    }

    return env;
  }

  private getServerSpecificTemplateVars(serverType: string, prefix: string): string[] {
    switch (serverType) {
      case 'evm':
        return [
          `# EVM defaults`,
          `${prefix}NETWORK=sepolia`,
          `${prefix}CHAIN_ID=11155111`,
          `${prefix}RPC_URL=https://rpc.sepolia.org`,
          `${prefix}PRIVATE_KEY=`,
          '',
        ];
      case 'svm':
        return [
          `# SVM defaults`,
          `${prefix}NETWORK=solana-devnet`,
          `${prefix}CHAIN_ID=103`,
          `${prefix}RPC_URL=https://api.devnet.solana.com`,
          `${prefix}PRIVATE_KEY=`,
          `${prefix}SVM_COMMITMENT=confirmed`,
          '',
        ];
      default:
        return [];
    }
  }
}

// Placeholder export to prevent build errors
export const MULTI_CHAIN_PLACEHOLDER = 'placeholder';
