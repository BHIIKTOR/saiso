import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GoalRunner, type GoalRunRecord } from '@saiso/core';

const GOAL_STORE_RELATIVE_PATH = path.join('.saiso', 'runtime', 'goals.json');

interface GoalStoreShape {
  goals: GoalRunRecord[];
}

export function getGoalStorePath(projectRoot: string): string {
  return path.join(projectRoot, GOAL_STORE_RELATIVE_PATH);
}

export async function loadGoalRunner(projectRoot: string): Promise<GoalRunner> {
  const runner = new GoalRunner();
  const storePath = getGoalStorePath(projectRoot);
  if (!existsSync(storePath)) {
    return runner;
  }

  const raw = await readFile(storePath, 'utf-8');
  if (!raw.trim()) {
    return runner;
  }

  const parsed = JSON.parse(raw) as GoalStoreShape;
  runner.hydrate(Array.isArray(parsed.goals) ? parsed.goals : []);
  return runner;
}

export async function saveGoalRunner(projectRoot: string, runner: GoalRunner): Promise<void> {
  const storePath = getGoalStorePath(projectRoot);
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify({ goals: runner.list() }, null, 2)}\n`, 'utf-8');
}
