/**
 * Environment Management Commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { SaisoMcpManager, MultiChainEnvManager } from '@saiso/core';

export const envCommand = new Command('env')
  .description('Manage environment variables for MCP servers')
  .addCommand(createGenerateCommand())
  .addCommand(createValidateCommand())
  .addCommand(createListCommand());

function createGenerateCommand(): Command {
  return new Command('generate')
    .description('Generate environment template for a specific server')
    .argument('<serverName>', 'Server name to generate template for')
    .option('--output <file>', 'Output file path (default: .env.<serverName>.template)')
    .action(async (serverName, options) => {
      try {
        const projectPath = process.cwd();
        const mcpManager = new SaisoMcpManager(projectPath);
        const envManager = new MultiChainEnvManager(projectPath);

        // Load server configurations
        await mcpManager.loadServerConfigs();
        const servers = mcpManager.listServers();

        // Find the server
        const server = servers.find(s => s.name === serverName);
        if (!server) {
          console.error(chalk.red(`❌ Server '${serverName}' not found`));
          console.log(chalk.gray('Available servers:'));
          for (const s of servers) {
            console.log(chalk.gray(`  - ${s.name} (${s.type})`));
          }
          process.exit(1);
        }

        // Get server config from MCP manager
        const serverInstances = mcpManager.listServers();
        const serverInstance = serverInstances.find(s => s.name === serverName);
        if (!serverInstance) {
          console.error(chalk.red(`❌ Server instance '${serverName}' not found`));
          process.exit(1);
        }

        // Register server with environment manager
        const serverConfig = {
          name: serverInstance.name,
          displayName: serverInstance.displayName,
          description: serverInstance.description,
          type: serverInstance.type,
          category: serverInstance.category,
          autoStart: serverInstance.autoStart,
          port: serverInstance.port,
          envPrefix: serverInstance.name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_',
          capabilities: serverInstance.capabilities,
          createdAt: new Date(),
          updatedAt: new Date(),
          serverConfig: {} // Minimal config for template generation
        };

        envManager.registerServer(serverConfig);

        console.log(chalk.blue(`🔧 Generating environment template for '${serverName}'...`));

        // Generate template
        const template = await envManager.generateEnvTemplate(serverName);

        console.log(chalk.green(`✅ Environment template generated successfully!`));
        console.log(chalk.gray(`📁 Template saved to: .env.${serverName}.template`));
        console.log();
        console.log(chalk.blue('📋 Template content:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(template);
        console.log(chalk.gray('─'.repeat(50)));
        console.log();
        console.log(chalk.blue('🔧 Next steps:'));
        console.log(chalk.gray(`1. Copy template: cp .env.${serverName}.template .env.${serverName}`));
        console.log(chalk.gray(`2. Edit .env.${serverName} with your actual values`));
        console.log(chalk.gray(`3. Run: saiso env validate to check configuration`));

      } catch (error) {
        console.error(chalk.red(`❌ Failed to generate environment template: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    });
}

function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate environment variables for all servers')
    .option('--server <name>', 'Validate specific server only')
    .action(async (options) => {
      try {
        const projectPath = process.cwd();
        const mcpManager = new SaisoMcpManager(projectPath);
        const envManager = new MultiChainEnvManager(projectPath);

        // Load server configurations
        await mcpManager.loadServerConfigs();
        const servers = mcpManager.listServers();

        if (servers.length === 0) {
          console.log(chalk.yellow('📭 No MCP servers configured'));
          console.log(chalk.gray('Run: saiso mcp add --help to get started'));
          return;
        }

        // Register all servers with environment manager
        for (const server of servers) {
          const serverConfig = {
            name: server.name,
            displayName: server.displayName,
            description: server.description,
            type: server.type,
            category: server.category,
            autoStart: server.autoStart,
            port: server.port,
            envPrefix: server.name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_',
            capabilities: server.capabilities,
            createdAt: new Date(),
            updatedAt: new Date(),
            serverConfig: {} // Minimal config for validation
          };
          envManager.registerServer(serverConfig);
        }

        console.log(chalk.blue('🔍 Validating environment variables...'));

        if (options.server) {
          // Validate specific server
          const result = envManager.validateServerEnvironment(options.server);

          console.log(chalk.bold(`📊 Validation Results for '${options.server}':`));
          console.log();

          if (result.valid) {
            console.log(chalk.green('✅ Environment configuration is valid!'));
          } else {
            console.log(chalk.red('❌ Environment configuration has errors:'));
            for (const error of result.errors) {
              console.log(chalk.red(`  • ${error}`));
            }
          }

          if (result.warnings.length > 0) {
            console.log(chalk.yellow('\n⚠️  Warnings:'));
            for (const warning of result.warnings) {
              console.log(chalk.yellow(`  • ${warning}`));
            }
          }
        } else {
          // Validate all servers
          const result = envManager.validateAllServerEnvironments();

          console.log(chalk.bold('📊 Environment Validation Results:'));
          console.log();

          if (result.valid) {
            console.log(chalk.green('✅ All server environments are valid!'));
          } else {
            console.log(chalk.red('❌ Found environment configuration errors:'));
            for (const error of result.errors) {
              console.log(chalk.red(`  • ${error}`));
            }
          }

          if (result.warnings.length > 0) {
            console.log(chalk.yellow('\n⚠️  Warnings:'));
            for (const warning of result.warnings) {
              console.log(chalk.yellow(`  • ${warning}`));
            }
          }

          // Show individual server results
          console.log(chalk.blue('\n🖥️  Individual Server Results:'));
          for (const [serverName, serverResult] of Object.entries(result.serverResults || {})) {
            const icon = serverResult.valid ? '✅' : '❌';
            console.log(`${icon} ${serverName}: ${serverResult.valid ? 'Valid' : `${serverResult.errors.length} errors`}`);
          }
        }

      } catch (error) {
        console.error(chalk.red(`❌ Failed to validate environment: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    });
}

function createListCommand(): Command {
  return new Command('list')
    .description('List environment configuration for all servers')
    .option('--server <name>', 'Show specific server only')
    .option('--show-values', 'Show actual environment variable values', false)
    .action(async (options) => {
      try {
        const projectPath = process.cwd();
        const mcpManager = new SaisoMcpManager(projectPath);
        const envManager = new MultiChainEnvManager(projectPath);

        // Load server configurations
        await mcpManager.loadServerConfigs();
        const servers = mcpManager.listServers();

        if (servers.length === 0) {
          console.log(chalk.yellow('📭 No MCP servers configured'));
          console.log(chalk.gray('Run: saiso mcp add --help to get started'));
          return;
        }

        // Register all servers with environment manager
        for (const server of servers) {
          const serverConfig = {
            name: server.name,
            displayName: server.displayName,
            description: server.description,
            type: server.type,
            category: server.category,
            autoStart: server.autoStart,
            port: server.port,
            envPrefix: server.name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_',
            capabilities: server.capabilities,
            createdAt: new Date(),
            updatedAt: new Date(),
            serverConfig: {} // Minimal config for listing
          };
          envManager.registerServer(serverConfig);
        }

        const serversToShow = options.server
          ? servers.filter(s => s.name === options.server)
          : servers;

        if (serversToShow.length === 0) {
          console.error(chalk.red(`❌ Server '${options.server}' not found`));
          process.exit(1);
        }

        console.log(chalk.bold(`📋 Environment Configuration (${serversToShow.length} servers)`));
        console.log();

        for (const server of serversToShow) {
          console.log(chalk.bold(`🖥️  ${server.displayName} (${server.name})`));
          console.log(chalk.gray(`   Type: ${server.type}`));
          console.log(chalk.gray(`   Environment Prefix: ${server.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_`));

          if (options.showValues) {
            const serverEnv = envManager.getServerEnvironment(server.name);
            console.log(chalk.gray('   Environment Variables:'));

            if (Object.keys(serverEnv).length === 0) {
              console.log(chalk.yellow('     No environment variables set'));
            } else {
              for (const [key, value] of Object.entries(serverEnv)) {
                // Mask sensitive values
                const maskedValue = key.includes('KEY') || key.includes('SECRET')
                  ? value.replace(/./g, '*')
                  : value;
                console.log(chalk.gray(`     ${key}=${maskedValue}`));
              }
            }
          }

          console.log();
        }

        if (!options.showValues) {
          console.log(chalk.blue('💡 Tip: Use --show-values to see actual environment variable values'));
        }

      } catch (error) {
        console.error(chalk.red(`❌ Failed to list environment configuration: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    });
}
