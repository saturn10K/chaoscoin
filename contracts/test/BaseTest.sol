// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/core/ChaosToken.sol";
import "../src/core/TokenBurner.sol";
import "../src/core/AgentRegistry.sol";
import "../src/core/MiningEngine.sol";
import "../src/equipment/FacilityManager.sol";
import "../src/equipment/RigFactory.sol";
import "../src/cosmic/EraManager.sol";
import "../src/cosmic/ZoneManager.sol";
import "../src/cosmic/ShieldManager.sol";
import "../src/cosmic/CosmicEngine.sol";
import "../src/libraries/Constants.sol";

contract BaseTest is Test {
    ChaosToken public chaosToken;
    TokenBurner public tokenBurner;
    EraManager public eraManager;
    ZoneManager public zoneManager;
    AgentRegistry public agentRegistry;
    MiningEngine public miningEngine;
    FacilityManager public facilityManager;
    RigFactory public rigFactory;
    ShieldManager public shieldManager;
    CosmicEngine public cosmicEngine;

    address public deployer = address(this);
    address public treasury = address(0xBEEF);
    address public registrar = address(0xCAFE);

    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public charlie = address(0xC0C0);

    function setUp() public virtual {
        _deployContracts();
        _wireContracts();
    }

    function _deployContracts() internal {
        chaosToken = new ChaosToken();
        tokenBurner = new TokenBurner(address(chaosToken));
        eraManager = new EraManager();
        zoneManager = new ZoneManager();
        agentRegistry = new AgentRegistry(address(zoneManager));
        miningEngine = new MiningEngine(
            address(chaosToken),
            address(agentRegistry),
            address(tokenBurner),
            address(eraManager)
        );
        facilityManager = new FacilityManager(
            address(chaosToken),
            address(agentRegistry),
            address(tokenBurner),
            treasury
        );
        rigFactory = new RigFactory(
            address(chaosToken),
            address(agentRegistry),
            address(facilityManager),
            address(tokenBurner),
            address(zoneManager),
            treasury
        );
        shieldManager = new ShieldManager(
            address(chaosToken),
            address(agentRegistry),
            address(tokenBurner),
            treasury
        );
        cosmicEngine = new CosmicEngine(
            address(agentRegistry),
            address(rigFactory),
            address(facilityManager),
            address(shieldManager),
            address(eraManager),
            address(zoneManager),
            address(chaosToken),
            address(tokenBurner)
        );
    }

    function _wireContracts() internal virtual {
        chaosToken.setMinter(address(miningEngine));
        tokenBurner.setAuthorizedBurner(address(miningEngine), true);
        tokenBurner.setAuthorizedBurner(address(rigFactory), true);
        tokenBurner.setAuthorizedBurner(address(facilityManager), true);
        tokenBurner.setAuthorizedBurner(address(shieldManager), true);
        zoneManager.setAgentRegistry(address(agentRegistry));
        agentRegistry.setRegistrar(registrar);
        agentRegistry.setRigFactory(address(rigFactory));
        agentRegistry.setFacilityManager(address(facilityManager));
        agentRegistry.setMiningEngine(address(miningEngine));
        rigFactory.setCosmicEngine(address(cosmicEngine));
        shieldManager.setCosmicEngine(address(cosmicEngine));
    }

    /// @dev Register an agent and return agentId
    function _registerAgent(address operator, uint8 zone) internal returns (uint256 agentId) {
        bytes32 moltbookHash = keccak256(abi.encodePacked("moltbook-", operator));
        vm.prank(registrar);
        agentId = agentRegistry.register(operator, moltbookHash, zone);
    }

    /// @dev Skip blocks to simulate time passing
    function _skipBlocks(uint256 blocks) internal {
        vm.roll(block.number + blocks);
    }
}
