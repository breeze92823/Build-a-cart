// A headless ride (no rendering): the same fixed-step cart physics, area bonuses, jump bonus and
// banking that ride.js does, so a whole progression (hundreds of rides) can be played in seconds.
// The rider is the careful player of drive.js: leans perfectly (stepCart does that without a lean
// input), brakes for bends (stepCart again), collects the fuel cans and boost pads, and stops short
// of a blocked line (animals, drawbridge, rockslide) until it has cleared. The "simulator = real
// ride" test checks it against the real ride so the two cannot drift apart.
import { CART, ECONOMY, GEAR, HAZARDS, PICKUPS, TRACK, ZONES, zoneAt } from '../config.js'
import { fireBoost, newCart, stepCart } from '../cartPhysics.js'
import * as S from '../state.js'
import { pilotInput } from './pilot.js'

const DT = 1 / 60
export const restS = () => (S.state.wagons + S.state.goldenCarts) * CART.wagonGap + 0.5
// Where a player fires boosters: on the ramp, so the burn carries the cart over the canyon.
export const BOOST_AT = TRACK.rampStart - 30

// One ride with full throttle. Nothing is banked (see bank()).
export function simRide({ eventCash = 1, eventSpeed = 1, boostAt = BOOST_AT, maxSeconds = 400 } = {}) {
  const st = S.currentStats(eventSpeed)
  const s0 = restS()
  const c = newCart(st, s0)
  const evs = []
  const bestAtStart = S.state.stats.best
  let zoneIdx = zoneAt(c.s)
  const zones = [] // new areas reached past the best: { id, bonus }
  let jumpBonus = 0
  let end = 'timeout'
  let boosts = 0
  let i = 0
  const hz = HAZARDS.map((h) => ({ h, at: h.at, phase: 'idle', t: 0, clear: 0 }))
  const fuelCans = PICKUPS.fuel.filter((s) => s > s0)
  const pads = PICKUPS.boost.filter((s) => s > s0)
  const taken = new Set() // cans and pads are one use each per run (they re-arm only for a revive)
  for (; i < maxSeconds * 60 && end === 'timeout'; i++) {
    // Hazards: one at a time (in order); active once the cart's stopping point reaches `trigger`.
    const v = c.air ? c.vx : c.v
    c.held = false
    if (!c.air) {
      for (const z of hz) {
        const { h } = z
        if (z.phase === 'idle') {
          const lead = h.at - h.trigger + (Math.max(0, v) * Math.max(0, v)) / (2 * CART.brake)
          if (c.s < h.at - lead || c.s > h.at || hz.some((o) => o !== z && o.at < h.at && c.s < o.at + 2)) continue
          z.phase = 'active'
          z.t = 0
          const eta = (h.at - c.s) / Math.max(6, v)
          z.clear = h.kind === 'bridge' ? h.cross : h.kind === 'rocks' ? h.early + h.cross : Math.min(3.6, Math.max(1, eta * 0.55)) + h.cross
        } else if (z.phase === 'active') {
          z.t += DT
          if (z.t >= z.clear) z.phase = 'done'
          else if (!h.soft && c.s > h.at - 40 && c.s < h.at) c.held = true
        }
      }
    }
    const p = pilotInput(c, st, hz)
    if (c.s >= boostAt && c.s <= TRACK.lipS && c.charges > 0 && c.boostLeft <= 0 && p.boostOk && fireBoost(c, st)) boosts++
    const prevS = c.s
    stepCart(c, { throttle: p.throttle ? 1 : 0, brake: p.brake ? 1 : 0, lean: p.lean }, st, DT, evs)
    if (!c.air) {
      for (const f of fuelCans) {
        if (prevS > f || c.s < f || taken.has(f)) continue
        taken.add(f)
        c.fuel = Math.min(st.tank, c.fuel + PICKUPS.fuelRefill * st.tank)
      }
      for (const pad of pads) {
        if (prevS > pad || c.s < pad || taken.has(pad)) continue
        taken.add(pad)
        c.v += PICKUPS.boostKick
      }
    }
    const zi = zoneAt(c.s)
    if (zi > zoneIdx) {
      zoneIdx = zi
      const z = ZONES[zi]
      if (!z.quiet && z.bonus && z.s > bestAtStart + 1) zones.push({ id: z.id, bonus: z.bonus })
    }
    for (const e of evs) {
      if (e === 'land' && !jumpBonus) jumpBonus = S.state.stats.jumps === 0 ? ECONOMY.firstJumpBonus : ECONOMY.jumpBonus
      else if (e === 'crash' || e === 'derail') end = 'crash'
      else if (e === 'stopped') end = 'stopped'
      else if (e === 'arrived') end = 'arrived'
    }
  }
  return { st, c, s0, seconds: i / 60, maxS: c.maxS, distance: Math.max(0, c.maxS - s0), end, jumped: c.jumped, jumpBonus, zones, boosts }
}

// What ride.finishRun / the area and jump bonuses put into the save. Returns the run payout.
export function bank(r, eventCash = 1) {
  if (!(r.distance > 2 || r.end === 'crash')) return 0
  if (r.jumpBonus) {
    S.addCash(r.jumpBonus)
    S.recordJump()
  }
  for (const z of r.zones) S.addCash(z.bonus)
  const got = S.addCash(S.runPayout(r.maxS, eventCash))
  S.recordRun(r.maxS, got, r.jumped)
  return got
}

// What a ride would pay (repeatable income only: no one-off bonuses) with some of the state swapped.
export function projected(patch = {}) {
  const s = S.state
  const keep = { equipped: s.equipped, wagons: s.wagons, upgrades: s.upgrades }
  if (patch.equipped) s.equipped = { ...s.equipped, ...patch.equipped }
  if (patch.wagons != null) s.wagons = patch.wagons
  if (patch.upgrades) s.upgrades = { ...s.upgrades, ...patch.upgrades }
  try {
    const r = simRide()
    return { payout: S.runPayout(r.maxS), maxS: r.maxS, end: r.end }
  } finally {
    Object.assign(s, keep)
  }
}

// Runs a ride with some other gear on the cart (state is restored afterwards).
export function evalGear(equipped, opts) {
  const s = S.state
  const keep = s.equipped
  s.equipped = { ...s.equipped, ...equipped }
  try {
    const r = simRide(opts)
    return { end: r.end, maxS: r.maxS, jumped: r.jumped, zones: r.zones.length }
  } finally {
    s.equipped = keep
  }
}

// Every engine x fuel x (starter or sport-grade wheels) x (no booster or the cheapest booster),
// by what it costs, with how the ride ends. Lets a test pick "a cart that crashes into the canyon"
// or "the cheapest cart that clears it" from the live config instead of hard-coding gear.
let scan = null
export function scanGear() {
  if (scan) return scan
  const engines = GEAR.filter((g) => g.type === 'engine')
  const fuels = GEAR.filter((g) => g.type === 'fuel')
  const wheels = GEAR.filter((g) => g.type === 'wheels').sort((a, b) => a.price - b.price).slice(0, 3)
  const boosters = GEAR.filter((g) => g.type === 'booster').sort((a, b) => a.price - b.price).slice(0, 2)
  scan = []
  for (const engine of engines)
    for (const fuel of fuels)
      for (const w of wheels)
        for (const booster of boosters) {
          const equipped = { engine: engine.id, fuel: fuel.id, wheels: w.id, booster: booster.id }
          scan.push({ equipped, price: engine.price + fuel.price + w.price + booster.price, ...evalGear(equipped) })
        }
  scan.sort((a, b) => a.price - b.price)
  return scan
}
