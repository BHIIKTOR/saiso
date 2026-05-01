import type { CanonicalParityToolName } from '../types/parity.js';
import { CANONICAL_PARITY_TOOL_NAMES } from '../types/parity.js';

const canonicalToEvmTool: Record<CanonicalParityToolName, string> = {
  'network.status': 'get-chain-info',
  'wallet.address': 'get-balance',
  'wallet.native_balance': 'get-balance',
  'token.balance': 'get-token-balance',
  'token.transfer': 'transfer-token',
  'tx.simulate': 'get-transaction',
  'tx.estimate_fee': 'get-chain-info',
  'contract.read': 'read-contract',
  'contract.write': 'write-contract',
};

export const SVM_LEGACY_ALIAS_TO_CANONICAL: Record<string, CanonicalParityToolName> = {
  'get-balance': 'wallet.native_balance',
  'send-sol': 'token.transfer',
  'send-spl-token': 'token.transfer',
  'read-program-account': 'contract.read',
  'simulate-transaction': 'tx.simulate',
};

export function resolveEvmToolName(toolName: string): string {
  if ((CANONICAL_PARITY_TOOL_NAMES as readonly string[]).includes(toolName)) {
    return canonicalToEvmTool[toolName as CanonicalParityToolName];
  }
  return toolName;
}

export function resolveSvmToolName(toolName: string): string {
  return SVM_LEGACY_ALIAS_TO_CANONICAL[toolName] || toolName;
}

export function getSvmCapabilityTools(): string[] {
  const canonical = [...CANONICAL_PARITY_TOOL_NAMES];
  const legacy = Object.keys(SVM_LEGACY_ALIAS_TO_CANONICAL);
  return [...canonical, ...legacy];
}
