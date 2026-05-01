import {
  createDefaultSettlementPolicy,
  prepareSettlement,
  type SettlementRequest,
} from './settlement-router.example';

function runDemo(): void {
  const policy = createDefaultSettlementPolicy();
  const request: SettlementRequest = {
    recipient: 'openai.mpp.tempo.xyz',
    amountUsd: 0.35,
    trustScore: 0.88,
    operationClass: 'read',
  };

  const prepared = prepareSettlement(request, policy, {
    signature: '0xdeadbeef',
    network: 'base',
  });

  console.log('=== merchant-settlement-router demo ===');
  console.log(prepared.summary);
  console.log('headers: ' + JSON.stringify(prepared.headers ?? {}, null, 2));
}

runDemo();
