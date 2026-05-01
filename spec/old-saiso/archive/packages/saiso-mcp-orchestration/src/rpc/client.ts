/**
 * SEI RPC Client for blockchain interactions
 */

import { ethers } from 'ethers';
import { logger } from '@saiso/core';
import type {
  SeiNetworkConfig,
  TransactionRequest,
  TransactionResult,
  NetworkStatus
} from '../types.js';

export class SeiRpcClient {
  private provider: ethers.JsonRpcProvider;
  private networkConfig: SeiNetworkConfig;

  constructor(networkConfig: SeiNetworkConfig) {
    this.networkConfig = networkConfig;
    this.provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  }

  /**
   * Get network status
   */
  async getNetworkStatus(): Promise<NetworkStatus> {
    try {
      const [network, blockNumber, feeData] = await Promise.all([
        this.provider.getNetwork(),
        this.provider.getBlockNumber(),
        this.provider.getFeeData(),
      ]);

      return {
        connected: true,
        chainId: Number(network.chainId),
        blockNumber,
        gasPrice: feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : '0',
        networkName: this.networkConfig.name,
      };
    } catch (error) {
      logger.error('Failed to get network status:', error);
      return {
        connected: false,
        chainId: 0,
        blockNumber: 0,
        gasPrice: '0',
        networkName: this.networkConfig.name,
      };
    }
  }

  /**
   * Send transaction
   */
  async sendTransaction(
    wallet: ethers.Wallet,
    request: TransactionRequest
  ): Promise<TransactionResult> {
    try {
      const tx = await wallet.sendTransaction({
        to: request.to,
        value: request.value ? ethers.parseEther(request.value) : undefined,
        data: request.data,
        gasLimit: request.gasLimit,
        gasPrice: request.gasPrice,
      });

      logger.info(`Transaction sent: ${tx.hash}`);

      return {
        hash: tx.hash,
        status: 'pending',
      };
    } catch (error) {
      logger.error('Failed to send transaction:', error);
      throw new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(hash: string): Promise<TransactionResult> {
    try {
      const receipt = await this.provider.waitForTransaction(hash);

      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }

      return {
        hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 1 ? 'confirmed' : 'failed',
      };
    } catch (error) {
      logger.error('Failed to wait for transaction:', error);
      throw new Error(`Transaction confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Estimate gas for transaction
   */
  async estimateGas(request: TransactionRequest): Promise<string> {
    try {
      const gasEstimate = await this.provider.estimateGas({
        to: request.to,
        value: request.value ? ethers.parseEther(request.value) : undefined,
        data: request.data,
      });

      return gasEstimate.toString();
    } catch (error) {
      logger.error('Failed to estimate gas:', error);
      throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<string> {
    try {
      const feeData = await this.provider.getFeeData();
      return feeData.gasPrice ? feeData.gasPrice.toString() : '0';
    } catch (error) {
      logger.error('Failed to get gas price:', error);
      throw new Error(`Gas price fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get provider instance
   */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  /**
   * Get network configuration
   */
  getNetworkConfig(): SeiNetworkConfig {
    return this.networkConfig;
  }
}
