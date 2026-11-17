import {
  BoxGeometry,
  ConeGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Color,
} from 'three'
import { BASES, TRACK, VALLEY } from './config.js'
import { RAPIER, addFixed } from './physics.js'
import { mulberry32 } from './textures.js'
import { VALLEY_Y } from './cartPhysics.js'
import { studMat, studPlane } from './studs.js'
import { block, mixHex, pillar } from './build.js'
import { bake } from './bake.js'
import { label, neon } from './propkit.js'
import { cliffColors, grassyAt } from './zones.js'

// The valley outside the hub cave: a flat studded grass floor between tall
// stepped cliffs (grey brick with grass tops and blocky trees), cut across by
// the canyon the broken bridges span, with blue crystal spikes at its bottom,
// blocky clouds overhead and the Great Arch, the gate to the areas past it (zones.js).
const V = VALLEY
const T = TRACK
export const zAt = (s) => BASES.cartZ - s // track s -> world z
const Z_NEAR = zAt(T.lipS) // near canyon edge
const Z_FAR = zAt(T.gapEnd) // far canyon edge
// Everything here is built relative to the valley floor and shifted down to it
// (the bases' plateaus at y = 0 stand VALLEY_Y above it).
const fixedV = (desc, p, q, o) => addFixed(desc, { x: p.x, y: p.y + VALLEY_Y, z: p.z }, q, o)
const DIRT = '#9a6337'
const DIRT_DARK = '#7a4a28'
const DIRT_LIGHT = '#b37845'

function ground(root) {
  const W = V.halfWidth * 2 + 80
  const grass = studMat(V.grass, { rough: 0.9 })
  const nearDepth = V.back - Z_NEAR
  const near = new Mesh(studPlane(W, nearDepth), grass)
  near.position.set(0, 0, (V.back + Z_NEAR) / 2)
  const farDepth = Z_FAR - V.front
  const far = new Mesh(studPlane(W, farDepth), grass)
  far.position.set(0, 0, (Z_FAR + V.front) / 2)
  near.receiveShadow = far.receiveShadow = true
  root.add(near, far)
  fixedV(RAPIER.ColliderDesc.cuboid(W / 2, 1, nearDepth / 2), { x: 0, y: -1, z: near.position.z }, null, { friction: 0.9 })
  fixedV(RAPIER.ColliderDesc.cuboid(W / 2, 1, farDepth / 2), { x: 0, y: -1, z: far.position.z }, null, { friction: 0.9 })

  // Darker patches of studs here and there, like mismatched bricks.
  const rand = mulberry32(31)
  const patches = new Group()
  for (let i = 0; i < 520; i++) {
    const x = (rand() - 0.5) * V.halfWidth * 1.9
    const z = V.back - 30 - rand() * (V.back - V.front - 60)
    if ((z < Z_NEAR + 2 && z > Z_FAR - 2) || !grassyAt(z)) continue
    const w = 1 + Math.floor(rand() * 4)
    const d = 1 + Math.floor(rand() * 4)
    block(patches, w, 0.04, d, x, 0.02, z, rand() < 0.6 ? V.grassDark : mixHex(V.grass, '#ffffff', 0.12), { shadow: false })
  }
  root.add(bake(patches))
}

function canyon(root) {
  const g = new Group()
  const X = T.canyonHalfWidth
  const depth = -T.canyonFloor
  const wallT = 6
  // Walls: the near wall's face is at Z_NEAR, the far wall's at Z_FAR.
  block(g, X * 2, depth, wallT, 0, -depth / 2 - 0.05, Z_NEAR + wallT / 2, DIRT)
  block(g, X * 2, depth, wallT, 0, -depth / 2 - 0.05, Z_FAR - wallT / 2, DIRT)
  fixedV(RAPIER.ColliderDesc.cuboid(X, depth / 2, wallT / 2), { x: 0, y: -depth / 2, z: Z_NEAR + wallT / 2 })
  fixedV(RAPIER.ColliderDesc.cuboid(X, depth / 2, wallT / 2), { x: 0, y: -depth / 2, z: Z_FAR - wallT / 2 })
  // Floor.
  block(g, X * 2, 2, Z_NEAR - Z_FAR + 2, 0, T.canyonFloor - 1, (Z_NEAR + Z_FAR) / 2, '#c88a52')
  fixedV(RAPIER.ColliderDesc.cuboid(X, 1, (Z_NEAR - Z_FAR) / 2 + 1), { x: 0, y: T.canyonFloor - 1, z: (Z_NEAR + Z_FAR) / 2 })

  // Strata and lumps on both faces, so the walls read as voxel rock, not a plane.
  const rand = mulberry32(77)
  for (const [face, dir] of [
    [Z_NEAR, -1],
    [Z_FAR, 1],
  ]) {
    for (let y = -3; y > T.canyonFloor + 1; y -= 2.5 + rand() * 2) {
      const col = rand() < 0.5 ? DIRT_DARK : DIRT_LIGHT
      for (let x = -X; x < X; ) {
        const w = 6 + rand() * 30
        const h = 0.8 + rand() * 1.6
        const out = 0.3 + rand() * 1.4
        block(g, w, h, out * 2, x + w / 2, y, face + dir * 0.2, col, { shadow: false })
        x += w + rand() * 8
      }
    }
    // Grass lip along the top edge, overhanging a little with drips.
    block(g, X * 2, 0.6, 1.4, 0, -0.25, face - dir * 0.6, V.grassDark, { shadow: false })
    for (let x = -X; x < X; x += 3 + rand() * 9) {
      const h = 0.6 + rand() * 2.4
      block(g, 1 + rand() * 3, h, 0.8, x, -h / 2, face + dir * 0.3, V.grassDark, { shadow: false })
    }
  }
  // Blue crystal spikes along the canyon floor.
  const spikeGeo = new ConeGeometry(1, 1, 4, 1)
  spikeGeo.translate(0, 0.5, 0)
  const spikeMat = new MeshStandardMaterial({ color: '#5b8fd6', roughness: 0.25, metalness: 0.15, flatShading: true, emissive: '#16305e', emissiveIntensity: 0.4 })
  const count = 340
  const spikes = new InstancedMesh(spikeGeo, spikeMat, count)
  const e = new Object3D()
  for (let i = 0; i < count; i++) {
    const r = 1.6 + rand() * 3.4
    const h = r * (1.8 + rand() * 1.8)
    e.position.set((rand() - 0.5) * X * 2, T.canyonFloor, Z_FAR + 2 + rand() * (Z_NEAR - Z_FAR - 4))
    e.rotation.set((rand() - 0.5) * 0.35, rand() * Math.PI, (rand() - 0.5) * 0.35)
    e.scale.set(r, h, r)
    e.updateMatrix()
    spikes.setMatrixAt(i, e.matrix)
  }
  spikes.castShadow = true
  spikes.receiveShadow = true
  root.add(bake(g), spikes)
}

// Blocky tree: trunk + stacked leaf blocks.
function tree(parent, x, y, z, s, rand) {
  const trunkH = 3.5 * s
  pillar(parent, 1.1 * s, trunkH, 1.1 * s, x, y, z, '#7a4a25')
  const leaf = rand() < 0.5 ? '#2f8f2a' : '#3aa636'
  pillar(parent, 5 * s, 2.4 * s, 5 * s, x, y + trunkH - 0.4 * s, z, leaf)
  pillar(parent, 3.6 * s, 2 * s, 3.6 * s, x + (rand() - 0.5) * s, y + trunkH + 1.9 * s, z + (rand() - 0.5) * s, mixHex(leaf, '#ffffff', 0.12))
  if (rand() < 0.5) pillar(parent, 2 * s, 1.4 * s, 2 * s, x, y + trunkH + 3.8 * s, z, leaf)
}

// Stepped cliffs along both sides, closing the far end and the back.
function cliffs(root) {
  const rand = mulberry32(5150)
  const g = new Group()
  const [hMin, hMax] = V.cliffHeight
  const rock = V.cliff
  const rockDark = mixHex(V.cliff, '#56607a', 0.35)
  const segment = (x0, x1, z0, z1, h) => {
    // An axis box from (x0, z0) to (x1, z1), h tall, with a grass top and drips.
    const w = Math.abs(x1 - x0)
    const d = Math.abs(z1 - z0)
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const alt = cliffColors(cz)
    pillar(g, w, h, d, cx, 0, cz, rand() < 0.5 ? (alt?.rock ?? rock) : (alt?.dark ?? rockDark))
    pillar(g, w + 0.6, 1.4, d + 0.6, cx, h - 0.2, cz, alt?.top ?? V.cliffTop)
    fixedV(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2), { x: cx, y: h / 2, z: cz })
    return { cx, cz, w, d }
  }
  const drips = (x, z, h, alongZ, len, facing) => {
    for (let t = -len / 2; t < len / 2; t += 2 + rand() * 5) {
      const dh = 1 + rand() * 5
      const px = alongZ ? x + facing * 0.35 : x + t
      const pz = alongZ ? z + t : z + facing * 0.35
      block(g, alongZ ? 0.8 : 1 + rand() * 2.5, dh, alongZ ? 1 + rand() * 2.5 : 0.8, px, h - dh / 2, pz, cliffColors(z)?.top ?? V.cliffTop, { shadow: false })
    }
  }
  // Sides.
  for (const side of [-1, 1]) {
    for (let z = V.back; z > V.front; ) {
      const len = 22 + rand() * 26
      const inset = rand() * 7
      const h1 = hMin + rand() * (hMax - hMin) * 0.6
      const x0 = side * (V.halfWidth + inset)
      const x1 = side * (V.halfWidth + 34)
      segment(x0, x1, z, z - len, h1)
      drips(x0, z - len / 2, h1, true, len, -side)
      // A taller tier behind.
      const h2 = h1 + 8 + rand() * 18
      segment(x1, side * (V.halfWidth + 80), z, z - len, h2)
      drips(x1, z - len / 2, h2, true, len, -side)
      // Trees on the first tier (not along the desert).
      if (!cliffColors(z)) for (let i = 0; i < 2; i++) if (rand() < 0.7) tree(g, side * (V.halfWidth + inset + 4 + rand() * 24), h1 + 1, z - rand() * len, 1 + rand() * 0.6, rand)
      // Rubble at the foot.
      if (rand() < 0.6) {
        const s = 2 + rand() * 4
        pillar(g, s, s * 0.7, s, side * (V.halfWidth + inset - s / 2 - 0.5), 0, z - rand() * len, rock)
      }
      z -= len
    }
  }
  // Far end wall (beyond the arch) and the back wall behind the cave.
  for (const [zEdge, dir] of [
    [V.front, -1],
    [V.back, 1],
  ]) {
    for (let x = -V.halfWidth - 40; x < V.halfWidth + 40; ) {
      const w = 20 + rand() * 24
      const h = hMin + rand() * (hMax - hMin)
      segment(x, x + w, zEdge, zEdge + dir * 40, h)
      drips(x + w / 2, zEdge, h, false, w, -dir)
      if (rand() < 0.6) tree(g, x + w / 2, h + 1, zEdge + dir * (8 + rand() * 20), 1.2, rand)
      x += w
    }
  }
  // Trees in the valley, lining the sides and around the far end.
  for (let i = 0; i < 180; i++) {
    const side = rand() < 0.5 ? -1 : 1
    const x = side * (V.halfWidth - 12 - rand() * 50)
    const z = -40 - rand() * (-V.front - 120)
    if ((z < Z_NEAR + 10 && z > Z_FAR - 10) || !grassyAt(z)) continue
    tree(g, x, 0, z, 0.8 + rand() * 0.5, rand)
  }
  // A grove either side of the Great Arch.
  for (let i = 0; i < 60; i++) {
    const x = (rand() - 0.5) * V.halfWidth * 1.8
    const z = zAt(T.archS) + 40 - rand() * 90
    if (BASES.xs.some((tx) => Math.abs(x - tx) < 10) || Math.abs(x) < 64) continue
    tree(g, x, 0, z, 0.8 + rand() * 0.6, rand)
  }
  root.add(bake(g, true))
}

// The Great Arch: the gate from the valley into the new areas (zones.js).
function arch(root) {
  const g = new Group()
  const z = zAt(T.archS)
  const stone = '#9aa3b6'
  const dark = '#7d879c'
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const w = 22 - k * 2
      pillar(g, w, 13, 22 - k, side * (52 + k * 0.6), k * 12, z, k % 2 ? stone : dark)
    }
  }
  for (let k = 0; k < 4; k++) block(g, 126 - k * 10, 7, 20 - k * 2, 0, 76 + k * 5.5, z, k % 2 ? stone : dark)
  pillar(g, 6, 3, 18, -38, 66, z, V.cliffTop)
  pillar(g, 30, 1.2, 18, 30, 92, z, V.cliffTop)
  const glowMat = neon('#3ab0ff', 3)
  const rim = new Mesh(new BoxGeometry(84, 1.2, 1.2), glowMat)
  rim.position.set(0, 72.6, z - 11.2)
  g.add(rim)
  for (const side of [-1, 1]) {
    const post = new Mesh(new BoxGeometry(1.2, 72, 1.2), glowMat)
    post.position.set(side * 41.4, 36, z - 11.2)
    g.add(post)
  }
  const portal = new Mesh(new BoxGeometry(82, 71, 0.4), new MeshBasicMaterial({ color: '#4fb6ff', transparent: true, opacity: 0.18, depthWrite: false }))
  portal.position.set(0, 35.5, z - 10)
  root.add(bake(g, true), portal)
  const sign = label('THE GREAT ARCH\nBumpy Meadows ahead', 9, { colors: ['#ffffff', '#9fdcff'] })
  sign.position.set(0, 46, z - 14)
  root.add(sign)
}

// Blocky clouds: clusters of flat white slabs.
function clouds(root) {
  const rand = mulberry32(909)
  const mat = new MeshStandardMaterial({ color: '#ffffff', emissive: '#e8f2ff', emissiveIntensity: 0.55, roughness: 1, fog: false })
  const geo = new BoxGeometry(1, 1, 1)
  const items = []
  for (let i = 0; i < 80; i++) {
    const cx = (rand() - 0.5) * 900
    const cz = 300 - rand() * 4100
    const cy = 120 + rand() * 90
    const n = 2 + Math.floor(rand() * 4)
    for (let k = 0; k < n; k++) items.push([cx + (rand() - 0.5) * 50, cy + (rand() - 0.5) * 6, cz + (rand() - 0.5) * 40, 20 + rand() * 40, 4 + rand() * 4, 14 + rand() * 30])
  }
  const mesh = new InstancedMesh(geo, mat, items.length)
  const e = new Object3D()
  items.forEach(([x, y, z, w, h, d], i) => {
    e.position.set(x, y, z)
    e.scale.set(w, h, d)
    e.updateMatrix()
    mesh.setMatrixAt(i, e.matrix)
  })
  root.add(mesh)
  return { mesh, mat }
}

export function createWorld(scene) {
  const root = new Group()
  root.position.y = VALLEY_Y
  scene.add(root)
  ground(root)
  canyon(root)
  cliffs(root)
  arch(root)
  const sky = clouds(root)
  const white = new Color('#ffffff')
  const grey = new Color('#6b7484')
  let t = 0
  return {
    // storm 0..1 greys the clouds; wind 0..1 hurries them along.
    update(dt, storm = 0, wind = 0) {
      t += dt * (1 + wind * 4)
      sky.mesh.position.x = Math.sin(t * 0.004) * 120
      sky.mat.color.copy(white).lerp(grey, storm)
      sky.mat.emissiveIntensity = 0.55 * (1 - storm * 0.85)
    },
  }
}
