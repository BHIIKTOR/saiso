import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { saisoConfig, findProjectRoot, isSaisoProject } from '../core/index.js';
import { createMcpOrchestrator } from '@saiso/core';

export const healthCommand = new Command('health')
  .description('Perform detailed health check and network connectivity testing')
  .option('--env <environment>', 'Target environment (testnet, mainnet, devnet)')
  .option('--network-test', 'Test network connectivity and performance')
  .action(async (options) => {
    try {
      console.log(chalk.cyan('\n🏥 SAISO Health Check\n'));

      // Find project root
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error(chalk.red('❌ Not in a SAISO project directory'));
        console.error(chalk.gray('Run this command from within a SAISO project or use "saiso new" to create one'));
        process.exit(1);
      }

      // Verify it's a SAISO project
      if (!(await isSaisoProject(projectRoot))) {
        console.error(chalk.red('❌ Current directory is not a valid SAISO project'));
        process.exit(1);
      }

      console.log(chalk.gray(`📁 Project: ${projectRoot}`));

      // Load configuration
      const config = saisoConfig.loadConfig(options.env, projectRoot);
      console.log(chalk.gray(`🌐 Environment: ${config.environment}`));
      console.log(chalk.gray(`🔗 Network: ${config.network}\n`));

      let healthScore = 0;
      let totalChecks = 0;

      // 1. Configuration Validation
      console.log(chalk.bold('1️⃣ Configuration Validation'));
      const configSpinner = ora('Validating configuration...').start();
      totalChecks++;

      try {
        const validation = saisoConfig.validateConfig(config);

        if (validation.valid) {
          configSpinner.succeed('Configuration is valid');
          console.log(chalk.green('   ✅ All required fields are present and valid'));
          healthScore++;
        } else {
          configSpinner.fail('Configuration validation failed');
          console.log(chalk.red('   ❌ Configuration errors found:'));
          for (const error of validation.errors) {
            console.log(chalk.red(`      • ${error}`));
          }
        }

        if (validation.warnings && validation.warnings.length > 0) {
          console.log(chalk.yellow('   ⚠️  Configuration warnings:'));
          for (const warning of validation.warnings) {
            console.log(chalk.yellow(`      • ${warning}`));
          }
        }
      } catch (error) {
        configSpinner.fail('Configuration validation error');
        console.log(chalk.red(`   ❌ Error: ${error instanceof Error ? error.message : error}`));
      }

      // 2. Network Connectivity Test
      if (options.networkTest) {
        console.log(chalk.bold('\n2️⃣ Network Connectivity Test'));
        const networkSpinner = ora('Testing RPC connectivity...').start();
        totalChecks++;

        try {
          const startTime = Date.now();
          const response = await fetch(config.rpcUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_chainId',
              params: [],
              id: 1,
            }),
            signal: AbortSignal.timeout(10000),
          });

          const latency = Date.now() - startTime;

          if (response.ok) {
            const data = await response.json();
            const chainId = parseInt(data.result, 16);

            if (chainId === config.chainId) {
              networkSpinner.succeed(`RPC connectivity successful (${latency}ms)`);
              console.log(chalk.green(`   ✅ Connected to ${config.rpcUrl}`));
              console.log(chalk.green(`   ✅ Chain ID matches: ${chainId}`));
              console.log(chalk.green(`   ✅ Response time: ${latency}ms`));

              if (latency < 1000) {
                console.log(chalk.green('   ✅ Excellent response time'));
              } else if (latency < 3000) {
                console.log(chalk.yellow('   ⚠️  Moderate response time'));
              } else {
                console.log(chalk.red('   ❌ Slow response time'));
              }

              healthScore++;
            } else {
              networkSpinner.fail('Chain ID mismatch');
              console.log(chalk.red(`   ❌ Expected chain ID: ${config.chainId}`));
              console.log(chalk.red(`   ❌ Received chain ID: ${chainId}`));
            }
          } else {
            networkSpinner.fail(`RPC request failed (${response.status})`);
            console.log(chalk.red(`   ❌ HTTP ${response.status}: ${response.statusText}`));
          }
        } catch (error) {
          networkSpinner.fail('Network connectivity test failed');
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              console.log(chalk.red('   ❌ Request timeout (>10s)'));
            } else {
              console.log(chalk.red(`   ❌ Network error: ${error.message}`));
            }
          } else {
            console.log(chalk.red(`   ❌ Unknown error: ${error}`));
          }
        }
      }

      // 3. MCP Server Health Check
      console.log(chalk.bold('\n3️⃣ MCP Server Health Check'));
      const mcpSpinner = ora('Checking MCP server health...').start();
      totalChecks++;

      try {
        const mcpOrchestrator = createMcpOrchestrator(config);
        const serverType = config.mcpServer.type;

        console.log(chalk.gray(`   Server Type: ${serverType.toUpperCase()}`));

        const currentStatus = mcpOrchestrator.getStatus();

        if (currentStatus?.running) {
          const healthCheck = await mcpOrchestrator.healthCheck();

          if (healthCheck.healthy) {
            mcpSpinner.succeed(`MCP server is healthy (${healthCheck.latency}ms)`);
            console.log(chalk.green('   ✅ Server is running and responsive'));
            console.log(chalk.green(`   ✅ Health check latency: ${healthCheck.latency}ms`));
            healthScore++;
          } else {
            mcpSpinner.fail('MCP server health check failed');
            console.log(chalk.red(`   ❌ Server is unhealthy: ${healthCheck.error || 'Unknown error'}`));
          }
        } else {
          mcpSpinner.succeed('MCP server status checked');
          console.log(chalk.yellow('   ⚠️  MCP server is not currently running'));
          console.log(chalk.gray('   💡 Use "saiso dev" to start the development environment'));
        }
      } catch (error) {
        mcpSpinner.fail('MCP server health check error');
        console.log(chalk.red(`   ❌ Error: ${error instanceof Error ? error.message : error}`));
      }

      // 4. Server Capabilities Check
      console.log(chalk.bold('\n4️⃣ Server Capabilities Check'));
      const capabilitiesSpinner = ora('Checking server capabilities...').start();
      totalChecks++;

      try {
        const mcpOrchestrator = createMcpOrchestrator(config);
        const capabilities = mcpOrchestrator.getCapabilities();

        capabilitiesSpinner.succeed('Server capabilities checked');
        console.log(chalk.green(`   ✅ ${capabilities.tools.length} tools available`));
        console.log(chalk.green(`   ✅ ${capabilities.networks.length} networks supported`));

        // Check if current network is supported
        const isNetworkSupported = mcpOrchestrator.isNetworkSupported(config.network);
        if (isNetworkSupported) {
          console.log(chalk.green(`   ✅ Current network (${config.network}) is supported`));
        } else {
          console.log(chalk.red(`   ❌ Current network (${config.network}) is not supported`));
        }

        // Show feature support
        const features = capabilities.features;
        console.log(chalk.gray('   Feature Support:'));
        console.log(chalk.gray(`     • ENS: ${features.ensSupport ? '✅' : '❌'}`));
        console.log(chalk.gray(`     • NFT: ${features.nftSupport ? '✅' : '❌'}`));
        console.log(chalk.gray(`     • Multi-Token: ${features.multiTokenSupport ? '✅' : '❌'}`));
        console.log(chalk.gray(`     • Contract Interaction: ${features.contractInteraction ? '✅' : '❌'}`));
        console.log(chalk.gray(`     • Gas Estimation: ${features.gasEstimation ? '✅' : '❌'}`));

        healthScore++;
      } catch (error) {
        capabilitiesSpinner.fail('Server capabilities check failed');
        console.log(chalk.red(`   ❌ Error: ${error instanceof Error ? error.message : error}`));
      }

      // 5. Environment-Specific Checks
      console.log(chalk.bold('\n5️⃣ Environment-Specific Checks'));
      const envSpinner = ora('Performing environment checks...').start();
      totalChecks++;

      try {
        if (config.environment === 'mainnet') {
          if (config.privateKey) {
            console.log(chalk.green('   ✅ Private key configured for mainnet'));
          } else {
            console.log(chalk.red('   ❌ Private key required for mainnet operations'));
          }

          console.log(chalk.yellow('   ⚠️  MAINNET WARNING: Real funds at risk'));
          console.log(chalk.yellow('   ⚠️  Double-check all transactions before execution'));
        } else {
          console.log(chalk.green(`   ✅ Using ${config.environment} environment (safe for testing)`));

          if (!config.privateKey) {
            console.log(chalk.yellow('   ⚠️  No private key configured - some features may not work'));
          }
        }

        envSpinner.succeed('Environment checks completed');
        healthScore++;
      } catch (error) {
        envSpinner.fail('Environment checks failed');
        console.log(chalk.red(`   ❌ Error: ${error instanceof Error ? error.message : error}`));
      }

      // 6. Payment and Trust Policy Checks
      console.log(chalk.bold('\n6️⃣ Payment and Trust Checks'));
      const policySpinner = ora('Checking payment/trust policies...').start();
      totalChecks++;

      try {
        if (config.payment?.enabled) {
          console.log(chalk.green(`   ✅ Payments enabled (${config.payment.preferredProtocol || 'auto'})`));
        } else {
          console.log(chalk.yellow('   ⚠️  Payments disabled'));
        }

        if (config.trust?.enabled) {
          console.log(chalk.green(`   ✅ Trust policy enabled (min score: ${config.trust.minTrustScore ?? 'none'})`));
        } else {
          console.log(chalk.yellow('   ⚠️  Trust policy disabled'));
        }

        policySpinner.succeed('Payment/trust checks completed');
        healthScore++;
      } catch (error) {
        policySpinner.fail('Payment/trust checks failed');
        console.log(chalk.red(`   ❌ Error: ${error instanceof Error ? error.message : error}`));
      }

      // Health Score Summary
      console.log(chalk.bold('\n📊 Health Score Summary'));
      const percentage = Math.round((healthScore / totalChecks) * 100);

      if (percentage >= 80) {
        console.log(chalk.green(`🎉 Excellent: ${healthScore}/${totalChecks} checks passed (${percentage}%)`));
        console.log(chalk.green('   Your SAISO setup is in great shape!'));
      } else if (percentage >= 60) {
        console.log(chalk.yellow(`⚠️  Good: ${healthScore}/${totalChecks} checks passed (${percentage}%)`));
        console.log(chalk.yellow('   Some issues detected, but mostly functional'));
      } else {
        console.log(chalk.red(`❌ Poor: ${healthScore}/${totalChecks} checks passed (${percentage}%)`));
        console.log(chalk.red('   Multiple issues detected, please review and fix'));
      }

      // Recommendations
      console.log(chalk.bold('\n💡 Recommendations:'));

      if (healthScore < totalChecks) {
        console.log(chalk.gray('   • Review and fix the failed checks above'));
        console.log(chalk.gray('   • Use "saiso config --validate" for configuration help'));
        console.log(chalk.gray('   • Use "saiso dev" to start the development environment'));
      }

      if (!options.networkTest) {
        console.log(chalk.gray('   • Run "saiso health --network-test" for network connectivity testing'));
      }

      console.log(chalk.gray('   • Use "saiso status" for current server status'));
      console.log(chalk.gray('   • Check the documentation for troubleshooting tips'));

    } catch (error) {
      console.error(chalk.red('❌ Unexpected error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
