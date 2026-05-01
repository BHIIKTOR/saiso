export interface Plan {
  id: string;
  amountUsd: number;
  intervalDays: number;
  gracePeriodDays: number;
  entitlements: string[];
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  amountUsd: number;
  nextBillingAtIso: string;
  status: 'active' | 'grace' | 'past_due' | 'cancelled';
  failedAttempts: number;
  lastChargeAtIso?: string;
}

export interface ChargeResult {
  subscription: Subscription;
  charged: boolean;
  reason?: string;
}

export interface BillingRunResult {
  updated: Subscription[];
  chargedCount: number;
  failedCount: number;
}

function createId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return prefix + '-' + Date.now().toString(36) + '-' + randomPart;
}

export function nextBillingIso(fromIso: string, intervalDays: number): string {
  const next = new Date(Date.parse(fromIso) + intervalDays * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

export function createSubscription(
  customerId: string,
  plan: Plan,
  nowIso: string = new Date().toISOString()
): Subscription {
  return {
    id: createId('sub'),
    customerId,
    planId: plan.id,
    amountUsd: plan.amountUsd,
    nextBillingAtIso: nextBillingIso(nowIso, plan.intervalDays),
    status: 'active',
    failedAttempts: 0,
  };
}

export function dueForCharge(subscription: Subscription, nowIso: string): boolean {
  if (subscription.status === 'cancelled') {
    return false;
  }
  return Date.parse(subscription.nextBillingAtIso) <= Date.parse(nowIso);
}

export function markChargeFailure(
  subscription: Subscription,
  maxFailedAttempts: number
): Subscription {
  const failedAttempts = subscription.failedAttempts + 1;
  return {
    ...subscription,
    failedAttempts,
    status: failedAttempts >= maxFailedAttempts ? 'past_due' : 'grace',
  };
}

export function markChargeSuccess(
  subscription: Subscription,
  intervalDays: number,
  nowIso: string = new Date().toISOString()
): Subscription {
  return {
    ...subscription,
    failedAttempts: 0,
    status: 'active',
    lastChargeAtIso: nowIso,
    nextBillingAtIso: nextBillingIso(nowIso, intervalDays),
  };
}

export function cancelSubscription(subscription: Subscription): Subscription {
  return {
    ...subscription,
    status: 'cancelled',
  };
}

export function isEntitled(subscription: Subscription, entitlement: string, plans: Plan[]): boolean {
  if (subscription.status !== 'active' && subscription.status !== 'grace') {
    return false;
  }

  const plan = plans.find((item) => item.id === subscription.planId);
  if (!plan) {
    return false;
  }

  return plan.entitlements.includes(entitlement);
}

export function collectDueSubscriptions(subscriptions: Subscription[], nowIso: string): Subscription[] {
  return subscriptions.filter((subscription) => dueForCharge(subscription, nowIso));
}

export function processChargeAttempt(
  subscription: Subscription,
  chargeSucceeded: boolean,
  plan: Plan,
  maxFailedAttempts: number,
  nowIso: string = new Date().toISOString()
): ChargeResult {
  if (!dueForCharge(subscription, nowIso)) {
    return {
      subscription,
      charged: false,
      reason: 'subscription is not due for charge',
    };
  }

  if (chargeSucceeded) {
    return {
      subscription: markChargeSuccess(subscription, plan.intervalDays, nowIso),
      charged: true,
    };
  }

  return {
    subscription: markChargeFailure(subscription, maxFailedAttempts),
    charged: false,
    reason: 'charge provider returned failure',
  };
}

export function createDefaultPlans(): Plan[] {
  return [
    {
      id: 'starter',
      amountUsd: 9,
      intervalDays: 30,
      gracePeriodDays: 3,
      entitlements: ['core'],
    },
    {
      id: 'pro',
      amountUsd: 29,
      intervalDays: 30,
      gracePeriodDays: 5,
      entitlements: ['core', 'analytics', 'api'],
    },
    {
      id: 'enterprise',
      amountUsd: 199,
      intervalDays: 30,
      gracePeriodDays: 7,
      entitlements: ['core', 'analytics', 'api', 'priority-support', 'sso'],
    },
  ];
}

export function runBillingPass(
  subscriptions: Subscription[],
  plans: Plan[],
  paymentOutcomes: Record<string, boolean>,
  maxFailedAttempts: number,
  nowIso: string = new Date().toISOString()
): BillingRunResult {
  const updated: Subscription[] = [];
  let chargedCount = 0;
  let failedCount = 0;

  for (const subscription of subscriptions) {
    if (!dueForCharge(subscription, nowIso)) {
      updated.push(subscription);
      continue;
    }

    const plan = plans.find((item) => item.id === subscription.planId);
    if (!plan) {
      updated.push({
        ...subscription,
        status: 'past_due',
      });
      failedCount += 1;
      continue;
    }

    const outcome = paymentOutcomes[subscription.id] ?? false;
    const result = processChargeAttempt(subscription, outcome, plan, maxFailedAttempts, nowIso);
    updated.push(result.subscription);

    if (result.charged) {
      chargedCount += 1;
    } else {
      failedCount += 1;
    }
  }

  return {
    updated,
    chargedCount,
    failedCount,
  };
}
