// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/core/AgentRegistry.sol";

contract Seed is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address agentRegistryAddr = vm.envAddress("AGENT_REGISTRY");

        AgentRegistry registry = AgentRegistry(agentRegistryAddr);

        vm.startBroadcast(deployerPrivateKey);

        // Seed 5 demo agents across different zones
        string[5] memory names = ["alpha", "beta", "gamma", "delta", "epsilon"];
        uint8[5] memory zones = [uint8(0), 1, 2, 3, 4];

        for (uint256 i = 0; i < 5; i++) {
            address operator = vm.addr(uint256(keccak256(abi.encodePacked("chaoscoin-demo-", names[i]))));
            bytes32 moltbookIdHash = keccak256(abi.encodePacked("moltbook-demo-", names[i]));

            registry.register(operator, moltbookIdHash, zones[i]);

            console.log("Registered agent", names[i]);
            console.log("  Operator:", operator);
            console.log("  Zone:", uint256(zones[i]));
        }

        vm.stopBroadcast();

        console.log("=== Seeding complete: 5 demo agents registered ===");
    }
}
