#!/usr/bin/env node

import { startSvmMcpServer } from './server.js';

interface CliOptions {
  host?: string;
  port?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--host' && argv[i + 1]) {
      options.host = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--port' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed)) {
        options.port = parsed;
      }
      i += 1;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const server = await startSvmMcpServer({
    host: args.host,
    port: args.port,
  });

  const address = server.address();
  if (typeof address === 'object' && address) {
    // eslint-disable-next-line no-console
    console.log(`@saiso/svm-mcp-server listening on ${address.address}:${address.port}`);
  }

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('@saiso/svm-mcp-server failed to start:', error);
  process.exit(1);
});
