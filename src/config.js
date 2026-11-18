// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'build-a-cart' // slug registered on bloxity.io
export const GAME_TITLE = 'Build a Cart'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env?.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The hub cave sits at +Z; its mouth opens north (-Z) onto the valley, where the
// five bases line up and their rails run north to the canyon.
export const SPAWN = { x: 0, y: 0.05, z: 46 } // inside the cave
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -12, // fell this far (into the canyon): respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 220, far: 1150 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#1576f0',
    horizon: '#a9e2ff',
    sunColor: '#fff4de',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 2.4,
    sunElevation: 55, // degrees above the horizon
    sunAzimuth: 35, // degrees, 0 = from +Z
    hemiSky: '#e4f2ff',
    hemiGround: '#d8c39a',
    hemiIntensity: 0.8,
    envIntensity: 0.45,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 40, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 2200,
  startPitch: 0.14, // radians above the horizon (low chase cam)
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 12.4, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
  master_volume: { def: '80', type: 'number', min: 0, max: 100 },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
  // Holding a part out in front (carry.js), laid over every other pose.
  carry: {
    rate: 10,
    pose: { ArmL1: { x: deg(-75), z: deg(-12) }, ArmR1: { x: deg(-75), z: deg(12) }, ArmL2: { x: deg(10) }, ArmR2: { x: deg(10) } },
  },
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// =============================================================================
// Build a Cart: the game
// =============================================================================

// --- World layout (world.js, cave.js, track.js) --------------------------------
export const VALLEY = {
  halfWidth: 190, // x of the cliff faces either side of the valley
  back: 130, // z of the back edge (behind the cave mountain)
  front: -3350, // z of the far end, past Golden Station
  cliffHeight: [34, 64], // m, random per cliff block
  grass: '#3fa82a',
  grassDark: '#348f22',
  cliff: '#a9b1c0',
  cliffTop: '#45ab31',
}
// The hub cave: a hollow room inside a blocky mountain; the mouth faces north (-Z).
export const CAVE = {
  inner: { x0: -27, x1: 27, z0: 24, z1: 74 }, // room floor rectangle
  height: 17, // ceiling
  mouth: { halfWidth: 6, height: 9, z0: 14, z1: 24 }, // the tunnel out to the valley
  rock: '#32479a', // inner walls (navy studs)
  rockDark: '#25356f',
  floor: '#2e4184',
  moss: '#3fd14a',
  outer: '#8f99ad', // mountain outside
  outerDark: '#737d92',
}
// Five bases in a row in front of the cave, one track each (they merge into the home
// track before the canyon, TRACK.merge). The player owns `home`.
export const BASES = { xs: [-76, -38, 0, 38, 76], home: 2, cartZ: -8 }

// One track profile shared by every base. s = metres along the rails from the
// cart's resting spot (z = BASES.cartZ - s). Heights are above the valley floor.
export const TRACK = {
  length: 3230, // buffer stop at the end of the line (Golden Station)
  backS: -21, // the rails start here, at the cave mouth behind the cart
  stationLength: 36, // blue studded bed under the rails on the base plateau
  // The bases sit on plateaus at y = 0; the valley floor is valleyDrop lower. The
  // rails roll down a ramp from the plateau tongue (dropStart) to the floor (dropEnd).
  valleyDrop: 2.5,
  dropStart: 42,
  dropEnd: 74,
  rampStart: 240, // the dirt embankment climbs from here...
  lipS: 310, // ...to the broken bridge end
  lipHeight: 12, // m above the valley at the lip
  gapEnd: 362, // far side of the canyon
  landHeight: 8, // far side deck height
  landFlat: 374, // far deck is level until here, then slopes down...
  landEnd: 460, // ...to the valley floor here
  // The side bases' tracks curve in and join the home track between s0 and s1, so
  // from the canyon ramp to the end of the line there is one shared track.
  merge: { s0: 84, s1: 226 },
  canyonFloor: -34, // spikes down there
  canyonHalfWidth: 260, // x extent of the canyon (it cuts the whole valley)
  gauge: 1.5, // m between the rails
  sleeperGap: 1.25,
  archS: 1320, // the Great Arch: the gate from the valley into the new areas
  // Past the far deck the profile is a chain of key points [s, height above the
  // valley floor] joined by smoothsteps (level at every key point). Over a crest
  // a fast cart leaves the rails (airtime) and lands further down.
  hills: [
    [460, 0],
    [1000, 0], // Mountain Pass: the chain lift hauls the cart up...
    [1130, 30],
    [1166, 30], // ...over the summit...
    [1236, 0], // ...and down through the mountain tunnel
    [1370, 0], // Bumpy Meadows: three humps, each bigger
    [1410, 4],
    [1450, 0],
    [1500, 6],
    [1550, 0],
    [1610, 8],
    [1670, 0],
    [1810, 0], // Crystal River: a low bridge over the water
    [1855, 2],
    [1915, 2],
    [1960, 0],
    [2030, 0], // Waterfall Gorge: the Sky Trestle climbs...
    [2170, 34],
    [2310, 34], // ...runs high over the lake...
    [2390, 4], // ...and plunges to the falls
    [2470, 4], // Glow Mine: through the falls into the mountain, a dip inside
    [2550, 0],
    [2870, 0], // Golden Sands: two last humps
    [2910, 5],
    [2950, 0],
    [3000, 7],
    [3060, 0],
  ],
  river: { s0: 1860, s1: 1910 }, // water across the valley under the bridge
  gorge: { s0: 2020, s1: 2420, wallX: 104, lake: 2070 }, // walls either side, lake from `lake`
  falls: 2418, // the waterfall curtain across the gorge's end (the mine mouths behind it)
  mine: { s0: 2422, s1: 2736, roof: 14, boreHalf: 4.2 }, // tunnels through the mountain
  station: 3150, // Golden Station platform starts here
  // Bends: [s0, s1, dx] each shifts every track sideways by dx m (a smoothstep), so a
  // run of them makes an S. The cart leans into them (A / D, see LEAN).
  bends: [
    [520, 650, 10], // Whispering Forest: one long gentle curve (lean a little)
    [705, 790, 18], // Switchback Hills: brake for these
    [805, 890, -30],
    [905, 985, 2],
  ],
  lift: { s0: 1000, s1: 1132, speed: 5 }, // chain lift: below `speed` the chain pulls the cart up
  tunnels: [{ s0: 1172, s1: 1236, name: 'Mountain Tunnel' }], // dark, lamp-lit bores (the mine is separate)
  drawbridge: { s0: 1868, s1: 1900, barrier: 1861 }, // the river bridge's lifting span (home track)
  junction: { choose: 2752, s0: 2762, s1: 2862, offset: 7.5, ramp: 22 }, // the Gem Run branch (home track)
  goldLine: 3196, // stop the cart on it at Golden Station: PERFECT STOP
}

// Areas along the line (ride.js zone cards, ambient particles; zones.js scenery).
// The first time a run reaches an area past the player's best it pays `bonus` Cash.
// air: the ambient particles drifting there (fx.ambient); dust: wheel dust colour.
export const ZONES = [
  { id: 'valley', name: 'Sunny Farm', s: -100, color: '#7dff5a', dust: '#9bbf74', air: 'pollen' },
  { id: 'canyon', name: 'Broken Canyon', s: 240, color: '#ffb35a', dust: '#b98a5a', air: null, quiet: true },
  { id: 'forest', name: 'Whispering Forest', sub: 'Watch for wildlife!', s: 464, bonus: 300, color: '#5fd14a', dust: '#7a5a3a', air: 'leaves' },
  { id: 'switchback', name: 'Switchback Hills', sub: 'Lean with A / D!', s: 694, bonus: 400, color: '#b6ff5a', dust: '#9bbf74', air: 'pollen' },
  { id: 'pass', name: 'Mountain Pass', sub: 'Up the chain lift!', s: 994, bonus: 450, color: '#dfefff', dust: '#a9b1c0', air: 'snow' },
  { id: 'hills', name: 'Bumpy Meadows', sub: 'Catch some air!', s: 1330, bonus: 500, color: '#8dff5a', dust: '#9bbf74', air: 'leaves' },
  { id: 'pasture', name: 'Woolly Pasture', sub: 'Sheep crossing!', s: 1676, bonus: 600, color: '#fff6d8', dust: '#9bbf74', air: 'pollen' },
  { id: 'river', name: 'Crystal River', sub: 'Mind the drawbridge!', s: 1800, bonus: 1000, color: '#7fe8ff', dust: '#dfe6ee', air: 'spray' },
  { id: 'gorge', name: 'Waterfall Gorge', sub: 'Up the Sky Trestle!', s: 2025, bonus: 2000, color: '#5ab8ff', dust: '#8a5a32', air: 'mist' },
  { id: 'mine', name: 'Glow Mine', sub: 'Through the falls!', s: 2422, bonus: 4000, color: '#d07bff', dust: '#6a5a8a', air: 'sparkle', tunnel: true },
  { id: 'desert', name: 'Golden Sands', sub: 'Sandstorm! Pick a lane...', s: 2736, bonus: 7000, color: '#ffd23a', dust: '#e8c07a', air: 'sand' },
  { id: 'station', name: 'Golden Station', sub: 'END OF THE LINE!', s: 3150, bonus: 12000, color: '#ffe066', dust: '#e8c07a', air: 'sand', finish: true },
]
export const zoneAt = (s) => {
  let i = 0
  while (i + 1 < ZONES.length && s >= ZONES[i + 1].s) i++
  return i
}

// --- Cart physics (cartPhysics.js) ----------------------------------------------
export const CART = {
  gravity: 20, // m/s^2 along the rails and in the air
  brake: 14, // m/s^2 with S held
  wagonMass: 0.04, // each extra cart: thrust divided by (1 + n * this)
  wagonFuel: 0.05, // ...and it carries fuel: tank x (1 + n * this)
  wagonGap: 3.1, // m between cart centres on the rails
  airDrag: 0.0006, // per metre, horizontal, while flying
  stopSpeed: 0.35, // m/s: below this with no fuel the run ends
  stopTime: 1.2, // s stationary before it counts as stopped
  landKeep: 0.92, // fraction of speed kept on a clean landing
  hopKeep: 0.97, // ...and after airtime off a crest
  hopFrom: -0.6, // m/s^2: the rails let go once the pull into them drops below this
  rollbackEnd: 14, // m: out of fuel and rolling back this far behind the best ends the run
  safeS: 130, // where a revive puts you back (before the ramp)
}

// --- Leaning into bends (cartPhysics.js) ---------------------------------------------------
// In a bend the cart is pushed outwards by v^2 * curvature (m/s^2). Leaning (A / D,
// the lean buttons) cancels up to `accel` of it; the rest is carried by the wheels'
// grip (x accel). tip = (push / accel - lean) / grip: under `green` the cart is
// steady, up to 1 it rides on two wheels (sparks, a screech), past 1 for
// `derailTime` s it comes off the rails. Rain (Thunderstorm) costs `rainGrip`.
export const LEAN = {
  accel: 9,
  rate: 4.5, // 1/s the cart's lean follows the input
  green: 0.5,
  derailTime: 0.55,
  rainGrip: 0.85,
  autoMargin: 0.85, // headless sims (no lean input) brake to this share of the safe speed
}

// --- Hazards and encounters along the line (encounters.js) -------------------------------
// Each one blocks the home track at `at` for a while once the cart passes `trigger`.
// Stop before `at` and wait for it to clear: a patience bonus. Arrive while it is
// blocked: under `bump` m/s a bump (speed lost), faster a crash. Bonuses are in
// metres of run pay (state.bonusCash), so they grow with the Cart Upgrades.
export const HAZARDS = [
  { id: 'deer', kind: 'herd', animal: 'deer', name: 'ANIMAL CROSSING!', sub: 'Stop and let them pass', trigger: 486, at: 600, cross: 5.5, bump: 22, bonus: 60 },
  { id: 'sheep', kind: 'herd', animal: 'sheep', name: 'SHEEP CROSSING!', sub: 'Slow down...', trigger: 1640, at: 1745, cross: 5, bump: 99, bonus: 50, soft: true }, // soft: sheep scatter (speed lost), never a crash
  { id: 'bridge', kind: 'bridge', name: 'DRAWBRIDGE UP!', sub: 'Wait for the green light', trigger: 1690, at: 1861, cross: 8.5, bump: 12, bonus: 50 },
  { id: 'rocks', kind: 'rocks', name: 'ROCKSLIDE!', sub: 'Boost through or brake!', trigger: 1932, at: 1996, cross: 4, bump: 18, bonus: 40, early: 1.4 },
]
export const BEAR = { s0: 520, s1: 600, wait: 9, warn: 3, fuelLoss: 0.4 } // waited too long near the herd: a bear comes
export const WIND = { s0: 2165, s1: 2315, every: [2.5, 4.5], warn: 0.7, gust: 1.6, push: 0.95 } // gusts on the Sky Trestle (push in LEAN units)

// --- Pickups, gates and skill bonuses (pickups.js) -------------------------------------------
// Coin / gem rows along the home track; `m` = metres of run pay each is worth.
export const PICKUPS = {
  coin: 3,
  gem: 18,
  ticket: 250, // the Golden Ticket: one per run, somewhere past Bumpy Meadows
  fuel: [205, 650, 1080, 1590, 2120, 2610], // fuel cans: +fuelRefill of the tank
  fuelRefill: 0.3,
  boost: [530, 1285, 1955, 2470, 3010], // boost pads: +boostKick m/s
  boostKick: 7,
  gates: [
    { s: 1300, lo: 22, hi: 40 }, // speed gates: through inside [lo, hi] m/s pays `gate`
    { s: 2230, lo: 28, hi: 50 },
    { s: 2990, lo: 40, hi: 75 },
  ],
  gate: 30,
  leanPerfect: 35, // through a bend steady (tip never past LEAN.green)
  leanDrift: 70, // ...or on two wheels for over driftTime s without coming off
  driftTime: 0.6,
  perfectStop: 150, // stopped within stopWindow m of the gold line
  stopWindow: 2.5,
  summit: 40, // over the top of the chain lift
}
// Where REVIVE puts the cart back: the last checkpoint at least 15 m behind the crash.
export const CHECKPOINTS = [130, 470, 690, 990, 1320, 1640, 1930, 2240, 2560, 2740, 3100]

// --- Gear (state.js, the Shop restock window, the Index) ---------------------------
// type: engine | fuel | wheels | booster. Stats:
//  engine  speed (shown in the Index; thrust accel = speed / 10 m/s^2), burn (fuel use x)
//  fuel    tank (s of full throttle; the Index shows it as Fuel)
//  wheels  roll (m/s^2 rolling resistance), drag (air drag factor), grip (how hard the
//          cart can corner before it tips: see LEAN)
//  booster boost (m/s^2), time (s), charges (per run)
// price: Cash (also the sell-back base). starter = what a fresh cart has (never sold).
// shop = sold by the restocking Shop (cave stall); the others drop from Mystery Dice
// (quest levels) and the Lucky Wheel. reb = rebirths needed before the Shop sells it.
// special = only from a base display pad bundle. desc = the Shop's italic line.
// Everything is Cash only (root CLAUDE.md): the reference's premium prices became
// the "instant" price (INSTANT_MARKUP x Cash, skips the stock).
export const RARITY = {
  common: { name: 'Common', color: '#b9c3cf' },
  uncommon: { name: 'Uncommon', color: '#5fd85a' },
  rare: { name: 'Rare', color: '#3aa0ff' },
  epic: { name: 'Epic', color: '#b05cff' },
  legendary: { name: 'Legendary', color: '#ffb321' },
  mythic: { name: 'Mythic', color: '#ff3d6e' },
}
export const BASE_DRAG = 0.0062 // air drag coefficient before the wheels' factor
const E = (id, name, rarity, price, speed, color, o = {}) => ({ id, type: 'engine', name, rarity, price, speed, accel: speed / 10, burn: 1 + speed / 1000, color, reb: 0, shop: false, ...o })
const F = (id, name, rarity, price, tank, color, o = {}) => ({ id, type: 'fuel', name, rarity, price, tank, color, reb: 0, shop: false, ...o })
export const GEAR = [
  // Engines (weakest first: the Index lists them strongest first)
  E('rusty', 'Rusty Motor', 'common', 0, 36, '#8a5a3c', { starter: true, desc: 'Putt... putt...' }),
  E('engine', 'Engine', 'common', 125, 50, '#c9d3e0', { shop: true, desc: 'Go faster' }),
  E('sail', 'Sail Engine', 'common', 400, 60, '#f2f2f2', { shop: true, desc: 'Catch the wind' }),
  E('v8', 'V8 Engine', 'uncommon', 600, 68, '#3b4048'),
  E('seashell', 'Seashell Engine', 'uncommon', 1800, 90, '#e6b9c8', { shop: true, reb: 1, desc: 'The upgrade... then the sea' }),
  E('v12', 'V12 Engine', 'uncommon', 900, 85, '#d63a2f', { shop: true, desc: 'Go very more faster' }),
  E('turbo', 'Turbo Engine', 'rare', 1600, 94, '#6b7380'),
  E('coil', 'Coil Engine', 'rare', 2000, 102, '#e0b13a'),
  E('dome', 'Dome Engine', 'rare', 2400, 110, '#2a2a2e'),
  E('ghostsail', 'Ghost Sail Engine', 'rare', 2800, 120, '#bfe6e0'),
  E('v16', 'V16 Engine', 'rare', 3850, 130, '#5a5f6b', { shop: true, reb: 2, desc: 'Thunders to the next level...' }),
  E('ghost', 'Ghost Engine', 'epic', 4500, 140, '#e8f4ff'),
  E('v18', 'V18 Engine', 'epic', 5500, 150, '#8a8f99'),
  E('coffin', 'Coffin Engine', 'epic', 6500, 160, '#6b4a2b'),
  E('opv8', 'OP V8 Engine', 'legendary', 14000, 170, '#f4c21b', { special: true, desc: 'Overpowered' }),
  E('f140', 'F140 Engine', 'epic', 7500, 172, '#d42a2a', { shop: true, reb: 2, desc: 'Nothing stops this...' }),
  E('cauldron', 'Cauldron Engine', 'epic', 13500, 185, '#7a2fb0', { shop: true, reb: 3, desc: 'Spooky, scary speed...' }),
  E('chain', 'Chain Engine', 'epic', 15000, 196, '#9aa0aa'),
  E('cactus', 'Cactus Engine', 'legendary', 17000, 208, '#3fa83a'),
  E('spirit', 'Spirit Engine', 'legendary', 20000, 220, '#9fd8ff', { shop: true, reb: 4, desc: 'Occupied by spirits...' }),
  E('soulbinder', 'Soulbinder Engine', 'legendary', 24000, 234, '#3a3f6e'),
  E('seashell2', 'SeaShell Engine', 'legendary', 28000, 248, '#c98a5a'),
  E('firerocket', 'Fire Rocket Engine', 'legendary', 32000, 262, '#b8652a'),
  E('cinderlord', 'Cinderlord Engine', 'legendary', 36000, 276, '#e0a020'),
  E('firebarrel', 'Fire Barrel Engine', 'mythic', 40000, 290, '#e07a2a'),
  E('bubblegum', 'BubbleGum Engine', 'mythic', 44000, 305, '#8a5ac8'),
  E('water', 'Water Engine', 'mythic', 48000, 326, '#2a8ae0'),
  E('seaweed', 'Seaweed Engine', 'mythic', 45000, 350, '#9a5ad8', { shop: true, reb: 4, desc: 'Sea the light of speed' }),
  E('hamburger', 'Hamburger Engine', 'mythic', 82500, 380, '#e0a050', { shop: true, reb: 5, desc: 'Fast food, faster cart' }),
  // Fuel sources
  F('jerry', 'Jerry Can', 'common', 0, 11, '#c0392b', { starter: true, desc: 'Half full' }),
  F('smallfuel', 'Small Fuel', 'common', 45, 14, '#e8463a', { shop: true, desc: 'Go longer' }),
  F('bigfuel', 'Big Fuel', 'common', 250, 18, '#f4d81b', { shop: true, desc: 'Go more longer' }),
  F('giantfuel', 'Giant Fuel', 'uncommon', 650, 23, '#d42a2a', { shop: true, desc: 'Go more very longer' }),
  F('tesla', 'Tesla Battery', 'uncommon', 1400, 28, '#f0c040', { shop: true, reb: 1, desc: 'Electric, and loaded' }),
  F('spacetank', 'Space Tank', 'rare', 1900, 32, '#e86060'),
  F('hydrogen', 'Hydrogen Fuel Tank', 'rare', 2350, 36, '#2a2f38', { shop: true, reb: 2, desc: 'Water is cool...' }),
  F('nuclear', 'Nuclear Fuel Tank', 'rare', 5200, 41, '#2ef06a', { shop: true, reb: 2, desc: 'Glows in the dark' }),
  F('frost', 'Frost Fuel', 'epic', 5800, 46, '#6ad0ff'),
  F('rockfuel', 'Rock Fuel', 'epic', 6500, 51, '#7a7f88', { shop: true, reb: 3, desc: 'Rock solid fuel...' }),
  F('flask', 'Flask Fuel', 'epic', 9500, 56, '#d42a3a', { shop: true, reb: 3, desc: 'Shaken, not stirred' }),
  F('cauldronfuel', 'Cauldron Fuel', 'epic', 10500, 61, '#1a1a1e'),
  F('clockwork', 'Clockwork Energy', 'legendary', 11500, 66, '#c87a3a', { shop: true, reb: 4, desc: 'Very tick... tock...' }),
  F('crystal', 'Crystal Energy', 'legendary', 14500, 72, '#e84ad8', { shop: true, reb: 4, desc: 'Shiny crystal power...' }),
  F('fuel67', '67 Fuel', 'legendary', 15500, 78, '#e09a2a'),
  F('coral', 'Coral Fuel', 'legendary', 17000, 84, '#3aa83a', { shop: true, reb: 4, desc: 'Fuel, but greenish, just a perfect combo' }),
  F('starfish', 'Starfish Fuel', 'legendary', 19000, 90, '#c84a3a', { shop: true, reb: 4, desc: 'Fueled by the uniqueness of the sea' }),
  F('cybercontact', 'Cyber Contact Fuel', 'mythic', 30000, 97, '#4a6ad8'),
  F('cyberquadric', 'Cyber Quadric Fuel', 'mythic', 40000, 105, '#3a4ab8'),
  F('fries', 'Fries Fuel', 'mythic', 61000, 120, '#e83a3a', { shop: true, reb: 5, desc: 'Crispy, salty, explosive' }),
  // Wheels
  { id: 'wooden', type: 'wheels', name: 'Wooden Wheels', rarity: 'common', price: 0, starter: true, roll: 0.55, drag: 1, grip: 1, color: '#8b5a2b', reb: 0, desc: 'Bumpy' },
  { id: 'rubber', type: 'wheels', name: 'Rubber Wheels', rarity: 'common', price: 110, shop: true, roll: 0.42, drag: 0.95, grip: 1.2, color: '#2d2d2d', reb: 0, desc: 'Roll smoother' },
  { id: 'sport', type: 'wheels', name: 'Sport Wheels', rarity: 'uncommon', price: 520, shop: true, roll: 0.3, drag: 0.88, grip: 1.5, color: '#e74c3c', reb: 0, desc: 'Grip and go' },
  { id: 'racing', type: 'wheels', name: 'Racing Wheels', rarity: 'rare', price: 2300, shop: true, roll: 0.19, drag: 0.8, grip: 2, color: '#f1c40f', reb: 1, desc: 'Built for the gap' },
  { id: 'hover', type: 'wheels', name: 'Hover Pads', rarity: 'legendary', price: 26000, shop: true, roll: 0.06, drag: 0.66, grip: 2.6, color: '#00d2ff', reb: 3, desc: 'Who needs wheels?' },
  // Boosters (Shift / Space / BOOST button during a ride)
  { id: 'none', type: 'booster', name: 'No Booster', rarity: 'common', price: 0, starter: true, boost: 0, time: 0, charges: 0, color: '#666666', reb: 0 },
  { id: 'firework', type: 'booster', name: 'Firework Rocket', rarity: 'common', price: 260, shop: true, boost: 9, time: 1.3, charges: 1, color: '#ff6b81', reb: 0, desc: 'One big bang' },
  { id: 'nitro', type: 'booster', name: 'Nitro Bottle', rarity: 'rare', price: 1700, shop: true, boost: 14, time: 2, charges: 2, color: '#1e90ff', reb: 0, desc: 'Two shots of speed' },
  { id: 'twinnitro', type: 'booster', name: 'Twin Nitro', rarity: 'epic', price: 7800, shop: true, boost: 19, time: 2.4, charges: 3, color: '#00e5ff', reb: 2, desc: 'Double trouble' },
  { id: 'afterburner', type: 'booster', name: 'Afterburner', rarity: 'mythic', price: 64000, shop: true, boost: 28, time: 3, charges: 4, color: '#ff7b00', reb: 4, desc: 'Light it up' },
]
export const DEFAULT_GEAR = { engine: 'rusty', fuel: 'jerry', wheels: 'wooden', booster: 'none' }
export const GEAR_TYPES = [
  { type: 'engine', name: 'Engine' },
  { type: 'fuel', name: 'Fuel Tank' },
  { type: 'wheels', name: 'Wheels' },
  { type: 'booster', name: 'Booster' },
]
// Carried parts (carry.js): bought engines / fuel tanks go to the hotbar instead of
// straight onto the cart; pick one (tap its slot or press 2-9), carry it to the cart
// and hold E to bolt it on. The part it replaces goes back to the hotbar.
export const CARRY = {
  types: ['engine', 'fuel'],
  slots: 8, // hotbar item slots (keys 2-9)
  hand: { y: 1.0, z: 0.78, scale: 0.85 }, // the part held in front of the chest (player space)
  previewRange: 7, // m from the mount point: the ghost shows on the cart
  attachRange: 3.6, // m from the mount point: hold E to attach
  attachHold: 0.5, // s
}
// The Index window's tabs (stat = the detail panel's line).
export const INDEX_TABS = [
  { type: 'engine', name: 'Engines', stat: 'Speed' },
  { type: 'fuel', name: 'Fuel Sources', stat: 'Fuel' },
]

// Bundles sold on the base display pads (and in the SHOP). Cash only, priced a
// little above the parts bought one by one (they skip the restock wait).
export const BUNDLES = {
  starter: { name: 'Starter Pack', price: 2100, gear: ['v12', 'bigfuel', 'sport', 'firework'] }, // clears the canyon
  v8: { name: 'OP V8 Engine', price: 15500, gear: ['opv8'] },
}

// --- Economy (state.js, ride.js) ---------------------------------------------------
// A run pays floor(distance / Distance Per Currency) x Currency x Currency
// Multiplier (the Cart Upgrades), x the cart / rebirth / pass / event multipliers.
export const ECONOMY = {
  startCash: 250,
  wagonCash: 0.1, // +10% run cash per extra cart
  goldenCash: 0.25, // +25% run cash per Golden Cart (rebirth reward, kept forever)
  wagonPrice: (n) => Math.round(60 * Math.pow(1.45, n)), // price of the (n+1)th extra cart
  maxWagons: 30,
  sellBack: 0.4, // gear sells for 40% of its price
  firstJumpBonus: 1000,
  jumpBonus: 150,
  revivePrice: (runCash) => Math.round(120 + runCash * 1.5),
  reviveCountdown: 6, // s to choose before the run ends
  dailyGift: 250,
  dailyEvery: 24 * 3600, // s
}

// --- Cart Upgrades (the base stall) ----------------------------------------------------
// Bought level by level for Cash (the second button buys UPGRADE_BULK levels at once).
// value(level) is what the row shows; price(level) is the price of the NEXT level.
// kind 'cash' rows feed runPayout; kind 'cart' rows feed cartStats (stat = the mod they set):
// Engine Power multiplies thrust, Fuel Tank the tank, Aerodynamics rolling + air drag.
const pct = (v) => `+${Math.round((v - 1) * 100)}%`
export const UPGRADES = [
  {
    id: 'power',
    kind: 'cart',
    stat: 'power',
    name: 'Engine Power',
    icon: 'bolt',
    max: 25,
    value: (l) => 1 + l * 0.03,
    text: pct,
    price: (l) => Math.round(250 * Math.pow(1.38, l)),
  },
  {
    id: 'tank',
    kind: 'cart',
    stat: 'tankMul',
    name: 'Fuel Tank',
    icon: 'fuel',
    max: 25,
    value: (l) => 1 + l * 0.06,
    text: pct,
    price: (l) => Math.round(200 * Math.pow(1.38, l)),
  },
  {
    id: 'aero',
    kind: 'cart',
    stat: 'aero',
    name: 'Aerodynamics',
    icon: 'aero',
    max: 20,
    value: (l) => 1 - l * 0.015,
    text: (v) => (v >= 1 ? '0%' : `-${+((1 - v) * 100).toFixed(1)}%`),
    price: (l) => Math.round(400 * Math.pow(1.42, l)),
  },
  {
    id: 'dist',
    kind: 'cash',
    name: 'Distance Per Currency',
    icon: 'compass',
    max: 16,
    value: (l) => [10, 9, 8, 7, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.75, 2.5, 2.25, 2, 1.75, 1.5][l],
    text: (v) => String(v),
    price: (l) => Math.round(500 * Math.pow(1.75, l)),
  },
  {
    id: 'mult',
    kind: 'cash',
    name: 'Currency Multiplier',
    icon: 'chart',
    max: 60,
    value: (l) => 1 + l * 0.1,
    text: (v) => `x${+v.toFixed(2)}`,
    price: (l) => Math.round(800 * Math.pow(1.3, l)),
  },
  {
    id: 'cur',
    kind: 'cash',
    name: 'Currency',
    icon: 'cash',
    max: 100,
    value: (l) => 1 + l,
    text: (v) => String(v),
    price: (l) => Math.round(150 * Math.pow(1.55, l)),
  },
]
export const UPGRADE_BULK = 5

// --- Rebirth -------------------------------------------------------------------------------
// Needs `cash` Cash and `carts` carts (the cart + extra carts + Golden Carts). Resets
// cash, gear, extra carts and Cart Upgrades; gives +1 Golden Cart, +cashStep run cash
// and a free `engine`. Skip = rebirth without the carts, for skipMarkup x the cash.
export const REBIRTH = {
  cash: (r) => Math.round(25000 * Math.pow(2.4, r)),
  carts: (r) => 11 + 2 * r,
  cashStep: 0.2,
  engine: 'engine',
  skipMarkup: 1.5,
}

// --- Shop restock (the cave stall) ------------------------------------------------
// Every `every` s the stall restocks: each item is in stock with `chance` and gets
// a random count in `count`. Seeded by the restock number (on the server's clock)
// and the player's own paid restocks, so it is the same after a reload. Restock =
// a fresh roll now, for price(rebirths) Cash.
export const RESTOCK = {
  every: 300,
  price: (r) => 250 * (1 + r),
  odds: {
    common: { chance: 0.95, count: [1, 3] },
    uncommon: { chance: 0.7, count: [1, 2] },
    rare: { chance: 0.5, count: [1, 2] },
    epic: { chance: 0.35, count: [1, 1] },
    legendary: { chance: 0.2, count: [1, 1] },
    mythic: { chance: 0.08, count: [1, 1] },
  },
  always: ['engine', 'smallfuel', 'rubber'], // never sold out at a restock
}
// Instant buy (the pink button): skips the stock, never the rebirth lock.
export const INSTANT_MARKUP = 1.5

// --- Passes (SHOP window), Cash only ------------------------------------------------
export const PASSES = [
  { id: 'cash2', name: '2x Cash', desc: 'Every run pays double, forever.', price: 90000, icon: 'cash' },
  { id: 'fuel', name: 'Fuel Saver', desc: 'Engines burn 25% less fuel.', price: 22000, icon: 'fuel' },
  { id: 'lucky', name: 'Lucky Wheel', desc: 'A free spin every 8 min.', price: 15000, icon: 'wheel' },
  { id: 'trader', name: 'Trader', desc: 'Gear sells back for 70%.', price: 12000, icon: 'tag' },
]

// --- Lucky wheel (cave + HUD) --------------------------------------------------------
export const WHEEL = {
  every: 15 * 60, // s per free spin
  luckyEvery: 8 * 60, // with the Lucky Wheel pass
  spinTime: 5.2,
  turns: 6,
  // Clockwise from the pointer. weight = relative chance.
  prizes: [
    { kind: 'cash', amount: 75, label: '$75', color: '#e8336b', weight: 24 },
    { kind: 'cash', amount: 200, label: '$200', color: '#8e3bd9', weight: 18 },
    { kind: 'fuel', label: '+50% FUEL', color: '#1f4fd6', weight: 14 },
    { kind: 'cash', amount: 500, label: '$500', color: '#1fae4b', weight: 12 },
    { kind: 'boost', label: '2x CASH', color: '#f08a1a', weight: 12 },
    { kind: 'cash', amount: 1200, label: '$1,200', color: '#156e2e', weight: 7 },
    { kind: 'gear', label: 'RARE GEAR', color: '#e7c51c', weight: 8 },
    { kind: 'cash', amount: 3000, label: '$3,000', color: '#c92222', weight: 5 },
  ],
  boostTime: 300, // s of 2x cash from the wheel
}

// --- World events (events.js) ---------------------------------------------------------
// Wall-clock cycle: `calm` s of normal weather, then one event for `length` s.
export const EVENTS = {
  calm: 570,
  length: 150,
  list: [
    { id: 'storm', name: 'Thunderstorm', cash: 1.5, speed: 1, desc: 'x1.5 Cash' },
    { id: 'tailwind', name: 'Tailwind', cash: 1, speed: 1.15, desc: '+15% top speed' },
    { id: 'goldrush', name: 'Gold Rush', cash: 2, speed: 1, desc: 'x2 Cash' },
  ],
}

// --- Quests (quests.js, the QUESTS window) ------------------------------------------------
// Daily and Weekly: each period (UTC day / UTC week from Monday) the server picks
// `count` quests from the pool (backend src/quests.ts holds the same ids; the client
// falls back to its own pick without a server). stat: the per-period counter that
// fills it (playtime s, cash earned, distance m, rides, jumps, gear, upgrades, spins,
// boosts, invites). A finished quest pays its reward and `stars` at once. SKIP
// finishes one for skipMarkup x its reward; REFRESH QUESTS re-rolls the unfinished
// ones of that tab for refreshPrice(rebirths). Cash only.
export const QUESTS = {
  count: 5,
  skipMarkup: 1.5,
  daily: {
    stars: 20,
    refreshPrice: (r) => 750 * (1 + r),
    pool: [
      { id: 'warmup', name: 'Warm Up', stat: 'playtime', goal: 1200, reward: 333 },
      { id: 'steady', name: 'Steady Rider', stat: 'playtime', goal: 2400, reward: 666 },
      { id: 'champion', name: 'Daily Champion', stat: 'playtime', goal: 3600, reward: 2000 },
      { id: 'collector', name: 'Cash Collector', stat: 'cash', goal: 2500, reward: 600 },
      { id: 'walker', name: 'Rail Walker', stat: 'distance', goal: 7000, reward: 200 },
      { id: 'rider', name: 'Frequent Rider', stat: 'rides', goal: 15, reward: 400 },
      { id: 'hopper', name: 'Canyon Hopper', stat: 'jumps', goal: 3, reward: 1200 },
      { id: 'shopper', name: 'Gear Shopper', stat: 'gear', goal: 5, reward: 350 },
      { id: 'mechanic', name: 'Mechanic', stat: 'upgrades', goal: 5, reward: 500 },
      { id: 'booster', name: 'Boost Junkie', stat: 'boosts', goal: 10, reward: 300 },
      { id: 'lucky', name: 'Feeling Lucky', stat: 'spins', goal: 1, reward: 250 },
    ],
  },
  weekly: {
    stars: 100,
    refreshPrice: (r) => 5000 * (1 + r),
    pool: [
      { id: 'warrior', name: 'Weekend Warrior', stat: 'playtime', goal: 18000, reward: 10000 },
      { id: 'community', name: 'Community Builder', stat: 'invites', goal: 2, reward: 2000 },
      { id: 'grinder', name: 'Endless Grinder', stat: 'playtime', goal: 72000, reward: 40000 },
      { id: 'weeklychamp', name: 'Weekly Champion', stat: 'playtime', goal: 54000, reward: 30000 },
      { id: 'explorer', name: 'World Explorer', stat: 'distance', goal: 100000, reward: 5000 },
      { id: 'earner', name: 'Big Earner', stat: 'cash', goal: 100000, reward: 15000 },
      { id: 'gapmaster', name: 'Gap Master', stat: 'jumps', goal: 25, reward: 8000 },
      { id: 'regular', name: 'Rail Regular', stat: 'rides', goal: 150, reward: 6000 },
    ],
  },
}
// How each stat reads on a quest row: "38m 6s / 1hr 0s of Play Time".
export const QUEST_STATS = {
  playtime: 'of Play Time',
  cash: 'Cash Earned',
  distance: 'Studs Traveled',
  rides: 'Rides',
  jumps: 'Canyon Jumps',
  gear: 'Gear Bought',
  upgrades: 'Cart Upgrades',
  boosts: 'Boosts Fired',
  spins: 'Wheel Spins',
  invites: 'Friends Invited',
}
// Star levels (the track on the right of the QUESTS window). Level n+1 needs
// stars[n] stars in total; reaching it pays its reward at once (cash, `slot` =
// unlocks the next quest Save Slot, `dice` = Mystery Dice). Past the list each
// `after` more stars is another level paying the last reward.
export const QUEST_LEVELS = {
  stars: [0, 100, 250, 450, 700, 1000, 1400, 1900],
  rewards: [
    null,
    { cash: 1000, slot: 1, dice: 1 },
    { cash: 1500, slot: 1, dice: 1 },
    { cash: 2500, slot: 1, dice: 1 },
    { cash: 4000, slot: 1, dice: 1 },
    { cash: 6000, slot: 1, dice: 1 },
    { cash: 8000, dice: 2 },
    { cash: 10000, dice: 2 },
  ],
  after: 600,
}
// Mystery Dice: one random gear that the Shop does not sell (or anything up to epic).
export const DICE = { pool: (g) => !g.starter && !g.special && (!g.shop || ['common', 'uncommon', 'rare', 'epic'].includes(g.rarity)) && (g.type === 'engine' || g.type === 'fuel') }

// --- Save Slots (SAVES window) --------------------------------------------------------------
// Each slot keeps one cart setup (engine, fuel, wheels, booster). `free` slots are
// open from the start; the next `quest` slots open with a quest level (or Cash);
// the rest only for Cash. Cash only (the reference's premium prices became these).
export const SAVE_SLOTS = {
  total: 10,
  free: 2,
  quest: 5,
  questPrice: 5000,
  cashPrice: 15000,
}

// --- Server (net.js, ../Build-a-cart-backend) -------------------------------------------------
// Dev talks to a local `npm start` backend; production asks the Bloxity matchmaker
// for an endpoint (bloxity.resolveServerEndpoint).
export const SERVER_URL = import.meta.env?.DEV ? import.meta.env.VITE_SERVER_URL_DEV || 'ws://localhost:2567' : ''
export const NET = {
  saveEvery: 5, // s between saves while something changed
  retry: 3, // s before the first reconnect attempt (doubles each failure)
  retryMax: 60,
  rejoin: 2, // s after a dropped room before rejoining
  requestTimeout: 8, // s a request (quest re-roll) waits for its answer
  localSave: 'build-a-cart.save.v2', // guests and serverless play keep their save in this browser
  poseEvery: 0.1, // s between foot poses sent while walking (and changed)
  cartEvery: 0.05, // s between cart states sent while riding
  heartbeat: 1, // s between repeats of an unchanged pose, so late joiners see it
  remoteLerp: 14, // 1/s: how fast a remote walker / cart eases to the latest state
  remoteFade: 420, // m: remote walkers / parked carts further than this are hidden
  nameTagHeight: 3.6, // m above a remote's feet
  adCooldown: 65, // s between rewarded ads the server accepts (backend AD_COOLDOWN_MS is 60 s)
}

// --- Multiplayer room (net.js, remote.js; backend ROOM_MAX_CLIENTS) --------------------------------
// One room seats 5 players, one per base. Each client sees ITSELF on the home (middle) base; the
// other players are put on the four remaining bases, nearest first, and keep that base while they
// stay in the room. Past TRACK.merge every cart rides the one shared line.
export const MULTI = {
  maxPlayers: 5, // = the backend's ROOM_MAX_CLIENTS (and the Bloxity maxPartySize)
  basePrefs: [1, 3, 0, 4], // base indexes (BASES.xs) the other players take, in order
  wagonDraw: 12, // most trailing carts drawn behind a remote lead cart
  smokeRange: 90, // m: remote exhaust / flames / sparks are only spawned this close to the camera
  bubbleSeconds: 4, // chat bubble lifetime (SDK chat.bubbleSeconds)
}

// --- Bloxity platform features (bloxity.js) ----------------------------------------------------
// Hosted leaderboards: ids are permanent and MUST match the backend's PLATFORM_BOARDS
// (src/constants.ts); the server reports each signed-in player's scores, define() below only
// declares them so the portal's trophy button shows them.
export const LEADERBOARDS = [
  { id: 'best', label: 'Best Distance (m)', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'earned', label: 'Total Earned', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'playtime', label: 'Play Time (min)', order: 'desc', mode: 'latest', format: 'number', reset: 'none' },
]
// Screen ads: declared once; gameplay banners stay off (never over the ride).
export const AD_SCREENS = { menu: {}, results: {}, gameplay: {} }
// Rewarded ads (ads.showRewarded). Placement names: lowercase letters, digits and hyphens. Nothing is
// ever sold for Gems; watching an ad only gives these small perks.
export const ADS = {
  revive: { placement: 'revive', label: 'FREE REVIVE', hint: 'Watch an ad' },
  boost: { placement: 'cash-boost', label: 'x2 CASH', hint: '2x cash for 10 min', seconds: 600 },
}

// --- Audio (audio/) --------------------------------------------------------------------------
export const AUDIO = {
  volume: 0.8,
  storageKey: 'build-a-cart.sound',
  buses: { ui: 0.8, sfx: 0.9, amb: 0.5, engine: 0.55 },
  duck: 0.45,
  maxVoices: 48,
  maxVoicesTouch: 24,
  latency: 0.04,
  latencyTouch: 0.07,
  lead: 0.02,
  reverb: { seconds: 1.8, preDelay: 0.012, early: [[19, 0.5], [31, 0.35], [47, 0.28], [73, 0.2], [97, 0.12]], decay: 1.4, tail: 0.18, darken: 1.6, send: 0.9 },
}
