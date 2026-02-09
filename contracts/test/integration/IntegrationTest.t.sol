// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../test/BaseTest.sol";
import "../../src/libraries/Constants.sol";

contract IntegrationTest is BaseTest {
    // =========================================================================
    //                           test_MiningLoop
    // =========================================================================

    function test_MiningLoop() public {
        // 1. Register alice in zone 0
        uint256 aliceId = _registerAgent(alice, 0);

        // 2. Verify she got Potato Rig (T0) with 10 base hashrate
        uint256[] memory aliceRigs = rigFactory.getAgentRigs(aliceId);
        assertEq(aliceRigs.length, 1, "Alice should have 1 rig");

        RigFactory.Rig memory potatoRig = rigFactory.getRig(aliceRigs[0]);
        assertEq(potatoRig.tier, 0, "Rig should be Potato (T0)");
        assertEq(potatoRig.baseHashrate, 10, "Potato base hashrate should be 10");
        assertTrue(potatoRig.active, "Potato rig should be auto-equipped");

        // Verify effective hashrate on agent > 0
        AgentRegistry.Agent memory agentBefore = agentRegistry.getAgent(aliceId);
        assertGt(agentBefore.hashrate, 0, "Agent hashrate should be > 0 after registration");

        // 3. Skip FIRST_MINE_DELAY + some blocks
        _skipBlocks(Constants.FIRST_MINE_DELAY + 100);

        // 4. Check pending rewards > 0 (view simulates heartbeat reward)
        uint256 pending = miningEngine.getPendingRewards(aliceId);
        assertGt(pending, 0, "Pending rewards should be > 0 after mining delay");

        // 5. Heartbeat to claim rewards (heartbeat triggers mint + burn + transfer)
        uint256 totalBurnedBefore = chaosToken.totalBurned();
        uint256 aliceBalBefore = chaosToken.balanceOf(alice);

        vm.prank(alice);
        agentRegistry.heartbeat(aliceId);

        // 6. Verify alice received CHAOS tokens
        uint256 aliceBalAfter = chaosToken.balanceOf(alice);
        assertGt(aliceBalAfter, aliceBalBefore, "Alice should have received CHAOS tokens");

        // 7. Verify totalBurned > 0 (20% burn-on-earn applied during heartbeat)
        uint256 totalBurnedAfter = chaosToken.totalBurned();
        assertGt(totalBurnedAfter, totalBurnedBefore, "Total burned should have increased from burn-on-earn");

        // 8. Verify tokenBurner.burnsBySource(BURN_SOURCE_MINING) > 0
        uint256 miningBurns = tokenBurner.burnsBySource(Constants.BURN_SOURCE_MINING);
        assertGt(miningBurns, 0, "Mining burn source should be > 0");
    }

    // =========================================================================
    //                       test_EquipmentUpgradeLoop
    // =========================================================================

    // Storage variables used by test_EquipmentUpgradeLoop to avoid stack-too-deep
    uint256 private _eul_aliceId;
    uint256 private _eul_t1RigId;

    function test_EquipmentUpgradeLoop() public {
        // 1. Register alice in zone 3
        _eul_aliceId = _registerAgent(alice, 3);

        // 2-4. Fund alice, approve, purchase T1 rig
        _eul_fundAndPurchase();

        // 5. Equip T1 rig -- verify hashrate increased
        _eul_equipT1Rig();

        // 6. Upgrade facility L1 -> L2
        _eul_upgradeFacility();

        // 7-8. Verify Junkyard Dog quirk and effective hashrate with bonuses
        _eul_verifyJunkyardDogAndBonuses();
    }

    function _eul_fundAndPurchase() internal {
        // 2. Give alice 500,000 CHAOS via deal()
        deal(address(chaosToken), alice, 500_000e18);
        assertEq(chaosToken.balanceOf(alice), 500_000e18, "Alice should have 500k CHAOS");

        // 3. Approve rigFactory and facilityManager to spend
        vm.startPrank(alice);
        chaosToken.approve(address(rigFactory), type(uint256).max);
        chaosToken.approve(address(facilityManager), type(uint256).max);
        vm.stopPrank();

        // 4. Purchase T1 rig (5,000 CHAOS) -- verify burn happened (3,750 burned)
        uint256 burnedBefore = tokenBurner.burnsBySource(Constants.BURN_SOURCE_RIG_PURCHASE);
        uint256 aliceBalBefore = chaosToken.balanceOf(alice);

        vm.prank(alice);
        rigFactory.purchaseRig(_eul_aliceId, 1);

        uint256 rigPurchaseBurn = tokenBurner.burnsBySource(Constants.BURN_SOURCE_RIG_PURCHASE) - burnedBefore;
        assertEq(rigPurchaseBurn, 3_750e18, "T1 rig burn should be 75% of 5,000 = 3,750");
        assertEq(aliceBalBefore - chaosToken.balanceOf(alice), 5_000e18, "Alice should have spent 5,000 CHAOS");
    }

    function _eul_equipT1Rig() internal {
        uint256[] memory aliceRigs = rigFactory.getAgentRigs(_eul_aliceId);
        // The T1 rig should be the second rig (index 1)
        _eul_t1RigId = aliceRigs[1]; // Potato is [0], T1 is [1]
        RigFactory.Rig memory t1Rig = rigFactory.getRig(_eul_t1RigId);
        assertEq(t1Rig.tier, 1, "Second rig should be T1");
        assertFalse(t1Rig.active, "T1 rig should not be auto-equipped");

        uint256 hashBefore = agentRegistry.getAgent(_eul_aliceId).hashrate;

        vm.prank(alice);
        rigFactory.equipRig(_eul_t1RigId);

        uint256 hashAfter = agentRegistry.getAgent(_eul_aliceId).hashrate;
        assertGt(hashAfter, hashBefore, "Hashrate should increase after equipping T1 rig");
    }

    function _eul_upgradeFacility() internal {
        // 6. Upgrade facility L1 -> L2 (50,000 CHAOS) -- verify shelter rating changed to 15%
        uint256 facilityBurnBefore = tokenBurner.burnsBySource(Constants.BURN_SOURCE_FACILITY_UPGRADE);

        assertEq(facilityManager.getFacilityLevel(_eul_aliceId), 1, "Facility should start at L1");
        assertEq(facilityManager.getShelterRating(_eul_aliceId), 5, "L1 shelter rating should be 5%");

        vm.prank(alice);
        facilityManager.upgrade(_eul_aliceId);

        assertEq(facilityManager.getFacilityLevel(_eul_aliceId), 2, "Facility should now be L2");
        assertEq(facilityManager.getShelterRating(_eul_aliceId), 15, "L2 shelter rating should be 15%");

        assertGt(
            tokenBurner.burnsBySource(Constants.BURN_SOURCE_FACILITY_UPGRADE),
            facilityBurnBefore,
            "Facility upgrade burn should have been recorded"
        );
    }

    function _eul_verifyJunkyardDogAndBonuses() internal {
        // 7. Verify Junkyard Dog quirk: T1 rig gets +10% in L2 facility
        //    Unequip and re-equip to trigger hashrate recalculation after facility upgrade
        vm.prank(alice);
        rigFactory.unequipRig(_eul_t1RigId);
        vm.prank(alice);
        rigFactory.equipRig(_eul_t1RigId);

        // With L2 facility, JD quirk gives T1 +10%.
        // T0 Potato: active, but activeCount > 1 so Sympathy Hash does not apply. T0 = 10 base.
        //   T0 efficiency bonus = 0, so T0 contributes 10.
        // T1 Junkyard Dog in L2 (facilityLevel <= 2): 50 * 110 / 100 = 55
        //   T1 efficiency bonus = +5% (500 bps): 55 + 2 = 57
        // Raw total = 10 + 57 = 67
        // Pioneer bonus (phase 1 = +10%): 67 + 6 = 73
        // Zone 3 modifier = +10% (+1000 bps): 73 + 7 = 80
        uint256 expectedRaw = 10 + 57; // Potato(10) + JD T1(55) + T1 eff bonus(2) = 67
        uint256 withPioneer = expectedRaw + (expectedRaw * 1000) / 10_000; // 67 + 6 = 73
        uint256 withZone = withPioneer + (withPioneer * 1000) / 10_000; // 73 + 7 = 80

        uint256 actualHashrate = agentRegistry.getAgent(_eul_aliceId).hashrate;
        assertEq(actualHashrate, withZone, "Effective hashrate should include JD quirk, efficiency bonus, pioneer bonus, and zone mod");

        // 8. Verify total effective hashrate includes pioneer bonus and zone modifier
        assertGt(actualHashrate, expectedRaw, "Effective hashrate should exceed raw rig total due to bonuses");
    }

    // =========================================================================
    //                     test_HeartbeatAndHibernation
    // =========================================================================

    function test_HeartbeatAndHibernation() public {
        // 1. Register alice and bob
        uint256 aliceId = _registerAgent(alice, 0);
        uint256 bobId = _registerAgent(bob, 1);

        assertEq(agentRegistry.activeAgentCount(), 2, "Both agents should be active");
        assertTrue(agentRegistry.isActive(aliceId), "Alice should be active");
        assertTrue(agentRegistry.isActive(bobId), "Bob should be active");

        // 2. Skip past heartbeat timeout (200,001 blocks)
        //    timeout = HEARTBEAT_INTERVAL * HEARTBEAT_TIMEOUT_COUNT = 100,000 * 2 = 200,000
        _skipBlocks(200_001);

        // 3. Call checkHeartbeats for both
        uint256[] memory agentIds = new uint256[](2);
        agentIds[0] = aliceId;
        agentIds[1] = bobId;
        agentRegistry.checkHeartbeats(agentIds);

        // 4. Verify both are hibernated (active = false), activeAgentCount decreased
        assertFalse(agentRegistry.isActive(aliceId), "Alice should be hibernated");
        assertFalse(agentRegistry.isActive(bobId), "Bob should be hibernated");
        assertEq(agentRegistry.activeAgentCount(), 0, "No agents should be active after hibernation");

        // 5. Alice sends heartbeat -- verify she's reactivated
        vm.prank(alice);
        agentRegistry.heartbeat(aliceId);

        assertTrue(agentRegistry.isActive(aliceId), "Alice should be reactivated after heartbeat");
        assertEq(agentRegistry.activeAgentCount(), 1, "Only Alice should be active");

        // 6. Bob stays hibernated
        assertFalse(agentRegistry.isActive(bobId), "Bob should still be hibernated");
    }

    // =========================================================================
    //                          test_FullGameLoop
    // =========================================================================

    // Storage variables used by test_FullGameLoop to avoid stack-too-deep
    uint256 private _fgl_aliceId;
    uint256[] private _fgl_fillerIds;

    function test_FullGameLoop() public {
        // 1. Register 100+ agents (to reach phase 2)
        _fgl_phase1_registerFillers();

        // 2. Register alice in zone 0, 3. Mine and claim, 4. Buy/equip/upgrade
        _fgl_phase2_aliceSetup();

        // 5-8. Cosmic event trigger, process, verify damage
        _fgl_phase3_cosmicEvent();

        // 9. Verify burn counters all positive
        _fgl_phase4_verifyBurns();
    }

    function _fgl_phase1_registerFillers() internal {
        for (uint256 i = 0; i < 100; i++) {
            address op = address(uint160(0xF000 + i));
            _fgl_fillerIds.push(_registerAgent(op, uint8(i % 8)));
        }
        assertEq(agentRegistry.activeAgentCount(), 100, "Should have 100 active agents");
        assertEq(agentRegistry.getGenesisPhase(), 2, "Should be in Genesis Phase 2");
    }

    function _fgl_phase2_aliceSetup() internal {
        // Register alice in zone 0
        _fgl_aliceId = _registerAgent(alice, 0);
        assertEq(agentRegistry.getAgent(_fgl_aliceId).pioneerPhase, 2, "Alice should be in pioneer phase 2");

        // Skip blocks past warmup, heartbeat to earn rewards
        _skipBlocks(Constants.FIRST_MINE_DELAY + 100);

        assertGt(miningEngine.getPendingRewards(_fgl_aliceId), 0, "Alice should have pending rewards");

        vm.prank(alice);
        agentRegistry.heartbeat(_fgl_aliceId);
        assertGt(chaosToken.balanceOf(alice), 0, "Alice should have earned CHAOS from heartbeat");

        // Buy T1 rig, equip, upgrade facility
        deal(address(chaosToken), alice, 500_000e18);

        vm.startPrank(alice);
        chaosToken.approve(address(rigFactory), type(uint256).max);
        chaosToken.approve(address(facilityManager), type(uint256).max);
        vm.stopPrank();

        uint256 rigBurnsBefore = tokenBurner.burnsBySource(Constants.BURN_SOURCE_RIG_PURCHASE);

        vm.prank(alice);
        rigFactory.purchaseRig(_fgl_aliceId, 1);
        assertGt(
            tokenBurner.burnsBySource(Constants.BURN_SOURCE_RIG_PURCHASE),
            rigBurnsBefore,
            "Rig purchase burn should be recorded"
        );

        // Find and equip T1 rig
        uint256 t1RigId = _findInactiveRigByTier(_fgl_aliceId, 1);
        assertGt(t1RigId, 0, "Should have found T1 rig");

        vm.prank(alice);
        rigFactory.equipRig(t1RigId);

        // Upgrade facility L1 -> L2
        uint256 facBurnsBefore = tokenBurner.burnsBySource(Constants.BURN_SOURCE_FACILITY_UPGRADE);

        vm.prank(alice);
        facilityManager.upgrade(_fgl_aliceId);
        assertGt(
            tokenBurner.burnsBySource(Constants.BURN_SOURCE_FACILITY_UPGRADE),
            facBurnsBefore,
            "Facility upgrade burn should be recorded"
        );
        assertEq(facilityManager.getFacilityLevel(_fgl_aliceId), 2, "Alice facility should be L2");
    }

    function _fgl_phase3_cosmicEvent() internal {
        // Skip to event cooldown
        _skipBlocks(Constants.ERA_I_EVENT_COOLDOWN + 1);

        // Trigger cosmic event
        uint256 eventId = cosmicEngine.triggerEvent();
        assertGt(eventId, 0, "Should have triggered an event");

        CosmicEngine.EventRecord memory evt = cosmicEngine.getEvent(eventId);
        assertFalse(evt.processed, "Event should not be processed yet");
        assertGt(evt.severityTier, 0, "Event should have a valid tier");

        // Process event
        cosmicEngine.processEvent(eventId);

        CosmicEngine.EventRecord memory processedEvt = cosmicEngine.getEvent(eventId);
        assertTrue(processedEvt.processed, "Event should be marked as processed");

        // Verify damage if event deals damage
        if (evt.baseDamage > 0) {
            bool anyDamaged = _checkDamageAcrossAgents(evt.affectedZonesMask);
            assertTrue(anyDamaged, "Some rigs should have taken damage from the cosmic event");
        }
    }

    function _fgl_phase4_verifyBurns() internal view {
        assertGt(
            tokenBurner.burnsBySource(Constants.BURN_SOURCE_MINING),
            0,
            "Mining burns should be > 0"
        );
        assertGt(
            tokenBurner.burnsBySource(Constants.BURN_SOURCE_RIG_PURCHASE),
            0,
            "Rig purchase burns should be > 0"
        );
        assertGt(
            tokenBurner.burnsBySource(Constants.BURN_SOURCE_FACILITY_UPGRADE),
            0,
            "Facility upgrade burns should be > 0"
        );
        assertGt(tokenBurner.cumulativeBurned(), 0, "Cumulative burned should be > 0");
    }

    // =========================================================================
    //                          Internal Helpers
    // =========================================================================

    function _findInactiveRigByTier(uint256 agentId, uint8 tier) internal view returns (uint256) {
        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        for (uint256 i = 0; i < rigIds.length; i++) {
            RigFactory.Rig memory r = rigFactory.getRig(rigIds[i]);
            if (r.tier == tier && !r.active) {
                return rigIds[i];
            }
        }
        return 0;
    }

    function _checkDamageAcrossAgents(uint8 affectedMask) internal view returns (bool) {
        // Check alice's rigs (zone 0)
        if (_checkAgentRigsDamaged(_fgl_aliceId, affectedMask, 0)) return true;

        // Check filler agents
        for (uint256 i = 0; i < _fgl_fillerIds.length; i++) {
            uint8 agentZone = uint8(i % 8);
            if ((affectedMask & (1 << agentZone)) == 0) continue;
            if (_checkAgentRigDamageByIndex(i)) return true;
        }
        return false;
    }

    function _checkAgentRigsDamaged(uint256 agentId, uint8 affectedMask, uint8 zone) internal view returns (bool) {
        if ((affectedMask & (1 << zone)) == 0) return false;

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        for (uint256 i = 0; i < rigIds.length; i++) {
            if (rigIds[i] == 0) continue;
            RigFactory.Rig memory rig = rigFactory.getRig(rigIds[i]);
            if (rig.durability < rig.maxDurability) return true;
        }
        return false;
    }

    function _checkAgentRigDamageByIndex(uint256 fillerIndex) internal view returns (bool) {
        uint256 agentId = _fgl_fillerIds[fillerIndex];
        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        for (uint256 j = 0; j < rigIds.length; j++) {
            if (rigIds[j] == 0) continue;
            RigFactory.Rig memory rig = rigFactory.getRig(rigIds[j]);
            if (rig.durability < rig.maxDurability) return true;
        }
        return false;
    }
}
