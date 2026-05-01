import type { Erc8004Registration } from './erc8004-types.js';

export interface Erc8004RegistryClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

export class Erc8004RegistryClient {
  constructor(private readonly options: Erc8004RegistryClientOptions) {}

  async getAgent(agentRegistry: string, agentId: string): Promise<Erc8004Registration> {
    const response = await fetch(`${this.options.baseUrl}/agents/${encodeURIComponent(agentRegistry)}/${encodeURIComponent(agentId)}`, {
      headers: this.options.headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch agent (${response.status})`);
    }
    return await response.json() as Erc8004Registration;
  }
}
