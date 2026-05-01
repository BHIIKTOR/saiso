# Gas Estimation Feature

Advanced EVM gas estimation with MEV protection, network optimization, and comprehensive cost prediction for all transaction types.

## Overview

The Gas Estimation feature provides intelligent gas price calculation and cost prediction for Ethereum Virtual Machine (EVM) transactions. It supports multiple networks, transaction types, and advanced features like MEV protection and EIP-1559 pricing.

## Features

### Core Capabilities
- **EIP-1559 Support**: Modern gas pricing with `maxFeePerGas` and `maxPriorityFeePerGas`
- **Legacy Gas Pricing**: Backward compatibility with traditional `gasPrice`
- **Multi-Network Support**: ETH, Ethereum, Polygon, Arbitrum, and more
- **Transaction Type Detection**: Automatic optimization for transfers, contract calls, and deployments
- **Speed Options**: Slow, standard, fast, and instant confirmation speeds

### Advanced Features
- **MEV Protection**: Private mempool submission and MEV-resistant strategies
- **Network Congestion Analysis**: Real-time assessment of network conditions
- **Cost Calculation**: Estimates in Wei, Gwei, ETH, and USD
- **Smart Recommendations**: Context-aware suggestions for optimal gas settings
- **Batch Optimization**: Efficient gas estimation for multiple transactions

## Usage

### Basic Gas Estimation

```typescript
// Simple transfer estimation
{
  "to": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5",
  "value": "1",
  "transactionType": "transfer"
}
```

### Contract Interaction

```typescript
// Contract call with data
{
  "to": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5",
  "data": "0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b8d4c9db96c4b4d8b5000000000000000000000000000000000000000000000000016345785d8a0000",
  "transactionType": "contract"
}
```

### Advanced Configuration

```typescript
// Custom gas settings with MEV protection
{
  "speed": "fast",
  "multiplier": 1.5,
  "mevProtection": true,
  "maxFeePerGas": "50",
  "maxPriorityFeePerGas": "2",
  "includeUsdPrice": true
}
```

## Parameters

### Required Parameters
- None (all parameters are optional with sensible defaults)

### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `to` | string | - | Target address for the transaction |
| `data` | string | - | Transaction data (for contract calls) |
| `value` | string | - | ETH/ETH value to send |
| `speed` | enum | `standard` | Gas price speed: `slow`, `standard`, `fast`, `instant` |
| `multiplier` | number | `1.0` | Custom gas price multiplier (0.1-5.0) |
| `maxFeePerGas` | string | - | EIP-1559 maximum fee per gas (in gwei) |
| `maxPriorityFeePerGas` | string | - | EIP-1559 priority fee per gas (in gwei) |
| `gasLimit` | number | - | Custom gas limit override |
| `mevProtection` | boolean | `false` | Enable MEV protection strategies |
| `includeUsdPrice` | boolean | `true` | Include USD cost estimation |
| `transactionType` | enum | `transfer` | Transaction type: `transfer`, `contract`, `deployment` |

## Response Format

```typescript
{
  "success": true,
  "data": {
    "gasLimit": 21000,
    "gasPrice": "20.5",
    "maxFeePerGas": "25.0",
    "maxPriorityFeePerGas": "2.0",
    "baseFeePerGas": "18.5",
    "estimatedCost": {
      "wei": "430500000000000000",
      "ether": "0.0004305",
      "gwei": "430.5",
      "usd": "1.54"
    },
    "networkInfo": {
      "chainId": 11155111,
      "networkName": "Sepolia Testnet",
      "congestionLevel": "medium",
      "avgBlockTime": 0.4,
      "eip1559Supported": true
    },
    "recommendations": [
      "This network supports EIP-1559. Consider using maxFeePerGas for better control."
    ],
    "mevProtection": {
      "enabled": true,
      "strategies": ["Private mempool submission", "Transaction timing optimization"],
      "additionalCost": "0.000021525"
    },
    "speedComparison": {
      "slow": {
        "gasPrice": "16.4",
        "estimatedTime": "2s",
        "cost": "0.0003444"
      },
      "standard": {
        "gasPrice": "20.5",
        "estimatedTime": "0.8s",
        "cost": "0.0004305"
      },
      "fast": {
        "gasPrice": "24.6",
        "estimatedTime": "0.4s",
        "cost": "0.0005166"
      },
      "instant": {
        "gasPrice": "30.75",
        "estimatedTime": "0.2s",
        "cost": "0.00064575"
      }
    }
  }
}
```

## Network Support

### Supported Networks

| Network | Chain ID | Features |
|---------|----------|----------|
| Ethereum Mainnet | 1 | EIP-1559, Fast Finality |
| Sepolia Testnet | 11155111 | EIP-1559, Fast Finality |
| Ethereum Mainnet | 1 | EIP-1559, MEV Protection |
| Sepolia Testnet | 11155111 | EIP-1559 |
| Polygon Mainnet | 137 | EIP-1559, Low Cost |
| Mumbai Testnet | 80001 | EIP-1559 |

### Network-Specific Optimizations

- **ETH Networks**: Ultra-fast block times (0.4s), optimized gas multipliers
- **Ethereum**: MEV protection, comprehensive EIP-1559 support
- **Polygon**: Low-cost transactions, fast confirmation times
- **Layer 2 Networks**: Optimized for reduced fees and faster processing

## Environment Variables

### Required
- `RPC_URL`: RPC endpoint for blockchain connectivity

### Optional
- `GAS_PRICE_API_KEY`: API key for external gas price services
- `MEV_PROTECTION_ENABLED`: Global MEV protection setting (`true`/`false`)

## Examples

### Example 1: Simple Transfer
```
User: "Estimate gas for sending 1 ETH to 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5"
Agent: "Gas estimation for transfer transaction: 0.0004305 ETH (~$1.54) at standard speed (20.5 gwei). Network: Sepolia Testnet (medium congestion)"
```

### Example 2: Fast Transaction with MEV Protection
```
User: "Get fast gas price with MEV protection for contract call"
Agent: "Gas estimation for contract transaction: 0.0012915 ETH (~$4.62) at fast speed (24.6 gwei) with MEV protection. Network: Sepolia Testnet (medium congestion)"
```

### Example 3: Custom Multiplier
```
User: "Calculate gas cost with 1.5x multiplier and USD price"
Agent: "Gas estimation for transfer transaction: 0.00064575 ETH (~$2.31) at standard speed (30.75 gwei). Network: Sepolia Testnet (medium congestion)"
```

## Error Handling

The feature includes comprehensive error handling for:
- Network connectivity issues
- Invalid transaction parameters
- Gas estimation failures
- RPC endpoint errors
- Unsupported networks

## Best Practices

### For Users
1. **Use appropriate speed settings** based on urgency
2. **Enable MEV protection** for high-value transactions
3. **Monitor network congestion** before submitting transactions
4. **Set reasonable gas limits** for contract interactions

### For Developers
1. **Always validate inputs** before gas estimation
2. **Handle estimation failures gracefully** with fallback values
3. **Cache network configurations** to reduce RPC calls
4. **Implement retry logic** for network requests

## Testing

The feature includes comprehensive unit tests covering:
- Basic gas estimation scenarios
- Network-specific configurations
- Error handling and edge cases
- MEV protection functionality
- Speed multiplier calculations

Run tests with:
```bash
bun test templates/features/gas_estimation/test.ts
```

## Integration

### Adding to Your Agent

1. Install the feature using `saiso add gas_estimation`
2. Configure required environment variables
3. Import and use the action in your agent code

### Custom Integration

```typescript
import { gasEstimationAction } from './actions/gasEstimation';

// Add to your agent's actions array
const actions = [
  gasEstimationAction,
  // ... other actions
];
```

## Troubleshooting

### Common Issues

1. **"RPC URL not configured"**
   - Ensure `RPC_URL` is set in your environment

2. **"Gas estimation failed"**
   - Check network connectivity
   - Verify transaction parameters
   - Try with a different RPC endpoint

3. **"Unsupported network"**
   - The feature will use default configurations for unknown networks
   - Consider adding custom network configuration

### Debug Mode

Enable debug logging by setting `LOG_LEVEL=debug` in your environment to see detailed gas estimation calculations.

## Contributing

To contribute improvements to the gas estimation feature:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

This feature is part of the SAISO toolkit and is licensed under the MIT License.
