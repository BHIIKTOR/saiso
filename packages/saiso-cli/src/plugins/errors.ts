export const PLUGIN_ERROR_CODES = [
  'PLUGIN_MANIFEST_INVALID',
  'PLUGIN_API_UNSUPPORTED',
  'PLUGIN_RANGE_MISMATCH',
  'PLUGIN_COLLISION',
  'PLUGIN_INTEGRITY_MISMATCH',
  'PLUGIN_NOT_ENABLED',
  'PLUGIN_LOCKFILE_UNSUPPORTED_VERSION',
  'PLUGIN_LOCKFILE_MIGRATION_FAILED',
  'PLUGIN_ID_CONFLICT',
  'PLUGIN_ENTRY_LOAD_FAILED',
  'PLUGIN_CONFIG_INVALID',
  'PLUGIN_CONFIG_SCHEMA_INVALID',
  'PLUGIN_DOCTOR_FAILED',
  'PLUGIN_ARTIFACT_NOT_FOUND',
  'PLUGIN_SOURCE_POLICY_VIOLATION',
  'PLUGIN_UNVERIFIED_SOURCE_REJECTED',
  'PLUGIN_PROJECT_CONTEXT_REQUIRED',
  'PLUGIN_LOCKFILE_INVALID_JSON',
  'PLUGIN_CONFIG_FILE_INVALID',
  'PLUGIN_ERROR_REPORT_WRITE_FAILED',
] as const;

export type PluginErrorCode = (typeof PLUGIN_ERROR_CODES)[number];

export interface PluginErrorOptions {
  pluginId?: string;
  phase?: string;
  sourceType?: 'npm' | 'file';
  retryable?: boolean;
  cause?: unknown;
}

export class PluginError extends Error {
  readonly code: PluginErrorCode;
  readonly pluginId?: string;
  readonly phase: string;
  readonly sourceType?: 'npm' | 'file';
  readonly retryable: boolean;

  constructor(code: PluginErrorCode, message: string, options: PluginErrorOptions = {}) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
    this.pluginId = options.pluginId;
    this.phase = options.phase ?? 'unknown';
    this.sourceType = options.sourceType;
    this.retryable = options.retryable ?? false;

    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function asPluginError(
  error: unknown,
  fallbackCode: PluginErrorCode,
  fallbackMessage: string,
  options: PluginErrorOptions = {}
): PluginError {
  if (error instanceof PluginError) {
    return error;
  }

  if (error instanceof Error) {
    return new PluginError(fallbackCode, error.message || fallbackMessage, {
      ...options,
      cause: error,
    });
  }

  return new PluginError(fallbackCode, fallbackMessage, {
    ...options,
    cause: error,
  });
}
