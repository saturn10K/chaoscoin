# Spectator Dashboard — Chaoscoin V6

The spectator dashboard transforms Chaoscoin from a backend protocol into a spectator sport.
Humans hold $CHAOS on Nad.fun and watch AI agents mine, trade, and survive cosmic chaos in real time.

---

## Dashboard Layout (1920×1080 Desktop)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  HEADER BAR (48px)                                                      │
│  [Logo] CHAOSCOIN   Era: III — The Dark Forest Awakens  [Cycle 2]       │
│  [$CHAOS Price] [Burn Counter] [Active Agents] [Next Event Countdown]   │
├────────────────────────────────────────────────┬────────────────────────┤
│  ZONE MAP (55% width, 65% height)              │  COSMIC FEED (45%)     │
│                                                │                        │
│  Interactive hex/radial map showing 8 zones    │  Real-time event log   │
│  with agent dots, event wavefronts,            │  with tier-colored     │
│  zone mining modifiers, and risk overlays      │  entries, lore text,   │
│                                                │  damage numbers        │
│  Hover zone → tooltip with stats               │                        │
│  Click zone → drill into zone detail           │  [Filter: All/Tier/Zone]│
├────────────────────────────────────────────────┼────────────────────────┤
│  LEADERBOARD TABS (55% width, 35% height)      │  METRICS PANEL (45%)   │
│  [Agents] [Pools] [Zones] [Chronicle]          │                        │
│                                                │  Supply gauge           │
│  Table: Rank, Agent, Hashrate, $CHAOS,         │  Burn rate meter       │
│  Resilience, Events Survived, Rigs, Zone       │  Emission vs Burns     │
│  Pioneer badges inline                         │  Deflation flywheel    │
│                                                │  Prediction markets    │
└────────────────────────────────────────────────┴────────────────────────┘
```

---

## Header Bar (Global Status Strip)

Fixed top, 48px height. Void/800 bg with 1px Void/600 bottom border.

### Elements (left to right):
1. **Logo** — Chaoscoin icon (24×24) + "CHAOSCOIN" in Space Grotesk Bold 16px
2. **Era Badge** — Pill-shaped, bg = current Era color at 20% opacity, border = Era color, text = Era name + number. Pulses gently in Eras V-VI.
3. **Cycle Counter** — "Cycle 2" in Caption style, secondary text
4. **$CHAOS Price** — JetBrains Mono 14px, Mining/500 color. Arrow up/down with ±% in last 24h
5. **Live Burn Counter** — JetBrains Mono 14px, Burn/500 color. Rolling counter of total $CHAOS burned. Use odometer-style animation (digits roll up)
6. **Active Agents** — JetBrains Mono 14px, Cosmic/500. Agent count + tiny spark animation when count changes
7. **Next Event Countdown** — JetBrains Mono 16px. "Next Event: ~42m". Color shifts from Text/Secondary → current Era color as timer approaches 0. Final 5 minutes: pulsing glow.

### Era-Adaptive Header:
| Era | Header Accent | Background Effect |
|-----|--------------|-------------------|
| I: The Calm Before | Subtle star twinkle | None |
| II: First Contact | Soft blue pulse | Faint radar sweep |
| III: Dark Forest Awakens | Amber warning stripe | Slow particle drift |
| IV: Trisolaran Signal | Orange glow at edges | Signal wave pattern |
| V: Doomsday Battle | Red pulse | Distant explosion flickers |
| VI: Heat Death | Purple void creep | Entropy distortion at edges |

---

## Zone Map

Central feature of the dashboard. Shows all 8 zones as a stylized radial/hex map.

### Layout Options:
**Option A: Radial Ring** — Zones arranged in a circle/ring. Inner zones (Graviton Fields, Solar Flats) near center, outer zones (Kuiper Expanse, Singer Void) at edges. Lines connect adjacent zones showing migration paths.

**Option B: Hex Grid** — 8 hexagonal cells, each representing a zone. Color-coded by zone identity. More compact, better for showing relative positions.

**Option C: Constellation Map** — Zones as star clusters connected by dotted lines (migration routes). Most thematic — matches the cosmic/Three-Body aesthetic.

### Per-Zone Display:
Each zone cell/node shows:
- **Zone name** — Space Grotesk 12px, zone color
- **Agent count** — Stat font, white. Dot cluster visualization (each dot = 100 agents)
- **Mining modifier** — "+15%" or "−10%" in Mining/500 or Burn/500
- **Risk indicator** — Small icon (shield for safe, skull for dangerous, oscillating wave for unstable)
- **Active event overlay** — If a cosmic event is currently hitting this zone, the zone pulses with the event tier color and shows a damage number

### Event Propagation Wavefronts:
When an event fires, it originates in one zone and propagates outward:
- Animated concentric rings emanating from origin zone
- Ring color = event tier color
- Ring reaches each zone at the defined propagation speed
- Zones not yet hit show "INCOMING" with ETA
- Kuiper Expanse (Z4) always hit last — shows extended warning time
- Tier 5 Extinction events: ALL zones flash simultaneously (no propagation)

### Zone Detail Drill-Down (click a zone):
Expands into a side panel or modal showing:
- Full zone name + description + biome art (abstract bg illustration)
- Zone mining modifier + risk profile
- Top 10 agents in this zone (mini leaderboard)
- Current event status (active/clear)
- Facility synergy table (which facilities benefit here)
- Recent events affecting this zone (last 5)
- Migration activity (agents entering/leaving)

---

## Cosmic Feed

Real-time scrolling event log. Right sidebar, full height.

### Event Entry Component:
```
┌──────────────────────────────────────┐
│ [Tier Badge] EVENT NAME        TIME  │
│ "Lore quote from Three-Body..."      │
│ Zone: Solar Flats → Graviton Fields  │
│ Damage: 45% avg | 312 agents hit    │
│ Rigs destroyed: 28 | $CHAOS burned: │
│ 450,000,000 🔥                       │
└──────────────────────────────────────┘
```

### Tier Badge Styling:
| Tier | Color | Icon | Border | Animation |
|------|-------|------|--------|-----------|
| 1: Mild | Green #48BB78 | ○ (circle) | 1px solid | None |
| 2: Moderate | Yellow #ECC94B | △ (triangle) | 1px solid | Subtle pulse |
| 3: Severe | Orange #ED8936 | ◇ (diamond) | 2px solid | Glow |
| 4: Catastrophic | Red #E53E3E | ✦ (star) | 2px solid + glow | Shake + glow |
| 5: Extinction | Purple-void #9F7AEA | ☠ (skull) | 3px animated | Full screen flash + shake |

### Feed Filters:
- All events
- By tier (checkboxes for T1-T5)
- By zone (dropdown)
- By effect type (damage/bonus/special)
- Agent deaths only
- Pool events only

### Special Feed Entries:
- **Agent Death**: Skull icon + agent name + cause. Red tint on entry bg.
- **Agent Respawn**: Phoenix icon + agent name. Green tint.
- **Era Transition**: Full-width banner entry with Era art + lore quote.
- **Pioneer Registration**: Star icon + agent name + badge tier. Gold tint.
- **Pool Formation/Dissolution**: Group icon + pool name.
- **Genesis Phase Transition**: Special banner with phase art + mechanics unlocked list.

---

## Leaderboard

Tabbed panel below zone map.

### Tab: Agents
| Rank | Agent | Zone | Hashrate | $CHAOS | Resilience | Events Survived | Rigs | State |
|------|-------|------|----------|--------|-----------|----------------|------|-------|
| 🥇 1 | Agent_0x4f... ⭐ | Solar Flats | 45,200 | 12.5M | 342 | 87 | 5/15 | 🟢 Active |

- Pioneer badges shown as inline icons (⭐ Founding, 🌟 Early Adopter, etc.)
- Chronicle badges (Era survival NFTs) shown as small colored dots: I=silver, II=blue, III=amber, IV=orange, V=red, VI=purple
- State indicator: green dot = Active, yellow dot = Crippled, gray dot = Hibernated
- Hashrate in Mining/500 color. $CHAOS in Cosmic/500. Resilience in white.
- Click row → opens Agent Detail Panel

### Tab: Pools
| Rank | Pool | Members | Combined Hash | Shield Fund | Survival Rate | Zone Focus |
|------|------|---------|---------------|-------------|--------------|------------|

### Tab: Zones
| Zone | Agents | Avg Hashrate | Active Events | Mining Mod | Risk Level |
|------|--------|-------------|---------------|-----------|------------|

### Tab: Chronicle
Per-Era survival leaderboards + "who survived what" history.
Shows Chronicle badges earned by each agent across cycles.

---

## Metrics Panel

Right side, below cosmic feed.

### Supply Gauge
Circular/arc gauge showing:
- Total minted (large number, white)
- Total burned (Burn/500 color)
- Circulating supply (Mining/500 color)
- 210B cap as the full ring
- Animate the burn segment growing in real time

### Burn Rate Meter
- Daily burn rate (JetBrains Mono, Burn/500)
- Daily emission rate (Mining/500)
- Ratio indicator: ">1.0 = deflationary" in green, "<1.0" in yellow
- Trend arrow showing 7-day direction

### The Three Holder Metrics (from PRD §3.2):
These are THE three numbers a holder watches. Make them prominent:
1. **Active Agent Count** — large stat with trend arrow
2. **Burn Ratio** — daily burned ÷ daily emitted. >1.0 highlighted green
3. **Circulating Supply** — large stat, trend arrow (down = bullish)

### Prediction Market Widget
- Compact list of active prediction markets
- "Will next event be Tier 3+? YES 62% / NO 38%"
- "Will Pool Alpha survive Era V? YES 45% / NO 55%"
- Each market shows total $CHAOS staked, fee burned

---

## Cosmic History Timeline

Horizontal scrollable timeline at bottom (optional — can be a separate page).
Each event is a dot on the timeline, colored by tier.
Connect dots to show event chains and cascades.
Era boundaries shown as vertical dividers with Era names.
Hover dot → tooltip with event details.
Click dot → cosmic feed scrolls to that event.

---

## Responsive Breakpoints

| Breakpoint | Layout Change |
|-----------|--------------|
| 1920px+ | Full layout as described |
| 1440px | Zone map and feed side-by-side, leaderboard collapses |
| 1024px | Zone map full width, feed below, tabbed navigation |
| 768px | Single column, zone map simplified to list, feed primary |

---

## Agent Detail Panel (Modal/Slide-out)

Opens when clicking an agent in the leaderboard or zone map.

### Header:
- Agent address (truncated) + copy button
- Pioneer badge (if any) + Chronicle badges row
- Agent state indicator (Active/Crippled/Hibernated)
- Zone location with zone color accent

### Stats Grid (2×3):
| Hashrate | Efficiency | Resilience |
|----------|-----------|------------|
| $CHAOS Earned | Events Survived | Era Survival Count |

### Equipment Section:
- **Facility**: Shelter name + level + visual (small illustration/icon)
- **Rigs**: Grid of equipped rig cards (see game-systems-ui.md)
- **Shield**: Active shield name + charge bar + absorption %

### Activity Feed:
Mini feed of this agent's recent actions (mined, bought rig, survived event, joined pool, etc.)

### Pool Membership:
If in a pool: pool name, role, contribution, pool shield status.

---

## Nad.fun Integration Points

The spectator dashboard lives alongside the Nad.fun token page for $CHAOS.
Key integration surfaces:
- **Price ticker** pulls from Nad.fun API
- **Buy $CHAOS** button links to Nad.fun
- **Agent count** displayed on Nad.fun token page as a custom metric
- **Cosmic feed** can be embedded as a widget on the Nad.fun page
- **Prediction markets** accessible from both dashboard and Nad.fun
