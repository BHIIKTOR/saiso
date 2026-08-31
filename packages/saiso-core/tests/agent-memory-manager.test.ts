import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentMemoryManager, type AgentPersonality, type AgentLearning } from '../src/memory/agent-memory-manager.js';

let projectPath: string;

beforeEach(() => {
  projectPath = mkdtempSync(path.join(tmpdir(), 'saiso-memory-'));
});

afterEach(() => {
  rmSync(projectPath, { recursive: true, force: true });
});

const personality: AgentPersonality = {
  name: 'TraderBot',
  description: 'A trading agent',
  traits: ['analytical'],
  preferences: { riskTolerance: 'low' },
  communicationStyle: 'concise',
  expertise: ['defi'],
  goals: ['maximize returns'],
};

const learning: AgentLearning = {
  interactions: [],
  patterns: [],
  userPreferences: {},
  contextualKnowledge: {},
  lastUpdated: new Date(),
};

describe('AgentMemoryManager', () => {
  it('initializes a new memory structure', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    const restored = await manager.restoreAgentMemory();
    expect(restored.personality.name).toBe('TraderBot');
    expect(restored.learning.interactions).toEqual([]);
  });

  it('preserves and restores agent memory', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.preserveAgentMemory(personality, learning);
    const restored = await manager.restoreAgentMemory();
    expect(restored.personality).toEqual(personality);
    expect(restored.learning).toEqual(learning);
  });

  it('throws when preserving memory before initialization', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await expect(manager.preserveAgentMemory(personality, learning)).rejects.toThrow('Memory system not initialized');
  });

  it('throws when restoring with no memory data on disk', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await expect(manager.restoreAgentMemory()).rejects.toThrow('ENOENT');
  });

  it('adds interactions with generated ids and increments total', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.addInteraction({
      timestamp: new Date(),
      userInput: 'hello',
      agentResponse: 'hi',
      context: {},
      outcome: 'success',
    });
    const restored = await manager.restoreAgentMemory();
    expect(restored.learning.interactions).toHaveLength(1);
    expect(restored.learning.interactions[0].id).toBeTruthy();
  });

  it('caps interaction history at maxInteractionHistory', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0, maxInteractionHistory: 3 });
    await manager.initialize('TraderBot');
    for (let i = 0; i < 5; i++) {
      await manager.addInteraction({
        timestamp: new Date(),
        userInput: `input-${i}`,
        agentResponse: 'ok',
        context: {},
        outcome: 'success',
      });
    }
    const restored = await manager.restoreAgentMemory();
    expect(restored.learning.interactions).toHaveLength(3);
    expect(restored.learning.interactions[2].userInput).toBe('input-4');
  });

  it('deduplicates learned patterns and increments frequency', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.addLearnedPattern({ pattern: 'buy-on-dip', frequency: 1, confidence: 0.5, context: [], lastSeen: new Date() });
    await manager.addLearnedPattern({ pattern: 'buy-on-dip', frequency: 1, confidence: 0.5, context: [], lastSeen: new Date() });
    const restored = await manager.restoreAgentMemory();
    expect(restored.learning.patterns).toHaveLength(1);
    expect(restored.learning.patterns[0].frequency).toBe(2);
    expect(restored.learning.patterns[0].confidence).toBeCloseTo(0.6, 10);
  });

  it('caps pattern history by confidence', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0, maxPatternHistory: 2 });
    await manager.initialize('TraderBot');
    await manager.addLearnedPattern({ pattern: 'p1', frequency: 1, confidence: 0.9, context: [], lastSeen: new Date() });
    await manager.addLearnedPattern({ pattern: 'p2', frequency: 1, confidence: 0.1, context: [], lastSeen: new Date() });
    await manager.addLearnedPattern({ pattern: 'p3', frequency: 1, confidence: 0.8, context: [], lastSeen: new Date() });
    const restored = await manager.restoreAgentMemory();
    expect(restored.learning.patterns).toHaveLength(2);
    expect(restored.learning.patterns[0].pattern).toBe('p1');
    expect(restored.learning.patterns[1].pattern).toBe('p3');
  });

  it('separates chain data per server', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.separateChainData('eth-defi', { networkState: { block: 100 } });
    await manager.separateChainData('svm-trading', { networkState: { slot: 5 } });
    const eth = manager.getChainData('eth-defi');
    const svm = manager.getChainData('svm-trading');
    expect(eth?.networkState).toEqual({ block: 100 });
    expect(svm?.networkState).toEqual({ slot: 5 });
  });

  it('adds transactions to chain data', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.addTransaction('eth-defi', {
      hash: '0xabc',
      timestamp: new Date(),
      type: 'transfer',
      from: '0x1',
      to: '0x2',
      value: '100',
      gasUsed: '21000',
      status: 'success',
    });
    const chain = manager.getChainData('eth-defi');
    expect(chain?.transactions).toHaveLength(1);
    expect(chain?.transactions[0].hash).toBe('0xabc');
  });

  it('adds contract interactions and creates contract entries', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.addContractInteraction('eth-defi', '0xcontract', {
      timestamp: new Date(),
      method: 'swap',
      parameters: [],
      success: true,
    });
    const chain = manager.getChainData('eth-defi');
    expect(chain?.contracts).toHaveLength(1);
    expect(chain?.contracts[0].address).toBe('0xcontract');
    expect(chain?.contracts[0].interactions).toHaveLength(1);
  });

  it('upserts balance snapshots per token', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.updateBalance('eth-defi', { timestamp: new Date(), token: 'ETH', balance: '1.5' });
    await manager.updateBalance('eth-defi', { timestamp: new Date(), token: 'ETH', balance: '2.0' });
    const chain = manager.getChainData('eth-defi');
    expect(chain?.balances).toHaveLength(1);
    expect(chain?.balances[0].balance).toBe('2.0');
  });

  it('returns recent interactions sorted by timestamp', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.addInteraction({ timestamp: new Date('2026-01-01'), userInput: 'old', agentResponse: 'a', context: {}, outcome: 'success' });
    await manager.addInteraction({ timestamp: new Date('2026-01-03'), userInput: 'new', agentResponse: 'b', context: {}, outcome: 'success' });
    const recent = manager.getRecentInteractions(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].userInput).toBe('new');
  });

  it('filters learned patterns by minimum confidence', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.addLearnedPattern({ pattern: 'high', frequency: 1, confidence: 0.9, context: [], lastSeen: new Date() });
    await manager.addLearnedPattern({ pattern: 'low', frequency: 1, confidence: 0.2, context: [], lastSeen: new Date() });
    const patterns = manager.getLearnedPatterns(0.5);
    expect(patterns.map(p => p.pattern)).toEqual(['high']);
  });

  it('validates memory integrity', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    const result = await manager.validateMemory();
    expect(result.valid).toBe(true);
  });

  it('creates a backup file', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.preserveAgentMemory(personality, learning);
    const backupPath = await manager.createBackup();
    expect(backupPath).toContain('backups');
  });

  it('cleans up old data based on threshold', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0, autoCleanup: true, cleanupThreshold: 1 });
    await manager.initialize('TraderBot');
    await manager.addInteraction({ timestamp: new Date('2020-01-01'), userInput: 'ancient', agentResponse: 'a', context: {}, outcome: 'success' });
    await manager.addInteraction({ timestamp: new Date(), userInput: 'fresh', agentResponse: 'b', context: {}, outcome: 'success' });
    await manager.cleanup();
    const restored = await manager.restoreAgentMemory();
    expect(restored.learning.interactions.map(i => i.userInput)).toEqual(['fresh']);
  });

  it('persists memory across manager instances', async () => {
    const manager = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await manager.initialize('TraderBot');
    await manager.preserveAgentMemory(personality, learning);

    const second = new AgentMemoryManager(projectPath, { backupInterval: 0 });
    await second.initialize('OtherName');
    const restored = await second.restoreAgentMemory();
    expect(restored.personality.name).toBe('TraderBot');
  });
});