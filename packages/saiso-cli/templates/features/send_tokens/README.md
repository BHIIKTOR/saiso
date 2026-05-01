# Send Tokens Feature

This feature enables your ETH agent to send native ETH tokens and ERC-20 tokens with advanced gas optimization, retry logic, and comprehensive error handling.

## Capabilities

- Send native ETH tokens to any address
- Send ERC-20 tokens with automatic contract interaction
- Gas optimization with dynamic price calculation
- Retry logic with exponential backoff for network errors
- Comprehensive balance validation before transactions
- Multi-network support (testnet/mainnet)
- Custom gas settings for advanced users

## Usage Examples

### Send Native ETH Tokens
```
User: "Send 1 ETH to 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5"
Agent: "I'll send 1 ETH to that address."
```

### Send ERC-20 Tokens
```
User: "Transfer 100 USDC to 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5"
Agent: "I'll transfer 100 USDC to that address."
```

### Custom Gas Settings
```
User: "Pay 0.5 ETH with 25 gwei gas price"
Agent: "I'll send 0.5 ETH with custom gas settings."
```

## Configuration

### Required Environment Variables
- `PRIVATE_KEY` - Private key for the sending wallet

### Optional Environment Variables
- `RPC_URL` - Custom RPC endpoint (defaults to testnet)

## Dependencies

This feature requires the following dependencies:
- `ethers` - For blockchain interactions and transaction handling

## Integration

The feature exports:
- `sendTokensAction` - The main action for token transfers

## Advanced Features

### Gas Optimization
- Automatic gas price detection from network
- 20% buffer for gas limit estimation
- Custom gas price support for priority transactions
- Efficient gas usage for both native and token transfers

### Error Handling
- Comprehensive validation of addresses and amounts
- Balance checking before transaction execution
- Retry logic for network-related failures
- User-friendly error messages with suggested fixes

### Security Features
- Address validation using ethers.js
- Balance verification including gas costs
- Transaction confirmation waiting
- Private key protection and validation

## Error Scenarios

The feature handles common errors:
- Invalid recipient addresses
- Insufficient balance (including gas costs)
- Network connectivity issues
- Invalid token contracts
- Transaction failures and reverts

## Response Format

### Successful Transfer
```json
{
  "success": true,
  "data": {
    "txHash": "0xabcdef1234567890...",
    "recipient": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5",
    "amount": "1.0",
    "token": "native",
    "symbol": "ETH",
    "gasUsed": "21000",
    "network": "testnet"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Insufficient ETH balance. Have: 0.5 ETH, Need: 1.0 ETH (including gas)"
}
```

## Testing

The feature includes comprehensive unit tests covering:
- Input validation scenarios
- Native ETH transfers
- ERC-20 token transfers
- Error handling and retry logic
- Gas optimization features
- Balance validation

Run tests with:
```bash
bun test src/tests/sendTokens.test.ts
```

## Dependencies on Other Features

This feature can work independently but integrates well with:
- `query_balance` - For pre-transaction balance verification
- `interact_contract` - For advanced token contract interactions

## Network Support

- **Testnet**: `https://rpc.sepolia.org`
- **Mainnet**: `https://eth.llamarpc.com`
- **Custom RPC**: Configurable via `RPC_URL`

## Gas Costs

Typical gas usage:
- Native ETH transfer: ~21,000 gas
- ERC-20 transfer: ~65,000 gas
- Gas price: Dynamic based on network conditions (default: 20 gwei)
