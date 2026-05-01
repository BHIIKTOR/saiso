import {
  applyRiskCircuitBreakers,
  buildRoutesMessage,
  buildStatusMessage,
  createDefaultRuntimeState,
  prepareRouteExecution,
  setYieldAllocation,
  updatePnlSnapshot,
  type RouteCandidate,
} from './telegram-bot.example';

function runDemo(): void {
  const nowIso = new Date().toISOString();
  let state = createDefaultRuntimeState(nowIso);

  state = setYieldAllocation(state, [
    { venue: 'aave-usdc', allocationPct: 55 },
    { venue: 'morpho-usdc', allocationPct: 45 },
  ]);

  const candidate: RouteCandidate = {
    pair: 'WETH/USDC',
    notionalUsd: 220,
    expectedEdgeBps: 18,
    expectedSlippageBps: 22,
  };
  const routePlan = prepareRouteExecution(state, candidate, nowIso);
  state = routePlan.updatedState;

  state = updatePnlSnapshot(state, {
    realizedUsd: 11.5,
    unrealizedUsd: 3.2,
    dailyPnlUsd: 14.7,
    totalPnlUsd: 14.7,
    updatedAtIso: nowIso,
  });

  state = applyRiskCircuitBreakers(state);

  console.log('=== telegram-arb-yield-bot demo ===');
  console.log(routePlan.message);
  console.log('');
  console.log(buildStatusMessage(state));
  console.log('');
  console.log(buildRoutesMessage(state.openRoutes));
}

runDemo();
