// Playing one real ride: walk to the cart, hold E to get in, hold W, steer the bends with A / D,
// brake for bends and for what blocks the line, press Space to boost, and wait for the run to end
// and pay out. Used by the ride tests and the campaign.
//
// The driver is the careful player of pilot.js (lean, brake for every bend ahead, wait at a blocked
// line); sim.js drives the headless ride by the same rules, so the two stay comparable.
import { TRACK } from '../config.js'
import { pilotInput } from './pilot.js'
import { BOOST_AT } from './sim.js'

// Boosters fire on the canyon ramp (a player does not burn one into a bend).
// Cash that arrives while the cart is riding (coins, gems, fuel-can style pickups, skill bonuses,
// new-area and jump bonuses) is `bonus`; what is banked when the run ends is `banked`.
// opts: boostAt (s where Space is pressed, null = never), gas (hold W, default true),
//       pilot (lean, brake for bends and hazards, default true), maxSeconds,
//       endOnCrash (stop at the crash screen), onFrame(debug).
export async function driveRun(h, opts = {}) {
  const { boostAt = BOOST_AT, maxSeconds = 240, gas = true, pilot = true, endOnCrash = false, onFrame } = opts
  const { ride, state } = h
  const out = { mounted: false, maxS: 0, jumped: false, boosts: 0, crashed: false, charges0: 0, cashBefore: state.cash, cashAfter: 0, bonus: 0, banked: 0, bestBefore: state.stats.best, modes: [], waited: 0 }
  await h.toCart()
  out.mounted = await h.holdE(() => ride.riding, 3)
  if (!out.mounted) return out
  let boostHeld = false
  const keys = { KeyW: false, KeyS: false, KeyA: false, KeyD: false }
  const press = (code, on) => {
    if (keys[code] === on) return
    keys[code] = on
    if (on) h.keyDown(code)
    else h.keyUp(code)
  }
  let lastCash = state.cash // cash just before the frame that banks the run
  const frames = maxSeconds * 60
  for (let i = 0; i < frames; i++) {
    const d = ride.debug
    if (d) {
      const { c } = d
      out.maxS = Math.max(out.maxS, c.maxS)
      out.jumped = c.jumped
      out.last = { s: c.s, v: c.v, fuel: c.fuel, tank: d.st.tank, crashed: c.crashed, held: c.held, mode: ride.mode }
      if (!out.charges0) out.charges0 = d.st.charges
      let throttle = gas
      let brake = false
      let lean = 0
      let p = null
      if (pilot && !c.air && ride.mode === 'riding') {
        p = pilotInput(c, d.st, ride.encounters.hazards, ride.encounters.windSide())
        throttle = gas && p.throttle
        brake = p.brake
        if (p.waiting) out.waited += 1 / 60
        // Lean against the push with A / D.
        lean = p.lean - c.lean > 0.15 ? 1 : p.lean - c.lean < -0.15 ? -1 : 0
      }
      if (pilot && c.air && !c.hop && ride.mode === 'riding') throttle = gas && pilotInput(c, d.st).throttle
      if (boostAt != null && c.s >= boostAt && c.s <= TRACK.lipS && c.charges > 0 && c.boostLeft <= 0 && !boostHeld && ride.mode === 'riding' && (!pilot || pilotInput(c, d.st).boostOk)) {
        h.keyDown('Space')
        boostHeld = true
        out.boosts++
      } else if (boostHeld) {
        h.keyUp('Space')
        boostHeld = false
      }
      press('KeyW', throttle)
      press('KeyS', brake)
      press('KeyD', lean > 0)
      press('KeyA', lean < 0)
      onFrame?.(d)
    }
    const m = ride.mode
    if (out.modes[out.modes.length - 1] !== m) out.modes.push(m)
    if (m === 'crashed') {
      out.crashed = true
      if (endOnCrash) break
    }
    if (m === 'idle') break
    await h.frames(1)
    if (ride.mode !== 'idle') lastCash = state.cash
  }
  h.keyUp('Space')
  for (const code of Object.keys(keys)) press(code, false)
  if (!endOnCrash) await h.frames(2)
  out.cashAfter = state.cash
  out.ended = ride.mode === 'idle'
  out.bonus = lastCash - out.cashBefore
  if (out.ended) out.banked = out.cashAfter - lastCash
  return out
}
