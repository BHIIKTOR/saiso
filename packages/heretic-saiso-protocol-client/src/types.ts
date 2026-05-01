export interface HereticIntegrationConfig {
  daemon: {
    daemonPath: string | null;
    configDir: string | null;
    socketPath: string | null;
  };
  transport: {
    selected: string;
    transportIdentity: string | null;
    terminalTtlMs: number;
    unresolvedTtlMs: number;
    tombstoneTtlMs: number;
  };
  policy: {
    strict: boolean;
  };
}

export interface HereticDaemonResolvedPaths {
  daemonPath: string | null;
  configDir: string;
  socketPath: string;
}

export interface HereticSessionBinding {
  hereticProjectRoot: string;
  sessionId: string;
  projectId: string;
}

export interface ChatRelayRequest {
  sessionId: string;
  content: string;
  approvalPolicy?: 'interactive' | 'auto_deny' | 'never';
  timeoutMs?: number;
}

export interface ChatRelayResult {
  turnId: string;
  answer: string;
}
