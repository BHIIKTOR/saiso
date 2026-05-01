import path from 'node:path';
import { readFile } from 'node:fs/promises';
import semver from 'semver';
import packageJson from '../../package.json';
import {
  SAISO_PLUGIN_API_VERSION,
  type SaisoPluginManifest,
} from '@saiso/plugin-sdk';
import { SAISO_PLUGIN_ID_REGEX, SAISO_PLUGIN_MANIFEST_FILE } from './constants.js';
import { PluginError } from './errors.js';
import { sha256Hex } from './fs.js';

export interface LoadedPluginManifest {
  manifest: SaisoPluginManifest;
  manifestPath: string;
  manifestSha256: string;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `Manifest field '${field}' must be a non-empty string.`, {
      phase: 'manifest-validate',
    });
  }
  return value;
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `Manifest field '${field}' must be an array of non-empty strings.`, {
      phase: 'manifest-validate',
    });
  }
  return value;
}

function validateManifest(raw: unknown): SaisoPluginManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', 'Manifest must be a JSON object.', { phase: 'manifest-validate' });
  }

  const parsed = raw as Record<string, unknown>;

  const allowed = new Set([
    'manifestVersion',
    'id',
    'version',
    'pluginApiVersion',
    'saisoRange',
    'entry',
    'capabilities',
    'configSchema',
  ]);
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) {
      throw new PluginError('PLUGIN_MANIFEST_INVALID', `Unknown manifest key '${key}'.`, { phase: 'manifest-validate' });
    }
  }

  const manifestVersion = parsed.manifestVersion;
  if (manifestVersion !== 1) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `Unsupported manifestVersion '${String(manifestVersion)}'.`, {
      phase: 'manifest-validate',
    });
  }

  const id = assertString(parsed.id, 'id');
  if (!SAISO_PLUGIN_ID_REGEX.test(id)) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `Plugin id '${id}' does not match required format.`, {
      phase: 'manifest-validate',
    });
  }

  const version = assertString(parsed.version, 'version');
  if (!semver.valid(version)) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `Manifest version '${version}' is not valid semver.`, {
      phase: 'manifest-validate',
    });
  }

  const pluginApiVersion = assertString(parsed.pluginApiVersion, 'pluginApiVersion');
  if (!semver.valid(pluginApiVersion)) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `pluginApiVersion '${pluginApiVersion}' is not valid semver.`, {
      phase: 'manifest-validate',
    });
  }

  const saisoRange = assertString(parsed.saisoRange, 'saisoRange');
  if (!semver.validRange(saisoRange)) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `saisoRange '${saisoRange}' is not a valid semver range.`, {
      phase: 'manifest-validate',
    });
  }

  const entry = assertString(parsed.entry, 'entry');
  const capabilities = assertStringArray(parsed.capabilities, 'capabilities');

  const configSchema = parsed.configSchema;
  if (configSchema !== undefined && (typeof configSchema !== 'object' || configSchema === null || Array.isArray(configSchema))) {
    throw new PluginError('PLUGIN_CONFIG_SCHEMA_INVALID', 'configSchema must be a JSON object when provided.', {
      phase: 'manifest-validate',
    });
  }

  return {
    manifestVersion: 1,
    id,
    version,
    pluginApiVersion,
    saisoRange,
    entry,
    capabilities,
    configSchema: configSchema as Record<string, unknown> | undefined,
  };
}

export function assertManifestCompatibility(manifest: SaisoPluginManifest): void {
  if (manifest.pluginApiVersion !== SAISO_PLUGIN_API_VERSION) {
    throw new PluginError(
      'PLUGIN_API_UNSUPPORTED',
      `Plugin '${manifest.id}' declares pluginApiVersion '${manifest.pluginApiVersion}', host supports '${SAISO_PLUGIN_API_VERSION}'.`,
      {
        pluginId: manifest.id,
        phase: 'compatibility',
      }
    );
  }

  if (!semver.satisfies(packageJson.version, manifest.saisoRange, { includePrerelease: true } as semver.RangeOptions)) {
    throw new PluginError(
      'PLUGIN_RANGE_MISMATCH',
      `Plugin '${manifest.id}' requires saisoRange '${manifest.saisoRange}', host is '${packageJson.version}'.`,
      {
        pluginId: manifest.id,
        phase: 'compatibility',
      }
    );
  }
}

export async function loadPluginManifest(pluginRoot: string): Promise<LoadedPluginManifest> {
  const manifestPath = path.join(pluginRoot, SAISO_PLUGIN_MANIFEST_FILE);

  let rawText: string;
  try {
    rawText = await readFile(manifestPath, 'utf-8');
  } catch (error) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `Missing plugin manifest at ${manifestPath}.`, {
      phase: 'manifest-read',
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new PluginError('PLUGIN_MANIFEST_INVALID', `Invalid JSON in plugin manifest ${manifestPath}.`, {
      phase: 'manifest-read',
      cause: error,
    });
  }

  const manifest = validateManifest(parsed);
  return {
    manifest,
    manifestPath,
    manifestSha256: sha256Hex(rawText),
  };
}
