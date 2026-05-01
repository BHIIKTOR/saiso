#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const packages = [
  'packages/saiso-core',
  'packages/saiso-plugin-sdk',
  'packages/saiso-svm-mcp-server',
  'packages/saiso-cli',
];

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
  const checkOnly = args.check === 'true';
  const rootDir = process.cwd();
  const changed = [];

  for (const packageDir of packages) {
    const packageJsonPath = path.join(rootDir, packageDir, 'package.json');
    const readmePath = path.join(rootDir, packageDir, 'README.md');
    const packageJson = await readJson(packageJsonPath);
    const readme = await readFile(readmePath, 'utf-8');

    const files = Array.isArray(packageJson.files) ? packageJson.files : [];
    const normalizedFiles = files.includes('README.md') ? files : ['README.md', ...files];
    const nextPackageJson = {
      ...packageJson,
      files: normalizedFiles,
      readme,
      readmeFilename: 'README.md',
    };

    const current = `${JSON.stringify(packageJson, null, 2)}\n`;
    const next = `${JSON.stringify(nextPackageJson, null, 2)}\n`;
    if (current !== next) {
      changed.push(packageJsonPath);
      if (!checkOnly) {
        await writeFile(packageJsonPath, next);
      }
    }
  }

  if (checkOnly && changed.length > 0) {
    throw new Error(`Package README metadata is out of sync: ${changed.join(', ')}`);
  }

  console.log(JSON.stringify({
    ok: true,
    mode: checkOnly ? 'check' : 'write',
    changed,
  }, null, 2));
}

main().catch((error) => {
  console.error(`sync-package-readmes failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
