import Ajv2020, { type ErrorObject, type JSONSchemaType } from 'ajv/dist/2020.js';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SaisoPluginManifest } from '@saiso/plugin-sdk';
import { PluginError } from './errors.js';
import { pathExists, writeJsonAtomic } from './fs.js';

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
});

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) {
    return 'Unknown schema validation error';
  }
  return errors
    .map((error) => {
      const path = error.instancePath || '/';
      return `${path} ${error.message ?? 'invalid'}`;
    })
    .join('; ');
}

export function normalizePluginConfigSchema(manifest: SaisoPluginManifest): Record<string, unknown> | undefined {
  if (!manifest.configSchema) {
    return undefined;
  }

  if (typeof manifest.configSchema !== 'object' || Array.isArray(manifest.configSchema) || manifest.configSchema === null) {
    throw new PluginError('PLUGIN_CONFIG_SCHEMA_INVALID', `Plugin '${manifest.id}' configSchema must be an object.`, {
      pluginId: manifest.id,
      phase: 'config-schema',
    });
  }

  const schema = structuredClone(manifest.configSchema) as Record<string, unknown>;

  if (schema.type !== 'object') {
    throw new PluginError('PLUGIN_CONFIG_SCHEMA_INVALID', `Plugin '${manifest.id}' configSchema root type must be 'object'.`, {
      pluginId: manifest.id,
      phase: 'config-schema',
    });
  }

  if (!Object.prototype.hasOwnProperty.call(schema, 'additionalProperties')) {
    schema.additionalProperties = false;
  }

  return schema;
}

export function validatePluginConfig(
  manifest: SaisoPluginManifest,
  config: Record<string, unknown>
): void {
  const schema = normalizePluginConfigSchema(manifest);
  if (!schema) {
    return;
  }

  const validator = ajv.compile(schema as JSONSchemaType<Record<string, unknown>>);
  const valid = validator(config);
  if (!valid) {
    throw new PluginError('PLUGIN_CONFIG_INVALID', `Plugin '${manifest.id}' config is invalid: ${formatAjvErrors(validator.errors)}.`, {
      pluginId: manifest.id,
      phase: 'config-validate',
    });
  }
}

export async function readPluginConfig(
  manifest: SaisoPluginManifest,
  pluginConfigPath: string
): Promise<Record<string, unknown>> {
  const exists = await pathExists(pluginConfigPath);
  if (!exists) {
    return {};
  }

  let parsed: unknown;
  try {
    const raw = await readFile(pluginConfigPath, 'utf-8');
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new PluginError('PLUGIN_CONFIG_FILE_INVALID', `Invalid JSON in plugin config ${pluginConfigPath}.`, {
      pluginId: manifest.id,
      phase: 'config-read',
      cause: error,
    });
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PluginError('PLUGIN_CONFIG_INVALID', `Plugin config ${pluginConfigPath} must be a JSON object.`, {
      pluginId: manifest.id,
      phase: 'config-read',
    });
  }

  const config = parsed as Record<string, unknown>;
  validatePluginConfig(manifest, config);
  return config;
}

export async function writePluginConfig(
  manifest: SaisoPluginManifest,
  pluginConfigPath: string,
  nextConfig: Record<string, unknown>
): Promise<void> {
  validatePluginConfig(manifest, nextConfig);
  await mkdir(path.dirname(pluginConfigPath), { recursive: true });
  await writeJsonAtomic(pluginConfigPath, nextConfig);
}
