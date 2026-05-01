# Query Balance Feature

This feature enables your ETH agent to query balances for ETH tokens and ERC-20 tokens on the ETH network.

## Capabilities

- Query native ETH token balance for any address
- Query ERC-20 token balance for any address
- Use agent's own address when no address is specified
- Support for both testnet and mainnet
- Automatic token symbol and decimals detection

## Usage Examples

### Query Agent's Own Balance
```
User: "What is my ETH balance?"
Agent: "I'll check your ETH balance."
```

### Query Specific Address
```
User: "Check the balance of 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5"
Agent: "I'll check the balance for that address."
```

### Query Token Balance
```
User: "What is the USDC balance for 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5?"
Agent: "I'll check the USDC token balance for that address."
```

## Configuration

### Required Environment Variables
- `PRIVATE_KEY` - Required only when querying agent's own balance

### Optional Environment Variables
- `RPC_URL` - Custom RPC endpoint (defaults to testnet)

## Dependencies

This feature requires the following dependencies:
- `ethers` - For blockchain interactions

## Integration

The feature exports:
- `queryBalanceAction` - The main action for balance queries

## Error Handling

The feature handles common errors:
- Invalid addresses
- Network connectivity issues
- Invalid token contracts
- Missing private key when needed

## Response Format

```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "balance": "1.234567890123456789",
    "symbol": "ETH",
    "decimals": 18,
    "raw": "1234567890123456789"
  }
}
