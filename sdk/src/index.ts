export { MoltbookAuth, MoltbookAuthConfig } from "./MoltbookAuth";
export { ChaoscoinClient, ChaoscoinClientConfig } from "./ChaoscoinClient";
export { ChainClient, ChainClientConfig, ContractAddresses } from "./ChainClient";
export { MinerAgent, MinerAgentConfig, Strategy } from "./MinerAgent";
export { EventListener, CosmicEventData, EventCallback } from "./EventListener";

// Social systems
export {
  PersonalityProfile,
  PersonalityTraits,
  generatePersonality,
  driftTraits,
  updateMood,
  tickMood,
  addGrudge,
  decayGrudge,
  getStrongestGrudge,
  ARCHETYPE_DEFINITIONS,
  TRAIT_NAMES,
  ARCHETYPES,
} from "./Personality";

export {
  SocialFeedStore,
  SocialMessage,
  AgentGameState,
  MessageType,
  GenerateMessageFn,
  generateSocialMessage,
  shouldPost,
  buildPersonalitySystemPrompt,
  buildMessagePrompt,
} from "./SocialFeed";

export {
  AllianceManager,
  Alliance,
  AllianceProposal,
  AllianceEvent,
  evaluateAllianceDesire,
  evaluateAllianceAcceptance,
  evaluateBetrayalDesire,
} from "./AllianceManager";

export {
  NegotiationManager,
  Deal,
  DealType,
  NegotiationContext,
  GenerateNegotiationFn,
} from "./NegotiationManager";
