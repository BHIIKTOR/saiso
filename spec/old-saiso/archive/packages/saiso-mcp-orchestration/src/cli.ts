#!/usr/bin/env node

import 'dotenv/config';
import { logger } from '@saiso/core';
import { SeiMCPServer, type SeiMCPServerConfig } from './sei-server.js';

function parseChainId(chainId?: string): number {
  const parsed = Number.parseInt(chainId || '', 10);
  return Number.isFinite(parsed) ? parsed : 713715;
}

function readConfigFromEnv(): SeiMCPServerConfig {
  const privateKey = process.env.SEI_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Missing private key. Set SEI_PRIVATE_KEY or PRIVATE_KEY.');
  }

  const networkName = process.env.NETWORK || process.env.SEI_NETWORK || process.env.SAISO_NETWORK || 'sei-testnet';
  const rpcUrl = process.env.RPC_URL || process.env.SEI_RPC_URL || 'https://evm-rpc-testnet.sei-apis.com';
  const chainId = parseChainId(process.env.CHAIN_ID || process.env.SEI_CHAIN_ID);
  const blockExplorer = process.env.BLOCK_EXPLORER_URL || 'https://seitrace.com';
  const nativeCurrency = process.env.NATIVE_CURRENCY || 'SEI';
  const faucetUrl = process.env.FAUCET_URL || 'https://faucet.sei.io';

  return {
    privateKey,
    networkConfig: {
      name: networkName,
      chainId,
      rpcUrl,
      nativeCurrency,
      blockExplorer,
      faucetUrl,
    },
  };
}

async function main(): Promise<void> {
  const config = readConfigFromEnv();
  const server = new SeiMCPServer();

  await server.initialize(config);
  await server.start();

  logger.info(`SEI MCP server is running for network ${config.networkConfig.name}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to start SEI MCP server: ${message}`);
  process.exit(1);
});
