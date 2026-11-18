// Everything that happens TO the cart along the line, on the home track: animal
// crossings (deer + moose, sheep), the bear that comes for riders who wait too
// long, the rockslide, the river drawbridge, wind gusts on the Sky Trestle, the
// Gem Run junction, and the pickups (coins, gems, fuel cans, boost pads, speed
// gates, the Golden Ticket) plus the skill bonuses (leaning, summit, perfect stop).
// ride.js calls beforeStep / afterStep around every physics step and update()
// every frame; this module owns the moving models (scenery is route.js).
import { Group, InstancedMesh, Object3D, Vector3 } from 'three'
import { BASES, BEAR, CART, HAZARDS, LEAN, PICKUPS, TRACK, WIND } from './config.js'
import { bendAt, LAND_Y, LIP_Y, safeSpeed, trackHeight, trackX, trackXSlope, VALLEY_Y } from './cartPhysics.js'
import { branchX, RAIL_TOP } from './track.js'
import { zAt } from './world.js'
import { addCash, bonusCash } from './state.js'
import { label } from './propkit.js'
import { pillar } from './build.js'
import { mulberry32 } from './textures.js'
import { animateAnimal, buildAnimal } from './scenery/animals.js'
import * as P from './scenery/props.js'
import { sfx } from './audio/index.js'

const T = TRACK
const HOME = BASES.xs[BASES.home]
const J = T.junction
// World x of the home rails at s (lane 1 = the Gem Run branch).
export const railX = (s, lane = 0) => HOME + trackX(s) + (lane ? branchX(s) : 0)
const railY = (s) => trackHeight(s) + RAIL_TOP
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const money = (n) => `+$${Math.round(n).toLocaleString('en-US')}`

// --- Pickup layout (deterministic) ------------------------------------------------------------
// { type: 'coin' | 'gem', s, y (world), lane }
function layoutPickups() {
  const out = []
  const at = (type, s, h = 1.3, lane = 0) => out.push({ type, s, y: railY(s) + h + (lane ? 0 : 0), lane })
  const row = (s0, n, gap, type = 'coin', h = 1.3, lane = 0) => {
    for (let i = 0; i < n; i++) at(type, s0 + i * gap, h, lane)
  }
  // An arc over a hump crest: the low ones are on the rails, the high ones need airtime.
  const arc = (sc, n, gap, peak) => {
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) / ((n - 1) / 2)
      at('coin', sc + (i - (n - 1) / 2) * gap, 1.3 + peak * (1 - u * u))
    }
  }
  // Sunny Farm: teach "hold W".
  row(40, 8, 4)
  row(120, 10, 4)
  row(190, 6, 3)
  // Up the canyon ramp, then a rainbow over the gap for the jumpers.
  row(246, 8, 7)
  for (let i = 0; i < 7; i++) {
    const u = (i + 1) / 8
    const s = T.lipS + (T.gapEnd - T.lipS) * u
    out.push({ type: 'coin', s, y: LIP_Y + (LAND_Y - LIP_Y) * u + RAIL_TOP + 2.6 + 5 * Math.sin(Math.PI * u), lane: 0 })
  }
  // Whispering Forest.
  row(470, 8, 4)
  row(560, 6, 4)
  row(640, 8, 4)
  // Switchbacks: through every apex.
  for (const [s0, s1] of T.bends.slice(1)) row(s0 + 10, Math.floor((s1 - s0 - 20) / 6), 6)
  // The chain lift (one clink per few metres while it hauls), the summit, the tunnel plunge.
  row(T.lift.s0 + 8, 13, 9)
  row(1140, 5, 5, 'gem', 1.5)
  row(T.tunnels[0].s0 + 6, 10, 6)
  // Bumpy Meadows: arcs over each hump.
  arc(1410, 7, 3, 4)
  arc(1500, 7, 3.5, 6)
  arc(1610, 9, 3.5, 8)
  // Pasture, river bridge, after the rockslide.
  row(1690, 8, 4)
  row(1822, 8, 4)
  row(2004, 6, 4)
  // Up the Sky Trestle and along its top.
  row(2045, 12, 9)
  row(2180, 8, 5)
  row(2260, 8, 5)
  // Glow Mine: gem clusters in the dark.
  row(2440, 6, 4, 'gem', 1.4)
  row(2560, 8, 4)
  row(2660, 6, 4, 'gem', 1.4)
  // Golden Sands: the safe lane gets a few coins, the Gem Run gems.
  row(J.s0 + 28, 6, 8)
  for (let i = 0; i < 14; i++) at('gem', J.s0 + J.ramp + 4 + i * 4, 1.4, 1)
  arc(2910, 7, 3.5, 4)
  arc(3000, 7, 3.5, 6)
  // Golden Station run-in.
  row(3156, 6, 4)
  out.sort((a, b) => a.s - b.s)
  return out
}
const TICKET_AT = [1405, 1500, 1610, 2050, 2200, 2300, 2580, 2920, 3000]

export function createEncounters(scene, deps) {
  const { fx, hud, cam } = deps
  const root = new Group()
  scene.add(root)
  const rand = mulberry32(4242)
  const tmp = new Vector3()

  // --- Pickups --------------------------------------------------------------------------------
  const items = layoutPickups()
  const assets = P.pickupAssets()
  const coinList = items.filter((i) => i.type === 'coin')
  const gemList = items.filter((i) => i.type === 'gem')
  const coinMesh = new InstancedMesh(assets.coinGeo, assets.coinMat, coinList.length)
  const gemMesh = new InstancedMesh(assets.gemGeo, assets.gemMat, gemList.length)
  coinList.forEach((it, i) => ((it.mesh = coinMesh), (it.i = i)))
  gemList.forEach((it, i) => ((it.mesh = gemMesh), (it.i = i)))
  coinMesh.frustumCulled = gemMesh.frustumCulled = false
  root.add(coinMesh, gemMesh)
  const e = new Object3D()
  function placeItem(it, t, pop = 0) {
    const x = railX(it.s, it.lane)
    e.position.set(x, it.y + Math.sin(t * 2.4 + it.s) * 0.12 + pop * 1.6, zAt(it.s))
    e.rotation.set(0, t * 3 + it.s * 0.3, 0)
    const k = it.got ? Math.max(0, 1 - pop) * 1.3 : 1
    e.scale.setScalar(k)
    e.updateMatrix()
    it.mesh.setMatrixAt(it.i, e.matrix)
  }
  for (const it of items) placeItem(it, 0)

  // Fuel cans, boost pads, speed gates, the Golden Ticket.
  const fuels = PICKUPS.fuel.map((s) => {
    const m = P.fuelCan()
    m.position.set(railX(s), railY(s) + 1.1, zAt(s))
    root.add(m)
    return { s, m, got: false }
  })
  const pads = PICKUPS.boost.map((s) => {
    const m = P.boostPad()
    m.position.set(railX(s), trackHeight(s), zAt(s))
    m.rotation.y = -Math.atan(trackXSlope(s))
    root.add(m)
    return { s, m, got: false }
  })
  const gates = PICKUPS.gates.map((g) => {
    const m = P.speedGate()
    m.position.set(railX(g.s), railY(g.s) - RAIL_TOP, zAt(g.s))
    m.rotation.y = -Math.atan(trackXSlope(g.s))
    const l = label(`${g.lo}-${g.hi}`, 1.5, { colors: ['#ffffff', '#3ad4ff'] })
    const pn = m.userData.panel
    l.position.set(0, pn ? pn.y : 6, pn ? pn.z + 0.3 : 0.3)
    m.add(l)
    root.add(m)
    return { ...g, m, passed: false }
  })
  const ticket = P.goldenTicket()
  root.add(ticket)
  let ticketS = 0
  let ticketGot = false

  // --- Hazards: models ------------------------------------------------------------------------
  const hz = HAZARDS.map((h) => ({ ...h, phase: 'idle', t: 0, waited: false, bumped: false, actors: [], blocked: false, bonusPaid: false }))
  const H = Object.fromEntries(hz.map((h) => [h.id, h]))

  // Herds: actors cross from side A to side B of the track at `at`.
  function herd(h, kinds) {
    const g = new Group()
    root.add(g)
    g.visible = false
    h.group = g
    kinds.forEach((kind, i) => {
      const m = buildAnimal(kind, { seed: i * 7 + h.at })
      g.add(m)
      h.actors.push({ m, kind, i, ds: (i % 3) - 1 + (rand() - 0.5) * 2.5, side0: 13 + rand() * 6, x: 0, spd: 3, pause: kind === 'moose' ? 1.4 : 0, scatter: 0, mode: 'graze' })
    })
  }
  herd(H.deer, ['deer', 'deer', 'stag', 'deer', 'deer', 'deer', 'moose'])
  herd(H.sheep, ['sheep', 'lamb', 'sheep', 'sheep', 'lamb', 'sheep', 'sheep', 'sheep', 'dog'])
  // The bear (Whispering Forest).
  const bear = { m: buildAnimal('bear', { seed: 3 }), phase: 'idle', t: 0, still: 0, fromS: 0, s: 0, x: 0 }
  bear.m.visible = false
  root.add(bear.m)
  // Boulders: they roll down from the ridge on the left.
  const rocks = H.rocks
  rocks.group = new Group()
  rocks.group.visible = false
  root.add(rocks.group)
  for (let i = 0; i < 5; i++) {
    const m = P.boulder(1.6 + rand() * 1.4, rand)
    rocks.group.add(m)
    rocks.actors.push({ m, i, ds: (i - 2) * 3.2 + (rand() - 0.5) * 2, r: m.userData.radius ?? 1, x: 0, y: 0, spin: 0, settled: false })
  }
  // The drawbridge (home track): span, control tower with signal lights and barrier, winch.
  const DB = T.drawbridge
  const bridge = H.bridge
  const deckY = trackHeight(DB.s0)
  bridge.span = P.drawbridgeSpan(DB.s1 - DB.s0, 3.4)
  bridge.span.position.set(railX(DB.s0), deckY, zAt(DB.s0))
  root.add(bridge.span)
  bridge.tower = P.bridgeTower()
  bridge.tower.position.set(railX(DB.barrier) - 3.6, deckY, zAt(DB.barrier))
  root.add(bridge.tower)
  // A timber stage under the tower, down to the river bank.
  pillar(root, 5.4, deckY - VALLEY_Y + 0.05, 3.4, railX(DB.barrier) - 5.2, VALLEY_Y - 0.05, zAt(DB.barrier), '#6a4224')
  const winch = P.bridgeWinch()
  winch.position.set(railX(DB.s0) + 3.4, deckY, zAt(DB.s0) + 1.2)
  root.add(winch)
  bridge.angle = 0
  // Windsocks along the Sky Trestle.
  const socks = [WIND.s0 + 15, (WIND.s0 + WIND.s1) / 2, WIND.s1 - 10].map((s) => {
    const m = P.windsock()
    m.position.set(railX(s) + 2.6, railY(s) - RAIL_TOP, zAt(s))
    root.add(m)
    return m
  })
  // Tumbleweeds rolling across the Gem Run.
  const weeds = [0, 1, 2, 3].map((i) => {
    const m = P.tumbleweed()
    root.add(m)
    return { m, s: J.s0 + J.ramp + 10 + i * 14, ph: rand() * 6, hit: false }
  })

  // --- Run state ------------------------------------------------------------------------------
  let next = 0 // first item not yet passed
  let coins = 0
  let combo = 0
  let comboT = 0
  let lane = 0
  let laneSel = 0
  let laneDecided = false
  let wind = { phase: 'calm', t: 2, dir: 1, side: 0 }
  let bendI = -1
  let bendRec = null
  let summitDone = false
  let leanIn = 0
  let eventCash = 1
  let alertText = null
  let alertKind = 'stop'
  let goT = 0
  const popping = [] // collected items flying up: { it, t }

  function pay(m, text, color = '#ffe066', size = 1) {
    const got = addCash(bonusCash(m, eventCash))
    hud.pop(`${text} ${money(got)}`, color, size)
    return got
  }

  function reset(c, ev = 1) {
    eventCash = ev
    next = 0
    while (next < items.length && items[next].s < c.s) next++
    coins = combo = 0
    for (const it of items) it.got = false
    popping.length = 0
    for (const f of fuels) ((f.got = false), (f.m.visible = true))
    for (const p of pads) p.got = false
    for (const g of gates) g.passed = false
    ticketS = TICKET_AT[Math.floor(Math.random() * TICKET_AT.length)]
    ticketGot = false
    ticket.visible = true
    ticket.position.set(railX(ticketS), railY(ticketS) + 2.2, zAt(ticketS))
    for (const h of hz) resetHazard(h)
    resetBear()
    lane = 0
    laneSel = 0
    laneDecided = false
    wind = { phase: 'calm', t: 2, dir: 1, side: 0 }
    bendI = -1
    bendRec = null
    summitDone = false
    for (const w of weeds) w.hit = false
    alertText = null
    hud.coins(0)
    hud.junction(null)
    hud.alert(null)
  }
  function resetHazard(h) {
    h.phase = 'idle'
    h.t = 0
    h.waited = h.bumped = h.blocked = h.bonusPaid = false
    if (h.group) h.group.visible = false
    for (const a of h.actors) {
      a.scatter = 0
      a.settled = false
      a.mode = 'graze'
    }
    if (h.id === 'bridge') {
      bridge.angle = 0
      bridge.span.rotation.x = 0
    }
  }
  function resetBear() {
    bear.phase = 'idle'
    bear.t = bear.still = 0
    bear.m.visible = false
  }
  // After a revive at s: hazards ahead re-arm, the item pointer jumps.
  function revive(s) {
    for (const h of hz) if (h.at > s) resetHazard(h)
    if (s < BEAR.s1) resetBear()
    next = 0
    while (next < items.length && items[next].s < s) next++
    if (s < J.choose) {
      lane = 0
      laneDecided = false
    }
    wind.side = 0
    bendI = -1
    bendRec = null
  }

  // --- Before each physics step: wind pushes, the lane is chosen -------------------------------
  // input: the ride's { throttle, brake, lean }; returns it with `side` set.
  function beforeStep(c, input, dt) {
    input.side = 0
    // Wind gusts on the Sky Trestle.
    if (!c.air && c.s > WIND.s0 && c.s < WIND.s1) {
      wind.t -= dt
      if (wind.phase === 'calm' && wind.t <= 0) {
        wind.phase = 'warn'
        wind.t = WIND.warn
        wind.dir = Math.random() < 0.5 ? -1 : 1
        sfx.windGust(0.6)
      } else if (wind.phase === 'warn' && wind.t <= 0) {
        wind.phase = 'gust'
        wind.t = WIND.gust
        sfx.windGust(1)
      } else if (wind.phase === 'gust') {
        const u = 1 - wind.t / WIND.gust
        wind.side = wind.dir * WIND.push * Math.sin(Math.PI * clamp(u, 0, 1))
        if (wind.t <= 0) {
          wind.phase = 'calm'
          wind.side = 0
          wind.t = WIND.every[0] + Math.random() * (WIND.every[1] - WIND.every[0])
        }
      }
      input.side = wind.side
    } else wind.side = 0
    // Junction: lean decides the lane at the switch.
    if (!laneDecided && c.s > J.choose - 90) {
      if (input.lean > 0.3) laneSel = 1
      else if (input.lean < -0.3) laneSel = -1
      if (c.s >= J.choose) {
        laneDecided = true
        lane = laneSel === 1 ? 1 : 0
        sfx.junctionClack()
        hud.pop(lane ? 'GEM RUN!' : 'SAFE LANE', lane ? '#ff7ae0' : '#7fc2ff', 1.2)
      }
    }
    if (c.s > J.s1) lane = 0
    // A hazard blocking the way holds the cart at its line.
    c.held = false
    for (const h of hz) if (h.blocked && !h.soft && c.s > h.at - 40 && c.s < h.at) c.held = true
    return input
  }

  // --- After each physics step: pickups, collisions, bonuses ----------------------------------
  // Returns a crash kind ('herd', 'rocks', 'splash') or null.
  function afterStep(c, st, prevS, dt) {
    if (c.crashed) return null
    const v = c.air ? c.vx : c.v
    let crash = null
    // Coins and gems.
    while (next < items.length && items[next].s <= c.s + 0.8) {
      const it = items[next++]
      if (it.s < prevS - 2 || it.got) continue
      if (it.lane !== lane && it.s > J.s0 && it.s < J.s1) continue
      const cy = c.y + RAIL_TOP + 0.9
      if (Math.abs(cy - it.y) > 1.9) continue
      it.got = true
      popping.push({ it, t: 0 })
      tmp.set(railX(it.s, it.lane), it.y, zAt(it.s))
      if (it.type === 'coin') {
        combo = comboT > 0 ? combo + 1 : 0
        comboT = 1.1
        sfx.coin(combo)
        fx.pickup(tmp, '#ffd23a', 8)
        addCash(bonusCash(PICKUPS.coin, eventCash))
      } else {
        sfx.gem()
        fx.pickup(tmp, '#ff7ae0', 14)
        pay(PICKUPS.gem, 'GEM', '#ff9af0')
      }
      coins++
      hud.coins(coins)
    }
    // Fuel cans.
    for (const f of fuels) {
      if (f.got || prevS > f.s || c.s < f.s || c.air) continue
      f.got = true
      f.m.visible = false
      c.fuel = Math.min(st.tank, c.fuel + PICKUPS.fuelRefill * st.tank)
      sfx.fuelPickup()
      fx.pickup(f.m.position, '#ff4a3a', 16)
      hud.pop('+FUEL!', '#ff8a7a', 1.1)
    }
    // Boost pads.
    for (const p of pads) {
      if (p.got || prevS > p.s || c.s < p.s || c.air) continue
      p.got = true
      c.v += PICKUPS.boostKick
      sfx.boostPad()
      cam.kick(0.3)
      fx.pickup(p.m.position, '#3ad4ff', 18)
      hud.pop('BOOST PAD!', '#7fe8ff', 1.1)
      setTimeout(() => (p.got = false), 4000) // re-arms for a rollback / revive
    }
    // Speed gates.
    for (const g of gates) {
      if (g.passed || prevS > g.s || c.s < g.s) continue
      g.passed = true
      if (v >= g.lo && v <= g.hi) {
        sfx.gatePass(true)
        pay(PICKUPS.gate, 'SPEED GATE!', '#5dff6a')
        fx.confetti(g.m.position.clone().setY(g.m.position.y + 6), 30, 0.7)
      } else {
        sfx.gatePass(false)
        hud.pop(v < g.lo ? 'TOO SLOW!' : 'TOO FAST!', '#ff8a8a')
      }
    }
    // The Golden Ticket.
    if (!ticketGot && prevS <= ticketS && c.s >= ticketS && Math.abs(c.y + RAIL_TOP + 0.9 - ticket.position.y) < 2.6) {
      ticketGot = true
      ticket.visible = false
      sfx.ticket()
      fx.confetti(ticket.position, 90, 1.1)
      fx.pickup(ticket.position, '#ffd23a', 30)
      pay(PICKUPS.ticket, 'GOLDEN TICKET!', '#ffd23a', 1.5)
    }
    // Summit of the chain lift.
    if (!summitDone && c.s > T.lift.s1 + 3) {
      summitDone = true
      sfx.summit()
      pay(PICKUPS.summit, 'SUMMIT!', '#e9f6ff', 1.2)
    }
    // Bends: steady (PERFECT LEAN) or on two wheels and back (DRIFT KING).
    const bi = c.air ? bendI : bendAt(c.s)
    if (bi !== bendI) {
      if (bendRec && !c.crashed) judgeBend(bendRec)
      bendI = bi
      bendRec = bi >= 0 ? { i: bi, maxTip: 0, tipT: 0, vSum: 0, n: 0, vSafe: bendSafe(bi, st.grip) } : null
    }
    if (bendRec && !c.air) {
      const a = Math.abs(c.tip)
      bendRec.maxTip = Math.max(bendRec.maxTip, a)
      if (a > LEAN.green) bendRec.tipT += dt
      bendRec.vSum += v
      bendRec.n++
    }
    // Gem Run tumbleweeds.
    if (lane === 1) {
      for (const w of weeds) {
        if (w.hit || prevS > w.s || c.s < w.s) continue
        if (Math.abs(w.m.position.x - railX(w.s, 1)) < 1.8) {
          w.hit = true
          c.v *= 0.82
          sfx.tumbleweed()
          fx.chunks(w.m.position, 18, '#b88a4a', 1, 0.25)
          hud.pop('TUMBLEWEED!', '#e8c07a')
        }
      }
    }
    // Hazards.
    for (const h of hz) {
      const r = hazardStep(h, c, v, dt)
      if (r) crash = r
    }
    bearStep(c, v, dt)
    return crash
  }

  function bendSafe(i, grip) {
    const [s0, s1] = T.bends[i]
    let m = Infinity
    for (let s = s0 + 1; s < s1; s += 3) m = Math.min(m, safeSpeed(s, grip))
    return m
  }
  function judgeBend(r) {
    if (!r.n || r.vSafe > 70) return
    const avg = r.vSum / r.n
    if (avg < 0.6 * r.vSafe) return
    if (r.tipT >= PICKUPS.driftTime) {
      sfx.leanBonus(3)
      pay(PICKUPS.leanDrift, 'DRIFT KING!', '#ff9a2a', 1.35)
    } else if (r.maxTip <= LEAN.green) {
      sfx.leanBonus(r.maxTip < 0.25 ? 2 : 1)
      pay(PICKUPS.leanPerfect, 'PERFECT LEAN!', '#5dff6a', 1.15)
    }
  }

  // --- Hazard logic -----------------------------------------------------------------------------
  function hazardStep(h, c, v, dt) {
    if (h.phase === 'idle') {
      const lead = h.at - h.trigger + (Math.max(0, v) * Math.max(0, v)) / (2 * CART.brake)
      if (c.s < h.at - lead || c.s > h.at) return null
      // One at a time: wait until the cart is past every hazard before this one.
      for (const o of hz) if (o !== h && o.at < h.at && c.s < o.at + 2) return null
      h.phase = 'active'
      h.t = 0
      startHazard(h, c, v)
      return null
    }
    if (h.phase !== 'active') return null
    h.t += dt
    h.blocked = hazardBlocked(h)
    if (h.blocked && c.s < h.at && c.s > h.at - 40 && Math.abs(v) < 0.6) h.waited = true
    // The cart reaches the line while it is blocked.
    if (h.blocked && !c.air && c.s >= h.at - 1.3 && c.s < h.at + 3) {
      if (h.soft) {
        if (!h.bumped && v > 2) {
          h.bumped = true
          c.v *= 0.35
          scatter(h)
          sfx.sheep()
          sfx.animalHit(0.6)
          fx.chunks(cartPos(tmp, c, 1.2), 26, '#ffffff', 1.2, 0.35, 5)
          hud.pop('BAAA! Too fast!', '#ffffff')
        }
      } else if (v >= h.bump) {
        h.phase = 'done'
        h.blocked = false
        return h.kind === 'bridge' ? 'splash' : h.kind
      } else {
        if (v > 2.5 && !h.bumped) {
          h.bumped = true
          sfx.animalHit(0.8)
          fx.stars(cartPos(tmp, c, 2), 8)
          sfx.dizzy()
          cam.kick(0.5)
          hud.pop(h.kind === 'bridge' ? 'BONK! Wait for green!' : h.kind === 'rocks' ? 'CRUNCH!' : 'OOF! The moose says no!', '#ffb36a', 1.1)
          if (h.kind === 'herd') {
            sfx.moose()
            const moose = h.actors.find((a) => a.kind === 'moose')
            if (moose) moose.mode = 'rear'
          }
          if (h.kind === 'rocks') sfx.boulderHit()
        }
        c.v = Math.min(0, c.v)
        c.s = Math.min(c.s, h.at - 1.3)
      }
    }
    const done = h.kind === 'bridge' ? h.t >= h.cross : h.t >= h.win[1]
    if (done) {
      h.phase = 'done'
      h.blocked = false
      if (h.waited && !h.bumped && c.s < h.at) {
        sfx.leanBonus(2)
        pay(h.bonus, h.kind === 'bridge' ? 'PATIENT!' : h.id === 'sheep' ? 'SHEPHERD FRIEND!' : h.kind === 'rocks' ? 'SAFE AND SOUND!' : 'NATURE FRIEND!', '#5dff6a', 1.2)
      }
      goT = 1.4
    }
    return null
  }
  function startHazard(h, c, v) {
    const eta = (h.at - c.s) / Math.max(6, v)
    hud.banner(h.name, h.sub)
    if (h.kind === 'herd') {
      h.group.visible = true
      const dir = h.id === 'deer' ? 1 : -1
      const n = h.actors.length
      const tEnter = clamp(eta * 0.55, 1, 3.6)
      h.win = [tEnter - 0.3, tEnter + h.cross]
      h.actors.forEach((a, i) => {
        a.dir = dir
        a.x = -dir * a.side0
        const tc = tEnter + ((i + 0.5) * h.cross) / n
        a.spd = clamp(a.side0 / tc, h.id === 'sheep' ? 1.6 : 2.6, h.id === 'sheep' ? 4 : 9)
        a.mode = a.spd > 4.5 ? 'run' : 'walk'
        a.paused = 0
      })
      if (h.id === 'deer') sfx.deer()
      else sfx.sheep()
      sfx.hooves(h.id === 'sheep' ? 0.6 : 1)
    } else if (h.kind === 'rocks') {
      h.group.visible = true
      for (const a of h.actors) {
        a.x = -34 - a.i * 3
        a.y = 16 + a.i * 2
        a.t0 = h.early + a.i * 0.55
        a.settled = false
      }
      h.win = [h.early, h.early + h.cross]
      sfx.rockslide()
    } else if (h.kind === 'bridge') {
      sfx.bridgeHorn()
      sfx.bridgeCreak(2.5)
      sfx.barrier()
    }
  }
  // Blocked for the whole crossing window (the herd streams across it, the rocks roll through it).
  function hazardBlocked(h) {
    if (h.kind === 'bridge') return h.t < h.cross
    return h.t >= h.win[0] && h.t < h.win[1]
  }
  function scatter(h) {
    for (const a of h.actors) {
      a.scatter = 1
      a.mode = 'run'
      a.spd = 7 + Math.random() * 3
    }
  }
  function cartPos(out, c, up = 1) {
    return out.set(railX(c.s, lane), c.y + RAIL_TOP + up, zAt(c.s))
  }

  // The bear: waiting too long near the deer crossing brings it out of the trees.
  function bearStep(c, v, dt) {
    if (bear.phase === 'idle') {
      if (c.s > BEAR.s0 && c.s < BEAR.s1 && Math.abs(v) < 0.3 && !c.air) bear.still += dt
      else bear.still = Math.max(0, bear.still - dt * 0.5)
      if (bear.still > BEAR.wait) {
        bear.phase = 'coming'
        bear.t = 0
        bear.fromS = c.s
        bear.s = c.s - 28
        bear.x = -6
        bear.m.visible = true
        sfx.bear()
        hud.banner('A BEAR!', 'GO GO GO!')
      }
    } else if (bear.phase === 'coming') {
      bear.t += dt
      bear.s = Math.min(c.s - 3.5, bear.s + dt * 8.5)
      bear.x += (0 - bear.x) * Math.min(1, dt * 1.5)
      if (c.s > bear.fromS + 10) {
        bear.phase = 'leave'
        bear.t = 0
        sfx.bear()
        hud.pop('PHEW! Escaped the bear!', '#5dff6a', 1.1)
      } else if (bear.t > BEAR.warn) {
        bear.phase = 'leave'
        bear.t = 0
        c.fuel = Math.max(0, c.fuel - c.fuel * BEAR.fuelLoss - 0.5)
        sfx.bear()
        sfx.animalHit(1)
        sfx.dizzy()
        cam.kick(0.8)
        fx.stars(cartPos(tmp, c, 2), 10)
        fx.chunks(cartPos(tmp, c, 1), 20, '#ff4a3a', 1, 0.3)
        hud.pop('The bear swiped your fuel!', '#ff8a7a', 1.15)
      }
    } else if (bear.phase === 'leave') {
      bear.t += dt
      bear.x -= dt * 7
      if (bear.t > 4) {
        bear.phase = 'gone'
        bear.m.visible = false
      }
    }
  }

  // --- Per frame: models, signals, HUD -------------------------------------------------------------
  function update(dt, t, c, riding) {
    comboT -= dt
    goT -= dt
    const s = c ? c.s : 0
    // Coins / gems: spin those near the cart (others keep their last pose).
    const lo = s - 40
    const hi = s + 420
    for (const it of items) if (it.s > lo && it.s < hi && !it.got) placeItem(it, t)
    for (let i = popping.length - 1; i >= 0; i--) {
      const p = popping[i]
      p.t += dt * 3.2
      placeItem(p.it, t, Math.min(1, p.t))
      if (p.t >= 1) popping.splice(i, 1)
    }
    coinMesh.instanceMatrix.needsUpdate = true
    gemMesh.instanceMatrix.needsUpdate = true
    for (const f of fuels) if (f.m.visible && Math.abs(f.s - s) < 400) ((f.m.rotation.y = t * 1.6), (f.m.position.y = railY(f.s) + 1.1 + Math.sin(t * 2 + f.s) * 0.15))
    // Boost pad arrows share one material: pulse it.
    const padMat = pads[0]?.m.userData.arrowsMat
    if (padMat) padMat.emissiveIntensity = 1.2 + 1.6 * (0.5 + 0.5 * Math.sin(t * 9))
    if (ticket.visible) {
      ticket.rotation.y = t * 1.4
      ticket.position.y = railY(ticketS) + 2.2 + Math.sin(t * 2) * 0.3
      if (Math.abs(ticketS - s) < 300 && Math.random() < 0.3) fx.glint(ticket.position, 1, '#ffd23a', 1.2)
    }
    // Speed gates: green when the current speed is inside the band.
    if (c) {
      const v = c.air ? c.vx : c.v
      for (const g of gates) {
        const mat = g.m.userData.ringMat
        if (!mat || g.passed || Math.abs(g.s - s) > 160) continue
        const ok = v >= g.lo && v <= g.hi
        mat.color.set(ok ? '#3aff5a' : v < g.lo ? '#3ad4ff' : '#ff4a3a')
        if (mat.emissive) mat.emissive.copy(mat.color)
      }
    }
    // Herds.
    for (const h of [H.deer, H.sheep]) {
      if (!h.group.visible && Math.abs(h.at - s) < 260 && h.phase !== 'done') {
        h.group.visible = true
        for (const a of h.actors) {
          a.dir = h.id === 'deer' ? 1 : -1
          a.x = -a.dir * a.side0
        }
      }
      if (!h.group.visible) continue
      if (s > h.at + 160 || (!riding && h.phase === 'idle' && Math.abs(h.at - s) > 260)) {
        h.group.visible = false
        continue
      }
      for (const a of h.actors) {
        if (h.phase === 'active' || a.scatter) {
          if (a.kind === 'moose' && a.mode !== 'rear' && Math.abs(a.x) < 0.8 && a.paused < a.pause) {
            a.paused += dt
            a.mode = 'idle'
          } else if (a.mode === 'rear') {
            a.paused += dt
            if (a.paused > a.pause + 1.6) a.mode = 'walk'
          } else {
            if (a.mode === 'idle') a.mode = a.spd > 4.5 ? 'run' : 'walk'
            a.x += a.dir * a.spd * dt
          }
          if (a.x * a.dir > 22) a.mode = 'graze'
          if (a.mode === 'graze') a.x = a.dir * Math.min(Math.abs(a.x), 24)
        }
        const sx = h.at + a.ds
        a.m.position.set(railX(sx) + a.x, trackHeight(sx) + 0.02 + (h.id === 'sheep' ? 0 : 0), zAt(sx))
        a.m.rotation.y = a.mode === 'graze' || a.mode === 'idle' ? Math.PI / 2 * a.dir + Math.sin(t * 0.3 + a.i) * 0.6 : a.mode === 'rear' ? Math.PI : (-a.dir * Math.PI) / 2
        animateAnimal(a.m, t + a.i * 0.37, a.mode, a.mode === 'run' ? a.spd / 5 : 1)
      }
    }
    // Bear.
    if (bear.m.visible && c) {
      const bs = bear.phase === 'leave' ? bear.s : Math.min(bear.s, c.s - 3.5)
      bear.m.position.set(railX(bs) + bear.x, trackHeight(bs), zAt(bs))
      bear.m.rotation.y = bear.phase === 'leave' ? Math.PI / 2 : 0
      animateAnimal(bear.m, t, bear.phase === 'coming' ? (bear.t > BEAR.warn - 0.8 ? 'rear' : 'charge') : 'run', 1.4)
    }
    // Boulders.
    if (rocks.group.visible) {
      for (const a of rocks.actors) {
        if (rocks.phase === 'active' && h_t(rocks) > a.t0 && !a.settled) {
          const sp = 13
          a.x += sp * dt
          a.y = Math.max(0, a.y - dt * 9)
          a.spin += (sp / a.r) * dt
          if (a.x > 14 + a.i * 2) {
            a.settled = true
            sfx.boulderHit()
          }
          if (Math.random() < 0.4) fx.dust(tmp.set(railX(rocks.at + a.ds) + a.x, trackHeight(rocks.at + a.ds) + 0.3, zAt(rocks.at + a.ds)), 2, '#9a8a7a')
        }
        const sx = rocks.at + a.ds
        a.m.position.set(railX(sx) + a.x, Math.max(trackHeight(sx), VALLEY_Y) + a.r * 0.9 + a.y, zAt(sx))
        a.m.rotation.z = -a.spin
      }
      if (rocks.phase === 'active') sfx.rumble(0.8)
      if (s > rocks.at + 200) rocks.group.visible = false
    }
    // Drawbridge.
    {
      const h = bridge
      let target = 0
      if (h.phase === 'active') {
        const up = 2.6
        const down = h.cross - 2.6
        target = h.t < up ? h.t / up : h.t < down ? 1 : Math.max(0, 1 - (h.t - down) / 2.6)
      }
      bridge.angle += (target - bridge.angle) * Math.min(1, dt * 6)
      bridge.span.rotation.x = bridge.angle * 1.15
      winch.userData.drum && (winch.userData.drum.rotation.x += (target - bridge.angle) * 20 * dt)
      const red = h.phase === 'active'
      const ud = bridge.tower.userData
      if (ud.red) ud.red.emissiveIntensity = red ? 2.5 + Math.sin(t * 10) * 1 : 0.1
      if (ud.green) ud.green.emissiveIntensity = red ? 0.1 : 2.2
      if (ud.arm) ud.arm.rotation.z += ((red ? 0 : 1.35) - ud.arm.rotation.z) * Math.min(1, dt * 4)
    }
    // Windsocks: stream with the gust.
    for (const m of socks) {
      const sock = m.userData.sock
      if (!sock) continue
      const k = wind.phase === 'gust' ? 1 : wind.phase === 'warn' ? 0.5 : 0.15
      sock.rotation.y += ((wind.dir > 0 ? 0 : Math.PI) + Math.sin(t * 3) * 0.2 * (1 - k) - sock.rotation.y) * Math.min(1, dt * 3)
      sock.rotation.z = -(1 - k) * 0.9
    }
    if (c && wind.phase === 'gust' && Math.random() < 0.7) fx.gust(cartPos(tmp, c, 0), wind.dir, '#f2fbff', 2)
    // Tumbleweeds: rolling back and forth across the Gem Run.
    for (const w of weeds) {
      if (Math.abs(w.s - s) > 300) continue
      const u = Math.sin(t * 0.9 + w.ph)
      w.m.position.set(railX(w.s, 1) + u * 9, trackHeight(w.s) + 0.6 + Math.abs(Math.sin(t * 4 + w.ph)) * 0.8, zAt(w.s))
      w.m.rotation.z = -u * 6
    }
    // HUD: the hazard alert and the junction chooser.
    if (c && riding) {
      let text = null
      let kind = 'stop'
      for (const h of hz) {
        if (h.phase !== 'active' || c.s > h.at + 2) continue
        const far = h.at - c.s > 90
        if (h.blocked && far) {
          text = h.kind === 'bridge' ? 'BRIDGE UP AHEAD - SLOW DOWN' : h.kind === 'rocks' ? 'ROCKSLIDE AHEAD!' : h.id === 'sheep' ? 'SHEEP AHEAD - SLOW DOWN' : 'ANIMALS AHEAD - SLOW DOWN'
          kind = h.kind === 'rocks' ? 'stop' : 'info'
        } else if (h.blocked) text = h.kind === 'bridge' ? 'STOP! BRIDGE UP' : h.kind === 'rocks' ? 'ROCKSLIDE! STOP OR BOOST!' : h.id === 'sheep' ? 'SLOW DOWN! SHEEP!' : 'STOP! ANIMALS CROSSING'
        else if (h.kind === 'herd' && h.t < h.win[0]) ((text = h.id === 'sheep' ? 'SHEEP AHEAD - SLOW DOWN' : 'ANIMALS AHEAD - SLOW DOWN'), (kind = 'info'))
      }
      if (!text && goT > 0) ((text = 'GO!'), (kind = 'go'))
      if (!text && c.s > T.station - 40 && c.s < T.goldLine + 6 && !c.arrived) ((text = 'BRAKE ON THE GOLD LINE!'), (kind = 'info'))
      if (text !== alertText || kind !== alertKind) {
        alertText = text
        alertKind = kind
        hud.alert(text, kind)
      }
      if (text && (alertText.includes('ANIMAL') || alertText.includes('SHEEP') || alertText.includes('BRIDGE'))) sfx.warningBell()
      hud.junction(!laneDecided && c.s > J.choose - 90 && c.s < J.choose ? laneSel : null)
    }
  }
  const h_t = (h) => h.t

  return {
    reset,
    revive,
    beforeStep,
    afterStep,
    update,
    // The Gem Run's extra sideways offset at s for the cart (0 on the safe lane).
    laneX: (s) => (lane ? branchX(s) : 0),
    get lane() {
      return lane
    },
    pickLane(dir) {
      if (!laneDecided) laneSel = dir
    },
    // Golden Station: the cart stopped at s.
    arrived(s) {
      const off = Math.abs(s - T.goldLine)
      if (off <= PICKUPS.stopWindow) {
        sfx.perfectStop()
        pay(PICKUPS.perfectStop, 'PERFECT STOP!', '#ffd23a', 1.5)
        return true
      }
      hud.pop(`${off.toFixed(1)} m off the gold line`, '#ffffff')
      return false
    },
    // The lean meter / bend sign: the push expected in the next bend.
    windSide: () => wind.side,
    get coins() {
      return coins
    },
    // Dev (browser tests): the live hazard states (phase 'idle' | 'active' | 'done', blocked, at...).
    get hazards() {
      return hz
    },
    root,
  }
}
