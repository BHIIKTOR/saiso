#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

async function run(command, args, cwd) {
  const child = execFile(command, args, { cwd, env: process.env, stdio: 'inherit' });
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

async function runCapture(command, args, cwd) {
  const { stdout } = await execFileAsync(command, args, { cwd, env: process.env });
  return stdout.trim();
}

async function assertBunAvailable() {
  try {
    await execFileAsync('bun', ['--version'], { env: process.env });
  } catch {
    throw new Error('bun must be available in PATH to build packages/saiso-cli. Example: PATH=$HOME/.bun/bin:$PATH');
  }
}

async function packWorkspace(workspaceDir, packDestinationDir) {
  const output = await runCapture('npm', ['pack', '--pack-destination', packDestinationDir], workspaceDir);
  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1];
}

async function main() {
  const args = parseArgs(process.argv);
  const expectedVersion = args.version;
  const keepTemp = args['keep-temp'] === 'true';

  if (!expectedVersion) {
    throw new Error('Missing required --version argument.');
  }

  const rootDir = process.cwd();
  const coreDir = path.join(rootDir, 'packages', 'saiso-core');
  const cliDir = path.join(rootDir, 'packages', 'saiso-cli');
  const pluginSdkDir = path.join(rootDir, 'packages', 'saiso-plugin-sdk');
  const svmDir = path.join(rootDir, 'packages', 'saiso-svm-mcp-server');
  const cliPkgPath = path.join(cliDir, 'package.json');

  await assertBunAvailable();
  await run('node', ['scripts/release/validate-release.mjs', '--version', expectedVersion], rootDir);
  await run('npm', ['--workspace', 'packages/saiso-core', 'run', 'build'], rootDir);
  await run('npm', ['--workspace', 'packages/saiso-plugin-sdk', 'run', 'build'], rootDir);
  await run('npm', ['--workspace', 'packages/saiso-svm-mcp-server', 'run', 'build'], rootDir);
  await run('npm', ['--workspace', 'packages/saiso-cli', 'run', 'build'], rootDir);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'saiso-release-'));
  const tarDir = path.join(tempRoot, 'tarballs');
  const installDir = path.join(tempRoot, 'install-smoke');

  await mkdir(tarDir, { recursive: true });
  await mkdir(installDir, { recursive: true });

  const originalCliPkg = await readFile(cliPkgPath, 'utf-8');

  let coreTarball;
  let pluginSdkTarball;
  let svmTarball;
  let cliTarball;

  try {
    coreTarball = await packWorkspace(coreDir, tarDir);
    pluginSdkTarball = await packWorkspace(pluginSdkDir, tarDir);
    svmTarball = await packWorkspace(svmDir, tarDir);

    const cliPkg = JSON.parse(originalCliPkg);
    if (
      !cliPkg.dependencies
      || typeof cliPkg.dependencies['@saiso/core'] !== 'string'
      || typeof cliPkg.dependencies['@saiso/plugin-sdk'] !== 'string'
    ) {
      throw new Error('CLI package missing workspace package dependencies.');
    }
    cliPkg.dependencies['@saiso/core'] = expectedVersion;
    cliPkg.dependencies['@saiso/plugin-sdk'] = expectedVersion;
    await writeFile(cliPkgPath, `${JSON.stringify(cliPkg, null, 2)}\n`);

    cliTarball = await packWorkspace(cliDir, tarDir);
  } finally {
    await writeFile(cliPkgPath, originalCliPkg);
  }

  await run('npm', ['init', '-y'], installDir);
  await run(
    'npm',
    [
      'install',
      path.join(tarDir, coreTarball),
      path.join(tarDir, pluginSdkTarball),
      path.join(tarDir, svmTarball),
      path.join(tarDir, cliTarball),
    ],
    installDir
  );

  await run('node', ['-e', "import('@saiso/core').then(() => console.log('core-import-ok'))"], installDir);
  await run('node', ['-e', "import('@saiso/plugin-sdk').then(() => console.log('plugin-sdk-import-ok'))"], installDir);
  await run('node', ['-e', "import('@saiso/svm-mcp-server').then(() => console.log('svm-import-ok'))"], installDir);

  const cliBinary = path.join(installDir, 'node_modules', '.bin', process.platform === 'win32' ? 'saiso.cmd' : 'saiso');
  await run(cliBinary, ['--help'], installDir);

  console.log(JSON.stringify({
    ok: true,
    version: expectedVersion,
    tarballs: {
      core: coreTarball,
      pluginSdk: pluginSdkTarball,
      svm: svmTarball,
      cli: cliTarball,
    },
    tempRoot,
  }, null, 2));

  if (!keepTemp) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`smoke-pack-install failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
