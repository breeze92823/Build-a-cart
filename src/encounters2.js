// Act 2's encounters (past the Golden Gate), run by encounters.js alongside the first
// half's: crossings (stampede, jaguar, gators, penguins, polar bear), timed blasts
// (fire jets, geysers, big waves), side rams (bull, goats: brace by leaning INTO them),
// thieves (monkey, seagull, eagles: shake them off with A / D, or boost), chasers
// (the temple boulder, the wolf pack: stay ahead), the avalanche (shelter in a snow
// shed, or dig out), the singing crystals, magma drips, Titan Peak's summit, the
// Act 2 corner grades (PERFECT / GOOD / SLOPPY with a streak) and the Glacier Gap.
// Everything is placed along the 2D path with pathPoint (sideways = to the right).
import { Group, Vector3 } from 'three'
import { CART, HAZARDS2, LEAN, PICKUPS, TRACK } from './config.js'
import { CORNERS, bendAt, pathPoint, pathYaw, safeSpeed, trackHeight } from './cartPhysics.js'
import { RAIL_TOP } from './track.js'
import { addCash, bonusCash, spend, state } from './state.js'
import { animateAnimal, animateBird, buildAnimal, buildEagle, buildSeagull } from './scenery/animals.js'
import * as Q from './scenery/props2.js'
import { mulberry32 } from './textures.js'
import { sfx } from './audio/index.js'

const T = TRACK
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`
const SHEDS = T.tunnels.filter((t) => t.name === 'Snow Shed')
const inShed = (s) => SHEDS.some((t) => s > t.s0 + 2 && s < t.s1 - 2)
// The Crystal Caverns' singing crystals: [s, side].
const CHIMES = []
for (let i = 0; i < 12; i++) CHIMES.push([4330 + i * 12, i % 2 ? 1 : -1])
const DRIPS = [4020, 4060, 4100, 4140, 4200]

// Facing for a model that faces -Z: along the line (forward), or across it towards `dir` (+1 = right).
const alongYaw = (s) => pathYaw(s)
const acrossYaw = (s, dir) => pathYaw(s) - (dir * Math.PI) / 2

export function createEncounters2(root, deps) {
  const { fx, hud, cam } = deps
  const g = new Group()
  root.add(g)
  const rand = mulberry32(777)
  const p = new Vector3()
  const q = new Vector3()
  let eventCash = 1
  const pay = (m, text, color = '#5dff6a', size = 1.15) => {
    const got = addCash(bonusCash(m, eventCash))
    hud.pop(`${text} +${money(got)}`, color, size)
    return got
  }

  // --- Models -------------------------------------------------------------------------------
  const hz = HAZARDS2.map((h) => ({ ...h, phase: 'idle', t: 0, actors: [], group: null, waited: false, bumped: false, blocked: false }))
  const H = Object.fromEntries(hz.map((h) => [h.id, h]))
  function makeGroup(h) {
    h.group = new Group()
    h.group.visible = false
    g.add(h.group)
    return h.group
  }
  // Crossings.
  for (const h of hz.filter((x) => x.kind === 'herd')) {
    const grp = makeGroup(h)
    const kinds =
      h.id === 'stampede' ? ['longhorn', 'longhorn', 'bull', 'longhorn', 'longhorn', 'longhorn', 'longhorn', 'longhorn', 'longhorn']
      : h.id === 'gators' ? ['alligator', 'alligator', 'alligator']
      : h.id === 'penguins' ? ['penguin', 'penguin', 'penguin', 'penguin', 'penguin', 'penguin', 'penguin', 'penguin', 'penguin', 'penguin']
      : [h.animal]
    kinds.forEach((kind, i) => {
      const m = buildAnimal(kind, { seed: i * 13 + h.at })
      if (h.solo) m.scale.setScalar(1.15)
      grp.add(m)
      h.actors.push({ m, kind, i, ds: h.solo ? 0 : (i % 3) - 1 + (rand() - 0.5) * (h.id === 'stampede' ? 9 : 4), side0: 14 + rand() * 7, x: 0, spd: 3, mode: 'idle' })
    })
  }
  // Fire jets / geysers / waves.
  for (const h of hz.filter((x) => x.kind === 'jets' || x.kind === 'geysers' || x.kind === 'wave')) {
    const grp = makeGroup(h)
    if (h.kind === 'wave') {
      const w = Q.waveCrest(16)
      grp.add(w)
      h.actors.push({ m: w })
    } else {
      for (let i = 0; i < 3; i++) {
        const v = h.kind === 'jets' ? Q.fireVent() : Q.geyserVent()
        grp.add(v)
        h.actors.push({ m: v, ds: (i - 1) * 5, side: i % 2 ? 1 : -1, part: v.userData.jet ?? v.userData.plume ?? null })
      }
    }
  }
  // Rams.
  for (const h of hz.filter((x) => x.kind === 'ram')) {
    const grp = makeGroup(h)
    const m = buildAnimal(h.animal, { seed: h.at })
    grp.add(m)
    h.actors.push({ m, x: 0 })
  }
  // Thieves.
  for (const h of hz.filter((x) => x.kind === 'thief')) {
    const grp = makeGroup(h)
    const m = h.animal === 'eagle' ? buildEagle() : h.animal === 'seagull' ? buildSeagull() : buildAnimal('monkey', { seed: h.at })
    if (h.animal !== 'monkey') m.scale.setScalar(h.animal === 'eagle' ? 2.4 : 2)
    grp.add(m)
    h.actors.push({ m })
  }
  // Chasers.
  for (const h of hz.filter((x) => x.kind === 'chase')) {
    const grp = makeGroup(h)
    if (h.id === 'boulder') {
      const b = Q.rollingBoulderTemple()
      grp.add(b)
      h.actors.push({ m: b, r: b.userData.radius ?? 2.5, ds: 0, lat: 0 })
    } else {
      for (let i = 0; i < 5; i++) {
        const w = buildAnimal('wolf', { seed: 300 + i })
        grp.add(w)
        h.actors.push({ m: w, ds: -i * 2.6 - rand() * 2, lat: (i % 2 ? 1 : -1) * (1.4 + rand() * 2.2) })
      }
    }
  }
  // The avalanche: a snow wall that pours down across the ridge.
  const av = H.avalanche
  makeGroup(av)
  for (let i = 0; i < 4; i++) {
    const w = Q.avalancheWave(30)
    av.group.add(w)
    av.actors.push({ m: w, s: av.a0 + 10 + i * ((av.a1 - av.a0 - 20) / 3) })
  }
  const pile = new Group() // snow heaped on a buried cart
  for (let i = 0; i < 7; i++) {
    const b = Q.iceBlock(0.9 + rand() * 0.6, rand)
    b.position.set((rand() - 0.5) * 3, rand() * 1.2, (rand() - 0.5) * 4)
    pile.add(b)
  }
  pile.visible = false
  g.add(pile)
  // Singing crystals.
  const chimes = CHIMES.map(([s, side], i) => {
    const m = Q.chimeCrystal(['#7ae8ff', '#b47aff', '#ff7ae0', '#7aff9a'][i % 4])
    pathPoint(s, side * 3.4, p)
    m.position.set(p.x, p.y, p.z)
    m.rotation.y = alongYaw(s)
    g.add(m)
    return { s, m, rung: false, glow: 0 }
  })
  // Magma drips in the Lava Tubes.
  const drips = DRIPS.map((s) => {
    const m = Q.magmaDrip()
    m.visible = false
    g.add(m)
    return { s, m, y: 0, v: 0, t: rand() * 3, lat: (rand() - 0.5) * 6 }
  })

  // --- Run state ------------------------------------------------------------------------------
  let lastLean = 0
  let flips = 0
  let thief = null // { h, t }
  let buried = false
  let digs = 0
  let lastThrottle = 0
  let ram = null // { h, t, eta, side, hit }
  let side = 0 // extra push this step (rams)
  let sideT = 0
  let streak = 0
  let corner = null
  let summitDone = false
  let glacierDone = false
  let melodyN = 0
  let alert = null

  function reset(c, ev) {
    eventCash = ev
    for (const h of hz) resetHazard(h)
    thief = null
    buried = false
    digs = 0
    ram = null
    side = sideT = 0
    streak = 0
    corner = null
    summitDone = c.s > 6580
    glacierDone = false
    melodyN = 0
    pile.visible = false
    for (const ch of chimes) ch.rung = false
    alert = null
  }
  function resetHazard(h) {
    h.phase = 'idle'
    h.t = 0
    h.waited = h.bumped = h.blocked = false
    h.group.visible = false
    for (const a of h.actors) {
      a.scatter = 0
      a.mode = 'idle'
    }
  }
  function revive(s) {
    for (const h of hz) if ((h.at ?? h.s0 ?? h.a0) > s - 5) resetHazard(h)
    thief = null
    buried = false
    pile.visible = false
    ram = null
    side = sideT = 0
    corner = null
    if (s < 6580) summitDone = false
  }

  // --- Before each physics step ---------------------------------------------------------------
  function beforeStep(c, input, dt) {
    // Thieves: count A / D flips while one is hanging on.
    const l = input.lean ?? 0
    if (thief && Math.abs(l) > 0.5 && Math.sign(l) !== Math.sign(lastLean)) flips++
    if (Math.abs(l) > 0.5) lastLean = l
    // Buried: tap the gas to dig.
    if (buried) {
      const th = input.throttle ?? 0
      if (th > 0.5 && lastThrottle <= 0.5) {
        digs++
        sfx.digTick(digs / av.dig)
        pathPoint(c.s, 0, p)
        fx.chunks(p.set(p.x, p.y + 1.5, p.z), 10, '#f4f8ff', 0.9, 0.3, 6)
      }
      lastThrottle = th
      input.throttle = 0
      c.held = true
    } else lastThrottle = input.throttle ?? 0
    // A ram's shove into the lean meter.
    if (sideT > 0) {
      sideT -= dt
      input.side = (input.side ?? 0) + side * Math.max(0, sideT / 0.35)
    }
    for (const h of hz) if (h.blocked && !h.soft && c.s > (h.at ?? 0) - 40 && c.s < (h.at ?? 0)) c.held = true
    return input
  }

  // --- After each physics step ----------------------------------------------------------------
  function afterStep(c, st, prevS, dt) {
    if (c.crashed) return null
    const v = c.air ? c.vx : c.v
    let crash = null
    for (const h of hz) {
      const r = step(h, c, st, v, dt, prevS)
      if (r) crash = r
    }
    // Summit of Titan Peak.
    if (!summitDone && c.s > 6582) {
      summitDone = true
      sfx.summitBig()
      hud.banner('TOP OF THE WORLD!', 'Titan Peak - 150 m up')
      pay(PICKUPS.summitPeak, 'SUMMIT!', '#ffffff', 1.4)
      fx.confetti(pathPoint(c.s, 0, p).setY(p.y + 4), 80, 1)
    }
    // Singing crystals: they ring if the cart passes fast enough.
    for (let i = 0; i < chimes.length; i++) {
      const ch = chimes[i]
      if (ch.rung || prevS > ch.s || c.s < ch.s) continue
      if (v < 12) {
        melodyN = -99
        continue
      }
      ch.rung = true
      ch.glow = 1
      sfx.chime(i)
      melodyN++
      addCash(bonusCash(PICKUPS.chime, eventCash))
      fx.pickup(ch.m.position.clone().setY(ch.m.position.y + 3), '#7ae8ff', 10)
      if (i === chimes.length - 1 && melodyN === chimes.length) {
        sfx.melody()
        pay(PICKUPS.melody, 'PERFECT MELODY!', '#7ae8ff', 1.3)
      }
    }
    if (prevS < CHIMES[0][0] - 20 && c.s >= CHIMES[0][0] - 20) melodyN = 0
    // Act 2 corners: graded, with a streak.
    if (c.s > T.join) {
      const bi = c.air ? (corner?.i ?? -1) : bendAt(c.s)
      if (bi !== (corner?.i ?? -1)) {
        if (corner) judge(corner)
        corner = bi >= 0 && CORNERS[bi].deg ? { i: bi, maxTip: 0, vSum: 0, n: 0, vSafe: cornerSafe(CORNERS[bi], st.grip) } : null
      }
      if (corner && !c.air) {
        corner.maxTip = Math.max(corner.maxTip, Math.abs(c.tip))
        corner.vSum += v
        corner.n++
      }
    }
    return crash
  }
  function cornerSafe(cn, grip) {
    let m = Infinity
    for (let s = cn.s0 + 1; s < cn.s1; s += 3) m = Math.min(m, safeSpeed(s, grip))
    return m
  }
  function judge(r) {
    if (!r.n) return
    const avg = r.vSum / r.n
    if (r.maxTip > 1) {
      streak = 0
      sfx.cornerSloppy()
      hud.pop('SLOPPY!', '#ffb36a')
    } else if (r.maxTip <= LEAN.green && avg >= 0.55 * r.vSafe) {
      streak = Math.min(PICKUPS.cornerStreakMax, streak + 1)
      sfx.cornerPerfect(streak)
      pay(PICKUPS.cornerPerfect * streak, streak > 1 ? `PERFECT x${streak}!` : 'PERFECT CORNER!', '#5dff6a', 1 + streak * 0.06)
    } else if (avg >= 0.4 * r.vSafe) {
      pay(PICKUPS.cornerGood, 'GOOD CORNER', '#bfe9ff', 1)
    }
  }

  // One hazard's step. Returns a crash kind or null.
  function step(h, c, st, v, dt, prevS) {
    if (h.kind === 'ram') return stepRam(h, c, st, v, dt)
    if (h.kind === 'thief') return stepThief(h, c, st, dt)
    if (h.kind === 'chase') return stepChase(h, c, st, v, dt)
    if (h.kind === 'avalanche') return stepAvalanche(h, c, v, dt)
    // Crossings and timed blasts.
    if (h.phase === 'idle') {
      const lead = h.at - h.trigger + (Math.max(0, v) * Math.max(0, v)) / (2 * CART.brake)
      if (c.s < h.at - lead || c.s > h.at) return null
      for (const o of hz) if (o !== h && (o.at ?? 0) < h.at && o.at && c.s < o.at + 2 && o.kind !== 'ram' && o.kind !== 'thief') return null
      h.phase = 'active'
      h.t = 0
      start(h, c, v)
      return null
    }
    if (h.phase !== 'active') return null
    h.t += dt
    h.blocked = h.t >= h.win[0] && h.t < h.win[1]
    if (h.blocked && c.s < h.at && c.s > h.at - 40 && Math.abs(v) < 0.6) h.waited = true
    if (h.blocked && !c.air && c.s >= h.at - 1.3 && c.s < h.at + 3) {
      if (h.soft) {
        if (!h.bumped && v > 2) {
          h.bumped = true
          c.v *= 0.4
          for (const a of h.actors) ((a.scatter = 1), (a.mode = 'run'), (a.spd = 6 + Math.random() * 3))
          if (h.kind === 'geysers') {
            sfx.geyser()
            fx.spray(pathPoint(c.s, 0, p).setY(p.y + 1.5), 60)
            hud.splash()
            hud.pop('SOAKED!', '#bfe9ff')
          } else {
            sfx.penguinSquawk()
            sfx.animalHit(0.5)
            fx.chunks(pathPoint(c.s, 0, p).setY(p.y + 1.2), 20, '#1a1a22', 1, 0.3, 6)
            hud.pop('WADDLE WADDLE! Too fast!', '#ffffff')
          }
        }
      } else if (v >= h.bump) {
        h.phase = 'done'
        h.blocked = false
        return h.kind === 'herd' ? 'herd' : h.kind === 'wave' ? 'wave' : 'jets'
      } else {
        if (v > 2.5 && !h.bumped) {
          h.bumped = true
          sfx.animalHit(0.8)
          sfx.dizzy()
          cam.kick(0.5)
          fx.stars(pathPoint(c.s, 0, p).setY(p.y + 2), 8)
          if (h.kind === 'jets') sfx.burn()
          if (h.kind === 'wave') sfx.splashBig()
          hud.pop(h.kind === 'jets' ? 'OUCH, HOT!' : h.kind === 'wave' ? 'SPLOOSH!' : 'BONK!', '#ffb36a', 1.1)
        }
        c.v = Math.min(0, c.v)
        c.s = Math.min(c.s, h.at - 1.3)
      }
    }
    if (h.t >= h.win[1]) {
      h.phase = 'done'
      h.blocked = false
      if (h.waited && !h.bumped && c.s < h.at) {
        sfx.leanBonus(2)
        pay(h.bonus, h.kind === 'herd' ? 'PATIENT RIDER!' : 'PERFECT TIMING!')
      }
    }
    return null
  }
  function start(h, c, v) {
    const eta = (h.at - c.s) / Math.max(6, v)
    hud.banner(h.name, h.sub ?? '')
    h.group.visible = true
    if (h.kind === 'herd') {
      const tEnter = clamp(eta * 0.55, 1, 3.6)
      h.win = [tEnter - 0.3, tEnter + h.cross]
      const dir = h.at % 2 ? 1 : -1
      const n = h.actors.length
      h.actors.forEach((a, i) => {
        a.dir = dir
        a.x = -dir * a.side0
        const tc = tEnter + ((i + 0.5) * h.cross) / n
        a.spd = clamp(a.side0 / tc, h.soft ? 1.5 : 2.4, h.solo ? 12 : 9)
        a.mode = a.spd > 4.5 ? 'run' : 'walk'
      })
      if (h.id === 'stampede') ((sfx.stampede(1.2)), sfx.moo2())
      else if (h.id === 'jaguar') sfx.jaguarGrowl()
      else if (h.id === 'gators') sfx.gatorHiss()
      else if (h.id === 'penguins') sfx.penguinSquawk()
      else if (h.id === 'polar') sfx.polarRoar()
    } else {
      h.win = [h.early, h.early + h.cross]
      if (h.kind === 'jets') sfx.fireJet()
      else if (h.kind === 'geysers') sfx.geyser()
      else sfx.waveCrash()
    }
  }

  // Rams: the attacker charges from the side; lean INTO it to brace.
  function stepRam(h, c, st, v, dt) {
    if (h.phase === 'idle') {
      if (c.s < h.at - Math.max(25, v * 1.8) || c.s > h.at) return null
      h.phase = 'active'
      h.t = 0
      h.eta = clamp((h.at - c.s) / Math.max(4, v), 0.9, 2.5)
      h.group.visible = true
      h.actors[0].x = h.side * 16
      if (h.animal === 'bull') sfx.bullSnort()
      else sfx.goatBleat()
      hud.banner(h.name, 'Lean INTO it to brace!')
      return null
    }
    if (h.phase !== 'active') return null
    h.t += dt
    hud.attack(h.side)
    if (h.t >= h.eta || c.s >= h.at) {
      h.phase = 'done'
      hud.attack(null)
      const braced = (c.lean ?? 0) * h.side > 0.35
      pathPoint(c.s, h.side * 1.2, p)
      p.y += 1.2
      if (braced) {
        sfx.blocked()
        fx.stars(p, 6)
        pay(h.bonus, 'BRACED!', '#5dff6a', 1.2)
        side = h.side * -0.5
      } else {
        sfx.ramHit(1)
        sfx.dizzy()
        cam.kick(0.8)
        fx.stars(p, 10)
        fx.dust(p, 14, '#c9b79a')
        c.v *= 0.55
        c.fuel = Math.max(0, c.fuel - 0.1 * st.tank)
        side = -h.side * 1.1
        hud.pop('RAMMED!', '#ff8a7a', 1.2)
      }
      sideT = 0.35
      h.actors[0].mode = 'rear'
    }
    return null
  }

  // Thieves: hang on for `time` s unless shaken off (A, D, A, D) or boosted away.
  function stepThief(h, c, st, dt) {
    if (h.phase === 'idle') {
      if (c.s < h.at || c.s > h.at + 60 || thief) return null
      h.phase = 'active'
      h.t = 0
      h.group.visible = true
      thief = { h }
      flips = 0
      if (h.animal === 'monkey') sfx.monkeyChatter()
      else if (h.animal === 'eagle') sfx.eagleScreech()
      else sfx.gullCry()
      hud.banner(h.name, 'SHAKE IT OFF! A / D')
      return null
    }
    if (h.phase !== 'active') return null
    h.t += dt
    const shaken = flips >= 4 || c.boostLeft > 0
    hud.prompt('SHAKE IT OFF! A ⇄ D', flips / 4)
    if (shaken) {
      h.phase = 'gone'
      h.t = 0
      thief = null
      hud.prompt(null)
      sfx.shakeOff()
      pay(h.bonus, 'SHOOED!', '#5dff6a', 1.15)
    } else if (h.t >= h.time) {
      h.phase = 'gone'
      h.t = 0
      thief = null
      hud.prompt(null)
      const want = bonusCash(PICKUPS.coin * 30 * PICKUPS.thief, eventCash)
      const took = Math.min(state.cash, want)
      if (took > 0 && spend(took)) {
        sfx.steal()
        hud.pop(`STOLEN! -${money(took)}`, '#ff8a7a', 1.2)
        fx.pickup(pathPoint(c.s, 0, p).setY(p.y + 3), '#ffd23a', 16)
      }
    }
    return null
  }

  // Chasers: stay ahead of them from s0 to s1.
  function stepChase(h, c, st, v, dt) {
    if (h.phase === 'idle') {
      if (c.s < h.s0 || c.s > h.s1) return null
      h.phase = 'active'
      h.t = 0
      h.cs = c.s - (h.id === 'boulder' ? 40 : 34)
      h.v = h.speed
      h.group.visible = true
      if (h.id === 'boulder') sfx.templeRumble()
      else sfx.wolfPack(1)
      hud.banner(h.name, h.sub)
      return null
    }
    if (h.phase === 'active') {
      h.t += dt
      h.v += h.accel * dt
      h.cs += h.v * dt
      const gap = c.s - h.cs
      hud.prompt(`KEEP AHEAD! ${Math.max(0, Math.round(gap))} m`, (c.s - h.s0) / (h.s1 - h.s0))
      if (h.id === 'boulder') sfx.boulderRoll(clamp(1 - gap / 60, 0.2, 1))
      if (c.s >= h.s1) {
        h.phase = 'gone'
        h.t = 0
        hud.prompt(null)
        sfx.leanBonus(3)
        pay(h.bonus, 'ESCAPED!', '#5dff6a', 1.3)
      } else if (gap < 2.5) {
        h.phase = 'gone'
        h.t = 0
        hud.prompt(null)
        pathPoint(c.s, 0, p)
        p.y += 1.5
        cam.kick(1)
        fx.stars(p, 10)
        sfx.dizzy()
        if (h.id === 'boulder') {
          sfx.boulderHit()
          fx.chunks(p, 40, '#a89a7a', 1.6, 0.5)
          c.v = Math.max(c.v, 10)
          c.fuel = Math.max(0, c.fuel * 0.75)
          hud.pop('CRUNCH! The boulder caught you!', '#ffb36a', 1.15)
        } else {
          sfx.ramHit(0.8)
          c.fuel = Math.max(0, c.fuel * (1 - h.fuel))
          hud.pop('The wolves got your fuel!', '#ff8a7a', 1.15)
        }
      }
    }
    return null
  }

  // The avalanche: warning, then it sweeps [a0, a1] for `hold` s. Inside a shed = safe.
  function stepAvalanche(h, c, v, dt) {
    if (h.phase === 'idle') {
      if (c.s < h.trigger || c.s > h.a1) return null
      h.phase = 'warn'
      h.t = 0
      h.group.visible = true
      sfx.avalanche()
      hud.banner(h.name, h.sub)
      return null
    }
    h.t += dt
    if (h.phase === 'warn') {
      sfx.avalancheRumble(clamp(h.t / h.delay, 0.2, 1))
      if (h.t >= h.delay) {
        h.phase = 'sweep'
        h.t = 0
        cam.kick(1)
        if (c.s > h.a1) {
          sfx.leanBonus(3)
          pay(h.bonus, 'OUTRAN IT!', '#5dff6a', 1.3)
        } else if (inShed(c.s)) {
          sfx.leanBonus(2)
          pay(h.bonus, 'SAFE IN THE SHED!', '#5dff6a', 1.3)
        } else if (c.s >= h.a0) bury(c)
      }
    } else if (h.phase === 'sweep') {
      sfx.avalancheRumble(0.7)
      // Arriving into the snow while it still pours: buried too.
      if (!buried && c.s >= h.a0 && c.s <= h.a1 && !inShed(c.s) && h.t < h.hold) bury(c)
      h.blocked = !buried && h.t < h.hold && c.s < h.a0
      if (h.t >= h.hold && !buried) h.phase = 'done'
    }
    if (buried) {
      c.v = 0
      c.held = true
      hud.prompt('TAP W / GAS TO DIG OUT!', digs / h.dig)
      if (digs >= h.dig) {
        buried = false
        pile.visible = false
        c.held = false
        hud.prompt(null)
        sfx.dugOut()
        fx.chunks(pathPoint(c.s, 0, p).setY(p.y + 1.5), 50, '#f4f8ff', 1.6, 0.4, 8)
        hud.pop('DUG OUT!', '#ffffff', 1.3)
        if (h.t >= h.hold) h.phase = 'done'
      }
    }
    return null
  }
  function bury(c) {
    buried = true
    digs = 0
    c.v = 0
    sfx.buried()
    pathPoint(c.s, 0, p)
    pile.position.set(p.x, p.y + RAIL_TOP, p.z)
    pile.rotation.y = alongYaw(c.s)
    pile.visible = true
    fx.chunks(p.set(p.x, p.y + 2, p.z), 40, '#f4f8ff', 1.2, 0.5, 6)
    hud.pop('BURIED!', '#ffffff', 1.3)
  }

  // --- Per frame ---------------------------------------------------------------------------------
  function update(dt, t, c, riding) {
    const s = c ? c.s : -1e9
    // Crossings.
    for (const h of hz) {
      if (!h.group.visible) continue
      const far = Math.abs((h.at ?? h.s0 ?? h.a0) - s) > 420 || (!riding && h.phase === 'idle')
      if (far && h.kind !== 'chase') {
        h.group.visible = false
        continue
      }
      if (h.kind === 'herd') updateHerd(h, dt, t)
      else if (h.kind === 'jets' || h.kind === 'geysers') updateBlast(h, dt, t)
      else if (h.kind === 'wave') updateWave(h, dt, t)
      else if (h.kind === 'ram') updateRam(h, dt, t, c)
      else if (h.kind === 'thief') updateThief(h, dt, t, c)
      else if (h.kind === 'chase') updateChase(h, dt, t, c)
      else if (h.kind === 'avalanche') updateAvalanche(h, dt, t)
    }
    // Herds near the cart stand by the track before they cross.
    for (const h of hz) {
      if (h.kind !== 'herd' || h.phase !== 'idle' || h.group.visible) continue
      if (riding && Math.abs(h.at - s) < 300) {
        h.group.visible = true
        const dir = h.at % 2 ? 1 : -1
        for (const a of h.actors) ((a.dir = dir), (a.x = -dir * a.side0), (a.mode = 'graze'))
      }
    }
    // Chimes glow and fade.
    for (const ch of chimes) {
      if (Math.abs(ch.s - s) > 300) continue
      ch.glow = Math.max(0, ch.glow - dt * 1.5)
      const m = ch.m.userData.glowMat
      if (m) m.emissiveIntensity = 0.6 + ch.glow * 3
    }
    // Magma drips: fall from the tube roof, hiss on the floor.
    if (c && s > 3990 && s < 4240) {
      for (const d of drips) {
        if (Math.abs(d.s - s) > 120) {
          d.m.visible = false
          continue
        }
        d.m.visible = true
        d.t -= dt
        if (d.t <= 0 && d.y <= 0.05) {
          d.y = 7
          d.v = 0
          d.t = 1.2 + Math.random() * 2.5
        }
        if (d.y > 0) {
          d.v -= 20 * dt
          d.y = Math.max(0, d.y + d.v * dt)
          if (d.y === 0) {
            pathPoint(d.s, d.lat, q)
            fx.flame(q.setY(q.y + 0.4), 0, 1.5, 0, 0.8)
            if (Math.abs(d.s - s) < 40) sfx.magmaDrip()
          }
        }
        pathPoint(d.s, d.lat, q)
        d.m.position.set(q.x, q.y + d.y + 0.3, q.z)
      }
    } else for (const d of drips) d.m.visible = false
    // The alert line: hazards that block the way.
    if (c && riding) {
      let text = null
      for (const h of hz) {
        if (!h.blocked || c.s > (h.at ?? h.a0) + 2) continue
        const near = (h.at ?? h.a0) - c.s < 90
        text = near ? `STOP! ${h.name.replace('!', '')}` : `${h.name.replace('!', '')} AHEAD - SLOW DOWN`
      }
      if (H.avalanche.phase === 'warn') text = inShed(s) ? 'STAY IN THE SHED!' : 'AVALANCHE! INTO A SNOW SHED!'
      alert = text
      if (text && text.startsWith('STOP')) sfx.warningBell()
    } else alert = null
  }

  function updateHerd(h, dt, t) {
    for (const a of h.actors) {
      if (h.phase === 'active' || a.scatter) {
        a.x += a.dir * a.spd * dt
        if (a.x * a.dir > 24) a.mode = 'graze'
        else if (a.mode === 'graze' || a.mode === 'idle') a.mode = a.spd > 4.5 ? 'run' : 'walk'
      }
      const sx = h.at + a.ds
      pathPoint(sx, a.x, p)
      a.m.position.set(p.x, p.y + (a.kind === 'jaguar' && a.mode === 'run' ? Math.abs(Math.sin(t * 9)) * 0.5 : 0), p.z)
      a.m.rotation.y = a.mode === 'graze' || a.mode === 'idle' ? acrossYaw(sx, a.dir) + Math.sin(t * 0.3 + a.i) * 0.7 : acrossYaw(sx, a.dir)
      const mode = a.kind === 'alligator' && a.mode !== 'graze' ? 'walk' : a.kind === 'jaguar' && a.mode === 'run' ? 'pounce' : a.mode
      animateAnimal(a.m, t + a.i * 0.37, mode, a.mode === 'run' ? a.spd / 5 : 1)
    }
  }
  function updateBlast(h, dt, t) {
    const on = h.phase === 'active' && h.t >= h.win[0] && h.t < h.win[1]
    for (const a of h.actors) {
      const sx = h.at + a.ds
      pathPoint(sx, a.side * 4.2, p)
      a.m.position.set(p.x, p.y, p.z)
      a.m.rotation.y = acrossYaw(sx, -a.side)
      if (a.part) {
        a.part.visible = on || (h.phase === 'active' && h.t < h.win[0] && Math.sin(t * 30) > 0.6)
        a.part.scale.set(1, on ? 1 + Math.sin(t * 40) * 0.1 : 0.3, 1)
      }
      if (on && Math.random() < 0.8) {
        pathPoint(sx, a.side * 3, q)
        q.y += 1.2
        if (h.kind === 'jets') fx.flame(q, -a.side * Math.cos(pathYaw(sx)) * 9, 2, a.side * Math.sin(pathYaw(sx)) * 9, 2.2)
        else fx.ambient(q.setY(q.y + 2), 'mist')
      }
    }
  }
  function updateWave(h, dt, t) {
    const w = h.actors[0].m
    const u = h.phase === 'active' ? clamp((h.t - h.win[0] + 1.2) / (h.cross + 2.4), 0, 1) : 0
    const lat = 24 - u * 48
    pathPoint(h.at, lat, p)
    w.position.set(p.x, p.y - 1, p.z)
    w.rotation.y = pathYaw(h.at) // its curl faces -X: it rolls in from the sea side (+right) across the line
    w.scale.setScalar(0.6 + Math.sin(u * Math.PI) * 0.6)
    w.visible = h.phase === 'active'
    if (h.phase === 'active' && h.blocked && Math.random() < 0.9) {
      pathPoint(h.at + (Math.random() - 0.5) * 10, lat * 0.6, q)
      fx.spray(q.setY(q.y + 2), 6)
    }
  }
  function updateRam(h, dt, t, c) {
    const a = h.actors[0]
    if (h.phase === 'active') a.x += (0 - a.x) * Math.min(1, dt * (2.2 / Math.max(0.4, h.eta - h.t + 0.2)))
    else if (h.phase === 'done') a.x += h.side * dt * 8
    const sx = c && h.phase === 'active' ? c.s + Math.max(0, (h.eta - h.t) * 2) : h.at
    pathPoint(sx, a.x, p)
    a.m.position.set(p.x, p.y, p.z)
    a.m.rotation.y = acrossYaw(sx, h.phase === 'done' ? h.side : -h.side)
    animateAnimal(a.m, t, h.phase === 'active' ? 'ram' : h.phase === 'done' ? 'run' : 'idle', 1.6)
    if (h.phase === 'done' && Math.abs(a.x) > 30) h.group.visible = false
  }
  function updateThief(h, dt, t, c) {
    const m = h.actors[0].m
    if (!c) return
    if (h.phase === 'active') {
      // Riding on the cart, tugging at it.
      pathPoint(c.s, 0, p)
      const bird = h.animal !== 'monkey'
      m.position.set(p.x, p.y + RAIL_TOP + (bird ? 2.6 + Math.sin(t * 6) * 0.3 : 1.4), p.z)
      m.rotation.y = alongYaw(c.s) + Math.PI + Math.sin(t * 8) * 0.3
      if (bird) animateBird(m, t, 1, 0.8)
      else animateAnimal(m, t, 'steal', 1.5)
    } else if (h.phase === 'gone') {
      h.t += dt
      m.position.y += dt * 9
      m.position.x += dt * 6
      if (h.animal === 'monkey') animateAnimal(m, t, 'run', 2)
      else animateBird(m, t, 1)
      if (h.t > 2.5) h.group.visible = false
    }
  }
  function updateChase(h, dt, t, c) {
    if (h.phase === 'idle') return
    if (h.phase === 'gone') {
      h.t += dt
      if (h.t > 3) h.group.visible = false
    }
    const cs = h.phase === 'active' ? h.cs : h.cs + h.t * 4
    for (const a of h.actors) {
      const sx = cs + a.ds
      pathPoint(sx, a.lat, p)
      if (h.id === 'boulder') {
        a.m.position.set(p.x, p.y + a.r, p.z)
        a.m.rotation.y = alongYaw(sx)
        a.m.rotateX(-(h.v * dt) / a.r)
        if (h.phase === 'active' && Math.random() < 0.12) fx.dust(p, 1, '#a89a7a')
      } else {
        a.m.position.set(p.x, p.y, p.z)
        a.m.rotation.y = alongYaw(sx)
        animateAnimal(a.m, t + a.ds, 'run', h.v / 6)
      }
    }
  }
  function updateAvalanche(h, dt, t) {
    const u = h.phase === 'warn' ? h.t / h.delay : h.phase === 'sweep' ? 1 + h.t / h.hold : 2
    for (const a of h.actors) {
      // Pours down from the uphill (left) side, across the line, and on down the slope.
      const lat = -70 + clamp(u, 0, 2) * 55
      pathPoint(a.s, lat, p)
      a.m.position.set(p.x, p.y + Math.max(0, 30 - u * 22), p.z)
      a.m.rotation.y = acrossYaw(a.s, 1) + Math.PI / 2
      const k = 0.8 + Math.sin(t * 7 + a.s) * 0.05
      a.m.scale.set(k, k, k)
      for (const pf of a.m.userData.puffs ?? []) pf.position.y += Math.sin(t * 9 + pf.id) * 0.02
      if (h.phase !== 'done' && Math.random() < 0.6) fx.chunks(q.set(a.m.position.x, a.m.position.y + 4, a.m.position.z), 2, '#f4f8ff', 1.2, 0.5, 3)
    }
    if (h.phase === 'done' && h.t > h.hold + 3) h.group.visible = false
  }

  return {
    reset,
    revive,
    beforeStep,
    afterStep,
    update,
    get alert() {
      return alert
    },
    get busy() {
      return buried || !!thief
    },
    glacier(pos) {
      if (glacierDone) return
      glacierDone = true
      sfx.glacierJump()
      hud.banner('GLACIER GAP CLEARED!', '')
      pay(PICKUPS.glacier, 'GLACIER JUMP!', '#bfe9ff', 1.5)
      fx.confetti(pos, 120, 1.2)
      fx.chunks(pos, 40, '#e8f6ff', 1.4, 0.35, 8)
    },
    terminus() {
      sfx.terminus()
      pay(PICKUPS.terminus, 'YOU REACHED THE DIAMOND TERMINUS!', '#b9f6ff', 1.5)
    },
  }
}
