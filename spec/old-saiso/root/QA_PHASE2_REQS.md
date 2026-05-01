# SAISO QA Phase 2 Requirements

## Integration Testing Prerequisites

**Document Version**: 1.0
**Created**: 2025-07-07
**Phase**: Integration Testing (Phase 2)
**Estimated Duration**: 2-3 hours

---

## 1. System Dependencies

### **1.1 Required Software**

✅ **Node.js**: >=18.0.0 (Current: v21.7.3)
✅ **Bun**: >=1.0.0 (Current: 1.2.4)
✅ **Git**: Required for project initialization
✅ **TypeScript**: ^5.0.0 (via project dependencies)

### **1.2 System Verification Commands**

```bash
# Verify all dependencies before starting Phase 2
node --version    # Should be >=18.0.0
bun --version     # Should be >=1.0.0
git --version     # Any recent version
which curl        # Required for network testing
```

### **1.3 SAISO CLI Build Status**

✅ **CLI Build**: Must be completed and working
✅ **Phase 1**: Must be completed successfully
✅ **Critical Issues**: Must be resolved (timeout fixes applied)

---

## 2. Network Connectivity Requirements

### **2.1 Testnet RPC Endpoints**

**Primary Networks for Testing:**

| Network  | Environment | RPC URL                                 | Chain ID | Status     |
| -------- | ----------- | --------------------------------------- | -------- | ---------- |
| SEI      | Testnet     | `https://evm-rpc-testnet.sei-apis.com`  | 713715   | Required   |
| SEI      | Devnet      | `https://evm-rpc-devnet.sei-apis.com`   | 713716   | Required   |
| Ethereum | Sepolia     | `https://sepolia.infura.io/v3/YOUR_KEY` | 11155111 | Optional\* |
| Polygon  | Mumbai      | `https://rpc-mumbai.maticvigil.com`     | 80001    | Optional\* |

\*Optional networks for extended testing if time permits

### **2.2 Network Connectivity Tests**

```bash
# Pre-test network validation
curl -X POST https://evm-rpc-testnet.sei-apis.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

curl -X POST https://evm-rpc-devnet.sei-apis.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

**Expected Response**: Chain ID should match configuration (713715 for testnet, 713716 for devnet)

### **2.3 Faucet Access**

**SEI Testnet Faucets:**

- Primary: `https://faucet.sei-apis.com`
- Secondary: `https://atlantic-2.app.sei.io/faucet`

**SEI Devnet Faucets:**

- Primary: `https://faucet-devnet.sei-apis.com`

---

## 3. Test Token Requirements

### **3.1 Test Wallet Setup**

**Required for Transaction Testing:**

- [ ] Generate fresh test private keys (DO NOT use mainnet keys)
- [ ] Acquire test tokens from faucets
- [ ] Verify wallet balance before testing

### **3.2 Test Token Amounts Needed**

**Per Test Environment:**

- **SEI Testnet**: 10 SEI minimum (for gas and transfer tests)
- **SEI Devnet**: 10 SEI minimum (for gas and transfer tests)

### **3.3 Private Key Generation**

```bash
# Generate test private keys (save securely for testing)
# Method 1: Using Node.js crypto
node -e "console.log('0x' + require('crypto').randomBytes(32).toString('hex'))"

# Method 2: Using OpenSSL
openssl rand -hex 32 | sed 's/^/0x/'
```

**⚠️ SECURITY NOTES:**

- Never use mainnet private keys for testing
- Generate fresh keys for each test session
- Delete test keys after QA completion
- Never commit private keys to version control

---

## 4. Environment Setup Requirements

### **4.1 Test Workspace Preparation**

```bash
# Create isolated test workspace
mkdir -p /tmp/saiso-qa-phase2
cd /tmp/saiso-qa-phase2

# Verify SAISO CLI access
which saiso || echo "SAISO CLI not in PATH - run from project directory"
```

### **4.2 Port Allocation Requirements**

**MCP Server Port Range**: 3001-3100
**Default Ports Used:**

- MCP Server 1: 3001
- MCP Server 2: 3002
- MCP Server 3: 3003
- Auto-assigned: 3004+

**Port Conflict Check:**

```bash
# Check for port conflicts before testing
netstat -tuln | grep -E ':(300[1-9]|30[1-9][0-9]|3100)'
```

### **4.3 Environment Variables Template**

```bash
# Test environment variables (create .env.test)
export SEI_TESTNET_PRIVATE_KEY="0x..."
export SEI_DEVNET_PRIVATE_KEY="0x..."
export SEI_TESTNET_RPC_URL="https://evm-rpc-testnet.sei-apis.com"
export SEI_DEVNET_RPC_URL="https://evm-rpc-devnet.sei-apis.com"
```

---

## 5. Test Data and Artifacts

### **5.1 Test Project Naming Convention**

```
qa-test-basic-YYYYMMDD-HHMMSS
qa-test-sei-YYYYMMDD-HHMMSS
qa-test-evm-YYYYMMDD-HHMMSS
qa-test-multi-server-YYYYMMDD-HHMMSS
```

### **5.2 Cleanup Requirements**

**After Each Test:**

- [ ] Stop all MCP servers
- [ ] Remove test project directories
- [ ] Clear port allocations
- [ ] Reset environment variables

**Cleanup Commands:**

```bash
# Stop any running MCP servers
pkill -f "mcp-server"

# Remove test projects
rm -rf /tmp/saiso-qa-phase2/qa-test-*

# Clear port allocations
# (Ports automatically released when processes stop)
```

---

## 6. Performance and Resource Requirements

### **6.1 System Resources**

**Minimum Requirements:**

- **RAM**: 2GB available (for multiple MCP servers)
- **CPU**: 2 cores (for concurrent operations)
- **Disk**: 1GB free space (for test projects)
- **Network**: Stable internet connection

### **6.2 Performance Baselines**

**Acceptable Response Times:**

- Project Creation: < 30 seconds
- MCP Server Startup: < 10 seconds
- Network RPC Calls: < 5 seconds
- Environment Switching: < 5 seconds

### **6.3 Resource Monitoring**

```bash
# Monitor system resources during testing
top -p $(pgrep -f saiso)
netstat -tuln | grep 300[0-9]
df -h /tmp
```

---

## 7. Pre-Test Validation Checklist

### **7.1 System Readiness**

- [ ] All dependencies installed and verified
- [ ] SAISO CLI built and accessible
- [ ] Phase 1 completed successfully
- [ ] Network connectivity confirmed
- [ ] Test workspace prepared

### **7.2 Network Readiness**

- [ ] SEI testnet RPC responding
- [ ] SEI devnet RPC responding
- [ ] Faucets accessible
- [ ] Test tokens acquired
- [ ] Private keys generated and secured

### **7.3 Environment Readiness**

- [ ] Port range available (3001-3100)
- [ ] Environment variables configured
- [ ] Test workspace clean
- [ ] Resource monitoring ready

---

## 8. Test Execution Prerequisites

### **8.1 Before Starting Phase 2**

1. **Complete Phase 1**: Ensure all Phase 1 tests passed
2. **System Check**: Run all verification commands
3. **Network Check**: Validate all RPC endpoints
4. **Token Setup**: Acquire test tokens for all networks
5. **Workspace Setup**: Prepare clean test environment

### **8.2 During Testing**

1. **Isolation**: Each test should start with clean state
2. **Monitoring**: Track resource usage and performance
3. **Documentation**: Record all test results and issues
4. **Cleanup**: Clean up after each test scenario

### **8.3 Success Criteria**

**Phase 2 is considered successful when:**

- [ ] All project lifecycle commands work end-to-end
- [ ] All MCP management commands function correctly
- [ ] All development workflow commands integrate properly
- [ ] Multi-server scenarios work concurrently
- [ ] Environment switching works reliably
- [ ] Real network transactions succeed (with test tokens)
- [ ] No critical errors or system crashes
- [ ] Performance meets baseline requirements

---

## 9. Risk Mitigation

### **9.1 Network Dependencies**

**Risk**: Testnet RPC endpoints may be unreliable
**Mitigation**: Test multiple endpoints, have backup RPC URLs ready

### **9.2 Test Token Availability**

**Risk**: Faucets may be rate-limited or unavailable
**Mitigation**: Acquire tokens in advance, use multiple faucet sources

### **9.3 Port Conflicts**

**Risk**: System ports may be in use
**Mitigation**: Check port availability before testing, use dynamic allocation

### **9.4 Resource Exhaustion**

**Risk**: Multiple MCP servers may consume excessive resources
**Mitigation**: Monitor resource usage, limit concurrent servers

---

## 10. Emergency Procedures

### **10.1 Test Environment Recovery**

```bash
# Emergency cleanup if tests hang or fail
pkill -f saiso
pkill -f mcp-server
rm -rf /tmp/saiso-qa-phase2/*
unset SEI_*_PRIVATE_KEY
```

### **10.2 Network Issues**

```bash
# Test alternative RPC endpoints if primary fails
curl -X POST https://evm-rpc-testnet.sei-apis.com/health
curl -X POST https://evm-rpc-devnet.sei-apis.com/health
```

### **10.3 Critical Failure Response**

1. **Stop all processes**: Kill any hanging commands
2. **Document issue**: Record exact error and steps to reproduce
3. **Clean environment**: Reset to known good state
4. **Report**: Update QA documentation with findings
5. **Escalate**: If blocking issues found, halt testing and fix

---

## Summary

Phase 2 testing requires a properly configured environment with network access, test tokens, and system resources. All prerequisites must be met before beginning integration testing. The focus is on validating that all SAISO commands work correctly in real-world scenarios with actual blockchain networks.

**Next Step**: Once all requirements are met, proceed to execute the detailed test plan in `QA_PHASE_2.md`.
