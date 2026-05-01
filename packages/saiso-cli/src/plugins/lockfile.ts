import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import type { SaisoPluginLockEntryV1, SaisoPluginLockfileV1 } from '@saiso/plugin-sdk';
import {
  SAISO_PLUGIN_LOCKFILE_BACKUP_NAME,
  SAISO_PLUGIN_LOCKFILE_VERSION,
  SAISO_PLUGIN_ID_REGEX,
} from './constants.js';
import { PluginError } from './errors.js';
import { pathExists, readJsonFile, writeJsonAtomic } from './fs.js';

const LOCK_TOP_LEVEL_KEYS = new Set(['lockfileVersion', 'plugins']);
const LOCK_ENTRY_KEYS = new Set([
  'id',
  'version',
  'manifestVersion',
  'pluginApiVersion',
  'saisoRange',
  'sourceType',
  'artifactKey',
  'entry',
  'enabled',
  'verification',
  'manifestSha256',
  'resolved',
  'integrity',
  'filePath',
  'contentSha256',
]);

function assertRecord(value: unknown, message: string, code: 'PLUGIN_LOCKFILE_INVALID_JSON' | 'PLUGIN_LOCKFILE_MIGRATION_FAILED'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PluginError(code, message, { phase: 'lockfile-parse' });
  }
  return value as Record<string, unknown>;
}

function assertStringField(entry: Record<string, unknown>, key: string, code: 'PLUGIN_LOCKFILE_INVALID_JSON' | 'PLUGIN_LOCKFILE_MIGRATION_FAILED'): string {
  const value = entry[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PluginError(code, `Lockfile plugin entry field '${key}' must be a non-empty string.`, {
      phase: 'lockfile-parse',
    });
  }
  return value;
}

function assertBooleanField(entry: Record<string, unknown>, key: string, code: 'PLUGIN_LOCKFILE_INVALID_JSON' | 'PLUGIN_LOCKFILE_MIGRATION_FAILED'): boolean {
  const value = entry[key];
  if (typeof value !== 'boolean') {
    throw new PluginError(code, `Lockfile plugin entry field '${key}' must be a boolean.`, {
      phase: 'lockfile-parse',
    });
  }
  return value;
}

function validateLockEntry(
  rawEntry: unknown,
  code: 'PLUGIN_LOCKFILE_INVALID_JSON' | 'PLUGIN_LOCKFILE_MIGRATION_FAILED'
): SaisoPluginLockEntryV1 {
  const entry = assertRecord(rawEntry, 'Lockfile plugin entry must be an object.', code);

  for (const key of Object.keys(entry)) {
    if (!LOCK_ENTRY_KEYS.has(key)) {
      throw new PluginError(code, `Unknown lockfile plugin entry key '${key}'.`, {
        phase: 'lockfile-parse',
      });
    }
  }

  const id = assertStringField(entry, 'id', code);
  if (!SAISO_PLUGIN_ID_REGEX.test(id)) {
    throw new PluginError(code, `Plugin id '${id}' does not match required format.`, {
      phase: 'lockfile-parse',
    });
  }

  const sourceType = assertStringField(entry, 'sourceType', code);
  if (sourceType !== 'npm' && sourceType !== 'file') {
    throw new PluginError(code, `Plugin '${id}' has invalid sourceType '${sourceType}'.`, {
      phase: 'lockfile-parse',
    });
  }

  const verification = assertStringField(entry, 'verification', code);
  if (verification !== 'verified' && verification !== 'unverified') {
    throw new PluginError(code, `Plugin '${id}' has invalid verification '${verification}'.`, {
      phase: 'lockfile-parse',
    });
  }

  const manifestVersion = entry.manifestVersion;
  if (manifestVersion !== 1) {
    throw new PluginError(code, `Plugin '${id}' has unsupported manifestVersion '${String(manifestVersion)}'.`, {
      phase: 'lockfile-parse',
    });
  }

  const output: SaisoPluginLockEntryV1 = {
    id,
    version: assertStringField(entry, 'version', code),
    manifestVersion: 1,
    pluginApiVersion: assertStringField(entry, 'pluginApiVersion', code),
    saisoRange: assertStringField(entry, 'saisoRange', code),
    sourceType,
    artifactKey: assertStringField(entry, 'artifactKey', code),
    entry: assertStringField(entry, 'entry', code),
    enabled: assertBooleanField(entry, 'enabled', code),
    verification,
    manifestSha256: assertStringField(entry, 'manifestSha256', code),
  };

  if (sourceType === 'npm') {
    output.resolved = assertStringField(entry, 'resolved', code);
    output.integrity = assertStringField(entry, 'integrity', code);
  }

  if (sourceType === 'file') {
    output.filePath = assertStringField(entry, 'filePath', code);
    output.contentSha256 = assertStringField(entry, 'contentSha256', code);
  }

  if (typeof entry.resolved === 'string') output.resolved = entry.resolved;
  if (typeof entry.integrity === 'string') output.integrity = entry.integrity;
  if (typeof entry.filePath === 'string') output.filePath = entry.filePath;
  if (typeof entry.contentSha256 === 'string') output.contentSha256 = entry.contentSha256;

  return output;
}

function validateStrictLockfile(
  raw: unknown,
  code: 'PLUGIN_LOCKFILE_INVALID_JSON' | 'PLUGIN_LOCKFILE_MIGRATION_FAILED'
): SaisoPluginLockfileV1 {
  const root = assertRecord(raw, 'Lockfile must be a JSON object.', code);

  for (const key of Object.keys(root)) {
    if (!LOCK_TOP_LEVEL_KEYS.has(key)) {
      throw new PluginError(code, `Unknown lockfile key '${key}'.`, {
        phase: 'lockfile-parse',
      });
    }
  }

  if (root.lockfileVersion !== SAISO_PLUGIN_LOCKFILE_VERSION) {
    throw new PluginError('PLUGIN_LOCKFILE_UNSUPPORTED_VERSION', `Unsupported lockfileVersion '${String(root.lockfileVersion)}'.`, {
      phase: 'lockfile-parse',
    });
  }

  if (!Array.isArray(root.plugins)) {
    throw new PluginError(code, "Lockfile field 'plugins' must be an array.", {
      phase: 'lockfile-parse',
    });
  }

  const entries = root.plugins.map((entry) => validateLockEntry(entry, code));
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new PluginError('PLUGIN_ID_CONFLICT', `Duplicate plugin id '${entry.id}' in lockfile.`, {
        pluginId: entry.id,
        phase: 'lockfile-parse',
      });
    }
    ids.add(entry.id);
  }

  return {
    lockfileVersion: SAISO_PLUGIN_LOCKFILE_VERSION,
    plugins: entries,
  };
}

function migrateLockfile(raw: unknown): SaisoPluginLockfileV1 {
  const root = assertRecord(raw, 'Lockfile migration requires object payload.', 'PLUGIN_LOCKFILE_MIGRATION_FAILED');

  if (!Array.isArray(root.plugins)) {
    throw new PluginError('PLUGIN_LOCKFILE_MIGRATION_FAILED', "Legacy lockfile missing array field 'plugins'.", {
      phase: 'lockfile-migrate',
    });
  }

  const migrated = {
    lockfileVersion: SAISO_PLUGIN_LOCKFILE_VERSION,
    plugins: root.plugins,
  };

  return validateStrictLockfile(migrated, 'PLUGIN_LOCKFILE_MIGRATION_FAILED');
}

export async function readProjectLockfile(
  lockfilePath: string,
  options: { allowMigrate?: boolean } = {}
): Promise<SaisoPluginLockfileV1> {
  const exists = await pathExists(lockfilePath);
  if (!exists) {
    return {
      lockfileVersion: SAISO_PLUGIN_LOCKFILE_VERSION,
      plugins: [],
    };
  }

  let raw: unknown;
  try {
    raw = await readJsonFile<unknown>(lockfilePath);
  } catch (error) {
    throw new PluginError('PLUGIN_LOCKFILE_INVALID_JSON', `Invalid JSON in lockfile ${lockfilePath}.`, {
      phase: 'lockfile-read',
      cause: error,
    });
  }

  const root = assertRecord(raw, 'Lockfile must be a JSON object.', 'PLUGIN_LOCKFILE_INVALID_JSON');
  const version = root.lockfileVersion;

  if (version === SAISO_PLUGIN_LOCKFILE_VERSION) {
    return validateStrictLockfile(root, 'PLUGIN_LOCKFILE_INVALID_JSON');
  }

  if (typeof version === 'number' && version > SAISO_PLUGIN_LOCKFILE_VERSION) {
    throw new PluginError('PLUGIN_LOCKFILE_UNSUPPORTED_VERSION', `Unsupported lockfileVersion '${version}'.`, {
      phase: 'lockfile-read',
    });
  }

  const allowMigrate = options.allowMigrate ?? true;
  if (!allowMigrate) {
    throw new PluginError('PLUGIN_LOCKFILE_UNSUPPORTED_VERSION', 'Lockfile migration is disabled (--no-plugin-lockfile-migrate).', {
      phase: 'lockfile-read',
    });
  }

  try {
    const backupPath = path.join(path.dirname(lockfilePath), SAISO_PLUGIN_LOCKFILE_BACKUP_NAME);
    await copyFile(lockfilePath, backupPath);
    const migrated = migrateLockfile(root);
    await writeJsonAtomic(lockfilePath, migrated);
    return migrated;
  } catch (error) {
    if (error instanceof PluginError) {
      throw error;
    }
    throw new PluginError('PLUGIN_LOCKFILE_MIGRATION_FAILED', `Failed to migrate lockfile ${lockfilePath}.`, {
      phase: 'lockfile-migrate',
      cause: error,
    });
  }
}

export async function writeProjectLockfile(lockfilePath: string, lockfile: SaisoPluginLockfileV1): Promise<void> {
  const validated = validateStrictLockfile(lockfile, 'PLUGIN_LOCKFILE_INVALID_JSON');
  await writeJsonAtomic(lockfilePath, validated);
}
