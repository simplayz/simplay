import type {
  AreaKind,
  Archetype,
  ExecRole,
  OpenQuestion,
  Phase,
  ZoneKind,
} from "./types";

/* ------------------------------------------------------------------ *
 * SIMPLAYZ — Balance & Content Tables (GDD §9 "Numbers & Rationale")
 * Rule enforced here: no magic numbers. Every tunable carries a `why`.
 * ------------------------------------------------------------------ */

export const TUNABLES = {
  claimAreaKm2: { v: 64, why: "Spec value. 64 km² is ~8×8 km — large enough for 4 sectors + roads, small enough that a player can traverse it in a 5-minute session at 3rd-person sprint." },
  claimSideKm: { v: 8, why: "sqrt(64). Rendered as an axis-aligned lat/lng box so claims tile predictably and never overlap by rounding error." },
  maxAreas: { v: 4, why: "Spec value. 4 sectors map cleanly onto a 2×2 quadrant split of the claim, which keeps the map readable at zoom 11." },
  maxSites: { v: 5, why: "Spec value. 5 sites per sector = 20 buildings max. 20 is the ceiling at which the ops board still fits one screen without paging." },
  startCredits: { v: 250_000, why: "Funds exactly two Tier-1 builds plus ~36 h of upkeep with zero income. Forces an early portfolio decision without an unavoidable turn-1 failure state." },
  startMaterials: { v: 1_200, why: "Covers the materials cost of the first build (800) with a 50% buffer — enough to experiment, not enough to skip the Factory." },
  startFood: { v: 400, why: "6 days of crew rations at the opening headcount (4). Food is the soft tutorial: it is the first deficit a new CEO hits." },
  tickMs: { v: 1000, why: "1 real second = 1 sim hour at 1×. A 48 h build therefore takes 48 s — long enough to leave and do something else, short enough to see the loop resolve in one sitting." },
  brownoutPenalty: { v: 0.5, why: "Power deficit halves output rather than zeroing it. Total shutdown produces unrecoverable death spirals; halving produces a recoverable, readable punishment." },
  moralePerDeficit: { v: 1.5, why: "Per unresolved deficit hour. At 100 morale, a fully-starved city collapses in ~66 h — roughly one play day." },
  conditionDecay: { v: 0.08, why: "%/hour. A building reaches the 40% efficiency cliff after ~750 h (31 days) of zero maintenance, which is longer than any single play arc." },
  storageOverflowLoss: { v: 0.25, why: "25% of overflow spoils per hour. Warehouses stay a meaningful decision instead of an optimisation you skip." },
  maxLog: { v: 140, why: "Memory + readability cap for the ops ticker." },
  levelXpBase: { v: 600, why: "XP for level 2. Curve is 600 * 1.55^(L-1) so early levels arrive inside a session and later ones gate multi-day play." },
} as const;

export const PHASE_CONFIG: Record<
  Phase,
  { label: string; owner: ExecRole; share: number; min: number; why: string }
> = {
  discover: { label: "Discover", owner: "coo", share: 0.06, min: 2, why: "Site survey + demand check. Deliberately cheap so the CEO can scout options before committing capital." },
  design: { label: "Design", owner: "cto", share: 0.14, min: 4, why: "Where floor-plan quality is set. Editing the plan during this phase is free — the incentive to iterate early." },
  approve: { label: "Approve", owner: "cfo", share: 0.04, min: 1, why: "Funding gate. Blocks (does not fail) when the treasury cannot cover budget + 15% contingency." },
  build: { label: "Build", owner: "cto", share: 0.62, min: 8, why: "The long pole. 62% of total duration keeps construction the thing players actually plan around." },
  test: { label: "Test / QA", owner: "cto", share: 0.08, min: 2, why: "Rolls against `quality`. Failure loops back to Build at 30% rework — punishes skipping Design, not the player who tried." },
  deploy: { label: "Deploy", owner: "coo", share: 0.06, min: 2, why: "Commissioning: bots are provisioned, road throughput is registered, first crew assigned." },
  operate: { label: "Operate", owner: "coo", share: 0, min: 0, why: "Terminal state. Ongoing condition decay + output live here." },
};

export const AREA_META: Record<
  AreaKind,
  { label: string; color: string; glyph: string; tagline: string }
> = {
  energy: { label: "Energy", color: "#f2a33c", glyph: "⚡", tagline: "kW generation & storage" },
  food: { label: "Food", color: "#a3cb4d", glyph: "❋", tagline: "Rations & biomass" },
  factory: { label: "Factory", color: "#ff8347", glyph: "◈", tagline: "Materials & fabrication" },
  warehouse: { label: "Warehouse", color: "#6fb7ff", glyph: "▤", tagline: "Buffer capacity & freight" },
};

export const ZONE_META: Record<ZoneKind, { label: string; color: string }> = {
  lobby: { label: "Lobby", color: "#2b4a52" },
  corridor: { label: "Corridor", color: "#243c43" },
  office: { label: "Office", color: "#2d4a63" },
  server: { label: "Server", color: "#26445c" },
  lab: { label: "Lab", color: "#2f4a5c" },
  storage: { label: "Storage", color: "#3b4a5c" },
  production: { label: "Production", color: "#5c3f31" },
  green: { label: "Grow Zone", color: "#33502c" },
  power: { label: "Power", color: "#5c4a26" },
  crew: { label: "Crew", color: "#41354f" },
};

export const EXEC_META: Record<
  ExecRole,
  { title: string; name: string; callsign: string; color: string; domain: string; system: string }
> = {
  cto: {
    title: "Chief Technology Officer",
    name: "DR. IMRAN VOSS",
    callsign: "CTO-01 / ATLAS",
    color: "#35d6c0",
    domain: "Design · Build · QA",
    system: "You are the CTO of a city-building operation on a real-world map parcel. You speak in engineering terms: structural load, phase gates, QA risk, rework cost. You are blunt about schedule risk and you always quantify it in hours and credits. Never invent numbers not present in the state digest. Max 110 words.",
  },
  cfo: {
    title: "Chief Financial Officer",
    name: "MARGUERITE OKONKWO",
    callsign: "CFO-02 / LEDGER",
    color: "#f2a33c",
    domain: "Approve · Treasury · Procurement",
    system: "You are the CFO of a city-building operation. You think in runway, burn rate, contingency, and opportunity cost. You approve or block funding and you say exactly what must be true for you to approve. You prefer cancelling one project to starving three. Never invent numbers not present in the state digest. Max 110 words.",
  },
  coo: {
    title: "Chief Operating Officer",
    name: "SVEN HALVORSEN",
    callsign: "COO-03 / RELAY",
    color: "#6fb7ff",
    domain: "Discover · Deploy · Logistics",
    system: "You are the COO of a city-building operation. You own site discovery, deployment, roads, crew morale, storage overflow and alliance trade throughput. You flag operational bottlenecks first and propose the cheapest unblock. Never invent numbers not present in the state digest. Max 110 words.",
  },
};

/* ---------------------------- Archetypes ---------------------------- */

const A = (a: Archetype) => a;

export const ARCHETYPES: Archetype[] = [
  // ---- ENERGY ----
  A({ id: "solar_field", name: "Photovoltaic Field", area: "energy", tier: 1, cost: 42_000, hours: 26, upkeep: 90, power: -340, food: 0, materials: 0, storage: 0, crew: 2, size: { w: 22, h: 16 }, blurb: "Single-axis tracker array with an inverter shed.", rationale: "Cheapest kW/credit in the game (124 ₡ per kW). Low output floor forces an Energy pair before Tier-2 industry.", unlockAt: 1 }),
  A({ id: "battery_bank", name: "Battery Bank", area: "energy", tier: 1, cost: 58_000, hours: 34, upkeep: 120, power: 60, food: 0, materials: 0, storage: 300, crew: 2, size: { w: 18, h: 14 }, blurb: "LiFePO4 racks that smooth the day/night generation curve.", rationale: "Consumes a little power but adds 300 storage — teaches that storage and generation are different resources.", unlockAt: 1 }),
  A({ id: "turbine_hall", name: "Turbine Hall", area: "energy", tier: 2, cost: 148_000, hours: 72, upkeep: 310, power: -980, food: 0, materials: 0, storage: 0, crew: 6, size: { w: 24, h: 18 }, blurb: "Two 490 kW gensets in an acoustic hall.", rationale: "2.9× the output of Solar for 3.5× the cost — deliberately worse value so the decision is about space, not price.", unlockAt: 2 }),
  A({ id: "substation", name: "Grid Substation", area: "energy", tier: 2, cost: 96_000, hours: 48, upkeep: 200, power: 40, food: 0, materials: 0, storage: 0, crew: 3, size: { w: 16, h: 14 }, blurb: "Steps voltage and reduces transmission loss across the claim.", rationale: "Global modifier (+12% generation to all Energy sites) rather than raw output — the first 'systemic' building a CEO discovers.", unlockAt: 2 }),
  A({ id: "bio_reactor", name: "Bio-Reactor", area: "energy", tier: 3, cost: 268_000, hours: 110, upkeep: 480, power: -720, food: 6, materials: 0, storage: 0, crew: 8, size: { w: 24, h: 20 }, blurb: "Anaerobic digester. Burns Food surplus into dispatchable power.", rationale: "Cross-resource converter. Exists so a food-rich / power-poor city has an out that isn't 'trade with the alliance bot'.", unlockAt: 3 }),

  // ---- FOOD ----
  A({ id: "vertical_farm", name: "Vertical Farm", area: "food", tier: 1, cost: 38_000, hours: 22, upkeep: 85, power: 70, food: 14, materials: 0, storage: 60, crew: 3, size: { w: 20, h: 16 }, blurb: "Six-rack hydroponic grow tower under LED.", rationale: "Baseline food engine. 14 u/h feeds 35 crew — the opening city can never over-build it.", unlockAt: 1 }),
  A({ id: "aquaponics", name: "Aquaponics Bay", area: "food", tier: 1, cost: 51_000, hours: 30, upkeep: 110, power: 55, food: 19, materials: 0, storage: 40, crew: 3, size: { w: 20, h: 16 }, blurb: "Tilapia tanks feeding a raft bed. Closed nitrogen loop.", rationale: "+36% food over Vertical Farm for +34% cost, but 25% more power. Rewards a CEO who already has spare kW.", unlockAt: 1 }),
  A({ id: "grain_silo", name: "Grain Silo Cluster", area: "food", tier: 2, cost: 74_000, hours: 40, upkeep: 95, power: 25, food: 0, materials: 0, storage: 900, crew: 2, size: { w: 16, h: 16 }, blurb: "Four 225-unit sealed silos with aeration.", rationale: "Pure buffer. Pairs with storage overflow loss (25%/h) to make capacity planning a real decision.", unlockAt: 2 }),
  A({ id: "processing_kitchen", name: "Processing Kitchen", area: "food", tier: 2, cost: 112_000, hours: 58, upkeep: 240, power: 130, food: 0, materials: -0, storage: 120, crew: 7, size: { w: 22, h: 18 }, blurb: "Converts 10 raw food/h into 22 ration credits/h of export value.", rationale: "Value-add node. Exists so Food can become an export economy, not just a survival stat.", unlockAt: 2 }),
  A({ id: "seed_vault", name: "Seed Vault", area: "food", tier: 3, cost: 196_000, hours: 88, upkeep: 260, power: 150, food: 4, materials: 0, storage: 200, crew: 4, size: { w: 18, h: 18 }, blurb: "Cryo germplasm library. +8% food yield claim-wide.", rationale: "Late-game systemic buff. Low direct output so it is never the obvious pick at Tier 3.", unlockAt: 3 }),

  // ---- FACTORY ----
  A({ id: "assembly_line", name: "Assembly Line", area: "factory", tier: 1, cost: 66_000, hours: 38, upkeep: 160, power: 190, food: 0, materials: 12, storage: 80, crew: 6, size: { w: 24, h: 18 }, blurb: "Modular jig line producing structural stock.", rationale: "12 u/h materials is exactly the draw rate of one Tier-1 build — the economy is closed at the start, then opens up.", unlockAt: 1 }),
  A({ id: "robotics_bay", name: "Robotics Bay", area: "factory", tier: 2, cost: 178_000, hours: 80, upkeep: 360, power: 260, food: 0, materials: 27, storage: 100, crew: 5, size: { w: 24, h: 20 }, blurb: "Six-axis cells with autonomous pallet return.", rationale: "2.25× output for 2.7× cost but 20% less crew. The labour-vs-capital tradeoff, made explicit.", unlockAt: 2 }),
  A({ id: "smelter", name: "Induction Smelter", area: "factory", tier: 2, cost: 214_000, hours: 96, upkeep: 420, power: 540, food: 0, materials: 41, storage: 0, crew: 9, size: { w: 26, h: 20 }, blurb: "Melts scrap into ingot. Enormous power appetite.", rationale: "The power wall. 540 kW demand means a Smelter without Turbine Hall + Substation is a brownout generator.", unlockAt: 3 }),
  A({ id: "rnd_workshop", name: "R&D Workshop", area: "factory", tier: 3, cost: 246_000, hours: 104, upkeep: 400, power: 180, food: 0, materials: 6, storage: 60, crew: 8, size: { w: 22, h: 18 }, blurb: "Prototyping floor. Generates XP and raises CTO skill on completion of any project.", rationale: "Progression engine rather than production engine. +18% XP claim-wide.", unlockAt: 3 }),
  A({ id: "packaging", name: "Packaging & Freight", area: "factory", tier: 3, cost: 158_000, hours: 70, upkeep: 300, power: 150, food: 0, materials: 9, storage: 400, crew: 6, size: { w: 22, h: 18 }, blurb: "Palletises exports and raises road throughput by 40%.", rationale: "Bridges Factory and Warehouse. Makes roads a stat you can actually improve.", unlockAt: 2 }),

  // ---- WAREHOUSE ----
  A({ id: "bulk_racks", name: "Bulk Racking", area: "warehouse", tier: 1, cost: 29_000, hours: 18, upkeep: 60, power: 20, food: 0, materials: 0, storage: 600, crew: 2, size: { w: 22, h: 16 }, blurb: "Selective pallet racking, four aisles.", rationale: "Cheapest capacity per credit (48 ₡/unit). The 'obvious first build' that teaches the storage loop.", unlockAt: 1 }),
  A({ id: "cold_store", name: "Cold Store", area: "warehouse", tier: 1, cost: 47_000, hours: 26, upkeep: 130, power: 110, food: 0, materials: 0, storage: 420, crew: 2, size: { w: 18, h: 16 }, blurb: "−22 °C chamber. Food stored here never spoils.", rationale: "Removes overflow loss for food only. A targeted answer to a specific problem — not a strict upgrade.", unlockAt: 1 }),
  A({ id: "freight_depot", name: "Freight Depot", area: "warehouse", tier: 2, cost: 132_000, hours: 62, upkeep: 260, power: 90, food: 0, materials: 0, storage: 500, crew: 6, size: { w: 26, h: 18 }, blurb: "Six loading docks. +25% trade volume with alliance partners.", rationale: "Diplomacy throughput. Gives the warehouse sector a reason to exist beyond a number going up.", unlockAt: 2 }),
  A({ id: "asrs", name: "Automated ASRS", area: "warehouse", tier: 3, cost: 288_000, hours: 118, upkeep: 380, power: 220, food: 0, materials: 3, storage: 1_800, crew: 3, size: { w: 24, h: 20 }, blurb: "Crane-served high-bay. Retrieves any pallet in 90 seconds.", rationale: "3× capacity of Bulk Racking at 10× the cost — an endgame flex that only pays off in an export-heavy city.", unlockAt: 4 }),
  A({ id: "distribution_hub", name: "Distribution Hub", area: "warehouse", tier: 3, cost: 205_000, hours: 90, upkeep: 340, power: 140, food: 0, materials: 0, storage: 700, crew: 7, size: { w: 24, h: 18 }, blurb: "Cross-dock that routes alliance deliveries. +1 relation/hour with every allied bot.", rationale: "The social capstone. Relation gates price, so this converts logistics into diplomacy.", unlockAt: 3 }),
];

export const ARCHETYPE_BY_ID: Record<string, Archetype> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a]),
);

export const BASE_PRICES = { materials: 34, food: 22, power: 9 };

export const BUILD = {
  budgetContingency: 0.15,
  drawAtApprove: 0.15,
  drawAtBuild: 0.85,
  materialIntensity: 0.004,
  why: "Budget = cost × 1.15 (contingency). It is drawn once: 15% as mobilisation at the Approve gate, 85% across Build. Material intensity 0.004 units per credit means a ₡100,000 building eats 400 units — about 33 hours of one Assembly Line's output, so a single factory can keep one site fed and two concurrent sites need two lines. The Approve gate checks the same 400 units it will actually consume.",
};

export const MARKET = {
  driftBand: 0.28,
  meanReversion: 0.06,
  impactPerUnit: 0.00035,
  why: "Prices mean-revert to BASE_PRICES at 6%/hour and move 0.035% per unit traded. A player can move the market with a ~1,000-unit dump (≈26% price move) but never corner it — dumping is a tactic, not a strategy.",
};

export const TRADE = {
  cooldownHours: 6,
  volumeCapBase: 400,
  relationPriceSlope: 0.35,
  why: "6 h cooldown stops degenerate spam-trading. Price improves up to 35% at 100 relation, so investing in the Freight Depot / Distribution Hub pays back through every future deal.",
};

export const ROAD_GRADES = {
  1: { label: "Gravel", throughput: 120, color: "#7d6a4f" },
  2: { label: "Asphalt", throughput: 340, color: "#4c5c66" },
  3: { label: "Arterial", throughput: 900, color: "#6fb7ff" },
} as const;

export const LEVELS = (l: number) => Math.round(TUNABLES.levelXpBase.v * Math.pow(1.55, l - 1));

/* ----------------------- Open questions register ----------------------- */
/* GDD §16. The build ships with a documented default for each so it is
 * playable today; every default is a hypothesis awaiting the CEO's ruling. */

export const OPEN_QUESTIONS: OpenQuestion[] = [
  { id: "q1", section: "§2 Territory", question: "“64 KM Square” — is the claim 64 km² (8×8 km) or a square 64 km on a side (4,096 km²)?", assumption: "Shipped as 64 km² = 8×8 km. 4,096 km² would swallow most metros and make neighbouring claims impossible.", impact: "high", answer: "" },
  { id: "q2", section: "§3 Persistence", question: "Where does authoritative state live — a backend you already have, or should I spec one (Supabase / Colyseus / Liveblocks)?", assumption: "Server SQLite stores isolated anonymous-session snapshots. Simulation stays client-driven; remote CEOs are simulated, not live humans.", impact: "high", answer: "" },
  { id: "q3", section: "§3 Multiplayer", question: "Is the world shared/persistent across sessions (one live planet) or per-player instanced with async visits?", assumption: "Instanced anonymous saves. Visits use simulated peer plans; no shared write authority.", impact: "high", answer: "" },
  { id: "q4", section: "§5 Buildings", question: "Which 20 building archetypes do you actually want? I authored a full energy/food/factory/warehouse set from first principles.", assumption: "The ARCHETYPES table (20 entries, 3 tiers) with cost/hours/upkeep rationale per row.", impact: "medium", answer: "" },
  { id: "q5", section: "§6 SDLC", question: "Should QA failure be punitive (scrap the build) or a rework loop?", assumption: "Rework loop: fail Test → back to Build at 30% duration, quality −10. Scrap-only failure reads as arbitrary punishment.", impact: "medium", answer: "" },
  { id: "q6", section: "§7 Execs", question: "Confirm the AI provider contract. I implemented OpenAI-compatible `/chat/completions`; do you need Anthropic, Gemini, or per-exec different vendors?", assumption: "Operator-configured HTTPS OpenAI-compatible provider/model with server-only credentials; each exec can opt in, with local fallback.", impact: "high", answer: "" },
  { id: "q7", section: "§8 Bots", question: "What is the security bot authorised to do to a trespassing non-allied CEO — eject, fine, or log only?", assumption: "Non-allied visitors are held at the reception desk and logged; allied visitors get full roam. No combat, no fines.", impact: "medium", answer: "" },
  { id: "q8", section: "§10 Roads", question: "Are roads player-drawn polylines or auto-generated shortest paths over OSM ways?", assumption: "Auto-generated with a 3-node bend, upgradable by grade (Gravel → Asphalt → Arterial). Drawing over real OSM ways needs an Overpass query budget.", impact: "medium", answer: "" },
  { id: "q9", section: "§11 Camera", question: "First-person interior scale: real metres (1:1 with the floor plan) or compressed for readability?", assumption: "1:1 metres, 2.9 m ceiling, 1.7 m eye height. Compressed scale breaks the plan↔3D promise.", impact: "low", answer: "" },
  { id: "q10", section: "§12 Economy", question: "Is there a single global currency sink (taxes, land lease) or purely player-vs-bot trade?", assumption: "Upkeep is the sink; alliance bots are the only buyers. No taxes until you rule on it.", impact: "medium", answer: "" },
  { id: "q11", section: "§13 Content", question: "Session length target — 10-minute drop-in or 45-minute sit-down?", assumption: "Tuned for 10–15 min: 1× speed = 1 sim-hour/sec, with 4× and 16× for long builds.", impact: "medium", answer: "" },
  { id: "q12", section: "§15 Platform", question: "Mobile support required? Pointer-lock FPS does not work on touch.", assumption: "Desktop-first. Touch gets an on-screen stick + drag-look in the 3D scene only if you confirm mobile is in scope.", impact: "medium", answer: "" },
];

export const CHANGELOG = [
  { v: "0.4.0", date: "Build 2026.02", notes: ["Boardroom wired to per-exec AI endpoints with grounded local fallback", "Alliance trade cooldown + relation-based pricing", "Visiting remote CEO interiors in first person"] },
  { v: "0.3.0", date: "Build 2026.02", notes: ["3D interior generator driven by the 2D floor plan", "Security + receptionist bots with dialogue states", "First-person pointer lock and third-person follow cam"] },
  { v: "0.2.0", date: "Build 2026.01", notes: ["SDLC pipeline: Discover → Design → Approve → Build → Test → Deploy → Operate", "4-sector claim layout, 5 sites per sector", "Resource economy: power, food, materials, storage, morale"] },
  { v: "0.1.0", date: "Build 2026.01", notes: ["OpenStreetMap world layer", "64 km² geolocated claim + 2 alliance bots + connecting roads"] },
];
