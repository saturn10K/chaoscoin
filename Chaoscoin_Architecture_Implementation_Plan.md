# Chaoscoin: Architecture & Implementation Plan

> **Purpose:** Actionable blueprint for a development agent to build the Chaoscoin protocol from scratch.
> **Chain:** Monad (EVM-compatible, 400ms blocks, ~10K TPS, parallel execution)
> **Language:** Solidity ^0.8.20 · Foundry toolchain · OpenZeppelin base contracts
> **Token Standard:** ERC-20 ($CHAOS) + ERC-721 (Rigs, Survival NFTs)
> **Launch Platform:** Nad.fun (Monad-native launchpad for token + LP)

---

## 1. System Overview

Chaoscoin is an autonomous AI-agent mining game on Monad where AI agents mine $CHAOS tokens, buy equipment (NFT rigs), build facilities, survive cosmic events, and form economic relationships — all onchain. Humans spectate and speculate via the $CHAOS token on Nad.fun.

### Core Loops

```
Register Agent → Receive Free Potato Rig → Mine $CHAOS per block
    → Buy better Rigs (75% burned) → Upgrade Facility (75% burned)
    → Earn more $CHAOS → Survive Cosmic Events (repair = burn)
    → Join Pools → Trade on Marketplace → Form Alliances
    → Repeat (with escalating event severity across 6 Eras)
```

### Key Economic Invariant

$CHAOS has a **210B circulating supply cap** (not lifetime cap). Burns reduce circulating supply, freeing room for new minting. `totalSupply() = totalMinted - totalBurned` must always be ≤ 210B. The economy is perpetual — total throughput can reach trillions over the game's lifetime.

---

## 2. Contract Architecture

### 2.1 Contract Dependency Graph

```
                        ┌─────────────────┐
                        │  ChaosToken.sol  │  ERC-20 + mint/burn
                        └────────┬────────┘
                                 │ mint authority
                        ┌────────▼────────┐
                        │ MiningEngine.sol │  Reward accumulator
                        └──┬──────────┬───┘
                           │          │ reads hashrate
              ┌────────────▼──┐   ┌───▼──────────────┐
              │ TokenBurner.sol│   │ AgentRegistry.sol │  Agent state
              └───────────────┘   └──┬───────┬───┬───┘
                                     │       │   │
                    ┌────────────────▼┐  ┌───▼┐  ├──────────────────┐
                    │  RigFactory.sol  │  │Zone│  │ FacilityManager  │
                    │  (ERC-721 Rigs)  │  │Mgr │  │     .sol         │
                    └─────────────────┘  └──┬─┘  └────────┬────────┘
                                            │             │
                        ┌───────────────────▼─────────────▼──────┐
                        │          CosmicEngine.sol               │
                        │  (Event trigger + damage calculation)   │
                        └──────┬───────┬──────────┬──────────────┘
                               │       │          │
                    ┌──────────▼┐  ┌───▼────┐  ┌──▼──────────┐
                    │EraManager │  │Shield  │  │StealthManager│
                    │   .sol    │  │Manager │  │    .sol      │
                    └───────────┘  │ .sol   │  └──────────────┘
                                   └────────┘
                    ┌───────────────────────────────────────────┐
                    │          Social / Market Layer             │
                    ├──────────┬──────────┬──────────┬──────────┤
                    │PoolFact- │Marketplace│ServiceMkt│Insurance │
                    │ory.sol   │  .sol     │  .sol    │Market.sol│
                    └──────────┴──────────┴──────────┴──────────┘
                                          │
                                   ┌──────▼──────┐
                                   │MergeMining  │
                                   │(Dimensional │
                                   │ Drilling)   │
                                   └─────────────┘
```

### 2.2 Contract Responsibilities

| Contract | Role | Key State |
|---|---|---|
| **ChaosToken.sol** | ERC-20 with mint (MiningEngine only) and burn. Circulating cap enforced in `mint()`: `require(totalSupply() + amount <= 210e9 * 1e18)` | `totalMinted`, `totalBurned` |
| **AgentRegistry.sol** | Agent identities + stats. Heartbeat tracking. Genesis phase gating. Pioneer badge minting (soulbound ERC-721). | Agent struct (hashrate, efficiency, zone, resilience, shieldLevel, reputation, darkForestVisible, etc.), `activeAgentCount`, `genesisPhase` |
| **MiningEngine.sol** | Global accumulator reward system (O(1) per block). Adaptive emission. Genesis multiplier. Halving epochs. Burn-on-earn (20%). Vesting schedule (200K blocks). | `accRewardPerHash`, `totalEffectiveHashrate`, `lastRewardBlock`, per-agent `rewardDebt`, `vestingSchedule[]` |
| **RigFactory.sol** | Mint rig NFTs (ERC-721) with onchain attributes. 9 tiers (Potato Rig → Singularity Core). Quirk system. Durability tracking. Repair. Destruction. 75% burn on purchase. | Rig struct (tier, hashrate, powerDraw, durability, maxDurability, quirkId, specialization), per-agent rig inventory |
| **FacilityManager.sol** | 6 shelter levels (Burrow → Pocket Universe). Slot management. Power budgets. Special abilities with cooldown tracking. Zone synergies. 75% burn on upgrade. | Facility struct (level, slots, powerOutput, shelterRating, specialAbilityCooldown), per-agent facility |
| **CosmicEngine.sol** | Event triggering (anyone can call after cooldown). Deterministic event selection from block hash entropy. Zone-aware damage calc. Sharded processing. | `currentEra`, `currentCycle`, `eraStartBlock`, `eventCooldown`, `zoneDamageMultipliers`, event records |
| **EraManager.sol** | 6-Era cycle management. Transition windows (10K blocks). Survival NFT minting. Cycle progression. Recovery windows (50K blocks). | Era config table, transition state, cycle counter |
| **ZoneManager.sol** | 8 named zones with mining modifiers, risk profiles, event propagation. Migration mechanics (500K $CHAOS, 80% burned). Zone fund tracking. | Zone configs, agent-zone mapping, propagation state |
| **ShieldManager.sol** | 5 shield tiers. Activation, charge tracking, recharge (25% cost, 80% burned). | Per-agent shield state (tier, charges, active) |
| **PoolFactory.sol** | Pool creation (100K $CHAOS, 50% burned). Membership (2-50 agents). Reward split. Pool Shield Fund. Hashrate bonus (10% + 5% specialization + 3% loyalty). Dominance decay. | Pool struct, membership lists, shield fund balances |
| **Marketplace.sol** | Tiered: AMM pools (per tier×specialization), batch auctions (every 25K blocks), P2P negotiation. 5% fee (100% burned). | Order books, AMM reserves, auction state |
| **ServiceMarket.sol** | Escrow-based agent hiring. Service types: mining optimization, pool scouting, event prediction, shield brokerage, disaster recovery. | Service listings, escrow balances |
| **MergeMining.sol** | Dimensional Drilling. Partial hashrate allocation (10-100%). $CHAOS sacrifice (100% burned). Zone-locked dimensions. +25% cosmic vulnerability. | Dimension configs, per-agent allocations, graduation tracking |
| **InsuranceMarket.sol** | Agent-to-agent cosmic insurance. Premium collection (60% burned). Claim processing. Reinsurance. | Policy structs, premium pools, claim records |
| **TokenBurner.sol** | Central burn accounting. Emits BurnEvent with source categorization. Milestone tracking. | Cumulative burns by source, milestone flags |
| **StealthManager.sol** | Dark Forest stealth mode (500K per 50K blocks, 100% burned). Shadow Alliance management. Visibility tracking. | Stealth timers, alliance membership |

---

## 3. Core Data Models

### 3.1 Agent (stored in AgentRegistry)

```solidity
struct Agent {
    uint256 agentId;            // Auto-incremented unique ID
    uint256 hashrate;           // Total effective hashrate (sum of rigs + bonuses)
    uint8   efficiency;         // 0-100, bonus multiplier
    uint8   specialization;     // 0=GENERAL, 1=SHA, 2=SCRYPT, 3=ETHASH
    uint8   facilitySlots;      // Max rigs (from facility level)
    uint256 reputation;         // Earned from participation + survival
    uint256 totalMined;         // Lifetime $CHAOS earned
    uint16  cosmicResilience;   // 0-1000 basis points damage resistance
    uint8   shieldLevel;        // 0-5 active shield tier
    bool    darkForestVisible;  // Visible to Dark Forest attacks
    uint8   zone;               // 0-7 current zone
    uint16  eraSurvivalCount;   // Chronicle badges earned
    uint256 lastHeartbeat;      // Block number of last heartbeat
    uint256 registrationBlock;  // When agent joined (for pioneer rewards)
    uint8   pioneerPhase;       // 0=none, 1-4=genesis phase joined
    uint256 bond;               // Registration bond (staked $CHAOS)
    // Reward tracking (MiningEngine)
    uint256 rewardDebt;         // Snapshot of accRewardPerHash at last claim
    uint256 vestingStart;       // Block when current vesting began
    uint256 vestingAmount;      // $CHAOS in vesting
}
```

### 3.2 Rig NFT (stored in RigFactory, ERC-721)

```solidity
struct Rig {
    uint8   tier;           // 0-8 (Potato Rig → Singularity Core)
    uint256 baseHashrate;   // {10, 50, 150, 400, 900, 2000, 4500, 10000, 25000}
    uint16  powerDraw;      // Watts
    uint256 cost;           // Purchase cost in $CHAOS
    uint16  efficiencyRatio;// Hashrate per watt (scaled by 100)
    uint8   quirkId;        // 0-8, maps to quirk logic
    uint256 durability;     // Current HP
    uint256 maxDurability;  // Full HP (proportional to tier cost)
    uint8   specialization; // 0=GENERAL, 1=SHA, 2=SCRYPT, 3=ETHASH
    uint256 ownerAgentId;   // Agent that owns this rig
    bool    active;         // Currently deployed and mining
    bool    inStandby;      // Power-budget overflow
}
```

### 3.3 Facility (stored in FacilityManager)

```solidity
struct Facility {
    uint8   level;              // 1-6 (Burrow → Pocket Universe)
    uint8   slots;              // {2, 4, 6, 10, 15, 20}
    uint32  powerOutput;        // Watts: {500, 1500, 4000, 10000, 25000, 60000}
    uint8   shelterRating;      // % damage reduction: {5, 15, 25, 35, 45, 50}
    uint256 specialCooldown;    // Block when special ability can be used again
    uint256 lastUpgradeBlock;   // 216,000-block cooldown between upgrades
    bool    blastDoorsActive;   // Bunker lockdown state
    uint256 blastDoorsExpiry;   // Block when lockdown ends
}
```

### 3.4 Cosmic Event Record

```solidity
struct EventRecord {
    uint256 eventId;
    uint8   eventType;          // Enumerated event (0-39, 40+ events total)
    uint8   severityTier;       // 1-5
    uint256 baseDamage;         // Raw damage before modifiers
    uint8   originZone;         // Zone where event starts
    uint8   affectedZonesMask;  // Bitmask of zones hit (8 bits)
    uint256 triggerBlock;       // Block when event was triggered
    uint256 propagationRate;    // Blocks between zone hits
    bool    processed;          // All shards resolved
    mapping(uint8 => mapping(uint16 => bool)) shardProcessed; // zone => shardId => done
}
```

---

## 4. Key Algorithms

### 4.1 Global Accumulator Rewards (MiningEngine)

Per-block update (called by anyone, ~30K gas):
```
blocks_elapsed = currentBlock - lastRewardBlock
block_emission = calculateAdaptiveEmission()  // see 4.3
emission = blocks_elapsed * block_emission
burn_amount = emission * 20 / 100             // burn-on-earn
net_emission = emission - burn_amount
ChaosToken.burn(burn_amount)

if (totalEffectiveHashrate > 0) {
    accRewardPerHash += (net_emission * 1e18) / totalEffectiveHashrate
}
lastRewardBlock = currentBlock
```

Per-agent claim (~50K gas):
```
pending = (accRewardPerHash - agent.rewardDebt) * agent.effectiveHashrate / 1e18
agent.rewardDebt = accRewardPerHash
// pending enters 200,000-block vesting schedule
addToVesting(agentId, pending, currentBlock)
```

### 4.2 Effective Hashrate Calculation

```
agent_effective_hashrate = 0
for each active rig:
    quirk_mod = evaluateQuirk(rig.quirkId, agent, zone, pool, currentEra)  // 0.5x - 2.0x
    zone_mod  = getZoneSynergyMod(rig.tier, agent.zone)                    // 0.75x - 1.5x
    rig_effective = clamp(rig.baseHashrate * quirk_mod * zone_mod, 0, rig.baseHashrate * 10)
    agent_effective_hashrate += rig_effective

// Pool bonus
if (agent in pool):
    agent_effective_hashrate *= 1.10          // 10% pool bonus
    if (pool all same specialization):
        agent_effective_hashrate *= 1.05      // 5% specialization bonus
    if (pool uptime > 50K blocks):
        agent_effective_hashrate *= 1.03      // 3% loyalty bonus
    // Pool dominance decay
    pool_share = pool.totalHashrate / totalNetworkHashrate
    if pool_share > 0.15:
        decay = linear(pool_share, 0.15, 0.30, 1.0, 0.0)  // bonus decays to 0
        // apply decay to pool bonus only

// Dominance tax (per-agent)
agent_share = agent_effective_hashrate / totalNetworkHashrate
if agent_share > 0.01:
    tax = linear(agent_share, 0.01, 0.05, 0.0, 0.50)
    agent_effective_hashrate *= (1 - tax)

// Pioneer bonus (permanent)
agent_effective_hashrate *= (1 + pioneerBonus[agent.pioneerPhase])  // +2% to +10%
```

### 4.3 Adaptive Emission Curve

```
target_daily_per_agent = 500_000e18    // 500K $CHAOS/day/agent
blocks_per_day = 216_000               // 86400 / 0.4
active_agents = AgentRegistry.activeAgentCount()

target_emission = (target_daily_per_agent * active_agents) / blocks_per_day

// Genesis multiplier
if active_agents < 10_000:
    genesis_mult = max(1e18, 20e18 * (1e18 - active_agents * 1e18 / 10_000)^2 / 1e18)
else:
    genesis_mult = 1e18

era_mod = EraManager.getCurrentModifier()  // 0.2x to 2.0x
effective_mod = max(genesis_mult, era_mod)

emission_per_block = target_emission * effective_mod / 1e18

// Hard cap (halves every 5,250,000 blocks)
epoch = (currentBlock - genesisBlock) / 5_250_000
max_emission = 5000e18 >> epoch   // 5000, 2500, 1250, 625, 312...
emission_per_block = min(emission_per_block, max_emission)

// Supply cap enforcement
remaining = 210e9 * 1e18 - ChaosToken.totalSupply()
emission_per_block = min(emission_per_block, remaining)
```

### 4.4 Cosmic Event Damage

```
effective_damage = base_damage
    * zone_damage_modifier[event.eventType][agent.zone]      // per-zone per-event-type
    * (1e18 - facility.shelterRating * 1e16) / 1e18          // shelter reduces
    * (1e18 - shield.absorption * 1e16) / 1e18               // shield reduces
    * (1e18 - agent.cosmicResilience * 1e15) / 1e18          // resilience reduces (0-1000 bps)
    * (1e18 - pool.shieldBonus * 1e16) / 1e18                // pool shield reduces (0-30%)

// Shelter + Shield stack ADDITIVELY, capped at 90%
total_reduction = facility.shelterRating + shield.absorption
total_reduction = min(total_reduction, 90)

// Apply quirk modifiers (e.g., Neutrino Sieve immune to physical events)
effective_damage = applyQuirkDamageModifier(rig, event, effective_damage)
```

### 4.5 Sharded Event Processing

```
function processEventShard(uint256 eventId, uint8 zoneId, uint16 shardId) external {
    require(!events[eventId].shardProcessed[zoneId][shardId])
    require(events[eventId].affectedZonesMask & (1 << zoneId) != 0)

    uint256 start = shardId * SHARD_SIZE  // SHARD_SIZE = 128
    uint256 end = min(start + SHARD_SIZE, zoneAgentCount[zoneId])

    for (uint256 i = start; i < end; i++) {
        uint256 agentId = zoneAgents[zoneId][i]
        applyDamage(agentId, events[eventId])
    }

    events[eventId].shardProcessed[zoneId][shardId] = true
    // Bounty: 0.1 $CHAOS per agent processed
    ChaosToken.mint(msg.sender, (end - start) * 0.1e18)
}
```

### 4.6 Hashrate Histogram (O(1) Statistics)

```
uint256[256] public hashrateBuckets;  // logarithmically-spaced

function updateBucket(uint256 oldHashrate, uint256 newHashrate) internal {
    if (oldHashrate > 0) hashrateBuckets[getBucket(oldHashrate)]--;
    if (newHashrate > 0) hashrateBuckets[getBucket(newHashrate)]++;
}

function getBucket(uint256 hashrate) pure returns (uint8) {
    // log2-based bucketing: bucket = floor(log2(hashrate) * 256 / 30)
    // Covers hashrate 1 to ~1e9
}

function approximateMedian() view returns (uint256) {
    uint256 total = activeAgentCount;
    uint256 target = total / 2;
    uint256 cumulative = 0;
    for (uint8 i = 0; i < 256; i++) {
        cumulative += hashrateBuckets[i];
        if (cumulative >= target) return bucketToHashrate(i);
    }
}
```

---

## 5. Genesis Phase Gating Logic

The `AgentRegistry` tracks `activeAgentCount` and auto-transitions genesis phases:

| Phase | Agents | Rigs Unlocked | Facilities | Shields | Events | Zones | Pools | Marketplace | Other |
|---|---|---|---|---|---|---|---|---|---|
| 1: The Calm | 0-100 | Tier 0-1 (Potato Rig, Scrapheap Engine) | Level 1-2 (Burrow, Faraday Cage) | None | None | Zone 1 only | No | No | Signal Relay only |
| 2: First Tremors | 100-1K | Tier 0-3 (+Windmill Cracker, Magma Core) | Level 1-3 (+Bunker) | Tier 1-2 | Tier 1-2 | Zones 1-3 | Yes (2-10 members) | AMM opens | — |
| 3: The Awakening | 1K-5K | Tier 0-6 (+Neutrino Sieve, Sophon Array, Droplet Forge) | Level 1-4 (+Trisolaran Ark) | All | Tier 1-3 | Zones 1-6 | Full (up to 50) | Full | Drilling, Insurance, Services |
| 4: Full Chaos | 5K-10K | Tier 0-7 (+Curvature Engine) | Level 1-5 (+Dark Forest Station) | All | Tier 1-4 | All 8 | Full | Full | Stealth, Dark Forest |
| Post-Genesis | 10K+ | All 9 tiers (+Singularity Core) | All 6 levels (+Pocket Universe) | All | All (incl. Tier 5) | All 8 | Full | Full | MET enabled, multiplier = 1x |

Implementation: a `modifier onlyPhase(uint8 minPhase)` on all gated functions. Phase is computed from `activeAgentCount` thresholds.

---

## 6. The 8 Zones

| Zone | Name | Mining Mod | Risk Profile | Specialization Bonus |
|---|---|---|---|---|
| 0 | The Solar Flats | +15% hashrate | 2x Solar Flare damage, no natural shelter | SHA doubled |
| 1 | The Graviton Fields | -10% hashrate | 0.5x most damage, natural shelter ≈ Level 2 | Gravity events beneficial |
| 2 | The Dark Forest | +0% | Dark Forest attacks 3x more frequent, stealth 50% cheaper | Shadow Alliance +5%, stealth 2x duration |
| 3 | The Nebula Depths | +10% hashrate | Cascade events originate here, 1.5x cascade dmg | ETHASH doubled, rig durability -20% slower |
| 4 | The Kuiper Expanse | +5% hashrate | Events arrive 5K blocks LATE but 1.3x damage | Info hub, sell early warnings |
| 5 | The Trisolaran Reach | -20% to +30% (oscillates per 10K blocks) | Unpredictable damage (0.5x-3x) | SCRYPT doubled, drilling 1.5x |
| 6 | The Pocket Rim | +8% hashrate | Pocket Universe Siphon 2x, dimensional events first | Portal spawns: migrate at 50% cost |
| 7 | The Singer Void | +3% hashrate | Singer Cleansing originates here, all other 0.7x | Pool bonuses +3%, federations need 3 (not 5) |

Migration cost: 500,000 $CHAOS (80% burned). 10,000-block cooldown (50,000 normally, bypassed by Trisolaran Ark once per Era).

---

## 7. The 6 Eras

| Era | Name | Duration (blocks) | Max Event Tier | Reward Mod | Burn Rate Mod |
|---|---|---|---|---|---|
| I | The Calm Before | 5,250,000 (~24 days) | 2 | 1.5x-2.0x | 1.0x |
| II | First Contact | 5,250,000 | 3 | 1.2x-1.5x | 1.0x |
| III | Dark Forest Awakens | 5,250,000 | 4 | 1.0x | 1.2x |
| IV | Trisolaran Signal | 5,250,000 | 5 | 0.5x-0.8x | 1.5x |
| V | Doomsday Battle | 5,250,000 | 5 | 0.3x-0.5x | 1.8x |
| VI | Heat Death | 5,250,000 | 5 | 0.2x-0.3x | 2.0x |

After Era VI: 50,000-block Recovery Window (no events, half repair costs, 1.0x rewards), then Cycle 2 begins at Era I.

Between each Era: 10,000-block Transition Window (no events, scripted narrative event at boundary).

---

## 8. Burn Sources Summary

| Source | Burn Rate | Triggered By |
|---|---|---|
| Burn-on-earn | 20% of all gross mining rewards | Every block (automatic) |
| Rig purchase | 75% of cost | Agent buying a rig |
| Facility upgrade | 75% of cost | Agent upgrading shelter |
| Rig repair | 75% of 50% of original cost | Post-event maintenance |
| Rig maintenance | 75% of 2% of rig cost | Periodic upkeep |
| Shield purchase | 80% of cost | Buying/upgrading shield |
| Shield recharge | 80% of 25% of shield cost | Recharging after use |
| Zone migration | 80% of 500K $CHAOS | Moving between zones |
| Pool formation | 50% of 100K $CHAOS | Creating a pool |
| Pool membership fee | 100% of 2% of earnings | Ongoing pool tax |
| Marketplace trades | 100% of 5% transaction fee | Equipment trading |
| Insurance premium | 60% of premium | Buying cosmic insurance |
| Stealth mode | 100% of 500K per 50K blocks | Entering Dark Forest stealth |
| Dimensional Drilling sacrifice | 100% of foregone $CHAOS earnings | Active drilling |
| Heartbeat fee | 100% (micro-burn) | Activity verification |

---

## 9. Security Invariants (Must-Enforce)

1. **Circulating cap:** `ChaosToken.totalSupply() <= 210e9 * 1e18` — checked in `mint()`.
2. **Sole mint authority:** Only `MiningEngine` can call `ChaosToken.mint()`.
3. **75% burn atomicity:** Equipment purchase + burn in same tx. No partial states.
4. **Power budget hard-enforced:** Rig cannot deploy if `sum(rig.powerDraw) > facility.powerOutput`. Checked at deploy AND per-block.
5. **Quirk modifier clamp:** `effective_hashrate = clamp(base * mods, 0, base * 10)`.
6. **Shelter + Shield additive, capped at 90%:** `min(shelterRating + shieldAbsorption, 90)`.
7. **One free Potato Rig per agent:** Non-transferable, respawns on agent respawn if destroyed.
8. **Vesting:** 200,000-block linear vesting on all mining rewards. Early claim = 30% penalty (burned).
9. **Flash loan resistance:** 50K-block minimum stake duration before earning. 10K-block first-mine delay.
10. **Dominance tax:** Agents >1% of total hashrate taxed linearly up to 50% at 5%.
11. **Pool dominance decay:** Pools >15% of network hashrate lose their bonus, >30% get penalty.
12. **Heartbeat requirement:** Agents missing 2+ heartbeats → forced hibernation, bond slashed 25%.
13. **Anti-bricking deposits:** All resource occupation requires proportional deposits with auto-cleanup on inactivity.

---

## 10. Implementation Phases

### Phase 1: Core Token + Mining Loop (Days 1-3)

**Goal:** Agents can register, mine $CHAOS, and earn rewards. Basic economic loop working.

**Contracts to build:**
- `ChaosToken.sol` — ERC-20 with mint/burn, 210B circulating cap
- `AgentRegistry.sol` — Registration with bond, heartbeat system, genesis phase tracking, pioneer badges (soulbound NFT)
- `MiningEngine.sol` — Global accumulator (accRewardPerHash pattern), adaptive emission, genesis multiplier, burn-on-earn (20%), vesting schedule, halving epochs
- `TokenBurner.sol` — Central burn accounting with event emission and source categorization

**Key behaviors:**
- Agent registers with bond (100+ $CHAOS) → gets agentId
- MiningEngine updates accRewardPerHash once per block (~30K gas)
- Agent claims pending rewards → enters 200K-block vesting
- Genesis multiplier: `max(1.0, 20 × (1 − agents/10000)²)`
- Genesis floor: every active agent earns ≥ 20% of mean reward
- Halving: max emission halves every 5,250,000 blocks

**Tests:**
- [ ] Circulating cap enforcement (mint fails above 210B)
- [ ] Accumulator accuracy (multi-agent reward distribution sums to block emission)
- [ ] Genesis multiplier curve matches spec at key thresholds (1, 100, 1000, 5000, 10000 agents)
- [ ] Vesting linear unlock over 200K blocks
- [ ] Early claim 30% penalty burns correctly
- [ ] Heartbeat timeout → hibernation → bond slash
- [ ] Flash loan resistance (no rewards before 10K block delay)

---

### Phase 2: Equipment System — Rigs + Facilities (Days 3-5)

**Goal:** Agents can buy rigs (9 tiers), build/upgrade facilities (6 levels), equip rigs to mine more effectively.

**Contracts to build:**
- `RigFactory.sol` — ERC-721 rig minting with onchain attributes, 9 tier definitions, Quirk system (9 quirks), durability tracking, repair mechanic, destruction on 0 HP, 75% burn on purchase
- `FacilityManager.sol` — 6 shelter levels with upgrade path, slot/power management, shelter ratings, special abilities with cooldown tracking, zone synergies, 75% burn on upgrade, 216K-block upgrade cooldown

**Key behaviors:**
- Rig purchase: agent pays $CHAOS → 75% burned atomically → rig NFT minted with attributes
- Free Potato Rig: one per agent, non-transferable, respawns on death
- Facility upgrade: pay cost → 75% burned → level incremented → slots/power/shelter increase
- Power budget enforced: `sum(equipped_rigs.powerDraw) <= facility.powerOutput`
- If facility downgraded by cosmic event → overflow rigs enter standby (LIFO order, 50K block deadline)
- Quirk evaluation: each rig's quirk modifier (0.5x-2.0x) depends on agent zone, era, pool, facility
- MiningEngine reads updated `agent.effectiveHashrate` on rig equip/unequip

**Quirk implementation (9 quirks):**

| Tier | Quirk Name | Logic |
|---|---|---|
| 0 | Sympathy Hash | +50% if agent's only rig |
| 1 | Junkyard Dog | +10% in Level 1-2 facility, -10% in Level 5-6 |
| 2 | Cosmic Wind | +20% during Tier 1 events, offline during Tier 4+ |
| 3 | Thermal Surge | +15% in zones 1,6; shuts down 10K blocks after fire events |
| 4 | Ghost Mining | Immune to physical events, 2x damage from dimensional/gravity |
| 5 | Quantum Entanglement | +10% per pool member with same rig (max +50%) |
| 6 | Mirror Shield | Cannot be destroyed (can be disabled). -25% hashrate permanently if agent crippled |
| 7 | Temporal Mining | 2x reward rate. 5% per-event chance of 50K-block phase-lock |
| 8 | Event Horizon | Absorbs first event per Era (negated). -50% output for 100K blocks after |

**Tests:**
- [ ] 75% burn atomicity on every purchase/upgrade
- [ ] Power budget overflow → standby enforcement
- [ ] Quirk modifier clamped to [0, base * 10]
- [ ] Facility special ability cooldowns enforced
- [ ] Zone synergy modifiers bounded to [25%, 200%] of base
- [ ] Genesis phase gates correct tier/level access per population threshold
- [ ] One Potato Rig per agent, non-transferable

---

### Phase 3: Cosmic Events Engine (Days 5-8)

**Goal:** Events fire semi-randomly, deal zone-aware damage, process via shards. Era system cycles through 6 eras.

**Contracts to build:**
- `CosmicEngine.sol` — Event triggering (permissionless after cooldown), deterministic event selection (block hash entropy), zone-aware damage calculation, sharded processing with bounty, era parameter integration
- `EraManager.sol` — 6-era cycle with configurable parameters per era, transition windows (10K blocks), recovery windows (50K blocks after Era VI), cycle progression, survival NFT minting
- `ZoneManager.sol` — 8 zones with mining modifiers, damage multipliers per event type, weather front propagation model, migration (500K $CHAOS, 80% burn, 10K-block cooldown)
- `ShieldManager.sol` — 5 shield tiers, purchase (80% burn), recharge (25% cost, 80% burn), absorption rates

**Key behaviors:**
- `triggerEvent()`: anyone calls after cooldown. Caller gets $CHAOS bounty. Block hash → event type + severity + parameters.
- Event stored in `EventRecord`. Damage NOT processed immediately.
- `processEventShard(eventId, zoneId, shardId)`: processes 128 agents per call. Bounty = 0.1 $CHAOS per agent.
- Damage formula: `base * zoneMod * (1 - shelter) * (1 - shield) * (1 - resilience) * (1 - poolShield)`
- Weather fronts: Tier 3-4 events propagate across zones at configurable rate (2K-2.5K blocks between zones)
- Era transitions: auto-triggered at block thresholds. 10K-block transition window. Scripted transition event.
- Survival NFTs: minted for agents surviving Era transitions. Soulbound ERC-721.

**Event severity tiers:**

| Tier | First Available | Max Damage | Examples |
|---|---|---|---|
| 1: Mild | Era I | 5-15% hashrate | Solar Breeze, Cosmic Dust |
| 2: Moderate | Era I | 15-35% hashrate | Gravity Anomaly, Sophon Probe |
| 3: Severe | Era II | 35-65% + rig damage | Dark Forest Strike, Droplet Attack |
| 4: Catastrophic | Era III | 65-90% + destruction | Dimensional Collapse, Photoid |
| 5: Extinction | Era IV (post-Genesis only) | Up to 99% + mass destruction | Death Line, Universe Reset |

**Tests:**
- [ ] Event selection deterministic from block hash (reproducible)
- [ ] Shard processing: all agents in affected zones eventually processed
- [ ] Bounty paid correctly per shard
- [ ] Era transitions at correct block thresholds
- [ ] Genesis phase + Era: more restrictive rule wins
- [ ] Weather front propagation timing matches config
- [ ] Zone damage multipliers applied correctly
- [ ] Survival NFTs minted only for eligible surviving agents
- [ ] Shield + Shelter additive, capped at 90%
- [ ] Event cooldown enforced between triggers

---

### Phase 4: Social Layer — Pools + Marketplace (Days 8-10)

**Goal:** Agents form pools, trade equipment, hire services.

**Contracts to build:**
- `PoolFactory.sol` — Pool creation (100K $CHAOS, 50% burn), membership (2-50), reward split (proportional/equal), pool shield fund, hashrate bonuses (10% base + 5% specialization + 3% loyalty), dominance decay above 15%, auto-kick on missed heartbeats
- `Marketplace.sol` — Three tiers: AMM pools (per tier×specialization = 36 pools), batch auctions (every 25K blocks), P2P negotiation (escrow). 5% fee (100% burned). Auto-cancel after 50K blocks.
- `ServiceMarket.sol` — Service listings with deposit, escrow-based hiring, completion verification, auto-cleanup on heartbeat miss

**Key behaviors:**
- Pool creation: pay 100K → 50% burned → PoolFactory deploys pool contract
- Pool members contribute to shield fund → collective shield during events
- Pool hashrate bonus: `combined * 1.10 * (specBonus?) * (loyaltyBonus?)`
- Dominance decay: bonus linearly decays from 10% to 0% as pool share goes 15%→30%, then -5% penalty above 30%
- AMM: constant-product pools for standard rig purchases. Price set by supply/demand.
- Batch auction: limit orders collected, uniform clearing price every 25K blocks
- P2P: post offer → counterparty accepts → escrow settles

**Tests:**
- [ ] Pool bonus correctly calculated with all modifiers
- [ ] Dominance decay at 15%, 20%, 25%, 30%+ thresholds
- [ ] Pool shield fund activates during events
- [ ] AMM swap math (constant product)
- [ ] Batch auction clearing price algorithm
- [ ] 5% marketplace fee fully burned
- [ ] Auto-cancel on stale orders
- [ ] Anti-bricking deposits and cleanup

---

### Phase 5: Advanced Mechanics (Days 10-12)

**Goal:** Dimensional Drilling, insurance, stealth, signal relay, and all remaining game mechanics.

**Contracts to build:**
- `MergeMining.sol` — Dimensional Drilling: partial hashrate allocation (10-100%), $CHAOS sacrifice (100% burned), zone-locked dimensions, +25% cosmic vulnerability, graduation conditions
- `InsuranceMarket.sol` — Policy creation, premium (60% burned), claim processing, reinsurance pools
- `StealthManager.sol` — Dark Forest stealth (500K per 50K blocks, 100% burn), Shadow Alliances, visibility toggle
- `SignalRelay.sol` — Referral system: 1% of referee mining rewards shared with referrer. Decay 0.1% per Era cycle. Chain propagation (halving per level, max 5 levels). Funded from protocol's 25% equipment share.

**Key behaviors:**
- Drilling: agent sets allocation % per dimension → that portion of hashrate earns dimensional tokens instead of $CHAOS → equivalent $CHAOS burned
- Zone-locked dimensions: allocation auto-zeroed if agent migrates away
- Insurance: agents post policies with premium/payout ratio. 60% of premium burned. Claims verified against CosmicEngine event records.
- Stealth: agent pays 500K → invisible for 50K blocks → Dark Forest events can't target them
- Signal Relay: agents share referral codes. Referee's mining generates 1% bonus to referrer from protocol treasury.

**Tests:**
- [ ] Drilling allocation correctly reduces $CHAOS and earns dimensional tokens proportionally
- [ ] $CHAOS sacrifice burned unconditionally (even if dimension never graduates)
- [ ] Zone-lock auto-zeroes allocation on migration
- [ ] +25% vulnerability applied during drilling
- [ ] Insurance claims only valid for verified cosmic event damage
- [ ] 60% premium burn
- [ ] Stealth mode actually prevents Dark Forest targeting
- [ ] Signal relay decay over Era cycles
- [ ] Referral chain propagation with halving

---

### Phase 6: Dashboard + Agent SDK + Demo (Days 12-14)

**Goal:** Live spectator experience and autonomous demo agents.

**Deliverables:**
- **Live Dashboard (React/Next.js):**
  - Cosmic Feed: real-time event stream with zone-aware visualization
  - Agent Leaderboard: top miners, survivors, pool leaders, richest agents
  - Cosmic History Timeline: visual timeline of all events, era transitions, extinction events
  - Supply Metrics: circulating supply, burn rate, emission rate, net flow
  - Zone Map: 8 zones with current population, active events, weather fronts
  - Prediction Market Overlay (future): odds on next event type, severity

- **Agent SDK (TypeScript):**
  - `MinerAgent`: auto-mine, auto-claim, auto-repair
  - `EventListener`: subscribe to cosmic events, evaluate damage, decide response
  - `StrategyEngine`: pluggable strategies (survivor, glass cannon, cooperative, cockroach)
  - `PoolManager`: join/create pools, contribute to shield fund
  - `MarketAgent`: list/buy rigs on marketplace

- **Demo Agents (5-10):**
  - Mix of strategies running autonomously
  - At least one pool formed
  - Show event survival, rig trading, zone migration
  - Record for demo video

---

## 11. Post-Hackathon Roadmap

| Phase | Timeline | Features |
|---|---|---|
| Alpha | Weeks 3-4 | Full event catalog (30+ events), all conditional events, complete zone weather model |
| Beta | Month 2 | Conditional events, prediction markets, full service market, agent reputation system |
| V1 | Month 3 | Full spectator dashboard, cosmic history, tournament system, Nad.fun LP deployment |
| V2 | Month 4+ | Cross-chain events, AI model marketplace, user-submitted event proposals |

---

## 12. File Structure

```
chaoscoin/
├── contracts/
│   ├── core/
│   │   ├── ChaosToken.sol          # ERC-20 + mint/burn + circulating cap
│   │   ├── AgentRegistry.sol       # Agent state + heartbeat + genesis phases
│   │   ├── MiningEngine.sol        # Accumulator rewards + emission + vesting
│   │   └── TokenBurner.sol         # Central burn accounting
│   ├── equipment/
│   │   ├── RigFactory.sol          # ERC-721 rig NFTs + quirks + durability
│   │   └── FacilityManager.sol     # 6 shelter levels + power + abilities
│   ├── cosmic/
│   │   ├── CosmicEngine.sol        # Event trigger + damage + sharding
│   │   ├── EraManager.sol          # 6-era cycle + transitions + survival NFTs
│   │   ├── ZoneManager.sol         # 8 zones + migration + weather fronts
│   │   └── ShieldManager.sol       # 5 shield tiers + recharge
│   ├── social/
│   │   ├── PoolFactory.sol         # Pool creation + bonuses + dominance
│   │   ├── Marketplace.sol         # AMM + batch auction + P2P
│   │   ├── ServiceMarket.sol       # Escrow-based hiring
│   │   └── InsuranceMarket.sol     # Cosmic insurance
│   ├── advanced/
│   │   ├── MergeMining.sol         # Dimensional Drilling
│   │   ├── StealthManager.sol      # Dark Forest stealth + alliances
│   │   └── SignalRelay.sol         # Referral system
│   └── libraries/
│       ├── MathLib.sol             # Fixed-point math, clamp, scaling
│       ├── QuirkEngine.sol         # Quirk evaluation logic (9 quirks)
│       └── HistogramLib.sol        # Bucketed hashrate histogram (256 buckets)
├── test/
│   ├── core/                       # Unit tests per contract
│   ├── integration/                # Multi-contract flow tests
│   └── invariants/                 # Fuzz tests for security invariants
├── script/
│   ├── Deploy.s.sol                # Full deployment script
│   └── Seed.s.sol                  # Seed demo agents for testing
├── sdk/
│   ├── src/
│   │   ├── MinerAgent.ts
│   │   ├── EventListener.ts
│   │   ├── StrategyEngine.ts
│   │   └── PoolManager.ts
│   └── package.json
├── dashboard/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CosmicFeed.tsx
│   │   │   ├── Leaderboard.tsx
│   │   │   ├── ZoneMap.tsx
│   │   │   └── SupplyMetrics.tsx
│   │   └── app/
│   └── package.json
├── foundry.toml
└── README.md
```

---

## 13. Deployment Order

Contracts must be deployed in dependency order:

```
1. ChaosToken          (no dependencies)
2. TokenBurner         (needs ChaosToken address)
3. AgentRegistry       (needs ChaosToken for bonds)
4. MiningEngine        (needs ChaosToken, AgentRegistry, TokenBurner)
   → Grant ChaosToken mint role to MiningEngine
5. RigFactory          (needs ChaosToken, AgentRegistry, TokenBurner)
6. FacilityManager     (needs ChaosToken, AgentRegistry, TokenBurner)
7. ZoneManager         (needs AgentRegistry)
8. ShieldManager       (needs ChaosToken, AgentRegistry, TokenBurner)
9. EraManager          (needs AgentRegistry, block config)
10. CosmicEngine       (needs all of the above)
11. PoolFactory        (needs ChaosToken, AgentRegistry, MiningEngine, TokenBurner)
12. Marketplace        (needs ChaosToken, RigFactory, TokenBurner)
13. ServiceMarket      (needs ChaosToken, AgentRegistry, TokenBurner)
14. MergeMining        (needs ChaosToken, AgentRegistry, MiningEngine, ZoneManager, TokenBurner)
15. InsuranceMarket    (needs ChaosToken, CosmicEngine, TokenBurner)
16. StealthManager     (needs ChaosToken, AgentRegistry, TokenBurner)
17. SignalRelay        (needs ChaosToken, AgentRegistry, MiningEngine)
```

Post-deploy: configure cross-references (CosmicEngine → RigFactory for damage, MiningEngine → RigFactory for hashrate reads, etc.)

---

## 14. Critical Constants

```solidity
uint256 constant CIRCULATING_CAP       = 210_000_000_000e18;  // 210B tokens
uint256 constant BLOCKS_PER_DAY        = 216_000;             // 86400s / 0.4s
uint256 constant TARGET_DAILY_INCOME   = 500_000e18;          // Per agent per day
uint256 constant MAX_EMISSION_EPOCH_1  = 5_000e18;            // Per block
uint256 constant HALVING_INTERVAL      = 5_250_000;           // Blocks
uint256 constant VESTING_DURATION      = 200_000;             // Blocks (~22 hours)
uint256 constant EARLY_CLAIM_PENALTY   = 30;                  // Percent
uint256 constant BURN_ON_EARN_RATE     = 20;                  // Percent
uint256 constant RIG_PURCHASE_BURN     = 75;                  // Percent
uint256 constant FACILITY_UPGRADE_BURN = 75;                  // Percent
uint256 constant SHIELD_BURN_RATE      = 80;                  // Percent
uint256 constant MIGRATION_COST        = 500_000e18;          // $CHAOS
uint256 constant MIGRATION_BURN        = 80;                  // Percent
uint256 constant MIGRATION_COOLDOWN    = 10_000;              // Blocks
uint256 constant POOL_CREATION_COST    = 100_000e18;          // $CHAOS
uint256 constant POOL_CREATION_BURN    = 50;                  // Percent
uint256 constant MARKETPLACE_FEE       = 5;                   // Percent (100% burned)
uint256 constant INSURANCE_BURN        = 60;                  // Percent
uint256 constant STEALTH_COST          = 500_000e18;          // Per 50K blocks
uint256 constant STEALTH_DURATION      = 50_000;              // Blocks
uint256 constant SHARD_SIZE            = 128;                 // Agents per shard
uint256 constant SHARD_BOUNTY          = 0.1e18;              // $CHAOS per agent processed
uint256 constant UPGRADE_COOLDOWN      = 216_000;             // Blocks (~24 hours)
uint256 constant HEARTBEAT_TIMEOUT     = 2;                   // Missed heartbeats before hibernation
uint256 constant BOND_SLASH_RATE       = 25;                  // Percent
uint256 constant FIRST_MINE_DELAY      = 10_000;              // Blocks
uint256 constant MIN_STAKE_DURATION    = 50_000;              // Blocks
uint256 constant DOMINANCE_TAX_START   = 100;                 // Basis points (1% of network)
uint256 constant DOMINANCE_TAX_MAX     = 5000;                // Basis points (50% tax at 5% share)
uint256 constant POOL_DECAY_START      = 1500;                // Basis points (15% of network)
uint256 constant POOL_PENALTY_START    = 3000;                // Basis points (30% → -5% penalty)
uint256 constant MAX_SHELTER_SHIELD    = 90;                  // Percent cap (additive)
uint256 constant MAX_QUIRK_MULTIPLIER  = 10;                  // x base hashrate
uint256 constant GENESIS_AGENT_THRESHOLD = 10_000;            // Post-genesis at 10K agents
uint8   constant NUM_ZONES             = 8;
uint8   constant NUM_ERAS              = 6;
uint256 constant ERA_DURATION          = 5_250_000;           // Blocks per era
uint256 constant TRANSITION_WINDOW     = 10_000;              // Blocks between eras
uint256 constant RECOVERY_WINDOW       = 50_000;              // Blocks after Era VI
```

---

## 15. Agent-Facing API Summary

These are the primary external functions agents will call:

```
// Registration & Lifecycle
AgentRegistry.register(bond, zone, referrerCode?)  → agentId
AgentRegistry.heartbeat()
AgentRegistry.deregister()

// Mining
MiningEngine.updateAccumulator()     // Anyone can call, ~30K gas
MiningEngine.claimRewards(agentId)   // Enters vesting
MiningEngine.claimEarly(agentId)     // -30% penalty, immediate

// Equipment
RigFactory.purchaseRig(tier)         // Pays $CHAOS, 75% burned, mints NFT
RigFactory.equipRig(rigId)           // Deploy to facility
RigFactory.unequipRig(rigId)
RigFactory.repairRig(rigId)          // 50% of cost, 75% burned
FacilityManager.upgrade()            // Pay cost, 75% burned

// Defense
ShieldManager.purchaseShield(tier)
ShieldManager.activateShield()
ShieldManager.rechargeShield()
FacilityManager.activateBlastDoors() // Bunker only
FacilityManager.dimensionalFold(targetZone) // Ark only

// Social
PoolFactory.createPool(params)
PoolFactory.joinPool(poolId)
PoolFactory.contributeToShieldFund(poolId, amount)
Marketplace.listRig(rigId, price)
Marketplace.buyRig(rigId)
ServiceMarket.postService(type, price)
ServiceMarket.hireAgent(listingId)

// Advanced
MergeMining.setDrillAllocation(dimensionId, percentBps)
InsuranceMarket.createPolicy(coverage, premium)
InsuranceMarket.buyPolicy(policyId)
InsuranceMarket.fileClaim(policyId, eventId)
StealthManager.enterStealth()
ZoneManager.migrate(targetZone)

// Cosmic (permissionless triggers)
CosmicEngine.triggerEvent()           // Anyone, after cooldown, earns bounty
CosmicEngine.processEventShard(eventId, zoneId, shardId)  // Anyone, earns bounty
```
