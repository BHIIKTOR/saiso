import { afterEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EvmMcpOrchestrator } from '../src/mcp/evm-orchestrator.js';
import { SvmMcpOrchestrator } from '../src/mcp/svm-orchestrator.js';
import type { SaisoConfig } from '../src/types/config.js';

function hasDockerRuntime(): boolean {
  const cli = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  if (cli.status !== 0) {
    return false;
  }
  const daemon = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return daemon.status === 0;
}

function getEvmDockerConfig(startupTimeoutMs: number): SaisoConfig {
  return {
    environment: 'testnet',
    network: 'sepolia',
    chainId: 11155111,
    rpcUrl: 'https://rpc.example',
    agentName: 'DockerTestAgent',
    logLevel: 'info',
    debug: false,
    mcpServerUrl: 'http://localhost:3001',
    mcpServerPort: 3001,
    mcpServer: {
      type: 'evm',
      mode: 'docker',
      docker: {
        image: 'saiso/does-not-exist:local',
        startupTimeoutMs,
        healthPath: '/health',
        pullPolicy: 'never',
      },
      config: {
        network: 'sepolia',
        chainId: 11155111,
        rpcUrl: 'https://rpc.example',
        host: 'localhost',
        port: 3001,
      },
    },
  };
}

function getSvmDockerConfig(startupTimeoutMs: number): SaisoConfig {
  return {
    environment: 'testnet',
    network: 'solana-devnet',
    chainId: 103,
    rpcUrl: 'https://rpc.example',
    agentName: 'DockerTestAgent',
    logLevel: 'info',
    debug: false,
    mcpServerUrl: 'http://localhost:3001',
    mcpServerPort: 3001,
    mcpServer: {
      type: 'svm',
      mode: 'docker',
      docker: {
        image: 'saiso/does-not-exist:local',
        startupTimeoutMs,
        healthPath: '/health',
        pullPolicy: 'never',
      },
      config: {
        network: 'solana-devnet',
        chainId: 103,
        rpcUrl: 'https://rpc.example',
        host: 'localhost',
        port: 3001,
      },
    },
  };
}

describe('docker orchestrator integration', () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'saiso-docker-orch-'));
  const evmOrchestrator = new EvmMcpOrchestrator();
  const svmOrchestrator = new SvmMcpOrchestrator();

  afterEach(async () => {
    await evmOrchestrator.stop().catch(() => undefined);
    await svmOrchestrator.stop().catch(() => undefined);
  });

  it('routes EVM docker mode through docker lifecycle path', async () => {
    if (!hasDockerRuntime()) {
      expect(true).toBe(true);
      return;
    }

    await expect(
      evmOrchestrator.start(getEvmDockerConfig(1500), projectRoot)
    ).rejects.toThrow();
  });

  it('routes SVM docker mode through docker lifecycle path', async () => {
    if (!hasDockerRuntime()) {
      expect(true).toBe(true);
      return;
    }

    await expect(
      svmOrchestrator.start(getSvmDockerConfig(1500), projectRoot)
    ).rejects.toThrow();
  });
});
