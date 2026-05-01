export interface VenueScore {
  venue: string;
  aprBps: number;
  riskScore: number;
  liquidityScore: number;
  lockupDays: number;
}

export interface YieldLimits {
  maxAllocationPct: number;
  maxVenueCount: number;
  minAprBps: number;
  maxSingleVenuePct: number;
}

export interface TargetAllocation {
  venue: string;
  allocationPct: number;
}

export interface RebalanceStep {
  type: 'withdraw' | 'deposit';
  venue: string;
  allocationDeltaPct: number;
}

export function compositeScore(venue: VenueScore): number {
  const aprComponent = venue.aprBps;
  const liquidityComponent = venue.liquidityScore * 10;
  const riskPenalty = venue.riskScore * 12;
  const lockupPenalty = venue.lockupDays;
  return aprComponent + liquidityComponent - riskPenalty - lockupPenalty;
}

export function rankVenues(scores: VenueScore[]): VenueScore[] {
  return [...scores].sort((a, b) => compositeScore(b) - compositeScore(a));
}

export function selectTopVenues(scores: VenueScore[], limits: YieldLimits): VenueScore[] {
  return rankVenues(scores)
    .filter((venue) => venue.aprBps >= limits.minAprBps)
    .slice(0, limits.maxVenueCount);
}

export function buildTargetAllocations(scores: VenueScore[], limits: YieldLimits): TargetAllocation[] {
  const selected = selectTopVenues(scores, limits);
  if (selected.length === 0) {
    return [];
  }

  const equalWeight = Math.min(limits.maxSingleVenuePct, limits.maxAllocationPct / selected.length);
  const draft = selected.map((venue) => ({
    venue: venue.venue,
    allocationPct: Number(equalWeight.toFixed(2)),
  }));

  return normalizeAllocations(draft);
}

export function buildRebalancePlan(current: TargetAllocation[], target: TargetAllocation[]): RebalanceStep[] {
  const currentMap = new Map(current.map((item) => [item.venue, item.allocationPct]));
  const targetMap = new Map(target.map((item) => [item.venue, item.allocationPct]));
  const venues = new Set([...currentMap.keys(), ...targetMap.keys()]);

  const steps: RebalanceStep[] = [];

  for (const venue of venues) {
    const currentPct = currentMap.get(venue) ?? 0;
    const targetPct = targetMap.get(venue) ?? 0;
    const delta = Number((targetPct - currentPct).toFixed(2));

    if (delta > 0) {
      steps.push({ type: 'deposit', venue, allocationDeltaPct: delta });
    } else if (delta < 0) {
      steps.push({ type: 'withdraw', venue, allocationDeltaPct: Math.abs(delta) });
    }
  }

  return steps;
}

export function hasMeaningfulDrift(current: TargetAllocation[], target: TargetAllocation[], thresholdPct: number): boolean {
  const plan = buildRebalancePlan(current, target);
  return plan.some((step) => step.allocationDeltaPct >= thresholdPct);
}

export function normalizeAllocations(allocations: TargetAllocation[]): TargetAllocation[] {
  if (allocations.length === 0) {
    return [];
  }

  const total = allocations.reduce((sum, item) => sum + item.allocationPct, 0);
  if (total <= 0) {
    return allocations.map((item) => ({ ...item, allocationPct: 0 }));
  }

  return allocations.map((item) => ({
    ...item,
    allocationPct: Number(((item.allocationPct / total) * 100).toFixed(2)),
  }));
}

export function rebalanceSummary(steps: RebalanceStep[]): string {
  if (steps.length === 0) {
    return 'no rebalance required';
  }
  return steps.map((step) => step.type + ' ' + step.allocationDeltaPct.toFixed(2) + '% @ ' + step.venue).join(' | ');
}

export function createDefaultYieldLimits(): YieldLimits {
  return {
    maxAllocationPct: 100,
    maxVenueCount: 3,
    minAprBps: 450,
    maxSingleVenuePct: 45,
  };
}
