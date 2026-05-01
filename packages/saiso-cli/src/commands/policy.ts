import { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findProjectRoot, isSaisoProject } from '../core/index.js';
import { validatePaymentPolicy, validateTrustPolicy } from '../core/policy.js';

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

export const policyCommand = new Command('policy')
  .description('Validate and inspect SAISO payment/trust policy files')
  .addCommand(
    new Command('validate')
      .description('Validate .saiso/payment-policy.json and .saiso/trust-policy.json')
      .option('--payment-file <path>', 'Payment policy JSON path', '.saiso/payment-policy.json')
      .option('--trust-file <path>', 'Trust policy JSON path', '.saiso/trust-policy.json')
      .option('--strict', 'Fail when policy files are missing', false)
      .action(async (options) => {
        try {
          const projectRoot = await findProjectRoot();
          if (!projectRoot) {
            throw new Error('Not in a SAISO project directory.');
          }
          if (!(await isSaisoProject(projectRoot))) {
            throw new Error('Current directory is not a valid SAISO project.');
          }

          const paymentPath = path.resolve(projectRoot, options.paymentFile);
          const trustPath = path.resolve(projectRoot, options.trustFile);

          let missing = 0;
          let hadErrors = false;

          console.log(chalk.bold('🔍 Policy Validation'));
          console.log(chalk.gray(`Project: ${projectRoot}`));

          try {
            const paymentRaw = await readJson(paymentPath);
            const result = validatePaymentPolicy(paymentRaw);
            if (!result.valid) {
              hadErrors = true;
              console.log(chalk.red(`\n❌ Payment policy invalid: ${paymentPath}`));
              for (const error of result.errors) {
                console.log(chalk.red(`  • ${error}`));
              }
            } else {
              console.log(chalk.green(`\n✅ Payment policy valid: ${paymentPath}`));
              for (const warning of result.warnings) {
                console.log(chalk.yellow(`  ⚠ ${warning}`));
              }
            }
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
              missing += 1;
              console.log(chalk.yellow(`\n⚠ Payment policy missing: ${paymentPath}`));
            } else {
              throw error;
            }
          }

          try {
            const trustRaw = await readJson(trustPath);
            const result = validateTrustPolicy(trustRaw);
            if (!result.valid) {
              hadErrors = true;
              console.log(chalk.red(`\n❌ Trust policy invalid: ${trustPath}`));
              for (const error of result.errors) {
                console.log(chalk.red(`  • ${error}`));
              }
            } else {
              console.log(chalk.green(`\n✅ Trust policy valid: ${trustPath}`));
              for (const warning of result.warnings) {
                console.log(chalk.yellow(`  ⚠ ${warning}`));
              }
            }
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
              missing += 1;
              console.log(chalk.yellow(`\n⚠ Trust policy missing: ${trustPath}`));
            } else {
              throw error;
            }
          }

          if (options.strict && missing > 0) {
            throw new Error('Strict mode failed: one or more policy files are missing.');
          }

          if (hadErrors) {
            throw new Error('One or more policy files are invalid.');
          }

          console.log(chalk.green('\n✅ Policy validation passed.'));
        } catch (error) {
          console.error(chalk.red(`❌ Policy validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  );
