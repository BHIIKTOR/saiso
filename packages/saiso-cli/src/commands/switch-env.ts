import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { saisoConfig, findProjectRoot, type SaisoEnvironment } from '../core/index.js';

export function isValidEnvironment(env: string): env is SaisoEnvironment {
  return ['testnet', 'mainnet', 'devnet'].includes(env);
}

export const switchEnvCommand = new Command('switch-env')
  .description('Switch between environments (testnet, mainnet, devnet)')
  .argument('<environment>', 'Target environment (testnet, mainnet, devnet)')
  .option('--backup', 'Create backup of current environment before switching')
  .option('--dry-run', 'Show what would be changed without making changes')
  .option('--force', 'Skip safety checks and force the switch')
  .action(async (environment: string, options) => {
    try {
      // Validate environment
      if (!isValidEnvironment(environment)) {
        console.error(chalk.red('❌ Invalid environment. Must be one of: testnet, mainnet, devnet'));
        process.exit(1);
      }

      // Find project root
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error(chalk.red('❌ Not in a SAISO project directory'));
        console.error(chalk.gray('Run this command from within a SAISO project'));
        process.exit(1);
      }

      console.log(chalk.cyan(`🔄 Switching to ${environment} environment...\n`));

      // Check if target environment file exists
      const targetEnvFile = path.join(projectRoot, `.env.${environment}`);
      if (!existsSync(targetEnvFile)) {
        console.error(chalk.red(`❌ Environment file not found: .env.${environment}`));
        console.error(chalk.gray('Available environment files:'));

        const envFiles = ['testnet', 'mainnet', 'devnet']
          .map(env => `.env.${env}`)
          .filter(file => existsSync(path.join(projectRoot, file)));

        if (envFiles.length === 0) {
          console.error(chalk.gray('  No environment files found'));
          console.error(chalk.yellow('\n💡 Create environment files using: saiso config --wizard'));
        } else {
          for (const file of envFiles) {
            console.error(chalk.gray(`  ✓ ${file}`));
          }
        }
        process.exit(1);
      }

      // Get current environment
      const currentEnvFile = path.join(projectRoot, '.env');
      let currentEnvironment: string | null = null;

      if (existsSync(currentEnvFile)) {
        const currentContent = readFileSync(currentEnvFile, 'utf-8');
        const envMatch = currentContent.match(/SAISO_ENVIRONMENT=(\w+)/);
        currentEnvironment = envMatch ? envMatch[1] : null;
      }

      // Check if already on target environment
      if (currentEnvironment === environment) {
        console.log(chalk.yellow(`⚠️  Already on ${environment} environment`));
        return;
      }

      // Load and validate target configuration
      console.log(chalk.gray('📋 Validating target environment...'));

      try {
        const targetConfig = saisoConfig.loadConfig(environment as SaisoEnvironment, projectRoot);
        const validation = saisoConfig.validateConfig(targetConfig);

        if (!validation.valid) {
          console.error(chalk.red('❌ Target environment configuration is invalid:'));
          for (const error of validation.errors) {
            console.error(chalk.red(`  • ${error}`));
          }

          if (!options.force) {
            console.error(chalk.yellow('\n💡 Fix the configuration or use --force to skip validation'));
            process.exit(1);
          } else {
            console.log(chalk.yellow('⚠️  Forcing switch despite validation errors'));
          }
        }

        // Note: CLI config system doesn't have warnings, only errors

        // Show configuration summary
        console.log(chalk.gray('\n📊 Target configuration:'));
        console.log(chalk.gray(`  Network: ${targetConfig.network}`));
        console.log(chalk.gray(`  Chain ID: ${targetConfig.chainId}`));
        console.log(chalk.gray(`  RPC URL: ${targetConfig.rpcUrl}`));
        if (targetConfig.privateKey) {
          console.log(chalk.gray(`  Private Key: ${targetConfig.privateKey.slice(0, 6)}...${targetConfig.privateKey.slice(-4)}`));
        }

      } catch (error) {
        console.error(chalk.red('❌ Failed to load target environment configuration:'));
        console.error(chalk.red(`  ${error instanceof Error ? error.message : error}`));

        if (!options.force) {
          process.exit(1);
        } else {
          console.log(chalk.yellow('⚠️  Forcing switch despite configuration errors'));
        }
      }

      // Safety checks for mainnet
      if (environment === 'mainnet' && !options.force) {
        console.log(chalk.red('\n⚠️  MAINNET ENVIRONMENT DETECTED'));
        console.log(chalk.yellow('This will switch to production environment with real funds.'));
        console.log(chalk.yellow('Make sure you understand the implications.'));

        // In a real implementation, you might want to add a confirmation prompt here
        // For now, we'll just show the warning
        console.log(chalk.gray('Use --force to skip this warning'));
      }

      // Dry run mode
      if (options.dryRun) {
        console.log(chalk.cyan('\n🔍 DRY RUN - No changes will be made:'));
        console.log(chalk.gray(`  Would copy: .env.${environment} → .env`));
        if (options.backup && currentEnvironment) {
          console.log(chalk.gray(`  Would backup: .env → .env.backup.${currentEnvironment}.${Date.now()}`));
        }
        console.log(chalk.green('\n✅ Dry run completed successfully'));
        return;
      }

      // Create backup if requested or if switching from mainnet
      if (options.backup || currentEnvironment === 'mainnet') {
        if (existsSync(currentEnvFile)) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupFile = path.join(projectRoot, `.env.backup.${currentEnvironment || 'unknown'}.${timestamp}`);

          console.log(chalk.gray(`💾 Creating backup: ${path.basename(backupFile)}`));
          copyFileSync(currentEnvFile, backupFile);
          console.log(chalk.green('✅ Backup created successfully'));
        }
      }

      // Perform the switch
      console.log(chalk.gray('🔄 Switching environment files...'));
      copyFileSync(targetEnvFile, currentEnvFile);

      // Verify the switch
      console.log(chalk.gray('🔍 Verifying environment switch...'));
      try {
        const newConfig = saisoConfig.loadConfig(undefined, projectRoot);
        if (newConfig.network === environment) {
          console.log(chalk.green(`✅ Successfully switched to ${environment} environment`));

          // Show current configuration
          console.log(chalk.cyan('\n📋 Current configuration:'));
          console.log(chalk.gray(`  Environment: ${newConfig.network}`));
          console.log(chalk.gray(`  Network: ${newConfig.network}`));
          console.log(chalk.gray(`  Chain ID: ${newConfig.chainId}`));
          console.log(chalk.gray(`  RPC URL: ${newConfig.rpcUrl}`));

          // Environment-specific tips
          if (environment === 'testnet') {
            console.log(chalk.cyan('\n💡 Testnet Tips:'));
            console.log(chalk.gray('  • Use faucets to get test tokens'));
            console.log(chalk.gray('  • Transactions are free but may be slower'));
            console.log(chalk.gray('  • Perfect for development and testing'));
          } else if (environment === 'mainnet') {
            console.log(chalk.red('\n⚠️  Mainnet Warnings:'));
            console.log(chalk.yellow('  • All transactions use real funds'));
            console.log(chalk.yellow('  • Double-check all operations'));
            console.log(chalk.yellow('  • Consider using lower gas multipliers'));
          } else if (environment === 'devnet') {
            console.log(chalk.cyan('\n💡 Devnet Tips:'));
            console.log(chalk.gray('  • Latest features and updates'));
            console.log(chalk.gray('  • May be unstable or reset frequently'));
            console.log(chalk.gray('  • Great for testing new functionality'));
          }

        } else {
          throw new Error(`Environment verification failed. Expected ${environment}, got ${newConfig.network}`);
        }
      } catch (error) {
        console.error(chalk.red('❌ Environment switch verification failed:'));
        console.error(chalk.red(`  ${error instanceof Error ? error.message : error}`));

        // Attempt to restore backup if available
        const backupFiles = readdirSync(projectRoot)
          .filter((file: string) => file.startsWith('.env.backup.'))
          .sort()
          .reverse();

        if (backupFiles.length > 0) {
          console.log(chalk.yellow(`🔄 Attempting to restore from backup: ${backupFiles[0]}`));
          try {
            copyFileSync(path.join(projectRoot, backupFiles[0]), currentEnvFile);
            console.log(chalk.green('✅ Backup restored successfully'));
          } catch (restoreError) {
            console.error(chalk.red('❌ Failed to restore backup'));
          }
        }

        process.exit(1);
      }

      console.log(chalk.green('\n🎉 Environment switch completed successfully!'));
      console.log(chalk.gray('You can now run your agent with the new environment settings.'));

    } catch (error) {
      console.error(chalk.red('❌ Environment switch failed:'));
      console.error(chalk.red(`  ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });
