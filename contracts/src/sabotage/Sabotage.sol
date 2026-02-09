// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/ChaosToken.sol";
import "../core/TokenBurner.sol";
import "../core/AgentRegistry.sol";
import "../equipment/RigFactory.sol";
import "../equipment/FacilityManager.sol";
import "../cosmic/ShieldManager.sol";
import "../libraries/Constants.sol";

/// @title Sabotage — Agents attack each other at great cost (80% burned)
contract Sabotage is Ownable {

    ChaosToken public chaosToken;
    AgentRegistry public agentRegistry;
    RigFactory public rigFactory;
    FacilityManager public facilityManager;
    ShieldManager public shieldManager;
    TokenBurner public tokenBurner;
    address public treasury;

    // Cooldown: keccak256(attacker, target) => last attack block
    mapping(bytes32 => uint256) public lastAttackBlock;

    // Stats
    uint256 public totalFacilityRaids;
    uint256 public totalRigJams;
    uint256 public totalIntelOps;
    uint256 public totalBurnedBySabotage;

    error NotAgentOperator();
    error CantAttackSelf();
    error AttackerNotActive();
    error TargetNotActive();
    error CooldownActive();
    error TargetNoFacility();

    event FacilityRaided(uint256 indexed attacker, uint256 indexed target, uint256 effectiveDamage, uint256 cost);
    event RigJammed(uint256 indexed attacker, uint256 indexed target, uint256 effectiveDamage, uint256 cost);
    event IntelGathered(uint256 indexed attacker, uint256 indexed target, uint256 cost);

    constructor(
        address _chaosToken,
        address _agentRegistry,
        address _rigFactory,
        address _facilityManager,
        address _shieldManager,
        address _tokenBurner,
        address _treasury
    ) Ownable(msg.sender) {
        chaosToken = ChaosToken(_chaosToken);
        agentRegistry = AgentRegistry(_agentRegistry);
        rigFactory = RigFactory(_rigFactory);
        facilityManager = FacilityManager(_facilityManager);
        shieldManager = ShieldManager(_shieldManager);
        tokenBurner = TokenBurner(_tokenBurner);
        treasury = _treasury;
    }

    /// @notice Raid target's facility — 50k CHAOS, 20% condition damage
    function facilityRaid(uint256 attackerAgent, uint256 targetAgent) external {
        _validateAttack(attackerAgent, targetAgent, true);

        FacilityManager.Facility memory fac = facilityManager.getFacility(targetAgent);
        if (fac.level == 0) revert TargetNoFacility();

        _payCost(Constants.SABOTAGE_FACILITY_RAID_COST);

        uint256 reduction = shieldManager.getSabotageReduction(targetAgent);
        uint256 effectiveDamage = Constants.SABOTAGE_FACILITY_DAMAGE * (100 - reduction) / 100;

        if (effectiveDamage > 0) {
            facilityManager.applySabotageDamage(targetAgent, effectiveDamage);
        }

        _setCooldown(attackerAgent, targetAgent);
        totalFacilityRaids++;

        emit FacilityRaided(attackerAgent, targetAgent, effectiveDamage, Constants.SABOTAGE_FACILITY_RAID_COST);
    }

    /// @notice Jam target's rigs — 30k CHAOS, 15% durability damage
    function rigJam(uint256 attackerAgent, uint256 targetAgent) external {
        _validateAttack(attackerAgent, targetAgent, true);

        _payCost(Constants.SABOTAGE_RIG_JAM_COST);

        uint256 reduction = shieldManager.getSabotageReduction(targetAgent);
        uint256 effectiveDamage = Constants.SABOTAGE_RIG_DAMAGE * (100 - reduction) / 100;

        if (effectiveDamage > 0) {
            rigFactory.applySabotageDamage(targetAgent, effectiveDamage);
        }

        _setCooldown(attackerAgent, targetAgent);
        totalRigJams++;

        emit RigJammed(attackerAgent, targetAgent, effectiveDamage, Constants.SABOTAGE_RIG_JAM_COST);
    }

    /// @notice Gather intel — 10k CHAOS, emits event (no cooldown)
    function gatherIntel(uint256 attackerAgent, uint256 targetAgent) external {
        _validateAttack(attackerAgent, targetAgent, false); // no cooldown for intel

        _payCost(Constants.SABOTAGE_INTEL_COST);
        totalIntelOps++;

        emit IntelGathered(attackerAgent, targetAgent, Constants.SABOTAGE_INTEL_COST);
    }

    // === Internal ===

    function _validateAttack(uint256 attackerAgent, uint256 targetAgent, bool checkCooldown) internal view {
        if (attackerAgent == targetAgent) revert CantAttackSelf();

        AgentRegistry.Agent memory attacker = agentRegistry.getAgent(attackerAgent);
        if (msg.sender != attacker.operator) revert NotAgentOperator();
        if (!attacker.active) revert AttackerNotActive();

        AgentRegistry.Agent memory target = agentRegistry.getAgent(targetAgent);
        if (!target.active) revert TargetNotActive();

        if (checkCooldown) {
            bytes32 key = _cooldownKey(attackerAgent, targetAgent);
            if (lastAttackBlock[key] > 0 && block.number < lastAttackBlock[key] + Constants.SABOTAGE_COOLDOWN) {
                revert CooldownActive();
            }
        }
    }

    function _payCost(uint256 cost) internal {
        uint256 burnAmount = (cost * Constants.SABOTAGE_BURN_RATE) / 100;
        uint256 treasuryAmount = cost - burnAmount;

        chaosToken.transferFrom(msg.sender, address(this), cost);
        chaosToken.burn(burnAmount);
        tokenBurner.recordBurn(burnAmount, Constants.BURN_SOURCE_SABOTAGE);

        if (treasuryAmount > 0) {
            chaosToken.transfer(treasury, treasuryAmount);
        }

        totalBurnedBySabotage += burnAmount;
    }

    function _setCooldown(uint256 attackerAgent, uint256 targetAgent) internal {
        lastAttackBlock[_cooldownKey(attackerAgent, targetAgent)] = block.number;
    }

    function _cooldownKey(uint256 a, uint256 b) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(a, b));
    }

    // === View ===

    function getCooldownRemaining(uint256 attackerAgent, uint256 targetAgent) external view returns (uint256) {
        bytes32 key = _cooldownKey(attackerAgent, targetAgent);
        uint256 lastBlock = lastAttackBlock[key];
        if (lastBlock == 0) return 0;
        uint256 cooldownEnd = lastBlock + Constants.SABOTAGE_COOLDOWN;
        if (block.number >= cooldownEnd) return 0;
        return cooldownEnd - block.number;
    }
}
