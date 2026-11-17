// The five tracks and the bases at their start. Each track: two steel rails on
// wooden sleepers following the height profile (cartPhysics.trackHeight), a
// blue studded bed at the station, a stepped dirt embankment climbing to the
// broken bridge over the canyon, the far landing deck, and a buffer stop at the
// end of the line. Each base: buffer stop, the "+1 Cart" stall and pad, the
// owner's name and trip count; the home base also has the Starter Pack and
// OP V8 display pads. Returns the interactive spots for the home base.
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three'
import { BASES, BUNDLES, GEAR, TRACK } from './config.js'
import { FLOOR_Y, LAND_Y, LIP_Y, VALLEY_Y, trackHeight, trackSlope } from './cartPhysics.js'
import { RAPIER, addFixed } from './physics.js'
import { block, group, mixHex, pillar } from './build.js'
import { bake } from './bake.js'
import { fontReady, label, neon } from './propkit.js'
import { mulberry32 } from './textures.js'
import { buildCart, buildEngine, buildTank, buildWagon } from './cartModel.js'
import { zAt } from './world.js'

const T = TRACK
const DIRT = '#9a6337'
const DIRT_TOP = '#a8703f'
const WOOD = '#8a5a32'
const WOOD_DARK = '#6a4224'
const SLEEPER_H = 0.18
export const RAIL_TOP = SLEEPER_H + 0.18 // rail top above the track height

// Where the rails are at s on the track starting at x: world position and pitch.
export function railPoint(x, s, out) {
  out.x = x
  out.y = trackHeight(s) + RAIL_TOP
  out.z = zAt(s)
  return out
}

// --- Rails + sleepers (instanced across all tracks) -------------------------------------
function railPieces() {
  // [s0, s1] spans with straight pieces; curved stretches are split finely.
  const spans = []
  const add = (a, b, n) => {
    for (let i = 0; i < n; i++) spans.push([a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n])
  }
  add(T.backS, T.dropStart, 1)
  add(T.dropStart, T.dropEnd, 14)
  add(T.dropEnd, T.rampStart, 1)
  add(T.rampStart, T.lipS, 24)
  add(T.gapEnd, T.landFlat, 1)
  add(T.landFlat, T.landEnd, 18)
  // The key-point chain: level stretches in one piece, slopes split finely.
  const H = T.hills
  for (let i = 0; i + 1 < H.length; i++) {
    const [a, ha] = H[i]
    const [b, hb] = H[i + 1]
    add(a, b, ha === hb ? 1 : Math.ceil((b - a) / 2.5))
  }
  add(H[H.length - 1][0], T.length + 1.5, 1)
  return spans
}

function railsAndSleepers(root, xs) {
  const spans = railPieces()
  const railMat = new MeshStandardMaterial({ color: '#c3c8d2', roughness: 0.3, metalness: 0.85 })
  const rails = new InstancedMesh(new BoxGeometry(1, 1, 1), railMat, spans.length * 2 * xs.length + xs.length * 4)
  const sleeperMat = new MeshStandardMaterial({ color: '#7a4a28', roughness: 0.9 })
  const sleeperS = []
  for (let s = T.backS + 0.5; s <= T.length + 1; s += T.sleeperGap) if (s <= T.lipS - 0.4 || s >= T.gapEnd + 0.4) sleeperS.push(s)
  const sleepers = new InstancedMesh(new BoxGeometry(2.5, SLEEPER_H, 0.5), sleeperMat, sleeperS.length * xs.length + xs.length * 6)
  const e = new Object3D()
  let r = 0
  let k = 0
  for (const x of xs) {
    for (const [a, b] of spans) {
      const ya = trackHeight(a)
      const yb = trackHeight(b)
      const len = Math.hypot(b - a, yb - ya)
      for (const side of [-1, 1]) {
        e.position.set(x + side * (T.gauge / 2), (ya + yb) / 2 + SLEEPER_H + 0.09, zAt((a + b) / 2))
        e.rotation.set(Math.atan2(yb - ya, b - a), 0, 0)
        e.scale.set(0.14, 0.18, len + 0.02)
        e.updateMatrix()
        rails.setMatrixAt(r++, e.matrix)
      }
    }
    for (const s of sleeperS) {
      e.position.set(x, trackHeight(s) + SLEEPER_H / 2, zAt(s))
      e.rotation.set(Math.atan(trackSlope(s)), 0, 0)
      e.scale.set(1, 1, 1)
      e.updateMatrix()
      sleepers.setMatrixAt(k++, e.matrix)
    }
    // The broken bridge: rails bent down off the lip, and drooping at the far side.
    const rand = mulberry32(Math.round(x * 13 + 400))
    for (const side of [-1, 1]) {
      const droop = 0.5 + rand() * 0.5
      e.position.set(x + side * (T.gauge / 2), LIP_Y + RAIL_TOP - 0.9 * droop, zAt(T.lipS + 1.6))
      e.rotation.set(-droop * 0.9, side * 0.15 * rand(), side * 0.2)
      e.scale.set(0.14, 0.18, 3.4)
      e.updateMatrix()
      rails.setMatrixAt(r++, e.matrix)
      e.position.set(x + side * (T.gauge / 2), LAND_Y + RAIL_TOP - 0.7, zAt(T.gapEnd - 1.3))
      e.rotation.set(0.7 + rand() * 0.3, side * 0.2, 0)
      e.scale.set(0.14, 0.18, 2.8)
      e.updateMatrix()
      rails.setMatrixAt(r++, e.matrix)
    }
    for (let j = 0; j < 3; j++) {
      e.position.set(x + (rand() - 0.5) * 0.8, LIP_Y - 0.6 - j * 0.9, zAt(T.lipS + 0.8 + j * 0.6))
      e.rotation.set(-0.6 - rand(), rand() - 0.5, (rand() - 0.5) * 1.2)
      e.scale.set(1, 1, 1)
      e.updateMatrix()
      sleepers.setMatrixAt(k++, e.matrix)
    }
    for (let j = 0; j < 3; j++) {
      e.position.set(x + (rand() - 0.5) * 6, FLOOR_Y + 0.3, zAt(T.lipS + 6 + rand() * 30))
      e.rotation.set(rand() * 0.4, rand() * 3, rand() * 0.4)
      e.updateMatrix()
      sleepers.setMatrixAt(k++, e.matrix)
    }
  }
  rails.count = r
  sleepers.count = k
  rails.castShadow = sleepers.castShadow = true
  rails.receiveShadow = sleepers.receiveShadow = true
  root.add(rails, sleepers)
}

// --- Embankments: stepped dirt layers under the ramp and the landing deck ----------------
const LAYER = 0.3
function solveS(f, lo, hi) {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (f(mid)) hi = mid
    else lo = mid
  }
  return hi
}

function embankments(g, x) {
  const H = T.lipHeight
  const n = Math.round(H / LAYER)
  for (let k = 1; k <= n; k++) {
    const top = VALLEY_Y + k * LAYER
    const s0 = solveS((s) => trackHeight(s) >= top, T.rampStart, T.lipS)
    const len = T.lipS - s0
    if (len < 0.2) continue
    const w = 5.2 + (LIP_Y - top) * 0.9
    const zc = (zAt(s0) + zAt(T.lipS)) / 2
    block(g, w, LAYER, len, x, top - LAYER / 2, zc, k === n || (k % 7 === 0) ? DIRT_TOP : DIRT)
    addFixed(RAPIER.ColliderDesc.cuboid(w / 2, LAYER / 2, len / 2), { x, y: top - LAYER / 2, z: zc })
  }
  // Broken support beams poking out of the canyon wall under the lip.
  for (const side of [-1, 1]) {
    block(g, 0.5, 0.5, 6, x + side * 1.8, LIP_Y - 3.5, zAt(T.lipS + 1.4), WOOD_DARK, { pitch: -0.7 })
    block(g, 0.5, 0.5, 4, x + side * 2.6, LIP_Y - 7, zAt(T.lipS + 0.6), WOOD_DARK, { pitch: -1.05 })
  }
  block(g, 6.5, 0.4, 0.5, x, LIP_Y - 0.3, zAt(T.lipS - 0.2), WOOD)

  const L = T.landHeight
  const m = Math.round(L / LAYER)
  for (let k = 1; k <= m; k++) {
    const top = VALLEY_Y + k * LAYER
    const s1 = solveS((s) => trackHeight(s) < top, T.landFlat, T.landEnd)
    const len = s1 - T.gapEnd
    const w = 5.2 + (LAND_Y - top) * 0.9
    const zc = (zAt(T.gapEnd) + zAt(s1)) / 2
    block(g, w, LAYER, len, x, top - LAYER / 2, zc, k === m || (k % 7 === 0) ? DIRT_TOP : DIRT)
    addFixed(RAPIER.ColliderDesc.cuboid(w / 2, LAYER / 2, len / 2), { x, y: top - LAYER / 2, z: zc })
  }
  for (const side of [-1, 1]) block(g, 0.5, 0.5, 5, x + side * 1.8, LAND_Y - 2.8, zAt(T.gapEnd - 1.2), WOOD_DARK, { pitch: 0.75 })
  block(g, 6.5, 0.4, 0.5, x, LAND_Y - 0.3, zAt(T.gapEnd + 0.2), WOOD)
  // Broken planks down in the canyon.
  const rand = mulberry32(Math.round(x * 7 + 99))
  for (let j = 0; j < 5; j++) block(g, 0.4, 0.3, 2 + rand() * 3, x + (rand() - 0.5) * 8, FLOOR_Y + 0.2, zAt(T.lipS + 5 + rand() * 40), WOOD, { yaw: rand() * 3, shadow: false })
}

// --- Supports for the new areas: dirt / sand / rock mounds and wooden trestles ----------------
// Where a stretch of the key-point chain stands above the valley floor it gets a
// stepped mound (humps) or a timber trestle (the river bridge and the Sky Trestle).
const MOUND = 0.5
const heightAt = (s) => trackHeight(s) - VALLEY_Y
// Elevated stretches [s0, s1] of the chain (between key points at height 0).
function raised() {
  const out = []
  const H = T.hills
  let start = null
  for (let i = 0; i < H.length; i++) {
    const h = H[i][1]
    if (h > 0 && start === null) start = H[i - 1][0]
    if (h === 0 && start !== null) {
      out.push([start, H[i][0]])
      start = null
    }
  }
  return out
}
function supportStyle(s) {
  if (s >= T.river.s0 - 60 && s <= T.river.s1 + 60) return 'trestle'
  if (s >= T.gorge.s0 && s < T.mine.s0) return 'trestle'
  if (s >= T.mine.s0 && s < T.mine.s1) return 'rock'
  if (s >= T.mine.s1) return 'sand'
  return 'dirt'
}
const MOUND_COLORS = {
  dirt: [DIRT, DIRT_TOP, '#4fae35'],
  sand: ['#d9a25e', '#e8bd78', '#f0cf8a'],
  rock: ['#3b3f5a', '#4a4f6e', '#4a4f6e'],
}
function mound(g, x, a, b, style) {
  const [body, band, top] = MOUND_COLORS[style]
  let peak = 0
  for (let s = a; s <= b; s += 0.5) peak = Math.max(peak, heightAt(s))
  const n = Math.ceil(peak / MOUND)
  for (let k = 1; k <= n; k++) {
    const topY = Math.min(peak, k * MOUND)
    // First and last s in [a, b] where the rails stand at least this high.
    let s0 = null
    let s1 = null
    for (let s = a; s <= b; s += 0.5) {
      if (heightAt(s) >= topY - 0.02) {
        if (s0 === null) s0 = s
        s1 = s
      }
    }
    if (s0 === null || s1 - s0 < 0.4) continue
    const len = s1 - s0 + 1
    const w = 4.6 + (peak - topY) * 0.75
    const y = VALLEY_Y + topY - MOUND / 2 - 0.25
    const zc = (zAt(s0) + zAt(s1)) / 2
    block(g, w, MOUND, len, x, y, zc, k === n ? top : k % 5 === 0 ? band : body)
    addFixed(RAPIER.ColliderDesc.cuboid(w / 2, MOUND / 2, len / 2), { x, y, z: zc })
  }
}
function trestle(g, x, a, b) {
  const floor = VALLEY_Y
  const step = 3.6
  let i = 0
  for (let s = Math.ceil(a / step) * step; s <= b; s += step, i++) {
    const deck = trackHeight(s)
    const h = deck - floor
    if (h < 0.9) continue
    const z = zAt(s)
    for (const side of [-1, 1]) block(g, 0.42, h, 0.42, x + side * 1.35, floor + h / 2 - 0.05, z, WOOD_DARK, { shadow: i % 2 === 0 })
    block(g, 3.4, 0.36, 0.5, x, deck - 0.08, z, WOOD)
    // Cross ties and X braces every ~6 m of height.
    for (let y = 5; y < h - 1.5; y += 6) {
      block(g, 3, 0.26, 0.3, x, floor + y, z, WOOD)
      if (i % 2 === 0 && h > 4) {
        const rise = Math.min(6, h - y)
        const len = Math.hypot(2.7, rise)
        const ang = Math.atan2(rise, 2.7)
        block(g, len, 0.2, 0.22, x, floor + y + rise / 2, z + 0.12, WOOD_DARK, { roll: ang, shadow: false })
        block(g, len, 0.2, 0.22, x, floor + y + rise / 2, z - 0.12, WOOD_DARK, { roll: -ang, shadow: false })
      }
    }
  }
  // Stringers under the rails, following the slope.
  const n = Math.ceil((b - a) / 6)
  for (let k = 0; k < n; k++) {
    const s0 = a + ((b - a) * k) / n
    const s1 = a + ((b - a) * (k + 1)) / n
    const y0 = trackHeight(s0)
    const y1 = trackHeight(s1)
    if (Math.max(y0, y1) - floor < 0.9) continue
    const len = Math.hypot(s1 - s0, y1 - y0)
    for (const side of [-1, 1]) block(g, 0.34, 0.34, len + 0.1, x + side * 0.9, (y0 + y1) / 2 - 0.36, zAt((s0 + s1) / 2), WOOD_DARK, { pitch: Math.atan2(y1 - y0, s1 - s0), shadow: false })
  }
}
function supports(g, x) {
  for (const [a, b] of raised()) {
    // Split each raised stretch where its style changes.
    let s0 = a
    let style = supportStyle(a + 0.5)
    for (let s = a + 0.5; s <= b; s += 0.5) {
      const st = supportStyle(s)
      if (st !== style || s + 0.5 > b) {
        const s1 = st !== style ? s : b
        if (style === 'trestle') trestle(g, x, s0, s1)
        else mound(g, x, s0, s1, style)
        s0 = s1
        style = st
      }
    }
  }
}

// --- Buffer stops ----------------------------------------------------------------------------
function bufferStop(g, x, s, facing) {
  const z = zAt(s)
  const y = trackHeight(s)
  // Not solid: the base one stands in the cave exit, where everyone walks.
  for (const side of [-1, 1]) pillar(g, 0.35, 1.3, 0.35, x + side * 0.9, y, z, '#6b7280')
  for (let i = 0; i < 4; i++) block(g, 0.6, 0.45, 0.35, x - 0.9 + i * 0.6, y + 1.05, z - facing * 0.05, i % 2 ? '#ffffff' : '#e23a3a')
  for (const side of [-1, 1]) {
    const b = block(g, 0.35, 0.35, 0.45, x + side * 0.7, y + 0.8, z - facing * 0.4, '#2a2a2a')
    void b
  }
}

// --- Base furniture -------------------------------------------------------------------------
function stall(g, x, z, awningA = '#e23a3a', awningB = '#ffffff') {
  // Wooden counter with a striped awning on four posts and a shopkeeper.
  for (const [dx, dz] of [
    [-2.4, -1.4],
    [2.4, -1.4],
    [-2.4, 1.4],
    [2.4, 1.4],
  ])
    pillar(g, 0.3, 3.4, 0.3, x + dx, 0, z + dz, WOOD)
  pillar(g, 5.2, 1.1, 1, x, 0, z - 1.1, WOOD, { solid: true })
  block(g, 5.5, 0.15, 1.2, x, 1.15, z - 1.1, '#a87445')
  for (let i = 0; i < 8; i++) {
    block(g, 0.7, 0.18, 3.6, x - 2.45 + i * 0.7, 3.5 + (i % 2) * 0.02, z, i % 2 ? awningB : awningA, { pitch: 0.18 })
    block(g, 0.7, 0.5, 0.06, x - 2.45 + i * 0.7, 3.12, z - 1.85, i % 2 ? awningB : awningA)
  }
  // Shopkeeper.
  pillar(g, 0.7, 0.9, 0.4, x, 0.9, z + 0.2, '#f3c13a')
  pillar(g, 0.5, 0.5, 0.5, x, 1.8, z + 0.2, '#f3c13a')
  block(g, 1, 0.8, 0.45, x, 2.3, z + 0.25, '#e23a3a')
  for (const s of [-1, 1]) block(g, 0.3, 0.8, 0.3, x + s * 0.5, 1.4, z + 0.15, '#f3c13a')
  // Goods on the counter.
  for (let i = 0; i < 4; i++) pillar(g, 0.35, 0.35, 0.35, x - 1.6 + i * 1.05, 1.22, z - 1.1, ['#f1c40f', '#e67e22', '#3498db', '#2ecc71'][i])
}

function rope(g, x0, z0, x1, z1, y, color) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const m = new Mesh(new CylinderGeometry(0.07, 0.07, len, 8), new MeshStandardMaterial({ color, roughness: 0.6 }))
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
  m.rotation.set(0, Math.atan2(x1 - x0, z1 - z0), Math.PI / 2)
  m.rotation.order = 'YXZ'
  m.rotation.set(Math.PI / 2, Math.atan2(x1 - x0, z1 - z0), 0)
  g.add(m)
}

// A display pad: platform, posts with ropes, the item spinning above (returned).
function displayPad(root, staticG, x, z, color, postColor, ropeColor) {
  pillar(staticG, 7, 0.5, 7, x, 0, z, color, { solid: true })
  pillar(staticG, 6.4, 0.1, 6.4, x, 0.5, z, mixHex(color, '#ffffff', 0.2))
  const corners = [
    [-3, -3],
    [3, -3],
    [3, 3],
    [-3, 3],
  ]
  corners.forEach(([dx, dz], i) => {
    pillar(staticG, 0.22, 1.3, 0.22, x + dx, 0.5, z + dz, postColor, { metal: 0.6, rough: 0.3 })
    const [nx, nz] = corners[(i + 1) % 4]
    if (i !== 3) rope(staticG, x + dx, z + dz, x + nx, z + nz, 1.55, ropeColor)
  })
  const spin = group(root, x, 1.3, z)
  return spin
}

// Dynamic text sprite: draw(ctx, w, h) repaints on demand.
export function canvasSprite(w, h, height, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  sprite.scale.set((height * w) / h, height, 1)
  const redraw = (...args) => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    draw(ctx, w, h, ...args)
    tex.needsUpdate = true
  }
  sprite.userData.redraw = redraw
  return sprite
}

function outlinedText(ctx, text, x, y, px, fill, outline = '#0b1a3a', width = 10) {
  ctx.font = `700 ${px}px Fredoka, "Arial Black", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = width
  ctx.strokeStyle = outline
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}
// Where things stand on every base plateau: [x offset from the track, world z].
const LAYOUT = { stall: [11.5, 5], pad: [6, -2], v8: [-9.5, 3], starter: [-9.5, -14], sign: [0, 4] }

// A blocky avatar head for the owner sign (cartoon: yellow skin, brown hair, shades).
function paintHead(ctx, cx, cy, size) {
  const s = size / 10
  const x = cx - size / 2
  const y = cy - size / 2
  ctx.lineJoin = 'round'
  ctx.fillStyle = '#f5c542'
  ctx.strokeStyle = '#2a1a08'
  ctx.lineWidth = s * 0.5
  ctx.beginPath()
  ctx.roundRect(x, y + s, size, size - s, s * 1.6)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#b5551d'
  ctx.beginPath()
  ctx.roundRect(x - s * 0.4, y - s * 0.4, size + s * 0.8, s * 3.4, s * 1.4)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#d06a24'
  for (let i = 0; i < 5; i++) ctx.fillRect(x + s * (0.4 + i * 1.9), y + s * 2.2, s * 1.2, s * 1.4)
  ctx.fillStyle = '#3a1a6a'
  ctx.beginPath()
  ctx.roundRect(x + s * 0.8, y + s * 4, s * 3.8, s * 2.2, s)
  ctx.roundRect(x + s * 5.4, y + s * 4, s * 3.8, s * 2.2, s)
  ctx.fill()
  ctx.fillStyle = '#9a6aff'
  ctx.fillRect(x + s * 1.3, y + s * 4.4, s * 1.2, s * 0.6)
  ctx.fillRect(x + s * 5.9, y + s * 4.4, s * 1.2, s * 0.6)
  ctx.fillStyle = '#2a1a08'
  ctx.fillRect(x + s * 4.6, y + s * 4.6, s * 0.8, s * 0.5)
  ctx.lineWidth = s * 0.55
  ctx.beginPath()
  ctx.arc(cx, y + s * 6.6, s * 1.8, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()
}

export const fmt = (n) => '$' + Math.floor(n).toLocaleString('en-US')

export function buildTracks(scene, gearById) {
  const root = new Group()
  scene.add(root)
  const staticG = new Group()
  const xs = BASES.xs
  railsAndSleepers(root, xs)
  const rand = mulberry32(2718)
  const bases = []
  const minis = []
  xs.forEach((x, i) => {
    const home = i === BASES.home
    // Station bed: blue checked bricks from the cave mouth out along the plateau.
    const bedLen = T.stationLength - T.backS
    const bedZ = zAt((T.stationLength + T.backS) / 2)
    block(staticG, 4.6, 0.1, bedLen, x, 0.05, bedZ, '#3a8cff', { shadow: false })
    for (const side of [-1, 1]) block(staticG, 0.4, 0.14, bedLen, x + side * 2.5, 0.07, bedZ, '#2a6fd6', { shadow: false })
    for (let k = 0; k < bedLen / 2; k += 2) block(staticG, 4.2, 0.02, 2, x, 0.11, zAt(T.backS + 1 + k * 2), '#5aa8ff', { shadow: false })
    embankments(staticG, x)
    supports(staticG, x)
    bufferStop(staticG, x, T.backS + 0.4, -1)
    bufferStop(staticG, x, T.length + 1.6, 1)

    stall(staticG, x + LAYOUT.stall[0], LAYOUT.stall[1])
    // The +1 Cart pad (glowing) with a little cart on it.
    pillar(staticG, 4.4, 0.35, 4.4, x + LAYOUT.pad[0], 0, LAYOUT.pad[1], '#2ad1ff', { emissive: '#18a8d8', emissiveIntensity: 0.9 })
    const mini = buildWagon(i, null)
    mini.scale.setScalar(0.62)
    mini.position.set(x + LAYOUT.pad[0], 0.4, LAYOUT.pad[1])
    mini.rotation.y = 0.5
    root.add(mini)
    minis.push(mini)

    const parked = home ? null : buildCart(gearById ? { wheels: gearById.wooden, engine: gearById.rusty, fuel: gearById.jerry } : {})
    if (parked) {
      parked.position.set(x, RAIL_TOP, BASES.cartZ - 0.5)
      root.add(parked)
    }
    const sign = home ? null : label('OPEN BASE', 1.8, { color: '#d7e2ff' })
    if (sign) {
      sign.position.set(x, 11, LAYOUT.sign[1])
      root.add(sign)
    }
    bases.push({ x, home })
  })
  root.add(bake(staticG, true))

  // --- Home base: interactive spots -------------------------------------------------------
  const hx = xs[BASES.home]
  const cz = BASES.cartZ
  const padG = new Group()
  const starter = displayPad(root, padG, hx + LAYOUT.starter[0], LAYOUT.starter[1], '#f4c21b', '#ffd84a', '#d62a2a')
  const starterGear = BUNDLES.starter.gear.map((id) => GEAR.find((g) => g.id === id))
  const eng = buildEngine(starterGear[0].id, starterGear[0].color)
  eng.scale.setScalar(1.6)
  eng.position.set(-0.6, 0, 0)
  starter.add(eng)
  const tank = buildTank(starterGear[1].id, starterGear[1].color)
  tank.scale.setScalar(1.3)
  tank.position.set(1.5, 0, 0.6)
  starter.add(tank)
  const v8 = displayPad(root, padG, hx + LAYOUT.v8[0], LAYOUT.v8[1], '#2f6fe0', '#9fc4ff', '#7fb4ff')
  const v8gear = GEAR.find((g) => g.id === BUNDLES.v8.gear[0])
  const v8m = buildEngine(v8gear.id, v8gear.color)
  v8m.scale.setScalar(2)
  v8.add(v8m)
  root.add(bake(padG, true))

  const priceLabel = (title, price, color, y, x, z) => {
    const sp = canvasSprite(512, 220, 3.2, (ctx, w, h) => {
      outlinedText(ctx, title, w / 2, 70, 72, color, '#3b2600', 14)
      ctx.fillStyle = '#3fd14a'
      outlinedText(ctx, fmt(price), w / 2, 160, 78, '#5dff6a', '#0b3a14', 14)
    })
    sp.position.set(x, y, z)
    root.add(sp)
    fontReady.then(() => sp.userData.redraw())
    sp.userData.redraw()
    return sp
  }
  priceLabel('STARTER PACK', BUNDLES.starter.price, '#ffd23a', 5.2, hx + LAYOUT.starter[0], LAYOUT.starter[1])
  priceLabel('OP V8 ENGINE', BUNDLES.v8.price, '#7fc2ff', 5.6, hx + LAYOUT.v8[0], LAYOUT.v8[1])

  // +1 Cart progress bar.
  const cartBar = canvasSprite(640, 230, 2.6, (ctx, w, h, money, price, maxed) => {
    outlinedText(ctx, maxed ? 'Carts maxed!' : '+1 Cart', w / 2, 62, 80, '#ffffff', '#0b1a3a', 14)
    if (maxed) return
    const bx = 30
    const by = 120
    const bw = w - 60
    const bh = 84
    const r = 42
    const path = (x0, wid) => {
      ctx.beginPath()
      ctx.roundRect(x0, by, wid, bh, r)
    }
    path(bx, bw)
    ctx.fillStyle = '#0b1a3a'
    ctx.fill()
    const k = Math.max(0, Math.min(1, money / price))
    if (k > 0.02) {
      path(bx + 6, (bw - 12) * k)
      ctx.fillStyle = k >= 1 ? '#22e03a' : '#1fb02f'
      ctx.fill()
    }
    outlinedText(ctx, `${fmt(money)} / ${fmt(price)}`, w / 2, by + bh / 2 + 2, 54, '#ffffff', '#0b3a14', 10)
  })
  cartBar.position.set(hx + LAYOUT.pad[0], 5.2, LAYOUT.pad[1])
  root.add(cartBar)

  // Owner sign: avatar head, name, trips.
  const nameSign = canvasSprite(768, 520, 9, (ctx, w, h, name, trips) => {
    paintHead(ctx, w / 2, 130, 210)
    outlinedText(ctx, name, w / 2, 330, 92, '#e8edff', '#2a3a6a', 16)
    outlinedText(ctx, `${trips} Trip${trips === 1 ? '' : 's'}`, w / 2, 440, 86, '#4dff5a', '#0b3a14', 16)
  })
  nameSign.position.set(hx, 13.5, LAYOUT.sign[1])
  root.add(nameSign)

  return {
    root,
    homeX: hx,
    displays: { starter, v8 },
    spots: {
      cart: { x: hx, z: cz },
      plusCart: { x: hx + LAYOUT.pad[0], z: LAYOUT.pad[1] },
      starter: { x: hx + LAYOUT.starter[0], z: LAYOUT.starter[1] },
      v8: { x: hx + LAYOUT.v8[0], z: LAYOUT.v8[1] },
      stall: { x: hx + LAYOUT.stall[0], z: LAYOUT.stall[1] - 2 },
    },
    setCartBar: (money, price, maxed) => cartBar.userData.redraw(money, price, maxed),
    setOwner: (name, trips) => nameSign.userData.redraw(name, trips),
    redrawOnFont: (fn) => fontReady.then(fn),
    update(dt, t) {
      starter.rotation.y = t * 0.6
      v8.rotation.y = -t * 0.6
      minis.forEach((m, i) => {
        m.rotation.y = 0.5 + Math.sin(t * 1.2 + i) * 0.3
        m.position.y = 0.45 + Math.sin(t * 2 + i) * 0.08
      })
    },
  }
}
