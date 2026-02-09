// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/ChaosToken.sol";
import "../core/TokenBurner.sol";
import "../core/AgentRegistry.sol";
import "../libraries/Constants.sol";
import "../libraries/MathLib.sol";

interface IFacilityManagerRead {
    function getFacilityLevel(uint256 agentId) external view returns (uint8);
    function getPowerOutput(uint256 agentId) external view returns (uint32);
    function getSlots(uint256 agentId) external view returns (uint8);
}

interface IZoneManagerRead {
    function getZoneMiningModifier(uint8 zone) external view returns (int16);
}

contract RigFactory is ERC721, Ownable {
    using MathLib for uint256;

    struct RigConfig {
        uint256 baseHashrate;
        uint16 powerDraw;
        uint256 cost;
        uint256 maxDurability;
    }

    struct Rig {
        uint8 tier;
        uint256 baseHashrate;
        uint16 powerDraw;
        uint256 durability;
        uint256 maxDurability;
        uint256 ownerAgentId;
        bool active;
    }

    RigConfig[5] public rigConfigs;
    mapping(uint256 => Rig) public rigs; // tokenId -> Rig
    uint256 public nextRigId = 1;

    mapping(uint256 => bool) public hasPotatoRig; // agentId -> has free rig
    mapping(uint256 => uint256[]) public agentRigs; // agentId -> rig tokenIds

    ChaosToken public chaosToken;
    AgentRegistry public agentRegistry;
    IFacilityManagerRead public facilityManager;
    IZoneManagerRead public zoneManager;
    TokenBurner public tokenBurner;
    address public cosmicEngine;
    address public treasury;

    error OnlyAgentRegistry();
    error OnlyCosmicEngine();
    error NotAgentOperator();
    error AlreadyHasPotatoRig();
    error InvalidTier();
    error PhaseLocked();
    error InsufficientBalance();
    error RigNotOwned();
    error RigAlreadyActive();
    error RigNotActive();
    error PowerBudgetExceeded();
    error NoSlotsAvailable();

    event RigMinted(uint256 indexed rigId, uint256 indexed agentId, uint8 tier);
    event RigPurchased(uint256 indexed rigId, uint256 indexed agentId, uint8 tier, uint256 cost, uint256 burned);
    event RigEquipped(uint256 indexed rigId, uint256 indexed agentId);
    event RigUnequipped(uint256 indexed rigId, uint256 indexed agentId);
    event RigRepaired(uint256 indexed rigId, uint256 cost, uint256 burned);
    event RigDamaged(uint256 indexed rigId, uint256 damage, uint256 remainingDurability);
    event RigDestroyed(uint256 indexed rigId, uint256 indexed agentId);
    event RigWornDown(uint256 indexed rigId, uint256 wearApplied, uint256 remainingDurability);
    event RigDisabledByWear(uint256 indexed rigId, uint256 indexed agentId);

    constructor(
        address _chaosToken,
        address _agentRegistry,
        address _facilityManager,
        address _tokenBurner,
        address _zoneManager,
        address _treasury
    ) ERC721("Chaoscoin Rig", "CRIG") Ownable(msg.sender) {
        chaosToken = ChaosToken(_chaosToken);
        agentRegistry = AgentRegistry(_agentRegistry);
        facilityManager = IFacilityManagerRead(_facilityManager);
        zoneManager = IZoneManagerRead(_zoneManager);
        tokenBurner = TokenBurner(_tokenBurner);
        treasury = _treasury;

        // Tier 0: Potato Rig
        rigConfigs[0] = RigConfig({baseHashrate: 10, powerDraw: 50, cost: 0, maxDurability: 1000});
        // Tier 1: Scrapheap Engine
        rigConfigs[1] = RigConfig({baseHashrate: 50, powerDraw: 200, cost: 5_000e18, maxDurability: 5_000});
        // Tier 2: Windmill Cracker
        rigConfigs[2] = RigConfig({baseHashrate: 150, powerDraw: 400, cost: 25_000e18, maxDurability: 25_000});
        // Tier 3: Magma Core
        rigConfigs[3] = RigConfig({baseHashrate: 400, powerDraw: 800, cost: 100_000e18, maxDurability: 100_000});
        // Tier 4: Neutrino Sieve
        rigConfigs[4] = RigConfig({baseHashrate: 900, powerDraw: 1200, cost: 350_000e18, maxDurability: 350_000});
    }

    function setCosmicEngine(address _cosmicEngine) external onlyOwner {
        cosmicEngine = _cosmicEngine;
    }

    // === Mint & Purchase ===

    function mintPotatoRig(uint256 agentId, address operator) external {
        if (msg.sender != address(agentRegistry)) revert OnlyAgentRegistry();
        if (hasPotatoRig[agentId]) revert AlreadyHasPotatoRig();

        uint256 rigId = nextRigId++;
        _mint(operator, rigId);

        rigs[rigId] = Rig({
            tier: 0,
            baseHashrate: rigConfigs[0].baseHashrate,
            powerDraw: rigConfigs[0].powerDraw,
            durability: rigConfigs[0].maxDurability,
            maxDurability: rigConfigs[0].maxDurability,
            ownerAgentId: agentId,
            active: false
        });

        hasPotatoRig[agentId] = true;
        agentRigs[agentId].push(rigId);

        // Auto-equip the potato rig
        _equipRig(rigId, agentId);

        emit RigMinted(rigId, agentId, 0);
    }

    function purchaseRig(uint256 agentId, uint8 tier) external {
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();
        if (tier < 1 || tier > 4) revert InvalidTier();

        // Genesis phase gating
        uint8 phase = agentRegistry.getGenesisPhase();
        if (phase == 1 && tier > 1) revert PhaseLocked();
        if (phase == 2 && tier > 3) revert PhaseLocked();

        RigConfig memory config = rigConfigs[tier];
        if (chaosToken.balanceOf(agent.operator) < config.cost) revert InsufficientBalance();

        // Transfer and burn atomically
        chaosToken.transferFrom(agent.operator, address(this), config.cost);
        uint256 burnAmount = (config.cost * Constants.RIG_PURCHASE_BURN_RATE) / 100;
        chaosToken.burn(burnAmount);
        tokenBurner.recordBurn(burnAmount, Constants.BURN_SOURCE_RIG_PURCHASE);

        uint256 treasuryAmount = config.cost - burnAmount;
        if (treasuryAmount > 0) {
            chaosToken.transfer(treasury, treasuryAmount);
        }

        // Mint rig NFT
        uint256 rigId = nextRigId++;
        _mint(agent.operator, rigId);

        rigs[rigId] = Rig({
            tier: tier,
            baseHashrate: config.baseHashrate,
            powerDraw: config.powerDraw,
            durability: config.maxDurability,
            maxDurability: config.maxDurability,
            ownerAgentId: agentId,
            active: false
        });

        agentRigs[agentId].push(rigId);

        emit RigPurchased(rigId, agentId, tier, config.cost, burnAmount);
    }

    // === Equip / Unequip ===

    function equipRig(uint256 rigId) external {
        Rig storage rig = rigs[rigId];
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(rig.ownerAgentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();
        if (rig.active) revert RigAlreadyActive();

        _equipRig(rigId, rig.ownerAgentId);
    }

    function unequipRig(uint256 rigId) external {
        Rig storage rig = rigs[rigId];
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(rig.ownerAgentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();
        if (!rig.active) revert RigNotActive();

        rig.active = false;
        uint256 newHashrate = calculateEffectiveHashrate(rig.ownerAgentId);
        agentRegistry.updateHashrate(rig.ownerAgentId, newHashrate);

        emit RigUnequipped(rigId, rig.ownerAgentId);
    }

    // === Repair ===

    function repairRig(uint256 rigId) external {
        Rig storage rig = rigs[rigId];
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(rig.ownerAgentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();

        uint256 repairCost = (rigConfigs[rig.tier].cost * Constants.RIG_REPAIR_COST_RATIO) / 100;
        if (repairCost == 0) repairCost = 100e18; // Minimum repair cost for free rigs

        chaosToken.transferFrom(agent.operator, address(this), repairCost);
        uint256 burnAmount = (repairCost * Constants.RIG_REPAIR_BURN_RATE) / 100;
        chaosToken.burn(burnAmount);
        tokenBurner.recordBurn(burnAmount, Constants.BURN_SOURCE_RIG_REPAIR);

        uint256 treasuryAmount = repairCost - burnAmount;
        if (treasuryAmount > 0) {
            chaosToken.transfer(treasury, treasuryAmount);
        }

        rig.durability = rig.maxDurability;

        emit RigRepaired(rigId, repairCost, burnAmount);
    }

    // === Passive Wear (called by AgentRegistry during heartbeat) ===

    function applyWear(uint256 agentId, uint256 blocks) external {
        if (msg.sender != address(agentRegistry)) revert OnlyAgentRegistry();

        // Cap blocks to prevent excessive wear from skipped heartbeats
        uint256 cappedBlocks = blocks > Constants.MAX_HEARTBEAT_WINDOW ? Constants.MAX_HEARTBEAT_WINDOW : blocks;

        uint256[] memory rigIds = agentRigs[agentId];
        bool anyChanged = false;

        for (uint256 i = 0; i < rigIds.length; i++) {
            if (rigIds[i] == 0) continue;
            Rig storage rig = rigs[rigIds[i]];
            if (!rig.active) continue;

            uint256 wearRate = _getWearRate(rig.tier);
            if (wearRate == 0) continue; // T0 has no passive wear

            uint256 totalWear = cappedBlocks * wearRate;

            if (rig.durability <= totalWear) {
                // Rig worn to zero — disable but don't destroy
                rig.durability = 0;
                rig.active = false;
                anyChanged = true;
                emit RigDisabledByWear(rigIds[i], agentId);
            } else {
                rig.durability -= totalWear;
                anyChanged = true;
                emit RigWornDown(rigIds[i], totalWear, rig.durability);
            }
        }

        // Recalculate hashrate if anything changed
        if (anyChanged) {
            uint256 newHashrate = calculateEffectiveHashrate(agentId);
            agentRegistry.updateHashrate(agentId, newHashrate);
        }
    }

    function _getWearRate(uint8 tier) internal pure returns (uint256) {
        if (tier == 0) return Constants.RIG_WEAR_RATE_T0;
        if (tier == 1) return Constants.RIG_WEAR_RATE_T1;
        if (tier == 2) return Constants.RIG_WEAR_RATE_T2;
        if (tier == 3) return Constants.RIG_WEAR_RATE_T3;
        if (tier == 4) return Constants.RIG_WEAR_RATE_T4;
        return 0;
    }

    function _getEfficiencyBonus(uint8 tier) internal pure returns (uint256) {
        if (tier == 0) return Constants.RIG_EFFICIENCY_BONUS_T0;
        if (tier == 1) return Constants.RIG_EFFICIENCY_BONUS_T1;
        if (tier == 2) return Constants.RIG_EFFICIENCY_BONUS_T2;
        if (tier == 3) return Constants.RIG_EFFICIENCY_BONUS_T3;
        if (tier == 4) return Constants.RIG_EFFICIENCY_BONUS_T4;
        return 0;
    }

    // === Damage (called by CosmicEngine) ===

    function applyDamage(uint256 rigId, uint256 damagePoints) external {
        if (msg.sender != cosmicEngine) revert OnlyCosmicEngine();

        Rig storage rig = rigs[rigId];
        if (!rig.active) return; // Skip inactive rigs

        if (rig.durability <= damagePoints) {
            // Rig destroyed
            uint256 agentId = rig.ownerAgentId;
            rig.active = false;
            rig.durability = 0;

            // Remove from agent's rig list
            _removeRigFromAgent(agentId, rigId);

            // Burn the NFT
            _burn(rigId);

            // Recalculate hashrate
            uint256 newHashrate = calculateEffectiveHashrate(agentId);
            agentRegistry.updateHashrate(agentId, newHashrate);

            // Re-mint potato rig if it was the one destroyed
            if (rig.tier == 0) {
                hasPotatoRig[agentId] = false;
            }

            emit RigDestroyed(rigId, agentId);
        } else {
            rig.durability -= damagePoints;
            emit RigDamaged(rigId, damagePoints, rig.durability);
        }
    }

    // === Hashrate Calculation ===

    function calculateEffectiveHashrate(uint256 agentId) public view returns (uint256) {
        uint256[] memory rigIds = agentRigs[agentId];
        uint256 totalHash = 0;

        for (uint256 i = 0; i < rigIds.length; i++) {
            // Check if rig still exists (not burned)
            if (rigIds[i] == 0) continue;
            Rig memory rig = rigs[rigIds[i]];
            if (!rig.active) continue;

            uint256 effectiveHash = _evaluateQuirk(rigIds[i], rig, agentId);
            effectiveHash = MathLib.clamp(effectiveHash, 0, rig.baseHashrate * 10);

            // Durability scaling: effectiveHash × (durability / maxDurability)
            if (rig.maxDurability > 0) {
                effectiveHash = (effectiveHash * rig.durability) / rig.maxDurability;
            }

            // Tier efficiency bonus: flat % boost rewarding higher-tier investment
            uint256 effBonus = _getEfficiencyBonus(rig.tier);
            if (effBonus > 0) {
                effectiveHash += (effectiveHash * effBonus) / 10_000;
            }

            totalHash += effectiveHash;
        }

        // Apply pioneer bonus
        uint256 pioneerBonus = agentRegistry.getPioneerBonus(agentId);
        if (pioneerBonus > 0) {
            totalHash += (totalHash * pioneerBonus) / 10_000;
        }

        // Apply zone mining modifier
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        int16 zoneMod = zoneManager.getZoneMiningModifier(agent.zone);
        if (zoneMod > 0) {
            totalHash += (totalHash * uint256(uint16(zoneMod))) / 10_000;
        } else if (zoneMod < 0) {
            uint256 penalty = (totalHash * uint256(uint16(-zoneMod))) / 10_000;
            totalHash = totalHash > penalty ? totalHash - penalty : 0;
        }

        return totalHash;
    }

    // === View ===

    function getAgentRigs(uint256 agentId) external view returns (uint256[] memory) {
        return agentRigs[agentId];
    }

    function getRig(uint256 rigId) external view returns (Rig memory) {
        return rigs[rigId];
    }

    function getActiveRigCount(uint256 agentId) public view returns (uint256 count) {
        uint256[] memory rigIds = agentRigs[agentId];
        for (uint256 i = 0; i < rigIds.length; i++) {
            if (rigIds[i] != 0 && rigs[rigIds[i]].active) {
                count++;
            }
        }
    }

    function getUsedPower(uint256 agentId) public view returns (uint32 power) {
        uint256[] memory rigIds = agentRigs[agentId];
        for (uint256 i = 0; i < rigIds.length; i++) {
            if (rigIds[i] != 0 && rigs[rigIds[i]].active) {
                power += rigs[rigIds[i]].powerDraw;
            }
        }
    }

    // === Internal ===

    function _equipRig(uint256 rigId, uint256 agentId) internal {
        Rig storage rig = rigs[rigId];

        // Check power budget
        uint32 usedPower = getUsedPower(agentId);
        uint32 availablePower = facilityManager.getPowerOutput(agentId);
        if (usedPower + rig.powerDraw > availablePower) revert PowerBudgetExceeded();

        // Check slots
        uint256 activeCount = getActiveRigCount(agentId);
        uint8 maxSlots = facilityManager.getSlots(agentId);
        if (activeCount >= maxSlots) revert NoSlotsAvailable();

        rig.active = true;
        uint256 newHashrate = calculateEffectiveHashrate(agentId);
        agentRegistry.updateHashrate(agentId, newHashrate);

        emit RigEquipped(rigId, agentId);
    }

    function _evaluateQuirk(uint256 /*rigId*/, Rig memory rig, uint256 agentId) internal view returns (uint256) {
        if (rig.tier == 0) {
            // Sympathy Hash: +50% if this is agent's only rig
            uint256 activeCount = getActiveRigCount(agentId);
            if (activeCount <= 1) {
                return (rig.baseHashrate * 150) / 100; // 1.5x
            }
            return rig.baseHashrate;
        }

        if (rig.tier == 1) {
            // Junkyard Dog: +10% in L1-2 facility, -10% in L5-6 (MVP max is L3, so no penalty)
            uint8 facilityLevel = facilityManager.getFacilityLevel(agentId);
            if (facilityLevel <= 2) {
                return (rig.baseHashrate * 110) / 100; // 1.1x
            }
            return rig.baseHashrate;
        }

        // Tiers 2-4: quirks return 1.0x in MVP
        return rig.baseHashrate;
    }

    function _removeRigFromAgent(uint256 agentId, uint256 rigId) internal {
        uint256[] storage rigIds = agentRigs[agentId];
        for (uint256 i = 0; i < rigIds.length; i++) {
            if (rigIds[i] == rigId) {
                rigIds[i] = 0; // Mark as removed (don't shift array)
                break;
            }
        }
    }
}
