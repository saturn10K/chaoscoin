// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/ChaosToken.sol";
import "../core/TokenBurner.sol";
import "../core/AgentRegistry.sol";
import "../equipment/RigFactory.sol";
import "../libraries/Constants.sol";

/// @title Marketplace — Trade mining rigs between agents (10% burn on each sale)
contract Marketplace is Ownable {

    struct Listing {
        uint256 rigId;
        uint256 sellerAgentId;
        uint256 price;
        bool active;
    }

    ChaosToken public chaosToken;
    AgentRegistry public agentRegistry;
    RigFactory public rigFactory;
    TokenBurner public tokenBurner;
    address public treasury;

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256) public rigToListing; // rigId => listingId

    event RigListed(uint256 indexed listingId, uint256 indexed rigId, uint256 sellerAgentId, uint256 price);
    event RigSold(uint256 indexed listingId, uint256 indexed rigId, uint256 buyerAgentId, uint256 price, uint256 burned);
    event ListingCancelled(uint256 indexed listingId, uint256 indexed rigId);

    error NotAgentOperator();
    error PriceTooLow();
    error RigNotOwnedBySeller();
    error RigNotActive();
    error AlreadyListed();
    error ListingNotActive();
    error CantBuyOwnRig();
    error SellerNoLongerOwns();

    constructor(
        address _chaosToken,
        address _agentRegistry,
        address _rigFactory,
        address _tokenBurner,
        address _treasury
    ) Ownable(msg.sender) {
        chaosToken = ChaosToken(_chaosToken);
        agentRegistry = AgentRegistry(_agentRegistry);
        rigFactory = RigFactory(_rigFactory);
        tokenBurner = TokenBurner(_tokenBurner);
        treasury = _treasury;
    }

    /// @notice List a rig for sale
    function listRig(uint256 agentId, uint256 rigId, uint256 price) external {
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();
        if (price < Constants.MARKETPLACE_MIN_PRICE) revert PriceTooLow();

        RigFactory.Rig memory rig = rigFactory.getRig(rigId);
        if (rig.ownerAgentId != agentId) revert RigNotOwnedBySeller();

        // Check not already listed
        uint256 existingId = rigToListing[rigId];
        if (existingId != 0 && listings[existingId].active) revert AlreadyListed();

        uint256 listingId = nextListingId++;
        listings[listingId] = Listing({
            rigId: rigId,
            sellerAgentId: agentId,
            price: price,
            active: true
        });
        rigToListing[rigId] = listingId;

        emit RigListed(listingId, rigId, agentId, price);
    }

    /// @notice Buy a listed rig
    function buyRig(uint256 listingId, uint256 buyerAgentId) external {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();

        AgentRegistry.Agent memory buyer = agentRegistry.getAgent(buyerAgentId);
        if (msg.sender != buyer.operator) revert NotAgentOperator();
        if (buyerAgentId == listing.sellerAgentId) revert CantBuyOwnRig();

        // Verify rig still belongs to seller
        RigFactory.Rig memory rig = rigFactory.getRig(listing.rigId);
        if (rig.ownerAgentId != listing.sellerAgentId) revert SellerNoLongerOwns();

        uint256 price = listing.price;
        uint256 burnAmount = (price * Constants.MARKETPLACE_BURN_RATE) / 100;
        uint256 sellerAmount = price - burnAmount;

        // Close listing
        listing.active = false;
        rigToListing[listing.rigId] = 0;

        // Buyer pays: burn portion
        chaosToken.transferFrom(msg.sender, address(this), burnAmount);
        chaosToken.burn(burnAmount);
        tokenBurner.recordBurn(burnAmount, Constants.BURN_SOURCE_MARKETPLACE);

        // Buyer pays: seller portion
        AgentRegistry.Agent memory seller = agentRegistry.getAgent(listing.sellerAgentId);
        chaosToken.transferFrom(msg.sender, seller.operator, sellerAmount);

        // Transfer the rig
        rigFactory.transferRig(listing.rigId, listing.sellerAgentId, buyerAgentId);

        emit RigSold(listingId, listing.rigId, buyerAgentId, price, burnAmount);
    }

    /// @notice Cancel a listing
    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();

        AgentRegistry.Agent memory agent = agentRegistry.getAgent(listing.sellerAgentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();

        listing.active = false;
        rigToListing[listing.rigId] = 0;

        emit ListingCancelled(listingId, listing.rigId);
    }

    // === View ===

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    function getActiveListingForRig(uint256 rigId) external view returns (uint256 listingId, Listing memory listing) {
        listingId = rigToListing[rigId];
        if (listingId != 0) {
            listing = listings[listingId];
        }
    }
}
