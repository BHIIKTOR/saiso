import { Command } from 'commander';
import chalk from 'chalk';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createErc8004Registration,
  Erc8004RegistryClient,
  validateErc8004Registration,
  type Erc8004Registration,
} from '@saiso/core';
import { findProjectRoot, isSaisoProject, saisoConfig, type SaisoEnvironment } from '../core/index.js';

function parseServiceFlag(raw: string): { name: string; endpoint: string } {
  const index = raw.indexOf('=');
  if (index <= 0 || index === raw.length - 1) {
    throw new Error(`Invalid --service value '${raw}'. Expected format: name=https://endpoint`);
  }
  return {
    name: raw.slice(0, index).trim(),
    endpoint: raw.slice(index + 1).trim(),
  };
}

function parseOptionalBooleanOption(raw: unknown, flagName: string): boolean | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new Error(`Invalid ${flagName} value. Expected true or false.`);
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Invalid ${flagName} value '${raw}'. Expected true or false.`);
}

function uniqueServices(
  services: Array<{ name: string; endpoint: string; version?: string }>
): Array<{ name: string; endpoint: string; version?: string }> {
  const seen = new Set<string>();
  const output: Array<{ name: string; endpoint: string; version?: string }> = [];

  for (const service of services) {
    const key = `${service.name}::${service.endpoint}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(service);
  }

  return output;
}

function resolveRegistrationFromConfig(
  projectRoot: string,
  options: {
    env?: string;
    name?: string;
    description?: string;
    image?: string;
    agentId?: string;
    agentRegistry?: string;
    service?: string[];
    active?: boolean;
    supportsX402?: string;
    supportsMpp?: string;
    preferredPayment?: 'x402' | 'mpp' | 'auto';
    signingAlg?: string;
    signingKeyId?: string;
    signingSignature?: string;
    signingSignedAt?: string;
  }
): Erc8004Registration {
  const requestedEnv = options.env as SaisoEnvironment | undefined;
  const config = saisoConfig.loadConfig(requestedEnv, projectRoot);

  const servicesFromConfig = (config.identity?.endpoints || []).map((endpoint) => ({
    name: endpoint.name,
    endpoint: endpoint.endpoint,
    version: endpoint.version,
  }));

  const extraServices = (options.service || []).map(parseServiceFlag);
  const allServices = uniqueServices([
    ...servicesFromConfig,
    { name: 'mcp', endpoint: `${config.mcpServerUrl.replace(/\/$/, '')}/mcp`, version: '1.0' },
    ...extraServices,
  ]);

  const rawAgentId = options.agentId || config.identity?.agentId;
  const agentRegistry = options.agentRegistry || config.identity?.agentRegistry;

  if (!rawAgentId) {
    throw new Error('Missing agent id. Set IDENTITY_AGENT_ID or pass --agent-id.');
  }
  if (!agentRegistry) {
    throw new Error('Missing agent registry. Set IDENTITY_AGENT_REGISTRY or pass --agent-registry.');
  }

  const parsedAgentId = Number.parseInt(rawAgentId, 10);
  if (!Number.isFinite(parsedAgentId) || parsedAgentId < 0) {
    throw new Error(`Invalid agent id '${rawAgentId}'. Must be a non-negative integer.`);
  }

  const supportedTrust = [
    config.trust?.reputationSource,
    config.trust?.validationSource,
  ].filter((value): value is string => Boolean(value && value.trim()));

  const supportsX402 = parseOptionalBooleanOption(options.supportsX402, '--supports-x402')
    ?? config.identity?.x402Support
    ?? (config.payment?.preferredProtocol === 'x402' || config.payment?.preferredProtocol === 'auto');
  const supportsMpp = parseOptionalBooleanOption(options.supportsMpp, '--supports-mpp')
    ?? config.identity?.mppSupport
    ?? (config.payment?.preferredProtocol === 'mpp' || config.payment?.preferredProtocol === 'auto');

  if ((options.signingAlg && !options.signingKeyId) || (!options.signingAlg && options.signingKeyId)) {
    throw new Error('Both --signing-alg and --signing-key-id are required when including signing metadata.');
  }

  const registration = createErc8004Registration({
    name: options.name || config.agentName,
    description: options.description || `${config.agentName} agent published by SAISO`,
    image: options.image || 'https://saiso.dev/assets/agent.png',
    services: allServices.map((service) => ({
      name: service.name,
      endpoint: service.endpoint,
      version: service.version || '1.0',
    })),
    x402Support: supportsX402,
    paymentSupport: {
      x402: supportsX402,
      mpp: supportsMpp,
      preferred: options.preferredPayment || config.payment?.preferredProtocol || 'auto',
    },
    runtime: {
      environment: config.environment,
      network: config.network,
      serverType: config.mcpServer.type,
      mcpEndpoint: `${config.mcpServerUrl.replace(/\/$/, '')}/mcp`,
      healthEndpoint: `${config.mcpServerUrl.replace(/\/$/, '')}/healthz`,
      readinessEndpoint: `${config.mcpServerUrl.replace(/\/$/, '')}/readyz`,
    },
    signing: options.signingAlg && options.signingKeyId
      ? {
          algorithm: options.signingAlg,
          keyId: options.signingKeyId,
          signature: options.signingSignature,
          signedAt: options.signingSignedAt,
        }
      : undefined,
    active: options.active !== false,
    registrations: [
      {
        agentId: parsedAgentId,
        agentRegistry,
      },
    ],
    supportedTrust: supportedTrust.length > 0 ? supportedTrust : undefined,
  });

  return registration;
}

async function ensureProjectRoot(): Promise<string> {
  const projectRoot = await findProjectRoot();
  if (!projectRoot) {
    throw new Error('Not in a SAISO project directory.');
  }
  const valid = await isSaisoProject(projectRoot);
  if (!valid) {
    throw new Error('Current directory is not a valid SAISO project.');
  }
  return projectRoot;
}

function parseEnvOption(env?: string): SaisoEnvironment | undefined {
  if (!env) return undefined;
  if (env === 'testnet' || env === 'mainnet' || env === 'devnet') {
    return env;
  }
  throw new Error(`Invalid environment '${env}'. Expected one of testnet, mainnet, devnet.`);
}

function parseAgentId(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid agent id '${raw}'. Must be a non-negative integer.`);
  }
  return parsed;
}

function topLevelDiff(
  previous: Erc8004Registration | null,
  next: Erc8004Registration
): {
  added: string[];
  removed: string[];
  changed: string[];
} {
  if (!previous) {
    return {
      added: Object.keys(next),
      removed: [],
      changed: [],
    };
  }

  const prevKeys = new Set(Object.keys(previous));
  const nextKeys = new Set(Object.keys(next));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of nextKeys) {
    if (!prevKeys.has(key)) {
      added.push(key);
      continue;
    }

    const prevValue = (previous as unknown as Record<string, unknown>)[key];
    const nextValue = (next as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(prevValue) !== JSON.stringify(nextValue)) {
      changed.push(key);
    }
  }

  for (const key of prevKeys) {
    if (!nextKeys.has(key)) {
      removed.push(key);
    }
  }

  return { added, removed, changed };
}

export const identityCommand = new Command('identity')
  .description('Build and validate ERC-8004 discovery metadata')
  .addCommand(
    new Command('build')
      .description('Build ERC-8004 registration from SAISO config and write it to disk')
      .option('--env <environment>', 'Target environment (testnet, mainnet, devnet)')
      .option('--output <path>', 'Output path', '.well-known/agent-registration.json')
      .option('--name <name>', 'Registration name override')
      .option('--description <text>', 'Registration description override')
      .option('--image <url>', 'Registration image URL')
      .option('--agent-id <id>', 'On-chain agent id')
      .option('--agent-registry <value>', 'On-chain registry identifier')
      .option('--service <name=url>', 'Additional service endpoint (repeatable)', (value, previous: string[]) => [...previous, value], [])
      .option('--supports-x402 <bool>', 'Override x402 support (true|false)')
      .option('--supports-mpp <bool>', 'Override mpp support (true|false)')
      .option('--preferred-payment <protocol>', 'Preferred payment protocol (x402, mpp, auto)')
      .option('--signing-alg <value>', 'Optional discovery signing algorithm (for example, ed25519)')
      .option('--signing-key-id <value>', 'Optional signing key identifier')
      .option('--signing-signature <value>', 'Optional detached signature string')
      .option('--signing-signed-at <iso>', 'Optional signature timestamp (ISO-8601)')
      .option('--inactive', 'Write registration with active=false', false)
      .action(async (options) => {
        try {
          const projectRoot = await ensureProjectRoot();
          const outputPath = path.resolve(projectRoot, options.output);

          const registration = resolveRegistrationFromConfig(projectRoot, {
            env: options.env,
            name: options.name,
            description: options.description,
            image: options.image,
            agentId: options.agentId,
            agentRegistry: options.agentRegistry,
            service: options.service,
            active: !options.inactive,
            supportsX402: options.supportsX402,
            supportsMpp: options.supportsMpp,
            preferredPayment: options.preferredPayment,
            signingAlg: options.signingAlg,
            signingKeyId: options.signingKeyId,
            signingSignature: options.signingSignature,
            signingSignedAt: options.signingSignedAt,
          });

          const validation = validateErc8004Registration(registration);
          if (!validation.valid) {
            throw new Error(`Registration is invalid: ${validation.errors.join('; ')}`);
          }

          await mkdir(path.dirname(outputPath), { recursive: true });
          await writeFile(outputPath, `${JSON.stringify(registration, null, 2)}\n`);

          console.log(chalk.green('✅ ERC-8004 registration generated'));
          console.log(chalk.gray(`File: ${outputPath}`));
          console.log(chalk.gray(`Services: ${registration.services.length}`));
          console.log(chalk.gray(`x402Support: ${registration.x402Support ? 'true' : 'false'}`));
        } catch (error) {
          console.error(chalk.red(`❌ Failed to build identity registration: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('show')
      .description('Show the derived ERC-8004 registration JSON without writing files')
      .option('--env <environment>', 'Target environment (testnet, mainnet, devnet)')
      .option('--name <name>', 'Registration name override')
      .option('--description <text>', 'Registration description override')
      .option('--image <url>', 'Registration image URL')
      .option('--agent-id <id>', 'On-chain agent id')
      .option('--agent-registry <value>', 'On-chain registry identifier')
      .option('--service <name=url>', 'Additional service endpoint (repeatable)', (value, previous: string[]) => [...previous, value], [])
      .option('--supports-x402 <bool>', 'Override x402 support (true|false)')
      .option('--supports-mpp <bool>', 'Override mpp support (true|false)')
      .option('--preferred-payment <protocol>', 'Preferred payment protocol (x402, mpp, auto)')
      .option('--signing-alg <value>', 'Optional discovery signing algorithm (for example, ed25519)')
      .option('--signing-key-id <value>', 'Optional signing key identifier')
      .option('--signing-signature <value>', 'Optional detached signature string')
      .option('--signing-signed-at <iso>', 'Optional signature timestamp (ISO-8601)')
      .option('--inactive', 'Render registration with active=false', false)
      .action(async (options) => {
        try {
          const projectRoot = await ensureProjectRoot();
          const registration = resolveRegistrationFromConfig(projectRoot, {
            env: options.env,
            name: options.name,
            description: options.description,
            image: options.image,
            agentId: options.agentId,
            agentRegistry: options.agentRegistry,
            service: options.service,
            active: !options.inactive,
            supportsX402: options.supportsX402,
            supportsMpp: options.supportsMpp,
            preferredPayment: options.preferredPayment,
            signingAlg: options.signingAlg,
            signingKeyId: options.signingKeyId,
            signingSignature: options.signingSignature,
            signingSignedAt: options.signingSignedAt,
          });
          console.log(JSON.stringify(registration, null, 2));
        } catch (error) {
          console.error(chalk.red(`❌ Failed to render identity registration: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('validate')
      .description('Validate an ERC-8004 registration JSON file')
      .option('--file <path>', 'Path to registration JSON', '.well-known/agent-registration.json')
      .action(async (options) => {
        try {
          const projectRoot = await ensureProjectRoot();
          const filePath = path.resolve(projectRoot, options.file);
          const content = await readFile(filePath, 'utf-8');
          const parsed = JSON.parse(content) as Erc8004Registration;
          const validation = validateErc8004Registration(parsed);

          if (!validation.valid) {
            console.error(chalk.red('❌ Registration invalid'));
            for (const error of validation.errors) {
              console.error(chalk.red(`  • ${error}`));
            }
            process.exit(1);
          }

          console.log(chalk.green('✅ Registration is valid'));
          console.log(chalk.gray(`File: ${filePath}`));
        } catch (error) {
          console.error(chalk.red(`❌ Failed to validate identity registration: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('sync')
      .description('Sync local registration from remote ERC-8004 registry endpoint')
      .option('--env <environment>', 'Target environment (testnet, mainnet, devnet)')
      .option('--file <path>', 'Local registration path', '.well-known/agent-registration.json')
      .option('--registry-base-url <url>', 'Registry API base URL (or set IDENTITY_REGISTRY_BASE_URL)')
      .option('--agent-id <id>', 'On-chain agent id (overrides config)')
      .option('--agent-registry <value>', 'On-chain registry identifier (overrides config)')
      .option('--dry-run', 'Show differences without writing file', false)
      .option('--strict', 'Fail if local and remote registration differ', false)
      .action(async (options) => {
        try {
          const projectRoot = await ensureProjectRoot();
          const env = parseEnvOption(options.env);
          const config = saisoConfig.loadConfig(env, projectRoot);

          const registryBaseUrl = options.registryBaseUrl || process.env.IDENTITY_REGISTRY_BASE_URL;
          if (!registryBaseUrl) {
            throw new Error('Missing registry base URL. Pass --registry-base-url or set IDENTITY_REGISTRY_BASE_URL.');
          }

          const agentRegistry = options.agentRegistry || config.identity?.agentRegistry;
          if (!agentRegistry) {
            throw new Error('Missing agent registry. Set IDENTITY_AGENT_REGISTRY or pass --agent-registry.');
          }

          const rawAgentId = options.agentId || config.identity?.agentId;
          if (!rawAgentId) {
            throw new Error('Missing agent id. Set IDENTITY_AGENT_ID or pass --agent-id.');
          }
          const parsedAgentId = parseAgentId(rawAgentId);

          const client = new Erc8004RegistryClient({
            baseUrl: registryBaseUrl.replace(/\/$/, ''),
          });

          const remote = await client.getAgent(agentRegistry, String(parsedAgentId));
          const validation = validateErc8004Registration(remote);
          if (!validation.valid) {
            throw new Error(`Remote registration invalid: ${validation.errors.join('; ')}`);
          }

          const outputPath = path.resolve(projectRoot, options.file);

          let local: Erc8004Registration | null = null;
          try {
            const localContent = await readFile(outputPath, 'utf-8');
            local = JSON.parse(localContent) as Erc8004Registration;
          } catch {
            local = null;
          }

          const diff = topLevelDiff(local, remote);

          console.log(chalk.bold('🔄 ERC-8004 Sync Summary'));
          console.log(chalk.gray(`Registry Base URL: ${registryBaseUrl}`));
          console.log(chalk.gray(`Agent Registry: ${agentRegistry}`));
          console.log(chalk.gray(`Agent ID: ${parsedAgentId}`));
          console.log(chalk.gray(`Target File: ${outputPath}`));
          console.log(chalk.gray(`Added keys: ${diff.added.length}`));
          console.log(chalk.gray(`Removed keys: ${diff.removed.length}`));
          console.log(chalk.gray(`Changed keys: ${diff.changed.length}`));
          if (diff.changed.length > 0) {
            console.log(chalk.gray(`Changed: ${diff.changed.join(', ')}`));
          }

          const hasDiff = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

          if (options.strict && hasDiff) {
            console.error(chalk.red('❌ Strict sync failed: local registration differs from remote.'));
            if (!options.dryRun) {
              console.error(chalk.yellow('⚠️ Strict mode does not update files when drift is detected.'));
            }
            process.exit(1);
          }

          if (options.dryRun) {
            console.log(chalk.yellow('⚠️ Dry run enabled. File was not updated.'));
            return;
          }

          await mkdir(path.dirname(outputPath), { recursive: true });
          await writeFile(outputPath, `${JSON.stringify(remote, null, 2)}\n`);
          console.log(chalk.green('✅ Local registration synced from remote registry'));
        } catch (error) {
          console.error(chalk.red(`❌ Failed to sync identity registration: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  );
