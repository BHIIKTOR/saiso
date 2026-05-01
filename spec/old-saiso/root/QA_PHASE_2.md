# SAISO QA Phase 2 - Integration Testing
## Detailed Test Execution Plan

**Document Version**: 1.0
**Created**: 2025-07-07
**Phase**: Integration Testing (Phase 2)
**Prerequisites**: Phase 1 Complete, QA_PHASE2_REQS.md satisfied
**Estimated Duration**: 2-3 hours

---

## Test Environment Setup

### **Pre-Test System Verification**
```bash
# 1. Verify system dependencies
node --version    # >=18.0.0
bun --version     # >=1.0.0
git --version     # Any recent version
which curl        # Required

# 2. Verify SAISO CLI
cd /home/bhiktor/DEV/saiso
bun run build
./packages/saiso-cli/dist/cli.js --version  # Should show 0.1.0

# 3. Create test workspace
mkdir -p /tmp/saiso-qa-phase2
cd /tmp/saiso-qa-phase2

# 4. Set up PATH for testing
export PATH="/home/bhiktor/DEV/saiso/packages/saiso-cli/dist:$PATH"
alias saiso="/home/bhiktor/DEV/saiso/packages/saiso-cli/dist/cli.js"
```

### **Network Connectivity Validation**
```bash
# Test SEI Testnet connectivity
curl -X POST https://evm-rpc-testnet.sei-apis.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# Expected: {"jsonrpc":"2.0","id":1,"result":"0xae3c3"}

# Test SEI Devnet connectivity
curl -X POST https://evm-rpc-devnet.sei-apis.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# Expected: {"jsonrpc":"2.0","id":1,"result":"0xae3c4"}
```

---

## Phase 2 Test Execution

### **Test Suite 1: Project Lifecycle Commands**

#### **Test 1.1: Basic Project Creation**
**Objective**: Verify `saiso new` creates projects with correct structure

```bash
# Test Case 1.1.1: Basic SEI project
saiso new qa-test-basic-$(date +%Y%m%d-%H%M%S) --env testnet --yes
cd qa-test-basic-*

# Validation
ls -la  # Check project structure
cat package.json | grep -E '"name"|"dependencies"'
cat .env.testnet | grep -E 'RPC_URL|CHAIN_ID'
cat tsconfig.json | grep '"target"'

# Expected Results:
# ✅ Project directory created
# ✅ package.json has correct dependencies
# ✅ .env.testnet has SEI testnet configuration
# ✅ TypeScript configuration present
# ✅ Git repository initialized

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________
**Performance**: _____ seconds

#### **Test 1.2: Environment-Specific Project Creation**
```bash
# Test Case 1.2.1: Devnet project
saiso new qa-test-devnet-$(date +%Y%m%d-%H%M%S) --env devnet --yes
cd qa-test-devnet-*

# Validation
cat .env.devnet | grep "713716"  # Should contain devnet chain ID
cat .env.devnet | grep "evm-rpc-devnet.sei-apis.com"

cd ..

# Test Case 1.2.2: Custom agent name and description
saiso new qa-test-custom-$(date +%Y%m%d-%H%M%S) \
  --env testnet \
  --agent-name "QATestAgent" \
  --description "Test agent for QA validation" \
  --yes

cd qa-test-custom-*

# Validation
cat package.json | grep "QATestAgent"
cat README.md | grep "Test agent for QA validation"

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

#### **Test 1.3: Feature Installation**
```bash
# Create base project for feature testing
saiso new qa-test-features-$(date +%Y%m%d-%H%M%S) --env testnet --yes
cd qa-test-features-*

# Test Case 1.3.1: Add gas estimation feature
saiso add gas_estimation

# Validation
ls src/features/  # Should contain gas_estimation
cat src/features/gas_estimation/action.ts | grep "GAS_ESTIMATION"
cat package.json | grep -A5 -B5 "dependencies"  # Check for new deps

# Test Case 1.3.2: Add multiple features
saiso add query_balance
saiso add check_network_status

# Validation
ls src/features/  # Should contain all three features
find src/features -name "*.ts" | wc -l  # Count feature files

# Test Case 1.3.3: Invalid feature (should fail gracefully)
saiso add nonexistent_feature
# Expected: Error message, no crash

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

#### **Test 1.4: Test Framework Integration**
```bash
# Create project for test framework testing
saiso new qa-test-testing-$(date +%Y%m%d-%H%M%S) --env testnet --yes
cd qa-test-testing-*

# Test Case 1.4.1: Add test templates
saiso test add --agent
saiso test add --mcp

# Validation
ls tests/  # Should contain test files
cat tests/agent.test.ts | grep "describe"
cat tests/mcp.test.ts | grep "test"

# Test Case 1.4.2: Run tests (basic compilation check)
bun install
bun test --dry-run  # Check if tests can be discovered

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

---

### **Test Suite 2: MCP Management Commands**

#### **Test 2.1: MCP Server Configuration**
```bash
# Create project for MCP testing
saiso new qa-test-mcp-$(date +%Y%m%d-%H%M%S) --env testnet --yes
cd qa-test-mcp-*

# Test Case 2.1.1: Add SEI server
saiso mcp add --name "qa-sei-server" --type sei --network testnet --auto-start

# Validation
ls .saiso/servers/  # Should contain server config
cat .saiso/servers/qa-sei-server.json | grep -E '"name"|"type"|"network"'

# Test Case 2.1.2: Add EVM server with custom port
saiso mcp add --name "qa-evm-server" --type evm --network sepolia --port 3005

# Validation
cat .saiso/servers/qa-evm-server.json | grep "3005"

# Test Case 2.1.3: List servers
saiso mcp list

# Expected output should show both servers
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

#### **Test 2.2: Server Lifecycle Management**
```bash
# Test Case 2.2.1: Start servers
saiso mcp start qa-sei-server

# Validation
saiso mcp list --status  # Should show server as running
netstat -tuln | grep 3001  # Default port should be in use

# Test Case 2.2.2: Server status check
saiso mcp status

# Expected: Detailed status of all servers

# Test Case 2.2.3: Stop server
saiso mcp stop qa-sei-server

# Validation
saiso mcp list --status  # Should show server as stopped
netstat -tuln | grep 3001  # Port should be free

# Test Case 2.2.4: Restart server
saiso mcp restart qa-sei-server

# Validation
saiso mcp list --status  # Should show server as running again

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

#### **Test 2.3: Multi-Server Concurrent Operation**
```bash
# Create project for multi-server testing
saiso new qa-test-multi-$(date +%Y%m%d-%H%M%S) --env testnet --yes
cd qa-test-multi-*

# Test Case 2.3.1: Configure multiple servers
saiso mcp add --name "server-1" --type sei --network testnet --port 3001
saiso mcp add --name "server-2" --type sei --network devnet --port 3002
saiso mcp add --name "server-3" --type utility --port 3003

# Test Case 2.3.2: Start all servers concurrently
saiso mcp start server-1 &
saiso mcp start server-2 &
saiso mcp start server-3 &
wait

# Validation
saiso mcp list --status  # All should be running
netstat -tuln | grep -E '300[1-3]'  # All ports should be in use
saiso mcp status --resources  # Check resource usage

# Test Case 2.3.3: Stop all servers
saiso mcp stop server-1
saiso mcp stop server-2
saiso mcp stop server-3

# Validation
saiso mcp list --status  # All should be stopped
netstat -tuln | grep -E '300[1-3]'  # No ports should be in use

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

---

### **Test Suite 3: Development Workflow Commands**

#### **Test 3.1: Configuration Management**
```bash
# Create project for config testing
saiso new qa-test-config-$(date +%Y%m%d-%H%M%S) --env testnet --yes
cd qa-test-config-*

# Test Case 3.1.1: Basic configuration display
saiso config

# Expected: Current configuration displayed

# Test Case 3.1.2: Configuration validation
saiso config --validate

# Expected: Validation results for current environment

# Test Case 3.1.3: Network connectivity test
saiso config --test-network

# Expected: Network connectivity test results

# Test Case 3.1.4: Get/Set operations
saiso config --get rpcUrl
saiso config --set agentName=QATestAgent
saiso config --get agentName

# Validation
cat .env.testnet | grep "QATestAgent"

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

#### **Test 3.2: Environment Switching**
```bash
# Create project for environment switching
saiso new qa-test-env-$(date +%Y%m%d-%H%M%S) --env testnet --yes
cd qa-test-env-*

# Test Case 3.2.1: Switch to devnet with backup
saiso switch-env devnet --backup

# Validation
cat .env | grep "713716"  # Should show devnet chain ID
ls .env.backup.*  # Backup file should exist

# Test Case 3.2.2: Dry run for mainnet switch
saiso switch-env mainnet --dry-run

# Expected: Preview of changes without applying

# Test Case 3.2.3: Switch back to testnet
saiso switch-env testnet

# Validation
cat .env | grep "713715"  # Should show testnet chain ID

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

#### **Test 3.3: System Status and Health**
```bash
# Test Case 3.3.1: System status
saiso status

# Expected: Overall system status

# Test Case 3.3.2: Health diagnostics
saiso health

# Expected: Comprehensive health check results

# Test Case 3.3.3: Status with running servers
cd qa-test-mcp-*
saiso mcp start qa-sei-server
saiso status
saiso health

# Expected: Status should reflect running server

saiso mcp stop qa-sei-server
cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

---

### **Test Suite 4: End-to-End Integration Scenarios**

#### **Test 4.1: Complete Project Workflow**
```bash
# Test Case 4.1.1: Full project lifecycle
PROJECT_NAME="qa-e2e-$(date +%Y%m%d-%H%M%S)"

# Step 1: Create project
saiso new $PROJECT_NAME --env testnet --agent-name "E2ETestAgent" --yes
cd $PROJECT_NAME

# Step 2: Add features
saiso add gas_estimation
saiso add query_balance

# Step 3: Add tests
saiso test add --agent --mcp

# Step 4: Configure MCP server
saiso mcp add --name "e2e-server" --type sei --network testnet --auto-start

# Step 5: Validate configuration
saiso config --validate
saiso config --test-network

# Step 6: Install dependencies and build
bun install
bun run build  # If build script exists

# Step 7: Test framework
bun test --dry-run

# Validation
ls -la  # Complete project structure
cat package.json | grep -E '"name"|"dependencies"'
ls src/features/  # Features installed
ls tests/  # Tests created
ls .saiso/servers/  # MCP server configured

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________
**Total Time**: _____ minutes

#### **Test 4.2: Multi-Environment Workflow**
```bash
# Test Case 4.2.1: Environment management workflow
PROJECT_NAME="qa-multi-env-$(date +%Y%m%d-%H%M%S)"

# Step 1: Create testnet project
saiso new $PROJECT_NAME --env testnet --yes
cd $PROJECT_NAME

# Step 2: Configure for testnet
saiso config --validate --env testnet
saiso mcp add --name "testnet-server" --type sei --network testnet

# Step 3: Switch to devnet
saiso switch-env devnet --backup
saiso config --validate --env devnet
saiso mcp add --name "devnet-server" --type sei --network devnet

# Step 4: Test both configurations
saiso config --test-network --env devnet
saiso switch-env testnet
saiso config --test-network --env testnet

# Step 5: Verify server configurations
saiso mcp list

# Validation
ls .env.backup.*  # Backup files exist
cat .env | grep "testnet"  # Currently on testnet
ls .saiso/servers/  # Both servers configured

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

---

### **Test Suite 5: Error Handling and Edge Cases**

#### **Test 5.1: Invalid Input Handling**
```bash
# Test Case 5.1.1: Invalid project names
saiso new ""  # Empty name
saiso new "invalid/name"  # Invalid characters
saiso new "existing-project" --yes  # Create twice

# Expected: Graceful error messages, no crashes

# Test Case 5.1.2: Invalid MCP configurations
cd qa-test-basic-*
saiso mcp add --name "" --type sei  # Empty name
saiso mcp add --name "test" --type invalid  # Invalid type
saiso mcp add --name "test" --port 99999  # Invalid port

# Expected: Validation errors, helpful messages

# Test Case 5.1.3: Invalid environment operations
saiso switch-env invalid  # Invalid environment
saiso config --set invalidformat  # Invalid set format

# Expected: Clear error messages

cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

#### **Test 5.2: Resource Constraint Testing**
```bash
# Test Case 5.2.1: Port conflict simulation
cd qa-test-multi-*

# Start server on port 3001
saiso mcp start server-1

# Try to start another server on same port (should fail or auto-assign)
saiso mcp add --name "conflict-server" --type sei --port 3001
saiso mcp start conflict-server

# Expected: Port conflict handled gracefully

saiso mcp stop server-1
cd ..
```

**Test Result**: [ ] PASS / [ ] FAIL
**Issues Found**: _______________

---

## Test Results Summary

### **Test Execution Log**

| Test Suite | Test Case | Status | Duration | Issues |
|------------|-----------|--------|----------|--------|
| 1.1 | Basic Project Creation | [ ] PASS/FAIL | ___s | _____ |
| 1.2 | Environment-Specific Creation | [ ] PASS/FAIL | ___s | _____ |
| 1.3 | Feature Installation | [ ] PASS/FAIL | ___s | _____ |
| 1.4 | Test Framework Integration | [ ] PASS/FAIL | ___s | _____ |
| 2.1 | MCP Server Configuration | [ ] PASS/FAIL | ___s | _____ |
| 2.2 | Server Lifecycle Management | [ ] PASS/FAIL | ___s | _____ |
| 2.3 | Multi-Server Operation | [ ] PASS/FAIL | ___s | _____ |
| 3.1 | Configuration Management | [ ] PASS/FAIL | ___s | _____ |
| 3.2 | Environment Switching | [ ] PASS/FAIL | ___s | _____ |
| 3.3 | System Status and Health | [ ] PASS/FAIL | ___s | _____ |
| 4.1 | Complete Project Workflow | [ ] PASS/FAIL | ___s | _____ |
| 4.2 | Multi-Environment Workflow | [ ] PASS/FAIL | ___s | _____ |
| 5.1 | Invalid Input Handling | [ ] PASS/FAIL | ___s | _____ |
| 5.2 | Resource Constraint Testing | [ ] PASS/FAIL | ___s | _____ |

### **Performance Metrics**

| Operation | Target | Actual | Status |
|-----------|--------|--------|--------|
| Project Creation | <30s | ___s | [ ] PASS/FAIL |
| MCP Server Startup | <10s | ___s | [ ] PASS/FAIL |
| Environment Switch | <5s | ___s | [ ] PASS/FAIL |
| Network RPC Call | <5s | ___s | [ ] PASS/FAIL |

### **Critical Issues Found**

**Priority 1 (Blocking):**
- [ ] Issue 1: ________________________________
- [ ] Issue 2: ________________________________

**Priority 2 (High):**
- [ ] Issue 1: ________________________________
- [ ] Issue 2: ________________________________

**Priority 3 (Medium):**
- [ ] Issue 1: ________________________________
- [ ] Issue 2: ________________________________

### **Test Environment Cleanup**
```bash
# Clean up all test artifacts
cd /tmp/saiso-qa-phase2

# Stop any running servers
pkill -f "mcp-server" 2>/dev/null || true

# Remove all test projects
rm -rf qa-test-*

# Clear environment variables
unset SEI_*_PRIVATE_KEY

# Verify cleanup
ls -la  # Should be empty or minimal
netstat -tuln | grep 300[0-9]  # No MCP ports in use
```

---

## Phase 2 Completion Criteria

### **Success Criteria**
Phase 2 is considered **SUCCESSFUL** when:

- [ ] **All Test Suites Pass**: 14/14 test cases completed successfully
- [ ] **Performance Targets Met**: All operations within acceptable time limits
- [ ] **No Critical Issues**: No P1 blocking issues identified
- [ ] **Integration Validated**: End-to-end workflows function correctly
- [ ] **Error Handling Verified**: System handles invalid inputs gracefully
- [ ] **Resource Management**: Multi-server scenarios work without conflicts

### **Failure Criteria**
Phase 2 is considered **FAILED** if:

- [ ] **Critical Functionality Broken**: Core commands don't work
- [ ] **System Crashes**: Unhandled exceptions or process crashes
- [ ] **Data Corruption**: Configuration files corrupted or lost
- [ ] **Resource Leaks**: Servers don't stop properly or ports remain allocated
- [ ] **Performance Regression**: Operations significantly slower than baseline

### **Next Steps**

**If Phase 2 PASSES:**
- [ ] Document all test results
- [ ] Update QA_CURRENTWORK.md with Phase 2 completion
- [ ] Proceed to Phase 3: Real Environment Testing

**If Phase 2 FAILS:**
- [ ] Document all critical issues
- [ ] Create bug reports with reproduction steps
- [ ] Fix critical issues before proceeding
- [ ] Re-run failed test cases

---

## Test Execution Notes

**Test Start Time**: _______________
**Test End Time**: _______________
**Total Duration**: _______________
**Tester**: _______________
**Environment**: Linux 6.1, Node v21.7.3, Bun 1.2.4
**SAISO Version**: 0.1.0

**Additional Notes:**
_________________________________
_________________________________
_________________________________

**Recommendations for Phase 3:**
_________________________________
_________________________________
_________________________________
