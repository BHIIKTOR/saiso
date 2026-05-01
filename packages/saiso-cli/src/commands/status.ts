import { Command } from 'commander';
import chalk from 'chalk';
import { saisoConfig, findProjectRoot, isSaisoProject } from '../core/index.js';
import {
  createMcpOrchestrator,
  PaymentReceiptStore,
  deriveReputationDeltaFromReceipt,
  calculateTrustScore,
} from '@saiso/core';
import { summarizePaymentReceipts } from '../core/payment-observability.js';

export const statusCommand = new Command('status')
  .description('Show MCP server status and capabilities')
  .option('--env <environment>', 'Target environment (testnet, mainnet, devnet)')
  .option('--json', 'Output machine-readable JSON', false)
  .action(async (options) => {
    try {
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error(chalk.red('❌ Not in a SAISO project directory'));
        console.error(chalk.gray('Run this command from within a SAISO project or use "saiso new" to create one'));
        process.exit(1);
      }

      if (!(await isSaisoProject(projectRoot))) {
        console.error(chalk.red('❌ Current directory is not a valid SAISO project'));
        process.exit(1);
      }

      const config = saisoConfig.loadConfig(options.env, projectRoot);
      const orchestrator = createMcpOrchestrator(config);
      const capabilities = orchestrator.getCapabilities();
      const currentStatus = orchestrator.getStatus();

      const runtime = {
        running: Boolean(currentStatus?.running),
        pid: currentStatus?.pid || null,
        startedAt: currentStatus?.startTime ? currentStatus.startTime.toISOString() : null,
        health: currentStatus?.health || 'unknown',
        healthCheck: {
          healthy: null as boolean | null,
          latencyMs: null as number | null,
          error: null as string | null,
        },
      };

      if (runtime.running) {
        try {
          const health = await orchestrator.healthCheck();
          runtime.healthCheck.healthy = health.healthy;
          runtime.healthCheck.latencyMs = health.latency ?? null;
          runtime.health = health.healthy ? 'healthy' : 'unhealthy';
        } catch (error) {
          runtime.healthCheck.healthy = false;
          runtime.healthCheck.error = error instanceof Error ? error.message : String(error);
          runtime.health = 'unhealthy';
        }
      }

      const validation = saisoConfig.validateConfig(config);
      const receipts = await new PaymentReceiptStore(projectRoot).readAll(100);
      const paymentSummary = summarizePaymentReceipts(receipts, 5);

      const paymentReliability = paymentSummary.total > 0
        ? paymentSummary.successful / paymentSummary.total
        : 1;
      const reputationDelta = receipts.reduce((sum, receipt) => sum + deriveReputationDeltaFromReceipt(receipt).delta, 0);
      const derivedReputation = Math.max(0, Math.min(1, 0.5 + reputationDelta));
      const validationSignal = typeof config.trust?.minTrustScore === 'number'
        ? config.trust.minTrustScore
        : 0.5;
      const derivedTrustScore = calculateTrustScore({
        reputation: derivedReputation,
        validation: validationSignal,
        paymentReliability,
      });

      const payload = {
        timestamp: new Date().toISOString(),
        projectRoot,
        environment: config.environment,
        network: config.network,
        server: {
          type: config.mcpServer.type,
          mode: config.mcpServer.mode,
          url: config.mcpServerUrl,
          paymentEnabled: Boolean(config.payment?.enabled),
          paymentProtocol: (config.payment?.preferredProtocol || 'auto'),
          trustEnabled: Boolean(config.trust?.enabled),
          minTrustScore: typeof config.trust?.minTrustScore === 'number' ? config.trust.minTrustScore : undefined,
          routingProfile: config.trust?.routingProfile,
          identity: {
            agentId: config.identity?.agentId,
            agentRegistry: config.identity?.agentRegistry,
            agentUri: config.identity?.agentUri,
            endpointCount: config.identity?.endpoints?.length || 0,
          },
        },
        capabilities: {
          toolCount: capabilities.tools.length,
          networkCount: capabilities.networks.length,
          tools: capabilities.tools,
          features: capabilities.features,
        },
        runtime,
        configValidation: {
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings || [],
        },
        payments: {
          inspected: paymentSummary.total,
          successful: paymentSummary.successful,
          failed: paymentSummary.failed,
          byProtocol: paymentSummary.byProtocol,
          recent: paymentSummary.recent,
        },
        trustSignals: {
          paymentReliability,
          derivedReputation,
          derivedTrustScore,
        },
      };

      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(chalk.cyan('\n📊 SAISO MCP Server Status\n'));
      console.log(chalk.gray(`📁 Project: ${payload.projectRoot}`));
      console.log(chalk.gray(`🌐 Environment: ${payload.environment}`));
      console.log(chalk.gray(`🔗 Network: ${payload.network}\n`));

      console.log(chalk.bold('🔧 Server Configuration:'));
      console.log(chalk.cyan(`   Type: ${payload.server.type.toUpperCase()}`));
      console.log(chalk.cyan(`   Mode: ${payload.server.mode}`));
      console.log(chalk.cyan(`   URL: ${payload.server.url}`));
      console.log(chalk.cyan(`   Payment Enabled: ${payload.server.paymentEnabled ? '✅' : '❌'}`));
      console.log(chalk.cyan(`   Payment Protocol: ${payload.server.paymentProtocol.toUpperCase()}`));
      console.log(chalk.cyan(`   Trust Enabled: ${payload.server.trustEnabled ? '✅' : '❌'}`));
      if (typeof payload.server.minTrustScore === 'number') {
        console.log(chalk.cyan(`   Min Trust Score: ${payload.server.minTrustScore}`));
      }
      if (payload.server.routingProfile) {
        console.log(chalk.cyan(`   Routing Profile: ${payload.server.routingProfile}`));
      }
      if (payload.server.identity.agentId || payload.server.identity.agentRegistry || payload.server.identity.agentUri) {
        console.log(chalk.cyan(`   Identity Agent ID: ${payload.server.identity.agentId || 'n/a'}`));
        console.log(chalk.cyan(`   Identity Registry: ${payload.server.identity.agentRegistry || 'n/a'}`));
        console.log(chalk.cyan(`   Identity URI: ${payload.server.identity.agentUri || 'n/a'}`));
      }

      console.log(chalk.bold('\n⚡ Server Capabilities:'));
      console.log(chalk.cyan(`   Tools: ${payload.capabilities.toolCount} available`));
      console.log(chalk.cyan(`   Networks: ${payload.capabilities.networkCount} supported`));
      console.log(chalk.cyan(`   ENS Support: ${payload.capabilities.features.ensSupport ? '✅' : '❌'}`));
      console.log(chalk.cyan(`   NFT Support: ${payload.capabilities.features.nftSupport ? '✅' : '❌'}`));
      console.log(chalk.cyan(`   Multi-Token: ${payload.capabilities.features.multiTokenSupport ? '✅' : '❌'}`));
      console.log(chalk.cyan(`   Contract Interaction: ${payload.capabilities.features.contractInteraction ? '✅' : '❌'}`));
      console.log(chalk.cyan(`   Gas Estimation: ${payload.capabilities.features.gasEstimation ? '✅' : '❌'}`));

      if (payload.capabilities.tools.length > 0) {
        console.log(chalk.bold('\n🛠️  Available Tools:'));
        for (const tool of payload.capabilities.tools) {
          console.log(chalk.gray(`   • ${tool}`));
        }
      }

      console.log(chalk.bold('\n🖥️  Runtime:'));
      console.log(chalk.cyan(`   Running: ${payload.runtime.running ? '✅' : '❌'}`));
      if (payload.runtime.pid) {
        console.log(chalk.cyan(`   PID: ${payload.runtime.pid}`));
      }
      if (payload.runtime.startedAt) {
        console.log(chalk.cyan(`   Started: ${new Date(payload.runtime.startedAt).toLocaleString()}`));
      }
      console.log(chalk.cyan(`   Health: ${payload.runtime.health}`));
      if (payload.runtime.healthCheck.healthy === false && payload.runtime.healthCheck.error) {
        console.log(chalk.yellow(`   Health Check Error: ${payload.runtime.healthCheck.error}`));
      }

      console.log(chalk.bold('\n🔍 Configuration Validation:'));
      if (payload.configValidation.valid) {
        console.log(chalk.green('   ✅ Configuration is valid'));
      } else {
        console.log(chalk.red('   ❌ Configuration has errors:'));
        for (const error of payload.configValidation.errors) {
          console.log(chalk.red(`      • ${error}`));
        }
      }
      if (payload.configValidation.warnings.length > 0) {
        console.log(chalk.yellow('   ⚠️  Configuration warnings:'));
        for (const warning of payload.configValidation.warnings) {
          console.log(chalk.yellow(`      • ${warning}`));
        }
      }

      console.log(chalk.bold('\n💳 Payment Receipts:'));
      console.log(chalk.cyan(`   Total: ${payload.payments.inspected}`));
      console.log(chalk.cyan(`   Successful: ${payload.payments.successful}`));
      console.log(chalk.cyan(`   Failed: ${payload.payments.failed}`));

      console.log(chalk.bold('\n📉 Protocol Failure Signals:'));
      for (const protocol of ['x402', 'mpp'] as const) {
        const bucket = payload.payments.byProtocol[protocol];
        console.log(chalk.cyan(`   ${protocol.toUpperCase()}: ${bucket.failed}/${bucket.total} failed`));
        if (bucket.latestFailureReference) {
          console.log(chalk.yellow(`      Latest failure ref: ${bucket.latestFailureReference}`));
        }
      }

      console.log(chalk.bold('\n🛡️  Derived Trust Signals:'));
      console.log(chalk.cyan(`   Payment Reliability: ${(payload.trustSignals.paymentReliability * 100).toFixed(1)}%`));
      console.log(chalk.cyan(`   Derived Reputation: ${payload.trustSignals.derivedReputation.toFixed(2)}`));
      console.log(chalk.cyan(`   Derived Trust Score: ${payload.trustSignals.derivedTrustScore.toFixed(2)}`));

      console.log(chalk.gray('\n💡 Use "saiso health" for detailed network connectivity testing'));
      console.log(chalk.gray('💡 Use "saiso dev" to start the development environment'));
    } catch (error) {
      console.error(chalk.red('❌ Unexpected error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
