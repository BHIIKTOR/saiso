# Yield Rotation Steward Scaffold

Scaffold for a yield allocation bot that rotates between venues based on policy and score thresholds.

## Quick Start

```bash
bash examples/yield-rotation-steward/scaffold.sh yield-rotation-steward
cd yield-rotation-steward
cp .env.example .env
saiso policy validate --strict
saiso dev
```

Run the local scaffold simulation:

```bash
bun src/index.ts
```

## Core Focus

1. Yield venue scoring and rotation windows.
2. Allocation and drawdown limits.
3. PnL tracking and scheduled reports.
4. Privy wallet and transfer support.
