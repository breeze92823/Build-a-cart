// Procedural, blocky (toy-brick) animals and countryside folk with cheap,
// allocation-free procedural animation.
//
// Conventions (every model):
//  - Origin at the feet centre on the ground, +Y up, the model FACES -Z.
//    Its left is -X, its right is +X.
//  - Geometries and materials are shared through module-level caches; many
//    instances are expected. Never dispose them.
//  - Joints are Groups whose rotation is the whole pose: rotation.x swings a
//    leg/arm (positive = foot/hand forward, towards -Z), rotation.x on the
//    head pivot nods (negative = head down), rotation.x on the body pitches
//    it (positive = front up). animate*() overwrites every joint each call,
//    so switching modes never leaves a stale pose.
//  - The root Group itself is never touched by the animators: position,
//    rotate and scale it freely. Seed variation lives on an inner "rig".
//  - All eyes share one emissive material (setEyeGlow drives night eyes).
import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry } from 'three'
import { studBox, studMat } from '../studs.js'

const TAU = Math.PI * 2
const SIDES = [-1, 1] // left (-X), right (+X)

// --- Shared geometry / materials ------------------------------------------------
const G = {
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 10),
  pyr: new CylinderGeometry(0, 1, 1, 4).rotateY(Math.PI / 4), // square pyramid, apex +Y
  hook: new TorusGeometry(1, 0.2, 5, 10, Math.PI), // half ring over +Y
}

const mats = new Map()
function mat(color, rough = 0.85, metal = 0) {
  const key = `${color}|${rough}|${metal}`
  let m = mats.get(key)
  if (!m) mats.set(key, (m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal })))
  return m
}
// Studded toy-brick fur / wool for the big blocks.
const fur = (c) => studMat(c, { rough: 0.9 })

// One material for every eye in the game: dark by day, glowing at night.
export const eyeMaterial = new MeshStandardMaterial({
  color: '#16161c',
  roughness: 0.25,
  metalness: 0,
  emissive: '#d8ff6a',
  emissiveIntensity: 0,
})
const EYE = eyeMaterial
// k 0..1: 0 = normal dark eyes, 1 = bright yellow-green night glow.
export function setEyeGlow(k) {
  const v = k < 0 ? 0 : k > 1 ? 1 : k
  EYE.emissiveIntensity = v * 2.4
}

// Colour helpers (build time only).
const _c = new Color()
function tint(hex, f) {
  return '#' + _c.set(hex).multiplyScalar(f).getHexString()
}
function rng(seed) {
  let a = (Math.floor(seed * 1000) ^ 0x9e3779b9) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let autoSeed = 0
const nextSeed = () => (autoSeed = (autoSeed + 1) % 1e6) * 7.3197

// --- Placement helpers: every position is given in rig space ---------------------
// (the rest pose, before any joint rotation). Each Group remembers its rig-space
// origin so children can be placed with absolute coordinates.
const OFF = new WeakMap()
const ZERO = [0, 0, 0]
function grp(parent, x = 0, y = 0, z = 0) {
  const g = new Group()
  const o = OFF.get(parent) || ZERO
  g.position.set(x - o[0], y - o[1], z - o[2])
  OFF.set(g, [x, y, z])
  parent.add(g)
  return g
}
function mesh(parent, geo, m, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, shadow = false) {
  const o = OFF.get(parent) || ZERO
  const me = new Mesh(geo, m)
  me.position.set(x - o[0], y - o[1], z - o[2])
  me.scale.set(sx, sy, sz)
  me.rotation.set(rx, ry, rz)
  if (shadow) me.castShadow = me.receiveShadow = true
  parent.add(me)
  return me
}
const bx = (p, m, x, y, z, w, h, d, rx, ry, rz, sh) => mesh(p, G.box, m, x, y, z, w, h, d, rx, ry, rz, sh)
// Studded block: the geometry carries world-size stud UVs, so it keeps scale 1.
const sb = (p, m, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) => mesh(p, studBox(w, h, d), m, x, y, z, 1, 1, 1, rx, ry, rz, true)
// Box spanning (y0,z0) -> (y1,z1) in the YZ plane at x (necks, tails).
function link(p, m, x, y0, z0, y1, z1, w, d, extra = 0, sh = false) {
  const dy = y1 - y0
  const dz = z1 - z0
  return bx(p, m, x, (y0 + y1) / 2, (z0 + z1) / 2, w, Math.hypot(dy, dz) + extra, d, Math.atan2(dz, dy), 0, 0, sh)
}

// Leg hanging from a hip/shoulder pivot at rig height y (= leg length) down to the
// ground: thigh, knee pivot, shin, hoof/paw.
// o: { thigh, shin, hoof (materials), tw, td, sw, sd, hw, hh, hd, k (knee height / y), up }
function leg(parent, x, y, z, o) {
  const kY = y * (o.k ?? 0.5)
  const up = o.up ?? y * 0.06
  const hip = grp(parent, x, y, z)
  bx(hip, o.thigh, x, (y + up + kY) / 2, z, o.tw, y + up - kY, o.td ?? o.tw, 0, 0, 0, true)
  const knee = grp(hip, x, kY, z)
  const sd = o.sd ?? o.sw
  bx(knee, o.shin, x, (kY + o.hh) / 2, z, o.sw, kY - o.hh + y * 0.03, sd, 0, 0, 0, true)
  bx(knee, o.hoof, x, o.hh / 2, z - (o.hd - sd) / 2, o.hw, o.hh, o.hd)
  return { hip, knee }
}

// Quadruped skeleton. c: { hipY, backZ, shY, frontZ, legX, cy, cz, neck:[y,z], tip:[y,z], tail:[y,z]|null, front, hind }
// body pivot = hind hips (so rearing keeps the hind feet planted), legs order [FL, FR, HL, HR].
function quadRig(rig, c) {
  const body = grp(rig, 0, c.hipY, c.backZ)
  const breath = grp(body, 0, c.cy, c.cz)
  const legs = []
  const knees = []
  const spots = [
    [-c.legX, c.shY, c.frontZ, c.front],
    [c.legX, c.shY, c.frontZ, c.front],
    [-c.legX, c.hipY, c.backZ, c.hind],
    [c.legX, c.hipY, c.backZ, c.hind],
  ]
  for (const [x, y, z, o] of spots) {
    const l = leg(body, x, y, z, o)
    legs.push(l.hip)
    knees.push(l.knee)
  }
  const head = grp(body, 0, c.neck[0], c.neck[1])
  const tip = grp(head, 0, c.tip[0], c.tip[1])
  const tail = c.tail ? grp(body, 0, c.tail[0], c.tail[1]) : null
  return { body, breath, legs, knees, head, tip, tail, ears: [], eyes: [], jaw: null, arms: null, wings: null, extra: [] }
}
function eyesOn(r, parent, x, y, z, w, h, d) {
  for (const s of SIDES) r.eyes.push(bx(parent, EYE, s * x, y, z, w, h, d))
}
// Ear pivot at (±px,py,pz); ear mesh at (±ex,ey,ez), splayed outward by rz.
function earsOn(r, m, geo, px, py, pz, ex, ey, ez, w, h, d, rz, rx = 0) {
  for (const s of SIDES) {
    const p = grp(r.tip, s * px, py, pz)
    mesh(p, geo, m, s * ex, ey, ez, w, h, d, rx, 0, -s * rz)
    r.ears.push(p)
  }
}
// Graze stance: body pitched down by `pitch`, hind legs kept vertical, front legs
// splayed forward just enough that the front feet still touch the ground.
function grazeCfg(c, neck, tip, pitch) {
  const dy = c.shY - c.hipY
  const dz = c.frontZ - c.backZ
  const y = c.hipY + dy * Math.cos(pitch) - dz * Math.sin(pitch)
  const a = Math.acos(Math.min(1, y / c.shY))
  return { neck, tip, pitch, splay: a - pitch }
}

// --- Kinds ---------------------------------------------------------------------
function deer(rig, o, stag) {
  const coat = tint(o.color || '#9a6a3c', o.shade)
  const M = fur(coat)
  const legM = mat(coat)
  const light = mat('#efe3cf')
  const dark = mat('#2a1d15', 0.6)
  const c = {
    hipY: 0.95, backZ: 0.34, shY: 0.98, frontZ: -0.42, legX: 0.12, cy: 1.13, cz: -0.04,
    neck: [1.2, -0.46], tip: [1.8, -0.72], tail: [1.3, 0.46],
    front: { thigh: legM, shin: legM, hoof: dark, tw: 0.12, td: 0.16, sw: 0.065, hw: 0.075, hh: 0.07, hd: 0.09 },
    hind: { thigh: legM, shin: legM, hoof: dark, tw: 0.14, td: 0.24, sw: 0.065, hw: 0.075, hh: 0.07, hd: 0.09 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, M, 0, 1.13, -0.04, 0.4, 0.44, 1.0)
  bx(r.breath, light, 0, 0.9, -0.04, 0.32, 0.06, 0.76)
  bx(r.breath, light, 0, 1.17, 0.465, 0.28, 0.26, 0.04)
  link(r.head, legM, 0, 1.16, -0.43, 1.84, -0.74, 0.17, 0.2, 0.06, true)
  bx(r.tip, legM, 0, 1.85, -0.8, 0.2, 0.2, 0.3, 0, 0, 0, true)
  r.muzzle = bx(r.tip, legM, 0, 1.8, -0.99, 0.13, 0.12, 0.17)
  bx(r.tip, mat('#161212', 0.4), 0, 1.825, -1.08, 0.075, 0.05, 0.025)
  r.jaw = grp(r.tip, 0, 1.75, -0.86)
  bx(r.jaw, light, 0, 1.738, -0.97, 0.11, 0.035, 0.16)
  eyesOn(r, r.tip, 0.101, 1.875, -0.85, 0.012, 0.045, 0.045)
  earsOn(r, legM, G.box, 0.075, 1.94, -0.74, 0.14, 2.0, -0.74, 0.1, 0.17, 0.03, 0.75)
  link(r.tail, legM, 0, 1.31, 0.47, 1.16, 0.52, 0.09, 0.05)
  let height = 1.95
  if (stag) {
    const ant = mat('#d9c49a', 0.7)
    for (const s of SIDES) {
      bx(r.tip, ant, s * 0.13, 2.1, -0.7, 0.035, 0.42, 0.035, 0.2, 0, -s * 0.4)
      bx(r.tip, ant, s * 0.1, 2.03, -0.79, 0.03, 0.16, 0.03, -0.75, 0, -s * 0.2)
      bx(r.tip, ant, s * 0.24, 2.28, -0.72, 0.03, 0.2, 0.03, -0.3, 0, -s * 0.15)
    }
    height = 2.35
  }
  return { r, c, a: { family: 'quad', height, freq: 1.1, run: 'gallop', gz: grazeCfg(c, -1.6, -0.75, -0.18), rear: 0.8, tailAxis: 'z' } }
}

function moose(rig, o) {
  const coat = tint(o.color || '#4a3326', o.shade)
  const M = fur(coat)
  const coatM = mat(coat)
  const legM = mat(tint('#9a7e62', o.shade))
  const snout = mat('#2e2019')
  const dark = mat('#1e1612', 0.6)
  const ant = mat('#c9b48a', 0.7)
  const c = {
    hipY: 1.35, backZ: 0.6, shY: 1.45, frontZ: -0.7, legX: 0.22, cy: 1.65, cz: -0.05,
    neck: [1.85, -0.82], tip: [1.95, -1.18], tail: [1.98, 0.78],
    front: { thigh: coatM, shin: legM, hoof: dark, tw: 0.18, td: 0.24, sw: 0.11, hw: 0.14, hh: 0.1, hd: 0.17 },
    hind: { thigh: coatM, shin: legM, hoof: dark, tw: 0.2, td: 0.34, sw: 0.11, hw: 0.14, hh: 0.1, hd: 0.17 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, M, 0, 1.65, -0.05, 0.78, 0.76, 1.66, 0.04)
  sb(r.breath, M, 0, 2.1, -0.5, 0.6, 0.34, 0.6)
  link(r.head, coatM, 0, 1.8, -0.78, 1.98, -1.2, 0.36, 0.42, 0.1, true)
  bx(r.tip, coatM, 0, 1.95, -1.32, 0.32, 0.34, 0.46, 0, 0, 0, true)
  r.muzzle = bx(r.tip, snout, 0, 1.84, -1.62, 0.3, 0.3, 0.3, 0.15)
  r.jaw = grp(r.tip, 0, 1.72, -1.4)
  bx(r.jaw, snout, 0, 1.69, -1.56, 0.22, 0.07, 0.3)
  bx(r.tip, coatM, 0, 1.62, -1.28, 0.07, 0.32, 0.12) // bell
  eyesOn(r, r.tip, 0.162, 2.02, -1.26, 0.012, 0.05, 0.05)
  earsOn(r, coatM, G.box, 0.14, 2.1, -1.12, 0.26, 2.14, -1.12, 0.06, 0.22, 0.12, 1.0)
  for (const s of SIDES) {
    bx(r.tip, ant, s * 0.5, 2.24, -1.08, 0.7, 0.06, 0.42, 0, 0, s * 0.4)
    bx(r.tip, ant, s * 0.62, 2.36, -1.22, 0.05, 0.16, 0.05, -0.2, 0, -s * 0.3)
    bx(r.tip, ant, s * 0.78, 2.43, -0.98, 0.05, 0.16, 0.05, 0.2, 0, -s * 0.4)
  }
  bx(r.tail, coatM, 0, 1.92, 0.8, 0.1, 0.14, 0.06)
  return { r, c, a: { family: 'quad', height: 2.45, freq: 0.8, run: 'gallop', gz: grazeCfg(c, -1.55, -0.75, -0.2), rear: 0.7, tailAxis: 'z', charge: -0.55 } }
}

function bear(rig, o) {
  const coat = tint(o.color || '#5a3a24', o.shade)
  const M = fur(coat)
  const coatM = mat(coat)
  const paw = mat(tint(coat, 0.6))
  const snout = mat('#b08a62')
  const c = {
    hipY: 0.8, backZ: 0.48, shY: 0.85, frontZ: -0.52, legX: 0.25, cy: 1.0, cz: -0.02,
    neck: [1.12, -0.7], tip: [1.15, -0.98], tail: [1.16, 0.7],
    front: { thigh: coatM, shin: coatM, hoof: paw, tw: 0.26, td: 0.3, sw: 0.22, sd: 0.24, hw: 0.26, hh: 0.1, hd: 0.32 },
    hind: { thigh: coatM, shin: coatM, hoof: paw, tw: 0.28, td: 0.38, sw: 0.22, sd: 0.24, hw: 0.26, hh: 0.1, hd: 0.32 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, M, 0, 1.0, -0.02, 0.84, 0.68, 1.44)
  sb(r.breath, M, 0, 1.4, -0.42, 0.62, 0.18, 0.5)
  link(r.head, coatM, 0, 1.08, -0.66, 1.16, -1.0, 0.48, 0.42, 0, true)
  sb(r.tip, M, 0, 1.18, -1.08, 0.5, 0.44, 0.42)
  r.muzzle = bx(r.tip, snout, 0, 1.08, -1.38, 0.26, 0.2, 0.24)
  bx(r.tip, mat('#121010', 0.35), 0, 1.16, -1.505, 0.12, 0.08, 0.05)
  r.jaw = grp(r.tip, 0, 1.0, -1.22)
  bx(r.jaw, snout, 0, 0.97, -1.36, 0.22, 0.06, 0.22)
  eyesOn(r, r.tip, 0.12, 1.28, -1.296, 0.06, 0.06, 0.012)
  earsOn(r, coatM, G.box, 0.17, 1.38, -1.0, 0.2, 1.43, -1.0, 0.12, 0.12, 0.06, 0.2)
  bx(r.tail, coatM, 0, 1.12, 0.74, 0.12, 0.12, 0.1)
  const claw = mat('#e8e0d0', 0.5)
  for (let i = 0; i < 2; i++) bx(r.knees[i], claw, SIDES[i] * c.legX, 0.03, c.frontZ - 0.21, 0.22, 0.04, 0.04)
  return { r, c, a: { family: 'quad', height: 1.5, freq: 0.9, run: 'gallop', gz: grazeCfg(c, -0.9, -0.35, -0.1), rear: 1.25, tailAxis: 'z', charge: -0.35 } }
}

// Wolf and sheepdog share one canine body (dog = smaller, black & white, collar).
function canine(rig, o, dog) {
  const coat = tint(o.color || (dog ? '#1d1d22' : '#7b7f86'), o.shade)
  const M = mat(coat)
  const light = mat(dog ? '#f2f2ee' : '#d8d6d0')
  const dark = mat(dog ? '#f2f2ee' : '#3a3c42')
  const c = {
    hipY: 0.56, backZ: 0.3, shY: 0.58, frontZ: -0.32, legX: 0.09, cy: 0.67, cz: -0.02,
    neck: [0.72, -0.38], tip: [0.88, -0.5], tail: [0.76, 0.38],
    front: { thigh: M, shin: dog ? light : M, hoof: dark, tw: 0.09, td: 0.13, sw: 0.055, hw: 0.07, hh: 0.045, hd: 0.1 },
    hind: { thigh: M, shin: dog ? light : M, hoof: dark, tw: 0.1, td: 0.17, sw: 0.055, hw: 0.07, hh: 0.045, hd: 0.1 },
  }
  const r = quadRig(rig, c)
  bx(r.breath, M, 0, 0.67, -0.02, 0.28, 0.3, 0.82, 0, 0, 0, true)
  bx(r.breath, light, 0, 0.64, -0.4, 0.3, 0.32, 0.16, 0, 0, 0, true)
  bx(r.breath, light, 0, 0.52, 0, 0.22, 0.05, 0.6)
  link(r.head, M, 0, 0.68, -0.36, 0.9, -0.52, 0.18, 0.2, 0, true)
  bx(r.tip, M, 0, 0.9, -0.56, 0.22, 0.19, 0.22, 0, 0, 0, true)
  r.muzzle = bx(r.tip, dog ? light : M, 0, 0.85, -0.74, 0.11, 0.09, 0.17)
  bx(r.tip, mat('#111114', 0.35), 0, 0.88, -0.83, 0.06, 0.045, 0.035)
  r.jaw = grp(r.tip, 0, 0.815, -0.66)
  bx(r.jaw, light, 0, 0.8, -0.74, 0.09, 0.03, 0.15)
  eyesOn(r, r.tip, 0.06, 0.935, -0.675, 0.04, 0.03, 0.012)
  if (dog) earsOn(r, M, G.pyr, 0.07, 0.99, -0.53, 0.08, 1.03, -0.55, 0.06, 0.1, 0.035, 0.45, -0.6)
  else earsOn(r, M, G.pyr, 0.07, 0.99, -0.53, 0.075, 1.045, -0.53, 0.06, 0.12, 0.035, 0.15)
  link(r.tail, M, 0, 0.78, 0.36, 0.5, 0.72, 0.1, 0.1, 0.02)
  link(r.tail, dog ? light : dark, 0, 0.52, 0.7, 0.44, 0.8, 0.09, 0.09)
  if (dog) bx(r.head, mat('#c8262b', 0.6), 0, 0.77, -0.43, 0.2, 0.05, 0.22, -0.63)
  const a = { family: 'quad', height: 1.08, freq: 1.5, run: 'bound', gz: grazeCfg(c, -1.0, -0.45, -0.1), rear: 0.7, tailAxis: 'y', charge: -0.3, pant: dog }
  if (dog) a.freq = 1.8
  return { r, c, a, scale: dog ? 0.62 : 0.88 }
}

function sheep(rig, o, lamb) {
  const woolC = tint(o.color || '#f3f0e6', o.shade)
  const W = fur(woolC)
  const woolM = mat(woolC)
  const face = mat(lamb ? '#ecdcd0' : '#2a2522')
  const hoof = mat('#1a1716', 0.6)
  const c = {
    hipY: 0.42, backZ: 0.3, shY: 0.44, frontZ: -0.3, legX: 0.14, cy: 0.69, cz: 0,
    neck: [0.82, -0.4], tip: [0.9, -0.52], tail: [0.85, 0.5],
    front: { thigh: woolM, shin: face, hoof, tw: 0.13, td: 0.15, sw: 0.055, hw: 0.065, hh: 0.04, hd: 0.08, k: 0.55 },
    hind: { thigh: woolM, shin: face, hoof, tw: 0.14, td: 0.17, sw: 0.055, hw: 0.065, hh: 0.04, hd: 0.08, k: 0.55 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, W, 0, 0.69, 0, 0.62, 0.52, 0.92)
  sb(r.breath, W, 0, 0.98, 0.02, 0.46, 0.12, 0.62)
  for (const s of SIDES) sb(r.breath, W, s * 0.33, 0.68, 0.02, 0.08, 0.38, 0.66)
  sb(r.breath, W, 0, 0.7, 0.49, 0.48, 0.38, 0.08)
  sb(r.head, W, 0, 0.84, -0.47, 0.3, 0.3, 0.22)
  bx(r.tip, face, 0, 0.88, -0.6, 0.2, 0.24, 0.24, 0, 0, 0, true)
  sb(r.tip, W, 0, 1.02, -0.56, 0.26, 0.1, 0.2)
  r.muzzle = bx(r.tip, face, 0, 0.82, -0.75, 0.15, 0.12, 0.1)
  r.jaw = grp(r.tip, 0, 0.77, -0.68)
  bx(r.jaw, face, 0, 0.755, -0.75, 0.12, 0.035, 0.1)
  eyesOn(r, r.tip, 0.102, 0.92, -0.66, 0.012, 0.04, 0.04)
  earsOn(r, face, G.box, 0.1, 0.94, -0.6, 0.17, 0.925, -0.6, 0.14, 0.04, 0.07, 0.25)
  bx(r.tail, woolM, 0, 0.78, 0.53, 0.1, 0.16, 0.08)
  if (lamb) r.tip.scale.setScalar(1.25)
  return { r, c, a: { family: 'quad', height: 1.05, freq: lamb ? 1.8 : 1.4, run: 'waddle', gz: grazeCfg(c, -1.2, -0.4, -0.08), rear: 0.6, tailAxis: 'z' }, scale: lamb ? 0.6 : 1 }
}

function cow(rig, o) {
  const white = tint('#f4f2ee', o.shade)
  const patchC = o.color || '#1d1d22'
  const W = fur(white)
  const whiteM = mat(white)
  const P = fur(patchC)
  const patchM = mat(patchC)
  const pink = mat('#e8b0a4')
  const hoof = mat('#2a2420', 0.6)
  const c = {
    hipY: 0.95, backZ: 0.58, shY: 0.95, frontZ: -0.56, legX: 0.24, cy: 1.18, cz: 0,
    neck: [1.25, -0.74], tip: [1.22, -1.02], tail: [1.44, 0.79],
    front: { thigh: whiteM, shin: whiteM, hoof, tw: 0.18, td: 0.24, sw: 0.12, hw: 0.13, hh: 0.08, hd: 0.16 },
    hind: { thigh: whiteM, shin: whiteM, hoof, tw: 0.18, td: 0.32, sw: 0.12, hw: 0.13, hh: 0.08, hd: 0.16 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, W, 0, 1.18, 0, 0.78, 0.62, 1.56)
  sb(r.breath, P, -0.19, 1.32, -0.22, 0.42, 0.36, 0.52)
  sb(r.breath, P, 0.24, 1.16, 0.3, 0.34, 0.42, 0.46)
  sb(r.breath, P, -0.26, 1.02, 0.5, 0.3, 0.28, 0.34)
  bx(r.breath, pink, 0, 0.82, 0.4, 0.26, 0.14, 0.26)
  link(r.head, whiteM, 0, 1.36, -0.66, 1.3, -1.04, 0.36, 0.4, 0, true)
  bx(r.tip, patchM, 0, 1.3, -1.14, 0.34, 0.36, 0.42, 0, 0, 0, true)
  bx(r.tip, whiteM, 0, 1.36, -1.355, 0.12, 0.26, 0.02)
  r.muzzle = bx(r.tip, pink, 0, 1.17, -1.39, 0.3, 0.2, 0.16)
  r.jaw = grp(r.tip, 0, 1.09, -1.25)
  bx(r.jaw, pink, 0, 1.065, -1.36, 0.26, 0.06, 0.2)
  eyesOn(r, r.tip, 0.172, 1.37, -1.2, 0.012, 0.045, 0.045)
  earsOn(r, patchM, G.box, 0.17, 1.4, -1.0, 0.27, 1.39, -1.0, 0.18, 0.05, 0.1, 0.15)
  const horn = mat('#e8e0c8', 0.6)
  for (const s of SIDES) bx(r.tip, horn, s * 0.13, 1.53, -1.0, 0.05, 0.12, 0.05, 0, 0, -s * 0.35)
  link(r.tail, whiteM, 0, 1.44, 0.8, 0.86, 0.84, 0.05, 0.05)
  bx(r.tail, patchM, 0, 0.82, 0.845, 0.09, 0.15, 0.09)
  return { r, c, a: { family: 'quad', height: 1.55, freq: 0.8, run: 'gallop', gz: grazeCfg(c, -1.35, -0.5, -0.12), rear: 0.6, tailAxis: 'z' } }
}

function squirrel(rig, o) {
  const coat = tint(o.color || '#a0582a', o.shade)
  const M = mat(coat)
  const light = mat('#f1dfc4')
  const dark = mat(tint(coat, 0.7))
  const c = {
    hipY: 0.085, backZ: 0.06, shY: 0.085, frontZ: -0.07, legX: 0.04, cy: 0.14, cz: 0,
    neck: [0.18, -0.09], tip: [0.2, -0.11], tail: [0.14, 0.1],
    front: { thigh: M, shin: M, hoof: dark, tw: 0.025, td: 0.03, sw: 0.018, hw: 0.022, hh: 0.012, hd: 0.03, up: 0.03 },
    hind: { thigh: M, shin: M, hoof: dark, tw: 0.035, td: 0.07, sw: 0.02, hw: 0.024, hh: 0.012, hd: 0.045, up: 0.03 },
  }
  const r = quadRig(rig, c)
  bx(r.breath, M, 0, 0.14, 0, 0.1, 0.11, 0.2, 0.3, 0, 0, true)
  bx(r.breath, light, 0, 0.12, -0.035, 0.08, 0.06, 0.15, 0.3)
  bx(r.tip, M, 0, 0.215, -0.13, 0.09, 0.085, 0.1, 0, 0, 0, true)
  r.muzzle = bx(r.tip, light, 0, 0.195, -0.19, 0.05, 0.04, 0.04)
  bx(r.tip, mat('#1a1212', 0.4), 0, 0.205, -0.212, 0.02, 0.015, 0.012)
  eyesOn(r, r.tip, 0.046, 0.23, -0.15, 0.008, 0.022, 0.022)
  earsOn(r, M, G.pyr, 0.028, 0.255, -0.115, 0.03, 0.28, -0.115, 0.018, 0.045, 0.012, 0.2)
  // Bushy tail: three segments curling up and over the back.
  link(r.tail, M, 0, 0.14, 0.1, 0.22, 0.2, 0.1, 0.09, 0.03, true)
  const t2 = grp(r.tail, 0, 0.22, 0.2)
  link(t2, M, 0, 0.21, 0.2, 0.36, 0.21, 0.12, 0.1, 0.03, true)
  const t3 = grp(t2, 0, 0.36, 0.21)
  link(t3, light, 0, 0.36, 0.21, 0.4, 0.13, 0.1, 0.08, 0.03)
  r.extra.push(t2, t3)
  r.tail2 = t2
  r.tail3 = t3
  return { r, c, a: { family: 'quad', height: 0.41, freq: 3.2, run: 'bound', gz: grazeCfg(c, -0.55, -0.35, -0.05), rear: 1.0, tailAxis: 'z', pawA: 0.1, pawB: 0.25 } }
}

function chicken(rig, o) {
  const coat = tint(o.color || '#f5f2ea', o.shade)
  const M = mat(coat)
  const shadeM = mat(tint(coat, 0.85))
  const red = mat('#d8262b', 0.6)
  const yellow = mat('#f0b030', 0.6)
  const body = grp(rig, 0, 0.17, 0.02)
  const breath = grp(body, 0, 0.28, 0.02)
  const r = { body, breath, legs: [], knees: [], ears: [], eyes: [], jaw: null, arms: null, wings: [], extra: [] }
  bx(breath, M, 0, 0.28, 0.02, 0.2, 0.2, 0.28, 0, 0, 0, true)
  bx(breath, M, 0, 0.27, -0.14, 0.18, 0.16, 0.1)
  r.tail = grp(body, 0, 0.34, 0.14)
  link(r.tail, shadeM, 0, 0.32, 0.13, 0.48, 0.24, 0.12, 0.06, 0, true)
  for (const s of SIDES) {
    const w = grp(body, s * 0.1, 0.34, 0)
    bx(w, shadeM, s * 0.112, 0.28, 0.03, 0.03, 0.14, 0.22)
    r.wings.push(w)
    const l = grp(rig, s * 0.05, 0.19, 0.03)
    bx(l, yellow, s * 0.05, 0.1, 0.03, 0.025, 0.18, 0.025)
    bx(l, yellow, s * 0.05, 0.0075, 0.0, 0.06, 0.015, 0.09)
    r.legs.push(l)
  }
  r.head = grp(body, 0, 0.34, -0.1)
  bx(r.head, M, 0, 0.39, -0.13, 0.1, 0.12, 0.1)
  r.tip = grp(r.head, 0, 0.43, -0.14)
  bx(r.tip, M, 0, 0.46, -0.16, 0.1, 0.11, 0.11, 0, 0, 0, true)
  bx(r.tip, red, 0, 0.54, -0.16, 0.025, 0.06, 0.1)
  bx(r.tip, red, 0, 0.4, -0.205, 0.03, 0.05, 0.02)
  r.muzzle = mesh(r.tip, G.pyr, yellow, 0, 0.455, -0.235, 0.03, 0.06, 0.025, -Math.PI / 2)
  eyesOn(r, r.tip, 0.052, 0.475, -0.18, 0.012, 0.022, 0.022)
  return { r, c: null, a: { family: 'bird', height: 0.57, freq: 2.4 }, scale: 0.82 }
}

const SKINS = ['#f1c7a3', '#e0ac82', '#c68a5e', '#8d5a3b', '#5e3a24']
function humanRig(rig, M) {
  const body = grp(rig, 0, 0.86, 0)
  const breath = grp(body, 0, 1.15, 0)
  const legs = []
  const knees = []
  const arms = []
  for (const s of SIDES) {
    const x = s * 0.125
    const hip = grp(rig, x, 0.88, 0)
    bx(hip, M.pants, x, 0.665, 0, 0.22, 0.45, 0.24, 0, 0, 0, true)
    const knee = grp(hip, x, 0.45, 0)
    bx(knee, M.pants, x, 0.29, 0, 0.2, 0.36, 0.22, 0, 0, 0, true)
    bx(knee, M.boot, x, 0.06, -0.035, 0.22, 0.12, 0.3)
    legs.push(hip)
    knees.push(knee)
  }
  bx(breath, M.shirt, 0, 1.15, 0, 0.52, 0.58, 0.28, 0, 0, 0, true)
  for (const s of SIDES) {
    const x = s * 0.345
    const sh = grp(body, x, 1.4, 0)
    bx(sh, M.shirt, x, 1.16, 0, 0.17, 0.52, 0.2, 0, 0, 0, true)
    bx(sh, M.skin, x, 0.85, 0, 0.15, 0.14, 0.17)
    arms.push(sh)
  }
  const head = grp(body, 0, 1.46, 0)
  const tip = grp(head, 0, 1.46, 0)
  bx(tip, M.skin, 0, 1.62, 0, 0.32, 0.3, 0.3, 0, 0, 0, true)
  const r = { body, breath, legs, knees, arms, head, tip, tail: null, ears: [], eyes: [], jaw: null, wings: null, extra: [] }
  eyesOn(r, tip, 0.075, 1.65, -0.152, 0.05, 0.06, 0.012)
  bx(tip, mat(tint(M.skinC, 0.92)), 0, 1.6, -0.17, 0.06, 0.07, 0.05)
  return r
}

function farmer(rig, o, rnd) {
  const skinC = SKINS[Math.floor(rnd() * SKINS.length)]
  const denim = mat(tint('#3d5a8a', o.shade))
  const M = { pants: denim, boot: mat('#4a3020'), shirt: mat(tint(o.color || '#c8352f', o.shade)), skin: mat(skinC), skinC }
  const r = humanRig(rig, M)
  bx(r.breath, denim, 0, 0.92, 0, 0.54, 0.16, 0.3)
  bx(r.breath, denim, 0, 1.12, -0.15, 0.36, 0.3, 0.02)
  for (const s of SIDES) bx(r.breath, denim, s * 0.15, 1.28, 0, 0.065, 0.36, 0.3)
  const hair = mat(['#3a2618', '#6a4a2a', '#b8b0a4', '#c89a52'][Math.floor(rnd() * 4)])
  bx(r.tip, hair, 0, 1.545, -0.155, 0.16, 0.035, 0.02)
  bx(r.tip, hair, 0, 1.64, 0.095, 0.33, 0.12, 0.14)
  const straw = mat('#e2c46a', 0.9)
  mesh(r.tip, G.cyl, straw, 0, 1.765, 0, 0.3, 0.03, 0.3, 0, 0, 0, true)
  mesh(r.tip, G.cyl, straw, 0, 1.85, 0, 0.17, 0.15, 0.17)
  mesh(r.tip, G.cyl, mat('#8a3a24'), 0, 1.8, 0, 0.175, 0.045, 0.175)
  bx(r.tip, mat('#efd98a', 0.9), 0.06, 1.545, -0.21, 0.012, 0.012, 0.16, 0, 0.5)
  return { r, c: null, a: { family: 'biped', height: 1.92, freq: 0.95, waveArm: 1 } }
}

function shepherd(rig, o, rnd) {
  const skinC = SKINS[Math.floor(rnd() * SKINS.length)]
  const tunic = mat(tint(o.color || '#6f7d45', o.shade))
  const cloak = mat(tint('#8a5a3a', o.shade))
  const M = { pants: mat('#5a4632'), boot: mat('#6a4a2a'), shirt: tunic, skin: mat(skinC), skinC }
  const r = humanRig(rig, M)
  bx(r.breath, tunic, 0, 0.8, 0, 0.56, 0.32, 0.32)
  bx(r.breath, mat('#c8a46a'), 0, 0.94, 0, 0.58, 0.05, 0.33)
  bx(r.breath, cloak, 0, 1.1, 0.165, 0.58, 0.72, 0.04, 0, 0, 0, true)
  bx(r.breath, cloak, 0, 1.44, 0.03, 0.5, 0.12, 0.34)
  bx(r.tip, mat(rnd() < 0.5 ? '#d9d4cc' : '#4a3424'), 0, 1.52, -0.16, 0.28, 0.18, 0.06)
  bx(r.tip, mat('#e6dcc4'), 0, 1.79, 0, 0.34, 0.12, 0.34)
  bx(r.tip, mat('#7a4a2a'), 0, 1.745, 0, 0.35, 0.04, 0.35)
  // Crook staff, held in the right hand (moves with arms[1]).
  const wood = mat('#7a5532', 0.8)
  mesh(r.arms[1], G.cyl, wood, 0.345, 0.92, -0.1, 0.025, 1.8, 0.025, 0, 0, 0, true)
  mesh(r.arms[1], G.hook, wood, 0.445, 1.82, -0.1, 0.1, 0.1, 0.1)
  return { r, c: null, a: { family: 'biped', height: 1.85, freq: 0.9, waveArm: 0, staff: 1 } }
}

const BUILDERS = {
  deer: (rig, o) => deer(rig, o, false),
  stag: (rig, o) => deer(rig, o, true),
  moose,
  bear,
  wolf: (rig, o) => canine(rig, o, false),
  dog: (rig, o) => canine(rig, o, true),
  sheep: (rig, o) => sheep(rig, o, false),
  lamb: (rig, o) => sheep(rig, o, true),
  cow,
  chicken,
  squirrel,
  farmer,
  shepherd,
}
export const ANIMAL_KINDS = Object.keys(BUILDERS)

// buildAnimal(kind, { color, seed }) -> Group (origin at the feet, facing -Z).
export function buildAnimal(kind, opts = {}) {
  const make = BUILDERS[kind] || BUILDERS.deer
  const rnd = rng(opts.seed ?? nextSeed())
  const size = 1 + (rnd() * 2 - 1) * 0.08
  const shade = 1 + (Math.round(rnd() * 4) - 2) * 0.05
  const phase = rnd() * 50
  const root = new Group()
  root.name = kind
  const rig = grp(root)
  const { r, a, scale = 1 } = make(rig, { color: opts.color, shade }, rnd)
  rig.scale.setScalar(size * scale)
  const joints = [r.body, r.head, r.tip, ...r.legs, ...r.knees, ...r.ears, ...r.extra]
  for (const j of [r.tail, r.jaw, ...(r.arms || []), ...(r.wings || [])]) if (j) joints.push(j)
  root.userData = {
    kind,
    height: a.height * size * scale,
    legs: r.legs,
    knees: r.knees,
    head: r.head,
    headTip: r.tip,
    tail: r.tail || null,
    arms: r.arms || null,
    wings: r.wings || null,
    body: r.body,
    eyes: r.eyes,
    ears: r.ears,
    jaw: r.jaw || null,
    phase,
    // animation internals
    _family: a.family,
    _freq: a.freq,
    _run: a.run || 'gallop',
    _gz: a.gz || null,
    _rear: a.rear || 0.7,
    _charge: a.charge ?? -0.4,
    _tailAxis: a.tailAxis || 'z',
    _pant: !!a.pant,
    _pawA: a.pawA ?? 0.45,
    _pawB: a.pawB ?? 0.75,
    _waveArm: a.waveArm ?? 1,
    _staff: a.staff || 0,
    _breath: r.breath,
    _tail2: r.tail2 || null,
    _tail3: r.tail3 || null,
    _restY: r.body.position.y,
    _restZ: r.body.position.z,
    _headY: r.head.position.y,
    _headZ: r.head.position.z,
    _joints: joints,
    _muzzle: r.muzzle || null,
  }
  return root
}

// --- Animation -------------------------------------------------------------------
// Phase offsets per leg [FL, FR, HL, HR], in cycles.
const GAITS = {
  walk: [0.25, 0.75, 0, 0.5],
  trot: [0, 0.5, 0.5, 0],
  waddle: [0, 0.5, 0.5, 0],
  gallop: [0.55, 0.68, 0, 0.12],
  bound: [0.5, 0.56, 0, 0.06],
}
const sin = Math.sin
const cos = Math.cos
const pos = (v) => (v > 0 ? v : 0)
const spike = (v, n) => Math.pow(v > 0 ? v : 0, n)

function rest(u) {
  const j = u._joints
  for (let i = 0; i < j.length; i++) j[i].rotation.set(0, 0, 0)
  u.body.position.y = u._restY
  u.body.position.z = u._restZ
  u.head.position.y = u._headY
  u.head.position.z = u._headZ
  u._breath.scale.set(1, 1, 1)
}
function breathe(u, T, a) {
  const s = sin(T * 1.7)
  u._breath.scale.set(1 + a * 0.6 * s, 1 + a * s, 1)
}
function flicks(u, T, k) {
  const e = u.ears
  if (e.length === 2) {
    const a = spike(sin(T * 0.83), 30)
    const b = spike(sin(T * 0.67 + 2.1), 30)
    e[0].rotation.z = 0.45 * k * a * sin(T * 31)
    e[0].rotation.x = -0.25 * a
    e[1].rotation.z = -0.45 * k * b * sin(T * 29)
    e[1].rotation.x = -0.25 * b
  }
  if (u.tail) swish(u, 0.3 * k * sin(T * 2.4) * (0.35 + 0.65 * spike(sin(T * 0.5), 3)))
  if (u._tail2) {
    u._tail2.rotation.x = 0.12 * sin(T * 1.9)
    u._tail3.rotation.x = 0.2 * sin(T * 1.9 - 0.7)
  }
}
function swish(u, s) {
  if (u._tailAxis === 'y') u.tail.rotation.y = s
  else u.tail.rotation.z = s
}

function quadPose(u, T, mode, sp) {
  const L = u.legs
  const K = u.knees
  const body = u.body
  const neck = u.head
  const tip = u.headTip
  const h = u._restY // bob amplitudes scale with the animal's hip height
  switch (mode) {
    case 'graze': {
      const g = u._gz
      body.rotation.x = g.pitch
      L[0].rotation.x = L[1].rotation.x = g.splay
      L[2].rotation.x = L[3].rotation.x = -g.pitch
      neck.rotation.x = g.neck + 0.05 * sin(T * 0.7)
      neck.rotation.y = 0.12 * sin(T * 0.31)
      tip.rotation.x = g.tip
      tip.rotation.z = 0.05 * sin(T * 0.9)
      if (u.jaw) u.jaw.rotation.x = -0.14 * pos(sin(T * 6 * sp))
      breathe(u, T, 0.012)
      flicks(u, T, 1)
      return
    }
    case 'walk':
    case 'run':
    case 'charge': {
      const run = mode !== 'walk'
      const type = run ? u._run : 'walk'
      const offs = GAITS[type]
      const f = u._freq * sp * (mode === 'charge' ? 2.2 : run ? 1.9 : 1)
      const A = run ? 0.55 : 0.32
      const Kn = run ? 1.0 : 0.55
      const c = T * f
      for (let i = 0; i < 4; i++) {
        const p = TAU * (c + offs[i])
        L[i].rotation.x = A * sin(p)
        K[i].rotation.x = -Kn * pos(cos(p))
      }
      const s1 = sin(TAU * c)
      const s2 = sin(2 * TAU * c)
      if (!run) {
        body.position.y += 0.012 * h * s2
        body.rotation.z = 0.02 * s1
        neck.rotation.x = 0.06 * s2
        neck.rotation.y = 0.08 * sin(T * 0.4)
        if (u.tail) swish(u, 0.15 * s1)
        flicks(u, T, 0.6)
      } else {
        if (type === 'gallop') {
          body.rotation.x = 0.07 * sin(TAU * c + 1)
          body.position.y += 0.05 * h * (0.5 + 0.5 * s1)
          neck.rotation.x = -0.12 + 0.1 * sin(TAU * c + 2)
        } else if (type === 'bound') {
          body.rotation.x = 0.14 * sin(TAU * c + 1.4)
          body.position.y += 0.07 * h * (0.5 + 0.5 * s1)
          neck.rotation.x = -0.1 + 0.12 * sin(TAU * c + 2.4)
        } else {
          body.rotation.z = 0.12 * s1
          body.position.y += 0.05 * h * Math.abs(s1)
          neck.rotation.x = 0.05 * s2
        }
        if (u.tail) {
          u.tail.rotation.x = -0.6 + 0.15 * s2
          swish(u, 0.12 * s1)
        }
        if (u._tail2) {
          u._tail2.rotation.x = 0.25 * s1
          u._tail3.rotation.x = 0.3 * sin(TAU * c - 0.8)
        }
        if (u.ears.length === 2) u.ears[0].rotation.x = u.ears[1].rotation.x = 0.35
        if (mode === 'charge') {
          neck.rotation.x = u._charge + 0.05 * s2
          tip.rotation.x = 0.2
          if (u.jaw) u.jaw.rotation.x = -0.15
        }
      }
      return
    }
    case 'rear': {
      const th = u._rear + 0.03 * sin(T * 2)
      body.rotation.x = th
      L[2].rotation.x = L[3].rotation.x = -th
      for (let i = 0; i < 2; i++) {
        const p = T * 5 * sp + i * Math.PI
        L[i].rotation.x = -th + u._pawB + u._pawA * sin(p)
        K[i].rotation.x = -0.9 - 0.35 * sin(p + 0.8)
      }
      neck.rotation.x = -th * 0.6 + 0.08 * sin(T * 1.7)
      tip.rotation.x = 0.15
      if (u.jaw) u.jaw.rotation.x = -0.35 * (0.6 + 0.4 * sin(T * 1.3))
      if (u.tail) u.tail.rotation.x = -0.8 * th
      breathe(u, T, 0.03)
      flicks(u, T, 1)
      return
    }
    case 'dizzy': {
      const w = T * 3.3 * sp
      neck.rotation.z = 0.3 * sin(w)
      neck.rotation.y = 0.3 * cos(w)
      tip.rotation.z = 0.2 * sin(w + 1)
      body.rotation.z = 0.07 * sin(T * 2.1)
      body.rotation.x = 0.03 * sin(T * 1.7)
      const wob = 0.05 * sin(T * 2.1)
      L[0].rotation.z = -0.12 + wob
      L[1].rotation.z = 0.12 + wob
      L[2].rotation.z = -0.1 + wob
      L[3].rotation.z = 0.1 + wob
      if (u.ears.length === 2) {
        u.ears[0].rotation.z = 0.5
        u.ears[1].rotation.z = -0.5
      }
      if (u.tail) u.tail.rotation.x = 0.25
      if (u.jaw) u.jaw.rotation.x = -0.12
      breathe(u, T, 0.03)
      return
    }
    case 'wave': {
      // Excited: fast tail wag, head tilt, little bounce (dogs especially).
      breathe(u, T, 0.02)
      tip.rotation.z = 0.3 * sin(T * 1.3)
      neck.rotation.x = 0.1
      body.position.y += 0.02 * h * pos(sin(T * 8 * sp))
      if (u.tail) {
        u.tail.rotation.x = -0.5
        swish(u, 0.6 * sin(T * 14 * sp))
      }
      if (u.jaw) u.jaw.rotation.x = -0.18 - 0.06 * sin(T * 9)
      return
    }
    default: {
      breathe(u, T, 0.02)
      neck.rotation.y = 0.4 * sin(T * 0.37) + 0.15 * sin(T * 0.91)
      neck.rotation.x = 0.06 * sin(T * 0.29)
      tip.rotation.z = 0.08 * sin(T * 0.53)
      flicks(u, T, 1)
      if (u._pant && u.jaw) u.jaw.rotation.x = -0.15 - 0.05 * sin(T * 9)
    }
  }
}

function humanPose(u, T, mode, sp) {
  const L = u.legs
  const K = u.knees
  const A = u.arms
  const body = u.body
  const head = u.head
  const staff = u._staff
  switch (mode) {
    case 'walk':
    case 'run':
    case 'charge': {
      const run = mode !== 'walk'
      const c = T * u._freq * sp * (run ? 1.7 : 1)
      const p = TAU * c
      const s = sin(p)
      const a = run ? 0.85 : 0.45
      L[0].rotation.x = a * s
      L[1].rotation.x = -a * s
      K[0].rotation.x = -(run ? 1.3 : 0.6) * pos(cos(p))
      K[1].rotation.x = -(run ? 1.3 : 0.6) * pos(-cos(p))
      const arm = run ? 0.8 : 0.4
      A[0].rotation.x = -arm * s
      A[1].rotation.x = arm * s * (staff ? 0.35 : 1)
      body.position.y += (run ? 0.05 : 0.02) * Math.abs(cos(p))
      body.rotation.y = 0.06 * s
      if (run) body.rotation.x = mode === 'charge' ? -0.28 : -0.15
      head.rotation.x = run ? 0.1 : 0
      return
    }
    case 'graze': {
      // Bend over to inspect the ground / crops.
      body.rotation.x = -0.45 + 0.03 * sin(T * 0.8)
      head.rotation.x = -0.25
      head.rotation.y = 0.2 * sin(T * 0.4)
      A[0].rotation.x = 0.3 + 0.1 * sin(T * 1.6)
      A[1].rotation.x = staff ? 0.45 : 0.3 + 0.1 * sin(T * 1.6 + 1)
      K[0].rotation.x = K[1].rotation.x = -0.15
      L[0].rotation.x = L[1].rotation.x = 0.08
      breathe(u, T, 0.015)
      return
    }
    case 'rear': {
      // Both arms up, waving (cheer / shoo).
      const w = sin(T * 9 * sp)
      A[0].rotation.z = -(2.6 + 0.3 * w)
      A[1].rotation.z = 2.6 - 0.3 * w
      body.position.y += 0.04 * pos(sin(T * 6 * sp))
      head.rotation.x = 0.15
      breathe(u, T, 0.03)
      return
    }
    case 'wave': {
      const i = u._waveArm
      const w = 2.6 + 0.35 * sin(T * 9 * sp)
      A[i].rotation.z = i ? w : -w
      head.rotation.z = (i ? -0.12 : 0.12) * (0.6 + 0.4 * sin(T * 1.5))
      body.rotation.z = (i ? -0.04 : 0.04)
      breathe(u, T, 0.015)
      return
    }
    case 'dizzy': {
      const w = T * 3.3 * sp
      head.rotation.z = 0.3 * sin(w)
      head.rotation.x = 0.2 * cos(w)
      body.rotation.z = 0.09 * sin(T * 2.1)
      body.rotation.x = 0.05 * sin(T * 1.6)
      A[0].rotation.z = -0.5 - 0.3 * sin(T * 2.1)
      A[1].rotation.z = 0.5 - 0.3 * sin(T * 2.1)
      L[0].rotation.z = -0.06
      L[1].rotation.z = 0.06
      breathe(u, T, 0.02)
      return
    }
    default: {
      breathe(u, T, 0.02)
      head.rotation.y = 0.45 * sin(T * 0.33) + 0.12 * sin(T * 0.87)
      head.rotation.x = 0.05 * sin(T * 0.27)
      A[0].rotation.z = -0.05 - 0.02 * sin(T * 1.7)
      A[1].rotation.z = staff ? 0.12 : 0.05 + 0.02 * sin(T * 1.7)
      A[1].rotation.x = staff ? -0.1 : 0
      body.rotation.z = 0.015 * sin(T * 0.45)
    }
  }
}

function birdPose(u, T, mode, sp) {
  const L = u.legs
  const W = u.wings
  const body = u.body
  const neck = u.head
  const tip = u.headTip
  switch (mode) {
    case 'graze': {
      const pk = spike(sin(T * 4.2 * sp), 3)
      body.rotation.x = -0.25
      neck.rotation.x = -0.35 - 1.1 * pk
      L[0].rotation.x = 0.5 * spike(sin(T * 1.1), 8)
      if (u.tail) u.tail.rotation.x = 0.15
      breathe(u, T, 0.02)
      return
    }
    case 'walk':
    case 'run':
    case 'charge': {
      const run = mode !== 'walk'
      const c = T * u._freq * sp * (run ? 2 : 1)
      const s = sin(TAU * c)
      const a = run ? 0.85 : 0.5
      L[0].rotation.x = a * s
      L[1].rotation.x = -a * s
      neck.position.z = u._headZ + 0.035 * sin(2 * TAU * c)
      body.rotation.z = 0.07 * s
      body.position.y += 0.012 * Math.abs(s)
      if (run) {
        body.rotation.x = -0.35
        neck.rotation.x = 0.2
        const f = 0.6 + 0.5 * sin(T * 24 * sp)
        W[0].rotation.z = -f
        W[1].rotation.z = f
      }
      return
    }
    case 'rear':
    case 'wave': {
      const f = (mode === 'rear' ? 0.9 : 0.5) + 0.6 * sin(T * 20 * sp)
      W[0].rotation.z = -f
      W[1].rotation.z = f
      body.position.y += 0.03 * pos(sin(T * 5))
      body.rotation.x = 0.25
      neck.rotation.x = -0.15
      if (u.tail) u.tail.rotation.x = -0.2
      return
    }
    case 'dizzy': {
      const w = T * 3.3 * sp
      neck.rotation.z = 0.35 * sin(w)
      neck.rotation.y = 0.35 * cos(w)
      body.rotation.z = 0.1 * sin(T * 2.1)
      W[0].rotation.z = -0.3
      W[1].rotation.z = 0.3
      return
    }
    default: {
      breathe(u, T, 0.03)
      neck.rotation.y = 0.25 * Math.round(2 * sin(T * 0.9))
      tip.rotation.z = 0.2 * Math.round(sin(T * 0.6 + 1))
      if (u.tail) u.tail.rotation.x = 0.1 * spike(sin(T * 1.3), 12)
    }
  }
}

// Pose `obj` (from buildAnimal) for time t (s). mode: idle | graze | walk | run |
// charge | rear | wave | dizzy. speed scales the gait / motion frequency.
// Allocation-free.
export function animateAnimal(obj, t, mode = 'idle', speed = 1) {
  const u = obj.userData
  if (!u || !u._joints) return
  const T = t + u.phase
  rest(u)
  if (u._family === 'quad') quadPose(u, T, mode, speed)
  else if (u._family === 'biped') humanPose(u, T, mode, speed)
  else birdPose(u, T, mode, speed)
}

// --- Flyers & fish ---------------------------------------------------------------
function flyer(bodyM, wingM, extraM, bat) {
  const root = new Group()
  const body = grp(root)
  const wings = []
  const tips = []
  bx(body, bodyM, 0, 0, 0, bat ? 0.07 : 0.11, bat ? 0.07 : 0.1, bat ? 0.13 : 0.26, 0, 0, 0, true)
  bx(body, bodyM, 0, 0.035, bat ? -0.09 : -0.16, bat ? 0.065 : 0.09, bat ? 0.06 : 0.09, bat ? 0.06 : 0.09)
  if (bat) {
    for (const s of SIDES) mesh(body, G.pyr, bodyM, s * 0.022, 0.085, -0.09, 0.016, 0.04, 0.012, 0, 0, -s * 0.2)
  } else {
    mesh(body, G.pyr, extraM, 0, 0.03, -0.225, 0.02, 0.05, 0.015, -Math.PI / 2)
    bx(body, bodyM, 0, 0.01, 0.17, 0.12, 0.015, 0.12)
  }
  const eyeX = bat ? 0.0335 : 0.046
  const r = { eyes: [] }
  eyesOn(r, body, eyeX, bat ? 0.045 : 0.05, bat ? -0.105 : -0.18, 0.008, bat ? 0.012 : 0.016, bat ? 0.012 : 0.016)
  const w0 = bat ? 0.035 : 0.05
  for (const s of SIDES) {
    const w = grp(body, s * w0, 0.02, -0.01)
    bx(w, wingM, s * (w0 + 0.075), 0.02, 0.0, 0.15, 0.012, bat ? 0.13 : 0.14)
    const t = grp(w, s * (w0 + 0.15), 0.02, 0)
    if (bat) {
      bx(t, wingM, s * (w0 + 0.22), 0.02, 0.01, 0.14, 0.01, 0.11, 0, s * 0.25, 0)
      bx(t, bodyM, s * (w0 + 0.22), 0.025, -0.045, 0.15, 0.012, 0.012, 0, s * 0.15, 0)
    } else bx(t, wingM, s * (w0 + 0.21), 0.02, 0.01, 0.13, 0.01, 0.1, 0, s * 0.2, 0)
    wings.push(w)
    tips.push(t)
  }
  root.userData = { kind: bat ? 'bat' : 'bird', body, wings, wingTips: tips, eyes: r.eyes, phase: nextSeed() % 50, _flapRate: bat ? 22 : 14 }
  return root
}
// Small bird (~0.35 m long, ~0.6 m wingspan), wings spread, facing -Z.
export function buildBird(color = '#3a3a48') {
  return flyer(mat(color), mat(tint(color, 0.8)), mat('#f0a030', 0.6), false)
}
// Bat with membrane wings (eyes use the shared glowing eye material).
export function buildBat() {
  return flyer(mat('#2a2230', 0.9), mat('#3d2f3f', 0.95), null, true)
}
// Flap a bird or bat. flap 0 = glide, 1 = full flapping.
export function animateBird(obj, t, flap = 1) {
  const u = obj.userData
  const T = (t + u.phase) * u._flapRate
  const a = 0.15 * (1 - flap) * sin(T * 0.15) + flap * 0.85 * sin(T)
  const b = flap * 0.5 * sin(T - 0.9)
  u.wings[0].rotation.z = -a
  u.wings[1].rotation.z = a
  u.wingTips[0].rotation.z = -b
  u.wingTips[1].rotation.z = b
  u.body.position.y = -0.02 * flap * sin(T + 0.6)
}

// Fish ~0.6 m long, facing -Z; userData.tail swings.
export function buildFish(color = '#5ab0ff') {
  const root = new Group()
  const body = grp(root)
  const M = mat(color, 0.45, 0.1)
  const fin = mat(tint(color, 0.75), 0.6)
  bx(body, M, 0, 0, 0, 0.12, 0.2, 0.32, 0, 0, 0, true)
  bx(body, M, 0, -0.005, -0.22, 0.105, 0.15, 0.12)
  bx(body, mat('#eef4f8', 0.5), 0, -0.095, -0.03, 0.1, 0.03, 0.34)
  bx(body, fin, 0, 0.13, 0.02, 0.015, 0.08, 0.16, 0.3)
  const r = { eyes: [] }
  eyesOn(r, body, 0.054, 0.025, -0.235, 0.01, 0.03, 0.03)
  const tail = grp(body, 0, 0, 0.14)
  bx(tail, M, 0, 0, 0.19, 0.06, 0.1, 0.11)
  bx(tail, fin, 0, 0.06, 0.28, 0.015, 0.14, 0.08, -0.6)
  bx(tail, fin, 0, -0.06, 0.28, 0.015, 0.14, 0.08, 0.6)
  root.userData = { kind: 'fish', body, tail, eyes: r.eyes, phase: nextSeed() % 50 }
  return root
}
export function animateFish(obj, t) {
  const u = obj.userData
  const T = (t + u.phase) * 8
  u.tail.rotation.y = 0.45 * sin(T)
  u.body.rotation.y = -0.08 * sin(T - 0.5)
}
