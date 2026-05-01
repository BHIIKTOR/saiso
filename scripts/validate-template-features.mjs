#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const templateRoots = [
  path.join(repoRoot, 'templates', 'features'),
  path.join(repoRoot, 'templates', 'features-evm'),
  path.join(repoRoot, 'templates', 'features-svm'),
];
const baselineFeatureDependencies = new Set([
  '@elizaos/core',
  '@saiso/core',
  'dotenv',
]);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFeatureDirs(rootDir) {
  if (!(await exists(rootDir))) {
    return [];
  }

  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name));
}

function extractImportSpecifiers(source) {
  const out = new Set();
  const patterns = [
    /import\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /export\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = pattern.exec(source)) !== null) {
      out.add(match[1]);
    }
  }

  return Array.from(out);
}

function isExternalPackageImport(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) {
    return false;
  }
  if (specifier.startsWith('node:') || specifier.startsWith('bun:')) {
    return false;
  }
  if (specifier === 'bun:test') {
    return false;
  }
  return true;
}

function normalizePackageName(specifier) {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return specifier;
  }
  return specifier.split('/')[0];
}

function trimSourceExtension(filePath) {
  return filePath.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
}

function canonicalFeatureSourcePath(filePath) {
  return trimSourceExtension(path.normalize(filePath))
    .replace(/\\/g, '/')
    .replace(/^(\.\.\/)+features\//, '')
    .replace(/^features\//, '');
}

function resolveCopiedFeatureDestination(config, fromSource, specifier) {
  if (!specifier.startsWith('.')) {
    return undefined;
  }

  const sourceDir = path.dirname(fromSource);
  const normalizedTarget = canonicalFeatureSourcePath(path.join(sourceDir, specifier));
  const match = config.files.find((file) =>
    trimSourceExtension(path.normalize(file.source)).replace(/\\/g, '/') === normalizedTarget
  );
  return match?.destination;
}

async function loadFeatureDependencyConfigs(featureName) {
  const configs = [];
  for (const root of templateRoots) {
    const configPath = path.join(root, featureName, 'config.json');
    if (!(await exists(configPath))) {
      continue;
    }
    const raw = await fs.readFile(configPath, 'utf-8');
    configs.push(JSON.parse(raw));
  }
  return configs;
}

function resolveRuntimeImportDestination(configs, currentFeature, fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return undefined;
  }
  const sourceDir = path.dirname(`${currentFeature}/${fromFile.source}`);
  const normalizedTarget = canonicalFeatureSourcePath(path.join(sourceDir, specifier));

  for (const config of configs) {
    for (const file of config.files || []) {
      const virtualSource = canonicalFeatureSourcePath(`${config.name}/${file.source}`);
      if (virtualSource === normalizedTarget) {
        return file.destination;
      }
    }
  }

  return undefined;
}

function resolveRegistryImportDestination(config, importLine) {
  const actionImport = importLine.match(/^import\s+\{[^}]+\}\s+from\s+['"](\.[^'"]+)['"];?$/);
  if (!actionImport) {
    return true;
  }

  const configuredTarget = actionImport[1].replace(/^\.\//, '');
  return config.files.some((file) => {
    const destination = file.destination.replace(/^src\//, '').replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '.js');
    return destination === configuredTarget || destination.endsWith(`/${path.basename(configuredTarget)}`);
  });
}

const failures = [];

for (const root of templateRoots) {
  const features = await listFeatureDirs(root);
  for (const featureDir of features) {
    const configPath = path.join(featureDir, 'config.json');
    if (!(await exists(configPath))) {
      failures.push(`Missing config.json for feature directory: ${featureDir}`);
      continue;
    }

    const raw = await fs.readFile(configPath, 'utf-8');
    let config;
    try {
      config = JSON.parse(raw);
    } catch (error) {
      failures.push(`Invalid JSON in ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (!Array.isArray(config.files)) {
      failures.push(`config.files must be an array in ${configPath}`);
      continue;
    }

    if (
      config.serverType
      && config.serverType !== 'evm'
      && config.serverType !== 'svm'
      && config.serverType !== 'universal'
    ) {
      failures.push(`config.serverType must be evm, svm, or universal in ${configPath}`);
    }

    const featureDependencies = Array.isArray(config.featureDependencies)
      ? config.featureDependencies
      : [];
    if (config.featureDependencies !== undefined && !Array.isArray(config.featureDependencies)) {
      failures.push(`config.featureDependencies must be an array in ${configPath}`);
    }

    const dependencyConfigs = [];
    for (const dependency of featureDependencies) {
      if (typeof dependency !== 'string' || !dependency.trim()) {
        failures.push(`config.featureDependencies contains a non-string entry in ${configPath}`);
        continue;
      }
      const matches = await loadFeatureDependencyConfigs(dependency);
      if (matches.length === 0) {
        failures.push(`Feature dependency '${dependency}' in ${configPath} does not exist`);
      }
      dependencyConfigs.push(...matches);
    }

    for (const importLine of config.integration?.imports || []) {
      if (!resolveRegistryImportDestination(config, importLine)) {
        failures.push(`Feature registry import does not map to copied file in ${configPath}: ${importLine}`);
      }
    }

    const declaredDeps = new Set(Object.keys(config.dependencies || {}));
    for (const file of config.files) {
      if (!file || typeof file.source !== 'string') {
        failures.push(`config.files entry missing source in ${configPath}`);
        continue;
      }

      const sourcePath = path.join(featureDir, file.source);
      if (!(await exists(sourcePath))) {
        failures.push(`Missing feature source file referenced by config: ${sourcePath}`);
        continue;
      }

      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.source)) {
        continue;
      }

      const source = await fs.readFile(sourcePath, 'utf-8');
      const imports = extractImportSpecifiers(source);
      for (const specifier of imports) {
        if (specifier.startsWith('.')) {
          const copiedDestination = resolveCopiedFeatureDestination(config, file.source, specifier);
          const dependencyDestination = resolveRuntimeImportDestination(
            [config, ...dependencyConfigs],
            config.name,
            file,
            specifier
          );
          if (!copiedDestination && !dependencyDestination) {
            failures.push(
              `Relative import '${specifier}' in ${sourcePath} does not map to another copied feature file. `
              + `Add the target to config.files or update the import.`
            );
          }
          continue;
        }

        if (!isExternalPackageImport(specifier)) {
          continue;
        }
        const packageName = normalizePackageName(specifier);
        if (!declaredDeps.has(packageName) && !baselineFeatureDependencies.has(packageName)) {
          failures.push(
            `Undeclared external dependency '${packageName}' in ${sourcePath}. `
            + `Add it to feature config.dependencies or baseline scaffold dependencies.`
          );
        }
      }
    }
  }
}

if (failures.length > 0) {
  // eslint-disable-next-line no-console
  console.error('Template feature validation failed:');
  for (const failure of failures) {
    // eslint-disable-next-line no-console
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log('Template feature validation passed.');
