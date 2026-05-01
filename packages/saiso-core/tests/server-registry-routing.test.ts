import { describe, expect, it } from 'bun:test';
import { McpServerRegistry } from '../src/mcp/server-registry.js';
import type { McpServerInstance } from '../src/types/multi-server.js';
import type { McpServerOrchestrator } from '../src/mcp/orchestrator.js';

function instance(input: {
  name: string;
  trustScore?: number;
  costPerRequestUsd?: number;
  running?: boolean;
  healthy?: boolean;
  startedAtMs?: number;
}): McpServerInstance {
  return {
    config: {
      name: input.name,
      displayName: input.name,
      description: `${input.name} test instance`,
      type: 'evm',
      category: 'blockchain',
      autoStart: false,
      port: 3001,
      envPrefix: `${input.name.toUpperCase()}_`,
      capabilities: ['premium-simulate'],
      createdAt: new Date(),
      updatedAt: new Date(),
      serverConfig: {
        network: 'sepolia',
        chainId: 11155111,
        mode: 'npx',
      },
      trustScore: input.trustScore,
      costPerRequestUsd: input.costPerRequestUsd,
    },
    orchestrator: {} as McpServerOrchestrator,
    status: input.running
      ? {
          running: true,
          mode: 'npx',
          type: 'evm',
          url: `http://localhost:${3000 + Math.floor(Math.random() * 1000)}`,
          port: 3001,
          startTime: input.startedAtMs ? new Date(input.startedAtMs) : new Date(),
          health: 'healthy',
        }
      : null,
    healthStatus: input.healthy ? 'healthy' : input.running ? 'unknown' : 'unknown',
  };
}

describe('McpServerRegistry routing defaults', () => {
  it('prefers highest trust among healthy running servers', () => {
    const registry = new McpServerRegistry();
    registry.register('low', instance({
      name: 'low',
      trustScore: 0.4,
      running: true,
      healthy: true,
      startedAtMs: 1000,
    }));
    registry.register('high', instance({
      name: 'high',
      trustScore: 0.9,
      running: true,
      healthy: true,
      startedAtMs: 500,
    }));

    const selected = registry.getOptimalServer({ capability: 'premium-simulate' });
    expect(selected?.config.name).toBe('high');
  });

  it('uses cost as tie-breaker for running candidates with same trust', () => {
    const registry = new McpServerRegistry();
    registry.register('expensive', instance({
      name: 'expensive',
      trustScore: 0.8,
      costPerRequestUsd: 1.2,
      running: true,
      healthy: false,
      startedAtMs: 1000,
    }));
    registry.register('cheap', instance({
      name: 'cheap',
      trustScore: 0.8,
      costPerRequestUsd: 0.2,
      running: true,
      healthy: false,
      startedAtMs: 900,
    }));

    const selected = registry.getOptimalServer({ capability: 'premium-simulate' });
    expect(selected?.config.name).toBe('cheap');
  });

  it('applies min trust and max cost filters before selecting server', () => {
    const registry = new McpServerRegistry();
    registry.register('candidate-a', instance({
      name: 'candidate-a',
      trustScore: 0.72,
      costPerRequestUsd: 0.35,
      running: true,
      healthy: true,
    }));
    registry.register('candidate-b', instance({
      name: 'candidate-b',
      trustScore: 0.95,
      costPerRequestUsd: 2.5,
      running: true,
      healthy: true,
    }));
    registry.register('candidate-c', instance({
      name: 'candidate-c',
      trustScore: 0.65,
      costPerRequestUsd: 0.1,
      running: true,
      healthy: true,
    }));

    const selected = registry.getOptimalServer({
      capability: 'premium-simulate',
      minTrustScore: 0.7,
      maxCostUsd: 1.0,
    });

    expect(selected?.config.name).toBe('candidate-a');
  });

  it('uses cost-first profile to prioritize lower cost over trust', () => {
    const registry = new McpServerRegistry();
    registry.register('high-trust-expensive', instance({
      name: 'high-trust-expensive',
      trustScore: 0.95,
      costPerRequestUsd: 4.2,
      running: true,
      healthy: true,
    }));
    registry.register('lower-trust-cheap', instance({
      name: 'lower-trust-cheap',
      trustScore: 0.7,
      costPerRequestUsd: 0.2,
      running: true,
      healthy: true,
    }));

    const selected = registry.getOptimalServer({
      capability: 'premium-simulate',
      routingProfile: 'cost-first',
    });
    expect(selected?.config.name).toBe('lower-trust-cheap');
  });

  it('uses balanced profile to keep large trust gaps dominant', () => {
    const registry = new McpServerRegistry();
    registry.register('trusted', instance({
      name: 'trusted',
      trustScore: 0.92,
      costPerRequestUsd: 1.1,
      running: true,
      healthy: true,
    }));
    registry.register('cheap-but-risky', instance({
      name: 'cheap-but-risky',
      trustScore: 0.68,
      costPerRequestUsd: 0.1,
      running: true,
      healthy: true,
    }));

    const selected = registry.getOptimalServer({
      capability: 'premium-simulate',
      routingProfile: 'balanced',
    });
    expect(selected?.config.name).toBe('trusted');
  });
});
