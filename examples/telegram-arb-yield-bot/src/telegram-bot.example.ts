export interface PnlSnapshot {
  realizedUsd: number;
  unrealizedUsd: number;
  dailyPnlUsd: number;
  totalPnlUsd: number;
  updatedAtIso: string;
}

export interface StrategyLimits {
  maxNotionalUsdPerTrade: number;
  dailyMaxLossUsd: number;
  maxConcurrentRoutes: number;
  maxSlippageBps: number;
}

export interface RoutePosition {
  id: string;
  pair: string;
  entryNotionalUsd: number;
  expectedEdgeBps: number;
  openedAtIso: string;
}

export interface YieldAllocation {
  venue: string;
  allocationPct: number;
}

export interface RuntimeState {
  arbEnabled: boolean;
  yieldEnabled: boolean;
  openRoutes: RoutePosition[];
  snapshot: PnlSnapshot;
  limits: StrategyLimits;
  yieldAllocations: YieldAllocation[];
}

export interface RouteCandidate {
  pair: string;
  notionalUsd: number;
  expectedEdgeBps: number;
  expectedSlippageBps: number;
}

export interface RouteDecision {
  allowed: boolean;
  reasons: string[];
}

export interface RouteExecutionPlan {
  decision: RouteDecision;
  updatedState: RuntimeState;
  message: string;
}

export interface CommandResult {
  state: RuntimeState;
  reply: string;
  action?: 'rebalance' | 'pause-arb' | 'resume-arb' | 'pause-yield' | 'resume-yield';
}

function formatUsd(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return sign + '$' + Math.abs(value).toFixed(2);
}

function cloneState(state: RuntimeState): RuntimeState {
  return {
    ...state,
    openRoutes: [...state.openRoutes],
    yieldAllocations: [...state.yieldAllocations],
    snapshot: { ...state.snapshot },
    limits: { ...state.limits },
  };
}

export function buildStatusMessage(state: RuntimeState): string {
  return [
    '*Telegram Arb Yield Bot Status*',
    '',
    'arb: ' + (state.arbEnabled ? 'on' : 'off'),
    'yield: ' + (state.yieldEnabled ? 'on' : 'off'),
    'open routes: ' + state.openRoutes.length + '/' + state.limits.maxConcurrentRoutes,
    'daily pnl: ' + formatUsd(state.snapshot.dailyPnlUsd),
    'total pnl: ' + formatUsd(state.snapshot.totalPnlUsd),
    'updated: ' + state.snapshot.updatedAtIso,
  ].join('\n');
}

export function buildPnlMessage(snapshot: PnlSnapshot): string {
  return [
    '*PnL Snapshot*',
    '',
    'realized: ' + formatUsd(snapshot.realizedUsd),
    'unrealized: ' + formatUsd(snapshot.unrealizedUsd),
    'daily: ' + formatUsd(snapshot.dailyPnlUsd),
    'total: ' + formatUsd(snapshot.totalPnlUsd),
    'updated: ' + snapshot.updatedAtIso,
  ].join('\n');
}

export function buildLimitsMessage(limits: StrategyLimits): string {
  return [
    '*Risk Limits*',
    '',
    'max notional/trade: $' + limits.maxNotionalUsdPerTrade,
    'daily max loss: $' + limits.dailyMaxLossUsd,
    'max concurrent routes: ' + limits.maxConcurrentRoutes,
    'max slippage: ' + limits.maxSlippageBps + ' bps',
  ].join('\n');
}

export function buildRoutesMessage(routes: RoutePosition[]): string {
  if (routes.length === 0) {
    return '*Open Routes*\n\nnone';
  }

  return [
    '*Open Routes*',
    '',
    ...routes.map((route, index) => {
      return [
        String(index + 1) + '. ' + route.pair,
        '  id: ' + route.id,
        '  notional: $' + route.entryNotionalUsd.toFixed(2),
        '  edge: ' + route.expectedEdgeBps.toFixed(2) + ' bps',
        '  opened: ' + route.openedAtIso,
      ].join('\n');
    }),
  ].join('\n');
}

export function exceedsDailyLoss(snapshot: PnlSnapshot, limits: StrategyLimits): boolean {
  return snapshot.dailyPnlUsd <= -Math.abs(limits.dailyMaxLossUsd);
}

export function evaluateRouteCandidate(state: RuntimeState, candidate: RouteCandidate): RouteDecision {
  const reasons: string[] = [];

  if (!state.arbEnabled) {
    reasons.push('arb is paused');
  }
  if (candidate.notionalUsd > state.limits.maxNotionalUsdPerTrade) {
    reasons.push('notional exceeds max per-trade limit');
  }
  if (candidate.expectedSlippageBps > state.limits.maxSlippageBps) {
    reasons.push('expected slippage exceeds max slippage limit');
  }
  if (state.openRoutes.length >= state.limits.maxConcurrentRoutes) {
    reasons.push('max concurrent routes reached');
  }
  if (exceedsDailyLoss(state.snapshot, state.limits)) {
    reasons.push('daily loss limit exceeded');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export function addRoutePosition(state: RuntimeState, candidate: RouteCandidate, nowIso: string): RuntimeState {
  const next = cloneState(state);
  next.openRoutes.push({
    id: 'route-' + Date.now().toString(36),
    pair: candidate.pair,
    entryNotionalUsd: candidate.notionalUsd,
    expectedEdgeBps: candidate.expectedEdgeBps,
    openedAtIso: nowIso,
  });
  return next;
}

export function closeRoutePosition(state: RuntimeState, routeId: string): RuntimeState {
  const next = cloneState(state);
  next.openRoutes = next.openRoutes.filter((route) => route.id !== routeId);
  return next;
}

export function updatePnlSnapshot(state: RuntimeState, snapshot: PnlSnapshot): RuntimeState {
  const next = cloneState(state);
  next.snapshot = { ...snapshot };
  return next;
}

export function setYieldAllocation(state: RuntimeState, allocations: YieldAllocation[]): RuntimeState {
  const next = cloneState(state);
  const total = allocations.reduce((sum, item) => sum + item.allocationPct, 0);

  if (total > 100.01) {
    throw new Error('Yield allocation exceeds 100%');
  }

  next.yieldAllocations = [...allocations];
  return next;
}

export function prepareRouteExecution(
  state: RuntimeState,
  candidate: RouteCandidate,
  nowIso: string = new Date().toISOString()
): RouteExecutionPlan {
  const decision = evaluateRouteCandidate(state, candidate);
  if (!decision.allowed) {
    return {
      decision,
      updatedState: cloneState(state),
      message: 'route denied: ' + decision.reasons.join(', '),
    };
  }

  const updatedState = addRoutePosition(state, candidate, nowIso);
  return {
    decision,
    updatedState,
    message: 'route approved for ' + candidate.pair + ' at $' + candidate.notionalUsd.toFixed(2),
  };
}

export function applyRiskCircuitBreakers(state: RuntimeState): RuntimeState {
  const next = cloneState(state);

  if (exceedsDailyLoss(next.snapshot, next.limits)) {
    next.arbEnabled = false;
  }

  if (next.openRoutes.length === 0 && !next.arbEnabled && next.snapshot.dailyPnlUsd > -Math.abs(next.limits.dailyMaxLossUsd) * 0.5) {
    next.arbEnabled = true;
  }

  return next;
}

export function scenarioSummary(state: RuntimeState): string {
  const yieldText =
    state.yieldAllocations.length === 0
      ? 'none'
      : state.yieldAllocations.map((item) => item.venue + ':' + item.allocationPct.toFixed(2) + '%').join(', ');
  return [
    'arb=' + (state.arbEnabled ? 'on' : 'off'),
    'yield=' + (state.yieldEnabled ? 'on' : 'off'),
    'routes=' + state.openRoutes.length,
    'daily=' + formatUsd(state.snapshot.dailyPnlUsd),
    'alloc=' + yieldText,
  ].join(' | ');
}

export function handleTelegramCommand(state: RuntimeState, command: string): CommandResult {
  const normalized = command.trim().toLowerCase();
  const next = cloneState(state);

  if (normalized === '/status') {
    return { state: next, reply: buildStatusMessage(next) };
  }
  if (normalized === '/pnl') {
    return { state: next, reply: buildPnlMessage(next.snapshot) };
  }
  if (normalized === '/limits') {
    return { state: next, reply: buildLimitsMessage(next.limits) };
  }
  if (normalized === '/routes') {
    return { state: next, reply: buildRoutesMessage(next.openRoutes) };
  }
  if (normalized === '/arb on') {
    next.arbEnabled = true;
    return { state: next, reply: 'arb resumed', action: 'resume-arb' };
  }
  if (normalized === '/arb off') {
    next.arbEnabled = false;
    return { state: next, reply: 'arb paused', action: 'pause-arb' };
  }
  if (normalized === '/yield on') {
    next.yieldEnabled = true;
    return { state: next, reply: 'yield resumed', action: 'resume-yield' };
  }
  if (normalized === '/yield off') {
    next.yieldEnabled = false;
    return { state: next, reply: 'yield paused', action: 'pause-yield' };
  }
  if (normalized === '/rebalance') {
    return { state: next, reply: 'rebalance requested', action: 'rebalance' };
  }

  return {
    state: next,
    reply: 'unknown command. supported: /status, /pnl, /limits, /routes, /arb on|off, /yield on|off, /rebalance',
  };
}

export function createDefaultRuntimeState(nowIso: string = new Date().toISOString()): RuntimeState {
  return {
    arbEnabled: true,
    yieldEnabled: true,
    openRoutes: [],
    snapshot: {
      realizedUsd: 0,
      unrealizedUsd: 0,
      dailyPnlUsd: 0,
      totalPnlUsd: 0,
      updatedAtIso: nowIso,
    },
    limits: {
      maxNotionalUsdPerTrade: 250,
      dailyMaxLossUsd: 100,
      maxConcurrentRoutes: 3,
      maxSlippageBps: 35,
    },
    yieldAllocations: [],
  };
}
