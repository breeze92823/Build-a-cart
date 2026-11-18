// The careful player the tests drive with (real rides in drive.js, headless rides in sim.js), so
// the two follow the same rules:
//   - lean against the bend's push (and wind) so the cart stays steady,
//   - brake early enough for EVERY bend ahead: the speed allowed here is the lowest of
//     "85% of the bend's safe speed + what the brakes can shed over the distance to it",
//   - at the canyon lip, go only as fast as it takes to clear the gap (a maxed cart at full speed
//     would fly past the far deck into the Switchbacks); in the air, no more gas,
//   - when an animal crossing, the drawbridge or the rockslide is up, let go of the gas, stop short
//     of its line and wait until it has cleared.
import { CART, LEAN, TRACK } from '../config.js'
import { leanDemand, newCart, safeSpeed, stepCart } from '../cartPhysics.js'

const LIP_MARGIN = 1.1
const B = CART.brake * 0.8 // plan with a little less braking than the cart has (drag, hills)

// The slowest speed at the lip that still lands on the far side, found by launching test carts.
// A flight does not depend on the cart (no gas, no rails), so it is worked out once.
let clear = 0
export function clearSpeed(st) {
  if (clear) return clear
  const evs = []
  clear = 200
  for (let v = 8; v <= 200; v += 1) {
    const c = newCart(st, TRACK.lipS - 0.05)
    c.v = v
    c.fuel = 0
    let landed = false
    for (let i = 0; i < 60 * 40 && !c.crashed && !landed; i++) {
      stepCart(c, { throttle: 0, brake: 0, lean: 0 }, st, 1 / 60, evs)
      if (evs.includes('land')) landed = true
    }
    if (landed) {
      clear = v
      break
    }
  }
  return clear
}

// c: cart physics state, st: its stats, hazards: [{ phase, at }], side: wind push.
// Returns { throttle, brake (booleans), lean (-1..1 wanted), waiting, boostOk }.
export function pilotInput(c, st, hazards = [], side = 0) {
  let throttle = true
  let brake = false
  let waiting = false
  if (!c.air) {
    const v = c.v
    const look = Math.min(900, 30 + (v * v) / (2 * B))
    let limit = Infinity
    for (let x = c.s; x <= c.s + look; x += 4) {
      const safe = safeSpeed(x, st.grip)
      if (safe === Infinity) continue
      const m = LEAN.autoMargin * safe
      limit = Math.min(limit, Math.sqrt(m * m + 2 * B * (x - c.s)))
    }
    // The lip: no faster than a little over the speed that clears it.
    const cap = clearSpeed(st) * LIP_MARGIN
    if (c.s < TRACK.lipS) limit = Math.min(limit, Math.sqrt(cap * cap + 2 * B * (TRACK.lipS - c.s)))
    if (v > limit) {
      throttle = false
      brake = true
    } else if (v > limit * 0.97) throttle = false
    for (const z of hazards) {
      if (z.phase !== 'active' || c.s >= z.at) continue
      throttle = false
      // Follow a stopping profile that only asks for 60% of the brakes (hills push the cart on).
      if (v > Math.sqrt(2 * B * 0.6 * Math.max(0, z.at - 6 - c.s)) || v < 0.5) brake = true
      if (v < 0.5) waiting = true
    }
  } else if (!c.hop) throttle = false // mid-jump: no gas (it would only carry the cart further past the far deck)
  const lean = Math.max(-1, Math.min(1, leanDemand(c.s, c.air ? c.vx : c.v) + side))
  // Whether a booster is worth firing now (a cart that already clears the gap does not need one).
  const boostOk = c.v < clearSpeed(st)
  return { throttle, brake, lean, waiting, boostOk }
}
