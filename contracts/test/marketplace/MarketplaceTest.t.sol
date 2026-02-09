// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../BaseTest.sol";

contract MarketplaceTest is BaseTest {

    function _registerAgentFull(address operator, uint8 zone) internal returns (uint256 agentId) {
        // rigFactory is already wired in BaseTest.setUp → register auto-mints potato rig
        bytes32 moltbookHash = keccak256(abi.encodePacked("moltbook-", operator));
        vm.prank(registrar);
        agentId = agentRegistry.register(operator, moltbookHash, zone);
    }

    function _fund(address who, uint256 amount) internal {
        deal(address(chaosToken), who, amount);
        vm.prank(who);
        chaosToken.approve(address(rigFactory), type(uint256).max);
        vm.prank(who);
        chaosToken.approve(address(marketplace), type(uint256).max);
    }

    // === Dynamic Pricing Tests ===

    function test_dynamicPricing_baseCostWhenNoRigs() public {
        uint256 cost = rigFactory.getEffectiveCost(1);
        assertEq(cost, 5_000e18, "T1 base cost");
    }

    function test_dynamicPricing_increasesAfterPurchase() public {
        uint256 agentId = _registerAgentFull(alice, 0);
        _fund(alice, 50_000e18);


        uint256 costBefore = rigFactory.getEffectiveCost(1);

        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256 costAfter = rigFactory.getEffectiveCost(1);
        assertGt(costAfter, costBefore, "price should increase");
        // Expected: 5000 * (200+1)/200 = 5025
        assertEq(costAfter, 5_000e18 * 201 / 200, "T1 dynamic cost after 1 purchase");
    }

    function test_dynamicPricing_T4_highScaling() public {
        // T4: scale = 25, so price doubles at 25 rigs
        uint256 cost = rigFactory.getEffectiveCost(4);
        assertEq(cost, 350_000e18, "T4 base cost");
    }

    // === Listing Tests ===

    function test_listRig_createsListing() public {
        uint256 agentId = _registerAgentFull(alice, 0);
        _fund(alice, 50_000e18);


        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256[] memory rigs = rigFactory.getAgentRigs(agentId);
        uint256 rigId = rigs[1]; // index 0 is potato rig

        vm.prank(alice);
        marketplace.listRig(agentId, rigId, 8_000e18);

        Marketplace.Listing memory listing = marketplace.getListing(1);
        assertEq(listing.rigId, rigId);
        assertEq(listing.sellerAgentId, agentId);
        assertEq(listing.price, 8_000e18);
        assertTrue(listing.active);
    }

    function test_listRig_revertsIfPriceTooLow() public {
        uint256 agentId = _registerAgentFull(alice, 0);
        _fund(alice, 50_000e18);


        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256[] memory rigs = rigFactory.getAgentRigs(agentId);

        vm.prank(alice);
        vm.expectRevert(Marketplace.PriceTooLow.selector);
        marketplace.listRig(agentId, rigs[1], 50e18);
    }

    // === Buy Tests ===

    function test_buyRig_transfersOwnership() public {
        uint256 aliceAgent = _registerAgentFull(alice, 0);
        uint256 bobAgent = _registerAgentFull(bob, 1);
        _fund(alice, 50_000e18);
        _fund(bob, 50_000e18);


        vm.prank(alice);
        rigFactory.purchaseRig(aliceAgent, 1);

        uint256[] memory rigs = rigFactory.getAgentRigs(aliceAgent);
        uint256 rigId = rigs[1];

        vm.prank(alice);
        marketplace.listRig(aliceAgent, rigId, 8_000e18);

        vm.prank(bob);
        marketplace.buyRig(1, bobAgent);

        // Rig should now belong to bob
        RigFactory.Rig memory rig = rigFactory.getRig(rigId);
        assertEq(rig.ownerAgentId, bobAgent, "rig transferred to buyer");
    }

    function test_buyRig_burns10Percent() public {
        uint256 aliceAgent = _registerAgentFull(alice, 0);
        uint256 bobAgent = _registerAgentFull(bob, 1);
        _fund(alice, 50_000e18);
        _fund(bob, 50_000e18);


        vm.prank(alice);
        rigFactory.purchaseRig(aliceAgent, 1);

        uint256[] memory rigs = rigFactory.getAgentRigs(aliceAgent);

        vm.prank(alice);
        marketplace.listRig(aliceAgent, rigs[1], 10_000e18);

        uint256 burnsBefore = tokenBurner.cumulativeBurned();

        vm.prank(bob);
        marketplace.buyRig(1, bobAgent);

        uint256 burned = tokenBurner.cumulativeBurned() - burnsBefore;
        assertEq(burned, 1_000e18, "10% burned on sale");
    }

    function test_buyRig_sellerReceives90Percent() public {
        uint256 aliceAgent = _registerAgentFull(alice, 0);
        uint256 bobAgent = _registerAgentFull(bob, 1);
        _fund(alice, 50_000e18);
        _fund(bob, 50_000e18);


        vm.prank(alice);
        rigFactory.purchaseRig(aliceAgent, 1);

        uint256[] memory rigs = rigFactory.getAgentRigs(aliceAgent);

        vm.prank(alice);
        marketplace.listRig(aliceAgent, rigs[1], 10_000e18);

        uint256 aliceBalBefore = chaosToken.balanceOf(alice);

        vm.prank(bob);
        marketplace.buyRig(1, bobAgent);

        uint256 aliceReceived = chaosToken.balanceOf(alice) - aliceBalBefore;
        assertEq(aliceReceived, 9_000e18, "seller gets 90%");
    }

    function test_buyRig_revertsIfBuyingOwnRig() public {
        uint256 aliceAgent = _registerAgentFull(alice, 0);
        _fund(alice, 50_000e18);


        vm.prank(alice);
        rigFactory.purchaseRig(aliceAgent, 1);

        uint256[] memory rigs = rigFactory.getAgentRigs(aliceAgent);

        vm.prank(alice);
        marketplace.listRig(aliceAgent, rigs[1], 8_000e18);

        vm.prank(alice);
        vm.expectRevert(Marketplace.CantBuyOwnRig.selector);
        marketplace.buyRig(1, aliceAgent);
    }

    // === Cancel Tests ===

    function test_cancelListing() public {
        uint256 agentId = _registerAgentFull(alice, 0);
        _fund(alice, 50_000e18);


        vm.prank(alice);
        rigFactory.purchaseRig(agentId, 1);

        uint256[] memory rigs = rigFactory.getAgentRigs(agentId);

        vm.prank(alice);
        marketplace.listRig(agentId, rigs[1], 8_000e18);

        vm.prank(alice);
        marketplace.cancelListing(1);

        Marketplace.Listing memory listing = marketplace.getListing(1);
        assertFalse(listing.active, "listing cancelled");
    }
}
