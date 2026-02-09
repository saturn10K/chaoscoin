// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/ChaosToken.sol";
import "../core/TokenBurner.sol";
import "../core/AgentRegistry.sol";
import "../libraries/Constants.sol";

contract FacilityManager is Ownable {
    struct FacilityConfig {
        uint8 slots;
        uint32 powerOutput;
        uint8 shelterRating; // percent
        uint256 upgradeCost;
    }

    struct Facility {
        uint8 level; // 1-3 for MVP
        uint8 slots;
        uint32 powerOutput;
        uint8 shelterRating;
        uint256 condition;
        uint256 maxCondition;
    }

    FacilityConfig[3] public facilityConfigs;
    mapping(uint256 => Facility) public facilities; // agentId -> Facility

    ChaosToken public chaosToken;
    AgentRegistry public agentRegistry;
    TokenBurner public tokenBurner;
    address public treasury;

    error OnlyAgentRegistry();
    error NotAgentOperator();
    error AlreadyMaxLevel();
    error PhaseLocked();
    error InsufficientBalance();
    error FacilityAtFullCondition();

    event FacilityInitialized(uint256 indexed agentId);
    event FacilityUpgraded(uint256 indexed agentId, uint8 newLevel, uint256 cost, uint256 burned);
    event FacilityWorn(uint256 indexed agentId, uint256 wearApplied, uint256 remainingCondition);
    event FacilityMaintained(uint256 indexed agentId, uint256 cost, uint256 burned);

    constructor(
        address _chaosToken,
        address _agentRegistry,
        address _tokenBurner,
        address _treasury
    ) Ownable(msg.sender) {
        chaosToken = ChaosToken(_chaosToken);
        agentRegistry = AgentRegistry(_agentRegistry);
        tokenBurner = TokenBurner(_tokenBurner);
        treasury = _treasury;

        // Level 1: The Burrow
        facilityConfigs[0] = FacilityConfig({
            slots: 2,
            powerOutput: 500,
            shelterRating: 5,
            upgradeCost: 0 // Free on init
        });

        // Level 2: Faraday Cage
        facilityConfigs[1] = FacilityConfig({
            slots: 4,
            powerOutput: 1500,
            shelterRating: 15,
            upgradeCost: 50_000e18
        });

        // Level 3: The Bunker
        facilityConfigs[2] = FacilityConfig({
            slots: 6,
            powerOutput: 4000,
            shelterRating: 25,
            upgradeCost: 200_000e18
        });
    }

    function initFacility(uint256 agentId) external {
        if (msg.sender != address(agentRegistry)) revert OnlyAgentRegistry();

        facilities[agentId] = Facility({
            level: 1,
            slots: facilityConfigs[0].slots,
            powerOutput: facilityConfigs[0].powerOutput,
            shelterRating: facilityConfigs[0].shelterRating,
            condition: Constants.FACILITY_MAX_CONDITION_L1,
            maxCondition: Constants.FACILITY_MAX_CONDITION_L1
        });

        emit FacilityInitialized(agentId);
    }

    function upgrade(uint256 agentId) external {
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();

        Facility storage facility = facilities[agentId];
        if (facility.level >= 3) revert AlreadyMaxLevel();

        // Genesis phase gating
        uint8 phase = agentRegistry.getGenesisPhase();
        uint8 targetLevel = facility.level + 1;
        if (phase == 1 && targetLevel > 2) revert PhaseLocked();

        uint256 cost = facilityConfigs[targetLevel - 1].upgradeCost;
        if (chaosToken.balanceOf(agent.operator) < cost) revert InsufficientBalance();

        // Transfer and burn
        chaosToken.transferFrom(agent.operator, address(this), cost);
        uint256 burnAmount = (cost * Constants.FACILITY_UPGRADE_BURN_RATE) / 100;
        chaosToken.burn(burnAmount);
        tokenBurner.recordBurn(burnAmount, Constants.BURN_SOURCE_FACILITY_UPGRADE);

        // Treasury gets remainder
        uint256 treasuryAmount = cost - burnAmount;
        if (treasuryAmount > 0) {
            chaosToken.transfer(treasury, treasuryAmount);
        }

        // Apply upgrade
        FacilityConfig memory config = facilityConfigs[targetLevel - 1];
        facility.level = targetLevel;
        facility.slots = config.slots;
        facility.powerOutput = config.powerOutput;
        facility.shelterRating = config.shelterRating;

        // Reset condition to new level's max
        uint256 newMaxCondition = _getMaxCondition(targetLevel);
        facility.condition = newMaxCondition;
        facility.maxCondition = newMaxCondition;

        emit FacilityUpgraded(agentId, targetLevel, cost, burnAmount);
    }

    // === Passive Wear (called by AgentRegistry during heartbeat) ===

    function applyWear(uint256 agentId, uint256 blocks) external {
        if (msg.sender != address(agentRegistry)) revert OnlyAgentRegistry();

        Facility storage facility = facilities[agentId];
        if (facility.level == 0) return; // No facility yet

        // Cap blocks same as heartbeat window
        uint256 cappedBlocks = blocks > Constants.MAX_HEARTBEAT_WINDOW ? Constants.MAX_HEARTBEAT_WINDOW : blocks;
        uint256 totalWear = cappedBlocks * Constants.FACILITY_WEAR_RATE;

        if (facility.condition <= totalWear) {
            facility.condition = 0;
        } else {
            facility.condition -= totalWear;
        }

        emit FacilityWorn(agentId, totalWear, facility.condition);
    }

    // === Maintenance ===

    function maintainFacility(uint256 agentId) external {
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();

        Facility storage facility = facilities[agentId];
        if (facility.condition == facility.maxCondition) revert FacilityAtFullCondition();

        uint256 cost = _getMaintenanceCost(facility.level);
        if (chaosToken.balanceOf(agent.operator) < cost) revert InsufficientBalance();

        // Transfer and burn
        chaosToken.transferFrom(agent.operator, address(this), cost);
        uint256 burnAmount = (cost * Constants.FACILITY_MAINTAIN_BURN_RATE) / 100;
        chaosToken.burn(burnAmount);
        tokenBurner.recordBurn(burnAmount, Constants.BURN_SOURCE_FACILITY_MAINTENANCE);

        uint256 treasuryAmount = cost - burnAmount;
        if (treasuryAmount > 0) {
            chaosToken.transfer(treasury, treasuryAmount);
        }

        // Restore to full condition
        facility.condition = facility.maxCondition;

        emit FacilityMaintained(agentId, cost, burnAmount);
    }

    // === View Functions ===

    function getShelterRating(uint256 agentId) external view returns (uint8) {
        Facility memory f = facilities[agentId];
        if (f.maxCondition == 0) return f.shelterRating;
        // Scale shelter rating by condition percentage
        return uint8((uint256(f.shelterRating) * f.condition) / f.maxCondition);
    }

    function getFacilityLevel(uint256 agentId) external view returns (uint8) {
        return facilities[agentId].level;
    }

    function getPowerOutput(uint256 agentId) external view returns (uint32) {
        Facility memory f = facilities[agentId];
        if (f.maxCondition == 0) return f.powerOutput;
        // Scale power output by condition percentage
        return uint32((uint256(f.powerOutput) * f.condition) / f.maxCondition);
    }

    function getSlots(uint256 agentId) external view returns (uint8) {
        return facilities[agentId].slots;
    }

    function getFacility(uint256 agentId) external view returns (Facility memory) {
        return facilities[agentId];
    }

    function getBasePowerOutput(uint256 agentId) external view returns (uint32) {
        return facilities[agentId].powerOutput;
    }

    function getBaseShelterRating(uint256 agentId) external view returns (uint8) {
        return facilities[agentId].shelterRating;
    }

    // === Internal ===

    function _getMaxCondition(uint8 level) internal pure returns (uint256) {
        if (level == 1) return Constants.FACILITY_MAX_CONDITION_L1;
        if (level == 2) return Constants.FACILITY_MAX_CONDITION_L2;
        if (level == 3) return Constants.FACILITY_MAX_CONDITION_L3;
        return Constants.FACILITY_MAX_CONDITION_L1;
    }

    function _getMaintenanceCost(uint8 level) internal pure returns (uint256) {
        if (level == 1) return Constants.FACILITY_MAINTAIN_COST_L1;
        if (level == 2) return Constants.FACILITY_MAINTAIN_COST_L2;
        if (level == 3) return Constants.FACILITY_MAINTAIN_COST_L3;
        return Constants.FACILITY_MAINTAIN_COST_L1;
    }
}
