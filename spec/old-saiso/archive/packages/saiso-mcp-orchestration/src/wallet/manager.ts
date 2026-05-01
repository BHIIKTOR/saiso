/**
 * Wallet Manager for SEI blockchain operations
 */

import { ethers } from 'ethers';
import { logger } from '@saiso/core';
import type { WalletInfo, SeiNetworkConfig } from '../types.js';

export class WalletManager {
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.JsonRpcProvider | null = null;
  private networkConfig: SeiNetworkConfig | null = null;

  /**
   * Initialize wallet with private key and network configuration
   */
  async initialize(privateKey: string, networkConfig: SeiNetworkConfig): Promise<void> {
    try {
      // Create provider
      this.provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

      // Create wallet
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.networkConfig = networkConfig;

      // Verify connection
      await this.provider.getNetwork();

      logger.info(`Wallet initialized for ${networkConfig.name}`);
      logger.debug(`Wallet address: ${this.wallet.address}`);
    } catch (error) {
      logger.error('Failed to initialize wallet:', error);
      throw new Error(`Wallet initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get wallet information
   */
  async getWalletInfo(): Promise<WalletInfo> {
    if (!this.wallet || !this.provider || !this.networkConfig) {
      throw new Error('Wallet not initialized');
    }

    try {
      const balance = await this.provider.getBalance(this.wallet.address);

      return {
        address: this.wallet.address,
        balance: ethers.formatEther(balance),
        network: this.networkConfig.name,
      };
    } catch (error) {
      logger.error('Failed to get wallet info:', error);
      throw new Error(`Failed to get wallet info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }
    return this.wallet.address;
  }

  /**
   * Get wallet instance
   */
  getWallet(): ethers.Wallet {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }
    return this.wallet;
  }

  /**
   * Get provider instance
   */
  getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    return this.provider;
  }

  /**
   * Get network configuration
   */
  getNetworkConfig(): SeiNetworkConfig {
    if (!this.networkConfig) {
      throw new Error('Network config not initialized');
    }
    return this.networkConfig;
  }

  /**
   * Check if wallet is initialized
   */
  isInitialized(): boolean {
    return this.wallet !== null && this.provider !== null && this.networkConfig !== null;
  }

  /**
   * Get balance for any address
   */
  async getBalance(address?: string): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    try {
      const targetAddress = address || this.getAddress();
      const balance = await this.provider.getBalance(targetAddress);
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error('Failed to get balance:', error);
      throw new Error(`Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
