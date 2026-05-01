import type { Command } from 'commander';

export type PluginSourceType = 'npm' | 'file';
export type PluginVerificationLevel = 'verified' | 'unverified';

export interface SaisoPluginManifest {
  manifestVersion: number;
  id: string;
  version: string;
  pluginApiVersion: string;
  saisoRange: string;
  entry: string;
  capabilities: string[];
  configSchema?: Record<string, unknown>;
}

export interface SaisoPluginPaths {
  projectRoot: string;
  saisoDir: string;
  pluginConfigPath: string;
  pluginDataDir: string;
}

export interface SaisoPluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface SaisoPluginConfigApi {
  readConfig<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<T>;
  writeConfig(next: Record<string, unknown>): Promise<void>;
}

export interface SaisoPluginFsApi {
  resolveProjectPath(relativePath: string): string;
  readProjectFile(relativePath: string): Promise<string>;
  writeProjectFile(relativePath: string, content: string): Promise<void>;
}

export interface SaisoPluginContext {
  paths: SaisoPluginPaths;
  logger: SaisoPluginLogger;
  config: SaisoPluginConfigApi;
  fs: SaisoPluginFsApi;
  env: {
    get(name: string): string | undefined;
  };
}

export interface SaisoPluginModule {
  registerCommands(program: Command, context: SaisoPluginContext): void | Promise<void>;
  init?(context: SaisoPluginContext): void | Promise<void>;
  doctor?(context: SaisoPluginContext): unknown | Promise<unknown>;
}

export interface SaisoPluginLockEntryV1 {
  id: string;
  version: string;
  manifestVersion: number;
  pluginApiVersion: string;
  saisoRange: string;
  sourceType: PluginSourceType;
  artifactKey: string;
  entry: string;
  enabled: boolean;
  verification: PluginVerificationLevel;
  manifestSha256: string;
  resolved?: string;
  integrity?: string;
  filePath?: string;
  contentSha256?: string;
}

export interface SaisoPluginLockfileV1 {
  lockfileVersion: 1;
  plugins: SaisoPluginLockEntryV1[];
}

export const SAISO_PLUGIN_API_VERSION = '1.0.0';
