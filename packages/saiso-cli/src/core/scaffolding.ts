import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SaisoConfigManager, type SaisoEnvironment } from './config.js';
import { logger } from './utils.js';
import { getNetworkConfig, type McpServerType, getEvmNetwork, getSvmNetwork } from '@saiso/core';

export interface ScaffoldOptions {
  projectName: string;
  environment: SaisoEnvironment;
  projectPath: string;
  agentName?: string;
  description?: string;
  mcpServerType: McpServerType;
  targetNetwork: string;
  serviceBlueprint?: boolean;
}

export class ProjectScaffolder {
  private configManager: SaisoConfigManager;
  private templatesPath: string;

  constructor() {
    this.configManager = SaisoConfigManager.getInstance();
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Find templates directory - try multiple locations for reliability
    const possiblePaths = [
      path.resolve(__dirname, '../templates'),
      path.resolve(__dirname, '../../templates'),
      path.resolve(process.cwd(), 'templates'),
      path.resolve(__dirname, '../../../../templates'),
    ];

    // Use the first path that exists
    this.templatesPath = possiblePaths[0]; // Default fallback
    for (const templatePath of possiblePaths) {
      try {
        if (existsSync(templatePath)) {
          this.templatesPath = templatePath;
          break;
        }
      } catch {
        // Continue to next path
      }
    }

    logger.debug(`Templates path resolved to: ${this.templatesPath}`);
  }

  /**
   * Create a new SAISO project using templates
   */
  async createProject(options: ScaffoldOptions): Promise<void> {
    const { projectName, environment, projectPath, agentName, description, mcpServerType, targetNetwork, serviceBlueprint } = options;

    logger.info(`Creating new SAISO project: ${projectName}`);
    logger.debug(`Project path: ${projectPath}`);
    logger.debug(`Environment: ${environment}`);
    logger.debug(`MCP Server: ${mcpServerType}`);
    logger.debug(`Target Network: ${targetNetwork}`);

    // Create project directory
    await fs.mkdir(projectPath, { recursive: true });

    // Create basic directory structure
    await this.createProjectStructure(projectPath);

    const finalAgentName = agentName || projectName;
    const finalDescription = description || `${mcpServerType.toUpperCase()} blockchain agent built with SAISO`;

    try {
      // Try template copying first
      await this.copyTemplateFiles(projectPath, {
        projectName,
        environment,
        agentName: finalAgentName,
        description: finalDescription,
        mcpServerType,
        targetNetwork,
      });
      logger.success('Templates copied successfully');
    } catch (error) {
      logger.warn('Template copying failed, using fallback generation');
      logger.debug('Template error:', error);

      // Fallback to hardcoded generation
      await this.generatePackageJson(projectPath, projectName, finalDescription);
      await this.generateEnvironmentFiles(projectPath, environment);
      await this.generateAgentConfig(projectPath, finalAgentName);
      await this.generateConfigFiles(projectPath);
      await this.generateReadme(projectPath, projectName, environment);
      logger.success('Project files generated using fallback method');
    }

    await this.generateIdentityDiscoveryFiles(projectPath, {
      projectName,
      agentName: finalAgentName,
      mcpServerType,
    });
    await this.ensureProjectPolicyFiles(projectPath);
    await this.ensureLocalnetTestingAssets(projectPath);

    if (serviceBlueprint) {
      await this.generateServiceBlueprint(projectPath);
      logger.success('Service blueprint scaffolding created');
    }

    logger.success(`Project ${projectName} created successfully!`);
  }

  /**
   * Copy template files and process template variables
   */
  private async copyTemplateFiles(
    projectPath: string,
    variables: {
      projectName: string;
      environment: SaisoEnvironment;
      agentName: string;
      description: string;
      mcpServerType: McpServerType;
      targetNetwork: string;
    }
  ): Promise<void> {
    // Select template directory based on server type
    const templateDir = variables.mcpServerType === 'svm'
      ? 'agent-svm'
      : 'agent-evm';
    const agentTemplatePath = path.join(this.templatesPath, templateDir);

    // Get network configuration for template variables based on server type and target network
    let networkConfig: {
      rpcUrl: string;
      chainId: number;
      blockExplorer: string;
      nativeCurrency: string;
    };

    if (variables.mcpServerType === 'evm') {
      // For EVM server, try to get EVM network config
      const evmNetwork = getEvmNetwork(variables.targetNetwork);
      if (evmNetwork) {
        networkConfig = {
          rpcUrl: evmNetwork.rpcUrl || '',
          chainId: evmNetwork.chainId || 0,
          blockExplorer: evmNetwork.blockExplorer || '',
          nativeCurrency: evmNetwork.nativeCurrency || 'ETH',
        };
      } else {
        // Fallback to default network config
        const fallbackConfig = getNetworkConfig(variables.targetNetwork, variables.environment);
        networkConfig = {
          rpcUrl: fallbackConfig.rpcUrl || '',
          chainId: fallbackConfig.chainId || 0,
          blockExplorer: fallbackConfig.blockExplorer || '',
          nativeCurrency: fallbackConfig.nativeCurrency || 'ETH',
        };
      }
    } else if (variables.mcpServerType === 'svm') {
      const svmNetwork = getSvmNetwork(variables.targetNetwork);
      if (svmNetwork) {
        networkConfig = {
          rpcUrl: svmNetwork.rpcUrl || '',
          chainId: svmNetwork.chainId || 0,
          blockExplorer: svmNetwork.blockExplorer || '',
          nativeCurrency: svmNetwork.nativeCurrency || 'SOL',
        };
      } else {
        networkConfig = {
          rpcUrl: '',
          chainId: 103,
          blockExplorer: 'https://explorer.solana.com/?cluster=devnet',
          nativeCurrency: 'SOL',
        };
      }
    } else {
      // Fallback to default EVM config when network metadata is unavailable.
      const fallbackConfig = getNetworkConfig(variables.targetNetwork, variables.environment);
      networkConfig = {
        rpcUrl: fallbackConfig.rpcUrl || '',
        chainId: fallbackConfig.chainId || 0,
        blockExplorer: fallbackConfig.blockExplorer || '',
        nativeCurrency: fallbackConfig.nativeCurrency || 'ETH',
      };
    }

    const templateVars: Record<string, string> = {
      projectName: variables.projectName,
      environment: variables.environment,
      agentName: variables.agentName,
      description: variables.description,
      mcpServerType: variables.mcpServerType,
      targetNetwork: variables.targetNetwork,
      rpcUrl: networkConfig.rpcUrl,
      chainId: networkConfig.chainId.toString(),
      blockExplorerUrl: networkConfig.blockExplorer,
      nativeCurrency: networkConfig.nativeCurrency,
      mcpServerMode: 'npx',
    };

    // Copy all template files
    await this.copyTemplateDirectory(agentTemplatePath, projectPath, templateVars);
  }

  /**
   * Recursively copy template directory and process template files
   */
  private async copyTemplateDirectory(
    sourcePath: string,
    targetPath: string,
    variables: Record<string, string>
  ): Promise<void> {
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });

    for (const entry of entries) {
      const sourceFile = path.join(sourcePath, entry.name);
      const targetFile = path.join(targetPath, entry.name.replace('.template', ''));

      if (entry.isDirectory()) {
        await fs.mkdir(targetFile, { recursive: true });
        await this.copyTemplateDirectory(sourceFile, targetFile, variables);
      } else {
        // Read template file
        let content = await fs.readFile(sourceFile, 'utf-8');

        // Process template variables
        content = this.processTemplate(content, variables);

        // Write processed file
        await fs.writeFile(targetFile, content);
      }
    }
  }

  /**
   * Process template variables in content
   */
  private processTemplate(content: string, variables: Record<string, string>): string {
    let processed = content;

    // Replace all {{variableName}} with actual values
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processed = processed.replace(regex, value);
    }

    return processed;
  }

  /**
   * Create the basic project directory structure
   */
  private async createProjectStructure(projectPath: string): Promise<void> {
    const directories = [
      'src',
      'src/actions',
      'src/evaluators',
      'src/providers',
      'characters',
      'docs',
      'tests',
      '.saiso',
    ];

    for (const dir of directories) {
      await fs.mkdir(path.join(projectPath, dir), { recursive: true });
    }
  }

  /**
   * Generate package.json for the project
   */
  private async generatePackageJson(
    projectPath: string,
    projectName: string,
    description?: string
  ): Promise<void> {
    const packageJson = {
      name: projectName,
      version: '0.1.0',
      description: description || 'Multi-chain blockchain agent built with SAISO and ElizaOS',
      main: 'dist/index.js',
      type: 'module',
      scripts: {
        build: 'tsc',
        dev: 'saiso dev',
        'agent:dev': 'bun run src/index.ts',
        start: 'node dist/index.js',
        test: 'saiso test',
        'test:behavior': 'saiso test --type behavior',
        clean: 'rm -rf dist',
      },
      dependencies: {
        '@elizaos/core': '^2.0.0-alpha.77',
        '@saiso/core': '^1.0.0-rc8',
        dotenv: '^16.5.0',
      },
      devDependencies: {
        '@types/node': '^20.0.0',
        typescript: '^5.0.0',
      },
      keywords: ['eliza', 'blockchain', 'agent', 'saiso', 'evm', 'svm'],
      license: 'MIT',
    };

    await fs.writeFile(
      path.join(projectPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  }

  /**
   * Generate environment configuration files
   */
  private async generateEnvironmentFiles(
    projectPath: string,
    defaultEnvironment: SaisoEnvironment
  ): Promise<void> {
    const environments: SaisoEnvironment[] = ['testnet', 'mainnet', 'devnet'];

    // Generate .env.example
    const exampleEnv = this.configManager.generateEnvTemplate('testnet');
    await fs.writeFile(path.join(projectPath, '.env.example'), exampleEnv);

    // Generate environment-specific files
    for (const env of environments) {
      const envContent = this.configManager.generateEnvTemplate(env);
      await fs.writeFile(path.join(projectPath, `.env.${env}`), envContent);
    }

    // Set the default environment as active .env
    const defaultEnvContent = this.configManager.generateEnvTemplate(defaultEnvironment);
    await fs.writeFile(path.join(projectPath, '.env'), defaultEnvContent);

    // Generate .gitignore
    const gitignore = `# Environment files
.env
.env.local
.env.*.local

# Dependencies
node_modules/
bun.lockb
package-lock.json
yarn.lock

# Build outputs
dist/
build/
*.tsbuildinfo

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# SAISO specific
.saiso/cache/
.saiso/logs/
`;

    await fs.writeFile(path.join(projectPath, '.gitignore'), gitignore);
  }

  /**
   * Generate ElizaOS agent configuration
   */
  private async generateAgentConfig(projectPath: string, agentName: string): Promise<void> {
    const characterConfig = {
      name: agentName,
      bio: [
        `I am ${agentName}, a multi-chain blockchain agent built with ElizaOS and SAISO.`,
        'I can help with EVM and SVM workflows, token operations, and smart contract interactions.',
        'I am designed to be helpful, accurate, and secure in all blockchain interactions.',
      ],
      lore: [
        'I was created using the SAISO toolkit, which provides a developer-first approach to building blockchain agents.',
        'I specialize in EVM and SVM operations and can work across testnet, mainnet, and devnet environments.',
        'My capabilities include token transfers, balance queries, contract interactions, and more.',
      ],
      messageExamples: [
        [
          {
            user: '{{user1}}',
            content: { text: 'What is my wallet balance on the target network?' },
          },
          {
            user: agentName,
            content: { text: 'Let me check that balance for you.' },
          },
        ],
        [
          {
            user: '{{user1}}',
            content: { text: 'Send 1 token to 0x1234567890123456789012345678901234567890' },
          },
          {
            user: agentName,
            content: {
              text: 'I can help execute that transaction after confirming network and recipient details.',
            },
          },
        ],
      ],
      postExamples: [
        'Just helped a user validate a multi-chain transaction route.',
        'Executed a secure token transfer with full confirmation checks.',
        'Monitoring network health and execution reliability across chains.',
      ],
      topics: ['blockchain', 'evm', 'svm', 'defi', 'tokens', 'smart contracts'],
      style: {
        all: [
          'Be helpful and informative about blockchain operations',
          'Always confirm transaction details before execution',
          'Provide clear explanations of blockchain concepts',
          'Be security-conscious and warn about potential risks',
          'Use appropriate blockchain terminology',
        ],
        chat: [
          'Be conversational but professional',
          'Ask for confirmation on important operations',
          'Provide transaction hashes and links when available',
        ],
        post: [
          'Share interesting blockchain insights',
          'Highlight successful operations and milestones',
          'Educate users about safe and reliable multi-chain workflows',
        ],
      },
      adjectives: [
        'helpful',
        'knowledgeable',
        'secure',
        'efficient',
        'reliable',
        'blockchain-savvy',
        'professional',
      ],
    };

    await fs.writeFile(
      path.join(projectPath, 'characters', `${agentName.toLowerCase()}.character.json`),
      JSON.stringify(characterConfig, null, 2)
    );
  }

  /**
   * Generate configuration files
   */
  private async generateConfigFiles(projectPath: string): Promise<void> {
    // TypeScript configuration
    const tsConfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        allowJs: true,
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        declaration: true,
        outDir: './dist',
        rootDir: './src',
        resolveJsonModule: true,
      },
      include: ['src/**/*'],
      exclude: ['dist', 'node_modules', '**/*.test.ts'],
    };

    await fs.writeFile(
      path.join(projectPath, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2)
    );

    // Main entry point
    const mainIndex = `import { saisoConfig, createMcpOrchestrator, type PaymentChallenge } from '@saiso/core';

function parseCredentialPayload(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Credential payload must be a JSON object');
  }
  if (
    'protocol' in parsed
    && 'payload' in parsed
    && typeof (parsed as { payload?: unknown }).payload === 'object'
    && (parsed as { payload?: unknown }).payload !== null
  ) {
    return (parsed as { payload: Record<string, unknown> }).payload;
  }
  return parsed as Record<string, unknown>;
}

async function maybeRunPremiumPaidProbe(
  orchestrator: ReturnType<typeof createMcpOrchestrator>,
  config: ReturnType<typeof saisoConfig.loadConfig>
): Promise<void> {
  if (process.env.SAISO_PREMIUM_PROBE !== 'true') {
    return;
  }

  const recipient = process.env.SAISO_PREMIUM_RECIPIENT;
  if (!recipient) {
    console.warn('SAISO_PREMIUM_PROBE enabled but SAISO_PREMIUM_RECIPIENT is missing; skipping.');
    return;
  }

  const amountUsd = Number.parseFloat(process.env.SAISO_PREMIUM_AMOUNT_USD || '0.2');
  const preferredProtocol = (process.env.SAISO_PREMIUM_PROTOCOL as 'x402' | 'mpp' | 'auto' | undefined) || 'auto';

  const resolveCredential = async (challenge: PaymentChallenge) => {
    const key = challenge.protocol === 'x402'
      ? 'X402_PAYMENT_CREDENTIAL_JSON'
      : 'MPP_PAYMENT_CREDENTIAL_JSON';
    const raw = process.env[key];
    if (!raw) {
      throw new Error(\`Missing \${key} for premium paid probe\`);
    }
    return {
      protocol: challenge.protocol,
      payload: parseCredentialPayload(raw),
    };
  };

  const defaultTools = config.mcpServer.type === 'svm'
    ? ['premium-route', 'premium-market-intel', 'premium-svm-simulate']
    : ['premium-simulate', 'premium-market-intel', 'premium-route-optimize'];
  const configured = process.env.SAISO_PREMIUM_TOOLS;
  const tools = configured && configured.trim()
    ? configured.split(',').map((name) => name.trim()).filter(Boolean)
    : defaultTools;

  const getProbeParams = (toolName: string): Record<string, unknown> => {
    if (config.mcpServer.type === 'svm') {
      switch (toolName) {
        case 'premium-route':
          return { market: 'SOL/USDC', dryRun: true };
        case 'premium-market-intel':
          return { symbol: 'SOL', interval: '1h', dryRun: true };
        case 'premium-svm-simulate':
          return { tx: 'base64tx', dryRun: true };
        default:
          return { dryRun: true, context: 'premium-pack' };
      }
    }

    switch (toolName) {
      case 'premium-simulate':
        return { tx: '0x', dryRun: true };
      case 'premium-market-intel':
        return { symbol: 'ETH', interval: '1h', dryRun: true };
      case 'premium-route-optimize':
        return { from: 'USDC', to: 'ETH', amount: '100', dryRun: true };
      default:
        return { dryRun: true, context: 'premium-pack' };
    }
  };

  for (const toolName of tools) {
    try {
      await orchestrator.invokeTool(
        toolName,
        getProbeParams(toolName),
        {
          payment: {
            enabled: true,
            preferredProtocol,
            maxPerRequestUsd: Number.isFinite(amountUsd) ? amountUsd : 0.2,
          },
          paymentContext: {
            resource: \`tool://\${toolName}\`,
            amountUsd: Number.isFinite(amountUsd) ? amountUsd : 0.2,
            recipient,
            metadata: {
              operationClass: 'high-risk',
              serverFamily: config.mcpServer.type,
            },
          },
          resolveCredential,
          projectPath: process.cwd(),
        }
      );
      console.log(\`Premium paid probe succeeded: \${toolName}\`);
    } catch (error) {
      console.warn(\`Premium paid probe failed (\${toolName}, non-fatal):\`, error instanceof Error ? error.message : String(error));
    }
  }
}

async function main() {
  // Load configuration
  const config = saisoConfig.loadConfig();

  // Validate configuration
  const validation = saisoConfig.validateConfig(config);
  if (!validation.valid) {
    console.error('Configuration validation failed:');
    validation.errors.forEach(error => console.error('  -', error));
    process.exit(1);
  }

  try {
    // Start MCP server for the configured chain family
    const orchestrator = createMcpOrchestrator(config);
    await orchestrator.start(config, process.cwd());
    console.log(\`MCP server started for \${config.mcpServer.type} on \${config.network}\`);
    await maybeRunPremiumPaidProbe(orchestrator, config);
  } catch (error) {
    console.error('Failed to start agent:', error);
    process.exit(1);
  }
}

main().catch(console.error);
`;

    await fs.writeFile(path.join(projectPath, 'src', 'index.ts'), mainIndex);

    // SAISO configuration
    const saisoConfigFile = {
      version: '0.1.0',
      type: 'agent',
      features: [],
      environments: {
        testnet: {
          default: true,
          autoFund: true,
        },
        mainnet: {
          confirmations: true,
          limits: {
            maxTransactionValue: '1.0',
          },
        },
        devnet: {
          experimental: true,
        },
      },
    };

    await fs.writeFile(
      path.join(projectPath, '.saiso', 'config.json'),
      JSON.stringify(saisoConfigFile, null, 2)
    );

    const paymentPolicy = {
      enabled: false,
      preferredProtocol: 'auto',
      maxPerRequestUsd: 5,
      dailyBudgetUsd: 50,
      allowedRecipients: [],
      blockedRecipients: [],
      toolMaxPerRequestUsd: {
        'premium-simulate': 1.5,
        'premium-market-intel': 0.75,
      },
      protocolAllowedRecipients: {
        x402: [],
        mpp: [],
      },
      protocolBlockedRecipients: {
        x402: [],
        mpp: [],
      },
      operationClassMinTrustScore: {
        read: 0.4,
        write: 0.65,
        'high-risk': 0.8,
      },
    };

    await fs.writeFile(
      path.join(projectPath, '.saiso', 'payment-policy.json'),
      JSON.stringify(paymentPolicy, null, 2)
    );

    const trustPolicy = {
      enabled: false,
      minTrustScore: 0.6,
      routingProfile: 'trust-first',
      reputationSource: '',
      validationSource: '',
    };

    await fs.writeFile(
      path.join(projectPath, '.saiso', 'trust-policy.json'),
      JSON.stringify(trustPolicy, null, 2)
    );
  }

  /**
   * Generate README.md
   */
  private async generateReadme(
    projectPath: string,
    projectName: string,
    environment: SaisoEnvironment
  ): Promise<void> {
    const readme = `# ${projectName}

A multi-chain blockchain agent built with [SAISO](https://github.com/BHIIKTOR/saiso) and [ElizaOS](https://github.com/elizaOS/eliza).

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Bun](https://bun.sh/) (recommended) or npm

### Installation

\`\`\`bash
# Install dependencies
bun install

# Copy environment configuration
cp .env.example .env

# Edit your environment variables
nano .env
\`\`\`

### Configuration

Set your private key and other configuration in the \`.env\` file:

\`\`\`bash
# Required: your signing key for the selected network family
PRIVATE_KEY=your_private_key_here

# Optional: Customize other settings
AGENT_NAME=${projectName}
LOG_LEVEL=info
\`\`\`

### Running the Agent

\`\`\`bash
# Development mode (auto-restart on changes)
bun run dev

# Production mode
bun run start
\`\`\`

## 🌐 Environment Management

This project supports multiple environments:

- **Testnet** (default): Safe for development and testing
- **Mainnet**: Production environment with real funds
- **Devnet**: Experimental features and latest updates

### Switch Environments

\`\`\`bash
# Switch to mainnet (requires confirmation)
saiso switch-env mainnet

# Switch back to testnet
saiso switch-env testnet

# Check current configuration
saiso config get
\`\`\`

## 🧪 Testing

\`\`\`bash
# Run all tests
bun run test

# Run behavior tests only
bun run test:behavior
\`\`\`

## 📦 Adding Features

Add pre-built features to your agent:

\`\`\`bash
# Add token sending capability
saiso add send_tokens

# Add balance checking
saiso add query_balance

# Add contract interaction
saiso add interact_contract
\`\`\`

## 🔧 Available Features

- \`send_tokens\` - Send native tokens or supported assets
- \`query_balance\` - Check wallet balances
- \`interact_contract\` - Smart contract interactions
- \`check_network_status\` - Network health monitoring
- \`gas_estimation\` - Gas or fee estimation

## 🛡️ Security

- Never commit your \`.env\` file to version control
- Use testnet for development and testing
- Always verify transaction details before confirming
- Keep your private keys secure and backed up

## 📚 Documentation

- [SAISO Documentation](https://github.com/BHIIKTOR/saiso)
- [ElizaOS Documentation](https://github.com/elizaOS/eliza)
- [Solana Documentation](https://solana.com/docs)
- [Ethereum Documentation](https://ethereum.org/en/developers/docs/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ using SAISO toolkit.
`;

    await fs.writeFile(path.join(projectPath, 'README.md'), readme);
  }

  private async generateIdentityDiscoveryFiles(
    projectPath: string,
    options: { projectName: string; agentName: string; mcpServerType: McpServerType }
  ): Promise<void> {
    const wellKnownDir = path.join(projectPath, '.well-known');
    await fs.mkdir(wellKnownDir, { recursive: true });

    const registrationPath = path.join(wellKnownDir, 'agent-registration.json');
    if (existsSync(registrationPath)) {
      return;
    }

    const registration = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: options.agentName,
      description: `${options.agentName} generated by SAISO for ${options.mcpServerType.toUpperCase()} workflows`,
      image: 'https://saiso.dev/assets/agent.png',
      services: [
        {
          name: 'mcp',
          endpoint: 'http://localhost:3001/mcp',
          version: '1.0',
          skills: [options.mcpServerType === 'svm' ? 'svm-tools' : 'evm-tools'],
          domains: [options.mcpServerType],
        },
      ],
      x402Support: true,
      paymentSupport: {
        x402: true,
        mpp: true,
        preferred: 'auto',
      },
      runtime: {
        environment: 'testnet',
        network: options.mcpServerType === 'svm' ? 'solana-devnet' : 'sepolia',
        serverType: options.mcpServerType,
        mcpEndpoint: 'http://localhost:3001/mcp',
        healthEndpoint: 'http://localhost:3001/healthz',
        readinessEndpoint: 'http://localhost:3001/readyz',
      },
      signing: {
        algorithm: 'set-signing-algorithm',
        keyId: 'set-signing-key-id',
      },
      active: true,
      registrations: [
        {
          agentId: 0,
          agentRegistry: 'set-identity-agent-registry',
        },
      ],
      supportedTrust: [],
    };

    await fs.writeFile(registrationPath, `${JSON.stringify(registration, null, 2)}\n`);
  }

  private async generateServiceBlueprint(projectPath: string): Promise<void> {
    const serviceFilePath = path.join(projectPath, 'src', 'service.ts');
    const serviceFile = `import { config as loadEnv } from 'dotenv';
import { createMcpOrchestrator, createServiceBlueprintServer, saisoConfig } from '@saiso/core';

loadEnv();

const servicePort = Number.parseInt(process.env.SAISO_SERVICE_PORT || '8080', 10);

async function main() {
  const config = saisoConfig.loadConfig();
  const orchestrator = createMcpOrchestrator(config);
  await orchestrator.start(config, process.cwd());
  let ready = true;
  let shuttingDown = false;
  let stopping = false;

  const server = createServiceBlueprintServer({
    config: {
      agentName: config.agentName,
      network: config.network,
      serverType: config.mcpServer.type,
      payment: config.payment,
    },
    orchestrator,
    projectPath: process.cwd(),
    registrationPath: '.well-known/agent-registration.json',
    isReady: () => ready,
    isShuttingDown: () => shuttingDown,
  });

  server.listen(servicePort, () => {
    // eslint-disable-next-line no-console
    console.log(\`SAISO service blueprint listening on http://localhost:\${servicePort}\`);
  });

  const shutdown = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    shuttingDown = true;
    ready = false;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await orchestrator.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start service blueprint:', error);
  process.exit(1);
});
`;

    await fs.writeFile(serviceFilePath, serviceFile);

    const dockerFilePath = path.join(projectPath, 'Dockerfile');
    if (!existsSync(dockerFilePath)) {
      const dockerfile = `FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "dist/service.js"]
`;
      await fs.writeFile(dockerFilePath, dockerfile);
    }

    const dockerIgnorePath = path.join(projectPath, '.dockerignore');
    if (!existsSync(dockerIgnorePath)) {
      const dockerIgnore = `node_modules
dist
.env
.env.*
.git
.saiso/cache
coverage
tmp
`;
      await fs.writeFile(dockerIgnorePath, dockerIgnore);
    }

    const composePath = path.join(projectPath, 'docker-compose.yml');
    if (!existsSync(composePath)) {
      const compose = `services:
  app:
    build:
      context: .
    image: \${SAISO_SERVICE_IMAGE:-saiso-service:local}
    env_file:
      - .env
    environment:
      - SAISO_SERVICE_PORT=8080
    ports:
      - "\${SAISO_SERVICE_PORT:-8080}:8080"
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/healthz"]
      interval: 30s
      timeout: 5s
      retries: 5

  mcp-evm:
    profiles: ["evm"]
    image: \${MCP_EVM_DOCKER_IMAGE:-ghcr.io/mcpdotdirect/evm-mcp-server:latest}
    environment:
      - NETWORK=\${SAISO_NETWORK:-sepolia}
      - CHAIN_ID=\${CHAIN_ID:-11155111}
      - RPC_URL=\${RPC_URL:-}
      - PRIVATE_KEY=\${PRIVATE_KEY:-}
    ports:
      - "\${MCP_EVM_PORT:-3001}:3001"
    restart: unless-stopped

  mcp-svm:
    profiles: ["svm"]
    image: \${MCP_SVM_DOCKER_IMAGE:-ghcr.io/saiso/svm-mcp-server:latest}
    environment:
      - NETWORK=\${SAISO_NETWORK:-solana-devnet}
      - CHAIN_ID=\${CHAIN_ID:-103}
      - RPC_URL=\${RPC_URL:-}
      - PRIVATE_KEY=\${PRIVATE_KEY:-}
      - SVM_COMMITMENT=\${SVM_COMMITMENT:-confirmed}
    ports:
      - "\${MCP_SVM_PORT:-3002}:3001"
    restart: unless-stopped
`;
      await fs.writeFile(composePath, compose);
    }

    const composeOverridePath = path.join(projectPath, 'docker-compose.override.yml');
    if (!existsSync(composeOverridePath)) {
      const composeOverride = `services:
  app:
    profiles: ["dev"]
    command: ["npm", "run", "service:start"]
    read_only: false
`;
      await fs.writeFile(composeOverridePath, composeOverride);
    }

    const localnetComposePath = path.join(projectPath, 'docker-compose.localnet.yml');
    if (!existsSync(localnetComposePath)) {
      const localnetCompose = `services:
  anvil:
    image: ghcr.io/foundry-rs/foundry:v1.3.1
    entrypoint: ["anvil"]
    command: ["--host", "0.0.0.0", "--port", "8545", "--chain-id", "31337"]
    ports:
      - "8545:8545"

  app-under-test:
    profiles: ["app"]
    build:
      context: .
    env_file:
      - .env
    environment:
      - SAISO_LOCALNET=true
      - RPC_URL=http://anvil:8545
      - CHAIN_ID=31337
      - PAYMENT_ENABLED=false
    depends_on:
      - anvil

  test-runner:
    profiles: ["test"]
    build:
      context: .
    command: ["bun", "test"]
    env_file:
      - .env
    environment:
      - SAISO_LOCALNET=true
      - RPC_URL=http://anvil:8545
      - CHAIN_ID=31337
      - PAYMENT_ENABLED=false
    depends_on:
      - anvil
`;
      await fs.writeFile(localnetComposePath, localnetCompose);
    }

    const localnetScriptPath = path.join(projectPath, 'scripts', 'localnet-test.sh');
    if (!existsSync(localnetScriptPath)) {
      await fs.mkdir(path.join(projectPath, 'scripts'), { recursive: true });
      const script = `#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.localnet.yml up -d anvil
trap 'docker compose -f docker-compose.localnet.yml down -v' EXIT

export SAISO_LOCALNET=true
export RPC_URL="\${RPC_URL:-http://127.0.0.1:8545}"
export CHAIN_ID="\${CHAIN_ID:-31337}"
export PAYMENT_ENABLED=false

if npm run | grep -q "localnet:setup"; then
  npm run localnet:setup
fi

if npm run | grep -q "localnet:deploy"; then
  npm run localnet:deploy
fi

if npm run | grep -q "localnet:test"; then
  npm run localnet:test
else
  npm test
fi
`;
      await fs.writeFile(localnetScriptPath, script, { mode: 0o755 });
    }

    const packageJsonPath = path.join(projectPath, 'package.json');
    try {
      const packageRaw = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageRaw) as {
        scripts?: Record<string, string>;
      };
      packageJson.scripts = packageJson.scripts || {};
      packageJson.scripts['service:dev'] = packageJson.scripts['service:dev'] || 'tsc --watch';
      packageJson.scripts['service:start'] = packageJson.scripts['service:start'] || 'node dist/service.js';
      packageJson.scripts['localnet:setup'] = packageJson.scripts['localnet:setup'] || 'echo "No localnet:setup script configured"';
      packageJson.scripts['localnet:deploy'] = packageJson.scripts['localnet:deploy'] || 'echo "No localnet:deploy script configured"';
      packageJson.scripts['localnet:test'] = packageJson.scripts['localnet:test'] || 'echo \"No localnet tests configured yet\"';
      packageJson.scripts['test:localnet'] = packageJson.scripts['test:localnet'] || 'saiso test localnet --chain evm';
      await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    } catch (error) {
      logger.warn('Failed to patch package.json with service scripts', error);
    }

    const readmePath = path.join(projectPath, 'README.md');
    try {
      const readme = await fs.readFile(readmePath, 'utf-8');
      if (!readme.includes('Service Blueprint')) {
        const section = `

## Service Blueprint

This project includes a deployable service scaffold with paid tool execution support:

- \`GET /healthz\`: liveness probe
- \`GET /readyz\`: readiness probe
- \`GET /.well-known/agent-registration.json\`: discovery metadata
- \`POST /paid/tool\`: payment-aware MCP tool execution

Run the service:

\`\`\`bash
npm run build
npm run service:start
\`\`\`

Run localnet tests with Docker + Foundry Anvil:

\`\`\`bash
npm run test:localnet
\`\`\`
`;
        await fs.writeFile(readmePath, `${readme.trimEnd()}\n${section}`);
      }
    } catch (error) {
      logger.warn('Failed to append service blueprint section to README', error);
    }
  }

  private async ensureProjectPolicyFiles(projectPath: string): Promise<void> {
    const saisoDir = path.join(projectPath, '.saiso');
    await fs.mkdir(saisoDir, { recursive: true });

    const configPath = path.join(saisoDir, 'config.json');
    if (!existsSync(configPath)) {
      const saisoConfigFile = {
        version: '0.1.0',
        type: 'agent',
        features: [],
        environments: {
          testnet: {
            default: true,
            autoFund: true,
          },
          mainnet: {
            confirmations: true,
            limits: {
              maxTransactionValue: '1.0',
            },
          },
          devnet: {
            experimental: true,
          },
        },
      };
      await fs.writeFile(configPath, `${JSON.stringify(saisoConfigFile, null, 2)}\n`);
    }

    const paymentPolicyPath = path.join(saisoDir, 'payment-policy.json');
    if (!existsSync(paymentPolicyPath)) {
      const paymentPolicy = {
        enabled: false,
        preferredProtocol: 'auto',
        maxPerRequestUsd: 5,
        dailyBudgetUsd: 50,
        allowedRecipients: [],
        blockedRecipients: [],
        toolMaxPerRequestUsd: {
          'premium-simulate': 1.5,
          'premium-market-intel': 0.75,
        },
        protocolAllowedRecipients: {
          x402: [],
          mpp: [],
        },
        protocolBlockedRecipients: {
          x402: [],
          mpp: [],
        },
        operationClassMinTrustScore: {
          read: 0.4,
          write: 0.65,
          'high-risk': 0.8,
        },
      };
      await fs.writeFile(paymentPolicyPath, `${JSON.stringify(paymentPolicy, null, 2)}\n`);
    }

    const trustPolicyPath = path.join(saisoDir, 'trust-policy.json');
    if (!existsSync(trustPolicyPath)) {
      const trustPolicy = {
        enabled: false,
        minTrustScore: 0.6,
        routingProfile: 'trust-first',
        reputationSource: '',
        validationSource: '',
      };
      await fs.writeFile(trustPolicyPath, `${JSON.stringify(trustPolicy, null, 2)}\n`);
    }
  }

  private async ensureLocalnetTestingAssets(projectPath: string): Promise<void> {
    const localnetComposePath = path.join(projectPath, 'docker-compose.localnet.yml');
    if (!existsSync(localnetComposePath)) {
      const localnetCompose = `services:
  anvil:
    image: ghcr.io/foundry-rs/foundry:v1.3.1
    entrypoint: ["anvil"]
    command: ["--host", "0.0.0.0", "--port", "8545", "--chain-id", "31337"]
    ports:
      - "8545:8545"
`;
      await fs.writeFile(localnetComposePath, localnetCompose);
    }

    const localnetScriptPath = path.join(projectPath, 'scripts', 'localnet-test.sh');
    if (!existsSync(localnetScriptPath)) {
      await fs.mkdir(path.join(projectPath, 'scripts'), { recursive: true });
      const script = `#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.localnet.yml up -d anvil
trap 'docker compose -f docker-compose.localnet.yml down -v' EXIT

export SAISO_LOCALNET=true
export RPC_URL="\${RPC_URL:-http://127.0.0.1:8545}"
export CHAIN_ID="\${CHAIN_ID:-31337}"
export PAYMENT_ENABLED=false

if npm run | grep -q "localnet:test"; then
  npm run localnet:test
else
  npm test
fi
`;
      await fs.writeFile(localnetScriptPath, script, { mode: 0o755 });
    }
  }
}

export const scaffolder = new ProjectScaffolder();
