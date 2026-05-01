/**
 * Abstract MCP Server Orchestrator - Base class for all MCP server implementations
 */

import type {
  McpServerType,
  McpServerStatus,
  McpServerCapabilities,
  McpHealthCheck,
  NetworkInfo
} from '../types/mcp.js';
import type { SaisoConfig } from '../types/config.js';
import type { PaymentConfig } from '../types/config.js';
import type { PaymentChallenge, PaymentCredential, PaymentRequestContext, PaymentReceipt } from '../payments/types.js';
import { PaymentPolicyEngine } from '../payments/policy.js';
import { PaymentReceiptStore } from '../payments/receipts-store.js';
import { parseMcpPaymentChallenge, parseMcpPaymentReceipt } from '../payments/parsers/mcp-payment.js';
import { attachX402PaymentMeta } from '../payments/adapters/x402-mcp.js';

export interface PaidToolExecutionOptions {
  payment?: PaymentConfig;
  paymentContext: PaymentRequestContext;
  projectPath?: string;
  resolveCredential?: (challenge: PaymentChallenge) => Promise<PaymentCredential>;
}

export interface ToolCallOptions {
  payment?: PaymentConfig;
  paymentContext?: PaymentRequestContext;
  projectPath?: string;
  resolveCredential?: (challenge: PaymentChallenge) => Promise<PaymentCredential>;
  timeoutMs?: number;
}

export abstract class McpServerOrchestrator {
  protected status: McpServerStatus | null = null;

  /**
   * Get the server type (evm or svm)
   */
  abstract getServerType(): McpServerType;

  /**
   * Get supported networks for this server
   */
  abstract getSupportedNetworks(): NetworkInfo[];

  /**
   * Get server capabilities
   */
  abstract getCapabilities(): McpServerCapabilities;

  /**
   * Start the MCP server
   */
  abstract start(config: SaisoConfig, projectPath: string): Promise<McpServerStatus>;

  /**
   * Stop the MCP server
   */
  abstract stop(): Promise<void>;

  /**
   * Check if server is healthy
   */
  abstract isHealthy(): Promise<boolean>;

  /**
   * Perform detailed health check
   */
  abstract healthCheck(): Promise<McpHealthCheck>;

  /**
   * Get current server status
   */
  getStatus(): McpServerStatus | null {
    return this.status;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.status?.running ?? false;
  }

  /**
   * Wait for server to be ready
   */
  async waitForReady(timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isHealthy()) {
        return true;
      }
      await this.sleep(1000);
    }

    return false;
  }

  /**
   * Restart the server
   */
  async restart(config: SaisoConfig, projectPath: string): Promise<McpServerStatus> {
    await this.stop();
    await this.sleep(2000); // Wait before restarting
    return this.start(config, projectPath);
  }

  /**
   * Validate configuration for this server type
   */
  abstract validateConfig(config: SaisoConfig): { valid: boolean; errors: string[] };

  /**
   * Get recommended networks for this server type
   */
  abstract getRecommendedNetworks(): NetworkInfo[];

  /**
   * Invoke a concrete MCP tool through this orchestrator.
   * Subclasses with HTTP transport should override this.
   */
  async invokeTool(
    _toolName: string,
    _params: Record<string, unknown>,
    _options?: ToolCallOptions
  ): Promise<Record<string, unknown>> {
    throw new Error(`Tool invocation is not implemented for '${this.getServerType()}' orchestrator`);
  }

  /**
   * Check if a network is supported
   */
  isNetworkSupported(networkName: string): boolean {
    return this.getSupportedNetworks().some(network =>
      network.name.toLowerCase() === networkName.toLowerCase()
    );
  }

  /**
   * Get network info by name
   */
  getNetworkInfo(networkName: string): NetworkInfo | undefined {
    return this.getSupportedNetworks().find(network =>
      network.name.toLowerCase() === networkName.toLowerCase()
    );
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate server URL based on configuration
   */
  protected generateServerUrl(host: string = 'localhost', port: number = 3001): string {
    return `http://${host}:${port}`;
  }

  /**
   * Update server status
   */
  protected updateStatus(updates: Partial<McpServerStatus>): void {
    if (this.status) {
      this.status = { ...this.status, ...updates };
    }
  }

  protected async executeJsonRpcToolCall(
    serverUrl: string,
    toolName: string,
    params: Record<string, unknown>,
    timeoutMs: number = 15000
  ): Promise<Record<string, unknown>> {
    const payload = {
      jsonrpc: '2.0',
      id: `saiso-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params,
      },
    };

    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`MCP tool call failed with HTTP ${response.status}${body ? `: ${body}` : ''}`);
    }

    const json = await response.json() as Record<string, unknown>;
    return this.normalizeToolCallResponse(json);
  }

  protected extractToolErrorMessage(result: Record<string, unknown>): string {
    const structured = result.structuredContent as Record<string, unknown> | undefined;
    if (structured && typeof structured.message === 'string') {
      return structured.message;
    }

    const content = result.content as Array<{ text?: string }> | undefined;
    const contentMessage = content?.find(item => typeof item?.text === 'string')?.text;
    if (contentMessage) {
      return contentMessage;
    }

    return 'MCP tool call returned an error';
  }

  /**
   * Execute an MCP tool call with optional payment policy + challenge handling.
   * This is transport-agnostic and can be reused by concrete orchestrators.
   */
  protected async executeToolWithPayment<TParams extends Record<string, unknown>, TResult extends Record<string, unknown>>(
    execute: (params: TParams) => Promise<TResult>,
    params: TParams,
    options: PaidToolExecutionOptions
  ): Promise<TResult> {
    if (!options.payment?.enabled) {
      return execute(params);
    }

    const policyEngine = new PaymentPolicyEngine(options.payment);
    const dailySpentUsd = await this.resolveDailySpentUsd(options);
    const policyDecision = policyEngine.evaluate(options.paymentContext, {
      dailySpentUsd,
    });
    if (!policyDecision.allowed) {
      await this.persistPaymentFailure(
        options.projectPath,
        options.payment.preferredProtocol === 'mpp' ? 'mpp' : 'x402',
        'policy-denied',
        policyDecision.reason || 'request denied',
        options.paymentContext.amountUsd,
        options.paymentContext
      );
      throw new Error(`Payment policy blocked request: ${policyDecision.reason || 'request denied'}`);
    }

    const first = await execute(params);
    const firstReceipt = parseMcpPaymentReceipt(first as unknown as Parameters<typeof parseMcpPaymentReceipt>[0]);
    await this.persistPaymentReceipt(
      options.projectPath,
      firstReceipt,
      options.paymentContext.amountUsd,
      options.paymentContext
    );

    const challenge = parseMcpPaymentChallenge(first as unknown as Parameters<typeof parseMcpPaymentChallenge>[0]);
    if (!challenge) {
      return first;
    }

    const challengePaymentContext = this.enrichPaymentContextFromChallenge(options.paymentContext, challenge);

    if (!options.resolveCredential) {
      await this.persistPaymentFailure(
        options.projectPath,
        challenge.protocol,
        'credential-error',
        'credential resolver not provided',
        challengePaymentContext.amountUsd,
        challengePaymentContext
      );
      throw new Error(`Payment challenge received (${challenge.protocol}) but no credential resolver was provided.`);
    }

    const missingChallengePolicyInput = this.findMissingChallengePolicyInput(options.payment, challengePaymentContext, challenge.protocol);
    if (missingChallengePolicyInput) {
      await this.persistPaymentFailure(
        options.projectPath,
        challenge.protocol,
        'policy-denied',
        missingChallengePolicyInput,
        challengePaymentContext.amountUsd,
        challengePaymentContext
      );
      throw new Error(`Payment policy blocked challenge settlement: ${missingChallengePolicyInput}`);
    }

    const challengePolicyDecision = policyEngine.evaluate(challengePaymentContext, {
      protocol: challenge.protocol,
      trustScore: typeof challengePaymentContext.metadata?.selectedServerTrustScore === 'number'
        ? challengePaymentContext.metadata.selectedServerTrustScore
        : undefined,
      dailySpentUsd,
    });
    if (!challengePolicyDecision.allowed) {
      await this.persistPaymentFailure(
        options.projectPath,
        challenge.protocol,
        'policy-denied',
        challengePolicyDecision.reason || 'request denied',
        challengePaymentContext.amountUsd,
        challengePaymentContext
      );
      throw new Error(`Payment policy blocked challenge settlement: ${challengePolicyDecision.reason || 'request denied'}`);
    }

    let credential: PaymentCredential;
    try {
      credential = await options.resolveCredential(challenge);
    } catch (error) {
      await this.persistPaymentFailure(
        options.projectPath,
        challenge.protocol,
        'credential-error',
        error instanceof Error ? error.message : String(error),
        challengePaymentContext.amountUsd,
        challengePaymentContext
      );
      throw error;
    }

    const retryParams = this.attachPaymentCredential(params, credential, challenge.protocol);
    let settled: TResult;
    try {
      settled = await execute(retryParams as TParams);
    } catch (error) {
      await this.persistPaymentFailure(
        options.projectPath,
        challenge.protocol,
        'upstream-error',
        error instanceof Error ? error.message : String(error),
        challengePaymentContext.amountUsd,
        challengePaymentContext
      );
      throw error;
    }
    const settledReceipt = parseMcpPaymentReceipt(settled as unknown as Parameters<typeof parseMcpPaymentReceipt>[0]);
    await this.persistPaymentReceipt(
      options.projectPath,
      settledReceipt,
      challengePaymentContext.amountUsd,
      challengePaymentContext
    );
    return settled;
  }

  private enrichPaymentContextFromChallenge(
    context: PaymentRequestContext,
    challenge: PaymentChallenge
  ): PaymentRequestContext {
    const firstRequirement = challenge.requirements[0];
    const challengeAmount = firstRequirement ? this.parseChallengeAmountUsd(firstRequirement.amount) : undefined;
    const toolName = typeof context.metadata?.toolName === 'string'
      ? context.metadata.toolName
      : this.deriveMethodFromResource(context.resource);

    return {
      ...context,
      amountUsd: typeof context.amountUsd === 'number' ? context.amountUsd : challengeAmount,
      recipient: context.recipient || firstRequirement?.payTo,
      metadata: {
        ...(context.metadata || {}),
        ...(toolName ? { toolName } : {}),
        paymentChallengeProtocol: challenge.protocol,
      },
    };
  }

  private parseChallengeAmountUsd(amount: string | undefined): number | undefined {
    if (!amount) {
      return undefined;
    }

    const parsed = Number.parseFloat(amount);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private findMissingChallengePolicyInput(
    payment: PaymentConfig,
    context: PaymentRequestContext,
    protocol: 'x402' | 'mpp'
  ): string | null {
    const toolName = typeof context.metadata?.toolName === 'string' ? context.metadata.toolName : undefined;
    const hasAmountPolicy =
      typeof payment.maxPerRequestUsd === 'number'
      || typeof payment.dailyBudgetUsd === 'number'
      || (toolName && typeof payment.toolMaxPerRequestUsd?.[toolName] === 'number');

    if (hasAmountPolicy && typeof context.amountUsd !== 'number') {
      return 'Payment challenge amount is required for configured spend policy';
    }

    const hasRecipientAllowlist =
      (Array.isArray(payment.allowedRecipients) && payment.allowedRecipients.length > 0)
      || (Array.isArray(payment.protocolAllowedRecipients?.[protocol]) && payment.protocolAllowedRecipients[protocol]!.length > 0);

    if (hasRecipientAllowlist && !context.recipient) {
      return 'Payment challenge recipient is required for configured recipient allowlist';
    }

    return null;
  }

  private attachPaymentCredential<T extends Record<string, unknown>>(
    params: T,
    credential: PaymentCredential,
    protocol: 'x402' | 'mpp'
  ): T {
    if (protocol === 'x402') {
      return attachX402PaymentMeta(params, credential);
    }

    const existingMeta = (params._meta as Record<string, unknown> | undefined) || {};
    return {
      ...params,
      _meta: {
        ...existingMeta,
        'org.paymentauth/credential': credential.payload,
      },
    };
  }

  private async persistPaymentReceipt(
    projectPath: string | undefined,
    receipt: PaymentReceipt | null,
    amountUsd?: number,
    context?: PaymentRequestContext
  ): Promise<void> {
    if (!projectPath || !receipt) {
      return;
    }
    const metadata = this.normalizeReceiptMetadata(context);
    const store = new PaymentReceiptStore(projectPath);
    await store.append({
      ...receipt,
      raw: {
        ...receipt.raw,
        ...(typeof amountUsd === 'number' ? { amountUsd } : {}),
        ...metadata,
      },
    });
  }

  private async persistPaymentFailure(
    projectPath: string | undefined,
    protocol: 'x402' | 'mpp',
    outcomeClass: string,
    reason: string,
    amountUsd?: number,
    context?: PaymentRequestContext
  ): Promise<void> {
    if (!projectPath) {
      return;
    }

    const metadata = this.normalizeReceiptMetadata(context);
    const store = new PaymentReceiptStore(projectPath);
    await store.append({
      protocol,
      success: false,
      outcomeClass,
      timestamp: new Date().toISOString(),
      raw: {
        reason,
        ...(typeof amountUsd === 'number' ? { amountUsd } : {}),
        ...metadata,
      },
    });
  }

  private normalizeReceiptMetadata(context?: PaymentRequestContext): Record<string, unknown> {
    if (!context) {
      return {};
    }

    const metadata = context.metadata && typeof context.metadata === 'object'
      ? context.metadata
      : {};

    const chainFamily = metadata.serverFamily ?? metadata.chainFamily;
    const method = typeof metadata.method === 'string'
      ? metadata.method
      : this.deriveMethodFromResource(context.resource);

    return {
      resource: context.resource,
      ...(typeof chainFamily === 'string' ? { chainFamily } : {}),
      ...(typeof method === 'string' ? { method } : {}),
      ...(typeof context.recipient === 'string' ? { recipient: context.recipient } : {}),
    };
  }

  private deriveMethodFromResource(resource: string): string | undefined {
    if (resource.startsWith('tool://')) {
      return resource.slice('tool://'.length);
    }
    return undefined;
  }

  private async resolveDailySpentUsd(options: PaidToolExecutionOptions): Promise<number | undefined> {
    if (
      typeof options.payment?.dailyBudgetUsd !== 'number'
      || typeof options.paymentContext.amountUsd !== 'number'
      || !options.projectPath
    ) {
      return undefined;
    }

    const store = new PaymentReceiptStore(options.projectPath);
    return store.getDailySpendUsd();
  }

  private normalizeToolCallResponse(payload: Record<string, unknown>): Record<string, unknown> {
    const result = payload.result;
    if (typeof result === 'object' && result !== null) {
      return result as Record<string, unknown>;
    }

    const error = payload.error;
    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      const message = typeof errorObj.message === 'string' ? errorObj.message : 'Tool call failed';
      const data = typeof errorObj.data === 'object' && errorObj.data !== null
        ? errorObj.data as Record<string, unknown>
        : {};

      return {
        isError: true,
        structuredContent: {
          ...data,
          message,
        },
        content: [{ type: 'text', text: message }],
        _meta: (data._meta as Record<string, unknown> | undefined) || {},
      };
    }

    return payload;
  }
}
