import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PaymentReceipt } from './types.js';
import { sanitizePaymentReceipt } from './receipt-utils.js';

export class PaymentReceiptStore {
  constructor(private readonly basePath: string) {}

  private get receiptsPath(): string {
    return path.join(this.basePath, '.saiso', 'payments', 'receipts.ndjson');
  }

  async append(receipt: PaymentReceipt): Promise<void> {
    const target = this.receiptsPath;
    await fs.mkdir(path.dirname(target), { recursive: true });
    const sanitized = sanitizePaymentReceipt(receipt);
    await fs.appendFile(target, `${JSON.stringify(sanitized)}\n`, 'utf-8');
  }

  async readAll(limit = 200): Promise<PaymentReceipt[]> {
    try {
      const content = await fs.readFile(this.receiptsPath, 'utf-8');
      return content
        .split('\n')
        .filter(Boolean)
        .slice(-limit)
        .map((line) => JSON.parse(line) as PaymentReceipt)
        .map((receipt) => sanitizePaymentReceipt(receipt));
    } catch {
      return [];
    }
  }

  async getDailySpendUsd(day: Date = new Date()): Promise<number> {
    const receipts = await this.readAll(5000);
    const targetDay = day.toISOString().slice(0, 10);

    let total = 0;
    for (const receipt of receipts) {
      if (!receipt.success) {
        continue;
      }

      const receiptDay = this.toUtcDay(receipt.timestamp);
      if (receiptDay !== targetDay) {
        continue;
      }

      const amountUsd = this.parseReceiptAmountUsd(receipt);
      if (typeof amountUsd === 'number') {
        total += amountUsd;
      }
    }

    return Number(total.toFixed(8));
  }

  private toUtcDay(timestamp: string): string | null {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString().slice(0, 10);
  }

  private parseReceiptAmountUsd(receipt: PaymentReceipt): number | undefined {
    const raw = (receipt.raw && typeof receipt.raw === 'object' && !Array.isArray(receipt.raw))
      ? receipt.raw as Record<string, unknown>
      : {};

    const rawAmountUsd = raw.amountUsd;
    if (typeof rawAmountUsd === 'number' && Number.isFinite(rawAmountUsd)) {
      return rawAmountUsd;
    }
    if (typeof rawAmountUsd === 'string') {
      const parsed = Number.parseFloat(rawAmountUsd);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    if (typeof receipt.amount === 'string') {
      const parsed = Number.parseFloat(receipt.amount);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return undefined;
  }
}
