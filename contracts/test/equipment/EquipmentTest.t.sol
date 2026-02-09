// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../test/BaseTest.sol";

contract EquipmentTest is BaseTest {
    // ============================================================
    //                    SETUP OVERRIDE
    // ============================================================

    /// @dev Override wiring so that rigFactory is NOT set on agentRegistry at
    ///      deploy time. This avoids the ordering issue in AgentRegistry.register()
    ///      where mintPotatoRig (which auto-equips and checks power) is called
    ///      before initFacility (which sets up the power budget).
    ///      Our custom _registerAgent handles the correct sequence.
    function _wireContracts() internal override {
        chaosToken.setMinter(address(miningEngine));
        tokenBurner.setAuthorizedBurner(address(miningEngine), true);
        tokenBurner.setAuthorizedBurner(address(rigFactory), true);
        tokenBurner.setAuthorizedBurner(address(facilityManager), true);
        tokenBurner.setAuthorizedBurner(address(shieldManager), true);
        zoneManager.setAgentRegistry(address(agentRegistry));
        agentRegistry.setRegistrar(registrar);
        // Do NOT set rigFactory here -- we handle it in _registerAgentSafe
        agentRegistry.setFacilityManager(address(facilityManager));
        agentRegistry.setMiningEngine(address(miningEngine));
        agentRegistry.setShieldManager(address(shieldManager));
        agentRegistry.setCosmicEngine(address(cosmicEngine));
        rigFactory.setCosmicEngine(address(cosmicEngine));
        shieldManager.setCosmicEngine(address(cosmicEngine));
    }

    // ============================================================
    //                    HELPERS
    // ============================================================

    /// @dev Register an agent with correct init ordering:
    ///      1) register() with no rigFactory set  -> inits facility first
    ///      2) set rigFactory on registry
    ///      3) manually mint potato rig (auto-equips with power now available)
    ///      4) clear rigFactory to avoid double-mint on subsequent registrations
    function _registerAgentSafe(address operator, uint8 zone) internal returns (uint256 agentId) {
        // Step 1: register -- facility gets initialized, no rig mint
        bytes32 moltbookHash = keccak256(abi.encodePacked("moltbook-", operator));
        vm.prank(registrar);
        agentId = agentRegistry.register(operator, moltbookHash, zone);

        // Step 2: set rigFactory so mintPotatoRig can call agentRegistry.updateHashrate
        agentRegistry.setRigFactory(address(rigFactory));

        // Step 3: mint the potato rig (auto-equips)
        vm.prank(address(agentRegistry));
        rigFactory.mintPotatoRig(agentId, operator);

        // Step 4: clear rigFactory to prevent double-mint on next register() call
        agentRegistry.setRigFactory(address(0));
    }

    /// @dev Bulk-register dummy agents for phase advancement.
    ///      Uses the same safe ordering.
    function _registerBulkAgents(uint256 startIdx, uint256 count) internal {
        for (uint256 i = startIdx; i < startIdx + count; i++) {
            address fakeOp = address(uint160(0xF0000 + i));
            _registerAgentSafe(fakeOp, uint8(i % 8));
        }
    }

    /// @dev Deal CHAOS tokens to an operator and approve a spender.
    function _fundAndApprove(address operator, address spender, uint256 amount) internal {
        deal(address(chaosToken), operator, amount);
        vm.prank(operator);
        chaosToken.approve(spender, type(uint256).max);
    }

    /// @dev Register alice in zone 0 and return her agentId.
    function _registerAlice() internal returns (uint256) {
        return _registerAgentSafe(alice, 0);
    }

    /// @dev Register bob in a given zone and return his agentId.
    function _registerBobInZone(uint8 zone) internal returns (uint256) {
        return _registerAgentSafe(bob, zone);
    }

    // ============================================================
    //             FACILITY MANAGER -- initFacility
    // ============================================================

    function test_initFacility_setsL1Burrow() public {
        uint256 agentId = _registerAlice();

        assertEq(facilityManager.getFacilityLevel(agentId), 1, "level should be 1");
        assertEq(facilityManager.getSlots(agentId), 2, "slots should be 2");
        assertEq(facilityManager.getPowerOutput(agentId), 500, "power should be 500W");
        assertEq(facilityManager.getShelterRating(agentId), 5, "shelter should be 5%");
    }

    function test_initFacility_onlyCallableByAgentRegistry() public {
        // Calling initFacility directly from a non-registry address should revert.
        vm.expectRevert(FacilityManager.OnlyAgentRegistry.selector);
        facilityManager.initFacility(999);
    }

    // ============================================================
    //             FACILITY MANAGER -- upgrade
    // ============================================================

    function test_upgrade_L1toL2_costAndBurn() public {
        uint256 agentId = _registerAlice();
        uint256 upgradeCost = 50_000e18;
        _fundAndApprove(alice, address(facilityManager), upgradeCost);

        uint256 treasuryBefore = chaosToken.balanceOf(treasury);

        vm.prank(alice);
        facilityManager.upgrade(agentId);

        assertEq(facilityManager.getFacilityLevel(agentId), 2, "level should be 2");
        assertEq(facilityManager.getSlots(agentId), 4, "slots should be 4 at L2");
        assertEq(facilityManager.getPowerOutput(agentId), 1500, "power should be 1500W at L2");
        assertEq(facilityManager.getShelterRating(agentId), 15, "shelter should be 15% at L2");

        // 75% burned = 37,500 CHAOS
        uint256 expectedBurn = (upgradeCost * 75) / 100;
        assertEq(expectedBurn, 37_500e18, "burn amount calculation");

        // Treasury receives 25% = 12,500 CHAOS
        uint256 treasuryGain = chaosToken.balanceOf(treasury) - treasuryBefore;
        assertEq(treasuryGain, upgradeCost - expectedBurn, "treasury should get remainder");
    }

    function test_upgrade_L2toL3_costAndBurn() public {
        // Need phase 2+ to unlock L3 upgrade (phase 1 caps at L2)
        _bringToPhase2();

        uint256 agentId = agentRegistry.agentByOperator(alice);
        uint256 totalNeeded = 50_000e18 + 200_000e18;
        _fundAndApprove(alice, address(facilityManager), totalNeeded);

        // L1 -> L2
        vm.prank(alice);
        facilityManager.upgrade(agentId);

        uint256 treasuryBefore = chaosToken.balanceOf(treasury);

        // L2 -> L3
        vm.prank(alice);
        facilityManager.upgrade(agentId);

        assertEq(facilityManager.getFacilityLevel(agentId), 3, "level should be 3");
        assertEq(facilityManager.getSlots(agentId), 6, "slots should be 6 at L3");
        assertEq(facilityManager.getPowerOutput(agentId), 4000, "power should be 4000W at L3");
        assertEq(facilityManager.getShelterRating(agentId), 25, "shelter should be 25% at L3");

        uint256 expectedBurn = (200_000e18 * 75) / 100;
        uint256 treasuryGain = chaosToken.balanceOf(treasury) - treasuryBefore;
        assertEq(treasuryGain, 200_000e18 - expectedBurn, "treasury should get 25% of L3 cost");
    }

    function test_upgrade_pastL3_reverts() public {
        // Need phase 2+ so we can reach L3
        _bringToPhase2();

        uint256 agentId = agentRegistry.agentByOperator(alice);
        _fundAndApprove(alice, address(facilityManager), 250_000e18);

        vm.startPrank(alice);
        facilityManager.upgrade(agentId); // L1 -> L2
        facilityManager.upgrade(agentId); // L2 -> L3
        vm.stopPrank();

        // L3 -> L4 should revert
        _fundAndApprove(alice, address(facilityManager), 1_000_000e18);
        vm.prank(alice);
        vm.expectRevert(FacilityManager.AlreadyMaxLevel.selector);
        facilityManager.upgrade(agentId);
    }

    function test_upgrade_genesisPhase1_cannotExceedL2() public {
        // Phase 1 is active when activeAgentCount < 100.
        // We only have 1 agent, so we are in phase 1.
        uint256 agentId = _registerAlice();
        _fundAndApprove(alice, address(facilityManager), 250_000e18);

        // L1 -> L2 succeeds
        vm.prank(alice);
        facilityManager.upgrade(agentId);
        assertEq(facilityManager.getFacilityLevel(agentId), 2);

        // L2 -> L3 should revert with PhaseLocked because we are in phase 1
        vm.prank(alice);
        vm.expectRevert(FacilityManager.PhaseLocked.selector);
        facilityManager.upgrade(agentId);
    }

    function test_upgrade_requiresOperatorAsMsgSender() public {
        uint256 agentId = _registerAlice();
        _fundAndApprove(alice, address(facilityManager), 50_000e18);

        // Bob tries to upgrade alice's facility
        vm.prank(bob);
        vm.expectRevert(FacilityManager.NotAgentOperator.selector);
        facilityManager.upgrade(agentId);
    }

    // ============================================================
    //             FACILITY MANAGER -- View Functions
    // ============================================================

    function test_facilityViewFunctions() public {
        uint256 agentId = _registerAlice();

        FacilityManager.Facility memory fac = facilityManager.getFacility(agentId);
        assertEq(fac.level, 1);
        assertEq(fac.slots, 2);
        assertEq(fac.powerOutput, 500);
        assertEq(fac.shelterRating, 5);

        assertEq(facilityManager.getShelterRating(agentId), 5);
        assertEq(facilityManager.getFacilityLevel(agentId), 1);
        assertEq(facilityManager.getPowerOutput(agentId), 500);
        assertEq(facilityManager.getSlots(agentId), 2);
    }

    // ============================================================
    //             RIG FACTORY -- Potato Rig on Registration
    // ============================================================

    function test_registration_mintsPotatoRig() public {
        uint256 agentId = _registerAlice();

        // Agent should have one rig
        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        assertEq(rigIds.length, 1, "should have 1 rig");

        uint256 rigId = rigIds[0];
        RigFactory.Rig memory rig = rigFactory.getRig(rigId);

        assertEq(rig.tier, 0, "should be T0");
        assertEq(rig.baseHashrate, 10, "T0 hashrate = 10");
        assertEq(rig.powerDraw, 50, "T0 power draw = 50W");
        assertTrue(rig.active, "T0 should be auto-equipped");
        assertEq(rig.ownerAgentId, agentId, "rig owner");
        assertEq(rig.durability, 1000, "T0 max durability");
    }

    function test_potatoRig_sympathyHashQuirk() public {
        uint256 agentId = _registerAlice();

        // With only the potato rig active, Sympathy Hash gives +50%
        // base 10 -> effective 15
        uint256 effectiveHash = rigFactory.calculateEffectiveHashrate(agentId);

        // Zone 0 = +15% (1500 bps), pioneer phase 1 = +10% (1000 bps)
        // Base with quirk: 15
        // After pioneer bonus: 15 + (15 * 1000 / 10000) = 15 + 1 = 16
        // After zone mod: 16 + (16 * 1500 / 10000) = 16 + 2 = 18
        assertEq(effectiveHash, 18, "effective hashrate with sympathy hash + pioneer + zone 0");
    }

    function test_potatoRig_sympathyHashLostWithSecondRig() public {
        uint256 agentId = _registerAlice();
        _fundAndApprove(alice, address(rigFactory), 5_000e18);

        // Need rigFactory set on registry for hashrate updates during equip
        agentRegistry.setRigFactory(address(rigFactory));

        // Purchase T1 rig
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        // Equip T1
        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 t1RigId = rigIds[1];

        vm.prank(alice);
        rigFactory.equipRig(t1RigId);

        // Now 2 active rigs: sympathy hash no longer applies to T0.
        // T0 base = 10 (no quirk, no efficiency bonus for T0), T1 base = 50
        // T1 Junkyard Dog in L1 facility: +10% -> 55
        // T1 Efficiency bonus +5%: 55 + 2 = 57
        // Total base = 10 + 57 = 67
        // Pioneer bonus (+10%): 67 + 6 = 73  (67 * 1000 / 10000 = 6)
        // Zone 0 (+15%): 73 + 10 = 83  (73 * 1500 / 10000 = 10)
        uint256 effectiveHash = rigFactory.calculateEffectiveHashrate(agentId);
        assertEq(effectiveHash, 83, "hashrate without sympathy hash, with junkyard dog");

        // Cleanup
        agentRegistry.setRigFactory(address(0));
    }

    // ============================================================
    //             RIG FACTORY -- purchaseRig
    // ============================================================

    function test_purchaseRig_T1_cost() public {
        uint256 agentId = _registerAlice();
        uint256 cost = 5_000e18;
        _fundAndApprove(alice, address(rigFactory), cost);

        uint256 treasuryBefore = chaosToken.balanceOf(treasury);

        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        // 75% burned = 3,750 CHAOS
        uint256 expectedBurn = (cost * 75) / 100;
        assertEq(expectedBurn, 3_750e18, "T1 burn amount");

        // Treasury gets 25%
        uint256 treasuryGain = chaosToken.balanceOf(treasury) - treasuryBefore;
        assertEq(treasuryGain, cost - expectedBurn, "treasury receives 25%");

        // Alice should have 0 tokens left
        assertEq(chaosToken.balanceOf(alice), 0, "alice spent all tokens");
    }

    function test_purchaseRig_T2_cost() public {
        // Need >= 50 agents to be in phase 2 for T2
        _bringToPhase2();

        uint256 agentId = agentRegistry.agentByOperator(alice);
        uint256 cost = 25_000e18;
        _fundAndApprove(alice, address(rigFactory), cost);

        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 2);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        // Should have potato rig + purchased T2
        assertEq(rigIds.length, 2, "should have 2 rigs");

        RigFactory.Rig memory rig = rigFactory.getRig(rigIds[1]);
        assertEq(rig.tier, 2, "should be T2");
        assertEq(rig.baseHashrate, 150, "T2 hashrate = 150");
        assertEq(rig.powerDraw, 400, "T2 power draw = 400W");
    }

    function test_purchaseRig_T3_cost() public {
        _bringToPhase2();

        uint256 agentId = agentRegistry.agentByOperator(alice);
        uint256 cost = 100_000e18;
        _fundAndApprove(alice, address(rigFactory), cost);

        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 3);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        RigFactory.Rig memory rig = rigFactory.getRig(rigIds[1]);
        assertEq(rig.tier, 3, "should be T3");
        assertEq(rig.baseHashrate, 400, "T3 hashrate = 400");
        assertEq(rig.powerDraw, 800, "T3 power draw = 800W");
    }

    function test_purchaseRig_T4_cost() public {
        _bringToPhase3();

        uint256 agentId = agentRegistry.agentByOperator(alice);
        uint256 cost = 350_000e18;
        _fundAndApprove(alice, address(rigFactory), cost);

        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 4);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        RigFactory.Rig memory rig = rigFactory.getRig(rigIds[1]);
        assertEq(rig.tier, 4, "should be T4");
        assertEq(rig.baseHashrate, 900, "T4 hashrate = 900");
        assertEq(rig.powerDraw, 1200, "T4 power draw = 1200W");
    }

    // ============================================================
    //             RIG FACTORY -- Genesis Phase Gating
    // ============================================================

    function test_purchaseRig_phase1_maxT1() public {
        // Phase 1: activeAgentCount < 100 -> can only buy T1
        uint256 agentId = _registerAlice();
        _fundAndApprove(alice, address(rigFactory), 25_000e18);

        // T2 should revert in phase 1
        vm.prank(alice);
        vm.expectRevert(RigFactory.PhaseLocked.selector);
        rigFactory.purchaseRig(agentId, 2);

        // T1 should succeed
        _fundAndApprove(alice, address(rigFactory), 5_000e18);
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);
    }

    function test_purchaseRig_phase2_maxT3() public {
        _bringToPhase2();

        uint256 agentId = agentRegistry.agentByOperator(alice);
        _fundAndApprove(alice, address(rigFactory), 350_000e18);

        // T4 should revert in phase 2
        vm.prank(alice);
        vm.expectRevert(RigFactory.PhaseLocked.selector);
        rigFactory.purchaseRig(agentId, 4);

        // T3 should succeed
        _fundAndApprove(alice, address(rigFactory), 100_000e18);
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 3);
    }

    // ============================================================
    //             RIG FACTORY -- equipRig / power & slot limits
    // ============================================================

    function test_equipRig_respectsPowerBudgetAndSlots() public {
        uint256 agentId = _registerAlice();

        // Need rigFactory set for hashrate updates
        agentRegistry.setRigFactory(address(rigFactory));

        _fundAndApprove(alice, address(rigFactory), 5_000e18);

        // L1 facility: 2 slots, 500W
        // Currently: T0 equipped (50W, 1 slot used)

        // Purchase and equip T1 (200W)
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 t1RigId = rigIds[1];

        vm.prank(alice);
        rigFactory.equipRig(t1RigId);

        // Now: T0(50W) + T1(200W) = 250W used, 2 slots used
        assertEq(rigFactory.getActiveRigCount(agentId), 2, "2 active rigs");
        assertEq(rigFactory.getUsedPower(agentId), 250, "250W used");

        agentRegistry.setRigFactory(address(0));
    }

    function test_equipRig_cannotExceedSlots() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // L1 facility has 2 slots. T0 is already equipped (1 slot).
        // Purchase 2 more T1 rigs to try to exceed 2 slots.
        // Extra funds for dynamic pricing (2nd T1 costs slightly more)
        _fundAndApprove(alice, address(rigFactory), 15_000e18);

        vm.startPrank(alice);
        rigFactory.purchaseRig(agentId, 1); // rig #2
        rigFactory.purchaseRig(agentId, 1); // rig #3
        vm.stopPrank();

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 rig2 = rigIds[1];
        uint256 rig3 = rigIds[2];

        // Equip rig #2 -> 2 slots used
        vm.prank(alice);
        rigFactory.equipRig(rig2);

        // Equip rig #3 -> should revert (no slots available)
        vm.prank(alice);
        vm.expectRevert(RigFactory.NoSlotsAvailable.selector);
        rigFactory.equipRig(rig3);

        agentRegistry.setRigFactory(address(0));
    }

    function test_equipRig_powerBudgetExceeded() public {
        _bringToPhase2();

        uint256 agentId = agentRegistry.agentByOperator(alice);

        agentRegistry.setRigFactory(address(rigFactory));

        // Upgrade facility to L2 (4 slots, 1500W)
        _fundAndApprove(alice, address(facilityManager), 50_000e18);
        vm.prank(alice);
        facilityManager.upgrade(agentId);

        // Buy two T3 rigs (800W each). Phase 2 allows up to T3.
        // Extra funds for dynamic pricing (2nd T3 costs slightly more)
        _fundAndApprove(alice, address(rigFactory), 210_000e18);

        vm.startPrank(alice);
        rigFactory.purchaseRig(agentId, 3); // rig #2
        rigFactory.purchaseRig(agentId, 3); // rig #3
        vm.stopPrank();

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);

        // Equip first T3: T0(50W) + T3(800W) = 850W <= 1500W -> OK
        vm.prank(alice);
        rigFactory.equipRig(rigIds[1]);

        // Equip second T3: 850 + 800 = 1650W > 1500W -> PowerBudgetExceeded
        vm.prank(alice);
        vm.expectRevert(RigFactory.PowerBudgetExceeded.selector);
        rigFactory.equipRig(rigIds[2]);

        agentRegistry.setRigFactory(address(0));
    }

    // ============================================================
    //             RIG FACTORY -- unequipRig
    // ============================================================

    function test_unequipRig_deactivatesAndRecalculates() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        _fundAndApprove(alice, address(rigFactory), 5_000e18);

        // Purchase and equip T1
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 t1RigId = rigIds[1];

        vm.prank(alice);
        rigFactory.equipRig(t1RigId);

        // Both T0 and T1 active
        assertEq(rigFactory.getActiveRigCount(agentId), 2);

        // Unequip T1
        vm.prank(alice);
        rigFactory.unequipRig(t1RigId);

        RigFactory.Rig memory rig = rigFactory.getRig(t1RigId);
        assertFalse(rig.active, "T1 should be deactivated");
        assertEq(rigFactory.getActiveRigCount(agentId), 1, "only T0 active");

        // With only T0 active, sympathy hash returns: effective = 15
        // Then pioneer bonus + zone modifier applied
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        assertGt(agent.hashrate, 0, "hashrate recalculated");

        // Verify the value: T0 sympathy hash = 15, pioneer +10% = 16, zone 0 +15% = 18
        assertEq(agent.hashrate, 18, "hashrate back to sympathy hash value");

        agentRegistry.setRigFactory(address(0));
    }

    function test_unequipRig_revertsIfNotActive() public {
        uint256 agentId = _registerAlice();
        _fundAndApprove(alice, address(rigFactory), 5_000e18);

        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 t1RigId = rigIds[1];
        // T1 is not equipped (active = false)

        vm.prank(alice);
        vm.expectRevert(RigFactory.RigNotActive.selector);
        rigFactory.unequipRig(t1RigId);
    }

    // ============================================================
    //             RIG FACTORY -- repairRig
    // ============================================================

    function test_repairRig_costs50PercentOfOriginal() public {
        uint256 agentId = _registerAlice();
        _fundAndApprove(alice, address(rigFactory), 5_000e18);

        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 t1RigId = rigIds[1];

        // Repair cost for T1: 30% of 5000 = 1500 CHAOS
        uint256 repairCost = 1_500e18;
        _fundAndApprove(alice, address(rigFactory), repairCost);

        uint256 treasuryBefore = chaosToken.balanceOf(treasury);

        vm.prank(alice);
        rigFactory.repairRig(t1RigId);

        // 75% of repair cost burned = 1,875 CHAOS
        uint256 expectedBurn = (repairCost * 75) / 100;
        uint256 treasuryGain = chaosToken.balanceOf(treasury) - treasuryBefore;
        assertEq(treasuryGain, repairCost - expectedBurn, "treasury gets 25% of repair cost");

        // Durability restored to max
        RigFactory.Rig memory rig = rigFactory.getRig(t1RigId);
        assertEq(rig.durability, rig.maxDurability, "durability should be restored");
    }

    function test_repairRig_potatoRigHasMinimumCost() public {
        uint256 agentId = _registerAlice();

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 potatoRigId = rigIds[0];

        // Potato rig cost = 0, so 50% of 0 = 0, but minimum repair cost = 100 CHAOS
        _fundAndApprove(alice, address(rigFactory), 100e18);

        vm.prank(alice);
        rigFactory.repairRig(potatoRigId);

        // Should not revert; the minimum cost of 100 CHAOS was charged
        assertEq(chaosToken.balanceOf(alice), 0, "alice spent 100 CHAOS for potato repair");
    }

    // ============================================================
    //             RIG FACTORY -- T1 Junkyard Dog Quirk
    // ============================================================

    function test_junkyardDog_bonusInL1L2() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        _fundAndApprove(alice, address(rigFactory), 5_000e18);

        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 t1RigId = rigIds[1];

        vm.prank(alice);
        rigFactory.equipRig(t1RigId);

        // L1 facility: Junkyard Dog gives +10% to T1 (50 -> 55)
        // T1 Efficiency bonus +5%: 55 + 2 = 57
        // T0 loses sympathy hash (2 active rigs): T0 = 10
        // Total base = 10 + 57 = 67
        // Pioneer bonus (+10%): 67 + 6 = 73
        // Zone 0 (+15%): 73 + 10 = 83
        uint256 effective = rigFactory.calculateEffectiveHashrate(agentId);
        assertEq(effective, 83, "junkyard dog +10% in L1");

        agentRegistry.setRigFactory(address(0));
    }

    function test_junkyardDog_noBonusInL3() public {
        // Need phase 2+ to upgrade to L3
        _bringToPhase2();

        uint256 agentId = agentRegistry.agentByOperator(alice);

        agentRegistry.setRigFactory(address(rigFactory));

        // Upgrade to L2 then L3
        _fundAndApprove(alice, address(facilityManager), 250_000e18);
        vm.startPrank(alice);
        facilityManager.upgrade(agentId); // L2
        facilityManager.upgrade(agentId); // L3
        vm.stopPrank();

        assertEq(facilityManager.getFacilityLevel(agentId), 3);

        // Purchase and equip T1
        _fundAndApprove(alice, address(rigFactory), 5_000e18);
        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 t1RigId = rigIds[1];

        vm.prank(alice);
        rigFactory.equipRig(t1RigId);

        // L3 facility: Junkyard Dog gives NO bonus (only in L1-L2)
        // T0 = 10 (no sympathy, 2 active), T1 = 50 (no quirk in L3)
        // T1 Efficiency bonus +5%: 50 + 2 = 52
        // Total base = 10 + 52 = 62
        // Alice's pioneer phase is 1 (locked at registration) = +10% (1000 bps)
        // Pioneer bonus: 62 + 6 = 68  (62 * 1000 / 10000 = 6)
        // Zone 0 (+15%): 68 + 10 = 78  (68 * 1500 / 10000 = 10)
        uint256 effective = rigFactory.calculateEffectiveHashrate(agentId);
        assertEq(effective, 78, "junkyard dog no bonus in L3");

        agentRegistry.setRigFactory(address(0));
    }

    // ============================================================
    //             RIG FACTORY -- calculateEffectiveHashrate
    // ============================================================

    function test_calculateEffectiveHashrate_aggregatesAllActive() public {
        uint256 agentId = _registerAlice();

        agentRegistry.setRigFactory(address(rigFactory));

        // Extra funds for dynamic pricing (2nd T1 costs slightly more)
        _fundAndApprove(alice, address(rigFactory), 15_000e18);

        // Purchase two T1 rigs
        vm.startPrank(alice);
        rigFactory.purchaseRig(agentId, 1);
        rigFactory.purchaseRig(agentId, 1);
        vm.stopPrank();

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);

        // Equip first T1 (only 2 slots in L1, so second cannot be equipped)
        vm.prank(alice);
        rigFactory.equipRig(rigIds[1]);

        // T0(50W) + T1(200W) = 250W, 2 slots used
        // T0 = 10 (no sympathy, 2 active), T1 = 55 (junkyard dog +10% in L1)
        // T1 Efficiency bonus +5%: 55 + 2 = 57
        // Total = 10 + 57 = 67
        // Pioneer +10%: 67 + 6 = 73
        // Zone 0 +15%: 73 + 10 = 83
        uint256 effective = rigFactory.calculateEffectiveHashrate(agentId);
        assertEq(effective, 83, "aggregated hashrate with 2 active rigs");

        agentRegistry.setRigFactory(address(0));
    }

    function test_calculateEffectiveHashrate_zoneModifier() public {
        // Register alice in zone 0 (+15% = 1500 bps)
        uint256 agentIdZone0 = _registerAlice();
        uint256 hashZone0 = rigFactory.calculateEffectiveHashrate(agentIdZone0);
        // T0 sympathy = 15, pioneer +10% = 16, zone 0 +15% = 18
        assertEq(hashZone0, 18, "zone 0 +15% applied");

        // Register bob in zone 1 (-10% = -1000 bps)
        uint256 agentIdZone1 = _registerBobInZone(1);
        uint256 hashZone1 = rigFactory.calculateEffectiveHashrate(agentIdZone1);
        // T0 sympathy = 15, pioneer +10% = 16, zone 1 -10%: 16 - 1 = 15
        assertEq(hashZone1, 15, "zone 1 -10% applied");
    }

    function test_calculateEffectiveHashrate_pioneerBonus() public {
        // Phase 1 pioneer: +10% (1000 bps)
        _registerAlice();

        // Register bob in zone 2 (Dark Forest, 0% modifier) for isolated check.
        uint256 bobAgentId = _registerAgentSafe(bob, 2); // zone 2 = 0% modifier

        // Bob: T0 sympathy = 15, pioneer phase 1 = +10%: 15 + 1 = 16, zone 2 = 0%: 16
        uint256 effective = rigFactory.calculateEffectiveHashrate(bobAgentId);
        assertEq(effective, 16, "pioneer bonus +10% applied, no zone mod");
    }

    // ============================================================
    //           RIG FACTORY -- purchaseRig operator check
    // ============================================================

    function test_purchaseRig_requiresOperatorAsMsgSender() public {
        uint256 agentId = _registerAlice();
        _fundAndApprove(alice, address(rigFactory), 5_000e18);

        // Bob tries to purchase for alice's agent
        vm.prank(bob);
        vm.expectRevert(RigFactory.NotAgentOperator.selector);
        rigFactory.purchaseRig(agentId, 1);
    }

    function test_purchaseRig_invalidTierReverts() public {
        uint256 agentId = _registerAlice();
        _fundAndApprove(alice, address(rigFactory), 1_000_000e18);

        // Tier 0 is invalid for purchase (only minted via registration)
        vm.prank(alice);
        vm.expectRevert(RigFactory.InvalidTier.selector);
        rigFactory.purchaseRig(agentId, 0);

        // Tier 5 is invalid
        vm.prank(alice);
        vm.expectRevert(RigFactory.InvalidTier.selector);
        rigFactory.purchaseRig(agentId, 5);
    }

    function test_purchaseRig_insufficientBalance() public {
        uint256 agentId = _registerAlice();
        // Give alice less than T1 cost
        _fundAndApprove(alice, address(rigFactory), 1_000e18);

        vm.prank(alice);
        vm.expectRevert(RigFactory.InsufficientBalance.selector);
        rigFactory.purchaseRig(agentId, 1);
    }

    // ============================================================
    //           RIG FACTORY -- equipRig edge cases
    // ============================================================

    function test_equipRig_alreadyActiveReverts() public {
        uint256 agentId = _registerAlice();

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 potatoRigId = rigIds[0];

        // Potato rig is already active (auto-equipped)
        vm.prank(alice);
        vm.expectRevert(RigFactory.RigAlreadyActive.selector);
        rigFactory.equipRig(potatoRigId);
    }

    function test_equipRig_requiresOperator() public {
        uint256 agentId = _registerAlice();
        _fundAndApprove(alice, address(rigFactory), 5_000e18);

        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);
        uint256 t1RigId = rigIds[1];

        // Bob tries to equip alice's rig
        vm.prank(bob);
        vm.expectRevert(RigFactory.NotAgentOperator.selector);
        rigFactory.equipRig(t1RigId);
    }

    // ============================================================
    //            HELPERS -- Phase manipulation
    // ============================================================

    /// @dev Register enough agents to move from phase 1 to phase 2.
    ///      Phase 2 starts at activeAgentCount >= 50.
    ///      Alice is registered as the first agent so she persists across the test.
    function _bringToPhase2() internal {
        // Register alice first
        _registerAgentSafe(alice, 0);

        // Register 49 more agents to reach 50 total (phase 2 threshold)
        _registerBulkAgents(1, 49);

        assertGe(agentRegistry.activeAgentCount(), 50, "should be in phase 2+");
        assertEq(agentRegistry.getGenesisPhase(), 2, "should be phase 2");
    }

    /// @dev Register enough agents to move to phase 3 (>= 250 agents).
    function _bringToPhase3() internal {
        _registerAgentSafe(alice, 0);

        _registerBulkAgents(1, 249);

        assertGe(agentRegistry.activeAgentCount(), 250, "should be in phase 3+");
        assertEq(agentRegistry.getGenesisPhase(), 3, "should be phase 3");
    }
}
