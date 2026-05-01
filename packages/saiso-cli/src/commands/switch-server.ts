import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { saisoConfig, findProjectRoot, type SaisoEnvironment } from '../core/index.js';
import type { McpServerType } from '@saiso/core';

function isValidServerType(serverType: string): serverType is McpServerType {
  return ['evm', 'svm'].includes(serverType);
}

async function switchMcpServer(
  projectRoot: string,
  targetServerType: McpServerType,
  options: { backup?: boolean; dryRun?: boolean; force?: boolean }
): Promise<void> {
  console.log(chalk.cyan(`🔄 Switching to ${targetServerType.toUpperCase()} MCP server...\n`));

  try {
    // Load current configuration
    const currentConfig = saisoConfig.loadConfig(undefined, projectRoot);
    const currentServerType = currentConfig.mcpServer.type;

    if (currentServerType === targetServerType) {
      console.log(chalk.yellow(`⚠️  Already using ${targetServerType.toUpperCase()} MCP server`));
      return;
    }

    console.log(chalk.gray(`Current server: ${currentServerType.toUpperCase()}`));
    console.log(chalk.gray(`Target server: ${targetServerType.toUpperCase()}`));

    // Dry run mode
    if (options.dryRun) {
      console.log(chalk.cyan('\n🧪 Dry Run Mode - No changes will be made\n'));

      console.log(chalk.yellow('📋 Planned Changes:'));
      console.log(chalk.gray(`  • Update MCP server type: ${currentServerType} → ${targetServerType}`));
      console.log(chalk.gray('  • Update package.json dependencies'));
      console.log(chalk.gray('  • Regenerate environment files'));

      if (options.backup) {
        console.log(chalk.gray('  • Create configuration backup'));
      }

      console.log(chalk.cyan('\n✅ Dry run complete. Use --force to apply changes.'));
      return;
    }

    // Safety checks for mainnet
    if (currentConfig.environment === 'mainnet' && !options.force) {
      console.log(chalk.red('\n⚠️  MAINNET ENVIRONMENT DETECTED'));
      console.log(chalk.red('Switching MCP servers on mainnet requires explicit confirmation.'));
      console.log(chalk.yellow('Use --force flag to proceed with mainnet server switch.'));
      process.exit(1);
    }

    // Create backup if requested or if switching from mainnet
    if (options.backup || currentConfig.environment === 'mainnet') {
      console.log(chalk.yellow('💾 Creating configuration backup...'));
      await saisoConfig.migrateToMcpServer(projectRoot, currentServerType);
      console.log(chalk.green('✅ Backup created successfully'));
    }

    // Perform the migration
    console.log(chalk.yellow(`🔄 Migrating to ${targetServerType.toUpperCase()} MCP server...`));
    await saisoConfig.migrateToMcpServer(projectRoot, targetServerType);

    // Verify the switch
    const newConfig = saisoConfig.loadConfig(undefined, projectRoot);
    if (newConfig.mcpServer.type === targetServerType) {
      console.log(chalk.green(`\n✅ Successfully switched to ${targetServerType.toUpperCase()} MCP server!`));

      // Show next steps
      console.log(chalk.cyan('\n📋 Next Steps:'));
      console.log(chalk.gray('  1. Run: bun install (to update dependencies)'));
      console.log(chalk.gray('  2. Run: saiso config --validate (to verify configuration)'));
      console.log(chalk.gray('  3. Run: saiso dev (to test the new server)'));

      // Server-specific tips
      if (targetServerType === 'evm') {
        console.log(chalk.cyan('\n💡 EVM Server Tips:'));
        console.log(chalk.gray('  • Supports 30+ EVM networks'));
        console.log(chalk.gray('  • Includes ENS resolution and NFT support'));
        console.log(chalk.gray('  • Advanced multi-token standards'));
      } else if (targetServerType === 'svm') {
        console.log(chalk.cyan('\n💡 SVM Server Tips:'));
        console.log(chalk.gray('  • Optimized for Solana/SVM workflows'));
        console.log(chalk.gray('  • Supports high-throughput transaction pipelines'));
        console.log(chalk.gray('  • Use devnet first for safety'));
      }
    } else {
      console.log(chalk.red('\n❌ Server switch verification failed'));
      process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Server switch failed:'));
    console.error(chalk.red(`  ${error instanceof Error ? error.message : error}`));

    if (options.backup) {
      console.log(chalk.yellow('\n💡 Configuration backup was created before the failure.'));
      console.log(chalk.gray('You can restore from backup if needed.'));
    }

    process.exit(1);
  }
}

async function showServerStatus(projectRoot: string): Promise<void> {
  console.log(chalk.cyan('📊 MCP Server Status\n'));

  try {
    const config = saisoConfig.loadConfig(undefined, projectRoot);
    const serverType = config.mcpServer.type;
    const serverMode = config.mcpServer.mode;

    console.log(chalk.yellow('🔧 Current Configuration:'));
    console.log(chalk.gray(`  Server Type: ${serverType.toUpperCase()}`));
    console.log(chalk.gray(`  Server Mode: ${serverMode}`));
    console.log(chalk.gray(`  Environment: ${config.environment}`));
    console.log(chalk.gray(`  Network: ${config.network}`));

    // Server-specific information
    if (serverType === 'svm') {
      const svmConfig = config.mcpServer.config as any;
      console.log(chalk.yellow('\n☀️ SVM Server Details:'));
      console.log(chalk.gray(`  Network: ${svmConfig.network || 'Unknown'}`));
      console.log(chalk.gray(`  Chain ID: ${svmConfig.chainId || 'Unknown'}`));
      console.log(chalk.gray(`  Port: ${svmConfig.port || 'Unknown'}`));
      console.log(chalk.gray(`  Host: ${svmConfig.host || 'Unknown'}`));
      console.log(chalk.gray(`  Commitment: ${svmConfig.commitment || 'confirmed'}`));
    } else {
      const evmConfig = config.mcpServer.config as any;
      console.log(chalk.yellow('\n⚡ EVM Server Details:'));
      console.log(chalk.gray(`  Network: ${evmConfig.network || 'Unknown'}`));
      console.log(chalk.gray(`  Chain ID: ${evmConfig.chainId || 'Unknown'}`));
      console.log(chalk.gray(`  Port: ${evmConfig.port || 'Unknown'}`));
      console.log(chalk.gray(`  Host: ${evmConfig.host || 'Unknown'}`));
    }

    // Validation
    const validation = saisoConfig.validateConfig(config);
    const mcpValidation = saisoConfig.validateMcpServerConfig(config.mcpServer);

    console.log(chalk.yellow('\n🔍 Configuration Status:'));
    if (validation.valid && mcpValidation.valid) {
      console.log(chalk.green('✅ Configuration is valid'));
    } else {
      console.log(chalk.red('❌ Configuration has issues:'));
      [...validation.errors, ...mcpValidation.errors].forEach(error => {
        console.log(chalk.red(`  • ${error}`));
      });
    }

    if (validation.warnings.length > 0 || mcpValidation.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Warnings:'));
      [...validation.warnings, ...mcpValidation.warnings].forEach(warning => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to get server status:'));
    console.error(chalk.red(`  ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}

export const switchServerCommand = new Command('switch-server')
  .description('Switch between MCP server types (EVM/SVM)')
  .argument('<server-type>', 'Target server type (evm or svm)')
  .option('--backup', 'Create configuration backup before switching')
  .option('--dry-run', 'Show planned changes without applying them')
  .option('--force', 'Force switch without confirmation prompts')
  .option('--status', 'Show current server status and configuration')
  .action(async (serverType: string, options) => {
    try {
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error(chalk.red('❌ Not in a SAISO project directory'));
        process.exit(1);
      }

      // Show status if requested
      if (options.status) {
        await showServerStatus(projectRoot);
        return;
      }

      // Validate server type
      if (!isValidServerType(serverType)) {
        console.error(chalk.red('❌ Invalid server type. Must be "evm" or "svm"'));
        process.exit(1);
      }

      // Perform server switch
      await switchMcpServer(projectRoot, serverType as McpServerType, {
        backup: options.backup,
        dryRun: options.dryRun,
        force: options.force,
      });

    } catch (error) {
      console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
