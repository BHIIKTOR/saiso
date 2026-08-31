/**
 * MCP Server Management Commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { SaisoMcpManager, PaymentReceiptStore } from '@saiso/core';
import type { IndividualServerConfig, ServerType } from '@saiso/core';
import { withTimeout } from '../core/utils.js';
import { saisoConfig } from '../core/index.js';
import { loadProjectPolicies, resolveMcpCallPolicies } from '../core/policy.js';

export const mcpCommand = new Command('mcp')
  .description('Manage MCP servers')
  .addCommand(createAddCommand())
  .addCommand(createListCommand())
  .addCommand(createStartCommand())
  .addCommand(createStopCommand())
  .addCommand(createRestartCommand())
  .addCommand(createRemoveCommand())
  .addCommand(createStatusCommand())
  .addCommand(createCallCommand());

function createAddCommand(): Command {
  return new Command('add')
    .description('Add a new MCP server configuration')
    .requiredOption('--name <name>', 'Server name (user-defined)')
    .requiredOption('--type <type>', 'Server type (evm, svm)')
    .option('--display-name <displayName>', 'Friendly display name')
    .option('--description <description>', 'Server description')
    .option('--network <network>', 'Target network (mainnet, testnet, devnet)')
    .option('--port <port>', 'Port number (auto-assigned if not specified)', parseInt)
    .option('--env-prefix <prefix>', 'Environment variable prefix')
    .option('--auto-start', 'Auto-start with saiso dev', false)
    .action(async (options) => {
      try {
        const projectPath = process.cwd();
        const manager = new SaisoMcpManager(projectPath);

        // Load existing configurations
        await manager.loadServerConfigs();

        // Validate server type
        const validTypes: ServerType[] = ['evm', 'svm'];
        if (!validTypes.includes(options.type as ServerType)) {
          console.error(chalk.red(`❌ Invalid server type: ${options.type}`));
          console.error(chalk.gray(`Valid types: ${validTypes.join(', ')}`));
          process.exit(1);
        }

        // Generate default values
        const displayName = options.displayName || options.name;
        const description = options.description || `${options.type.toUpperCase()} server: ${options.name}`;
        const envPrefix = options.envPrefix || `${options.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_`;
        const network = options.network || 'testnet';

        // Create server configuration
        const serverConfig: IndividualServerConfig = {
          name: options.name,
          displayName,
          description,
          type: options.type as ServerType,
          category: getServerCategory(options.type as ServerType),
          autoStart: options.autoStart,
          port: options.port || 0, // Will be auto-assigned
          envPrefix,
          capabilities: getServerCapabilities(options.type as ServerType),
          createdAt: new Date(),
          updatedAt: new Date(),
          serverConfig: createServerSpecificConfig(options.type as ServerType, network, options),
        };

        // Add server with timeout protection
        await withTimeout(
          manager.addServer(serverConfig),
          30000,
          'MCP server configuration timed out'
        );

        console.log(chalk.green(`✅ MCP server '${options.name}' added successfully!`));
        console.log(chalk.gray(`📋 Server Details:`));
        console.log(chalk.gray(`   Type: ${serverConfig.type}`));
        console.log(chalk.gray(`   Port: ${serverConfig.port}`));
        console.log(chalk.gray(`   Environment Prefix: ${serverConfig.envPrefix}`));
        console.log(chalk.gray(`   Auto-start: ${serverConfig.autoStart ? 'Yes' : 'No'}`));

        // Generate environment template
        console.log(chalk.blue(`\n🔧 Next steps:`));
        console.log(chalk.gray(`1. Run: saiso env generate ${options.name}`));
        console.log(chalk.gray(`2. Configure environment variables`));
        console.log(chalk.gray(`3. Run: saiso mcp start ${options.name}`));

      } catch (error) {
        console.error(chalk.red(`❌ Failed to add MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    });
}

function createListCommand(): Command {
  return new Command('list')
    .description('List all configured MCP servers')
    .option('--status', 'Show server status', false)
    .action(async (options) => {
      try {
        const projectPath = process.cwd();
        const manager = new SaisoMcpManager(projectPath);

        await manager.loadServerConfigs();
        const servers = manager.listServers();

        if (servers.length === 0) {
          console.log(chalk.yellow('📭 No MCP servers configured'));
          console.log(chalk.gray('Run: saiso mcp add --help to get started'));
          return;
        }

        console.log(chalk.bold(`📋 MCP Servers (${servers.length})`));
        console.log();

        for (const server of servers) {
          const statusIcon = getStatusIcon(server.status);
          const healthIcon = getHealthIcon(server.healthStatus);

          console.log(chalk.bold(`${statusIcon} ${server.displayName}`));
          console.log(chalk.gray(`   Name: ${server.name}`));
          console.log(chalk.gray(`   Type: ${server.type} (${server.category})`));
          console.log(chalk.gray(`   Port: ${server.port}`));
          console.log(chalk.gray(`   Auto-start: ${server.autoStart ? 'Yes' : 'No'}`));

          if (options.status) {
            console.log(chalk.gray(`   Status: ${server.status} ${healthIcon}`));
            if (server.url) {
              console.log(chalk.gray(`   URL: ${server.url}`));
            }
            if (server.capabilities.length > 0) {
              console.log(chalk.gray(`   Capabilities: ${server.capabilities.join(', ')}`));
            }
          }

          console.log();
        }

        // Show resource usage
        const resourceStats = manager.getResourceStats();
        console.log(chalk.blue(`📊 Resource Usage:`));
        console.log(chalk.gray(`   Ports allocated: ${resourceStats.allocatedPorts}/${resourceStats.totalPorts}`));
        console.log(chalk.gray(`   Available ports: ${resourceStats.availablePorts}`));
        console.log(chalk.gray(`   Utilization: ${resourceStats.utilizationPercent}%`));

      } catch (error) {
        console.error(chalk.red(`❌ Failed to list MCP servers: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    });
}

function createStartCommand(): Command {
  return new Command('start')
    .description('Start a specific MCP server')
    .argument('<name>', 'Server name to start')
    .action(async (name) => {
      try {
        const projectPath = process.cwd();
        const manager = new SaisoMcpManager(projectPath);

        await manager.loadServerConfigs();

        console.log(chalk.blue(`🚀 Starting MCP server '${name}'...`));

        const status = await manager.startServer(name);

        console.log(chalk.green(`✅ MCP server '${name}' started successfully!`));
        console.log(chalk.gray(`📋 Server Status:`));
        console.log(chalk.gray(`   Running: ${status.running ? 'Yes' : 'No'}`));
        console.log(chalk.gray(`   URL: ${status.url}`));
        console.log(chalk.gray(`   Port: ${status.port}`));
        console.log(chalk.gray(`   Mode: ${status.mode}`));

        if (status.capabilities && status.capabilities.length > 0) {
          console.log(chalk.gray(`   Capabilities: ${status.capabilities.join(', ')}`));
        }

      } catch (error) {
        console.error(chalk.red(`❌ Failed to start MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    });
}

function createStopCommand(): Command {
  return new Command('stop')
    .description('Stop a specific MCP server')
    .argument('<name>', 'Server name to stop')
    .action(async (name) => {
      try {
        const projectPath = process.cwd();
        const manager = new SaisoMcpManager(projectPath);

        await manager.loadServerConfigs();

        console.log(chalk.blue(`🛑 Stopping MCP server '${name}'...`));

        await manager.stopServer(name);

        console.log(chalk.green(`✅ MCP server '${name}' stopped successfully!`));

      } catch (error) {
        console.error(chalk.red(`❌ Failed to stop MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    });
}

function createRestartCommand(): Command {
  return new Command('restart')
    .description('Restart a specific MCP server')
    .argument('<name>', 'Server name to restart')
    .action(async (name) => {
      try {
        const projectPath = process.cwd();
        const manager = new SaisoMcpManager(projectPath);

        await manager.loadServerConfigs();

        console.log(chalk.blue(`🔄 Restarting MCP server '${name}'...`));

        const status = await manager.restartServer(name);

        console.log(chalk.green(`✅ MCP server '${name}' restarted successfully!`));
        console.log(chalk.gray(`📋 Server Status:`));
        console.log(chalk.gray(`   Running: ${status.running ? 'Yes' : 'No'}`));
        console.log(chalk.gray(`   URL: ${status.url}`));
        console.log(chalk.gray(`   Port: ${status.port}`));

      } catch (error) {
        console.error(chalk.red(`❌ Failed to restart MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    });
}

function createRemoveCommand(): Command {
  return new Command('remove')
    .description('Remove an MCP server configuration')
    .argument('<name>', 'Server name to remove')
    .option('--force', 'Force removal without confirmation', false)
    .action(async (name, options) => {
      try {
        const projectPath = process.cwd();
        const manager = new SaisoMcpManager(projectPath);

        await manager.loadServerConfigs();

        // Confirmation prompt
        if (!options.force) {
          console.log(chalk.yellow(`⚠️  This will permanently remove MCP server '${name}' and its configuration.`));
          console.log(chalk.gray('Use --force to skip this confirmation.'));

          // For now, require --force flag
          console.log(chalk.red('❌ Removal cancelled. Use --force flag to confirm.'));
          process.exit(1);
        }

        console.log(chalk.blue(`🗑️  Removing MCP server '${name}'...`));

        await manager.removeServer(name);

        console.log(chalk.green(`✅ MCP server '${name}' removed successfully!`));

      } catch (error) {
        console.error(chalk.red(`❌ Failed to remove MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    });
}

function createStatusCommand(): Command {
  return new Command('status')
    .description('Show detailed status of MCP servers')
    .option('--resources', 'Show resource allocation details', false)
    .action(async (options) => {
      try {
        const projectPath = process.cwd();
        const manager = new SaisoMcpManager(projectPath);

        await manager.loadServerConfigs();

        // Check health of all servers
        console.log(chalk.blue('🔍 Checking server health...'));
        const healthResults = await manager.checkAllServersHealth();

        const servers = manager.listServers();
        const serverStats = manager.getServerStats();

        console.log(chalk.bold(`📊 MCP Server Status`));
        console.log();

        // Overall statistics
        console.log(chalk.blue(`📈 Overview:`));
        console.log(chalk.gray(`   Total servers: ${servers.length}`));
        console.log(chalk.gray(`   Running: ${serverStats.running || 0}`));
        console.log(chalk.gray(`   Stopped: ${serverStats.stopped || 0}`));
        console.log(chalk.gray(`   Unhealthy: ${serverStats.unhealthy || 0}`));
        console.log();

        // Individual server status
        if (servers.length > 0) {
          console.log(chalk.blue(`🖥️  Server Details:`));
          for (const server of servers) {
            const isHealthy = healthResults[server.name];
            const statusIcon = getStatusIcon(server.status);
            const healthIcon = isHealthy ? '🟢' : '🔴';

            console.log(`${statusIcon} ${healthIcon} ${chalk.bold(server.displayName)}`);
            console.log(chalk.gray(`   Name: ${server.name}`));
            console.log(chalk.gray(`   Type: ${server.type}`));
            console.log(chalk.gray(`   Status: ${server.status}`));
            console.log(chalk.gray(`   Health: ${isHealthy ? 'Healthy' : 'Unhealthy'}`));
            console.log(chalk.gray(`   Port: ${server.port}`));

            if (server.url) {
              console.log(chalk.gray(`   URL: ${server.url}`));
            }

            console.log();
          }
        }

        // Resource allocation
        if (options.resources) {
          const resourceStats = manager.getResourceStats();
          console.log(chalk.blue(`💾 Resource Allocation:`));
          console.log(chalk.gray(`   Ports allocated: ${resourceStats.allocatedPorts}/${resourceStats.totalPorts}`));
          console.log(chalk.gray(`   Available ports: ${resourceStats.availablePorts}`));
          console.log(chalk.gray(`   Utilization: ${resourceStats.utilizationPercent}%`));
        }

      } catch (error) {
        console.error(chalk.red(`❌ Failed to get MCP server status: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    });
}

function createCallCommand(): Command {
  return new Command('call')
    .description('Execute an MCP tool call on a configured server')
    .requiredOption('--tool <name>', 'Tool name to execute')
    .option('--params <json>', 'Tool params JSON object', '{}')
    .option('--server <name>', 'Execute on a specific server')
    .option('--capability <capability>', 'Route by capability when --server is not provided')
    .option('--network <network>', 'Route by network when --server is not provided')
    .option('--min-trust-score <score>', 'Minimum trust score for routing (0-1)', parseFloat)
    .option('--max-cost-usd <amount>', 'Maximum server cost per request in USD for routing', parseFloat)
    .option('--routing-profile <profile>', 'Routing profile (trust-first, cost-first, balanced)')
    .option('--paid', 'Enable payment-aware tool execution')
    .option('--payment-protocol <protocol>', 'Payment protocol override (x402, mpp, auto)')
    .option('--amount-usd <amount>', 'Expected tool cost in USD', parseFloat)
    .option('--recipient <recipient>', 'Payment recipient identifier/domain')
    .option('--resource <resource>', 'Payment resource key (default: tool://<tool>)')
    .option('--operation-class <class>', 'Operation class for policy checks (read, write, high-risk)')
    .option('--credential-json <json>', 'Inline credential JSON payload or {protocol,payload}')
    .option('--no-auto-start', 'Do not auto-start selected server when stopped')
    .option('--stop-after', 'Stop server if auto-started by this command', false)
    .action(async (options) => {
      let autoStartedServer: string | null = null;
      let manager: SaisoMcpManager | null = null;

      try {
        const projectPath = process.cwd();
        manager = new SaisoMcpManager(projectPath);
        const config = saisoConfig.loadConfig(undefined, projectPath);
        const loadedPolicies = await loadProjectPolicies(projectPath);

        await manager.loadServerConfigs();
        const servers = manager.listServers();
        if (servers.length === 0) {
          console.error(chalk.red('❌ No MCP servers configured'));
          console.error(chalk.gray('Run: saiso mcp add --help'));
          process.exit(1);
        }

        const params = parseJsonObjectOption(options.params, '--params');

        if (typeof options.minTrustScore === 'number') {
          if (Number.isNaN(options.minTrustScore) || options.minTrustScore < 0 || options.minTrustScore > 1) {
            throw new Error('--min-trust-score must be a number between 0 and 1.');
          }
        }

        if (typeof options.maxCostUsd === 'number') {
          if (Number.isNaN(options.maxCostUsd) || options.maxCostUsd < 0) {
            throw new Error('--max-cost-usd must be a non-negative number.');
          }
        }

        if (
          options.paymentProtocol
          && options.paymentProtocol !== 'x402'
          && options.paymentProtocol !== 'mpp'
          && options.paymentProtocol !== 'auto'
        ) {
          throw new Error('--payment-protocol must be one of x402, mpp, auto.');
        }

        if (
          options.routingProfile
          && options.routingProfile !== 'trust-first'
          && options.routingProfile !== 'cost-first'
          && options.routingProfile !== 'balanced'
        ) {
          throw new Error('--routing-profile must be one of trust-first, cost-first, balanced.');
        }

        const resolvedPolicies = resolveMcpCallPolicies(
          {
            paid: options.paid === true ? true : undefined,
            paymentProtocol: options.paymentProtocol as 'x402' | 'mpp' | 'auto' | undefined,
            minTrustScore: typeof options.minTrustScore === 'number' ? options.minTrustScore : undefined,
            maxCostUsd: typeof options.maxCostUsd === 'number' ? options.maxCostUsd : undefined,
            routingProfile: options.routingProfile as 'trust-first' | 'cost-first' | 'balanced' | undefined,
            operationClass: options.operationClass as string | undefined,
          },
          loadedPolicies,
          {
            payment: config.payment,
            trust: config.trust,
          }
        );

        const {
          paymentEnabled,
          paymentConfig,
          defaultMinTrustScore,
          defaultRoutingProfile,
          defaultOperationClass,
          defaultMaxCostUsd,
        } = resolvedPolicies;

        const buildToolCallOptions = (selectedServerTrustScore?: number) => paymentEnabled
          ? {
              payment: paymentConfig,
              paymentContext: {
                resource: options.resource || `tool://${options.tool}`,
                amountUsd: typeof options.amountUsd === 'number' ? options.amountUsd : undefined,
                recipient: options.recipient,
                metadata: {
                  toolName: options.tool,
                  ...(defaultOperationClass ? { operationClass: defaultOperationClass } : {}),
                  ...(typeof selectedServerTrustScore === 'number' ? { selectedServerTrustScore } : {}),
                },
              },
              projectPath,
              resolveCredential,
            }
          : undefined;

        const credentialInput = options.credentialJson
          ? parseJsonOption(options.credentialJson, '--credential-json')
          : undefined;

        const resolveCredential = paymentEnabled
          ? async (challenge: { protocol: 'x402' | 'mpp' }) => {
              if (credentialInput && typeof credentialInput === 'object' && credentialInput !== null) {
                const maybeProtocol = (credentialInput as { protocol?: string }).protocol;
                const maybePayload = (credentialInput as { payload?: unknown }).payload;
                if (
                  (maybeProtocol === 'x402' || maybeProtocol === 'mpp')
                  && typeof maybePayload === 'object'
                  && maybePayload !== null
                ) {
                  return {
                    protocol: maybeProtocol as 'x402' | 'mpp',
                    payload: maybePayload as Record<string, unknown>,
                  };
                }
                return {
                  protocol: challenge.protocol as 'x402' | 'mpp',
                  payload: credentialInput as Record<string, unknown>,
                };
              }

              const envKey = challenge.protocol === 'x402'
                ? 'X402_PAYMENT_CREDENTIAL_JSON'
                : 'MPP_PAYMENT_CREDENTIAL_JSON';
              const envValue = process.env[envKey];
              if (!envValue) {
                throw new Error(
                  `Payment credential required for ${challenge.protocol}. Provide --credential-json or ${envKey}.`
                );
              }

              const parsed = parseJsonOption(envValue, envKey);
              if (typeof parsed !== 'object' || parsed === null) {
                throw new Error(`${envKey} must contain a JSON object.`);
              }
              return {
                protocol: challenge.protocol as 'x402' | 'mpp',
                payload: parsed as Record<string, unknown>,
              };
            }
          : undefined;

        if (options.server) {
          const server = servers.find(item => item.name === options.server);
          if (!server) {
            throw new Error(`Server '${options.server}' not found`);
          }

          if (options.autoStart && server.status !== 'running') {
            await manager.startServer(server.name);
            autoStartedServer = server.name;
          } else if (!options.autoStart && server.status !== 'running') {
            throw new Error(`Server '${server.name}' is not running. Re-run with --auto-start.`);
          }

          const result = await manager.executeTool(server.name, options.tool, params, buildToolCallOptions(server.trustScore));
          printToolExecutionResult(server.name, result);
        } else {
          const criteria = {
            capability: options.capability || undefined,
            network: options.network || undefined,
            serverType: config.mcpServer?.type || undefined,
            minTrustScore: defaultMinTrustScore,
            maxCostUsd: defaultMaxCostUsd,
            routingProfile: defaultRoutingProfile,
          };

          const routedServer = await manager.routeRequest(criteria);
          if (!routedServer) {
            throw new Error('No server matched routing criteria.');
          }

          const server = manager.listServers().find(item => item.name === routedServer);
          if (!server) {
            throw new Error(`Server '${routedServer}' not found after routing.`);
          }

          if (options.autoStart && server.status !== 'running') {
            autoStartedServer = routedServer;
            await manager.startServer(routedServer);
          } else if (!options.autoStart && server.status !== 'running') {
            throw new Error(`Routed server '${routedServer}' is not running. Re-run with --auto-start.`);
          }

          const { serverName, result } = await manager.routeAndExecuteTool(
            criteria,
            options.tool,
            params,
            buildToolCallOptions(server.trustScore)
          );
          printToolExecutionResult(serverName, result);
        }

        if (paymentEnabled) {
          const receiptStore = new PaymentReceiptStore(projectPath);
          const receipts = await receiptStore.readAll(10);
          if (receipts.length > 0) {
            const latest = receipts[receipts.length - 1];
            const latestOutcomeClass = (latest as { outcomeClass?: string }).outcomeClass;
            console.log(chalk.bold('\n💳 Latest Payment Receipt:'));
            console.log(chalk.gray(`   Protocol: ${latest.protocol}`));
            console.log(chalk.gray(`   Success: ${latest.success ? 'Yes' : 'No'}`));
            console.log(chalk.gray(`   Outcome Class: ${latestOutcomeClass || (latest.success ? 'settled' : 'unknown-failure')}`));
            if (latest.reference) {
              console.log(chalk.gray(`   Reference: ${latest.reference}`));
            }
            if (latest.amount) {
              console.log(chalk.gray(`   Amount: ${latest.amount}`));
            }
          }
        }
      } catch (error) {
        console.error(chalk.red(`❌ Failed to execute MCP tool: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      } finally {
        if (options.stopAfter && autoStartedServer && manager) {
          try {
            await manager.stopServer(autoStartedServer);
            console.log(chalk.gray(`🛑 Auto-started server '${autoStartedServer}' was stopped (--stop-after).`));
          } catch (error) {
            console.error(chalk.yellow(`⚠️ Failed to stop auto-started server '${autoStartedServer}': ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        }
      }
    });
}

// Helper functions
export function getServerCategory(type: ServerType): 'blockchain' | 'utility' | 'custom' {
  switch (type) {
    case 'svm':
    case 'evm':
      return 'blockchain';
    case 'utility':
      return 'utility';
    case 'custom':
      return 'custom';
    default:
      return 'custom';
  }
}

export function getServerCapabilities(type: ServerType): string[] {
  switch (type) {
    case 'svm':
      return ['send_sol', 'query_balance', 'read_program_account', 'simulate_transaction', 'spl_tokens'];
    case 'evm':
      return ['send_tokens', 'query_balance', 'interact_contract', 'gas_estimation', 'eip1559', 'flashbots'];
    case 'utility':
      return ['api_calls', 'data_processing'];
    case 'custom':
      return ['custom_operations'];
    default:
      return [];
  }
}

export function createServerSpecificConfig(
  type: ServerType,
  network: string,
  options: any
): IndividualServerConfig['serverConfig'] {
  switch (type) {
    case 'svm':
      return {
        network,
        chainId: getChainIdForNetwork(network, 'svm'),
        mode: 'npx' as const,
        commitment: 'confirmed' as const,
      };
    case 'evm':
      return {
        network,
        chainId: getChainIdForNetwork(network, 'evm'),
        mode: 'npx' as const,
      };
    case 'utility':
      return {
        command: 'npx',
        args: ['@utility/server'],
        mode: 'npx' as const,
      };
    case 'custom':
      return {
        command: options.command || 'node',
        args: options.args ? options.args.split(',') : ['server.js'],
        mode: 'binary' as const,
      };
    default:
      throw new Error(`Unsupported server type: ${type}`);
  }
}

export function getChainIdForNetwork(network: string, type: 'evm' | 'svm'): number {
  if (type === 'svm') {
    switch (network) {
      case 'solana-mainnet': return 101;
      case 'solana-testnet': return 102;
      case 'solana-devnet': return 103;
      default: return 103;
    }
  }

  switch (network) {
    case 'mainnet': return 1;
    case 'testnet': return 11155111; // Sepolia
    case 'devnet': return 31337; // Hardhat
    default: return 11155111;
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'running': return '🟢';
    case 'stopped': return '🔴';
    case 'error': return '🟠';
    default: return '⚪';
  }
}

function getHealthIcon(health?: string): string {
  switch (health) {
    case 'healthy': return '💚';
    case 'unhealthy': return '💔';
    case 'unknown': return '❓';
    default: return '❓';
  }
}

function parseJsonOption(raw: string, optionName: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${optionName} must be valid JSON.`);
  }
}

function parseJsonObjectOption(raw: string, optionName: string): Record<string, unknown> {
  const value = parseJsonOption(raw, optionName);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${optionName} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function printToolExecutionResult(serverName: string, result: Record<string, unknown>): void {
  console.log(chalk.green(`✅ Tool executed via server: ${serverName}`));
  console.log(chalk.bold('\n📦 Tool Result:'));
  console.log(JSON.stringify(result, null, 2));
}
