import type { TrustConfig } from '../types/config.js';

export function isTrustScoreAccepted(score: number, config?: TrustConfig): boolean {
  if (!config?.enabled) {
    return true;
  }
  if (typeof config.minTrustScore !== 'number') {
    return true;
  }
  return score >= config.minTrustScore;
}
