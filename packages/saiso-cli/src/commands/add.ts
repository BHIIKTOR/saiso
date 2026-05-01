import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { findProjectRoot, isSaisoProject, logger, saisoConfig, withTimeout } from '../core/index.js';
import type { FeatureConfig, McpServerType } from '@saiso/core';

const BASELINE_FEATURE_DEPENDENCIES: Record<string, string> = {
  '@elizaos/core': '^2.0.0-alpha.77',
};

function extractImportSpecifiers(source: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /import\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /export\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = pattern.exec(source)) !== null) {
      out.add(match[1]);
    }
  }

  return Array.from(out);
}

function isExternalPackageImport(specifier: string): boolean {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) {
    return false;
  }
  if (specifier.startsWith('node:') || specifier.startsWith('bun:')) {
    return false;
  }
  if (specifier === 'bun:test') {
    return false;
  }
  return true;
}

function normalizePackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return specifier;
  }
  return specifier.split('/')[0];
}

function trimSourceExtension(filePath: string): string {
  return filePath.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
}

function canonicalFeatureSourcePath(filePath: string): string {
  return trimSourceExtension(path.normalize(filePath))
    .replace(/\\/g, '/')
    .replace(/^(\.\.\/)+features\//, '')
    .replace(/^features\//, '');
}

type FeatureConfigContext = {
  feature: string;
  config: FeatureConfig;
};

function toRuntimeImportPath(fromDestination: string, toDestination: string): string {
  const fromDir = path.dirname(fromDestination);
  const runtimeTarget = toDestination.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '.js');
  let relative = path.relative(fromDir, runtimeTarget).replace(/\\/g, '/');
  if (!relative.startsWith('.')) {
    relative = `./${relative}`;
  }
  return relative;
}

function resolveFeatureFileDestination(
  contexts: FeatureConfigContext[],
  currentFeature: string,
  fromSource: string,
  specifier: string
): string | undefined {
  if (!specifier.startsWith('.')) {
    return undefined;
  }

  const sourceDir = path.dirname(`${currentFeature}/${fromSource}`);
  const normalizedTarget = canonicalFeatureSourcePath(path.join(sourceDir, specifier));
  for (const context of contexts) {
    const match = context.config.files.find((file) =>
      canonicalFeatureSourcePath(`${context.feature}/${file.source}`) === normalizedTarget
    );
    if (match) {
      return match.destination;
    }
  }
  return undefined;
}

function rewriteRelativeFeatureImports(
  source: string,
  currentFile: FeatureConfig['files'][number],
  contexts: FeatureConfigContext[],
  currentFeature: string
): string {
  return source.replace(
    /\b(from\s+['"])(\.[^'"]+)(['"])|(\bimport\s*\(\s*['"])(\.[^'"]+)(['"]\s*\))/g,
    (match, staticPrefix, staticSpecifier, staticSuffix, dynamicPrefix, dynamicSpecifier, dynamicSuffix) => {
      const specifier = staticSpecifier || dynamicSpecifier;
      const destination = resolveFeatureFileDestination(contexts, currentFeature, currentFile.source, specifier);
      if (!destination) {
        return match;
      }

      const rewritten = toRuntimeImportPath(currentFile.destination, destination);
      if (staticPrefix) {
        return `${staticPrefix}${rewritten}${staticSuffix}`;
      }
      return `${dynamicPrefix}${rewritten}${dynamicSuffix}`;
    }
  );
}

async function inferBaselineFeatureDependencies(
  templatePath: string,
  config: FeatureConfig
): Promise<Record<string, string>> {
  const declared = new Set(Object.keys(config.dependencies || {}));
  const inferred: Record<string, string> = {};

  for (const file of config.files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.source)) {
      continue;
    }

    const sourcePath = path.join(templatePath, file.source);
    let content = '';
    try {
      content = await fs.readFile(sourcePath, 'utf-8');
    } catch {
      continue;
    }

    const imports = extractImportSpecifiers(content);
    for (const specifier of imports) {
      if (!isExternalPackageImport(specifier)) {
        continue;
      }

      const packageName = normalizePackageName(specifier);
      if (declared.has(packageName)) {
        continue;
      }

      const baselineVersion = BASELINE_FEATURE_DEPENDENCIES[packageName];
      if (baselineVersion) {
        inferred[packageName] = baselineVersion;
      }
    }
  }

  return inferred;
}

export const addCommand = new Command('add')
  .description('Add a feature to the current project')
  .argument('[feature]', 'Feature to add')
  .option('--list', 'List available features')
  .option('--yes', 'Skip confirmation prompts')
  .action(async (feature: string, options) => {
    try {
      if (options.list) {
        await listAvailableFeatures();
        return;
      }

      if (!feature) {
        console.error(chalk.red('❌ Feature name is required'));
        console.log(chalk.gray('Use "saiso add --list" to see available features'));
        console.log(chalk.gray('Example: saiso add query_balance'));
        process.exit(1);
      }

      console.log(chalk.cyan('\n🔧 Adding feature to SAISO project...\n'));

      // Find project root with timeout protection
      const projectRoot = await withTimeout(
        findProjectRoot(),
        5000,
        'Project root search timed out after 5 seconds'
      );
      if (!projectRoot) {
        console.error(chalk.red('❌ Not in a SAISO project directory'));
        console.error(chalk.gray('Run this command from within a SAISO project'));
        process.exit(1);
      }

      // Verify it's a SAISO project with timeout protection
      if (!(await withTimeout(
        isSaisoProject(projectRoot),
        3000,
        'Project validation timed out after 3 seconds'
      ))) {
        console.error(chalk.red('❌ Current directory is not a valid SAISO project'));
        process.exit(1);
      }

      console.log(chalk.gray(`📁 Project root: ${projectRoot}`));

      // Get available features
      const availableFeatures = await getAvailableFeatures();

      if (!availableFeatures.includes(feature)) {
        console.error(chalk.red(`❌ Feature '${feature}' not found`));
        console.log(chalk.gray('\nAvailable features:'));
        availableFeatures.forEach(f => console.log(chalk.gray(`  • ${f}`)));
        console.log(chalk.gray('\nUse "saiso add --list" to see detailed information'));
        process.exit(1);
      }

      // Detect current project's MCP server type
      const currentConfig = saisoConfig.loadConfig(undefined, projectRoot);
      const serverType: McpServerType = currentConfig.mcpServer.type;

      console.log(chalk.gray(`🔧 MCP Server: ${serverType.toUpperCase()}`));

      // Load feature configuration
      const featureConfig = await loadFeatureConfig(feature, serverType);

      // Show feature information
      console.log(chalk.bold(`📦 ${featureConfig.displayName}`));
      console.log(chalk.gray(`   ${featureConfig.description}`));
      console.log(chalk.gray(`   Category: ${featureConfig.category}`));
      console.log(chalk.gray(`   Version: ${featureConfig.version}\n`));

      // Check if feature is already installed
      const isInstalled = await isFeatureInstalled(projectRoot, feature, serverType);
      if (isInstalled) {
        console.log(chalk.yellow(`⚠️  Feature '${feature}' is already installed`));

        if (!options.yes) {
          const { reinstall } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'reinstall',
              message: 'Do you want to reinstall it?',
              default: false,
            },
          ]);

          if (!reinstall) {
            console.log(chalk.gray('❌ Feature installation cancelled'));
            return;
          }
        }
      }

      // Confirm installation
      if (!options.yes) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Install feature '${featureConfig.displayName}'?`,
            default: true,
          },
        ]);

        if (!confirm) {
          console.log(chalk.gray('❌ Feature installation cancelled'));
          return;
        }
      }

      // Install the feature
      const spinner = ora('Installing feature...').start();

      try {
        const installedDependencies = await installFeatureDependencies(projectRoot, featureConfig, serverType);
        await installFeature(projectRoot, feature, featureConfig, serverType);
        spinner.succeed('Feature installed successfully!');

        console.log(chalk.green('\n✅ Feature added successfully!\n'));
        if (installedDependencies.length > 0) {
          console.log(chalk.gray(`Installed required feature dependencies: ${installedDependencies.join(', ')}\n`));
        }

        // Show next steps
        console.log(chalk.bold('Next steps:\n'));

        if (featureConfig.dependencies && Object.keys(featureConfig.dependencies).length > 0) {
          console.log(chalk.cyan('1. Install dependencies:'));
          Object.entries(featureConfig.dependencies).forEach(([dep, version]) => {
            console.log(chalk.gray(`   bun add ${dep}@${version}`));
          });
          console.log();
        }

        if (featureConfig.environment.required.length > 0 || featureConfig.environment.optional.length > 0) {
          console.log(chalk.cyan('2. Update your environment configuration:'));

          if (featureConfig.environment.required.length > 0) {
            console.log(chalk.gray('   Required variables:'));
            featureConfig.environment.required.forEach(env => {
              console.log(chalk.gray(`   • ${env}`));
            });
          }

          if (featureConfig.environment.optional.length > 0) {
            console.log(chalk.gray('   Optional variables:'));
            featureConfig.environment.optional.forEach(env => {
              console.log(chalk.gray(`   • ${env}`));
            });
          }
          console.log();
        }

        console.log(chalk.cyan('3. Restart your development environment:'));
        console.log(chalk.gray('   saiso dev\n'));

        if (featureConfig.examples.length > 0) {
          console.log(chalk.gray('💡 Try these examples:'));
          featureConfig.examples.forEach(example => {
            console.log(chalk.gray(`   "${example}"`));
          });
          console.log();
        }

        console.log(chalk.gray(`📚 Documentation: docs/features/${feature}.md\n`));

      } catch (error) {
        spinner.fail('Failed to install feature');
        console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function getAvailableFeatures(): Promise<string[]> {
  // Keep this list deterministic and aligned with templates/features* directories.
  return [
    'allowance_and_permission_manager',
    'check_network_status',
    'cross_chain_intent_router',
    'event_ingest_and_triggers',
    'gas_estimation',
    'interact_contract',
    'local_strategy_test_harness',
    'observability_and_incident_hooks',
    'oracle_and_market_data_layer',
    'policy_guardrails_runtime',
    'portfolio_state_and_pnl',
    'preflight_risk_checks',
    'privy_accounts',
    'privy_actions_swap',
    'privy_advanced_execution_evm',
    'privy_balance_and_history',
    'privy_client_base',
    'privy_intents_router',
    'privy_policy_controls',
    'privy_signing_evm',
    'privy_signing_svm',
    'privy_transfer',
    'privy_wallet_lifecycle',
    'privy_webhook_ingest',
    'query_balance',
    'quote_and_swap',
    'scheduler_and_workflow_runner',
    'send_tokens',
    'tx_lifecycle_manager',
  ];
}

async function loadFeatureConfig(feature: string, serverType?: McpServerType): Promise<FeatureConfig> {
  // Try server-specific templates first, then fall back to generic
  const templateDirs = serverType
    ? [
        `features-${serverType}`,
        'features',
        ...(['features-evm', 'features-svm'].filter((dir) => dir !== `features-${serverType}`)),
      ]
    : ['features'];
  let incompatibleFeatureFound = false;

  for (const templateDir of templateDirs) {
    const possiblePaths = [
      path.resolve(process.cwd(), `../../templates/${templateDir}/${feature}/config.json`),
      path.resolve(__dirname, `../../../templates/${templateDir}/${feature}/config.json`),
      path.resolve(__dirname, `../../../../templates/${templateDir}/${feature}/config.json`),
      path.join(process.cwd(), `templates/${templateDir}/${feature}/config.json`)
    ];

    for (const configPath of possiblePaths) {
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent) as FeatureConfig;

        // Validate server compatibility if serverType is specified
        const configWithServerType = config as FeatureConfig;
        if (
          serverType
          && configWithServerType.serverType
          && configWithServerType.serverType !== 'universal'
          && configWithServerType.serverType !== serverType
        ) {
          incompatibleFeatureFound = true;
          continue; // Skip incompatible features
        }

        return config;
      } catch {
        // Try next path
      }
    }
  }

  if (incompatibleFeatureFound && serverType) {
    throw new Error(`Feature '${feature}' is not compatible with ${serverType.toUpperCase()} projects.`);
  }

  throw new Error(`Failed to load feature configuration for '${feature}' (server: ${serverType || 'any'})`);
}

async function isFeatureInstalled(projectRoot: string, feature: string, serverType?: McpServerType): Promise<boolean> {
  try {
    const featureConfig = await loadFeatureConfig(feature, serverType);

    // Check if any of the feature files exist
    for (const file of featureConfig.files) {
      const filePath = path.join(projectRoot, file.destination);
      try {
        await fs.access(filePath);
        return true; // If any file exists, consider it installed
      } catch {
        // File doesn't exist, continue checking
      }
    }

    return false;
  } catch {
    return false;
  }
}

function getFeatureDependencies(config: FeatureConfig): string[] {
  const maybeDependencies = (config as FeatureConfig & { featureDependencies?: unknown }).featureDependencies;
  if (!Array.isArray(maybeDependencies)) {
    return [];
  }
  return maybeDependencies.filter((dependency): dependency is string => typeof dependency === 'string' && dependency.trim().length > 0);
}

function resolveFeatureTemplatePath(feature: string, serverType?: McpServerType): string {
  const templateDirs = serverType ? [`features-${serverType}`, 'features'] : ['features'];

  for (const templateDir of templateDirs) {
    const possiblePaths = [
      path.resolve(process.cwd(), `../../templates/${templateDir}/${feature}`),
      path.resolve(__dirname, `../../../templates/${templateDir}/${feature}`),
      path.resolve(__dirname, `../../../../templates/${templateDir}/${feature}`),
      path.join(process.cwd(), `templates/${templateDir}/${feature}`)
    ];

    for (const templatePath of possiblePaths) {
      if (existsSync(templatePath)) {
        return templatePath;
      }
    }
  }

  throw new Error(`Template path not found for feature '${feature}' and server '${serverType || 'any'}'`);
}

async function collectFeatureContexts(
  feature: string,
  config: FeatureConfig,
  serverType?: McpServerType,
  seen = new Set<string>()
): Promise<FeatureConfigContext[]> {
  const contexts: FeatureConfigContext[] = [{ feature, config }];
  for (const dependency of getFeatureDependencies(config)) {
    if (seen.has(dependency)) {
      continue;
    }
    seen.add(dependency);
    const dependencyConfig = await loadFeatureConfig(dependency, serverType);
    contexts.push(...await collectFeatureContexts(dependency, dependencyConfig, serverType, seen));
  }
  return contexts;
}

async function installFeatureDependencies(
  projectRoot: string,
  config: FeatureConfig,
  serverType?: McpServerType,
  visiting = new Set<string>()
): Promise<string[]> {
  const installed: string[] = [];
  for (const dependency of getFeatureDependencies(config)) {
    if (visiting.has(dependency)) {
      throw new Error(`Circular feature dependency detected: ${Array.from(visiting).join(' -> ')} -> ${dependency}`);
    }
    visiting.add(dependency);
    const dependencyConfig = await loadFeatureConfig(dependency, serverType);
    installed.push(...await installFeatureDependencies(projectRoot, dependencyConfig, serverType, visiting));
    if (!(await isFeatureInstalled(projectRoot, dependency, serverType))) {
      await installFeature(projectRoot, dependency, dependencyConfig, serverType);
      installed.push(dependency);
    }
    visiting.delete(dependency);
  }
  return installed;
}

async function installFeature(projectRoot: string, feature: string, config: FeatureConfig, serverType?: McpServerType): Promise<void> {
  const templatePath = resolveFeatureTemplatePath(feature, serverType);
  const contexts = await collectFeatureContexts(feature, config, serverType);

  // Copy feature files
  for (const file of config.files) {
    const sourcePath = path.join(templatePath, file.source);
    const destPath = path.join(projectRoot, file.destination);

    // Create destination directory if it doesn't exist
    await fs.mkdir(path.dirname(destPath), { recursive: true });

    const content = await fs.readFile(sourcePath, 'utf-8');
    const rewritten = /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.source)
      ? rewriteRelativeFeatureImports(content, file, contexts, feature)
      : content;
    await fs.writeFile(destPath, rewritten, 'utf-8');
  }

  const inferredDependencies = await inferBaselineFeatureDependencies(templatePath, config);
  const mergedDependencies = {
    ...inferredDependencies,
    ...(config.dependencies || {}),
  };

  // Update package.json with dependencies
  if (Object.keys(mergedDependencies).length > 0) {
    await updatePackageJsonDependencies(projectRoot, mergedDependencies);
  }

  // Update deterministic feature registry + entrypoint wiring.
  await updateFeatureRegistry(projectRoot, config);
  await updateMainIndex(projectRoot);
}

async function updatePackageJsonDependencies(projectRoot: string, dependencies: Record<string, string>): Promise<void> {
  const packageJsonPath = path.join(projectRoot, 'package.json');

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    if (!packageJson.dependencies) {
      packageJson.dependencies = {};
    }

    // Add new dependencies
    Object.entries(dependencies).forEach(([dep, version]) => {
      packageJson.dependencies[dep] = version;
    });

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
  } catch (error) {
    logger.warn(`Failed to update package.json: ${error instanceof Error ? error.message : error}`);
  }
}

export async function updateMainIndex(projectRoot: string): Promise<void> {
  const indexPath = path.join(projectRoot, 'src/index.ts');
  const featureImport = "import { featureActions } from './features/registry.js';";
  const featureUsageBlock = [
    '// SAISO feature registry hook',
    'const _saisoFeatureActionCount = featureActions.length;',
    'void _saisoFeatureActionCount;',
  ].join('\n');

  try {
    let indexContent = await fs.readFile(indexPath, 'utf-8');
    if (!indexContent.includes(featureImport)) {
      const importRegex = /^import.*$/gm;
      const matches = indexContent.match(importRegex);
      if (matches && matches.length > 0) {
        const lastImport = matches[matches.length - 1];
        const lastImportIndex = indexContent.indexOf(lastImport) + lastImport.length;
        indexContent = `${indexContent.slice(0, lastImportIndex)}\n${featureImport}${indexContent.slice(lastImportIndex)}`;
      } else {
        indexContent = `${featureImport}\n\n${indexContent}`;
      }
    }

    if (!indexContent.includes('// SAISO feature registry hook')) {
      indexContent = `${indexContent.trimEnd()}\n\n${featureUsageBlock}\n`;
    }

    await fs.writeFile(indexPath, indexContent);
  } catch (error) {
    logger.warn(`Failed to update main index file: ${error instanceof Error ? error.message : error}`);
  }
}

const FEATURE_IMPORTS_START = '// SAISO_FEATURE_IMPORTS_START';
const FEATURE_IMPORTS_END = '// SAISO_FEATURE_IMPORTS_END';
const FEATURE_ACTIONS_START = '// SAISO_FEATURE_ACTIONS_START';
const FEATURE_ACTIONS_END = '// SAISO_FEATURE_ACTIONS_END';

export function insertUniqueLinesBetweenMarkers(
  content: string,
  startMarker: string,
  endMarker: string,
  linesToInsert: string[]
): string {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) {
    return content;
  }

  const sectionStart = start + startMarker.length;
  const section = content.slice(sectionStart, end);
  const existing = new Set(
    section
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );

  const additions = linesToInsert
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !existing.has(line));

  if (additions.length === 0) {
    return content;
  }

  const insertion = `\n${additions.join('\n')}\n`;
  return `${content.slice(0, end)}${insertion}${content.slice(end)}`;
}

export async function updateFeatureRegistry(projectRoot: string, config: FeatureConfig): Promise<void> {
  const featuresDir = path.join(projectRoot, 'src/features');
  const registryPath = path.join(featuresDir, 'registry.ts');
  const imports = resolveFeatureRegistryImports(config);
  const actions = (config.integration.actions || []).map((action) => `${action},`);

  await fs.mkdir(featuresDir, { recursive: true });

  if (!existsSync(registryPath)) {
    const initial = `/* eslint-disable @typescript-eslint/no-unused-vars */\n${FEATURE_IMPORTS_START}\n${FEATURE_IMPORTS_END}\n\nexport const featureActions = [\n${FEATURE_ACTIONS_START}\n${FEATURE_ACTIONS_END}\n];\n`;
    await fs.writeFile(registryPath, initial, 'utf-8');
  }

  let registryContent = await fs.readFile(registryPath, 'utf-8');
  registryContent = insertUniqueLinesBetweenMarkers(registryContent, FEATURE_IMPORTS_START, FEATURE_IMPORTS_END, imports);
  registryContent = insertUniqueLinesBetweenMarkers(registryContent, FEATURE_ACTIONS_START, FEATURE_ACTIONS_END, actions);
  await fs.writeFile(registryPath, registryContent, 'utf-8');
}

function resolveFeatureRegistryImports(config: FeatureConfig): string[] {
  const configuredImports = config.integration.imports || [];
  return configuredImports.map((importLine) => {
    const actionImport = importLine.match(/^(import\s+\{[^}]+\}\s+from\s+['"])(\.[^'"]+)(['"];?)$/);
    if (!actionImport) {
      return importLine;
    }

    const [, prefix, specifier, suffix] = actionImport;
    const configuredTarget = specifier.replace(/^\.\//, '');
    const match = config.files.find((file) => {
      const destination = file.destination.replace(/^src\//, '').replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '.js');
      return destination === configuredTarget || destination.endsWith(`/${path.basename(configuredTarget)}`);
    });
    if (!match) {
      return importLine;
    }

    return `${prefix}${toRuntimeImportPath('src/features/registry.ts', match.destination)}${suffix}`;
  });
}

async function listAvailableFeatures(): Promise<void> {
  console.log(chalk.cyan('\n📦 Available SAISO Features:\n'));

  const features = await getAvailableFeatures();

  // Simple feature list without trying to load configs (which can hang)
  const featureDescriptions: Record<string, string> = {
    'allowance_and_permission_manager': 'Manage token allowances, approvals, and permission safety checks',
    'check_network_status': 'Check blockchain network status',
    'cross_chain_intent_router': 'Route and execute intent workflows across multiple chains',
    'event_ingest_and_triggers': 'Ingest events and trigger deterministic workflow hooks',
    'gas_estimation': 'Estimate gas costs for transactions',
    'interact_contract': 'Interact with smart contracts',
    'local_strategy_test_harness': 'Run deterministic local strategy scenarios',
    'observability_and_incident_hooks': 'Emit structured logs, metrics, and incident hooks',
    'oracle_and_market_data_layer': 'Normalize market data with freshness and confidence metadata',
    'policy_guardrails_runtime': 'Enforce runtime policy constraints before execution',
    'portfolio_state_and_pnl': 'Track balances, allocation drift, and portfolio PnL state',
    'preflight_risk_checks': 'Run simulation and policy checks before execution',
    'privy_accounts': 'Create and manage Privy accounts with account balance retrieval',
    'privy_actions_swap': 'Run Privy swap token catalog, quote, execute, and action status flows',
    'privy_advanced_execution_evm': 'Run EVM advanced execution flows (7702, user ops, wallet send-calls)',
    'privy_balance_and_history': 'Retrieve and normalize Privy wallet balances and transaction history',
    'privy_client_base': 'Shared Privy client foundation with auth, retry, idempotency, and expiry helpers',
    'privy_intents_router': 'Create and route Privy transfer/RPC intents with status operations',
    'privy_policy_controls': 'Manage Privy policies, rules, condition sets, and key quorums',
    'privy_signing_evm': 'Sign EVM messages, typed data, and transactions with Privy wallets',
    'privy_signing_svm': 'Sign SVM messages and transactions with Privy wallets',
    'privy_transfer': 'Execute Privy wallet transfers through a unified action envelope',
    'privy_wallet_lifecycle': 'Create, query, update, and authenticate Privy wallets',
    'privy_webhook_ingest': 'Verify and process Privy webhook events deterministically',
    'query_balance': 'Query wallet and token balances',
    'quote_and_swap': 'Quote and execute swaps with workflow parity across chains',
    'scheduler_and_workflow_runner': 'Run scheduled and checkpointed multi-step workflows',
    'send_tokens': 'Send tokens to other addresses',
    'tx_lifecycle_manager': 'Track pending, replacement, and finality transaction lifecycle states',
  };

  for (const feature of features) {
    console.log(chalk.bold(`${feature}`));
    console.log(chalk.gray(`  ${featureDescriptions[feature] || 'Feature description not available'}`));
    console.log(chalk.gray(`  Category: blockchain | Version: 1.0.0`));
    console.log();
  }

  console.log(chalk.gray('Use "saiso add <feature>" to install a feature'));
  console.log(chalk.gray('Example: saiso add query_balance\n'));
}
