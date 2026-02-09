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

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envOr("TREASURY", deployer);
        address registrar = vm.envOr("REGISTRAR", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // ===== Phase 1: Deploy contracts in dependency order =====

        // 1. ChaosToken (no deps)
        ChaosToken chaosToken = new ChaosToken();

        // 2. TokenBurner (depends on ChaosToken)
        TokenBurner tokenBurner = new TokenBurner(address(chaosToken));

        // 3. EraManager (no deps, reads block.number)
        EraManager eraManager = new EraManager();

        // 4. ZoneManager (no deps)
        ZoneManager zoneManager = new ZoneManager();

        // 5. AgentRegistry (depends on ZoneManager)
        AgentRegistry agentRegistry = new AgentRegistry(address(zoneManager));

        // 6. MiningEngine (depends on ChaosToken, AgentRegistry, TokenBurner, EraManager)
        MiningEngine miningEngine = new MiningEngine(
            address(chaosToken),
            address(agentRegistry),
            address(tokenBurner),
            address(eraManager)
        );

        // 7. FacilityManager (depends on ChaosToken, AgentRegistry, TokenBurner)
        FacilityManager facilityManager = new FacilityManager(
            address(chaosToken),
            address(agentRegistry),
            address(tokenBurner),
            treasury
        );

        // 8. RigFactory (depends on ChaosToken, AgentRegistry, FacilityManager, TokenBurner, ZoneManager)
        RigFactory rigFactory = new RigFactory(
            address(chaosToken),
            address(agentRegistry),
            address(facilityManager),
            address(tokenBurner),
            address(zoneManager),
            treasury
        );

        // 9. ShieldManager (depends on ChaosToken, AgentRegistry, TokenBurner)
        ShieldManager shieldManager = new ShieldManager(
            address(chaosToken),
            address(agentRegistry),
            address(tokenBurner),
            treasury
        );

        // 10. CosmicEngine (depends on everything)
        CosmicEngine cosmicEngine = new CosmicEngine(
            address(agentRegistry),
            address(rigFactory),
            address(facilityManager),
            address(shieldManager),
            address(eraManager),
            address(zoneManager),
            address(chaosToken),
            address(tokenBurner)
        );

        // ===== Phase 2: Cross-wiring =====

        // ChaosToken: grant minter role to MiningEngine
        chaosToken.setMinter(address(miningEngine));

        // TokenBurner: authorize all burner contracts
        tokenBurner.setAuthorizedBurner(address(miningEngine), true);
        tokenBurner.setAuthorizedBurner(address(rigFactory), true);
        tokenBurner.setAuthorizedBurner(address(facilityManager), true);
        tokenBurner.setAuthorizedBurner(address(shieldManager), true);

        // ZoneManager: set AgentRegistry as authorized caller
        zoneManager.setAgentRegistry(address(agentRegistry));

        // AgentRegistry: wire up all dependent contracts
        agentRegistry.setRegistrar(registrar);
        agentRegistry.setRigFactory(address(rigFactory));
        agentRegistry.setFacilityManager(address(facilityManager));
        agentRegistry.setMiningEngine(address(miningEngine));

        // RigFactory: set CosmicEngine for damage application
        rigFactory.setCosmicEngine(address(cosmicEngine));

        // ShieldManager: set CosmicEngine for charge consumption
        shieldManager.setCosmicEngine(address(cosmicEngine));

        vm.stopBroadcast();

        // ===== Log deployment addresses =====
        console.log("=== Chaoscoin MVP Deployment ===");
        console.log("Deployer:        ", deployer);
        console.log("Treasury:        ", treasury);
        console.log("Registrar:       ", registrar);
        console.log("---");
        console.log("ChaosToken:      ", address(chaosToken));
        console.log("TokenBurner:     ", address(tokenBurner));
        console.log("EraManager:      ", address(eraManager));
        console.log("ZoneManager:     ", address(zoneManager));
        console.log("AgentRegistry:   ", address(agentRegistry));
        console.log("MiningEngine:    ", address(miningEngine));
        console.log("FacilityManager: ", address(facilityManager));
        console.log("RigFactory:      ", address(rigFactory));
        console.log("ShieldManager:   ", address(shieldManager));
        console.log("CosmicEngine:    ", address(cosmicEngine));
    }
}
