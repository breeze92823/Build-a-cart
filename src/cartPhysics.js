// Cart physics along the rails, pure (no three.js): the ride (ride.js) steps it
// at the physics rate, and it can be simulated outside the browser to balance
// the gear. The track is one height profile h(s) over s = metres along the
// rails (TRACK in config). On the rails the cart is a 1D body: engine thrust
// while fuel lasts, booster bursts, rolling resistance, air drag (v^2, sets
// the top speed), brakes and gravity along the slope. Past the broken bridge's
// lip it flies as a projectile in (s, y) and either lands on the far deck or
// hits the canyon (cliff face or spikes).
import { BASE_DRAG, CART, LEAN, TRACK } from './config.js'

const T = TRACK
const smooth = (u) => u * u * (3 - 2 * u)
const D = T.valleyDrop
// Absolute heights (world y; the base plateaus are y = 0, the valley floor -D).
export const VALLEY_Y = -D
export const LIP_Y = T.lipHeight - D
export const LAND_Y = T.landHeight - D
export const FLOOR_Y = T.canyonFloor - D

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
  if (s >= T.landEnd) return hill(s, 1)
  const L = T.landEnd - T.landFlat
  const u = (s - T.landFlat) / L
  return (-T.landHeight * 6 * u * (1 - u)) / L
}

export const hasRail = (s) => s <= T.lipS || s >= T.gapEnd

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
export const laneX = (x0, homeX, s) => homeX + (x0 - homeX) * mergeK(s) + trackX(s)
// dx/ds of that track.
export const laneXSlope = (x0, homeX, s) => (x0 - homeX) * mergeK(s, 1) + trackXSlope(s)
// Which bend [index] s is in (or -1).
export function bendAt(s) {
  for (let i = 0; i < T.bends.length; i++) if (s > T.bends[i][0] && s < T.bends[i][1]) return i
  return -1
}
// Push into the lean (in LEAN.accel units) at speed v on s.
export const leanDemand = (s, v) => (v * v * bend(s, 2)) / LEAN.accel
// The fastest a cart with this grip takes the bend at s when leaning fully (m/s).
export function safeSpeed(s, grip) {
  const k = Math.abs(bend(s, 2))
  return k < 1e-6 ? Infinity : Math.sqrt(((1 + grip * LEAN.green) * LEAN.accel) / k)
}
// The tightest bend in [s, s + ahead] (|curvature| max) for braking ahead of it.
function maxCurveAhead(s, ahead) {
  let k = 0
  for (let x = s; x <= s + ahead; x += 4) k = Math.max(k, Math.abs(bend(x, 2)))
  return k
}
export const onLift = (s) => s >= T.lift.s0 && s <= T.lift.s1

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
    // Brake ahead of a bend to the speed it takes steady.
    const k = maxCurveAhead(c.s, 25 + (c.v * c.v) / (2 * CART.brake))
    if (k > 1e-6 && c.v > LEAN.autoMargin * Math.sqrt(((1 + st.grip * LEAN.green) * LEAN.accel) / k)) {
      input = { ...input, throttle: 0, brake: 1 }
      c.boostLeft = 0 // a booster burning into a bend: the sim driver lets go of it
    }
  }
  const g = CART.gravity
  let thrust = 0
  // Golden Station: the platform's brakes take over and stop the cart at the buffers.
  const station = !c.air && c.s >= T.station
  const throttle = c.fuel > 0 && !station ? input.throttle : 0
  c.throttle = throttle
  if (throttle > 0) {
    thrust += st.accel * throttle
    c.fuel -= dt * throttle * st.burn
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
    const resist = st.roll + st.drag * c.v * c.v + CART.brake * input.brake + stationBrake
    if (c.v > 0.02) a -= resist
    else if (c.v < -0.02) a += resist
    else if (Math.abs(a) <= resist) {
      a = 0
      c.v = 0
    }
    c.v += a * dt
    // The chain lift: the chain dogs catch the cart and haul it up at a walk.
    c.chain = onLift(c.s) && c.v <= T.lift.speed + 0.01
    if (c.chain) {
      c.v = T.lift.speed
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
    if (before >= T.gapEnd && c.s < T.gapEnd + 0.3) {
      // Rolled back to the broken end of the far deck: stop there. (Only from the far
      // side: a cart crossing the near lip must launch below, not land on the deck.)
      c.s = T.gapEnd + 0.3
      c.v = 0
    }
    if (c.s >= T.length) {
      c.s = T.length
      if (c.v > 1) events.push('bufferStop')
      c.v = 0
    }
    if (before <= T.lipS && c.s > T.lipS) {
      // Off the end of the broken bridge: fly.
      const lipSlope = trackSlope(T.lipS)
      const lc = 1 / Math.sqrt(1 + lipSlope * lipSlope)
      c.vx = c.v * lc
      c.vy = c.v * lipSlope * lc
      c.y = LIP_Y
      c.air = true
      c.airTime = 0
      c.airPeak = 0
      events.push('launch')
    } else {
      c.y = trackHeight(c.s)
      // Bends: lean against the push; past the wheels' grip the cart tips, then derails.
      const demand = leanDemand(c.s, c.v) + (input.side ?? 0)
      const want = auto ? Math.max(-1, Math.min(1, demand)) : Math.max(-1, Math.min(1, input.lean))
      c.lean += (want - c.lean) * Math.min(1, dt * LEAN.rate)
      c.tip = (demand - c.lean) / st.grip
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
      if (k < 0 && c.v > 0 && c.s > T.landEnd) {
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
    c.vx += c.hop ? (thrust - st.drag * c.vx * c.vx) * dt : (thrust * 0.6 - CART.airDrag * c.vx * c.vx) * dt
    const vy0 = c.vy
    c.vy -= g * dt
    c.s += c.vx * dt
    // Hops integrate the drop exactly (a grazing hop would otherwise land at once);
    // the canyon jump keeps the integration it was balanced with.
    c.y += (c.hop ? (vy0 + c.vy) / 2 : c.vy) * dt
    c.pitch = Math.atan2(c.vy, Math.max(1, c.vx)) * 0.8
    if (c.s >= T.gapEnd) {
      const ground = trackHeight(c.s)
      if (prevS < T.gapEnd && c.y < LAND_Y - 0.7) {
        // Slammed into the far cliff: bounce off it and fall to the spikes.
        c.s = T.gapEnd - 0.6
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
          c.jumped = true
          events.push('land')
        }
      }
      if (c.s >= T.length) {
        c.s = T.length
        c.vx = Math.min(c.vx, 0)
      }
    } else if (c.s < T.lipS - 0.5 && c.y < LIP_Y - 0.5 && c.vx < 0) {
      // Bounced back into the near wall: just drop.
      c.s = T.lipS + 0.2
      c.vx = 0
    } else if (c.y <= FLOOR_Y + 1.2) {
      c.y = FLOOR_Y + 1.2
      c.crashed = 'spikes'
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
