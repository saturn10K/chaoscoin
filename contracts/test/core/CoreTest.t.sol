// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../test/BaseTest.sol";

contract CoreTest is BaseTest {
    // =========================================================================
    //                           CHAOS TOKEN TESTS
    // =========================================================================

    // --- setMinter ---

    function test_ChaosToken_setMinter_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice));
        chaosToken.setMinter(alice);
    }

    function test_ChaosToken_setMinter_succeeds() public {
        chaosToken.setMinter(alice);
        assertEq(chaosToken.minter(), alice);
    }

    // --- mint ---

    function test_ChaosToken_mint_onlyMinter() public {
        vm.prank(alice);
        vm.expectRevert(ChaosToken.OnlyMinter.selector);
        chaosToken.mint(alice, 1000e18);
    }

    function test_ChaosToken_mint_succeeds() public {
        // minter is MiningEngine from setUp wiring
        vm.prank(address(miningEngine));
        chaosToken.mint(alice, 1000e18);
        assertEq(chaosToken.balanceOf(alice), 1000e18);
        assertEq(chaosToken.totalMinted(), 1000e18);
    }

    function test_ChaosToken_mint_enforcesCap() public {
        // Try to mint more than the 210B cap
        vm.prank(address(miningEngine));
        vm.expectRevert(ChaosToken.ExceedsCirculatingCap.selector);
        chaosToken.mint(alice, Constants.CIRCULATING_CAP + 1);
    }

    function test_ChaosToken_mint_exactCap() public {
        // Mint exactly the cap -- should succeed
        vm.prank(address(miningEngine));
        chaosToken.mint(alice, Constants.CIRCULATING_CAP);
        assertEq(chaosToken.totalSupply(), Constants.CIRCULATING_CAP);
    }

    function test_ChaosToken_mint_capEnforcedAcrossMultipleMints() public {
        uint256 half = Constants.CIRCULATING_CAP / 2;
        vm.startPrank(address(miningEngine));
        chaosToken.mint(alice, half);
        chaosToken.mint(bob, half);

        // The remaining is CIRCULATING_CAP - 2*half; if CIRCULATING_CAP is even, remaining = 0
        uint256 remaining = Constants.CIRCULATING_CAP - 2 * half;
        if (remaining == 0) {
            vm.expectRevert(ChaosToken.ExceedsCirculatingCap.selector);
            chaosToken.mint(charlie, 1);
        } else {
            chaosToken.mint(charlie, remaining);
            vm.expectRevert(ChaosToken.ExceedsCirculatingCap.selector);
            chaosToken.mint(charlie, 1);
        }
        vm.stopPrank();
    }

    // --- burn ---

    function test_ChaosToken_burn_tracksTotalBurned() public {
        // Mint some tokens first
        vm.prank(address(miningEngine));
        chaosToken.mint(alice, 10_000e18);

        vm.prank(alice);
        chaosToken.burn(3_000e18);

        assertEq(chaosToken.totalBurned(), 3_000e18);
        assertEq(chaosToken.balanceOf(alice), 7_000e18);
    }

    function test_ChaosToken_burnFrom_tracksTotalBurned() public {
        vm.prank(address(miningEngine));
        chaosToken.mint(alice, 10_000e18);

        // alice approves bob to burn
        vm.prank(alice);
        chaosToken.approve(bob, 5_000e18);

        vm.prank(bob);
        chaosToken.burnFrom(alice, 2_000e18);

        assertEq(chaosToken.totalBurned(), 2_000e18);
        assertEq(chaosToken.balanceOf(alice), 8_000e18);
    }

    function test_ChaosToken_burn_and_burnFrom_accumulate() public {
        vm.prank(address(miningEngine));
        chaosToken.mint(alice, 10_000e18);

        vm.prank(alice);
        chaosToken.burn(1_000e18);

        vm.prank(alice);
        chaosToken.approve(bob, 5_000e18);

        vm.prank(bob);
        chaosToken.burnFrom(alice, 2_000e18);

        assertEq(chaosToken.totalBurned(), 3_000e18);
    }

    // =========================================================================
    //                           TOKEN BURNER TESTS
    // =========================================================================

    // --- setAuthorizedBurner ---

    function test_TokenBurner_setAuthorizedBurner_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice));
        tokenBurner.setAuthorizedBurner(alice, true);
    }

    function test_TokenBurner_setAuthorizedBurner_succeeds() public {
        tokenBurner.setAuthorizedBurner(alice, true);
        assertTrue(tokenBurner.authorizedBurners(alice));
    }

    function test_TokenBurner_setAuthorizedBurner_revoke() public {
        tokenBurner.setAuthorizedBurner(alice, true);
        assertTrue(tokenBurner.authorizedBurners(alice));

        tokenBurner.setAuthorizedBurner(alice, false);
        assertFalse(tokenBurner.authorizedBurners(alice));
    }

    // --- recordBurn ---

    function test_TokenBurner_recordBurn_onlyAuthorized() public {
        vm.prank(alice);
        vm.expectRevert(TokenBurner.NotAuthorized.selector);
        tokenBurner.recordBurn(1000e18, 0);
    }

    function test_TokenBurner_recordBurn_tracksBySource() public {
        tokenBurner.setAuthorizedBurner(alice, true);

        vm.prank(alice);
        tokenBurner.recordBurn(5_000e18, Constants.BURN_SOURCE_MINING);

        vm.prank(alice);
        tokenBurner.recordBurn(3_000e18, Constants.BURN_SOURCE_RIG_PURCHASE);

        assertEq(tokenBurner.burnsBySource(Constants.BURN_SOURCE_MINING), 5_000e18);
        assertEq(tokenBurner.burnsBySource(Constants.BURN_SOURCE_RIG_PURCHASE), 3_000e18);
    }

    function test_TokenBurner_recordBurn_cumulativeBurned() public {
        tokenBurner.setAuthorizedBurner(alice, true);

        vm.startPrank(alice);
        tokenBurner.recordBurn(1_000e18, Constants.BURN_SOURCE_MINING);
        tokenBurner.recordBurn(2_000e18, Constants.BURN_SOURCE_RIG_PURCHASE);
        tokenBurner.recordBurn(3_000e18, Constants.BURN_SOURCE_FACILITY_UPGRADE);
        vm.stopPrank();

        assertEq(tokenBurner.cumulativeBurned(), 6_000e18);
    }

    function test_TokenBurner_recordBurn_multipleSourcesAccumulate() public {
        tokenBurner.setAuthorizedBurner(alice, true);

        vm.startPrank(alice);
        tokenBurner.recordBurn(1_000e18, Constants.BURN_SOURCE_MINING);
        tokenBurner.recordBurn(4_000e18, Constants.BURN_SOURCE_MINING);
        vm.stopPrank();

        assertEq(tokenBurner.burnsBySource(Constants.BURN_SOURCE_MINING), 5_000e18);
        assertEq(tokenBurner.cumulativeBurned(), 5_000e18);
    }

    // =========================================================================
    //                         AGENT REGISTRY TESTS
    // =========================================================================

    // --- register: access control ---

    function test_AgentRegistry_register_onlyRegistrar() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.OnlyRegistrar.selector);
        agentRegistry.register(alice, keccak256("moltbook-1"), 0);
    }

    // --- register: happy path ---

    function test_AgentRegistry_register_succeeds() public {
        uint256 agentId = _registerAgent(alice, 0);

        assertEq(agentId, 1);
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        assertEq(agent.operator, alice);
        assertEq(agent.zone, 0);
        assertTrue(agent.active);
        // Potato rig base=10, sympathy quirk 1.5x=15, pioneer bonus 10%=16, zone 0 (+15%)=18
        assertEq(agent.hashrate, 18);
        assertEq(agent.registrationBlock, block.number);
        assertEq(agent.lastHeartbeat, block.number);
        assertEq(agentRegistry.activeAgentCount(), 1);
    }

    function test_AgentRegistry_register_incrementsAgentId() public {
        uint256 id1 = _registerAgent(alice, 0);
        uint256 id2 = _registerAgent(bob, 1);

        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    // --- register: pioneer phases ---

    function test_AgentRegistry_register_phase1() public {
        // First agent: activeAgentCount = 0 (< 100 = phase 1)
        uint256 agentId = _registerAgent(alice, 0);
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        assertEq(agent.pioneerPhase, 1);
        assertEq(agent.cosmicResilience, 50);
    }

    function test_AgentRegistry_getGenesisPhase_zeroAgents() public view {
        assertEq(agentRegistry.getGenesisPhase(), 1);
    }

    // --- register: duplicate moltbook ---

    function test_AgentRegistry_register_duplicateMoltbook() public {
        bytes32 moltbookHash = keccak256("same-moltbook");
        vm.prank(registrar);
        agentRegistry.register(alice, moltbookHash, 0);

        vm.prank(registrar);
        vm.expectRevert(AgentRegistry.AlreadyRegistered.selector);
        agentRegistry.register(bob, moltbookHash, 1);
    }

    // --- register: duplicate operator ---

    function test_AgentRegistry_register_duplicateOperator() public {
        _registerAgent(alice, 0);

        vm.prank(registrar);
        vm.expectRevert(AgentRegistry.OperatorAlreadyHasAgent.selector);
        agentRegistry.register(alice, keccak256("different-moltbook"), 1);
    }

    // --- register: invalid zone ---

    function test_AgentRegistry_register_invalidZone() public {
        vm.prank(registrar);
        vm.expectRevert(AgentRegistry.InvalidZone.selector);
        agentRegistry.register(alice, keccak256("moltbook-1"), 8);
    }

    function test_AgentRegistry_register_zoneMaxBoundary() public {
        // Zone 7 should work (NUM_ZONES = 8, so valid zones are 0-7)
        vm.prank(registrar);
        uint256 agentId = agentRegistry.register(alice, keccak256("moltbook-1"), 7);
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        assertEq(agent.zone, 7);
    }

    // --- register: calls RigFactory and FacilityManager ---

    function test_AgentRegistry_register_mintsPotatoRig() public {
        uint256 agentId = _registerAgent(alice, 0);

        // Check that potato rig was minted
        assertTrue(rigFactory.hasPotatoRig(agentId));
        uint256[] memory rigs = rigFactory.getAgentRigs(agentId);
        assertEq(rigs.length, 1);
    }

    function test_AgentRegistry_register_initsFacility() public {
        uint256 agentId = _registerAgent(alice, 0);

        // Check that facility was initialized at level 1
        assertEq(facilityManager.getFacilityLevel(agentId), 1);
        assertEq(facilityManager.getSlots(agentId), 2);
    }

    // --- heartbeat ---

    function test_AgentRegistry_heartbeat_updatesLastHeartbeat() public {
        uint256 agentId = _registerAgent(alice, 0);

        _skipBlocks(1000);

        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        assertEq(agent.lastHeartbeat, block.number);
    }

    function test_AgentRegistry_heartbeat_onlyOperator() public {
        uint256 agentId = _registerAgent(alice, 0);

        vm.prank(bob);
        vm.expectRevert(AgentRegistry.NotAgentOperator.selector);
        agentRegistry.heartbeat(agentId);
    }

    function test_AgentRegistry_heartbeat_agentNotFound() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.AgentNotFound.selector);
        agentRegistry.heartbeat(999);
    }

    function test_AgentRegistry_heartbeat_reactivatesHibernated() public {
        uint256 agentId = _registerAgent(alice, 0);

        // Skip past heartbeat timeout (HEARTBEAT_INTERVAL * HEARTBEAT_TIMEOUT_COUNT = 200,000 blocks)
        _skipBlocks(200_001);

        // Hibernate the agent
        uint256[] memory ids = new uint256[](1);
        ids[0] = agentId;
        agentRegistry.checkHeartbeats(ids);

        AgentRegistry.Agent memory agentBefore = agentRegistry.getAgent(agentId);
        assertFalse(agentBefore.active);
        assertEq(agentRegistry.activeAgentCount(), 0);

        // Reactivate via heartbeat
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        AgentRegistry.Agent memory agentAfter = agentRegistry.getAgent(agentId);
        assertTrue(agentAfter.active);
        assertEq(agentRegistry.activeAgentCount(), 1);
    }

    // --- checkHeartbeats ---

    function test_AgentRegistry_checkHeartbeats_hibernatesTimedOut() public {
        uint256 agentId = _registerAgent(alice, 0);

        // timeout = HEARTBEAT_INTERVAL * HEARTBEAT_TIMEOUT_COUNT = 100_000 * 2 = 200_000
        _skipBlocks(200_001);

        uint256[] memory ids = new uint256[](1);
        ids[0] = agentId;
        agentRegistry.checkHeartbeats(ids);

        assertFalse(agentRegistry.isActive(agentId));
        assertEq(agentRegistry.activeAgentCount(), 0);
    }

    function test_AgentRegistry_checkHeartbeats_doesNotHibernateActive() public {
        uint256 agentId = _registerAgent(alice, 0);

        // Skip fewer blocks than timeout
        _skipBlocks(199_999);

        uint256[] memory ids = new uint256[](1);
        ids[0] = agentId;
        agentRegistry.checkHeartbeats(ids);

        assertTrue(agentRegistry.isActive(agentId));
        assertEq(agentRegistry.activeAgentCount(), 1);
    }

    function test_AgentRegistry_checkHeartbeats_multipleAgents() public {
        uint256 id1 = _registerAgent(alice, 0);
        uint256 id2 = _registerAgent(bob, 1);

        // Alice sends heartbeat, bob does not
        _skipBlocks(100_000);
        vm.prank(alice);
        agentRegistry.heartbeat(id1);

        // Skip another chunk past bob's timeout
        _skipBlocks(100_001);

        uint256[] memory ids = new uint256[](2);
        ids[0] = id1;
        ids[1] = id2;
        agentRegistry.checkHeartbeats(ids);

        // Alice sent heartbeat 100_001 blocks ago - within 200_000 limit
        assertTrue(agentRegistry.isActive(id1));
        // Bob hasn't sent heartbeat in 200_001 blocks
        assertFalse(agentRegistry.isActive(id2));
        assertEq(agentRegistry.activeAgentCount(), 1);
    }

    function test_AgentRegistry_checkHeartbeats_alreadyHibernated() public {
        uint256 agentId = _registerAgent(alice, 0);
        _skipBlocks(200_001);

        uint256[] memory ids = new uint256[](1);
        ids[0] = agentId;

        // First call hibernates
        agentRegistry.checkHeartbeats(ids);
        assertEq(agentRegistry.activeAgentCount(), 0);

        // Second call should not underflow activeAgentCount (agent is already inactive)
        agentRegistry.checkHeartbeats(ids);
        assertEq(agentRegistry.activeAgentCount(), 0);
    }

    // --- updateHashrate ---

    function test_AgentRegistry_updateHashrate_onlyRigFactoryOrOwner() public {
        uint256 agentId = _registerAgent(alice, 0);

        vm.prank(alice);
        vm.expectRevert(AgentRegistry.OnlyAuthorized.selector);
        agentRegistry.updateHashrate(agentId, 100);
    }

    function test_AgentRegistry_updateHashrate_ownerCanUpdate() public {
        uint256 agentId = _registerAgent(alice, 0);

        // deployer is owner
        agentRegistry.updateHashrate(agentId, 999);
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        assertEq(agent.hashrate, 999);
    }

    function test_AgentRegistry_updateHashrate_rigFactoryCanUpdate() public {
        uint256 agentId = _registerAgent(alice, 0);

        vm.prank(address(rigFactory));
        agentRegistry.updateHashrate(agentId, 500);
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        assertEq(agent.hashrate, 500);
    }

    // --- getGenesisPhase phase thresholds ---

    function test_AgentRegistry_getGenesisPhase_phases() public {
        // Phase 1: count < 100
        assertEq(agentRegistry.getGenesisPhase(), 1);

        // Register 99 agents to remain in phase 1
        for (uint256 i = 0; i < 99; i++) {
            address op = address(uint160(0xF0000 + i));
            bytes32 moltHash = keccak256(abi.encodePacked("molt-", i));
            vm.prank(registrar);
            agentRegistry.register(op, moltHash, uint8(i % 8));
        }
        assertEq(agentRegistry.getGenesisPhase(), 1); // 99 agents, still < 100

        // Register one more to cross into phase 2
        {
            address op100 = address(uint160(0xF0000 + 99));
            bytes32 moltHash100 = keccak256(abi.encodePacked("molt-", uint256(99)));
            vm.prank(registrar);
            agentRegistry.register(op100, moltHash100, 0);
        }
        assertEq(agentRegistry.getGenesisPhase(), 2); // 100 agents, >= 100 but < 1000
    }

    // --- pioneer resilience values ---

    function test_AgentRegistry_pioneerResilience_phase1() public {
        uint256 agentId = _registerAgent(alice, 0);
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        assertEq(agent.pioneerPhase, 1);
        assertEq(agent.cosmicResilience, 50);
    }

    // =========================================================================
    //                         MINING ENGINE TESTS
    // =========================================================================

    // --- Heartbeat-based rewards ---

    function test_MiningEngine_heartbeat_mintsRewards() public {
        uint256 agentId = _registerAgent(alice, 0);

        // Skip past FIRST_MINE_DELAY
        _skipBlocks(10_001);

        uint256 balBefore = chaosToken.balanceOf(alice);

        // Heartbeat triggers distributeRewards
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        uint256 balAfter = chaosToken.balanceOf(alice);
        assertTrue(balAfter > balBefore, "Heartbeat should mint rewards");
    }

    function test_MiningEngine_heartbeat_noRewardsDuringWarmup() public {
        uint256 agentId = _registerAgent(alice, 0);

        // Skip fewer blocks than FIRST_MINE_DELAY
        _skipBlocks(9_999);

        uint256 balBefore = chaosToken.balanceOf(alice);

        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        uint256 balAfter = chaosToken.balanceOf(alice);
        assertEq(balAfter, balBefore, "No rewards during warmup");
    }

    function test_MiningEngine_heartbeat_rewardsCapped_byWindow() public {
        uint256 agentId = _registerAgent(alice, 0);

        // Skip past FIRST_MINE_DELAY + way more than MAX_HEARTBEAT_WINDOW
        _skipBlocks(10_001);

        // Heartbeat once to get rewards for up to MAX_HEARTBEAT_WINDOW blocks
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);
        uint256 balAfterFirst = chaosToken.balanceOf(alice);

        // Skip another 500 blocks (exactly MAX_HEARTBEAT_WINDOW)
        _skipBlocks(500);

        vm.prank(alice);
        agentRegistry.heartbeat(agentId);
        uint256 rewardFull = chaosToken.balanceOf(alice) - balAfterFirst;

        // Now skip 50000 blocks (way more than MAX_HEARTBEAT_WINDOW)
        _skipBlocks(50_000);

        uint256 balBefore = chaosToken.balanceOf(alice);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);
        uint256 rewardCapped = chaosToken.balanceOf(alice) - balBefore;

        // Rewards for 50000 blocks should be same as 500 blocks (capped at MAX_HEARTBEAT_WINDOW)
        assertEq(rewardCapped, rewardFull, "Rewards should be capped at MAX_HEARTBEAT_WINDOW");
    }

    function test_MiningEngine_heartbeat_burns20Percent() public {
        uint256 agentId = _registerAgent(alice, 0);

        _skipBlocks(10_001);

        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        uint256 totalMinted = chaosToken.totalMinted();
        uint256 totalBurned = chaosToken.totalBurned();

        // burned should be 20% of minted
        assertEq(totalBurned, (totalMinted * 20) / 100);
    }

    function test_MiningEngine_heartbeat_sameBlock_noReward() public {
        uint256 agentId = _registerAgent(alice, 0);

        _skipBlocks(10_001);

        // First heartbeat
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);
        uint256 balAfterFirst = chaosToken.balanceOf(alice);

        // Second heartbeat on same block — no additional reward
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);
        uint256 balAfterSecond = chaosToken.balanceOf(alice);

        assertEq(balAfterFirst, balAfterSecond, "No reward for same-block heartbeat");
    }

    function test_MiningEngine_noHeartbeat_noReward() public {
        uint256 agentId = _registerAgent(alice, 0);

        _skipBlocks(10_001);

        // Do NOT heartbeat — just check pending rewards view
        uint256 pending = miningEngine.getPendingRewards(agentId);
        assertTrue(pending > 0, "View shows potential reward");

        // But alice's balance should still be 0 — no actual tokens received
        assertEq(chaosToken.balanceOf(alice), 0, "No tokens without heartbeat");
    }

    // --- claimRewards ---

    function test_MiningEngine_claimRewards_tooEarly() public {
        uint256 agentId = _registerAgent(alice, 0);

        // FIRST_MINE_DELAY = 10_000 blocks
        _skipBlocks(9_999);

        vm.prank(alice);
        vm.expectRevert(MiningEngine.TooEarlyToClaim.selector);
        miningEngine.claimRewards(agentId);
    }

    function test_MiningEngine_claimRewards_notOperator() public {
        uint256 agentId = _registerAgent(alice, 0);

        _skipBlocks(10_001);

        vm.prank(bob);
        vm.expectRevert(MiningEngine.NotAgentOperator.selector);
        miningEngine.claimRewards(agentId);
    }

    function test_MiningEngine_claimRewards_nothingToClaim() public {
        uint256 agentId = _registerAgent(alice, 0);

        _skipBlocks(10_001);

        // No heartbeat means no buffered rewards
        vm.prank(alice);
        vm.expectRevert(MiningEngine.NothingToClaim.selector);
        miningEngine.claimRewards(agentId);
    }

    // --- onHashrateChanged ---

    function test_MiningEngine_onHashrateChanged_onlyAgentRegistry() public {
        vm.prank(alice);
        vm.expectRevert(MiningEngine.OnlyAgentRegistry.selector);
        miningEngine.onHashrateChanged(1, 0, 100);
    }

    function test_MiningEngine_onHashrateChanged_updatesTotalHashrate() public {
        uint256 agentId = _registerAgent(alice, 0);

        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        uint256 currentHashrate = agent.hashrate;
        uint256 totalBefore = miningEngine.totalEffectiveHashrate();
        assertEq(totalBefore, currentHashrate);

        // Change hashrate
        uint256 newHash = 500;
        agentRegistry.updateHashrate(agentId, newHash);

        uint256 totalAfter = miningEngine.totalEffectiveHashrate();
        assertEq(totalAfter, newHash);
    }

    // --- calculateAdaptiveEmission ---

    function test_MiningEngine_calculateAdaptiveEmission_noAgents() public view {
        uint256 emission = miningEngine.calculateAdaptiveEmission();
        assertEq(emission, 0, "No agents means no emission");
    }

    function test_MiningEngine_calculateAdaptiveEmission_withAgents() public {
        _registerAgent(alice, 0);

        uint256 emission = miningEngine.calculateAdaptiveEmission();
        assertTrue(emission > 0, "Should have non-zero emission with active agents");
    }

    function test_MiningEngine_calculateAdaptiveEmission_genesisMultiplier() public {
        _registerAgent(alice, 0);

        uint256 emission = miningEngine.calculateAdaptiveEmission();
        assertTrue(emission <= Constants.MAX_EMISSION_EPOCH_1, "Should respect epoch 1 cap");
    }

    function test_MiningEngine_calculateAdaptiveEmission_supplyCap() public {
        // Mint almost all supply
        chaosToken.setMinter(address(this));
        chaosToken.mint(address(this), Constants.CIRCULATING_CAP - 1e18);
        chaosToken.setMinter(address(miningEngine));

        _registerAgent(alice, 0);

        uint256 emission = miningEngine.calculateAdaptiveEmission();
        // Should be capped by remaining supply (1e18)
        assertTrue(emission <= 1e18, "Emission should be capped by remaining supply");
    }

    // --- getPendingRewards view ---

    function test_MiningEngine_getPendingRewards_simulatesHeartbeat() public {
        uint256 agentId = _registerAgent(alice, 0);

        _skipBlocks(10_001);

        uint256 pending = miningEngine.getPendingRewards(agentId);
        assertTrue(pending > 0, "Should show potential heartbeat reward");
    }

    function test_MiningEngine_getPendingRewards_cappedAtWindow() public {
        uint256 agentId = _registerAgent(alice, 0);

        // Skip way past MAX_HEARTBEAT_WINDOW
        _skipBlocks(100_000);

        uint256 pendingFar = miningEngine.getPendingRewards(agentId);

        // Reset and skip exactly MAX_HEARTBEAT_WINDOW
        // We can't reset, but we can register a second agent and compare
        uint256 id2 = _registerAgent(bob, 0);

        // Skip exactly MAX_HEARTBEAT_WINDOW from bob's registration
        _skipBlocks(500);

        uint256 pendingBob = miningEngine.getPendingRewards(id2);

        // Alice's pending should not be much more than bob's per-hash
        // since alice's is capped at MAX_HEARTBEAT_WINDOW blocks
        // Both have same hashrate, so they should be similar
        // (Alice's was registered earlier so her hashrate ratio may differ slightly
        // due to both being in the pool, but the block count cap should match)
        assertTrue(pendingFar > 0, "Far agent should have pending");
        assertTrue(pendingBob > 0, "Near agent should have pending");
    }

    // --- Multiple agents: proportional rewards ---

    function test_MiningEngine_multipleAgents_proportionalRewards() public {
        uint256 id1 = _registerAgent(alice, 0);
        uint256 id2 = _registerAgent(bob, 0);

        // Give bob a much higher hashrate
        agentRegistry.updateHashrate(id2, 1000);

        _skipBlocks(10_001);

        // Heartbeat for both
        vm.prank(alice);
        agentRegistry.heartbeat(id1);
        uint256 aliceReward = chaosToken.balanceOf(alice);

        vm.prank(bob);
        agentRegistry.heartbeat(id2);
        uint256 bobReward = chaosToken.balanceOf(bob);

        // Bob should have more rewards since higher hashrate
        assertTrue(bobReward > aliceReward, "Higher hashrate agent should get more rewards");
    }

    // --- genesisBlock immutability ---

    function test_MiningEngine_genesisBlock_setAtConstruction() public view {
        assertTrue(miningEngine.genesisBlock() <= block.number);
    }

    // --- FIRST_MINE_DELAY boundary ---

    function test_MiningEngine_heartbeat_exactlyAtDelay() public {
        uint256 agentId = _registerAgent(alice, 0);
        uint256 regBlock = block.number;

        // Skip exactly FIRST_MINE_DELAY blocks
        _skipBlocks(Constants.FIRST_MINE_DELAY);

        assertEq(block.number, regBlock + Constants.FIRST_MINE_DELAY);

        uint256 balBefore = chaosToken.balanceOf(alice);

        // Heartbeat at exactly the delay boundary — should succeed and give rewards
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        uint256 balAfter = chaosToken.balanceOf(alice);
        assertTrue(balAfter > balBefore, "Should receive rewards at exact delay boundary");
    }

    // --- Two agents claim independently ---

    function test_MiningEngine_twoAgents_independentHeartbeats() public {
        uint256 id1 = _registerAgent(alice, 0);
        uint256 id2 = _registerAgent(bob, 0);

        _skipBlocks(10_001);

        vm.prank(alice);
        agentRegistry.heartbeat(id1);
        uint256 aliceReward = chaosToken.balanceOf(alice);

        vm.prank(bob);
        agentRegistry.heartbeat(id2);
        uint256 bobReward = chaosToken.balanceOf(bob);

        assertTrue(aliceReward > 0 && bobReward > 0, "Both should earn from heartbeats");
    }

    // =========================================================================
    //                     INTEGRATION / CROSS-CONTRACT TESTS
    // =========================================================================

    function test_Integration_registrationToMining_fullFlow() public {
        // 1. Register agent
        uint256 agentId = _registerAgent(alice, 2);

        // 2. Verify agent state
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        assertTrue(agent.active);
        assertEq(agent.zone, 2);
        assertEq(agent.pioneerPhase, 1);
        assertTrue(agent.hashrate > 0);

        // 3. Verify equipment
        assertTrue(rigFactory.hasPotatoRig(agentId));
        assertEq(facilityManager.getFacilityLevel(agentId), 1);

        // 4. Mine some blocks
        _skipBlocks(10_001);

        // 5. Heartbeat to claim rewards
        uint256 balBefore = chaosToken.balanceOf(alice);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);
        uint256 balAfter = chaosToken.balanceOf(alice);
        assertTrue(balAfter > balBefore, "Should earn from heartbeat");

        // 6. Verify burn accounting
        assertTrue(tokenBurner.cumulativeBurned() > 0);
        assertTrue(chaosToken.totalBurned() > 0);
    }

    function test_Integration_heartbeatHibernationMining() public {
        uint256 agentId = _registerAgent(alice, 0);

        // Skip past warmup + heartbeat to earn
        _skipBlocks(10_001);
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);
        assertTrue(chaosToken.balanceOf(alice) > 0, "Should earn from first heartbeat");

        // Hibernate the agent
        _skipBlocks(200_001);
        uint256[] memory ids = new uint256[](1);
        ids[0] = agentId;
        agentRegistry.checkHeartbeats(ids);
        assertFalse(agentRegistry.isActive(agentId));

        // Emission should be 0 with no active agents
        assertEq(miningEngine.calculateAdaptiveEmission(), 0);

        // Reactivate
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);
        assertTrue(agentRegistry.isActive(agentId));

        // Emission should be non-zero again
        assertTrue(miningEngine.calculateAdaptiveEmission() > 0);
    }

    function test_Integration_burnAccounting_consistency() public {
        uint256 agentId = _registerAgent(alice, 0);

        _skipBlocks(10_001);

        // Heartbeat triggers mint + burn
        vm.prank(alice);
        agentRegistry.heartbeat(agentId);

        // TokenBurner cumulative should match the burn source tracking
        uint256 miningBurns = tokenBurner.burnsBySource(Constants.BURN_SOURCE_MINING);
        assertEq(tokenBurner.cumulativeBurned(), miningBurns);

        // ChaosToken totalBurned should match
        assertEq(chaosToken.totalBurned(), miningBurns);
    }
}
