import { describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SaisoMcpManager } from '../src/mcp/multi-server-manager.js';

describe('SaisoMcpManager routing failures', () => {
  it('throws when routeAndExecuteTool has no matching server', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-manager-routing-'));
    const manager = new SaisoMcpManager(projectPath);

    await expect(
      manager.routeAndExecuteTool(
        { capability: 'premium-simulate', serverType: 'evm' },
        'premium-simulate',
        { dryRun: true }
      )
    ).rejects.toThrow('No matching server found for routing criteria');
  });

  it('throws when executing tool on unknown server', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-manager-exec-'));
    const manager = new SaisoMcpManager(projectPath);

    await expect(
      manager.executeTool('unknown-server', 'premium-simulate', { dryRun: true })
    ).rejects.toThrow("Server 'unknown-server' not found");
  });
});
