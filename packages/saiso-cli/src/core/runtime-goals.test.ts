import { describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadGoalRunner, saveGoalRunner } from './runtime-goals.js';

describe('runtime goal store', () => {
  it('persists and reloads goal-runner records from project state', async () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'saiso-runtime-goals-'));

    const runner = await loadGoalRunner(projectRoot);
    runner.create({
      id: 'goal-a',
      title: 'Check transport contracts',
      requiresApproval: false,
      chainFamily: 'evm',
    });
    runner.start('goal-a', 'tester');
    runner.complete('goal-a', 'done', 'tester');

    await saveGoalRunner(projectRoot, runner);

    const reloaded = await loadGoalRunner(projectRoot);
    const goals = reloaded.list();

    expect(goals.length).toBe(1);
    expect(goals[0]?.id).toBe('goal-a');
    expect(goals[0]?.state).toBe('completed');
    expect(goals[0]?.transitions.length).toBe(2);
  });
});
