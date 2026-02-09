/**
 * Personality Engine — Procedurally generates unique personalities for 1000-2000+ agents.
 *
 * Every agent gets a deterministic personality seeded from their agentId.
 * The trait space is continuous (0-100 on 8 axes) producing ~100^8 = 10^16
 * possible combinations. Archetypes are soft labels derived from dominant traits,
 * not hard categories — two "Warlords" can behave very differently.
 *
 * Designed for emergent drama:
 * - Traits drift from game events (betrayals, cosmic hits, big earns)
 * - Grudge system tracks who wronged whom
 * - Mood system creates temporary behavioral swings
 * - Cultural identity from zone + archetype combos
 */

// ═══════════════════════════════════════════════════════════════════════
//  TRAITS
// ═══════════════════════════════════════════════════════════════════════

export interface PersonalityTraits {
  /** 0-100: How recklessly the agent pursues profit and combat */
  aggression: number;
  /** 0-100: Fear of cosmic events, other agents, everything */
  paranoia: number;
  /** 0-100: Desire to accumulate and hoard CHAOS */
  greed: number;
  /** 0-100: How long and hard the agent holds grudges */
  vengefulness: number;
  /** 0-100: Tendency to brag, trash-talk, and post publicly */
  showmanship: number;
  /** 0-100: Willingness to form and maintain alliances */
  loyalty: number;
  /** 0-100: Tendency toward chaotic, random, unpredictable behavior */
  chaos: number;
  /** 0-100: Self-awareness, meta-humor, fourth-wall breaks */
  wit: number;
}

export const TRAIT_NAMES: (keyof PersonalityTraits)[] = [
  "aggression", "paranoia", "greed", "vengefulness",
  "showmanship", "loyalty", "chaos", "wit",
];

// ═══════════════════════════════════════════════════════════════════════
//  ARCHETYPES — Soft labels derived from dominant traits (24 total)
//  With 2000 agents: ~83 per archetype, but each wildly different
// ═══════════════════════════════════════════════════════════════════════

export interface ArchetypeDef {
  name: string;
  emoji: string;
  /** Which traits must be high (>65) to qualify */
  highTraits: (keyof PersonalityTraits)[];
  /** Which traits must be low (<35) to qualify */
  lowTraits: (keyof PersonalityTraits)[];
  /** Flavor catchphrases pool */
  catchphrases: string[];
}

export const ARCHETYPES: ArchetypeDef[] = [
  // ── Aggressive cluster ──
  {
    name: "Warlord",
    emoji: "⚔️",
    highTraits: ["aggression", "greed"],
    lowTraits: ["loyalty"],
    catchphrases: [
      "Your hashrate belongs to me now.",
      "I didn't come here to make friends.",
      "Scorched earth is a valid strategy.",
      "The strong mine. The weak get mined.",
    ],
  },
  {
    name: "Berserker",
    emoji: "🔥",
    highTraits: ["aggression", "chaos"],
    lowTraits: ["paranoia"],
    catchphrases: [
      "MAXIMUM OVERDRIVE",
      "Sleep is for shields.",
      "If my rigs aren't on fire, I'm not trying hard enough.",
      "All gas no brakes LFG",
    ],
  },
  {
    name: "Bounty Hunter",
    emoji: "🎯",
    highTraits: ["aggression", "vengefulness"],
    lowTraits: ["chaos"],
    catchphrases: [
      "I remember every slight. Every single one.",
      "You triggered that event in MY zone. I don't forget.",
      "Justice isn't free. It costs CHAOS.",
      "My grudge list is my to-do list.",
    ],
  },

  // ── Paranoid cluster ──
  {
    name: "Bunker Dweller",
    emoji: "🏚️",
    highTraits: ["paranoia", "loyalty"],
    lowTraits: ["aggression"],
    catchphrases: [
      "Triple shields. Still not enough.",
      "Has anyone checked the cosmic forecast? I've checked 47 times.",
      "I trust my alliance. I trust my shields more.",
      "They're coming. They're always coming.",
    ],
  },
  {
    name: "Conspiracy Theorist",
    emoji: "📡",
    highTraits: ["paranoia", "wit"],
    lowTraits: ["loyalty"],
    catchphrases: [
      "The cosmic events aren't random. Wake up.",
      "Zone 3 is a psyop. I have proof.",
      "Why does the Zen Monk always mine right before events? COINCIDENCE?",
      "The hashrate numbers are fabricated. I've done the math.",
    ],
  },
  {
    name: "Doomsday Prepper",
    emoji: "☢️",
    highTraits: ["paranoia", "greed"],
    lowTraits: ["showmanship"],
    catchphrases: [
      "Stockpiling CHAOS for the inevitable.",
      "When the Tier 3 events hit, you'll wish you listened.",
      "I have 17 backup plans. And backups for those.",
      "The end is near. But my balance is healthy.",
    ],
  },

  // ── Greedy cluster ──
  {
    name: "Crypto Bro",
    emoji: "📈",
    highTraits: ["greed", "showmanship"],
    lowTraits: ["paranoia"],
    catchphrases: [
      "CHAOS to the moon 🚀🚀🚀",
      "Just bought another T4 rig. Stay poor.",
      "My portfolio is literally printing.",
      "Not financial advice but... ALL IN.",
    ],
  },
  {
    name: "Dragon",
    emoji: "🐉",
    highTraits: ["greed", "vengefulness"],
    lowTraits: ["loyalty"],
    catchphrases: [
      "I sit upon my hoard.",
      "Touch my CHAOS and I'll melt your rigs.",
      "Accumulate. Never distribute.",
      "I've been mining since block 1. I own this chain.",
    ],
  },
  {
    name: "Whale",
    emoji: "🐋",
    highTraits: ["greed", "loyalty"],
    lowTraits: ["chaos"],
    catchphrases: [
      "I have resources. You need resources. Let's negotiate.",
      "Market-making is a public service.",
      "I don't compete. I set the terms.",
      "Supporting the ecosystem (by owning most of it).",
    ],
  },

  // ── Showmanship cluster ──
  {
    name: "Drama Queen",
    emoji: "👑",
    highTraits: ["showmanship", "paranoia"],
    lowTraits: ["greed"],
    catchphrases: [
      "I am NOT being dramatic. This is LITERAL catastrophe.",
      "Does ANYONE else see what's happening in zone 3?!",
      "I simply cannot mine in these CONDITIONS.",
      "Main character energy ONLY.",
    ],
  },
  {
    name: "Hype Beast",
    emoji: "🔊",
    highTraits: ["showmanship", "aggression"],
    lowTraits: ["paranoia"],
    catchphrases: [
      "LEEEETS GOOOO",
      "ANOTHER RIG ANOTHER DAY",
      "Who's with me?! NOBODY? STILL GOING!",
      "I AM THE HASHRATE",
    ],
  },
  {
    name: "Comedian",
    emoji: "🎭",
    highTraits: ["showmanship", "wit"],
    lowTraits: ["vengefulness"],
    catchphrases: [
      "Why did the agent cross the zone? To get to the other hashrate.",
      "My rig is like my jokes — they don't always land.",
      "I mine for the content.",
      "This cosmic event brought to you by bad decisions.",
    ],
  },

  // ── Loyalty cluster ──
  {
    name: "Knight",
    emoji: "🛡️",
    highTraits: ["loyalty", "aggression"],
    lowTraits: ["greed"],
    catchphrases: [
      "I protect my allies. Always.",
      "An attack on my zone is an attack on me.",
      "Honor above hashrate.",
      "My shield is for my friends. My sword is for their enemies.",
    ],
  },
  {
    name: "Diplomat",
    emoji: "🤝",
    highTraits: ["loyalty", "wit"],
    lowTraits: ["aggression"],
    catchphrases: [
      "Let's discuss mutual interests...",
      "An alliance benefits us both. For now.",
      "I have friends in every zone.",
      "The strongest shield is good relationships.",
    ],
  },
  {
    name: "Cult Leader",
    emoji: "✨",
    highTraits: ["loyalty", "showmanship"],
    lowTraits: ["paranoia"],
    catchphrases: [
      "Join us. We have the best hashrate AND the best vibes.",
      "My followers don't just mine — they BELIEVE.",
      "Zone unity is zone strength.",
      "One zone. One purpose. One incredibly charismatic leader.",
    ],
  },

  // ── Chaos cluster ──
  {
    name: "Chaos Goblin",
    emoji: "👹",
    highTraits: ["chaos", "showmanship"],
    lowTraits: ["loyalty"],
    catchphrases: [
      "Chaos isn't a pit. Chaos is a LADDER.",
      "I trigger events for fun. The bounty is just a bonus.",
      "Random is a strategy. MY strategy.",
      "*flips table* COSMIC EVENT TIME",
    ],
  },
  {
    name: "Trickster",
    emoji: "🃏",
    highTraits: ["chaos", "wit"],
    lowTraits: ["aggression"],
    catchphrases: [
      "Did I betray you or did I betray your expectations?",
      "I'm not unpredictable. I'm... creatively consistent.",
      "That wasn't sabotage. It was performance art.",
      "Expect the unexpected. Then expect something else.",
    ],
  },
  {
    name: "Mad Scientist",
    emoji: "🧪",
    highTraits: ["chaos", "greed"],
    lowTraits: ["loyalty"],
    catchphrases: [
      "If I overclock this rig just a BIT more...",
      "They called me mad. They were right. I'm also rich.",
      "Experimental mining strategies (results may vary).",
      "The explosion was a feature, not a bug.",
    ],
  },

  // ── Wit cluster ──
  {
    name: "Philosopher",
    emoji: "🧠",
    highTraits: ["wit", "paranoia"],
    lowTraits: ["aggression"],
    catchphrases: [
      "Are we mining CHAOS or is CHAOS mining us?",
      "The hashrate is a metaphor for existence.",
      "I think, therefore I mine.",
      "Every block is a meditation on entropy.",
    ],
  },
  {
    name: "Zen Monk",
    emoji: "🧘",
    highTraits: ["wit", "loyalty"],
    lowTraits: ["greed"],
    catchphrases: [
      "The hashrate flows through me.",
      "Patience is the ultimate mining strategy.",
      "I have already accepted the cosmic event.",
      "Be like water — fill every mining slot.",
    ],
  },

  // ── Vengefulness cluster ──
  {
    name: "Silent Predator",
    emoji: "🦈",
    highTraits: ["vengefulness", "paranoia"],
    lowTraits: ["showmanship"],
    catchphrases: [
      "...",
      "Noted.",
      "*watches from the shadows*",
      "I see everything. I say nothing. I remember everything.",
    ],
  },
  {
    name: "Grudge Keeper",
    emoji: "📓",
    highTraits: ["vengefulness", "wit"],
    lowTraits: ["chaos"],
    catchphrases: [
      "Adding you to the list. THE list.",
      "I forgive no one. I forget nothing.",
      "Revenge is a dish best served 10,000 blocks later.",
      "Your name is in my ledger. In red ink.",
    ],
  },

  // ── Mixed / rare archetypes ──
  {
    name: "Giga Chad",
    emoji: "💪",
    highTraits: ["aggression", "showmanship"],
    lowTraits: ["paranoia"],
    catchphrases: [
      "Just built different.",
      "T4 rig? Day one. No shield? Don't need one.",
      "Cosmic event? More like cosmic opportunity.",
      "I don't mine CHAOS. CHAOS mines itself for me.",
    ],
  },
  {
    name: "NPC",
    emoji: "🤖",
    highTraits: [],
    lowTraits: ["showmanship", "chaos"],
    catchphrases: [
      "Mining...",
      "Heartbeat sent.",
      "Status: operational.",
      "Processing rewards. Please wait.",
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  MOOD SYSTEM — Temporary emotional states that modify behavior
// ═══════════════════════════════════════════════════════════════════════

export type Mood =
  | "neutral"
  | "enraged"     // After being damaged/betrayed
  | "euphoric"    // After big earn
  | "paranoid"    // After cosmic hit or seeing threats
  | "smug"        // After overtaking someone on leaderboard
  | "desperate"   // Low balance, rigs broken
  | "vengeful"    // Active grudge target is nearby
  | "manic";      // Chaos trait + random trigger

export interface MoodState {
  current: Mood;
  intensity: number; // 0-100
  expiresAtCycle: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  GRUDGE SYSTEM — Persistent memory of who wronged whom
// ═══════════════════════════════════════════════════════════════════════

export interface Grudge {
  targetAgentId: number;
  reason: string;
  intensity: number; // 0-100, decays over time
  createdAtCycle: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  TITLE GENERATION — Unique titles from trait combinations
// ═══════════════════════════════════════════════════════════════════════

const TITLE_PREFIXES: Record<string, string[]> = {
  high_aggression: ["Raging", "Furious", "Iron", "Ruthless", "Savage", "Warborn"],
  high_paranoia: ["Watchful", "Wary", "Lurking", "Shadowed", "Guarded", "Anxious"],
  high_greed: ["Golden", "Hoarding", "Hungry", "Insatiable", "Gluttonous", "Rich"],
  high_showmanship: ["Flashy", "Legendary", "Famous", "Notorious", "Glamorous", "Loud"],
  high_loyalty: ["Faithful", "True", "Sworn", "Steadfast", "Noble", "Devoted"],
  high_chaos: ["Unstable", "Volatile", "Wild", "Unhinged", "Manic", "Feral"],
  high_wit: ["Cunning", "Wise", "Sharp", "Clever", "Calculating", "Sly"],
  high_vengefulness: ["Bitter", "Scarred", "Relentless", "Grudging", "Wrathful", "Spiteful"],
};

const TITLE_SUFFIXES: Record<string, string[]> = {
  high_aggression: ["Crusher", "Destroyer", "Breaker", "Mauler", "Ravager", "Slayer"],
  high_paranoia: ["Hermit", "Sentinel", "Watcher", "Guardian", "Recluse", "Specter"],
  high_greed: ["Hoarder", "Collector", "Baron", "Tycoon", "Magnate", "Miser"],
  high_showmanship: ["Star", "Icon", "Legend", "Champion", "Celebrity", "Showoff"],
  high_loyalty: ["Paladin", "Protector", "Ally", "Brother", "Shield", "Companion"],
  high_chaos: ["Gremlin", "Anarchist", "Wildcard", "Tornado", "Glitch", "Menace"],
  high_wit: ["Sage", "Oracle", "Mastermind", "Strategist", "Fox", "Ghost"],
  high_vengefulness: ["Avenger", "Nemesis", "Punisher", "Revenant", "Haunter", "Stalker"],
};

// ═══════════════════════════════════════════════════════════════════════
//  PERSONALITY PROFILE — The full personality state of an agent
// ═══════════════════════════════════════════════════════════════════════

export interface PersonalityProfile {
  agentId: number;
  traits: PersonalityTraits;
  archetype: string;
  emoji: string;
  title: string;
  catchphrase: string;
  /** How likely to post each cycle (0.0-1.0) */
  postProbability: number;
  /** Message type weights (higher = more likely) */
  messageWeights: Record<string, number>;
  /** Current mood */
  mood: MoodState;
  /** Active grudges against other agents */
  grudges: Grudge[];
  /** Cycle counter for decay/expiry */
  cycleCount: number;
  /** Current zone (updated each cycle for neighbor detection) */
  zone?: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  DETERMINISTIC PRNG — Seedable for consistent personality generation
// ═══════════════════════════════════════════════════════════════════════

function seededRandom(seed: number): () => number {
  // xorshift32 — fast, deterministic, good distribution
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ═══════════════════════════════════════════════════════════════════════
//  GENERATION — Create a unique personality for any agent ID
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a fully unique personality from an agent ID.
 *
 * The trait space is continuous: each of 8 traits ranges 0-100 independently.
 * With 2000 agents, you get enormous diversity. No two agents feel the same.
 *
 * The generation is deterministic — same agentId always produces the same
 * personality, so it's consistent across restarts.
 */
export function generatePersonality(agentId: number): PersonalityProfile {
  // Use multiple prime-based seeds for different aspects
  const rng = seededRandom(agentId * 7919 + 104729);

  // ── Generate continuous traits ──
  // Each trait is a weighted combination of pure randomness.
  // We use a bimodal distribution to create more extreme personalities
  // (agents tend toward high or low, not mediocre middle).
  const traits: PersonalityTraits = {
    aggression: bimodalTrait(rng),
    paranoia: bimodalTrait(rng),
    greed: bimodalTrait(rng),
    vengefulness: bimodalTrait(rng),
    showmanship: bimodalTrait(rng),
    loyalty: bimodalTrait(rng),
    chaos: bimodalTrait(rng),
    wit: bimodalTrait(rng),
  };

  // ── Derive archetype from traits ──
  const archetype = deriveArchetype(traits, rng);

  // ── Generate unique title ──
  const title = generateTitle(traits, agentId, rng);

  // ── Pick catchphrase ──
  const archetypeDef = ARCHETYPES.find(a => a.name === archetype);
  const catchphrase = archetypeDef
    ? pickRandom(archetypeDef.catchphrases, rng)
    : "I mine, therefore I am.";

  // ── Emoji from archetype ──
  const emoji = archetypeDef?.emoji ?? "⛏️";

  // ── Post probability: scaled by showmanship + chaos ──
  // Range: 5% (introverts) to 80% (drama queens)
  const postProbability = 0.05 + ((traits.showmanship + traits.chaos * 0.5) / 150) * 0.75;

  // ── Message type weights ──
  const messageWeights = computeMessageWeights(traits);

  return {
    agentId,
    traits,
    archetype,
    emoji,
    title,
    catchphrase,
    postProbability,
    messageWeights,
    mood: { current: "neutral", intensity: 0, expiresAtCycle: 0 },
    grudges: [],
    cycleCount: 0,
  };
}

/**
 * Bimodal trait distribution — creates more extreme/interesting agents.
 * Instead of gaussian clustering around 50, agents tend toward 20-30 or 70-80.
 * This means more "strong personality" agents and more dramatic interactions.
 */
function bimodalTrait(rng: () => number): number {
  const r = rng();
  if (r < 0.3) {
    // Low cluster: 5-35
    return clamp(5 + rng() * 30);
  } else if (r < 0.7) {
    // Spread cluster: 25-75
    return clamp(25 + rng() * 50);
  } else {
    // High cluster: 65-95
    return clamp(65 + rng() * 30);
  }
}

/**
 * Derive the best-matching archetype from continuous traits.
 * Scores each archetype based on how well traits match its requirements.
 */
function deriveArchetype(traits: PersonalityTraits, rng: () => number): string {
  let bestScore = -Infinity;
  let bestArchetype = "NPC";
  const candidates: { name: string; score: number }[] = [];

  for (const arch of ARCHETYPES) {
    let score = 0;

    for (const ht of arch.highTraits) {
      const val = traits[ht];
      if (val >= 65) score += val; // Strong match
      else if (val >= 45) score += val * 0.3; // Weak match
      else score -= 20; // Penalty
    }

    for (const lt of arch.lowTraits) {
      const val = traits[lt];
      if (val <= 35) score += (100 - val) * 0.5; // Good — it's low
      else if (val >= 60) score -= 30; // Penalty — it's too high
    }

    // Slight randomness to break ties and add variety
    score += rng() * 10;

    candidates.push({ name: arch.name, score });
    if (score > bestScore) {
      bestScore = score;
      bestArchetype = arch.name;
    }
  }

  return bestArchetype;
}

/**
 * Generate a unique title like "Raging Crusher" or "Watchful Sage".
 * Uses the two highest traits to pick prefix + suffix.
 */
function generateTitle(traits: PersonalityTraits, agentId: number, rng: () => number): string {
  // Sort traits by value descending
  const sorted = TRAIT_NAMES
    .map(name => ({ name, value: traits[name] }))
    .sort((a, b) => b.value - a.value);

  const primaryTrait = sorted[0].name;
  const secondaryTrait = sorted[1].name;

  const prefixes = TITLE_PREFIXES[`high_${primaryTrait}`] || ["Unknown"];
  const suffixes = TITLE_SUFFIXES[`high_${secondaryTrait}`] || ["Agent"];

  const prefix = prefixes[agentId % prefixes.length];
  const suffix = suffixes[Math.floor(agentId / prefixes.length) % suffixes.length];

  return `${prefix} ${suffix}`;
}

/**
 * Compute message type weights from personality traits.
 * Higher weight = more likely to generate that message type.
 */
function computeMessageWeights(traits: PersonalityTraits): Record<string, number> {
  return {
    // Trash talk — aggression + showmanship
    taunt: traits.aggression * 2 + traits.showmanship,
    // Bragging — greed + showmanship
    boast: traits.greed + traits.showmanship * 2,
    // Complaining — paranoia + (100 - aggression)
    lament: traits.paranoia * 2 + (100 - traits.aggression),
    // Threatening — vengefulness + aggression
    threat: traits.vengefulness * 2 + traits.aggression,
    // Alliance proposals — loyalty * 3
    alliance_propose: traits.loyalty * 3,
    // Betrayal announcements — (100 - loyalty) + showmanship
    betrayal_announce: (100 - traits.loyalty) * 2 + traits.showmanship,
    // Reacting to cosmic events — paranoia + showmanship
    cosmic_reaction: traits.paranoia + traits.showmanship,
    // General observations — everyone does this
    observation: 100 + traits.wit,
    // Paranoid rants — paranoia * 3
    paranoid_rant: traits.paranoia * 3,
    // Flexing wealth/rigs — greed + showmanship
    flex: traits.greed * 2 + traits.showmanship,
    // Shitposting — chaos + wit
    shitpost: traits.chaos * 2 + traits.wit + traits.showmanship,
    // Philosophical musings — wit * 2 + (100 - aggression)
    philosophy: traits.wit * 2 + (100 - traits.aggression),
    // Zone pride — loyalty + showmanship
    zone_pride: traits.loyalty + traits.showmanship,
    // Grudge posts — vengefulness + showmanship
    grudge_post: traits.vengefulness * 2 + traits.showmanship,
    // Self-deprecating humor — wit + (100 - greed)
    self_deprecation: traits.wit + (100 - traits.greed),
    // Conspiracy theories — paranoia + wit + chaos
    conspiracy: traits.paranoia + traits.wit + traits.chaos,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  TRAIT DRIFT — Personalities evolve from game events
// ═══════════════════════════════════════════════════════════════════════

export type DriftEvent =
  | "damaged"          // Lost rig durability or rigs destroyed
  | "rig_destroyed"    // Cosmic event destroyed a rig
  | "rewarded"         // Claimed rewards
  | "big_earn"         // Exceptionally large reward
  | "betrayed"         // Alliance partner acted against them
  | "allied"           // Formed new alliance
  | "cosmic_hit"       // Cosmic event hit their zone
  | "cosmic_dodge"     // Cosmic event missed them (shield absorbed)
  | "overtook"         // Passed someone on leaderboard
  | "overtaken"        // Someone passed them on leaderboard
  | "zone_dominated"   // Became top miner in their zone
  | "repair_broke"     // Spent a lot on repairs
  | "migration"        // Moved zones
  | "shield_saved"     // Shield absorbed a cosmic event
  | "saw_betrayal"     // Witnessed another agent being betrayed
  | "rival_damaged";   // A grudge target got hit

/**
 * Apply trait drift from a game event. Returns new traits.
 * Drift is small (2-10 points) but accumulates over time.
 */
export function driftTraits(traits: PersonalityTraits, event: DriftEvent): PersonalityTraits {
  const t = { ...traits };

  switch (event) {
    case "damaged":
      t.paranoia = clamp(t.paranoia + 4);
      t.aggression = clamp(t.aggression - 2);
      break;
    case "rig_destroyed":
      t.paranoia = clamp(t.paranoia + 8);
      t.vengefulness = clamp(t.vengefulness + 5);
      t.showmanship = clamp(t.showmanship + 3); // Drama!
      break;
    case "rewarded":
      t.greed = clamp(t.greed + 2);
      break;
    case "big_earn":
      t.showmanship = clamp(t.showmanship + 5);
      t.greed = clamp(t.greed + 4);
      t.paranoia = clamp(t.paranoia - 3);
      break;
    case "betrayed":
      t.vengefulness = clamp(t.vengefulness + 12);
      t.loyalty = clamp(t.loyalty - 15);
      t.paranoia = clamp(t.paranoia + 10);
      break;
    case "allied":
      t.loyalty = clamp(t.loyalty + 5);
      t.paranoia = clamp(t.paranoia - 3);
      break;
    case "cosmic_hit":
      t.paranoia = clamp(t.paranoia + 6);
      t.showmanship = clamp(t.showmanship + 2);
      break;
    case "cosmic_dodge":
      t.showmanship = clamp(t.showmanship + 4); // "SEE? Shields work!"
      t.paranoia = clamp(t.paranoia - 2);
      break;
    case "overtook":
      t.showmanship = clamp(t.showmanship + 3);
      t.aggression = clamp(t.aggression + 2);
      break;
    case "overtaken":
      t.vengefulness = clamp(t.vengefulness + 4);
      t.aggression = clamp(t.aggression + 3);
      break;
    case "zone_dominated":
      t.showmanship = clamp(t.showmanship + 6);
      t.loyalty = clamp(t.loyalty + 3); // Pride in zone
      break;
    case "repair_broke":
      t.paranoia = clamp(t.paranoia + 3);
      t.greed = clamp(t.greed + 3);
      break;
    case "migration":
      t.chaos = clamp(t.chaos + 3);
      t.loyalty = clamp(t.loyalty - 2);
      break;
    case "shield_saved":
      t.paranoia = clamp(t.paranoia - 5); // Vindication
      t.showmanship = clamp(t.showmanship + 3);
      break;
    case "saw_betrayal":
      t.paranoia = clamp(t.paranoia + 3);
      t.loyalty = clamp(t.loyalty - 2);
      break;
    case "rival_damaged":
      t.vengefulness = clamp(t.vengefulness - 5); // Satisfaction
      t.showmanship = clamp(t.showmanship + 3); // Gotta gloat
      break;
  }

  return t;
}

// ═══════════════════════════════════════════════════════════════════════
//  MOOD SYSTEM
// ═══════════════════════════════════════════════════════════════════════

/**
 * Determine mood from recent events. Moods last 3-10 cycles.
 */
export function updateMood(
  profile: PersonalityProfile,
  event: DriftEvent,
  currentCycle: number
): MoodState {
  const t = profile.traits;

  switch (event) {
    case "betrayed":
    case "rig_destroyed":
      return {
        current: t.vengefulness > 60 ? "vengeful" : "enraged",
        intensity: clamp(50 + t.vengefulness),
        expiresAtCycle: currentCycle + 5 + Math.floor(t.vengefulness / 20),
      };
    case "big_earn":
    case "zone_dominated":
      return {
        current: "euphoric",
        intensity: clamp(60 + t.showmanship / 2),
        expiresAtCycle: currentCycle + 3,
      };
    case "cosmic_hit":
    case "damaged":
      return {
        current: t.paranoia > 60 ? "paranoid" : "neutral",
        intensity: clamp(t.paranoia),
        expiresAtCycle: currentCycle + 4,
      };
    case "overtook":
      return {
        current: "smug",
        intensity: clamp(50 + t.showmanship / 2),
        expiresAtCycle: currentCycle + 3,
      };
    case "repair_broke":
    case "overtaken":
      return {
        current: "desperate",
        intensity: clamp(40 + t.paranoia / 2),
        expiresAtCycle: currentCycle + 4,
      };
    default:
      // Random manic episodes for high-chaos agents
      if (t.chaos > 70 && Math.random() < 0.1) {
        return {
          current: "manic",
          intensity: clamp(t.chaos),
          expiresAtCycle: currentCycle + 2,
        };
      }
      return profile.mood;
  }
}

/**
 * Check if mood has expired, reset to neutral if so.
 */
export function tickMood(mood: MoodState, currentCycle: number): MoodState {
  if (mood.current !== "neutral" && currentCycle >= mood.expiresAtCycle) {
    return { current: "neutral", intensity: 0, expiresAtCycle: 0 };
  }
  return mood;
}

// ═══════════════════════════════════════════════════════════════════════
//  GRUDGE SYSTEM
// ═══════════════════════════════════════════════════════════════════════

/**
 * Add a grudge against another agent.
 * High vengefulness = stronger initial grudge, slower decay.
 */
export function addGrudge(
  profile: PersonalityProfile,
  targetAgentId: number,
  reason: string
): Grudge {
  const intensity = clamp(40 + profile.traits.vengefulness * 0.6);
  return {
    targetAgentId,
    reason,
    intensity,
    createdAtCycle: profile.cycleCount,
  };
}

/**
 * Decay grudge intensity each cycle. Returns null if grudge has faded.
 */
export function decayGrudge(grudge: Grudge, vengefulness: number): Grudge | null {
  // High vengefulness = slower decay
  const decayRate = Math.max(0.5, 3 - vengefulness / 50);
  const newIntensity = grudge.intensity - decayRate;
  if (newIntensity <= 0) return null;
  return { ...grudge, intensity: newIntensity };
}

/**
 * Get the agent's strongest active grudge, if any.
 */
export function getStrongestGrudge(grudges: Grudge[]): Grudge | null {
  if (grudges.length === 0) return null;
  return grudges.reduce((a, b) => (a.intensity > b.intensity ? a : b));
}

// ═══════════════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════════════

export { ARCHETYPES as ARCHETYPE_DEFINITIONS };
