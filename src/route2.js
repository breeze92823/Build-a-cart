// Scenery for Act 2, the lands past the Golden Gate: the Gate itself (its doors open for
// riders with the rebirths), Dusty Gulch, Ashfall Volcano, the Lava Tubes, Crystal
// Caverns, Emerald Jungle (rope bridge), the Lost Temple's corridors, Misty Bayou,
// Lighthouse Cove, Frozen Tundra, Titan Foothills, Avalanche Ridge (snow sheds), Titan
// Peak (the spiral round the mountain, corner boards, brake-zone kerbs), the Glacier
// Gap and the Diamond Terminus. Everything is placed along the 2D path with pathPoint
// (sideways = metres to the right of the line). Static pieces are baked; the living
// things (animals, birds, flags, the lighthouse beam, lava, water) animate only near the
// camera and hide far away.
import { Group, Vector3 } from 'three'
import { TRACK } from './config.js'
import { CORNERS, GAPS, PATH_JOIN, VALLEY_Y, hasRail, pathPoint, pathYaw, safeSpeed, trackHeight } from './cartPhysics.js'
import { ACT2 } from './world.js'
import { bake } from './bake.js'
import { label } from './propkit.js'
import { mulberry32 } from './textures.js'
import { animateAnimal, animateBird, buildAnimal, buildBird, buildEagle, buildSeagull } from './scenery/animals.js'
import * as P from './scenery/props.js'
import * as Q from './scenery/props2.js'
import { sfx } from './audio/index.js'

const T = TRACK
const G0 = VALLEY_Y // ground level past the gate
const p = new Vector3()

// Coarse samples of the whole Act 2 line, to keep scenery off the rails.
const LINE = []
for (let s = PATH_JOIN; s <= T.length; s += 4) {
  pathPoint(s, 0, p)
  LINE.push([p.x, p.z, trackHeight(s), s])
}
function clearOfLine(x, z, gap, y = G0) {
  for (const [lx, lz, ly] of LINE) {
    const dx = x - lx
    const dz = z - lz
    // An elevated stretch only blocks what reaches up to it.
    if (dx * dx + dz * dz < gap * gap && y < ly + 6) return false
  }
  return true
}
const inAct2 = (x, z) => x > ACT2.x0 + 10 && x < ACT2.x1 - 10 && z < ACT2.z0 - 10 && z > ACT2.z1 + 10

export function createRoute2(scene, opts = {}) {
  const root = new Group()
  scene.add(root)
  const g = new Group() // static, baked
  const live = []
  const rand = mulberry32(2024)

  const put = (parent, obj, x, y, z, yaw = 0, sc = 1) => {
    obj.position.set(x, y, z)
    obj.rotation.y = yaw
    if (sc !== 1) obj.scale.setScalar(sc)
    parent.add(obj)
    return obj
  }
  // Something beside the line at s, `side` m to the right (at ground level, or the rail bed).
  const along = (obj, s, side, onBed = false, yawOff = 0, parent = g) => {
    pathPoint(s, side, p)
    return put(parent, obj, p.x, onBed ? p.y : G0, p.z, pathYaw(s) + yawOff)
  }
  // Random spots in [s0, s1] between `near` and `far` m either side of the line, clear of it.
  function scatter(s0, s1, n, near, far, gap, make) {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 8; k++) {
        const s = s0 + rand() * (s1 - s0)
        const side = (rand() < 0.5 ? -1 : 1) * (near + rand() * (far - near))
        pathPoint(s, side, p)
        if (!inAct2(p.x, p.z) || !clearOfLine(p.x, p.z, gap)) continue
        const o = make(s, side)
        if (o) put(g, o, p.x, G0, p.z, rand() * Math.PI * 2)
        break
      }
    }
  }
  // Ground of an area: overlapping slabs under the line (each a hair higher than the last).
  let gy = 0.02
  function floor(s0, s1, color, w = 110, step = 45) {
    for (let s = s0; s < s1; s += step) {
      pathPoint(s, 0, p)
      const slab = Q.ground(w, step * 1.6, color)
      put(g, slab, p.x, G0 + (gy += 0.0015), p.z, pathYaw(s))
    }
  }
  function alive(obj, s, update, far = 380) {
    root.add(obj)
    live.push({ obj, s, update, far })
    return obj
  }
  // Big area sign.
  const areaSign = (title, sub, color, s, side = -1) => along(P.bigSign(title, sub, color), s, side * 9)

  // --- The Golden Gate -------------------------------------------------------------------------
  const gate = Q.goldenGate(20, 14)
  pathPoint(T.gate.s - 0.5, 0, p)
  put(root, gate, p.x, G0, p.z, pathYaw(T.gate.s))
  const plaque = label(`THE GOLDEN GATE · REBIRTH ${T.gate.reb}`, 1.4, { colors: ['#fff6c8', '#ffd23a'] })
  const pq = gate.userData.plaque
  plaque.position.set(pq?.x ?? 0, pq?.y ?? 16, (pq?.z ?? 1) + 0.3)
  gate.add(plaque)
  let gateOpenK = 0
  let gateSounded = false

  // --- Dusty Gulch (3390-3690) -------------------------------------------------------------------
  floor(3390, 3700, '#d9b07a')
  {
    const street = [
      [3420, -14, Q.saloon],
      [3450, 14, Q.generalStore],
      [3480, -14, Q.sheriffOffice],
      [3505, 14, Q.saloon],
      [3530, -14, Q.generalStore],
    ]
    for (const [s, side, make] of street) along(make(), s, side, false, side < 0 ? Math.PI / 2 : -Math.PI / 2)
    along(Q.waterTower(), 3465, 8)
    for (let s = 3410; s < 3540; s += 18) along(Q.hitchingPost(), s, rand() < 0.5 ? -6 : 6)
    for (let i = 0; i < 10; i++) along(Q.barrelStack(rand), 3410 + rand() * 130, (rand() < 0.5 ? -1 : 1) * (6.5 + rand() * 2))
    for (let s = 3560; s < 3680; s += 12) along(Q.wagonWheelFence(11), s, 18, false, Math.PI / 2)
    scatter(3390, 3690, 60, 14, 120, 10, () => Q.cactusTall(rand))
    scatter(3390, 3690, 20, 20, 120, 12, () => P.sandDune(12 + rand() * 14, 2 + rand() * 4, rand))
    areaSign('DUSTY GULCH', 'Stampede country!', '#e8b27a', 3396)
    // Cowboys on the boardwalk and a corral of longhorns.
    for (let i = 0; i < 3; i++) {
      const s = 3430 + i * 38
      const side = i % 2 ? 7.5 : -7.5
      const f = buildAnimal('farmer', { seed: 500 + i, color: ['#b0472a', '#3a6fb0', '#6a4a2a'][i] })
      along(f, s, side, false, side < 0 ? -Math.PI / 2 : Math.PI / 2, root)
      live.push({ obj: f, s, far: 300, update: (t, dt, ctx) => animateAnimal(f, t + i, ctx.cartNear(s, 50) ? 'wave' : 'idle') })
    }
    for (let i = 0; i < 6; i++) {
      const s = 3600 + rand() * 70
      const c = buildAnimal(rand() < 0.3 ? 'bull' : 'longhorn', { seed: 600 + i })
      along(c, s, 30 + rand() * 25, false, rand() * 6, root)
      const ph = rand() * 6
      live.push({ obj: c, s, far: 320, update: (t) => animateAnimal(c, t + ph, 'graze', 0.8) })
    }
  }

  // --- Ashfall Volcano (3690-3990) -----------------------------------------------------------------
  floor(3690, 4000, '#4a3e3a')
  const lavaTex = []
  {
    pathPoint(3850, -260, p)
    if (clearOfLine(p.x, p.z, 140)) put(g, Q.volcanoCone(110, 150, rand), p.x, G0, p.z)
    else {
      pathPoint(3850, 260, p)
      if (clearOfLine(p.x, p.z, 140)) put(g, Q.volcanoCone(110, 150, rand), p.x, G0, p.z)
    }
    pathPoint(3760, 200, p)
    if (inAct2(p.x, p.z) && clearOfLine(p.x, p.z, 85)) put(g, Q.volcanoCone(60, 80, rand), p.x, G0, p.z)
    // The lava river under the bridge, and pools.
    const river = Q.lavaPool(120, 24)
    along(river, 3860, 0, false, 0, root)
    river.position.y = G0 + 0.05
    if (river.userData.tex) lavaTex.push(river.userData.tex)
    for (let i = 0; i < 6; i++) {
      const s = 3700 + rand() * 280
      const side = (rand() < 0.5 ? -1 : 1) * (16 + rand() * 50)
      pathPoint(s, side, p)
      if (!clearOfLine(p.x, p.z, 12)) continue
      const pool = Q.lavaPool(10 + rand() * 12, 8 + rand() * 10)
      put(root, pool, p.x, G0 + 0.05, p.z, rand() * 3)
      if (pool.userData.tex) lavaTex.push(pool.userData.tex)
    }
    scatter(3690, 3990, 45, 9, 110, 8, () => (rand() < 0.6 ? Q.ashRock(0.6 + rand(), rand) : Q.obsidianSpike(rand)))
    areaSign('ASHFALL VOLCANO', 'Mind the fire jets!', '#ff7a3a', 3696)
    // Vultures circling.
    for (let i = 0; i < 4; i++) {
      const b = buildBird('#2a2226')
      b.scale.setScalar(3)
      const cs = 3800 + i * 40
      alive(b, cs, (t) => {
        pathPoint(cs, 30, p)
        const a = t * 0.4 + i * 1.6
        b.position.set(p.x + Math.cos(a) * 30, G0 + 40 + i * 3, p.z + Math.sin(a) * 30)
        b.rotation.y = -a
        animateBird(b, t + i, 0.25)
      }, 500)
    }
  }

  // --- Lava Tubes (3990-4240) ----------------------------------------------------------------------
  for (let s = 3996; s < 4236; s += 4) along(Q.lavaTubeRing(5.2), s, 0, true)
  areaSign('LAVA TUBES', 'Up to the crater rim!', '#ff5a1a', 3985)

  // --- Crystal Caverns (4240-4520) -------------------------------------------------------------------
  {
    for (let s = 4250; s < 4510; s += 6) {
      for (const side of [-1, 1]) {
        pathPoint(s, side * (9 + rand() * 4), p)
        put(g, Q.caveColumn(14 + rand() * 12, rand), p.x, G0, p.z)
      }
    }
    // The cavern roof: dark rock high over the line.
    for (let s = 4250; s < 4510; s += 14) {
      pathPoint(s, 0, p)
      const roof = Q.ground(32, 16, '#2a2636')
      put(g, roof, p.x, Math.max(trackHeight(s) + 14, G0 + 20), p.z, pathYaw(s))
      roof.rotation.x = Math.PI
    }
    scatter(4250, 4510, 70, 4.5, 11, 3.6, () => (rand() < 0.75 ? Q.crystalCluster(0.6 + rand() * 0.8, ['#7ae8ff', '#b47aff', '#ff7ae0', '#7aff9a'][Math.floor(rand() * 4)], rand) : Q.glowMushroom(rand)))
    areaSign('CRYSTAL CAVERNS', 'Make the crystals sing!', '#7ae8ff', 4236)
  }

  // --- Emerald Jungle (4520-4820) --------------------------------------------------------------------
  floor(4520, 4830, '#2f7a2a')
  {
    // The rope bridge over the ravine, and the river under it.
    // ~3 meshes a metre: baked into a few draw calls, then rocked as one.
    const bridge = new Group()
    bridge.add(bake(Q.ropeBridgeSpan(60), true))
    along(bridge, 4620, 0, true, 0, root)
    const ropes = null
    const river = Q.swampWater(70, 22)
    along(river, 4650, 0, false, 0, root)
    river.position.y = G0 + 0.04
    live.push({ obj: null, s: 4650, far: 400, update: (t, dt, ctx) => {
      // The bridge rocks with the sway gusts (more while the cart is on it).
      const on = ctx.cartNear(4650, 40)
      bridge.rotation.z = Math.sin(t * 2.2) * (on ? 0.05 : 0.02)
      if (ropes?.rotation) ropes.rotation.z = Math.sin(t * 2.2 + 0.4) * 0.03
      if (river.userData.tex) river.userData.tex.offset.x -= dt * 0.05
    } })
    scatter(4520, 4820, 110, 7, 120, 7, () => {
      const r = rand()
      return r < 0.4 ? Q.jungleTree(0.7 + rand() * 0.6, rand) : r < 0.7 ? Q.palmTree(0.7 + rand() * 0.5, rand) : r < 0.9 ? Q.fern(rand) : Q.jungleFlower(rand)
    })
    for (let i = 0; i < 16; i++) along(Q.hangingVines(6 + rand() * 6), 4530 + rand() * 280, (rand() < 0.5 ? -1 : 1) * (5 + rand() * 4))
    areaSign('EMERALD JUNGLE', 'Hold on, the bridge sways!', '#3aff7a', 4524)
    // Monkeys swinging in the trees, parrots overhead.
    for (let i = 0; i < 5; i++) {
      const s = 4540 + i * 55
      const m = buildAnimal('monkey', { seed: 700 + i })
      const side = i % 2 ? 6 : -6
      along(m, s, side, false, 0, root)
      m.position.y += 4 + rand() * 3
      const ph = rand() * 6
      live.push({ obj: m, s, far: 260, update: (t) => animateAnimal(m, t + ph, 'climb', 1.2) })
    }
    for (let i = 0; i < 6; i++) {
      const b = buildBird(['#ff3b3b', '#2fd16a', '#3a8cff'][i % 3])
      b.scale.setScalar(2.4)
      const cs = 4560 + i * 40
      alive(b, cs, (t) => {
        pathPoint(cs, 0, p)
        const a = t * 0.8 + i
        b.position.set(p.x + Math.cos(a) * 14, G0 + 14 + Math.sin(t * 2 + i) * 2, p.z + Math.sin(a) * 14)
        b.rotation.y = -a
        animateBird(b, t + i, 1)
      })
    }
  }

  // --- Lost Temple (4820-5110): corridors of carved walls through the 90-degree turns -------------------
  floor(4820, 5115, '#a89a7a', 60, 30)
  {
    along(Q.templeGate(8, 9), 4826, 0, true)
    along(Q.templeGate(8, 9), 5104, 0, true)
    for (let s = 4830; s < 5100; s += 5.5) {
      for (const side of [-1, 1]) {
        pathPoint(s, side * 4.8, p)
        // Low enough for the chase camera to see over in the 90-degree turns.
        const wall = Q.templeWall(5.8, 2.6 + (Math.floor(s / 5.5) % 4 === 0 ? 2.2 : 0), rand)
        put(g, wall, p.x, G0, p.z, pathYaw(s) + Math.PI / 2)
        wall.position.x -= Math.cos(pathYaw(s) + Math.PI / 2) * 2.9 // centre the 0..len wall on the point
        wall.position.z += Math.sin(pathYaw(s) + Math.PI / 2) * 2.9
      }
    }
    for (let s = 4840; s < 5100; s += 22) {
      for (const side of [-1, 1]) {
        const torch = Q.wallTorch()
        along(torch, s, side * 4.4, true, side < 0 ? Math.PI / 2 : -Math.PI / 2, root)
        torch.position.y += 3
        const fl = torch.userData.flame
        if (fl) live.push({ obj: null, s, far: 160, update: (t) => fl.scale.setScalar(0.85 + Math.sin(t * 14 + s) * 0.15) })
      }
    }
    scatter(4820, 5110, 16, 10, 60, 10, () => Q.templeStatue(rand))
    areaSign('LOST TEMPLE', 'Something is rolling...', '#d9c27a', 4822, 1)
  }

  // --- Misty Bayou (5110-5360) ------------------------------------------------------------------------
  floor(5110, 5360, '#4a5a32')
  {
    for (let i = 0; i < 9; i++) {
      const s = 5120 + rand() * 230
      const side = (rand() < 0.5 ? -1 : 1) * (14 + rand() * 30)
      pathPoint(s, side, p)
      if (!clearOfLine(p.x, p.z, 10)) continue
      const w = Q.swampWater(26 + rand() * 20, 18 + rand() * 14)
      put(root, w, p.x, G0 + 0.06, p.z, rand() * 3)
      if (w.userData.tex) live.push({ obj: null, s, far: 400, update: (t, dt) => (w.userData.tex.offset.x += dt * 0.01) })
    }
    scatter(5110, 5360, 60, 8, 110, 7, () => {
      const r = rand()
      return r < 0.5 ? Q.cypressTree(0.7 + rand() * 0.5, rand) : r < 0.75 ? Q.reeds(rand) : r < 0.9 ? Q.lilyPads(rand) : Q.lanternPole()
    })
    for (let i = 0; i < 4; i++) along(Q.stiltHut(), 5130 + i * 60, (i % 2 ? 1 : -1) * (20 + rand() * 12), false, rand() * 6)
    areaSign('MISTY BAYOU', 'Gators in the mud!', '#9adf6a', 5114)
  }

  // --- Lighthouse Cove (5360-5640): the cliff-top road above the sea ------------------------------------
  floor(5300, 5650, '#7fbf5a')
  let beam = null
  {
    // The sea on the right of the cliff road, the cliffs along its edge.
    for (let s = 5360; s < 5660; s += 60) {
      pathPoint(s, 70, p)
      const sea = Q.ocean(130, 70)
      put(root, sea, p.x, G0 + 0.08, p.z, pathYaw(s))
      if (sea.userData.tex) live.push({ obj: null, s, far: 500, update: (t, dt) => (sea.userData.tex.offset.y += dt * 0.03) })
    }
    // Sea cliffs along the road's sea side (their sea face +Z turned away from the line).
    for (let s = 5350; s < 5660; s += 9) {
      pathPoint(s, 13, p)
      const cliff = Q.seaCliff(10, Math.max(4, trackHeight(s) - G0 - 0.6), rand)
      put(g, cliff, p.x, G0, p.z, pathYaw(s) + Math.PI / 2)
    }
    // The lighthouse on its own rock out in the water.
    pathPoint(5500, 30, p)
    put(g, Q.seaCliff(16, 14, rand), p.x, G0, p.z, pathYaw(5500) + Math.PI / 2)
    const lh = Q.lighthouse()
    along(lh, 5500, 30, false, 0, root)
    lh.position.y = G0 + 14
    beam = lh.userData.beam ?? null
    along(Q.sailingShip(), 5480, 95, false, 1.2, root).position.y = G0 + 0.2
    along(Q.dock(24), 5600, 40, false, Math.PI / 2)
    for (let i = 0; i < 4; i++) along(Q.buoy(), 5400 + i * 60, 55 + rand() * 25, false, 0, root).position.y = G0 + 0.1
    areaSign('LIGHTHOUSE COVE', 'Watch the waves!', '#5ad8ff', 5362, -1)
    // Gulls wheeling, crabs on the rocks.
    for (let i = 0; i < 6; i++) {
      const b = buildSeagull()
      b.scale.setScalar(2)
      const cs = 5400 + i * 40
      alive(b, cs, (t) => {
        pathPoint(cs, 30, p)
        const a = t * 0.5 + i * 1.1
        b.position.set(p.x + Math.cos(a) * 22, G0 + 22 + Math.sin(t + i) * 3, p.z + Math.sin(a) * 22)
        b.rotation.y = -a
        animateBird(b, t + i, 0.5)
      })
    }
    for (let i = 0; i < 6; i++) {
      const s = 5420 + i * 30
      const cr = buildAnimal('crab', { seed: 800 + i })
      along(cr, s, -12 - rand() * 8, false, 0, root)
      cr.scale.setScalar(2)
      const ph = rand() * 6
      live.push({ obj: cr, s, far: 200, update: (t) => animateAnimal(cr, t + ph, Math.sin(t + ph) > 0 ? 'walk' : 'idle', 2) })
    }
  }

  // --- Frozen Tundra (5640-5900) ----------------------------------------------------------------------
  floor(5640, 5905, '#eef5ff')
  {
    scatter(5640, 5900, 50, 8, 120, 7, () => (rand() < 0.6 ? Q.snowPine(0.7 + rand() * 0.5, rand) : Q.iceBlock(0.8 + rand(), rand)))
    for (let i = 0; i < 4; i++) along(Q.igloo(), 5660 + i * 60, (i % 2 ? 1 : -1) * (18 + rand() * 20), false, rand() * 6)
    areaSign('FROZEN TUNDRA', 'Icy rails!', '#cfeeff', 5644)
    for (let i = 0; i < 8; i++) {
      const s = 5700 + rand() * 180
      const pg = buildAnimal('penguin', { seed: 900 + i })
      along(pg, s, (rand() < 0.5 ? -1 : 1) * (14 + rand() * 20), false, rand() * 6, root)
      const ph = rand() * 6
      live.push({ obj: pg, s, far: 260, update: (t) => animateAnimal(pg, t + ph, Math.sin(t * 0.6 + ph) > 0.2 ? 'walk' : 'idle') })
    }
  }

  // --- Titan Foothills, Avalanche Ridge, Titan Peak (5900-7080) -------------------------------------------
  floor(5900, 7090, '#f4f8ff', 130, 50)
  {
    // Titan Peak: the mountain the spiral winds round.
    const sp = CORNERS.find((c) => c.deg === 270)
    let cx = 0
    let cz = 0
    let n = 0
    for (let s = sp.s0; s <= sp.s1; s += 5) {
      pathPoint(s, 0, p)
      cx += p.x
      cz += p.z
      n++
    }
    cx /= n
    cz /= n
    let rMin = Infinity
    for (let s = sp.s0; s <= sp.s1; s += 5) {
      pathPoint(s, 0, p)
      rMin = Math.min(rMin, Math.hypot(p.x - cx, p.z - cz))
    }
    const w = Math.max(30, (rMin - 9) * 1.6)
    put(g, Q.snowPeak(w, 175, rand), cx, G0, cz)
    // Distant giants around the range.
    for (const [ds, side, w2, h2] of [
      [6000, -160, 200, 130],
      [6250, 170, 240, 160],
      [6500, -200, 220, 150],
      [6800, 200, 260, 170],
      [7000, -170, 200, 120],
    ]) {
      pathPoint(ds, side, p)
      if (inAct2(p.x, p.z) && clearOfLine(p.x, p.z, w2 * 0.5)) put(g, Q.snowPeak(w2, h2, rand), p.x, G0, p.z)
    }
    // Rock shelves beside the climbing road; prayer flags along the ridge.
    for (let s = 5940; s < 7070; s += 7) {
      if (!hasRail(s)) continue
      const h = trackHeight(s) - G0
      if (h < 3) continue
      if (rand() < 0.35) {
        pathPoint(s, (rand() < 0.5 ? -1 : 1) * (6 + rand() * 3), p)
        put(g, Q.rockLedge(4 + rand() * 4, Math.max(2, h - 1 - rand() * 4), 4 + rand() * 3, rand), p.x, G0, p.z, pathYaw(s))
      }
    }
    for (let s = 6200; s < 6450; s += 30) along(Q.prayerFlags(12), s, -6, true, Math.PI / 2)
    // Snow sheds over the line on the ridge.
    for (const t of T.tunnels.filter((x) => x.name === 'Snow Shed')) along(Q.snowShed(t.s1 - t.s0), t.s0, 0, true)
    // The summit beacon.
    const beacon = Q.summitBeacon()
    along(beacon, 6565, -6.5, true, 0, root)
    const bflag = beacon.userData.flag
    if (bflag) live.push({ obj: null, s: 6565, far: 600, update: (t) => (bflag.rotation.y = Math.sin(t * 2.4) * 0.3) })
    along(Q.checkpointFlag(), 6582, 0, true)
    areaSign('TITAN FOOTHILLS', 'Hairpins! Brake and lean!', '#dfe8f4', 5904)
    areaSign('AVALANCHE RIDGE', 'Shelter in the sheds!', '#eaf4ff', 6184, 1)
    areaSign('TITAN PEAK', 'The top of the world!', '#ffffff', 6464)
    // Goats on the ledges, eagles over the peak.
    for (let i = 0; i < 6; i++) {
      const s = 5950 + i * 70
      const gt = buildAnimal('goat', { seed: 1000 + i })
      pathPoint(s, (i % 2 ? 1 : -1) * 12, p)
      put(root, gt, p.x, Math.max(G0, trackHeight(s) - 2 - rand() * 6), p.z, rand() * 6)
      const ph = rand() * 6
      live.push({ obj: gt, s, far: 260, update: (t) => animateAnimal(gt, t + ph, 'graze', 0.8) })
    }
    for (let i = 0; i < 3; i++) {
      const e = buildEagle()
      e.scale.setScalar(2.6)
      alive(e, 6650 + i * 80, (t) => {
        const a = t * 0.3 + i * 2.1
        e.position.set(cx + Math.cos(a) * (rMin + 30), G0 + 185 + i * 6, cz + Math.sin(a) * (rMin + 30))
        e.rotation.y = -a
        animateBird(e, t + i, 0.2)
      }, 900)
    }
  }

  // --- Corner boards and brake-zone kerbs before every tight Act 2 corner ---------------------------------
  for (const c of CORNERS) {
    if (!c.deg || Math.abs(c.deg) < 60) continue
    let vs = Infinity
    for (let s = c.s0 + 1; s < c.s1; s += 3) vs = Math.min(vs, safeSpeed(s, 1))
    const out = c.deg > 0 ? -1 : 1 // boards stand on the outside of the turn
    along(Q.cornerSign(c.deg > 0 ? 1 : -1, Math.floor(vs)), c.s0 - 45, out * 5)
    for (let s = c.s0 - 40; s < c.s0 - 4; s += 2.2) {
      if (!hasRail(s)) continue
      along(Q.brakeZoneMarker(), s, 0, true).position.y += 0.19
    }
  }

  // --- The Glacier Gap: ice walls down into the crevasse ----------------------------------------------------
  {
    const gl = GAPS.find((x) => x.name === 'glacier')
    for (const [s0, s1] of [
      [gl.lip - 14, gl.lip],
      [gl.end, gl.end + 14],
    ]) {
      for (let s = s0; s < s1; s += 3) {
        for (const side of [-4, 0, 4]) {
          pathPoint(s, side, p)
          const top = trackHeight(Math.min(Math.max(s, gl.lip - 1), gl.end + 14)) - 0.6
          const blk = Q.iceBlock(1.6, rand)
          put(g, blk, p.x, G0 + (top - G0) * (0.4 + rand() * 0.55), p.z)
        }
      }
    }
    pathPoint((gl.lip + gl.end) / 2, 0, p)
    const floorIce = Q.ground(30, gl.end - gl.lip + 10, '#9fd6ec')
    put(g, floorIce, p.x, gl.floorY + 0.2, p.z, pathYaw(gl.lip))
    along(P.bigSign('GLACIER GAP', 'Full speed - JUMP!', '#bfe9ff'), gl.lip - 120, -9)
  }

  // --- The Diamond Terminus -------------------------------------------------------------------------------
  floor(7190, 7400, '#e8f4ff')
  const term = Q.diamondTerminus()
  along(term, 7330, 0, true, 0, root)
  const glow = term.userData.glowMats ?? []
  const trophy = Q.trophyPedestal()
  along(trophy, 7365, 8, false, 0, root)
  const gem = trophy.userData.gem
  along(Q.checkpointFlag(), 7262, 0, true)
  const finish = P.goldLine(3.4)
  pathPoint(T.goldLine, 0, p)
  put(root, finish, p.x, trackHeight(T.goldLine) + 0.19, p.z, pathYaw(T.goldLine))
  areaSign('DIAMOND TERMINUS', 'The end of the line!', '#b9f6ff', 7210, 1)

  // --- Distance markers past the gate ----------------------------------------------------------------------
  for (let s = 3500; s < T.length - 60; s += 250) {
    if (!hasRail(s) || trackHeight(s) - G0 > 1.5) continue
    along(P.distanceSign(`${s} m`), s, -3, true)
  }

  root.add(bake(g, true))

  // --- Per frame --------------------------------------------------------------------------------------------
  const ctx = {
    cartS: -1e9,
    riding: false,
    camX: 0,
    camZ: 0,
    cartNear(s, r) {
      return this.riding && Math.abs(s - this.cartS) < r
    },
  }
  return {
    root,
    // camPos: the camera's position; cartS / riding: the ride; gateOpen: the player may pass.
    update(dt, t, camPos, cartS, riding, gateOpen) {
      ctx.cartS = cartS
      ctx.riding = riding
      // Only the parts of Act 2 near the camera live (by distance to their spot on the line).
      for (const l of live) {
        pathPoint(l.s, 0, p)
        const d = Math.hypot(p.x - camPos.x, p.z - camPos.z)
        const on = d < l.far
        if (l.obj) l.obj.visible = on
        if (on) l.update(t, dt, ctx)
      }
      for (const tex of lavaTex) tex.offset.x -= dt * 0.04
      if (beam) beam.rotation.y += dt * 0.9
      for (const m of glow) if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.5
      if (gem) gem.rotation.y += dt * 1.2
      // The Golden Gate: shut (red) without the rebirths; opens as the cart comes.
      const want = gateOpen && riding && cartS > T.gate.s - 140 && cartS < T.gate.s + 80 ? 1 : 0
      if (want && !gateSounded) {
        gateSounded = true
        sfx.gateUnlock()
      }
      if (!riding) gateSounded = false
      gateOpenK += (want - gateOpenK) * Math.min(1, dt * 1.6)
      const ud = gate.userData
      if (ud.doorL) ud.doorL.rotation.y = gateOpenK * 1.35
      if (ud.doorR) ud.doorR.rotation.y = -gateOpenK * 1.35
      if (ud.lockMat) {
        ud.lockMat.color?.set(gateOpen ? '#3aff5a' : '#ff3a3a')
        ud.lockMat.emissive?.set(gateOpen ? '#3aff5a' : '#ff3a3a')
      }
    },
  }
}
