export interface Erc8004ServiceEndpoint {
  name: string;
  endpoint: string;
  version?: string;
  skills?: string[];
  domains?: string[];
}

export interface Erc8004SigningMetadata {
  algorithm: string;
  keyId: string;
  signature?: string;
  signedAt?: string;
}

export interface Erc8004RuntimeMetadata {
  environment?: string;
  network?: string;
  serverType?: 'evm' | 'svm';
  mcpEndpoint?: string;
  healthEndpoint?: string;
  readinessEndpoint?: string;
}

export interface Erc8004PaymentSupport {
  x402?: boolean;
  mpp?: boolean;
  preferred?: 'x402' | 'mpp' | 'auto';
}

export interface Erc8004Registration {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
  name: string;
  description: string;
  image: string;
  services: Erc8004ServiceEndpoint[];
  x402Support?: boolean;
  paymentSupport?: Erc8004PaymentSupport;
  runtime?: Erc8004RuntimeMetadata;
  signing?: Erc8004SigningMetadata;
  active: boolean;
  registrations: Array<{
    agentId: number;
    agentRegistry: string;
  }>;
  supportedTrust?: string[];
}
