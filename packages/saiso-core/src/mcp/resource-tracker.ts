/**
 * Resource Tracker - Smart port allocation and resource management
 */

import type {
  ResourceAllocation,
  IndividualServerConfig,
  ValidationResult
} from '../types/multi-server.js';

export class ResourceTracker {
  private allocations: Map<number, ResourceAllocation> = new Map();
  private readonly defaultPortRange = { start: 3001, end: 3100 };

  constructor(
    private portRange: { start: number; end: number } = { start: 3001, end: 3100 }
  ) {
    // Initialize port range
    this.portRange = { ...this.defaultPortRange, ...portRange };
  }

  /**
   * Allocate a port for a server
   */
  allocatePort(serverName: string, preferred?: number): number {
    // If preferred port is specified and available, use it
    if (preferred && this.isPortAvailable(preferred)) {
      this.allocations.set(preferred, {
        port: preferred,
        allocated: true,
        serverName,
        allocatedAt: new Date(),
      });
      return preferred;
    }

    // Find next available port in range
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
      if (this.isPortAvailable(port)) {
        this.allocations.set(port, {
          port,
          allocated: true,
          serverName,
          allocatedAt: new Date(),
        });
        return port;
      }
    }

    throw new Error(
      `No available ports in range ${this.portRange.start}-${this.portRange.end}. Consider expanding the port range or stopping unused servers.`
    );
  }

  /**
   * Release a port allocation
   */
  releasePort(port: number): void {
    const allocation = this.allocations.get(port);
    if (allocation) {
      this.allocations.delete(port);
    }
  }

  /**
   * Check if a port is available
   */
  isPortAvailable(port: number): boolean {
    // Check if port is in valid range
    if (port < this.portRange.start || port > this.portRange.end) {
      return false;
    }

    // Check if port is already allocated
    return !this.allocations.has(port);
  }

  /**
   * Get port allocation info
   */
  getPortAllocation(port: number): ResourceAllocation | undefined {
    return this.allocations.get(port);
  }

  /**
   * Get all port allocations
   */
  getAllAllocations(): ResourceAllocation[] {
    return Array.from(this.allocations.values());
  }

  /**
   * Get ports allocated to a specific server
   */
  getServerPorts(serverName: string): number[] {
    return Array.from(this.allocations.values())
      .filter(allocation => allocation.serverName === serverName)
      .map(allocation => allocation.port);
  }

  /**
   * Check for resource conflicts before server startup
   */
  checkResourceConflicts(config: IndividualServerConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check port conflicts
    if (!this.isPortAvailable(config.port)) {
      const allocation = this.allocations.get(config.port);
      if (allocation?.serverName === config.name) {
        warnings.push(`Port ${config.port} is already allocated to this server`);
      } else {
        errors.push(
          `Port ${config.port} is already allocated to server '${allocation?.serverName}'`
        );
      }
    }

    // Check port range validity
    if (config.port < this.portRange.start || config.port > this.portRange.end) {
      errors.push(
        `Port ${config.port} is outside valid range ${this.portRange.start}-${this.portRange.end}`
      );
    }

    // Check for environment variable conflicts
    const envPrefix = config.envPrefix.toUpperCase();
    if (!envPrefix.endsWith('_')) {
      warnings.push(`Environment prefix '${envPrefix}' should end with underscore`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get resource usage statistics
   */
  getResourceStats(): {
    totalPorts: number;
    allocatedPorts: number;
    availablePorts: number;
    utilizationPercent: number;
    allocations: ResourceAllocation[];
  } {
    const totalPorts = this.portRange.end - this.portRange.start + 1;
    const allocatedPorts = this.allocations.size;
    const availablePorts = totalPorts - allocatedPorts;
    const utilizationPercent = Math.round((allocatedPorts / totalPorts) * 100);

    return {
      totalPorts,
      allocatedPorts,
      availablePorts,
      utilizationPercent,
      allocations: this.getAllAllocations(),
    };
  }

  /**
   * Find optimal port for a server
   */
  findOptimalPort(serverName: string, preferences?: {
    preferred?: number;
    avoid?: number[];
    sequential?: boolean;
  }): number {
    const { preferred, avoid = [], sequential = false } = preferences || {};

    // Try preferred port first
    if (preferred && this.isPortAvailable(preferred) && !avoid.includes(preferred)) {
      return preferred;
    }

    // If sequential allocation is requested, try to allocate next to existing servers
    if (sequential) {
      const existingPorts = this.getServerPorts(serverName);
      if (existingPorts.length > 0) {
        const maxPort = Math.max(...existingPorts);
        for (let port = maxPort + 1; port <= this.portRange.end; port++) {
          if (this.isPortAvailable(port) && !avoid.includes(port)) {
            return port;
          }
        }
      }
    }

    // Find first available port
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
      if (this.isPortAvailable(port) && !avoid.includes(port)) {
        return port;
      }
    }

    throw new Error('No available ports found with given constraints');
  }

  /**
   * Reserve a port without allocating to a server
   */
  reservePort(port: number, reason: string): void {
    if (!this.isPortAvailable(port)) {
      throw new Error(`Port ${port} is not available for reservation`);
    }

    this.allocations.set(port, {
      port,
      allocated: true,
      serverName: `RESERVED: ${reason}`,
      allocatedAt: new Date(),
    });
  }

  /**
   * Clear all allocations (for testing/reset)
   */
  clearAllocations(): void {
    this.allocations.clear();
  }

  /**
   * Update port range
   */
  updatePortRange(start: number, end: number): void {
    if (start >= end) {
      throw new Error('Invalid port range: start must be less than end');
    }

    // Check if any existing allocations would be outside new range
    const conflictingAllocations = Array.from(this.allocations.values())
      .filter(allocation => allocation.port < start || allocation.port > end);

    if (conflictingAllocations.length > 0) {
      const conflictPorts = conflictingAllocations.map(a => a.port).join(', ');
      throw new Error(
        `Cannot update port range: ports ${conflictPorts} are currently allocated outside new range`
      );
    }

    this.portRange = { start, end };
  }
}
