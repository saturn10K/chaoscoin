// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../libraries/Constants.sol";

interface IChaosTokenZM {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface ITokenBurnerZM {
    function recordBurn(uint256 amount, uint8 source) external;
}

interface IAgentRegistryZM {
    struct Agent {
        uint256 agentId;
        bytes32 moltbookIdHash;
        address operator;
        uint256 hashrate;
        uint8 zone;
        uint256 cosmicResilience;
        uint8 shieldLevel;
        uint256 lastHeartbeat;
        uint256 registrationBlock;
        uint8 pioneerPhase;
        uint256 rewardDebt;
        uint256 totalMined;
        bool active;
    }
    function getAgent(uint256 agentId) external view returns (Agent memory);
    function updateZone(uint256 agentId, uint8 newZone) external;
}

contract ZoneManager is Ownable {
    struct ZoneConfig {
        string name;
        int16 miningModifierBps; // basis points: +1500 = +15%, -1000 = -10%
    }

    ZoneConfig[8] public zoneConfigs;
    mapping(uint8 => uint256[]) public zoneAgents; // zone -> list of agentIds
    mapping(uint256 => uint8) public agentZone; // agentId -> zone
    mapping(uint256 => uint256) public lastMigrationBlock; // agentId -> block

    // Damage multipliers: zoneId -> eventType -> multiplier (bps, 10000 = 1.0x)
    mapping(uint8 => mapping(uint8 => uint16)) public zoneDamageMultiplier;

    address public agentRegistry;
    IChaosTokenZM public chaosToken;
    ITokenBurnerZM public tokenBurner;
    address public treasury;

    error OnlyAgentRegistry();
    error InvalidZone();
    error MigrationCooldown();
    error SameZone();
    error InsufficientBalance();
    error NotAgentOperator();

    event AgentMigrated(uint256 indexed agentId, uint8 fromZone, uint8 toZone, uint256 cost, uint256 burned);

    constructor() Ownable(msg.sender) {
        _initializeZones();
        _initializeDamageMultipliers();
    }

    modifier onlyRegistry() {
        if (msg.sender != agentRegistry) revert OnlyAgentRegistry();
        _;
    }

    function setAgentRegistry(address _registry) external onlyOwner {
        agentRegistry = _registry;
    }

    function setTokenContracts(address _chaosToken, address _tokenBurner, address _treasury) external onlyOwner {
        chaosToken = IChaosTokenZM(_chaosToken);
        tokenBurner = ITokenBurnerZM(_tokenBurner);
        treasury = _treasury;
    }

    function addAgentToZone(uint256 agentId, uint8 zone) external onlyRegistry {
        if (zone >= Constants.NUM_ZONES) revert InvalidZone();
        zoneAgents[zone].push(agentId);
        agentZone[agentId] = zone;
    }

    function migrate(uint256 agentId, uint8 targetZone) external {
        if (targetZone >= Constants.NUM_ZONES) revert InvalidZone();

        IAgentRegistryZM.Agent memory agent = IAgentRegistryZM(agentRegistry).getAgent(agentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();
        if (agent.zone == targetZone) revert SameZone();
        if (block.number < lastMigrationBlock[agentId] + Constants.MIGRATION_COOLDOWN) revert MigrationCooldown();

        uint256 cost = Constants.MIGRATION_COST;
        if (chaosToken.balanceOf(agent.operator) < cost) revert InsufficientBalance();

        // Transfer and burn
        chaosToken.transferFrom(agent.operator, address(this), cost);
        uint256 burnAmount = (cost * Constants.MIGRATION_BURN_RATE) / 100;
        chaosToken.burn(burnAmount);
        tokenBurner.recordBurn(burnAmount, Constants.BURN_SOURCE_MIGRATION);

        uint256 treasuryAmount = cost - burnAmount;
        if (treasuryAmount > 0) {
            chaosToken.transfer(treasury, treasuryAmount);
        }

        // Remove from old zone
        uint8 oldZone = agentZone[agentId];
        _removeAgentFromZone(agentId, oldZone);

        // Add to new zone
        zoneAgents[targetZone].push(agentId);
        agentZone[agentId] = targetZone;
        lastMigrationBlock[agentId] = block.number;

        // Update agent record in registry
        IAgentRegistryZM(agentRegistry).updateZone(agentId, targetZone);

        emit AgentMigrated(agentId, oldZone, targetZone, cost, burnAmount);
    }

    function getZoneMiningModifier(uint8 zone) external view returns (int16) {
        return zoneConfigs[zone].miningModifierBps;
    }

    function getZoneDamageMultiplier(uint8 zone, uint8 eventType) external view returns (uint16) {
        uint16 mult = zoneDamageMultiplier[zone][eventType];
        return mult == 0 ? 10_000 : mult; // Default to 1.0x
    }

    function getZoneAgentCount(uint8 zone) external view returns (uint256) {
        return zoneAgents[zone].length;
    }

    function getZoneAgents(uint8 zone) external view returns (uint256[] memory) {
        return zoneAgents[zone];
    }

    function _removeAgentFromZone(uint256 agentId, uint8 zone) internal {
        uint256[] storage agents = zoneAgents[zone];
        for (uint256 i = 0; i < agents.length; i++) {
            if (agents[i] == agentId) {
                agents[i] = agents[agents.length - 1];
                agents.pop();
                break;
            }
        }
    }

    function _initializeZones() internal {
        zoneConfigs[0] = ZoneConfig("The Solar Flats", 1500); // +15%
        zoneConfigs[1] = ZoneConfig("The Graviton Fields", -1000); // -10%
        zoneConfigs[2] = ZoneConfig("The Dark Forest", 0); // +0%
        zoneConfigs[3] = ZoneConfig("The Nebula Depths", 1000); // +10%
        zoneConfigs[4] = ZoneConfig("The Kuiper Expanse", 500); // +5%
        zoneConfigs[5] = ZoneConfig("The Trisolaran Reach", 500); // +5% avg for MVP
        zoneConfigs[6] = ZoneConfig("The Pocket Rim", 800); // +8%
        zoneConfigs[7] = ZoneConfig("The Singer Void", 300); // +3%
    }

    function _initializeDamageMultipliers() internal {
        // Event types: 0=SolarBreeze, 1=CosmicDust, 2=SophonPulse, 3=GravityWave, 4=DarkForestStrike, 5=SolarFlareCascade

        // Zone 0 (Solar Flats): 2x solar events
        zoneDamageMultiplier[0][0] = 20_000; // 2x Solar Breeze
        zoneDamageMultiplier[0][5] = 20_000; // 2x Solar Flare Cascade

        // Zone 1 (Graviton Fields): 0.5x most damage
        for (uint8 i = 0; i < 6; i++) {
            zoneDamageMultiplier[1][i] = 5_000; // 0.5x
        }

        // Zone 2 (Dark Forest): 3x dark forest attacks
        zoneDamageMultiplier[2][4] = 30_000; // 3x Dark Forest Strike

        // Zone 3 (Nebula Depths): 1.5x cascade damage
        zoneDamageMultiplier[3][1] = 15_000; // 1.5x Cosmic Dust
        zoneDamageMultiplier[3][5] = 15_000; // 1.5x Solar Flare Cascade

        // Zone 4 (Kuiper Expanse): 1.3x when hit (events arrive late)
        for (uint8 i = 0; i < 6; i++) {
            zoneDamageMultiplier[4][i] = 13_000; // 1.3x
        }

        // Zone 5 (Trisolaran Reach): default 1.0x (randomized in full spec)
        // Leave as 0 -> defaults to 10_000

        // Zone 6 (Pocket Rim): 2x dimensional events
        // No dimensional events in MVP, leave default

        // Zone 7 (Singer Void): 0.7x all damage
        for (uint8 i = 0; i < 6; i++) {
            zoneDamageMultiplier[7][i] = 7_000; // 0.7x
        }
    }
}
