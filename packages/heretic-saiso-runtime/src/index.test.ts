import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getRuntimeWorkerStatus } from '../src/index.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'saiso-heretic-runtime-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('heretic-saiso-runtime', () => {
  it('reports a stopped state for a project with no worker state', async () => {
    const status = await getRuntimeWorkerStatus(dir);
    expect(status.state).toBe('stopped');
    expect(status.pid).toBeNull();
    expect(status.projectRoot).toBe(dir);
  });
});