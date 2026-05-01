import { Command } from 'commander';
import chalk from 'chalk';
import { PaymentReceiptStore } from '@saiso/core';
import { findProjectRoot, isSaisoProject } from '../core/index.js';
import { summarizePaymentReceipts } from '../core/payment-observability.js';

export const receiptsCommand = new Command('receipts')
  .description('Show payment receipt summary')
  .option('--limit <count>', 'Max receipts to inspect (default: 50)', '50')
  .option('--json', 'Output machine-readable JSON')
  .action(async (options) => {
    try {
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error(chalk.red('❌ Not in a SAISO project directory'));
        process.exit(1);
      }

      if (!(await isSaisoProject(projectRoot))) {
        console.error(chalk.red('❌ Current directory is not a valid SAISO project'));
        process.exit(1);
      }

      const parsedLimit = Number.parseInt(options.limit, 10);
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

      const store = new PaymentReceiptStore(projectRoot);
      const receipts = await store.readAll(limit);
      const summary = summarizePaymentReceipts(receipts, 5);

      const payload = {
        timestamp: new Date().toISOString(),
        projectRoot,
        inspected: summary.total,
        limit,
        successful: summary.successful,
        failed: summary.failed,
        byProtocol: summary.byProtocol,
        recent: summary.recent,
      };

      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(chalk.bold('\n💳 Payment Receipt Summary'));
      console.log(chalk.gray(`Project: ${projectRoot}`));
      console.log(chalk.gray(`Inspected: ${summary.total} (limit ${limit})`));

      for (const protocol of ['x402', 'mpp'] as const) {
        const bucket = summary.byProtocol[protocol];
        const rate = (bucket.successRate * 100).toFixed(1);
        console.log(chalk.bold(`\n${protocol.toUpperCase()}:`));
        console.log(chalk.gray(`  Total: ${bucket.total}`));
        console.log(chalk.gray(`  Success: ${bucket.success}`));
        console.log(chalk.gray(`  Failed: ${bucket.failed}`));
        console.log(chalk.gray(`  Success Rate: ${rate}%`));
        const outcomeClasses = Object.entries(bucket.outcomeClasses)
          .map(([name, count]) => `${name}=${count}`)
          .join(', ');
        if (outcomeClasses) {
          console.log(chalk.gray(`  Outcome Classes: ${outcomeClasses}`));
        }
        if (bucket.latestSuccessReference) {
          console.log(chalk.gray(`  Latest Success Ref: ${bucket.latestSuccessReference}`));
        }
        if (bucket.latestFailureReference) {
          console.log(chalk.yellow(`  Latest Failure Ref: ${bucket.latestFailureReference}`));
        }
      }

      if (summary.total === 0) {
        console.log(chalk.yellow('\nNo payment receipts found.'));
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to read receipts: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });
