# Interact Contract Feature

This feature enables your ETH agent to interact with smart contracts through both read-only calls and write transactions, with comprehensive gas optimization and error handling.

## Capabilities

- Execute read-only contract function calls
- Perform write transactions with gas optimization
- Support for custom ABI or automatic minimal ABI generation
- Comprehensive parameter handling for complex function calls
- Payable function support with ETH value transfers
- Multi-network support (testnet/mainnet)
- Retry logic with exponential backoff for network errors
- Result formatting for complex return values

## Usage Examples

### Read-Only Contract Calls
```
User: "Check the total supply of token at 0x123...abc"
Agent: "I'll check the total supply of that token contract."
```

### Write Transactions
```
User: "Call approve function on USDC contract for 100 tokens"
Agent: "I'll approve 100 USDC tokens for spending."
```

### Custom ABI Usage
```
User: "Execute custom contract function with ABI"
Agent: "I'll execute the contract function with the provided ABI."
```

## Configuration

### Required Environment Variables
- None (read-only calls work without private key)

### Optional Environment Variables
- `PRIVATE_KEY` - Required for write transactions
- `RPC_URL` - Custom RPC endpoint (defaults to testnet)

## Dependencies

This feature requires the following dependencies:
- `ethers` - For blockchain interactions and contract handling

## Integration

The feature exports:
- `interactContractAction` - The main action for contract interactions

## Advanced Features

### ABI Support
- **Custom ABI**: Provide full contract ABI as JSON string or object
- **Minimal ABI**: Automatic generation when no ABI provided
- **Function Detection**: Automatic read/write detection based on function type

### Gas Optimization
- Automatic gas estimation for write transactions
- 20% buffer for gas limit safety
- Custom gas price support for priority transactions
- Efficient gas usage optimization

### Parameter Handling
- Support for complex parameter types
- Automatic type conversion and validation
- Array and object parameter support
- BigInt handling for large numbers

### Result Formatting
- Automatic BigInt to string conversion
- Complex object formatting for display
- Array handling with proper indexing
- Nested object support

## Function Types

### Read-Only Functions
- No gas cost or private key required
- Instant execution and results
- Perfect for querying contract state
- Examples: `balanceOf`, `totalSupply`, `symbol`

### Write Functions
- Requires private key and gas
- Creates blockchain transactions
- Returns transaction hash and logs
- Examples: `transfer`, `approve`, `mint`

### Payable Functions
- Accepts ETH value with transaction
- Useful for deposits and payments
- Automatic value conversion
- Examples: `deposit`, `buyTokens`

## Error Scenarios

The feature handles common errors:
- Invalid contract addresses
- Function not found in contract
- Gas estimation failures
- Insufficient funds for transactions
- Network connectivity issues
- Contract execution reverts

## Response Format

### Read-Only Call Response
```json
{
  "success": true,
  "data": {
    "contractAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5",
    "functionName": "totalSupply",
    "parameters": [],
    "result": "1000000000000000000000000",
    "type": "read",
    "network": "testnet"
  }
}
```

### Write Transaction Response
```json
{
  "success": true,
  "data": {
    "contractAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5",
    "functionName": "approve",
    "parameters": ["0x123...abc", "1000000"],
    "txHash": "0xabcdef1234567890...",
    "gasUsed": "65000",
    "logs": [],
    "type": "write",
    "network": "testnet"
  }
}
```

## Testing

The feature includes comprehensive unit tests covering:
- Input validation scenarios
- Read-only contract calls
- Write transaction execution
- ABI parsing and handling
- Error handling and retry logic
- Gas optimization features
- Complex parameter and result handling

Run tests with:
```bash
bun test src/tests/interactContract.test.ts
```

## Dependencies on Other Features

This feature is foundational and can be used by:
- `swap_tokens` - For DEX contract interactions
- `stake_tokens` - For staking contract calls
- `governance_vote` - For governance contract interactions
- `nft_operations` - For NFT contract functions

## Network Support

- **Testnet**: `https://rpc.sepolia.org`
- **Mainnet**: `https://eth.llamarpc.com`
- **Custom RPC**: Configurable via `RPC_URL`

## Gas Costs

Typical gas usage varies by function:
- Simple read calls: 0 gas (free)
- Token transfers: ~65,000 gas
- Complex contract calls: 100,000+ gas
- Gas price: Dynamic based on network conditions

## Security Features

- Address validation using ethers.js
- ABI validation and parsing
- Parameter type checking
- Transaction confirmation waiting
- Private key protection for write operations
- Retry logic with smart error detection

## Common Use Cases

1. **Token Operations**: Check balances, approve transfers, transfer tokens
2. **DeFi Interactions**: Swap tokens, provide liquidity, stake assets
3. **NFT Operations**: Mint, transfer, query metadata
4. **Governance**: Vote on proposals, delegate voting power
5. **Custom Contracts**: Any smart contract interaction
