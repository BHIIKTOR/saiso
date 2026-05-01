export class PrivyClientError extends Error {
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
    retryable = false
  ) {
    super(message);
    this.name = 'PrivyClientError';
    this.statusCode = statusCode;
    this.details = details;
    this.retryable = retryable;
  }
}
