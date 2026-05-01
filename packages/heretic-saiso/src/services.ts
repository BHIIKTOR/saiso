import path from 'node:path';
import {
  AlertScheduler,
  GoalRunner,
  GoalRunnerError,
  type AlertEvent as CoreAlertEvent,
  type AlertSchedulerState,
} from '@saiso/core';
import {
  readAlertsState,
  readGoalsState,
  readIntegrationState,
  readWorkspaceMapState,
  saveGoalRunnerState,
  updateAlertsState,
  updateGoalsState,
  updateIntegrationState,
  updateWorkspaceMapState,
} from './state.js';
import type {
  AlertRuleDefinition,
  AlertRule,
  GoalsStateData,
  HereticIntegrationConfig,
  HereticSessionBinding,
  WorkspaceMapEntry,
} from './types.js';
import { HereticSaisoError } from './errors.js';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function loadIntegration(projectRoot: string): Promise<HereticIntegrationConfig> {
  const state = await readIntegrationState(projectRoot);
  return clone(state.data);
}

export async function initializeIntegration(
  projectRoot: string,
  patch: {
    daemon?: Partial<HereticIntegrationConfig['daemon']>;
    transport?: Partial<HereticIntegrationConfig['transport']>;
    policy?: Partial<HereticIntegrationConfig['policy']>;
  },
): Promise<HereticIntegrationConfig> {
  const updated = await updateIntegrationState(projectRoot, (current) => {
    const next: HereticIntegrationConfig = {
      daemon: {
        ...current.data.daemon,
        ...patch.daemon,
      },
      transport: {
        ...current.data.transport,
        ...patch.transport,
      },
      policy: {
        ...current.data.policy,
        ...patch.policy,
      },
    };

    return next;
  });

  return clone(updated.data);
}

function normalizedWorkspaceRoot(input: string): string {
  return path.resolve(input);
}

export async function bindWorkspace(
  projectRoot: string,
  workspaceRoot: string,
  binding: HereticSessionBinding,
): Promise<WorkspaceMapEntry> {
  const key = normalizedWorkspaceRoot(workspaceRoot);
  const updated = await updateWorkspaceMapState(projectRoot, (current) => {
    const nextMappings = {
      ...current.data.mappings,
      [key]: {
        workspaceRoot: key,
        hereticProjectRoot: binding.hereticProjectRoot,
        projectId: binding.projectId,
        sessionId: binding.sessionId,
        updatedAt: new Date().toISOString(),
      },
    };

    return {
      mappings: nextMappings,
    };
  });

  return clone(updated.data.mappings[key]);
}

export async function getWorkspaceBinding(projectRoot: string, workspaceRoot: string): Promise<WorkspaceMapEntry | null> {
  const state = await readWorkspaceMapState(projectRoot);
  const key = normalizedWorkspaceRoot(workspaceRoot);
  return state.data.mappings[key] ? clone(state.data.mappings[key]) : null;
}

export async function requireWorkspaceBinding(projectRoot: string, workspaceRoot: string): Promise<WorkspaceMapEntry> {
  const binding = await getWorkspaceBinding(projectRoot, workspaceRoot);
  if (!binding) {
    throw new HereticSaisoError(
      'HERETIC_INVALID_INPUT',
      `Workspace '${normalizedWorkspaceRoot(workspaceRoot)}' is not bound. Run 'saiso heretic workspace attach'.`,
    );
  }
  return binding;
}

export async function loadGoalRunnerForProject(projectRoot: string): Promise<{ runner: GoalRunner; state: GoalsStateData }> {
  const state = await readGoalsState(projectRoot);
  const runner = new GoalRunner();
  runner.hydrate(state.data.goals || []);
  return {
    runner,
    state: clone(state.data),
  };
}

export async function persistGoalRunner(projectRoot: string, runner: GoalRunner): Promise<void> {
  await saveGoalRunnerState(projectRoot, runner);
}

export async function appendGoalPolicyEvent(
  projectRoot: string,
  event: {
    goalId: string;
    actor: string;
    decision: 'allow' | 'require_approval' | 'deny';
    reason: string;
  },
): Promise<void> {
  await updateGoalsState(projectRoot, (current) => ({
    ...current.data,
    policyEvents: [
      ...current.data.policyEvents,
      {
        eventId: `policy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        goalId: event.goalId,
        at: new Date().toISOString(),
        actor: event.actor,
        decision: event.decision,
        reason: event.reason,
      },
    ],
  }));
}

export async function runGoalTransition(
  projectRoot: string,
  input: {
    id: string;
    title: string;
    actor: string;
    requiresApproval: boolean;
    autoApprove: boolean;
  },
): Promise<ReturnType<GoalRunner['get']>> {
  const { runner } = await loadGoalRunnerForProject(projectRoot);

  let goal;
  try {
    goal = runner.get(input.id);
  } catch (error) {
    if (error instanceof GoalRunnerError && error.code === 'goal_not_found') {
      goal = runner.create({
        id: input.id,
        title: input.title,
        requiresApproval: input.requiresApproval,
      });
    } else {
      throw error;
    }
  }

  if (goal.state === 'draft') {
    if (input.requiresApproval) {
      runner.requestApproval(goal.id, input.actor);
      if (input.autoApprove) {
        runner.approve(goal.id, input.actor);
      }
    }

    if (!input.requiresApproval || input.autoApprove) {
      runner.start(goal.id, input.actor);
    }
  }

  await persistGoalRunner(projectRoot, runner);
  return runner.get(goal.id);
}

function buildAlertStore(projectRoot: string) {
  return {
    async load(): Promise<AlertSchedulerState | undefined> {
      const state = await readAlertsState(projectRoot);
      return clone(state.data.schedulerState);
    },
    async save(nextState: AlertSchedulerState): Promise<void> {
      await updateAlertsState(projectRoot, (current) => ({
        ...current.data,
        schedulerState: clone(nextState),
      }));
    },
  };
}

export async function listAlertRules(projectRoot: string): Promise<AlertRule[]> {
  const state = await readAlertsState(projectRoot);
  return clone(state.data.rules);
}

export async function addAlertRule(
  projectRoot: string,
  input: {
    id: string;
    asset: string;
    rule: AlertRuleDefinition;
    intervalMs: number;
    cooldownMs: number;
    status: AlertRule['status'];
  },
): Promise<AlertRule> {
  const updated = await updateAlertsState(projectRoot, (current) => {
    const exists = current.data.rules.find((rule) => rule.id === input.id);
    if (exists) {
      throw new HereticSaisoError('HERETIC_STATE_CONFLICT', `Alert '${input.id}' already exists`);
    }

    const now = new Date().toISOString();
    const nextRule: AlertRule = {
      id: input.id,
      asset: input.asset,
      rule: input.rule,
      intervalMs: input.intervalMs,
      cooldownMs: input.cooldownMs,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };

    return {
      ...current.data,
      rules: [...current.data.rules, nextRule],
    };
  });

  const created = updated.data.rules.find((rule) => rule.id === input.id);
  if (!created) {
    throw new HereticSaisoError('HERETIC_STATE_SCHEMA_INVALID', `Failed to create alert '${input.id}'`);
  }

  return clone(created);
}

export async function removeAlertRule(projectRoot: string, id: string): Promise<boolean> {
  let removed = false;
  await updateAlertsState(projectRoot, (current) => {
    const nextRules = current.data.rules.filter((rule) => rule.id !== id);
    removed = nextRules.length !== current.data.rules.length;
    return {
      ...current.data,
      rules: nextRules,
    };
  });
  return removed;
}

export async function setAlertStatus(projectRoot: string, id: string, status: AlertRule['status']): Promise<AlertRule> {
  let updatedRule: AlertRule | null = null;

  await updateAlertsState(projectRoot, (current) => {
    const nextRules = current.data.rules.map((rule) => {
      if (rule.id !== id) return rule;
      updatedRule = {
        ...rule,
        status,
        updatedAt: new Date().toISOString(),
      };
      return updatedRule;
    });

    if (!updatedRule) {
      throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Alert '${id}' does not exist`);
    }

    return {
      ...current.data,
      rules: nextRules,
    };
  });

  if (!updatedRule) {
    throw new HereticSaisoError('HERETIC_INVALID_INPUT', `Alert '${id}' does not exist`);
  }

  return clone(updatedRule);
}

export function evaluateAlertRule(rule: AlertRuleDefinition, price: number): boolean {
  switch (rule.operator) {
    case 'gt':
      return price > rule.targetValue;
    case 'gte':
      return price >= rule.targetValue;
    case 'lt':
      return price < rule.targetValue;
    case 'lte':
      return price <= rule.targetValue;
    case 'crosses_up':
      return price >= rule.targetValue;
    case 'crosses_down':
      return price <= rule.targetValue;
    case 'pct_change_up':
      return price >= rule.targetValue;
    case 'pct_change_down':
      return price <= rule.targetValue;
    default:
      return false;
  }
}

export async function processAlertEvent(
  projectRoot: string,
  event: CoreAlertEvent,
  sender: (event: CoreAlertEvent) => Promise<void>,
): Promise<{ delivered: boolean; reason: string; dedupeKey: string }> {
  const store = buildAlertStore(projectRoot);
  const scheduler = new AlertScheduler(sender, store);
  await scheduler.hydrate();

  const result = await scheduler.process(event);
  await scheduler.flushRetries();

  return {
    delivered: result.delivered,
    reason: result.reason,
    dedupeKey: result.dedupeKey,
  };
}
