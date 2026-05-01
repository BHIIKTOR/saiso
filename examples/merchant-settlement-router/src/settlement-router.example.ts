export type PaymentProtocol = 'x402' | 'mpp';
export type OperationClass = 'read' | 'write' | 'high-risk';

export interface SettlementRequest {
  recipient: string;
  amountUsd: number;
  trustScore: number;
  operationClass: OperationClass;
}

export interface SettlementPolicy {
  x402Recipients: string[];
  mppRecipients: string[];
  blockedRecipients: string[];
  operationClassMinTrustScore: Record<OperationClass, number>;
  maxPerRequestUsd: number;
}

export interface ProtocolDecision {
  allowed: boolean;
  protocol?: PaymentProtocol;
  reason: string;
}

export interface PreparedSettlement {
  decision: ProtocolDecision;
  headers?: Record<string, string>;
  summary: string;
}

export function chooseProtocol(request: SettlementRequest, policy: SettlementPolicy): ProtocolDecision {
  if (policy.blockedRecipients.includes(request.recipient)) {
    return { allowed: false, reason: 'recipient is blocked' };
  }

  if (request.amountUsd > policy.maxPerRequestUsd) {
    return { allowed: false, reason: 'request exceeds max per-request budget' };
  }

  const minTrust = policy.operationClassMinTrustScore[request.operationClass] ?? 0;
  if (request.trustScore < minTrust) {
    return { allowed: false, reason: 'trust score below operation-class minimum' };
  }

  if (policy.x402Recipients.includes(request.recipient)) {
    return { allowed: true, protocol: 'x402', reason: 'recipient prefers x402' };
  }
  if (policy.mppRecipients.includes(request.recipient)) {
    return { allowed: true, protocol: 'mpp', reason: 'recipient prefers mpp' };
  }

  return {
    allowed: true,
    protocol: request.amountUsd > 0.5 ? 'x402' : 'mpp',
    reason: request.amountUsd > 0.5 ? 'fallback to x402 for larger charges' : 'fallback to mpp for smaller charges',
  };
}

export function buildCredentialHeaders(protocol: PaymentProtocol, payload: Record<string, unknown>): Record<string, string> {
  if (protocol === 'x402') {
    return {
      'x-payment': JSON.stringify(payload),
    };
  }

  return {
    Payment: JSON.stringify(payload),
  };
}

export function summarizeDecision(request: SettlementRequest, decision: ProtocolDecision): string {
  if (!decision.allowed) {
    return 'denied: ' + decision.reason;
  }

  return [
    'allowed: yes',
    'protocol: ' + decision.protocol,
    'recipient: ' + request.recipient,
    'amountUsd: ' + request.amountUsd.toFixed(2),
    'reason: ' + decision.reason,
  ].join(' | ');
}

export function createDefaultSettlementPolicy(): SettlementPolicy {
  return {
    x402Recipients: ['api.x402.example'],
    mppRecipients: ['openai.mpp.tempo.xyz'],
    blockedRecipients: [],
    operationClassMinTrustScore: {
      read: 0.2,
      write: 0.5,
      'high-risk': 0.8,
    },
    maxPerRequestUsd: 10,
  };
}

export function prepareSettlement(
  request: SettlementRequest,
  policy: SettlementPolicy,
  credentialPayload: Record<string, unknown>
): PreparedSettlement {
  const decision = chooseProtocol(request, policy);
  if (!decision.allowed || !decision.protocol) {
    return {
      decision,
      summary: summarizeDecision(request, decision),
    };
  }

  return {
    decision,
    headers: buildCredentialHeaders(decision.protocol, credentialPayload),
    summary: summarizeDecision(request, decision),
  };
}
