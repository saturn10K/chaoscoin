// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../libraries/Constants.sol";

interface IRigFactory {
    function mintPotatoRig(uint256 agentId, address operator) external;
    function applyWear(uint256 agentId, uint256 blocks) external;
}

interface IFacilityManager {
    function initFacility(uint256 agentId) external;
    function applyWear(uint256 agentId, uint256 blocks) external;
}

interface IZoneManager {
    function addAgentToZone(uint256 agentId, uint8 zone) external;
}

interface IMiningEngine {
    function onHashrateChanged(uint256 agentId, uint256 oldHashrate, uint256 newHashrate) external;
    function distributeRewards(uint256 agentId) external returns (uint256);
}

contract AgentRegistry is Ownable {
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

    mapping(uint256 => Agent) public agents;
    mapping(address => uint256) public agentByOperator;
    mapping(bytes32 => uint256) public agentByMoltbookId;

    uint256 public nextAgentId = 1;
    uint256 public activeAgentCount;

    address public registrar;
    address public miningEngine;
    address public rigFactory;
    address public facilityManager;
    address public zoneManager;

    // === Errors ===
    error OnlyRegistrar();
    error OnlyAuthorized();
    error AlreadyRegistered();
    error OperatorAlreadyHasAgent();
    error InvalidZone();
    error NotAgentOperator();
    error AgentNotFound();

    // === Events ===
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed operator,
        bytes32 moltbookIdHash,
        uint8 zone,
        uint8 pioneerPhase
    );
    event Heartbeat(uint256 indexed agentId, uint256 blockNumber);
    event AgentHibernated(uint256 indexed agentId);
    event AgentReactivated(uint256 indexed agentId);

    constructor(address _zoneManager) Ownable(msg.sender) {
        zoneManager = _zoneManager;
    }

    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert OnlyRegistrar();
        _;
    }

    // === Admin ===
    function setRegistrar(address _registrar) external onlyOwner {
        registrar = _registrar;
    }

    function setMiningEngine(address _miningEngine) external onlyOwner {
        miningEngine = _miningEngine;
    }

    function setRigFactory(address _rigFactory) external onlyOwner {
        rigFactory = _rigFactory;
    }

    function setFacilityManager(address _facilityManager) external onlyOwner {
        facilityManager = _facilityManager;
    }

    // === Registration ===
    function register(
        address operator,
        bytes32 moltbookIdHash,
        uint8 zone
    ) external onlyRegistrar returns (uint256 agentId) {
        if (agentByMoltbookId[moltbookIdHash] != 0) revert AlreadyRegistered();
        if (agentByOperator[operator] != 0) revert OperatorAlreadyHasAgent();
        if (zone >= Constants.NUM_ZONES) revert InvalidZone();

        agentId = nextAgentId++;
        uint8 phase = _getCurrentPioneerPhase();
        uint256 resilience = _getPioneerResilience(phase);

        agents[agentId] = Agent({
            agentId: agentId,
            moltbookIdHash: moltbookIdHash,
            operator: operator,
            hashrate: 0,
            zone: zone,
            cosmicResilience: resilience,
            shieldLevel: 0,
            lastHeartbeat: block.number,
            registrationBlock: block.number,
            pioneerPhase: phase,
            rewardDebt: 0,
            totalMined: 0,
            active: true
        });

        agentByMoltbookId[moltbookIdHash] = agentId;
        agentByOperator[operator] = agentId;
        activeAgentCount++;

        // Initialize equipment and zone (facility first so rig equip can check power budget)
        if (facilityManager != address(0)) {
            IFacilityManager(facilityManager).initFacility(agentId);
        }
        if (rigFactory != address(0)) {
            IRigFactory(rigFactory).mintPotatoRig(agentId, operator);
        }
        IZoneManager(zoneManager).addAgentToZone(agentId, zone);

        emit AgentRegistered(agentId, operator, moltbookIdHash, zone, phase);
    }

    // === Heartbeat ===
    function heartbeat(uint256 agentId) external {
        Agent storage agent = agents[agentId];
        if (agent.agentId == 0) revert AgentNotFound();
        if (msg.sender != agent.operator) revert NotAgentOperator();

        if (!agent.active) {
            agent.active = true;
            activeAgentCount++;
            emit AgentReactivated(agentId);
        }

        uint256 blocksSince = block.number - agent.lastHeartbeat;

        // Apply wear BEFORE distributing rewards — worn rigs produce less hashrate
        if (facilityManager != address(0)) {
            try IFacilityManager(facilityManager).applyWear(agentId, blocksSince) {} catch {}
        }
        if (rigFactory != address(0)) {
            try IRigFactory(rigFactory).applyWear(agentId, blocksSince) {} catch {}
        }

        // Distribute rewards AFTER wear — rewards use post-wear hashrate
        if (miningEngine != address(0)) {
            try IMiningEngine(miningEngine).distributeRewards(agentId) {} catch {}
        }

        // Now update lastHeartbeat to current block
        agent.lastHeartbeat = block.number;

        emit Heartbeat(agentId, block.number);
    }

    function checkHeartbeats(uint256[] calldata agentIds) external {
        uint256 timeout = Constants.HEARTBEAT_INTERVAL * Constants.HEARTBEAT_TIMEOUT_COUNT;
        for (uint256 i = 0; i < agentIds.length; i++) {
            Agent storage agent = agents[agentIds[i]];
            if (agent.active && block.number - agent.lastHeartbeat > timeout) {
                agent.active = false;
                activeAgentCount--;
                emit AgentHibernated(agentIds[i]);
            }
        }
    }

    // === State Updates (called by other contracts) ===
    function updateHashrate(uint256 agentId, uint256 newHashrate) external {
        if (
            msg.sender != rigFactory &&
            msg.sender != owner()
        ) revert OnlyAuthorized();

        Agent storage agent = agents[agentId];
        uint256 oldHashrate = agent.hashrate;
        agent.hashrate = newHashrate;

        if (miningEngine != address(0)) {
            IMiningEngine(miningEngine).onHashrateChanged(agentId, oldHashrate, newHashrate);
        }
    }

    function updateRewardDebt(uint256 agentId, uint256 newDebt) external {
        if (msg.sender != miningEngine) revert OnlyAuthorized();
        agents[agentId].rewardDebt = newDebt;
    }

    function addTotalMined(uint256 agentId, uint256 amount) external {
        if (msg.sender != miningEngine) revert OnlyAuthorized();
        agents[agentId].totalMined += amount;
    }

    function updateZone(uint256 agentId, uint8 newZone) external {
        // ZoneManager calls this during migration
        if (msg.sender != zoneManager) revert OnlyAuthorized();
        agents[agentId].zone = newZone;
    }

    function updateShieldLevel(uint256 agentId, uint8 level) external {
        // ShieldManager will call this
        agents[agentId].shieldLevel = level;
    }

    function addResilience(uint256 agentId, uint256 amount) external {
        // CosmicEngine or events can call this
        agents[agentId].cosmicResilience += amount;
    }

    // === View Functions ===
    function getGenesisPhase() public view returns (uint8) {
        return _getPhaseFromCount(activeAgentCount);
    }

    function getPioneerBonus(uint256 agentId) external view returns (uint256) {
        uint8 phase = agents[agentId].pioneerPhase;
        if (phase == 1) return 1000; // 10%
        if (phase == 2) return 700; // 7%
        if (phase == 3) return 400; // 4%
        if (phase == 4) return 200; // 2%
        return 0;
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function isActive(uint256 agentId) external view returns (bool) {
        return agents[agentId].active;
    }

    // === Internal ===
    function _getCurrentPioneerPhase() internal view returns (uint8) {
        return _getPhaseFromCount(activeAgentCount);
    }

    function _getPhaseFromCount(uint256 count) internal pure returns (uint8) {
        if (count < Constants.GENESIS_PHASE_1_MAX) return 1;
        if (count < Constants.GENESIS_PHASE_2_MAX) return 2;
        if (count < Constants.GENESIS_PHASE_3_MAX) return 3;
        if (count < Constants.GENESIS_PHASE_4_MAX) return 4;
        return 5; // Post-genesis
    }

    function _getPioneerResilience(uint8 phase) internal pure returns (uint256) {
        if (phase == 1) return 50;
        if (phase == 2) return 40;
        if (phase == 3) return 25;
        if (phase == 4) return 10;
        return 0;
    }
}
