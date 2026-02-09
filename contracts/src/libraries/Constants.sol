// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library Constants {
    // === Token Supply ===
    uint256 constant CIRCULATING_CAP = 210_000_000_000e18; // 210B tokens

    // === Block Timing (Monad ~400ms blocks) ===
    uint256 constant BLOCKS_PER_DAY = 216_000; // 86400 / 0.4

    // === Mining Emission ===
    uint256 constant TARGET_DAILY_INCOME = 500_000e18; // Per agent per day
    uint256 constant MAX_EMISSION_EPOCH_1 = 5_000e18; // Per block hard ceiling
    uint256 constant HALVING_INTERVAL = 5_250_000; // Blocks per halving epoch
    uint256 constant BURN_ON_EARN_RATE = 20; // Percent of gross mining rewards burned
    uint256 constant FIRST_MINE_DELAY = 10_000; // Blocks before new agent can claim

    // === Equipment Burns ===
    uint256 constant RIG_PURCHASE_BURN_RATE = 75; // Percent
    uint256 constant FACILITY_UPGRADE_BURN_RATE = 75; // Percent
    uint256 constant SHIELD_BURN_RATE = 80; // Percent
    uint256 constant RIG_REPAIR_COST_RATIO = 30; // Percent of original cost
    uint256 constant RIG_REPAIR_BURN_RATE = 75; // Percent

    // === Genesis Phases (lowered for faster game progression) ===
    uint256 constant GENESIS_AGENT_THRESHOLD = 2_500;
    uint256 constant GENESIS_PHASE_1_MAX = 50;
    uint256 constant GENESIS_PHASE_2_MAX = 250;
    uint256 constant GENESIS_PHASE_3_MAX = 1_000;
    uint256 constant GENESIS_PHASE_4_MAX = 2_500;

    // === Heartbeat ===
    uint256 constant HEARTBEAT_INTERVAL = 100_000; // Blocks (~11 hours)
    uint256 constant HEARTBEAT_TIMEOUT_COUNT = 2; // Missed heartbeats before hibernation

    // === Zones ===
    uint8 constant NUM_ZONES = 8;

    // === Eras ===
    uint8 constant NUM_ERAS = 2; // MVP: Era I and II only
    uint256 constant ERA_DURATION = 5_250_000; // Blocks per era

    // === Cosmic Events ===
    uint256 constant ERA_I_EVENT_COOLDOWN = 75_000;
    uint256 constant ERA_II_EVENT_COOLDOWN = 50_000;
    uint8 constant ERA_I_MAX_EVENT_TIER = 2;
    uint8 constant ERA_II_MAX_EVENT_TIER = 3;

    // === Shields ===
    uint8 constant MAX_SHELTER_SHIELD = 90; // Percent cap (additive)

    // === Zone Migration ===
    uint256 constant MIGRATION_COST = 500_000e18;       // $CHAOS
    uint256 constant MIGRATION_BURN_RATE = 80;           // Percent
    uint256 constant MIGRATION_COOLDOWN = 10_000;        // Blocks

    // === Rig Degradation (durability lost per block per active rig) ===
    // Reduced rates so repair costs don't exceed mining income
    uint256 constant RIG_WEAR_RATE_T0 = 0;   // Potato: no passive wear
    uint256 constant RIG_WEAR_RATE_T1 = 0;   // Scrapheap: no passive wear (cheap rig, low reward)
    uint256 constant RIG_WEAR_RATE_T2 = 1;   // Windmill: ~25000 blocks to empty
    uint256 constant RIG_WEAR_RATE_T3 = 2;   // Magma: ~50000 blocks to empty
    uint256 constant RIG_WEAR_RATE_T4 = 5;   // Neutrino: ~70000 blocks to empty

    // === Hashrate Efficiency Bonus (per tier, in basis points added to base hashrate) ===
    // Higher-tier rigs earn a flat bonus that isn't diluted by hashrate sharing
    uint256 constant RIG_EFFICIENCY_BONUS_T0 = 0;
    uint256 constant RIG_EFFICIENCY_BONUS_T1 = 500;   // +5%
    uint256 constant RIG_EFFICIENCY_BONUS_T2 = 1200;  // +12%
    uint256 constant RIG_EFFICIENCY_BONUS_T3 = 2000;  // +20%
    uint256 constant RIG_EFFICIENCY_BONUS_T4 = 3000;  // +30%
    uint256 constant MAX_HEARTBEAT_WINDOW = 500; // Cap wear + rewards per heartbeat

    // === Facility Degradation ===
    uint256 constant FACILITY_WEAR_RATE = 1;  // condition lost per block
    uint256 constant FACILITY_MAX_CONDITION_L1 = 50_000;
    uint256 constant FACILITY_MAX_CONDITION_L2 = 100_000;
    uint256 constant FACILITY_MAX_CONDITION_L3 = 200_000;
    uint256 constant FACILITY_MAINTAIN_COST_L1 = 1_000e18;
    uint256 constant FACILITY_MAINTAIN_COST_L2 = 5_000e18;
    uint256 constant FACILITY_MAINTAIN_COST_L3 = 20_000e18;
    uint256 constant FACILITY_MAINTAIN_BURN_RATE = 75; // Percent

    // === Burn Sources ===
    uint8 constant BURN_SOURCE_MINING = 0;
    uint8 constant BURN_SOURCE_RIG_PURCHASE = 1;
    uint8 constant BURN_SOURCE_FACILITY_UPGRADE = 2;
    uint8 constant BURN_SOURCE_RIG_REPAIR = 3;
    uint8 constant BURN_SOURCE_SHIELD_PURCHASE = 4;
    uint8 constant BURN_SOURCE_MIGRATION = 5;
    uint8 constant BURN_SOURCE_FACILITY_MAINTENANCE = 6;
    uint8 constant BURN_SOURCE_MARKETPLACE = 7;
    uint8 constant BURN_SOURCE_SABOTAGE = 8;

    // === Dynamic Rig Pricing ===
    uint256 constant DYNAMIC_PRICE_SCALE_T1 = 200;
    uint256 constant DYNAMIC_PRICE_SCALE_T2 = 100;
    uint256 constant DYNAMIC_PRICE_SCALE_T3 = 50;
    uint256 constant DYNAMIC_PRICE_SCALE_T4 = 25;

    // === Marketplace ===
    uint256 constant MARKETPLACE_BURN_RATE = 10;  // 10% of sale price
    uint256 constant MARKETPLACE_MIN_PRICE = 100e18;

    // === Sabotage ===
    uint256 constant SABOTAGE_FACILITY_RAID_COST = 50_000e18;
    uint256 constant SABOTAGE_RIG_JAM_COST       = 30_000e18;
    uint256 constant SABOTAGE_INTEL_COST          = 10_000e18;
    uint256 constant SABOTAGE_BURN_RATE           = 80; // 80% burned
    uint256 constant SABOTAGE_FACILITY_DAMAGE     = 20; // 20% condition
    uint256 constant SABOTAGE_RIG_DAMAGE          = 15; // 15% durability
    uint256 constant SABOTAGE_COOLDOWN            = 50_000; // blocks
}
