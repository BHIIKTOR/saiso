import chalk from 'chalk';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  success(message: string, ...args: any[]): void;
}

export class SaisoLogger implements Logger {
  constructor(private logLevel: 'error' | 'warn' | 'info' | 'debug' = 'info') {}

  private shouldLog(level: 'error' | 'warn' | 'info' | 'debug'): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    return levels.indexOf(level) <= levels.indexOf(this.logLevel);
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(chalk.blue('ℹ'), message, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(chalk.yellow('⚠'), message, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(chalk.red('❌'), message, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(chalk.gray('🐛'), message, ...args);
    }
  }

  success(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(chalk.green('✅'), message, ...args);
    }
  }
}

export const logger = new SaisoLogger();

/**
 * Execute a command and return the result
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    stdio?: 'inherit' | 'pipe';
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: options.stdio || 'pipe',
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Check if a command is available in the system
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const result = await executeCommand('which', [command]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check if Docker is available and running
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const result = await executeCommand('docker', ['version']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check if a directory is a valid SAISO project
 */
export async function isSaisoProject(projectPath: string = process.cwd()): Promise<boolean> {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    // Check if it has SAISO-related dependencies or scripts
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    return (
      dependencies['@elizaos/plugin-solana'] ||
      dependencies['@elizaos/plugin-evm'] ||
      dependencies['@saiso/core'] ||
      packageJson.name?.includes('saiso') ||
      false
    );
  } catch {
    return false;
  }
}

/**
 * Get the current SAISO project root
 */
export async function findProjectRoot(startPath: string = process.cwd()): Promise<string | null> {
  let currentPath = startPath;
  let iterations = 0;
  const maxIterations = 50; // Prevent infinite loops

  while (currentPath !== path.dirname(currentPath) && iterations < maxIterations) {
    try {
      if (await isSaisoProject(currentPath)) {
        return currentPath;
      }
    } catch (error) {
      // Skip directories we can't read
      logger.debug(`Cannot check directory ${currentPath}: ${error}`);
    }

    currentPath = path.dirname(currentPath);
    iterations++;
  }

  return null;
}

/**
 * Validate environment name
 */
export function isValidEnvironment(env: string): env is 'testnet' | 'mainnet' | 'devnet' {
  return ['testnet', 'mainnet', 'devnet'].includes(env);
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrap a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: number;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = 2 } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        throw lastError;
      }

      const waitTime = delay * Math.pow(backoff, attempt - 1);
      logger.debug(`Attempt ${attempt} failed, retrying in ${waitTime}ms...`);
      await sleep(waitTime);
    }
  }

  throw lastError!;
}

/**
 * Validate private key format
 */
export function isValidPrivateKey(privateKey: string): boolean {
  // Remove 0x prefix if present
  const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

  // Check if it's a valid hex string of 64 characters
  return /^[a-fA-F0-9]{64}$/.test(cleanKey);
}

/**
 * Mask sensitive information for logging
 */
export function maskSensitive(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars * 2) {
    return '*'.repeat(value.length);
  }

  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  const middle = '*'.repeat(value.length - visibleChars * 2);

  return `${start}${middle}${end}`;
}
