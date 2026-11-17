// Outside the hub: the long cliff wall across the back of the valley (grey
// stepped brick, grass ledges, blocky trees on top) with a cave mouth behind
// every base, and the bases themselves: raised grass plateaus with jagged grey
// stone edges that narrow into a tongue, the rails rolling down a light-green
// ramp from the tongue to the valley floor, and plank bridges between plateaus.
// Only the home base's mouth leads into the hub cave; the others are dark.
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, PlaneGeometry } from 'three'
import { BASES, CAVE, TRACK, VALLEY } from './config.js'
import { RAPIER, addFixed } from './physics.js'
import { block, mixHex, pillar } from './build.js'
import { bake } from './bake.js'
import { mulberry32 } from './textures.js'
import { VALLEY_Y, trackHeight } from './cartPhysics.js'
import { zAt } from './world.js'

const VY = VALLEY_Y
const STONE = '#a3abbb'
const STONE_DARK = '#8b94a7'
const PLATEAU = '#5fd53a'
const RAMP = '#8fe36a'
const LEDGE = '#45ab31'
const WOOD = '#8a5a32'
const WOOD_DARK = '#6a4224'

const solid = (x0, x1, y0, y1, z0, z1) =>
  addFixed(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 })
function slab(g, x0, x1, y0, y1, z0, z1, color, opts = {}) {
  if (x1 - x0 < 0.01 || y1 - y0 < 0.01 || z1 - z0 < 0.01) return
  block(g, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, color, opts)
  if (opts.solid !== false) solid(x0, x1, y0, y1, z0, z1)
}

// Base plateau half-width at world z: wide by the wall, a tongue round the rails.
const Z_WIDE = -18
const Z_TIP = zAt(TRACK.dropStart)
const Z_TONGUE = Z_TIP + 6
export const PLATEAU_W = 15
export function plateauHalfWidth(z) {
  if (z >= Z_WIDE) return PLATEAU_W
  if (z >= Z_TONGUE) return PLATEAU_W + ((z - Z_WIDE) / (Z_TONGUE - Z_WIDE)) * (5 - PLATEAU_W)
  return 5
}

function wall(g, crystals, rand) {
  const M = CAVE.mouth
  const I = CAVE.inner
  const Zf = M.z0 // front face
  const Zl = I.z0 - 3 // back of the front layer (the hub's front wall)
  const XW = VALLEY.halfWidth + 40
  const back = VALLEY.back
  const A = 22 // top of the first tier
  const room = { x0: I.x0 - 3, x1: I.x1 + 3, z1: I.z1 + 3 }
  const homeX = BASES.xs[BASES.home]
  const mouths = BASES.xs.map((x) => ({ x, half: x === homeX ? M.halfWidth + 3 : 6, top: x === homeX ? M.height + 3 : M.height, home: x === homeX }))

  // Front layer, broken by the mouths.
  let x = -XW
  for (const m of mouths) {
    slab(g, x, m.x - m.half, VY, A, Zf, Zl, STONE)
    slab(g, m.x - m.half, m.x + m.half, m.top, A, Zf, Zl, STONE_DARK)
    x = m.x + m.half
  }
  slab(g, x, XW, VY, A, Zf, Zl, STONE)
  // Mass behind it, round the hub room.
  slab(g, -XW, room.x0, VY, A, Zl, back, STONE_DARK, { shadow: false })
  slab(g, room.x1, XW, VY, A, Zl, back, STONE_DARK, { shadow: false })
  slab(g, room.x0, room.x1, VY, A, room.z1, back, STONE_DARK, { shadow: false })
  slab(g, room.x0, room.x1, CAVE.height + 4, A, Zl, room.z1, STONE_DARK, { shadow: false })
  // First ledge (grass) with drips down the face.
  slab(g, -XW, XW, A, A + 0.9, Zf - 0.5, Zf + 16, LEDGE, { solid: false })
  for (let x = -XW; x < XW; x += 2 + rand() * 5) {
    const h = 0.8 + rand() * 5
    block(g, 1 + rand() * 2.6, h, 0.8, x, A - h / 2 + 0.4, Zf - 0.35, LEDGE, { shadow: false })
  }
  // Upper tiers, in uneven steps.
  for (const [zFront, top, lift] of [
    [Zf + 14, A + 12, 0],
    [Zf + 30, A + 24, 1],
  ]) {
    for (let x = -XW; x < XW; ) {
      const w = 18 + rand() * 30
      const zf = zFront + (rand() - 0.5) * 6
      const h = top + (rand() - 0.5) * 6
      const y0 = lift ? A + 10 : A
      slab(g, x, x + w, y0, h, zf, back, rand() < 0.5 ? STONE : STONE_DARK)
      slab(g, x - 0.3, x + w + 0.3, h, h + 0.9, zf - 0.4, back, LEDGE, { solid: false })
      for (let dx = 0; dx < w; dx += 2 + rand() * 6) {
        const dh = 0.8 + rand() * 4
        block(g, 1 + rand() * 2.4, dh, 0.8, x + dx, h - dh / 2 + 0.4, zf - 0.35, LEDGE, { shadow: false })
      }
      if (rand() < 0.75) tree(g, x + w * (0.2 + rand() * 0.6), h + 0.9, zf + 3 + rand() * 8, 1 + rand() * 0.5, rand)
      x += w
    }
  }
  for (let i = 0; i < 26; i++) tree(g, -XW + rand() * XW * 2, A + 0.9, Zf + 3 + rand() * 9, 0.9 + rand() * 0.4, rand)

  // Lumps on the face, red crystals and cobwebs round each mouth.
  for (let i = 0; i < 120; i++) {
    const s = 1.2 + rand() * 3.5
    const lx = -XW + rand() * XW * 2
    const near = mouths.find((m) => Math.abs(lx - m.x) < m.half + s)
    const ly = VY + rand() * (A - VY - 2)
    if (near && ly < near.top + s) continue
    block(g, s * (1 + rand()), s * (0.6 + rand() * 0.6), s, lx, ly, Zf - s * 0.3, rand() < 0.5 ? STONE : STONE_DARK, { shadow: false })
  }
  for (const m of mouths) {
    for (let k = 0; k < 7; k++) {
      const side = k % 2 ? 1 : -1
      crystals.push([m.x + side * (m.half + 1 + rand() * 9), 2 + rand() * 14, Zf - 0.5, 0.9 + rand() * 1.3])
    }
    // Timber frame (the hub's own is in cave.js).
    if (!m.home) {
      for (const s of [-1, 1]) pillar(g, 1, m.top, 1, m.x + s * (m.half - 0.4), 0, Zf - 0.2, WOOD_DARK)
      block(g, m.half * 2 + 1.6, 1.1, 1.2, m.x, m.top - 0.4, Zf - 0.2, WOOD)
      // A dark tunnel going in.
      slab(g, m.x - m.half, m.x + m.half, -0.3, 0, Zf, Zl, CAVE.floor, { shadow: false })
      for (const s of [-1, 1]) block(g, 0.4, m.top, Zl - Zf, m.x + s * (m.half - 0.2), m.top / 2, (Zf + Zl) / 2, CAVE.rockDark, { shadow: false })
      block(g, m.half * 2, 0.4, Zl - Zf, m.x, m.top - 0.2, (Zf + Zl) / 2, CAVE.rockDark, { shadow: false })
      const dark = new Mesh(new PlaneGeometry(m.half * 2, m.top), new MeshBasicMaterial({ color: '#070b1c' }))
      dark.position.set(m.x, m.top / 2, Zl - 0.25)
      dark.rotation.y = Math.PI
      g.userData.darks = (g.userData.darks ?? []).concat(dark)
    }
  }
}

function tree(parent, x, y, z, s, rand) {
  const trunkH = 3.5 * s
  pillar(parent, 1.1 * s, trunkH, 1.1 * s, x, y, z, '#7a4a25', { solid: false })
  const leaf = rand() < 0.5 ? '#2f8f2a' : '#3aa636'
  pillar(parent, 5 * s, 2.4 * s, 5 * s, x, y + trunkH - 0.4 * s, z, leaf)
  pillar(parent, 3.6 * s, 2 * s, 3.6 * s, x + (rand() - 0.5) * s, y + trunkH + 1.9 * s, z + (rand() - 0.5) * s, mixHex(leaf, '#ffffff', 0.12))
}

// An invisible ramp collider down a plateau edge (the stepped rocks), so the
// player can climb back up from the lower ground: from (edgeX, 0) out to the
// valley floor SLOPE_RUN metres away (~38 degrees, under PHYSICS.maxSlope).
const SLOPE_RUN = 3.2
function edgeSlope(edgeX, side, zc, depth) {
  const drop = -VY
  const theta = Math.atan2(drop, SLOPE_RUN)
  const half = Math.hypot(drop, SLOPE_RUN) / 2
  const a = -side * theta // rotation about Z: the surface falls away from the plateau
  const nx = -Math.sin(a)
  const ny = Math.cos(a)
  const t = 0.3 // half thickness; the top face lies on the slope line
  addFixed(
    RAPIER.ColliderDesc.cuboid(half, t, depth / 2 + 0.05),
    { x: edgeX + side * (SLOPE_RUN / 2) - nx * t, y: VY / 2 - ny * t, z: zc },
    { x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) },
  )
}

// One base plateau: slices of stone with a grass top, jagged edges, rim stones.
function plateau(g, X, home, rand) {
  const zTop = home ? CAVE.mouth.z0 : CAVE.inner.z0 - 3
  const step = 2
  for (let z = zTop; z > Z_TIP; z -= step) {
    const z1 = Math.max(Z_TIP, z - step)
    const w = plateauHalfWidth((z + z1) / 2)
    const jl = rand() * 1.4
    const jr = rand() * 1.4
    slab(g, X - w - jl, X + w + jr, VY - 0.3, -0.06, z1, z, rand() < 0.6 ? STONE : STONE_DARK, { solid: false })
    // A lower, wider step of stone so the edge reads as a rocky slope.
    const ol = 1.2 + rand() * 1.4
    const or = 1.2 + rand() * 1.4
    slab(g, X - w - jl - ol, X + w + jr + or, VY - 0.3, VY + 0.6 + rand() * 0.8, z1, z, rand() < 0.5 ? STONE_DARK : STONE, { solid: false, shadow: false })
    slab(g, X - w + 0.5 + rand() * 0.4, X + w - 0.5 - rand() * 0.4, -0.4, 0, z1, z, PLATEAU, { solid: false })
    solid(X - w, X + w, VY - 0.3, 0, z1, z)
    for (const side of [-1, 1]) edgeSlope(X + side * w, side, (z + z1) / 2, z - z1)
    for (const side of [-1, 1]) {
      if (rand() < 0.55) {
        const s = 0.8 + rand() * 1.1
        block(g, s, 0.3 + rand() * 0.5, step * (0.6 + rand() * 0.5), X + side * (w + (side > 0 ? jr : jl) - s * 0.4), -0.1, (z + z1) / 2, rand() < 0.5 ? STONE : STONE_DARK, { shadow: false })
      }
    }
  }
  // The tongue's end face.
  for (let k = 0; k < 4; k++) block(g, 1.4 + rand(), 0.4 + rand() * 0.6, 1, X - 4 + k * 2.6, -0.2, Z_TIP + 0.2, STONE_DARK, { shadow: false })
}

// The ramp down from the tongue to the valley floor, under the rails.
function ramp(g, X, rand) {
  const s0 = TRACK.dropStart
  const s1 = TRACK.dropEnd
  for (let s = s0; s < s1; s += 1) {
    const top = trackHeight(s + 0.5) - 0.02
    slab(g, X - 3.4, X + 3.4, VY - 0.3, top, zAt(s + 1), zAt(s), RAMP, { solid: false, shadow: false })
    for (const side of [-1, 1]) if (rand() < 0.35) block(g, 0.7 + rand() * 0.6, 0.35, 1, X + side * 3.6, top - 0.1, zAt(s + 0.5), STONE, { shadow: false })
  }
  for (let s = s0; s < s1; s += 2) {
    const top = trackHeight(s + 1) - 0.02
    solid(X - 3.4, X + 3.4, VY - 0.3, top, zAt(s + 2), zAt(s))
  }
}

// Plank bridge between two plateaus at z.
function bridge(g, xa, xb, z) {
  const len = xb - xa
  const n = Math.round(len / 0.62)
  for (let i = 0; i < n; i++) block(g, 0.58, 0.18, 3.2 + (i % 3) * 0.12, xa + (i + 0.5) * (len / n), 0.02, z, i % 2 ? WOOD : WOOD_DARK)
  for (const x of [xa + 0.6, xb - 0.6]) for (const dz of [-1.3, 1.3]) pillar(g, 0.35, -VY + 0.1, 0.35, x, VY, z + dz, WOOD_DARK)
  solid(xa - 0.5, xb + 0.5, -0.2, 0.1, z - 1.6, z + 1.6)
}

export function buildOutside(scene) {
  const root = new Group()
  scene.add(root)
  const g = new Group()
  root.add(g)
  const rand = mulberry32(8080)
  const crystals = []
  wall(g, crystals, rand)
  const xs = BASES.xs
  xs.forEach((X, i) => {
    plateau(g, X, i === BASES.home, rand)
    ramp(g, X, rand)
    if (i < xs.length - 1) {
      const xa = X + PLATEAU_W - 0.5
      const xb = xs[i + 1] - PLATEAU_W + 0.5
      bridge(g, xa, xb, BASES.cartZ + 5)
    }
  })
  root.remove(g)
  root.add(bake(g, true))
  for (const d of g.userData.darks ?? []) root.add(d)
  // Glowing red crystals set in the cliff face.
  const cg = new Group()
  const geo = new OctahedronGeometry(1, 0)
  const mat = new MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff2a2a', emissiveIntensity: 0.9, roughness: 0.25, flatShading: true })
  for (const [x, y, z, sz] of crystals) {
    const m = new Mesh(geo, mat)
    m.position.set(x, y, z)
    m.scale.set(sz * 0.55, sz * 1.25, sz * 0.5)
    m.rotation.set((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 1.2)
    cg.add(m)
  }
  root.add(bake(cg, true))
  return { root }
}
