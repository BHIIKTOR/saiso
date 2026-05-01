import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { saisoConfig, logger, findProjectRoot, isDockerAvailable, isSaisoProject } from '../core/index.js';
import { createMcpOrchestrator, type McpServerOrchestrator } from '@saiso/core';

type PackageScripts = Record<string, string>;

const RECURSIVE_DEV_SCRIPT_PATTERNS = [
  /\bsaiso\s+dev\b/i,
  /\bbun\s+run\s+dev\b/i,
  /\bnpm\s+run\s+dev\b/i,
  /\bpnpm\s+run\s+dev\b/i,
  /\byarn\s+dev\b/i,
];

function isRecursiveDevScript(script: string): boolean {
  return RECURSIVE_DEV_SCRIPT_PATTERNS.some((pattern) => pattern.test(script));
}

async function loadPackageScripts(projectRoot: string): Promise<PackageScripts> {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const raw = await readFile(packageJsonPath, 'utf-8');
  const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };
  const scripts = parsed.scripts || {};

  const out: PackageScripts = {};
  for (const [key, value] of Object.entries(scripts)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

async function resolveAgentLaunchScript(projectRoot: string): Promise<'agent:dev' | 'start'> {
  const scripts = await loadPackageScripts(projectRoot);
  const agentDev = scripts['agent:dev'];
  if (agentDev && agentDev.trim()) {
    if (isRecursiveDevScript(agentDev)) {
      throw new Error(
        "Invalid package.json script 'agent:dev': recursive dev command detected. "
        + "Set scripts.agent:dev to your direct agent entrypoint (for example: 'bun run src/index.ts')."
      );
    }
    return 'agent:dev';
  }

  const start = scripts.start;
  if (start && start.trim()) {
    if (isRecursiveDevScript(start)) {
      throw new Error(
        "Invalid package.json script 'start': recursive dev command detected. "
        + "Set scripts.start to your direct runtime entrypoint."
      );
    }
    return 'start';
  }

  throw new Error(
    "No launch script found. Add package.json scripts.agent:dev (recommended) or scripts.start."
  );
}

export const devCommand = new Command('dev')
  .description('Start the development environment')
  .option('--env <environment>', 'Target environment (testnet, mainnet, devnet)')
  .option('--mcp <mode>', 'MCP server mode (npx, docker)', 'npx')
  .option('--docker-image <image>', 'Docker image override for MCP server mode')
  .option('--docker-network <network>', 'Docker network for MCP server mode')
  .option('--docker-host <host>', 'Docker host for MCP health checks')
  .option('--docker-port <port>', 'Docker host port for MCP server')
  .option('--docker-pull-policy <policy>', 'Docker pull policy (always, if-not-present, never)')
  .option('--docker-health-path <path>', 'Docker MCP health endpoint path')
  .option('--docker-startup-timeout-ms <ms>', 'Docker MCP startup timeout in milliseconds')
  .option('--confirm', 'Skip confirmation prompts')
  .action(async (options) => {
    try {
      console.log(chalk.cyan('\n🚀 Starting SAISO development environment...\n'));

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

      console.log(chalk.gray(`📁 Project root: ${projectRoot}`));

      // Load configuration
      const config = saisoConfig.loadConfig(options.env, projectRoot);

      // Validate configuration
      const validation = saisoConfig.validateConfig(config);
      if (!validation.valid) {
        console.error(chalk.red('❌ Configuration validation failed:'));
        validation.errors.forEach(error => console.error(chalk.red(`   • ${error}`)));
        console.error(chalk.gray('\n💡 Fix these issues in your .env file or run "saiso config" for help'));
        process.exit(1);
      }

      console.log(chalk.green(`✅ Configuration loaded for ${config.network}`));

      // Show mainnet warning
      if (config.network === 'mainnet' && !options.confirm) {
        console.log(chalk.yellow('\n⚠️  WARNING: You are starting in MAINNET mode!'));
        console.log(chalk.yellow('   Real funds will be at risk. Transactions will use real assets.'));
        console.log(chalk.yellow('   Make sure you understand the implications.\n'));

        const inquirer = await import('inquirer');
        const { confirmMainnet } = await inquirer.default.prompt([
          {
            type: 'confirm',
            name: 'confirmMainnet',
            message: 'Are you sure you want to proceed with mainnet?',
            default: false,
          },
        ]);

        if (!confirmMainnet) {
          console.log(chalk.yellow('❌ Development cancelled'));
          process.exit(0);
        }
      }

      // Validate MCP mode
      if (options.mcp !== 'npx' && options.mcp !== 'docker') {
        console.error(chalk.red(`❌ Invalid MCP mode: ${options.mcp}`));
        console.error(chalk.gray('Valid modes: npx, docker'));
        process.exit(1);
      }

      if (options.mcp === 'docker') {
        const dockerOk = await isDockerAvailable();
        if (!dockerOk) {
          console.error(chalk.red('❌ Docker daemon is not available.'));
          console.error(chalk.gray('Run: saiso docker doctor'));
          process.exit(1);
        }
      }

      // Override MCP mode in config
      config.mcpServer.mode = options.mcp as 'npx' | 'docker';
      if (config.mcpServer.mode === 'docker') {
        const dockerConfig = (config.mcpServer as typeof config.mcpServer & {
          docker?: {
            image?: string;
            network?: string;
            host?: string;
            port?: number;
            pullPolicy?: 'always' | 'if-not-present' | 'never';
            healthPath?: string;
            startupTimeoutMs?: number;
          };
        }).docker;

        (config.mcpServer as typeof config.mcpServer & {
          docker?: {
            image?: string;
            network?: string;
            host?: string;
            port?: number;
            pullPolicy?: 'always' | 'if-not-present' | 'never';
            healthPath?: string;
            startupTimeoutMs?: number;
          };
        }).docker = {
          ...(dockerConfig || {}),
          image: options.dockerImage || dockerConfig?.image,
          network: options.dockerNetwork || dockerConfig?.network,
          host: options.dockerHost || dockerConfig?.host,
          port: options.dockerPort ? Number.parseInt(options.dockerPort, 10) : dockerConfig?.port,
          pullPolicy: options.dockerPullPolicy || dockerConfig?.pullPolicy,
          healthPath: options.dockerHealthPath || dockerConfig?.healthPath,
          startupTimeoutMs: options.dockerStartupTimeoutMs
            ? Number.parseInt(options.dockerStartupTimeoutMs, 10)
            : dockerConfig?.startupTimeoutMs,
        };
      }

      // Create appropriate MCP orchestrator based on server type
      const mcpOrchestrator = createMcpOrchestrator(config);
      const serverType = config.mcpServer.type;

      // Start MCP server
      const mcpSpinner = ora(`Starting ${serverType.toUpperCase()} MCP server...`).start();

      try {
        const mcpStatus = await mcpOrchestrator.start(config, projectRoot);

        mcpSpinner.succeed(`${serverType.toUpperCase()} MCP server started (${mcpStatus.mode})`);
        console.log(chalk.gray(`   Type: ${mcpStatus.type}`));
        console.log(chalk.gray(`   URL: ${mcpStatus.url}`));

        if (mcpStatus.pid) {
          console.log(chalk.gray(`   PID: ${mcpStatus.pid}`));
        }

        // Show server capabilities
        const capabilities = mcpOrchestrator.getCapabilities();
        console.log(chalk.gray(`   Tools: ${capabilities.tools.length} available`));
        console.log(chalk.gray(`   Networks: ${capabilities.networks.length} supported`));

      } catch (error) {
        mcpSpinner.fail(`Failed to start ${serverType.toUpperCase()} MCP server`);
        console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : error);

        // Show helpful suggestions
        if (options.mcp === 'docker') {
          console.log(chalk.gray('\n💡 Run `saiso docker doctor` to validate Docker runtime.'));
          console.log(chalk.gray('💡 Confirm Docker image access, container port, and daemon permissions.'));
          console.log(chalk.gray('💡 Retry with: saiso dev --mcp docker'));
        } else {
          console.log(chalk.gray('\n💡 Retry with: saiso dev --mcp npx'));
          console.log(chalk.gray('💡 Confirm Node.js, npx, RPC URL, and private key configuration.'));
        }

        process.exit(1);
      }


      // Start the agent
      const agentSpinner = ora('Starting ElizaOS agent...').start();

      try {
        // Import and start the agent
        const { spawn } = await import('node:child_process');
        const launchScript = await resolveAgentLaunchScript(projectRoot);

        const agentProcess = spawn('bun', ['run', launchScript], {
          cwd: projectRoot,
          stdio: 'inherit',
          env: {
            ...process.env,
            NODE_ENV: 'development',
            LOG_LEVEL: config.debug ? 'debug' : config.logLevel,
          },
        });

        agentSpinner.succeed(`ElizaOS agent started (${launchScript})`);

        console.log(chalk.green('\n✅ Development environment ready!\n'));
        console.log(chalk.bold('🔗 Services:\n'));
        console.log(chalk.cyan(`   • MCP Server: ${mcpOrchestrator.getStatus()?.url}`));
        console.log(chalk.cyan(`   • Agent: Running in development mode`));
        console.log(chalk.cyan(`   • Network: ${config.network}`));

        if (config.privateKey) {
          console.log(chalk.cyan(`   • Wallet: ${config.privateKey.slice(0, 6)}...${config.privateKey.slice(-4)}`));
        }

        console.log(chalk.gray('\n📝 Logs will appear below. Press Ctrl+C to stop.\n'));

        // Handle graceful shutdown
        const cleanup = async () => {
          console.log(chalk.yellow('\n🛑 Shutting down development environment...'));

          // Stop agent
          agentProcess.kill('SIGTERM');

          // Stop MCP server
          try {
            await mcpOrchestrator.stop();
          } catch (error) {
            console.error(chalk.red('Failed to stop MCP server:'), error);
          }

          console.log(chalk.green('✅ Development environment stopped'));
          process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        // Wait for agent process to exit
        agentProcess.on('exit', (code) => {
          if (code !== 0) {
            console.error(chalk.red(`\n❌ Agent process exited with code ${code}`));
          }
          cleanup();
        });

      } catch (error) {
        agentSpinner.fail('Failed to start ElizaOS agent');
        console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : error);

        // Cleanup MCP server
        try {
          await mcpOrchestrator.stop();
        } catch {
          // Ignore cleanup errors
        }

        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('❌ Unexpected error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
