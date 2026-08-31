import { describe, expect, it } from 'bun:test';
import { ResourceTracker } from '../src/mcp/resource-tracker.js';
import type { IndividualServerConfig } from '../src/types/multi-server.js';

function makeServerConfig(overrides: Partial<IndividualServerConfig> = {}): IndividualServerConfig {
  return {
    name: 'test-server',
    displayName: 'Test Server',
    description: 'desc',
    type: 'evm',
    category: 'blockchain',
    autoStart: false,
    port: 3001,
    envPrefix: 'TEST_',
    capabilities: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    serverConfig: {},
    ...overrides,
  };
}

describe('ResourceTracker', () => {
  it('allocates ports within the default range 3001-3100', () => {
    const tracker = new ResourceTracker();
    const port = tracker.allocatePort('server-a');
    expect(port).toBeGreaterThanOrEqual(3001);
    expect(port).toBeLessThanOrEqual(3100);
  });

  it('allocates the first available port sequentially', () => {
    const tracker = new ResourceTracker();
    expect(tracker.allocatePort('a')).toBe(3001);
    expect(tracker.allocatePort('b')).toBe(3002);
    expect(tracker.allocatePort('c')).toBe(3003);
  });

  it('uses a preferred port when available', () => {
    const tracker = new ResourceTracker();
    expect(tracker.allocatePort('a', 3050)).toBe(3050);
  });

  it('skips a preferred port that is already allocated', () => {
    const tracker = new ResourceTracker();
    tracker.allocatePort('a', 3050);
    const second = tracker.allocatePort('b', 3050);
    expect(second).not.toBe(3050);
  });

  it('throws when the port range is exhausted', () => {
    const tracker = new ResourceTracker({ start: 3001, end: 3002 });
    tracker.allocatePort('a');
    tracker.allocatePort('b');
    expect(() => tracker.allocatePort('c')).toThrow(/No available ports/);
  });

  it('releases a port so it can be reused', () => {
    const tracker = new ResourceTracker();
    const port = tracker.allocatePort('a');
    tracker.releasePort(port);
    expect(tracker.allocatePort('b')).toBe(port);
  });

  it('reports port availability only within range', () => {
    const tracker = new ResourceTracker();
    expect(tracker.isPortAvailable(3001)).toBe(true);
    expect(tracker.isPortAvailable(3000)).toBe(false);
    expect(tracker.isPortAvailable(3101)).toBe(false);
  });

  it('tracks allocations per server', () => {
    const tracker = new ResourceTracker();
    tracker.allocatePort('svm-trading');
    tracker.allocatePort('svm-trading');
    tracker.allocatePort('eth-defi');
    expect(tracker.getServerPorts('svm-trading')).toEqual([3001, 3002]);
    expect(tracker.getServerPorts('eth-defi')).toEqual([3003]);
  });

  it('detects port conflicts for another server', () => {
    const tracker = new ResourceTracker();
    tracker.allocatePort('server-a', 3001);
    const result = tracker.checkResourceConflicts(makeServerConfig({ name: 'server-b', port: 3001 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('already allocated to server'))).toBe(true);
  });

  it('warns when a port is already allocated to the same server', () => {
    const tracker = new ResourceTracker();
    tracker.allocatePort('server-a', 3001);
    const result = tracker.checkResourceConflicts(makeServerConfig({ name: 'server-a', port: 3001 }));
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('already allocated to this server'))).toBe(true);
  });

  it('flags ports outside the valid range', () => {
    const tracker = new ResourceTracker();
    const result = tracker.checkResourceConflicts(makeServerConfig({ port: 4000 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('outside valid range'))).toBe(true);
  });

  it('warns when env prefix does not end with underscore', () => {
    const tracker = new ResourceTracker();
    const result = tracker.checkResourceConflicts(makeServerConfig({ envPrefix: 'TEST' }));
    expect(result.warnings.some(w => w.includes('should end with underscore'))).toBe(true);
  });

  it('computes resource usage statistics', () => {
    const tracker = new ResourceTracker({ start: 3001, end: 3004 });
    tracker.allocatePort('a');
    tracker.allocatePort('b');
    const stats = tracker.getResourceStats();
    expect(stats.totalPorts).toBe(4);
    expect(stats.allocatedPorts).toBe(2);
    expect(stats.availablePorts).toBe(2);
    expect(stats.utilizationPercent).toBe(50);
  });

  it('finds an optimal port avoiding a list', () => {
    const tracker = new ResourceTracker();
    tracker.allocatePort('a', 3001);
    expect(tracker.findOptimalPort('b', { avoid: [3002] })).toBe(3003);
  });

  it('finds a sequential port after existing allocations', () => {
    const tracker = new ResourceTracker();
    tracker.allocatePort('a', 3005);
    expect(tracker.findOptimalPort('a', { sequential: true })).toBe(3006);
  });

  it('reserves a port with a reason', () => {
    const tracker = new ResourceTracker();
    tracker.reservePort(3001, 'system');
    expect(tracker.getPortAllocation(3001)?.serverName).toContain('RESERVED');
    expect(() => tracker.reservePort(3001, 'again')).toThrow(/not available/);
  });

  it('rejects invalid port range updates', () => {
    const tracker = new ResourceTracker();
    expect(() => tracker.updatePortRange(3100, 3001)).toThrow(/start must be less than end/);
  });

  it('rejects range updates that would orphan allocations', () => {
    const tracker = new ResourceTracker();
    tracker.allocatePort('a', 3001);
    expect(() => tracker.updatePortRange(3002, 3100)).toThrow(/currently allocated outside new range/);
  });

  it('clears all allocations', () => {
    const tracker = new ResourceTracker();
    tracker.allocatePort('a');
    tracker.clearAllocations();
    expect(tracker.getAllAllocations()).toEqual([]);
  });
});