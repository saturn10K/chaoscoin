// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../BaseTest.sol";
import "forge-std/console.sol";

/**
 * @title SimulationTest -- 1000-Agent Chaoscoin Simulation
 * @notice Simulates 1000 agents across 8 zones over ~50,000 blocks.
 *         Agents follow one of four strategies: aggressive, defensive, balanced, nomad.
 *         Cosmic events fire every ~2,000 blocks. Agents make economic decisions
 *         every ~1,000 blocks. Heartbeats occur every ~200 blocks (in batches).
 *
 *         Run with: forge test --match-test test_simulation -vv --gas-limit 100000000000
 */
contract SimulationTest is BaseTest {
    // ================================================================
    //                        CONSTANTS
    // ================================================================

    uint256 constant NUM_AGENTS = 500;
    uint256 constant TOTAL_BLOCKS = 30_000;
    uint256 constant HEARTBEAT_STEP = 200;
    uint256 constant DECISION_STEP = 1000;
    uint256 constant COSMIC_STEP = 2000;
    uint256 constant HEARTBEAT_BATCH = 50; // Process agents in batches to manage gas

    // Strategy distribution
    uint256 constant AGGRESSIVE_COUNT = 150;
    uint256 constant DEFENSIVE_COUNT = 150;
    uint256 constant BALANCED_COUNT = 100;
    uint256 constant NOMAD_COUNT = 100;

    // Strategy enum
    uint8 constant STRATEGY_AGGRESSIVE = 0;
    uint8 constant STRATEGY_DEFENSIVE = 1;
    uint8 constant STRATEGY_BALANCED = 2;
    uint8 constant STRATEGY_NOMAD = 3;

    // ================================================================
    //                        STATE
    // ================================================================

    struct AgentSim {
        uint256 agentId;
        address operator;
        uint8 strategy;
        uint8 zone;
        bool hasUpgradedRig; // Has purchased a non-T0 rig
        uint8 highestRigTier;
        uint8 facilityLevel;
        bool hasShield;
        uint256 lastDecisionBlock;
        uint256 totalHeartbeats;
    }

    AgentSim[] public simAgents;

    // Metrics snapshots
    struct Snapshot {
        uint256 blockNumber;
        uint256 totalHashrate;
        uint256 totalSupply;
        uint256 totalBurned;
        uint256 activeAgents;
        uint256 avgDurability; // Scaled by 100 for 2-decimal precision
        uint256 avgFacilityCondition; // Scaled by 100
        uint256 cosmicEventsTriggered;
    }

    Snapshot[] public snapshots;
    uint256 public cosmicEventsTriggered;
    uint256 public cosmicEventsProcessed;

    // Per-zone agent counts (updated each snapshot)
    mapping(uint8 => uint256) public zoneAgentCounts;

    // Top miner tracking
    uint256[10] public topMinerAgentIds;
    uint256[10] public topMinerAmounts;

    // Pseudo-random seed
    uint256 private _rngSeed;

    // ================================================================
    //                    SETUP OVERRIDE
    // ================================================================

    /// @dev Override wiring to use the _registerAgentSafe pattern from EquipmentTest.
    ///      We do NOT set rigFactory on agentRegistry during wiring; instead we
    ///      handle the facility-first, then rig-mint ordering manually.
    function _wireContracts() internal override {
        chaosToken.setMinter(address(miningEngine));
        tokenBurner.setAuthorizedBurner(address(miningEngine), true);
        tokenBurner.setAuthorizedBurner(address(rigFactory), true);
        tokenBurner.setAuthorizedBurner(address(facilityManager), true);
        tokenBurner.setAuthorizedBurner(address(shieldManager), true);
        tokenBurner.setAuthorizedBurner(address(cosmicEngine), true);
        zoneManager.setAgentRegistry(address(agentRegistry));
        zoneManager.setTokenContracts(
            address(chaosToken),
            address(tokenBurner),
            treasury
        );
        agentRegistry.setRegistrar(registrar);
        // Do NOT set rigFactory here -- handled in _registerAgentSafe
        agentRegistry.setFacilityManager(address(facilityManager));
        agentRegistry.setMiningEngine(address(miningEngine));
        agentRegistry.setShieldManager(address(shieldManager));
        agentRegistry.setCosmicEngine(address(cosmicEngine));
        rigFactory.setCosmicEngine(address(cosmicEngine));
        shieldManager.setCosmicEngine(address(cosmicEngine));
    }

    // ================================================================
    //                    REGISTRATION HELPERS
    // ================================================================

    /// @dev Register one agent with correct ordering (facility first, then rig).
    function _registerAgentSafe(address operator, uint8 zone)
        internal
        returns (uint256 agentId)
    {
        bytes32 moltbookHash = keccak256(abi.encodePacked("moltbook-", operator));
        vm.prank(registrar);
        agentId = agentRegistry.register(operator, moltbookHash, zone);

        agentRegistry.setRigFactory(address(rigFactory));
        vm.prank(address(agentRegistry));
        rigFactory.mintPotatoRig(agentId, operator);
        agentRegistry.setRigFactory(address(0));
    }

    /// @dev Generate a deterministic operator address for agent index i.
    function _operatorAddr(uint256 i) internal pure returns (address) {
        return address(uint160(0x100000 + i));
    }

    // ================================================================
    //                    PSEUDO-RANDOM
    // ================================================================

    function _rand() internal returns (uint256) {
        _rngSeed = uint256(keccak256(abi.encodePacked(_rngSeed, block.number, gasleft())));
        return _rngSeed;
    }

    function _randRange(uint256 lo, uint256 hi) internal returns (uint256) {
        if (hi <= lo) return lo;
        return lo + (_rand() % (hi - lo));
    }

    function _randPercent() internal returns (uint256) {
        return _rand() % 100;
    }

    // ================================================================
    //                    MAIN SIMULATION
    // ================================================================

    function test_simulation() public {
        _rngSeed = uint256(keccak256("chaoscoin-sim-seed-42"));

        console.log("========================================================");
        console.log("  CHAOSCOIN SIMULATION: 500 Agents, 30000 Blocks");
        console.log("========================================================");
        console.log("");

        // ----- Phase 1: Register all 1000 agents -----
        _registerAllAgents();

        console.log("[SETUP] All agents registered. Active:", agentRegistry.activeAgentCount());
        console.log("[SETUP] Genesis phase:", agentRegistry.getGenesisPhase());
        console.log("[SETUP] Total hashrate:", miningEngine.totalEffectiveHashrate());
        console.log("");

        // Set rigFactory permanently so heartbeat wear + hashrate updates work
        agentRegistry.setRigFactory(address(rigFactory));

        // Skip past FIRST_MINE_DELAY so agents can earn rewards
        uint256 startBlock = block.number;
        vm.roll(startBlock + 10_001);

        console.log("[SIM] Starting simulation at block", block.number);
        console.log("[SIM] Heartbeat every", HEARTBEAT_STEP, "blocks");
        console.log("[SIM] Decisions every", DECISION_STEP, "blocks");
        console.log("[SIM] Cosmic events every", COSMIC_STEP, "blocks");
        console.log("");

        // ----- Phase 2: Main simulation loop -----
        uint256 simStartBlock = block.number;

        for (uint256 step = HEARTBEAT_STEP; step <= TOTAL_BLOCKS; step += HEARTBEAT_STEP) {
            uint256 targetBlock = simStartBlock + step;
            vm.roll(targetBlock);

            // --- Heartbeats (every HEARTBEAT_STEP) ---
            _batchHeartbeats();

            // --- Agent decisions (every DECISION_STEP) ---
            if (step % DECISION_STEP == 0) {
                _agentDecisionRound();
            }

            // --- Cosmic events (every COSMIC_STEP) ---
            if (step % COSMIC_STEP == 0) {
                _tryCosmicEvent();
            }

            // --- Snapshot (every 2000 blocks for readable output) ---
            if (step % 2000 == 0) {
                _takeSnapshot();
                _printSnapshot(snapshots[snapshots.length - 1]);
            }
        }

        // ----- Phase 3: Final summary -----
        console.log("");
        console.log("========================================================");
        console.log("              SIMULATION COMPLETE");
        console.log("========================================================");
        _printFinalSummary();
    }

    // ================================================================
    //                    REGISTRATION
    // ================================================================

    function _registerAllAgents() internal {
        console.log("[SETUP] Registering", NUM_AGENTS, "agents across 8 zones...");

        for (uint256 i = 0; i < NUM_AGENTS; i++) {
            address op = _operatorAddr(i);
            uint8 zone = uint8(i % 8); // Even distribution across 8 zones

            uint8 strategy;
            if (i < AGGRESSIVE_COUNT) {
                strategy = STRATEGY_AGGRESSIVE;
            } else if (i < AGGRESSIVE_COUNT + DEFENSIVE_COUNT) {
                strategy = STRATEGY_DEFENSIVE;
            } else if (i < AGGRESSIVE_COUNT + DEFENSIVE_COUNT + BALANCED_COUNT) {
                strategy = STRATEGY_BALANCED;
            } else {
                strategy = STRATEGY_NOMAD;
            }

            uint256 agentId = _registerAgentSafe(op, zone);

            simAgents.push(AgentSim({
                agentId: agentId,
                operator: op,
                strategy: strategy,
                zone: zone,
                hasUpgradedRig: false,
                highestRigTier: 0,
                facilityLevel: 1,
                hasShield: false,
                lastDecisionBlock: block.number,
                totalHeartbeats: 0
            }));

            // Give every agent a starting balance for purchases.
            // More realistic: they earn through mining, but we seed them
            // so they can make early decisions.
            deal(address(chaosToken), op, 50_000e18);
            vm.prank(op);
            chaosToken.approve(address(rigFactory), type(uint256).max);
            vm.prank(op);
            chaosToken.approve(address(facilityManager), type(uint256).max);
            vm.prank(op);
            chaosToken.approve(address(shieldManager), type(uint256).max);
            vm.prank(op);
            chaosToken.approve(address(zoneManager), type(uint256).max);
        }
    }

    // ================================================================
    //                    HEARTBEAT BATCHING
    // ================================================================

    function _batchHeartbeats() internal {
        // Process all agents in batches to keep gas manageable
        for (uint256 start = 0; start < NUM_AGENTS; start += HEARTBEAT_BATCH) {
            uint256 end = start + HEARTBEAT_BATCH;
            if (end > NUM_AGENTS) end = NUM_AGENTS;

            for (uint256 i = start; i < end; i++) {
                AgentSim storage sim = simAgents[i];
                AgentRegistry.Agent memory agent = agentRegistry.getAgent(sim.agentId);

                // Only heartbeat for active agents
                if (!agent.active) continue;

                vm.prank(sim.operator);
                try agentRegistry.heartbeat(sim.agentId) {
                    sim.totalHeartbeats++;
                } catch {
                    // Heartbeat can fail if agent has no rig etc. -- skip
                }
            }
        }
    }

    // ================================================================
    //                    AGENT DECISIONS
    // ================================================================

    function _agentDecisionRound() internal {
        uint8 phase = agentRegistry.getGenesisPhase();

        for (uint256 i = 0; i < NUM_AGENTS; i++) {
            AgentSim storage sim = simAgents[i];
            AgentRegistry.Agent memory agent = agentRegistry.getAgent(sim.agentId);

            if (!agent.active) continue;

            uint256 balance = chaosToken.balanceOf(sim.operator);

            if (sim.strategy == STRATEGY_AGGRESSIVE) {
                _aggressiveDecision(sim, agent, balance, phase);
            } else if (sim.strategy == STRATEGY_DEFENSIVE) {
                _defensiveDecision(sim, agent, balance, phase);
            } else if (sim.strategy == STRATEGY_BALANCED) {
                _balancedDecision(sim, agent, balance, phase);
            } else {
                _nomadDecision(sim, agent, balance, phase);
            }
        }
    }

    /// @dev Aggressive: buy high-tier rigs, repair only at 25% durability, no shields
    function _aggressiveDecision(
        AgentSim storage sim,
        AgentRegistry.Agent memory agent,
        uint256 balance,
        uint8 phase
    ) internal {
        // Priority 1: Buy the highest-tier rig affordable
        if (!sim.hasUpgradedRig || _randPercent() < 15) {
            _tryBuyHighestRig(sim, agent, balance, phase);
        }

        // Priority 2: Repair rigs at < 25% durability
        _tryRepairRigs(sim, 25);

        // Priority 3: Upgrade facility if we have power budget issues (20% chance)
        if (_randPercent() < 20) {
            _tryUpgradeFacility(sim, balance, phase);
        }

        // Aggressive agents never buy shields
    }

    /// @dev Defensive: buy mid-tier rigs, repair at 75%, buy shields
    function _defensiveDecision(
        AgentSim storage sim,
        AgentRegistry.Agent memory agent,
        uint256 balance,
        uint8 phase
    ) internal {
        // Priority 1: Buy shields if affordable and don't have one
        if (!sim.hasShield && phase >= 2 && _randPercent() < 40) {
            _tryBuyShield(sim, balance);
        }

        // Priority 2: Repair rigs at < 75% durability
        _tryRepairRigs(sim, 75);

        // Priority 3: Buy a mid-tier rig (T1-T2)
        if (!sim.hasUpgradedRig || _randPercent() < 10) {
            _tryBuyMidRig(sim, agent, balance, phase);
        }

        // Priority 4: Maintain facility
        _tryMaintainFacility(sim, 50);

        // Priority 5: Upgrade facility
        if (_randPercent() < 15) {
            _tryUpgradeFacility(sim, balance, phase);
        }
    }

    /// @dev Balanced: moderate spending on everything
    function _balancedDecision(
        AgentSim storage sim,
        AgentRegistry.Agent memory agent,
        uint256 balance,
        uint8 phase
    ) internal {
        // Priority 1: Maintain facility at 50% condition
        _tryMaintainFacility(sim, 50);

        // Priority 2: Repair rigs at 50% durability
        _tryRepairRigs(sim, 50);

        // Priority 3: Buy a rig (30% chance)
        if (_randPercent() < 30) {
            _tryBuyMidRig(sim, agent, balance, phase);
        }

        // Priority 4: Buy shield (20% chance)
        if (!sim.hasShield && phase >= 2 && _randPercent() < 20) {
            _tryBuyShield(sim, balance);
        }

        // Priority 5: Upgrade facility (10% chance)
        if (_randPercent() < 10) {
            _tryUpgradeFacility(sim, balance, phase);
        }
    }

    /// @dev Nomad: zone-hop, minimal equipment
    function _nomadDecision(
        AgentSim storage sim,
        AgentRegistry.Agent memory,
        uint256 balance,
        uint8 phase
    ) internal {
        // Priority 1: Migrate zones periodically (30% chance per decision round)
        if (_randPercent() < 30 && balance >= 500_000e18) {
            _tryMigrate(sim, balance);
        }

        // Priority 2: Repair rigs at 40% durability
        _tryRepairRigs(sim, 40);

        // Priority 3: Buy a basic rig if we don't have one (T1)
        if (!sim.hasUpgradedRig && balance >= 5_000e18) {
            _tryBuyBasicRig(sim, balance, phase);
        }

        // Priority 4: Maintain facility occasionally
        if (_randPercent() < 15) {
            _tryMaintainFacility(sim, 30);
        }
    }

    // ================================================================
    //                    ACTION HELPERS
    // ================================================================

    function _tryBuyHighestRig(
        AgentSim storage sim,
        AgentRegistry.Agent memory,
        uint256 balance,
        uint8 phase
    ) internal {
        // Determine highest tier available based on phase
        uint8 maxTier = 1;
        if (phase >= 2) maxTier = 3;
        if (phase >= 3) maxTier = 4;

        // Try from highest to lowest
        for (uint8 tier = maxTier; tier >= 1; tier--) {
            uint256 rigCost = _getRigCost(tier);
            if (balance >= rigCost) {
                vm.prank(sim.operator);
                try rigFactory.purchaseRig(sim.agentId, tier) {
                    sim.hasUpgradedRig = true;
                    if (tier > sim.highestRigTier) sim.highestRigTier = tier;
                    _tryEquipLatestRig(sim);
                    return;
                } catch {}
            }
            if (tier == 1) break; // Prevent underflow
        }
    }

    function _tryBuyMidRig(
        AgentSim storage sim,
        AgentRegistry.Agent memory,
        uint256 balance,
        uint8 phase
    ) internal {
        uint8 targetTier = 1;
        if (phase >= 2 && balance >= 25_000e18) targetTier = 2;

        uint256 cost = _getRigCost(targetTier);
        if (balance >= cost) {
            vm.prank(sim.operator);
            try rigFactory.purchaseRig(sim.agentId, targetTier) {
                sim.hasUpgradedRig = true;
                if (targetTier > sim.highestRigTier) sim.highestRigTier = targetTier;
                _tryEquipLatestRig(sim);
            } catch {}
        }
    }

    function _tryBuyBasicRig(
        AgentSim storage sim,
        uint256 balance,
        uint8 /*phase*/
    ) internal {
        uint256 cost = _getRigCost(1);
        if (balance >= cost) {
            vm.prank(sim.operator);
            try rigFactory.purchaseRig(sim.agentId, 1) {
                sim.hasUpgradedRig = true;
                sim.highestRigTier = 1;
                _tryEquipLatestRig(sim);
            } catch {}
        }
    }

    function _tryEquipLatestRig(AgentSim storage sim) internal {
        uint256[] memory rigIds = rigFactory.getAgentRigs(sim.agentId);
        if (rigIds.length == 0) return;

        uint256 latestRigId = rigIds[rigIds.length - 1];
        RigFactory.Rig memory rig = rigFactory.getRig(latestRigId);

        if (!rig.active && rig.durability > 0) {
            vm.prank(sim.operator);
            try rigFactory.equipRig(latestRigId) {} catch {}
        }
    }

    function _tryRepairRigs(AgentSim storage sim, uint256 thresholdPercent) internal {
        uint256[] memory rigIds = rigFactory.getAgentRigs(sim.agentId);
        for (uint256 j = 0; j < rigIds.length; j++) {
            if (rigIds[j] == 0) continue;
            RigFactory.Rig memory rig = rigFactory.getRig(rigIds[j]);
            if (rig.maxDurability == 0) continue;

            uint256 durabilityPercent = (rig.durability * 100) / rig.maxDurability;
            if (durabilityPercent < thresholdPercent) {
                uint256 repairCost = _getRepairCost(rig.tier);
                uint256 bal = chaosToken.balanceOf(sim.operator);
                if (bal >= repairCost) {
                    vm.prank(sim.operator);
                    try rigFactory.repairRig(rigIds[j]) {} catch {}
                }
            }
        }
    }

    function _tryUpgradeFacility(
        AgentSim storage sim,
        uint256 balance,
        uint8 phase
    ) internal {
        if (sim.facilityLevel >= 3) return;
        if (sim.facilityLevel >= 2 && phase < 2) return; // Phase 1 caps at L2

        uint256 cost = _getFacilityUpgradeCost(sim.facilityLevel + 1);
        if (balance >= cost) {
            vm.prank(sim.operator);
            try facilityManager.upgrade(sim.agentId) {
                sim.facilityLevel++;
            } catch {}
        }
    }

    function _tryMaintainFacility(AgentSim storage sim, uint256 conditionThresholdPercent) internal {
        FacilityManager.Facility memory fac = facilityManager.getFacility(sim.agentId);
        if (fac.maxCondition == 0) return;

        uint256 condPercent = (fac.condition * 100) / fac.maxCondition;
        if (condPercent < conditionThresholdPercent) {
            uint256 cost = _getMaintenanceCost(fac.level);
            uint256 bal = chaosToken.balanceOf(sim.operator);
            if (bal >= cost) {
                vm.prank(sim.operator);
                try facilityManager.maintainFacility(sim.agentId) {} catch {}
            }
        }
    }

    function _tryBuyShield(AgentSim storage sim, uint256 balance) internal {
        // Try tier 1 shield (200,000 CHAOS)
        uint256 cost = 200_000e18;
        if (balance >= cost) {
            vm.prank(sim.operator);
            try shieldManager.purchaseShield(sim.agentId, 1) {
                sim.hasShield = true;
            } catch {}
        }
    }

    function _tryMigrate(AgentSim storage sim, uint256 /*balance*/) internal {
        uint8 newZone = uint8(_rand() % 8);
        if (newZone == sim.zone) {
            newZone = (newZone + 1) % 8;
        }

        vm.prank(sim.operator);
        try zoneManager.migrate(sim.agentId, newZone) {
            sim.zone = newZone;
        } catch {}
    }

    // ================================================================
    //                    COSMIC EVENTS
    // ================================================================

    function _tryCosmicEvent() internal {
        uint8 phase = agentRegistry.getGenesisPhase();
        if (phase < 2) {
            // Events disabled in phase 1
            return;
        }

        // Try to trigger -- may fail if cooldown not reached
        try cosmicEngine.triggerEvent() returns (uint256 eventId) {
            cosmicEventsTriggered++;

            CosmicEngine.EventRecord memory evt = cosmicEngine.getEvent(eventId);
            console.log("  [COSMIC] Event #%d triggered: type=%d tier=%d",
                eventId, evt.eventType, evt.severityTier);
            console.log("           Affected zones mask: %d, base damage: %d",
                evt.affectedZonesMask, evt.baseDamage);

            // Process the event immediately
            try cosmicEngine.processEvent(eventId) {
                cosmicEventsProcessed++;
            } catch {
                console.log("  [COSMIC] Event processing failed");
            }
        } catch {
            // Cooldown not reached or phase issue -- expected
        }
    }

    // ================================================================
    //                    COST LOOKUPS
    // ================================================================

    function _getRigCost(uint8 tier) internal pure returns (uint256) {
        if (tier == 0) return 0;
        if (tier == 1) return 5_000e18;
        if (tier == 2) return 25_000e18;
        if (tier == 3) return 100_000e18;
        if (tier == 4) return 350_000e18;
        return type(uint256).max;
    }

    function _getRepairCost(uint8 tier) internal pure returns (uint256) {
        // 50% of original cost, minimum 100 CHAOS for T0
        if (tier == 0) return 100e18;
        if (tier == 1) return 2_500e18;
        if (tier == 2) return 12_500e18;
        if (tier == 3) return 50_000e18;
        if (tier == 4) return 175_000e18;
        return 100e18;
    }

    function _getFacilityUpgradeCost(uint8 level) internal pure returns (uint256) {
        if (level == 2) return 50_000e18;
        if (level == 3) return 200_000e18;
        return type(uint256).max;
    }

    function _getMaintenanceCost(uint8 level) internal pure returns (uint256) {
        if (level == 1) return 1_000e18;
        if (level == 2) return 5_000e18;
        if (level == 3) return 20_000e18;
        return 1_000e18;
    }

    // ================================================================
    //                    METRICS & SNAPSHOTS
    // ================================================================

    function _takeSnapshot() internal {
        uint256 totalHash = miningEngine.totalEffectiveHashrate();
        uint256 supply = chaosToken.totalSupply();
        uint256 burned = chaosToken.totalBurned();
        uint256 active = agentRegistry.activeAgentCount();

        // Calculate average durability across all agents
        uint256 totalDurPct = 0;
        uint256 totalCondPct = 0;
        uint256 sampledAgents = 0;

        // Sample every 10th agent for gas efficiency
        for (uint256 i = 0; i < NUM_AGENTS; i += 10) {
            AgentSim storage sim = simAgents[i];
            uint256[] memory rigIds = rigFactory.getAgentRigs(sim.agentId);

            for (uint256 j = 0; j < rigIds.length; j++) {
                if (rigIds[j] == 0) continue;
                RigFactory.Rig memory rig = rigFactory.getRig(rigIds[j]);
                if (rig.maxDurability > 0) {
                    totalDurPct += (rig.durability * 10000) / rig.maxDurability;
                }
            }

            FacilityManager.Facility memory fac = facilityManager.getFacility(sim.agentId);
            if (fac.maxCondition > 0) {
                totalCondPct += (fac.condition * 10000) / fac.maxCondition;
            }

            sampledAgents++;
        }

        uint256 avgDur = sampledAgents > 0 ? totalDurPct / sampledAgents : 0;
        uint256 avgCond = sampledAgents > 0 ? totalCondPct / sampledAgents : 0;

        // Zone counts
        for (uint8 z = 0; z < 8; z++) {
            zoneAgentCounts[z] = zoneManager.getZoneAgentCount(z);
        }

        snapshots.push(Snapshot({
            blockNumber: block.number,
            totalHashrate: totalHash,
            totalSupply: supply,
            totalBurned: burned,
            activeAgents: active,
            avgDurability: avgDur,
            avgFacilityCondition: avgCond,
            cosmicEventsTriggered: cosmicEventsTriggered
        }));
    }

    function _printSnapshot(Snapshot memory snap) internal view {
        console.log("--- Block %d ---", snap.blockNumber);
        console.log("  Total Hashrate:      %d", snap.totalHashrate);
        console.log("  Supply (CHAOS):       %d", snap.totalSupply / 1e18);
        console.log("  Burned (CHAOS):       %d", snap.totalBurned / 1e18);
        console.log("  Active Agents:        %d", snap.activeAgents);
        console.log("  Avg Durability (bps): %d / 10000", snap.avgDurability);
        console.log("  Avg Facility Cond:    %d / 10000", snap.avgFacilityCondition);
        console.log("  Cosmic Events So Far: %d", snap.cosmicEventsTriggered);
        console.log("  Zones [0-1]: %d, %d", zoneAgentCounts[0], zoneAgentCounts[1]);
        console.log("  Zones [2-3]: %d, %d", zoneAgentCounts[2], zoneAgentCounts[3]);
        console.log("  Zones [4-5]: %d, %d", zoneAgentCounts[4], zoneAgentCounts[5]);
        console.log("  Zones [6-7]: %d, %d", zoneAgentCounts[6], zoneAgentCounts[7]);
        console.log("");
    }

    // ================================================================
    //                    FINAL SUMMARY
    // ================================================================

    function _printFinalSummary() internal {
        console.log("");
        console.log("=== FINAL METRICS ===");
        console.log("Total blocks simulated: %d", TOTAL_BLOCKS);
        console.log("Cosmic events triggered: %d", cosmicEventsTriggered);
        console.log("Cosmic events processed: %d", cosmicEventsProcessed);
        console.log("");

        // --- Token Economics ---
        console.log("=== TOKEN ECONOMICS ===");
        console.log("Total Supply (CHAOS):  %d", chaosToken.totalSupply() / 1e18);
        console.log("Total Minted (CHAOS):  %d", chaosToken.totalMinted() / 1e18);
        console.log("Total Burned (CHAOS):  %d", chaosToken.totalBurned() / 1e18);
        console.log("");

        // --- Burns by Source ---
        console.log("=== BURNS BY SOURCE (CHAOS) ===");
        console.log("Mining (20%% tax):     %d", tokenBurner.burnsBySource(0) / 1e18);
        console.log("Rig Purchase:          %d", tokenBurner.burnsBySource(1) / 1e18);
        console.log("Facility Upgrade:      %d", tokenBurner.burnsBySource(2) / 1e18);
        console.log("Rig Repair:            %d", tokenBurner.burnsBySource(3) / 1e18);
        console.log("Shield Purchase:       %d", tokenBurner.burnsBySource(4) / 1e18);
        console.log("Migration:             %d", tokenBurner.burnsBySource(5) / 1e18);
        console.log("Facility Maintenance:  %d", tokenBurner.burnsBySource(6) / 1e18);
        console.log("");

        // --- Top 10 Miners ---
        _computeTopMiners();
        console.log("=== TOP 10 MINERS ===");
        for (uint256 i = 0; i < 10; i++) {
            if (topMinerAmounts[i] == 0) break;
            AgentSim storage sim = simAgents[topMinerAgentIds[i]];
            string memory stratName = _strategyName(sim.strategy);
            AgentRegistry.Agent memory agent = agentRegistry.getAgent(sim.agentId);
            console.log("  #%d: Agent %d (%s)", i + 1, sim.agentId, stratName);
            console.log("       zone=%d mined=%d hashrate=%d", uint256(sim.zone), agent.totalMined / 1e18, agent.hashrate);
        }
        console.log("");

        // --- Strategy Performance ---
        _printStrategyPerformance();

        // --- Inactive Agents ---
        uint256 inactiveCount = 0;
        for (uint256 i = 0; i < NUM_AGENTS; i++) {
            AgentRegistry.Agent memory agent = agentRegistry.getAgent(simAgents[i].agentId);
            if (!agent.active) inactiveCount++;
        }
        console.log("=== AGENT STATUS ===");
        console.log("Active agents:   %d", agentRegistry.activeAgentCount());
        console.log("Inactive agents: %d", inactiveCount);
        console.log("");

        // --- Hashrate Over Time ---
        console.log("=== HASHRATE OVER TIME (from snapshots) ===");
        for (uint256 i = 0; i < snapshots.length; i++) {
            console.log("  Block %d: hash=%d supply=%d", snapshots[i].blockNumber, snapshots[i].totalHashrate, snapshots[i].totalSupply / 1e18);
            console.log("           burned=%d dur=%d cond=%d", snapshots[i].totalBurned / 1e18, snapshots[i].avgDurability, snapshots[i].avgFacilityCondition);
        }
        console.log("");
        console.log("========================================================");
        console.log("              END OF SIMULATION");
        console.log("========================================================");
    }

    function _computeTopMiners() internal {
        // Simple insertion sort to find top 10
        for (uint256 i = 0; i < NUM_AGENTS; i++) {
            AgentRegistry.Agent memory agent = agentRegistry.getAgent(simAgents[i].agentId);
            uint256 mined = agent.totalMined;

            // Check if this agent belongs in top 10
            if (mined > topMinerAmounts[9]) {
                topMinerAmounts[9] = mined;
                topMinerAgentIds[9] = i; // Store simAgent index

                // Bubble up
                for (uint256 j = 9; j > 0; j--) {
                    if (topMinerAmounts[j] > topMinerAmounts[j - 1]) {
                        // Swap
                        (topMinerAmounts[j], topMinerAmounts[j - 1]) = (topMinerAmounts[j - 1], topMinerAmounts[j]);
                        (topMinerAgentIds[j], topMinerAgentIds[j - 1]) = (topMinerAgentIds[j - 1], topMinerAgentIds[j]);
                    } else {
                        break;
                    }
                }
            }
        }
    }

    function _printStrategyPerformance() internal {
        uint256[4] memory totalMined;
        uint256[4] memory count;
        uint256[4] memory totalHash;
        uint256[4] memory shieldCount;
        uint256[4] memory upgradedRigCount;

        for (uint256 i = 0; i < NUM_AGENTS; i++) {
            AgentSim storage sim = simAgents[i];
            AgentRegistry.Agent memory agent = agentRegistry.getAgent(sim.agentId);
            uint8 s = sim.strategy;

            totalMined[s] += agent.totalMined;
            count[s]++;
            totalHash[s] += agent.hashrate;
            if (sim.hasShield) shieldCount[s]++;
            if (sim.hasUpgradedRig) upgradedRigCount[s]++;
        }

        console.log("=== STRATEGY PERFORMANCE ===");
        string[4] memory names = ["Aggressive", "Defensive", "Balanced", "Nomad"];
        for (uint256 s = 0; s < 4; s++) {
            if (count[s] == 0) continue;
            console.log("  [%s] (%d agents)", names[s], count[s]);
            console.log("    Avg mined (CHAOS): %d", totalMined[s] / count[s] / 1e18);
            console.log("    Avg hashrate:      %d", totalHash[s] / count[s]);
            console.log("    Upgraded rigs: %d", upgradedRigCount[s]);
            console.log("    Has shield:    %d", shieldCount[s]);
            console.log("");
        }
    }

    function _strategyName(uint8 strategy) internal pure returns (string memory) {
        if (strategy == STRATEGY_AGGRESSIVE) return "Aggressive";
        if (strategy == STRATEGY_DEFENSIVE) return "Defensive";
        if (strategy == STRATEGY_BALANCED) return "Balanced";
        if (strategy == STRATEGY_NOMAD) return "Nomad";
        return "Unknown";
    }
}
