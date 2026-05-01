import type { PaymentConfig } from '../types/config.js';
import type { PaymentProtocol } from './types.js';
import type { PaymentDecision, PaymentRequestContext } from './types.js';

export interface PaymentPolicyRuntimeContext {
  protocol?: PaymentProtocol;
  trustScore?: number;
  dailySpentUsd?: number;
}

export class PaymentPolicyEngine {
  constructor(private readonly config: PaymentConfig | undefined) {}

  evaluate(context: PaymentRequestContext, runtime: PaymentPolicyRuntimeContext = {}): PaymentDecision {
    if (!this.config?.enabled) {
      return { allowed: false, reason: 'Payments are disabled' };
    }

    const toolName = typeof context.metadata?.toolName === 'string'
      ? context.metadata.toolName
      : undefined;
    if (toolName && typeof context.amountUsd === 'number' && this.config.toolMaxPerRequestUsd?.[toolName] !== undefined) {
      const toolLimit = this.config.toolMaxPerRequestUsd[toolName];
      if (typeof toolLimit === 'number' && context.amountUsd > toolLimit) {
        return { allowed: false, reason: `Amount exceeds tool limit for ${toolName} (${toolLimit})` };
      }
    }

    if (typeof this.config.maxPerRequestUsd === 'number' && typeof context.amountUsd === 'number') {
      if (context.amountUsd > this.config.maxPerRequestUsd) {
        return { allowed: false, reason: `Amount exceeds per-request limit (${this.config.maxPerRequestUsd})` };
      }
    }

    if (typeof this.config.dailyBudgetUsd === 'number' && typeof context.amountUsd === 'number') {
      const spentToday = typeof runtime.dailySpentUsd === 'number' ? runtime.dailySpentUsd : 0;
      if (spentToday + context.amountUsd > this.config.dailyBudgetUsd) {
        return {
          allowed: false,
          reason: `Amount exceeds daily budget (${this.config.dailyBudgetUsd}); spent today ${spentToday.toFixed(2)}`,
        };
      }
    }

    if (context.recipient && this.config.blockedRecipients?.includes(context.recipient)) {
      return { allowed: false, reason: 'Recipient is blocked by payment policy' };
    }

    if (context.recipient && this.config.allowedRecipients && this.config.allowedRecipients.length > 0) {
      if (!this.config.allowedRecipients.includes(context.recipient)) {
        return { allowed: false, reason: 'Recipient is not in allowlist' };
      }
    }

    if (runtime.protocol) {
      const blocked = this.config.protocolBlockedRecipients?.[runtime.protocol];
      if (context.recipient && Array.isArray(blocked) && blocked.includes(context.recipient)) {
        return { allowed: false, reason: `Recipient is blocked for protocol ${runtime.protocol}` };
      }

      const allowed = this.config.protocolAllowedRecipients?.[runtime.protocol];
      if (Array.isArray(allowed) && allowed.length > 0) {
        if (!context.recipient) {
          return { allowed: false, reason: `Recipient is required for protocol ${runtime.protocol} allowlist` };
        }
        if (!allowed.includes(context.recipient)) {
          return { allowed: false, reason: `Recipient is not allowlisted for protocol ${runtime.protocol}` };
        }
      }
    }

    const operationClass = typeof context.metadata?.operationClass === 'string'
      ? context.metadata.operationClass
      : undefined;
    if (operationClass) {
      const minTrustForClass = this.config.operationClassMinTrustScore?.[operationClass];
      if (typeof minTrustForClass === 'number') {
        const runtimeTrust = typeof runtime.trustScore === 'number'
          ? runtime.trustScore
          : typeof context.metadata?.selectedServerTrustScore === 'number'
            ? context.metadata.selectedServerTrustScore
            : undefined;

        if (typeof runtimeTrust !== 'number') {
          return { allowed: false, reason: `Missing trust score for operation class '${operationClass}'` };
        }

        if (runtimeTrust < minTrustForClass) {
          return { allowed: false, reason: `Trust score ${runtimeTrust.toFixed(2)} is below required ${minTrustForClass.toFixed(2)} for ${operationClass}` };
        }
      }
    }

    return { allowed: true };
  }
}
