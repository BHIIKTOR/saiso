#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdtemp, symlink, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = process.cwd();
const cliBinary = path.join(repoRoot, 'packages', 'saiso-cli', 'dist', 'cli.js');
const tscBinary = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const bunBinary = process.env.BUN_BINARY || 'bun';
const localBunDir = path.join(os.homedir(), '.bun', 'bin');
if (!process.env.PATH?.split(path.delimiter).includes(localBunDir)) {
  process.env.PATH = `${localBunDir}${path.delimiter}${process.env.PATH || ''}`;
}
process.env.SAISO_SKIP_PACKAGE_INSTALL ??= 'true';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function run(command, args, cwd, options = {}) {
  const child = execFile(command, args, {
    cwd,
    env: process.env,
    stdio: options.quiet ? 'pipe' : 'inherit',
    timeout: 120000,
  });
  let output = '';
  child.stdout?.on('data', (chunk) => { output += chunk; });
  child.stderr?.on('data', (chunk) => { output += chunk; });

  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        if (!options.quiet && output) process.stdout.write(output);
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}\n${output}`));
    });
  });
}

async function ensureRepoNodeModules(projectDir) {
  try {
    await symlink(path.join(repoRoot, 'node_modules'), path.join(projectDir, 'node_modules'), 'dir');
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function setProjectServerType(projectDir, serverType) {
  const envPath = path.join(projectDir, '.env');
  const content = await readFile(envPath, 'utf-8');
  const next = content
    .replace(/^MCP_SERVER_TYPE=.*$/m, `MCP_SERVER_TYPE=${serverType}`)
    .replace(/^NETWORK=.*$/m, serverType === 'svm' ? 'NETWORK=solana-devnet' : 'NETWORK=sepolia');
  await writeFile(envPath, next);
}

async function createProject(tempRoot, name) {
  await run('node', [cliBinary, 'new', name, '--yes', '--path', tempRoot], repoRoot, { quiet: true });
  return path.join(tempRoot, name);
}

async function addFeatures(projectDir, features) {
  for (const feature of features) {
    await run('node', [cliBinary, 'add', feature, '--yes'], projectDir, { quiet: true });
  }
}

async function verifyGeneratedProject(projectDir) {
  await ensureRepoNodeModules(projectDir);
  await run(tscBinary, ['-p', 'tsconfig.json', '--noEmit'], projectDir);
  await run(bunBinary, ['test', './src/tests'], projectDir);
}

async function assertCommandFails(projectDir, args, expectedText) {
  try {
    await execFileAsync('node', [cliBinary, ...args], { cwd: projectDir, env: process.env });
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}`;
    if (!output.includes(expectedText)) {
      throw new Error(`Expected failure output to include "${expectedText}", got:\n${output}`);
    }
    return;
  }
  throw new Error(`Expected command to fail: saiso ${args.join(' ')}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const keepTemp = args['keep-temp'] === 'true';

  await run('npm', ['--workspace', 'packages/saiso-cli', 'run', 'build'], repoRoot);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'saiso-generated-template-regression-'));
  const correctedFeatures = [
    'allowance_and_permission_manager',
    'cross_chain_intent_router',
    'event_ingest_and_triggers',
    'local_strategy_test_harness',
    'observability_and_incident_hooks',
    'oracle_and_market_data_layer',
    'portfolio_state_and_pnl',
    'scheduler_and_workflow_runner',
    'privy_accounts',
    'privy_actions_swap',
    'privy_intents_router',
    'privy_policy_controls',
    'privy_webhook_ingest',
  ];
  const evmProject = await createProject(tempRoot, 'smoke-evm');
  await addFeatures(evmProject, [
    'quote_and_swap',
    'tx_lifecycle_manager',
    'policy_guardrails_runtime',
    'preflight_risk_checks',
    'privy_wallet_lifecycle',
    'privy_balance_and_history',
    'privy_transfer',
    'privy_signing_evm',
    'gas_estimation',
    ...correctedFeatures,
    'privy_advanced_execution_evm',
  ]);
  await verifyGeneratedProject(evmProject);

  const dependencyProject = await createProject(tempRoot, 'smoke-auto-deps');
  await addFeatures(dependencyProject, ['privy_transfer']);
  await verifyGeneratedProject(dependencyProject);

  const svmProject = await createProject(tempRoot, 'smoke-svm');
  await setProjectServerType(svmProject, 'svm');
  await addFeatures(svmProject, [
    'quote_and_swap',
    'tx_lifecycle_manager',
    'privy_signing_svm',
    ...correctedFeatures,
  ]);
  await verifyGeneratedProject(svmProject);
  await assertCommandFails(
    svmProject,
    ['add', 'privy_signing_evm', '--yes'],
    "Feature 'privy_signing_evm' is not compatible with SVM projects."
  );

  console.log(JSON.stringify({
    ok: true,
    tempRoot,
    projects: {
      evm: evmProject,
      autoDeps: dependencyProject,
      svm: svmProject,
    },
  }, null, 2));

  if (!keepTemp) {
    await import('node:fs/promises').then(({ rm }) => rm(tempRoot, { recursive: true, force: true }));
  }
}

main().catch((error) => {
  console.error(`generated-template-regression failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
