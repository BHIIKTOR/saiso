import type { PluginSourceType, PluginVerificationLevel, SaisoPluginLockEntryV1 } from '@saiso/plugin-sdk';
import { readJsonFile, writeJsonAtomic } from './fs.js';
import { getGlobalPluginMetadataPath } from './paths.js';

const GLOBAL_METADATA_SCHEMA_VERSION = 1;

export interface GlobalPluginMetadataEntry {
  id: string;
  version: string;
  manifestVersion: number;
  pluginApiVersion: string;
  saisoRange: string;
  entry: string;
  sourceType: PluginSourceType;
  artifactKey: string;
  verification: PluginVerificationLevel;
  manifestSha256: string;
  resolved?: string;
  integrity?: string;
  filePath?: string;
  contentSha256?: string;
}

export interface GlobalPluginMetadata {
  schemaVersion: 1;
  plugins: GlobalPluginMetadataEntry[];
}

export function lockEntryToGlobalMetadata(entry: SaisoPluginLockEntryV1): GlobalPluginMetadataEntry {
  return {
    id: entry.id,
    version: entry.version,
    manifestVersion: entry.manifestVersion,
    pluginApiVersion: entry.pluginApiVersion,
    saisoRange: entry.saisoRange,
    entry: entry.entry,
    sourceType: entry.sourceType,
    artifactKey: entry.artifactKey,
    verification: entry.verification,
    manifestSha256: entry.manifestSha256,
    resolved: entry.resolved,
    integrity: entry.integrity,
    filePath: entry.filePath,
    contentSha256: entry.contentSha256,
  };
}

export async function readGlobalMetadata(): Promise<GlobalPluginMetadata> {
  const metadataPath = getGlobalPluginMetadataPath();
  try {
    const raw = await readJsonFile<Partial<GlobalPluginMetadata>>(metadataPath);
    if (raw.schemaVersion !== GLOBAL_METADATA_SCHEMA_VERSION || !Array.isArray(raw.plugins)) {
      return { schemaVersion: GLOBAL_METADATA_SCHEMA_VERSION, plugins: [] };
    }
    return {
      schemaVersion: GLOBAL_METADATA_SCHEMA_VERSION,
      plugins: raw.plugins.filter((entry): entry is GlobalPluginMetadataEntry => Boolean(entry && typeof entry.id === 'string')),
    };
  } catch {
    return { schemaVersion: GLOBAL_METADATA_SCHEMA_VERSION, plugins: [] };
  }
}

export async function upsertGlobalMetadata(entry: GlobalPluginMetadataEntry): Promise<void> {
  const metadata = await readGlobalMetadata();
  const idx = metadata.plugins.findIndex((plugin) => plugin.id === entry.id);
  if (idx >= 0) {
    metadata.plugins[idx] = entry;
  } else {
    metadata.plugins.push(entry);
  }
  metadata.plugins.sort((a, b) => a.id.localeCompare(b.id));
  await writeJsonAtomic(getGlobalPluginMetadataPath(), metadata);
}
