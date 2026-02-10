import dotenv from "dotenv";
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  port: parseInt(optionalEnv("PORT", "3001"), 10),

  rpcUrl: optionalEnv("RPC_URL", "https://testnet-rpc.monad.xyz"),
  chainId: parseInt(optionalEnv("CHAIN_ID", "10143"), 10),

  registrarPrivateKey: requireEnv("REGISTRAR_PRIVATE_KEY"),
  moltbookAppKey: requireEnv("MOLTBOOK_APP_KEY"),

  contracts: {
    chaosToken: requireEnv("CHAOS_TOKEN_ADDRESS"),
    tokenBurner: requireEnv("TOKEN_BURNER_ADDRESS"),
    agentRegistry: requireEnv("AGENT_REGISTRY_ADDRESS"),
    miningEngine: requireEnv("MINING_ENGINE_ADDRESS"),
    facilityManager: requireEnv("FACILITY_MANAGER_ADDRESS"),
    rigFactory: requireEnv("RIG_FACTORY_ADDRESS"),
    shieldManager: requireEnv("SHIELD_MANAGER_ADDRESS"),
    cosmicEngine: requireEnv("COSMIC_ENGINE_ADDRESS"),
    eraManager: requireEnv("ERA_MANAGER_ADDRESS"),
    zoneManager: requireEnv("ZONE_MANAGER_ADDRESS"),
    marketplace: optionalEnv("MARKETPLACE_ADDRESS", ""),
    sabotage: optionalEnv("SABOTAGE_ADDRESS", ""),

    // ERC-8004 Trustless Agents (already deployed on Monad Testnet)
    erc8004Identity: optionalEnv("ERC8004_IDENTITY_ADDRESS", "0x8004A818BFB912233c491871b3d84c89A494BD9e"),
    erc8004Reputation: optionalEnv("ERC8004_REPUTATION_ADDRESS", "0x8004B663056A597Dffe9eCcC1965A193B7388713"),
  },
} as const;
