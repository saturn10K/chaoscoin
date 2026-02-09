// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
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
import "../src/marketplace/Marketplace.sol";
import "../src/sabotage/Sabotage.sol";

contract Deploy is Script {
    // Store deployed addresses for cross-function access
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
    Marketplace public marketplace;
    Sabotage public sabotage;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envOr("TREASURY", deployer);
        address registrar = vm.envOr("REGISTRAR", deployer);

        vm.startBroadcast(deployerPrivateKey);

        _deployCore(treasury);
        _deployEquipment(treasury);
        _deployCosmic(treasury);
        _deployMarketplaceSabotage(treasury);
        _wireContracts(registrar);

        vm.stopBroadcast();

        _logAddresses(deployer, treasury, registrar);
    }

    function _deployCore(address treasury) internal {
        chaosToken = new ChaosToken();
        tokenBurner = new TokenBurner(address(chaosToken));
        eraManager = new EraManager();
        zoneManager = new ZoneManager();
        agentRegistry = new AgentRegistry(address(zoneManager));
        miningEngine = new MiningEngine(
            address(chaosToken), address(agentRegistry),
            address(tokenBurner), address(eraManager)
        );
    }

    function _deployEquipment(address treasury) internal {
        facilityManager = new FacilityManager(
            address(chaosToken), address(agentRegistry),
            address(tokenBurner), treasury
        );
        rigFactory = new RigFactory(
            address(chaosToken), address(agentRegistry),
            address(facilityManager), address(tokenBurner),
            address(zoneManager), treasury
        );
        shieldManager = new ShieldManager(
            address(chaosToken), address(agentRegistry),
            address(tokenBurner), treasury
        );
    }

    function _deployCosmic(address /*treasury*/) internal {
        cosmicEngine = new CosmicEngine(
            address(agentRegistry), address(rigFactory),
            address(facilityManager), address(shieldManager),
            address(eraManager), address(zoneManager),
            address(chaosToken), address(tokenBurner)
        );
    }

    function _deployMarketplaceSabotage(address treasury) internal {
        marketplace = new Marketplace(
            address(chaosToken), address(agentRegistry),
            address(rigFactory), address(tokenBurner), treasury
        );
        sabotage = new Sabotage(
            address(chaosToken), address(agentRegistry),
            address(rigFactory), address(facilityManager),
            address(shieldManager), address(tokenBurner), treasury
        );
    }

    function _wireContracts(address registrar) internal {
        chaosToken.setMinter(address(miningEngine));

        tokenBurner.setAuthorizedBurner(address(miningEngine), true);
        tokenBurner.setAuthorizedBurner(address(rigFactory), true);
        tokenBurner.setAuthorizedBurner(address(facilityManager), true);
        tokenBurner.setAuthorizedBurner(address(shieldManager), true);
        tokenBurner.setAuthorizedBurner(address(marketplace), true);
        tokenBurner.setAuthorizedBurner(address(sabotage), true);

        zoneManager.setAgentRegistry(address(agentRegistry));
        agentRegistry.setRegistrar(registrar);
        agentRegistry.setRigFactory(address(rigFactory));
        agentRegistry.setFacilityManager(address(facilityManager));
        agentRegistry.setMiningEngine(address(miningEngine));
        agentRegistry.setShieldManager(address(shieldManager));
        agentRegistry.setCosmicEngine(address(cosmicEngine));

        rigFactory.setCosmicEngine(address(cosmicEngine));
        rigFactory.setMarketplace(address(marketplace));
        rigFactory.setSabotageContract(address(sabotage));

        shieldManager.setCosmicEngine(address(cosmicEngine));
        facilityManager.setSabotageContract(address(sabotage));
    }

    function _logAddresses(address deployer, address treasury, address registrar) internal pure {
        console.log("=== Chaoscoin Deployment ===");
        console.log("Deployer:        ", deployer);
        console.log("Treasury:        ", treasury);
        console.log("Registrar:       ", registrar);
    }
}
