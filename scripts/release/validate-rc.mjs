#!/usr/bin/env node

import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const localBunDir = path.join(os.homedir(), '.bun', 'bin');
if (!process.env.PATH?.split(path.delimiter).includes(localBunDir)) {
  process.env.PATH = `${localBunDir}${path.delimiter}${process.env.PATH || ''}`;
}

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

async function run(label, command, args) {
  console.log(`\n==> ${label}`);
  const child = execFile(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });

  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const version = args.version;
  if (!version) {
    throw new Error('Missing required --version argument.');
  }

  const skipPack = args['skip-pack'] === 'true';
  const failOnSkippedCredential = args['fail-on-skipped-credential'] === 'true';

  await run('Template feature manifest validation', 'node', ['scripts/validate-template-features.mjs']);
  await run('Template sync drift gate', 'diff', ['-rq', 'templates', 'packages/saiso-cli/templates']);
  await run('Package README metadata validation', 'node', ['scripts/release/sync-package-readmes.mjs', '--check']);
  await run('Generated template regression', 'npm', ['run', 'templates:regression']);
  await run('Core typecheck', 'npx', ['tsc', '-p', 'packages/saiso-core/tsconfig.json', '--noEmit']);
  await run('CLI typecheck', 'npx', ['tsc', '-p', 'packages/saiso-cli/tsconfig.json', '--noEmit']);
  await run('SVM MCP server typecheck', 'npx', ['tsc', '-p', 'packages/saiso-svm-mcp-server/tsconfig.json', '--noEmit']);
  await run('CLI tests', 'bun', ['test', 'packages/saiso-cli/src']);
  await run('Core tests', 'bun', ['test', 'packages/saiso-core/tests']);
  await run('SVM MCP server tests', 'bun', ['test', 'packages/saiso-svm-mcp-server/tests']);
  await run(
    'Live template smoke',
    'node',
    [
      'scripts/live-template-smoke.mjs',
      ...(failOnSkippedCredential ? ['--fail-on-skipped-credential'] : []),
    ]
  );
  await run('Release metadata validation', 'node', ['scripts/release/validate-release.mjs', '--version', version]);

  if (!skipPack) {
    await run('Release pack install smoke', 'node', ['scripts/release/smoke-pack-install.mjs', '--version', version]);
  }

  console.log(JSON.stringify({
    ok: true,
    version,
    skippedPackInstall: skipPack,
  }, null, 2));
}

main().catch((error) => {
  console.error(`validate-rc failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
