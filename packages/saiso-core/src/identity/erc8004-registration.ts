import type { Erc8004Registration } from './erc8004-types.js';

export function createErc8004Registration(input: Omit<Erc8004Registration, 'type'>): Erc8004Registration {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    ...input,
  };
}

export function validateErc8004Registration(registration: Erc8004Registration): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!registration.name.trim()) {
    errors.push('name is required');
  }
  if (!registration.description.trim()) {
    errors.push('description is required');
  }
  if (!registration.image.trim()) {
    errors.push('image is required');
  }
  if (!Array.isArray(registration.services) || registration.services.length === 0) {
    errors.push('at least one service endpoint is required');
  }
  if (!Array.isArray(registration.registrations) || registration.registrations.length === 0) {
    errors.push('at least one on-chain registration reference is required');
  }

  if (registration.paymentSupport) {
    const preferred = registration.paymentSupport.preferred;
    if (preferred && preferred !== 'x402' && preferred !== 'mpp' && preferred !== 'auto') {
      errors.push('paymentSupport.preferred must be x402, mpp, or auto');
    }
  }

  if (registration.signing) {
    if (!registration.signing.algorithm?.trim()) {
      errors.push('signing.algorithm is required when signing metadata is provided');
    }
    if (!registration.signing.keyId?.trim()) {
      errors.push('signing.keyId is required when signing metadata is provided');
    }
    if (registration.signing.signedAt) {
      const timestamp = Date.parse(registration.signing.signedAt);
      if (Number.isNaN(timestamp)) {
        errors.push('signing.signedAt must be a valid ISO timestamp');
      }
    }
  }

  if (registration.runtime?.serverType && registration.runtime.serverType !== 'evm' && registration.runtime.serverType !== 'svm') {
    errors.push('runtime.serverType must be evm or svm');
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}
