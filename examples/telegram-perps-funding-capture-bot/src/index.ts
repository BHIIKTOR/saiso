import {
  createDefaultPerpsLimits,
  createDefaultPerpsState,
  evaluateFundingOpportunity,
  openFundingPosition,
  closeFundingPosition,
  perpsStatusMessage,
  type FundingOpportunity,
} from './telegram-perps.example';

function runDemo(): void {
  const limits = createDefaultPerpsLimits();
  let state = createDefaultPerpsState(limits);

  const opportunity: FundingOpportunity = {
    market: 'ETH-PERP',
    expectedFundingEdgeBps: 14,
    notionalUsd: 450,
    leverage: 2,
  };

  const decision = evaluateFundingOpportunity(state, limits, opportunity);
  const openResult = openFundingPosition(state, limits, opportunity);
  state = openResult.state;
  state = closeFundingPosition(state, 6.25);

  console.log('=== telegram-perps-funding-capture-bot demo ===');
  console.log('decision: ' + (decision.allowed ? 'allowed' : 'denied: ' + decision.reasons.join(', ')));
  console.log(openResult.message);
  console.log('');
  console.log(perpsStatusMessage(state));
}

runDemo();
