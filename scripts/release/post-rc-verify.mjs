#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

async function run(command, args, cwd, options = {}) {
  const child = execFile(command, args, {
    cwd,
    env: process.env,
    stdio: options.quiet ? 'pipe' : 'inherit',
  });

  await new Promise((resolve, reject) => {
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

async function ensureRepoNodeModules(projectDir, repoRoot) {
  try {
    await symlink(path.join(repoRoot, 'node_modules'), path.join(projectDir, 'node_modules'), 'dir');
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
  }
}

function cliPath(installDir) {
  return path.join(
    installDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'saiso.cmd' : 'saiso'
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const version = args.version;
  const keepTemp = args['keep-temp'] === 'true';
  const repoRoot = process.cwd();

  if (!version) {
    throw new Error('Missing required --version argument.');
  }

  const rootPkg = await readJson(path.join(repoRoot, 'package.json'));
  if (rootPkg.version !== version) {
    throw new Error(`Root package version ${rootPkg.version} does not match --version ${version}.`);
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'saiso-post-rc-'));
  const installDir = path.join(tempRoot, 'install');
  const projectsDir = path.join(tempRoot, 'projects');

  try {
    await mkdir(installDir, { recursive: true });
    await mkdir(projectsDir, { recursive: true });
    await run('npm', ['init', '-y'], installDir, { quiet: true });
    await run('npm', ['install', `@saiso/cli@${version}`], installDir);

    const saiso = cliPath(installDir);
    await run(saiso, ['new', 'post-rc-smoke', '--yes', '--path', projectsDir], installDir);

    const projectDir = path.join(projectsDir, 'post-rc-smoke');
    const features = [
      'privy_client_base',
      'privy_wallet_lifecycle',
      'privy_balance_and_history',
      'privy_transfer',
      'privy_signing_evm',
      'gas_estimation',
    ];

    for (const feature of features) {
      await run(saiso, ['add', feature, '--yes'], projectDir);
    }

    await ensureRepoNodeModules(projectDir, repoRoot);
    await run('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit'], projectDir);

    console.log(JSON.stringify({
      ok: true,
      version,
      source: `@saiso/cli@${version}`,
      projectDir,
      features,
    }, null, 2));
  } finally {
    if (!keepTemp) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`post-rc-verify failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
