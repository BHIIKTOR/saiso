/**
 * Agent Memory Manager - Chain-agnostic memory preservation system
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ValidationResult } from '../types/multi-server.js';

export interface AgentPersonality {
  name: string;
  description: string;
  traits: string[];
  preferences: Record<string, unknown>;
  communicationStyle: string;
  expertise: string[];
  goals: string[];
}

export interface AgentLearning {
  interactions: InteractionMemory[];
  patterns: LearnedPattern[];
  userPreferences: Record<string, unknown>;
  contextualKnowledge: Record<string, unknown>;
  lastUpdated: Date;
}

export interface InteractionMemory {
  id: string;
  timestamp: Date;
  userInput: string;
  agentResponse: string;
  context: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'partial';
  feedback?: string;
}

export interface LearnedPattern {
  id: string;
  pattern: string;
  frequency: number;
  confidence: number;
  context: string[];
  lastSeen: Date;
}

export interface ChainSpecificData {
  serverName: string;
  transactions: TransactionMemory[];
  contracts: ContractMemory[];
  balances: BalanceSnapshot[];
  networkState: Record<string, unknown>;
  lastSync: Date;
}

export interface TransactionMemory {
  hash: string;
  timestamp: Date;
  type: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  status: 'success' | 'failed' | 'pending';
  context?: string;
}

export interface ContractMemory {
  address: string;
  name?: string;
  abi?: unknown[];
  interactions: ContractInteraction[];
  lastInteraction: Date;
}

export interface ContractInteraction {
  timestamp: Date;
  method: string;
  parameters: unknown[];
  result?: unknown;
  gasUsed?: string;
  success: boolean;
}

export interface BalanceSnapshot {
  timestamp: Date;
  token: string;
  balance: string;
  usdValue?: number;
}

export interface AgentMemoryData {
  personality: AgentPersonality;
  learning: AgentLearning;
  chainData: Record<string, ChainSpecificData>;
  metadata: {
    version: string;
    createdAt: Date;
    lastBackup: Date;
    totalInteractions: number;
  };
}

export interface MemorySettings {
  preserveAcrossServers: boolean;
  backupInterval: number; // minutes
  maxInteractionHistory: number;
  maxPatternHistory: number;
  autoCleanup: boolean;
  cleanupThreshold: number; // days
}

export class AgentMemoryManager {
  private projectPath: string;
  private memoryPath: string;
  private settings: MemorySettings;
  private memoryData: AgentMemoryData | null = null;
  private lastBackup: Date | null = null;

  constructor(projectPath: string, settings?: Partial<MemorySettings>) {
    this.projectPath = projectPath;
    this.memoryPath = path.join(projectPath, '.saiso', 'memory');
    this.settings = this.mergeSettings(settings);
  }

  /**
   * Initialize agent memory system
   */
  async initialize(agentName: string): Promise<void> {
    await fs.mkdir(this.memoryPath, { recursive: true });

    // Load existing memory or create new
    try {
      await this.loadMemory();
    } catch {
      // Create new memory structure
      this.memoryData = this.createNewMemoryStructure(agentName);
      await this.saveMemory();
    }

    // Start backup interval if enabled
    if (this.settings.backupInterval > 0) {
      this.startBackupInterval();
    }
  }

  /**
   * Preserve agent personality and learning data
   */
  async preserveAgentMemory(personality: AgentPersonality, learning: AgentLearning): Promise<void> {
    if (!this.memoryData) {
      throw new Error('Memory system not initialized');
    }

    this.memoryData.personality = personality;
    this.memoryData.learning = learning;
    this.memoryData.metadata.lastBackup = new Date();

    await this.saveMemory();
  }

  /**
   * Restore agent memory
   */
  async restoreAgentMemory(): Promise<{ personality: AgentPersonality; learning: AgentLearning }> {
    if (!this.memoryData) {
      await this.loadMemory();
    }

    if (!this.memoryData) {
      throw new Error('No memory data available to restore');
    }

    return {
      personality: this.memoryData.personality,
      learning: this.memoryData.learning,
    };
  }

  /**
   * Store chain-specific data separately from agent personality
   */
  async separateChainData(serverName: string, chainData: Partial<ChainSpecificData>): Promise<void> {
    if (!this.memoryData) {
      throw new Error('Memory system not initialized');
    }

    // Initialize chain data if it doesn't exist
    if (!this.memoryData.chainData[serverName]) {
      this.memoryData.chainData[serverName] = {
        serverName,
        transactions: [],
        contracts: [],
        balances: [],
        networkState: {},
        lastSync: new Date(),
      };
    }

    // Merge new chain data
    const existing = this.memoryData.chainData[serverName];
    this.memoryData.chainData[serverName] = {
      ...existing,
      ...chainData,
      lastSync: new Date(),
    };

    await this.saveMemory();
  }

  /**
   * Add interaction to learning memory
   */
  async addInteraction(interaction: Omit<InteractionMemory, 'id'>): Promise<void> {
    if (!this.memoryData) {
      throw new Error('Memory system not initialized');
    }

    const interactionWithId: InteractionMemory = {
      ...interaction,
      id: this.generateId(),
    };

    this.memoryData.learning.interactions.push(interactionWithId);
    this.memoryData.learning.lastUpdated = new Date();
    this.memoryData.metadata.totalInteractions += 1;

    // Cleanup old interactions if needed
    if (this.memoryData.learning.interactions.length > this.settings.maxInteractionHistory) {
      this.memoryData.learning.interactions = this.memoryData.learning.interactions
        .slice(-this.settings.maxInteractionHistory);
    }

    await this.saveMemory();
  }

  /**
   * Add learned pattern
   */
  async addLearnedPattern(pattern: Omit<LearnedPattern, 'id'>): Promise<void> {
    if (!this.memoryData) {
      throw new Error('Memory system not initialized');
    }

    // Check if pattern already exists
    const existingIndex = this.memoryData.learning.patterns.findIndex(p => p.pattern === pattern.pattern);

    if (existingIndex >= 0) {
      // Update existing pattern
      const existing = this.memoryData.learning.patterns[existingIndex];
      this.memoryData.learning.patterns[existingIndex] = {
        ...existing,
        frequency: existing.frequency + 1,
        confidence: Math.min(existing.confidence + 0.1, 1.0),
        lastSeen: new Date(),
      };
    } else {
      // Add new pattern
      const patternWithId: LearnedPattern = {
        ...pattern,
        id: this.generateId(),
      };
      this.memoryData.learning.patterns.push(patternWithId);
    }

    this.memoryData.learning.lastUpdated = new Date();

    // Cleanup old patterns if needed
    if (this.memoryData.learning.patterns.length > this.settings.maxPatternHistory) {
      this.memoryData.learning.patterns = this.memoryData.learning.patterns
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.settings.maxPatternHistory);
    }

    await this.saveMemory();
  }

  /**
   * Add transaction to chain-specific memory
   */
  async addTransaction(serverName: string, transaction: TransactionMemory): Promise<void> {
    if (!this.memoryData) {
      throw new Error('Memory system not initialized');
    }

    if (!this.memoryData.chainData[serverName]) {
      await this.separateChainData(serverName, {});
    }

    this.memoryData.chainData[serverName].transactions.push(transaction);
    this.memoryData.chainData[serverName].lastSync = new Date();

    await this.saveMemory();
  }

  /**
   * Add contract interaction to chain-specific memory
   */
  async addContractInteraction(
    serverName: string,
    contractAddress: string,
    interaction: ContractInteraction
  ): Promise<void> {
    if (!this.memoryData) {
      throw new Error('Memory system not initialized');
    }

    if (!this.memoryData.chainData[serverName]) {
      await this.separateChainData(serverName, {});
    }

    const chainData = this.memoryData.chainData[serverName];
    let contract = chainData.contracts.find(c => c.address === contractAddress);

    if (!contract) {
      contract = {
        address: contractAddress,
        interactions: [],
        lastInteraction: new Date(),
      };
      chainData.contracts.push(contract);
    }

    contract.interactions.push(interaction);
    contract.lastInteraction = new Date();
    chainData.lastSync = new Date();

    await this.saveMemory();
  }

  /**
   * Update balance snapshot
   */
  async updateBalance(serverName: string, balance: BalanceSnapshot): Promise<void> {
    if (!this.memoryData) {
      throw new Error('Memory system not initialized');
    }

    if (!this.memoryData.chainData[serverName]) {
      await this.separateChainData(serverName, {});
    }

    const chainData = this.memoryData.chainData[serverName];

    // Remove old balance for same token
    chainData.balances = chainData.balances.filter(b => b.token !== balance.token);

    // Add new balance
    chainData.balances.push(balance);
    chainData.lastSync = new Date();

    await this.saveMemory();
  }

  /**
   * Get chain-specific data
   */
  getChainData(serverName: string): ChainSpecificData | null {
    if (!this.memoryData) {
      return null;
    }

    return this.memoryData.chainData[serverName] || null;
  }

  /**
   * Get recent interactions
   */
  getRecentInteractions(limit = 10): InteractionMemory[] {
    if (!this.memoryData) {
      return [];
    }

    return this.memoryData.learning.interactions
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get learned patterns by confidence
   */
  getLearnedPatterns(minConfidence = 0.5): LearnedPattern[] {
    if (!this.memoryData) {
      return [];
    }

    return this.memoryData.learning.patterns
      .filter(p => p.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Configure memory preservation settings
   */
  async configureMemorySettings(settings: Partial<MemorySettings>): Promise<void> {
    this.settings = this.mergeSettings(settings);

    // Save settings to disk
    const settingsPath = path.join(this.memoryPath, 'settings.json');
    await fs.writeFile(settingsPath, JSON.stringify(this.settings, null, 2));

    // Restart backup interval if changed
    if (settings.backupInterval !== undefined) {
      this.startBackupInterval();
    }
  }

  /**
   * Validate memory integrity
   */
  async validateMemory(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      if (!this.memoryData) {
        await this.loadMemory();
      }

      if (!this.memoryData) {
        errors.push('No memory data found');
        return { valid: false, errors, warnings };
      }

      // Validate personality structure
      if (!this.memoryData.personality.name) {
        errors.push('Agent personality missing name');
      }

      // Validate learning data
      if (!Array.isArray(this.memoryData.learning.interactions)) {
        errors.push('Invalid interactions array');
      }

      if (!Array.isArray(this.memoryData.learning.patterns)) {
        errors.push('Invalid patterns array');
      }

      // Check for data corruption
      const corruptedInteractions = this.memoryData.learning.interactions.filter(
        i => !i.id || !i.timestamp || !i.userInput
      );
      if (corruptedInteractions.length > 0) {
        warnings.push(`Found ${corruptedInteractions.length} corrupted interactions`);
      }

      // Check memory size
      const memorySize = JSON.stringify(this.memoryData).length;
      if (memorySize > 10 * 1024 * 1024) { // 10MB
        warnings.push('Memory data is large (>10MB), consider cleanup');
      }

    } catch (error) {
      errors.push(`Memory validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Cleanup old data
   */
  async cleanup(): Promise<void> {
    if (!this.memoryData || !this.settings.autoCleanup) {
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.settings.cleanupThreshold);

    // Cleanup old interactions
    this.memoryData.learning.interactions = this.memoryData.learning.interactions.filter(
      i => i.timestamp > cutoffDate
    );

    // Cleanup old patterns with low confidence
    this.memoryData.learning.patterns = this.memoryData.learning.patterns.filter(
      p => p.confidence > 0.3 || p.lastSeen > cutoffDate
    );

    // Cleanup old chain data
    for (const [serverName, chainData] of Object.entries(this.memoryData.chainData)) {
      chainData.transactions = chainData.transactions.filter(
        t => t.timestamp > cutoffDate
      );

      chainData.balances = chainData.balances.filter(
        b => b.timestamp > cutoffDate
      );
    }

    await this.saveMemory();
  }

  /**
   * Create backup of memory data
   */
  async createBackup(): Promise<string> {
    if (!this.memoryData) {
      throw new Error('No memory data to backup');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.memoryPath, 'backups', `memory-${timestamp}.json`);

    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, JSON.stringify(this.memoryData, null, 2));

    this.lastBackup = new Date();
    return backupPath;
  }

  /**
   * Load memory from disk
   */
  private async loadMemory(): Promise<void> {
    const memoryFile = path.join(this.memoryPath, 'agent-memory.json');
    const data = await fs.readFile(memoryFile, 'utf-8');
    this.memoryData = JSON.parse(data, (key, value) => {
      // Revive Date objects
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return new Date(value);
      }
      return value;
    });
  }

  /**
   * Save memory to disk
   */
  private async saveMemory(): Promise<void> {
    if (!this.memoryData) {
      return;
    }

    const memoryFile = path.join(this.memoryPath, 'agent-memory.json');
    await fs.mkdir(path.dirname(memoryFile), { recursive: true });
    await fs.writeFile(memoryFile, JSON.stringify(this.memoryData, null, 2));
  }

  /**
   * Create new memory structure
   */
  private createNewMemoryStructure(agentName: string): AgentMemoryData {
    return {
      personality: {
        name: agentName,
        description: '',
        traits: [],
        preferences: {},
        communicationStyle: 'helpful',
        expertise: [],
        goals: [],
      },
      learning: {
        interactions: [],
        patterns: [],
        userPreferences: {},
        contextualKnowledge: {},
        lastUpdated: new Date(),
      },
      chainData: {},
      metadata: {
        version: '1.0.0',
        createdAt: new Date(),
        lastBackup: new Date(),
        totalInteractions: 0,
      },
    };
  }

  /**
   * Merge settings with defaults
   */
  private mergeSettings(settings?: Partial<MemorySettings>): MemorySettings {
    return {
      preserveAcrossServers: true,
      backupInterval: 30, // 30 minutes
      maxInteractionHistory: 1000,
      maxPatternHistory: 500,
      autoCleanup: true,
      cleanupThreshold: 30, // 30 days
      ...settings,
    };
  }

  /**
   * Start backup interval
   */
  private startBackupInterval(): void {
    if (this.settings.backupInterval <= 0) {
      return;
    }

    setInterval(async () => {
      try {
        await this.createBackup();
      } catch (error) {
        console.error('Failed to create memory backup:', error);
      }
    }, this.settings.backupInterval * 60 * 1000); // Convert minutes to milliseconds
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
