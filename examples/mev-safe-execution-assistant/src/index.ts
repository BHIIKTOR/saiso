import {
  defaultExecutionPolicy,
  executeIntentOnce,
  type ExecutionIntent,
} from './mev-safe-execution.example';

function runDemo(): void {
  const policy = defaultExecutionPolicy();
  const intent: ExecutionIntent = {
    fromToken: 'USDC',
    toToken: 'WETH',
    amountUsd: 250,
    slippageBps: 45,
  };

  const successRecord = executeIntentOnce(intent, policy, {
    simulationPassed: true,
    broadcastAccepted: true,
    confirmed: true,
  });

  const failedRecord = executeIntentOnce(intent, policy, {
    simulationPassed: true,
    broadcastAccepted: true,
    confirmed: false,
  });

  console.log('=== mev-safe-execution-assistant demo ===');
  console.log('success status: ' + successRecord.status + ' attempts=' + successRecord.attempts);
  console.log(
    'failure status: ' +
      failedRecord.status +
      ' failureClass=' +
      (failedRecord.failureClass ?? 'n/a')
  );
}

runDemo();
