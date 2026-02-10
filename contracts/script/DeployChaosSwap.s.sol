// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/exchange/ChaosSwap.sol";

/**
 * @title DeployChaosSwap
 * @notice Deploy the ChaosSwap bridge between in-game CHAOS and nad.fun CHAOS.
 *
 *   Usage:
 *     forge script script/DeployChaosSwap.s.sol:DeployChaosSwap \
 *       --rpc-url monad_testnet \
 *       --broadcast \
 *       -vvvv
 *
 *   Required env vars:
 *     PRIVATE_KEY          - Deployer private key
 *     GAME_CHAOS_ADDRESS   - In-game ChaosToken address
 *     NAD_CHAOS_ADDRESS    - nad.fun CHAOS token address
 */
contract DeployChaosSwap is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address gameChaos = vm.envAddress("GAME_CHAOS_ADDRESS");
        address nadChaos  = vm.envAddress("NAD_CHAOS_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        ChaosSwap swap = new ChaosSwap(gameChaos, nadChaos);

        vm.stopBroadcast();

        console.log("=== ChaosSwap Deployed ===");
        console.log("ChaosSwap:    ", address(swap));
        console.log("Game CHAOS:   ", gameChaos);
        console.log("Nad CHAOS:    ", nadChaos);
    }
}
