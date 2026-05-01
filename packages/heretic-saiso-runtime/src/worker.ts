import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { HereticSaisoError } from '@saiso/heretic-saiso-protocol-client';

const PROCESS_START_TIME = new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString();

export interface RuntimeWorkerLease {
  holderHost: string;
  pid: number;
  processStartTime: string;
  startedAt: string;
  version: string;
  projectRoot: string;
  status: 'running' | 'stopped' | 'degraded' | 'unknown';
}

export interface RuntimeWorkerStatus {
  state: 'running' | 'stopped' | 'degraded' | 'unknown';
  pid: number | null;
  uptimeMs: number | null;
  projectRoot: string;
  lastHeartbeatAt: string | null;
  activeTransport: string | null;
  pendingAlertCount: number;
  leasePath: string;
  pidPath: string;
}

export interface RuntimeWorkerStartOptions {
  projectRoot: string;
  pricesFile: string;
  priceSource?: 'file' | 'coingecko' | string;
  vsCurrency?: string;
  intervalMs: number;
  notifyDaemon: boolean;
  foreground?: boolean;
  cliEntry: string;
  cliBin?: string;
  env?: NodeJS.ProcessEnv;
}

function stateDir(projectRoot: string): string {
  return path.join(projectRoot, '.saiso', 'heretic');
}

function pidFile(projectRoot: string): string {
  return path.join(stateDir(projectRoot), 'runtime-worker.pid');
}

function leaseFile(projectRoot: string): string {
  return path.join(stateDir(projectRoot), 'runtime-worker.lease.json');
}

function heartbeatFile(projectRoot: string): string {
  return path.join(stateDir(projectRoot), 'runtime-worker.heartbeat');
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = normalized.slice(0, separator).trim();
    if (!key) {
      continue;
    }
    let value = normalized.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function loadProjectEnv(projectRoot: string): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};
  const candidates = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '.env.heretic'),
  ];

  for (const filePath of candidates) {
    try {
      const raw = await readFile(filePath, 'utf-8');
      Object.assign(merged, parseEnvFile(raw));
    } catch {
      // Optional env files; ignore missing/unreadable files.
    }
  }

  return merged;
}

async function readPid(projectRoot: string): Promise<number | null> {
  try {
    const raw = await readFile(pidFile(projectRoot), 'utf-8');
    const pid = Number(raw.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readLease(projectRoot: string): Promise<RuntimeWorkerLease | null> {
  try {
    const raw = await readFile(leaseFile(projectRoot), 'utf-8');
    const parsed = JSON.parse(raw) as RuntimeWorkerLease;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeLease(projectRoot: string, lease: RuntimeWorkerLease): Promise<void> {
  await mkdir(stateDir(projectRoot), { recursive: true });
  await writeFile(leaseFile(projectRoot), `${JSON.stringify(lease, null, 2)}\n`, 'utf-8');
}

async function writePid(projectRoot: string, pid: number): Promise<void> {
  await mkdir(stateDir(projectRoot), { recursive: true });
  await writeFile(pidFile(projectRoot), `${pid}\n`, 'utf-8');
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    if (!processAlive(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return !processAlive(pid);
}

function killProcessTreeWindows(pid: number): void {
  const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  if (result.status !== 0) {
    throw new HereticSaisoError('HERETIC_WORKER_STALE_LEASE', `Failed to force-kill Windows process tree pid=${pid}`);
  }
}

async function buildStatus(projectRoot: string): Promise<RuntimeWorkerStatus> {
  const pid = await readPid(projectRoot);
  const lease = await readLease(projectRoot);
  const alive = pid ? processAlive(pid) : false;

  let lastHeartbeatAt: string | null = null;
  try {
    const heartbeatRaw = await readFile(heartbeatFile(projectRoot), 'utf-8');
    const heartbeat = heartbeatRaw.trim();
    lastHeartbeatAt = heartbeat || null;
  } catch {
    lastHeartbeatAt = null;
  }

  const state = !pid
    ? 'stopped'
    : alive
      ? (lease?.status || 'running')
      : 'unknown';

  return {
    state,
    pid: pid ?? null,
    uptimeMs: lease && alive ? Math.max(0, Date.now() - Date.parse(lease.startedAt)) : null,
    projectRoot,
    lastHeartbeatAt,
    activeTransport: null,
    pendingAlertCount: 0,
    leasePath: leaseFile(projectRoot),
    pidPath: pidFile(projectRoot),
  };
}

export async function getRuntimeWorkerStatus(projectRoot: string): Promise<RuntimeWorkerStatus> {
  return buildStatus(projectRoot);
}

export async function startRuntimeWorker(options: RuntimeWorkerStartOptions): Promise<RuntimeWorkerStatus> {
  const projectRoot = path.resolve(options.projectRoot);
  const existingPid = await readPid(projectRoot);

  if (existingPid && processAlive(existingPid)) {
    return buildStatus(projectRoot);
  }

  await mkdir(stateDir(projectRoot), { recursive: true });

  const cliBin = options.cliBin || process.execPath;
  if (!options.cliEntry) {
    throw new HereticSaisoError('HERETIC_INVALID_INPUT', 'Missing CLI entry path for runtime worker spawn');
  }

  const projectEnv = await loadProjectEnv(projectRoot);

  const args = [
    options.cliEntry,
    'heretic',
    'alert',
    'worker',
    '--prices-file',
    path.resolve(options.pricesFile),
    '--interval',
    String(Math.max(1000, options.intervalMs)),
    '--cycles',
    '0',
    '--project-root',
    projectRoot,
  ];

  if (options.priceSource && options.priceSource.trim()) {
    args.push('--price-source', options.priceSource.trim());
  }
  if (options.vsCurrency && options.vsCurrency.trim()) {
    args.push('--vs-currency', options.vsCurrency.trim());
  }

  if (options.notifyDaemon) {
    args.push('--notify-daemon');
  }

  const child = spawn(cliBin, args, {
    detached: !options.foreground,
    stdio: options.foreground ? 'inherit' : 'ignore',
    env: {
      ...projectEnv,
      ...process.env,
      ...(options.env || {}),
      SAISO_HERETIC_RUNTIME_WORKER: '1',
    },
  });

  child.on('error', (error) => {
    throw new HereticSaisoError('HERETIC_WORKER_STALE_LEASE', `Failed to start runtime worker: ${error.message}`);
  });

  if (!options.foreground) {
    child.unref();
  }

  await writePid(projectRoot, child.pid ?? process.pid);
  await writeLease(projectRoot, {
    holderHost: os.hostname(),
    pid: child.pid ?? process.pid,
    processStartTime: PROCESS_START_TIME,
    startedAt: new Date().toISOString(),
    version: '1.0.0-rc5',
    projectRoot,
    status: 'running',
  });

  return buildStatus(projectRoot);
}

export async function stopRuntimeWorker(projectRootInput: string): Promise<RuntimeWorkerStatus> {
  const projectRoot = path.resolve(projectRootInput);
  const pid = await readPid(projectRoot);

  if (!pid) {
    return buildStatus(projectRoot);
  }

  if (!processAlive(pid)) {
    await rm(pidFile(projectRoot), { force: true });
    await writeLease(projectRoot, {
      holderHost: os.hostname(),
      pid,
      processStartTime: PROCESS_START_TIME,
      startedAt: new Date().toISOString(),
      version: '1.0.0-rc5',
      projectRoot,
      status: 'stopped',
    });
    return buildStatus(projectRoot);
  }

  if (process.platform === 'win32') {
    process.kill(pid, 'SIGTERM');
    const exited = await waitForExit(pid, 8000);
    if (!exited) {
      killProcessTreeWindows(pid);
    }
  } else {
    process.kill(pid, 'SIGTERM');
    const exited = await waitForExit(pid, 8000);
    if (!exited) {
      process.kill(pid, 'SIGKILL');
    }
  }

  await rm(pidFile(projectRoot), { force: true });
  await writeLease(projectRoot, {
    holderHost: os.hostname(),
    pid,
    processStartTime: PROCESS_START_TIME,
    startedAt: new Date().toISOString(),
    version: '1.0.0-rc5',
    projectRoot,
    status: 'stopped',
  });

  return buildStatus(projectRoot);
}

export async function heartbeatRuntimeWorker(projectRootInput: string): Promise<void> {
  const projectRoot = path.resolve(projectRootInput);
  await mkdir(stateDir(projectRoot), { recursive: true });
  await writeFile(heartbeatFile(projectRoot), `${new Date().toISOString()}\n`, 'utf-8');
}
