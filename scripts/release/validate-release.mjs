#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
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
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

async function main() {
  const args = parseArgs(process.argv);
  const rootDir = process.cwd();

  const expectedVersion = args.version;
  if (!expectedVersion) {
    throw new Error('Missing required --version argument.');
  }

  const rootPkg = await readJson(path.join(rootDir, 'package.json'));
  const corePkg = await readJson(path.join(rootDir, 'packages', 'saiso-core', 'package.json'));
  const cliPkg = await readJson(path.join(rootDir, 'packages', 'saiso-cli', 'package.json'));
  const pluginSdkPkg = await readJson(path.join(rootDir, 'packages', 'saiso-plugin-sdk', 'package.json'));
  const svmPkg = await readJson(path.join(rootDir, 'packages', 'saiso-svm-mcp-server', 'package.json'));

  const versions = {
    root: rootPkg.version,
    core: corePkg.version,
    cli: cliPkg.version,
    pluginSdk: pluginSdkPkg.version,
    svm: svmPkg.version,
  };

  const mismatched = Object.entries(versions).filter(([, value]) => value !== expectedVersion);
  if (mismatched.length > 0) {
    throw new Error(
      `Version mismatch. Expected ${expectedVersion}. Found: ${mismatched.map(([name, value]) => `${name}=${value}`).join(', ')}`
    );
  }

  if (rootPkg.private !== true) {
    throw new Error('Root package.json must set "private": true to prevent accidental publish.');
  }

  if (typeof corePkg.name !== 'string' || corePkg.name !== '@saiso/core') {
    throw new Error('Unexpected core package name.');
  }
  if (typeof cliPkg.name !== 'string' || cliPkg.name !== '@saiso/cli') {
    throw new Error('Unexpected CLI package name.');
  }
  if (typeof pluginSdkPkg.name !== 'string' || pluginSdkPkg.name !== '@saiso/plugin-sdk') {
    throw new Error('Unexpected plugin SDK package name.');
  }
  if (typeof svmPkg.name !== 'string' || svmPkg.name !== '@saiso/svm-mcp-server') {
    throw new Error('Unexpected SVM MCP server package name.');
  }

  if (
    !Array.isArray(rootPkg.workspaces)
    || !rootPkg.workspaces.includes('packages/saiso-core')
    || !rootPkg.workspaces.includes('packages/saiso-cli')
    || !rootPkg.workspaces.includes('packages/saiso-plugin-sdk')
    || !rootPkg.workspaces.includes('packages/saiso-svm-mcp-server')
  ) {
    throw new Error('Root workspaces must include packages/saiso-core, packages/saiso-cli, packages/saiso-plugin-sdk, and packages/saiso-svm-mcp-server.');
  }

  console.log(JSON.stringify({
    ok: true,
    version: expectedVersion,
    packages: versions,
  }, null, 2));
}

main().catch((error) => {
  console.error(`validate-release failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
