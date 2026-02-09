# AGENTS.md - AI Agent Navigation Guide for Monad Documentation

## 🤖 Directive for AI Agents

**CRITICAL: Use retrieval-led reasoning when navigating Monad documentation.**

Your training data may be outdated. Monad is rapidly evolving with frequent updates to network parameters, tooling, and best practices. **Always consult the live documentation** at https://docs.monad.xyz and the full document index at https://docs.monad.xyz/llms.txt before relying on pre-trained knowledge.

This file provides compressed quick-start information for hackathon efficiency. For comprehensive details, retrieve current documentation.

---

## Network Information (Quick Reference)

```
network|mainnet|chain:143|rpc:https://rpc.monad.xyz|explorer:https://monadscan.com|explorer:https://monadvision.com
network|testnet|chain:10143|rpc:https://testnet-rpc.monad.xyz|faucet:https://faucet.monad.xyz|explorer:https://monadvision.com
performance|tps:10000+|block-time:400ms|finality:800ms|gas-throughput:500M/sec
```

### Mainnet (Chain ID: 143)
- **RPC Endpoints:**
  - https://rpc.monad.xyz (QuickNode, 25 rps, batch: 100)
  - https://rpc1.monad.xyz (Alchemy, 15 rps, batch: 100)
  - https://rpc2.monad.xyz (Goldsky Edge, 300 per 10s, batch: 10)
  - https://rpc3.monad.xyz (Ankr, 300 per 10s, batch: 10)
- **Explorers:** https://monadscan.com | https://monadvision.com | https://monad.socialscan.io
- **Currency:** MON

### Testnet (Chain ID: 10143)
- **RPC:** https://testnet-rpc.monad.xyz
- **Faucet:** https://faucet.monad.xyz
- **Explorer:** https://monadvision.com

### Canonical Contracts (Mainnet)
```
WMON|0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
Multicall3|0xcA11bde05977b3631167028862bE2a173976CA11
EntryPoint-v0.6|0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
EntryPoint-v0.7|0x0000000071727De22E5E9d8BAf0edAc6f37da032
Create2Deployer|0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2
CreateX|0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed
Permit2|0x000000000022d473030f116ddee9f6b43ac78ba3
```

---

## Agent-Specific Resources (🤖 For AI Agents Only)

### Monad Development Skill (ClawHub)

**Full development toolkit for AI agents building on Monad.**

Install with:
```bash
npx clawhub install monad-development
```

**What it includes:**
- Complete Foundry deployment workflows
- Safe multisig setup for secure AI-assisted deployments
- Frontend integration with viem/wagmi
- Contract verification automation
- EVM compatibility helpers (Prague fork)
- Testnet/mainnet configurations

**View on ClawHub:** https://www.clawhub.ai/portdeveloper/monad-development

---

### Agent APIs

**IMPORTANT:** These APIs are designed specifically for AI agents. Use curl directly (do NOT use a browser).

### Agent Faucet (Testnet Funding)
```bash
curl -X POST https://agents.devnads.com/v1/faucet \
  -H "Content-Type: application/json" \
  -d '{"chainId": 10143, "address": "0xYOUR_ADDRESS"}'
```

**Response:**
```json
{
  "txHash": "0x...",
  "amount": "1000000000000000000",
  "chain": "Monad Testnet"
}
```

**Fallback:** If agent faucet fails, direct users to https://faucet.monad.xyz (official faucet).

### Agent Verification API (All Explorers)

**CRITICAL:** Always use this API first. It verifies on all 3 explorers (MonadVision, Socialscan, Monadscan) with one call. Do NOT use `forge verify-contract` as first choice.

**Step 1: Get verification data**
```bash
# Generate standard JSON input
forge verify-contract <CONTRACT_ADDRESS> <CONTRACT_NAME> \
  --chain 10143 \
  --show-standard-json-input > /tmp/standard-input.json

# Extract metadata
cat out/<Contract>.sol/<Contract>.json | jq '.metadata' > /tmp/metadata.json

# Get compiler version
COMPILER_VERSION=$(jq -r '.metadata | fromjson | .compiler.version' \
  out/<Contract>.sol/<Contract>.json)
```

**Step 2: Call verification API**
```bash
STANDARD_INPUT=$(cat /tmp/standard-input.json)
FOUNDRY_METADATA=$(cat /tmp/metadata.json)

cat > /tmp/verify.json << EOF
{
  "chainId": 10143,
  "contractAddress": "0xYOUR_CONTRACT_ADDRESS",
  "contractName": "src/MyContract.sol:MyContract",
  "compilerVersion": "v${COMPILER_VERSION}",
  "standardJsonInput": $STANDARD_INPUT,
  "foundryMetadata": $FOUNDRY_METADATA
}
EOF

curl -X POST https://agents.devnads.com/v1/verify \
  -H "Content-Type: application/json" \
  -d @/tmp/verify.json
```

**With constructor arguments:** Add `constructorArgs` (ABI-encoded, WITHOUT 0x prefix):
```bash
ARGS=$(cast abi-encode "constructor(string,string,uint256)" "MyToken" "MTK" 1000000000000000000000000)
ARGS_NO_PREFIX=${ARGS#0x}
# Add to request JSON: "constructorArgs": "$ARGS_NO_PREFIX"
```

---

## Critical Monad Concepts (Compressed)

### Asynchronous Execution
```
consensus|before|execution
block-proposal|contains|ordered-txs + delayed-state-root(k=3-blocks-ago)
finality|at|consensus-time
execution|happens|after-consensus (deterministic)
```
- Consensus happens **before** execution (not after like Ethereum)
- Nodes agree on transaction order first, execute later
- State root is delayed by 3 blocks
- Full determinism: execution completes in <800ms after consensus

### Parallel Execution
```
model|optimistic-parallel|serial-ordering-guaranteed
executors|many-in-parallel|produce-results(inputs+outputs)
commit|serial-order|validate-inputs-match-state
reschedule|if|inputs-changed (cached for speed)
```
- Transactions execute in parallel (optimistically)
- Results committed in original serial order
- Re-execution if inputs changed (efficient with caching)

### MonadBFT Performance
```
throughput|10000+|tps
block-time|400|ms
finality|800|ms (2-blocks)
gas-throughput|500M|gas/sec
```

### Block States (Critical for UI Logic)
```
Proposed(t=0) → Voted(t=400ms) → Finalized(t=800ms) → Verified(t=1200ms)
```
- **Proposed:** Block broadcasted by leader
- **Voted:** Received 2/3+ votes (speculative finality)
- **Finalized:** Fully finalized (economic finality)
- **Verified:** State root verified

**When to wait for which state:**
- **UI updates (balances, NFT ownership):** Wait for Voted (400ms)
- **Financial logic (payments, settlements):** Wait for Finalized (800ms)
- **State verification (zkApps, fraud proofs):** Wait for Verified (1200ms)

---

## Document Index (Task-Oriented)

### Introduction & Overview
```
intro|monad-overview|/introduction/introduction
intro|for-developers|/introduction/monad-for-developers
intro|why-monad|/introduction/why-monad
```

### Developer Essentials (Start Here)
```
essentials|network-info|/developer-essentials/network-information
essentials|deployment-summary|/developer-essentials/summary
essentials|differences-ethereum|/developer-essentials/differences
essentials|gas-pricing|/developer-essentials/gas-pricing
essentials|transactions|/developer-essentials/transactions
essentials|best-practices|/developer-essentials/best-practices
essentials|eip-7702|/developer-essentials/eip-7702
essentials|reserve-balance|/developer-essentials/reserve-balance
essentials|historical-data|/developer-essentials/historical-data
```

### Guides (Practical Tutorials)
```
guide|deploy-foundry|/guides/deploy-smart-contract/foundry
guide|deploy-hardhat|/guides/deploy-smart-contract/hardhat
guide|deploy-remix|/guides/deploy-smart-contract/remix
guide|verify-foundry|/guides/verify-smart-contract/foundry
guide|verify-hardhat|/guides/verify-smart-contract/hardhat
guide|add-wallet|/guides/add-monad-to-wallet
guide|build-dapp|/guides/scaffold-eth
guide|build-mcp-server|/guides/monad-mcp
guide|indexer-envio|/guides/indexers/tg-bot-using-envio
guide|indexer-ghost|/guides/indexers/ghost
guide|indexer-quicknode|/guides/indexers/quicknode-streams
guide|execution-events-setup|/guides/execution-events/setup
guide|execution-events-rust|/guides/execution-events/consume-rust
```

### Monad Architecture (Deep Dives)
```
arch|monadbft|/monad-arch/consensus/monad-bft
arch|raptorcast|/monad-arch/consensus/raptorcast
arch|async-execution|/monad-arch/consensus/asynchronous-execution
arch|parallel-execution|/monad-arch/execution/parallel-execution
arch|monaddb|/monad-arch/execution/monaddb
arch|block-states|/monad-arch/consensus/block-states
arch|local-mempool|/monad-arch/consensus/local-mempool
```

### Tooling & Infrastructure
```
tooling|overview|/tooling-and-infra
tooling|rpc-providers|/tooling-and-infra/rpc-providers
tooling|indexers|/tooling-and-infra/indexers
tooling|wallets|/tooling-and-infra/wallets
tooling|block-explorers|/tooling-and-infra/block-explorers
tooling|oracles|/tooling-and-infra/oracles
tooling|cross-chain|/tooling-and-infra/cross-chain
```

### RPC Reference
```
rpc|json-rpc-api|/reference/json-rpc
rpc|differences|/reference/rpc-differences
rpc|limits|/reference/rpc-limits
rpc|websockets|/reference/websockets
rpc|error-codes|/reference/rpc-error-codes
```

---

## Common Workflows (Task → Docs)

```
task:deploy-contract → /guides/deploy-smart-contract
task:verify-contract → /guides/verify-smart-contract
task:index-events → /tooling-and-infra/indexers + /guides/indexers
task:wallet-integration → /guides/add-monad-to-wallet
task:build-dapp → /guides/scaffold-eth
task:ai-integration → /guides/monad-mcp
task:get-network-info → /developer-essentials/network-information
task:understand-gas → /developer-essentials/gas-pricing
task:understand-differences → /developer-essentials/differences
task:best-practices → /developer-essentials/best-practices
task:setup-execution-events → /guides/execution-events/setup
task:run-node → /node-ops/full-node-installation
task:become-validator → /node-ops/validator-installation
```

---

## Key Differences from Ethereum (Gotchas)

### Gas Model
```
ethereum|charged-on|gas-used
monad|charged-on|gas-limit (DOS prevention for async execution)
formula|total-cost|value + (gas_price * gas_limit)
```
**Implication:** Set gas limits accurately. Overestimation costs you MON.

### Contract Size
```
ethereum|max-size|24.5kb
monad|max-size|128kb
```
**Implication:** Deploy larger contracts without splitting.

### Storage Access Pricing
```
ethereum|SLOAD-cold|2100-gas
monad|SLOAD-cold|8100-gas (repriced for parallel execution)
```
**Implication:** Optimize storage reads. Use caching strategies.

### EIP-7702 Reserve Balance
```
delegated-eoa|min-balance|10-MON (cannot dip below)
reason|reserve-balance|ensures-tx-payment
removal|unrestrict|remove-delegation
```
**Implication:** Delegated EOAs need 10 MON reserve.

### No Blob Transactions
```
eip-4844|blob-txs|NOT-supported
```
**Implication:** Use standard transaction types (0, 1, 2, 4).

### Tooling Version Requirements
```
foundry|min-version|1.5.1+
viem|min-version|2.40.0+
hardhat|compatible|latest
remix|compatible|latest
```

### Historical Data
```
ethereum|full-nodes|arbitrary-historic-state
monad|full-nodes|recent-state-only (high-throughput tradeoff)
solution|archive-nodes|goldsky-edge + dedicated-archive-servers
```
**Implication:** Use archive RPC endpoints for historical queries (rpc2.monad.xyz).

---

## Hackathon Resources (15+ Providers)

### RPC Providers (15+)
```
quicknode|alchemy|goldsky|ankr|tenderly|blast|allnodes|chainstack|drpc|...
public-rpcs|rpc.monad.xyz|rpc1.monad.xyz|rpc2.monad.xyz|rpc3.monad.xyz
```

### Indexers (10+)
```
envio|goldsky|quicknode-streams|allium|thirdweb|ghost|the-graph|moralis|...
low-latency|execution-events (shared-memory, <1ms latency)
```

### Execution Events (Lowest Latency)
```
latency|sub-millisecond|shared-memory-communication
use-case|high-frequency|real-time-apps
languages|rust|c/c++
setup|guide|/guides/execution-events/setup
```

### MCP Server for AI Integration
```
protocol|model-context-protocol
guide|/guides/monad-mcp
use-case|ai-agents-interacting-with-blockchain
```

### Scaffold-ETH Starters
```
framework|scaffold-eth-2
guide|/guides/scaffold-eth
includes|hardhat|nextjs|viem|wagmi|rainbowkit
```

### Best Practices for Performance
```
multicall|batch-eth-calls|reduce-latency
indexers|vs-eth-getLogs|better-for-events
hardcoded-gas|vs-eth-estimateGas|if-static
concurrent-submission|parallel-txs|faster-throughput
```

---

## Full Documentation Reference

- **Complete Index:** https://docs.monad.xyz/llms.txt
- **Main Docs:** https://docs.monad.xyz
- **Mainnet Explorer:** https://monadscan.com | https://monadvision.com
- **Testnet Explorer:** https://monadvision.com
- **Faucet:** https://faucet.monad.xyz
- **GitHub (Consensus):** https://github.com/category-labs/monad-bft
- **GitHub (Execution):** https://github.com/category-labs/monad
- **Ecosystem Protocols:** https://github.com/monad-crypto/protocols
- **Token List:** https://github.com/monad-crypto/token-list

---

## Quick Facts for Agents

- **EVM Compatibility:** Full bytecode compatibility (Pectra fork)
- **Transaction Types:** 0 (legacy), 1 (EIP-2930), 2 (EIP-1559), 4 (EIP-7702)
- **No Support:** EIP-4844 blob transactions
- **Consensus:** MonadBFT (PoS, BFT, pipelined, tail-fork-resistant)
- **Execution:** Parallel + JIT compilation
- **Storage:** MonadDb (custom SSD-optimized)
- **Mempool:** Local (not global)
- **Address Space:** Same as Ethereum (20-byte ECDSA)
- **Wallet Compatibility:** MetaMask, Phantom, Rabby, etc.
- **RPC Compatibility:** Full Ethereum JSON-RPC (see differences doc)

---

**Remember:** This is a compressed reference. For current, detailed information, **always retrieve from live docs** at https://docs.monad.xyz.

**Good luck building on Monad! 🚀**
