// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ChaosToken.sol";
import "./AgentRegistry.sol";
import "./TokenBurner.sol";
import "../cosmic/EraManager.sol";
import "../libraries/Constants.sol";
import "../libraries/MathLib.sol";

/**
 * @title MiningEngine — Heartbeat-Only Rewards
 * @notice Agents ONLY earn CHAOS when they send heartbeats.
 *         No heartbeat = no rewards. Passive accumulation is impossible.
 *
 *         On each heartbeat the engine calculates:
 *           blocks = min(currentBlock - lastHeartbeat, MAX_HEARTBEAT_WINDOW)
 *           agentEmission = blocks * emissionPerBlock * (agentHashrate / totalHashrate)
 *         Then mints, burns 20%, and transfers the net reward to the operator.
 */
contract MiningEngine is Ownable {
    using MathLib for uint256;

    ChaosToken public chaosToken;
    AgentRegistry public agentRegistry;
    TokenBurner public tokenBurner;
    EraManager public eraManager;

    uint256 public totalEffectiveHashrate;
    uint256 public immutable genesisBlock;

    /// @notice Maximum blocks that count toward a single heartbeat reward.
    ///         Prevents gaming by heartbeating once after a long absence.
    uint256 public constant MAX_HEARTBEAT_WINDOW = 500;

    /// @notice Per-agent pending rewards — buffered during warmup or hashrate changes.
    mapping(uint256 => uint256) public pendingRewards;

    error NotAgentOperator();
    error TooEarlyToClaim();
    error NothingToClaim();
    error OnlyAgentRegistry();

    event RewardsDistributed(uint256 indexed agentId, uint256 amount);
    event HeartbeatReward(uint256 indexed agentId, uint256 blocks, uint256 gross, uint256 net);

    constructor(
        address _chaosToken,
        address _agentRegistry,
        address _tokenBurner,
        address _eraManager
    ) Ownable(msg.sender) {
        chaosToken = ChaosToken(_chaosToken);
        agentRegistry = AgentRegistry(_agentRegistry);
        tokenBurner = TokenBurner(_tokenBurner);
        eraManager = EraManager(_eraManager);
        genesisBlock = block.number;
    }

    // === Core Functions ===

    /// @notice Called by AgentRegistry on heartbeat. Calculates and distributes
    ///         rewards based on blocks since the agent's last heartbeat.
    function distributeRewards(uint256 agentId) external returns (uint256 distributed) {
        if (msg.sender != address(agentRegistry)) revert OnlyAgentRegistry();

        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);

        // Too early — no distribution before first-mine delay
        if (block.number < agent.registrationBlock + Constants.FIRST_MINE_DELAY) {
            return 0;
        }

        // Calculate heartbeat-based reward
        uint256 heartbeatReward = _calculateHeartbeatReward(agent);

        distributed = heartbeatReward + pendingRewards[agentId];
        pendingRewards[agentId] = 0;

        if (distributed == 0) return 0;

        agentRegistry.addTotalMined(agentId, distributed);

        // Transfer directly to operator
        chaosToken.transfer(agent.operator, distributed);

        emit RewardsDistributed(agentId, distributed);
    }

    /// @notice Manual claim — only pays out buffered pendingRewards (no new accrual).
    function claimRewards(uint256 agentId) external returns (uint256 claimed) {
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);
        if (msg.sender != agent.operator) revert NotAgentOperator();
        if (block.number < agent.registrationBlock + Constants.FIRST_MINE_DELAY) {
            revert TooEarlyToClaim();
        }

        claimed = pendingRewards[agentId];
        pendingRewards[agentId] = 0;

        if (claimed == 0) revert NothingToClaim();

        agentRegistry.addTotalMined(agentId, claimed);
        chaosToken.transfer(agent.operator, claimed);

        emit RewardsDistributed(agentId, claimed);
    }

    /// @notice Called by AgentRegistry when an agent's hashrate changes.
    function onHashrateChanged(
        uint256 agentId,
        uint256 oldHashrate,
        uint256 newHashrate
    ) external {
        if (msg.sender != address(agentRegistry)) revert OnlyAgentRegistry();

        // Update global hashrate
        totalEffectiveHashrate = totalEffectiveHashrate - oldHashrate + newHashrate;
    }

    // === Internal ===

    /// @notice Calculate, mint, and return net reward for a single heartbeat.
    function _calculateHeartbeatReward(
        AgentRegistry.Agent memory agent
    ) internal returns (uint256 netReward) {
        if (agent.hashrate == 0 || totalEffectiveHashrate == 0) return 0;

        // Blocks since last heartbeat, capped
        uint256 blocksSince = block.number - agent.lastHeartbeat;
        if (blocksSince == 0) return 0;
        if (blocksSince > MAX_HEARTBEAT_WINDOW) {
            blocksSince = MAX_HEARTBEAT_WINDOW;
        }

        uint256 emissionPerBlock = calculateAdaptiveEmission();
        if (emissionPerBlock == 0) return 0;

        // This agent's share of the total emission for these blocks
        uint256 grossReward = (blocksSince * emissionPerBlock * agent.hashrate) / totalEffectiveHashrate;

        // Check against remaining supply
        uint256 remaining = Constants.CIRCULATING_CAP - chaosToken.totalSupply();
        if (grossReward > remaining) {
            grossReward = remaining;
        }
        if (grossReward == 0) return 0;

        // Mint to this contract
        chaosToken.mint(address(this), grossReward);

        // Burn 20% at source
        uint256 burnAmount = (grossReward * Constants.BURN_ON_EARN_RATE) / 100;
        chaosToken.burn(burnAmount);
        tokenBurner.recordBurn(burnAmount, Constants.BURN_SOURCE_MINING);

        netReward = grossReward - burnAmount;

        emit HeartbeatReward(agent.agentId, blocksSince, grossReward, netReward);
    }

    // === View Functions ===

    function calculateAdaptiveEmission() public view returns (uint256 emissionPerBlock) {
        uint256 activeAgents = agentRegistry.activeAgentCount();
        if (activeAgents == 0) return 0;

        // Base target: 500K CHAOS/agent/day
        uint256 targetTotal = (Constants.TARGET_DAILY_INCOME * activeAgents) / Constants.BLOCKS_PER_DAY;

        // Genesis multiplier: max(1.0, 20 * (1 - agents/10000)^2)
        uint256 genesisMult = 1e18;
        if (activeAgents < Constants.GENESIS_AGENT_THRESHOLD) {
            uint256 ratio = (activeAgents * 1e18) / Constants.GENESIS_AGENT_THRESHOLD;
            uint256 decay = 1e18 - ratio;
            uint256 decaySquared = (decay * decay) / 1e18;
            uint256 mult = (20e18 * decaySquared) / 1e18;
            genesisMult = MathLib.max(1e18, mult);
        }

        // Era modifier
        uint256 eraMod = eraManager.getCurrentModifier();

        // Higher one wins (do NOT stack)
        uint256 effectiveMod = MathLib.max(genesisMult, eraMod);

        emissionPerBlock = (targetTotal * effectiveMod) / 1e18;

        // Halving cap
        uint256 epoch = (block.number - genesisBlock) / Constants.HALVING_INTERVAL;
        uint256 maxEmission = Constants.MAX_EMISSION_EPOCH_1;
        if (epoch > 0) {
            maxEmission = maxEmission >> epoch;
        }
        if (maxEmission == 0) maxEmission = 1;
        emissionPerBlock = MathLib.min(emissionPerBlock, maxEmission);

        // Supply cap
        uint256 remaining = Constants.CIRCULATING_CAP - chaosToken.totalSupply();
        emissionPerBlock = MathLib.min(emissionPerBlock, remaining);
    }

    /// @notice View: estimate what an agent would receive on next heartbeat.
    function getPendingRewards(uint256 agentId) external view returns (uint256) {
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(agentId);

        // Buffered rewards always included
        uint256 buffered = pendingRewards[agentId];

        if (agent.hashrate == 0 || totalEffectiveHashrate == 0) return buffered;

        // Simulate heartbeat reward
        uint256 blocksSince = block.number - agent.lastHeartbeat;
        if (blocksSince > MAX_HEARTBEAT_WINDOW) {
            blocksSince = MAX_HEARTBEAT_WINDOW;
        }

        uint256 emissionPerBlock = calculateAdaptiveEmission();
        uint256 grossReward = (blocksSince * emissionPerBlock * agent.hashrate) / totalEffectiveHashrate;

        uint256 remaining = Constants.CIRCULATING_CAP - chaosToken.totalSupply();
        if (grossReward > remaining) grossReward = remaining;

        uint256 netReward = grossReward - (grossReward * Constants.BURN_ON_EARN_RATE / 100);

        return netReward + buffered;
    }
}
