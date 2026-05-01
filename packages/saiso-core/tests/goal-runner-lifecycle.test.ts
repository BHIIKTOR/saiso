import { describe, expect, it } from 'bun:test';
import { GoalRunner } from '../src/conversational/goal-runner.js';

describe('goal runner lifecycle', () => {
  it('enforces approval-safe lifecycle for mutating goal runs', () => {
    const runner = new GoalRunner();
    const goal = runner.create({
      id: 'goal-1',
      title: 'Rebalance portfolio',
      requiresApproval: true,
      chainFamily: 'evm',
    });

    expect(goal.state).toBe('draft');

    expect(() => runner.start('goal-1')).toThrow('requires approval');

    const awaitingApproval = runner.requestApproval('goal-1', 'operator-a');
    expect(awaitingApproval.state).toBe('awaiting_approval');

    const approved = runner.approve('goal-1', 'operator-a');
    expect(approved.state).toBe('running');
    expect(approved.approvedBy).toBe('operator-a');

    const paused = runner.pause('goal-1', 'manual safety stop', 'operator-a');
    expect(paused.state).toBe('paused');

    const resumed = runner.start('goal-1', 'operator-a');
    expect(resumed.state).toBe('running');

    const withDecision = runner.appendDecision('goal-1', 'route selected: solver-a');
    expect(withDecision.decisionTrace).toContain('route selected: solver-a');

    const withReceipt = runner.appendReceipt('goal-1', { txHash: '0xabc123', status: 'confirmed' });
    expect(withReceipt.receipts.length).toBe(1);

    const completed = runner.complete('goal-1', 'Run completed with profit target met', 'operator-a');
    expect(completed.state).toBe('completed');
    expect(completed.summary).toContain('profit target');

    expect(() => runner.pause('goal-1')).toThrow('Cannot transition');
  });

  it('tracks deterministic transition history and reasons', () => {
    const runner = new GoalRunner();
    runner.create({ id: 'goal-2', title: 'Dry-run quote checks', requiresApproval: false, chainFamily: 'svm' });

    runner.start('goal-2', 'scheduler');
    runner.fail('goal-2', 'upstream_unavailable', 'scheduler');

    const failed = runner.get('goal-2');
    expect(failed.state).toBe('failed');
    expect(failed.transitions.length).toBe(2);
    expect(failed.transitions[0]?.from).toBe('draft');
    expect(failed.transitions[0]?.to).toBe('running');
    expect(failed.transitions[1]?.reason).toBe('upstream_unavailable');
  });

  it('supports cancellation from non-terminal states and rejects invalid transitions', () => {
    const runner = new GoalRunner();
    runner.create({ id: 'goal-3', title: 'Cancel test', requiresApproval: false });

    const cancelled = runner.cancel('goal-3', 'operator_cancelled', 'operator-b');
    expect(cancelled.state).toBe('cancelled');

    expect(() => runner.start('goal-3')).toThrow('Cannot start goal');
    expect(() => runner.approve('goal-3', 'operator-b')).toThrow('Cannot approve goal');
  });
});
