import { spawn } from 'node:child_process';
import path from 'node:path';
import type { McpDockerRuntimeConfig, McpServerType } from '../types/mcp.js';
import {
  DEFAULT_MCP_DOCKER_HEALTH_PATH,
  DEFAULT_MCP_DOCKER_PULL_POLICY,
  DEFAULT_MCP_DOCKER_STARTUP_TIMEOUT_MS,
  getDefaultMcpDockerImage
} from '../constants/docker.js';
import { logger } from '../utils/logger.js';

export interface DockerMcpLaunchOptions {
  serverType: McpServerType;
  projectPath: string;
  port: number;
  host?: string;
  env: Record<string, string>;
  docker?: McpDockerRuntimeConfig;
}

export interface DockerMcpLaunchResult {
  containerId: string;
  containerName: string;
  host: string;
  port: number;
  healthPath: string;
  startupTimeoutMs: number;
  image: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function assertDockerReady(): Promise<void> {
  const version = await runDocker(['--version']);
  if (version.exitCode !== 0) {
    throw new Error(`Docker CLI unavailable: ${version.stderr || version.stdout || 'unknown error'}`);
  }

  const info = await runDocker(['info', '--format', '{{.ServerVersion}}']);
  if (info.exitCode !== 0) {
    throw new Error(`Docker daemon unavailable: ${info.stderr || info.stdout || 'unknown error'}`);
  }
}

export async function launchDockerMcpServer(options: DockerMcpLaunchOptions): Promise<DockerMcpLaunchResult> {
  await assertDockerReady();

  const host = options.docker?.host || options.host || 'localhost';
  const port = options.docker?.port ?? options.port;
  const image = options.docker?.image || getDefaultMcpDockerImage(options.serverType);
  const pullPolicy = options.docker?.pullPolicy || DEFAULT_MCP_DOCKER_PULL_POLICY;
  const healthPath = options.docker?.healthPath || DEFAULT_MCP_DOCKER_HEALTH_PATH;
  const startupTimeoutMs = options.docker?.startupTimeoutMs || DEFAULT_MCP_DOCKER_STARTUP_TIMEOUT_MS;
  const containerName = sanitizeContainerName(
    options.docker?.containerName
      || `saiso-${path.basename(options.projectPath)}-${options.serverType}-${port}`
  );

  await applyPullPolicy(pullPolicy, image);
  await cleanupContainerIfExists(containerName);

  const dockerArgs = [
    'run',
    '-d',
    '--name', containerName,
    '--label', `saiso.project=${sanitizeLabelValue(path.basename(options.projectPath))}`,
    '--label', `saiso.serverType=${options.serverType}`,
    '--label', 'saiso.mode=docker',
    '-p', `${port}:${port}`,
  ];

  if (options.docker?.network) {
    dockerArgs.push('--network', options.docker.network);
  }

  const extraEnv = resolveAllowedExtraEnv(options.docker);
  const mergedEnv = {
    ...options.env,
    ...extraEnv,
  };
  for (const [key, value] of Object.entries(mergedEnv)) {
    dockerArgs.push('-e', `${key}=${value}`);
  }

  dockerArgs.push(image);

  const run = await runDocker(dockerArgs);
  if (run.exitCode !== 0) {
    throw new Error(`Failed to start Docker container: ${run.stderr || run.stdout || 'unknown error'}`);
  }

  const containerId = run.stdout.trim();
  if (!containerId) {
    throw new Error('Docker returned empty container id');
  }

  logger.info(`Started ${options.serverType.toUpperCase()} MCP in Docker container ${containerName}`);
  return {
    containerId,
    containerName,
    host,
    port,
    healthPath,
    startupTimeoutMs,
    image,
  };
}

export async function stopDockerContainer(idOrName: string): Promise<void> {
  const stop = await runDocker(['rm', '-f', idOrName]);
  if (stop.exitCode !== 0) {
    logger.warn(`Failed to remove docker container '${idOrName}': ${stop.stderr || stop.stdout}`);
  }
}

export async function getDockerContainerLogs(idOrName: string, tail: number = 120): Promise<string> {
  const logs = await runDocker(['logs', '--tail', String(tail), idOrName]);
  if (logs.exitCode !== 0) {
    return logs.stderr || logs.stdout || '';
  }
  return logs.stdout;
}

async function applyPullPolicy(
  pullPolicy: NonNullable<McpDockerRuntimeConfig['pullPolicy']>,
  image: string
): Promise<void> {
  if (pullPolicy === 'never') {
    return;
  }

  if (pullPolicy === 'if-not-present') {
    const inspect = await runDocker(['image', 'inspect', image]);
    if (inspect.exitCode === 0) {
      return;
    }
  }

  const pull = await runDocker(['pull', image]);
  if (pull.exitCode !== 0) {
    throw new Error(`Failed to pull Docker image '${image}': ${pull.stderr || pull.stdout || 'unknown error'}`);
  }
}

async function cleanupContainerIfExists(containerName: string): Promise<void> {
  const existing = await runDocker(['ps', '-a', '--filter', `name=^/${containerName}$`, '--format', '{{.ID}}']);
  if (existing.exitCode !== 0) {
    return;
  }

  const existingId = existing.stdout.trim();
  if (!existingId) {
    return;
  }

  logger.warn(`Removing stale container '${containerName}' (${existingId.slice(0, 12)})`);
  await stopDockerContainer(containerName);
}

function resolveAllowedExtraEnv(
  dockerConfig: McpDockerRuntimeConfig | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  const allowlist = dockerConfig?.extraEnvAllowlist || [];
  for (const key of allowlist) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      continue;
    }
    if (dockerConfig?.extraEnv?.[key] !== undefined) {
      out[key] = dockerConfig.extraEnv[key];
      continue;
    }
    const value = process.env[key];
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeContainerName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]/g, '-').slice(0, 128);
}

function sanitizeLabelValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '-');
}

function runDocker(args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 0,
      });
    });
  });
}
