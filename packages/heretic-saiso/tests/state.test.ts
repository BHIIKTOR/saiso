import { describe, expect, it } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  acquireStateLock,
  readIntegrationState,
  updateIntegrationState,
} from '../src/state.js';
import { HereticSaisoError } from '../src/errors.js';

describe('state lock and revision behavior', () => {
  it('rejects lock contention on short timeout', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'heretic-saiso-state-lock-'));

    const release = await acquireStateLock(projectRoot, {
      timeoutMs: 1000,
      staleMs: 10_000,
      retryDelayMs: 5,
    });

    try {
      await expect(async () => {
        await acquireStateLock(projectRoot, {
          timeoutMs: 50,
          staleMs: 10_000,
          retryDelayMs: 5,
        });
      }).toThrow(HereticSaisoError);
    } finally {
      await release();
    }
  });

  it('enforces revision conflict when expected revision is stale', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'heretic-saiso-state-rev-'));

    const initial = await readIntegrationState(projectRoot);
    expect(initial.revision).toBe(0);

    const next = await updateIntegrationState(projectRoot, (current) => ({
      ...current.data,
      transport: {
        ...current.data.transport,
        selected: 'webhook',
      },
    }), 0);

    expect(next.revision).toBe(1);

    await expect(async () => {
      await updateIntegrationState(projectRoot, (current) => current.data, 0);
    }).toThrow(HereticSaisoError);
  });
});
