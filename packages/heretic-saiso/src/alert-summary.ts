import type { AlertEvent } from '@saiso/core';

const PRICE_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 6,
});

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatPrice(value: unknown): string {
  const numeric = asNumber(value);
  return numeric === null ? 'n/a' : PRICE_FORMATTER.format(numeric);
}

function isPeriodicSnapshotRule(rule: string): boolean {
  const normalized = rule.replace(/\s+/g, '').toLowerCase();
  return normalized === 'price>=0' || normalized === 'price>0';
}

export function formatAlertNotification(event: AlertEvent): string {
  const payload = asRecord(event.payload);
  const asset = asString(payload.asset, event.key).trim().toUpperCase() || 'UNKNOWN';
  const rule = asString(payload.rule, '').trim();
  const price = formatPrice(payload.price);

  if (isPeriodicSnapshotRule(rule)) {
    return `${asset} scheduled update: price=${price}`;
  }

  const parts = [`${asset} alert hit: price=${price}`];
  if (rule) {
    parts.push(`rule=${rule}`);
  }
  return parts.join(' ');
}
