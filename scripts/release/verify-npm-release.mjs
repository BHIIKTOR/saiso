#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const packages = [
  '@saiso/core',
  '@saiso/plugin-sdk',
  '@saiso/svm-mcp-server',
  '@saiso/cli',
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function execJson(command, args, cwd = process.cwd()) {
  const stdout = await execText(command, args, cwd);
  return JSON.parse(stdout);
}

async function execText(command, args, cwd = process.cwd()) {
  const child = execFile(command, args, {
    cwd,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr?.on('data', (chunk) => {
    stderr += chunk;
  });

  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}: ${stderr.trim()}`));
    });
  });

  return stdout;
}

async function fetchRegistryDocument(packageName) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName).replace('%40', '@')}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch npm registry document for ${packageName}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function verifyTarballReadme(packageName, version) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'saiso-npm-verify-'));
  try {
    const pack = await execJson('npm', ['pack', `${packageName}@${version}`, '--json', '--pack-destination', tmpDir], tmpDir);
    const filename = Array.isArray(pack) ? pack[0]?.filename : pack?.filename;
    if (!filename) {
      throw new Error(`npm pack did not return a filename for ${packageName}@${version}.`);
    }

    const tarball = path.join(tmpDir, filename);
    const readme = await execText('tar', ['-xOf', tarball, 'package/README.md'], tmpDir);
    if (readme.trim().length === 0) {
      throw new Error(`${packageName}@${version} tarball contains an empty README.md.`);
    }

    return readme.length;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function verifyPackage(packageName, version, distTag) {
  const packageDocument = await fetchRegistryDocument(packageName);
  const publishedVersion = packageDocument.versions?.[version]?.version;
  if (publishedVersion !== version) {
    throw new Error(`${packageName}@${version} is not visible in npm.`);
  }

  const tags = packageDocument['dist-tags'];
  if (tags?.[distTag] !== version) {
    throw new Error(`${packageName} dist-tag ${distTag} points to ${tags?.[distTag] ?? 'nothing'}, expected ${version}.`);
  }

  const tarballReadmeLength = await verifyTarballReadme(packageName, version);
  const packagePageReadmeLength = typeof packageDocument.readme === 'string' ? packageDocument.readme.length : 0;

  if (distTag === 'latest' && packagePageReadmeLength === 0) {
    throw new Error(`${packageName} package document has an empty README after publishing ${version} as latest.`);
  }

  return {
    name: packageName,
    version,
    distTag,
    packagePageReadmeLength,
    tarballReadmeLength,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const version = args.version;
  const distTag = args['dist-tag'] || 'latest';
  const retries = Number.parseInt(args.retries || '20', 10);
  const delayMs = Number.parseInt(args['delay-ms'] || '15000', 10);

  if (!version) {
    throw new Error('Missing required --version argument.');
  }

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const results = [];
      for (const packageName of packages) {
        results.push(await verifyPackage(packageName, version, distTag));
      }

      console.log(JSON.stringify({
        ok: true,
        version,
        distTag,
        packages: results,
      }, null, 2));
      return;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      console.log(`npm release verification attempt ${attempt}/${retries} failed: ${error instanceof Error ? error.message : String(error)}`);
      await delay(delayMs);
    }
  }

  throw lastError;
}

main().catch((error) => {
  console.error(`verify-npm-release failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
