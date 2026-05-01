import { mkdtemp, readFile, realpath, readdir, lstat, mkdir, copyFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import type { SaisoPluginLockEntryV1 } from '@saiso/plugin-sdk';
import { PluginError } from './errors.js';
import { computeDirectoryContentSha256 } from './hash.js';
import { ensureDir, pathExists, sha256Hex } from './fs.js';
import { getArtifactPath, getGlobalPluginCacheRoot } from './paths.js';
import { assertManifestCompatibility, loadPluginManifest } from './manifest.js';

export interface InstallPluginOptions {
  spec: string;
  sourceType?: 'npm' | 'file';
  allowUnverified?: boolean;
  nonInteractive?: boolean;
  enable?: boolean;
}

export interface InstalledPluginResult {
  lockEntry: SaisoPluginLockEntryV1;
  artifactPath: string;
}

function detectSourceType(spec: string, explicit?: 'npm' | 'file'): 'npm' | 'file' {
  if (explicit) {
    return explicit;
  }
  if (spec.startsWith('file:')) {
    return 'file';
  }
  return 'npm';
}

async function copyDirectoryNoSymlink(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    const entryLstat = await lstat(sourcePath);
    if (entryLstat.isSymbolicLink()) {
      throw new PluginError('PLUGIN_SOURCE_POLICY_VIOLATION', `Symlink detected in plugin source: ${sourcePath}`, {
        phase: 'install-copy',
      });
    }

    if (entry.isDirectory()) {
      await copyDirectoryNoSymlink(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
      await chmod(destinationPath, entryLstat.mode);
    }
  }
}

async function installFromFileSource(
  spec: string,
  options: Required<Pick<InstallPluginOptions, 'allowUnverified' | 'nonInteractive' | 'enable'>>
): Promise<InstalledPluginResult> {
  let resolvedInput = spec;
  if (resolvedInput.startsWith('file:')) {
    resolvedInput = resolvedInput.slice('file:'.length);
  }
  if (resolvedInput.startsWith('~')) {
    resolvedInput = path.join(os.homedir(), resolvedInput.slice(1));
  }

  const absoluteSource = path.resolve(process.cwd(), resolvedInput);
  const canonicalSource = await realpath(absoluteSource);

  if (!options.allowUnverified) {
    if (options.nonInteractive) {
      throw new PluginError(
        'PLUGIN_UNVERIFIED_SOURCE_REJECTED',
        'Unverified file-source install rejected in non-interactive mode. Use --allow-unverified to proceed.',
        { phase: 'install-policy', sourceType: 'file' }
      );
    }

    const inquirer = await import('inquirer');
    const answer = await inquirer.default.prompt([{
      type: 'confirm',
      name: 'acceptUnverified',
      default: false,
      message: `Install unverified file-source plugin from '${canonicalSource}'?`,
    }]);

    if (!answer.acceptUnverified) {
      throw new PluginError(
        'PLUGIN_UNVERIFIED_SOURCE_REJECTED',
        'Unverified file-source install rejected by user consent prompt.',
        { phase: 'install-policy', sourceType: 'file' }
      );
    }
  }

  const contentSha256 = await computeDirectoryContentSha256(canonicalSource);
  const artifactKey = `file-${sha256Hex(`${canonicalSource}\0${contentSha256}`)}`;
  const artifactPath = getArtifactPath(artifactKey);

  if (!(await pathExists(artifactPath))) {
    await ensureDir(getGlobalPluginCacheRoot());
    await copyDirectoryNoSymlink(canonicalSource, artifactPath);
  }

  const { manifest, manifestSha256 } = await loadPluginManifest(artifactPath);
  assertManifestCompatibility(manifest);

  const lockEntry: SaisoPluginLockEntryV1 = {
    id: manifest.id,
    version: manifest.version,
    manifestVersion: manifest.manifestVersion,
    pluginApiVersion: manifest.pluginApiVersion,
    saisoRange: manifest.saisoRange,
    sourceType: 'file',
    artifactKey,
    entry: manifest.entry,
    enabled: options.enable,
    verification: 'unverified',
    manifestSha256,
    filePath: canonicalSource,
    contentSha256,
  };

  return { lockEntry, artifactPath };
}

interface NpmViewDist {
  tarball?: string;
  integrity?: string;
}

interface NpmViewResult {
  version?: string;
  dist?: NpmViewDist;
}

interface NpmPackResult {
  filename: string;
}

async function installFromNpmSource(
  spec: string,
  options: Required<Pick<InstallPluginOptions, 'enable'>>
): Promise<InstalledPluginResult> {
  let viewJson: NpmViewResult;
  try {
    const { stdout } = await execa('npm', ['view', spec, '--json']);
    viewJson = JSON.parse(stdout) as NpmViewResult;
  } catch (error) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `Failed to resolve npm package '${spec}'.`, {
      phase: 'install-npm-view',
      sourceType: 'npm',
      cause: error,
    });
  }

  const resolved = viewJson.dist?.tarball;
  const integrity = viewJson.dist?.integrity;
  if (!resolved || !integrity) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `npm package '${spec}' did not return dist.tarball and dist.integrity.`, {
      phase: 'install-npm-view',
      sourceType: 'npm',
    });
  }

  const artifactKey = `npm-${sha256Hex(`${resolved}\0${integrity}`)}`;
  const artifactPath = getArtifactPath(artifactKey);

  if (!(await pathExists(artifactPath))) {
    await ensureDir(getGlobalPluginCacheRoot());
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-npm-'));

    let packResult: NpmPackResult[];
    try {
      const { stdout } = await execa('npm', ['pack', spec, '--json'], { cwd: tempDir });
      packResult = JSON.parse(stdout) as NpmPackResult[];
    } catch (error) {
      throw new PluginError('PLUGIN_MANIFEST_INVALID', `Failed to fetch npm package '${spec}' via npm pack.`, {
        phase: 'install-npm-pack',
        sourceType: 'npm',
        cause: error,
      });
    }

    const tarFile = packResult[0]?.filename;
    if (!tarFile) {
      throw new PluginError('PLUGIN_MANIFEST_INVALID', `npm pack did not return a tarball filename for '${spec}'.`, {
        phase: 'install-npm-pack',
        sourceType: 'npm',
      });
    }

    const tarballPath = path.join(tempDir, tarFile);
    await mkdir(artifactPath, { recursive: true });

    try {
      await execa('tar', ['-xzf', tarballPath, '-C', artifactPath, '--strip-components=1']);
    } catch (error) {
      throw new PluginError('PLUGIN_MANIFEST_INVALID', `Failed to extract npm plugin archive '${spec}'.`, {
        phase: 'install-npm-extract',
        sourceType: 'npm',
        cause: error,
      });
    }
  }

  const { manifest, manifestSha256 } = await loadPluginManifest(artifactPath);
  assertManifestCompatibility(manifest);

  const lockEntry: SaisoPluginLockEntryV1 = {
    id: manifest.id,
    version: manifest.version,
    manifestVersion: manifest.manifestVersion,
    pluginApiVersion: manifest.pluginApiVersion,
    saisoRange: manifest.saisoRange,
    sourceType: 'npm',
    artifactKey,
    entry: manifest.entry,
    enabled: options.enable,
    verification: 'verified',
    manifestSha256,
    resolved,
    integrity,
  };

  return { lockEntry, artifactPath };
}

export async function installPlugin(options: InstallPluginOptions): Promise<InstalledPluginResult> {
  const sourceType = detectSourceType(options.spec, options.sourceType);
  const nonInteractive = options.nonInteractive ?? !process.stdin.isTTY;

  const looksLikeFilePath =
    options.spec.startsWith('./')
    || options.spec.startsWith('../')
    || options.spec.startsWith('/')
    || options.spec.startsWith('~');
  if (looksLikeFilePath && sourceType !== 'file') {
    throw new PluginError(
      'PLUGIN_SOURCE_POLICY_VIOLATION',
      "File-source plugin install requires explicit source declaration ('--source file' or 'file:' URI).",
      { phase: 'install-policy' }
    );
  }

  if (sourceType === 'file') {
    return installFromFileSource(options.spec, {
      allowUnverified: options.allowUnverified ?? false,
      nonInteractive,
      enable: options.enable ?? false,
    });
  }

  return installFromNpmSource(options.spec, {
    enable: options.enable ?? false,
  });
}

export async function resolveArtifactManifest(entry: SaisoPluginLockEntryV1): Promise<{ pluginRoot: string; manifestSha256: string }> {
  const pluginRoot = getArtifactPath(entry.artifactKey);
  const exists = await pathExists(pluginRoot);
  if (!exists) {
    throw new PluginError('PLUGIN_ARTIFACT_NOT_FOUND', `Plugin artifact '${entry.artifactKey}' not found in cache.`, {
      pluginId: entry.id,
      phase: 'load-artifact',
      sourceType: entry.sourceType,
    });
  }

  const manifestPath = path.join(pluginRoot, 'saiso-plugin.json');
  const raw = await readFile(manifestPath, 'utf-8');
  return {
    pluginRoot,
    manifestSha256: sha256Hex(raw),
  };
}
