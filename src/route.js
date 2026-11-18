// Scenery for the stretches the line used to leave empty: Sunny Farm, Whispering
// Forest, Switchback Hills, the Mountain Pass (chain lift, summit, tunnel), Woolly
// Pasture, the rockslide ridge, fish at the river, the sandstorm junction and the
// station's gold line, plus distance markers and warning signs along the home track.
// Static pieces are baked (one mesh per material); the living things (windmill, cows,
// farmer, sheep, squirrels, birds, bats, fish, the summit flag, the lift's chain and
// gear) are animated only near the camera and hidden far away.
import { BoxGeometry, Group, Mesh } from 'three'
import { BASES, TRACK, VALLEY } from './config.js'
import { VALLEY_Y, laneX, safeSpeed, trackHeight, trackX, trackXSlope } from './cartPhysics.js'
import { branchX } from './track.js'
import { zAt } from './world.js'
import { block, pillar } from './build.js'
import { bake } from './bake.js'
import { mulberry32 } from './textures.js'
import { animateAnimal, animateBird, animateFish, buildAnimal, buildBat, buildBird, buildFish, eyeMaterial, setEyeGlow } from './scenery/animals.js'
import * as P from './scenery/props.js'
import { sfx } from './audio/index.js'

const T = TRACK
const XS = BASES.xs
const HOME = XS[BASES.home]
const V = VALLEY
// Valley-floor-relative helpers (this module's root sits at VALLEY_Y).
const hY = (s) => trackHeight(s) - VALLEY_Y // rail bed height above the valley floor
const tx = (x0, s) => x0 + trackX(s)
// True if x is at least `gap` m from every track at s (the side tracks curve into
// the home one before the canyon, TRACK.merge).
const clear = (x, s, gap) => XS.every((x0) => Math.abs(x - laneX(x0, HOME, s)) > gap)

function put(parent, obj, x, y, z, yaw = 0, scale = 1) {
  obj.position.set(x, y, z)
  obj.rotation.y = yaw
  if (scale !== 1) obj.scale.setScalar(scale)
  parent.add(obj)
  return obj
}

export function createRoute(scene) {
  const root = new Group()
  root.position.y = VALLEY_Y
  scene.add(root)
  const g = new Group() // static, baked at the end
  const live = [] // { obj, s, x, update(t, dt, near) }
  const rand = mulberry32(9191)
  const yawAt = (s) => -Math.atan(trackXSlope(s))

  // A living thing: hidden past `far`, animated inside `near`.
  function alive(obj, s, update, far = 380) {
    root.add(obj)
    live.push({ obj, s, update, far })
    return obj
  }
  // A random spot in the stretch [s0, s1], `gap` m clear of every track; null if none found.
  function spot(s0, s1, gap, xMin = -V.halfWidth + 20, xMax = V.halfWidth - 20) {
    for (let k = 0; k < 12; k++) {
      const s = s0 + rand() * (s1 - s0)
      const x = xMin + rand() * (xMax - xMin)
      if (clear(x, s, gap)) return { s, x, z: zAt(s) }
    }
    return null
  }
  // A sign beside the home track at s (side +1 = right of it).
  function sign(obj, s, side = 1, off = 3.4) {
    const x = tx(HOME, s) + side * off
    return put(g, obj, x, hY(s), zAt(s), yawAt(s))
  }

  // --- Sunny Farm ---------------------------------------------------------------------------------
  {
    const farmY = 0
    put(g, P.barn(), -138, farmY, zAt(120), Math.PI / 2)
    put(g, P.silo(), -122, farmY, zAt(98))
    put(g, P.silo(), -122, farmY, zAt(142))
    put(g, P.tractor(), -112, farmY, zAt(170), 0.6)
    put(g, P.well(), -104, farmY, zAt(128))
    put(g, P.waterTrough(), 112, farmY, zAt(150), Math.PI / 2)
    put(g, P.pumpkinPatch(rand), -19, farmY, zAt(216))
    put(g, P.pumpkinPatch(rand), 57, farmY, zAt(205))
    put(g, P.scarecrow(), -45, farmY, zAt(212), 0.4)
    for (let i = 0; i < 10; i++) {
      const bale = P.haybale(rand)
      const x = (rand() < 0.5 ? -1 : 1) * (19 + (rand() < 0.5 ? 38 : 0)) + (rand() - 0.5) * 8
      const s = 90 + rand() * 140
      const yaw = rand() * 3
      if (clear(x, s, 4)) put(g, bale, x, farmY, zAt(s), yaw)
    }
    // Cow pasture on the right, fenced.
    for (let i = 0; i < 6; i++) put(g, P.fence(12), 98 + i * 12, farmY, zAt(110))
    for (let i = 0; i < 6; i++) put(g, P.fence(12), 98 + i * 12, farmY, zAt(210))
    for (let i = 0; i < 8; i++) put(g, P.fence(12.5), 98, farmY, zAt(110 + i * 12.5), Math.PI / 2)
    // The windmill.
    const mill = put(new Group(), P.windmill(), 0, 0, 0)
    alive(mill.parent, 80, (t, dt) => mill.userData.rotor && (mill.userData.rotor.rotation.z += dt * 0.9), 900)
    mill.parent.position.set(132, farmY, zAt(70))
    mill.parent.rotation.y = -0.4
    // Cows, chickens and the farmer who waves at passing carts.
    for (let i = 0; i < 7; i++) {
      const cow = buildAnimal('cow', { seed: i + 11 })
      const sx = 120 + rand() * 90
      cow.position.set(104 + rand() * 60, farmY, zAt(sx))
      cow.rotation.y = rand() * 6
      const mode = rand() < 0.6 ? 'graze' : 'idle'
      alive(cow, sx, (t) => animateAnimal(cow, t + i, mode, 0.8))
    }
    for (let i = 0; i < 8; i++) {
      const ch = buildAnimal('chicken', { seed: i + 30 })
      const sx = 120 + rand() * 50
      ch.position.set(-112 + rand() * 18, farmY, zAt(sx))
      const ph = rand() * 6
      alive(ch, sx, (t) => {
        ch.rotation.y = Math.sin(t * 0.4 + ph) * 2
        animateAnimal(ch, t + ph, Math.sin(t * 0.7 + ph) > 0.3 ? 'walk' : 'graze', 1.2)
      })
    }
    const farmer = buildAnimal('farmer', { seed: 2 })
    farmer.position.set(HOME + 6.5, farmY, zAt(150))
    farmer.rotation.y = -Math.PI / 2
    alive(farmer, 150, (t, dt, ctx) => animateAnimal(farmer, t, ctx.cartNear(150, 60) ? 'wave' : 'idle'))
    const dog = buildAnimal('dog', { seed: 4 })
    dog.position.set(HOME + 9, farmY, zAt(155))
    alive(dog, 155, (t, dt, ctx) => {
      const near = ctx.cartNear(155, 40)
      dog.rotation.y = near ? -Math.PI / 2 : Math.sin(t * 0.5)
      animateAnimal(dog, t, near ? 'run' : 'idle', 1.3)
    })
    sign(P.bigSign('SUNNY FARM', 'Hold W to roll!', '#7dff5a'), 60, -1, 9)
  }

  // --- Whispering Forest --------------------------------------------------------------------------
  const F0 = 466
  const F1 = 692
  {
    for (let i = 0; i < 260; i++) {
      const p = spot(F0, F1, 6)
      if (!p) continue
      const r = rand()
      const sc = 0.7 + rand() * 0.6
      const tree = r < 0.55 ? P.pineTree(sc, rand) : r < 0.85 ? P.oakTree(sc, rand) : P.birchTree(sc, rand)
      put(g, tree, p.x, 0, p.z, rand() * 6)
    }
    for (let i = 0; i < 90; i++) {
      const p = spot(F0, F1, 3.2)
      if (!p) continue
      const r = rand()
      put(g, r < 0.4 ? P.bush(rand) : r < 0.6 ? P.mushrooms(rand) : r < 0.75 ? P.log(rand) : r < 0.85 ? P.stump() : P.rock(0.6 + rand() * 0.8, rand), p.x, 0, p.z, rand() * 6)
    }
    // Eyes in the undergrowth: only ever noticed at night.
    const eyeGeo = new BoxGeometry(0.16, 0.1, 0.05)
    for (let i = 0; i < 40; i++) {
      const p = spot(F0, F1, 8)
      if (!p) continue
      const y = 0.5 + rand() * 1.2
      for (const sx of [-0.18, 0.18]) {
        const m = new Mesh(eyeGeo, eyeMaterial)
        m.position.set(p.x + sx, y, p.z)
        g.add(m)
      }
    }
    // Squirrels and the odd deer watching from the trees.
    for (let i = 0; i < 10; i++) {
      const p = spot(F0, F1, 4)
      if (!p) continue
      const sq = buildAnimal('squirrel', { seed: 50 + i })
      sq.position.set(p.x, 0, p.z)
      sq.rotation.y = rand() * 6
      const ph = rand() * 5
      alive(sq, p.s, (t) => animateAnimal(sq, t + ph, Math.sin(t * 0.8 + ph) > 0.5 ? 'run' : 'idle', 2))
    }
    for (let i = 0; i < 4; i++) {
      const p = spot(F0 + 120, F1, 14, -170, -95) ?? spot(F0, F1, 14, 95, 170)
      if (!p) continue
      const d = buildAnimal(i === 0 ? 'stag' : 'deer', { seed: 70 + i })
      d.position.set(p.x, 0, p.z)
      d.rotation.y = rand() * 6
      alive(d, p.s, (t) => animateAnimal(d, t + i, 'graze', 0.8))
    }
    sign(P.bigSign('WHISPERING FOREST', 'Watch for wildlife!', '#5fd14a'), F0 + 6, -1, 9)
    sign(P.crossingSign('deer'), 548, 1)
  }

  // --- Switchback Hills: hills either side, guard rails and chevrons on the outside of each bend ---
  {
    for (let i = 0; i < 26; i++) {
      const p = spot(696, 992, 16, -V.halfWidth + 30, V.halfWidth - 30)
      if (!p) continue
      put(g, P.hillMound(14 + rand() * 18, 3 + rand() * 6, 14 + rand() * 18, rand), p.x, 0, p.z, rand() * 3)
    }
    for (let i = 0; i < 40; i++) {
      const p = spot(696, 992, 7)
      if (p) put(g, rand() < 0.6 ? P.oakTree(0.6 + rand() * 0.5, rand) : P.bush(rand), p.x, 0, p.z, rand() * 6)
    }
    for (const [s0, s1, dx] of T.bends.slice(1)) {
      const vs = (() => {
        let m = Infinity
        for (let s = s0 + 1; s < s1; s += 3) m = Math.min(m, safeSpeed(s, 1))
        return m
      })()
      if (vs > 70) continue
      sign(P.speedSign(Math.floor(vs)), s0 - 55, 1)
      sign(P.speedSign(Math.floor(vs)), s0 - 55, -1)
      // The first half of each bend curves one way, the second the other: rails and
      // chevrons go on the outside of each half.
      const halves = [
        [s0, (s0 + s1) / 2, -Math.sign(dx)],
        [(s0 + s1) / 2, s1, Math.sign(dx)],
      ]
      for (const [a, b, out] of halves) {
        for (let s = a; s < b; s += 6) {
          const x = tx(HOME, s) + out * 3.4
          const rail = P.guardRail(6.2)
          rail.position.set(x, hY(s), zAt(s))
          rail.rotation.y = yawAt(s + 3) + Math.PI / 2
          g.add(rail)
        }
        const mid = (a + b) / 2
        sign(P.chevronBoard(-out), mid, out, 5.2)
      }
    }
    sign(P.bigSign('SWITCHBACK HILLS', 'Brake and lean: A / D', '#b6ff5a'), 698, 1, 9)
  }

  // --- Mountain Pass: peaks, the chain lift, the summit, the tunnel ---------------------------------
  const Tn = T.tunnels[0]
  const chainTex = []
  let gear = null
  let flag = null
  {
    // Snowy peaks around the climb, big ones out at the sides.
    const peaks = [
      [-150, 1080, 90, 70],
      [150, 1060, 80, 60],
      [-160, 1230, 100, 84],
      [160, 1220, 90, 76],
      [-120, 1150, 60, 46],
      [118, 1160, 60, 48],
    ]
    for (const [x, s, w, h] of peaks) put(g, P.mountainPeak(w, h, rand), x, 0, zAt(s), rand() * 3)
    // The mountain the tunnel bores through: rock either side of the (merged) line,
    // with a roof over the track that steps down with the rails.
    const ROCK = '#8f99ad'
    const ROCK_D = '#737d92'
    const SNOW = '#eef5ff'
    const top = 46
    const zs0 = zAt(Tn.s0)
    const zs1 = zAt(Tn.s1)
    const len = zs0 - zs1
    const zc = (zs0 + zs1) / 2
    const edges = [-V.halfWidth + 6, HOME - 4.6, HOME + 4.6, V.halfWidth - 6]
    for (let i = 0; i + 1 < edges.length; i += 2) {
      const x0 = edges[i]
      const x1 = edges[i + 1]
      if (x1 - x0 < 1) continue
      pillar(g, x1 - x0, top, len, (x0 + x1) / 2, 0, zc, i % 4 ? ROCK : ROCK_D)
      pillar(g, (x1 - x0) * 0.8, 4, len * 0.8, (x0 + x1) / 2, top, zc, SNOW)
    }
    for (const x0 of [HOME]) {
      for (let s = Tn.s0; s < Tn.s1; s += 4) {
        const yb = hY(s + 2) + 7.2
        pillar(g, 9.4, top - yb, 4.2, x0, yb, zAt(s + 2), ROCK_D)
      }
      pillar(g, 8, 3, len * 0.7, x0, top, zc, SNOW)
      put(g, P.tunnelPortal(5.4, 6.6), x0, hY(Tn.s0), zAt(Tn.s0) + 0.2)
      put(g, P.tunnelPortal(5.4, 6.6), x0, hY(Tn.s1), zAt(Tn.s1) - 0.2, Math.PI)
    }
    // Lamps inside the home bore.
    for (let s = Tn.s0 + 4; s < Tn.s1; s += 8) {
      for (const side of [-1, 1]) {
        const lamp = P.tunnelLamp()
        lamp.position.set(HOME + side * 4.4, hY(s) + 2.6, zAt(s))
        lamp.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
        g.add(lamp)
      }
    }
    // The chain between the home rails up the lift, in pitched strips.
    const L = T.lift
    const step = 10
    for (let s = L.s0; s < L.s1; s += step) {
      const strip = P.chainStrip(step + 0.05)
      if (strip.userData.tex) chainTex.push(strip.userData.tex)
      const y0 = hY(s)
      const y1 = hY(s + step)
      strip.position.set(tx(HOME, s), y0 + 0.2, zAt(s))
      strip.rotation.x = Math.atan2(y1 - y0, step)
      root.add(strip)
    }
    const house = P.liftMotorHouse()
    house.position.set(HOME + 6.5, hY(L.s0), zAt(L.s0 + 4))
    house.rotation.y = -Math.PI / 2
    root.add(house)
    gear = house.userData.gear ?? null
    // The summit: rock shoulders either side of the home track carry the flag and the
    // viewing platform (the mound under the rails is only a rail-bed wide up there).
    const top0 = hY(1148)
    for (const side of [-1, 1]) {
      pillar(g, 11, top0, 40, HOME + side * 8.4, 0, zAt(1149), side < 0 ? '#8f99ad' : '#737d92')
      pillar(g, 11.2, 0.6, 40.2, HOME + side * 8.4, top0 - 0.3, zAt(1149), '#eef5ff')
    }
    const flagG = P.summitFlag()
    flagG.position.set(HOME - 6, top0 + 0.3, zAt(1146))
    root.add(flagG)
    flag = flagG.userData.flag ?? null
    put(g, P.viewingPlatform(), HOME + 8, top0 + 0.3, zAt(1150), -Math.PI / 2)
    sign(P.bigSign('MOUNTAIN PASS', 'Hold on for the drop!', '#dfefff'), 990, -1, 9)
    // Bats in the home bore: they burst out as the cart dives in.
    const bats = new Group()
    root.add(bats)
    const batList = []
    for (let i = 0; i < 12; i++) {
      const b = buildBat()
      b.scale.setScalar(2.2)
      bats.add(b)
      batList.push({ b, ph: rand() * 6, off: rand() * 10, x: (rand() - 0.5) * 5, y: 3 + rand() * 2.5 })
    }
    bats.visible = false
    live.push({
      obj: bats,
      s: Tn.s0 + 20,
      far: 200,
      fired: false,
      update(t, dt, ctx) {
        const cs = ctx.cartS
        if (cs > Tn.s0 - 30 && cs < Tn.s1 + 40 && ctx.riding) {
          if (!this.fired) {
            this.fired = true
            sfx.bats()
          }
          bats.visible = true
          for (const it of batList) {
            const s = cs - 6 - ((t * 9 + it.off) % 26)
            it.b.position.set(HOME + it.x + Math.sin(t * 3 + it.ph) * 1.5, hY(cs) + it.y + Math.sin(t * 5 + it.ph) * 0.6, zAt(s))
            it.b.rotation.y = Math.PI
            animateBird(it.b, t + it.ph, 1)
          }
        } else {
          bats.visible = false
          if (cs < Tn.s0 - 60) this.fired = false
        }
      },
    })
  }

  // --- Woolly Pasture ---------------------------------------------------------------------------------
  {
    const s0 = 1676
    const s1 = 1800
    for (let i = 0; i < 10; i++) {
      const p = spot(s0, s1, 6)
      if (p) put(g, P.stoneWall(10 + rand() * 8, rand), p.x, 0, p.z, rand() < 0.5 ? 0 : Math.PI / 2)
    }
    put(g, P.shepherdHut(), -126, 0, zAt(1720), 0.5)
    const shepherd = buildAnimal('shepherd', { seed: 9 })
    shepherd.position.set(HOME - 8, 0, zAt(1752))
    shepherd.rotation.y = Math.PI / 2
    alive(shepherd, 1752, (t, dt, ctx) => animateAnimal(shepherd, t, ctx.cartNear(1745, 50) ? 'wave' : 'idle'))
    for (let i = 0; i < 18; i++) {
      const p = spot(s0, s1, 5)
      if (!p) continue
      const sh = buildAnimal(rand() < 0.3 ? 'lamb' : 'sheep', { seed: 90 + i })
      sh.position.set(p.x, 0, p.z)
      sh.rotation.y = rand() * 6
      const ph = rand() * 6
      alive(sh, p.s, (t) => animateAnimal(sh, t + ph, Math.sin(t * 0.25 + ph) > 0.6 ? 'walk' : 'graze', 0.7))
    }
    sign(P.bigSign('WOOLLY PASTURE', 'Sheep crossing!', '#fff6d8'), s0 + 4, -1, 9)
    sign(P.crossingSign('sheep'), 1700, 1)
  }

  // --- River: warning sign and fish jumping by the bridges -----------------------------------------
  {
    sign(P.crossingSign('bridge'), 1790, 1)
    const fishes = []
    for (let i = 0; i < 6; i++) {
      const f = buildFish(i % 2 ? '#ffb35a' : '#5ab0ff')
      f.scale.setScalar(1.6)
      const s = T.river.s0 + 8 + rand() * (T.river.s1 - T.river.s0 - 16)
      const x = (rand() - 0.5) * V.halfWidth * 1.6
      fishes.push({ f, s, x, ph: rand() * 8, splashed: false })
      root.add(f)
    }
    live.push({
      obj: null,
      s: (T.river.s0 + T.river.s1) / 2,
      far: 500,
      update(t, dt, ctx) {
        for (const it of fishes) {
          const u = ((t + it.ph) % 4.5) / 1.1 // jumps for 1.1 s every 4.5 s
          const air = u < 1
          it.f.visible = air
          if (!air) {
            it.splashed = false
            continue
          }
          it.f.position.set(it.x + u * 3, 0.2 + Math.sin(Math.PI * u) * 3.2, zAt(it.s))
          it.f.rotation.set(0, Math.PI / 2, (u - 0.5) * 2.4)
          animateFish(it.f, t)
          if (u > 0.92 && !it.splashed) {
            it.splashed = true
            if (ctx.near(it.s, 60)) sfx.fishSplash()
          }
        }
      },
    })
  }

  // --- Rockslide ridge (left of the home track) -------------------------------------------------
  {
    const rs = 1996
    put(g, P.cliffFace(70, 26, rand), tx(HOME, rs) - 46, 0, zAt(rs), Math.PI / 2)
    for (let i = 0; i < 6; i++) put(g, P.rubblePile(rand), tx(HOME, rs) - 24 - rand() * 10, 0, zAt(rs - 30 + rand() * 60))
    sign(P.crossingSign('rocks'), 1928, 1)
  }

  // --- Sky Trestle wind, Golden Sands sandstorm junction, Golden Station gold line ---------------------
  {
    sign(P.crossingSign('wind'), WINDS(), 1)
    const J = T.junction
    sign(P.junctionSign(), J.choose - 40, -1, 5.5)
    for (let i = 0; i < 14; i++) {
      const p = spot(J.s0 - 60, J.s1 + 60, 12)
      if (p) put(g, P.sandDune(12 + rand() * 14, 2 + rand() * 4, rand), p.x, 0, p.z, rand() * 3)
    }
    // Sleepers' ballast lines of the Gem Run are in track.js; a few gem-crystal markers beside it.
    for (let s = J.s0 + J.ramp; s < J.s1 - J.ramp; s += 12) block(g, 0.5, 1.2, 0.5, tx(HOME, s) + branchX(s) + 2.2, hY(s) + 0.2, zAt(s), '#ff7ae0', { emissive: '#ff7ae0', emissiveIntensity: 0.6, shadow: false })
    const line = P.goldLine(3.4)
    line.position.set(tx(HOME, T.goldLine), hY(T.goldLine) + 0.19, zAt(T.goldLine))
    root.add(line)
  }

  // --- Distance markers every 250 m beside the home track -------------------------------------------
  for (let s = 250; s < T.length - 60; s += 250) {
    if (s > T.lipS - 20 && s < T.gapEnd + 10) continue
    if (s > Tn.s0 - 6 && s < Tn.s1 + 6) continue
    if (s > T.mine.s0 - 6 && s < T.mine.s1 + 6) continue
    if (hY(s) > 1.5) continue // on a trestle / mound
    sign(P.distanceSign(`${s} m`), s, -1, 2.8)
  }

  root.add(bake(g, true))

  // --- Per frame ------------------------------------------------------------------------------------
  const ctx = {
    cartS: -1e9,
    riding: false,
    camS: 0,
    near(s, r) {
      return Math.abs(s - this.camS) < r
    },
    cartNear(s, r) {
      return this.riding && Math.abs(s - this.cartS) < r
    },
  }
  const flushAt = [120, 500, 600, 760, 1360, 1690]
  const flocks = flushAt.map((s) => {
    const grp = new Group()
    root.add(grp)
    grp.visible = false
    const birds = []
    for (let i = 0; i < 9; i++) {
      const b = buildBird(['#3a3a48', '#6a4a3a', '#2f6fd0'][i % 3])
      b.scale.setScalar(2.4)
      grp.add(b)
      birds.push({ b, ph: rand() * 6, dx: (rand() - 0.5) * 14, dz: rand() * 8 })
    }
    return { s, grp, birds, t: -1 }
  })
  let lastCartS = -1e9
  return {
    root,
    // camS: the camera's s (z), cartS / riding: the ride's state, night: 0..1.
    update(dt, t, camZ, cartS, riding, night) {
      ctx.camS = BASES.cartZ - camZ
      ctx.cartS = cartS
      ctx.riding = riding
      setEyeGlow(Math.max(0, night * 1.2 - 0.2))
      for (const l of live) {
        const d = Math.abs(l.s - ctx.camS)
        if (l.obj) l.obj.visible = d < l.far
        if (d < l.far) l.update(t, dt, ctx)
      }
      // The chain lift: the chain and the motor gear run while the cart is on it.
      const onLift = riding && cartS > T.lift.s0 - 2 && cartS < T.lift.s1
      for (const tex of chainTex) tex.offset.y -= dt * (onLift ? T.lift.speed / 0.5 : 0.6)
      if (gear) gear.rotation.x += dt * (onLift ? 3 : 0.8)
      if (flag) flag.rotation.y = Math.sin(t * 2.2) * 0.25 + Math.sin(t * 5.3) * 0.08
      // Birds burst out of the trees ahead of the cart.
      for (const f of flocks) {
        if (riding && lastCartS < f.s - 30 && cartS >= f.s - 30) {
          f.t = 0
          f.grp.visible = true
          sfx.birdsFlush()
        }
        if (f.t < 0) continue
        f.t += dt
        for (const it of f.birds) {
          const u = f.t + it.ph * 0.05
          it.b.position.set(HOME + it.dx + (it.dx > 0 ? 1 : -1) * u * 6, hY(f.s) + 1 + u * 5 + Math.sin(u * 3 + it.ph), zAt(f.s - it.dz - u * 3))
          it.b.rotation.y = it.dx > 0 ? -Math.PI / 2 : Math.PI / 2
          animateBird(it.b, t, 1)
        }
        if (f.t > 5) {
          f.t = -1
          f.grp.visible = false
        }
      }
      if (!riding || cartS < lastCartS - 50) for (const f of flocks) f.t = Math.min(f.t, -1)
      lastCartS = riding ? cartS : -1e9
    },
  }
}
const WINDS = () => 2140 // the crosswind sign, ahead of the Sky Trestle's gusts
