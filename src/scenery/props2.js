// Procedural toy-brick props for the second half of the rail line: the Golden
// Gate, Dusty Gulch, Ashfall Volcano, the Lava Tubes, Crystal Caverns, Emerald
// Jungle, the Lost Temple, Misty Bayou, Lighthouse Cove, the Frozen Tundra /
// Titan Peak and the Diamond Terminus, plus a few generic track-side pieces.
//
// Conventions (same as props.js): metres, +Y up, the track runs along -Z
// (forward), rails 1.5 m apart with rail tops 0.36 m above the track bed.
// Unless noted, a prop's origin is the centre of its base on the ground and its
// "front" (sign faces, doors) looks along +Z, towards a cart coming down the track.
// `rand` params take a mulberry32-style function, a numeric seed, or nothing.
//
// STATIC props are plain Groups of meshes built from cached materials (mostly
// studMat), so bake(group) merges them into a few draw calls. ANIMATED props
// expose their live parts in userData (see each builder); detach those before
// baking the rest. Materials the caller animates (lockMat, lampMat, glowMat,
// glowMats) are the prop's OWN materials with a unique bake key, so bake() never
// merges them with a look-alike from another prop.
import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { studBox, studMat, studPlane } from '../studs.js'
import { fontReady, neon } from '../propkit.js'
import { mulberry32 } from '../textures.js'
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
const SNOW_S = '#dfe8f5'
const GRASS = '#4caf3a'
const GRASS_D = '#3c8f2f'
const IRON = '#3b3f46'
const DARK = '#2a2f3a'
const MOSS = '#5c8a34'
const MOSS_D = '#4a7a2a'
const ROCKS = ['#8a8f96', '#7b7f86', '#959aa1']
const VROCK = ['#3a3536', '#2f2b2c', '#454040'] // volcanic
const BASALT = ['#2e2b2e', '#3a3538', '#262326', '#433c3c']
const CAVE = ['#5a5068', '#4d4560', '#675c78']
const TEMPLE = ['#9a9378', '#8a8468', '#a8a184', '#7f7a62']
const SEAROCK = ['#8b8172', '#7a7064', '#978c7c']
const PEAK = ['#7d8088', '#6e7179', '#8a8d94']

// --- Small helpers (mirrors props.js) --------------------------------------------------------
let seedN = 1
const rng = (rand) => (typeof rand === 'function' ? rand : mulberry32(typeof rand === 'number' ? rand : 0x5eed + seedN++ * 7919))
const q = (v) => Math.max(0.25, Math.round(v * 4) / 4) // rand-driven sizes snap to 0.25 m (bounded geometry cache)
const q5 = (v) => Math.max(0.05, Math.round(v * 20) / 20)
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length]
const S = (c) => studMat(c) // studded
const F = (c, rough = 0.7, metal = 0) => studMat(c, { flat: true, rough, metal }) // plain
const METAL = () => F('#aeb6bf', 0.38, 0.65)
const asMat = (m, flat) => (typeof m === 'string' ? (flat ? F(m) : S(m)) : m)

const mats = new Map()
function mat(color, rough = 0.5, metal = 0, extra = {}) {
  const key = `${color}|${rough}|${metal}|${JSON.stringify(extra)}`
  let m = mats.get(key)
  if (!m) mats.set(key, (m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra })))
  return m
}
const GOLD = () => mat('#ffc94a', 0.28, 0.8, { emissive: '#5a3c00', emissiveIntensity: 0.45 })
const neons = new Map()
function glowM(color, k = 3) {
  const key = `${color}|${k}`
  let m = neons.get(key)
  if (!m) neons.set(key, (m = neon(color, k)))
  return m
}
// Shared additive neon (flames, jets): unlit, glows with bloom.
const flames = new Map()
function flameM(color, k = 3) {
  const key = `${color}|${k}`
  let m = flames.get(key)
  if (!m) flames.set(key, (m = neon(color, k, { transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })))
  return m
}
// A material the caller animates: a unique bake key (bake() reads userData.k)
// keeps it from being merged into a look-alike from another prop.
let ownN = 0
const own = (m) => {
  m.userData.k = `own${++ownN}`
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
const coneGeos = new Map()
function coneGeo(seg) {
  let g = coneGeos.get(seg)
  if (!g) coneGeos.set(seg, (g = new CylinderGeometry(0, 1, 1, seg)))
  return g
}
// Upright cone (apex up) of base radius r and height h standing on y = base.
function cone(p, m, r, h, x, base, z, seg = 8, o) {
  const me = mesh(p, coneGeo(seg), asMat(m, true), x, base + h / 2, z, o)
  me.scale.set(r, h, r)
  return me
}
// Rod between two points (thin cylinder), for ropes and stays.
function rod(p, m, r, a, b, seg = 5) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const len = Math.hypot(dx, dy, dz)
  const me = mesh(p, cylGeo(seg), asMat(m, true), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  me.scale.set(r, len, r)
  // Align +Y with (dx, dy, dz): yaw about Y then pitch.
  me.rotation.order = 'YXZ'
  me.rotation.y = Math.atan2(dx, dz)
  me.rotation.x = Math.acos(Math.max(-1, Math.min(1, dy / len)))
  return me
}
const SPHERE = new SphereGeometry(1, 10, 8)
const sph = (p, m, r, x, y, z) => {
  const me = mesh(p, SPHERE, asMat(m, true), x, y, z)
  me.scale.setScalar(r)
  return me
}
let hemiGeo = null
const toruses = new Map()
function torusGeo(r, tube, rs = 6, ts = 18) {
  const key = `${r}|${tube}|${rs}|${ts}`
  let g = toruses.get(key)
  if (!g) toruses.set(key, (g = new TorusGeometry(r, tube, rs, ts)))
  return g
}
let gemG = null
// Brilliant-cut gem, 2 m across: crown (table up) y 0..0.45, pavilion y -1..0.
function gemGeo() {
  if (!gemG) {
    const crown = new CylinderGeometry(0.62, 1, 0.45, 8).translate(0, 0.225, 0)
    const pav = new CylinderGeometry(1, 0, 1.0, 8).translate(0, -0.5, 0)
    gemG = mergeGeometries([crown, pav])
    crown.dispose()
    pav.dispose()
  }
  return gemG
}
// Six-sided crystal (prism + point) rising along the pivot's +Y from (x, y, z),
// tilted by rx / rz. Two meshes.
function crystal(p, body, tip, r, h, x, y, z, rx = 0, rz = 0, seg = 6) {
  const c = new Group()
  c.position.set(x, y, z)
  c.rotation.set(rx, 0, rz)
  p.add(c)
  const b = mesh(c, cylGeo(seg), body, 0, h * 0.36, 0)
  b.scale.set(r, h * 0.72, r)
  const t = mesh(c, coneGeo(seg), tip, 0, h * 0.86, 0)
  t.scale.set(r, h * 0.28, r)
  return c
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
// Flat XZ plane, top at y 0, UVs in world tiles of `tile` m (so a scrolled
// texture moves at the same speed whatever the size).
function flatPlane(w, d, tile) {
  const geo = new PlaneGeometry(w, d)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile)
  geo.rotateX(-Math.PI / 2)
  return geo
}

// --- Canvas faces (signs) --------------------------------------------------------------------
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
function fitText(x, text, cx, cyy, maxW, px, { color = '#ffffff', outline = null, ow = null } = {}) {
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
    x.strokeText(text, cx, cyy)
  }
  x.fillStyle = color
  x.fillText(text, cx, cyy)
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
function star(x, cx, cyy, r) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    pts.push([cx + Math.cos(a) * rr, cyy + Math.sin(a) * rr])
  }
  poly(x, pts)
}
// Painted wooden shop board (Wild West).
function boardSign(key, text, { bg = '#6a4224', fg = '#ffe9b0', outline = '#2a1608', border = '#f3d9a0', w = 512, h = 128 } = {}) {
  return canvasMat(`wsign|${key}`, w, h, (x, W, H) => {
    x.fillStyle = bg
    x.fillRect(0, 0, W, H)
    x.fillStyle = 'rgba(0,0,0,0.18)'
    for (let i = 1; i < 3; i++) x.fillRect(0, (i * H) / 3 - 2, W, 4)
    x.strokeStyle = border
    x.lineWidth = 10
    rrect(x, 8, 8, W - 16, H - 16, 10)
    x.stroke()
    fitText(x, text, W / 2, H / 2 + 4, W - 60, H * 0.62, { color: fg, outline, ow: 10 })
  })
}
// Scrolling surface texture: one cached canvas, a fresh CanvasTexture per call
// (each surface scrolls its own offset).
function scrollTex(canvas) {
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.anisotropy = 4
  return tex
}
const surf = new Map()
function surfCanvas(key, size, paint) {
  let c = surf.get(key)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = size
  paint(c.getContext('2d'), size, mulberry32(key.length * 977 + size))
  surf.set(key, c)
  return c
}
// Draw a rect and its wrapped copies so the canvas tiles seamlessly.
function wrapRect(x, size, x0, y0, w, h) {
  for (const ox of [0, -size]) for (const oy of [0, -size]) x.fillRect(x0 + ox, y0 + oy, w, h)
}

// ============================================================================================
// GOLDEN GATE
// ============================================================================================

// Monumental gold-and-stone portal face (XY plane at z = 0, facing +Z; wall 3 m
// thick behind it, z -3..0) around a clear width x height opening centred on
// x = 0 from y = 0. Total width = width + 2 * max(4, width / 2); total height ~
// height + 0.42 * width + 5.5 (crown + lamps on top).
// userData.doorL / doorR: hinge pivot Groups at (-width/2, 0, -0.8) / (+width/2,
// 0, -0.8); each leaf is width/2 wide, height tall, 0.4 thick. Open inward
// (towards -Z): doorL.rotation.y = +a, doorR.rotation.y = -a (a up to ~PI/2;
// fully open a leaf reaches z ~ -0.8 - width/2).
// userData.lockMat: this gate's own emissive lock material (starts red: set
// .emissive to green when it unlocks). userData.plaque = { x, y, z, w, h }:
// front-face centre and size of the blank name plaque, for a text plane.
export function goldenGate(width = 8, height = 9) {
  const W = width
  const H = height
  const g = new Group()
  const D = 3
  const side = Math.max(4, W * 0.5)
  const Ri = W * 0.42
  const c = H + 1.0 // arch springing line = top of the lintel
  const Ht = c + Ri + 2.3
  const stone = S('#a39b8c')
  const stoneL = S('#c2b9a6')
  const stoneD = S('#857d70')
  const gold = GOLD()
  // Wall mass: two piers + the block over the opening.
  for (const s of [-1, 1]) pl(g, stone, side, Ht, D, s * (W / 2 + side / 2), 0, -D / 2, { cast: true })
  pl(g, stone, W, Ht - H, D, 0, H, -D / 2, { cast: true })
  // Gold pilasters on stone plinths, gold capitals, gold lintel.
  for (const s of [-1, 1]) {
    pl(g, gold, 1.2, H, 0.5, s * (W / 2 + 0.6), 0, 0.25)
    pl(g, stoneL, 1.6, 1.0, 0.9, s * (W / 2 + 0.8), 0, 0.45)
    pl(g, gold, 1.7, 0.6, 0.9, s * (W / 2 + 0.85), H - 0.6, 0.45)
  }
  pl(g, gold, W + 2.6, 1.0, 0.6, 0, H, 0.3, { cast: true })
  // Voussoir half-ring, gold and pale stone, gold keystone.
  const N = 7
  const rr = Ri + 0.55
  const Lv = ((Math.PI * rr) / N) * 0.92
  for (let k = 0; k < N; k++) {
    const a = (Math.PI * (k + 0.5)) / N
    const key = k === (N - 1) / 2
    bx(g, key || k % 2 ? gold : stoneL, key ? 1.4 : 1.1, Lv, key ? 0.7 : 0.55, Math.cos(a) * rr, c + Math.sin(a) * rr, key ? 0.35 : 0.27, { rz: a })
  }
  // Name plaque inside the arch.
  const pw = Math.min(W * 0.75, Ri * 1.3)
  const ph = Math.min(1.6, Ri * 0.45)
  const py = c + Ri * 0.42
  bx(g, gold, pw + 0.3, ph + 0.3, 0.14, 0, py, 0.07)
  bx(g, F('#2b2f3a', 0.6, 0.2), pw, ph, 0.18, 0, py, 0.09)
  g.userData.plaque = { x: 0, y: py, z: 0.19, w: pw, h: ph }
  // The lock: housing on the lintel + a glowing lens, and glow strips down both pilasters.
  const lockMat = own(new MeshStandardMaterial({ color: '#3a0a0a', emissive: '#ff2a2a', emissiveIntensity: 2.6, roughness: 0.3 }))
  pl(g, F('#c8921e', 0.35, 0.75), 1.5, 1.0, 0.3, 0, H, 0.75)
  cy(g, lockMat, 0.45, 0.08, 0, H + 0.5, 0.92, 'z', 16)
  for (const s of [-1, 1]) bx(g, lockMat, 0.18, H * 0.7, 0.06, s * (W / 2 + 0.6), H * 0.45, 0.53)
  g.userData.lockMat = lockMat
  // Cornice, gold frieze and a stepped gold-and-stone crown with a sun disc.
  const TW = W + 2 * side
  pl(g, stoneD, TW + 0.8, 0.6, D + 0.6, 0, Ht, -D / 2)
  bx(g, gold, TW + 0.2, 0.45, 0.2, 0, Ht - 0.5, 0.1)
  let y = Ht + 0.6
  ;[
    [W + 3, stoneL],
    [W + 1, gold],
    [Math.max(2.5, W - 2), stoneL],
  ].forEach(([w, m], i) => {
    pl(g, m, w, 1.0, 2.0 - i * 0.4, 0, y, -0.8, { cast: i === 0 })
    y += 1.0
  })
  cy(g, gold, 1.3, 0.3, 0, Ht + 2.1, 0.35, 'z', 20)
  cy(g, F('#fff0b0', 0.25, 0.6), 0.8, 0.36, 0, Ht + 2.1, 0.36, 'z', 20)
  // Lamps on the piers.
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + side / 2)
    pl(g, stoneD, 0.9, 1.6, 0.9, x, Ht + 0.6, -0.6)
    bx(g, glowM('#ffd34a', 3), 0.65, 0.65, 0.65, x, Ht + 2.55, -0.6)
  }
  // Door leaves (gold, iron bands, a ring handle at the meeting edge).
  const leafMat = F('#d9a628', 0.35, 0.7)
  const panel = F('#f0c048', 0.3, 0.75)
  const band = F(IRON, 0.5, 0.5)
  const lw = W / 2 - 0.04
  const doors = {}
  for (const [name, sx] of [
    ['doorL', 1],
    ['doorR', -1],
  ]) {
    const piv = new Group()
    piv.position.set(-sx * (W / 2), 0, -0.8)
    g.add(piv)
    bx(piv, leafMat, lw, H - 0.04, 0.4, (sx * lw) / 2, H / 2, 0, { cast: true })
    for (const [py0, ph0] of [
      [H * 0.27, H * 0.36],
      [H * 0.73, H * 0.36],
    ])
      bx(piv, panel, lw - 0.9, ph0, 0.1, (sx * lw) / 2, py0, 0.24)
    for (const by of [0.6, H * 0.5, H - 0.6]) bx(piv, band, lw, 0.28, 0.12, (sx * lw) / 2, by, 0.26)
    bx(piv, panel, 0.3, H - 0.04, 0.16, sx * (lw - 0.15), H / 2, 0.26)
    mesh(piv, torusGeo(0.32, 0.07), band, sx * (lw - 0.75), H * 0.42, 0.36)
    sph(piv, gold, 0.16, sx * (lw - 0.75), H * 0.42 + 0.32, 0.36)
    doors[name] = piv
  }
  g.userData.doorL = doors.doorL
  g.userData.doorR = doors.doorR
  return g
}

// Railway junction signal: ~9.2 m mast with ladder and platform, a round-topped
// head (facing +Z) with a main lamp at y 7.8 and an unlit lens below, a white
// "feather" of neon dots pointing up-left (the merging line) and a MERGE plate.
// userData.lampMat = this signal's own lamp material (starts green: set
// .emissive to red / green; emissiveIntensity ~2.5 on, 0 off).
export function mergeSignal() {
  const g = new Group()
  pl(g, S(STONE_D), 1.3, 0.4, 1.3, 0, 0, 0)
  cy(g, METAL(), 0.12, 6.2, 0, 3.5, 0, 'y', 8, { cast: true })
  cy(g, F(DARK, 0.6, 0.4), 0.16, 0.12, 0, 6.66, 0, 'y', 8)
  const rail = F(IRON, 0.5, 0.5)
  for (const s of [-1, 1]) pl(g, rail, 0.06, 5.2, 0.06, s * 0.22, 0.4, -0.3)
  for (let i = 0; i < 5; i++) bx(g, rail, 0.44, 0.05, 0.05, 0, 1.0 + i, -0.3)
  pl(g, F(DARK, 0.6, 0.4), 1.2, 0.08, 1.0, 0, 5.6, -0.2)
  bx(g, rail, 1.2, 0.05, 0.05, 0, 6.4, -0.68)
  // Head.
  const black = F('#151515', 0.6)
  bx(g, black, 1.3, 2.0, 0.06, 0, 7.4, -0.05)
  cy(g, black, 0.65, 0.06, 0, 8.4, -0.05, 'z', 16)
  bx(g, F('#1d2026', 0.6, 0.3), 0.75, 1.7, 0.4, 0, 7.35, 0.18, { cast: true })
  const lampMat = own(new MeshStandardMaterial({ color: '#0f4a1c', emissive: '#20ff5a', emissiveIntensity: 2.5, roughness: 0.3 }))
  cy(g, lampMat, 0.24, 0.1, 0, 7.8, 0.4, 'z', 14)
  cy(g, F('#2a1010', 0.4), 0.24, 0.1, 0, 6.95, 0.4, 'z', 14)
  const hood = F('#1d2026', 0.6, 0.3)
  for (const hy of [8.08, 7.23]) bx(g, hood, 0.6, 0.06, 0.34, 0, hy, 0.5)
  // Junction feather.
  bx(g, black, 1.4, 0.42, 0.05, -1.17, 8.78, -0.02, { rz: -0.666 })
  const dot = glowM('#fff6dc', 2.5)
  for (let i = 0; i < 4; i++) bx(g, dot, 0.16, 0.16, 0.08, -0.75 - i * 0.28, 8.45 + i * 0.22, 0.04)
  // MERGE plate.
  bx(g, black, 1.2, 0.42, 0.05, 0, 2.6, 0.14)
  const plate = canvasMat('mergeplate', 256, 90, (x, w, h) => {
    x.fillStyle = '#151515'
    x.fillRect(0, 0, w, h)
    x.strokeStyle = '#ffd21f'
    x.lineWidth = 6
    x.strokeRect(5, 5, w - 10, h - 10)
    fitText(x, 'MERGE', w / 2, h / 2 + 3, w - 30, 64, { color: '#ffd21f' })
  })
  face(g, plate, 1.14, 0.38, 0, 2.6, 0.17)
  g.userData.lampMat = lampMat
  return g
}

// ============================================================================================
// DUSTY GULCH (Wild West)
// ============================================================================================

// Two-storey saloon, 10 (X) x 8 (Z) body, false front to ~10.5 m, boardwalk +
// porch with a balcony on the +Z side, batwing doors, lit windows.
export function saloon() {
  const g = new Group()
  const W = 10
  const D = 8
  const zf = D / 2
  const wall = S('#b5743f')
  const front = S('#c9874a')
  const trim = S('#f0dcb0')
  const plank = S('#9a6a3c')
  const post = S(WOOD_D)
  pl(g, S(STONE_D), W + 0.4, 0.4, D + 0.4, 0, 0, 0)
  pl(g, plank, W + 0.6, 0.4, 2.6, 0, 0, zf + 1.3)
  pl(g, wall, W, 6, D, 0, 0.4, 0, { cast: true })
  pl(g, S('#5d636e'), W + 0.4, 0.4, D + 0.4, 0, 6.4, 0)
  // False front with a stepped top.
  pl(g, front, W + 0.6, 2.6, 0.4, 0, 6.4, zf - 0.2, { cast: true })
  pl(g, trim, W + 1.0, 0.25, 0.6, 0, 9.0, zf - 0.2)
  pl(g, front, W - 2, 0.8, 0.4, 0, 9.25, zf - 0.2)
  pl(g, front, 3, 0.6, 0.4, 0, 10.05, zf - 0.2)
  bx(g, S(WOOD_D), W - 1, 1.7, 0.12, 0, 7.75, zf + 0.06)
  face(g, boardSign('saloon', 'SALOON', { bg: '#7a2a1a', fg: '#ffd86a', border: '#ffd86a' }), W - 1.2, 1.5, 0, 7.75, zf + 0.13)
  // Balcony deck (= porch roof) on posts, railing.
  pl(g, S(WOOD), W + 0.6, 0.3, 2.4, 0, 3.4, zf + 1.2, { cast: true })
  for (const x of [-4.6, -1.6, 1.6, 4.6]) {
    pl(g, post, 0.25, 3.0, 0.25, x, 0.4, zf + 2.25)
    pl(g, post, 0.16, 0.8, 0.16, x, 3.7, zf + 2.3)
  }
  for (const ry of [4.5, 4.05]) bx(g, S(WOOD_L), W + 0.6, 0.12, 0.12, 0, ry, zf + 2.32)
  // Door with batwings.
  const lit = mat('#ffcf7a', 0.4, 0, { emissive: '#ff9a2a', emissiveIntensity: 0.55 })
  pl(g, trim, 2.2, 2.7, 0.1, 0, 0.4, zf + 0.02)
  pl(g, F('#2a1a10'), 1.8, 2.5, 0.12, 0, 0.4, zf + 0.04)
  for (const s of [-1, 1]) pl(g, S('#7a4a26'), 0.85, 1.1, 0.08, s * 0.45, 1.2, zf + 0.14)
  // Windows: two lit below, two above.
  for (const s of [-1, 1]) {
    bx(g, trim, 1.8, 1.6, 0.1, s * 3.2, 2.2, zf + 0.02)
    bx(g, lit, 1.4, 1.2, 0.12, s * 3.2, 2.2, zf + 0.04)
    bx(g, trim, 1.4, 1.5, 0.1, s * 2.6, 5.0, zf + 0.02)
    bx(g, F('#2a2420'), 1.0, 1.1, 0.12, s * 2.6, 5.0, zf + 0.04)
  }
  // Steps, a barrel, lamps by the door.
  pl(g, plank, 2.4, 0.2, 0.5, 0, 0, zf + 2.85)
  cy(g, F('#8a5a32'), 0.4, 0.95, 4.2, 0.88, zf + 1.0, 'y', 10)
  for (const s of [-1, 1]) bx(g, glowM('#ffcf6a', 2.8), 0.22, 0.3, 0.22, s * 1.45, 2.8, zf + 0.2)
  return g
}

// General store, 8 (X) x 7 (Z), false front to ~7.2 m, striped awning over the
// boardwalk (+Z), shop windows, crates, sacks and a barrel out front.
export function generalStore() {
  const g = new Group()
  const W = 8
  const D = 7
  const zf = D / 2
  const trim = S(WHITE)
  pl(g, S(STONE_D), W + 0.4, 0.4, D + 0.4, 0, 0, 0)
  pl(g, S('#9a6a3c'), W + 0.6, 0.4, 2.6, 0, 0, zf + 1.3)
  pl(g, S('#8fa7b3'), W, 4.4, D, 0, 0.4, 0, { cast: true })
  pl(g, S('#5d636e'), W + 0.3, 0.3, D + 0.3, 0, 4.8, 0)
  pl(g, S('#a8c0cb'), W + 0.4, 2.0, 0.4, 0, 4.8, zf - 0.2, { cast: true })
  pl(g, trim, W + 0.8, 0.22, 0.6, 0, 6.8, zf - 0.2)
  pl(g, S('#a8c0cb'), 3.2, 0.5, 0.4, 0, 7.02, zf - 0.2)
  bx(g, S(WOOD_D), W - 1, 1.1, 0.12, 0, 5.8, zf + 0.06)
  face(g, boardSign('store', 'GENERAL STORE', { bg: '#2f5a3a', fg: '#fff2c4', border: '#fff2c4' }), W - 1.2, 0.95, 0, 5.8, zf + 0.13)
  // Striped awning (6 slats, sloping down towards +Z) on two posts.
  const stripes = [S('#c8322b'), S(WHITE)]
  for (let i = 0; i < 6; i++) bx(g, stripes[i % 2], W / 6, 0.12, 2.5, -W / 2 + (i + 0.5) * (W / 6), 3.55, zf + 1.2, { rx: 0.28, cast: i === 0 })
  for (const s of [-1, 1]) pl(g, S(WOOD_D), 0.22, 2.95, 0.22, s * (W / 2 - 0.2), 0.4, zf + 2.3)
  // Shop windows + door.
  const glass = mat('#bfe4ff', 0.12, 0.2, { emissive: '#ffcf7a', emissiveIntensity: 0.25 })
  for (const s of [-1, 1]) {
    bx(g, trim, 2.4, 1.9, 0.1, s * 2.45, 2.15, zf + 0.02)
    bx(g, glass, 2.0, 1.5, 0.12, s * 2.45, 2.15, zf + 0.04)
  }
  pl(g, trim, 1.4, 2.6, 0.1, 0, 0.4, zf + 0.02)
  pl(g, F('#5a3a22'), 1.1, 2.4, 0.12, 0, 0.4, zf + 0.04)
  // Goods on the boardwalk.
  const crate = S('#b08a52')
  pl(g, crate, 0.8, 0.8, 0.8, -3.2, 0.4, zf + 1.1)
  pl(g, crate, 0.6, 0.6, 0.6, -3.15, 1.2, zf + 1.1, { ry: 0.3 })
  const sack = S('#d9c79a')
  pl(g, sack, 0.55, 0.7, 0.45, -1.6, 0.4, zf + 0.9)
  pl(g, sack, 0.55, 0.6, 0.45, -1.05, 0.4, zf + 1.0, { ry: 0.4 })
  cy(g, F('#8a5a32'), 0.38, 0.9, 3.1, 0.85, zf + 1.1, 'y', 10)
  return g
}

// Adobe sheriff's office, 7 (X) x 6 (Z), false front with a gold star, barred
// windows (front and +X), wanted posters, porch roof on posts, a bench.
export function sheriffOffice() {
  const g = new Group()
  const W = 7
  const D = 6
  const zf = D / 2
  const adobe = S('#c99a6a')
  const adobe2 = S('#b8865a')
  const trim = S('#7a4a26')
  const iron = F(IRON, 0.5, 0.5)
  pl(g, S(STONE_D), W + 0.4, 0.4, D + 0.4, 0, 0, 0)
  pl(g, S('#9a6a3c'), W + 0.6, 0.4, 2.2, 0, 0, zf + 1.1)
  pl(g, adobe, W, 4.2, D, 0, 0.4, 0, { cast: true })
  pl(g, S('#8a6a4a'), W + 0.3, 0.3, D + 0.3, 0, 4.6, 0)
  pl(g, trim, W + 0.8, 0.2, 0.6, 0, 4.4, zf - 0.1)
  pl(g, adobe2, W + 0.4, 1.8, 0.4, 0, 4.6, zf - 0.2, { cast: true })
  pl(g, adobe2, W - 2.4, 0.7, 0.4, 0, 6.4, zf - 0.2)
  bx(g, trim, 4.6, 1.0, 0.12, 0, 5.4, zf + 0.06)
  face(g, boardSign('sheriff', 'SHERIFF', { bg: '#3a2414', fg: '#ffd86a', border: '#ffd86a' }), 4.4, 0.9, 0, 5.4, zf + 0.13)
  const starMat = canvasMat('sheriffstar', 128, 128, (x) => {
    x.fillStyle = '#7a5200'
    star(x, 64, 66, 62)
    x.fillStyle = '#ffd34a'
    star(x, 64, 66, 52)
    x.fillStyle = '#b07a10'
    x.beginPath()
    x.arc(64, 68, 14, 0, Math.PI * 2)
    x.fill()
  }, { alpha: true, rough: 0.3, metal: 0.6 })
  face(g, starMat, 0.75, 0.75, 0, 6.75, zf + 0.01)
  // Porch roof on two posts.
  pl(g, S(WOOD), W + 0.6, 0.25, 2.2, 0, 3.4, zf + 1.1, { cast: true })
  for (const s of [-1, 1]) pl(g, S(WOOD_D), 0.22, 3.0, 0.22, s * 3.2, 0.4, zf + 2.0)
  // Door + posters.
  pl(g, trim, 1.4, 2.5, 0.1, -1.6, 0.4, zf + 0.02)
  pl(g, F('#4a2e18'), 1.1, 2.3, 0.12, -1.6, 0.4, zf + 0.04)
  const poster = canvasMat('wanted', 128, 160, (x, w, h) => {
    x.fillStyle = '#e8d5a0'
    x.fillRect(0, 0, w, h)
    x.strokeStyle = '#8a6a3a'
    x.lineWidth = 6
    x.strokeRect(3, 3, w - 6, h - 6)
    fitText(x, 'WANTED', w / 2, 24, w - 16, 26, { color: '#3a2410' })
    x.fillStyle = '#3a2410'
    x.beginPath()
    x.arc(w / 2, 74, 22, 0, Math.PI * 2)
    x.fill()
    x.fillRect(w / 2 - 34, 96, 68, 22)
    fitText(x, 'REWARD', w / 2, 138, w - 20, 20, { color: '#7a1a0a' })
  })
  face(g, poster, 0.5, 0.62, -0.35, 2.1, zf + 0.01)
  face(g, poster, 0.45, 0.56, -2.8, 2.2, zf + 0.01)
  // Barred front window and a jail window on +X.
  bx(g, trim, 1.8, 1.4, 0.1, 1.6, 2.1, zf + 0.02)
  bx(g, F('#1e1a16'), 1.5, 1.1, 0.12, 1.6, 2.1, zf + 0.04)
  for (let i = 0; i < 4; i++) bx(g, iron, 0.07, 1.1, 0.07, 1.6 + (i - 1.5) * 0.35, 2.1, zf + 0.1)
  bx(g, F('#1e1a16'), 0.12, 0.9, 1.4, W / 2 + 0.02, 2.6, -0.8)
  for (let i = 0; i < 3; i++) bx(g, iron, 0.07, 0.9, 0.07, W / 2 + 0.08, 2.6, -0.8 + (i - 1) * 0.4)
  // Bench and a lamp.
  pl(g, S(WOOD_L), 1.8, 0.12, 0.5, 1.6, 0.85, zf + 0.45)
  for (const s of [-1, 1]) pl(g, S(WOOD_D), 0.12, 0.45, 0.4, 1.6 + s * 0.75, 0.4, zf + 0.45)
  bx(g, F(IRON, 0.5, 0.5), 0.28, 0.12, 0.28, -0.55, 3.15, zf + 0.2)
  bx(g, glowM('#ffcf6a', 2.8), 0.18, 0.24, 0.18, -0.55, 2.97, zf + 0.2)
  return g
}

// Wooden water tower: 4 legs on footings, deck at y 7, 2.5 m-radius tank to
// y 11.5, cone roof to ~13.3 m, ladder on -X. userData.spout = pivot Group at
// (2.5, 7.6, 0) on the tank's +X side; the 2.6 m pipe runs along its local +X
// with a nozzle at the end. rotation.z = 0 horizontal, > 0 raises the end
// (stowed ~0.9), < 0 swings it down towards a cart on the +X side.
export function waterTower() {
  const g = new Group()
  const leg = S(WOOD_D)
  const wood = S(WOOD)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      pl(g, S(STONE_D), 0.8, 0.5, 0.8, sx * 1.8, 0, sz * 1.8)
      pl(g, leg, 0.4, 6.5, 0.4, sx * 1.8, 0.5, sz * 1.8, { cast: true })
    }
  for (const s of [-1, 1]) {
    bx(g, wood, 3.6, 0.2, 0.2, 0, 3.6, s * 1.8)
    bx(g, wood, 0.2, 0.2, 3.6, s * 1.8, 3.6, 0)
    bx(g, wood, 0.15, 5.2, 0.15, 0, 3.7, s * 1.82, { rz: 0.6 })
    bx(g, wood, 0.15, 5.2, 0.15, s * 1.82, 3.7, 0, { rx: 0.6 })
  }
  pl(g, S('#9a6a3c'), 5.0, 0.3, 5.0, 0, 7.0, 0, { cast: true })
  cy(g, F('#8a5a32', 0.85), 2.5, 4.2, 0, 9.4, 0, 'y', 14, { cast: true })
  for (const hy of [7.9, 9.4, 10.9]) cy(g, F(IRON, 0.5, 0.5), 2.56, 0.14, 0, hy, 0, 'y', 14)
  cone(g, F('#5d636e'), 2.9, 1.6, 0, 11.5, 0, 14, { cast: true })
  sph(g, F('#c8322b'), 0.22, 0, 13.15, 0)
  // Ladder up the -X side.
  for (const s of [-1, 1]) pl(g, F(WOOD_L), 0.08, 11.2, 0.08, -2.62, 0.3, s * 0.3)
  for (let i = 0; i < 4; i++) bx(g, F(WOOD_L), 0.08, 0.06, 0.6, -2.62, 8 + i * 0.9, 0)
  // Spout.
  const spout = new Group()
  spout.position.set(2.5, 7.6, 0)
  g.add(spout)
  cy(spout, F(IRON, 0.5, 0.5), 0.3, 0.5, 0, 0, 0, 'z', 10)
  bx(spout, F('#4a4f57', 0.5, 0.5), 2.6, 0.32, 0.32, 1.3, 0, 0)
  bx(spout, F('#4a4f57', 0.5, 0.5), 0.36, 0.6, 0.36, 2.48, -0.3, 0)
  g.userData.spout = spout
  return g
}

// Rail fence along local X from 0 to `length`, posts every ~3 m and an old wagon
// wheel (r 0.62, in the XY plane) set into each bay. ~1.6 m tall.
export function wagonWheelFence(length = 12) {
  const g = new Group()
  const n = Math.max(1, Math.round(length / 3))
  const sp = length / n
  const post = S(WOOD_D)
  for (let i = 0; i <= n; i++) pl(g, post, 0.3, 1.6, 0.3, i * sp, 0, 0)
  const rail = S(WOOD)
  bx(g, rail, length, 0.18, 0.12, length / 2, 1.45, 0.05)
  bx(g, rail, length, 0.18, 0.12, length / 2, 0.25, 0.05)
  const tyre = F('#4a3a2a', 0.8)
  const spoke = F(WOOD_L, 0.8)
  const hub = F(IRON, 0.5, 0.5)
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * sp
    mesh(g, torusGeo(0.62, 0.08, 6, 16), tyre, x, 0.85, -0.05, { cast: true })
    for (let k = 0; k < 4; k++) bx(g, spoke, 1.2, 0.07, 0.06, x, 0.85, -0.05, { rz: (k * Math.PI) / 4 })
    cy(g, hub, 0.13, 0.2, x, 0.85, -0.05, 'z', 8)
  }
  return g
}

// Saguaro cactus, 4-7 m, with 1-3 bent arms and ribbing; sometimes a pink bloom.
export function cactusTall(rand) {
  rand = rng(rand)
  const g = new Group()
  const H = q(4 + rand() * 3)
  const green = S('#3f8f3a')
  const dark = S('#2f7230')
  pl(g, green, 0.9, H, 0.9, 0, 0, 0, { cast: true })
  pl(g, dark, 1.04, H - 0.4, 0.5, 0, 0, 0)
  pl(g, dark, 0.5, H - 0.4, 1.04, 0, 0, 0)
  pl(g, S('#58a84a'), 0.6, 0.3, 0.6, 0, H, 0)
  const n = 1 + Math.floor(rand() * 2.6)
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  const start = Math.floor(rand() * 4)
  for (let k = 0; k < n; k++) {
    const [dx, dz] = dirs[(start + k * 2 + (k > 1 ? 1 : 0)) % 4]
    const y0 = q(H * (0.3 + rand() * 0.3))
    const L = q(0.8 + rand() * 0.6)
    const U = Math.min(q(1.2 + rand() * 1.6), H - y0 - 0.2)
    const ex = 0.45 + L
    bx(g, green, dx ? L + 0.3 : 0.6, 0.6, dz ? L + 0.3 : 0.6, dx * (0.3 + L / 2), y0 + 0.3, dz * (0.3 + L / 2), { cast: true })
    pl(g, green, 0.6, Math.max(0.5, U), 0.6, dx * (ex - 0.3), y0, dz * (ex - 0.3), { cast: true })
  }
  if (rand() < 0.5) pl(g, S('#ff6fa8'), 0.35, 0.25, 0.35, 0, H + 0.3, 0)
  return g
}

// Hitching rail (2.6 m along X) with iron rings, a saddle blanket and a small trough.
export function hitchingPost() {
  const g = new Group()
  const post = S(WOOD_D)
  for (const s of [-1, 1]) pl(g, post, 0.25, 1.25, 0.25, s * 1.2, 0, 0)
  bx(g, S(WOOD), 2.8, 0.18, 0.18, 0, 1.12, 0)
  const ring = F(IRON, 0.5, 0.5)
  for (const x of [-0.5, 0.5]) mesh(g, torusGeo(0.1, 0.025, 4, 10), ring, x, 0.95, 0.1)
  bx(g, S('#c8322b'), 0.7, 0.5, 0.24, 0.6, 0.95, 0)
  pl(g, S(WOOD), 1.6, 0.45, 0.6, -0.2, 0, 0.75)
  bx(g, F('#4f7fb0', 0.15, 0.1), 1.4, 0.04, 0.42, -0.2, 0.43, 0.75)
  return g
}

// Stack of 4-6 oak barrels with iron hoops (barrel 0.84 m wide, 1 m tall):
// a pyramid, or a row with one lying in front.
export function barrelStack(rand) {
  rand = rng(rand)
  const g = new Group()
  const body = F('#9a6a3c', 0.8)
  const hoop = F(IRON, 0.5, 0.5)
  const lid = F('#7a5030', 0.8)
  const upright = (x, y, z) => {
    cy(g, body, 0.42, 1.0, x, y + 0.5, z, 'y', 12, { cast: true })
    for (const hy of [0.2, 0.8]) cy(g, hoop, 0.44, 0.07, x, y + hy, z, 'y', 12)
    cy(g, lid, 0.36, 0.03, x, y + 1.0, z, 'y', 12)
  }
  if (rand() < 0.5) {
    upright(-0.45, 0, -0.3)
    upright(0.45, 0, -0.3)
    upright(0, 0, 0.45)
    upright(0, 1.0, 0)
    if (rand() < 0.5) upright(1.3, 0, 0.5)
  } else {
    const n = 3 + Math.floor(rand() * 2)
    for (let i = 0; i < n; i++) upright((i - (n - 1) / 2) * 0.9, 0, -0.2)
    cy(g, body, 0.42, 1.0, 0.2, 0.42, 0.85, 'x', 12, { cast: true })
    for (const hx of [-0.1, 0.5]) cy(g, hoop, 0.44, 0.07, hx, 0.42, 0.85, 'x', 12)
  }
  return g
}

// ============================================================================================
// ASHFALL VOLCANO
// ============================================================================================

// Huge stepped volcanic cone: base "radius" ~radius (each tier is two crossed
// square blocks, an 8-point star 0.75 * r to the faces / 1.06 * r to the points;
// the 45-degree block a little lower so each tier shows a terrace), height
// ~height to the crater rim (+ ~0.6 tier for the rim). A lava pool glows inside
// the crater, the front (+Z) lip is broken, glowing cracks run down the top
// tiers. Base centre origin. ~35 meshes; bake it.
export function volcanoCone(radius = 80, height = 60, rand) {
  rand = rng(rand)
  const g = new Group()
  const R = radius
  const n = Math.min(10, Math.max(5, Math.round(height / 8)))
  const lh = q(height / n)
  const rocks = VROCK.map(S)
  const hot = [S('#4f3530'), S('#5c3a2e')]
  const tiers = []
  for (let i = 0; i < n; i++) {
    const f = 1 - (i / n) * 0.8
    const s = q(R * f * (0.94 + rand() * 0.08) * 1.5)
    const ox = q((rand() - 0.5) * R * 0.03)
    const oz = q((rand() - 0.5) * R * 0.03)
    const y = i * lh
    const m = i >= n - 2 ? hot[i % 2] : rocks[i % 3]
    pl(g, m, s, lh, s, ox, y, oz, { cast: i < 3 })
    pl(g, i >= n - 2 ? hot[(i + 1) % 2] : rocks[(i + 1) % 3], s, q(lh * 0.85), s, ox, y, oz, { ry: Math.PI / 4, cast: i < 3 })
    tiers.push({ s, ox, oz, y })
  }
  // Crater rim (front side broken low) and the lava inside.
  const T = tiers[n - 1]
  const Y = n * lh
  const sr = q(T.s * 0.9)
  const t = q(sr * 0.24)
  const rh = q(lh * 0.6)
  const rim = S('#3d3332')
  pl(g, rim, sr, rh, t, T.ox, Y, T.oz - (sr / 2 - t / 2))
  pl(g, rim, sr, q(rh * 0.4), t, T.ox, Y, T.oz + (sr / 2 - t / 2))
  for (const s of [-1, 1]) pl(g, rim, t, rh, sr - 2 * t, T.ox + s * (sr / 2 - t / 2), Y, T.oz)
  const lava = glowM('#ff7a1a', 3)
  bx(g, lava, sr - 2 * t, 0.3, sr - 2 * t, T.ox, Y + 0.15, T.oz)
  // Glowing cracks on the faces of the top three tiers. Each square's face
  // centre is buried in the other square's point, so cracks sit off-centre
  // (|u| = 0.33 s along the face, where the face is exposed).
  const crack = glowM('#ff5a12', 3.2)
  const cw = Math.max(0.6, R * 0.012)
  const crackAt = (tr, a, u, w, hh, y0) => {
    const d = tr.s / 2 + 0.05
    bx(g, crack, w, hh, 0.3, tr.ox + Math.cos(a) * d - Math.sin(a) * u, y0 + hh / 2, tr.oz + Math.sin(a) * d + Math.cos(a) * u, { ry: Math.PI / 2 - a })
  }
  for (let k = 0; k < 8; k++) {
    const tr = tiers[n - 1 - (k % 3)]
    const a = (Math.floor(rand() * 8) * Math.PI) / 4
    crackAt(tr, a, (rand() < 0.5 ? -0.33 : 0.33) * tr.s, cw, q(lh * (k % 2 ? 0.75 : 0.6)), tr.y + 0.05)
  }
  // A lava spill down from the broken lip (front, +Z).
  crackAt(T, Math.PI / 2, 0.3 * T.s, cw * 1.6, q(lh * 0.8), T.y + 0.05)
  // Boulders round the foot.
  const s0 = tiers[0].s
  for (let k = 0; k < 3; k++) {
    const a = rand() * Math.PI * 2
    const bs = q(R * (0.05 + rand() * 0.04))
    pl(g, rocks[k % 3], bs, q(bs * 0.7), bs, q(Math.cos(a) * s0 * 0.62), 0, q(Math.sin(a) * s0 * 0.62), { ry: rand() * Math.PI })
  }
  return g
}

// Flat glowing lava pool w (X) x d (Z), top at y 0, centre origin. A single
// Mesh (own MeshStandardMaterial, emissive orange, emissiveMap = the lava map).
// userData.tex = its own CanvasTexture (RepeatWrapping; one tile = 6 m):
// scroll tex.offset to make it flow. userData.mat = the material.
export function lavaPool(w = 10, d = 10) {
  const c = surfCanvas('lava', 128, (x, size, r) => {
    x.fillStyle = '#d8380c'
    x.fillRect(0, 0, size, size)
    for (let i = 0; i < 26; i++) {
      x.fillStyle = r() < 0.5 ? '#ff8a1a' : '#ffb02a'
      wrapRect(x, size, Math.floor(r() * 16) * 8, Math.floor(r() * 16) * 8, 8 + Math.floor(r() * 3) * 8, 8 + Math.floor(r() * 2) * 8)
    }
    for (let i = 0; i < 12; i++) {
      x.fillStyle = '#ffe36a'
      wrapRect(x, size, Math.floor(r() * 32) * 4, Math.floor(r() * 32) * 4, 4 + Math.floor(r() * 2) * 4, 4)
    }
    for (let i = 0; i < 14; i++) {
      x.fillStyle = r() < 0.5 ? '#4a1408' : '#6a1e0a'
      wrapRect(x, size, Math.floor(r() * 16) * 8, Math.floor(r() * 16) * 8, 8 + Math.floor(r() * 2) * 8, 8)
    }
  })
  const tex = scrollTex(c)
  const m = new MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ff8a3a', emissiveIntensity: 2.2, roughness: 0.6 })
  const me = new Mesh(flatPlane(w, d, 6), m)
  me.userData.tex = tex
  me.userData.mat = m
  return me
}

// Rock vent beside the track (~3.2 x 2 x 3 m) with a glowing mouth at y 2.
// userData.jet = Group at the mouth (0, 2, 0): three nested additive cones
// (shared neon materials), ~6 m tall at scale 1, growing up its local +Y.
// Scale jet.scale.y (and .visible) to fire it.
export function fireVent() {
  const g = new Group()
  const rocks = VROCK.map(S)
  pl(g, rocks[0], 3.2, 0.8, 3.0, 0, 0, 0, { cast: true })
  pl(g, rocks[1], 2.4, 0.7, 2.2, 0.1, 0.8, -0.1, { ry: 0.3, cast: true })
  pl(g, rocks[2], 1.6, 0.5, 1.6, 0, 1.5, 0)
  pl(g, rocks[1], 1.2, 0.6, 1.0, 1.6, 0, 0.9, { ry: 0.5 })
  pl(g, rocks[2], 0.9, 0.5, 0.9, -1.5, 0, -0.9, { ry: 0.2 })
  const sulfur = S('#d8c04a')
  pl(g, sulfur, 0.7, 0.1, 0.5, 0.9, 0.8, 0.7)
  pl(g, sulfur, 0.5, 0.1, 0.6, -0.8, 0.8, 0.5)
  bx(g, glowM('#ff7a1a', 3), 0.9, 0.1, 0.9, 0, 2.02, 0)
  const ember = glowM('#ff5a12', 3)
  bx(g, ember, 0.12, 0.6, 0.06, 0.4, 1.2, 1.08, { rz: 0.3 })
  bx(g, ember, 0.06, 0.5, 0.12, 1.22, 1.15, -0.3, { rx: 0.4 })
  const jet = new Group()
  jet.position.set(0, 2.0, 0)
  g.add(jet)
  cone(jet, flameM('#ff6a1a', 3), 0.75, 6, 0, 0, 0, 10)
  cone(jet, flameM('#ffb02a', 3), 0.48, 4.5, 0, 0, 0, 10)
  cone(jet, flameM('#fff1a0', 2.5), 0.24, 3, 0, 0, 0, 8)
  g.userData.jet = jet
  return g
}

// Crusty sulphur-and-mineral vent (~4 x 1 x 3.6 m) with a dark mouth at y 1.0.
// userData.plume = Group at the mouth (0, 1.0, 0): a stack of soft white
// see-through steam blocks ~9 m tall; scale / show it to puff.
export function geyserVent() {
  const g = new Group()
  pl(g, S('#d9cfa8'), 4.0, 0.3, 3.6, 0, 0, 0, { cast: true })
  pl(g, S('#e6d9a0'), 3.0, 0.35, 2.8, 0.1, 0.3, 0)
  pl(g, S('#cbb27a'), 2.0, 0.35, 1.9, 0, 0.65, 0.05)
  const yel = S('#e8cf3a')
  for (const [x, z] of [
    [-0.7, 0],
    [0.7, 0],
    [0, -0.65],
    [0, 0.65],
  ])
    pl(g, yel, 0.5, 0.25, 0.5, x, 1.0, z)
  bx(g, F('#2a2620'), 0.8, 0.05, 0.8, 0, 1.01, 0)
  bx(g, mat('#5fd0c8', 0.1, 0.1, { emissive: '#2a8a80', emissiveIntensity: 0.6 }), 0.6, 0.06, 0.6, 0, 1.02, 0)
  pl(g, S('#d9822b'), 0.6, 0.3, 0.5, 1.5, 0, 1.2)
  pl(g, S(WHITE), 0.5, 0.25, 0.6, -1.4, 0.3, -0.9)
  pl(g, S('#d9822b'), 0.4, 0.2, 0.4, -1.6, 0, 1.3)
  const plume = new Group()
  plume.position.set(0, 1.0, 0)
  g.add(plume)
  const steam = mat('#f2f6fa', 0.9, 0, { transparent: true, opacity: 0.55, depthWrite: false })
  ;[
    [0.45, 2.0, 1.0],
    [0.7, 2.5, 3.2],
    [1.0, 2.5, 5.5],
    [1.3, 2.0, 7.7],
  ].forEach(([r, h, y], i) => {
    const b = bx(plume, steam, 1, 1, 1, 0, y, 0, { ry: i * 0.4 })
    b.scale.set(r * 2, h, r * 2)
  })
  g.userData.plume = plume
  return g
}

// Charcoal rock cluster, ~1.5-3 m wide at scale 1, ash-dusted top, sometimes a
// glowing ember crack.
export function ashRock(scale = 1, rand) {
  rand = rng(rand)
  const g = new Group()
  const s = scale
  const ms = ['#4a4446', '#3d3839', '#575152'].map(S)
  const n = 2 + Math.floor(rand() * 3)
  let main = null
  for (let i = 0; i < n; i++) {
    const f = i === 0 ? 1 : 0.5 + rand() * 0.3
    const w = q((1.5 + rand() * 1.5) * s * f)
    const h = q((0.9 + rand() * 0.9) * s * f)
    const d = q((1.2 + rand() * 1.2) * s * f)
    const x = i ? q5((rand() - 0.5) * 1.6 * s) : 0
    const z = i ? q5((rand() - 0.5) * 1.6 * s) : 0
    const ry = (rand() - 0.5) * 0.8
    pl(g, ms[i % 3], w, h, d, x, 0, z, { ry, cast: i === 0 })
    if (i === 0) main = { w, h, d, ry }
  }
  pl(g, S('#9a9592'), q(main.w * 0.75), 0.12, q(main.d * 0.75), 0, main.h, 0, { ry: main.ry })
  if (rand() < 0.35) bx(g, glowM('#ff5a12', 3), 0.1, q5(main.h * 0.7), 0.05, 0, main.h * 0.4, 0, { ry: main.ry })
  return g
}

// Glossy black obsidian shards (2-4, the tallest 3-5 m) on a rubble base,
// faceted, with a faint purple sheen.
export function obsidianSpike(rand) {
  rand = rng(rand)
  const g = new Group()
  const body = mat('#1d1726', 0.12, 0.4, { flatShading: true })
  const tip = mat('#3a2a55', 0.1, 0.4, { flatShading: true, emissive: '#6a3aa8', emissiveIntensity: 0.35 })
  pl(g, S(VROCK[0]), q(1.6 + rand() * 0.8), 0.4, q(1.4 + rand() * 0.8), 0, 0, 0)
  pl(g, S(VROCK[2]), 0.75, 0.35, 0.75, q5(0.9 * (rand() - 0.5) * 2), 0.0, q5(0.8 * (rand() - 0.5) * 2))
  crystal(g, body, tip, 0.45, 3 + rand() * 2, 0, 0.2, 0, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2, 5)
  const n = 1 + Math.floor(rand() * 3)
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2
    const tilt = 0.35 + rand() * 0.4
    crystal(g, body, tip, 0.22 + rand() * 0.15, 1.2 + rand() * 1.6, Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5, Math.sin(a) * tilt, -Math.cos(a) * tilt, 5)
  }
  return g
}

// ============================================================================================
// LAVA TUBES
// ============================================================================================

// One ring segment of a lava-tube interior: dark basalt blocks set round a
// round bore of `radius`, open along Z, 4 m deep (floor exactly z -2..2, wall
// blocks overlap a little: repeat every 4 m along a path). ORIGIN = the centre
// of the flat floor (track bed, y 0); bore centre at (0, 0.6 * radius, 0), so
// the floor is ~1.6 * radius wide and the crown is at ~1.6 * radius (a low
// basalt foot along each side cuts the clear width at floor level to ~1.6r - 0.6).
// 2-3 glowing magma veins + a little stalactite. Optional rand.
export function lavaTubeRing(radius = 4, rand) {
  rand = rng(rand)
  const g = new Group()
  const R = radius
  const c0 = R * 0.6
  const t = q(Math.max(1.2, R * 0.35))
  const N = 12
  const D = 4
  const half = Math.sqrt(R * R - c0 * c0)
  const ms = BASALT.map(S)
  pl(g, S('#2a2627'), q(2 * (half + t)), 0.6, D, 0, -0.6, 0)
  for (const s of [-1, 1]) pl(g, ms[1], t, q(R * 0.3), D, s * (half - 0.3 + t / 2), 0, 0)
  const L = q5((((2 * Math.PI * (R + t / 2)) / N) * 1.14))
  const kept = []
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2
    if (c0 + Math.sin(a) * R < -0.15 * R) continue
    const rr = R + t / 2 + rand() * 0.3
    bx(g, pick(rand, ms), L, t, q5(D + 0.3 + rand() * 0.3), Math.cos(a) * rr, c0 + Math.sin(a) * rr, (rand() - 0.5) * 0.2, { rz: a - Math.PI / 2 })
    kept.push({ a, ri: rr - t / 2 })
  }
  const vein = glowM('#ff6a1a', 3)
  const nv = 2 + (rand() < 0.5 ? 1 : 0)
  for (let i = 0; i < nv; i++) {
    const { a, ri } = kept[Math.floor(rand() * kept.length)]
    const along = i % 2 === 0
    bx(g, vein, along ? 0.16 : q5(L * 0.6), 0.08, along ? q5(D * (0.4 + rand() * 0.4)) : 0.16, Math.cos(a) * ri, c0 + Math.sin(a) * ri, q5((rand() - 0.5) * 2), { rz: a - Math.PI / 2 })
  }
  const top = c0 + R + 0.2
  const st = mesh(g, coneGeo(6), F(BASALT[0], 0.8), 0.4, top - 0.55, 0.6, { rx: Math.PI })
  st.scale.set(0.35, 1.1, 0.35)
  bx(g, glowM('#ffb02a', 3), 0.1, 0.12, 0.1, 0.4, top - 1.14, 0.6)
  return g
}

// Glowing magma drop (~0.36 m wide, ~0.7 m tall), CENTRE origin, pointy end up.
export function magmaDrip() {
  const g = new Group()
  const b = sph(g, glowM('#ff6a1a', 3), 0.18, 0, -0.08, 0)
  b.scale.set(0.18, 0.22, 0.18)
  cone(g, glowM('#ffb02a', 3), 0.13, 0.4, 0, 0.0, 0, 8)
  return g
}

// ============================================================================================
// CRYSTAL CAVERNS
// ============================================================================================

// Clump of 5-8 glowing faceted crystals (the main one ~3.2 m at scale 1) on a
// cave-rock base. color = crystal colour (hex).
export function crystalCluster(scale = 1, color = '#5ff3ff', rand) {
  rand = rng(rand)
  const g = new Group()
  const s = scale
  const body = mat(color, 0.15, 0.1, { emissive: color, emissiveIntensity: 0.9, flatShading: true })
  const tip = glowM(mixHex(color, '#ffffff', 0.35), 3)
  pl(g, S(pick(rand, CAVE)), q(1.8 * s), q(0.5 * s), q(1.6 * s), 0, 0, 0, { cast: true })
  pl(g, S(pick(rand, CAVE)), q(0.9 * s), q(0.4 * s), q(0.9 * s), q5(0.7 * s), 0, q5(-0.5 * s), { ry: 0.4 })
  crystal(g, body, tip, 0.35 * s, (2.6 + rand() * 1.2) * s, 0, 0.3 * s, 0, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2)
  const n = 4 + Math.floor(rand() * 4)
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.6
    const tilt = 0.3 + rand() * 0.45
    const d = (0.35 + rand() * 0.35) * s
    crystal(g, body, tip, (0.12 + rand() * 0.16) * s, (0.9 + rand() * 1.6) * s, Math.cos(a) * d, 0.25 * s, Math.sin(a) * d, Math.sin(a) * tilt, -Math.cos(a) * tilt)
  }
  return g
}

// Singing crystal: ~4.2 m crystal + two small ones on a rune pedestal (top of
// the big crystal ~5.2 m). userData.glowMat = this crystal's own emissive
// material (all three crystals): flash its emissiveIntensity (rest 0.6, ~3 on a
// chime). userData.tipY = height of the big tip.
export function chimeCrystal(color = '#7af0ff') {
  const g = new Group()
  const glowMat = own(new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1, flatShading: true }))
  pl(g, S('#4a4560'), 2.2, 0.5, 2.2, 0, 0, 0, { cast: true })
  pl(g, S('#5a5470'), 1.6, 0.5, 1.6, 0, 0.5, 0)
  const rune = glowM(mixHex(color, '#ffffff', 0.3), 2.5)
  for (const s of [-1, 1]) {
    bx(g, rune, 0.9, 0.12, 0.04, 0, 0.25, s * 1.11)
    bx(g, rune, 0.04, 0.12, 0.9, s * 1.11, 0.25, 0)
  }
  crystal(g, glowMat, glowMat, 0.45, 4.2, 0, 1.0, 0)
  crystal(g, glowMat, glowMat, 0.2, 1.5, 0.45, 1.0, 0.25, 0.3, -0.5)
  crystal(g, glowMat, glowMat, 0.16, 1.1, -0.4, 1.0, -0.3, -0.35, 0.55)
  g.userData.glowMat = glowMat
  g.userData.tipY = 5.2
  return g
}

// Stalagmite rising to meet a stalactite: a cave column from the floor (y 0)
// to the ceiling (y = height), tapering to a waist, with a couple of glints.
export function caveColumn(height = 8, rand) {
  rand = rng(rand)
  const g = new Group()
  const H = height
  const w0 = q(1.8 + rand() * 0.6)
  const lh = q(H * 0.14)
  const ms = CAVE.map(S)
  pl(g, ms[0], q(w0 * 1.3), 0.3, q(w0 * 1.3), 0, 0, 0)
  pl(g, ms[0], q(w0 * 1.3), 0.3, q(w0 * 1.3), 0, H - 0.3, 0)
  let yb = 0.3
  let yt = H - 0.3
  for (let i = 0; i < 3; i++) {
    const w = q(w0 * (1 - i * 0.26))
    const ry = i % 2 ? Math.PI / 4 : 0
    pl(g, ms[(i + 1) % 3], w, lh, w, 0, yb, 0, { ry, cast: i === 0 })
    pl(g, ms[i % 3], w, lh, w, 0, yt - lh, 0, { ry: ry + 0.3 })
    yb += lh
    yt -= lh
  }
  if (yt > yb) pl(g, ms[1], q(w0 * 0.34), yt - yb, q(w0 * 0.34), 0, yb, 0)
  const glint = glowM(rand() < 0.5 ? '#7af0ff' : '#d58cff', 3)
  bx(g, glint, 0.18, 0.4, 0.18, q5(w0 * 0.55), 0.6, 0.2, { rz: -0.4 })
  bx(g, glint, 0.14, 0.3, 0.14, -0.2, H - 0.9, q5(w0 * 0.55), { rx: -0.5 })
  return g
}

// 1-3 glowing cave mushrooms (0.6-1.8 m), emissive caps with neon gills.
export function glowMushroom(rand) {
  rand = rng(rand)
  const g = new Group()
  const stem = F('#e8e0f0', 0.8)
  const n = 1 + Math.floor(rand() * 3)
  for (let i = 0; i < n; i++) {
    const c = pick(rand, ['#3ff0d0', '#b46cff', '#4fb0ff', '#ff6fd8'])
    const capMat = mat(c, 0.4, 0, { emissive: c, emissiveIntensity: 1.0 })
    const h = q5(i === 0 ? 1.2 + rand() * 0.6 : 0.5 + rand() * 0.5)
    const r = q5(0.1 + h * 0.08)
    const x = i ? q5((rand() - 0.5) * 1.4) : 0
    const z = i ? q5((rand() - 0.5) * 1.4) : 0
    const cr = q5(h * 0.45)
    cy(g, stem, r, h, x, h / 2, z, 'y', 8)
    cy(g, glowM(mixHex(c, '#ffffff', 0.4), 2.5), cr * 0.9, 0.05, x, h, z, 'y', 10)
    cy(g, capMat, cr, q5(h * 0.16), x, h + q5(h * 0.08), z, 'y', 10, { cast: i === 0 })
    cy(g, capMat, cr * 0.6, q5(h * 0.12), x, h + q5(h * 0.2), z, 'y', 10)
  }
  return g
}

// ============================================================================================
// EMERALD JUNGLE
// ============================================================================================

// Tall buttressed rainforest tree, 14-20 m at scale 1, broad flat canopy and
// hanging vines (12 meshes).
export function jungleTree(scale = 1, rand) {
  rand = rng(rand)
  const g = new Group()
  const s = scale
  const H = (14 + rand() * 6) * s
  const th = q(H * 0.78)
  const bark = S('#7a5a3a')
  pl(g, bark, q(1.2 * s), th, q(1.2 * s), 0, 0, 0, { cast: true })
  pl(g, S(BARK), q(1.8 * s), q(0.6 * s), q(1.8 * s), 0, 0, 0)
  for (let k = 0; k < 3; k++) {
    const piv = new Group()
    piv.rotation.y = (k / 3) * Math.PI * 2 + rand()
    g.add(piv)
    bx(piv, bark, q(2.4 * s), q(1.0 * s), q5(0.3 * s), q5(1.1 * s), q5(0.8 * s), 0, { rz: -0.7 })
  }
  const c0 = pick(rand, ['#2f8a2a', '#2a7d34', '#3a9a2e'])
  const c1 = mixHex(c0, '#ffffff', 0.12)
  const c2 = mixHex(c0, '#0b2a10', 0.25)
  pl(g, S(c0), q(9 * s), q(2.2 * s), q(8.5 * s), 0, th, 0, { cast: true })
  pl(g, S(c1), q(6.5 * s), q(1.8 * s), q(6 * s), q5((rand() - 0.5) * s), th + q(2.2 * s), q5((rand() - 0.5) * s), { cast: true })
  for (const sx of [-1, 1]) pl(g, S(c2), q(3.5 * s), q(2.2 * s), q(3.5 * s), sx * q(3.8 * s), th - q(0.6 * s), q5((rand() - 0.5) * 3 * s))
  const vine = S('#2f7a2a')
  for (let k = 0; k < 3; k++) {
    const len = q((4 + rand() * 4) * s)
    const a = rand() * Math.PI * 2
    bx(g, vine, 0.15, len, 0.15, q5(Math.cos(a) * 3.6 * s), th - len / 2, q5(Math.sin(a) * 3.4 * s))
  }
  return g
}

// Leaning coconut palm, 7-10 m at scale 1: stepped ringed trunk, crown of six
// drooping fronds, coconuts (12 meshes).
export function palmTree(scale = 1, rand) {
  rand = rng(rand)
  const g = new Group()
  const s = scale
  const H = (7 + rand() * 3) * s
  const a = rand() * Math.PI * 2
  const lean = (0.12 + rand() * 0.12) * H
  const segs = 4
  const sh = q5(H / segs + 0.1)
  for (let i = 0; i < segs; i++) {
    const w = q5((0.75 - i * 0.06) * s)
    const off = lean * ((i + 0.5) / segs) ** 2
    pl(g, S(i % 2 ? '#8f6c40' : '#a5814f'), w, sh, w, q5(Math.cos(a) * off), (i * H) / segs, q5(Math.sin(a) * off), { cast: i === 0 })
  }
  const tx = q5(Math.cos(a) * lean * 0.77)
  const tz = q5(Math.sin(a) * lean * 0.77)
  pl(g, S('#6b4a1f'), q5(0.8 * s), q5(0.5 * s), q5(0.8 * s), tx, H - 0.3 * s, tz)
  pl(g, S('#3f9a3a'), q5(0.9 * s), q5(0.5 * s), q5(0.9 * s), tx, H + 0.15 * s, tz)
  const greens = [S('#3fa23a'), S('#2f8a32')]
  const len = q5(3.4 * s)
  for (let k = 0; k < 6; k++) {
    const piv = new Group()
    piv.position.set(tx, H + 0.4 * s, tz)
    piv.rotation.y = (k * Math.PI) / 3 + rand() * 0.3
    g.add(piv)
    const d = 0.35 + rand() * 0.25
    bx(piv, greens[k % 2], len, q5(0.1 * s), q5(0.9 * s), (len / 2) * Math.cos(d), (-len / 2) * Math.sin(d), 0, { rz: -d, cast: true })
  }
  return g
}

// Ground fern: 6 rising fronds round a small clump, ~1.2 m across (7 meshes).
export function fern(rand) {
  rand = rng(rand)
  const g = new Group()
  const greens = [S('#3c9a34'), S('#2e8a2e')]
  pl(g, greens[1], 0.35, 0.25, 0.35, 0, 0, 0)
  for (let k = 0; k < 6; k++) {
    const piv = new Group()
    piv.position.y = 0.12
    piv.rotation.y = (k * Math.PI) / 3 + rand() * 0.4
    g.add(piv)
    const len = q5(0.9 + rand() * 0.6)
    const r = 0.45 + rand() * 0.35
    bx(piv, greens[k % 2], len, 0.05, 0.32, (len / 2) * Math.cos(r), (len / 2) * Math.sin(r), 0, { rz: r })
  }
  return g
}

// Vines hanging from a branch stub at y = length down to y 0 (the longest
// strand touches 0), three strands with leaves and a flower, ~1.8 m wide on X.
export function hangingVines(length = 6) {
  const g = new Group()
  const L = length
  bx(g, S('#5a4428'), 1.8, 0.25, 0.3, 0, L, 0)
  const vine = S('#2f7a2a')
  const leaf = S('#3fa23a')
  ;[
    [-0.6, 1.0, 0.05],
    [0.05, 0.72, -0.05],
    [0.6, 0.86, 0.02],
  ].forEach(([x, f, z], i) => {
    const len = i === 0 ? L : q5(L * f)
    bx(g, vine, 0.12, len, 0.12, x, L - len / 2, z)
    for (const t of [0.35, 0.75]) bx(g, leaf, 0.36, 0.24, 0.12, x + (i % 2 ? -0.16 : 0.16), L - len * t, z + 0.02, { rz: i % 2 ? 0.4 : -0.4 })
  })
  pl(g, S('#ff3d6e'), 0.25, 0.2, 0.25, 0.05, L - q5(L * 0.72) - 0.1, -0.05)
  return g
}

// Rope-and-plank bridge deck carrying two rails, along local -Z from 0 to
// -length. Deck top y 0, 3.4 m wide, rails at x = +-0.75 with rail tops at
// y 0.36, log stringers below (to y ~-0.5). userData.ropes = Group of the four
// end posts (y -0.6..1.8), sagging hand ropes (1.6 m at the posts, ~0.5 m lower
// mid-span) and the suspender ropes. The whole Group is meant to be rocked
// with rotation.z about the deck centre line. ~3 meshes per metre: bake it.
export function ropeBridgeSpan(length = 24) {
  const L = length
  const g = new Group()
  const W = 3.4
  const dark = F(WOOD_D)
  for (const s of [-1, 1]) bx(g, dark, 0.3, 0.3, L, s * 1.3, -0.35, -L / 2, { cast: true })
  const n = Math.max(2, Math.round(L / 1.0))
  const pw = L / n
  const planks = [S('#9a6a3c'), S('#86592f')]
  for (let i = 0; i < n; i++) bx(g, planks[i % 2], W, 0.18, pw - 0.12, 0, -0.09, -(i + 0.5) * pw, { rz: i % 3 === 1 ? 0.012 : 0 })
  const steel = F('#c8d0d8', 0.3, 0.8)
  for (const s of [-1, 1]) {
    bx(g, S(WOOD_D), 0.4, 0.14, L, s * 0.75, 0.07, -L / 2)
    bx(g, steel, 0.1, 0.22, L, s * 0.75, 0.25, -L / 2)
  }
  const ropes = new Group()
  g.add(ropes)
  const rope = F('#c9b37a', 0.9)
  const post = S('#7a5a3a')
  const sag = Math.min(0.6, L * 0.03)
  const yAt = (z) => {
    const t = -z / L
    return 1.6 - sag * 4 * t * (1 - t)
  }
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 0.15)
    for (const z of [0, -L]) pl(ropes, post, 0.35, 2.4, 0.35, x, -0.6, z, { cast: true })
    const m = 6
    for (let j = 0; j < m; j++) {
      const z0 = (-j * L) / m
      const z1 = (-(j + 1) * L) / m
      rod(ropes, rope, 0.05, [x, yAt(z0), z0], [x, yAt(z1), z1])
    }
    const k = Math.max(1, Math.round(L / 2.4))
    for (let j = 1; j < k; j++) {
      const z = (-j * L) / k
      const h = yAt(z)
      cy(ropes, rope, 0.03, h, x, h / 2, z, 'y', 4)
    }
  }
  g.userData.ropes = ropes
  return g
}

// Big tropical flower (~1-1.6 m): stem, two leaves, five tilted petals.
export function jungleFlower(rand) {
  rand = rng(rand)
  const g = new Group()
  const h = q5(0.6 + rand() * 0.8)
  pl(g, S('#3a8a2a'), 0.12, h, 0.12, 0, 0, 0)
  for (const s of [-1, 1]) bx(g, S('#3c9a34'), 0.7, 0.06, 0.3, s * 0.35, h * 0.4, 0, { rz: s * 0.4 })
  const petal = S(pick(rand, ['#ff3d6e', '#ff8a1c', '#ffd21f', '#c94dff', '#ff5fd0']))
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    bx(g, petal, 0.5, 0.08, 0.28, Math.cos(a) * 0.28, h + 0.08, Math.sin(a) * 0.28, { ry: -a, rz: 0.35 })
  }
  pl(g, S('#ffe14a'), 0.2, 0.15, 0.2, 0, h, 0)
  return g
}

// ============================================================================================
// LOST TEMPLE
// ============================================================================================

// Mossy carved stone wall along local X from 0 to `length`, base y 0, `height`
// tall, 1.6 m thick (z -0.8..0.8), front +Z: block courses, carved glyph tiles
// on the middle course, moss on top and hanging down the front. ~2 meshes per
// metre: bake it.
export function templeWall(length = 20, height = 6, rand) {
  rand = rng(rand)
  const g = new Group()
  const ms = TEMPLE.map(S)
  const courses = Math.max(2, Math.round(height / 1.6))
  const ch = height / courses
  for (let ci = 0; ci < courses; ci++) {
    let x = 0
    let first = ci % 2 === 1
    const topC = ci === courses - 1
    while (x < length - 0.05) {
      let L = first ? q5(0.8 + rand() * 0.6) : q5(1.8 + rand() * 1.6)
      first = false
      if (x + L > length) L = q5(length - x)
      if (L < 0.1) break
      if (!(topC && rand() < 0.12)) bx(g, pick(rand, ms), Math.max(0.05, L - 0.05), ch - 0.04, q5(1.6 + (rand() - 0.5) * 0.1), x + L / 2, ci * ch + ch / 2, q5((rand() - 0.5) * 0.08), { cast: ci === 0 })
      x += L
    }
  }
  const mid = Math.floor(courses / 2)
  const glyphD = S('#6f6a52')
  const glyphL = S('#b9b294')
  const ng = Math.floor(length / 4)
  for (let i = 0; i < ng; i++) {
    const x = (i + 0.5) * (length / ng)
    const y = mid * ch + ch / 2
    bx(g, glyphD, 0.9, Math.min(0.9, ch * 0.7), 0.1, x, y, 0.84)
    bx(g, glyphL, 0.4, 0.4, 0.14, x, y, 0.86)
  }
  const moss = S(MOSS)
  const moss2 = S(MOSS_D)
  const nm = 1 + Math.floor(length / 7)
  for (let i = 0; i < nm; i++) {
    const w = q(1 + rand() * 2)
    const x = Math.min(length - w / 2, Math.max(w / 2, rand() * length))
    pl(g, moss, w, 0.15, 1.7, x, height, 0)
    const hh = q5(0.6 + rand() * 0.8)
    bx(g, moss2, q(w * 0.7), hh, 0.08, x, height - hh / 2, 0.86)
  }
  return g
}

// Carved stone archway the track passes through: clear width x height opening
// centred on x = 0 from y 0, 3 m deep (z -1.5..1.5), facing +Z. Stacked-block
// pillars with glyph bands, a lintel, a stepped crown with a carved mask (neon
// green eyes), moss and vines. Total width = width + 2 * max(2.2, 0.3 * width),
// top ~height + 4.4.
export function templeGate(width = 7, height = 8) {
  const W = width
  const H = height
  const g = new Group()
  const P = Math.max(2.2, W * 0.3)
  const D = 3
  const ms = TEMPLE.map(S)
  const TW = W + 2 * P
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + P / 2)
    pl(g, ms[3], P + 0.6, 0.6, D + 0.6, x + s * 0.3, 0, 0)
    for (let i = 0; i < 3; i++) pl(g, ms[i % 3], P, (H - 0.6) / 3 - 0.04, D, x, 0.6 + (i * (H - 0.6)) / 3, 0, { cast: true })
    bx(g, S('#6f6a52'), P - 0.4, 0.8, 0.1, x, H * 0.55, D / 2 + 0.04)
    bx(g, S('#c4bc9a'), 0.5, 0.5, 0.14, x, H * 0.55, D / 2 + 0.06)
  }
  pl(g, ms[2], TW + 0.4, 1.2, D + 0.2, 0, H, 0, { cast: true })
  let y = H + 1.2
  ;[0.85, 0.62, 0.4].forEach((f, i) => {
    pl(g, ms[i % 2], q(TW * f), 1.0, D - 0.4 - i * 0.4, 0, y, 0, { cast: i === 0 })
    y += 1.0
  })
  // Carved mask on the crown front.
  const zf = (D - 0.4) / 2
  const mk = S('#7f7a62')
  bx(g, mk, 2.6, 0.35, 0.3, 0, H + 2.75, zf + 0.15)
  for (const s of [-1, 1]) {
    bx(g, F('#2a2a22'), 0.6, 0.45, 0.2, s * 0.75, H + 2.35, zf + 0.06)
    bx(g, glowM('#3dff8a', 3), 0.3, 0.22, 0.1, s * 0.75, H + 2.35, zf + 0.14)
  }
  bx(g, mk, 0.5, 0.7, 0.4, 0, H + 1.95, zf + 0.2)
  bx(g, F('#2a2a22'), 1.4, 0.3, 0.2, 0, H + 1.45, zf + 0.06)
  // Moss and vines.
  pl(g, S(MOSS), q(TW * 0.5), 0.2, D - 0.6, -TW * 0.12, H + 4.2, 0)
  pl(g, S(MOSS_D), q(TW * 0.4), 0.2, D - 0.2, TW * 0.25, H + 1.2, 0.1)
  const vine = S('#2f7a2a')
  for (const s of [-1, 1]) bx(g, vine, 0.14, q5(H * 0.5), 0.14, s * (W / 2 + 0.3), H - H * 0.25, D / 2 + 0.1)
  return g
}

// Seated stone idol on a plinth, ~6 m, gem eyes glowing (green, red or cyan).
export function templeStatue(rand) {
  rand = rng(rand)
  const g = new Group()
  const st = S('#9a9378')
  const stL = S('#aaa386')
  const stD = S('#7f7a62')
  pl(g, stD, 3.0, 0.8, 3.0, 0, 0, 0, { cast: true })
  pl(g, st, 2.4, 0.4, 2.4, 0, 0.8, 0)
  pl(g, st, 2.0, 1.0, 1.6, 0, 1.2, 0.1, { cast: true })
  pl(g, stL, 1.6, 1.8, 1.1, 0, 2.2, -0.1, { cast: true })
  for (const s of [-1, 1]) {
    bx(g, st, 0.45, 1.4, 0.5, s * 1.02, 3.1, -0.05)
    bx(g, stL, 0.5, 0.35, 0.6, s * 0.75, 2.35, 0.65)
  }
  pl(g, S('#b9a46a'), 1.7, 0.25, 1.2, 0, 3.8, -0.1)
  pl(g, stL, 1.2, 1.1, 1.1, 0, 4.0, -0.05, { cast: true })
  pl(g, S('#b9a46a'), 1.6, 0.4, 1.2, 0, 5.1, -0.05)
  pl(g, S('#b9a46a'), 0.6, 0.8, 0.3, 0, 5.5, -0.2)
  const eye = glowM(pick(rand, ['#3dff8a', '#ff3a3a', '#5ff3ff']), 3)
  for (const s of [-1, 1]) bx(g, eye, 0.22, 0.16, 0.08, s * 0.28, 4.75, 0.52)
  bx(g, stD, 0.2, 0.35, 0.2, 0, 4.45, 0.55)
  bx(g, F('#2a2a22'), 0.55, 0.12, 0.06, 0, 4.2, 0.52)
  pl(g, S(MOSS), q5(0.8 + rand() * 0.8), 0.14, q5(0.6 + rand() * 0.5), q5((rand() - 0.5) * 1.2), 0.8 + 0.4, 0.75)
  pl(g, S(MOSS_D), 0.6, 0.12, 0.6, q5((rand() - 0.5) * 0.6), 5.9, -0.15)
  return g
}

// Wall torch. Origin = wall mount point; protrudes ~0.5 m along +Z.
// userData.flame = Group at (0, 0.85, 0.45): two additive neon cones (~0.6 m)
// to flicker (scale / jitter it).
export function wallTorch() {
  const g = new Group()
  const iron = F(IRON, 0.5, 0.5)
  bx(g, iron, 0.35, 0.5, 0.06, 0, 0, 0.03)
  bx(g, iron, 0.1, 0.1, 0.45, 0, 0, 0.25)
  bx(g, iron, 0.1, 0.3, 0.1, 0, 0.12, 0.45)
  mesh(g, torusGeo(0.11, 0.025, 4, 12), iron, 0, 0.3, 0.45, { rx: Math.PI / 2 })
  cy(g, F(WOOD), 0.07, 0.8, 0, 0.4, 0.45, 'y', 6)
  cy(g, F('#5a3a22', 0.9), 0.11, 0.2, 0, 0.75, 0.45, 'y', 8)
  const flame = new Group()
  flame.position.set(0, 0.85, 0.45)
  g.add(flame)
  cone(flame, flameM('#ff7a1a', 3), 0.2, 0.6, 0, 0, 0, 8)
  cone(flame, flameM('#ffd34a', 2.8), 0.11, 0.4, 0, 0, 0, 8)
  g.userData.flame = flame
  return g
}

// Rolling temple ball, ~5 m across, CENTRE origin: faceted stone sphere with two
// carved bands and six glyph bosses. userData.radius = 2.5.
export function rollingBoulderTemple() {
  const g = new Group()
  const ball = mesh(g, SPHERE, mat('#958b6e', 0.9, 0, { flatShading: true }), 0, 0, 0, { cast: true })
  ball.scale.setScalar(2.5)
  const band = F('#6f674f', 0.9)
  mesh(g, torusGeo(2.42, 0.2, 5, 24), band, 0, 0, 0)
  mesh(g, torusGeo(2.42, 0.2, 5, 24), band, 0, 0, 0, { ry: Math.PI / 2 })
  const boss = S('#7f775c')
  bx(g, boss, 0.4, 1.0, 1.0, 2.45, 0, 0)
  bx(g, boss, 0.4, 1.0, 1.0, -2.45, 0, 0)
  bx(g, boss, 1.0, 0.4, 1.0, 0, 2.45, 0)
  bx(g, boss, 1.0, 0.4, 1.0, 0, -2.45, 0)
  bx(g, boss, 1.0, 1.0, 0.4, 0, 0, 2.45)
  bx(g, boss, 1.0, 1.0, 0.4, 0, 0, -2.45)
  bx(g, S(MOSS), 1.4, 0.3, 1.1, 0.9, 2.15, 0.9, { rx: 0.4, rz: -0.4 })
  g.userData.radius = 2.5
  return g
}

// ============================================================================================
// MISTY BAYOU
// ============================================================================================

// Bald cypress, 9-13 m at scale 1: flared base, flat tiered canopy, hanging
// Spanish moss, 3 knees round the base (12 meshes).
export function cypressTree(scale = 1, rand) {
  rand = rng(rand)
  const g = new Group()
  const s = scale
  const H = (9 + rand() * 4) * s
  const bark = S('#6b5a48')
  pl(g, bark, q(2.0 * s), q(1.2 * s), q(2.0 * s), 0, 0, 0, { cast: true })
  pl(g, bark, q(1.4 * s), q(1.6 * s), q(1.4 * s), 0, q(1.2 * s), 0)
  const th = q(H * 0.72)
  pl(g, S('#7a6652'), q(0.8 * s), th, q(0.8 * s), 0, 0, 0, { cast: true })
  const c0 = S('#4f6b2e')
  const c1 = S('#5e7a36')
  pl(g, c0, q(6 * s), q(1.2 * s), q(5.5 * s), 0, th, 0, { cast: true })
  pl(g, c1, q(4.5 * s), q(1.1 * s), q(4 * s), q5((rand() - 0.5) * s), th + q(1.2 * s), q5((rand() - 0.5) * s), { cast: true })
  pl(g, c0, q(2.6 * s), q(1.0 * s), q(2.6 * s), 0, th + q(2.3 * s), 0)
  const moss = S('#9aa58a')
  for (let k = 0; k < 3; k++) {
    const len = q((1.6 + rand() * 1.4) * s)
    const a = (k / 3) * Math.PI * 2 + rand()
    bx(g, moss, q5(0.3 * s), len, q5(0.14 * s), q5(Math.cos(a) * 2.6 * s), th - len / 2 + 0.1, q5(Math.sin(a) * 2.4 * s))
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + rand() * 1.5
    const r = (1.8 + rand() * 0.8) * s
    pl(g, bark, q5(0.35 * s), q5((0.5 + rand() * 0.4) * s), q5(0.35 * s), q5(Math.cos(a) * r), 0, q5(Math.sin(a) * r))
  }
  return g
}

// Weathered plank hut on stilts. ORIGIN = water level (y 0) under its centre;
// stilts run down to y -1.2, deck top y 2.45, hut 4.4 x 3.4 m, roof to ~6.1 m.
// Door, lit window and a ladder on the +Z porch side.
export function stiltHut() {
  const g = new Group()
  const wood = S(WOOD)
  const woodD = S(WOOD_D)
  for (const x of [-2.6, 2.6]) for (const z of [-1.8, 0.5, 2.8]) pl(g, woodD, 0.3, 3.4, 0.3, x, -1.2, z)
  for (const s of [-1, 1]) bx(g, woodD, 0.12, 3.0, 0.12, s * 2.6, 0.8, -0.65, { rx: 0.75 })
  pl(g, wood, 6.0, 0.25, 5.0, 0, 2.2, 0.5, { cast: true })
  pl(g, S('#7d6a4c'), 4.4, 2.6, 3.4, 0, 2.45, -0.4, { cast: true })
  const roof = S('#8c7a52')
  pl(g, roof, 5.2, 0.35, 4.4, 0, 5.05, -0.4, { cast: true })
  pl(g, S('#7d6c48'), 4.0, 0.35, 3.0, 0, 5.4, -0.4)
  pl(g, roof, 2.6, 0.35, 1.6, 0, 5.75, -0.4)
  const zf = 1.3
  pl(g, F('#4a3826'), 1.0, 1.9, 0.1, -0.8, 2.45, zf + 0.02)
  bx(g, mat('#ffcf7a', 0.4, 0, { emissive: '#ff9a2a', emissiveIntensity: 0.7 }), 0.9, 0.7, 0.1, 1.1, 3.6, zf + 0.02)
  for (const s of [-1, 1]) bx(g, S('#5f7a6a'), 0.4, 0.8, 0.08, 1.1 + s * 0.68, 3.6, zf + 0.06)
  for (const s of [-1, 1]) pl(g, woodD, 0.14, 0.9, 0.14, s * 2.85, 2.45, 2.85)
  bx(g, wood, 5.8, 0.12, 0.12, 0, 3.3, 2.9)
  // Ladder down to the water.
  for (const s of [-1, 1]) pl(g, F(WOOD_L), 0.08, 2.6, 0.08, 1.8 + s * 0.25, -0.2, 3.1)
  for (let i = 0; i < 3; i++) bx(g, F(WOOD_L), 0.5, 0.06, 0.08, 1.8, 0.4 + i * 0.6, 3.1)
  // Lantern by the door, stovepipe, a crate.
  bx(g, F(IRON, 0.5, 0.5), 0.26, 0.08, 0.26, -1.65, 4.05, zf + 0.25)
  bx(g, glowM('#ffcf6a', 2.8), 0.18, 0.26, 0.18, -1.65, 3.87, zf + 0.25)
  cy(g, F(IRON, 0.5, 0.5), 0.12, 1.4, -1.4, 5.9, -1.4, 'y', 8)
  cy(g, F(IRON, 0.5, 0.5), 0.2, 0.1, -1.4, 6.6, -1.4, 'y', 8)
  pl(g, S('#b08a52'), 0.7, 0.6, 0.7, 2.1, 2.45, 2.0, { ry: 0.3 })
  return g
}

// Cluster of 4-7 lily pads (r 0.35-0.75) lying flat at y 0.02 (0.04 thick),
// sometimes 1-2 pink flowers.
export function lilyPads(rand) {
  rand = rng(rand)
  const g = new Group()
  const greens = ['#3f8f3a', '#4f9f3e', '#357d34'].map((c) => F(c, 0.5))
  const n = 4 + Math.floor(rand() * 4)
  for (let i = 0; i < n; i++) {
    const r = q5(0.35 + rand() * 0.4)
    cy(g, pick(rand, greens), r, 0.04, q5((rand() - 0.5) * 2.6), 0.02, q5((rand() - 0.5) * 2.6), 'y', 10)
  }
  const nf = rand() < 0.4 ? 0 : 1 + Math.floor(rand() * 2)
  for (let i = 0; i < nf; i++) {
    const x = q5((rand() - 0.5) * 2)
    const z = q5((rand() - 0.5) * 2)
    pl(g, S('#ffb3d1'), 0.3, 0.18, 0.3, x, 0.04, z, { ry: 0.4 })
    pl(g, S('#ffe14a'), 0.12, 0.08, 0.12, x, 0.2, z)
  }
  return g
}

// Flat murky swamp water w (X) x d (Z), top at y 0, centre origin. A single
// Mesh with its own material. userData.tex = its own CanvasTexture
// (RepeatWrapping, one tile = 8 m): scroll tex.offset for a slow drift.
export function swampWater(w = 40, d = 40) {
  const c = surfCanvas('swamp', 128, (x, size, r) => {
    x.fillStyle = '#3d4a2a'
    x.fillRect(0, 0, size, size)
    for (let i = 0; i < 18; i++) {
      x.fillStyle = '#2f3b20'
      wrapRect(x, size, Math.floor(r() * 16) * 8, Math.floor(r() * 16) * 8, 8 + Math.floor(r() * 3) * 8, 8 + Math.floor(r() * 2) * 8)
    }
    for (let i = 0; i < 40; i++) {
      x.fillStyle = r() < 0.6 ? '#5d7a32' : '#6e8a3a'
      wrapRect(x, size, Math.floor(r() * 32) * 4, Math.floor(r() * 32) * 4, 4 + Math.floor(r() * 2) * 4, 4)
    }
    x.globalAlpha = 0.5
    for (let i = 0; i < 24; i++) {
      x.fillStyle = '#8f9f6a'
      wrapRect(x, size, Math.floor(r() * 16) * 8, Math.floor(r() * 64) * 2, 8 + Math.floor(r() * 2) * 8, 2)
    }
    x.globalAlpha = 1
  })
  const tex = scrollTex(c)
  const m = new MeshStandardMaterial({ map: tex, color: '#ffffff', roughness: 0.25, metalness: 0.1, emissive: '#1a2410', emissiveIntensity: 0.3 })
  const me = new Mesh(flatPlane(w, d, 8), m)
  me.receiveShadow = true
  me.userData.tex = tex
  return me
}

// Clump of 6-9 reeds / cattails (1.2-2.2 m) with two leaf blades.
export function reeds(rand) {
  rand = rng(rand)
  const g = new Group()
  const stalks = [S('#6f8a3a'), S('#5f7a32')]
  const head = S('#6b4a2b')
  const n = 6 + Math.floor(rand() * 4)
  for (let i = 0; i < n; i++) {
    const h = q5(1.2 + rand() * 1.0)
    const x = q5((rand() - 0.5) * 1.2)
    const z = q5((rand() - 0.5) * 1.2)
    const withHead = rand() < 0.5
    pl(g, stalks[i % 2], 0.06, h, 0.06, x, 0, z, withHead ? undefined : { rx: (rand() - 0.5) * 0.25, rz: (rand() - 0.5) * 0.25 })
    if (withHead) pl(g, head, 0.14, 0.45, 0.14, x, h - 0.55, z)
  }
  for (const s of [-1, 1]) bx(g, S('#4f7a2a'), 0.12, 1.4, 0.03, s * 0.3, 0.65, q5((rand() - 0.5) * 0.6), { rz: s * 0.3 })
  return g
}

// Wooden lantern pole (~3.3 m) with a hanging caged neon lantern.
// userData.lantern = pivot Group at the hook (0.8, 2.72, 0); the lantern hangs
// below it: swing it with rotation.x / rotation.z.
export function lanternPole() {
  const g = new Group()
  pl(g, S(STONE_D), 0.6, 0.25, 0.6, 0, 0, 0)
  pl(g, S(WOOD_D), 0.2, 3.2, 0.2, 0, 0, 0, { cast: true })
  bx(g, S(WOOD_D), 0.95, 0.12, 0.12, 0.4, 3.0, 0)
  bx(g, S(WOOD_D), 0.08, 0.5, 0.08, 0.25, 2.75, 0, { rz: 0.8 })
  const iron = F(IRON, 0.5, 0.5)
  bx(g, iron, 0.04, 0.24, 0.04, 0.8, 2.84, 0)
  const lantern = new Group()
  lantern.position.set(0.8, 2.72, 0)
  g.add(lantern)
  bx(lantern, iron, 0.34, 0.08, 0.34, 0, -0.04, 0)
  bx(lantern, iron, 0.2, 0.08, 0.2, 0, 0.04, 0)
  bx(lantern, glowM('#ffcf6a', 3), 0.22, 0.32, 0.22, 0, -0.26, 0)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(lantern, iron, 0.04, 0.36, 0.04, sx * 0.13, -0.26, sz * 0.13)
  bx(lantern, iron, 0.3, 0.06, 0.3, 0, -0.45, 0)
  g.userData.lantern = lantern
  return g
}

// ============================================================================================
// LIGHTHOUSE COVE
// ============================================================================================

let beamGeos = null
// Striped lighthouse on a rock base: six stepped red/white drums, gallery with
// railing, glass lamp room (lamp centre y 18.9), red cone roof, vane to ~22.5 m.
// Door on +Z. userData.beam = Group at the lamp (0, 18.9, 0) with two opposite
// 34 m additive light cones along its local +X and -X: rotate beam.rotation.y.
// userData.lampMat = this lighthouse's own emissive lamp material (pulse it).
export function lighthouse() {
  const g = new Group()
  pl(g, S(ROCKS[1]), 7, 1.2, 7, 0, 0, 0, { cast: true })
  pl(g, S(ROCKS[0]), 5.5, 0.6, 5.5, 0.2, 1.2, -0.1)
  const red = F('#d8322b', 0.6)
  const white = F(WHITE, 0.6)
  let y = 1.8
  const radii = []
  for (let i = 0; i < 6; i++) {
    const r = 2.2 - i * 0.16
    cy(g, i % 2 ? white : red, r, 2.6, 0, y + 1.3, 0, 'y', 10, { cast: true })
    radii.push([r, y])
    y += 2.6
  }
  // Door and windows.
  pl(g, F(WHITE), 1.3, 2.1, 0.3, 0, 1.8, 2.1)
  pl(g, F('#3a5a8a', 0.5), 0.9, 1.8, 0.4, 0, 1.8, 2.12)
  for (const i of [2, 3, 4]) {
    const [r, yy] = radii[i]
    bx(g, F(DARK, 0.4), 0.45, 0.75, 0.3, 0, yy + 1.3, r - 0.08)
  }
  // Gallery + railing.
  const dark = F(DARK, 0.6, 0.4)
  cy(g, dark, 2.4, 0.3, 0, 17.55, 0, 'y', 12)
  mesh(g, torusGeo(2.3, 0.05, 4, 24), dark, 0, 18.6, 0, { rx: Math.PI / 2 })
  mesh(g, torusGeo(2.3, 0.04, 4, 24), dark, 0, 18.1, 0, { rx: Math.PI / 2 })
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4
    pl(g, dark, 0.08, 0.9, 0.08, Math.cos(a) * 2.3, 17.7, Math.sin(a) * 2.3)
  }
  // Lamp room.
  cy(g, mat('#cfefff', 0.05, 0.2, { transparent: true, opacity: 0.45, emissive: '#fff2b0', emissiveIntensity: 0.3, depthWrite: false }), 1.4, 2.0, 0, 18.7, 0, 'y', 8)
  const lampMat = own(new MeshStandardMaterial({ color: '#fff3c0', emissive: '#ffe27a', emissiveIntensity: 3, roughness: 0.3 }))
  bx(g, lampMat, 0.9, 0.9, 0.9, 0, 18.9, 0)
  cone(g, F('#c8322b', 0.6), 1.8, 1.4, 0, 19.7, 0, 10, { cast: true })
  sph(g, F('#ffcc33', 0.3, 0.8), 0.2, 0, 21.25, 0)
  cy(g, dark, 0.04, 1.2, 0, 21.9, 0, 'y', 5)
  // Beam.
  if (!beamGeos) {
    const a = new CylinderGeometry(4.5, 0.4, 34, 16, 1, true).rotateZ(-Math.PI / 2).translate(17.6, 0, 0)
    const b = new CylinderGeometry(4.5, 0.4, 34, 16, 1, true).rotateZ(Math.PI / 2).translate(-17.6, 0, 0)
    beamGeos = { a, b, mat: new MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }) }
  }
  const beam = new Group()
  beam.position.set(0, 18.9, 0)
  g.add(beam)
  beam.add(new Mesh(beamGeos.a, beamGeos.mat))
  beam.add(new Mesh(beamGeos.b, beamGeos.mat))
  g.userData.beam = beam
  g.userData.lampMat = lampMat
  return g
}

// Rocky sea cliff block: w wide (X) x ~h high, sea side +Z (front face ~z 0,
// wet dark wave-cut band, foam and sea stacks out to z ~+5), body back to
// ~z -(0.35w + 4). Grass on top. Base centre origin (sea level y 0).
export function seaCliff(w = 30, h = 18, rand) {
  rand = rng(rand)
  const g = new Group()
  const ms = SEAROCK.map(S)
  const grass = S(GRASS)
  const cols = Math.max(2, Math.min(10, Math.round(w / 5)))
  const cw = w / cols
  for (let i = 0; i < cols; i++) {
    const x = -w / 2 + (i + 0.5) * cw
    const hh = q(h * (0.8 + rand() * 0.2))
    const dd = q(w * 0.35 + rand() * 4)
    const z = -dd / 2 + q5((rand() - 0.5) * 1.2)
    const cwq = q(cw + 0.3)
    pl(g, ms[i % 3], cwq, hh, dd, x, 0, z, { cast: true })
    if (rand() < 0.8) pl(g, i % 2 ? grass : S(GRASS_D), cwq, 0.5, dd, x, hh, z)
  }
  pl(g, S('#5f584f'), w, q(h * 0.15), 2.0, 0, 0, 0.6)
  for (let k = 0; k < 2; k++) {
    const y = q(h * (0.3 + rand() * 0.35))
    const lw = q(cw * (1 + rand()))
    const x = q5((rand() - 0.5) * (w - lw))
    pl(g, pick(rand, ms), lw, 0.6, 1.4, x, y, 0.4)
    pl(g, grass, q(lw - 0.2), 0.25, 1.2, x, y + 0.6, 0.4)
  }
  for (let k = 0; k < 3; k++) {
    const s = q(1.5 + rand() * 2.5)
    pl(g, S(SEAROCK[k % 3]), s, q(s * (0.8 + rand())), s, q5((rand() - 0.5) * w * 0.8), -0.4, q5(2.2 + rand() * 3), { ry: rand() * Math.PI })
  }
  const foam = F('#f4f8ff', 0.6)
  for (let k = 0; k < 3; k++) pl(g, foam, q(2 + rand() * 3), 0.3, 0.8, q5((rand() - 0.5) * w * 0.8), -0.1, 1.9 + q5(rand() * 0.4))
  return g
}

let sailGeos = null
// Small sailboat (~10 m bow to stern, mast ~9.6 m), hull along X with the bow
// at +X. ORIGIN = waterline centre (hull bottom ~-0.8).
export function sailingShip() {
  const g = new Group()
  const hull = S('#7a4a2a')
  pl(g, hull, 7.0, 1.4, 2.6, -0.4, -0.8, 0, { cast: true })
  for (const s of [-1, 1]) bx(g, hull, 2.2, 1.4, 1.2, 3.4, -0.1, s * 0.55, { ry: -s * 0.55, cast: true })
  pl(g, S('#6a3e22'), 1.0, 1.9, 2.6, -4.2, -0.8, 0)
  bx(g, F(WHITE), 7.2, 0.18, 2.66, -0.4, 0.15, 0)
  pl(g, S('#b07a46'), 6.8, 0.12, 2.3, -0.2, 0.55, 0)
  for (const s of [-1, 1]) bx(g, S(WOOD_D), 6.8, 0.2, 0.12, -0.2, 0.8, s * 1.25)
  pl(g, S(WHITE), 2.0, 1.0, 1.6, -2.4, 0.67, 0)
  pl(g, hull, 2.2, 0.15, 1.8, -2.4, 1.67, 0)
  bx(g, F(DARK, 0.3), 1.6, 0.35, 1.64, -2.4, 1.25, 0)
  cy(g, F(WOOD), 0.12, 9, 0.6, 5.1, 0, 'y', 8, { cast: true })
  cy(g, F(WOOD), 0.08, 4.2, -1.4, 2.2, 0, 'x', 6)
  if (!sailGeos) {
    const tri = (pts) => {
      const sh = new Shape()
      sh.moveTo(pts[0][0], pts[0][1])
      for (const p of pts.slice(1)) sh.lineTo(p[0], p[1])
      sh.closePath()
      return new ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }).translate(0, 0, -0.025)
    }
    sailGeos = {
      main: tri([
        [0.45, 2.3],
        [-3.4, 2.3],
        [0.45, 8.9],
      ]),
      jib: tri([
        [0.75, 1.5],
        [0.75, 8.6],
        [4.2, 1.2],
      ]),
    }
  }
  const sail = mat('#f8f4ec', 0.8, 0, { side: DoubleSide })
  mesh(g, sailGeos.main, sail, 0, 0, 0, { cast: true })
  mesh(g, sailGeos.jib, sail, 0, 0, 0, { cast: true })
  rod(g, F('#3a3a3a'), 0.02, [4.5, 0.9, 0], [0.6, 9.4, 0], 4)
  bx(g, F('#d8322b'), 0.8, 0.45, 0.03, 1.0, 9.4, 0)
  mesh(g, torusGeo(0.3, 0.07, 6, 14), F('#e8452c'), -2.4, 1.2, 0.84)
  return g
}

// Flat sea w (X) x d (Z), top at y 0, centre origin. A single Mesh with its own
// material. userData.tex = its own CanvasTexture (RepeatWrapping, one tile =
// 12 m): scroll tex.offset for moving water.
export function ocean(w = 200, d = 200) {
  const c = surfCanvas('ocean', 128, (x, size, r) => {
    x.fillStyle = '#1f74c9'
    x.fillRect(0, 0, size, size)
    for (let i = 0; i < 60; i++) {
      x.fillStyle = r() < 0.5 ? '#3b8fe0' : '#4fa3ef'
      x.globalAlpha = 0.6 + r() * 0.4
      wrapRect(x, size, Math.floor(r() * 16) * 8, Math.floor(r() * 32) * 4, 8 + Math.floor(r() * 3) * 8, 3)
    }
    x.globalAlpha = 1
    for (let i = 0; i < 10; i++) {
      x.fillStyle = '#e6f4ff'
      wrapRect(x, size, Math.floor(r() * 32) * 4, Math.floor(r() * 32) * 4, 4 + Math.floor(r() * 2) * 4, 2)
    }
  })
  const tex = scrollTex(c)
  const m = new MeshStandardMaterial({ map: tex, color: '#ffffff', roughness: 0.18, metalness: 0.1, emissive: '#0d3a6a', emissiveIntensity: 0.3 })
  const me = new Mesh(flatPlane(w, d, 12), m)
  me.receiveShadow = true
  me.userData.tex = tex
  return me
}

// Curling, white-capped wave: ~width wide along Z, ~4 m tall, ~8 m deep (x
// -3.8..+4), origin at its base centre, the curl faces -X (the way it travels).
// 6 blocks per ~6 m segment + two spray clouds. Move / scale it.
export function waveCrest(width = 20) {
  const g = new Group()
  const rand = mulberry32(Math.round(width * 31) + 7)
  const deep = mat('#2f8fe0', 0.2, 0.1, { emissive: '#0d4a8a', emissiveIntensity: 0.3 })
  const teal = mat('#39b0e8', 0.2, 0.1, { emissive: '#0d5a8a', emissiveIntensity: 0.3 })
  const foam = mat('#f4fbff', 0.6, 0, { emissive: '#9fc8e8', emissiveIntensity: 0.25 })
  const segs = Math.max(2, Math.min(6, Math.round(width / 6)))
  const sw = width / segs
  for (let i = 0; i < segs; i++) {
    const z = -width / 2 + (i + 0.5) * sw
    const dh = q5((rand() - 0.5) * 0.5)
    const dx = q5((rand() - 0.5) * 0.4)
    const w = q5(sw + 0.3)
    bx(g, deep, 5.0, 1.0, w, 1.5 + dx, 0.5, z)
    bx(g, teal, 4.0, 1.0, w - 0.1, 0.5 + dx, 1.5, z)
    bx(g, deep, 3.5, 1.0 + dh, w - 0.2, -0.25 + dx, 2.5 + dh / 2, z)
    bx(g, foam, 3.6, 0.7, w, -1.0 + dx, 3.35 + dh, z, { cast: true })
    bx(g, foam, 1.4, 1.0, w - 0.1, -2.5 + dx, 2.8 + dh, z)
    bx(g, foam, 2.8, 0.6, w, -2.4 + dx, 0.3, z)
  }
  const spray = mat('#ffffff', 0.9, 0, { transparent: true, opacity: 0.55, depthWrite: false })
  for (const s of [-0.25, 0.25]) bx(g, spray, 2.6, 1.0, width * 0.35, -1.2, 4.1, s * width)
  return g
}

// Wooden jetty 3 m wide from the origin (shore end, water level y 0) out along
// +Z to +length (the sea side, as in seaCliff). Deck top y 1.2, piles down to
// y -1.5, lamp post, bollards, rope coil and a crate at the far end.
export function dock(length = 12) {
  const L = length
  const g = new Group()
  const woodD = S(WOOD_D)
  const k = Math.max(1, Math.round(L / 3))
  for (let j = 0; j <= k; j++) for (const s of [-1, 1]) pl(g, woodD, 0.35, 2.9, 0.35, s * 1.4, -1.5, (j * L) / k)
  for (const s of [-1, 1]) bx(g, woodD, 0.25, 0.3, L, s * 1.1, 0.95, L / 2)
  const n = Math.max(2, Math.round(L / 1.0))
  const pw = L / n
  const planks = [S('#a8743f'), S('#956636')]
  for (let i = 0; i < n; i++) bx(g, planks[i % 2], 3.0, 0.15, pw - 0.08, 0, 1.125, (i + 0.5) * pw)
  pl(g, woodD, 0.18, 2.4, 0.18, 1.3, 1.2, L - 0.3)
  bx(g, F(IRON, 0.5, 0.5), 0.36, 0.1, 0.36, 1.3, 3.65, L - 0.3)
  bx(g, glowM('#ffcf6a', 3), 0.26, 0.32, 0.26, 1.3, 3.44, L - 0.3)
  for (const s of [-1, 1]) cy(g, F(IRON, 0.5, 0.5), 0.15, 0.4, s * 1.1, 1.4, L - 1.0, 'y', 8)
  cy(g, F('#c9b37a', 0.9), 0.32, 0.16, -0.6, 1.28, L - 1.6, 'y', 10)
  pl(g, S('#b08a52'), 0.8, 0.8, 0.8, 0.6, 1.2, L * 0.4, { ry: 0.25 })
  return g
}

// Channel buoy: red float with a white band, red lattice tower and a lamp at
// ~2.45 m. ORIGIN = waterline centre (float bottom at y -0.4).
// userData.lampMat = this buoy's own emissive lamp material (blink it).
export function buoy() {
  const g = new Group()
  const red = F('#d8322b', 0.55)
  cy(g, red, 0.7, 1.0, 0, 0.1, 0, 'y', 12, { cast: true })
  cy(g, F(WHITE), 0.72, 0.25, 0, 0.35, 0, 'y', 12)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, red, 0.08, 1.6, 0.08, sx * 0.32, 1.4, sz * 0.32)
  cy(g, F(IRON, 0.5, 0.5), 0.45, 0.08, 0, 2.2, 0, 'y', 10)
  const lampMat = own(new MeshStandardMaterial({ color: '#3a2a0a', emissive: '#ffcf4a', emissiveIntensity: 2.5, roughness: 0.3 }))
  cy(g, lampMat, 0.18, 0.35, 0, 2.42, 0, 'y', 10)
  cy(g, F(IRON, 0.5, 0.5), 0.22, 0.06, 0, 2.63, 0, 'y', 10)
  g.userData.lampMat = lampMat
  return g
}

// ============================================================================================
// FROZEN TUNDRA / TITAN PEAK
// ============================================================================================

// Snow-laden conifer, 8-13 m at scale 1, snow on every tier (11 meshes).
export function snowPine(scale = 1, rand) {
  rand = rng(rand)
  const g = new Group()
  const H = (8 + rand() * 5) * scale
  const th = q(H * 0.2)
  pl(g, S(BARK), q(0.8 * scale), th, q(0.8 * scale), 0, 0, 0, { cast: true })
  const c0 = pick(rand, ['#2a5e3a', '#24543a', '#2f6a40'])
  const c1 = mixHex(c0, '#0b2a10', 0.2)
  const snow = S(SNOW)
  const n = 4
  const base = th * 0.7
  const step = (H - base) / (n + 0.4)
  const W = H * 0.46
  for (let i = 0; i < n; i++) {
    const w = q(W * (1 - (i / n) * 0.78))
    const ry = i % 2 ? Math.PI / 4 : 0
    const h = q(step * 1.2)
    const y = q5(base + i * step)
    pl(g, S(i % 2 ? c1 : c0), w, h, w, 0, y, 0, { ry, cast: true })
    pl(g, snow, q(w * 0.88), q5(0.3 * scale), q(w * 0.88), 0, y + h, 0, { ry })
  }
  const tip = q(W * 0.14)
  const ty = q5(base + (n - 1) * step + step * 1.2)
  pl(g, S(c0), tip, q(step * 0.6), tip, 0, ty, 0)
  pl(g, snow, tip, q5(0.25 * scale), tip, 0, ty + q(step * 0.6), 0)
  return g
}

// Igloo: faceted snow dome r 2.4 (to y 2.4) with block-seam rings, entrance
// tunnel on +Z (door ~0.9 x 1.3 m at z ~3.1), a warm-lit ice window.
export function igloo() {
  const g = new Group()
  const R = 2.4
  hemiGeo ??= new SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)
  pl(g, S(SNOW), 6.0, 0.25, 6.4, 0, -0.1, 0.4)
  const dome = mesh(g, hemiGeo, mat(SNOW, 0.6, 0, { flatShading: true }), 0, 0, 0, { cast: true })
  dome.scale.setScalar(R)
  const seam = F('#cfe0f2', 0.7)
  for (const yy of [0.8, 1.6]) {
    const r = Math.sqrt(R * R - yy * yy) + 0.02
    const t = mesh(g, torusGeo(1, 0.05, 4, 24), seam, 0, yy, 0, { rx: Math.PI / 2 })
    t.scale.set(r, r, 1)
  }
  pl(g, S(SNOW_S), 1.6, 1.5, 1.8, 0, 0, R - 0.2)
  cy(g, F(SNOW, 0.7), 0.8, 1.8, 0, 1.5, R - 0.2, 'z', 10)
  pl(g, F('#1e2a3a'), 0.9, 1.3, 0.1, 0, 0, R + 0.72)
  const dx = -0.8
  const dz = 0.6
  const yy = 1.2
  const rr = Math.sqrt(R * R - yy * yy) - 0.03
  bx(g, mat('#9fdcff', 0.05, 0.1, { emissive: '#ffb85a', emissiveIntensity: 0.6 }), 0.6, 0.5, 0.12, dx * rr, yy, dz * rr, { ry: Math.atan2(dx, dz) })
  pl(g, S(SNOW_S), 0.6, 0.4, 0.4, 2.6, 0, 1.6, { ry: 0.3 })
  pl(g, S(SNOW_S), 0.6, 0.4, 0.4, 2.7, 0.4, 1.55, { ry: 0.1 })
  return g
}

// Glassy blue ice blocks (1-3, ~1-2.4 m at scale 1) with snow caps.
export function iceBlock(scale = 1, rand) {
  rand = rng(rand)
  const g = new Group()
  const s = scale
  const ice = [mat('#bfe8ff', 0.08, 0.1, { emissive: '#3a8ac0', emissiveIntensity: 0.25, flatShading: true }), mat('#9fd8f5', 0.08, 0.1, { emissive: '#3a7ab0', emissiveIntensity: 0.25, flatShading: true })]
  const snow = S(SNOW)
  const n = 1 + Math.floor(rand() * 3)
  for (let i = 0; i < n; i++) {
    const w = q((1.2 + rand() * 1.2) * s * (i ? 0.7 : 1))
    const h = q((0.9 + rand() * 1.3) * s * (i ? 0.7 : 1))
    const d = q((1.0 + rand() * 1.0) * s * (i ? 0.7 : 1))
    const x = i ? q5((rand() - 0.5) * 2 * s) : 0
    const z = i ? q5((rand() - 0.5) * 2 * s) : 0
    const ry = (rand() - 0.5) * 0.9
    pl(g, ice[i % 2], w, h, d, x, 0, z, { ry, cast: i === 0 })
    pl(g, snow, q(w * 0.85), q5(0.2 * s), q(d * 0.85), x, h, z, { ry })
  }
  return g
}

// Avalanche gallery over the track along local -Z from 0 to -length: a
// concrete back wall on the mountain side (x = side * 3..4, side -1 = -X), a
// concrete roof slab with snow on top and a snow deflector ramp rising into
// the mountain, concrete columns + timber cross beams on the open valley side.
// Clear width 6 m (x -3..3), clear height 6.6 m under the beams.
export function snowShed(length = 24, side = -1) {
  const L = length
  const s = side < 0 ? -1 : 1
  const g = new Group()
  const con = [S('#a7a9a6'), S('#9c9e9b')]
  const conL = S('#b3b5b2')
  pl(g, S(STONE_D), 1.6, 0.4, L, s * 3.6, 0, -L / 2)
  const nseg = Math.max(1, Math.round(L / 6))
  for (let i = 0; i < nseg; i++) pl(g, con[i % 2], 1.0, 7.4, L / nseg, s * 3.5, 0.4, -(i + 0.5) * (L / nseg), { cast: true })
  pl(g, conL, 8.2, 0.6, L + 0.4, s * 0.3, 7.2, -L / 2, { cast: true })
  bx(g, S(WOOD_D), 0.4, 0.8, L + 0.4, -s * 3.9, 7.4, -L / 2)
  pl(g, S(SNOW), 8.4, 0.5, L + 0.6, s * 0.3, 7.8, -L / 2)
  bx(g, S(SNOW_S), 6, 0.8, L + 0.6, s * 7.1, 9.6, -L / 2, { rz: s * 0.45, cast: true })
  const nc = Math.max(2, Math.round(L / 4) + 1)
  const wood = S(WOOD)
  for (let j = 0; j < nc; j++) {
    const z = -0.3 - (j * (L - 0.6)) / (nc - 1)
    pl(g, conL, 0.6, 7.2, 0.6, -s * 3.3, 0, z, { cast: true })
    bx(g, wood, 7.2, 0.5, 0.45, 0, 6.85, z)
  }
  const nl = Math.max(1, Math.round(L / 8))
  for (let i = 0; i < nl; i++) {
    const z = -(i + 0.5) * (L / nl)
    bx(g, F(DARK, 0.6, 0.4), 0.15, 0.4, 1.4, s * 2.97, 5.0, z)
    bx(g, glowM('#ffe7a8', 2.5), 0.08, 0.25, 1.2, s * 2.9, 5.0, z)
  }
  return g
}

// A rolling wall of snow ~width wide (along Z), ~10-11.5 m tall, ~16 m deep
// (x -10..+5.5), origin at base centre, its front facing +X. Rocks and a broken
// trunk tumble in it. userData.puffs = the loose snow blocks + two powder
// clouds (Meshes, each with userData.base = its rest position) to jiggle.
export function avalancheWave(width = 40) {
  const g = new Group()
  const rand = mulberry32(Math.round(width * 17) + 3)
  const snow = S(SNOW)
  const snow2 = S(SNOW_S)
  const shade = S('#c9d6e8')
  const segs = Math.max(2, Math.min(7, Math.round(width / 8)))
  const sw = width / segs
  const puffs = []
  for (let i = 0; i < segs; i++) {
    const z = -width / 2 + (i + 0.5) * sw
    pl(g, snow2, 8, q(3 + rand()), sw + 0.5, -6, 0, z)
    pl(g, snow, 8, q(6 + rand() * 1.5), sw + 0.3, -2, 0, z, { cast: true })
    pl(g, shade, 4, q(7.5 + rand() * 1.5), sw, 2, 0, z, { cast: true })
    for (let k = 0; k < 3; k++) {
      const ps = q(k === 2 ? 2.5 + rand() : 3 + rand() * 2)
      const px = k === 2 ? 4.4 : q5(1.5 + rand() * 2)
      const py = k === 2 ? 1.6 : q5(7.5 + rand() * 1.5)
      const p = bx(g, k ? snow : snow2, ps, ps, ps, px, py, q5(z + (rand() - 0.5) * sw * 0.6), { ry: rand() * 0.8, cast: true })
      puffs.push(p)
    }
  }
  const rock = ROCKS.map(S)
  for (let k = 0; k < 3; k++) {
    const rs = q(1 + rand() * 1.2)
    bx(g, rock[k], rs, rs, rs, q5(1 + rand() * 3), q5(2 + rand() * 6), q5((rand() - 0.5) * width * 0.8), { rx: rand(), ry: rand() })
  }
  bx(g, S(BARK), 0.6, 4.5, 0.6, 2.5, 5, q5((rand() - 0.5) * width * 0.5), { rz: 1.1, rx: 0.3 })
  const powder = mat('#ffffff', 0.9, 0, { transparent: true, opacity: 0.5, depthWrite: false })
  for (const s of [-0.22, 0.22]) puffs.push(bx(g, powder, 8, 3.5, width * 0.45, -0.5, 9.8, s * width))
  for (const p of puffs) p.userData.base = p.position.clone()
  g.userData.puffs = puffs
  return g
}

// Massive stepped snowy mountain: base w x ~0.85w, height ~h (up to ~260 x
// 170 m), base centre origin. Rock tiers with snow ledges, solid snow from ~45%
// up, a snow summit. ~2-3 blocks per tier, 5-12 tiers.
export function snowPeak(w = 200, h = 140, rand) {
  rand = rng(rand)
  const g = new Group()
  const n = Math.min(12, Math.max(5, Math.round(h / 14)))
  const lh = q(h / n)
  const d = w * 0.85
  const snowFrom = Math.floor(n * 0.45)
  const rocks = PEAK.map(S)
  const snow = S(SNOW)
  const snow2 = S(SNOW_S)
  let top = null
  for (let i = 0; i < n; i++) {
    const f = 1 - (i / n) * 0.9
    const lw = q(w * f * (0.9 + rand() * 0.15))
    const ld = q(d * f * (0.9 + rand() * 0.15))
    const ox = q((rand() - 0.5) * w * 0.05)
    const oz = q((rand() - 0.5) * d * 0.05)
    const y = i * lh
    const sn = i >= snowFrom
    pl(g, sn ? (i % 2 ? snow : snow2) : rocks[i % 3], lw, lh, ld, ox, y, oz, { cast: true })
    if (i > 0 && i < n - 1) {
      const sx = rand() < 0.5 ? -1 : 1
      const sh = q(lh * (0.7 + rand() * 0.6))
      pl(g, sn ? snow2 : rocks[(i + 1) % 3], q(lw * 0.5), sh, q(ld * 0.6), ox + sx * q(lw * 0.32), y, oz + q((rand() - 0.5) * ld * 0.3))
    }
    if (!sn && i % 2 === 1) pl(g, snow2, q(lw * 0.94), 0.6, q(ld * 0.94), ox, y + lh - 0.3, oz)
    if (i === snowFrom - 1) pl(g, snow, q(lw * 0.85), 0.8, q(ld * 0.85), ox, y + lh - 0.4, oz)
    top = { lw, ld, ox, oz, y: y + lh }
  }
  pl(g, snow, q(top.lw * 0.45), q(lh * 0.6), q(top.ld * 0.45), top.ox, top.y, top.oz)
  return g
}

// Rock shelf for a mountain road: w (X) x h (Y) x d (Z), base centre origin,
// flat top at y = h (z -d/2..d/2). Columns of grey rock, a snow bank along the
// outer (+Z) edge (y h..h+0.25, 0.9 m wide) and the inner edge (0.4 m tall,
// 1.2 m wide), snow-topped rock lumps on the +Z face.
export function rockLedge(w = 20, h = 6, d = 8, rand) {
  rand = rng(rand)
  const g = new Group()
  const ms = PEAK.map(S)
  const snow = S(SNOW)
  const cols = Math.max(1, Math.min(8, Math.round(w / 5)))
  const cw = w / cols
  for (let i = 0; i < cols; i++) pl(g, ms[i % 3], cw + (i < cols - 1 ? 0.02 : 0), h, d, -w / 2 + (i + 0.5) * cw, 0, 0, { cast: true })
  pl(g, snow, w, 0.25, 0.9, 0, h, d / 2 - 0.45)
  pl(g, S(SNOW_S), w, 0.4, 1.2, 0, h, -d / 2 + 0.6)
  const nl = Math.max(1, Math.min(6, Math.round(w / 6)))
  for (let k = 0; k < nl; k++) {
    const lw = q(2 + rand() * 3)
    const lhh = q(1.5 + rand() * 2.5)
    const ld = q(1 + rand() * 1.5)
    const x = q5(-w / 2 + ((k + 0.5) / nl) * w + (rand() - 0.5) * 2)
    const y0 = q(Math.max(0, rand() * (h - lhh - 0.5)))
    const z = d / 2 + ld / 2 - 0.3
    pl(g, pick(rand, ms), lw, lhh, ld, x, y0, z, { cast: true })
    pl(g, snow, q(lw * 0.9), 0.25, q(ld * 0.9), x, y0 + lhh, z)
  }
  return g
}

// Summit monument (stepped stone base, 4 m obelisk with a TITAN PEAK plaque,
// gold cap, red neon beacon at ~6.7 m) beside a 16 m flag pole at x +2.8.
// userData.flag = pivot Group at (2.9, 15.4, 0): yaw it with rotation.y;
// userData.cloth = the 4 x 2.5 m cloth (12x3 segments, extends along +X and
// down from the pivot) for vertex waving. userData.beacon = the beacon mesh.
export function summitBeacon() {
  const g = new Group()
  pl(g, S(STONE_D), 4, 0.8, 4, 0, 0, 0, { cast: true })
  pl(g, S(STONE), 3.0, 0.8, 3.0, 0, 0.8, 0)
  pl(g, S(STONE_L), 1.6, 4.0, 1.6, 0, 1.6, 0, { cast: true })
  const gold = GOLD()
  pl(g, gold, 1.8, 0.3, 1.8, 0, 5.6, 0)
  pl(g, gold, 1.0, 0.4, 1.0, 0, 5.9, 0)
  bx(g, gold, 1.4, 1.0, 0.06, 0, 3.4, 0.82)
  const plaque = canvasMat('titanplaque', 256, 180, (x, w, h) => {
    x.fillStyle = '#5a3a1a'
    x.fillRect(0, 0, w, h)
    x.strokeStyle = '#ffd34a'
    x.lineWidth = 8
    x.strokeRect(8, 8, w - 16, h - 16)
    fitText(x, 'TITAN', w / 2, 62, w - 40, 64, { color: '#ffd34a' })
    fitText(x, 'PEAK', w / 2, 126, w - 40, 64, { color: '#ffd34a' })
  }, { rough: 0.4, metal: 0.4 })
  face(g, plaque, 1.3, 0.9, 0, 3.4, 0.86)
  const iron = F(IRON, 0.5, 0.5)
  cy(g, iron, 0.32, 0.12, 0, 6.36, 0, 'y', 10)
  const beacon = cy(g, glowM('#ff3b2a', 3.5), 0.26, 0.5, 0, 6.67, 0, 'y', 10)
  for (const yy of [6.55, 6.8]) mesh(g, torusGeo(0.29, 0.03, 4, 12), iron, 0, yy, 0, { rx: Math.PI / 2 })
  cy(g, iron, 0.3, 0.08, 0, 6.96, 0, 'y', 10)
  pl(g, S(STONE_D), 1.0, 0.5, 1.0, 2.8, 0, 0)
  cy(g, METAL(), 0.1, 16, 2.8, 8.25, 0, 'y', 8, { cast: true })
  sph(g, gold, 0.2, 2.8, 16.35, 0)
  const pivot = new Group()
  pivot.position.set(2.9, 15.4, 0)
  g.add(pivot)
  const clothM = canvasMat('titanflag', 256, 160, (x, w, h) => {
    x.fillStyle = '#2a5fd6'
    x.fillRect(0, 0, w, h)
    x.fillStyle = '#ffffff'
    poly(x, [
      [36, 110],
      [96, 30],
      [128, 70],
      [150, 50],
      [218, 110],
    ])
    fitText(x, 'TITAN PEAK', w / 2, 136, w - 30, 34, { color: '#ffffff', outline: '#10307a', ow: 6 })
  }, { extra: { side: DoubleSide } })
  const cloth = new Mesh(new PlaneGeometry(4, 2.5, 12, 3).translate(2, -1.25, 0), clothM)
  cloth.castShadow = true
  pivot.add(cloth)
  g.userData.flag = pivot
  g.userData.cloth = cloth
  g.userData.beacon = beacon
  return g
}

// String of prayer flags along local X from 0 to `length`, ends at y 0, sagging
// ~min(1.5, 0.08 * length) mid-span; 0.45 x 0.55 m flags in blue / white / red /
// green / yellow hang below the line every ~0.7 m.
export function prayerFlags(length = 12) {
  const g = new Group()
  const L = length
  const sag = Math.min(1.5, L * 0.08)
  const yAt = (x) => {
    const t = x / L
    return -sag * 4 * t * (1 - t)
  }
  const rope = F('#c9b37a', 0.9)
  const m = 6
  for (let j = 0; j < m; j++) {
    const x0 = (j * L) / m
    const x1 = ((j + 1) * L) / m
    rod(g, rope, 0.025, [x0, yAt(x0), 0], [x1, yAt(x1), 0], 4)
  }
  const cols = ['#2a6fd6', '#f3efe4', '#d8322b', '#2fa84a', '#ffd21f'].map((c) => F(c, 0.85))
  const nf = Math.max(2, Math.floor(L / 0.7))
  for (let i = 0; i < nf; i++) {
    const x = ((i + 0.5) * L) / nf
    bx(g, cols[i % 5], 0.45, 0.55, 0.02, x, yAt(x) - 0.3, 0, { rx: ((i * 37) % 7) * 0.03 - 0.09 })
  }
  return g
}

// ============================================================================================
// DIAMOND TERMINUS
// ============================================================================================

// Grand crystal-palace station hall, 26 m wide (x -13..13) x 60 m long (z
// +30..-30), the track runs through along -Z at x = 0 (clear between the
// platform edges x -3.4..3.4, platform tops y 1.0, marble floor top y 0). Glass
// side walls and a glass gable roof (ridge ~17 m) on gold frames, a ridge
// lantern, crystal chandeliers, a 'DIAMOND TERMINUS' sign over the +Z entrance
// (y ~13.6) with a big glowing diamond above it (~18.5 m), benches.
// userData.glowMats = [diamonds + chandeliers, column-top gems, wall light
// strips]: the station's own emissive materials, pulse their emissiveIntensity.
// ~60 meshes: bake it (the glowMats keep their own draw calls).
export function diamondTerminus() {
  const g = new Group()
  const L = 60
  const HW = 13
  const gold = GOLD()
  const marble = S('#ece7f4')
  const marble2 = S('#d9d2e6')
  const glass = mat('#c8f4ff', 0.05, 0.3, { transparent: true, opacity: 0.38, emissive: '#5ad8ff', emissiveIntensity: 0.2, depthWrite: false })
  const glass2 = mat('#e0f8ff', 0.05, 0.3, { transparent: true, opacity: 0.5, emissive: '#9ff4ff', emissiveIntensity: 0.35, depthWrite: false })
  const gemMat = own(new MeshStandardMaterial({ color: '#bff6ff', emissive: '#5fe6ff', emissiveIntensity: 1.2, roughness: 0.05, metalness: 0.2, flatShading: true }))
  const pinkMat = own(new MeshStandardMaterial({ color: '#ffb3ee', emissive: '#ff4fd8', emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.2, flatShading: true }))
  const stripMat = own(new MeshStandardMaterial({ color: '#c8f8ff', emissive: '#7ff0ff', emissiveIntensity: 2.2, roughness: 0.3 }))
  pl(g, marble, 2 * HW, 0.3, L, 0, -0.3, 0)
  for (const s of [-1, 1]) {
    // Platform with a gold nose and a yellow safety line.
    pl(g, marble, 6.0, 1.0, L - 4, s * 6.4, 0, 0, { cast: true })
    bx(g, gold, 0.16, 1.0, L - 4, s * 3.48, 0.5, 0)
    bx(g, F('#ffc928', 0.5), 0.35, 0.04, L - 4, s * 3.9, 1.02, 0)
    // Side wall: marble base, glass, gold band and top beam, a light strip.
    pl(g, marble2, 0.8, 2.0, L, s * 12.6, 0, 0, { cast: true })
    pl(g, glass, 0.3, 9.0, L, s * 12.6, 2.0, 0)
    bx(g, gold, 0.5, 0.3, L, s * 12.6, 6.5, 0)
    bx(g, gold, 0.8, 0.6, L + 1, s * 12.6, 11.3, 0, { cast: true })
    bx(g, stripMat, 0.1, 0.15, L, s * 12.3, 6.85, 0)
    // Benches.
    for (const z of [-12, 12]) pl(g, S('#6a3ab8'), 2.4, 0.5, 0.7, s * 7.8, 1.0, z)
  }
  // Gold frames: columns + roof ribs; glass gable roof and ridge lantern.
  const rib = Math.hypot(12.6, 6)
  const ang = Math.atan2(6, 12.6)
  for (const z of [29.5, 10, -10, -29.5]) {
    for (const s of [-1, 1]) {
      pl(g, gold, 0.9, 11, 0.9, s * 12.6, 0, z, { cast: true })
      bx(g, gold, rib, 0.5, 0.6, s * 6.3, 14.0, z, { rz: -s * ang })
    }
  }
  for (const s of [-1, 1]) bx(g, glass, rib, 0.2, L, s * 6.3, 14.0, 0, { rz: -s * ang })
  pl(g, glass2, 3.0, 2.0, L * 0.8, 0, 16.6, 0)
  pl(g, gold, 3.6, 0.3, L * 0.8 + 0.4, 0, 18.6, 0)
  // Column-top gems at the two ends.
  for (const z of [29.5, -29.5])
    for (const s of [-1, 1]) {
      const gm = mesh(g, gemGeo(), pinkMat, s * 12.6, 12.05, z)
      gm.scale.setScalar(0.45)
    }
  // Entrance (+Z): gold beam, sign with gold frame, the big diamond on a mount.
  bx(g, gold, 2 * HW + 1, 0.8, 0.8, 0, 11.3, 30)
  bx(g, gold, 16.6, 3.6, 0.3, 0, 13.6, 30.0, { cast: true })
  bx(g, F('#1b2350', 0.4, 0.3), 16, 3.0, 0.4, 0, 13.6, 30.15)
  const sign = canvasMat('terminus', 1024, 176, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h)
    gr.addColorStop(0, '#2a3a8a')
    gr.addColorStop(1, '#141c48')
    x.fillStyle = gr
    x.fillRect(0, 0, w, h)
    x.strokeStyle = '#ffd34a'
    x.lineWidth = 10
    rrect(x, 8, 8, w - 16, h - 16, 18)
    x.stroke()
    x.fillStyle = '#9ff4ff'
    for (const cx of [70, w - 70])
      poly(x, [
        [cx, 40],
        [cx + 30, 70],
        [cx, 136],
        [cx - 30, 70],
      ])
    fitText(x, 'DIAMOND TERMINUS', w / 2, h / 2 + 6, w - 200, 110, { color: '#ffffff', outline: '#b07a10', ow: 12 })
  })
  face(g, sign, 15.4, 2.65, 0, 13.6, 30.36)
  pl(g, gold, 1.6, 1.2, 1.0, 0, 15.4, 29.8)
  const big = mesh(g, gemGeo(), gemMat, 0, 18.3, 29.8, { cast: true })
  big.scale.setScalar(1.7)
  // Back (-Z): gold beam + a smaller diamond.
  bx(g, gold, 2 * HW + 1, 0.8, 0.8, 0, 11.3, -30)
  const back = mesh(g, gemGeo(), gemMat, 0, 13.4, -30)
  back.scale.setScalar(1.0)
  // Chandeliers.
  for (const z of [18, 0, -18]) {
    cy(g, gold, 0.05, 3.8, 0, 14.6, z, 'y', 5)
    const ch = mesh(g, gemGeo(), gemMat, 0, 12.4, z)
    ch.scale.set(1.1, 1.3, 1.1)
  }
  g.userData.glowMats = [gemMat, pinkMat, stripMat]
  return g
}

// Giant diamond trophy: marble pedestal (2.4 m) with a CHAMPION plaque on +Z,
// gold cup to ~5 m. userData.gem = Group at (0, 5.8, 0) holding a ~2.2 m
// glowing diamond: spin gem.rotation.y.
export function trophyPedestal() {
  const g = new Group()
  const gold = GOLD()
  pl(g, S('#ece7f4'), 3.2, 0.5, 3.2, 0, 0, 0, { cast: true })
  pl(g, S('#d9d2e6'), 2.6, 1.6, 2.6, 0, 0.5, 0, { cast: true })
  bx(g, gold, 2.7, 0.2, 2.7, 0, 1.3, 0)
  pl(g, S('#ece7f4'), 3.0, 0.3, 3.0, 0, 2.1, 0)
  const plaque = canvasMat('champion', 256, 96, (x, w, h) => {
    x.fillStyle = '#ffc94a'
    x.fillRect(0, 0, w, h)
    x.strokeStyle = '#7a5200'
    x.lineWidth = 6
    x.strokeRect(5, 5, w - 10, h - 10)
    fitText(x, 'CHAMPION', w / 2, h / 2 + 3, w - 30, 56, { color: '#4a2e00' })
  }, { rough: 0.35, metal: 0.5 })
  face(g, plaque, 1.6, 0.6, 0, 0.95, 1.31)
  pl(g, gold, 1.4, 0.3, 1.4, 0, 2.4, 0)
  cy(g, gold, 0.25, 1.0, 0, 3.2, 0, 'y', 10)
  const bowl = mesh(g, cupGeo(), gold, 0, 4.35, 0, { cast: true })
  bowl.scale.setScalar(1)
  for (const s of [-1, 1]) mesh(g, torusGeo(0.4, 0.08, 6, 14), gold, s * 1.0, 4.4, 0)
  const gem = new Group()
  gem.position.set(0, 5.8, 0)
  g.add(gem)
  const gm = mesh(gem, gemGeo(), mat('#bff6ff', 0.05, 0.2, { emissive: '#5fe6ff', emissiveIntensity: 0.9, flatShading: true }), 0, 0, 0, { cast: true })
  gm.scale.setScalar(1.1)
  g.userData.gem = gem
  return g
}
let cupG = null
function cupGeo() {
  cupG ??= new CylinderGeometry(1.0, 0.45, 1.3, 12)
  return cupG
}

// ============================================================================================
// GENERIC
// ============================================================================================

const grounds = new Map()
// Big flat ground slab w (X) x d (Z) with stud UVs, top at y 0, centre origin.
// A single Mesh (studMat(color), shared per colour; geometry cached per size).
export function ground(w = 100, d = 100, color = '#4caf3a') {
  const key = `${w}|${d}`
  let geo = grounds.get(key)
  if (!geo) grounds.set(key, (geo = studPlane(w, d)))
  const me = new Mesh(geo, studMat(color))
  me.receiveShadow = true
  return me
}

// Big 90-degree corner board (3.2 x 2.4 m at y 1.8-4.2, on two posts, faces
// +Z): yellow bent arrow on black, the speed value in a yellow box. dir +1 the
// bend goes right (+X for a rider travelling -Z), -1 left.
export function cornerSign(dir = 1, value = 40) {
  const d = dir < 0 ? -1 : 1
  const g = new Group()
  const metal = METAL()
  for (const s of [-1, 1]) pl(g, metal, 0.12, 4.2, 0.12, s * 1.2, 0, -0.08)
  bx(g, F('#151515', 0.6), 3.2, 2.4, 0.1, 0, 3.0, 0, { cast: true })
  const m = canvasMat(`corner|${d}|${value}`, 512, 384, (x, w, h) => {
    x.fillStyle = '#151515'
    x.fillRect(0, 0, w, h)
    x.strokeStyle = '#ffd21f'
    x.lineWidth = 10
    x.strokeRect(10, 10, w - 20, h - 20)
    x.save()
    if (d < 0) {
      x.translate(w, 0)
      x.scale(-1, 1)
    }
    x.fillStyle = '#ffd21f'
    x.strokeStyle = '#ffd21f'
    x.lineWidth = 56
    x.lineJoin = 'miter'
    x.lineCap = 'butt'
    x.beginPath()
    x.moveTo(150, 350)
    x.lineTo(150, 150)
    x.lineTo(320, 150)
    x.stroke()
    poly(x, [
      [306, 72],
      [420, 150],
      [306, 228],
    ])
    x.restore()
    const bx0 = d > 0 ? 296 : 26
    x.fillStyle = '#ffd21f'
    rrect(x, bx0, 246, 190, 116, 16)
    x.fill()
    fitText(x, String(value), bx0 + 95, 308, 170, 92, { color: '#151515' })
  })
  face(g, m, 3.1, 2.3, 0, 3.0, 0.055)
  return g
}

// Red-and-white kerb strip laid across the track: 3.4 (X) x 0.12 (Y) x 0.5 (Z),
// 8 alternating blocks, top at y 0.12 (sits under the rails, tops at 0.36).
export function brakeZoneMarker() {
  const g = new Group()
  const cols = [S('#d62a22'), S(WHITE)]
  const sw = 3.4 / 8
  for (let k = 0; k < 8; k++) pl(g, cols[k % 2], sw, 0.12, 0.5, -1.7 + (k + 0.5) * sw, 0, 0)
  return g
}

let checker = null
function checkerMat() {
  if (checker) return checker
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#151515' : '#f4f4f4'
      x.fillRect(i * 16, j * 16, 16, 16)
    }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.magFilter = NearestFilter
  checker = new MeshStandardMaterial({ map: tex, roughness: 0.6 })
  return checker
}
// Chequered checkpoint arch over the track: posts at x = +-3.85 (inner
// clearance 7.2 m; 7.0 m between the 0.4 m-tall plinths), chequered beam at y 6.1-7.1, CHECKPOINT board (both faces)
// under it at y 4.9-6.1, green neon strip, small chequered flags on the posts.
export function checkpointFlag() {
  const g = new Group()
  const chk = checkerMat()
  for (const s of [-1, 1]) {
    pl(g, F(DARK, 0.6, 0.4), 1.0, 0.4, 1.0, s * 4.0, 0, 0)
    mesh(g, studBox(0.5, 6.7, 0.5), chk, s * 3.85, 0.4 + 3.35, 0, { cast: true })
    cy(g, METAL(), 0.04, 1.4, s * 3.85, 7.8, 0, 'y', 6)
    mesh(g, studBox(1.0, 0.7, 0.03), chk, s * 3.85 + 0.52, 8.15, 0)
  }
  mesh(g, studBox(8.2, 1.0, 0.4), chk, 0, 6.6, 0, { cast: true })
  bx(g, F('#151515', 0.6), 5.0, 1.2, 0.3, 0, 5.5, 0)
  const m = canvasMat('checkpoint', 512, 128, (x, w, h) => {
    x.fillStyle = '#151515'
    x.fillRect(0, 0, w, h)
    x.strokeStyle = '#3dff7a'
    x.lineWidth = 8
    rrect(x, 8, 8, w - 16, h - 16, 14)
    x.stroke()
    fitText(x, 'CHECKPOINT', w / 2, h / 2 + 4, w - 50, 80, { color: '#ffffff', outline: '#0a5a2a', ow: 8 })
  })
  face(g, m, 4.8, 1.1, 0, 5.5, 0.16)
  face(g, m, 4.8, 1.1, 0, 5.5, -0.16, Math.PI)
  bx(g, glowM('#3dff7a', 3), 7.2, 0.08, 0.1, 0, 6.05, 0.22)
  return g
}
