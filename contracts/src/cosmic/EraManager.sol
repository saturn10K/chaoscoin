// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../libraries/Constants.sol";

contract EraManager {
    struct EraConfig {
        uint256 duration;
        uint8 maxEventTier;
        uint256 eventCooldown;
        uint256 rewardModifier; // 1e18 scaled (1.5e18 = 1.5x)
    }

    EraConfig[2] public eraConfigs;
    uint256 public immutable genesisBlock;

    constructor() {
        genesisBlock = block.number;

        // Era I: The Calm Before
        eraConfigs[0] = EraConfig({
            duration: Constants.ERA_DURATION,
            maxEventTier: Constants.ERA_I_MAX_EVENT_TIER,
            eventCooldown: Constants.ERA_I_EVENT_COOLDOWN,
            rewardModifier: 1.5e18 // 1.5x
        });

        // Era II: First Contact
        eraConfigs[1] = EraConfig({
            duration: Constants.ERA_DURATION,
            maxEventTier: Constants.ERA_II_MAX_EVENT_TIER,
            eventCooldown: Constants.ERA_II_EVENT_COOLDOWN,
            rewardModifier: 1.2e18 // 1.2x
        });
    }

    function getCurrentEra() public view returns (uint8) {
        uint256 elapsed = block.number - genesisBlock;
        if (elapsed < Constants.ERA_DURATION) return 1;
        return 2; // Stay at Era II for MVP
    }

    function getCurrentModifier() external view returns (uint256) {
        uint8 era = getCurrentEra();
        return eraConfigs[era - 1].rewardModifier;
    }

    function getMaxEventTier() external view returns (uint8) {
        uint8 era = getCurrentEra();
        return eraConfigs[era - 1].maxEventTier;
    }

    function getEventCooldown() external view returns (uint256) {
        uint8 era = getCurrentEra();
        return eraConfigs[era - 1].eventCooldown;
    }
}
