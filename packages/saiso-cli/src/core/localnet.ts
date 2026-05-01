import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeCommand } from './utils.js';

export interface LocalnetHookPlan {
  setupScript?: string;
  deployScript?: string;
  testScript?: string;
  foundryFallback: boolean;
}

export interface LocalnetScenarioDefinition {
  id: string;
  title: string;
  description: string;
}

export interface LocalnetScenarioAssertion {
  id: string;
  pass: boolean;
  message: string;
}

export interface LocalnetScenarioTxStatus {
  txId: string;
  status: 'pending' | 'confirmed' | 'reverted' | 'failed' | 'unknown';
  note?: string;
}

export interface LocalnetScenarioArtifact {
  id: string;
  title: string;
  description: string;
  status: 'passed' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  actionTrace: LocalnetActionTraceEntry[];
  decisionLog: string[];
  txStatuses: LocalnetScenarioTxStatus[];
  assertions: LocalnetScenarioAssertion[];
  assertionSummary: {
    total: number;
    passed: number;
    failed: number;
  };
  notes?: string[];
}

export interface LocalnetRunArtifact {
  generatedAt: string;
  chainFamily: 'evm';
  rpcUrl: string;
  chainId: number;
  scenarioCount: number;
  passed: number;
  failed: number;
  scenarios: LocalnetScenarioArtifact[];
}

interface HookRunResult {
  actionTrace: LocalnetActionTraceEntry[];
}

interface HookResultStage {
  name: 'setup' | 'deploy' | 'test';
  command: string;
  status: 'passed' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  detail?: string;
}

export interface RunLocalnetEvmOptions {
  projectRoot: string;
  keepOnFail?: boolean;
  allowLivePayments?: boolean;
  composeFilePath?: string;
  scenarios?: string[];
  artifactPath?: string;
}

const DEFAULT_ANVIL_IMAGE = 'ghcr.io/foundry-rs/foundry:v1.3.1';
const DEFAULT_ANVIL_PORT = 8545;
const DEFAULT_CHAIN_ID = 31337;

const DEFAULT_EVM_SCENARIOS: LocalnetScenarioDefinition[] = [
  {
    id: 'safe-execution-pass',
    title: 'Safe Execution Pass Path',
    description: 'Expected happy path where policy and execution checks pass end-to-end.',
  },
  {
    id: 'policy-denial-before-spend',
    title: 'Policy Denial Before Spend',
    description: 'Action is blocked before spend when policy/trust limits are violated.',
  },
  {
    id: 'slippage-breach-abort',
    title: 'Slippage Breach Abort',
    description: 'Execution aborts when observed slippage exceeds configured threshold.',
  },
  {
    id: 'tx-lifecycle-retry-replace-cancel',
    title: 'Transaction Lifecycle Retry/Replace/Cancel',
    description: 'Exercise retry, replacement, and cancellation paths for pending transactions.',
  },
  {
    id: 'stale-oracle-data-block',
    title: 'Stale Oracle Data Block',
    description: 'Execution is denied when market data freshness constraints are violated.',
  },
  {
    id: 'receipt-and-trust-signal-update',
    title: 'Receipt and Trust Signal Update',
    description: 'Run produces receipt metadata and updates trust-related decision signals.',
  },
];

export function isLikelyMainnetNetwork(network: string): boolean {
  const lower = network.toLowerCase();
  return lower.includes('mainnet')
    || lower === 'ethereum'
    || lower === 'polygon'
    || lower === 'base'
    || lower === 'arbitrum';
}

export function getDefaultEvmLocalnetScenarios(): LocalnetScenarioDefinition[] {
  return DEFAULT_EVM_SCENARIOS.map((scenario) => ({ ...scenario }));
}

export function resolveEvmLocalnetScenarios(requested?: string[]): LocalnetScenarioDefinition[] {
  if (!requested || requested.length === 0) {
    return getDefaultEvmLocalnetScenarios();
  }

  const requestedSet = new Set(requested.map((value) => value.trim()).filter(Boolean));
  const selected = DEFAULT_EVM_SCENARIOS.filter((scenario) => requestedSet.has(scenario.id));
  const unknown = [...requestedSet].filter((id) => !DEFAULT_EVM_SCENARIOS.some((scenario) => scenario.id === id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown localnet scenario id(s): ${unknown.join(', ')}. `
      + `Valid values: ${DEFAULT_EVM_SCENARIOS.map((scenario) => scenario.id).join(', ')}`
    );
  }

  return selected.map((scenario) => ({ ...scenario }));
}

export async function resolveLocalnetHookPlan(projectRoot: string): Promise<LocalnetHookPlan> {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  let setupScript: string | undefined;
  let deployScript: string | undefined;
  let testScript: string | undefined;

  try {
    const raw = await readFile(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    setupScript = parsed.scripts?.['localnet:setup'] ? 'localnet:setup' : undefined;
    deployScript = parsed.scripts?.['localnet:deploy'] ? 'localnet:deploy' : undefined;
    testScript = parsed.scripts?.['localnet:test'] ? 'localnet:test' : undefined;
  } catch {
    // No-op. We still support foundry fallback.
  }

  return {
    setupScript,
    deployScript,
    testScript,
    foundryFallback: existsSync(path.join(projectRoot, 'foundry.toml')),
  };
}

export async function runLocalnetEvmTestFlow(options: RunLocalnetEvmOptions): Promise<void> {
  const compose = await resolveComposeFile(options.projectRoot, options.composeFilePath);
  const hooks = await resolveLocalnetHookPlan(options.projectRoot);
  const selectedScenarios = resolveEvmLocalnetScenarios(options.scenarios);

  const commandEnv = {
    ...process.env,
    SAISO_LOCALNET: 'true',
    SAISO_TEST_LOCALNET_CHAIN: 'evm',
    PAYMENT_ENABLED: options.allowLivePayments ? (process.env.PAYMENT_ENABLED || 'false') : 'false',
    RPC_URL: process.env.SAISO_LOCALNET_RPC_URL || `http://127.0.0.1:${DEFAULT_ANVIL_PORT}`,
    CHAIN_ID: String(DEFAULT_CHAIN_ID),
  } as Record<string, string>;

  const scenarioReportDir = await mkdtemp(path.join(tmpdir(), 'saiso-localnet-scenarios-'));
  const artifactPath = options.artifactPath || path.join(options.projectRoot, '.saiso', 'localnet', 'scenario-results.json');
  const artifacts: LocalnetScenarioArtifact[] = [];

  let failed = false;
  try {
    await run('docker', ['compose', '-f', compose.path, 'up', '-d', 'anvil'], options.projectRoot);
    await waitForRpcReady(commandEnv.RPC_URL, 60_000);

    for (const scenario of selectedScenarios) {
      const startedAt = Date.now();
      const scenarioEnv = {
        ...commandEnv,
        SAISO_LOCALNET_SCENARIO: scenario.id,
        SAISO_LOCALNET_SCENARIO_TITLE: scenario.title,
        SAISO_LOCALNET_SCENARIO_DESCRIPTION: scenario.description,
        SAISO_LOCALNET_SCENARIO_REPORT: path.join(scenarioReportDir, `${scenario.id}.json`),
      };

      try {
        const hookResult = await runHookPlan(hooks, options.projectRoot, scenarioEnv);
        const merged = await buildScenarioArtifact(scenario, hookResult, scenarioEnv.SAISO_LOCALNET_SCENARIO_REPORT, startedAt, true);
        artifacts.push(merged);
      } catch (error) {
        failed = true;
        const fallbackActionTrace: LocalnetActionTraceEntry[] = [{
          step: 'scenario',
          command: scenario.id,
          status: 'failed',
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          detail: error instanceof Error ? error.message : String(error),
        }];

        const merged = await buildScenarioArtifact(scenario, { actionTrace: fallbackActionTrace }, scenarioEnv.SAISO_LOCALNET_SCENARIO_REPORT, startedAt, false, error);
        artifacts.push(merged);
      }
    }
  } catch (error) {
    failed = true;
    const logs = await executeCommand('docker', ['compose', '-f', compose.path, 'logs', '--no-color', '--tail', '120']);
    const logSnippet = logs.stdout || logs.stderr || '';
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}`
      + `${logSnippet ? `\n\nRecent docker compose logs:\n${logSnippet}` : ''}`
    );
  } finally {
    try {
      await writeLocalnetRunArtifact(artifactPath, {
        generatedAt: new Date().toISOString(),
        chainFamily: 'evm',
        rpcUrl: commandEnv.RPC_URL,
        chainId: Number(commandEnv.CHAIN_ID),
        scenarioCount: artifacts.length,
        passed: artifacts.filter((entry) => entry.status === 'passed').length,
        failed: artifacts.filter((entry) => entry.status === 'failed').length,
        scenarios: artifacts,
      });
    } finally {
      if (!options.keepOnFail || !failed) {
        await executeCommand('docker', ['compose', '-f', compose.path, 'down', '-v'], { cwd: options.projectRoot });
      }
      if (compose.temporary) {
        await rm(compose.path, { force: true });
      }
      await rm(scenarioReportDir, { recursive: true, force: true });
    }
  }

  if (failed) {
    throw new Error(
      `Localnet scenario matrix failed (${artifacts.filter((entry) => entry.status === 'failed').length}/`
      + `${artifacts.length} failed). See artifact: ${artifactPath}`
    );
  }
}

export interface LocalnetActionTraceEntry {
  step: string;
  command: string;
  status: 'passed' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  detail?: string;
}

async function runHookPlan(
  hooks: LocalnetHookPlan,
  projectRoot: string,
  env: Record<string, string>
): Promise<HookRunResult> {
  const stages: HookResultStage[] = [];

  if (hooks.setupScript) {
    await runStage(stages, 'setup', `npm run ${hooks.setupScript}`, () => run('npm', ['run', hooks.setupScript!], projectRoot, env));
  } else {
    stages.push(skippedStage('setup', 'No localnet:setup script configured'));
  }

  if (hooks.deployScript) {
    await runStage(stages, 'deploy', `npm run ${hooks.deployScript}`, () => run('npm', ['run', hooks.deployScript!], projectRoot, env));
  } else if (hooks.foundryFallback) {
    await runStage(stages, 'deploy', 'forge build', () => run('forge', ['build'], projectRoot, env));
    const deployScript = process.env.LOCALNET_FORGE_DEPLOY_SCRIPT;
    if (deployScript) {
      await runStage(
        stages,
        'deploy',
        `forge script ${deployScript} --rpc-url ${env.RPC_URL} --broadcast`,
        () => run('forge', ['script', deployScript, '--rpc-url', env.RPC_URL, '--broadcast'], projectRoot, env)
      );
    }
  } else {
    stages.push(skippedStage('deploy', 'No localnet:deploy script configured and no Foundry fallback'));
  }

  if (hooks.testScript) {
    await runStage(stages, 'test', `npm run ${hooks.testScript}`, () => run('npm', ['run', hooks.testScript!], projectRoot, env));
  } else if (hooks.foundryFallback) {
    await runStage(stages, 'test', `forge test --rpc-url ${env.RPC_URL}`, () => run('forge', ['test', '--rpc-url', env.RPC_URL], projectRoot, env));
  } else if (!hooks.setupScript && !hooks.deployScript) {
    throw new Error(
      'No localnet hooks found. Add package scripts localnet:setup/localnet:deploy/localnet:test,'
      + ' or configure Foundry with foundry.toml.'
    );
  } else {
    await runStage(stages, 'test', 'npm test', () => run('npm', ['test'], projectRoot, env));
  }

  return {
    actionTrace: stages.map((stage) => ({
      step: stage.name,
      command: stage.command,
      status: stage.status,
      startedAt: stage.startedAt,
      finishedAt: stage.finishedAt,
      durationMs: stage.durationMs,
      detail: stage.detail,
    })),
  };
}

function skippedStage(name: HookResultStage['name'], detail: string): HookResultStage {
  const now = new Date().toISOString();
  return {
    name,
    command: '<skipped>',
    status: 'skipped',
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    detail,
  };
}

async function runStage(
  stages: HookResultStage[],
  name: HookResultStage['name'],
  command: string,
  runFn: () => Promise<void>
): Promise<void> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  try {
    await runFn();
    stages.push({
      name,
      command,
      status: 'passed',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    });
  } catch (error) {
    stages.push({
      name,
      command,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

interface ExternalScenarioReport {
  actionTrace?: LocalnetActionTraceEntry[];
  decisionLog?: string[];
  txStatuses?: LocalnetScenarioTxStatus[];
  assertions?: LocalnetScenarioAssertion[];
  notes?: string[];
}

async function buildScenarioArtifact(
  scenario: LocalnetScenarioDefinition,
  hookResult: HookRunResult,
  reportPath: string,
  startedAtMs: number,
  passed: boolean,
  error?: unknown,
): Promise<LocalnetScenarioArtifact> {
  const externalReport = await readExternalScenarioReport(reportPath);
  const actionTrace = normalizeActionTrace(externalReport?.actionTrace, hookResult.actionTrace);

  const defaultDecisionLog = passed
    ? [`Scenario '${scenario.id}' completed via localnet hook plan.`]
    : [`Scenario '${scenario.id}' failed: ${error instanceof Error ? error.message : String(error)}`];

  const assertions = normalizeAssertions(externalReport?.assertions, passed);

  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    status: passed ? 'passed' : 'failed',
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    actionTrace,
    decisionLog: externalReport?.decisionLog && externalReport.decisionLog.length > 0
      ? externalReport.decisionLog
      : defaultDecisionLog,
    txStatuses: normalizeTxStatuses(externalReport?.txStatuses, actionTrace, scenario.id),
    assertions,
    assertionSummary: {
      total: assertions.length,
      passed: assertions.filter((entry) => entry.pass).length,
      failed: assertions.filter((entry) => !entry.pass).length,
    },
    notes: externalReport?.notes,
  };
}

function normalizeActionTrace(
  externalTrace: LocalnetActionTraceEntry[] | undefined,
  fallback: LocalnetActionTraceEntry[]
): LocalnetActionTraceEntry[] {
  if (!externalTrace || externalTrace.length === 0) {
    return fallback;
  }
  return externalTrace.map((entry) => ({
    step: entry.step,
    command: entry.command,
    status: entry.status,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    durationMs: entry.durationMs,
    detail: entry.detail,
  }));
}

function normalizeTxStatuses(
  entries: LocalnetScenarioTxStatus[] | undefined,
  actionTrace: LocalnetActionTraceEntry[],
  scenarioId: string,
): LocalnetScenarioTxStatus[] {
  if (!entries || entries.length === 0) {
    return actionTrace.map((entry, index) => ({
      txId: `${scenarioId}:${entry.step}:${index + 1}`,
      status: entry.status === 'passed'
        ? 'confirmed'
        : (entry.status === 'failed' ? 'failed' : 'unknown'),
      note: `${entry.step} -> ${entry.command}`,
    }));
  }
  return entries.map((entry) => ({
    txId: entry.txId,
    status: entry.status,
    note: entry.note,
  }));
}

function normalizeAssertions(
  entries: LocalnetScenarioAssertion[] | undefined,
  passed: boolean,
): LocalnetScenarioAssertion[] {
  if (!entries || entries.length === 0) {
    return [{
      id: 'hook-plan-completion',
      pass: passed,
      message: passed
        ? 'Hook plan completed for scenario'
        : 'Hook plan failed for scenario',
    }];
  }
  return entries.map((entry) => ({
    id: entry.id,
    pass: entry.pass,
    message: entry.message,
  }));
}

async function readExternalScenarioReport(reportPath: string): Promise<ExternalScenarioReport | undefined> {
  if (!existsSync(reportPath)) {
    return undefined;
  }

  try {
    const raw = await readFile(reportPath, 'utf-8');
    if (!raw.trim()) {
      return undefined;
    }
    return JSON.parse(raw) as ExternalScenarioReport;
  } catch {
    return {
      decisionLog: [`Failed to parse external scenario report at ${reportPath}; using fallback artifact fields.`],
    };
  }
}

async function writeLocalnetRunArtifact(outputPath: string, artifact: LocalnetRunArtifact): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
}

async function waitForRpcReady(rpcUrl: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
        }),
      });
      if (response.ok) {
        const json = await response.json() as { result?: string };
        if (typeof json.result === 'string') {
          return;
        }
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for localnet RPC readiness at ${rpcUrl}`);
}

async function run(
  command: string,
  args: string[],
  projectRoot: string,
  env?: Record<string, string>
): Promise<void> {
  const result = await executeCommand(command, args, { cwd: projectRoot, env });
  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
}

async function resolveComposeFile(projectRoot: string, requestedPath?: string): Promise<{ path: string; temporary: boolean }> {
  const candidate = requestedPath || path.join(projectRoot, 'docker-compose.localnet.yml');
  if (existsSync(candidate)) {
    return { path: candidate, temporary: false };
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'saiso-localnet-'));
  const tempComposePath = path.join(tempDir, 'docker-compose.localnet.yml');
  const content = `services:
  anvil:
    image: ${DEFAULT_ANVIL_IMAGE}
    entrypoint: ["anvil"]
    command: ["--host", "0.0.0.0", "--port", "${DEFAULT_ANVIL_PORT}", "--chain-id", "${DEFAULT_CHAIN_ID}"]
    ports:
      - "${DEFAULT_ANVIL_PORT}:${DEFAULT_ANVIL_PORT}"
`;
  await writeFile(tempComposePath, content);
  return { path: tempComposePath, temporary: true };
}
