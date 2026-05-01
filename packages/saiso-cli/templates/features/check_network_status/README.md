# Network Status Check Feature

Monitor network connectivity, health, and synchronization status across all supported EVM networks with comprehensive diagnostics.

## Overview

The Network Status Check feature provides comprehensive monitoring and diagnostics for EVM networks, including connectivity testing, chain validation, performance metrics, and health assessment. It supports all major EVM networks including ETH, Ethereum, Polygon, and Arbitrum.

## Features

- **🔗 Connectivity Testing**: Test RPC endpoint availability and response times
- **🔍 Chain ID Validation**: Verify network identity matches configuration
- **📊 Performance Metrics**: Monitor response times, block height, and gas prices
- **🔄 Sync Status Monitoring**: Check node synchronization with the network
- **👥 Peer Count Analysis**: Monitor network connectivity and peer relationships
- **⚠️ Health Assessment**: Comprehensive network health evaluation
- **🌐 Multi-Network Support**: Works with ETH, Ethereum, Polygon, Arbitrum, and custom networks

## Usage Examples

### Basic Network Status Check

```
Check ETH testnet status
```

**Response:**
```
🔍 Network Status Check

✅ Status: HEALTHY

Network Information:
• Network: Sepolia Testnet
• Chain ID: 11155111 ✅
• RPC URL: https://rpc.sepolia.org
• Connection: ✅ Connected

Performance Metrics:
• Response Time: 245ms
• Block Height: 1,234,567
• Gas Price: 0.1 gwei
• Sync Status: ✅ Synchronized

🟢 Network is operating normally!
```

### Health and Synchronization Check

```
Is the network healthy and synchronized?
```

**Response:**
```
🔍 Checking network health and synchronization...

✅ Network Status: HEALTHY & SYNCHRONIZED

Health Check Results:
• Network Connectivity: ✅ Excellent (156ms)
• Chain Synchronization: ✅ Fully synced
• Node Health: ✅ Operational
• Block Production: ✅ Normal (2.1s avg)

Current Metrics:
• Latest Block: 1,234,567
• Gas Price: 0.12 gwei
• Network Load: Low

🟢 Network is performing optimally!
```

### Detailed Performance Metrics

```
Get network performance metrics
```

**Response:**
```
📊 Network Performance Metrics

Response Times:
• RPC Latency: 178ms
• Block Query: 145ms
• Gas Price Query: 89ms

Network Statistics:
• Current Block: 1,234,567
• Block Time: 2.1s average
• Gas Price: 0.11 gwei
• Network Utilization: 23%

Health Indicators:
• Uptime: 99.9%
• Sync Status: ✅ Current
• Peer Count: 47 connected
• Transaction Pool: 156 pending

📈 Performance: Excellent
```

### Advanced Diagnostics

```
Check network status with peer count and detailed metrics
```

**Response:**
```
🔍 Network Status Check

✅ Status: HEALTHY

Network Information:
• Network: Sepolia Testnet
• Chain ID: 11155111 ✅
• RPC URL: https://rpc.sepolia.org
• Connection: ✅ Connected

Performance Metrics:
• Response Time: 189ms
• Block Height: 1,234,567
• Gas Price: 0.11 gwei
• Sync Status: ✅ Synchronized
• Peer Count: ✅ 47

🟢 Network is operating normally!
```

## Supported Networks

### ETH Networks
- **Sepolia Testnet** (Chain ID: 11155111)
- **Holesky Devnet** (Chain ID: 713716)
- **Ethereum Mainnet** (Chain ID: 1)

### Ethereum Networks
- **Ethereum Sepolia Testnet** (Chain ID: 11155111)
- **Ethereum Mainnet** (Chain ID: 1)

### Polygon Networks
- **Polygon Mumbai Testnet** (Chain ID: 80001)
- **Polygon Mainnet** (Chain ID: 137)

### Arbitrum Networks
- **Arbitrum Sepolia Testnet** (Chain ID: 421614)
- **Arbitrum One Mainnet** (Chain ID: 42161)

## Configuration

### Required Environment Variables

```bash
# Primary RPC URL (required)
RPC_URL=https://rpc.sepolia.org

# Alternative RPC URL format
RPC_URL=https://rpc.sepolia.org
```

### Optional Environment Variables

```bash
# Network timeout for requests (default: 10000ms)
NETWORK_TIMEOUT=10000

# Health check interval for monitoring (default: 30000ms)
HEALTH_CHECK_INTERVAL=30000

# Chain ID for validation
CHAIN_ID=11155111
CHAIN_ID=11155111
```

## Advanced Parameters

### Timeout Control
```
Check network status with timeout 5000
```
Sets custom timeout for network requests (1000-30000ms).

### Metrics Control
```
Check network status without metrics
Check network status with no metrics
```
Skips detailed performance metrics collection.

### Peer Monitoring
```
Check network status with peer count
Check network status and peer count
```
Includes peer count monitoring and analysis.

### Chain Validation
```
Check network status skip chain id
Check network status no chain validation
```
Skips chain ID validation (useful for custom networks).

### Sync Monitoring
```
Check network status no sync check
Check network status skip sync
```
Skips synchronization status checking.

## Response Format

### Healthy Network Response
```
🔍 Network Status Check

✅ Status: HEALTHY

Network Information:
• Network: [Network Name] [Environment]
• Chain ID: [ID] ✅
• RPC URL: [URL]
• Connection: ✅ Connected

Performance Metrics:
• Response Time: [X]ms
• Block Height: [Height]
• Gas Price: [Price] gwei
• Sync Status: ✅ Synchronized
• Peer Count: ✅ [Count] (if requested)

🟢 Network is operating normally!
```

### Unhealthy Network Response
```
🔍 Network Status Check

❌ Status: UNHEALTHY

Network Information:
• Network: [Network Name] [Environment]
• Chain ID: [ID] ❌
• RPC URL: [URL]
• Connection: ❌ Disconnected

Errors:
❌ Connection failed: [Error details]
❌ Chain ID mismatch: expected [X], got [Y]

🔴 Network issues detected. Please check configuration and connectivity.
```

### With Warnings
```
🔍 Network Status Check

✅ Status: HEALTHY

[... network information ...]

Warnings:
⚠️ Low peer count detected
⚠️ Failed to get gas price

🟢 Network is operating normally!
```

## Error Handling

The feature handles various error conditions gracefully:

- **Connection Timeouts**: Configurable timeout with clear error messages
- **RPC Failures**: Graceful degradation with partial information
- **Chain ID Mismatches**: Clear validation errors with expected vs actual values
- **Missing Configuration**: Helpful error messages for missing RPC URLs
- **Network Congestion**: Warnings for slow response times
- **Sync Issues**: Detection and reporting of synchronization problems

## Integration

### Installation

```bash
saiso add check_network_status
```

### Dependencies

The feature automatically installs required dependencies:
- `ethers@^6.0.0` - Ethereum library for network communication

### Action Integration

The feature integrates as an ElizaOS action with the following properties:

- **Action Name**: `CHECK_NETWORK_STATUS`
- **Similes**: `NETWORK_STATUS`, `CHECK_NETWORK`, `NETWORK_HEALTH`, `NETWORK_CONNECTIVITY`
- **Validation**: Intelligent keyword and pattern matching
- **Handler**: Comprehensive network diagnostics with structured responses

## Technical Details

### Network Detection

The feature uses intelligent pattern matching to detect network status requests:

- **Keywords**: network, status, health, connectivity, check, monitor, diagnostics
- **Patterns**: "Is [network] working?", "Check [network] status", "Network health"
- **Context**: Combines multiple signals for accurate detection

### Performance Monitoring

- **Response Time**: Measures RPC endpoint latency
- **Block Height**: Current blockchain height
- **Gas Price**: Current network gas pricing
- **Sync Status**: Node synchronization with network
- **Peer Count**: Network connectivity metrics

### Health Assessment

The feature determines network health based on:

1. **Connectivity**: Can reach RPC endpoint
2. **Chain ID**: Matches expected network configuration
3. **Response Time**: Within acceptable thresholds
4. **Sync Status**: Node is synchronized
5. **Error Count**: No critical errors detected

## Troubleshooting

### Common Issues

1. **"RPC URL not configured"**
   - Set `RPC_URL` or `RPC_URL` environment variable
   - Verify URL format and accessibility

2. **"Connection timeout"**
   - Check network connectivity
   - Verify RPC endpoint is accessible
   - Increase timeout if needed

3. **"Chain ID mismatch"**
   - Verify `CHAIN_ID` matches network
   - Check if connected to correct network

4. **"Low peer count detected"**
   - Normal for some networks
   - May indicate connectivity issues
   - Check network configuration

### Performance Optimization

- Use appropriate timeout values for your network
- Enable peer checking only when needed
- Skip unnecessary metrics for faster responses
- Monitor network congestion during peak times

## Best Practices

1. **Regular Monitoring**: Check network status before important operations
2. **Timeout Configuration**: Set appropriate timeouts for your use case
3. **Error Handling**: Always check network health before transactions
4. **Performance Tracking**: Monitor response times for performance issues
5. **Multi-Network**: Test across different networks for reliability

## Support

For issues or questions about the Network Status Check feature:

1. Check the troubleshooting section above
2. Verify your network configuration
3. Test with different networks
4. Report issues with detailed error messages
