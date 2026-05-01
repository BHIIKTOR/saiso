/**
 * Agent Configuration Types
 */

export interface AgentCharacter {
  /** Agent name */
  name: string;
  /** Agent biography */
  bio: string[];
  /** Agent lore/background */
  lore: string[];
  /** Message examples */
  messageExamples: Array<Array<{
    user: string;
    content: { text: string };
  }>>;
  /** Post examples */
  postExamples: string[];
  /** Topics the agent can discuss */
  topics: string[];
  /** Agent style configuration */
  style: {
    all: string[];
    chat: string[];
    post: string[];
  };
  /** Agent adjectives */
  adjectives: string[];
}

export interface AgentCapabilities {
  /** Can send tokens */
  sendTokens?: boolean;
  /** Can query balances */
  queryBalance?: boolean;
  /** Can interact with contracts */
  interactContract?: boolean;
  /** Can estimate gas */
  estimateGas?: boolean;
  /** Can check network status */
  checkNetwork?: boolean;
  /** Custom capabilities */
  custom?: Record<string, boolean>;
}

export interface AgentSettings {
  /** Agent character configuration */
  character: AgentCharacter;
  /** Agent capabilities */
  capabilities: AgentCapabilities;
  /** Network preferences */
  networks: string[];
  /** Default network */
  defaultNetwork: string;
  /** Security settings */
  security: {
    /** Require confirmation for transactions */
    requireConfirmation: boolean;
    /** Maximum transaction value */
    maxTransactionValue?: string;
    /** Allowed addresses (whitelist) */
    allowedAddresses?: string[];
    /** Blocked addresses (blacklist) */
    blockedAddresses?: string[];
  };
  /** Behavior settings */
  behavior: {
    /** Auto-respond to messages */
    autoRespond: boolean;
    /** Response delay (ms) */
    responseDelay: number;
    /** Maximum retries for failed operations */
    maxRetries: number;
    /** Timeout for operations (ms) */
    operationTimeout: number;
  };
}

export interface ScaffoldOptions {
  /** Project name */
  projectName: string;
  /** Target environment */
  environment: string;
  /** Project path */
  projectPath: string;
  /** Agent name */
  agentName?: string;
  /** Project description */
  description?: string;
  /** Additional options */
  options?: Record<string, string | boolean>;
}
