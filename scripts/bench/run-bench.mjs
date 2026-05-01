#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const BASELINE_PATH = path.resolve(process.cwd(), 'scripts/bench/baseline.json');

function parseArgs(argv) {
  const parsed = {
    iterations: 10000,
    samples: 5,
    threshold: 1.25,
    updateBaseline: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--iterations' && next) {
      parsed.iterations = Number.parseInt(next, 10);
      i += 1;
      continue;
    }
    if (token === '--samples' && next) {
      parsed.samples = Number.parseInt(next, 10);
      i += 1;
      continue;
    }
    if (token === '--threshold' && next) {
      parsed.threshold = Number.parseFloat(next);
      i += 1;
      continue;
    }
    if (token === '--update-baseline') {
      parsed.updateBaseline = true;
    }
  }

  return parsed;
}

function benchmark(name, fn, { iterations, samples }) {
  const durations = [];

  for (let sample = 0; sample < samples; sample += 1) {
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      fn(i);
    }
    durations.push(performance.now() - start);
  }

  const meanMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const maxMs = Math.max(...durations);
  const minMs = Math.min(...durations);

  return {
    name,
    meanMs,
    minMs,
    maxMs,
    samples,
    iterations,
  };
}

const PAYMENT_HEADER = 'x402 challenge=base64,recipient=0xabc123,max=0.10,resource=/premium/quote';
const POLICY_FIXTURE = {
  maxPerRequestUsd: 5,
  allowedRecipients: ['0xabc123', '0xdef456'],
  blockedRecipients: ['0xbadbad'],
  operationClassMinTrustScore: {
    read: 0.4,
    write: 0.65,
    'high-risk': 0.8,
  },
};
const CANDIDATES = Array.from({ length: 64 }, (_, i) => ({
  id: `server-${i}`,
  trust: ((i * 37) % 100) / 100,
  cost: ((i * 13) % 17) / 10,
  latency: 50 + ((i * 11) % 80),
}));
const RECEIPTS = Array.from({ length: 200 }, (_, i) => ({
  id: `receipt-${i}`,
  protocol: i % 2 === 0 ? 'x402' : 'mpp',
  success: i % 5 !== 0,
  usd: ((i % 9) + 1) * 0.1,
  chainFamily: i % 3 === 0 ? 'svm' : 'evm',
}));

function runSuite(config) {
  return [
    benchmark('payment_parsing', () => {
      const entries = PAYMENT_HEADER.split(',').map((entry) => entry.trim());
      const parsed = Object.fromEntries(entries.map((entry) => {
        const [key, ...rest] = entry.split('=');
        return [key, rest.join('=')];
      }));
      if (!parsed.recipient) {
        throw new Error('recipient missing');
      }
    }, config),

    benchmark('policy_evaluation', (i) => {
      const recipient = i % 11 === 0 ? '0xbadbad' : '0xabc123';
      const amount = (i % 7) + 0.25;
      const trust = (i % 100) / 100;
      const allowed = POLICY_FIXTURE.allowedRecipients.includes(recipient)
        && !POLICY_FIXTURE.blockedRecipients.includes(recipient)
        && amount <= POLICY_FIXTURE.maxPerRequestUsd
        && trust >= POLICY_FIXTURE.operationClassMinTrustScore.write;
      if (i === -1 && allowed) {
        throw new Error('unreachable');
      }
    }, config),

    benchmark('routing_selection', () => {
      const selected = CANDIDATES
        .slice()
        .sort((a, b) => {
          const trustDiff = b.trust - a.trust;
          if (trustDiff !== 0) return trustDiff;
          const costDiff = a.cost - b.cost;
          if (costDiff !== 0) return costDiff;
          return a.latency - b.latency;
        })
        .slice(0, 8);
      if (selected.length !== 8) {
        throw new Error('unexpected selection size');
      }
    }, config),

    benchmark('receipt_summarization', () => {
      const summary = RECEIPTS.reduce((acc, receipt) => {
        acc.total += 1;
        if (receipt.success) {
          acc.success += 1;
        }
        acc.byProtocol[receipt.protocol] = (acc.byProtocol[receipt.protocol] || 0) + 1;
        acc.totalUsd += receipt.usd;
        return acc;
      }, {
        total: 0,
        success: 0,
        totalUsd: 0,
        byProtocol: {},
      });
      if (summary.total === 0) {
        throw new Error('no receipts summarized');
      }
    }, config),
  ];
}

async function readBaseline() {
  const raw = await readFile(BASELINE_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeBaseline(payload) {
  await writeFile(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function compare(results, baseline, threshold) {
  const regressions = [];

  for (const result of results) {
    const baselineEntry = baseline.benchmarks?.[result.name];
    if (!baselineEntry || typeof baselineEntry.meanMs !== 'number') {
      continue;
    }
    const allowed = Math.max(baselineEntry.meanMs * threshold, baselineEntry.meanMs + 1);
    if (result.meanMs > allowed) {
      regressions.push({
        name: result.name,
        current: Number(result.meanMs.toFixed(4)),
        baseline: baselineEntry.meanMs,
        allowed: Number(allowed.toFixed(4)),
      });
    }
  }

  return regressions;
}

async function main() {
  const args = parseArgs(process.argv);
  const results = runSuite({
    iterations: args.iterations,
    samples: args.samples,
  });

  const output = {
    generatedAt: new Date().toISOString(),
    samples: args.samples,
    iterations: args.iterations,
    threshold: args.threshold,
    benchmarks: Object.fromEntries(results.map((result) => [result.name, {
      meanMs: Number(result.meanMs.toFixed(4)),
      minMs: Number(result.minMs.toFixed(4)),
      maxMs: Number(result.maxMs.toFixed(4)),
    }])),
  };

  if (args.updateBaseline) {
    await writeBaseline({
      version: 1,
      samples: args.samples,
      iterations: args.iterations,
      benchmarks: Object.fromEntries(results.map((result) => [result.name, {
        meanMs: Number(result.meanMs.toFixed(4)),
      }])),
    });
    console.log(JSON.stringify({ ok: true, baselineUpdated: true, output }, null, 2));
    return;
  }

  const baseline = await readBaseline();
  const regressions = compare(results, baseline, args.threshold);

  console.log(JSON.stringify({
    ok: regressions.length === 0,
    output,
    regressions,
  }, null, 2));

  if (regressions.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`perf bench failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
