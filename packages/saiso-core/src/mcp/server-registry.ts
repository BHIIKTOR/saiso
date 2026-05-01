/**
 * MCP Server Registry - Server instance management and capability routing
 */

import type {
  McpServerInstance,
  ServerInfo,
  RoutingCriteria,
  ServerType,
  ServerCategory,
  McpServerStatus
} from '../types/multi-server.js';
import type { McpServerOrchestrator } from './orchestrator.js';

export class McpServerRegistry {
  private instances: Map<string, McpServerInstance> = new Map();

  private getTrustScore(instance: McpServerInstance): number {
    if (typeof instance.config.trustScore !== 'number' || Number.isNaN(instance.config.trustScore)) {
      return 0.5;
    }
    return Math.max(0, Math.min(1, instance.config.trustScore));
  }

  private hasCost(instance: McpServerInstance): boolean {
    return typeof instance.config.costPerRequestUsd === 'number' && !Number.isNaN(instance.config.costPerRequestUsd);
  }

  private getCost(instance: McpServerInstance): number {
    if (!this.hasCost(instance)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, instance.config.costPerRequestUsd as number);
  }

  private compareCandidates(
    a: McpServerInstance,
    b: McpServerInstance,
    profile: 'trust-first' | 'cost-first' | 'balanced' = 'trust-first'
  ): number {
    const trustDiff = this.getTrustScore(b) - this.getTrustScore(a);
    const aHasCost = this.hasCost(a);
    const bHasCost = this.hasCost(b);
    const costDiff = this.getCost(a) - this.getCost(b);

    if (profile === 'cost-first') {
      if (aHasCost && bHasCost && costDiff !== 0) {
        return costDiff;
      }
      if (aHasCost !== bHasCost) {
        return aHasCost ? -1 : 1;
      }
      if (trustDiff !== 0) {
        return trustDiff;
      }
    } else if (profile === 'balanced') {
      if (Math.abs(trustDiff) >= 0.15) {
        return trustDiff;
      }
      if (aHasCost && bHasCost && costDiff !== 0) {
        return costDiff;
      }
      if (trustDiff !== 0) {
        return trustDiff;
      }
      if (aHasCost !== bHasCost) {
        return aHasCost ? -1 : 1;
      }
    } else {
      if (trustDiff !== 0) {
        return trustDiff;
      }
      if (aHasCost && bHasCost && costDiff !== 0) {
        return costDiff;
      }
      if (aHasCost !== bHasCost) {
        return aHasCost ? -1 : 1;
      }
    }

    const aTime = a.status?.startTime?.getTime() || 0;
    const bTime = b.status?.startTime?.getTime() || 0;
    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return a.config.name.localeCompare(b.config.name);
  }

  /**
   * Register a server instance
   */
  register(name: string, instance: McpServerInstance): void {
    if (this.instances.has(name)) {
      throw new Error(`Server '${name}' is already registered`);
    }

    this.instances.set(name, instance);
  }

  /**
   * Unregister a server instance
   */
  unregister(name: string): void {
    const instance = this.instances.get(name);
    if (instance) {
      this.instances.delete(name);
    }
  }

  /**
   * Get a server instance by name
   */
  get(name: string): McpServerInstance | undefined {
    return this.instances.get(name);
  }

  /**
   * Get orchestrator by server name
   */
  getOrchestrator(name: string): McpServerOrchestrator | undefined {
    const instance = this.instances.get(name);
    return instance?.orchestrator;
  }

  /**
   * Get all registered server names
   */
  getServerNames(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Get all server instances
   */
  getAllInstances(): McpServerInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get servers by capability
   */
  getByCapability(capability: string): McpServerInstance[] {
    return Array.from(this.instances.values()).filter(instance =>
      instance.config.capabilities.includes(capability)
    );
  }

  /**
   * Get servers by type
   */
  getByType(type: ServerType): McpServerInstance[] {
    return Array.from(this.instances.values()).filter(instance =>
      instance.config.type === type
    );
  }

  /**
   * Get servers by category
   */
  getByCategory(category: ServerCategory): McpServerInstance[] {
    return Array.from(this.instances.values()).filter(instance =>
      instance.config.category === category
    );
  }

  /**
   * Get running servers
   */
  getRunningServers(): McpServerInstance[] {
    return Array.from(this.instances.values()).filter(instance =>
      instance.status?.running === true
    );
  }

  /**
   * Get stopped servers
   */
  getStoppedServers(): McpServerInstance[] {
    return Array.from(this.instances.values()).filter(instance =>
      instance.status?.running !== true
    );
  }

  /**
   * Get healthy servers
   */
  getHealthyServers(): McpServerInstance[] {
    return Array.from(this.instances.values()).filter(instance =>
      instance.healthStatus === 'healthy'
    );
  }

  /**
   * Find servers matching routing criteria
   */
  findServers(criteria: RoutingCriteria): McpServerInstance[] {
    let candidates = Array.from(this.instances.values());

    // Filter by capability
    if (criteria.capability) {
      candidates = candidates.filter(instance =>
        instance.config.capabilities.includes(criteria.capability as string)
      );
    }

    // Filter by server type
    if (criteria.serverType) {
      candidates = candidates.filter(instance =>
        instance.config.type === criteria.serverType
      );
    }

    // Filter by category
    if (criteria.category) {
      candidates = candidates.filter(instance =>
        instance.config.category === criteria.category
      );
    }

    // Filter by network (for blockchain servers)
    if (criteria.network) {
      candidates = candidates.filter(instance => {
        const serverConfig = instance.config.serverConfig;
        if ('network' in serverConfig) {
          return serverConfig.network === criteria.network;
        }
        return false;
      });
    }

    // Apply preferred servers
    if (criteria.preferredServers && criteria.preferredServers.length > 0) {
      const preferred = candidates.filter(instance =>
        criteria.preferredServers?.includes(instance.config.name) ?? false
      );
      if (preferred.length > 0) {
        candidates = preferred;
      }
    }

    // Exclude servers
    if (criteria.excludeServers && criteria.excludeServers.length > 0) {
      candidates = candidates.filter(instance =>
        !(criteria.excludeServers?.includes(instance.config.name) ?? false)
      );
    }

    if (typeof criteria.minTrustScore === 'number') {
      candidates = candidates.filter(instance => this.getTrustScore(instance) >= criteria.minTrustScore!);
    }

    if (typeof criteria.maxCostUsd === 'number') {
      candidates = candidates.filter(instance => this.hasCost(instance) && this.getCost(instance) <= criteria.maxCostUsd!);
    }

    return candidates;
  }

  /**
   * Get optimal server for criteria
   */
  getOptimalServer(criteria: RoutingCriteria): McpServerInstance | undefined {
    const candidates = this.findServers(criteria);
    const routingProfile = criteria.routingProfile || 'trust-first';

    if (candidates.length === 0) {
      return undefined;
    }

    // Prioritize healthy running servers
    const healthyRunning = candidates.filter(instance =>
      instance.status?.running === true && instance.healthStatus === 'healthy'
    );

    if (healthyRunning.length > 0) {
      return healthyRunning.sort((a, b) => this.compareCandidates(a, b, routingProfile))[0];
    }

    // Fallback to any running server (still trust/cost-weighted).
    const running = candidates.filter(instance => instance.status?.running === true);
    if (running.length > 0) {
      return running.sort((a, b) => this.compareCandidates(a, b, routingProfile))[0];
    }

    // Fallback to best available server candidate.
    return candidates.sort((a, b) => this.compareCandidates(a, b, routingProfile))[0];
  }

  /**
   * Get server information summary
   */
  getServerInfo(): ServerInfo[] {
    return Array.from(this.instances.values()).map(instance => ({
      name: instance.config.name,
      displayName: instance.config.displayName,
      description: instance.config.description,
      type: instance.config.type,
      category: instance.config.category,
      status: this.getServerStatus(instance),
      port: instance.config.port,
      url: instance.status?.url,
      capabilities: instance.config.capabilities,
      autoStart: instance.config.autoStart,
      lastHealthCheck: instance.lastHealthCheck,
      healthStatus: instance.healthStatus,
      trustScore: instance.config.trustScore,
      costPerRequestUsd: instance.config.costPerRequestUsd,
    }));
  }

  /**
   * Get server status string
   */
  private getServerStatus(instance: McpServerInstance): 'running' | 'stopped' | 'error' {
    if (!instance.status) {
      return 'stopped';
    }

    if (instance.status.running) {
      return instance.healthStatus === 'unhealthy' ? 'error' : 'running';
    }

    return 'stopped';
  }

  /**
   * Update server health status
   */
  updateHealthStatus(name: string, healthStatus: 'healthy' | 'unhealthy' | 'unknown'): void {
    const instance = this.instances.get(name);
    if (instance) {
      instance.healthStatus = healthStatus;
      instance.lastHealthCheck = new Date();
    }
  }

  /**
   * Update server status
   */
  updateServerStatus(name: string, status: McpServerStatus | null): void {
    const instance = this.instances.get(name);
    if (instance) {
      instance.status = status;
    }
  }

  /**
   * Check if server exists
   */
  exists(name: string): boolean {
    return this.instances.has(name);
  }

  /**
   * Get server count
   */
  getServerCount(): number {
    return this.instances.size;
  }

  /**
   * Get server count by status
   */
  getServerCountByStatus(): {
    total: number;
    running: number;
    stopped: number;
    healthy: number;
    unhealthy: number;
  } {
    const instances = Array.from(this.instances.values());

    return {
      total: instances.length,
      running: instances.filter(i => i.status?.running === true).length,
      stopped: instances.filter(i => i.status?.running !== true).length,
      healthy: instances.filter(i => i.healthStatus === 'healthy').length,
      unhealthy: instances.filter(i => i.healthStatus === 'unhealthy').length,
    };
  }

  /**
   * Clear all registrations (for testing/reset)
   */
  clear(): void {
    this.instances.clear();
  }

  /**
   * Get servers that should auto-start
   */
  getAutoStartServers(): McpServerInstance[] {
    return Array.from(this.instances.values()).filter(instance =>
      instance.config.autoStart === true
    );
  }

  /**
   * Validate server configuration before registration
   */
  validateServerConfig(name: string, instance: McpServerInstance): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check for duplicate names
    if (this.instances.has(name)) {
      errors.push(`Server name '${name}' is already registered`);
    }

    // Validate server name format
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
      errors.push('Server name must contain only alphanumeric characters, hyphens, and underscores');
    }

    // Check for port conflicts
    const existingPorts = Array.from(this.instances.values())
      .map(i => i.config.port)
      .filter(port => port === instance.config.port);

    if (existingPorts.length > 0) {
      errors.push(`Port ${instance.config.port} is already in use by another server`);
    }

    // Validate environment prefix uniqueness
    const existingPrefixes = Array.from(this.instances.values())
      .map(i => i.config.envPrefix.toUpperCase())
      .filter(prefix => prefix === instance.config.envPrefix.toUpperCase());

    if (existingPrefixes.length > 0) {
      errors.push(`Environment prefix '${instance.config.envPrefix}' is already in use`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
