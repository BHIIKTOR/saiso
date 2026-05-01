import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import type {
  SaisoPluginContext,
  SaisoPluginLockEntryV1,
  SaisoPluginManifest,
  SaisoPluginModule,
} from '@saiso/plugin-sdk';
import { PluginError, asPluginError } from './errors.js';
import { getArtifactPath, getProjectPaths } from './paths.js';
import { pathExists, sha256Hex, writeJsonAtomic } from './fs.js';
import { assertManifestCompatibility, loadPluginManifest } from './manifest.js';
import { validatePluginConfig, readPluginConfig, writePluginConfig } from './config.js';
import { resolveArtifactManifest } from './install.js';
import { SAISO_PLUGIN_ERROR_REPORT_SCHEMA_VERSION } from './constants.js';
import { computeDirectoryContentSha256 } from './hash.js';

interface CommandTreeStats {
  commandPaths: string[];
  aliasPaths: string[];
}

function collectCommandTree(command: Command, prefix: string[] = [], out: CommandTreeStats = { commandPaths: [], aliasPaths: [] }): CommandTreeStats {
  for (const child of command.commands) {
    const commandPath = [...prefix, child.name()].join(' ');
    out.commandPaths.push(commandPath);

    for (const alias of child.aliases()) {
      out.aliasPaths.push([...prefix, alias].join(' '));
    }

    collectCommandTree(child, [...prefix, child.name()], out);
  }

  return out;
}

function firstDuplicate(items: string[]): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) {
      return item;
    }
    seen.add(item);
  }
  return null;
}

function assertNoCommandCollisions(baseProgram: Command, candidateProgram: Command, pluginId: string): void {
  const baseTree = collectCommandTree(baseProgram);
  const candidateTree = collectCommandTree(candidateProgram);

  const duplicateWithinCandidate = firstDuplicate([...candidateTree.commandPaths, ...candidateTree.aliasPaths]);
  if (duplicateWithinCandidate) {
    throw new PluginError('PLUGIN_COLLISION', `Plugin '${pluginId}' registers duplicate command/alias '${duplicateWithinCandidate}'.`, {
      pluginId,
      phase: 'register-commands',
    });
  }

  const reserved = new Set([...baseTree.commandPaths, ...baseTree.aliasPaths]);
  for (const commandPath of candidateTree.commandPaths) {
    if (reserved.has(commandPath)) {
      throw new PluginError('PLUGIN_COLLISION', `Plugin '${pluginId}' collides with reserved command '${commandPath}'.`, {
        pluginId,
        phase: 'register-commands',
      });
    }
  }
  for (const aliasPath of candidateTree.aliasPaths) {
    if (reserved.has(aliasPath)) {
      throw new PluginError('PLUGIN_COLLISION', `Plugin '${pluginId}' collides with reserved alias '${aliasPath}'.`, {
        pluginId,
        phase: 'register-commands',
      });
    }
  }
}

function resolveSafeProjectPath(projectRoot: string, relativePath: string): string {
  const resolved = path.resolve(projectRoot, relativePath);
  const normalizedRoot = path.resolve(projectRoot);
  const withSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;

  if (resolved !== normalizedRoot && !resolved.startsWith(withSep)) {
    throw new PluginError('PLUGIN_SOURCE_POLICY_VIOLATION', `Path traversal outside project root is not allowed: ${relativePath}`, {
      phase: 'context-fs',
    });
  }

  return resolved;
}

function createPluginContext(projectRoot: string, manifest: SaisoPluginManifest): SaisoPluginContext {
  const paths = getProjectPaths(projectRoot);
  const pluginConfigPath = path.join(paths.pluginConfigDir, `${manifest.id}.json`);
  const pluginDataDir = path.join(paths.pluginDataDir, manifest.id);

  return {
    paths: {
      projectRoot,
      saisoDir: paths.saisoDir,
      pluginConfigPath,
      pluginDataDir,
    },
    logger: {
      debug: (message: string, ...args: unknown[]) => console.debug(`[plugin:${manifest.id}]`, message, ...args),
      info: (message: string, ...args: unknown[]) => console.log(`[plugin:${manifest.id}]`, message, ...args),
      warn: (message: string, ...args: unknown[]) => console.warn(`[plugin:${manifest.id}]`, message, ...args),
      error: (message: string, ...args: unknown[]) => console.error(`[plugin:${manifest.id}]`, message, ...args),
    },
    config: {
      async readConfig<T extends Record<string, unknown> = Record<string, unknown>>() {
        const config = await readPluginConfig(manifest, pluginConfigPath);
        return config as T;
      },
      async writeConfig(next: Record<string, unknown>) {
        await writePluginConfig(manifest, pluginConfigPath, next);
      },
    },
    fs: {
      resolveProjectPath(relativePath: string) {
        return resolveSafeProjectPath(projectRoot, relativePath);
      },
      async readProjectFile(relativePath: string) {
        const absolute = resolveSafeProjectPath(projectRoot, relativePath);
        return readFile(absolute, 'utf-8');
      },
      async writeProjectFile(relativePath: string, content: string) {
        const absolute = resolveSafeProjectPath(projectRoot, relativePath);
        await mkdir(path.dirname(absolute), { recursive: true });
        await writeFile(absolute, content, 'utf-8');
      },
    },
    env: {
      get(name: string) {
        return process.env[name];
      },
    },
  };
}

async function loadPluginModule(entryPath: string, pluginId: string): Promise<SaisoPluginModule> {
  let mod: unknown;
  try {
    mod = await import(pathToFileURL(entryPath).href);
  } catch (error) {
    throw new PluginError('PLUGIN_ENTRY_LOAD_FAILED', `Failed to import plugin entry '${entryPath}'.`, {
      pluginId,
      phase: 'entry-load',
      cause: error,
    });
  }

  const candidate = mod as { default?: unknown };
  const pluginModule = (candidate.default ?? mod) as SaisoPluginModule;
  if (!pluginModule || typeof pluginModule.registerCommands !== 'function') {
    throw new PluginError('PLUGIN_ENTRY_LOAD_FAILED', `Plugin '${pluginId}' entry must export registerCommands(program, context).`, {
      pluginId,
      phase: 'entry-load',
    });
  }

  return pluginModule;
}

function verifySourceSpecificIntegrity(entry: SaisoPluginLockEntryV1): void {
  if (entry.sourceType === 'npm') {
    if (!entry.resolved || !entry.integrity) {
      throw new PluginError('PLUGIN_INTEGRITY_MISMATCH', `Plugin '${entry.id}' npm lock entry is missing resolved/integrity fields.`, {
        pluginId: entry.id,
        phase: 'integrity',
        sourceType: 'npm',
      });
    }
    const expectedArtifactKey = `npm-${sha256Hex(`${entry.resolved}\0${entry.integrity}`)}`;
    if (entry.artifactKey !== expectedArtifactKey) {
      throw new PluginError('PLUGIN_INTEGRITY_MISMATCH', `Plugin '${entry.id}' npm artifactKey does not match resolved/integrity lock mapping.`, {
        pluginId: entry.id,
        phase: 'integrity',
        sourceType: 'npm',
      });
    }
    return;
  }

  if (!entry.filePath || !entry.contentSha256) {
    throw new PluginError('PLUGIN_INTEGRITY_MISMATCH', `Plugin '${entry.id}' file lock entry is missing filePath/contentSha256 fields.`, {
      pluginId: entry.id,
      phase: 'integrity',
      sourceType: 'file',
    });
  }

  const expectedArtifactKey = `file-${sha256Hex(`${entry.filePath}\0${entry.contentSha256}`)}`;
  if (entry.artifactKey !== expectedArtifactKey) {
    throw new PluginError('PLUGIN_INTEGRITY_MISMATCH', `Plugin '${entry.id}' file artifactKey does not match filePath/contentSha256 lock mapping.`, {
      pluginId: entry.id,
      phase: 'integrity',
      sourceType: 'file',
    });
  }
}

interface StartupErrorRecord {
  pluginId: string;
  code: string;
  message: string;
  phase: string;
  sourceType: 'npm' | 'file' | 'unknown';
  retryable: boolean;
}

export interface PluginStartupReport {
  schemaVersion: 1;
  generatedAt: string;
  projectRoot: string;
  strictMode: boolean;
  errors: StartupErrorRecord[];
}

async function writePluginErrorReport(projectRoot: string, strictMode: boolean, errors: StartupErrorRecord[]): Promise<void> {
  const reportPath = getProjectPaths(projectRoot).pluginErrorReportPath;
  const payload: PluginStartupReport = {
    schemaVersion: SAISO_PLUGIN_ERROR_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot,
    strictMode,
    errors,
  };

  try {
    await writeJsonAtomic(reportPath, payload);
  } catch (error) {
    console.warn(
      `PLUGIN_ERROR_REPORT_WRITE_FAILED: Failed to write plugin startup report to ${reportPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export interface LoadedPluginRuntime {
  lockEntry: SaisoPluginLockEntryV1;
  manifest: SaisoPluginManifest;
  module: SaisoPluginModule;
  context: SaisoPluginContext;
}

export async function loadPluginRuntime(projectRoot: string, lockEntry: SaisoPluginLockEntryV1): Promise<LoadedPluginRuntime> {
  verifySourceSpecificIntegrity(lockEntry);

  const artifactPath = getArtifactPath(lockEntry.artifactKey);
  if (!(await pathExists(artifactPath))) {
    throw new PluginError('PLUGIN_ARTIFACT_NOT_FOUND', `Plugin artifact '${lockEntry.artifactKey}' not found.`, {
      pluginId: lockEntry.id,
      phase: 'load-artifact',
      sourceType: lockEntry.sourceType,
    });
  }

  const { pluginRoot, manifestSha256 } = await resolveArtifactManifest(lockEntry);
  if (manifestSha256 !== lockEntry.manifestSha256) {
    throw new PluginError('PLUGIN_INTEGRITY_MISMATCH', `Plugin '${lockEntry.id}' manifest hash mismatch.`, {
      pluginId: lockEntry.id,
      phase: 'integrity',
      sourceType: lockEntry.sourceType,
    });
  }
  if (lockEntry.sourceType === 'file') {
    const contentSha = await computeDirectoryContentSha256(pluginRoot);
    if (contentSha !== lockEntry.contentSha256) {
      throw new PluginError('PLUGIN_INTEGRITY_MISMATCH', `Plugin '${lockEntry.id}' file-source content hash mismatch.`, {
        pluginId: lockEntry.id,
        phase: 'integrity',
        sourceType: 'file',
      });
    }
  }

  const { manifest } = await loadPluginManifest(pluginRoot);
  if (manifest.id !== lockEntry.id) {
    throw new PluginError('PLUGIN_INTEGRITY_MISMATCH', `Plugin id mismatch: lock='${lockEntry.id}' manifest='${manifest.id}'.`, {
      pluginId: lockEntry.id,
      phase: 'integrity',
      sourceType: lockEntry.sourceType,
    });
  }

  assertManifestCompatibility(manifest);

  const entryPath = path.join(pluginRoot, manifest.entry);
  const pluginModule = await loadPluginModule(entryPath, lockEntry.id);
  const context = createPluginContext(projectRoot, manifest);

  // Proactively validate persisted config when schema exists.
  if (manifest.configSchema) {
    const config = await readPluginConfig(manifest, context.paths.pluginConfigPath);
    validatePluginConfig(manifest, config);
  }

  return {
    lockEntry,
    manifest,
    module: pluginModule,
    context,
  };
}

export interface StartupLoadOptions {
  strictMode: boolean;
}

export async function registerEnabledPluginsAtStartup(
  program: Command,
  projectRoot: string,
  lockEntries: SaisoPluginLockEntryV1[],
  options: StartupLoadOptions
): Promise<{ loaded: string[]; errors: StartupErrorRecord[] }> {
  const loaded: string[] = [];
  const errors: StartupErrorRecord[] = [];

  for (const lockEntry of lockEntries) {
    if (!lockEntry.enabled) {
      continue;
    }

    try {
      const runtime = await loadPluginRuntime(projectRoot, lockEntry);

      if (runtime.module.init) {
        await runtime.module.init(runtime.context);
      }

      const sandboxProgram = new Command();
      await runtime.module.registerCommands(sandboxProgram, runtime.context);
      assertNoCommandCollisions(program, sandboxProgram, lockEntry.id);

      for (const rootCommand of sandboxProgram.commands) {
        program.addCommand(rootCommand);
      }

      loaded.push(lockEntry.id);
    } catch (error) {
      const pluginError = asPluginError(error, 'PLUGIN_ENTRY_LOAD_FAILED', `Failed loading plugin '${lockEntry.id}'.`, {
        pluginId: lockEntry.id,
        phase: 'startup-load',
        sourceType: lockEntry.sourceType,
      });

      errors.push({
        pluginId: lockEntry.id,
        code: pluginError.code,
        message: pluginError.message,
        phase: pluginError.phase,
        sourceType: pluginError.sourceType ?? 'unknown',
        retryable: pluginError.retryable,
      });

      if (options.strictMode) {
        await writePluginErrorReport(projectRoot, options.strictMode, errors);
        throw pluginError;
      }
    }
  }

  await writePluginErrorReport(projectRoot, options.strictMode, errors);
  return { loaded, errors };
}

export async function runPluginDoctor(
  projectRoot: string,
  lockEntries: SaisoPluginLockEntryV1[],
  id?: string
): Promise<Array<{ id: string; ok: boolean; result?: unknown; error?: string }>> {
  const selected = id ? lockEntries.filter((entry) => entry.id === id) : lockEntries;
  const results: Array<{ id: string; ok: boolean; result?: unknown; error?: string }> = [];

  for (const lockEntry of selected) {
    if (!lockEntry.enabled) {
      results.push({
        id: lockEntry.id,
        ok: false,
        error: 'PLUGIN_NOT_ENABLED',
      });
      continue;
    }

    try {
      const runtime = await loadPluginRuntime(projectRoot, lockEntry);
      if (!runtime.module.doctor) {
        results.push({ id: lockEntry.id, ok: true, result: { doctor: 'not-implemented' } });
        continue;
      }

      const doctorResult = await runtime.module.doctor(runtime.context);
      results.push({ id: lockEntry.id, ok: true, result: doctorResult });
    } catch (error) {
      const pluginError = asPluginError(error, 'PLUGIN_DOCTOR_FAILED', `Plugin doctor failed for '${lockEntry.id}'.`, {
        pluginId: lockEntry.id,
        phase: 'doctor',
        sourceType: lockEntry.sourceType,
      });
      results.push({ id: lockEntry.id, ok: false, error: `${pluginError.code}: ${pluginError.message}` });
    }
  }

  return results;
}
