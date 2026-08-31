import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectScaffolder } from './scaffolding.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'saiso-scaffold-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ProjectScaffolder', () => {
  it('creates a basic EVM project structure', async () => {
    const scaffolder = new ProjectScaffolder();
    const projectPath = path.join(dir, 'my-agent');
    await scaffolder.createProject({
      projectName: 'my-agent',
      environment: 'testnet',
      projectPath,
      agentName: 'MyAgent',
      mcpServerType: 'evm',
      targetNetwork: 'sepolia',
    });

    expect(existsSync(path.join(projectPath, 'package.json'))).toBe(true);
    expect(existsSync(path.join(projectPath, '.env'))).toBe(true);
    expect(existsSync(path.join(projectPath, '.saiso'))).toBe(true);
  });

  it('creates a service blueprint when requested', async () => {
    const scaffolder = new ProjectScaffolder();
    const projectPath = path.join(dir, 'paid-agent');
    await scaffolder.createProject({
      projectName: 'paid-agent',
      environment: 'testnet',
      projectPath,
      agentName: 'PaidAgent',
      mcpServerType: 'evm',
      targetNetwork: 'sepolia',
      serviceBlueprint: true,
    });

    expect(existsSync(path.join(projectPath, 'src', 'service.ts'))).toBe(true);
  });

  it('writes a valid package.json', async () => {
    const scaffolder = new ProjectScaffolder();
    const projectPath = path.join(dir, 'pkg-agent');
    await scaffolder.createProject({
      projectName: 'pkg-agent',
      environment: 'testnet',
      projectPath,
      agentName: 'PkgAgent',
      mcpServerType: 'evm',
      targetNetwork: 'sepolia',
    });

    const pkg = JSON.parse(readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('pkg-agent');
  });

  it('creates identity discovery files', async () => {
    const scaffolder = new ProjectScaffolder();
    const projectPath = path.join(dir, 'id-agent');
    await scaffolder.createProject({
      projectName: 'id-agent',
      environment: 'testnet',
      projectPath,
      agentName: 'IdAgent',
      mcpServerType: 'evm',
      targetNetwork: 'sepolia',
    });

    expect(existsSync(path.join(projectPath, '.well-known', 'agent-registration.json'))).toBe(true);
  });

  it('creates policy files', async () => {
    const scaffolder = new ProjectScaffolder();
    const projectPath = path.join(dir, 'pol-agent');
    await scaffolder.createProject({
      projectName: 'pol-agent',
      environment: 'testnet',
      projectPath,
      agentName: 'PolAgent',
      mcpServerType: 'evm',
      targetNetwork: 'sepolia',
    });

    expect(existsSync(path.join(projectPath, '.saiso', 'payment-policy.json'))).toBe(true);
    expect(existsSync(path.join(projectPath, '.saiso', 'trust-policy.json'))).toBe(true);
  });
});