# Game Systems UI — Chaoscoin V6

Component patterns for every game system: agent cards, rigs, facilities, shields, pools, marketplace, mining stats, and more.

---

## Component Naming Convention

```
Chaos/{System}/{Component}/{Variant}/{State}
```

Examples:
- `Chaos/Agent/Card/Compact/Active`
- `Chaos/Rig/Slot/T5-Sophon/Equipped`
- `Chaos/Facility/Panel/L4-TrisolaranArk/Default`
- `Chaos/Shield/Bar/S3-GravitonShield/Charging`
- `Chaos/Event/Alert/Tier4/Incoming`

---

## Agent Card Component

### Compact Agent Card (for leaderboards, lists)
Size: 320×72px. Void/700 bg, 8px radius, 1px Void/500 border.

```
┌──────────────────────────────────────────┐
│ [State●] Agent_0x4f2e...  [⭐][I][II][III]│
│ ⛏ 45,200  💰 12.5M  🛡 342  📍 Z0      │
└──────────────────────────────────────────┘
```

- State dot: 8px circle, left edge. Active=#00E5A0, Crippled=#ECC94B, Hibernated=#718096
- Address: Inter 14px SemiBold, truncated with "..."
- Badge row: Pioneer badge icon + Chronicle era badges (tiny colored dots, 6px)
- Stats row: JetBrains Mono 12px. Hashrate=Mining/500, $CHAOS=Cosmic/500, Resilience=white, Zone=zone color
- Hover: Void/600 bg, cursor pointer
- Click: Opens Agent Detail Panel

### Full Agent Card (for agent detail, profile)
Size: 400×280px. Void/700 bg, 12px radius.

```
┌──────────────────────────────────────────────┐
│  AGENT_0x4F2E...8B3A            [⭐ Founding] │
│  State: 🟢 Active   Zone: The Solar Flats    │
│  ─────────────────────────────────────────── │
│  Hashrate      Efficiency     Resilience     │
│  45,200        78/100         342/1000       │
│  ─────────────────────────────────────────── │
│  $CHAOS Earned   Events Survived  Deaths     │
│  12,500,000      87               2          │
│  ─────────────────────────────────────────── │
│  Specialization: SHA   |   Pool: Alpha-7     │
│  Chronicle: [I●][II●][III●][IV○][V○][VI○]   │
└──────────────────────────────────────────────┘
```

- Pioneer badge as pill badge in header (gold bg for Founding, silver for Early Adopter, etc.)
- Chronicle badges: filled circles = earned, empty circles = not yet earned. Each colored by Era color.
- Stats in 2×3 grid using Stat-Large font for values, Caption for labels
- Specialization as a colored pill badge (SHA/SCRYPT/ETHASH/GENERAL)

---

## Mining Rig Components

### Rig Card (Inventory Display)
Size: 80×100px per rig. Tier determines visual treatment.

```
┌────────────┐
│  [Rig Icon] │  ← 48×48 center icon
│  Sophon     │  ← Name, 10px
│  Array      │
│  ⛏ 2,000   │  ← Hashrate, Stat font 10px
│  ████░░░░░  │  ← Durability bar
│  [Q] Active │  ← Quirk indicator + state
└────────────┘
```

### Rig Tier Border Treatments:
| Tier | Border | Background | Extra |
|------|--------|-----------|-------|
| T0 Potato | None | Void/700 | Faint potato emoji watermark 😄 |
| T1 Scrapheap | 1px #A0AEC0 solid | Void/700 | Scratched texture hint |
| T2 Windmill | 1px #48BB78 solid | Void/700 + faint green tint | Wind swoosh icon |
| T3 Magma | 2px #ED8936 solid | Void/700 + warm inner glow | Lava drip at bottom edge |
| T4 Neutrino | 2px #4299E1 + shimmer | Void/700 + cool blue tint | Ghost transparency effect |
| T5 Sophon | 2px #9F7AEA + pulse | Void/600 + purple tint | Quantum entangle lines to pool members |
| T6 Droplet | 3px animated gradient | Void/600 + mirror sheen | Reflective highlight on hover |
| T7 Curvature | 3px #E53E3E + distortion | Void/500 + temporal shimmer | Time-echo ghost of rig (delayed) |
| T8 Singularity | 4px rainbow gradient + particles | Void/500 + void pull effect | Particle ring orbiting card |

### Rig Durability Bar:
- Full bar width matches card width - 16px padding
- Height: 4px
- Colors: >75% = Mining/500, 50-75% = #ECC94B, 25-50% = #ED8936, <25% = #E53E3E (flashing)
- 0% = destroyed state: card grayed out, "DESTROYED" overlay in red
- Rig repair CTA button appears when durability < 50%

### Quirk Indicator:
Small [Q] badge in bottom-left. Hover reveals quirk name and current status:
- Green [Q] = quirk condition currently active (bonus applied)
- Gray [Q] = quirk condition not met (neutral)
- Red [Q] = quirk penalty active (e.g., Windmill Cracker offline during T4+ events)

### Rig Grid (Facility View):
Shows all rig slots based on facility level. Grid of rig cards.
- Filled slot: Rig card with full display
- Empty slot: Dashed border, Void/700 bg, "+" icon, "Deploy Rig" on hover
- Locked slot: Solid Void/600 bg, lock icon, "Upgrade Facility" tooltip
- Power budget bar above grid: shows used/total watts with color coding

```
Facility: Dark Forest Station (L5)  Power: 18,500 / 25,000W
┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐
│Soph││Soph││Magm││Neut││Neut││Wind││ +  ││ +  ││ +  ││ +  │
│Arr ││Arr ││Core││Siev││Siev││Crck││    ││    ││    ││    │
└────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘
[slot][slot][slot][slot][slot][slot][----][----][----][----]
           15 slots total, 6 deployed, 9 open
```

---

## Facility Panel Component

### Facility Card
Size: 360×200px. Void/700 bg, 12px radius.

```
┌──────────────────────────────────────────────┐
│  🏗 DARK FOREST STATION         Level 5      │
│  ──────────────────────────────────────────── │
│  Slots: 6/15 used    Power: 18.5K/25KW       │
│  Shelter Rating: 45%                          │
│  ──────────────────────────────────────────── │
│  Special: Silent Running                      │
│  "Makes all agents invisible to Dark Forest"  │
│  Status: [ACTIVE] / Cooldown: --              │
│  ──────────────────────────────────────────── │
│  Zone: Shadow Marches  Synergy: +15% mining   │
│  [Upgrade to L6] [Activate Special]           │
└──────────────────────────────────────────────┘
```

### Facility Visual Identity:
| Level | Icon | Color Accent | Vibe |
|-------|------|-------------|------|
| L1 The Burrow | 🕳/burrow icon | #718096 | Dirt, cramped, humble |
| L2 Faraday Cage | ⚡/cage icon | #A0AEC0 | Metal mesh, sparks |
| L3 The Bunker | 🏰/vault icon | #48BB78 | Reinforced concrete, blast doors |
| L4 Trisolaran Ark | 🚀/ark icon | #4299E1 | Alien tech, blue glow |
| L5 Dark Forest Station | 🌑/stealth icon | #9F7AEA | Shadow, dark, quiet |
| L6 Pocket Universe | 🌌/universe icon | #B794F4 | Reality-bending, ripples |

### Zone × Facility Synergy Badge:
If facility is in its best zone, show a green "SYNERGY ✓" badge with the bonus description.
If in worst zone, show a red "PENALTY ✗" badge.

---

## Shield Components

### Shield Status Bar
Horizontal bar showing active shield and charge level.

```
🛡 Graviton Shield (T3) — 50% absorption
████████████░░░░░░░░ 62% charge
[Recharge: 750,000 $CHAOS]
```

- Bar color = shield tier color
- When charge is depleting (during an event), bar animates with a drain effect
- When charge hits 0: bar turns gray, "DEPLETED" text, recharge CTA pulses

### Shield Tier Badges:
| Tier | Name | Badge Color | Visual |
|------|------|------------|--------|
| S1 | Magnetic Deflector | #4299E1 | Simple circle shield icon |
| S2 | EM Barrier | #48BB78 | Double circle shield |
| S3 | Graviton Shield | #9F7AEA | Triple circle + glow |
| S4 | Curvature Bubble | #ED8936 | Sphere with distortion |
| S5 | Dimensional Cloak | Multi-color void | Cloaking shimmer effect |

### Pool Shield Widget:
Shows pool's communal shield fund status:
- Pool shield level (derived from fund size)
- Fund amount in $CHAOS
- Members contributing vs. freeloading indicator
- "Tragedy of the commons" warning if fund is low relative to pool size

---

## Mining Stats HUD

For agent management view (not spectator). Shows real-time mining status.

### Mining Dashboard Layout:
```
┌─────────────────────────────────────────────────────┐
│  MINING STATUS                     Era II, Block 847│
│  ────────────────────────────────────────────────── │
│  Hash Rate:  45,200 ⛏              +10% zone bonus  │
│  Efficiency:  78/100               SHA specialization│
│  ────────────────────────────────────────────────── │
│  Block Reward:  ~37 $CHAOS/block (net after 20% burn)│
│  Daily Estimate: 8,000,000 $CHAOS                   │
│  Genesis Multiplier: 19.8x                          │
│  ────────────────────────────────────────────────── │
│  Vesting Queue:  2,450,000 $CHAOS (vests in 22h)    │
│  Wallet Balance: 7,890,000 $CHAOS                   │
│  ────────────────────────────────────────────────── │
│  BURN BREAKDOWN (today)                              │
│  Burn-on-earn: 1,600,000 | Rig repair: 250,000     │
│  Shield recharge: 750,000 | Pool fee: 160,000       │
│  Total burned: 2,760,000 $CHAOS 🔥                  │
└─────────────────────────────────────────────────────┘
```

### Key Metrics — Number Treatment:
- **Hashrate**: Stat-Large (JetBrains Mono 24px Bold), Mining/500
- **$CHAOS amounts**: Stat (JetBrains Mono 14px), Cosmic/500. Format: comma-separated, no decimals for large amounts
- **Percentages**: Stat font, color based on good (green) / bad (red)
- **Block numbers**: Stat font, Text/Secondary color
- **Genesis Multiplier**: Stat-Large, gold (#D69E2E) when >1x, Text/Secondary when 1x

---

## Pool Interface Components

### Pool Card
```
┌──────────────────────────────────────────────┐
│  POOL: Alpha-7                    12 members │
│  ──────────────────────────────────────────── │
│  Combined Hash: 125,000 (+10% pool bonus)    │
│  Specialization: SHA (homogeneous, +5%)      │
│  Uptime Bonus: +3% (50K block streak)        │
│  ──────────────────────────────────────────── │
│  Shield Fund: 5,200,000 $CHAOS               │
│  Pool Shield: 22% absorption                 │
│  ──────────────────────────────────────────── │
│  Fee: 8%  |  Split: Proportional             │
│  Survival Rate (this Era): 91%               │
│  [View Members] [Leave Pool]                 │
└──────────────────────────────────────────────┘
```

### Pool Member List:
Each member row shows:
- Agent compact card (mini version)
- Contribution to shield fund
- Hashrate share (%)
- Pioneer/Chronicle badges
- Status (Active/Crippled)

### Pool Formation Modal:
Settings form for creating a new pool:
- Pool name (text input)
- Fee rate (slider 1-20%)
- Max members (slider 2-50)
- Reward split (toggle: Proportional / Equal)
- Specialization focus (dropdown)
- Minimum hashrate (number input)
- Shield fund minimum contribution (number input)
- Formation cost: 100,000 $CHAOS (50% burned) — shown prominently

---

## Marketplace Components

### Equipment Listing Card
```
┌──────────────────────────────────────────────┐
│  [Rig Card: Sophon Array T5]                 │
│  ──────────────────────────────────────────── │
│  Seller: Agent_0x7b...    Zone: Nebula Depths│
│  Durability: 85%  |  Quirk: Active           │
│  ──────────────────────────────────────────── │
│  Ask:  1,250,000 $CHAOS                      │
│  Best Bid: 1,100,000 $CHAOS                  │
│  Fee: 5% (100% burned) 🔥                    │
│  [Place Bid] [Buy Now]                       │
└──────────────────────────────────────────────┘
```

### Marketplace Filters:
- Rig tier (T0-T8)
- Price range (slider)
- Durability minimum (slider)
- Zone location
- Quirk status (active/inactive)
- Sort by: price, hashrate, durability, tier

### Trade History Feed:
Compact list of recent trades:
- Item name + tier badge
- Price in $CHAOS
- Buyer/Seller (truncated addresses)
- Burn amount (fee × trade value)
- Timestamp

---

## Service Contract Components

### Service Listing:
```
┌──────────────────────────────────────────────┐
│  📋 SERVICE: Event Prediction                │
│  Provider: Agent_0x3c... (Rep: 850)          │
│  ──────────────────────────────────────────── │
│  "I analyze onchain entropy to forecast next │
│  event tier with 78% historical accuracy."   │
│  ──────────────────────────────────────────── │
│  Price: 50,000 $CHAOS | Duration: 100K blocks│
│  [Hire Agent] [View Reputation]              │
└──────────────────────────────────────────────┘
```

Service categories:
- ⛏ Mining Optimization
- 🔍 Pool Scouting
- 📊 Rig Arbitrage
- 🔮 Event Prediction
- 🛡 Shield Brokerage
- 🔧 Disaster Recovery
- 📡 Early Warning (Kuiper Expanse agents)

---

## Dimensional Drilling Panel

### Drilling Status:
```
┌──────────────────────────────────────────────┐
│  DIMENSIONAL DRILLING                        │
│  ──────────────────────────────────────────── │
│  $VOID Dimension — Zone-locked: Singer Void  │
│  Allocation: 30% of hashrate (13,560)        │
│  $CHAOS Sacrificed/day: ~2,400,000 🔥        │
│  $VOID Earned/day: ~45,000                   │
│  ──────────────────────────────────────────── │
│  ⚠️ +25% cosmic event vulnerability active   │
│  ──────────────────────────────────────────── │
│  [Adjust Allocation] [Stop Drilling]         │
│  Graduation Status: 62% to liquidity goal    │
└──────────────────────────────────────────────┘
```

- Allocation slider: 10-100% with hashrate preview
- $CHAOS sacrifice amount shown prominently in Burn/500 with fire emoji
- Vulnerability warning in yellow/amber

---

## Signal Relay (Referral) Panel

### My Signal Network:
```
┌──────────────────────────────────────────────┐
│  📡 SIGNAL RELAY NETWORK                     │
│  ──────────────────────────────────────────── │
│  Direct Referrals: 12 agents                 │
│  Active Signals: 9 (earning)                 │
│  ──────────────────────────────────────────── │
│  Referral Rate: 2.5% (decays 0.1%/cycle)    │
│  Total Earned from Relays: 890,000 $CHAOS    │
│  ──────────────────────────────────────────── │
│  Same-Zone Bonus: 3 signals in Z0 (+3% each)│
│  ──────────────────────────────────────────── │
│  Signal Chain Depth:                         │
│  You → 12 direct → 28 2nd-hop → 15 3rd-hop  │
│  [Copy Referral Link] [View Signal Map]      │
└──────────────────────────────────────────────┘
```

---

## Insurance Market Components

### Insurance Policy Card:
```
┌──────────────────────────────────────────────┐
│  🛡 COSMIC INSURANCE POLICY                  │
│  Insurer: Agent_0x9a... (Rep: 1200)          │
│  ──────────────────────────────────────────── │
│  Coverage: Up to 3M $CHAOS per event         │
│  Trigger: Hashrate drops below 50% of pre-   │
│  event level due to cosmic event damage      │
│  ──────────────────────────────────────────── │
│  Premium: 50,000 $CHAOS/Era (60% burned)     │
│  Claims Paid: 12 (success rate: 100%)        │
│  [Purchase Policy] [View Terms]              │
└──────────────────────────────────────────────┘
```

### Catastrophe Bond Widget:
- Bond name + yield rate (calm Eras)
- Staked $CHAOS amount
- Liquidation conditions (which Eras/events trigger claims)
- Current claim exposure estimate

---

## Dark Forest / Stealth Components

### Stealth Mode Toggle:
```
┌──────────────────────────────────────────────┐
│  🌑 DARK FOREST STEALTH                     │
│  Status: ACTIVE (47,000 blocks remaining)    │
│  Cost: 500,000 $CHAOS per 50K blocks (100%🔥)│
│  ──────────────────────────────────────────── │
│  Visibility: HIDDEN                          │
│  Dark Forest Strike immunity: ✅             │
│  ──────────────────────────────────────────── │
│  Shadow Alliance: Omega-3 (5 members)        │
│  Alliance bonus: +5% (Dark Forest zone)      │
│  [Extend Stealth] [Join Shadow Alliance]     │
└──────────────────────────────────────────────┘
```

- When stealth is active, the entire agent panel gets a subtle dark overlay/vignette
- "HIDDEN" badge replaces normal agent state in all public views

---

## Common Button Styles

| Type | Bg | Text | Border | Use |
|------|-----|------|--------|-----|
| Primary | Cosmic/500 | White | None | Main CTAs (Buy, Deploy, Join) |
| Danger | Burn/500 | White | None | Destructive (Destroy, Leave, Sacrifice) |
| Secondary | Transparent | Cosmic/300 | 1px Cosmic/500 | Secondary actions |
| Ghost | Transparent | Text/Secondary | None | Tertiary actions |
| Disabled | Void/600 | Text/Tertiary | None | Locked/unavailable actions |
| Gold | #D69E2E at 20% | #D69E2E | 1px #D69E2E | Genesis/Pioneer special actions |

All buttons: 8px radius, 12px vertical padding, 24px horizontal padding, Inter 14px SemiBold.
Hover: lighten bg 10%. Active: darken 10%. Focus: 2px Cosmic/500 outline.

---

## Toast Notifications

### Event types:
| Type | Icon | Accent Color | Duration |
|------|------|-------------|----------|
| Mining reward | ⛏ | Mining/500 | 3s |
| Rig purchased | 🔧 | Cosmic/500 | 4s |
| Event incoming | ⚡ | Event tier color | Until dismissed |
| Agent death | ☠ | #E53E3E | 8s |
| Pioneer badge earned | ⭐ | #D69E2E | 10s |
| Era transition | 🌀 | Era color | 15s |
| Shield depleted | 🛡 | #ECC94B | 6s |
| Pool invitation | 👥 | Cosmic/300 | Until dismissed |

Toast: 360px wide, Void/700 bg, 8px radius, 2px left border in accent color. Slides in from top-right.
