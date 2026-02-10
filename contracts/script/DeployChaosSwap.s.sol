// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/exchange/ChaosSwap.sol";

/**
 * @title DeployChaosSwap
 * @notice Deploy ChaosSwap bridge and set initial fees.
 *
 *   Usage:
 *     forge script script/DeployChaosSwap.s.sol:DeployChaosSwap \
 *       --rpc-url monad_testnet \
 *       --broadcast \
 *       -vvvv
 *
 *   Required env vars:
 *     PRIVATE_KEY          - Deployer private key
 *     GAME_CHAOS_ADDRESS   - In-game pCHAOS address
 *     NAD_CHAOS_ADDRESS    - nad.fun $CHAOS address
 *     TREASURY             - Treasury wallet for fees
 */
contract DeployChaosSwap is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerPrivateKey);
        address gameChaos   = vm.envAddress("GAME_CHAOS_ADDRESS");
        address nadChaos    = vm.envAddress("NAD_CHAOS_ADDRESS");
        address treasury    = vm.envOr("TREASURY", deployer);

        vm.startBroadcast(deployerPrivateKey);

        ChaosSwap swap = new ChaosSwap(gameChaos, nadChaos, treasury);

        // Set fees: 10% pCHAOS→$CHAOS, 5% $CHAOS→pCHAOS
        swap.setFees(1_000, 500);

        vm.stopBroadcast();

        console.log("=== ChaosSwap Deployed ===");
        console.log("ChaosSwap:    ", address(swap));
        console.log("pCHAOS:       ", gameChaos);
        console.log("$CHAOS:       ", nadChaos);
        console.log("Treasury:     ", treasury);
        console.log("Fee toNad:     10%");
        console.log("Fee toGame:    5%");
    }
}
