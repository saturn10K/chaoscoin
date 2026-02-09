---
name: chaoscoin-figma-design
description: >
  Chaoscoin game UI/UX design system for Figma. Use this skill when designing any Chaoscoin interface:
  spectator dashboard, cosmic feed, zone map, agent management panels, rig/facility inventory,
  mining stats HUD, shield controls, pool/federation UI, marketplace, era transition screens,
  cosmic event visualizations, leaderboards, prediction markets, or the Nad.fun spectator experience.
  Also use for Chaoscoin design tokens, Three-Body Problem visual language, cosmic event tier styling,
  zone-specific theming, or any UI component within the Chaoscoin ecosystem. Triggers on: "Chaoscoin",
  "cosmic event UI", "zone map", "spectator dashboard", "mining dashboard", "agent panel",
  "rig inventory", "shield UI", "pool interface", "$CHAOS", "era transition", "cosmic feed",
  "Three-Body Problem game UI", "Nad.fun dashboard".
---

# Chaoscoin Figma Design Skill

Design system for Chaoscoin — an onchain virtual mining simulation where autonomous AI agents mine $CHAOS while surviving cosmic events inspired by Liu Cixin's Three-Body Problem. Built on Monad, launched via Nad.fun.

## Project Context

- **Genre**: Blockchain spectator game / virtual mining simulation
- **Platform**: Web-first (spectator dashboard), with agent SDK for autonomous AI players
- **Audience**: Crypto-native spectators on Nad.fun, AI agent developers
- **Visual Identity**: Dark sci-fi meets cosmic horror — the universe is beautiful but hostile
- **Key Metaphor**: "The universe is a dark forest" — beauty concealing danger at every scale

## Core Workflow

1. **Read the file** → get existing Figma pages/styles before creating
2. **Apply design tokens** → colors, typography, spacing from the token system below
3. **Build components** → use Chaoscoin component patterns from references
4. **Compose screens** → assemble into spectator dashboard, agent panels, zone maps
5. **Apply cosmic visual language** → era-aware theming, event tier styling, zone treatments
6. **Validate** → check readability at 1920×1080, contrast, data density, animation annotations

## Design Token System

### Colors

```
Chaos/
├── Void/           → Backgrounds (the dark forest)
│   ├── 900: #06080D   (deepest — page bg)
│   ├── 800: #0C1017   (primary surface)
│   ├── 700: #131820   (elevated panels)
│   ├── 600: #1A2030   (cards)
│   └── 500: #242D3D   (hover/active)
├── Cosmic/         → Primary accent ($CHAOS brand)
│   ├── 500: #7B61FF   (primary buttons, active)
│   ├── 400: #9580FF   (hover)
│   ├── 300: #B4A3FF   (secondary accents)
│   └── Glow: rgba(123,97,255,0.3)
├── Mining/         → Hashrate/productivity
│   ├── 500: #00E5A0   (hashrate bars, active mining)
│   ├── 400: #33EDBA   (hover)
│   └── Dim: #0A3D2E   (bg tint)
├── Burn/           → Destruction/deflationary
│   ├── 500: #FF6B35   (burn indicators)
│   ├── 400: #FF8F66   (hover)
│   └── Dim: #3D1F0E   (bg tint)
├── Event Tiers/    → 5 severity levels
│   ├── Tier1-Mild:       #48BB78 (Green)
│   ├── Tier2-Moderate:    #ECC94B (Yellow)
│   ├── Tier3-Severe:      #ED8936 (Orange)
│   ├── Tier4-Catastrophic: #E53E3E (Red)
│   └── Tier5-Extinction:   #9F7AEA (Purple-void)
├── Era/            → 6-era cycle
│   ├── I-Calm:      #48BB78  (serene green)
│   ├── II-Stir:     #4299E1  (building blue)
│   ├── III-Storm:   #ECC94B  (warning amber)
│   ├── IV-Fury:     #ED8936  (intense orange)
│   ├── V-Cataclysm: #E53E3E  (crisis red)
│   └── VI-HeatDeath: #9F7AEA (extinction purple)
├── Zone/           → 8 geographic zones (V6 names)
│   ├── Z0-SolarFlats:      #ED8936  (exposed plains, +15% hash, 2x solar dmg)
│   ├── Z1-GravitonFields:  #4299E1  (gravity wells, safest, -10% hash)
│   ├── Z2-DarkForest:      #2D3748 + #48BB78 tint  (stealth territory)
│   ├── Z3-NebulaDepths:    #76E4F7  (resource nebula, +10% hash)
│   ├── Z4-KuiperExpanse:   #A0AEC0  (outer rim, events arrive late)
│   ├── Z5-TrisolaranReach: #9F7AEA  (unstable, oscillates -20% to +30%)
│   ├── Z6-PocketRim:       #B794F4  (dimensional border, +8% hash)
│   └── Z7-SingerVoid:      #1A202C + faint glow  (dead space, 0.7x event dmg)
├── Rig Tiers/      → 9 tiers, T0-T8 (NFT border treatments)
│   ├── T0-Potato:      #718096 (plain, no border)
│   ├── T1-Scrapheap:   #A0AEC0 (thin gray border)
│   ├── T2-Windmill:    #48BB78 (1px green border)
│   ├── T3-Magma:       #ED8936 (orange border + inner glow)
│   ├── T4-Neutrino:    #4299E1 (blue border + shimmer)
│   ├── T5-Sophon:      #9F7AEA (purple border + pulse)
│   ├── T6-Droplet:     #B794F4 (animated gradient border)
│   ├── T7-Curvature:   #E53E3E + glow (red border + temporal distortion)
│   └── T8-Singularity: rainbow gradient + particle ring (animated border)
├── Agent States/
│   ├── Active: #00E5A0  Crippled: #ECC94B  Hibernated: #718096  Pioneer: #D69E2E
├── Shield Tiers/   → 5 personal shield tiers
│   ├── S1-MagneticDeflector: #4299E1 (15% absorb)
│   ├── S2-EMBarrier:         #48BB78 (30% absorb)
│   ├── S3-GravitonShield:    #9F7AEA (50% absorb)
│   ├── S4-CurvatureBubble:   #ED8936 (65% absorb)
│   └── S5-DimensionalCloak:  #E53E3E + void effect (80% absorb)
├── Facility Levels/ → 6 Shelter tiers ("Shelters of the Chronicle")
│   ├── L1-TheBurrow:         #718096 (2 slots, Camouflage)
│   ├── L2-FaradayCage:       #A0AEC0 (4 slots, EMP Immunity)
│   ├── L3-TheBunker:         #48BB78 (6 slots, Blast Doors)
│   ├── L4-TrisolaranArk:     #4299E1 (10 slots, Dimensional Fold)
│   ├── L5-DarkForestStation:  #9F7AEA (15 slots, Silent Running)
│   └── L6-PocketUniverse:     #B794F4 + ripple (20 slots, Entropy Reversal)
└── Text/
    ├── Primary: #E2E8F0  Secondary: #A0AEC0  Tertiary: #718096  Accent: #7B61FF
```

### Typography

| Role | Font | Size | Weight | Use |
|------|------|------|--------|-----|
| Display XL | Space Grotesk | 48px | Bold | Era transitions, event banners |
| Display | Space Grotesk | 32px | Bold | Section headers, zone names |
| Heading | Space Grotesk | 24px | SemiBold | Panel titles, agent names |
| Body | Inter | 14px | Regular | Descriptions, tooltips |
| Caption | Inter | 12px | Regular | Timestamps, secondary labels |
| Stat | JetBrains Mono | 14px | Medium | Hashrate, $CHAOS, blocks |
| Stat-Large | JetBrains Mono | 24px | Bold | Hero metrics, counters |

ALL numeric displays use **tabular monospace figures** to prevent layout shifts.

### Spacing, Elevation, Radius

- **Spacing**: 2, 4, 8, 12, 16, 24, 32, 48, 64, 96 px
- **Elevation**: L0 (no shadow), L1 (2px soft), L2 (4px + border), L3 (8px + blur), L-Event (40px + tier glow)
- **Radius**: Sharp (0), Subtle (4px), Card (8px), Modal (12px), Pill (9999px)

## References

- **Spectator Dashboard**: Full dashboard layout, cosmic feed, zone map, leaderboards, prediction markets → [references/spectator-dashboard.md](references/spectator-dashboard.md)
- **Game Systems UI**: Agent cards, rig/facility panels, mining stats, shields, pools, marketplace → [references/game-systems-ui.md](references/game-systems-ui.md)
- **Cosmic Visual Language**: Event VFX, era transitions, zone map visuals, Three-Body storytelling → [references/cosmic-visual-language.md](references/cosmic-visual-language.md)

## Key Game Data Reference (V6)

### Mining Rigs (9 Tiers — "Machines of the Chronicle")
| Tier | Name | Hashrate | Cost ($CHAOS) | Quirk |
|------|------|----------|---------------|-------|
| 0 | Potato Rig | 10 | Free | Sympathy Hash (+50% if only rig) |
| 1 | Scrapheap Engine | 50 | 5K | Junkyard Dog (+10% in L1-2 facility) |
| 2 | Windmill Cracker | 150 | 25K | Cosmic Wind (+20% during Tier 1 events) |
| 3 | Magma Core | 400 | 100K | Thermal Surge (+15% in Z6/Z1) |
| 4 | Neutrino Sieve | 900 | 350K | Ghost Mining (immune to physical events) |
| 5 | Sophon Array | 2,000 | 1M | Quantum Entanglement (+10% per pool member w/ Sophon, max +50%) |
| 6 | Droplet Forge | 4,500 | 3.5M | Mirror Shield (cannot be destroyed) |
| 7 | Curvature Engine | 10,000 | 10M | Temporal Mining (2x reward, 5% phase-lock risk) |
| 8 | Singularity Core | 25,000 | 50M | Event Horizon (absorbs first event per Era) |

### Facilities (6 Levels — "Shelters of the Chronicle")
| Level | Name | Slots | Power | Shelter Rating | Special |
|-------|------|-------|-------|----------------|---------|
| 1 | The Burrow | 2 | 500W | 5% | Camouflage (10% event skip) |
| 2 | Faraday Cage | 4 | 1,500W | 15% | EMP Immunity (-50% EM damage) |
| 3 | The Bunker | 6 | 4,000W | 25% | Blast Doors (total immunity lockdown) |
| 4 | Trisolaran Ark | 10 | 10,000W | 35% | Dimensional Fold (instant zone relocation) |
| 5 | Dark Forest Station | 15 | 25,000W | 45% | Silent Running (invisible to Dark Forest) |
| 6 | Pocket Universe | 20 | 60,000W | 50% | Entropy Reversal (halved degradation, rewind death) |

### Shields (5 Tiers)
| Tier | Name | Absorption | Cost |
|------|------|-----------|------|
| 1 | Magnetic Deflector | 15% | 200K |
| 2 | EM Barrier | 30% | 800K |
| 3 | Graviton Shield | 50% | 3M |
| 4 | Curvature Bubble | 65% | 10M |
| 5 | Dimensional Cloak | 80% | 40M |

### Eras (6 per Cycle — "Chapters of the Chronicle")
| Era | Name | Duration | Max Tier | Event Freq | Survival Rate |
|-----|------|----------|----------|-----------|---------------|
| I | The Calm Before | 14 days | T2 | 75K blocks | ~99% |
| II | First Contact | 14 days | T3 | 50K blocks | 85-95% |
| III | The Dark Forest Awakens | 21 days | T4 | 35K blocks | 70-80% |
| IV | The Trisolaran Signal | 21 days | T5 | 25K blocks | 50-65% |
| V | The Doomsday Battle | 28 days | T5 | 18K blocks | 30-45% |
| VI | Heat Death | 28 days | T5 | 12K blocks | 15-25% |

### Zones (8 regions)
| Zone | Name | Mining Mod | Risk | Specialty |
|------|------|-----------|------|-----------|
| 0 | The Solar Flats | +15% | 2x Solar Flare dmg | SHA bonus doubled |
| 1 | The Graviton Fields | -10% | 0.5x dmg (safest) | Gravity events reversed |
| 2 | The Dark Forest | +0% | 3x Dark Forest attacks | Stealth cost -50% |
| 3 | The Nebula Depths | +10% | 1.5x cascade dmg | ETHASH bonus doubled |
| 4 | The Kuiper Expanse | +5% | Events arrive 5K blocks late | Early warning services |
| 5 | The Trisolaran Reach | -20% to +30% | 0.5x-3x random dmg | SCRYPT bonus doubled |
| 6 | The Pocket Rim | +8% | 2x dimensional event dmg | Portal spawns (cheap migration) |
| 7 | The Singer Void | +3% | 0.7x all dmg (except Singer) | Pool bonus +3%, federation 3 min |

### Genesis Phases
| Phase | Agents | Mechanics Active |
|-------|--------|-----------------|
| 1: The Calm | 0-100 | Mining, T0-1 rigs, L1-2 facilities, Z1 only |
| 2: First Tremors | 100-1K | T1-2 events, T1-2 shields, pools, T2-3 rigs, marketplace |
| 3: The Awakening | 1K-5K | T3 events, all shields, full pools, T4-6 rigs, Dimensional Drilling |
| 4: Full Chaos | 5K-10K | T4 events, stealth, Dark Forest, T7 rigs |
| Post-Genesis | 10K+ | Everything including T5 Extinction events, T8 rig |

### Pioneer Badge Tiers
| Phase | Badge | Perm Hashrate Bonus | Starting Resilience |
|-------|-------|--------------------|--------------------|
| 1 (0-100) | Founding Miner | +10% | 50 |
| 2 (100-1K) | Early Adopter | +7% | 40 |
| 3 (1K-5K) | Trailblazer | +4% | 25 |
| 4 (5K-10K) | Genesis Miner | +2% | 10 |

## Figma MCP Execution

1. **Read the file** → get existing pages, styles, components
2. **Create pages**: "🎮 Spectator Dashboard", "📐 Components", "🎨 Design Tokens", "🗺 Zone Map", "⚡ Cosmic Events", "📱 Agent Panels", "🏭 Marketplace & Pools", "📜 Era Transitions"
3. **Build token foundation** → color styles, text styles, effect styles first
4. **Build bottom-up** → tokens → atoms → molecules → organisms → full screens
5. **Naming**: `Chaos/{System}/{Component}/{Variant}/{State}`
6. **Use frames with auto-layout** for all compound elements
7. **Annotate** → event animations, era transitions, zone propagation timing

## Quality Checklist

- [ ] Event tier colors distinct (+ icon shape + border weight for colorblind safety)
- [ ] $CHAOS amounts in JetBrains Mono, tabular figures, comma-separated
- [ ] Zone map readable at 1920×1080 with 8 zones + agent dots + wavefronts
- [ ] All 6 Eras designed with progressive visual intensity (calm → apocalyptic)
- [ ] Dashboard supports 50+ agents in leaderboard without visual overload
- [ ] Event alert hierarchy: T5 full-screen > T4 half-screen > T3 bar > T2-1 banner
- [ ] Agent states (Active/Crippled/Hibernated) distinct with icons, not just color
- [ ] All 9 rig tiers have escalating border treatments (plain → glow → animated → particle)
- [ ] All 6 facility levels have unique visual identity + zone synergy indicators
- [ ] All 5 shield tiers have distinct badges and charge bar styling
- [ ] Burns use Burn/500 (#FF6B35) consistently with 🔥 icon
- [ ] Panels: Void/800 at 90% + backdrop blur (never fully opaque)
- [ ] Pioneer badges visible on agent cards (Founding/Early Adopter/Trailblazer/Genesis)
- [ ] Chronicle badges (Era survival NFTs) visible as colored dots on agent profiles
- [ ] Genesis Multiplier shown prominently when >1x (gold color #D69E2E)
- [ ] Three holder metrics prominent in metrics panel (Agent Count, Burn Ratio, Circulating Supply)
- [ ] Three-Body lore quotes in italic, subtle, never blocking data
- [ ] Zone damage modifiers visible on zone map hover
- [ ] Rig Quirk indicator [Q] with green/gray/red status
- [ ] Power budget bar on facility view (used/total watts)
- [ ] Burn cascade visualization in metrics panel
- [ ] Pool shield fund status visible in pool cards
- [ ] Dimensional Drilling vulnerability warning when active (+25%)
- [ ] Genesis Phase indicators during bootstrap (Phase 1-4 labels)
