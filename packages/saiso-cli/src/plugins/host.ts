import type { Command } from 'commander';
import type { SaisoPluginLockEntryV1 } from '@saiso/plugin-sdk';
import { findProjectRoot, isSaisoProject } from '../core/index.js';
import { PluginError } from './errors.js';
import { installPlugin } from './install.js';
import { readProjectLockfile, writeProjectLockfile } from './lockfile.js';
import { lockEntryToGlobalMetadata, readGlobalMetadata, upsertGlobalMetadata } from './metadata.js';
import { getProjectPaths } from './paths.js';
import { registerEnabledPluginsAtStartup, runPluginDoctor } from './runtime.js';

export interface ProjectContext {
  projectRoot: string;
  lockEntries: SaisoPluginLockEntryV1[];
  lockfilePath: string;
}

export async function resolveProjectContext(
  options: { requireProject: boolean; allowMigrate?: boolean }
): Promise<ProjectContext | null> {
  const projectRoot = await findProjectRoot();
  if (!projectRoot) {
    if (options.requireProject) {
      throw new PluginError('PLUGIN_PROJECT_CONTEXT_REQUIRED', 'This command requires a SAISO project context.', {
        phase: 'project-context',
      });
    }
    return null;
  }

  if (!(await isSaisoProject(projectRoot))) {
    if (options.requireProject) {
      throw new PluginError('PLUGIN_PROJECT_CONTEXT_REQUIRED', 'Current directory is not a valid SAISO project.', {
        phase: 'project-context',
      });
    }
    return null;
  }

  const paths = getProjectPaths(projectRoot);
  const lockfile = await readProjectLockfile(paths.lockfilePath, {
    allowMigrate: options.allowMigrate ?? true,
  });

  return {
    projectRoot,
    lockEntries: lockfile.plugins,
    lockfilePath: paths.lockfilePath,
  };
}

export async function addPluginToProject(options: {
  spec: string;
  sourceType?: 'npm' | 'file';
  allowUnverified?: boolean;
  noPluginLockfileMigrate?: boolean;
  enable?: boolean;
}): Promise<SaisoPluginLockEntryV1> {
  const context = await resolveProjectContext({
    requireProject: true,
    allowMigrate: !(options.noPluginLockfileMigrate ?? false),
  });

  if (!context) {
    throw new PluginError('PLUGIN_PROJECT_CONTEXT_REQUIRED', 'This command requires a project context.', {
      phase: 'project-context',
    });
  }

  const installed = await installPlugin({
    spec: options.spec,
    sourceType: options.sourceType,
    allowUnverified: options.allowUnverified,
    nonInteractive: !process.stdin.isTTY,
    enable: options.enable,
  });

  if (context.lockEntries.some((entry) => entry.id === installed.lockEntry.id)) {
    throw new PluginError('PLUGIN_ID_CONFLICT', `Plugin '${installed.lockEntry.id}' is already present in the project lockfile.`, {
      pluginId: installed.lockEntry.id,
      phase: 'lockfile-update',
      sourceType: installed.lockEntry.sourceType,
    });
  }

  const nextEntries = [...context.lockEntries, installed.lockEntry];
  await writeProjectLockfile(context.lockfilePath, {
    lockfileVersion: 1,
    plugins: nextEntries,
  });

  await upsertGlobalMetadata(lockEntryToGlobalMetadata(installed.lockEntry));
  return installed.lockEntry;
}

export async function removePluginFromProject(options: {
  id: string;
  noPluginLockfileMigrate?: boolean;
}): Promise<boolean> {
  const context = await resolveProjectContext({
    requireProject: true,
    allowMigrate: !(options.noPluginLockfileMigrate ?? false),
  });
  if (!context) {
    throw new PluginError('PLUGIN_PROJECT_CONTEXT_REQUIRED', 'This command requires a project context.', {
      phase: 'project-context',
    });
  }

  const before = context.lockEntries.length;
  const nextEntries = context.lockEntries.filter((entry) => entry.id !== options.id);
  if (nextEntries.length === before) {
    return false;
  }

  await writeProjectLockfile(context.lockfilePath, {
    lockfileVersion: 1,
    plugins: nextEntries,
  });
  return true;
}

export async function setPluginEnabledState(options: {
  id: string;
  enabled: boolean;
  noPluginLockfileMigrate?: boolean;
}): Promise<SaisoPluginLockEntryV1> {
  const context = await resolveProjectContext({
    requireProject: true,
    allowMigrate: !(options.noPluginLockfileMigrate ?? false),
  });
  if (!context) {
    throw new PluginError('PLUGIN_PROJECT_CONTEXT_REQUIRED', 'This command requires a project context.', {
      phase: 'project-context',
    });
  }

  let found = false;
  const nextEntries = context.lockEntries.map((entry) => {
    if (entry.id !== options.id) {
      return entry;
    }
    found = true;
    return { ...entry, enabled: options.enabled };
  });

  if (!found) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `Plugin '${options.id}' is not present in project lockfile.`, {
      pluginId: options.id,
      phase: 'lockfile-update',
    });
  }

  await writeProjectLockfile(context.lockfilePath, {
    lockfileVersion: 1,
    plugins: nextEntries,
  });

  const updated = nextEntries.find((entry) => entry.id === options.id);
  if (!updated) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `Plugin '${options.id}' update failed.`, {
      pluginId: options.id,
      phase: 'lockfile-update',
    });
  }

  return updated;
}

export async function listPlugins(options: {
  noPluginLockfileMigrate?: boolean;
}): Promise<{ mode: 'project' | 'global'; entries: Array<SaisoPluginLockEntryV1 | ReturnType<typeof lockEntryToGlobalMetadata>> }> {
  const projectContext = await resolveProjectContext({
    requireProject: false,
    allowMigrate: !(options.noPluginLockfileMigrate ?? false),
  });

  if (projectContext) {
    return {
      mode: 'project',
      entries: projectContext.lockEntries,
    };
  }

  const globalMetadata = await readGlobalMetadata();
  return {
    mode: 'global',
    entries: globalMetadata.plugins,
  };
}

export async function getPluginInfo(options: {
  id: string;
  noPluginLockfileMigrate?: boolean;
}): Promise<{ mode: 'project' | 'global'; entry: SaisoPluginLockEntryV1 | ReturnType<typeof lockEntryToGlobalMetadata> | null }> {
  const listed = await listPlugins({ noPluginLockfileMigrate: options.noPluginLockfileMigrate });
  const entry = listed.entries.find((plugin) => plugin.id === options.id) ?? null;
  return {
    mode: listed.mode,
    entry,
  };
}

export async function doctorPlugins(options: {
  id?: string;
  noPluginLockfileMigrate?: boolean;
}): Promise<{ mode: 'project' | 'global'; results: Array<{ id: string; ok: boolean; result?: unknown; error?: string }> }> {
  const projectContext = await resolveProjectContext({
    requireProject: false,
    allowMigrate: !(options.noPluginLockfileMigrate ?? false),
  });

  if (!projectContext) {
    const metadata = await readGlobalMetadata();
    const selected = options.id ? metadata.plugins.filter((entry) => entry.id === options.id) : metadata.plugins;
    return {
      mode: 'global',
      results: selected.map((entry) => ({
        id: entry.id,
        ok: true,
        result: {
          sourceType: entry.sourceType,
          artifactKey: entry.artifactKey,
          verification: entry.verification,
        },
      })),
    };
  }

  const results = await runPluginDoctor(projectContext.projectRoot, projectContext.lockEntries, options.id);
  return {
    mode: 'project',
    results,
  };
}

export async function bootstrapProjectPlugins(
  program: Command,
  options: { strictMode: boolean; allowMigrate: boolean }
): Promise<void> {
  const projectContext = await resolveProjectContext({
    requireProject: false,
    allowMigrate: options.allowMigrate,
  });

  if (!projectContext) {
    return;
  }

  await registerEnabledPluginsAtStartup(program, projectContext.projectRoot, projectContext.lockEntries, {
    strictMode: options.strictMode,
  });
}
