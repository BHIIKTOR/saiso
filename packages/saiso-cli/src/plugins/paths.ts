import path from 'node:path';
import {
  SAISO_PLUGIN_CONFIG_DIRNAME,
  SAISO_PLUGIN_DATA_DIRNAME,
  SAISO_PLUGIN_ERROR_REPORT_NAME,
  SAISO_PLUGIN_LOCKFILE_NAME,
  SAISO_GLOBAL_PLUGIN_CACHE_DIR,
  SAISO_GLOBAL_PLUGIN_METADATA_FILE,
} from './constants.js';
import { getSaisoHomeDir } from './fs.js';

export interface PluginProjectPaths {
  projectRoot: string;
  saisoDir: string;
  lockfilePath: string;
  pluginConfigDir: string;
  pluginDataDir: string;
  pluginErrorReportPath: string;
}

export function getProjectPaths(projectRoot: string): PluginProjectPaths {
  const saisoDir = path.join(projectRoot, '.saiso');

  return {
    projectRoot,
    saisoDir,
    lockfilePath: path.join(saisoDir, SAISO_PLUGIN_LOCKFILE_NAME),
    pluginConfigDir: path.join(saisoDir, SAISO_PLUGIN_CONFIG_DIRNAME),
    pluginDataDir: path.join(saisoDir, SAISO_PLUGIN_DATA_DIRNAME),
    pluginErrorReportPath: path.join(saisoDir, SAISO_PLUGIN_ERROR_REPORT_NAME),
  };
}

export function getGlobalPluginMetadataPath(): string {
  return path.join(getSaisoHomeDir(), SAISO_GLOBAL_PLUGIN_METADATA_FILE);
}

export function getGlobalPluginCacheRoot(): string {
  return path.join(getSaisoHomeDir(), SAISO_GLOBAL_PLUGIN_CACHE_DIR);
}

export function getArtifactPath(artifactKey: string): string {
  return path.join(getGlobalPluginCacheRoot(), artifactKey);
}
