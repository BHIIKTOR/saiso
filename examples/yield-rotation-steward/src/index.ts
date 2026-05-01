import {
  buildRebalancePlan,
  buildTargetAllocations,
  createDefaultYieldLimits,
  hasMeaningfulDrift,
  rebalanceSummary,
  type TargetAllocation,
  type VenueScore,
} from './yield-rotation.example';

function runDemo(): void {
  const limits = createDefaultYieldLimits();
  const scores: VenueScore[] = [
    { venue: 'aave-usdc', aprBps: 510, riskScore: 3.2, liquidityScore: 8.7, lockupDays: 0 },
    { venue: 'morpho-usdc', aprBps: 640, riskScore: 4.5, liquidityScore: 8.2, lockupDays: 0 },
    { venue: 'kamino-usdc', aprBps: 590, riskScore: 4.0, liquidityScore: 7.5, lockupDays: 0 },
    { venue: 'ethena-usde', aprBps: 880, riskScore: 7.8, liquidityScore: 6.2, lockupDays: 7 },
  ];

  const current: TargetAllocation[] = [
    { venue: 'aave-usdc', allocationPct: 60 },
    { venue: 'morpho-usdc', allocationPct: 40 },
  ];
  const target = buildTargetAllocations(scores, limits);
  const plan = buildRebalancePlan(current, target);

  console.log('=== yield-rotation-steward demo ===');
  console.log('target: ' + target.map((item) => item.venue + '=' + item.allocationPct + '%').join(', '));
  console.log('drift>=5%: ' + (hasMeaningfulDrift(current, target, 5) ? 'yes' : 'no'));
  console.log('plan: ' + rebalanceSummary(plan));
}

runDemo();
