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

// --- Wild kinds (bull, longhorn, jaguar, monkey, alligator, polar bear, penguin,
// goat, crab). Extra animation params in `a`: ram / ramTip (neck + head pitch for
// 'ram'), tuck (0 = cat leap with legs stretched, 1 = goat leap with front legs
// tucked), snap (jaw opening for 'snap'), swimTuck / swimHead / swimPitch,
// climb (monkey: 'climb' + 'steal'), waddle (penguin), post (extra per-kind pass).
function bull(rig, o) {
  const coat = tint(o.color || '#2c1e18', o.shade)
  const M = fur(coat)
  const coatM = mat(coat)
  const legM = mat(tint(coat, 0.85))
  const snout = mat('#5e4238')
  const dark = mat('#120e0c', 0.4)
  const hoof = mat('#141010', 0.6)
  const horn = mat('#efe6cc', 0.55)
  const hornTip = mat('#9a8e74', 0.5)
  const c = {
    hipY: 0.92, backZ: 0.62, shY: 0.98, frontZ: -0.6, legX: 0.28, cy: 1.22, cz: 0,
    neck: [1.42, -0.78], tip: [1.3, -1.08], tail: [1.5, 0.86],
    front: { thigh: coatM, shin: legM, hoof, tw: 0.24, td: 0.3, sw: 0.15, hw: 0.17, hh: 0.09, hd: 0.2 },
    hind: { thigh: coatM, shin: legM, hoof, tw: 0.24, td: 0.38, sw: 0.15, hw: 0.17, hh: 0.09, hd: 0.2 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, M, 0, 1.22, 0, 0.9, 0.74, 1.72)
  sb(r.breath, M, 0, 1.62, -0.42, 0.72, 0.24, 0.62) // shoulder hump
  link(r.head, coatM, 0, 1.42, -0.72, 1.32, -1.1, 0.5, 0.52, 0, true)
  bx(r.tip, coatM, 0, 1.3, -1.2, 0.46, 0.46, 0.48, 0, 0, 0, true)
  r.muzzle = bx(r.tip, snout, 0, 1.14, -1.5, 0.38, 0.28, 0.2)
  bx(r.tip, dark, 0, 1.19, -1.605, 0.22, 0.06, 0.02)
  mesh(r.tip, G.hook, mat('#e8b84a', 0.3, 0.8), 0, 1.13, -1.62, 0.07, 0.07, 0.07, 0, 0, Math.PI) // nose ring
  r.jaw = grp(r.tip, 0, 1.02, -1.34)
  bx(r.jaw, snout, 0, 1.0, -1.48, 0.3, 0.07, 0.24)
  eyesOn(r, r.tip, 0.232, 1.38, -1.3, 0.012, 0.06, 0.06)
  earsOn(r, coatM, G.box, 0.22, 1.42, -1.12, 0.32, 1.42, -1.12, 0.18, 0.06, 0.1, 0.25)
  for (const s of SIDES) {
    bx(r.tip, horn, s * 0.3, 1.52, -1.1, 0.24, 0.09, 0.09, 0, 0, s * 0.25)
    bx(r.tip, hornTip, s * 0.44, 1.64, -1.15, 0.07, 0.2, 0.07, -0.35, 0, -s * 0.35)
  }
  link(r.tail, coatM, 0, 1.5, 0.86, 0.9, 0.92, 0.06, 0.06)
  bx(r.tail, dark, 0, 0.84, 0.93, 0.1, 0.18, 0.1)
  return { r, c, a: { family: 'quad', height: 1.76, freq: 0.75, run: 'gallop', gz: grazeCfg(c, -1.3, -0.5, -0.12), rear: 0.6, tailAxis: 'z', charge: -0.6, ram: -0.95, ramTip: -0.1 } }
}

function longhorn(rig, o) {
  const tan = tint(o.color || '#b8743a', o.shade)
  const T = fur(tan)
  const tanM = mat(tan)
  const W = fur('#f2ebde')
  const whiteM = mat('#f2ebde')
  const pink = mat('#d9a08e')
  const hoof = mat('#2a2420', 0.6)
  const horn = mat('#ece2c6', 0.55)
  const hornTip = mat('#8a7a5e', 0.5)
  const c = {
    hipY: 0.9, backZ: 0.56, shY: 0.92, frontZ: -0.56, legX: 0.23, cy: 1.14, cz: 0,
    neck: [1.22, -0.74], tip: [1.2, -1.02], tail: [1.4, 0.78],
    front: { thigh: tanM, shin: whiteM, hoof, tw: 0.17, td: 0.23, sw: 0.11, hw: 0.12, hh: 0.08, hd: 0.15 },
    hind: { thigh: tanM, shin: whiteM, hoof, tw: 0.17, td: 0.3, sw: 0.11, hw: 0.12, hh: 0.08, hd: 0.15 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, T, 0, 1.14, 0, 0.74, 0.58, 1.5)
  sb(r.breath, W, -0.2, 1.22, 0.22, 0.36, 0.44, 0.52)
  sb(r.breath, W, 0.22, 1.1, -0.28, 0.32, 0.42, 0.44)
  link(r.head, tanM, 0, 1.3, -0.66, 1.26, -1.0, 0.32, 0.36, 0, true)
  bx(r.tip, whiteM, 0, 1.26, -1.1, 0.32, 0.34, 0.4, 0, 0, 0, true)
  bx(r.tip, tanM, 0, 1.36, -1.1, 0.34, 0.14, 0.3) // tan band over the eyes
  r.muzzle = bx(r.tip, pink, 0, 1.12, -1.36, 0.28, 0.2, 0.16)
  r.jaw = grp(r.tip, 0, 1.04, -1.22)
  bx(r.jaw, pink, 0, 1.02, -1.33, 0.24, 0.05, 0.18)
  eyesOn(r, r.tip, 0.172, 1.36, -1.16, 0.012, 0.045, 0.045)
  earsOn(r, tanM, G.box, 0.16, 1.32, -0.98, 0.26, 1.3, -0.98, 0.16, 0.05, 0.09, 0.3)
  // Very wide horns (~1.9 m tip to tip): a long bar each side, tips curving up and forward.
  for (const s of SIDES) {
    bx(r.tip, horn, s * 0.5, 1.46, -1.0, 0.76, 0.075, 0.075, 0, 0, s * 0.08)
    bx(r.tip, hornTip, s * 0.92, 1.57, -1.06, 0.06, 0.24, 0.06, -0.3, 0, -s * 0.55)
  }
  link(r.tail, tanM, 0, 1.4, 0.78, 0.82, 0.82, 0.05, 0.05)
  bx(r.tail, whiteM, 0, 0.78, 0.83, 0.09, 0.15, 0.09)
  return { r, c, a: { family: 'quad', height: 1.62, freq: 0.8, run: 'gallop', gz: grazeCfg(c, -1.35, -0.5, -0.12), rear: 0.6, tailAxis: 'z', charge: -0.55, ram: -0.9, ramTip: 0 } }
}

function jaguar(rig, o) {
  const coat = tint(o.color || '#d99a3a', o.shade)
  const M = fur(coat)
  const coatM = mat(coat)
  const light = mat('#f3e2c0')
  const spot = mat('#2a1c12', 0.8)
  const paw = mat(tint(coat, 0.85))
  const c = {
    hipY: 0.6, backZ: 0.4, shY: 0.62, frontZ: -0.42, legX: 0.13, cy: 0.76, cz: -0.02,
    neck: [0.82, -0.5], tip: [0.86, -0.62], tail: [0.84, 0.5],
    front: { thigh: coatM, shin: coatM, hoof: paw, tw: 0.13, td: 0.17, sw: 0.1, sd: 0.11, hw: 0.13, hh: 0.06, hd: 0.15 },
    hind: { thigh: coatM, shin: coatM, hoof: paw, tw: 0.14, td: 0.24, sw: 0.1, sd: 0.11, hw: 0.13, hh: 0.06, hd: 0.15 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, M, 0, 0.76, -0.02, 0.42, 0.34, 1.06)
  bx(r.breath, light, 0, 0.6, -0.08, 0.32, 0.04, 0.8)
  // Rosettes: a few dark squares on the flanks and back.
  bx(r.breath, spot, -0.212, 0.82, -0.24, 0.012, 0.08, 0.1)
  bx(r.breath, spot, -0.212, 0.7, 0.16, 0.012, 0.07, 0.09)
  bx(r.breath, spot, 0.212, 0.78, -0.04, 0.012, 0.08, 0.1)
  bx(r.breath, spot, 0.08, 0.931, 0.24, 0.1, 0.012, 0.09)
  link(r.head, coatM, 0, 0.8, -0.46, 0.88, -0.62, 0.24, 0.24, 0, true)
  sb(r.tip, M, 0, 0.9, -0.7, 0.3, 0.26, 0.26)
  r.muzzle = bx(r.tip, light, 0, 0.84, -0.88, 0.18, 0.12, 0.12)
  bx(r.tip, mat('#8a4a3a', 0.45), 0, 0.88, -0.945, 0.07, 0.04, 0.02)
  r.jaw = grp(r.tip, 0, 0.8, -0.78)
  bx(r.jaw, light, 0, 0.78, -0.87, 0.15, 0.04, 0.13)
  eyesOn(r, r.tip, 0.075, 0.95, -0.836, 0.05, 0.035, 0.012)
  earsOn(r, coatM, G.box, 0.1, 1.03, -0.66, 0.11, 1.07, -0.66, 0.08, 0.08, 0.04, 0.15)
  // Long tail: three segments, down then curling up to a dark tip.
  link(r.tail, coatM, 0, 0.86, 0.5, 0.62, 0.86, 0.08, 0.08, 0.02, true)
  const t2 = grp(r.tail, 0, 0.62, 0.86)
  link(t2, coatM, 0, 0.62, 0.86, 0.5, 1.18, 0.075, 0.075, 0.02)
  const t3 = grp(t2, 0, 0.5, 1.18)
  link(t3, spot, 0, 0.5, 1.18, 0.56, 1.38, 0.08, 0.08, 0.02)
  r.extra.push(t2, t3)
  r.tail2 = t2
  r.tail3 = t3
  return { r, c, a: { family: 'quad', height: 1.07, freq: 1.3, run: 'gallop', gz: grazeCfg(c, -0.9, -0.3, -0.08), rear: 0.9, tailAxis: 'y', charge: -0.3, tuck: 0 } }
}

function polarbear(rig, o) {
  const coat = tint(o.color || '#f1eee4', o.shade)
  const M = fur(coat)
  const coatM = mat(coat)
  const paw = mat(tint(coat, 0.86))
  const dark = mat('#141416', 0.35)
  const c = {
    hipY: 0.95, backZ: 0.58, shY: 0.98, frontZ: -0.62, legX: 0.3, cy: 1.18, cz: 0,
    neck: [1.28, -0.78], tip: [1.22, -1.18], tail: [1.36, 0.84],
    front: { thigh: coatM, shin: coatM, hoof: paw, tw: 0.3, td: 0.34, sw: 0.26, sd: 0.28, hw: 0.3, hh: 0.11, hd: 0.36 },
    hind: { thigh: coatM, shin: coatM, hoof: paw, tw: 0.32, td: 0.44, sw: 0.26, sd: 0.28, hw: 0.3, hh: 0.11, hd: 0.36 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, M, 0, 1.18, 0, 1.0, 0.8, 1.72)
  sb(r.breath, M, 0, 1.6, 0.25, 0.7, 0.14, 0.7) // high rump
  link(r.head, coatM, 0, 1.3, -0.72, 1.24, -1.14, 0.5, 0.46, 0.06, true) // long neck
  sb(r.tip, M, 0, 1.24, -1.24, 0.44, 0.38, 0.42)
  r.muzzle = bx(r.tip, coatM, 0, 1.15, -1.54, 0.26, 0.2, 0.26)
  bx(r.tip, dark, 0, 1.22, -1.675, 0.12, 0.08, 0.03)
  r.jaw = grp(r.tip, 0, 1.06, -1.38)
  bx(r.jaw, coatM, 0, 1.04, -1.52, 0.22, 0.06, 0.24)
  eyesOn(r, r.tip, 0.11, 1.32, -1.456, 0.055, 0.055, 0.012)
  earsOn(r, coatM, G.box, 0.15, 1.42, -1.12, 0.18, 1.47, -1.12, 0.11, 0.1, 0.06, 0.2)
  bx(r.tail, coatM, 0, 1.32, 0.88, 0.14, 0.14, 0.1)
  const claw = mat('#2c2a28', 0.5)
  for (let i = 0; i < 2; i++) bx(r.knees[i], claw, SIDES[i] * c.legX, 0.035, c.frontZ - 0.24, 0.26, 0.045, 0.04)
  return { r, c, a: { family: 'quad', height: 1.7, freq: 0.8, run: 'gallop', gz: grazeCfg(c, -0.9, -0.35, -0.1), rear: 1.2, tailAxis: 'z', charge: -0.35, tuck: 0.3, swimHead: 0.3, swimPitch: 0.06 } }
}

function monkey(rig, o) {
  const coat = tint(o.color || '#7a5230', o.shade)
  const M = mat(coat)
  const face = mat('#e8c49a')
  const dark = mat(tint(coat, 0.7))
  const c = {
    hipY: 0.26, backZ: 0.13, shY: 0.4, frontZ: -0.13, legX: 0.08, cy: 0.42, cz: 0,
    neck: [0.52, -0.16], tip: [0.58, -0.2], tail: [0.32, 0.16],
    front: { thigh: M, shin: M, hoof: face, tw: 0.06, td: 0.07, sw: 0.05, hw: 0.065, hh: 0.035, hd: 0.08 },
    hind: { thigh: M, shin: M, hoof: face, tw: 0.08, td: 0.1, sw: 0.055, hw: 0.07, hh: 0.035, hd: 0.1 },
  }
  const r = quadRig(rig, c)
  // Long arms (front legs) put the shoulders well above the hips: the back slopes up.
  link(r.breath, M, 0, 0.3, 0.15, 0.48, -0.16, 0.2, 0.18, 0.06, true)
  link(r.breath, face, 0, 0.266, 0.13, 0.446, -0.18, 0.15, 0.14)
  bx(r.tip, M, 0, 0.6, -0.24, 0.2, 0.19, 0.18, 0, 0, 0, true)
  bx(r.tip, face, 0, 0.59, -0.335, 0.15, 0.13, 0.02)
  r.muzzle = bx(r.tip, face, 0, 0.54, -0.35, 0.1, 0.07, 0.06)
  r.jaw = grp(r.tip, 0, 0.51, -0.3)
  bx(r.jaw, face, 0, 0.5, -0.35, 0.08, 0.03, 0.06)
  eyesOn(r, r.tip, 0.035, 0.61, -0.347, 0.035, 0.035, 0.012)
  earsOn(r, face, G.box, 0.1, 0.61, -0.24, 0.115, 0.61, -0.24, 0.03, 0.07, 0.06, 0.1)
  // Curly tail: up and back, over, then curling forward.
  link(r.tail, M, 0, 0.32, 0.16, 0.52, 0.34, 0.04, 0.04, 0.02)
  const t2 = grp(r.tail, 0, 0.52, 0.34)
  link(t2, M, 0, 0.52, 0.34, 0.68, 0.3, 0.04, 0.04, 0.02)
  const t3 = grp(t2, 0, 0.68, 0.3)
  link(t3, dark, 0, 0.68, 0.3, 0.64, 0.2, 0.04, 0.04, 0.02)
  r.extra.push(t2, t3)
  r.tail2 = t2
  r.tail3 = t3
  r.arms = [r.legs[0], r.legs[1]]
  return { r, c, a: { family: 'quad', height: 0.72, freq: 1.8, run: 'bound', gz: grazeCfg(c, -0.6, -0.3, -0.05), rear: 1.0, tailAxis: 'z', charge: -0.25, pawA: 0.3, pawB: 0.5, climb: true, tuck: 0.2 } }
}

// Alligator pass after the quad pose: shorter leg swings and less roll on the
// stubby legs, the tail kept level with the ground (never pitched into it) and a
// lateral S-wave down the three tail pieces in every mode.
function gatorTail(u, T, mode, sp) {
  let a = 0.06
  let f = 0.35
  if (mode === 'walk' || mode === 'run' || mode === 'charge' || mode === 'ram') {
    for (let i = 0; i < 4; i++) {
      u.legs[i].rotation.x *= 0.55
      u.knees[i].rotation.x *= 0.55
    }
    u.body.rotation.z *= 0.4
  }
  if (mode === 'swim') {
    a = 0.32
    f = 1.1 * sp
  } else if (mode === 'walk') {
    a = 0.14
    f = u._freq * sp
  } else if (mode === 'run' || mode === 'charge' || mode === 'ram') {
    a = 0.2
    f = u._freq * sp * 1.9
  } else if (mode === 'snap') {
    a = 0.16
    f = 1.4 * sp
  }
  const w = TAU * f * T
  const s = u._seg
  u.tail.rotation.x = -u.body.rotation.x
  u.tail.rotation.y = a * sin(w)
  s[0].rotation.y = a * 1.3 * sin(w - 1)
  s[1].rotation.y = a * 1.6 * sin(w - 2)
}

function alligator(rig, o) {
  const skin = tint(o.color || '#4f6b2e', o.shade)
  const S = fur(skin)
  const skinM = mat(skin)
  const dark = mat(tint(skin, 0.7))
  const teeth = mat('#f4f0e2', 0.5)
  const c = {
    hipY: 0.26, backZ: 0.38, shY: 0.26, frontZ: -0.36, legX: 0.3, cy: 0.34, cz: 0,
    neck: [0.34, -0.56], tip: [0.34, -0.66], tail: [0.32, 0.6],
    front: { thigh: skinM, shin: skinM, hoof: dark, tw: 0.13, td: 0.14, sw: 0.1, hw: 0.16, hh: 0.05, hd: 0.18 },
    hind: { thigh: skinM, shin: skinM, hoof: dark, tw: 0.15, td: 0.18, sw: 0.11, hw: 0.17, hh: 0.05, hd: 0.2 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, S, 0, 0.34, 0, 0.56, 0.26, 1.2)
  sb(r.breath, fur(tint(skin, 0.7)), 0, 0.5, 0.04, 0.3, 0.06, 1.04) // back scutes
  bx(r.head, skinM, 0, 0.34, -0.68, 0.46, 0.24, 0.26, 0, 0, 0, true)
  sb(r.tip, S, 0, 0.38, -0.89, 0.4, 0.18, 0.34)
  r.muzzle = bx(r.tip, skinM, 0, 0.35, -1.27, 0.28, 0.1, 0.46, 0, 0, 0, true)
  for (const s of SIDES) bx(r.tip, skinM, s * 0.13, 0.49, -0.84, 0.1, 0.07, 0.12) // eye bumps
  eyesOn(r, r.tip, 0.13, 0.5, -0.902, 0.06, 0.04, 0.012)
  for (const s of SIDES) bx(r.tip, teeth, s * 0.125, 0.285, -1.24, 0.02, 0.03, 0.48)
  // Big lower jaw: jaw.rotation.x negative opens it.
  r.jaw = grp(r.tip, 0, 0.3, -0.78)
  bx(r.jaw, skinM, 0, 0.255, -1.14, 0.3, 0.08, 0.74, 0, 0, 0, true)
  bx(r.jaw, mat('#d77a78', 0.7), 0, 0.297, -1.08, 0.22, 0.008, 0.56)
  for (const s of SIDES) bx(r.jaw, teeth, s * 0.125, 0.31, -1.2, 0.02, 0.03, 0.44)
  sb(r.tail, S, 0, 0.32, 0.8, 0.4, 0.2, 0.42)
  const t2 = grp(r.tail, 0, 0.31, 0.99)
  sb(t2, S, 0, 0.3, 1.18, 0.28, 0.16, 0.4)
  const t3 = grp(t2, 0, 0.29, 1.36)
  bx(t3, skinM, 0, 0.28, 1.53, 0.16, 0.12, 0.36, 0, 0, 0, true)
  r.extra.push(t2, t3)
  r.seg = [t2, t3]
  return { r, c, a: { family: 'quad', height: 0.55, freq: 1.0, run: 'waddle', gz: grazeCfg(c, 0.02, 0, -0.02), rear: 0.35, tailAxis: 'y', charge: -0.1, ram: 0, ramTip: 0.05, snap: 0.8, swimTuck: 1, swimHead: 0.05, swimPitch: 0, tuck: 0.3, pounceHead: 0, post: gatorTail } }
}

function goat(rig, o) {
  const woolC = tint(o.color || '#f4f1e8', o.shade)
  const W = fur(woolC)
  const woolM = mat(woolC)
  const face = mat(tint(woolC, 0.95))
  const black = mat('#1c1a18', 0.5)
  const c = {
    hipY: 0.58, backZ: 0.3, shY: 0.6, frontZ: -0.32, legX: 0.13, cy: 0.82, cz: 0,
    neck: [0.92, -0.38], tip: [1.06, -0.52], tail: [0.96, 0.44],
    front: { thigh: woolM, shin: woolM, hoof: black, tw: 0.15, td: 0.18, sw: 0.08, hw: 0.09, hh: 0.06, hd: 0.11 },
    hind: { thigh: woolM, shin: woolM, hoof: black, tw: 0.16, td: 0.22, sw: 0.08, hw: 0.09, hh: 0.06, hd: 0.11 },
  }
  const r = quadRig(rig, c)
  sb(r.breath, W, 0, 0.82, 0, 0.44, 0.44, 0.88)
  sb(r.breath, W, 0, 1.05, -0.24, 0.38, 0.14, 0.36) // shoulder hump
  sb(r.breath, W, 0, 0.6, -0.02, 0.5, 0.14, 0.76) // shaggy skirt
  link(r.head, woolM, 0, 0.9, -0.34, 1.06, -0.54, 0.2, 0.22, 0.06, true)
  bx(r.tip, face, 0, 1.08, -0.6, 0.2, 0.22, 0.26, 0, 0, 0, true)
  r.muzzle = bx(r.tip, face, 0, 1.01, -0.78, 0.14, 0.14, 0.14)
  bx(r.tip, mat('#2a2624', 0.5), 0, 1.04, -0.855, 0.08, 0.04, 0.012)
  r.jaw = grp(r.tip, 0, 0.95, -0.7)
  bx(r.jaw, face, 0, 0.94, -0.78, 0.11, 0.04, 0.13)
  bx(r.jaw, woolM, 0, 0.86, -0.74, 0.08, 0.14, 0.07) // beard
  eyesOn(r, r.tip, 0.102, 1.11, -0.64, 0.012, 0.04, 0.04)
  earsOn(r, face, G.box, 0.1, 1.14, -0.52, 0.16, 1.13, -0.52, 0.12, 0.04, 0.06, 0.35)
  for (const s of SIDES) {
    bx(r.tip, black, s * 0.055, 1.25, -0.56, 0.04, 0.14, 0.045, 0.35)
    bx(r.tip, black, s * 0.06, 1.343, -0.494, 0.035, 0.1, 0.04, 1.0)
  }
  bx(r.tail, woolM, 0, 0.92, 0.47, 0.08, 0.12, 0.06)
  return { r, c, a: { family: 'quad', height: 1.36, freq: 1.3, run: 'bound', gz: grazeCfg(c, -1.2, -0.45, -0.1), rear: 0.9, tailAxis: 'z', charge: -0.5, ram: -0.75, ramTip: -0.55, tuck: 1 } }
}

function penguin(rig, o) {
  const back = tint(o.color || '#1e2230', o.shade)
  const B = mat(back)
  const white = mat('#f6f6f2')
  const orange = mat('#f0902a', 0.6)
  const yellow = mat('#ffc840', 0.6)
  const body = grp(rig, 0, 0.1, 0)
  const breath = grp(body, 0, 0.34, 0)
  const r = { body, breath, legs: [], knees: [], ears: [], eyes: [], jaw: null, arms: null, wings: [], extra: [] }
  bx(breath, B, 0, 0.34, 0.02, 0.36, 0.5, 0.3, 0, 0, 0, true)
  bx(breath, white, 0, 0.32, -0.125, 0.28, 0.4, 0.03)
  r.tail = grp(body, 0, 0.12, 0.16)
  bx(r.tail, B, 0, 0.09, 0.2, 0.14, 0.03, 0.1, -0.5)
  for (const s of SIDES) {
    const w = grp(body, s * 0.18, 0.5, 0)
    bx(w, B, s * 0.195, 0.34, 0.02, 0.03, 0.32, 0.14, 0, 0, 0, true)
    r.wings.push(w)
    const l = grp(rig, s * 0.08, 0.1, 0.02)
    bx(l, orange, s * 0.08, 0.06, 0.02, 0.06, 0.08, 0.06)
    bx(l, orange, s * 0.08, 0.012, -0.03, 0.1, 0.024, 0.16)
    r.legs.push(l)
  }
  r.head = grp(body, 0, 0.58, 0)
  r.tip = grp(r.head, 0, 0.62, -0.02)
  bx(r.tip, B, 0, 0.68, -0.02, 0.26, 0.2, 0.24, 0, 0, 0, true)
  bx(r.tip, white, 0, 0.67, -0.145, 0.2, 0.12, 0.012)
  for (const s of SIDES) bx(r.tip, yellow, s * 0.131, 0.65, 0.0, 0.012, 0.08, 0.1)
  eyesOn(r, r.tip, 0.055, 0.7, -0.153, 0.04, 0.04, 0.012)
  r.muzzle = bx(r.tip, orange, 0, 0.655, -0.19, 0.07, 0.04, 0.1)
  return { r, c: null, a: { family: 'bird', height: 0.78, freq: 2.2, waddle: true }, scale: 0.9 }
}

// Crab: legs [L front, L mid, L back, R front, R mid, R back] on the rig (rotation.z
// lifts), claws on `arms` (rotation.x raises, rotation.y folds in), pincer fingers
// in userData.pincers (rotation.x opens). Eye stalks are its `ears`.
const CRAB_SIDE = [-1, -1, -1, 1, 1, 1]
const CRAB_PH = [0, 0.5, 0, 0.5, 0, 0.5]
function crab(rig, o) {
  const shellC = tint(o.color || '#e2502e', o.shade)
  const S = mat(shellC, 0.6)
  const dark = mat(tint(shellC, 0.72), 0.6)
  const body = grp(rig, 0, 0.1, 0)
  const breath = grp(body, 0, 0.14, 0)
  const r = { body, breath, legs: [], knees: [], ears: [], eyes: [], jaw: null, arms: [], wings: null, extra: [], pincers: [] }
  bx(breath, S, 0, 0.14, 0, 0.32, 0.09, 0.22, 0, 0, 0, true)
  bx(breath, mat('#f7d6b4'), 0, 0.09, 0, 0.26, 0.02, 0.18)
  bx(breath, dark, 0, 0.12, -0.112, 0.08, 0.03, 0.01)
  r.head = grp(body, 0, 0.17, -0.08)
  r.tip = grp(r.head, 0, 0.17, -0.08)
  for (const s of SIDES) {
    const st = grp(r.tip, s * 0.05, 0.17, -0.09)
    bx(st, S, s * 0.05, 0.215, -0.09, 0.018, 0.09, 0.018)
    r.eyes.push(bx(st, EYE, s * 0.05, 0.27, -0.09, 0.04, 0.04, 0.04))
    r.ears.push(st)
    const arm = grp(body, s * 0.13, 0.13, -0.09)
    bx(arm, S, s * 0.16, 0.13, -0.145, 0.04, 0.04, 0.13, 0, -s * 0.5, 0)
    bx(arm, S, s * 0.2, 0.14, -0.26, 0.08, 0.07, 0.1, 0, 0, 0, true)
    bx(arm, S, s * 0.2, 0.125, -0.355, 0.045, 0.028, 0.1)
    const f = grp(arm, s * 0.2, 0.165, -0.305)
    bx(f, dark, s * 0.2, 0.165, -0.355, 0.04, 0.025, 0.1)
    r.arms.push(arm)
    r.extra.push(f)
    r.pincers.push(f)
  }
  for (let i = 0; i < 6; i++) {
    const s = CRAB_SIDE[i]
    const z = -0.06 + (i % 3) * 0.06
    const l = grp(rig, s * 0.15, 0.12, z)
    bx(l, S, s * 0.195, 0.14, z, 0.1, 0.025, 0.025, 0, 0, s * 0.42)
    bx(l, dark, s * 0.265, 0.08, z, 0.022, 0.17, 0.022, 0, 0, s * 0.3)
    r.legs.push(l)
  }
  return { r, c: null, a: { family: 'crab', height: 0.32, freq: 3.2 } }
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
  bull,
  longhorn,
  jaguar,
  monkey,
  alligator,
  polarbear,
  penguin,
  goat,
  crab,
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
  const { r, c, a, scale = 1 } = make(rig, { color: opts.color, shade }, rnd)
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
    // crab claw fingers (rotation.x opens), null for the others
    pincers: r.pincers || null,
    // quad leg geometry for planted-foot poses (pounce, steal)
    _legLen: c ? [c.shY, c.shY, c.hipY, c.hipY] : null,
    _fdy: c ? c.shY - c.hipY : 0,
    _fdz: c ? c.frontZ - c.backZ : 0,
    _pk: 0,
    _tuck: a.tuck ?? 0.3,
    _pHead: a.pounceHead ?? 0.15,
    _ram: a.ram ?? (a.charge ?? -0.4) - 0.35,
    _ramTip: a.ramTip ?? -0.1,
    _snapA: a.snap ?? 0.45,
    _swimTuck: a.swimTuck ?? 0,
    _swimHead: a.swimHead ?? 0.25,
    _swimPitch: a.swimPitch ?? 0.05,
    _climb: !!a.climb,
    _waddle: !!a.waddle,
    _post: a.post || null,
    _seg: r.seg || null,
    _pincers: r.pincers || null,
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
const frac = (v) => v - Math.floor(v)
const smooth = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v))
const lerp = (a, b, k) => a + (b - a) * k

// Fold quad leg i (Z-shape: thigh one way, shin the other) so its foot just reaches
// the ground from a hip at height hy (rig units) with the body pitched p.
// s = +1 thigh forward / shin back (hind), -1 the mirror (front). The shin tilts
// only SHIN x the thigh angle so big paws / hooves stay nearly flat.
const SHIN = 0.4
function plant(u, i, hy, p, s) {
  const q = hy / u._legLen[i]
  let a = 0
  if (q < 1) {
    // Solve 0.5 cos(a) + 0.5 cos(SHIN a) = q (knee at mid-leg) with a few Newton steps.
    a = Math.acos(q > -0.5 ? q : -0.5) * 1.2
    for (let n = 0; n < 4; n++) {
      const d = -0.5 * sin(a) - 0.5 * SHIN * sin(SHIN * a)
      if (d > -1e-4) break
      a -= (0.5 * cos(a) + 0.5 * cos(SHIN * a) - q) / d
    }
    a = a > 0 ? (a < 2.4 ? a : 2.4) : 0
  }
  u.legs[i].rotation.x = s * a - p
  u.knees[i].rotation.x = -s * (1 + SHIN) * a
}
function plantAll(u, p) {
  const hy = u.body.position.y
  const fy = hy + u._fdy * cos(p) - u._fdz * sin(p) // shoulders after the pitch
  plant(u, 0, fy, p, -1)
  plant(u, 1, fy, p, -1)
  plant(u, 2, hy, p, 1)
  plant(u, 3, hy, p, 1)
}

// Pounce timeline. The pose runs on k = pouncePhase(t, speed) of the RAW t passed
// to animateAnimal (no per-animal phase), so the caller can move the root in step:
//   root = start + dir * dist * pounceTravel(k), root.y += jumpHeight * pounceArc(k).
// k 0..0.4 crouch (+ rump wiggle), 0.4..0.5 launch, takeoff..land airborne,
// 0.78..0.9 landing squash, 0.9..1 recover. Pass time-since-start to play one pounce.
export const POUNCE = { period: 1.6, takeoff: 0.44, land: 0.78 }
const PK0 = 0.4
const PK1 = 0.5
const PK3 = 0.9
export function pouncePhase(t, speed = 1) {
  return frac((t * speed) / POUNCE.period)
}
// 0..1 height factor of the leap (0 on the ground, 1 at the top).
export function pounceArc(k) {
  if (k <= POUNCE.takeoff || k >= POUNCE.land) return 0
  return sin((Math.PI * (k - POUNCE.takeoff)) / (POUNCE.land - POUNCE.takeoff))
}
// 0..1 forward progress of the leap (0 before takeoff, 1 after landing).
export function pounceTravel(k) {
  return k <= POUNCE.takeoff ? 0 : k >= POUNCE.land ? 1 : (k - POUNCE.takeoff) / (POUNCE.land - POUNCE.takeoff)
}

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
  if ((mode === 'climb' || mode === 'steal') && !u._climb) mode = 'idle'
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
    case 'charge':
    case 'ram': {
      const run = mode !== 'walk'
      const type = run ? u._run : 'walk'
      const offs = GAITS[type]
      const f = u._freq * sp * (mode === 'charge' || mode === 'ram' ? 2.2 : run ? 1.9 : 1)
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
        } else if (mode === 'ram') {
          // Head low, horns / antlers / brow pointed forward, a butt jab each stride.
          neck.rotation.x = u._ram + 0.08 * s2
          neck.rotation.y = 0
          tip.rotation.x = u._ramTip - 0.06 * pos(s1)
          if (u.ears.length === 2) u.ears[0].rotation.x = u.ears[1].rotation.x = -0.5
          if (u.tail) u.tail.rotation.x = -0.9 + 0.1 * s2
        }
      }
      return
    }
    case 'pounce': {
      const k = u._pk
      const tk = u._tuck
      // Airborne leg pose (world angle from vertical, + = forward) and knees.
      const fa = lerp(1.25, 0.95, tk)
      const fk = lerp(0, -2.1, tk)
      const ha = lerp(-1.15, -0.85, tk)
      const hk = lerp(0.1, 0.45, tk)
      let p = 0
      let drop = 0
      let air = 0
      let la = 0 // reach down for the landing
      let ex = 0 // focus / excitement
      if (k < PK0) {
        const cr = smooth(k / PK0)
        p = -0.07 * cr
        drop = 0.26 * cr
        ex = cr
        body.rotation.y = 0.07 * cr * cr * sin(T * 15 * sp)
      } else if (k < PK1) {
        const e = smooth((k - PK0) / (PK1 - PK0))
        p = lerp(-0.07, 0.3, e)
        drop = lerp(0.26, -0.05, e)
        air = e
        ex = 1
      } else if (k < POUNCE.land) {
        const fl = (k - PK1) / (POUNCE.land - PK1)
        p = lerp(0.3, -0.25, smooth(fl))
        drop = -0.05
        air = 1
        la = smooth((fl - 0.45) / 0.55)
        ex = 1
      } else if (k < PK3) {
        const l = (k - POUNCE.land) / (PK3 - POUNCE.land)
        p = lerp(-0.25, 0, smooth(l))
        drop = 0.16 * sin(Math.PI * l)
        air = 1 - smooth(l / 0.5)
        la = 1
        ex = 1 - l
      }
      body.rotation.x = p
      body.position.y -= drop * h
      plantAll(u, p)
      if (air > 0) {
        const fA = lerp(fa, 0.45, la)
        const fK = lerp(fk, 0, la)
        const hA = lerp(ha, -0.3, la)
        const hK = lerp(hk, -0.4, la)
        for (let i = 0; i < 4; i++) {
          const fr = i < 2
          L[i].rotation.x = lerp(L[i].rotation.x, (fr ? fA : hA) - p, air)
          K[i].rotation.x = lerp(K[i].rotation.x, fr ? fK : hK, air)
        }
      }
      neck.rotation.x = -u._pHead * ex - 0.8 * p
      tip.rotation.x = 0.12 * ex
      if (u.jaw) u.jaw.rotation.x = -0.4 * air * (1 - 0.5 * la)
      if (u.ears.length === 2) u.ears[0].rotation.x = u.ears[1].rotation.x = -0.4 * ex
      if (u.tail) {
        u.tail.rotation.x = -0.2 - 0.5 * air
        swish(u, k < PK0 ? 0.3 * ex * sin(T * 10 * sp) : 0)
      }
      if (u._tail2) {
        u._tail2.rotation.x = 0.3 * air
        u._tail3.rotation.x = 0.3 * air
      }
      return
    }
    case 'snap': {
      // Jaw creeps open, holds, then slams shut; the body twists after the bite.
      const c = frac(T * 1.4 * sp)
      const o = c < 0.45 ? smooth(c / 0.45) : c < 0.6 ? 1 : c < 0.66 ? 1 - (c - 0.6) / 0.06 : 0
      const tw = c > 0.6 && c < 0.9 ? sin(((c - 0.6) / 0.3) * Math.PI) : 0
      if (u.jaw) u.jaw.rotation.x = -u._snapA * o
      tip.rotation.x = 0.22 * o
      neck.rotation.x = 0.45 * u._snapA * o // lift the head so the open jaw clears the ground
      neck.rotation.y = 0.3 * tw
      body.rotation.y = 0.14 * tw
      if (u.tail) swish(u, -0.3 * tw)
      breathe(u, T, 0.02)
      return
    }
    case 'swim': {
      // Body level, legs paddling (swimTuck 1: legs swept back, little strokes).
      const w = TAU * T * u._freq * sp * 1.1
      const tk = u._swimTuck
      for (let i = 0; i < 4; i++) {
        const p = w + (i === 0 || i === 3 ? 0 : Math.PI)
        const fr = i < 2
        L[i].rotation.x = lerp(fr ? 0.35 + 0.75 * sin(p) : -0.25 + 0.55 * sin(p), (fr ? -0.7 : -1.1) + 0.3 * sin(p), tk)
        K[i].rotation.x = -lerp(fr ? 0.9 : 0.6, 0.3, tk) * pos(cos(p))
      }
      body.position.y += 0.01 * h * sin(2 * w)
      body.rotation.z = 0.04 * sin(w)
      body.rotation.x = u._swimPitch
      neck.rotation.x = u._swimHead - u._swimPitch + 0.04 * sin(2 * w)
      if (u.tail) u.tail.rotation.x = -0.1
      if (u.ears.length === 2) u.ears[0].rotation.x = u.ears[1].rotation.x = -0.3
      return
    }
    case 'climb': {
      // Upright on a vertical vine (belly to -Z), hands reaching up in turn, feet
      // gripping. speed 0 = hanging still from both hands.
      const w = TAU * T * 0.9 * sp
      const p = 1.45
      body.rotation.x = p
      body.position.y += 0.08 * h * sin(2 * w)
      for (let i = 0; i < 2; i++) {
        const s = sp ? sin(w + i * Math.PI) : 0
        L[i].rotation.x = Math.PI - p + 0.1 + 0.4 * s
        K[i].rotation.x = -0.7 * pos(-s) - 0.15
        const g = sp ? sin(w + i * Math.PI + Math.PI) : -0.6
        L[i + 2].rotation.x = -p + 0.75 + 0.35 * g
        K[i + 2].rotation.x = -1.1 - 0.4 * g
      }
      neck.rotation.x = -1.0 + 0.1 * sin(T * 0.7)
      neck.rotation.y = 0.3 * sin(T * 0.5)
      if (u.tail) u.tail.rotation.x = 0.3 + 0.15 * sin(w)
      if (u._tail2) {
        u._tail2.rotation.x = 0.2 * sin(w - 0.7)
        u._tail3.rotation.x = 0.3 * sin(w - 1.4)
      }
      return
    }
    case 'steal': {
      // Sit up, both hands shoot forward, grab, pull the loot back to the chest.
      const c = frac(T * 0.8 * sp)
      const r = c < 0.3 ? smooth(c / 0.3) : c < 0.45 ? 1 : 1 - smooth((c - 0.45) / 0.55)
      const p = 0.85 - 0.25 * r
      body.rotation.x = p
      body.position.y -= 0.3 * h
      plant(u, 2, body.position.y, p, 1)
      plant(u, 3, body.position.y, p, 1)
      const g = lerp(0.5, 1.55, r)
      const e = lerp(1.9, 0, r)
      for (let i = 0; i < 2; i++) {
        L[i].rotation.x = g - p + 0.05 * i
        K[i].rotation.x = e
      }
      neck.rotation.x = -0.8 * p + 0.15 * r
      if (u.jaw) u.jaw.rotation.x = -0.2 * r
      if (u.ears.length === 2) u.ears[0].rotation.x = u.ears[1].rotation.x = -0.2 * r
      if (u.tail) u.tail.rotation.x = -0.4 * p
      if (u._tail2) u._tail3.rotation.x = 0.3 * sin(T * 3)
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
  if (mode === 'swim' && u._waddle) {
    // Penguin: belly down, flippers stroking, feet trailing.
    const w = T * 9 * sp
    body.rotation.x = -1.35
    const f = 0.25 + 0.7 * sin(w)
    W[0].rotation.z = -f
    W[1].rotation.z = f
    L[0].rotation.x = -1.35 + 0.25 * sin(w * 0.5)
    L[1].rotation.x = -1.35 - 0.25 * sin(w * 0.5)
    neck.rotation.x = 1.15 + 0.05 * sin(w)
    body.position.y += 0.02 * sin(w + 1)
    return
  }
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
      if (u._waddle) {
        // Penguin waddle: big side-to-side roll, flippers held out, no head bob.
        neck.position.z = u._headZ
        L[0].rotation.x = (run ? 0.45 : 0.3) * s
        L[1].rotation.x = -(run ? 0.45 : 0.3) * s
        body.rotation.z = (run ? 0.2 : 0.16) * s
        body.rotation.x = run ? -0.12 : 0
        neck.rotation.x = run ? 0.1 : 0
        body.position.y += 0.012 * Math.abs(s)
        const f = run ? 0.55 + 0.25 * sin(T * 16 * sp) : 0.4 + 0.06 * Math.abs(s)
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

// Crab: walk / run scuttle (legs lift in two alternating groups; the caller moves
// the root sideways along its local X), steal (claws reach forward, pinch, pull
// back), rear / wave (claws up), snap (pincers clack), dizzy, idle.
function crabPose(u, T, mode, sp) {
  const L = u.legs
  const A = u.arms
  const P = u._pincers
  const body = u.body
  let f = 0
  let ax = 0.3 // claws raised
  let ay = 0.5 // claws folded in
  let pin = 0.12 // pincers open
  switch (mode) {
    case 'walk':
      f = u._freq * sp
      break
    case 'run':
    case 'charge':
      f = u._freq * sp * 1.8
      ax = 0.5
      break
    case 'steal': {
      const c = frac(T * 0.8 * sp)
      let k
      if (c < 0.35) {
        k = smooth(c / 0.35)
        pin = 0.12 + 0.5 * k
      } else if (c < 0.5) {
        k = 1
        pin = 0.62 * (1 - smooth((c - 0.35) / 0.15))
      } else {
        k = 1 - smooth((c - 0.5) / 0.5)
        pin = 0
      }
      ay = 0.5 * (1 - k)
      ax = 0.3 - 0.32 * k
      body.rotation.x = -0.12 * k
      break
    }
    case 'rear':
    case 'wave': {
      const w = T * 8 * sp
      ax = 1.0 + 0.2 * sin(w)
      ay = 0.15
      A[0].rotation.z = -0.25 * sin(w)
      A[1].rotation.z = -0.25 * sin(w)
      pin = 0.35 + 0.3 * sin(w * 1.6)
      body.rotation.x = 0.12
      break
    }
    case 'snap':
      ax = 0.45
      ay = 0.3
      pin = 0.65 * pos(sin(T * 11 * sp))
      break
    case 'dizzy':
      body.rotation.z = 0.15 * sin(T * 3.3 * sp)
      ax = 0.1
      ay = 0.7
      pin = 0.3
      break
    default:
      pin = 0.12 + 0.45 * spike(sin(T * 0.9), 16) * pos(sin(T * 28))
  }
  for (let i = 0; i < 6; i++) {
    const s = CRAB_SIDE[i]
    if (f) {
      const p = TAU * (T * f + CRAB_PH[i])
      L[i].rotation.z = s * 0.38 * pos(sin(p))
      L[i].rotation.y = 0.12 * cos(p)
    } else L[i].rotation.z = s * 0.05 * spike(sin(T * 0.7 + i * 1.3), 8)
  }
  if (f) {
    const c = TAU * T * f
    body.position.y += 0.008 * Math.abs(sin(c))
    body.rotation.z = 0.05 * sin(c)
    ax += 0.08 * sin(c * 2)
  }
  for (let i = 0; i < 2; i++) {
    A[i].rotation.x = ax
    A[i].rotation.y = SIDES[i] * ay
    P[i].rotation.x = pin
  }
  u.ears[0].rotation.z = 0.12 * sin(T * 1.3)
  u.ears[1].rotation.z = -0.12 * sin(T * 1.1 + 1)
  breathe(u, T, 0.01)
}

// Pose `obj` (from buildAnimal) for time t (s). speed scales the gait / motion
// frequency. Allocation-free; unknown modes (or a mode a kind cannot do) = idle.
// mode:
//  idle | graze | walk | run | charge | rear | wave | dizzy (every kind)
//  ram    quads: gallop with the head low and horns / antlers forward (bull,
//         longhorn, goat, moose...)
//  pounce quads: crouch -> leap -> land on the raw-t timeline of pouncePhase();
//         the root is not moved, the caller moves it (pounceTravel / pounceArc)
//  snap   quads: jaw creeps open then slams shut + body twist (alligator!)
//  swim   quads: body level, legs paddling (alligator, bears...); penguin swims
//  climb  monkey: upright on a vertical vine, hands alternate up (speed 0 = hang)
//  steal  monkey: sit up, grab forward, pull back; crab: claws reach and pinch
// Penguin walk / run = waddle; crab walk / run = sideways scuttle.
export function animateAnimal(obj, t, mode = 'idle', speed = 1) {
  const u = obj.userData
  if (!u || !u._joints) return
  const T = t + u.phase
  rest(u)
  if (u._family === 'quad') {
    if (mode === 'pounce') u._pk = pouncePhase(t, speed)
    quadPose(u, T, mode, speed)
  } else if (u._family === 'biped') humanPose(u, T, mode, speed)
  else if (u._family === 'crab') crabPose(u, T, mode, speed)
  else birdPose(u, T, mode, speed)
  if (u._post) u._post(u, T, mode, speed)
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
// Big flyers (eagle, seagull) in the same style, built at eagle size and scaled by S.
// Adds userData.feet [L, R] (pivots at the hips; rotation.x + = feet forward) and
// userData.grab (a Group on the body that animateBird keeps between the talons:
// attach a carried / stolen object to it).
function bigFlyer(kind, S, C) {
  const root = new Group()
  const body = grp(root)
  const B = (p, m, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0, sh = false) => bx(p, m, x * S, y * S, z * S, w * S, h * S, d * S, rx, ry, rz, sh)
  const J = (p, x, y, z) => grp(p, x * S, y * S, z * S)
  const eyes = []
  const wings = []
  const tips = []
  const feet = []
  B(body, C.body, 0, 0, 0, 0.26, 0.24, 0.56, 0, 0, 0, true)
  B(body, C.head, 0, 0.04, -0.32, 0.18, 0.18, 0.14)
  B(body, C.head, 0, 0.07, -0.43, 0.17, 0.16, 0.18, 0, 0, 0, true)
  B(body, C.beak, 0, 0.06, -0.56, 0.08, 0.08, 0.1)
  if (C.hook) B(body, C.beak, 0, 0.03, -0.615, 0.05, 0.08, 0.035, -0.35) // hooked tip
  else B(body, C.spot, 0, 0.035, -0.585, 0.05, 0.03, 0.03) // gull's red spot
  for (const s of SIDES) eyes.push(B(body, EYE, s * 0.086, 0.09, -0.46, 0.012, 0.03, 0.04))
  B(body, C.tail, 0, 0.01, 0.4, 0.3, 0.03, 0.28, 0, 0, 0, true)
  for (const s of SIDES) {
    const w = J(body, s * 0.13, 0.04, -0.06)
    B(w, C.wing, s * 0.37, 0.04, -0.02, 0.48, 0.04, 0.38, 0, 0, 0, true)
    B(w, C.covert, s * 0.37, 0.065, -0.14, 0.46, 0.015, 0.12)
    const t = J(w, s * 0.6, 0.04, -0.04)
    B(t, C.wing, s * 0.82, 0.04, 0.0, 0.44, 0.035, 0.3, 0, 0, 0, true)
    B(t, C.tipM, s * 1.06, 0.04, -0.08, 0.16, 0.025, 0.06, 0, -s * 0.15, 0)
    B(t, C.tipM, s * 1.05, 0.04, 0.06, 0.16, 0.025, 0.06, 0, -s * 0.3, 0)
    wings.push(w)
    tips.push(t)
    const f = J(body, s * 0.07, -0.1, 0.06)
    B(f, C.thigh, s * 0.07, -0.15, 0.06, 0.08, 0.12, 0.09)
    B(f, C.leg, s * 0.07, -0.25, 0.06, 0.035, 0.12, 0.035)
    B(f, C.leg, s * 0.07, -0.31, 0.04, 0.08, 0.025, 0.09)
    B(f, C.talon, s * 0.07, -0.325, -0.005, 0.085, 0.03, 0.025, 0.5)
    f.rotation.x = -1.35
    feet.push(f)
  }
  const grab = J(body, 0, -0.33, 0.06)
  root.userData = {
    kind, body, wings, wingTips: tips, feet, grab, eyes,
    phase: nextSeed() % 50,
    _flapRate: S > 0.75 ? 6 : 9.5,
    _footY: -0.1 * S,
    _footZ: 0.06 * S,
    _footL: 0.23 * S,
  }
  animateBird(root, 0, 0)
  return root
}
// Eagle: ~2.2 m wingspan, ~0.85 m beak to tail, white head and tail, hooked beak, talons.
export function buildEagle() {
  const brown = mat('#4a2e1c')
  const white = mat('#f6f4ee')
  const yellow = mat('#f2b632', 0.5)
  return bigFlyer('eagle', 1, {
    body: brown, head: white, beak: yellow, wing: mat('#3e2616'), covert: mat('#6a4a30'), tipM: mat('#24160e'),
    tail: white, thigh: brown, leg: yellow, talon: mat('#1a1614', 0.4), hook: true,
  })
}
// Seagull: ~1.1 m wingspan, white with grey wings, black wingtips, yellow beak + red spot.
export function buildSeagull() {
  const white = mat('#f4f6f8')
  const feet = mat('#ec9a6a', 0.6)
  return bigFlyer('seagull', 0.5, {
    body: white, head: white, beak: mat('#f2c230', 0.5), spot: mat('#d8262b', 0.5), wing: mat('#a4adb6'), covert: mat('#c4ccd4'),
    tipM: mat('#1c1c22'), tail: white, thigh: white, leg: feet, talon: feet, hook: false,
  })
}

// Flap a bird, bat, eagle or seagull. flap 0 = glide, 1 = full flapping.
// dive 0..1 (optional): 0..0.6 tucks the wings back into a nose-down stoop, then
// 0.55..1 flares (nose up, wings up) and swings the feet forward for a talon strike.
// With dive 0 a bird / bat is posed exactly as before.
export function animateBird(obj, t, flap = 1, dive = 0) {
  const u = obj.userData
  const T = (t + u.phase) * u._flapRate
  const d = dive > 0 ? (dive < 1 ? dive : 1) : 0
  const fl = d > 0 ? flap * (1 - 0.85 * d) : flap
  const st = d > 0.55 ? smooth((d - 0.55) / 0.45) : 0
  const a = 0.15 * (1 - fl) * sin(T * 0.15) + fl * 0.85 * sin(T) + 0.5 * st
  const b = fl * 0.5 * sin(T - 0.9)
  u.wings[0].rotation.z = -a
  u.wings[1].rotation.z = a
  u.wingTips[0].rotation.z = -b
  u.wingTips[1].rotation.z = b
  u.body.position.y = -0.02 * fl * sin(T + 0.6)
  if (u.feet || d > 0 || u._dv) {
    const tuck = (d < 0.6 ? d / 0.6 : 1) * (1 - 0.5 * st)
    u.wings[0].rotation.y = tuck
    u.wings[1].rotation.y = -tuck
    u.wingTips[0].rotation.y = 0.6 * tuck
    u.wingTips[1].rotation.y = -0.6 * tuck
    u.body.rotation.x = -0.5 * tuck * (1 - st) + 0.45 * st
    if (u.feet) {
      const th = -1.35 + 2.25 * st
      u.feet[0].rotation.x = u.feet[1].rotation.x = th
      u.grab.position.set(0, u._footY - u._footL * cos(th), u._footZ - u._footL * sin(th))
    }
    u._dv = d > 0
  }
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
