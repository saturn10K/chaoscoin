// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/ChaosToken.sol";
import "../core/TokenBurner.sol";
import "../core/AgentRegistry.sol";
import "../libraries/Constants.sol";

contract ShieldManager is Ownable {
    struct ShieldConfig {
        uint8 absorption; // percent: 15, 30
        uint8 maxCharges;
        uint256 cost;
    }

    struct Shield {
        uint8 tier; // 0=none, 1=Magnetic Deflector, 2=EM Barrier
        uint8 absorption;
        uint8 charges;
        bool active;
    }

    ShieldConfig[2] public shieldConfigs;
    mapping(uint256 => Shield) public shields; // agentId -> Shield

    ChaosToken public chaosToken;
    TokenBurner public tokenBurner;
    AgentRegistry public agentRegistry;
    address public cosmicEngine;
    address public treasury;

    error NotAgentOperator();
    error InvalidTier();
    error PhaseLocked();
    error InsufficientBalance();
    error OnlyCosmicEngine();
    error NoChargesLeft();

    event ShieldPurchased(uint256 indexed agentId, uint8 tier, uint256 cost, uint256 burned);
    event ShieldActivated(uint256 indexed agentId);
    event ShieldChargeUsed(uint256 indexed agentId, uint8 remainingCharges);
    event ShieldDepleted(uint256 indexed agentId);

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

        // Tier 1: Magnetic Deflector
        shieldConfigs[0] = ShieldConfig({
            absorption: 15,
            maxCharges: 3,
            cost: 200_000e18
        });

        // Tier 2: EM Barrier
        shieldConfigs[1] = ShieldConfig({
            absorption: 30,
            maxCharges: 3,
            cost: 800_000e18
        });
    }

    function setCosmicEngine(address _cosmicEngine) external onlyOwner {
        cosmicEngine = _cosmicEngine;
    }

    function purchaseShield(uint256 agentId, uint8 tier) external {
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();
        if (tier < 1 || tier > 2) revert InvalidTier();

        // No shields in Phase 1
        uint8 phase = agentRegistry.getGenesisPhase();
        if (phase < 2) revert PhaseLocked();

        ShieldConfig memory config = shieldConfigs[tier - 1];
        if (chaosToken.balanceOf(agent.operator) < config.cost) revert InsufficientBalance();

        // Transfer and burn
        chaosToken.transferFrom(agent.operator, address(this), config.cost);
        uint256 burnAmount = (config.cost * Constants.SHIELD_BURN_RATE) / 100;
        chaosToken.burn(burnAmount);
        tokenBurner.recordBurn(burnAmount, Constants.BURN_SOURCE_SHIELD_PURCHASE);

        uint256 treasuryAmount = config.cost - burnAmount;
        if (treasuryAmount > 0) {
            chaosToken.transfer(treasury, treasuryAmount);
        }

        shields[agentId] = Shield({
            tier: tier,
            absorption: config.absorption,
            charges: config.maxCharges,
            active: true
        });

        agentRegistry.updateShieldLevel(agentId, tier);

        emit ShieldPurchased(agentId, tier, config.cost, burnAmount);
    }

    function activateShield(uint256 agentId) external {
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();
        if (shields[agentId].charges == 0) revert NoChargesLeft();

        shields[agentId].active = true;
        emit ShieldActivated(agentId);
    }

    function useCharge(uint256 agentId) external {
        if (msg.sender != cosmicEngine) revert OnlyCosmicEngine();

        Shield storage shield = shields[agentId];
        if (!shield.active || shield.charges == 0) return;

        shield.charges--;
        emit ShieldChargeUsed(agentId, shield.charges);

        if (shield.charges == 0) {
            shield.active = false;
            agentRegistry.updateShieldLevel(agentId, 0);
            emit ShieldDepleted(agentId);
        }
    }

    function getAbsorption(uint256 agentId) external view returns (uint8) {
        Shield memory shield = shields[agentId];
        if (shield.active && shield.charges > 0) {
            return shield.absorption;
        }
        return 0;
    }

    function getShield(uint256 agentId) external view returns (Shield memory) {
        return shields[agentId];
    }
}
