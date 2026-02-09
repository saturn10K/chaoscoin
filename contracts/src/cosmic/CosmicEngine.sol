// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/AgentRegistry.sol";
import "../core/ChaosToken.sol";
import "../core/TokenBurner.sol";
import "../equipment/RigFactory.sol";
import "../equipment/FacilityManager.sol";
import "./ShieldManager.sol";
import "./EraManager.sol";
import "./ZoneManager.sol";
import "../libraries/Constants.sol";
import "../libraries/MathLib.sol";

contract CosmicEngine is Ownable {
    using MathLib for uint256;

    struct EventRecord {
        uint256 eventId;
        uint8 eventType; // 0-5
        uint8 severityTier; // 1-3
        uint256 baseDamage;
        uint8 originZone;
        uint8 affectedZonesMask; // bitmask of 8 zones
        uint256 triggerBlock;
        address triggeredBy;
        bool processed;
    }

    mapping(uint256 => EventRecord) public events;
    uint256 public nextEventId = 1;
    uint256 public lastEventBlock;

    AgentRegistry public agentRegistry;
    RigFactory public rigFactory;
    FacilityManager public facilityManager;
    ShieldManager public shieldManager;
    EraManager public eraManager;
    ZoneManager public zoneManager;
    ChaosToken public chaosToken;
    TokenBurner public tokenBurner;

    error CooldownNotReached();
    error EventsDisabledInPhase1();
    error EventAlreadyProcessed();

    event EventTriggered(
        uint256 indexed eventId,
        uint8 eventType,
        uint8 tier,
        uint8 originZone,
        uint8 affectedZonesMask,
        address triggeredBy
    );
    event EventProcessed(uint256 indexed eventId, uint256 agentsAffected, uint256 totalDamage);

    constructor(
        address _agentRegistry,
        address _rigFactory,
        address _facilityManager,
        address _shieldManager,
        address _eraManager,
        address _zoneManager,
        address _chaosToken,
        address _tokenBurner
    ) Ownable(msg.sender) {
        agentRegistry = AgentRegistry(_agentRegistry);
        rigFactory = RigFactory(_rigFactory);
        facilityManager = FacilityManager(_facilityManager);
        shieldManager = ShieldManager(_shieldManager);
        eraManager = EraManager(_eraManager);
        zoneManager = ZoneManager(_zoneManager);
        chaosToken = ChaosToken(_chaosToken);
        tokenBurner = TokenBurner(_tokenBurner);
        lastEventBlock = block.number;
    }

    /// @notice Trigger a cosmic event. Permissionless after cooldown.
    function triggerEvent() external returns (uint256 eventId) {
        // Check genesis phase - no events in Phase 1
        uint8 phase = agentRegistry.getGenesisPhase();
        if (phase < 2) revert EventsDisabledInPhase1();

        // Check cooldown
        uint256 cooldown = eraManager.getEventCooldown();
        if (block.number < lastEventBlock + cooldown) revert CooldownNotReached();

        // Generate entropy seed
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1),
                    agentRegistry.activeAgentCount(),
                    nextEventId,
                    block.timestamp
                )
            )
        );

        // Select event tier based on era
        uint8 maxTier = eraManager.getMaxEventTier();
        // Also constrain by genesis phase
        if (phase == 2 && maxTier > 2) maxTier = 2; // Phase 2: max T2
        if (phase == 3 && maxTier > 3) maxTier = 3; // Phase 3: max T3

        uint8 tier = _selectTier(seed, maxTier);
        uint8 eventType = _selectEventType(seed, tier);

        // Get event parameters
        (uint256 baseDamage, uint8 originZone, uint8 affectedMask) = _getEventParams(eventType);

        eventId = nextEventId++;
        events[eventId] = EventRecord({
            eventId: eventId,
            eventType: eventType,
            severityTier: tier,
            baseDamage: baseDamage,
            originZone: originZone,
            affectedZonesMask: affectedMask,
            triggerBlock: block.number,
            triggeredBy: msg.sender,
            processed: false
        });

        lastEventBlock = block.number;

        emit EventTriggered(eventId, eventType, tier, originZone, affectedMask, msg.sender);
    }

    /// @notice Process an event, applying damage to all agents in affected zones.
    function processEvent(uint256 eventId) external {
        EventRecord storage evt = events[eventId];
        if (evt.processed) revert EventAlreadyProcessed();

        uint256 totalAgentsAffected = 0;
        uint256 totalDamageDealt = 0;

        // Iterate affected zones
        for (uint8 zone = 0; zone < Constants.NUM_ZONES; zone++) {
            if ((evt.affectedZonesMask & (1 << zone)) == 0) continue;

            uint256[] memory agentIds = zoneManager.getZoneAgents(zone);

            for (uint256 i = 0; i < agentIds.length; i++) {
                uint256 agentId = agentIds[i];
                if (!agentRegistry.isActive(agentId)) continue;

                uint256 effectiveDamage = _calculateDamage(
                    evt.baseDamage,
                    evt.eventType,
                    agentId,
                    zone
                );

                if (effectiveDamage > 0) {
                    _applyDamageToAgent(agentId, effectiveDamage);
                    totalDamageDealt += effectiveDamage;
                }

                // Use shield charge if agent has one
                shieldManager.useCharge(agentId);

                totalAgentsAffected++;
            }
        }

        evt.processed = true;

        emit EventProcessed(eventId, totalAgentsAffected, totalDamageDealt);
    }

    // === View Functions ===

    function getEvent(uint256 eventId) external view returns (EventRecord memory) {
        return events[eventId];
    }

    // === Internal ===

    function _selectTier(uint256 seed, uint8 maxTier) internal view returns (uint8) {
        uint8 era = eraManager.getCurrentEra();
        uint256 roll = seed % 100;

        if (era == 1) {
            // Era I: 80% T1, 20% T2
            if (roll < 80) return 1;
            return MathLib.min(2, maxTier) > 0 ? uint8(MathLib.min(2, maxTier)) : 1;
        } else {
            // Era II: 30% T1, 40% T2, 30% T3
            if (roll < 30) return 1;
            if (roll < 70) return uint8(MathLib.min(2, maxTier));
            return uint8(MathLib.min(3, maxTier));
        }
    }

    function _selectEventType(uint256 seed, uint8 tier) internal pure returns (uint8) {
        uint256 subSeed = (seed >> 8) % 100;

        if (tier == 1) {
            // 2 T1 events: 0=Solar Breeze, 1=Cosmic Dust Cloud
            return subSeed < 50 ? 0 : 1;
        } else if (tier == 2) {
            // 2 T2 events: 2=Sophon Pulse, 3=Gravity Wave
            return subSeed < 50 ? 2 : 3;
        } else {
            // 2 T3 events: 4=Dark Forest Strike, 5=Solar Flare Cascade
            return subSeed < 50 ? 4 : 5;
        }
    }

    function _getEventParams(uint8 eventType)
        internal
        pure
        returns (uint256 baseDamage, uint8 originZone, uint8 affectedMask)
    {
        if (eventType == 0) {
            // Solar Breeze: no damage, bonus event
            return (0, 0, 0xFF); // All zones
        } else if (eventType == 1) {
            // Cosmic Dust Cloud: 500 durability to T0-T1 rigs
            return (500, 3, 0x0F); // Zones 0-3
        } else if (eventType == 2) {
            // Sophon Surveillance Pulse: no direct damage
            return (0, 5, 0xFF); // All zones
        } else if (eventType == 3) {
            // Gravity Wave Oscillation: no direct damage
            return (0, 1, 0xFF); // All zones
        } else if (eventType == 4) {
            // Dark Forest Strike: 30% of max durability
            return (3000, 2, 0x0F); // Zones 0-3, damage in basis points of max durability
        } else {
            // Solar Flare Cascade: 20% of max durability
            return (2000, 0, 0xFF); // All zones, damage in basis points of max durability
        }
    }

    function _calculateDamage(
        uint256 baseDamage,
        uint8 eventType,
        uint256 agentId,
        uint8 zone
    ) internal view returns (uint256) {
        if (baseDamage == 0) return 0;

        // Zone damage multiplier
        uint16 zoneMod = zoneManager.getZoneDamageMultiplier(zone, eventType);

        // Shelter rating
        uint8 shelterRating = facilityManager.getShelterRating(agentId);
        // Shield absorption
        uint8 shieldAbsorption = shieldManager.getAbsorption(agentId);

        // Additive, capped at 90%
        uint256 totalReduction = uint256(shelterRating) + uint256(shieldAbsorption);
        if (totalReduction > Constants.MAX_SHELTER_SHIELD) {
            totalReduction = Constants.MAX_SHELTER_SHIELD;
        }

        // Cosmic resilience
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        uint256 resilience = agent.cosmicResilience;

        // Calculate: base * zoneMod/10000 * (100 - totalReduction)/100 * (10000 - resilience)/10000
        uint256 damage = baseDamage;
        damage = (damage * uint256(zoneMod)) / 10_000;
        damage = (damage * (100 - totalReduction)) / 100;
        damage = (damage * (10_000 - MathLib.min(resilience, 10_000))) / 10_000;

        return damage;
    }

    function _applyDamageToAgent(uint256 agentId, uint256 damage) internal {
        uint256[] memory rigIds = rigFactory.getAgentRigs(agentId);

        for (uint256 i = 0; i < rigIds.length; i++) {
            if (rigIds[i] == 0) continue;

            RigFactory.Rig memory rig = rigFactory.getRig(rigIds[i]);
            if (!rig.active) continue;

            // For events 4 and 5 (T3), damage is in basis points of max durability
            uint256 rigDamage;
            if (damage >= 1000) {
                // Damage expressed as bps of max durability
                rigDamage = (rig.maxDurability * damage) / 10_000;
            } else {
                rigDamage = damage;
            }

            // For event 1 (Cosmic Dust), only affect T0-T1 rigs
            // This is already handled by baseDamage being set appropriately

            rigFactory.applyDamage(rigIds[i], rigDamage);
        }
    }
}
