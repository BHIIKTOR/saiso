import { Command } from 'commander';
import chalk from 'chalk';
import {
  addPluginToProject,
  doctorPlugins,
  getPluginInfo,
  listPlugins,
  removePluginFromProject,
  setPluginEnabledState,
} from '../plugins/host.js';
import { PluginError } from '../plugins/errors.js';

function handlePluginCommandError(error: unknown): never {
  if (error instanceof PluginError) {
    console.error(chalk.red(`❌ ${error.code}: ${error.message}`));
    process.exit(1);
  }

  console.error(chalk.red(`❌ ${error instanceof Error ? error.message : 'Unknown plugin command error'}`));
  process.exit(1);
}

export const pluginCommand = new Command('plugin')
  .description('Manage SAISO plugins')
  .addCommand(
    new Command('add')
      .description('Install plugin artifact and add it to project lockfile (disabled by default)')
      .argument('<package>', 'npm package spec or file path')
      .option('--source <source>', 'Plugin source (npm|file)')
      .option('--allow-unverified', 'Allow install from unverified source (required for file source)', false)
      .option('--enable', 'Enable plugin immediately after install', false)
      .option('--no-plugin-lockfile-migrate', 'Fail instead of auto-migrating lockfile')
      .action(async (pkg: string, options) => {
        try {
          const sourceType = options.source === 'npm' || options.source === 'file' ? options.source : undefined;
          if (options.source && !sourceType) {
            throw new PluginError('PLUGIN_SOURCE_POLICY_VIOLATION', `Unsupported plugin source '${options.source}'.`, {
              phase: 'plugin-add',
            });
          }

          const entry = await addPluginToProject({
            spec: pkg,
            sourceType,
            allowUnverified: options.allowUnverified,
            noPluginLockfileMigrate: options.noPluginLockfileMigrate,
            enable: options.enable,
          });

          console.log(chalk.green(`✅ Added plugin '${entry.id}' (${entry.version})`));
          console.log(chalk.gray(`Source: ${entry.sourceType}`));
          console.log(chalk.gray(`Enabled: ${entry.enabled ? 'yes' : 'no'}`));
        } catch (error) {
          handlePluginCommandError(error);
        }
      })
  )
  .addCommand(
    new Command('remove')
      .description('Remove plugin from project lockfile (artifact cache is retained)')
      .argument('<id>', 'plugin id')
      .option('--no-plugin-lockfile-migrate', 'Fail instead of auto-migrating lockfile')
      .action(async (id: string, options) => {
        try {
          const removed = await removePluginFromProject({
            id,
            noPluginLockfileMigrate: options.noPluginLockfileMigrate,
          });

          if (!removed) {
            console.log(chalk.yellow(`⚠ Plugin '${id}' not found in project lockfile.`));
            return;
          }

          console.log(chalk.green(`✅ Removed plugin '${id}' from project lockfile`));
        } catch (error) {
          handlePluginCommandError(error);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List project plugins (or global metadata outside project context)')
      .option('--json', 'Output as JSON', false)
      .option('--no-plugin-lockfile-migrate', 'Fail instead of auto-migrating lockfile')
      .action(async (options) => {
        try {
          const result = await listPlugins({
            noPluginLockfileMigrate: options.noPluginLockfileMigrate,
          });

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }

          console.log(chalk.bold(`Plugin list (${result.mode} context)`));
          if (result.entries.length === 0) {
            console.log(chalk.gray('No plugins found.'));
            return;
          }

          for (const entry of result.entries) {
            const enabled = 'enabled' in entry ? entry.enabled : undefined;
            console.log(`- ${entry.id}@${entry.version} [${entry.sourceType}]${enabled === undefined ? '' : enabled ? ' (enabled)' : ' (disabled)'}`);
          }
        } catch (error) {
          handlePluginCommandError(error);
        }
      })
  )
  .addCommand(
    new Command('enable')
      .description('Enable plugin in project lockfile')
      .argument('<id>', 'plugin id')
      .option('--no-plugin-lockfile-migrate', 'Fail instead of auto-migrating lockfile')
      .action(async (id: string, options) => {
        try {
          const entry = await setPluginEnabledState({
            id,
            enabled: true,
            noPluginLockfileMigrate: options.noPluginLockfileMigrate,
          });
          console.log(chalk.green(`✅ Enabled plugin '${entry.id}'`));
        } catch (error) {
          handlePluginCommandError(error);
        }
      })
  )
  .addCommand(
    new Command('disable')
      .description('Disable plugin in project lockfile')
      .argument('<id>', 'plugin id')
      .option('--no-plugin-lockfile-migrate', 'Fail instead of auto-migrating lockfile')
      .action(async (id: string, options) => {
        try {
          const entry = await setPluginEnabledState({
            id,
            enabled: false,
            noPluginLockfileMigrate: options.noPluginLockfileMigrate,
          });
          console.log(chalk.green(`✅ Disabled plugin '${entry.id}'`));
        } catch (error) {
          handlePluginCommandError(error);
        }
      })
  )
  .addCommand(
    new Command('info')
      .description('Show plugin info from project lockfile or global metadata')
      .argument('<id>', 'plugin id')
      .option('--json', 'Output as JSON', false)
      .option('--no-plugin-lockfile-migrate', 'Fail instead of auto-migrating lockfile')
      .action(async (id: string, options) => {
        try {
          const result = await getPluginInfo({
            id,
            noPluginLockfileMigrate: options.noPluginLockfileMigrate,
          });

          if (!result.entry) {
            console.log(chalk.yellow(`⚠ Plugin '${id}' not found in ${result.mode} context.`));
            return;
          }

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }

          console.log(chalk.bold(`Plugin info (${result.mode} context)`));
          console.log(JSON.stringify(result.entry, null, 2));
        } catch (error) {
          handlePluginCommandError(error);
        }
      })
  )
  .addCommand(
    new Command('doctor')
      .description('Run plugin diagnostics')
      .argument('[id]', 'optional plugin id')
      .option('--json', 'Output as JSON', false)
      .option('--no-plugin-lockfile-migrate', 'Fail instead of auto-migrating lockfile')
      .action(async (id: string | undefined, options) => {
        try {
          const result = await doctorPlugins({
            id,
            noPluginLockfileMigrate: options.noPluginLockfileMigrate,
          });

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }

          console.log(chalk.bold(`Plugin doctor (${result.mode} context)`));
          if (result.results.length === 0) {
            console.log(chalk.gray('No matching plugins.'));
            return;
          }

          for (const entry of result.results) {
            if (entry.ok) {
              console.log(chalk.green(`✅ ${entry.id}`));
            } else {
              console.log(chalk.red(`❌ ${entry.id}: ${entry.error ?? 'Unknown error'}`));
            }
          }
        } catch (error) {
          handlePluginCommandError(error);
        }
      })
  );
