import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { saisoConfig, findProjectRoot, type SaisoEnvironment } from '../core/index.js';

function isValidEnvironment(env: string): env is SaisoEnvironment {
  return ['testnet', 'mainnet', 'devnet'].includes(env);
}

export function resolveWizardEnvironmentOverride(raw: string | undefined): SaisoEnvironment | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  return isValidEnvironment(normalized) ? normalized : undefined;
}

export async function selectWizardEnvironment(defaultEnv: SaisoEnvironment = 'testnet'): Promise<SaisoEnvironment> {
  const override = resolveWizardEnvironmentOverride(process.env.SAISO_WIZARD_ENV);
  if (override) {
    return override;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return defaultEnv;
  }

  const inquirer = await import('inquirer');
  const { selectedEnv } = await inquirer.default.prompt([
    {
      type: 'list',
      name: 'selectedEnv',
      message: 'Target environment:',
      choices: [
        { name: 'testnet - For development and testing (recommended)', value: 'testnet' },
        { name: 'mainnet - For production use (real funds)', value: 'mainnet' },
        { name: 'devnet - For latest features (may be unstable)', value: 'devnet' },
      ],
      default: defaultEnv,
    },
  ]);

  return selectedEnv as SaisoEnvironment;
}

export function getWizardEnvFilePath(projectRoot: string, environment: SaisoEnvironment): string {
  return path.join(projectRoot, `.env.${environment}`);
}

async function testNetworkConnectivity(rpcUrl: string): Promise<{ success: boolean; latency?: number; error?: string }> {
  try {
    const startTime = Date.now();
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return { success: true, latency };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function runInteractiveWizard(projectRoot: string): Promise<void> {
  console.log(chalk.cyan('🧙 SAISO Configuration Wizard\n'));
  console.log(chalk.gray('This wizard will help you set up your SAISO project configuration.\n'));

  const forcedEnv = resolveWizardEnvironmentOverride(process.env.SAISO_WIZARD_ENV);
  if (forcedEnv) {
    console.log(chalk.yellow(`1. Environment override detected from SAISO_WIZARD_ENV: ${forcedEnv}`));
  } else {
    console.log(chalk.yellow('1. Select Environment:'));
  }
  const selectedEnv = await selectWizardEnvironment('testnet');
  if (!forcedEnv && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    console.log(chalk.yellow('⚠️  Non-interactive terminal detected. Falling back to testnet.'));
  }
  console.log(chalk.green(`✅ Selected: ${selectedEnv}\n`));

  // Network configuration
  console.log(chalk.yellow('2. Network Configuration:'));
  const envConfig = saisoConfig.loadConfig(selectedEnv, projectRoot);

  console.log(chalk.gray(`  Network: ${envConfig.network}`));
  console.log(chalk.gray(`  RPC URL: ${envConfig.rpcUrl}`));
  console.log(chalk.gray(`  Chain ID: ${envConfig.chainId}`));

  // Test network connectivity
  console.log(chalk.yellow('\n3. Testing Network Connectivity...'));
  const connectivityTest = await testNetworkConnectivity(envConfig.rpcUrl);

  if (connectivityTest.success) {
    console.log(chalk.green(`✅ Network connection successful (${connectivityTest.latency}ms)`));
  } else {
    console.log(chalk.red(`❌ Network connection failed: ${connectivityTest.error}`));
    console.log(chalk.yellow('⚠️  You may need to configure a different RPC URL'));
  }

  // Agent configuration
  console.log(chalk.yellow('\n4. Agent Configuration:'));
  const agentName = envConfig.agentName || 'MyAgent';
  console.log(chalk.gray(`  Agent Name: ${agentName}`));
  console.log(chalk.gray(`  Log Level: ${envConfig.logLevel}`));
  console.log(chalk.gray(`  Debug Mode: ${envConfig.debug ? 'enabled' : 'disabled'}`));

  // Security configuration
  console.log(chalk.yellow('\n5. Security Configuration:'));
  if (envConfig.privateKey) {
    console.log(chalk.green('✅ Private key configured'));
    console.log(chalk.gray(`  Key: ${envConfig.privateKey.slice(0, 6)}...${envConfig.privateKey.slice(-4)}`));
  } else {
    console.log(chalk.yellow('⚠️  No private key configured'));
    console.log(chalk.gray('  Some features may not work without a private key'));
  }

  // Generate environment file
  console.log(chalk.yellow('\n6. Generating Environment File...'));
  const envTemplate = saisoConfig.generateEnvTemplate(selectedEnv);
  const envFilePath = getWizardEnvFilePath(projectRoot, selectedEnv);

  if (existsSync(envFilePath)) {
    console.log(chalk.yellow(`⚠️  Environment file already exists: .env.${selectedEnv}`));
    console.log(chalk.gray('  Skipping file generation to preserve existing configuration'));
  } else {
    writeFileSync(envFilePath, envTemplate);
    console.log(chalk.green(`✅ Created environment file: .env.${selectedEnv}`));
  }

  // Summary and next steps
  console.log(chalk.cyan('\n🎉 Configuration Wizard Complete!\n'));
  console.log(chalk.yellow('Next Steps:'));
  console.log(chalk.gray(`  1. Edit .env.${selectedEnv} to add your private key`));
  console.log(chalk.gray(`  2. Run: saiso switch-env ${selectedEnv}`));
  console.log(chalk.gray('  3. Run: saiso dev to start your agent'));

  if (selectedEnv === 'testnet') {
    console.log(chalk.cyan('\n💡 Testnet Tips:'));
    console.log(chalk.gray('  • Use a faucet matching your selected network (for example Sepolia/Base Sepolia/Solana Devnet faucets)'));
    console.log(chalk.gray('  • Transactions are free but may be slower'));
    console.log(chalk.gray('  • Perfect for development and testing'));
  }
}

async function validateEnvironmentConfig(env: SaisoEnvironment, projectRoot: string): Promise<void> {
  console.log(chalk.cyan(`🔍 Validating ${env} environment configuration...\n`));

  try {
    // Load configuration
    const config = saisoConfig.loadConfig(env, projectRoot);
    const validation = saisoConfig.validateConfig(config);

    // Basic validation
    console.log(chalk.yellow('📋 Configuration Validation:'));
    if (validation.valid) {
      console.log(chalk.green('✅ Configuration is valid'));
    } else {
      console.log(chalk.red('❌ Configuration has errors:'));
      for (const error of validation.errors) {
        console.log(chalk.red(`  • ${error}`));
      }
    }

    // Network connectivity test
    console.log(chalk.yellow('\n🌐 Network Connectivity Test:'));
    const connectivityTest = await testNetworkConnectivity(config.rpcUrl);

    if (connectivityTest.success) {
      console.log(chalk.green('✅ RPC connection successful'));
      console.log(chalk.gray(`  Latency: ${connectivityTest.latency}ms`));
      console.log(chalk.gray(`  Endpoint: ${config.rpcUrl}`));
    } else {
      console.log(chalk.red('❌ RPC connection failed'));
      console.log(chalk.red(`  Error: ${connectivityTest.error}`));
      console.log(chalk.yellow('  Try using a different RPC endpoint'));
    }

    // Chain ID verification
    console.log(chalk.yellow('\n🔗 Chain ID Verification:'));
    try {
      const response = await fetch(config.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 1,
        }),
      });

      const data = await response.json();
      if (data.result) {
        const actualChainId = Number.parseInt(data.result, 16);
        if (actualChainId === config.chainId) {
          console.log(chalk.green(`✅ Chain ID matches: ${config.chainId}`));
        } else {
          console.log(chalk.red(`❌ Chain ID mismatch:`));
          console.log(chalk.red(`  Expected: ${config.chainId}`));
          console.log(chalk.red(`  Actual: ${actualChainId}`));
        }
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not verify chain ID'));
    }

    // Security check
    console.log(chalk.yellow('\n🔐 Security Configuration:'));
    if (config.privateKey) {
      console.log(chalk.green('✅ Private key configured'));

      // Validate private key format
      const cleanKey = config.privateKey.startsWith('0x') ? config.privateKey.slice(2) : config.privateKey;
      if (cleanKey.length === 64 && /^[0-9a-fA-F]+$/.test(cleanKey)) {
        console.log(chalk.green('✅ Private key format is valid'));
      } else {
        console.log(chalk.red('❌ Private key format is invalid'));
      }
    } else {
      if (env === 'mainnet') {
        console.log(chalk.red('❌ Private key is required for mainnet'));
      } else {
        console.log(chalk.yellow('⚠️  No private key configured'));
        console.log(chalk.gray('  Some features may not work'));
      }
    }

    // Environment-specific checks
    if (env === 'mainnet') {
      console.log(chalk.yellow('\n⚠️  Mainnet Environment Warnings:'));
      console.log(chalk.red('  • All transactions use real funds'));
      console.log(chalk.red('  • Double-check all operations'));
      console.log(chalk.red('  • Consider using lower gas multipliers'));

      if (config.debug) {
        console.log(chalk.yellow('  • Debug mode is enabled (consider disabling for production)'));
      }
    }

    console.log(chalk.cyan('\n✅ Environment validation complete!'));

  } catch (error) {
    console.error(chalk.red('❌ Validation failed:'));
    console.error(chalk.red(`  ${error instanceof Error ? error.message : error}`));
  }
}

export const configCommand = new Command('config')
  .description('Manage project configuration')
  .option('--env <environment>', 'Target environment (testnet, mainnet, devnet)')
  .option('--set <key=value>', 'Set configuration value')
  .option('--get <key>', 'Get configuration value')
  .option('--list', 'List all configuration values')
  .option('--wizard', 'Run interactive configuration wizard')
  .option('--validate', 'Validate environment configuration')
  .option('--test-network', 'Test network connectivity')
  .action(async (options) => {
    try {
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error(chalk.red('❌ Not in a SAISO project directory'));
        process.exit(1);
      }

      // Interactive wizard
      if (options.wizard) {
        await runInteractiveWizard(projectRoot);
        return;
      }

      // Environment validation
      if (options.validate) {
        const env = options.env || 'testnet';
        if (!isValidEnvironment(env)) {
          console.error(chalk.red('❌ Invalid environment. Must be one of: testnet, mainnet, devnet'));
          process.exit(1);
        }
        await validateEnvironmentConfig(env as SaisoEnvironment, projectRoot);
        return;
      }

      // Network connectivity test
      if (options.testNetwork) {
        const config = saisoConfig.loadConfig(options.env, projectRoot);
        console.log(chalk.cyan(`🌐 Testing network connectivity to ${config.rpcUrl}...\n`));

        const result = await testNetworkConnectivity(config.rpcUrl);
        if (result.success) {
          console.log(chalk.green(`✅ Connection successful (${result.latency}ms)`));
        } else {
          console.log(chalk.red(`❌ Connection failed: ${result.error}`));
          process.exit(1);
        }
        return;
      }

      // Set configuration value
      if (options.set) {
        const [key, value] = options.set.split('=');
        if (!key || value === undefined) {
          console.error(chalk.red('❌ Invalid format. Use: --set KEY=VALUE'));
          process.exit(1);
        }

        await saisoConfig.setConfigValue(key, value, options.env, projectRoot);
        console.log(chalk.green(`✅ Set ${key}=${value}`));
        return;
      }

      // Get configuration value
      if (options.get) {
        const config = saisoConfig.loadConfig(options.env, projectRoot);
        const value = config[options.get as keyof typeof config];
        if (value !== undefined) {
          console.log(value);
        } else {
          console.error(chalk.red(`❌ Configuration key '${options.get}' not found`));
          process.exit(1);
        }
        return;
      }

      // List all configuration (default behavior)
      const config = saisoConfig.loadConfig(options.env, projectRoot);
      const validation = saisoConfig.validateConfig(config);

      console.log(chalk.cyan('📋 Current Configuration:\n'));
      console.log(chalk.gray(`Environment: ${config.environment}`));
      console.log(chalk.gray(`Network: ${config.network}`));
      console.log(chalk.gray(`RPC URL: ${config.rpcUrl}`));
      console.log(chalk.gray(`Chain ID: ${config.chainId}`));
      console.log(chalk.gray(`MCP Server: ${config.mcpServerUrl}`));
      console.log(chalk.gray(`Agent Name: ${config.agentName}`));
      console.log(chalk.gray(`Log Level: ${config.logLevel}`));
      console.log(chalk.gray(`Debug Mode: ${config.debug ? 'enabled' : 'disabled'}`));
      console.log(chalk.gray(`Payments: ${config.payment?.enabled ? `enabled (${config.payment.preferredProtocol || 'auto'})` : 'disabled'}`));
      console.log(chalk.gray(`Trust: ${config.trust?.enabled ? `enabled (min=${config.trust.minTrustScore ?? 'n/a'})` : 'disabled'}`));
      if (config.identity?.agentId || config.identity?.agentRegistry || config.identity?.agentUri) {
        console.log(chalk.gray(`Identity Agent ID: ${config.identity.agentId || 'n/a'}`));
        console.log(chalk.gray(`Identity Registry: ${config.identity.agentRegistry || 'n/a'}`));
      }

      if (config.privateKey) {
        console.log(chalk.gray(`Private Key: ${config.privateKey.slice(0, 6)}...${config.privateKey.slice(-4)}`));
      } else {
        console.log(chalk.yellow('Private Key: not configured'));
      }

      // Show validation status
      console.log(chalk.cyan('\n🔍 Configuration Status:'));
      if (validation.valid) {
        console.log(chalk.green('✅ Configuration is valid'));
      } else {
        console.log(chalk.red('❌ Configuration has issues:'));
        for (const error of validation.errors) {
          console.log(chalk.red(`  • ${error}`));
        }
      }

      // Show helpful commands
      console.log(chalk.cyan('\n💡 Helpful Commands:'));
      console.log(chalk.gray('  saiso config --wizard          # Run configuration wizard'));
      console.log(chalk.gray('  saiso config --validate         # Validate configuration'));
      console.log(chalk.gray('  saiso config --test-network     # Test network connectivity'));
      console.log(chalk.gray('  saiso config --set KEY=VALUE    # Set configuration value'));

    } catch (error) {
      console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
