export type GoalRunState =
  | 'draft'
  | 'awaiting_approval'
  | 'running'
  | 'paused'
  | 'failed'
  | 'completed'
  | 'cancelled';

export interface GoalRunTransition {
  from: GoalRunState;
  to: GoalRunState;
  at: string;
  reason?: string;
  actor?: string;
}

export interface GoalRunRecord {
  id: string;
  title: string;
  state: GoalRunState;
  requiresApproval: boolean;
  approvedBy?: string;
  chainFamily?: 'evm' | 'svm';
  decisionTrace: string[];
  receipts: Array<Record<string, unknown>>;
  summary?: string;
  transitions: GoalRunTransition[];
  createdAt: string;
  updatedAt: string;
}

export class GoalRunnerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GoalRunnerError';
    this.code = code;
  }
}

export class GoalRunner {
  private readonly goals = new Map<string, GoalRunRecord>();

  list(): GoalRunRecord[] {
    return [...this.goals.values()].map((goal) => clone(goal));
  }

  hydrate(goals: GoalRunRecord[]): void {
    this.goals.clear();
    for (const goal of goals) {
      this.goals.set(goal.id, clone(goal));
    }
  }

  create(input: {
    id: string;
    title: string;
    requiresApproval?: boolean;
    chainFamily?: 'evm' | 'svm';
  }): GoalRunRecord {
    if (this.goals.has(input.id)) {
      throw new GoalRunnerError('goal_exists', `Goal '${input.id}' already exists`);
    }

    const now = new Date().toISOString();
    const record: GoalRunRecord = {
      id: input.id,
      title: input.title,
      state: 'draft',
      requiresApproval: input.requiresApproval ?? true,
      chainFamily: input.chainFamily,
      decisionTrace: [],
      receipts: [],
      transitions: [],
      createdAt: now,
      updatedAt: now,
    };

    this.goals.set(input.id, record);
    return clone(record);
  }

  get(id: string): GoalRunRecord {
    const goal = this.goals.get(id);
    if (!goal) {
      throw new GoalRunnerError('goal_not_found', `Goal '${id}' not found`);
    }
    return clone(goal);
  }

  requestApproval(id: string, actor?: string): GoalRunRecord {
    return this.transition(id, 'awaiting_approval', {
      validFrom: ['draft'],
      actor,
      reason: 'approval_requested',
    });
  }

  approve(id: string, actor: string): GoalRunRecord {
    const goal = this.requireGoal(id);
    if (goal.state !== 'awaiting_approval') {
      throw new GoalRunnerError('invalid_transition', `Cannot approve goal from '${goal.state}'`);
    }

    goal.approvedBy = actor;
    return this.transition(id, 'running', {
      validFrom: ['awaiting_approval'],
      actor,
      reason: 'approved',
    });
  }

  start(id: string, actor?: string): GoalRunRecord {
    const goal = this.requireGoal(id);
    if (goal.requiresApproval && !goal.approvedBy) {
      throw new GoalRunnerError('approval_required', `Goal '${id}' requires approval before starting`);
    }

    if (goal.state === 'draft') {
      return this.transition(id, 'running', {
        validFrom: ['draft'],
        actor,
        reason: 'started',
      });
    }

    if (goal.state === 'paused') {
      return this.transition(id, 'running', {
        validFrom: ['paused'],
        actor,
        reason: 'resumed',
      });
    }

    throw new GoalRunnerError('invalid_transition', `Cannot start goal from '${goal.state}'`);
  }

  pause(id: string, reason?: string, actor?: string): GoalRunRecord {
    return this.transition(id, 'paused', {
      validFrom: ['running'],
      actor,
      reason: reason || 'paused',
    });
  }

  cancel(id: string, reason?: string, actor?: string): GoalRunRecord {
    return this.transition(id, 'cancelled', {
      validFrom: ['draft', 'awaiting_approval', 'running', 'paused'],
      actor,
      reason: reason || 'cancelled',
    });
  }

  fail(id: string, reason: string, actor?: string): GoalRunRecord {
    return this.transition(id, 'failed', {
      validFrom: ['running', 'paused'],
      actor,
      reason,
    });
  }

  complete(id: string, summary?: string, actor?: string): GoalRunRecord {
    const next = this.transition(id, 'completed', {
      validFrom: ['running'],
      actor,
      reason: 'completed',
    });

    const goal = this.requireGoal(id);
    goal.summary = summary;
    goal.updatedAt = new Date().toISOString();
    return clone(goal);
  }

  appendDecision(id: string, entry: string): GoalRunRecord {
    const goal = this.requireGoal(id);
    goal.decisionTrace.push(entry);
    goal.updatedAt = new Date().toISOString();
    return clone(goal);
  }

  appendReceipt(id: string, receipt: Record<string, unknown>): GoalRunRecord {
    const goal = this.requireGoal(id);
    goal.receipts.push(receipt);
    goal.updatedAt = new Date().toISOString();
    return clone(goal);
  }

  private transition(
    id: string,
    nextState: GoalRunState,
    options: {
      validFrom: GoalRunState[];
      actor?: string;
      reason?: string;
    }
  ): GoalRunRecord {
    const goal = this.requireGoal(id);
    if (!options.validFrom.includes(goal.state)) {
      throw new GoalRunnerError('invalid_transition', `Cannot transition goal from '${goal.state}' to '${nextState}'`);
    }

    const transition: GoalRunTransition = {
      from: goal.state,
      to: nextState,
      at: new Date().toISOString(),
      reason: options.reason,
      actor: options.actor,
    };

    goal.state = nextState;
    goal.transitions.push(transition);
    goal.updatedAt = transition.at;

    return clone(goal);
  }

  private requireGoal(id: string): GoalRunRecord {
    const goal = this.goals.get(id);
    if (!goal) {
      throw new GoalRunnerError('goal_not_found', `Goal '${id}' not found`);
    }
    return goal;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
