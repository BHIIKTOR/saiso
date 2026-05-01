#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

async function commandExists(command) {
  try {
    await run('bash', ['-lc', `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutable(explicit, fallbackCandidates) {
  if (explicit) {
    return explicit;
  }
  for (const candidate of fallbackCandidates) {
    if (!candidate.includes(path.sep)) {
      if (await commandExists(candidate)) {
        return candidate;
      }
      continue;
    }
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const keepTemp = args['keep-temp'] === 'true';

  const rootDir = process.cwd();
  const cliEntrypoint = path.join(rootDir, 'packages', 'saiso-cli', 'src', 'cli.ts');
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'saiso-docker-localnet-'));
  const projectName = 'docker-localnet-smoke';
  const projectDir = path.join(tmpRoot, projectName);

  const bunBin = await resolveExecutable(process.env.BUN_BIN, [
    'bun',
    path.join(os.homedir(), '.bun', 'bin', 'bun'),
  ]);
  if (!bunBin) {
    throw new Error('bun executable not found. Set BUN_BIN or add bun to PATH.');
  }

  try {
    await run('docker', ['--version']);
    await run('docker', ['info']);

    await run(bunBin, [ 'run', cliEntrypoint, 'new', projectName, '--yes', '--service-blueprint', '--path', tmpRoot ]);

    const requiredFiles = [
      'Dockerfile',
      'docker-compose.yml',
      'docker-compose.override.yml',
      'docker-compose.localnet.yml',
      path.join('scripts', 'localnet-test.sh'),
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(projectDir, file);
      await access(fullPath, fsConstants.F_OK);
    }

    await run(bunBin, [ 'run', cliEntrypoint, 'test', 'localnet', '--chain', 'evm' ], { cwd: projectDir });

    console.log(JSON.stringify({
      ok: true,
      projectDir,
      checkedFiles: requiredFiles,
    }, null, 2));
  } finally {
    if (!keepTemp) {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`docker-localnet-smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
