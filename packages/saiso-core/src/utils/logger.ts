import chalk from 'chalk';

/**
 * SAISO Logger Utility
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level: LogLevel;
  prefix?: string;
  timestamp?: boolean;
}

class Logger {
  private level = 'info' as LogLevel;
  private prefix = '';
  private timestamp = true;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.level = options.level || 'info';
    this.prefix = options.prefix || '';
    this.timestamp = options.timestamp !== false;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = this.timestamp ? `[${new Date().toISOString()}] ` : '';
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    const levelStr = level.toUpperCase().padEnd(5);

    let coloredLevel: string;
    switch (level) {
      case 'debug':
        coloredLevel = chalk.gray(levelStr);
        break;
      case 'info':
        coloredLevel = chalk.blue(levelStr);
        break;
      case 'warn':
        coloredLevel = chalk.yellow(levelStr);
        break;
      case 'error':
        coloredLevel = chalk.red(levelStr);
        break;
    }

    const formattedArgs = args.length > 0 ? ` ${args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')}` : '';

    return `${timestamp}${coloredLevel} ${prefix}${message}${formattedArgs}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, ...args));
    }
  }

  success(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      const timestamp = this.timestamp ? `[${new Date().toISOString()}] ` : '';
      const prefix = this.prefix ? `[${this.prefix}] ` : '';
      const formattedArgs = args.length > 0 ? ` ${args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')}` : '';

      console.log(`${timestamp}${chalk.green('SUCCESS')} ${prefix}${message}${formattedArgs}`);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      timestamp: this.timestamp,
    });
  }
}

// Default logger instance
export const logger = new Logger();

// Create logger with options
export function createLogger(options: Partial<LoggerOptions> = {}): Logger {
  return new Logger(options);
}
