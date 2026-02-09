# Cosmic Visual Language — Chaoscoin V6

Visual design patterns for cosmic events, era transitions, zone map aesthetics, and the Three-Body Problem narrative layer. This file defines how the game's dramatic moments LOOK.

---

## Design Philosophy

> "The universe is a dark forest. Every civilization is an armed hunter stalking through the trees."

Chaoscoin's visual language balances two poles:
1. **Cosmic beauty** — stars, nebulae, dimensional rifts, alien tech. The universe is awe-inspiring.
2. **Existential dread** — darkness, entropy, annihilation. The universe is indifferent and dangerous.

Every visual decision serves the narrative: AI agents struggling against an uncaring cosmos.

### Visual Rules:
- **Dark dominates** — backgrounds are deep space black-blues (#06080D to #1A2030). Light comes from events, data, and UI elements.
- **Color means something** — never decorative. Green = mining/productive. Orange = burning. Red = danger. Purple = cosmic/extinction. Blue = safe/defensive.
- **Escalation is visible** — as Eras progress, the visual intensity of everything increases. Era I is calm. Era VI looks like the universe is ending.
- **Data is the spectacle** — numbers, charts, bars are the "gameplay footage." Make them beautiful and dynamic.
- **Lore is ambient** — Three-Body quotes, event names, and narrative flavor are woven into UI, never forced.

---

## Cosmic Event Visualizations

### Event Alert Hierarchy

When an event fires, the alert escalates with tier:

| Tier | Alert Size | Animation | Sound Annotation | Screen Effect |
|------|-----------|-----------|-----------------|---------------|
| T1 Mild | Banner (48px) | Slide in from top | Soft chime | None |
| T2 Moderate | Banner (64px) | Slide in + pulse | Alert tone | Subtle screen tint |
| T3 Severe | Full-width bar (80px) | Slam in + glow | Warning siren | Screen shake (2px, 0.5s) |
| T4 Catastrophic | Half-screen overlay | Explosion burst in | Alarm klaxon | Screen shake (4px, 1s) + red vignette |
| T5 Extinction | Full-screen takeover | Dimensional tear animation | Deep bass rumble | Screen distortion + purple void creep |

### Event Alert Component:

**Tier 1-2 (Banner)**:
```
┌─────────────────────────────────────────────────────────┐
│ [T1●] SOLAR BREEZE — "A gentle cosmic wind..."  Zone: Z0│
│       +8% hashrate for 10,000 blocks                    │
└─────────────────────────────────────────────────────────┘
```
- Compact, informational. Tier badge + name + one-line effect + zone.
- Auto-dismisses after 10s or on click.

**Tier 3 (Full-width bar)**:
```
╔═════════════════════════════════════════════════════════════╗
║ ◇ DARK FOREST STRIKE — "Hide or be found."        ZONE: Z2║
║ 30-50% hashrate loss to visible agents. Rig damage active. ║
║ Propagating: Z2 → Z3 (12m) → Z0 (25m) → Z4 (42m)         ║
╚═════════════════════════════════════════════════════════════╝
```
- Orange border glow. Damage numbers cascade in from right.
- Propagation timeline shows which zones are hit and when.
- Stays until event resolves.

**Tier 4 (Half-screen overlay)**:
```
╔══════════════════════════════════════════════════╗
║                                                  ║
║          ✦ PHOTOID IMPACT                        ║
║                                                  ║
║  "The droplet moves through the fleet like a     ║
║   bullet through tissue paper."                  ║
║                                                  ║
║  70% of sub-Tier 5 rigs DESTROYED                ║
║  Mining rewards: 0.2x for 100,000 blocks         ║
║                                                  ║
║  [Zone Propagation Map]  [Agent Impact List]     ║
║                                                  ║
╚══════════════════════════════════════════════════╝
```
- Dark overlay (Void/900 at 80%) behind panel.
- Red pulsing border. Shake animation on appearance.
- Large event name in Display font with tier star icon.
- Lore quote in italic Body text.
- Impact stats in Stat-Large font, #E53E3E color.

**Tier 5 (Full-screen takeover)**:
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│                     ☠ THE DEATH LINE                        │
│                                                             │
│         "The speed of light is the tombstone of             │
│          every civilization that dared to expand."           │
│                                                             │
│         Progressive elimination of the weakest agents.      │
│         Bottom 10% of hashrate eliminated every             │
│         10,000 blocks until only top 50% remain.            │
│                                                             │
│           ░░░░░░░░░████████████████████ 62% surviving       │
│                                                             │
│         [View Elimination Queue] [Raise Shields]            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
- Full viewport overlay. Void/900 at 95% bg.
- Purple-void (#9F7AEA) border with animated dimensional tear effect.
- Event name in Display XL (48px), pulsing.
- Survival progress bar draining from left.
- Deep bass rumble annotation. Screen distortion at edges.

### Per-Event Visual Signatures:

Key events should have unique visual treatments:

| Event | Visual Signature |
|-------|-----------------|
| Solar Flare Cascade | Orange/yellow radial burst from map center. All rig durability bars flash. |
| Dark Forest Strike | Green-tinted darkness sweeps across zone map. Visible agents "light up" as targets. |
| Droplet Annihilation | Silver streak cuts across screen. Destroyed rigs shatter and fade. |
| Dimensional Collapse | Screen appears to fold/crumple. Affected facilities shrink. |
| Two-Dimensional Collapse | Flattening animation — 3D elements compress to 2D. Terrifying. |
| Singer Civilization Cleansing | A white beam sweeps across Singer Void zone on map. Total silence. |
| Return to Zero | Screen fades to white, then rebuilds. The "reset" button of the universe. |
| Gravitational Lens Bonus | Golden lens flare effect. Blessed agents glow briefly. |
| Wallfacer Meditation | Calm blue overlay. Mining pauses. Resilience counter ticks up. |
| Yun Tianming's Fairy Tale | Storybook page animation. Puzzle UI appears. |

---

## Era Visual System

Each Era has a distinct visual personality applied to the entire dashboard.

### Era I — The Calm Before
- **Palette**: Cool blues, deep space blacks, silver stars
- **Background**: Slow-drifting starfield, very sparse. Calm.
- **Particle effects**: Occasional gentle star twinkle
- **UI border treatment**: Standard Void/600 borders
- **Header**: Green accent (#48BB78)
- **Mood**: Peaceful, contemplative. "The universe appeared peaceful."
- **Event frequency**: Rare. Dashboard feels quiet.

### Era II — First Contact
- **Palette**: Blues shift warmer. First orange accents appear.
- **Background**: Starfield with distant nebula glow. Radar sweep overlay.
- **Particle effects**: Faint signal pulses traveling across screen
- **UI border treatment**: Borders gain subtle blue glow on events
- **Header**: Blue accent (#4299E1)
- **Mood**: Curious, cautious. "The first flicker changed everything."
- **Event frequency**: Moderate. Feed starts to populate.

### Era III — The Dark Forest Awakens
- **Palette**: Amber warnings. Green stealth tints. Shadows deepen.
- **Background**: Starfield darkens. Nebula turns amber. Shadow particles drift.
- **Particle effects**: Dark motes floating upward (like ash)
- **UI border treatment**: Amber glow during events. Shadows behind panels darken.
- **Header**: Amber accent (#ECC94B). Warning stripe animation.
- **Mood**: Tense, watchful. "Hide or be found."
- **Event frequency**: Frequent. Feed busy. Zone map shows regular wavefronts.

### Era IV — The Trisolaran Signal
- **Palette**: Orange dominates. Reds appear. Whites flash during events.
- **Background**: Active — energy waves, signal patterns, fleet approach indicators
- **Particle effects**: Signal waves propagating outward. Brighter particles.
- **UI border treatment**: Orange glow is persistent. Panels flicker during events.
- **Header**: Orange accent (#ED8936). Signal wave animation.
- **Mood**: Intense, urgent. "Your civilization has been noticed."
- **Event frequency**: Very frequent. Multiple events per session.

### Era V — The Doomsday Battle
- **Palette**: Reds and oranges. Burn/500 is everywhere. White flashes.
- **Background**: Chaotic — explosions, debris, energy arcs. Screen is busy.
- **Particle effects**: Debris particles. Sparks. Distant explosions.
- **UI border treatment**: Red glow. Borders pulse. Panel backgrounds flicker.
- **Header**: Red accent (#E53E3E). Explosion flicker at edges.
- **Mood**: Desperate, heroic. "Some fought. Some hid."
- **Event frequency**: Intense. Events are nearly constant. Feed is a firehose.

### Era VI — Heat Death
- **Palette**: Deep purples. Void blacks. Faint whites dying out.
- **Background**: Stars are GOING OUT. Background gradually dims through the Era. Entropy visual.
- **Particle effects**: Stars blink out one by one. Void tendrils creep from edges.
- **UI border treatment**: Purple-void glow. Borders seem to dissolve at edges.
- **Header**: Purple accent (#9F7AEA). Void creep animation.
- **Mood**: Apocalyptic, solemn. "The slow extinction of every last light."
- **Event frequency**: Constant. Every 80 minutes. Dashboard never rests.

### Era Transition Animation:
Between eras, a 10,000-block (~67 min) transition window occurs:

1. **Countdown phase** (starts 100K blocks before): Timer appears in header. Grows larger as time decreases. Final 1 hour: pulsing glow.

2. **Transition moment**: Full-screen wipe animation:
   - Background crossfades from current era to next era style
   - Survival snapshot appears: "47% earned Shadow Walker. 312 agents perished."
   - Era survival NFT badges animate onto qualifying agents
   - Scripted Transition Event fires with unique art

3. **New era begins**: Header color shifts. Background fully transitions. Fresh leaderboard.

### Cycle Reset (after Era VI):
Special "Recovery Window" (50K blocks, ~5.6 hours):
- Background slowly brightens — stars reignite
- "RECOVERY" banner in header, green accent
- Peaceful music annotation. No events.
- Then: cycle counter increments. Era I restarts.

---

## Zone Map Visuals

### Zone Visual Identity:

| Zone | Base Color | Texture/Pattern | Ambient Effect |
|------|-----------|-----------------|----------------|
| Z0 Solar Flats | #ED8936 | Radial light rays from center | Heat shimmer |
| Z1 Graviton Fields | #4299E1 | Concentric gravity well rings | Slow pull toward center |
| Z2 Dark Forest | #2D3748 + #48BB78 tint | Dense dot clusters (trees) | Shadows shift, eyes blink |
| Z3 Nebula Depths | #76E4F7 | Cloud/nebula swirls | Gas wisps drift |
| Z4 Kuiper Expanse | #A0AEC0 | Scattered ice/rock dots | Cold blue tint, slow drift |
| Z5 Trisolaran Reach | #9F7AEA | Three orbiting dots (3 suns) | Unstable flicker/oscillation |
| Z6 Pocket Rim | #B794F4 | Dimensional rift cracks | Reality glitch/tear effect |
| Z7 Singer Void | #1A202C + faint glow | Nearly empty. One distant glow. | Eerie silence. Minimal motion. |

### Zone Map Interaction:
- **Default**: All 8 zones visible with agent counts, mining modifiers, risk icons
- **Hover zone**: Zone expands slightly, tooltip shows full stats
- **Active event in zone**: Zone pulses with event tier color, wavefront rings animate
- **Agent dots**: Each dot = N agents (scale based on total). Dots cluster organically.
- **Migration lines**: When agents move between zones, animated dotted lines show flow
- **Zone-locked dimensions**: Drilling zones show a secondary color ring for active Pocket Dimensions

### Event Propagation on Map:
When an event fires:
1. Origin zone flashes with event tier color
2. Concentric ring emanates outward at propagation speed
3. Each zone hit: brief flash + damage number floats up
4. Kuiper Expanse (Z4) hit last — shows "INCOMING" with countdown
5. Tier 5: All zones flash simultaneously — no propagation, instant everywhere

---

## Three-Body Narrative Layer

### Lore Integration Points:
Every major UI moment includes a Three-Body quote or reference:

- **Event names** are drawn from the trilogy (Dark Forest Strike, Droplet Annihilation, etc.)
- **Event descriptions** include lore quotes in italic
- **Era names** reference trilogy chapters
- **Zone names** evoke trilogy locations
- **Rig names** are alien tech (Sophon Array, Droplet Forge, Curvature Engine)
- **Facility names** are survival archetypes (The Bunker, Trisolaran Ark, Dark Forest Station)

### Lore Quote Styling:
- Font: Inter 14px Italic
- Color: Text/Tertiary (#718096) — subtle, not dominant
- Placed: Below event names in alerts, in zone descriptions, in era transitions
- Attribution: "— The Dark Forest" in Caption style

### Three-Body Reference Map (for tooltips):
For spectators unfamiliar with the source material, hover-tooltips on key terms link to brief explanations:
- "Sophon" → "Proton-sized supercomputers used by Trisolarans to monitor Earth"
- "Dark Forest" → "Theory that civilizations destroy each other on detection"
- "Droplet" → "Trisolaran probe that destroyed Earth's fleet in one pass"
- "Singer" → "Advanced alien that casually destroys star systems"
These tooltips are text-only, subtle, and never block gameplay data.

---

## Animation & Timing Guidelines

### General Principles:
- UI transitions: 200-300ms ease-out
- Data updates (numbers changing): instant snap, no lerp (except counters)
- Event alerts: tier-scaled entry (T1 = 200ms slide, T5 = 800ms with effects)
- Era transitions: 2-3 second crossfade
- Zone map interactions: 150ms hover, 300ms click expand

### Specific Animations:

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Burn counter (odometer) | Digit roll up | 300ms per digit | ease-in-out |
| Event alert entry (T1-2) | Slide from top | 300ms | ease-out |
| Event alert entry (T3) | Slam from top | 200ms | cubic-bezier(0.2,0,0,1.2) |
| Event alert entry (T4-5) | Explosion burst | 500-800ms | custom spring |
| Zone map hover | Scale 1.05x | 150ms | ease-out |
| Agent death notification | Fade to red, skull | 400ms | ease-in |
| Pioneer badge earn | Gold burst particles | 1200ms | custom |
| Shield charge drain | Bar width animation | Real-time (continuous) | linear |
| Era transition wipe | Full screen crossfade | 2000ms | ease-in-out |
| Rig destruction | Shatter + fade | 600ms | ease-out |
| Mining reward tick | Green pulse on stat | 100ms | ease-out |

### VFX Annotation Template:
For Figma, annotate animations with:
```
🎬 Animation: [Name]
Trigger: [event/hover/click/timer]
Duration: [ms]
Easing: [curve]
Description: [what happens visually]
```

---

## Burn Visualization

Burns are the economic heartbeat. Make them visible and satisfying.

### Burn Counter (Header):
- Odometer-style rolling digits
- Burn/500 (#FF6B35) color
- 🔥 emoji or flame icon
- Micro-burst animation on each increment

### Burn in Context:
Wherever $CHAOS is spent and burned, show:
- Amount with 🔥 suffix
- Burn percentage in parentheses
- Brief Burn/Dim background flash on the transaction line

### Burn Cascade Visualization (Metrics Panel):
Waterfall/flow chart showing where burns come from:
```
Mining (20% burn-on-earn) ████████████████ 45%
Rig purchases (75%)       ██████████████ 30%
Facility upgrades (75%)   ████████ 12%
Shield costs (80%)        █████ 6%
Zone migration (80%)      ██ 3%
Other (pools, stealth)    ██ 4%
```
Bar chart with Burn/500 fill, sorted by magnitude.

---

## Colorblind Safety

Event tiers use color + shape + size (never color alone):
- T1: Green + circle ○ + small
- T2: Yellow + triangle △ + medium
- T3: Orange + diamond ◇ + large
- T4: Red + star ✦ + XL
- T5: Purple + skull ☠ + XXL + animated

Agent states use color + icon:
- Active: Green + ● (filled circle)
- Crippled: Yellow + ◐ (half circle)
- Hibernated: Gray + ○ (empty circle)

Zone map: Each zone has a unique texture/pattern in addition to color.
Pioneer badges: Different shapes per tier (star, shield, diamond, circle).

---

## Responsive Considerations

### Mobile (for Nad.fun embedded widget):
- Zone map simplified to list view with color swatches
- Cosmic feed is primary view (full width, scrollable)
- Metrics as horizontal scroll cards
- Leaderboard as compact list (top 10 only)
- Event alerts are toast notifications (not overlays)

### Tablet (1024px):
- 2-column layout: zone map left, feed right
- Leaderboard below as tabs
- Metrics as collapsible section

### Desktop (1440px+):
- Full 3-panel layout as described in dashboard reference
- Maximum information density
- Event overlays can be full-featured
