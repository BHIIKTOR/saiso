export class ChatTransportError extends Error {
  readonly code: string;
  readonly transport: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    options: {
      transport: string;
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = 'ChatTransportError';
    this.code = code;
    this.transport = options.transport;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}
