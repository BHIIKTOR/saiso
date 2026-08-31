import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { saisoConfig, type SaisoEnvironment } from '../core/config.js';
import {
  getDefaultEvmLocalnetScenarios,
  isLikelyMainnetNetwork,
  runLocalnetEvmTestFlow,
} from '../core/localnet.js';
import { testAddCommand } from './test-add.js';

interface TestOptions {
  watch?: boolean;
  coverage?: boolean;
  env: string;
  filter?: string;
  verbose?: boolean;
}

export const testCommand = new Command('test')
  .description('Run tests for your agent project')
  .option('--watch', 'Run tests in watch mode')
  .option('--coverage', 'Generate coverage report')
  .option('--env <env>', 'Test environment (testnet, devnet, mainnet)', 'testnet')
  .option('--filter <pattern>', 'Filter tests by pattern')
  .option('--verbose', 'Show verbose output')
  .addCommand(testAddCommand)
  .action(async (options) => {
    try {
      console.log(chalk.cyan('🧪 SAISO Agent Testing Suite'));
      console.log(chalk.gray('Testing your agent against real blockchain networks\n'));

      // Check if we're in a valid agent project
      const projectRoot = process.cwd();
      const packageJsonPath = join(projectRoot, 'package.json');

      if (!existsSync(packageJsonPath)) {
        console.log(chalk.red('❌ No package.json found. Are you in an agent project directory?'));
        console.log(chalk.gray('Run this command from your agent project root directory.'));
        process.exit(1);
      }

      // Discover test files
      const testFiles = discoverTestFiles(projectRoot);

      if (testFiles.length === 0) {
        console.log(chalk.yellow('⚠️  No test files found.'));
        console.log(chalk.gray('Create test files in:'));
        console.log(chalk.gray('  • tests/'));
        console.log(chalk.gray('  • src/tests/'));
        console.log(chalk.gray('  • *.test.ts files'));
        console.log(chalk.gray('\nUse `saiso test add --agent` to generate basic tests.'));
        process.exit(0);
      }

      console.log(chalk.green(`📁 Found ${testFiles.length} test file(s):`));
      for (const file of testFiles) {
        console.log(chalk.gray(`  • ${file}`));
      }
      console.log();

      // Load environment configuration
      await loadTestEnvironment(projectRoot, options.env);

      // Build test command
      const testArgs = buildTestCommand(options, testFiles);

      console.log(chalk.blue(`🚀 Running tests with environment: ${options.env}`));
      if (options.filter) {
        console.log(chalk.gray(`   Filter: ${options.filter}`));
      }
      console.log();

      // Run tests using Bun
      await runTests(testArgs, options.verbose);

    } catch (error) {
      console.error(chalk.red('❌ Test execution failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

testCommand
  .command('localnet')
  .description('Run localnet integration tests in Docker (Foundry/Anvil)')
  .option('--chain <chain>', 'Chain family to test (evm)', 'evm')
  .option('--env <env>', 'Environment profile used for safety checks', 'testnet')
  .option('--scenarios <ids>', 'Comma-separated localnet scenario ids to run (defaults to full matrix)')
  .option('--artifact-path <path>', 'Write scenario matrix artifact to path')
  .option('--compose-file <path>', 'Compose file path override')
  .option('--keep-on-fail', 'Keep docker resources after failures for debugging')
  .option('--allow-live-payments', 'Allow live payment env usage in localnet mode (not recommended)')
  .action(async (options: {
    chain: string;
    env: string;
    scenarios?: string;
    artifactPath?: string;
    composeFile?: string;
    keepOnFail?: boolean;
    allowLivePayments?: boolean;
  }) => {
    if (options.chain !== 'evm') {
      console.error(chalk.red(`❌ Unsupported localnet chain '${options.chain}'. Valid value: evm`));
      process.exit(1);
    }

    const projectRoot = process.cwd();
    const config = saisoConfig.loadConfig(options.env as SaisoEnvironment, projectRoot);
    if (isLikelyMainnetNetwork(config.network)) {
      console.error(chalk.red(`❌ Refusing localnet test with mainnet-like network '${config.network}'.`));
      console.error(chalk.gray('Use a testnet/devnet profile or override SAISO_NETWORK for localnet testing.'));
      process.exit(1);
    }

    console.log(chalk.cyan('\n🐳 SAISO Localnet Test Runner\n'));
    console.log(chalk.gray(`Project: ${projectRoot}`));
    console.log(chalk.gray(`Chain: ${options.chain}`));
    console.log(chalk.gray(`Environment: ${options.env}`));
    const scenarioIds = options.scenarios
      ? options.scenarios.split(',').map((value) => value.trim()).filter(Boolean)
      : getDefaultEvmLocalnetScenarios().map((scenario) => scenario.id);
    console.log(chalk.gray(`Scenarios (${scenarioIds.length}): ${scenarioIds.join(', ')}`));
    if (options.artifactPath) {
      console.log(chalk.gray(`Artifact: ${options.artifactPath}`));
    }
    console.log();

    try {
      await runLocalnetEvmTestFlow({
        projectRoot,
        keepOnFail: options.keepOnFail,
        allowLivePayments: options.allowLivePayments,
        composeFilePath: options.composeFile,
        scenarios: scenarioIds,
        artifactPath: options.artifactPath,
      });
      console.log(chalk.green('✅ Localnet test flow completed successfully.'));
    } catch (error) {
      console.error(chalk.red('❌ Localnet test flow failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Discover test files in the project
 */
export function discoverTestFiles(projectRoot: string): string[] {
  const testFiles: string[] = [];
  const testPatterns = [
    'tests',
    'src/tests',
    '__tests__'
  ];

  // Check for test directories
  for (const pattern of testPatterns) {
    const testDir = join(projectRoot, pattern);
    if (existsSync(testDir)) {
      const files = findTestFilesInDirectory(testDir);
      testFiles.push(...files.map(f => f.replace(`${projectRoot}/`, '')));
    }
  }

  // Check for *.test.ts files in src/
  const srcDir = join(projectRoot, 'src');
  if (existsSync(srcDir)) {
    const files = findTestFilesInDirectory(srcDir, true);
    testFiles.push(...files.map(f => f.replace(`${projectRoot}/`, '')));
  }

  // Check for *.test.ts files in root
  try {
    const rootFiles = readdirSync(projectRoot)
      .filter(file => file.endsWith('.test.ts') || file.endsWith('.test.js'))
      .map(file => file);
    testFiles.push(...rootFiles);
  } catch (error) {
    // Ignore errors reading root directory
    console.error('Error reading root directory:', error instanceof Error ? error.message : String(error));
  }

  return [...new Set(testFiles)]; // Remove duplicates
}

/**
 * Find test files in a directory
 */
export function findTestFilesInDirectory(dir: string, recursive = true): string[] {
  const testFiles: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory() && recursive) {
        testFiles.push(...findTestFilesInDirectory(fullPath, true));
      } else if (stat.isFile() && (entry.endsWith('.test.ts') || entry.endsWith('.test.js'))) {
        testFiles.push(fullPath);
      }
    }
  } catch (error) {
    // Ignore errors reading directory
  }

  return testFiles;
}

/**
 * Load test environment configuration
 */
async function loadTestEnvironment(projectRoot: string, env: string): Promise<void> {
  const envFile = join(projectRoot, `.env.${env}`);
  const defaultEnvFile = join(projectRoot, '.env');

  if (existsSync(envFile)) {
    console.log(chalk.green(`✅ Loaded environment: .env.${env}`));
    process.env.NODE_ENV = env;
    process.env.SAISO_TEST_ENV = env;
  } else if (existsSync(defaultEnvFile)) {
    console.log(chalk.yellow(`⚠️  .env.${env} not found, using .env`));
    process.env.NODE_ENV = env;
    process.env.SAISO_TEST_ENV = env;
  } else {
    console.log(chalk.yellow(`⚠️  No environment file found for ${env}`));
    console.log(chalk.gray('Tests will run with default configuration'));
  }

  // Try to load SAISO config for additional context
  try {
    const config = saisoConfig.loadConfig(env as SaisoEnvironment, projectRoot);
    console.log(chalk.gray(`   Network: ${config.network}`));
    console.log(chalk.gray(`   RPC URL: ${config.rpcUrl}`));
  } catch (error) {
    // Config loading is optional for testing
    console.log(chalk.gray('   Using default configuration'));
  }

  console.log();
}

/**
 * Build test command arguments
 */
export function buildTestCommand(options: TestOptions, testFiles: string[]): string[] {
  const args = ['test'];

  if (options.watch) {
    args.push('--watch');
  }

  if (options.coverage) {
    args.push('--coverage');
  }

  if (options.filter) {
    args.push('--grep', options.filter);
  }

  // Add test files if specific ones found
  if (testFiles.length > 0) {
    // For Bun, we can specify test patterns
    const testPatterns = [
      'tests/**/*.test.{ts,js}',
      'src/tests/**/*.test.{ts,js}',
      'src/**/*.test.{ts,js}',
      '*.test.{ts,js}'
    ];

    // Only add patterns that have matching files
    for (const pattern of testPatterns) {
      args.push(pattern);
    }
  }

  return args;
}

/**
 * Run tests using Bun test runner
 */
function runTests(args: string[], verbose: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(chalk.gray(`Running: bun ${args.join(' ')}`));
    console.log(chalk.gray('─'.repeat(50)));

    const testProcess = spawn('bun', args, {
      stdio: verbose ? 'inherit' : 'pipe',
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORCE_COLOR: '1', // Ensure colored output
      }
    });

    let output = '';
    let errorOutput = '';

    if (!verbose) {
      testProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        // Show real-time output for important messages
        if (text.includes('✓') || text.includes('✗') || text.includes('PASS') || text.includes('FAIL')) {
          process.stdout.write(text);
        }
      });

      testProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        // Show errors immediately
        process.stderr.write(chalk.red(text));
      });
    }

    testProcess.on('close', (code) => {
      console.log(chalk.gray('─'.repeat(50)));

      if (code === 0) {
        console.log(chalk.green('✅ All tests passed!'));
        console.log(chalk.gray('Your agent is working correctly.'));
        resolve();
      } else {
        console.log(chalk.red(`❌ Tests failed (exit code: ${code})`));
        if (!verbose && output) {
          console.log('\nTest output:');
          console.log(output);
        }
        if (!verbose && errorOutput) {
          console.log('\nError output:');
          console.log(errorOutput);
        }
        console.log(chalk.gray('\nTip: Use --verbose for detailed output'));
        reject(new Error(`Tests failed with exit code ${code}`));
      }
    });

    testProcess.on('error', (error) => {
      if (error.message.includes('ENOENT')) {
        console.log(chalk.red('❌ Bun not found. Please install Bun:'));
        console.log(chalk.gray('curl -fsSL https://bun.sh/install | bash'));
      } else {
        console.log(chalk.red('❌ Failed to run tests:'), error.message);
      }
      reject(error);
    });
  });
}
