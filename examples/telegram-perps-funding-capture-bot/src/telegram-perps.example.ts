export interface PerpsState {
  enabled: boolean;
  openPositions: number;
  maxPositions: number;
  dailyPnlUsd: number;
  fundingEdgeBps: number;
  leverage: number;
}

export interface PerpsLimits {
  maxNotionalUsd: number;
  maxLeverage: number;
  minFundingEdgeBps: number;
  maxDailyLossUsd: number;
  maxPositions: number;
}

export interface FundingOpportunity {
  market: string;
  expectedFundingEdgeBps: number;
  notionalUsd: number;
  leverage: number;
}

export interface Decision {
  allowed: boolean;
  reasons: string[];
}

export interface FundingPositionUpdate {
  state: PerpsState;
  message: string;
}

export function perpsStatusMessage(state: PerpsState): string {
  return [
    '*Perps Funding Bot*',
    '',
    'enabled: ' + (state.enabled ? 'on' : 'off'),
    'positions: ' + state.openPositions + '/' + state.maxPositions,
    'daily pnl usd: ' + state.dailyPnlUsd.toFixed(2),
    'funding edge bps: ' + state.fundingEdgeBps.toFixed(2),
    'leverage: ' + state.leverage.toFixed(2) + 'x',
  ].join('\n');
}

export function limitsMessage(limits: PerpsLimits): string {
  return [
    '*Perps Limits*',
    '',
    'max notional usd: $' + limits.maxNotionalUsd,
    'max leverage: ' + limits.maxLeverage + 'x',
    'min funding edge bps: ' + limits.minFundingEdgeBps,
    'max daily loss usd: $' + limits.maxDailyLossUsd,
    'max positions: ' + limits.maxPositions,
  ].join('\n');
}

export function evaluateFundingOpportunity(state: PerpsState, limits: PerpsLimits, opportunity: FundingOpportunity): Decision {
  const reasons: string[] = [];

  if (!state.enabled) {
    reasons.push('perps is paused');
  }
  if (opportunity.notionalUsd > limits.maxNotionalUsd) {
    reasons.push('notional exceeds max notional');
  }
  if (opportunity.leverage > limits.maxLeverage) {
    reasons.push('leverage exceeds max leverage');
  }
  if (opportunity.expectedFundingEdgeBps < limits.minFundingEdgeBps) {
    reasons.push('funding edge below minimum threshold');
  }
  if (state.openPositions >= limits.maxPositions) {
    reasons.push('max positions reached');
  }
  if (state.dailyPnlUsd <= -Math.abs(limits.maxDailyLossUsd)) {
    reasons.push('daily loss limit exceeded');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export function openFundingPosition(
  state: PerpsState,
  limits: PerpsLimits,
  opportunity: FundingOpportunity
): FundingPositionUpdate {
  const decision = evaluateFundingOpportunity(state, limits, opportunity);
  if (!decision.allowed) {
    return {
      state: { ...state },
      message: 'entry denied: ' + decision.reasons.join(', '),
    };
  }

  return {
    state: {
      ...state,
      openPositions: state.openPositions + 1,
      leverage: opportunity.leverage,
      fundingEdgeBps: opportunity.expectedFundingEdgeBps,
    },
    message: 'entered funding position on ' + opportunity.market + ' ($' + opportunity.notionalUsd.toFixed(2) + ')',
  };
}

export function closeFundingPosition(state: PerpsState, realizedPnlUsd: number): PerpsState {
  return {
    ...state,
    openPositions: Math.max(0, state.openPositions - 1),
    dailyPnlUsd: state.dailyPnlUsd + realizedPnlUsd,
  };
}

export function handleTelegramCommand(state: PerpsState, limits: PerpsLimits, command: string): { state: PerpsState; reply: string } {
  const normalized = command.trim().toLowerCase();
  const next = { ...state };

  if (normalized === '/status') {
    return { state: next, reply: perpsStatusMessage(next) };
  }
  if (normalized === '/risk') {
    return { state: next, reply: limitsMessage(limits) };
  }
  if (normalized === '/perps on') {
    next.enabled = true;
    return { state: next, reply: 'perps strategy resumed' };
  }
  if (normalized === '/perps off') {
    next.enabled = false;
    return { state: next, reply: 'perps strategy paused' };
  }
  if (normalized === '/positions') {
    return { state: next, reply: 'open positions: ' + next.openPositions + '/' + next.maxPositions };
  }

  return { state: next, reply: 'unknown command. supported: /status, /risk, /positions, /perps on|off' };
}

export function createDefaultPerpsLimits(): PerpsLimits {
  return {
    maxNotionalUsd: 800,
    maxLeverage: 3,
    minFundingEdgeBps: 8,
    maxDailyLossUsd: 150,
    maxPositions: 2,
  };
}

export function createDefaultPerpsState(limits: PerpsLimits = createDefaultPerpsLimits()): PerpsState {
  return {
    enabled: true,
    openPositions: 0,
    maxPositions: limits.maxPositions,
    dailyPnlUsd: 0,
    fundingEdgeBps: 0,
    leverage: 1,
  };
}
