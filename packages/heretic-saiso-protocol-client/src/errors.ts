import type { HereticSaisoErrorCode } from './contracts/error-codes.js';
export type { HereticSaisoErrorCode } from './contracts/error-codes.js';

export class HereticSaisoError extends Error {
  readonly code: HereticSaisoErrorCode;

  readonly details?: Record<string, unknown>;

  constructor(code: HereticSaisoErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'HereticSaisoError';
    this.code = code;
    this.details = details;
  }
}

export function assert(condition: unknown, code: HereticSaisoErrorCode, message: string, details?: Record<string, unknown>): void {
  if (!condition) {
    throw new HereticSaisoError(code, message, details);
  }
}
