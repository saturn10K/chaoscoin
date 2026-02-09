// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../test/BaseTest.sol";

contract DegradationTest is BaseTest {
    // ============================================================
    //                    SETUP OVERRIDE
    // ============================================================

    function _wireContracts() internal override {
        chaosToken.setMinter(address(miningEngine));
        tokenBurner.setAuthorizedBurner(address(miningEngine), true);
        tokenBurner.setAuthorizedBurner(address(rigFactory), true);
        tokenBurner.setAuthorizedBurner(address(facilityManager), true);
        tokenBurner.setAuthorizedBurner(address(shieldManager), true);
        zoneManager.setAgentRegistry(address(agentRegistry));
        agentRegistry.setRegistrar(registrar);
        agentRegistry.setFacilityManager(address(facilityManager));
        agentRegistry.setMiningEngine(address(miningEngine));
        rigFactory.setCosmicEngine(address(cosmicEngine));
        shieldManager.setCosmicEngine(address(cosmicEngine));
    }

    // ============================================================
    //                    HELPERS
    // ============================================================

    function _registerAgentSafe(address operator, uint8 zone) internal returns (uint256 agentId) {
        bytes32 moltbookHash = keccak256(abi.encodePacked("moltbook-", operator));
        vm.prank(registrar);
        agentId = agentRegistry.register(operator, moltbookHash, zone);

        agentRegistry.setRigFactory(address(rigFactory));
        vm.prank(address(agentRegistry));
        rigFactory.mintPotatoRig(agentId, operator);
        agentRegistry.setRigFactory(address(0));
    }

    function _fundAndApprove(address operator, address spender, uint256 amount) internal {
        deal(address(chaosToken), operator, amount);
        vm.prank(operator);
        chaosToken.approve(spender, type(uint256).max);
    }

    function _registerAlice() internal returns (uint256) {
        return _registerAgentSafe(alice, 2); // zone 2 = 0% modifier for cleaner math
    }

    function _registerAliceInPhase2() internal returns (uint256) {
        _bringToPhase2();
        return agentRegistry.agentByOperator(alice);
    }

    function _registerBulkAgents(uint256 startIdx, uint256 count) internal {
        for (uint256 i = startIdx; i < startIdx + count; i++) {
            address fakeOp = address(uint160(0xF0000 + i));
            _registerAgentSafe(fakeOp, uint8(i % 8));
        }
    }

    function _bringToPhase2() internal {
        _registerAgentSafe(alice, 2);
        _registerBulkAgents(1, 99);
        assertGe(agentRegistry.activeAgentCount(), 100);
    }

    // ============================================================
    //             RIG DEGRADATION -- applyWear
    // ============================================================

    function test_rigWear_T0_noWear() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // T0 potato rig should not degrade
        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        RigFactory.Rig memory rigBefore = rigFactory.getRig(rigIds[0]);
        uint256 durBefore = rigBefore.durability;

        // Simulate heartbeat with 500 blocks elapsed
        _skipBlocks(500);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        RigFactory.Rig memory rigAfter = rigFactory.getRig(rigIds[0]);
        assertEq(rigAfter.durability, durBefore, "T0 should not lose durability");
        assertTrue(rigAfter.active, "T0 should remain active");

        agentRegistry.setRigFactory(address(0));
    }

    function test_rigWear_T2_reducesDurability() public {
        uint256 agentId = _registerAliceInPhase2();

        agentRegistry.setRigFactory(address(rigFactory));

        // Purchase and equip T2 (wear rate = 1/block, maxDurability = 25000)
        _fundAndApprove(alice, address(rigFactory), 25_000e18);
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 2);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 t2RigId = rigIds[1];

        vm.prank(alice);
        rigFactory.equipRig(t2RigId);

        RigFactory.Rig memory rigBefore = rigFactory.getRig(t2RigId);
        assertEq(rigBefore.durability, 25000, "T2 starts at max durability 25000");

        // Skip 200 blocks and heartbeat
        _skipBlocks(200);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        // T2 wear rate = 1/block, 200 blocks -> 200 durability lost
        RigFactory.Rig memory rigAfter = rigFactory.getRig(t2RigId);
        assertEq(rigAfter.durability, 24800, "T2 should lose 200 durability");
        assertTrue(rigAfter.active, "T2 should still be active");

        agentRegistry.setRigFactory(address(0));
    }

    function test_rigWear_cappedAtMaxHeartbeatWindow() public {
        uint256 agentId = _registerAliceInPhase2();

        agentRegistry.setRigFactory(address(rigFactory));

        // Purchase and equip T2 (wear rate = 1/block, maxDurability = 25000)
        _fundAndApprove(alice, address(rigFactory), 25_000e18);
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 2);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        vm.prank(alice);
        rigFactory.equipRig(rigIds[1]);

        // Skip 10000 blocks (way more than MAX_HEARTBEAT_WINDOW=500)
        _skipBlocks(10_000);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        // Wear should be capped: 500 blocks × 1/block = 500 durability lost (not 10000)
        RigFactory.Rig memory rigAfter = rigFactory.getRig(rigIds[1]);
        assertEq(rigAfter.durability, 24500, "Wear capped at 500 blocks worth");

        agentRegistry.setRigFactory(address(0));
    }

    function test_rigWear_durabilityAffectsHashrate() public {
        uint256 agentId = _registerAliceInPhase2();

        agentRegistry.setRigFactory(address(rigFactory));

        // Purchase and equip T2 (wear rate = 1/block, maxDurability = 25000)
        _fundAndApprove(alice, address(rigFactory), 25_000e18);
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 2);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        vm.prank(alice);
        rigFactory.equipRig(rigIds[1]);

        uint256 hashFull = rigFactory.calculateEffectiveHashrate(agentId);

        // Apply wear: skip 500 blocks (T2 loses 500 durability: 25000 -> 24500 = 98%)
        _skipBlocks(500);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        uint256 hashWorn = rigFactory.calculateEffectiveHashrate(agentId);

        // Hashrate should be lower due to durability scaling
        assertTrue(hashWorn < hashFull, "Worn rig should produce less hashrate");

        agentRegistry.setRigFactory(address(0));
    }

    function test_rigWear_disablesAtZeroDurability() public {
        uint256 agentId = _registerAliceInPhase2();

        agentRegistry.setRigFactory(address(rigFactory));

        // Purchase and equip T2 (25000 max durability, wear rate 1/block)
        _fundAndApprove(alice, address(rigFactory), 25_000e18);
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 2);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        vm.prank(alice);
        rigFactory.equipRig(rigIds[1]);

        // Heartbeat repeatedly to drain durability
        // Each heartbeat does max 500 blocks of wear = 500 durability (rate 1 × 500 blocks)
        // Need 50 heartbeats to drain 25000 durability
        for (uint256 i = 0; i < 50; i++) {
            _skipBlocks(500);
            vm.prank(alice);
            agentRegistry.heartbeat(agentId);
        }

        RigFactory.Rig memory rig = rigFactory.getRig(rigIds[1]);
        assertEq(rig.durability, 0, "T2 should be at 0 durability");
        assertFalse(rig.active, "T2 should be disabled by wear");

        agentRegistry.setRigFactory(address(0));
    }

    function test_rigWear_repairRestoresDurabilityAndHashrate() public {
        uint256 agentId = _registerAliceInPhase2();

        agentRegistry.setRigFactory(address(rigFactory));

        // Purchase and equip T2 (25000 cost, wear rate 1/block)
        _fundAndApprove(alice, address(rigFactory), 25_000e18);
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 2);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        vm.prank(alice);
        rigFactory.equipRig(rigIds[1]);

        uint256 hashFull = rigFactory.calculateEffectiveHashrate(agentId);

        // Apply some wear
        _skipBlocks(500);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        uint256 hashWorn = rigFactory.calculateEffectiveHashrate(agentId);
        assertTrue(hashWorn < hashFull, "Should be worn down");

        // Repair the T2 rig (cost = 30% of 25000 = 7500 CHAOS)
        _fundAndApprove(alice, address(rigFactory), 7_500e18);
        vm.prank(alice);
        rigFactory.repairRig(rigIds[1]);

        RigFactory.Rig memory rigRepaired = rigFactory.getRig(rigIds[1]);
        assertEq(rigRepaired.durability, rigRepaired.maxDurability, "Durability fully restored");

        uint256 hashRepaired = rigFactory.calculateEffectiveHashrate(agentId);
        assertEq(hashRepaired, hashFull, "Hashrate should match full durability");

        agentRegistry.setRigFactory(address(0));
    }

    // ============================================================
    //             FACILITY DEGRADATION -- applyWear
    // ============================================================

    function test_facilityWear_reducesCondition() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        FacilityManager.Facility memory facBefore = facilityManager.getFacility(agentId);
        assertEq(facBefore.condition, Constants.FACILITY_MAX_CONDITION_L1, "Starts at max condition");

        // Skip 300 blocks and heartbeat
        _skipBlocks(300);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        FacilityManager.Facility memory facAfter = facilityManager.getFacility(agentId);
        // Wear rate = 1/block, 300 blocks -> 300 condition lost
        assertEq(facAfter.condition, Constants.FACILITY_MAX_CONDITION_L1 - 300, "Should lose 300 condition");

        agentRegistry.setRigFactory(address(0));
    }

    function test_facilityWear_conditionAffectsPowerOutput() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // Full condition: power = 500
        uint32 powerFull = facilityManager.getPowerOutput(agentId);
        assertEq(powerFull, 500, "Full power at max condition");

        // Drain half condition (L1 max = 50000, so drain 25000)
        // Heartbeat with 500 blocks at a time, need 50 heartbeats for 25000
        for (uint256 i = 0; i < 50; i++) {
            _skipBlocks(500);
            vm.prank(alice);
            agentRegistry.heartbeat(agentId);
        }

        FacilityManager.Facility memory fac = facilityManager.getFacility(agentId);
        assertEq(fac.condition, 25000, "Should be at half condition");

        uint32 powerHalf = facilityManager.getPowerOutput(agentId);
        assertEq(powerHalf, 250, "Power should be halved at 50% condition");

        agentRegistry.setRigFactory(address(0));
    }

    function test_facilityWear_conditionAffectsShelterRating() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // Full condition: shelter = 5
        uint8 shelterFull = facilityManager.getShelterRating(agentId);
        assertEq(shelterFull, 5, "Full shelter at max condition");

        // Drain to 0 condition
        for (uint256 i = 0; i < 100; i++) {
            _skipBlocks(500);
            vm.prank(alice);
            agentRegistry.heartbeat(agentId);
        }

        FacilityManager.Facility memory fac = facilityManager.getFacility(agentId);
        assertEq(fac.condition, 0, "Should be at zero condition");

        uint8 shelterZero = facilityManager.getShelterRating(agentId);
        assertEq(shelterZero, 0, "Shelter should be 0 at zero condition");

        agentRegistry.setRigFactory(address(0));
    }

    function test_facilityWear_cappedAtMaxHeartbeatWindow() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // Skip a lot of blocks
        _skipBlocks(100_000);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        // Wear capped at 500 blocks × 1/block = 500 condition lost
        FacilityManager.Facility memory fac = facilityManager.getFacility(agentId);
        assertEq(fac.condition, Constants.FACILITY_MAX_CONDITION_L1 - 500, "Wear capped at 500");

        agentRegistry.setRigFactory(address(0));
    }

    // ============================================================
    //             FACILITY MAINTENANCE
    // ============================================================

    function test_facilityMaintenance_restoresCondition() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // Apply some wear
        _skipBlocks(500);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        FacilityManager.Facility memory facWorn = facilityManager.getFacility(agentId);
        assertTrue(facWorn.condition < facWorn.maxCondition, "Should be worn");

        // Maintain: L1 cost = 1000 CHAOS
        _fundAndApprove(alice, address(facilityManager), 1_000e18);
        vm.prank(alice);
        facilityManager.maintainFacility(agentId);

        FacilityManager.Facility memory facMaintained = facilityManager.getFacility(agentId);
        assertEq(facMaintained.condition, facMaintained.maxCondition, "Condition fully restored");

        agentRegistry.setRigFactory(address(0));
    }

    function test_facilityMaintenance_burns75Percent() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // Apply wear
        _skipBlocks(500);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        // Maintain
        uint256 cost = 1_000e18;
        _fundAndApprove(alice, address(facilityManager), cost);

        uint256 treasuryBefore = chaosToken.balanceOf(treasury);
        uint256 burnBefore = tokenBurner.cumulativeBurned();

        vm.prank(alice);
        facilityManager.maintainFacility(agentId);

        uint256 expectedBurn = (cost * 75) / 100;
        uint256 burnAfter = tokenBurner.cumulativeBurned();
        uint256 treasuryGain = chaosToken.balanceOf(treasury) - treasuryBefore;

        assertEq(burnAfter - burnBefore, expectedBurn, "75% should be burned");
        assertEq(treasuryGain, cost - expectedBurn, "25% should go to treasury");

        agentRegistry.setRigFactory(address(0));
    }

    function test_facilityMaintenance_revertsAtFullCondition() public {
        uint256 agentId = _registerAlice();

        // Try to maintain at full condition — should revert
        _fundAndApprove(alice, address(facilityManager), 1_000e18);
        vm.prank(alice);
        vm.expectRevert(FacilityManager.FacilityAtFullCondition.selector);
        facilityManager.maintainFacility(agentId);
    }

    function test_facilityMaintenance_requiresOperator() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // Apply wear
        _skipBlocks(500);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        // Bob tries to maintain alice's facility
        _fundAndApprove(bob, address(facilityManager), 1_000e18);
        vm.prank(bob);
        vm.expectRevert(FacilityManager.NotAgentOperator.selector);
        facilityManager.maintainFacility(agentId);

        agentRegistry.setRigFactory(address(0));
    }

    function test_facilityMaintenance_L2Cost() public {
        _bringToPhase2();
        uint256 agentId = agentRegistry.agentByOperator(alice);

        agentRegistry.setRigFactory(address(rigFactory));

        // Upgrade to L2
        _fundAndApprove(alice, address(facilityManager), 50_000e18);
        vm.prank(alice);
        facilityManager.upgrade(agentId);

        FacilityManager.Facility memory fac = facilityManager.getFacility(agentId);
        assertEq(fac.maxCondition, Constants.FACILITY_MAX_CONDITION_L2, "L2 max condition");

        // Apply wear
        _skipBlocks(500);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        // Maintain L2: cost = 5000 CHAOS
        _fundAndApprove(alice, address(facilityManager), 5_000e18);
        vm.prank(alice);
        facilityManager.maintainFacility(agentId);

        FacilityManager.Facility memory facAfter = facilityManager.getFacility(agentId);
        assertEq(facAfter.condition, facAfter.maxCondition, "L2 condition fully restored");

        // Alice should have 0 tokens (spent exactly the cost)
        assertEq(chaosToken.balanceOf(alice), 0, "Exact L2 maintenance cost consumed");

        agentRegistry.setRigFactory(address(0));
    }

    function test_facilityUpgrade_resetsCondition() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // Wear down L1 facility
        _skipBlocks(500);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        FacilityManager.Facility memory facWorn = facilityManager.getFacility(agentId);
        assertTrue(facWorn.condition < facWorn.maxCondition, "L1 should be worn");

        // Upgrade to L2 — condition should reset to L2 max
        _fundAndApprove(alice, address(facilityManager), 50_000e18);
        vm.prank(alice);
        facilityManager.upgrade(agentId);

        FacilityManager.Facility memory facUpgraded = facilityManager.getFacility(agentId);
        assertEq(facUpgraded.condition, Constants.FACILITY_MAX_CONDITION_L2, "Upgrade resets condition");
        assertEq(facUpgraded.maxCondition, Constants.FACILITY_MAX_CONDITION_L2, "New max condition");

        agentRegistry.setRigFactory(address(0));
    }

    // ============================================================
    //             INTEGRATION: Wear affects mining rewards
    // ============================================================

    function test_integration_wearReducesHashrateShare() public {
        // Need phase 2 to buy T2 rigs, bring to phase 2 first
        _bringToPhase2();
        uint256 agentId = agentRegistry.agentByOperator(alice);
        uint256 bobId = _registerAgentSafe(bob, 2);

        agentRegistry.setRigFactory(address(rigFactory));

        // Give alice a T2 rig (will degrade, wear rate 1/block, 25000 max durability)
        _fundAndApprove(alice, address(rigFactory), 25_000e18);
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 2);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        vm.prank(alice);
        rigFactory.equipRig(rigIds[1]);

        // Alice hashrate: T0(10) + T2(100 × durability% × 1.12 efficiency) with quirk etc
        // Bob hashrate: just T0(15 sympathy hash) — unchanged by wear

        uint256 aliceHashBefore = rigFactory.calculateEffectiveHashrate(agentId);
        uint256 bobHash = rigFactory.calculateEffectiveHashrate(bobId);

        // Alice should have higher hashrate initially
        assertTrue(aliceHashBefore > bobHash, "Alice starts with higher hashrate");

        // Apply heavy wear — 50 heartbeats of 500 blocks each = drain T2 fully (25000 durability)
        for (uint256 i = 0; i < 50; i++) {
            _skipBlocks(500);
            vm.prank(alice);
            agentRegistry.heartbeat(agentId);
            vm.prank(bob);
            agentRegistry.heartbeat(bobId);
        }

        // Alice's T2 should be disabled by wear
        RigFactory.Rig memory aliceT2 = rigFactory.getRig(rigIds[1]);
        assertFalse(aliceT2.active, "Alice's T2 should be disabled");

        // Alice's hashrate should have dropped significantly
        uint256 aliceHashAfter = rigFactory.calculateEffectiveHashrate(agentId);
        assertTrue(aliceHashAfter < aliceHashBefore, "Alice's hashrate should drop after wear");

        agentRegistry.setRigFactory(address(0));
    }

    // ============================================================
    //             BURN SOURCE TRACKING
    // ============================================================

    function test_facilityMaintenance_tracksBurnSource() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // Apply wear
        _skipBlocks(500);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        // Maintain
        _fundAndApprove(alice, address(facilityManager), 1_000e18);
        vm.prank(alice);
        facilityManager.maintainFacility(agentId);

        uint256 maintenanceBurns = tokenBurner.burnsBySource(Constants.BURN_SOURCE_FACILITY_MAINTENANCE);
        assertEq(maintenanceBurns, 750e18, "Should track maintenance burns under source 6");

        agentRegistry.setRigFactory(address(0));
    }
}
