import path from 'node:path';

export const SAISO_PLUGIN_MANIFEST_FILE = 'saiso-plugin.json';
export const SAISO_PLUGIN_LOCKFILE_NAME = 'plugins.lock.json';
export const SAISO_PLUGIN_LOCKFILE_BACKUP_NAME = 'plugins.lock.json.bak';
export const SAISO_PLUGIN_ERROR_REPORT_NAME = 'plugin-errors.json';
export const SAISO_PLUGIN_CONFIG_DIRNAME = 'plugins';
export const SAISO_PLUGIN_DATA_DIRNAME = 'plugins-data';
export const SAISO_GLOBAL_HOME_DIR = '.saiso';
export const SAISO_GLOBAL_PLUGIN_METADATA_FILE = 'plugins.json';
export const SAISO_GLOBAL_PLUGIN_CACHE_DIR = path.join('plugins', 'cache');
export const SAISO_PLUGIN_LOCKFILE_VERSION = 1;
export const SAISO_PLUGIN_ERROR_REPORT_SCHEMA_VERSION = 1;

export const SAISO_PLUGIN_ID_REGEX = /^[a-z0-9][a-z0-9._/-]*$/;
