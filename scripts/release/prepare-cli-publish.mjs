#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

async function main() {
  const args = parseArgs(process.argv);
  const expectedVersion = args.version;
  const checkOnly = args.check === 'true';

  if (!expectedVersion) {
    throw new Error('Missing required --version argument.');
  }

  const cliPkgPath = path.join(process.cwd(), 'packages', 'saiso-cli', 'package.json');
  const cliPkg = await readJson(cliPkgPath);

  const workspaceDeps = ['@saiso/core', '@saiso/plugin-sdk'];
  if (!cliPkg.dependencies || typeof cliPkg.dependencies !== 'object') {
    throw new Error('packages/saiso-cli/package.json is missing dependencies.');
  }

  const current = {};
  for (const depName of workspaceDeps) {
    if (typeof cliPkg.dependencies[depName] !== 'string') {
      throw new Error(`packages/saiso-cli/package.json is missing dependencies["${depName}"].`);
    }

    current[depName] = cliPkg.dependencies[depName];
    const allowedCurrent = current[depName] === 'workspace:*' || current[depName] === expectedVersion;
    if (!allowedCurrent) {
      throw new Error(`Unexpected ${depName} dependency value in CLI package: ${current[depName]}`);
    }
  }

  if (checkOnly) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'check',
      current,
      expectedVersion,
      matches: workspaceDeps.every((depName) => current[depName] === expectedVersion),
    }, null, 2));
    return;
  }

  for (const depName of workspaceDeps) {
    cliPkg.dependencies[depName] = expectedVersion;
  }
  await writeFile(cliPkgPath, `${JSON.stringify(cliPkg, null, 2)}\n`);

  console.log(JSON.stringify({
    ok: true,
    mode: 'write',
    file: cliPkgPath,
    previous: current,
    updated: Object.fromEntries(workspaceDeps.map((depName) => [depName, expectedVersion])),
  }, null, 2));
}

main().catch((error) => {
  console.error(`prepare-cli-publish failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
