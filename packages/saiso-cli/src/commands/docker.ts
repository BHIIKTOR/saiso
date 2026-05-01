import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { executeCommand, isDockerAvailable } from '../core/utils.js';

export interface DockerDoctorCheck {
  name: string;
  command: string;
  args: string[];
  required: boolean;
}

export interface DockerDoctorResult {
  name: string;
  ok: boolean;
  output: string;
  required: boolean;
}

export function getDockerDoctorChecks(): DockerDoctorCheck[] {
  return [
    { name: 'Docker CLI', command: 'docker', args: ['--version'], required: true },
    { name: 'Docker Daemon', command: 'docker', args: ['info', '--format', '{{.ServerVersion}}'], required: true },
    { name: 'Docker Compose', command: 'docker', args: ['compose', 'version'], required: false },
  ];
}

export async function runDockerDoctor(): Promise<DockerDoctorResult[]> {
  const checks = getDockerDoctorChecks();
  const out: DockerDoctorResult[] = [];

  for (const check of checks) {
    try {
      const result = await executeCommand(check.command, check.args);
      out.push({
        name: check.name,
        ok: result.exitCode === 0,
        output: result.stdout || result.stderr || '',
        required: check.required,
      });
    } catch (error) {
      out.push({
        name: check.name,
        ok: false,
        output: error instanceof Error ? error.message : String(error),
        required: check.required,
      });
    }
  }

  return out;
}

export const dockerCommand = new Command('docker')
  .description('Docker runtime diagnostics and maintenance');

dockerCommand
  .command('doctor')
  .description('Check docker runtime prerequisites')
  .action(async () => {
    const results = await runDockerDoctor();
    let hasRequiredFailure = false;

    console.log(chalk.cyan('\n🐳 SAISO Docker Doctor\n'));
    for (const result of results) {
      if (!result.ok && result.required) {
        hasRequiredFailure = true;
      }
      const symbol = result.ok ? chalk.green('✅') : result.required ? chalk.red('❌') : chalk.yellow('⚠️');
      console.log(`${symbol} ${result.name}`);
      if (result.output) {
        console.log(chalk.gray(`   ${result.output.split('\n')[0]}`));
      }
    }
    console.log();

    if (hasRequiredFailure) {
      process.exit(1);
    }
  });

dockerCommand
  .command('ps')
  .description('List SAISO-managed docker containers')
  .action(async () => {
    if (!(await isDockerAvailable())) {
      console.error(chalk.red('❌ Docker is not available.'));
      process.exit(1);
    }

    const result = await executeCommand('docker', [
      'ps',
      '-a',
      '--filter', 'label=saiso.mode=docker',
      '--format', 'table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}',
    ]);

    if (result.exitCode !== 0) {
      console.error(chalk.red('❌ Failed to list docker containers.'));
      console.error(chalk.red(result.stderr || result.stdout));
      process.exit(1);
    }

    console.log(chalk.cyan('\n🐳 SAISO Docker Containers\n'));
    console.log(result.stdout || chalk.gray('No SAISO docker containers found.'));
  });

dockerCommand
  .command('clean')
  .description('Remove SAISO-managed docker containers/networks')
  .option('--force', 'Skip confirmation prompt')
  .action(async (options: { force?: boolean }) => {
    if (!(await isDockerAvailable())) {
      console.error(chalk.red('❌ Docker is not available.'));
      process.exit(1);
    }

    if (!options.force) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Remove all SAISO docker containers and labeled networks?',
          default: false,
        },
      ]);
      if (!answer.confirm) {
        console.log(chalk.yellow('Cleanup cancelled.'));
        return;
      }
    }

    const containers = await executeCommand('docker', ['ps', '-aq', '--filter', 'label=saiso.mode=docker']);
    const containerIds = containers.stdout ? containers.stdout.split('\n').map((item) => item.trim()).filter(Boolean) : [];
    if (containerIds.length > 0) {
      await executeCommand('docker', ['rm', '-f', ...containerIds]);
      console.log(chalk.green(`✅ Removed ${containerIds.length} SAISO containers`));
    } else {
      console.log(chalk.gray('No SAISO containers to remove.'));
    }

    const networks = await executeCommand('docker', ['network', 'ls', '-q', '--filter', 'label=saiso.mode=docker']);
    const networkIds = networks.stdout ? networks.stdout.split('\n').map((item) => item.trim()).filter(Boolean) : [];
    for (const networkId of networkIds) {
      await executeCommand('docker', ['network', 'rm', networkId]);
    }
    if (networkIds.length > 0) {
      console.log(chalk.green(`✅ Removed ${networkIds.length} SAISO docker networks`));
    }
  });
