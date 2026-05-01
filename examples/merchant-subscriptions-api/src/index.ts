import {
  createDefaultPlans,
  createSubscription,
  runBillingPass,
  type Subscription,
} from './subscriptions-api.example';

function runDemo(): void {
  const nowIso = new Date().toISOString();
  const plans = createDefaultPlans();
  const starter = plans[0];
  const pro = plans[1];

  if (!starter || !pro) {
    throw new Error('default plans are missing required tiers');
  }

  const subscriptions: Subscription[] = [
    createSubscription('cust_001', starter, new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()),
    createSubscription('cust_002', pro, new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()),
  ];

  const billing = runBillingPass(
    subscriptions,
    plans,
    {
      [subscriptions[0].id]: true,
      [subscriptions[1].id]: false,
    },
    3,
    nowIso
  );

  console.log('=== merchant-subscriptions-api demo ===');
  console.log('charged=' + billing.chargedCount + ' failed=' + billing.failedCount);
  console.log(
    billing.updated
      .map((subscription) => {
        return subscription.id + ' status=' + subscription.status + ' next=' + subscription.nextBillingAtIso;
      })
      .join('\n')
  );
}

runDemo();
