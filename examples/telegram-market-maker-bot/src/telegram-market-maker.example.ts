export interface MmSnapshot {
  inventoryUsd: number;
  dailyPnlUsd: number;
  spreadBps: number;
  active: boolean;
}

export interface MmLimits {
  maxInventoryUsd: number;
  maxNotionalUsdPerOrder: number;
  minSpreadBps: number;
  targetSpreadBps: number;
  maxDailyLossUsd: number;
}

export interface QuoteInput {
  midPrice: number;
  desiredNotionalUsd: number;
  spreadBps?: number;
}

export interface QuotePlan {
  bidPrice: number;
  askPrice: number;
  baseSize: number;
  spreadBps: number;
}

export interface CommandResult {
  snapshot: MmSnapshot;
  reply: string;
}

export interface FillEvent {
  side: 'buy' | 'sell';
  notionalUsd: number;
  pnlImpactUsd: number;
}

function formatUsd(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return sign + '$' + Math.abs(value).toFixed(2);
}

export function statusMessage(snapshot: MmSnapshot, limits?: MmLimits): string {
  const limitLine = limits ? 'inventory cap: $' + limits.maxInventoryUsd.toFixed(2) : 'inventory cap: n/a';
  return [
    '*Market Maker Status*',
    '',
    'active: ' + (snapshot.active ? 'on' : 'off'),
    'inventory usd: ' + snapshot.inventoryUsd.toFixed(2),
    limitLine,
    'daily pnl usd: ' + formatUsd(snapshot.dailyPnlUsd),
    'spread bps: ' + snapshot.spreadBps.toFixed(2),
  ].join('\n');
}

export function limitsMessage(limits: MmLimits): string {
  return [
    '*MM Limits*',
    '',
    'max inventory usd: $' + limits.maxInventoryUsd,
    'max order notional usd: $' + limits.maxNotionalUsdPerOrder,
    'min spread bps: ' + limits.minSpreadBps,
    'target spread bps: ' + limits.targetSpreadBps,
    'max daily loss usd: $' + limits.maxDailyLossUsd,
  ].join('\n');
}

export function shouldPause(snapshot: MmSnapshot, limits: MmLimits): boolean {
  return snapshot.inventoryUsd > limits.maxInventoryUsd || snapshot.dailyPnlUsd <= -Math.abs(limits.maxDailyLossUsd);
}

export function evaluateOrderNotional(desiredNotionalUsd: number, limits: MmLimits): { allowed: boolean; reason?: string } {
  if (desiredNotionalUsd > limits.maxNotionalUsdPerOrder) {
    return { allowed: false, reason: 'order exceeds max notional' };
  }
  return { allowed: true };
}

export function buildTwoSidedQuote(input: QuoteInput, limits: MmLimits): QuotePlan {
  if (input.midPrice <= 0) {
    throw new Error('midPrice must be positive');
  }

  const notionalCheck = evaluateOrderNotional(input.desiredNotionalUsd, limits);
  if (!notionalCheck.allowed) {
    throw new Error(notionalCheck.reason || 'invalid notional');
  }

  const spreadBps = Math.max(input.spreadBps ?? limits.targetSpreadBps, limits.minSpreadBps);
  const halfSpread = spreadBps / 10000 / 2;
  const bidPrice = input.midPrice * (1 - halfSpread);
  const askPrice = input.midPrice * (1 + halfSpread);
  const baseSize = input.desiredNotionalUsd / input.midPrice;

  return {
    bidPrice,
    askPrice,
    baseSize,
    spreadBps,
  };
}

export function applyFill(snapshot: MmSnapshot, event: FillEvent): MmSnapshot {
  const inventoryDelta = event.side === 'buy' ? event.notionalUsd : -event.notionalUsd;
  return {
    ...snapshot,
    inventoryUsd: Math.max(0, snapshot.inventoryUsd + inventoryDelta),
    dailyPnlUsd: snapshot.dailyPnlUsd + event.pnlImpactUsd,
  };
}

export function nextSnapshotAfterQuote(snapshot: MmSnapshot, quote: QuotePlan): MmSnapshot {
  return {
    ...snapshot,
    spreadBps: quote.spreadBps,
  };
}

export function buildPauseReasons(snapshot: MmSnapshot, limits: MmLimits): string[] {
  const reasons: string[] = [];
  if (snapshot.inventoryUsd > limits.maxInventoryUsd) {
    reasons.push('inventory above cap');
  }
  if (snapshot.dailyPnlUsd <= -Math.abs(limits.maxDailyLossUsd)) {
    reasons.push('daily loss limit exceeded');
  }
  return reasons;
}

export function handleTelegramCommand(snapshot: MmSnapshot, limits: MmLimits, command: string): CommandResult {
  const normalized = command.trim().toLowerCase();
  const next = { ...snapshot };

  if (normalized === '/status') {
    return { snapshot: next, reply: statusMessage(next, limits) };
  }
  if (normalized === '/limits') {
    return { snapshot: next, reply: limitsMessage(limits) };
  }
  if (normalized === '/mm on') {
    next.active = true;
    return { snapshot: next, reply: 'market making resumed' };
  }
  if (normalized === '/mm off') {
    next.active = false;
    return { snapshot: next, reply: 'market making paused' };
  }
  if (normalized === '/pnl') {
    return {
      snapshot: next,
      reply: '*PnL*\n\n' + 'daily pnl usd: ' + formatUsd(next.dailyPnlUsd),
    };
  }

  return {
    snapshot: next,
    reply: 'unknown command. supported: /status, /limits, /pnl, /mm on|off',
  };
}

export function createDefaultMmLimits(): MmLimits {
  return {
    maxInventoryUsd: 2000,
    maxNotionalUsdPerOrder: 500,
    minSpreadBps: 15,
    targetSpreadBps: 25,
    maxDailyLossUsd: 120,
  };
}

export function createDefaultMmSnapshot(): MmSnapshot {
  return {
    inventoryUsd: 0,
    dailyPnlUsd: 0,
    spreadBps: 25,
    active: true,
  };
}
