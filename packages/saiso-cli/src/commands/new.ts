import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { scaffolder, type SaisoEnvironment, isValidEnvironment } from '../core/index.js';
import type { McpServerType } from '@saiso/core';
import {
  ALL_EVM_NETWORKS,
  getRecommendedEvmNetworks,
  getRecommendedSvmNetworks,
  SVM_NETWORKS,
} from '@saiso/core';

export const newCommand = new Command('new')
  .description('Create a new SAISO agent project')
  .argument('<project-name>', 'Name of the project to create')
  .option('--env <environment>', 'Target environment (testnet, mainnet, devnet)', 'testnet')
  .option('--agent-name <name>', 'Name of the agent')
  .option('--description <desc>', 'Project description')
  .option('--service-blueprint', 'Include deployable service scaffold (health/readiness/paid endpoint)')
  .option('--path <path>', 'Custom project path')
  .option('--yes', 'Skip interactive prompts and use defaults')
  .action(async (projectName: string, options) => {
    try {
      console.log(chalk.cyan('\n🚀 Creating new SAISO agent project...\n'));

      // Validate project name
      if (!projectName || projectName.trim() === '') {
        console.error(chalk.red('❌ Project name is required'));
        process.exit(1);
      }

      // Validate environment
      if (!isValidEnvironment(options.env)) {
        console.error(chalk.red(`❌ Invalid environment: ${options.env}`));
        console.error(chalk.gray('Valid environments: testnet, mainnet, devnet'));
        process.exit(1);
      }

      let environment = options.env as SaisoEnvironment;

      // Determine project path
      const projectPath = options.path
        ? path.resolve(options.path, projectName)
        : path.resolve(process.cwd(), projectName);

      // Check if directory already exists
      try {
        await fs.access(projectPath);
        console.error(chalk.red(`❌ Directory ${projectPath} already exists`));
        process.exit(1);
      } catch {
        // Directory doesn't exist, which is what we want
      }

      let agentName = options.agentName || projectName;
      let description = options.description;
      let mcpServerType: McpServerType = 'evm';
      let targetNetwork = 'sepolia';
      let serviceBlueprint = Boolean(options.serviceBlueprint);

      // Interactive prompts if not using --yes flag
      if (!options.yes) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'agentName',
            message: 'Agent name:',
            default: agentName,
            validate: (input: string) => {
              if (!input.trim()) {
                return 'Agent name is required';
              }
              return true;
            },
          },
          {
            type: 'input',
            name: 'description',
            message: 'Project description:',
            default: description || 'Blockchain agent built with SAISO and ElizaOS',
          },
          {
            type: 'list',
            name: 'environment',
            message: 'Target environment:',
            choices: [
              { name: 'Testnet (recommended for development)', value: 'testnet' },
              { name: 'Mainnet (production)', value: 'mainnet' },
              { name: 'Devnet (experimental)', value: 'devnet' },
            ],
            default: environment,
          },
          {
            type: 'list',
            name: 'mcpServerType',
            message: 'Choose MCP server type:',
            choices: [
              {
                name: '🌐 EVM Server - 30+ networks: Ethereum, Polygon, Arbitrum, Base, etc. (ENS, NFTs)',
                value: 'evm',
                short: 'EVM Server'
              },
              {
                name: '☀️ SVM Server - Solana/SVM networks for high-throughput agent flows',
                value: 'svm',
                short: 'SVM Server'
              },
            ],
            default: 'evm',
          },
          {
            type: 'confirm',
            name: 'serviceBlueprint',
            message: 'Include service blueprint scaffold (health/readiness/paid endpoint)?',
            default: serviceBlueprint,
          },
        ]);

        // Network selection based on server type
        let networkAnswers: { network: string };
        if (answers.mcpServerType === 'evm') {
          const recommendedNetworks = getRecommendedEvmNetworks('development');
          const allNetworks = ALL_EVM_NETWORKS.filter(n => n.testnet === (answers.environment !== 'mainnet'));

          networkAnswers = await inquirer.prompt([
            {
              type: 'list',
              name: 'network',
              message: 'Choose target network:',
              choices: [
                ...recommendedNetworks.map(network => ({
                  name: `${network.name} (${network.nativeCurrency}) ${network.testnet ? '🧪' : '🌐'} - Recommended`,
                  value: network.name,
                  short: network.name
                })),
                new inquirer.Separator('--- Other Networks ---'),
                ...allNetworks
                  .filter(network => !recommendedNetworks.some(rec => rec.name === network.name))
                  .map(network => ({
                    name: `${network.name} (${network.nativeCurrency}) ${network.testnet ? '🧪' : '🌐'}`,
                    value: network.name,
                    short: network.name
                  })),
              ],
              default: recommendedNetworks[0]?.name || 'sepolia',
            },
          ]);
        } else if (answers.mcpServerType === 'svm') {
          const recommendedNetworks = getRecommendedSvmNetworks(
            answers.environment === 'mainnet' ? 'production' : 'development'
          );
          const allNetworks = SVM_NETWORKS.filter(n => n.testnet === (answers.environment !== 'mainnet'));

          networkAnswers = await inquirer.prompt([
            {
              type: 'list',
              name: 'network',
              message: 'Choose target SVM network:',
              choices: [
                ...recommendedNetworks.map(network => ({
                  name: `${network.name} (${network.nativeCurrency}) ${network.testnet ? '🧪' : '🌐'} - Recommended`,
                  value: network.name,
                  short: network.name
                })),
                new inquirer.Separator('--- Other Networks ---'),
                ...allNetworks
                  .filter(network => !recommendedNetworks.some(rec => rec.name === network.name))
                  .map(network => ({
                    name: `${network.name} (${network.nativeCurrency}) ${network.testnet ? '🧪' : '🌐'}`,
                    value: network.name,
                    short: network.name
                  })),
              ],
              default: recommendedNetworks[0]?.name || 'solana-devnet',
            },
          ]);
        } else {
          throw new Error(`Unsupported MCP server type: ${answers.mcpServerType}`);
        }

        const confirmAnswers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: () => {
              const serverName = answers.mcpServerType === 'svm'
                  ? 'SVM Server'
                  : 'EVM Server';
              const networkName = networkAnswers.network;
              return `Create "${projectName}" with ${serverName} on ${networkName}?`;
            },
            default: true,
          },
        ]);

        if (!confirmAnswers.confirm) {
          console.log(chalk.yellow('❌ Project creation cancelled'));
          process.exit(0);
        }

        agentName = answers.agentName;
        description = answers.description;
        environment = answers.environment;
        mcpServerType = answers.mcpServerType;
        targetNetwork = networkAnswers.network;
        serviceBlueprint = Boolean(answers.serviceBlueprint);
      }

      // Show warning for mainnet
      if (environment === 'mainnet' && !options.yes) {
        console.log(chalk.yellow('\n⚠️  WARNING: You are creating a mainnet project.'));
        console.log(chalk.yellow('   Real funds will be at risk. Make sure you understand the implications.'));

        const { confirmMainnet } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmMainnet',
            message: 'Are you sure you want to proceed with mainnet?',
            default: false,
          },
        ]);

        if (!confirmMainnet) {
          console.log(chalk.yellow('❌ Project creation cancelled'));
          process.exit(0);
        }
      }

      // Create the project
      const spinner = ora('Creating project structure...').start();

      try {
        await scaffolder.createProject({
          projectName,
          environment,
          projectPath,
          agentName,
          description,
          mcpServerType,
          targetNetwork,
          serviceBlueprint,
        });

        spinner.succeed('Project created successfully!');

        // Show next steps
        console.log(chalk.green('\n✅ Project created successfully!\n'));
        console.log(chalk.bold('Next steps:\n'));
        console.log(chalk.cyan(`  cd ${projectName}`));
        console.log(chalk.cyan('  bun install'));
        console.log(chalk.cyan('  cp .env.example .env'));
        console.log(chalk.cyan('  # Edit .env with your configuration'));
        console.log(chalk.cyan('  saiso dev\n'));

        if (serviceBlueprint) {
          console.log(chalk.bold('Service blueprint commands:\n'));
          console.log(chalk.cyan('  npm run build'));
          console.log(chalk.cyan('  npm run service:start\n'));
        }


        console.log(chalk.gray(' Documentation: https://github.com/BHIIKTOR/saiso'));
        console.log(chalk.gray('🆘 Support: https://github.com/BHIIKTOR/saiso/issues\n'));

      } catch (error) {
        spinner.fail('Failed to create project');
        console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('❌ Unexpected error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
