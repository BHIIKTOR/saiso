import { createHash, randomBytes } from 'node:crypto';

/**
 * Crypto Utilities
 */

/**
 * Generate a random hex string
 */
export function generateRandomHex(length = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a secure random string
 */
export function generateSecureId(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = randomBytes(length);

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
}

/**
 * Hash a string using SHA-256
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Hash a string using MD5 (for non-security purposes)
 */
export function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

/**
 * Validate Ethereum-style private key
 */
export function isValidPrivateKey(privateKey: string): boolean {
  // Remove 0x prefix if present
  const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

  // Check if it's 64 hex characters
  if (cleanKey.length !== 64) {
    return false;
  }

  // Check if it's valid hex
  return /^[0-9a-fA-F]+$/.test(cleanKey);
}

/**
 * Validate Solana/SVM private key formats accepted by the first-party SVM MCP server.
 */
export function isValidSvmPrivateKey(privateKey: string): boolean {
  const trimmed = privateKey.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return Array.isArray(parsed)
        && (parsed.length === 32 || parsed.length === 64)
        && parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255);
    } catch {
      return false;
    }
  }

  if (trimmed.startsWith('0x')) {
    const raw = trimmed.slice(2);
    return (raw.length === 64 || raw.length === 128) && /^[0-9a-fA-F]+$/.test(raw);
  }

  // Base58-encoded 32-byte seeds and 64-byte secret keys are accepted by the SVM server.
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed) && trimmed.length >= 32 && trimmed.length <= 100;
}

/**
 * Validate Ethereum-style address
 */
export function isValidAddress(address: string): boolean {
  // Check if it starts with 0x and is 42 characters total
  if (!address.startsWith('0x') || address.length !== 42) {
    return false;
  }

  // Check if the rest is valid hex
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Mask sensitive data (like private keys) for logging
 */
export function maskSensitive(value: string, visibleChars = 6): string {
  if (value.length <= visibleChars * 2) {
    return '*'.repeat(value.length);
  }

  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  const middle = '*'.repeat(Math.max(0, value.length - visibleChars * 2));

  return `${start}${middle}${end}`;
}

/**
 * Generate a deterministic ID from input
 */
export function generateDeterministicId(input: string): string {
  return sha256(input).slice(0, 16);
}

/**
 * Validate chain ID
 */
export function isValidChainId(chainId: number): boolean {
  return Number.isInteger(chainId) && chainId > 0 && chainId <= 0xFFFFFFFF;
}

/**
 * Format wei to ether string
 */
export function formatWei(wei: string | bigint, decimals = 18): string {
  const weiValue = typeof wei === 'string' ? BigInt(wei) : wei;
  const divisor = BigInt(10) ** BigInt(decimals);

  const quotient = weiValue / divisor;
  const remainder = weiValue % divisor;

  if (remainder === 0n) {
    return quotient.toString();
  }

  const remainderStr = remainder.toString().padStart(decimals, '0');
  const trimmedRemainder = remainderStr.replace(/0+$/, '');

  return `${quotient}.${trimmedRemainder}`;
}

/**
 * Parse ether string to wei
 */
export function parseEther(ether: string, decimals = 18): bigint {
  const [whole = '0', fraction = ''] = ether.split('.');

  const wholePart = BigInt(whole);
  const fractionPart = fraction.padEnd(decimals, '0').slice(0, decimals);

  const divisor = BigInt(10) ** BigInt(decimals);
  const fractionValue = BigInt(fractionPart);

  return wholePart * divisor + fractionValue;
}
