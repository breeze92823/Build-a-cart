// Cart physics along the rails, pure (no three.js): the ride (ride.js) steps it
// at the physics rate, and it can be simulated outside the browser to balance
// the gear. The track is one height profile h(s) over s = metres along the
// rails (TRACK in config). On the rails the cart is a 1D body: engine thrust
// while fuel lasts, booster bursts, rolling resistance, air drag (v^2, sets
// the top speed), brakes and gravity along the slope. Past the broken bridge's
// lip it flies as a projectile in (s, y) and either lands on the far deck or
// hits the canyon (cliff face or spikes).
import { BASES, BASE_DRAG, BRAKE, CART, LEAN, SURFACES, TRACK } from './config.js'

const T = TRACK
const smooth = (u) => u * u * (3 - 2 * u)
const D = T.valleyDrop
// Absolute heights (world y; the base plateaus are y = 0, the valley floor -D).
export const VALLEY_Y = -D
export const LIP_Y = T.lipHeight - D
export const LAND_Y = T.landHeight - D
export const FLOOR_Y = T.canyonFloor - D

// The gaps the cart jumps: the canyon (its ramp/deck are special-cased in profile) and
// the Glacier Gap on the key-point chain. lipY / landY / floorY are world y.
const GL = T.glacier
export const GAPS = [
  { lip: T.lipS, end: T.gapEnd, lipY: T.lipHeight - D, landY: T.landHeight - D, floorY: T.canyonFloor - D, kind: 'spikes', name: 'canyon' },
]
// Rail height (world y) at s. In the gap there is no rail.
export function trackHeight(s) {
  if (s <= T.dropStart) return 0
  if (s < T.dropEnd) return -D * smooth((s - T.dropStart) / (T.dropEnd - T.dropStart))
  return profile(s) - D
}
export function trackSlope(s) {
  if (s <= T.dropStart) return 0
  if (s < T.dropEnd) {
    const L = T.dropEnd - T.dropStart
    const u = (s - T.dropStart) / L
    return (-D * 6 * u * (1 - u)) / L
  }
  return profileSlope(s)
}

// The valley part of the profile, relative to the valley floor.
function profile(s) {
  if (s < T.rampStart) return 0
  if (s <= T.lipS) {
    const u = (s - T.rampStart) / (T.lipS - T.rampStart)
    return T.lipHeight * u * u
  }
  if (s < T.gapEnd) return T.canyonFloor
  if (s <= T.landFlat) return T.landHeight
  if (s < T.landEnd) return T.landHeight * (1 - smooth((s - T.landFlat) / (T.landEnd - T.landFlat)))
  if (s > GL.lip && s < GL.end) return glacierFloor
  return hill(s, 0)
}

// The key-point chain past the far deck (TRACK.hills): d = 0 height, 1 slope, 2 curvature.
const HK = T.hills
function hill(s, d) {
  if (s <= HK[0][0] || s >= HK[HK.length - 1][0]) return d ? 0 : s <= HK[0][0] ? HK[0][1] : HK[HK.length - 1][1]
  let lo = 0
  let hi = HK.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (HK[mid][0] <= s) lo = mid
    else hi = mid
  }
  const [s0, h0] = HK[lo]
  const [s1, h1] = HK[hi]
  const L = s1 - s0
  const u = (s - s0) / L
  const dh = h1 - h0
  if (d === 0) return h0 + dh * smooth(u)
  if (d === 1) return (dh * 6 * u * (1 - u)) / L
  return (dh * 6 * (1 - 2 * u)) / (L * L)
}
// Curvature of the rails (d2h/ds2) past the far deck; 0 before it (no airtime there).
export function trackCurve(s) {
  return s >= T.landEnd ? hill(s, 2) : 0
}

function profileSlope(s) {
  if (s < T.rampStart) return 0
  if (s <= T.lipS) {
    const L = T.lipS - T.rampStart
    return (2 * T.lipHeight * (s - T.rampStart)) / (L * L)
  }
  if (s < T.gapEnd) return 0
  if (s <= T.landFlat) return 0
  if (s > GL.lip && s < GL.end) return 0
  if (s >= T.landEnd) return hill(s, 1)
  const L = T.landEnd - T.landFlat
  const u = (s - T.landFlat) / L
  return (-T.landHeight * 6 * u * (1 - u)) / L
}

// The Glacier Gap: its lip and far side come off the key-point chain, its floor `depth` below the lip.
const glacierLipH = hill(GL.lip, 0)
const glacierFloor = glacierLipH - GL.depth
GAPS.push({ lip: GL.lip, end: GL.end, lipY: glacierLipH - D, landY: hill(GL.end, 0) - D, floorY: glacierFloor - D, kind: 'crevasse', name: 'glacier' })
export const hasRail = (s) => GAPS.every((g) => s <= g.lip || s >= g.end)
export const gapAt = (s) => GAPS.find((g) => s > g.lip - 0.5 && s < g.end + 0.5) ?? null

// --- Bends: every track shifts sideways by trackX(s) (TRACK.bends) -----------------------
// d = 0 offset (m, +X), 1 slope dx/ds, 2 curvature d2x/ds2 (+ = bending towards +X, right).
function bend(s, d) {
  let out = 0
  for (const [s0, s1, dx] of T.bends) {
    if (s <= s0) {
      continue
    }
    if (s >= s1) {
      if (d === 0) out += dx
      continue
    }
    const L = s1 - s0
    const u = (s - s0) / L
    out += d === 0 ? dx * smooth(u) : d === 1 ? (dx * 6 * u * (1 - u)) / L : (dx * 6 * (1 - 2 * u)) / (L * L)
  }
  return out
}
export const trackX = (s) => bend(s, 0)
export const trackXSlope = (s) => bend(s, 1)
export const trackXCurve = (s) => bend(s, 2)
// Yaw of the rails at s (rotation.y for a model facing -Z).
export const trackYaw = (s) => -Math.atan(bend(s, 1))

// --- The path: where the (home / shared) line is in the world ---------------------------------
// Up to TRACK.join the line runs north (z = BASES.cartZ - s) with the sideways bends;
// past it, it is the 2D path built from TRACK.path (turns ease in and out), sampled
// every PATH_STEP m: x, z, yaw (rotation.y for a model facing -Z) and lateral
// curvature (+ = turning right, towards +X when heading -Z).
const JOIN = T.join
const PATH_STEP = 0.5
const PN = Math.ceil((T.length + 40 - JOIN) / PATH_STEP) + 2
const PX = new Float32Array(PN)
const PZ = new Float32Array(PN)
const PY = new Float32Array(PN)
const PK = new Float32Array(PN)
// Turns past the join: { s0, s1, deg } (for corner signs, grades and the auto driver).
export const TURNS = []
{
  let x = bend(JOIN, 0)
  let z = BASES.cartZ - JOIN
  let yaw = -Math.atan(bend(JOIN, 1))
  let sAt = JOIN
  // Curvature at s (from the segment list).
  const segs = []
  for (const seg of T.path) {
    const len = seg[0] === 'S' ? seg[1] : seg[2]
    const k0 = seg[0] === 'S' ? 0 : ((2 * seg[1] * Math.PI) / 180) / len // peak of the sin^2 profile
    segs.push({ s0: sAt, s1: sAt + len, k0 })
    if (seg[0] === 'T') TURNS.push({ s0: sAt, s1: sAt + len, deg: seg[1] })
    sAt += len
  }
  const curveAt = (s) => {
    for (const g of segs) if (s >= g.s0 && s < g.s1) return g.k0 ? g.k0 * Math.sin((Math.PI * (s - g.s0)) / (g.s1 - g.s0)) ** 2 : 0
    return 0
  }
  for (let i = 0; i < PN; i++) {
    const s = JOIN + i * PATH_STEP
    const k = curveAt(s)
    PX[i] = x
    PZ[i] = z
    PY[i] = yaw
    PK[i] = k
    // Integrate half a step at a time (midpoint) so long turns close up accurately.
    const kMid = curveAt(s + PATH_STEP / 2)
    const yMid = yaw - kMid * (PATH_STEP / 2)
    x += -Math.sin(yMid) * PATH_STEP
    z += -Math.cos(yMid) * PATH_STEP
    yaw -= kMid * PATH_STEP
  }
}
function pathSample(arr, s) {
  const f = Math.max(0, Math.min(PN - 1.001, (s - JOIN) / PATH_STEP))
  const i = Math.floor(f)
  const t = f - i
  return arr[i] + (arr[i + 1] - arr[i]) * t
}
// x (relative to the home base) and world z of the line at s.
export const pathX = (s) => (s <= JOIN ? bend(s, 0) : pathSample(PX, s))
export const pathZ = (s) => (s <= JOIN ? BASES.cartZ - s : pathSample(PZ, s))
export const pathYaw = (s) => (s <= JOIN ? -Math.atan(bend(s, 1)) : pathSample(PY, s))
// Sideways curvature of the line (+ right): the bends, then the path's turns.
export const turnCurve = (s) => (s <= JOIN ? bend(s, 2) : pathSample(PK, s))
// A point `side` m to the right of the line at s (and `up` above the rails' height): out = { x, y, z }.
export function pathPoint(s, side, out, homeX = 0) {
  const yaw = pathYaw(s)
  out.x = homeX + pathX(s) + Math.cos(yaw) * side
  out.z = pathZ(s) - Math.sin(yaw) * side
  out.y = trackHeight(s)
  return out
}
export const PATH_JOIN = JOIN

// --- Merge: the side bases' tracks join the home track (TRACK.merge) -------------------------
// Share of a side track's sideways offset from the home track still left at s:
// 1 at the bases, easing to 0 where the tracks have joined. d = 1 gives d/ds.
export function mergeK(s, d = 0) {
  const { s0, s1 } = T.merge
  if (s <= s0) return d ? 0 : 1
  if (s >= s1) return 0
  const u = (s - s0) / (s1 - s0)
  return d ? (-6 * u * (1 - u)) / (s1 - s0) : 1 - smooth(u)
}
// x of the track that starts at base x0 (home track at homeX) at s, bends included.
export const laneX = (x0, homeX, s) => homeX + (x0 - homeX) * mergeK(s) + pathX(s)
// dx/ds of that track.
export const laneXSlope = (x0, homeX, s) => (x0 - homeX) * mergeK(s, 1) + trackXSlope(s)
// Every corner on the line: [s0, s1, deg] (valley bends have no deg).
export const CORNERS = [...T.bends.map(([s0, s1]) => ({ s0, s1, deg: 0 })), ...TURNS]
// Which corner [index into CORNERS] s is in (or -1).
export function bendAt(s) {
  for (let i = 0; i < CORNERS.length; i++) if (s > CORNERS[i].s0 && s < CORNERS[i].s1) return i
  return -1
}
// Surface modifiers at s ({ grip, roll, burn, kind } or null).
export function surfaceAt(s) {
  for (const f of SURFACES) if (s >= f.s0 && s < f.s1) return f
  return null
}
// Push into the lean (in LEAN.accel units) at speed v on s.
export const leanDemand = (s, v) => (v * v * turnCurve(s)) / LEAN.accel
// The fastest a cart with this grip takes the corner at s steady when leaning fully (m/s).
export function safeSpeed(s, grip) {
  const k = Math.abs(turnCurve(s))
  const g = grip * (surfaceAt(s)?.grip ?? 1)
  return k < 1e-6 ? Infinity : Math.sqrt(((1 + g * LEAN.green) * LEAN.accel) / k)
}
// The slowest safe speed in [s, s + ahead] for this grip (the auto driver brakes for it).
function minSafeAhead(s, ahead, grip) {
  let v = Infinity
  for (let x = s; x <= s + ahead; x += 3) v = Math.min(v, safeSpeed(x, grip))
  return v
}
// True if a corner starts within [s - back, s + ahead] (no airtime there: the flanges hold the cart).
export function cornerNear(s, back = 5, ahead = 60) {
  for (const c of CORNERS) if (c.s1 > s - back && c.s0 < s + ahead) return true
  return false
}
// The chain lift at s (or null).
export const liftAt = (s) => T.lifts.find((l) => s >= l.s0 && s <= l.s1) ?? null
export const onLift = (s) => !!liftAt(s)

// Effective stats from the equipped gear (GEAR entries), extra carts and modifiers.
// mods: { fuelSaver, fuelBonus (x tank), speed (event top-speed factor),
//         power (x thrust), tankMul (x tank), aero (x rolling resistance and air drag) }
// power / tankMul / aero come from the performance Cart Upgrades. Every extra cart
// is a fuel wagon: it adds CART.wagonFuel of tank and weighs CART.wagonMass of thrust.
export function cartStats(gear, wagons = 0, mods = {}) {
  const speed = mods.speed ?? 1
  const aero = mods.aero ?? 1
  return {
    accel: (gear.engine.accel * (mods.power ?? 1)) / (1 + wagons * CART.wagonMass),
    burn: gear.engine.burn * (mods.fuelSaver ? 0.75 : 1),
    tank: gear.fuel.tank * (mods.fuelBonus ?? 1) * (mods.tankMul ?? 1) * (1 + wagons * CART.wagonFuel),
    roll: gear.wheels.roll * aero,
    drag: (BASE_DRAG * gear.wheels.drag * aero) / (speed * speed),
    boost: gear.booster.boost,
    boostTime: gear.booster.time,
    charges: gear.booster.charges,
    grip: (gear.wheels.grip ?? 1) * (mods.grip ?? 1),
    // The furthest the rails go for this cart: the end of the line, or the shut
    // Golden Gate (mods.gateShut) without the rebirths to open it.
    limit: mods.gateShut ? T.gate.s - 2 : T.length,
  }
}

export function topSpeed(st) {
  return Math.sqrt(Math.max(0, st.accel - st.roll) / st.drag)
}

export function newCart(st, s = 0) {
  return {
    s,
    v: 0,
    y: trackHeight(s),
    vx: 0, // in the air: horizontal speed
    vy: 0, // in the air: vertical speed
    air: false,
    fuel: st.tank,
    boostLeft: 0,
    charges: st.charges,
    maxS: s,
    stoppedFor: 0,
    crashed: null, // 'spikes'
    hitWall: false,
    jumped: false, // landed on the far side this run
    pitch: 0, // radians, nose up +
    throttle: 0,
    hop: false, // in the air off a crest (not the canyon jump)
    airTime: 0,
    airPeak: 0, // m above the rails at the highest point of this flight
    arrived: false, // stopped at Golden Station, the end of the line
    lean: 0, // -1 (left, A) .. 1 (right, D): how far the rider leans
    tip: 0, // see LEAN: 0 steady, |1| = on the edge of coming off
    danger: 0, // s spent past |tip| 1
    lifted: false, // the chain lift has caught the cart this run
    heat: 0, // brake heat 0..1+ (BRAKE); faded: the brakes are cooked until it cools
    faded: false,
    gap: null, // the gap being jumped (GAPS entry) while flying one
  }
}

// Fires a booster charge; false if none left or one is burning.
export function fireBoost(c, st) {
  if (c.crashed || c.charges <= 0 || c.boostLeft > 0 || st.boost <= 0) return false
  c.charges--
  c.boostLeft = st.boostTime
  return true
}

// One fixed step. input: { throttle 0..1, brake 0..1, lean -1..1, side (extra sideways
// push, LEAN units: wind) }. Without `lean` (headless sims) the cart leans perfectly
// and brakes for the bends by itself. Returns the events of this step as a short
// array of strings (empty most of the time): 'fuelOut', 'launch', 'land', 'crash',
// 'bufferStop', 'stopped', 'hop' (left the rails over a crest), 'touchdown' (back
// on them), 'arrived' (Golden Station), 'lift' (the chain lift caught the cart),
// 'derail' (came off in a bend: c.crashed = 'derail').
export function stepCart(c, input, st, dt, events = []) {
  events.length = 0
  if (c.crashed) return events
  const auto = input.lean === undefined
  if (auto && !c.air && c.v > 5) {
    // Brake ahead of a corner to the speed it takes steady.
    const vs = minSafeAhead(c.s, 25 + (c.v * c.v) / (2 * CART.brake), st.grip)
    if (c.v > LEAN.autoMargin * vs) {
      input = { ...input, throttle: 0, brake: 1 }
      c.boostLeft = 0 // a booster burning into a bend: the sim driver lets go of it
    }
  }
  const surf = surfaceAt(c.s)
  // Brake heat (riders only: the sim driver brakes perfectly anyway).
  let brakeIn = input.brake
  if (!auto) {
    c.heat = Math.max(0, c.heat + (brakeIn > 0.05 && Math.abs(c.v) > 1 ? BRAKE.heat * brakeIn : -BRAKE.cool) * dt)
    if (c.heat >= 1 && !c.faded) {
      c.faded = true
      events.push('brakeFade')
    }
    if (c.faded && c.heat < BRAKE.recover) c.faded = false
    if (c.faded) brakeIn *= BRAKE.fade
  }
  const g = CART.gravity
  let thrust = 0
  // The Diamond Terminus: the platform's brakes take over and stop the cart at the buffers.
  const end = st.limit ?? T.length
  const station = !c.air && c.s >= T.terminus && end >= T.length
  const throttle = c.fuel > 0 && !station ? input.throttle : 0
  c.throttle = throttle
  if (throttle > 0) {
    thrust += st.accel * throttle
    c.fuel -= dt * throttle * st.burn * (surf?.burn ?? 1)
    if (c.fuel <= 0) {
      c.fuel = 0
      events.push('fuelOut')
    }
  }
  if (station) c.boostLeft = 0
  if (c.boostLeft > 0) {
    thrust += st.boost
    c.boostLeft = Math.max(0, c.boostLeft - dt)
  }

  if (!c.air) {
    const slope = trackSlope(c.s)
    const cos = 1 / Math.sqrt(1 + slope * slope)
    const sin = slope * cos
    let a = thrust - g * sin
    const stationBrake = station && c.v > 0 ? (c.v * c.v) / (2 * Math.max(0.5, T.length - 0.8 - c.s)) : 0
    // Brakes bite harder the faster the cart goes (air brakes), so a fast cart can always slow for a corner.
    const resist = st.roll * (surf?.roll ?? 1) + st.drag * c.v * c.v + CART.brake * brakeIn * (1 + Math.abs(c.v) / CART.brakeSpeed) + stationBrake
    if (c.v > 0.02) a -= resist
    else if (c.v < -0.02) a += resist
    else if (Math.abs(a) <= resist) {
      a = 0
      c.v = 0
    }
    c.v += a * dt
    // A chain lift: the chain dogs catch the cart and haul it up at a walk.
    const lift = liftAt(c.s)
    c.chain = !!lift && c.v <= lift.speed + 0.01
    if (c.chain) {
      c.v = lift.speed
      if (!c.lifted) {
        c.lifted = true
        events.push('lift')
      }
    }
    const before = c.s
    c.s += c.v * cos * dt
    c.pitch = Math.atan(slope)

    if (c.s < 0) {
      // Rolled back into the buffer stop at the base.
      c.s = 0
      c.v = 0
    }
    let launched = null
    for (const gp of GAPS) {
      if (before >= gp.end && c.s < gp.end + 0.3) {
        // Rolled back to the broken end of the far deck: stop there. (Only from the far
        // side: a cart crossing the near lip must launch below, not land on the deck.)
        c.s = gp.end + 0.3
        c.v = 0
      }
      if (before <= gp.lip && c.s > gp.lip) launched = gp
    }
    if (c.s >= end) {
      c.s = end
      if (c.v > 1) events.push('bufferStop')
      c.v = 0
    }
    if (launched) {
      // Off the lip: fly.
      const lipSlope = trackSlope(launched.lip - 0.01)
      const lc = 1 / Math.sqrt(1 + lipSlope * lipSlope)
      c.vx = c.v * lc
      c.vy = c.v * lipSlope * lc
      c.y = launched.lipY
      c.air = true
      c.gap = launched
      c.airTime = 0
      c.airPeak = 0
      events.push('launch')
    } else {
      c.y = trackHeight(c.s)
      // Bends: lean against the push; past the wheels' grip the cart tips, then derails.
      const demand = leanDemand(c.s, c.v) + (input.side ?? 0)
      const want = auto ? Math.max(-1, Math.min(1, demand)) : Math.max(-1, Math.min(1, input.lean))
      c.lean += (want - c.lean) * Math.min(1, dt * LEAN.rate)
      c.tip = (demand - c.lean) / (st.grip * (surf?.grip ?? 1))
      // The further past the edge, the sooner it goes (a flick through at 3x the push is no escape).
      if (Math.abs(c.tip) > 1) c.danger += dt * Math.abs(c.tip)
      else c.danger = Math.max(0, c.danger - dt * 2)
      if (c.danger >= LEAN.derailTime) {
        c.crashed = 'derail'
        c.v = 0
        events.push('derail')
        return events
      }
      // Over a crest: if the rails curve away faster than gravity can pull the
      // cart round, it leaves them (airtime) and flies until it meets them again.
      const k = trackCurve(c.s)
      // (No airtime near a corner, nor on the run down from the Glacier Gap into the terminus.)
      if (k < 0 && c.v > 0 && c.s > T.landEnd && hasRail(c.s + 2) && !cornerNear(c.s) && !(c.s > GL.end - 5)) {
        const sl = trackSlope(c.s)
        const q = 1 + sl * sl
        const pull = g / Math.sqrt(q) + (c.v * c.v * k) / (q * Math.sqrt(q))
        if (pull < CART.hopFrom) {
          const lc = 1 / Math.sqrt(q)
          c.vx = c.v * lc
          c.vy = c.v * sl * lc
          c.air = true
          c.hop = true
          c.airTime = 0
          c.airPeak = 0
          events.push('hop')
        }
      }
    }
  } else {
    c.airTime += dt
    c.lean *= 1 - Math.min(1, dt * 2)
    c.tip = 0
    c.danger = 0
    c.chain = false
    c.airPeak = Math.max(c.airPeak, c.y - trackHeight(c.s))
    const prevS = c.s
    // Hops keep the rail drag (low air drag would make bouncing over crests a speed trick).
    // Over the canyon the engine still helps a little; over the Glacier Gap the jump is pure ballistics.
    const airPush = c.hop ? 1 : c.gap && c.gap !== GAPS[0] ? 0 : 0.6
    c.vx += c.hop ? (thrust - st.drag * c.vx * c.vx) * dt : (thrust * airPush - CART.airDrag * c.vx * c.vx) * dt
    const vy0 = c.vy
    c.vy -= g * dt
    c.s += c.vx * dt
    // Hops integrate the drop exactly (a grazing hop would otherwise land at once);
    // the canyon jump keeps the integration it was balanced with.
    c.y += (c.hop ? (vy0 + c.vy) / 2 : c.vy) * dt
    c.pitch = Math.atan2(c.vy, Math.max(1, c.vx)) * 0.8
    const gp = c.hop ? null : c.gap ?? GAPS[0]
    if (!gp || c.s >= gp.end) {
      const ground = trackHeight(c.s)
      if (gp && prevS < gp.end && c.y < gp.landY - 0.7) {
        // Slammed into the far cliff: bounce off it and fall to the bottom.
        c.s = gp.end - 0.6
        c.vx = -Math.abs(c.vx) * 0.15
        c.vy = Math.min(c.vy, 2)
        c.hitWall = true
        events.push('wallHit')
      } else if (c.y <= ground) {
        const slope = trackSlope(c.s)
        const cos = 1 / Math.sqrt(1 + slope * slope)
        // A flight too short to notice (grazing a crest) costs nothing.
        const keep = c.hop ? (c.airTime < 0.3 ? 1 : CART.hopKeep) : CART.landKeep
        c.v = Math.max(0, (c.vx + c.vy * slope) * cos) * keep
        c.y = ground
        c.air = false
        if (c.hop) {
          c.hop = false
          events.push('touchdown')
        } else {
          if (gp === GAPS[0]) c.jumped = true
          events.push('land')
        }
      }
      if (c.s >= end) {
        c.s = end
        c.vx = Math.min(c.vx, 0)
      }
    } else if (c.s < gp.lip - 0.5 && c.y < gp.lipY - 0.5 && c.vx < 0) {
      // Bounced back into the near wall: just drop.
      c.s = gp.lip + 0.2
      c.vx = 0
    } else if (c.y <= gp.floorY + 1.2) {
      c.y = gp.floorY + 1.2
      c.crashed = gp.kind
      events.push('crash')
    }
  }

  c.maxS = Math.max(c.maxS, c.s)
  if (station && !c.arrived && c.v < CART.stopSpeed) {
    c.arrived = true
    c.v = 0
    events.push('arrived')
  }

  // Out of fuel and standing still (where gravity can't move it), or rolling back
  // down a climb it couldn't make: the run is over.
  const idle = !c.air && !c.crashed && c.fuel <= 0 && c.boostLeft <= 0 && !c.chain && !c.held
  const stuck = idle && Math.abs(c.v) < CART.stopSpeed && Math.abs(g * trackSlope(c.s)) <= st.roll + 0.3
  if (stuck || (idle && c.v < -0.5 && c.s < c.maxS - CART.rollbackEnd)) {
    c.stoppedFor += dt
    if (c.stoppedFor >= (stuck ? CART.stopTime : 0.4)) {
      events.push('stopped')
      c.stoppedFor = -1e9
    }
  } else c.stoppedFor = 0
  return events
}
