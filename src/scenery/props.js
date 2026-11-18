// Procedural toy-brick props for the rail-line areas: farm, forest, hills and
// mountain pass, pasture, rockslide, river drawbridge, desert junction, the
// station stop line and the ride pickups.
//
// Conventions: metres, +Y up, the track runs along -Z (forward). Unless noted,
// a prop's origin is the centre of its base on the ground and its "front" (sign
// faces, doors) looks along +Z, towards a cart coming down the track.
//
// STATIC props are plain Groups of meshes built from cached materials (mostly
// studMat), so bake(group) merges them into a few draw calls. ANIMATED props
// expose their live parts in userData (see each builder). Shared geometries and
// materials live in module caches; nothing here needs disposing per prop.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { studBox, studMat } from '../studs.js'
import { fontReady, neon } from '../propkit.js'
import { mulberry32, paintSoftDot } from '../textures.js'
import { mixHex } from '../build.js'

// --- Palette ---------------------------------------------------------------------------------
const WOOD = '#8a5a32'
const WOOD_D = '#6a4224'
const WOOD_L = '#b07a46'
const BARK = '#6b4a2b'
const WHITE = '#f3efe4'
const STONE = '#8e9196'
const STONE_D = '#6d7177'
const STONE_L = '#a9acb0'
const SNOW = '#f4f8ff'
const GRASS = '#4caf3a'
const GRASS_D = '#3c8f2f'
const DIRT = '#7a5634'
const IRON = '#3b3f46'
const DARK = '#2a2f3a'
const ROCKS = ['#8a8f96', '#7b7f86', '#959aa1']
const CLIFF = ['#857b70', '#958a7d', '#7a7168']

// --- Small helpers ---------------------------------------------------------------------------
let seedN = 1
// A rand function: the caller's, a numeric seed, or a fresh deterministic one.
const rng = (rand) => (typeof rand === 'function' ? rand : mulberry32(typeof rand === 'number' ? rand : 0x9e37 + seedN++ * 7919))
const q = (v) => Math.max(0.25, Math.round(v * 4) / 4) // rand-driven sizes snap to 0.25 m (bounded geometry cache)
const q5 = (v) => Math.max(0.05, Math.round(v * 20) / 20)
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length]
const S = (c) => studMat(c) // studded
const F = (c, rough = 0.7, metal = 0) => studMat(c, { flat: true, rough, metal }) // plain
const METAL = () => F('#aeb6bf', 0.38, 0.65)
const asMat = (m, flat) => (typeof m === 'string' ? (flat ? F(m) : S(m)) : m)

// Cached non-studded materials (glass, gold, double-sided cloth...).
const mats = new Map()
function mat(color, rough = 0.5, metal = 0, extra = {}) {
  const key = `${color}|${rough}|${metal}|${JSON.stringify(extra)}`
  let m = mats.get(key)
  if (!m) mats.set(key, (m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra })))
  return m
}
const neons = new Map()
function glowM(color, k = 3) {
  const key = `${color}|${k}`
  let m = neons.get(key)
  if (!m) neons.set(key, (m = neon(color, k)))
  return m
}

function mesh(p, g, m, x, y, z, o) {
  const me = new Mesh(g, m)
  me.position.set(x, y, z)
  if (o) {
    me.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)
    me.castShadow = !!o.cast
  }
  me.receiveShadow = true
  p.add(me)
  return me
}
// Studded box centred at (x, y, z). o: { rx, ry, rz, cast }
const bx = (p, m, w, h, d, x, y, z, o) => mesh(p, studBox(w, h, d), asMat(m), x, y, z, o)
// Box standing on y = base.
const pl = (p, m, w, h, d, x, base, z, o) => bx(p, m, w, h, d, x, base + h / 2, z, o)

const cylGeos = new Map()
function cylGeo(seg) {
  let g = cylGeos.get(seg)
  if (!g) cylGeos.set(seg, (g = new CylinderGeometry(1, 1, 1, seg)))
  return g
}
// Cylinder of radius r, length len centred at (x, y, z), axis 'y' | 'x' | 'z'.
function cy(p, m, r, len, x, y, z, axis = 'y', seg = 10, o) {
  const me = mesh(p, cylGeo(seg), asMat(m, true), x, y, z, o)
  me.scale.set(r, len, r)
  if (axis === 'x') me.rotation.z = Math.PI / 2
  else if (axis === 'z') me.rotation.x = Math.PI / 2
  return me
}
const SPHERE = new SphereGeometry(1, 10, 8)
const sph = (p, m, r, x, y, z) => {
  const me = mesh(p, SPHERE, asMat(m, true), x, y, z)
  me.scale.setScalar(r)
  return me
}
const planes = new Map()
function planeGeo(w, h) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}`
  let g = planes.get(key)
  if (!g) planes.set(key, (g = new PlaneGeometry(w, h)))
  return g
}
function face(p, m, w, h, x, y, z, ry = 0) {
  const me = new Mesh(planeGeo(w, h), m)
  me.position.set(x, y, z)
  me.rotation.y = ry
  me.receiveShadow = true
  p.add(me)
  return me
}

// --- Canvas faces (signs) -----------------------------------------------------------------
const FONT = (px) => `700 ${px}px Fredoka, "Arial Black", sans-serif`
const faceMats = new Map()
// One cached material per key; `paint(ctx, w, h)` runs now and again once Fredoka is in.
function canvasMat(key, w, h, paint, opts = {}) {
  let m = faceMats.get(key)
  if (m) return m
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const draw = () => {
    const x = c.getContext('2d')
    x.clearRect(0, 0, w, h)
    x.save()
    paint(x, w, h)
    x.restore()
    tex.needsUpdate = true
  }
  draw()
  fontReady.then(draw)
  m = new MeshStandardMaterial({ map: tex, roughness: opts.rough ?? 0.5, metalness: opts.metal ?? 0, alphaTest: opts.alpha ? 0.5 : 0, ...opts.extra })
  faceMats.set(key, m)
  return m
}
function fitText(x, text, cx, cy, maxW, px, { color = '#ffffff', outline = null, ow = null } = {}) {
  let size = px
  x.font = FONT(size)
  const tw = x.measureText(text).width
  if (tw > maxW) {
    size = Math.max(10, Math.floor((size * maxW) / tw))
    x.font = FONT(size)
  }
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.lineJoin = 'round'
  if (outline) {
    x.lineWidth = ow ?? size * 0.16
    x.strokeStyle = outline
    x.strokeText(text, cx, cy)
  }
  x.fillStyle = color
  x.fillText(text, cx, cy)
}
function rrect(x, x0, y0, w, h, r) {
  x.beginPath()
  x.moveTo(x0 + r, y0)
  x.arcTo(x0 + w, y0, x0 + w, y0 + h, r)
  x.arcTo(x0 + w, y0 + h, x0, y0 + h, r)
  x.arcTo(x0, y0 + h, x0, y0, r)
  x.arcTo(x0, y0, x0 + w, y0, r)
  x.closePath()
}
function poly(x, pts) {
  x.beginPath()
  x.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1])
  x.closePath()
  x.fill()
}
function star(x, cx, cy, r) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  poly(x, pts)
}

// ============================================================================================
// FARM
// ============================================================================================

// Stone-and-brick tower mill, ~14.5 m to the cap. userData.rotor: Group at the hub
// (0, 10.6, 2.9), sails in its local XY plane: spin rotor.rotation.z. ~5.6 m sails.
export function windmill() {
  const g = new Group()
  const brick = S('#c8b48e')
  const brick2 = S('#b9a37c')
  const trim = S(WHITE)
  const roof = S('#8e2f2a')
  const dark = F('#2b2420')
  pl(g, STONE_D, 4.8, 0.6, 4.8, 0, 0, 0, { cast: true })
  const tiers = [
    [4.0, 3.2],
    [3.5, 3.0],
    [3.0, 2.8],
    [2.6, 2.2],
  ]
  let y = 0.6
  tiers.forEach(([w, h], i) => {
    pl(g, i % 2 ? brick2 : brick, w, h, w, 0, y, 0, { cast: true })
    y += h
    if (i < 3) bx(g, trim, w + 0.3, 0.25, w + 0.3, 0, y, 0)
  })
  // Stepped cap.
  ;[3.2, 2.5, 1.8, 1.0].forEach((w, i) => pl(g, roof, w, 0.6, w, 0, y + i * 0.6, 0, { cast: i === 0 }))
  // Door and windows.
  pl(g, trim, 1.6, 2.4, 0.1, 0, 0.6, 2.02)
  pl(g, F('#5a3a22'), 1.1, 2.1, 0.14, 0, 0.6, 2.05)
  pl(g, trim, 0.9, 1.1, 0.1, 0, 4.7, 1.77)
  pl(g, dark, 0.6, 0.8, 0.14, 0, 4.85, 1.79)
  pl(g, trim, 0.1, 1.1, 0.9, 1.52, 7.6, 0)
  pl(g, dark, 0.14, 0.8, 0.6, 1.54, 7.75, 0)
  // Wooden gallery round the second tier.
  pl(g, S(WOOD), 4.8, 0.2, 4.8, 0, 6.85, 0)
  const wood = S(WOOD_D)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pl(g, wood, 0.15, 1.0, 0.15, sx * 2.3, 7.05, sz * 2.3)
  for (const s of [-1, 1]) {
    bx(g, wood, 4.6, 0.12, 0.12, 0, 7.95, s * 2.3)
    bx(g, wood, 0.12, 0.12, 4.6, s * 2.3, 7.95, 0)
  }
  // Axle out to the rotor.
  bx(g, F(IRON, 0.5, 0.5), 0.4, 0.4, 1.6, 0, 10.6, 2.1)
  // Rotor: hub + four lattice sails.
  const rotor = new Group()
  rotor.position.set(0, 10.6, 2.9)
  g.add(rotor)
  cy(rotor, F(WOOD_D), 0.45, 0.6, 0, 0, 0, 'z', 10)
  cy(rotor, F('#8e2f2a'), 0.25, 0.3, 0, 0, 0.42, 'z', 8)
  const spar = S(WOOD)
  const sail = S('#efe7d2')
  for (let k = 0; k < 4; k++) {
    const b = new Group()
    b.rotation.z = Math.PI / 4 + (k * Math.PI) / 2
    rotor.add(b)
    bx(b, spar, 0.22, 5.6, 0.18, 0, 2.9, 0, { cast: true })
    bx(b, sail, 1.3, 4.4, 0.06, 0.75, 3.4, -0.06, { cast: true })
    bx(b, spar, 1.5, 0.12, 0.12, 0.7, 5.55, 0.02)
  }
  g.userData.rotor = rotor
  return g
}

// Red barn, 12 (X) x ~9.4 (Y) x 10 (Z); big doors + hayloft on the +Z gable.
export function barn() {
  const g = new Group()
  const W = 12
  const D = 10
  const red = S('#b8312a')
  const red2 = S('#a92c26')
  const redD = S('#8f2420')
  const white = S(WHITE)
  const roofs = [S('#4d525c'), S('#5d636e')]
  const dark = F('#2a1d16')
  pl(g, STONE_D, W + 0.4, 0.5, D + 0.4, 0, 0, 0)
  pl(g, red, W, 5, D, 0, 0.5, 0, { cast: true })
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pl(g, white, 0.45, 5, 0.45, (sx * W) / 2, 0.5, (sz * D) / 2)
  bx(g, white, W + 0.5, 0.35, D + 0.5, 0, 5.35, 0)
  // Stepped gable roof, ridge along Z.
  let y = 5.5
  for (let i = 0; i < 5; i++) {
    const w = 11 - 2.2 * i
    pl(g, i % 2 ? red2 : red, w, 0.7, D - 0.2, 0, y, 0, { cast: i === 0 })
    pl(g, roofs[i % 2], w + 1.0, 0.3, D + 0.8, 0, y + 0.45, 0, { cast: true })
    y += 0.7
  }
  pl(g, roofs[0], 1.4, 0.4, D + 1.0, 0, y, 0)
  // Cupola on the ridge.
  pl(g, white, 1.2, 1.0, 1.2, 0, y + 0.2, 0)
  pl(g, roofs[1], 1.7, 0.3, 1.7, 0, y + 1.2, 0)
  // Big doors.
  const zf = D / 2
  pl(g, white, 0.35, 4.0, 0.2, -2.55, 0.5, zf + 0.02)
  pl(g, white, 0.35, 4.0, 0.2, 2.55, 0.5, zf + 0.02)
  pl(g, white, 5.45, 0.35, 0.2, 0, 4.5, zf + 0.02)
  const ang = Math.atan2(3.8, 2.2)
  for (const s of [-1, 1]) {
    pl(g, redD, 2.2, 3.85, 0.15, s * 1.15, 0.6, zf + 0.06)
    bx(g, white, 4.2, 0.22, 0.08, s * 1.15, 2.52, zf + 0.17, { rz: ang })
    bx(g, white, 4.2, 0.22, 0.08, s * 1.15, 2.52, zf + 0.17, { rz: -ang })
  }
  // Hayloft door, hay and hoist beam.
  bx(g, white, 2.2, 2.0, 0.12, 0, 6.8, zf - 0.04)
  bx(g, dark, 1.7, 1.5, 0.14, 0, 6.8, zf - 0.02)
  bx(g, S('#e8c35a'), 1.4, 0.5, 0.3, 0, 6.3, zf - 0.02)
  bx(g, S(WOOD_D), 0.3, 0.3, 1.6, 0, 8.05, zf + 0.5)
  bx(g, F(IRON), 0.25, 0.3, 0.25, 0, 7.75, zf + 1.1)
  // Side windows.
  for (const s of [-1, 1]) {
    bx(g, white, 0.1, 1.4, 1.6, (s * W) / 2 + s * 0.03, 3.2, 0)
    bx(g, dark, 0.14, 1.0, 1.2, (s * W) / 2 + s * 0.04, 3.2, 0)
  }
  return g
}

// Farm silo: ~2.5 m radius, ~13 m tall with dome; ladder on +X.
export function silo() {
  const g = new Group()
  cy(g, F('#9a9a96', 0.9), 2.5, 0.5, 0, 0.25, 0, 'y', 14)
  cy(g, F('#9fb3c4', 0.6, 0.2), 2.2, 10.5, 0, 5.75, 0, 'y', 14, { cast: true })
  const band = F('#6c7f90', 0.45, 0.5)
  for (const y of [2.5, 5, 7.5, 10]) cy(g, band, 2.27, 0.2, 0, y, 0, 'y', 14)
  const dome = mesh(g, new SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), F('#e8ecf0', 0.4, 0.4), 0, 11, 0, { cast: true })
  dome.scale.set(2.25, 1.6, 2.25)
  cy(g, F('#c4302b'), 0.35, 0.5, 0, 12.75, 0, 'y', 8)
  const rail = METAL()
  for (const s of [-1, 1]) pl(g, rail, 0.08, 10.6, 0.08, 2.4, 0.5, s * 0.3)
  for (let i = 0; i < 8; i++) bx(g, rail, 0.08, 0.06, 0.6, 2.4, 1.3 + i * 1.25, 0)
  bx(g, F('#7d8a96', 0.5, 0.4), 0.5, 4.2, 0.5, -2.6, 2.6, 0, { rz: -0.45 })
  return g
}

// Post-and-two-rail wooden fence along local X from 0 to `length`.
export function fence(length = 8) {
  const g = new Group()
  const n = Math.max(1, Math.round(length / 2))
  const sp = length / n
  const post = S(WOOD_D)
  for (let i = 0; i <= n; i++) {
    pl(g, post, 0.26, 1.3, 0.26, i * sp, 0, 0)
    pl(g, post, 0.32, 0.1, 0.32, i * sp, 1.3, 0)
  }
  const rail = S(WOOD)
  bx(g, rail, length, 0.18, 0.1, length / 2, 0.55, 0.16)
  bx(g, rail, length, 0.18, 0.1, length / 2, 1.0, 0.16)
  return g
}

// Round bale (~1.7 m) or square bale (stack), with twine bands.
export function haybale(rand) {
  rand = rng(rand)
  const g = new Group()
  const twine = F('#a8702a')
  if (rand() < 0.5) {
    const r = 0.85
    cy(g, F('#e2bc55', 0.95), r, 1.5, 0, r, 0, 'x', 12, { cast: true })
    cy(g, F('#c99a32', 0.95), r * 0.78, 1.54, 0, r, 0, 'x', 12)
    for (const s of [-0.4, 0.4]) cy(g, twine, r + 0.02, 0.06, s, r, 0, 'x', 12)
  } else {
    const hay = S('#e8c35a')
    pl(g, hay, 1.3, 0.85, 2.0, 0, 0, 0, { cast: true })
    for (const s of [-0.5, 0.5]) pl(g, twine, 1.34, 0.89, 0.08, 0, -0.02, s)
    if (rand() < 0.5) {
      const top = new Group()
      top.position.set(q5((rand() - 0.5) * 0.3), 0.85, 0)
      top.rotation.y = (rand() - 0.5) * 0.6
      g.add(top)
      pl(top, hay, 1.3, 0.85, 2.0, 0, 0, 0, { cast: true })
      for (const s of [-0.5, 0.5]) pl(top, twine, 1.34, 0.89, 0.08, 0, -0.02, s)
    }
  }
  return g
}

// Little green tractor with red rims, ~3.4 m long, nose towards -Z.
export function tractor() {
  const g = new Group()
  const green = S('#2e9e3e')
  const red = F('#d03a2a', 0.5)
  const tyre = F('#1d1d20', 0.95)
  const dark = F(DARK, 0.6, 0.4)
  bx(g, dark, 1.2, 0.4, 3.0, 0, 0.9, 0)
  pl(g, green, 1.1, 0.9, 1.6, 0, 1.05, -0.8, { cast: true })
  bx(g, F('#30343a', 0.5, 0.5), 0.9, 0.7, 0.06, 0, 1.5, -1.62)
  const lamp = studMat('#fff3b0', { flat: true, emissive: '#fff3b0', emissiveIntensity: 0.5 })
  for (const s of [-1, 1]) bx(g, lamp, 0.2, 0.18, 0.06, s * 0.38, 1.92, -1.62)
  for (const s of [-1, 1]) {
    cy(g, tyre, 0.8, 0.45, s * 1.0, 0.8, 0.7, 'x', 14, { cast: true })
    cy(g, red, 0.45, 0.47, s * 1.0, 0.8, 0.7, 'x', 10)
    cy(g, tyre, 0.45, 0.3, s * 0.78, 0.45, -1.1, 'x', 12, { cast: true })
    cy(g, red, 0.25, 0.32, s * 0.78, 0.45, -1.1, 'x', 8)
    bx(g, green, 0.55, 0.15, 1.6, s * 0.95, 1.68, 0.7)
  }
  // Cab: posts, roof, seat, wheel.
  for (const sx of [-1, 1]) for (const sz of [0.15, 1.3]) pl(g, dark, 0.1, 1.45, 0.1, sx * 0.6, 1.3, sz)
  pl(g, S('#d03a2a'), 1.5, 0.15, 1.5, 0, 2.75, 0.72, { cast: true })
  pl(g, F('#2a2a2a', 0.8), 0.6, 0.15, 0.55, 0, 1.1, 0.9)
  pl(g, F('#2a2a2a', 0.8), 0.6, 0.6, 0.12, 0, 1.25, 1.18)
  bx(g, dark, 0.06, 0.06, 0.6, 0, 1.7, 0.2, { rx: 0.7 })
  cy(g, dark, 0.22, 0.05, 0, 1.9, 0.0, 'y', 10).rotation.x = -0.6
  cy(g, dark, 0.07, 1.2, 0.35, 2.3, -1.1, 'y', 6)
  cy(g, dark, 0.1, 0.1, 0.35, 2.92, -1.1, 'y', 6)
  return g
}

// Galvanised water trough (2.4 m) with a hand pump at +X.
export function waterTrough() {
  const g = new Group()
  const tin = F('#9aa4ad', 0.45, 0.6)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pl(g, S(WOOD_D), 0.2, 0.3, 0.2, sx * 0.95, 0, sz * 0.3)
  pl(g, tin, 2.4, 0.12, 0.9, 0, 0.3, 0)
  for (const s of [-1, 1]) {
    pl(g, tin, 2.4, 0.55, 0.08, 0, 0.42, s * 0.41)
    pl(g, tin, 0.08, 0.55, 0.74, s * 1.16, 0.42, 0)
  }
  bx(g, F('#3f8fd6', 0.12, 0.1), 2.28, 0.05, 0.74, 0, 0.82, 0)
  const pump = F('#2f6b3f', 0.5, 0.3)
  pl(g, pump, 0.25, 1.15, 0.25, 1.55, 0, 0)
  bx(g, pump, 0.45, 0.1, 0.1, 1.3, 1.0, 0)
  bx(g, pump, 0.06, 0.06, 0.7, 1.55, 1.25, 0.25, { rx: 0.5 })
  cy(g, pump, 0.16, 0.12, 1.55, 1.2, 0, 'y', 8)
  return g
}

// Scarecrow on a cross, ~2.9 m, with a crow on its left arm.
export function scarecrow() {
  const g = new Group()
  const wood = S(WOOD_D)
  const straw = S('#e8c35a')
  pl(g, wood, 0.18, 2.6, 0.18, 0, 0, -0.1)
  bx(g, wood, 2.2, 0.14, 0.14, 0, 1.9, -0.1)
  const pants = S('#3d5fa8')
  for (const s of [-1, 1]) pl(g, pants, 0.26, 0.8, 0.3, s * 0.16, 0.7, 0)
  pl(g, S('#c8402e'), 0.7, 0.7, 0.4, 0, 1.5, 0, { cast: true })
  for (const s of [-1, 1]) {
    bx(g, S('#b03626'), 0.7, 0.28, 0.3, s * 0.7, 1.9, 0)
    bx(g, straw, 0.22, 0.2, 0.2, s * 1.15, 1.85, 0)
    bx(g, straw, 0.2, 0.18, 0.22, s * 0.16, 0.62, 0)
  }
  pl(g, S('#d8b980'), 0.5, 0.5, 0.5, 0, 2.2, 0)
  const hat = S('#5a4630')
  pl(g, hat, 0.9, 0.08, 0.9, 0, 2.7, 0)
  pl(g, hat, 0.5, 0.35, 0.5, 0, 2.78, 0)
  const ink = F('#1b1b1b')
  for (const s of [-1, 1]) bx(g, ink, 0.08, 0.08, 0.04, s * 0.12, 2.52, 0.26)
  bx(g, ink, 0.26, 0.05, 0.04, 0, 2.34, 0.26)
  // Crow.
  const crow = F('#16161a', 0.6)
  bx(g, crow, 0.22, 0.18, 0.36, -0.95, 2.13, 0)
  bx(g, crow, 0.14, 0.14, 0.14, -0.95, 2.27, 0.18)
  bx(g, F('#f0b020'), 0.06, 0.05, 0.12, -0.95, 2.26, 0.3)
  return g
}

// A 4.4 m soil patch with 3-5 blocky pumpkins and vines.
export function pumpkinPatch(rand) {
  rand = rng(rand)
  const g = new Group()
  pl(g, S(DIRT), 4.4, 0.12, 4.4, 0, 0, 0)
  for (const z of [-1.3, 0, 1.3]) pl(g, S('#5e4026'), 4.2, 0.06, 0.4, 0, 0.12, z)
  const orange = S('#ff8a1c')
  const orange2 = S('#e9741a')
  const stem = S('#5b7a2a')
  const n = 3 + Math.floor(rand() * 3)
  for (let i = 0; i < n; i++) {
    const s = q(0.55 + rand() * 0.5)
    const a = q5(s * 0.72)
    const x = q5((rand() - 0.5) * 3.2)
    const z = q5((rand() - 0.5) * 3.2)
    const y = 0.18
    pl(g, orange, s, a, a, x, y, z, { cast: true })
    pl(g, orange, a, a, s, x, y, z)
    pl(g, orange2, q5(s * 0.85), q5(s * 0.82), q5(s * 0.85), x, y, z)
    pl(g, stem, 0.12, 0.25, 0.12, x, y + q5(s * 0.82), z)
  }
  const vine = S('#3d8a2a')
  const leaf = S('#4caf3a')
  for (let i = 0; i < 3; i++) {
    bx(g, vine, q(1.5 + rand() * 1.5), 0.08, 0.08, q5((rand() - 0.5) * 2.4), 0.2, q5((rand() - 0.5) * 2.4), { ry: rand() * Math.PI })
    pl(g, leaf, 0.5, 0.06, 0.5, q5((rand() - 0.5) * 3.4), 0.17, q5((rand() - 0.5) * 3.4))
  }
  return g
}

// Stone well (2.2 m square) with a little gable roof, crank, rope and bucket.
export function well() {
  const g = new Group()
  const s1 = S(STONE)
  const s2 = S(STONE_L)
  for (const s of [-1, 1]) {
    pl(g, s1, 2.2, 0.9, 0.4, 0, 0, s * 0.9, { cast: true })
    pl(g, s2, 0.4, 0.95, 1.4, s * 0.9, 0, 0, { cast: true })
  }
  bx(g, F('#245a8c', 0.15), 1.4, 0.1, 1.4, 0, 0.6, 0)
  const wood = S(WOOD_D)
  for (const s of [-1, 1]) pl(g, wood, 0.2, 3.0, 0.2, s * 1.25, 0, 0)
  const roof = S('#8e2f2a')
  for (const s of [-1, 1]) bx(g, roof, 1.75, 0.12, 2.0, s * 0.62, 3.0, 0, { rz: -s * 0.6, cast: true })
  bx(g, wood, 0.2, 0.2, 2.1, 0, 3.4, 0)
  cy(g, F(WOOD), 0.07, 2.7, 0, 2.4, 0, 'x', 6)
  cy(g, F(WOOD_L), 0.18, 0.7, 0, 2.4, 0, 'x', 8)
  bx(g, F(IRON), 0.06, 0.4, 0.06, 1.45, 2.22, 0)
  bx(g, F(IRON), 0.06, 0.06, 0.25, 1.45, 2.05, 0.1)
  bx(g, F('#c9b37a'), 0.04, 0.95, 0.04, 0, 1.82, 0)
  cy(g, F(WOOD), 0.2, 0.3, 0, 1.2, 0, 'y', 8)
  cy(g, F(IRON, 0.5, 0.5), 0.21, 0.05, 0, 1.3, 0, 'y', 8)
  return g
}

// ============================================================================================
// FOREST
// ============================================================================================

const PINES = ['#2e7d32', '#2a6e2c', '#358a3a', '#2f7535']
// Layered conifer, 8-14 m at scale 1; tiers alternate 45 degrees for a star silhouette.
export function pineTree(scale = 1, rand) {
  rand = rng(rand)
  const g = new Group()
  const H = (8 + rand() * 6) * scale
  const th = q(H * 0.22)
  pl(g, S(BARK), q(0.8 * scale), th, q(0.8 * scale), 0, 0, 0, { cast: true })
  const n = 4 + (rand() < 0.5 ? 1 : 0)
  const c0 = pick(rand, PINES)
  const c1 = mixHex(c0, '#0b2a10', 0.25)
  const base = th * 0.7
  const C = H - base
  const step = C / (n + 0.4)
  const W = H * 0.48
  for (let i = 0; i < n; i++) {
    const w = q(W * (1 - (i / n) * 0.78))
    pl(g, S(i % 2 ? c1 : c0), w, q(step * 1.25), w, 0, q5(base + i * step), 0, { ry: i % 2 ? Math.PI / 4 : 0, cast: true })
  }
  const tip = q(W * 0.14)
  pl(g, S(c0), tip, q(step * 0.7), tip, 0, q5(base + (n - 1) * step + step * 1.2), 0)
  return g
}

const OAKS = ['#3a9a2e', '#2f8f2a', '#46a83a']
// Chunky oak, ~8 m at scale 1, wide block canopy with side clumps.
export function oakTree(scale = 1, rand) {
  rand = rng(rand)
  const g = new Group()
  const s = scale
  const th = q(3.2 * s * (0.9 + rand() * 0.25))
  const tw = q(1.1 * s)
  pl(g, S(BARK), tw, th, tw, 0, 0, 0, { cast: true })
  pl(g, S('#5a3d22'), q(tw * 1.4), q(0.4 * s), q(tw * 1.4), 0, 0, 0)
  const bark = S(BARK)
  bx(g, bark, q(1.6 * s), q(0.45 * s), q(0.45 * s), q(0.7 * s), th * 0.8, 0)
  bx(g, bark, q(0.45 * s), q(0.45 * s), q(1.4 * s), 0, th * 0.7, -q(0.6 * s))
  const c0 = pick(rand, OAKS)
  const c1 = mixHex(c0, '#ffffff', 0.12)
  const c2 = mixHex(c0, '#0b2a10', 0.2)
  const cy0 = th - 0.25 * s
  pl(g, S(c0), q(5.2 * s), q(2.6 * s), q(5.0 * s), 0, cy0, 0, { cast: true })
  pl(g, S(c1), q(3.8 * s), q(1.6 * s), q(3.6 * s), q5((rand() - 0.5) * s), cy0 + q(2.6 * s), q5((rand() - 0.5) * s), { cast: true })
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rand()
    const r = 2.4 * s
    const c = q(2.4 * s * (0.8 + rand() * 0.4))
    pl(g, S(i % 2 ? c2 : c1), c, c, c, q5(Math.cos(a) * r), cy0 + q5((0.3 + rand() * 1.4) * s), q5(Math.sin(a) * r))
  }
  if (rand() < 0.3) {
    const apple = S('#d8262b')
    for (let i = 0; i < 2; i++) pl(g, apple, 0.3, 0.3, 0.3, q5((rand() - 0.5) * 4 * s), cy0 - 0.3, 2.55 * s)
  }
  return g
}

// Slender white birch with black bark marks, ~9-10 m at scale 1.
export function birchTree(scale = 1, rand) {
  rand = rng(rand)
  const g = new Group()
  const s = scale
  const th = q(5.5 * s * (0.9 + rand() * 0.25))
  const tw = q(0.6 * s)
  pl(g, S('#e8e4da'), tw, th, tw, 0, 0, 0, { cast: true })
  const ink = F('#2b2b2b', 0.8)
  for (let i = 0; i < 4; i++) {
    const y = q5(th * (0.15 + i * 0.2 + rand() * 0.06))
    const side = i % 2 ? 1 : -1
    if (i % 2) bx(g, ink, 0.3 * s, 0.12 * s, 0.04, q5((rand() - 0.5) * 0.2 * s), y, side * (tw / 2 + 0.01))
    else bx(g, ink, 0.04, 0.12 * s, 0.3 * s, side * (tw / 2 + 0.01), y, 0)
  }
  const c0 = rand() < 0.5 ? '#8cc43c' : '#a3d14a'
  const c1 = mixHex(c0, '#2f6b1e', 0.25)
  pl(g, S(c0), q(2.6 * s), q(3.4 * s), q(2.6 * s), 0, th - q(0.8 * s), 0, { cast: true })
  pl(g, S(c1), q(1.8 * s), q(2.0 * s), q(1.8 * s), q(0.9 * s), th - q(1.6 * s), q5((rand() - 0.5) * s), { cast: true })
  pl(g, S(c1), q(1.6 * s), q(1.6 * s), q(1.6 * s), -q(0.9 * s), th - q(0.6 * s), q5((rand() - 0.5) * s))
  pl(g, S(c0), q(1.4 * s), q(1.2 * s), q(1.4 * s), 0, th + q(2.4 * s), 0)
  return g
}

// Low clump of 2-4 leafy blocks, maybe with red berries (~1.5 m).
export function bush(rand) {
  rand = rng(rand)
  const g = new Group()
  const c0 = pick(rand, OAKS)
  const c1 = mixHex(c0, '#0b2a10', 0.2)
  const n = 2 + Math.floor(rand() * 3)
  for (let i = 0; i < n; i++) {
    const s = q(0.8 + rand() * 0.8)
    pl(g, S(i % 2 ? c1 : c0), s, q(s * 0.8), s, q5((rand() - 0.5) * 1.2), 0, q5((rand() - 0.5) * 1.2), { cast: i === 0 })
  }
  if (rand() < 0.4) {
    const berry = S('#d8262b')
    for (let i = 0; i < 3; i++) pl(g, berry, 0.2, 0.2, 0.2, q5((rand() - 0.5) * 1.4), q5(0.4 + rand() * 0.4), q5(0.45 + rand() * 0.3))
  }
  return g
}

// Cluster of 3-5 red-and-white toadstools (0.3-0.8 m).
export function mushrooms(rand) {
  rand = rng(rand)
  const g = new Group()
  const stem = S('#f1ead8')
  const cap = S('#d8262b')
  const dot = F('#ffffff')
  const n = 3 + Math.floor(rand() * 3)
  for (let i = 0; i < n; i++) {
    const h = q5(0.25 + rand() * 0.45)
    const t = q5(0.12 + h * 0.3)
    const x = q5((rand() - 0.5) * 1.2)
    const z = q5((rand() - 0.5) * 1.2)
    const cw = q5(t * 3)
    pl(g, stem, t, h, t, x, 0, z)
    pl(g, cap, cw, q5(cw * 0.35), cw, x, h, z)
    pl(g, dot, 0.08, 0.04, 0.08, x - cw * 0.22, h + q5(cw * 0.35), z + cw * 0.15)
    pl(g, dot, 0.08, 0.04, 0.08, x + cw * 0.2, h + q5(cw * 0.35), z - cw * 0.18)
  }
  return g
}

// Fallen log along local X (3-5 m), lying on the ground.
export function log(rand) {
  rand = rng(rand)
  const g = new Group()
  const L = q(3 + rand() * 2)
  const r = q5(0.4 + rand() * 0.15)
  cy(g, F(BARK, 0.95), r, L, 0, r, 0, 'x', 8, { cast: true })
  cy(g, F('#c9a26b', 0.85), r * 0.84, L + 0.04, 0, r, 0, 'x', 8)
  pl(g, S('#4f8f2a'), q5(L * 0.4), 0.08, q5(r), q5((rand() - 0.5) * L * 0.4), r * 1.9, 0)
  bx(g, S(BARK), 0.2, 0.6, 0.2, q5((rand() - 0.5) * L * 0.6), r * 1.6, 0.15, { rz: 0.5 })
  if (rand() < 0.5) {
    pl(g, S('#f1ead8'), 0.1, 0.18, 0.1, L * 0.3, 0, r + 0.15)
    pl(g, S('#d8262b'), 0.3, 0.1, 0.3, L * 0.3, 0.18, r + 0.15)
  }
  return g
}

// Tree stump with rings, roots and an axe.
export function stump() {
  const g = new Group()
  cy(g, F(BARK, 0.95), 0.6, 0.7, 0, 0.35, 0, 'y', 9, { cast: true })
  cy(g, F('#d9b27a', 0.85), 0.55, 0.04, 0, 0.71, 0, 'y', 9)
  cy(g, F('#b58a54', 0.85), 0.3, 0.05, 0, 0.72, 0, 'y', 9)
  const root = S(BARK)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4
    bx(g, root, 0.3, 0.25, 0.7, Math.sin(a) * 0.7, 0.12, Math.cos(a) * 0.7, { ry: a })
  }
  bx(g, F(WOOD_L), 0.08, 0.8, 0.08, 0.15, 1.05, 0.1, { rz: -0.35 })
  bx(g, F('#c4ccd4', 0.3, 0.8), 0.3, 0.16, 0.05, 0.02, 0.76, 0.1, { rz: -0.35 })
  return g
}

// Blocky grey rock, ~1.2-2.4 m wide at scale 1; sometimes mossy.
export function rock(scale = 1, rand) {
  rand = rng(rand)
  const g = new Group()
  const s = scale
  const n = 2 + Math.floor(rand() * 3)
  for (let i = 0; i < n; i++) {
    const f = i === 0 ? 1 : 0.55 + rand() * 0.3
    const w = q((1.2 + rand() * 1.2) * s * f)
    const h = q((0.8 + rand() * 0.8) * s * f)
    const d = q((1.0 + rand() * 1.0) * s * f)
    const off = i === 0 ? 0 : 0.6 * s
    pl(g, S(pick(rand, ROCKS)), w, h, d, q5((rand() - 0.5) * off * 2), 0, q5((rand() - 0.5) * off * 2), { ry: (rand() - 0.5) * 0.6, cast: i === 0 })
    if (i === 0 && rand() < 0.4) pl(g, S('#5c9a3a'), q(w * 0.7), 0.12, q(d * 0.7), 0, h, 0)
  }
  return g
}

// ============================================================================================
// SIGNS (static; text painted on canvas faces, repainted once Fredoka loads)
// ============================================================================================

const WARN_Y = '#ffc928'
const ICONS = {
  deer(x) {
    x.beginPath()
    x.ellipse(120, 146, 40, 19, 0, 0, Math.PI * 2)
    x.fill()
    for (const lx of [92, 104, 136, 148]) x.fillRect(lx - 4, 150, 8, 42)
    poly(x, [
      [142, 140],
      [156, 104],
      [170, 108],
      [160, 146],
    ])
    x.beginPath()
    x.ellipse(172, 104, 15, 9, 0.35, 0, Math.PI * 2)
    x.fill()
    x.fillRect(78, 134, 8, 8)
    x.lineWidth = 5
    x.lineCap = 'round'
    x.beginPath()
    x.moveTo(163, 96)
    x.lineTo(156, 76)
    x.moveTo(159, 84)
    x.lineTo(149, 78)
    x.moveTo(168, 96)
    x.lineTo(175, 74)
    x.moveTo(173, 82)
    x.lineTo(184, 77)
    x.stroke()
  },
  sheep(x) {
    for (const [cx, cy, r] of [
      [104, 134, 20],
      [127, 126, 22],
      [149, 134, 20],
      [114, 152, 18],
      [140, 152, 18],
    ]) {
      x.beginPath()
      x.arc(cx, cy, r, 0, Math.PI * 2)
      x.fill()
    }
    for (const lx of [106, 120, 136, 150]) x.fillRect(lx - 4, 160, 8, 30)
    x.beginPath()
    x.ellipse(172, 130, 12, 16, 0.3, 0, Math.PI * 2)
    x.fill()
    x.beginPath()
    x.ellipse(164, 116, 10, 5, -0.5, 0, Math.PI * 2)
    x.fill()
  },
  rocks(x) {
    poly(x, [
      [60, 192],
      [60, 92],
      [98, 80],
      [106, 120],
      [126, 142],
      [132, 192],
    ])
    for (const [cx, cy, s, a] of [
      [150, 108, 22, 0.4],
      [170, 142, 16, 0.9],
      [152, 170, 24, 0.2],
    ]) {
      x.save()
      x.translate(cx, cy)
      x.rotate(a)
      x.fillRect(-s / 2, -s / 2, s, s)
      x.restore()
    }
    x.fillRect(60, 188, 140, 8)
  },
  wind(x) {
    x.fillRect(84, 78, 8, 116)
    poly(x, [
      [92, 84],
      [162, 94],
      [162, 112],
      [92, 122],
    ])
    x.lineWidth = 8
    x.lineCap = 'round'
    for (const y of [140, 160, 180]) {
      x.beginPath()
      x.moveTo(108, y)
      x.bezierCurveTo(130, y - 12, 150, y + 12, 176, y - 2)
      x.stroke()
    }
  },
  bridge(x) {
    x.fillRect(58, 140, 44, 22)
    x.fillRect(154, 140, 44, 22)
    for (const [ox, a] of [
      [100, -0.9],
      [156, -(Math.PI - 0.9)],
    ]) {
      x.save()
      x.translate(ox, 146)
      x.rotate(a)
      x.fillRect(0, -6, 56, 12)
      x.restore()
    }
    x.lineWidth = 7
    x.lineCap = 'round'
    for (const y of [176, 192]) {
      x.beginPath()
      x.moveTo(72, y)
      for (let i = 0; i < 4; i++) x.quadraticCurveTo(84 + i * 28, y - 8, 98 + i * 28, y)
      x.stroke()
    }
  },
}
const WARN_TEXT = { deer: 'DEER', sheep: 'SHEEP', rocks: 'ROCKSLIDE', wind: 'CROSSWIND', bridge: 'DRAWBRIDGE' }
function diamondPath(x, c, inset) {
  x.beginPath()
  x.moveTo(c, inset)
  x.lineTo(2 * c - inset, c)
  x.lineTo(c, 2 * c - inset)
  x.lineTo(inset, c)
  x.closePath()
}

// Yellow diamond warning sign on a post, ~3.3 m tall, faces +Z.
// kind: 'deer' | 'sheep' | 'rocks' | 'wind' | 'bridge'.
export function crossingSign(kind = 'deer') {
  if (!ICONS[kind]) kind = 'deer'
  const g = new Group()
  const metal = METAL()
  cy(g, metal, 0.06, 3.05, 0, 1.525, 0, 'y', 8)
  cy(g, metal, 0.08, 0.06, 0, 3.08, 0, 'y', 8)
  bx(g, F('#7d858e', 0.5, 0.5), 1.25, 1.25, 0.05, 0, 2.45, 0.08, { rz: Math.PI / 4 })
  const diamond = canvasMat(`warn|${kind}`, 256, 256, (x) => {
    diamondPath(x, 128, 3)
    x.fillStyle = '#151515'
    x.fill()
    diamondPath(x, 128, 15)
    x.fillStyle = WARN_Y
    x.fill()
    x.clip()
    x.fillStyle = '#151515'
    x.strokeStyle = '#151515'
    ICONS[kind](x)
  }, { alpha: true })
  face(g, diamond, 1.77, 1.77, 0, 2.45, 0.11)
  bx(g, F('#7d858e', 0.5, 0.5), 1.2, 0.36, 0.04, 0, 1.35, 0.07)
  const plate = canvasMat(`warnplate|${kind}`, 512, 152, (x, w, h) => {
    x.fillStyle = '#151515'
    rrect(x, 0, 0, w, h, 18)
    x.fill()
    x.fillStyle = WARN_Y
    rrect(x, 9, 9, w - 18, h - 18, 12)
    x.fill()
    fitText(x, WARN_TEXT[kind], w / 2, h / 2 + 4, w - 60, 92, { color: '#151515' })
  })
  face(g, plate, 1.16, 0.34, 0, 1.35, 0.095)
  return g
}

// Round speed-limit sign (white, red ring, black number), ~3 m tall, faces +Z.
export function speedSign(value = 30) {
  const g = new Group()
  cy(g, METAL(), 0.06, 2.4, 0, 1.2, 0, 'y', 8)
  cy(g, F('#7d858e', 0.5, 0.5), 0.62, 0.05, 0, 2.4, 0.06, 'z', 20)
  const m = canvasMat(`speed|${value}`, 256, 256, (x) => {
    x.beginPath()
    x.arc(128, 128, 125, 0, Math.PI * 2)
    x.fillStyle = '#d7262b'
    x.fill()
    x.beginPath()
    x.arc(128, 128, 96, 0, Math.PI * 2)
    x.fillStyle = '#ffffff'
    x.fill()
    fitText(x, String(value), 128, 136, 150, 118, { color: '#151515' })
  }, { alpha: true })
  face(g, m, 1.22, 1.22, 0, 2.4, 0.09)
  return g
}

// Small green distance marker on a post (e.g. '500 m'), ~1.7 m tall, faces +Z.
export function distanceSign(text = '500 m') {
  const g = new Group()
  pl(g, S(WHITE), 0.14, 1.45, 0.14, 0, 0, 0)
  pl(g, F('#d7262b'), 0.15, 0.12, 0.15, 0, 1.0, 0)
  bx(g, F('#1f6a34'), 0.74, 0.46, 0.04, 0, 1.45, 0.09)
  const m = canvasMat(`dist|${text}`, 256, 160, (x, w, h) => {
    x.fillStyle = '#1f7a3a'
    x.fillRect(0, 0, w, h)
    x.strokeStyle = '#ffffff'
    x.lineWidth = 8
    rrect(x, 10, 10, w - 20, h - 20, 14)
    x.stroke()
    fitText(x, String(text), w / 2, h / 2 + 4, w - 50, 84, { color: '#ffffff' })
  })
  face(g, m, 0.72, 0.44, 0, 1.45, 0.115)
  return g
}

// Black board with yellow chevrons for bends; dir +1 arrows point +X (the
// rider's right when travelling -Z), -1 left. Board ~2.4 x 0.8 m at 1.5 m.
export function chevronBoard(dir = 1) {
  const d = dir < 0 ? -1 : 1
  const g = new Group()
  const metal = METAL()
  for (const s of [-1, 1]) pl(g, metal, 0.1, 1.9, 0.1, s * 0.9, 0, -0.06)
  bx(g, F('#151515', 0.6), 2.44, 0.84, 0.06, 0, 1.5, 0)
  const m = canvasMat(`chev|${d}`, 512, 168, (x, w, h) => {
    x.fillStyle = '#151515'
    x.fillRect(0, 0, w, h)
    if (d < 0) {
      x.translate(w, 0)
      x.scale(-1, 1)
    }
    x.fillStyle = '#ffd21f'
    for (const x0 of [40, 190, 340]) {
      poly(x, [
        [x0, 20],
        [x0 + 52, 20],
        [x0 + 122, h / 2],
        [x0 + 52, h - 20],
        [x0, h - 20],
        [x0 + 70, h / 2],
      ])
    }
    x.strokeStyle = '#ffd21f'
    x.lineWidth = 8
    x.strokeRect(4, 4, w - 8, h - 8)
  })
  face(g, m, 2.4, 0.8, 0, 1.5, 0.035)
  return g
}

// Roadside billboard: 9 x 3.6 m panel on two posts (top ~6.3 m), faces +Z.
// color = panel colour (hex '#rrggbb').
export function bigSign(title = 'WELCOME', sub = '', color = '#2a6fd6') {
  const col = /^#[0-9a-f]{6}$/i.test(color) ? color : '#2a6fd6'
  const g = new Group()
  const post = S(WOOD_D)
  for (const s of [-1, 1]) {
    pl(g, post, 0.45, 6.2, 0.45, s * 3.2, 0, -0.3, { cast: true })
    bx(g, post, 0.25, 2.8, 0.25, s * 3.2, 1.2, -1.2, { rx: -0.5 })
  }
  bx(g, S(mixHex(col, '#000000', 0.45)), 9, 3.6, 0.25, 0, 4.4, 0, { cast: true })
  const m = canvasMat(`big|${title}|${sub}|${col}`, 1024, 400, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h)
    gr.addColorStop(0, mixHex(col, '#ffffff', 0.15))
    gr.addColorStop(1, mixHex(col, '#000000', 0.25))
    x.fillStyle = gr
    x.fillRect(0, 0, w, h)
    x.strokeStyle = '#ffffff'
    x.lineWidth = 12
    rrect(x, 16, 16, w - 32, h - 32, 26)
    x.stroke()
    const dark = mixHex(col, '#000000', 0.7)
    if (sub) {
      fitText(x, String(title), w / 2, 160, w - 110, 150, { color: '#ffffff', outline: dark, ow: 18 })
      fitText(x, String(sub), w / 2, 300, w - 120, 70, { color: '#fff6c8', outline: dark, ow: 12 })
    } else fitText(x, String(title), w / 2, h / 2 + 6, w - 110, 170, { color: '#ffffff', outline: dark, ow: 20 })
  })
  face(g, m, 8.7, 3.4, 0, 4.4, 0.13)
  bx(g, S(WHITE), 9.4, 0.25, 0.45, 0, 6.32, 0)
  // Catwalk and two lamps over the top.
  bx(g, S(WOOD), 8, 0.1, 0.6, 0, 2.5, 0.42)
  const lampMat = glowM('#fff1c4', 2.5)
  for (const s of [-1, 1]) {
    bx(g, F(IRON, 0.5, 0.5), 0.1, 0.1, 0.9, s * 2.4, 6.45, 0.45)
    bx(g, F(IRON, 0.5, 0.5), 0.6, 0.16, 0.3, s * 2.4, 6.45, 0.95)
    bx(g, lampMat, 0.5, 0.04, 0.22, s * 2.4, 6.36, 0.95)
  }
  return g
}

// Junction sign on two posts: left arrow 'SAFE' (green), right arrow 'GEM RUN'
// (magenta). Board 4.8 x 2.4 m at 2.4-4.8 m, faces +Z.
export function junctionSign() {
  const g = new Group()
  const post = S(WOOD_D)
  for (const s of [-1, 1]) {
    pl(g, post, 0.3, 5.0, 0.3, s * 2.0, 0, -0.2, { cast: true })
    pl(g, S(STONE), 0.7, 0.4, 0.7, s * 2.0, 0, -0.2)
  }
  bx(g, S(WOOD), 4.8, 2.4, 0.2, 0, 3.6, 0, { cast: true })
  bx(g, S('#8e2f2a'), 5.1, 0.2, 0.5, 0, 4.9, 0)
  const m = canvasMat('junction', 1024, 512, (x, w, h) => {
    x.fillStyle = '#9a6a3c'
    x.fillRect(0, 0, w, h)
    x.fillStyle = '#7a5030'
    for (let i = 1; i < 5; i++) x.fillRect(0, (i * h) / 5 - 3, w, 6)
    x.strokeStyle = '#4a2e18'
    x.lineWidth = 18
    x.strokeRect(9, 9, w - 18, h - 18)
    const arrow = (dir, cx, fill, text) => {
      x.save()
      x.translate(cx, h / 2)
      x.scale(dir, 1)
      const pts = [
        [-230, 0],
        [-90, -150],
        [-90, -82],
        [220, -82],
        [220, 82],
        [-90, 82],
        [-90, 150],
      ]
      x.lineJoin = 'round'
      x.beginPath()
      x.moveTo(pts[0][0], pts[0][1])
      for (const p of pts.slice(1)) x.lineTo(p[0], p[1])
      x.closePath()
      x.fillStyle = fill
      x.fill()
      x.lineWidth = 12
      x.strokeStyle = '#ffffff'
      x.stroke()
      x.restore()
      fitText(x, text, cx + dir * 55, h / 2 + 4, 270, 92, { color: '#ffffff', outline: '#14213d', ow: 14 })
    }
    arrow(-1, 262, '#2fb84a', 'SAFE')
    arrow(1, 762, '#c42a8a', 'GEM RUN')
    // A little gem over the GEM RUN arrow.
    x.fillStyle = '#5ff3ff'
    poly(x, [
      [762, 40],
      [792, 62],
      [762, 98],
      [732, 62],
    ])
  })
  face(g, m, 4.6, 2.25, 0, 3.6, 0.105)
  return g
}

// ============================================================================================
// HILLS / MOUNTAIN PASS
// ============================================================================================

// Steel W-beam guard rail on short posts along local X, 0..length; beam on the +Z side.
export function guardRail(length = 10) {
  const g = new Group()
  const n = Math.max(1, Math.round(length / 2))
  const sp = length / n
  const post = F('#8d959e', 0.45, 0.6)
  const refl = studMat('#ff8a1a', { flat: true, emissive: '#ff6a00', emissiveIntensity: 0.6 })
  for (let i = 0; i <= n; i++) {
    pl(g, post, 0.14, 0.85, 0.14, i * sp, 0, 0)
    if (i % 2 === 0) bx(g, refl, 0.1, 0.1, 0.03, i * sp, 0.62, 0.17)
  }
  bx(g, F('#c9d0d7', 0.3, 0.75), length, 0.34, 0.06, length / 2, 0.62, 0.12)
  bx(g, F('#9aa2ab', 0.35, 0.7), length, 0.08, 0.07, length / 2, 0.62, 0.125)
  return g
}

// Stepped grassy hill w x h x d (base centre origin) from stacked studded blocks.
export function hillMound(w = 20, h = 6, d = 16, rand) {
  rand = rng(rand)
  const g = new Group()
  const n = Math.max(2, Math.round(h / 1.6))
  const lh = q(h / n)
  const greens = [S(GRASS), S('#56b845'), S(GRASS_D)]
  const layers = []
  for (let i = 0; i < n; i++) {
    const f = 1 - (i / n) * 0.8
    const lw = q(w * f * (0.92 + rand() * 0.12))
    const ld = q(d * f * (0.92 + rand() * 0.12))
    const ox = q5((rand() - 0.5) * w * 0.08 * (i / n))
    const oz = q5((rand() - 0.5) * d * 0.08 * (i / n))
    pl(g, greens[i % 2], lw, lh, ld, ox, i * lh, oz, { cast: i < 2 })
    layers.push({ lw, ld, ox, oz })
  }
  const deco = Math.min(4, 1 + Math.floor(rand() * 4))
  for (let k = 0; k < deco && n > 1; k++) {
    const i = Math.floor(rand() * (n - 1))
    const L = layers[i]
    const side = rand() < 0.5 ? -1 : 1
    const s = q(0.75 + rand() * 0.75)
    const rockish = rand() < 0.4
    pl(g, rockish ? S(pick(rand, ROCKS)) : greens[2], s, q(s * 0.8), s, L.ox + side * (L.lw / 2 - s / 2 - 0.1), (i + 1) * lh, L.oz + q5((rand() - 0.5) * L.ld * 0.6))
  }
  return g
}

// Big stepped rocky mountain with a snow cap: base w x ~0.85w, height h (up to
// ~80 m), base centre origin. ~2 blocks per tier, 4-10 tiers.
export function mountainPeak(w = 60, h = 50, rand) {
  rand = rng(rand)
  const g = new Group()
  const n = Math.min(10, Math.max(4, Math.round(h / 7)))
  const lh = q(h / n)
  const d = w * 0.85
  const snowFrom = Math.floor(n * 0.62)
  const rocks = ROCKS.map(S)
  const snow = S(SNOW)
  const snow2 = S('#e2ebf5')
  let top = null
  for (let i = 0; i < n; i++) {
    const f = 1 - (i / n) * 0.88
    const lw = q(w * f * (0.9 + rand() * 0.15))
    const ld = q(d * f * (0.9 + rand() * 0.15))
    const ox = q((rand() - 0.5) * w * 0.06)
    const oz = q((rand() - 0.5) * d * 0.06)
    const y = i * lh
    const m = i >= snowFrom ? (i % 2 ? snow : snow2) : rocks[i % 3]
    pl(g, m, lw, lh, ld, ox, y, oz, { cast: true })
    if (i > 0 && i < n - 1) {
      const sx = rand() < 0.5 ? -1 : 1
      pl(g, i >= snowFrom ? snow2 : rocks[(i + 1) % 3], q(lw * 0.5), q(lh * (0.7 + rand() * 0.6)), q(ld * 0.6), ox + sx * q(lw * 0.32), y, oz + q((rand() - 0.5) * ld * 0.3))
    }
    if (i === snowFrom - 1) pl(g, snow, q(lw * 0.82), 0.5, q(ld * 0.82), ox, y + lh - 0.25, oz)
    top = { lw, ld, ox, oz, y: y + lh }
  }
  pl(g, snow, q(top.lw * 0.45), q(lh * 0.6), q(top.ld * 0.45), top.ox, top.y, top.oz)
  return g
}

// Brick + plank lift engine house (4.4 x ~5.2 x 3.6 m) with a big exposed gear on
// its +X side. userData.gear = Group at the axle centre (2.65, 2.3, 0); spin
// gear.rotation.x. Gear ~3.3 m across.
export function liftMotorHouse() {
  const g = new Group()
  const brick = S('#a64b3a')
  const plank = S('#9a6a3c')
  pl(g, S(STONE_D), 4.8, 0.4, 4.0, 0, 0, 0)
  pl(g, brick, 4.4, 2.2, 3.6, 0, 0.4, 0, { cast: true })
  pl(g, plank, 4.4, 1.2, 3.6, 0, 2.6, 0, { cast: true })
  pl(g, S(WHITE), 4.6, 0.2, 3.8, 0, 2.5, 0)
  const roofs = [S('#4d525c'), S('#5d636e')]
  ;[4.6, 3.4, 2.2, 1.0].forEach((d, i) => pl(g, roofs[i % 2], 5.0, 0.35, d, 0, 3.8 + i * 0.35, 0, { cast: i === 0 }))
  // Door (+Z), window (-X), chimney.
  pl(g, S(WHITE), 1.2, 2.1, 0.1, -0.8, 0.4, 1.82)
  pl(g, F('#5a3a22'), 0.95, 1.95, 0.14, -0.8, 0.4, 1.84)
  bx(g, S(WHITE), 0.1, 1.0, 1.3, -2.22, 1.8, 0)
  bx(g, mat('#9fd4ff', 0.1, 0.1, { emissive: '#3a6a8a', emissiveIntensity: 0.4 }), 0.12, 0.75, 1.05, -2.24, 1.8, 0)
  pl(g, brick, 0.6, 1.8, 0.6, -1.4, 4.0, -0.9)
  pl(g, F(IRON), 0.8, 0.15, 0.8, -1.4, 5.8, -0.9)
  // Bearing block and hazard plate under the gear.
  bx(g, F(IRON, 0.5, 0.5), 0.4, 0.7, 0.7, 2.3, 2.3, 0)
  pl(g, F('#ffc928'), 0.06, 0.4, 1.6, 2.23, 0.6, 0)
  const gear = new Group()
  gear.position.set(2.65, 2.3, 0)
  g.add(gear)
  const steel = F('#5a6470', 0.45, 0.6)
  cy(gear, F(IRON, 0.5, 0.5), 0.15, 1.0, -0.3, 0, 0, 'x', 8)
  cy(gear, steel, 1.3, 0.3, 0, 0, 0, 'x', 16, { cast: true })
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    bx(gear, steel, 0.3, 0.4, 0.35, 0, Math.cos(a) * 1.45, Math.sin(a) * 1.45, { rx: a })
  }
  const spoke = F('#c9a227', 0.45, 0.4)
  bx(gear, spoke, 0.06, 2.2, 0.25, 0.17, 0, 0)
  bx(gear, spoke, 0.06, 0.25, 2.2, 0.17, 0, 0)
  cy(gear, F('#ffc928', 0.5, 0.3), 0.35, 0.5, 0.05, 0, 0, 'x', 10)
  g.userData.gear = gear
  return g
}

// Lift chain: a 0.5 m wide flat strip in the XZ plane along local -Z from 0 to
// -length (y = 0, facing +Y), links cut out with alphaTest. userData.tex = its
// own texture (RepeatWrapping, one tile = 0.5 m of chain): `tex.offset.y -=
// metres / 0.5` moves the links towards -Z.
let chainCanvas = null
function paintChain() {
  if (chainCanvas) return chainCanvas
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const x = c.getContext('2d')
  // Flat link (ring), centred at v = 32.
  x.lineWidth = 10
  x.strokeStyle = '#4f565f'
  rrect(x, 15, 4, 34, 56, 16)
  x.stroke()
  x.lineWidth = 3
  x.strokeStyle = '#b8c0c8'
  rrect(x, 15, 4, 34, 56, 16)
  x.stroke()
  // Edge-on link through it, wrapping across the tile seam.
  for (const y0 of [50, 50 - 128]) {
    x.fillStyle = '#3f454d'
    x.fillRect(26, y0, 12, 92)
    x.fillStyle = '#a9b2bb'
    x.fillRect(29, y0 + 4, 3, 84)
  }
  chainCanvas = c
  return c
}
export function chainStrip(length = 20) {
  const L = Math.max(0.5, length)
  const geo = new PlaneGeometry(0.5, L)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * L) / 0.5)
  geo.rotateX(-Math.PI / 2) // +V now runs towards -Z
  geo.translate(0, 0, -L / 2)
  const tex = new CanvasTexture(paintChain())
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.anisotropy = 8
  const m = new MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.4, metalness: 0.6, side: DoubleSide })
  const me = new Mesh(geo, m)
  me.receiveShadow = true
  me.userData.tex = tex
  return me
}

// Summit cairn + 6.5 m pole + flag. userData.flag = pivot Group at the pole
// (0.07, 7.25, 0) — yaw it with rotation.y; userData.cloth = the 2.4 x 1.5 m
// cloth Mesh (own 12x3-segment geometry, extends along +X and down from the
// pivot) for vertex waving.
export function summitFlag() {
  const g = new Group()
  pl(g, S(STONE), 1.6, 0.6, 1.6, 0, 0, 0, { cast: true })
  pl(g, S(STONE_L), 1.1, 0.5, 1.1, 0.1, 0.6, -0.05)
  pl(g, S(STONE_D), 0.7, 0.4, 0.7, 0, 1.1, 0)
  cy(g, METAL(), 0.07, 6.5, 0, 4.75, 0, 'y', 8, { cast: true })
  sph(g, F('#ffcc33', 0.3, 0.8), 0.16, 0, 8.08, 0)
  const pivot = new Group()
  pivot.position.set(0.07, 7.25, 0)
  g.add(pivot)
  const clothM = canvasMat('summitflag', 256, 160, (x, w, h) => {
    x.fillStyle = '#e8452c'
    x.fillRect(0, 0, w, h)
    x.fillStyle = '#ffffff'
    poly(x, [
      [40, 100],
      [90, 30],
      [118, 66],
      [140, 46],
      [200, 100],
    ])
    x.fillStyle = '#e8452c'
    poly(x, [
      [74, 52],
      [90, 30],
      [104, 48],
      [92, 58],
    ])
    fitText(x, 'SUMMIT', w / 2, 128, w - 30, 40, { color: '#ffffff', outline: '#7a1a0a', ow: 6 })
  }, { extra: { side: DoubleSide } })
  const geo = new PlaneGeometry(2.4, 1.5, 12, 3).translate(1.2, -0.75, 0)
  const cloth = new Mesh(geo, clothM)
  cloth.castShadow = true
  pivot.add(cloth)
  g.userData.flag = pivot
  g.userData.cloth = cloth
  return g
}

// Wooden viewing deck 6 x 4 m, deck top y = 1.0, steps on +Z, railings on the
// other sides, coin-op binoculars at the -Z rail looking -Z.
export function viewingPlatform() {
  const g = new Group()
  const wood = S(WOOD)
  const woodD = S(WOOD_D)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pl(g, woodD, 0.3, 0.8, 0.3, sx * 2.7, 0, sz * 1.7)
  for (const s of [-1, 1]) bx(g, woodD, 6, 0.25, 0.2, 0, 0.68, s * 1.9)
  pl(g, S('#a8743f'), 6, 0.2, 4, 0, 0.8, 0, { cast: true })
  pl(g, wood, 1.4, 0.67, 0.3, 0, 0, 2.15)
  pl(g, wood, 1.4, 0.33, 0.3, 0, 0, 2.45)
  // Railings: back, sides, front stubs either side of the steps.
  const postAt = (x, z) => pl(g, woodD, 0.14, 1.1, 0.14, x, 1.0, z)
  for (const x of [-2.9, -1, 1, 2.9]) postAt(x, -1.9)
  for (const s of [-1, 1]) {
    postAt(s * 2.9, 0)
    postAt(s * 2.9, 1.9)
    postAt(s * 0.8, 1.9)
  }
  for (const y of [1.55, 2.05]) {
    bx(g, wood, 5.94, 0.12, 0.12, 0, y, -1.9)
    for (const s of [-1, 1]) bx(g, wood, 0.12, 0.12, 3.94, s * 2.9, y, 0)
  }
  for (const s of [-1, 1]) bx(g, wood, 2.2, 0.12, 0.12, s * 1.85, 2.05, 1.9)
  // Binoculars.
  const green = F('#2f8f5a', 0.45, 0.3)
  cy(g, F(IRON, 0.5, 0.5), 0.1, 1.1, 0, 1.55, -1.4, 'y', 8)
  bx(g, green, 0.5, 0.35, 0.45, 0, 2.25, -1.4)
  for (const s of [-1, 1]) {
    cy(g, green, 0.09, 0.25, s * 0.13, 2.28, -1.05, 'z', 8)
    cy(g, F(DARK, 0.4, 0.5), 0.13, 0.15, s * 0.13, 2.28, -1.68, 'z', 10)
  }
  bx(g, F('#ffc928', 0.4, 0.5), 0.2, 0.25, 0.15, 0, 1.75, -1.25)
  return g
}

// Wall lamp: dark housing + shared glowing face. Origin = wall mount point,
// protrudes ~0.3 m along +Z.
export function tunnelLamp() {
  const g = new Group()
  const dark = F('#30353e', 0.5, 0.5)
  bx(g, F(DARK, 0.6, 0.4), 0.55, 0.42, 0.06, 0, 0, 0.03)
  bx(g, dark, 0.48, 0.32, 0.22, 0, 0, 0.16)
  bx(g, dark, 0.56, 0.06, 0.32, 0, 0.19, 0.18)
  bx(g, glowM('#ffd27a', 3.2), 0.38, 0.2, 0.04, 0, -0.01, 0.28)
  return g
}

// Stone portal face (in the XY plane at z = 0, facing +Z; wall 2 m thick behind
// it, z -2..0) around a clear width x height rectangular opening centred on x = 0
// from y = 0. Lintel above, a decorative voussoir half-ring above that with a
// blank name plaque inside. userData.plaque = { x, y, z, w, h }: the plaque's
// front-face centre and size, for a text plane. Total width = width + 2 *
// max(3, 0.45 * width); total height ~ height + 0.42 * width + 4.
export function tunnelPortal(width = 6, height = 6) {
  const W = width
  const H = height
  const g = new Group()
  const side = Math.max(3, W * 0.45)
  const Ri = W * 0.42
  const c = H + 0.8
  const Ht = c + Ri + 1.0 + 1.4
  const wall = S('#8f897f')
  const light = S('#b3ada2')
  const dark = S('#7b756c')
  for (const s of [-1, 1]) pl(g, wall, side, Ht, 2, s * (W / 2 + side / 2), 0, -1, { cast: true })
  pl(g, wall, W, Ht - H, 2, 0, H, -1, { cast: true })
  // Pilasters, plinths and lintel.
  for (const s of [-1, 1]) {
    pl(g, light, 0.9, H, 0.35, s * (W / 2 + 0.45), 0, 0.175)
    pl(g, dark, 1.2, 0.5, 0.6, s * (W / 2 + 0.45), 0, 0.3)
  }
  pl(g, light, W + 1.8, 0.8, 0.4, 0, H, 0.2)
  // Voussoirs (keystone in the middle is lighter and proud).
  const N = 9
  const L = ((Math.PI * (Ri + 0.5)) / N) * 0.92
  for (let k = 0; k < N; k++) {
    const a = (Math.PI * (k + 0.5)) / N
    const key = k === (N - 1) / 2
    bx(g, key ? light : k % 2 ? dark : wall, key ? 1.3 : 1.0, L, key ? 0.6 : 0.5, Math.cos(a) * (Ri + 0.5), c + Math.sin(a) * (Ri + 0.5), key ? 0.3 : 0.25, { rz: a })
  }
  // Name plaque inside the arch.
  const pw = Math.min(W * 0.7, Ri * 1.25)
  const ph = Math.min(1.4, Ri * 0.5)
  const py = c + Ri * 0.42
  bx(g, F('#c9a227', 0.35, 0.7), pw + 0.2, ph + 0.2, 0.12, 0, py, 0.06)
  bx(g, F('#2b2f3a', 0.6, 0.2), pw, ph, 0.16, 0, py, 0.08)
  g.userData.plaque = { x: 0, y: py, z: 0.17, w: pw, h: ph }
  // Cornice, grass on top, a few loose rocks.
  const TW = W + 2 * side
  pl(g, dark, TW + 0.6, 0.5, 2.6, 0, Ht, -1)
  pl(g, S(GRASS), TW, 0.6, 2.4, 0, Ht + 0.5, -1.1)
  for (const [x, s] of [
    [-TW * 0.35, 1.25],
    [TW * 0.1, 1.0],
    [TW * 0.4, 1.5],
  ])
    pl(g, S(ROCKS[1]), s, s * 0.7, s, x, Ht + 1.1, -1.2)
  // Lamps on the pilasters.
  for (const s of [-1, 1]) {
    const lamp = tunnelLamp()
    lamp.position.set(s * (W / 2 + 0.45), H * 0.62, 0.35)
    g.add(lamp)
  }
  return g
}

// ============================================================================================
// PASTURE
// ============================================================================================

// Dry-stone wall along local X, 0..length: two courses + cap stones, ~1.2 m high,
// ~0.85 m thick (~2 meshes per metre; bake it).
export function stoneWall(length = 10, rand) {
  rand = rng(rand)
  const g = new Group()
  const greys = ['#8e9196', '#9da0a4', '#7f8388', '#a7a294'].map(S)
  const courses = [
    [0, 0.5, 0.85, 0.8],
    [0.5, 0.45, 0.75, 0.8],
    [0.95, 0.25, 0.9, 1.2],
  ]
  courses.forEach(([base, h, dep, var_], ci) => {
    let x = 0
    let first = ci === 1
    while (x < length - 0.05) {
      let L = first ? q5(0.4 + rand() * 0.5) : q5(0.9 + rand() * var_)
      first = false
      if (x + L > length) L = q5(length - x)
      if (L < 0.1) break
      const hh = ci === 2 ? h : q5(h * (0.85 + rand() * 0.3))
      bx(g, pick(rand, greys), Math.max(0.05, L - 0.04), hh, q5(dep * (0.9 + rand() * 0.15)), x + L / 2, base + hh / 2, q5((rand() - 0.5) * 0.08), { cast: ci === 0 })
      x += L
    }
  })
  return g
}

// Shepherd's hut on iron wheels: 4.2 (X) x 2.4 (Z) body, ~4.3 m to the stovepipe;
// door + steps on the +X end, window on +Z.
export function shepherdHut() {
  const g = new Group()
  const iron = F('#3a3a3a', 0.6, 0.5)
  const red = F('#c4302b', 0.5)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      cy(g, iron, 0.45, 0.18, sx * 1.4, 0.45, sz * 1.15, 'z', 10, { cast: true })
      cy(g, red, 0.15, 0.22, sx * 1.4, 0.45, sz * 1.15, 'z', 8)
    }
  bx(g, F(DARK, 0.6, 0.4), 4.0, 0.25, 2.0, 0, 0.95, 0)
  bx(g, F(DARK, 0.6, 0.4), 1.2, 0.12, 0.12, -2.7, 0.95, 0)
  pl(g, S('#3f7d5a'), 4.2, 2.0, 2.4, 0, 1.1, 0, { cast: true })
  const cream = S('#efe6cf')
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pl(g, cream, 0.15, 2.0, 0.15, sx * 2.08, 1.1, sz * 1.18)
  const tin = S('#8c949c')
  ;[2.8, 2.2, 1.4, 0.6].forEach((d, i) => pl(g, tin, 4.6, i === 3 ? 0.2 : 0.25, d, 0, 3.1 + i * 0.25, 0, { cast: i === 0 }))
  pl(g, cream, 0.1, 1.85, 1.05, 2.12, 1.1, 0)
  pl(g, F('#7a3b2a'), 0.12, 1.7, 0.85, 2.15, 1.12, 0)
  pl(g, S(WOOD), 0.4, 0.75, 1.0, 2.45, 0, 0)
  pl(g, S(WOOD), 0.4, 0.4, 1.0, 2.85, 0, 0)
  bx(g, cream, 1.0, 0.8, 0.1, -0.4, 2.2, 1.22)
  bx(g, mat('#9fd4ff', 0.1, 0.1, { emissive: '#3a6a8a', emissiveIntensity: 0.4 }), 0.8, 0.6, 0.12, -0.4, 2.2, 1.23)
  for (const s of [-1, 1]) bx(g, S('#c4302b'), 0.35, 0.8, 0.08, -0.4 + s * 0.7, 2.2, 1.25)
  cy(g, iron, 0.1, 1.0, -1.4, 4.0, -0.5, 'y', 8)
  cy(g, iron, 0.18, 0.1, -1.4, 4.55, -0.5, 'y', 8)
  return g
}

// ============================================================================================
// ROCKSLIDE
// ============================================================================================

// Rough rounded boulder, ~size m across, CENTRE origin (for rolling). userData.radius.
export function boulder(size = 2, rand) {
  rand = rng(rand)
  const g = new Group()
  const s = q(size)
  const a = q(s * 0.78)
  const c0 = pick(rand, ROCKS)
  const m0 = S(c0)
  const m1 = S(mixHex(c0, '#000000', 0.12))
  bx(g, m0, s, a, a, 0, 0, 0, { cast: true })
  bx(g, m1, a, s, a, 0, 0, 0, { cast: true })
  bx(g, m0, a, a, s, 0, 0, 0, { cast: true })
  for (let i = 0; i < 2; i++) {
    const c = q(s * (0.3 + rand() * 0.15))
    const ax = Math.floor(rand() * 3)
    const sg = rand() < 0.5 ? -1 : 1
    const p = [q5((rand() - 0.5) * s * 0.3), q5((rand() - 0.5) * s * 0.3), q5((rand() - 0.5) * s * 0.3)]
    p[ax] = sg * (a / 2 + c * 0.15)
    bx(g, i ? m0 : S(STONE_L), c, c, c, p[0], p[1], p[2])
  }
  g.userData.radius = s / 2
  return g
}

// Heap of 9-13 rocks on a dusty patch, ~5 m across, ~1.5 m high.
export function rubblePile(rand) {
  rand = rng(rand)
  const g = new Group()
  pl(g, S('#9c8a70'), 4.8, 0.1, 4.0, 0, 0, 0)
  const ms = [...ROCKS, '#b49a7a', '#857b70'].map(S)
  const n = 9 + Math.floor(rand() * 5)
  for (let k = 0; k < n; k++) {
    const r = rand() * 2.0
    const a = rand() * Math.PI * 2
    const s = q(0.4 + rand() * 1.0 * (1 - r / 3))
    const y = q5(Math.max(0, (1 - r / 2.2) * 1.0 * rand()))
    pl(g, pick(rand, ms), s, q(s * (0.6 + rand() * 0.4)), q(s * (0.7 + rand() * 0.5)), q5(Math.cos(a) * r), 0.1 + y, q5(Math.sin(a) * r * 0.8), { ry: rand() * Math.PI, cast: s > 0.9 })
  }
  return g
}

// Rocky wall chunk, w wide x ~h high, facing +Z (front ~z 0..+0.6, back to
// ~z -5.5), base centre origin; columns of rock with grassy ledges.
export function cliffFace(w = 30, h = 15, rand) {
  rand = rng(rand)
  const g = new Group()
  const ms = CLIFF.map(S)
  const grass = S(GRASS_D)
  const cols = Math.max(2, Math.min(14, Math.round(w / 4)))
  const cw = w / cols
  for (let i = 0; i < cols; i++) {
    const x = -w / 2 + (i + 0.5) * cw
    const hh = q(h * (0.72 + rand() * 0.28))
    const dd = q(3 + rand() * 2.5)
    const z = -dd / 2 + q5((rand() - 0.5) * 0.8)
    const cwq = q(cw + 0.3)
    pl(g, ms[i % 3], cwq, hh, dd, x, 0, z, { cast: true })
    if (rand() < 0.5) pl(g, grass, cwq, 0.4, dd, x, hh, z)
  }
  const ledges = 2 + Math.floor(rand() * 3)
  for (let k = 0; k < ledges; k++) {
    const y = q(h * (0.2 + rand() * 0.5))
    const lw = q(cw * (1.2 + rand() * 1.5))
    const x = q5((rand() - 0.5) * (w - lw))
    pl(g, pick(rand, ms), lw, 0.5, 1.4, x, y, 0.2)
    pl(g, S(GRASS), q(lw - 0.2), 0.25, 1.2, x, y + 0.5, 0.2)
  }
  return g
}

// ============================================================================================
// RIVER DRAWBRIDGE
// ============================================================================================

// Bridge leaf. ORIGIN = hinge line at the near end; the span runs along local -Z
// from 0 to -length. Deck top at y = 0, rails at x = +-0.75 with rail top y = 0.36,
// railings 1.1 m high on both edges, girders below (to y ~ -1). rotation.x > 0
// raises the far end. ~2 + length/1.2 + length/1.25 meshes: rigid, so it can be
// baked first and the baked Group rotated.
export function drawbridgeSpan(length = 20, width = 6) {
  const L = length
  const W = width
  const g = new Group()
  bx(g, F('#2a2018'), W - 0.3, 0.1, L, 0, -0.28, -L / 2)
  const n = Math.max(2, Math.round(L / 1.2))
  const pw = L / n
  const planks = [S('#9a6a3c'), S('#8a5d33')]
  for (let i = 0; i < n; i++) bx(g, planks[i % 2], W, 0.2, pw - 0.07, 0, -0.1, -(i + 0.5) * pw, { cast: true })
  const rail = F('#c8d0d8', 0.3, 0.8)
  for (const s of [-1, 1]) {
    bx(g, S(WOOD_D), 0.4, 0.14, L, s * 0.75, 0.07, -L / 2)
    bx(g, rail, 0.1, 0.22, L, s * 0.75, 0.25, -L / 2)
    bx(g, F('#8a3a2a', 0.5, 0.4), 0.35, 0.8, L, s * (W / 2 - 0.5), -0.6, -L / 2, { cast: true })
  }
  const m = Math.max(2, Math.round(L / 2.5))
  const post = F('#e9e4d8', 0.5, 0.3)
  const bar = F('#d03a2a', 0.45, 0.3)
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.1)
    for (let j = 0; j <= m; j++) pl(g, post, 0.12, 1.1, 0.12, x, 0, -(j * L) / m)
    bx(g, bar, 0.1, 0.1, L, x, 1.1, -L / 2)
    bx(g, post, 0.08, 0.08, L, x, 0.6, -L / 2)
  }
  cy(g, F(IRON, 0.5, 0.5), 0.3, W - 0.4, 0, -0.3, 0, 'x', 10)
  const hz = [F('#ffc928'), F('#151515')]
  for (let k = 0; k < 4; k++) bx(g, hz[k % 2], W / 4, 0.06, 0.3, -W / 2 + (k + 0.5) * (W / 4), 0.03, -L + 0.18)
  return g
}

// Bridge control booth + signal mast + barrier. Booth at x = -2.4, mast at the
// origin with the signal head (facing +Z) at y 4.6-5.9. userData.red /
// userData.green = this tower's own lamp MeshStandardMaterials (toggle
// emissiveIntensity: ~2.5 on, 0 off; green starts on). userData.arm = barrier
// pivot Group at (0.6, 1.1, 0.9): the arm runs along its local +X ~5.3 m;
// rotation.z = 0 is horizontal (closed), ~PI/2 raised.
export function bridgeTower() {
  const g = new Group()
  // Booth.
  pl(g, S(STONE_D), 2.8, 0.3, 2.8, -2.4, 0, 0)
  pl(g, S('#e9e4d8'), 2.4, 1.3, 2.4, -2.4, 0.3, 0, { cast: true })
  pl(g, mat('#7fc8ff', 0.1, 0.2, { emissive: '#2a5a7a', emissiveIntensity: 0.4 }), 2.3, 1.0, 2.3, -2.4, 1.6, 0)
  const white = S(WHITE)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pl(g, white, 0.15, 1.0, 0.15, -2.4 + sx * 1.15, 1.6, sz * 1.15)
  pl(g, white, 2.4, 0.25, 2.4, -2.4, 2.6, 0)
  const roof = S('#c4302b')
  pl(g, roof, 2.9, 0.3, 2.9, -2.4, 2.85, 0, { cast: true })
  pl(g, roof, 1.8, 0.3, 1.8, -2.4, 3.15, 0)
  pl(g, F('#5a3a22'), 0.8, 2.0, 0.08, -2.0, 0.3, 1.22)
  // Mast + signal head.
  const metal = METAL()
  cy(g, metal, 0.09, 5.6, 0, 2.8, 0, 'y', 8, { cast: true })
  bx(g, F('#1d2026', 0.6, 0.3), 0.8, 1.6, 0.4, 0, 5.25, 0.1)
  bx(g, F('#151515', 0.6), 1.1, 1.9, 0.05, 0, 5.25, -0.12)
  const red = new MeshStandardMaterial({ color: '#5c1010', emissive: '#ff2020', emissiveIntensity: 0, roughness: 0.3 })
  const green = new MeshStandardMaterial({ color: '#0f4a1c', emissive: '#20ff5a', emissiveIntensity: 2.5, roughness: 0.3 })
  const hood = F('#1d2026', 0.6, 0.3)
  for (const [m, y] of [
    [red, 5.6],
    [green, 4.9],
  ]) {
    cy(g, m, 0.22, 0.1, 0, y, 0.33, 'z', 14)
    bx(g, hood, 0.56, 0.06, 0.32, 0, y + 0.27, 0.42)
  }
  // Barrier post + arm.
  pl(g, F('#ffc928', 0.5, 0.3), 0.4, 1.0, 0.4, 0.6, 0, 0.9)
  const arm = new Group()
  arm.position.set(0.6, 1.1, 0.9)
  g.add(arm)
  cy(arm, F(IRON, 0.5, 0.5), 0.14, 0.5, 0, 0, 0, 'z', 8)
  const rw = [F('#d62a22', 0.5), F('#f4f1e8', 0.5)]
  for (let k = 0; k < 5; k++) bx(arm, rw[k % 2], 1.0, 0.18, 0.12, 0.75 + k, 0, 0)
  bx(arm, F(DARK, 0.6, 0.4), 0.6, 0.4, 0.3, -0.5, 0, 0)
  bx(arm, glowM('#ff3030', 2.5), 0.12, 0.12, 0.14, 5.15, 0.12, 0)
  g.userData.red = red
  g.userData.green = green
  g.userData.arm = arm
  return g
}

// Cable winch (~3.4 x 1.9 x 1.6 m). userData.drum = Group at the drum axle
// (0, 1.15, 0), axis along local X: spin drum.rotation.x. Cable stub leaves
// over the top towards -Z.
export function bridgeWinch() {
  const g = new Group()
  pl(g, F(IRON, 0.6, 0.5), 3.4, 0.25, 1.6, 0.4, 0, 0)
  const yellow = F('#e0b020', 0.5, 0.3)
  for (const s of [-1, 1]) pl(g, yellow, 0.2, 1.5, 1.3, s * 1.0, 0.25, 0)
  pl(g, F('#2f7d4a', 0.5, 0.3), 0.8, 0.7, 0.9, 1.6, 0.25, 0)
  cy(g, F('#5a6470', 0.45, 0.6), 0.5, 0.1, 1.15, 1.15, 0, 'x', 14)
  bx(g, F('#c4302b'), 0.06, 0.9, 0.06, -1.25, 1.0, 0.5, { rz: 0.4 })
  sph(g, F('#151515'), 0.08, -1.42, 1.42, 0.5)
  bx(g, F('#2a2a2a', 0.8), 0.08, 0.08, 2.0, 0, 1.6, -1.0)
  const drum = new Group()
  drum.position.set(0, 1.15, 0)
  g.add(drum)
  cy(drum, F(IRON, 0.5, 0.5), 0.1, 2.4, 0, 0, 0, 'x', 8)
  cy(drum, F('#5a6470', 0.45, 0.6), 0.45, 1.6, 0, 0, 0, 'x', 14)
  for (const s of [-1, 1]) cy(drum, yellow, 0.65, 0.08, s * 0.78, 0, 0, 'x', 14)
  const cable = F('#2a2a2a', 0.8)
  for (let i = 0; i < 4; i++) cy(drum, cable, 0.5, 0.06, -0.45 + i * 0.3, 0, 0, 'x', 12)
  bx(drum, F('#d62a22'), 1.5, 0.08, 0.1, 0, 0.47, 0)
  g.userData.drum = drum
  return g
}

// ============================================================================================
// DESERT
// ============================================================================================

let tumbleGeo = null
// Airy ~1 m ball of thin sticks, CENTRE origin (one mesh, shared geometry).
export function tumbleweed() {
  if (!tumbleGeo) {
    const r = mulberry32(777)
    const parts = []
    const m = new Matrix4()
    const qn = new Quaternion()
    const e = new Euler()
    const one = new Vector3(1, 1, 1)
    for (let i = 0; i < 20; i++) {
      const dir = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.25 + r() * 0.18)
      e.set(r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2)
      m.compose(dir, qn.setFromEuler(e), one)
      parts.push(new BoxGeometry(0.035, 0.035, 0.6 + r() * 0.35).applyMatrix4(m))
    }
    for (let i = 0; i < 3; i++) {
      e.set(r() * Math.PI, r() * Math.PI, 0)
      m.compose(new Vector3(), qn.setFromEuler(e), one)
      parts.push(new TorusGeometry(0.44, 0.018, 4, 16).applyMatrix4(m))
    }
    tumbleGeo = mergeGeometries(parts)
    for (const p of parts) p.dispose()
  }
  const g = new Group()
  mesh(g, tumbleGeo, F('#b08a52', 0.9), 0, 0, 0, { cast: true })
  return g
}

let sockGeos = null
// Airfield windsock: 4.5 m pole, striped orange/white sock. userData.sock = pivot
// Group at the pole top (0, 4.3, 0); the sock extends along its local +X (~2.2 m).
// rotation.y yaws it; rotation.z < 0 droops it.
export function windsock() {
  if (!sockGeos) {
    sockGeos = []
    const r = (t) => 0.32 - t * 0.2
    for (let i = 0; i < 4; i++) {
      const g = new CylinderGeometry(r((i + 1) / 4), r(i / 4), 0.5, 10, 1, true)
      g.rotateZ(-Math.PI / 2) // +Y (top radius) -> +X
      g.translate(0.15 + i * 0.5 + 0.25, 0, 0)
      sockGeos.push(g)
    }
    sockGeos.hoop = new TorusGeometry(0.32, 0.025, 5, 16)
  }
  const g = new Group()
  pl(g, S(STONE_D), 0.8, 0.2, 0.8, 0, 0, 0)
  cy(g, METAL(), 0.06, 4.3, 0, 2.15, 0, 'y', 8)
  cy(g, F(IRON, 0.5, 0.5), 0.1, 0.2, 0, 4.25, 0, 'y', 8)
  const sock = new Group()
  sock.position.set(0, 4.3, 0)
  g.add(sock)
  mesh(sock, sockGeos.hoop, F(IRON, 0.5, 0.5), 0.15, 0, 0, { ry: Math.PI / 2 })
  bx(sock, F(IRON, 0.5, 0.5), 0.15, 0.04, 0.04, 0.075, 0, 0)
  const cols = [mat('#ff6a1a', 0.7, 0, { side: DoubleSide }), mat('#f8f4ec', 0.7, 0, { side: DoubleSide })]
  sockGeos.forEach((sg, i) => mesh(sock, sg, cols[i % 2], 0, 0, 0, { cast: true }))
  g.userData.sock = sock
  return g
}

// Wind-swept stepped sand dune w x h (depth ~0.7 w), base centre origin; the
// steep lee side faces +X.
export function sandDune(w = 16, h = 4, rand) {
  rand = rng(rand)
  const g = new Group()
  const n = Math.max(2, Math.round(h / 0.8))
  const lh = q(h / n)
  const d = w * 0.7
  const sands = [S('#e6c57f'), S('#dcb873')]
  let last = null
  for (let i = 0; i < n; i++) {
    const f = 1 - (i / n) * 0.82
    const lw = q(w * f * (0.92 + rand() * 0.1))
    const ld = q(d * f * (0.9 + rand() * 0.12))
    const ox = q5(w * 0.22 * (i / n) * (0.8 + rand() * 0.4))
    pl(g, sands[i % 2], lw, lh, ld, ox, i * lh, q5((rand() - 0.5) * 0.6), { cast: i === 0 })
    last = { lw, ld, ox, y: (i + 1) * lh }
  }
  const ripple = S('#f0d496')
  for (let k = 0; k < 2; k++) pl(g, ripple, q(last.lw * 0.8), 0.08, 0.25, last.ox, last.y, (k - 0.5) * last.ld * 0.4)
  return g
}

// ============================================================================================
// STATION
// ============================================================================================

// Shiny gold stop strip, width (X) x 0.6 m (Z), flat on the ground (top y ~0.055),
// with a 'STOP' marking readable by a rider travelling -Z.
export function goldLine(width = 6) {
  const g = new Group()
  const gold = mat('#ffcf3a', 0.25, 0.85, { emissive: '#7a5200', emissiveIntensity: 0.6 })
  mesh(g, studBox(width, 0.05, 0.6), gold, 0, 0.025, 0)
  const edge = F('#151515', 0.6)
  for (const s of [-1, 1]) bx(g, edge, width, 0.04, 0.06, 0, 0.02, s * 0.33)
  const m = canvasMat('stopline', 512, 120, (x, w, h) => {
    fitText(x, 'S T O P', w / 2, h / 2 + 4, w - 20, 104, { color: '#5a1206', outline: '#fff3c0', ow: 6 })
  }, { alpha: true, rough: 0.4 })
  const tw = Math.min(width * 0.6, 2.4)
  const p = new Mesh(new PlaneGeometry(tw, tw * (120 / 512)).rotateX(-Math.PI / 2), m)
  p.position.y = 0.052
  g.add(p)
  return g
}

// ============================================================================================
// PICKUPS
// ============================================================================================

let pickups = null
// Shared assets for InstancedMesh: { coinGeo, coinMat, gemGeo, gemMat }.
// Coin: 0.9 m disc standing upright, faces +/-Z, centred; raised rims + hex boss.
// Gem: faceted magenta brilliant, 0.8 m wide x ~0.72 m tall, centred, point down.
export function pickupAssets() {
  if (pickups) return pickups
  const body = new CylinderGeometry(0.45, 0.45, 0.12, 24).rotateX(Math.PI / 2)
  const rimF = new TorusGeometry(0.4, 0.05, 6, 24).translate(0, 0, 0.06)
  const rimB = new TorusGeometry(0.4, 0.05, 6, 24).translate(0, 0, -0.06)
  const boss = new CylinderGeometry(0.2, 0.2, 0.18, 6).rotateX(Math.PI / 2)
  const coinGeo = mergeGeometries([body, rimF, rimB, boss])
  const crown = new CylinderGeometry(0.24, 0.4, 0.2, 8).translate(0, 0.1, 0)
  const pav = new CylinderGeometry(0.4, 0, 0.5, 8, 1, true).translate(0, -0.25, 0)
  const gemGeo = mergeGeometries([crown, pav]).translate(0, 0.14, 0)
  for (const x of [body, rimF, rimB, boss, crown, pav]) x.dispose()
  pickups = {
    coinGeo,
    coinMat: new MeshStandardMaterial({ color: '#ffcc2e', roughness: 0.32, metalness: 0.55, emissive: '#a86b00', emissiveIntensity: 0.55 }),
    gemGeo,
    gemMat: new MeshStandardMaterial({ color: '#ff4fd8', roughness: 0.15, metalness: 0.15, emissive: '#b0128f', emissiveIntensity: 0.6, flatShading: true }),
  }
  return pickups
}

let haloGeo = null
// Red jerry can, ~0.75 x 1.15 x 0.36 m, base centre origin. userData.halo = a
// horizontal glowing ring (r 0.75) at y 0.5 (shared neon material).
export function fuelCan() {
  const g = new Group()
  const red = F('#d62a22', 0.45, 0.1)
  const redD = F('#b31f19', 0.45, 0.1)
  bx(g, red, 0.75, 0.95, 0.36, 0, 0.5, 0, { cast: true })
  const a = Math.atan2(0.85, 0.65)
  for (const z of [-0.19, 0.19]) for (const s of [-1, 1]) bx(g, redD, 0.95, 0.07, 0.03, 0, 0.5, z, { rz: s * a })
  bx(g, redD, 0.77, 0.05, 0.38, 0, 0.5, 0)
  bx(g, red, 0.5, 0.06, 0.12, -0.05, 1.12, 0)
  for (const x of [-0.25, -0.05, 0.15]) bx(g, red, 0.06, 0.14, 0.12, x, 1.03, 0)
  cy(g, F('#c9ccd0', 0.3, 0.8), 0.07, 0.22, 0.27, 1.06, 0, 'y', 8)
  cy(g, redD, 0.09, 0.08, 0.27, 1.2, 0, 'y', 8)
  haloGeo ??= new TorusGeometry(0.75, 0.04, 6, 32)
  const halo = mesh(g, haloGeo, glowM('#ffd84a', 3), 0, 0.5, 0, { rx: Math.PI / 2 })
  g.userData.halo = halo
  return g
}

let boostMat = null
// Boost pad, 2.2 x 3 m, origin at track centre on the track height; covers the
// rails, top surface y ~0.38 (rail top 0.36). Three chevrons point -Z.
// userData.arrowsMat = MeshStandardMaterial SHARED by all pads: pulse its
// emissiveIntensity (~1-3; starts 2.2).
export function boostPad() {
  if (!boostMat) boostMat = new MeshStandardMaterial({ color: '#063040', emissive: '#2ef2ff', emissiveIntensity: 2.2, roughness: 0.4 })
  const g = new Group()
  bx(g, F('#1c2230', 0.6, 0.3), 2.2, 0.06, 3.0, 0, 0.35, 0)
  const yel = F('#ffc928', 0.5)
  for (const s of [-1, 1]) bx(g, yel, 0.12, 0.08, 3.0, s * 1.1, 0.36, 0)
  const steel = F('#5a6470', 0.4, 0.6)
  for (const s of [-1, 1]) bx(g, steel, 2.2, 0.08, 0.12, 0, 0.36, s * 1.5)
  for (const zt of [-1.1, -0.2, 0.7]) {
    bx(g, boostMat, 0.9, 0.03, 0.22, 0.3, 0.395, zt + 0.3, { ry: -Math.PI / 4 })
    bx(g, boostMat, 0.9, 0.03, 0.22, -0.3, 0.395, zt + 0.3, { ry: Math.PI / 4 })
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, boostMat, 0.14, 0.05, 0.14, sx * 0.9, 0.39, sz * 1.3)
  g.userData.arrowsMat = boostMat
  return g
}

let gateGeos = null
// Speed gate: half-ring arch over the track, inner span ~6.6 m (ring centre-line
// radius 3.6 m, centre y 0.9, top ~4.8 m) on two feet, with a dark number panel
// on top. userData.ringMat = this gate's own ring MeshStandardMaterial (set
// .color and .emissive to recolour). userData.panel = { x, y, z, w, h } front-face
// centre and size of the panel (faces +Z).
export function speedGate() {
  if (!gateGeos) gateGeos = { ring: new TorusGeometry(3.6, 0.32, 8, 28, Math.PI), trim: new TorusGeometry(3.6, 0.08, 5, 28, Math.PI) }
  const g = new Group()
  const ringMat = new MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 1.2, roughness: 0.35, metalness: 0.2 })
  mesh(g, gateGeos.ring, ringMat, 0, 0.9, 0, { cast: true })
  mesh(g, gateGeos.trim, glowM('#ffffff', 2.5), 0, 0.9, 0.3)
  const dark = F('#1a1f2b', 0.5, 0.4)
  for (const s of [-1, 1]) {
    pl(g, dark, 0.8, 0.9, 0.8, s * 3.6, 0, 0)
    pl(g, F('#ffc928', 0.5), 1.2, 0.2, 1.2, s * 3.6, 0, 0)
  }
  bx(g, dark, 0.3, 0.5, 0.3, 0, 5.05, 0)
  mesh(g, studBox(3.4, 1.6, 0.24), ringMat, 0, 5.95, -0.05)
  bx(g, F('#10141c', 0.5, 0.2), 3.2, 1.4, 0.3, 0, 5.95, 0)
  g.userData.ringMat = ringMat
  g.userData.panel = { x: 0, y: 5.95, z: 0.16, w: 3.0, h: 1.2 }
  return g
}

let ticketAssets = null
// Floating golden ticket, 1.4 x 0.7 m, CENTRE origin, faces +Z (printed both
// sides). userData.glow = soft additive halo plane (2.6 x 1.8 m) behind it.
export function goldenTicket() {
  if (!ticketAssets) {
    const sh = new Shape()
    sh.moveTo(-0.7, -0.35)
    sh.lineTo(0.7, -0.35)
    sh.lineTo(0.7, -0.1)
    sh.absarc(0.7, 0, 0.1, -Math.PI / 2, Math.PI / 2, true)
    sh.lineTo(0.7, 0.35)
    sh.lineTo(-0.7, 0.35)
    sh.lineTo(-0.7, 0.1)
    sh.absarc(-0.7, 0, 0.1, Math.PI / 2, -Math.PI / 2, true)
    sh.closePath()
    const body = new ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 6 })
    body.translate(0, 0, -0.025)
    const glowTex = new CanvasTexture(paintSoftDot(128))
    ticketAssets = {
      body,
      bodyMat: mat('#ffc83a', 0.25, 0.75, { emissive: '#b07800', emissiveIntensity: 0.45 }),
      glowMat: new MeshBasicMaterial({ map: glowTex, color: '#ffd25a', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    }
    const faceM = canvasMat('ticket', 512, 264, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, w, h)
      gr.addColorStop(0, '#ffe27a')
      gr.addColorStop(0.5, '#f0b422')
      gr.addColorStop(1, '#ffd95a')
      x.fillStyle = gr
      x.fillRect(0, 0, w, h)
      x.strokeStyle = '#9a6200'
      x.lineWidth = 8
      x.strokeRect(10, 10, w - 20, h - 20)
      x.setLineDash([10, 8])
      x.lineWidth = 4
      x.beginPath()
      x.moveTo(398, 18)
      x.lineTo(398, h - 18)
      x.stroke()
      x.setLineDash([])
      x.fillStyle = '#c43a1a'
      star(x, 455, h / 2, 34)
      star(x, 40, 40, 12)
      star(x, 360, h - 40, 12)
      fitText(x, 'GOLDEN', 205, 92, 340, 88, { color: '#b3261e', outline: '#ffffff', ow: 10 })
      fitText(x, 'TICKET', 205, 182, 340, 88, { color: '#b3261e', outline: '#ffffff', ow: 10 })
    }, { rough: 0.35, metal: 0.3, extra: { emissive: '#ffffff', emissiveIntensity: 0.35 } })
    faceM.emissiveMap = faceM.map
    ticketAssets.faceMat = faceM
  }
  const A = ticketAssets
  const g = new Group()
  mesh(g, A.body, A.bodyMat, 0, 0, 0)
  face(g, A.faceMat, 1.16, 0.6, 0, 0, 0.04)
  face(g, A.faceMat, 1.16, 0.6, 0, 0, -0.04, Math.PI)
  const glowMesh = new Mesh(planeGeo(2.6, 1.8), A.glowMat)
  glowMesh.position.z = -0.1
  glowMesh.renderOrder = -1
  g.add(glowMesh)
  g.userData.glow = glowMesh
  return g
}
