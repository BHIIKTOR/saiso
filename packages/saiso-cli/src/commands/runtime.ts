import { Command } from 'commander';
import chalk from 'chalk';
import { GoalRunnerError } from '@saiso/core';
import { loadGoalRunner, saveGoalRunner } from '../core/runtime-goals.js';
import { getRuntimeTransportCatalog } from '../core/runtime-transport.js';

function print(data: unknown, asJson?: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(data);
}

export const runtimeCommand = new Command('runtime')
  .description('Runtime controls for conversational transport, goals, and alerts');

const transportCommand = runtimeCommand
  .command('transport')
  .description('Inspect supported runtime transports');

transportCommand
  .command('list')
  .description('List available transports and capability flags')
  .option('--json', 'Emit machine-readable JSON')
  .action((options: { json?: boolean }) => {
    const transports = getRuntimeTransportCatalog();
    if (options.json) {
      print({ transports }, true);
      return;
    }

    console.log(chalk.cyan('📡 Runtime Transports'));
    for (const entry of transports) {
      console.log(chalk.gray(`- ${entry.transport}`));
      console.log(chalk.gray(`  sync=${entry.capabilities.supportsSync} stream=${entry.capabilities.supportsStream} websocket=${entry.capabilities.supportsWebsocket}`));
      console.log(chalk.gray(`  buttons=${entry.capabilities.supportsButtons} media=${entry.capabilities.supportsMedia} topics=${entry.capabilities.supportsTopics} callbacks=${entry.capabilities.supportsCallbacks}`));
    }
  });

const goalCommand = runtimeCommand
  .command('goal')
  .description('Manage conversational goal-runner lifecycle records');

goalCommand
  .command('list')
  .description('List tracked goals')
  .option('--json', 'Emit machine-readable JSON')
  .action(async (options: { json?: boolean }) => {
    const runner = await loadGoalRunner(process.cwd());
    const goals = runner.list();

    if (options.json) {
      print({ goals }, true);
      return;
    }

    if (goals.length === 0) {
      console.log(chalk.gray('No goals found.')); 
      return;
    }

    console.log(chalk.cyan('🎯 Goal Runs'));
    for (const goal of goals) {
      console.log(chalk.gray(`- ${goal.id} [${goal.state}] ${goal.title}`));
    }
  });

goalCommand
  .command('create <id>')
  .description('Create a goal run record')
  .requiredOption('--title <title>', 'Goal title')
  .option('--chain <chain>', 'Chain family (evm|svm)')
  .option('--requires-approval', 'Require explicit approval before start', true)
  .option('--no-requires-approval', 'Allow start without explicit approval')
  .option('--json', 'Emit machine-readable JSON')
  .action(async (id: string, options: {
    title: string;
    chain?: 'evm' | 'svm';
    requiresApproval?: boolean;
    json?: boolean;
  }) => {
    const runner = await loadGoalRunner(process.cwd());
    const goal = runner.create({
      id,
      title: options.title,
      requiresApproval: options.requiresApproval,
      chainFamily: options.chain,
    });
    await saveGoalRunner(process.cwd(), runner);

    if (options.json) {
      print({ goal }, true);
      return;
    }

    console.log(chalk.green(`✅ Created goal '${goal.id}' in state '${goal.state}'`));
  });

goalCommand
  .command('status <id>')
  .description('Show goal run state and trace metadata')
  .option('--json', 'Emit machine-readable JSON')
  .action(async (id: string, options: { json?: boolean }) => {
    const runner = await loadGoalRunner(process.cwd());
    const goal = runner.get(id);
    if (options.json) {
      print({ goal }, true);
      return;
    }

    console.log(chalk.cyan(`🎯 Goal ${goal.id}`));
    console.log(chalk.gray(`State: ${goal.state}`));
    console.log(chalk.gray(`Requires approval: ${goal.requiresApproval}`));
    console.log(chalk.gray(`Transitions: ${goal.transitions.length}`));
  });

goalCommand
  .command('action <id>')
  .description('Apply a lifecycle action to a goal')
  .requiredOption('--type <type>', 'Action type: request-approval|approve|start|pause|cancel|fail|complete')
  .option('--actor <actor>', 'Actor id for audit trail')
  .option('--reason <reason>', 'Action reason')
  .option('--summary <summary>', 'Completion summary')
  .option('--json', 'Emit machine-readable JSON')
  .action(async (id: string, options: {
    type: 'request-approval' | 'approve' | 'start' | 'pause' | 'cancel' | 'fail' | 'complete';
    actor?: string;
    reason?: string;
    summary?: string;
    json?: boolean;
  }) => {
    const runner = await loadGoalRunner(process.cwd());

    try {
      let goal;
      switch (options.type) {
        case 'request-approval':
          goal = runner.requestApproval(id, options.actor);
          break;
        case 'approve':
          goal = runner.approve(id, options.actor || 'operator');
          break;
        case 'start':
          goal = runner.start(id, options.actor);
          break;
        case 'pause':
          goal = runner.pause(id, options.reason, options.actor);
          break;
        case 'cancel':
          goal = runner.cancel(id, options.reason, options.actor);
          break;
        case 'fail':
          goal = runner.fail(id, options.reason || 'failed', options.actor);
          break;
        case 'complete':
          goal = runner.complete(id, options.summary || options.reason, options.actor);
          break;
        default:
          throw new Error(`Unsupported action type '${options.type}'`);
      }

      await saveGoalRunner(process.cwd(), runner);
      if (options.json) {
        print({ goal }, true);
        return;
      }

      console.log(chalk.green(`✅ Goal '${goal.id}' transitioned to '${goal.state}'`));
    } catch (error) {
      if (error instanceof GoalRunnerError) {
        console.error(chalk.red(`❌ ${error.code}: ${error.message}`));
        process.exit(1);
      }
      throw error;
    }
  });
