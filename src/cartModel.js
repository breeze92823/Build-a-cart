// The mine cart and everything bolted onto it. Model space: origin on the rail
// tops under the cart's centre, forward = -Z, up = +Y. The equipped gear shows:
// the engine at the back, the fuel tank on a front platform, boosters on both
// sides and the wheel set underneath. Exhaust and flame tips are recorded in
// userData so the ride can spawn smoke and fire there.
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { studBox, studMat } from './studs.js'
import { neon } from './propkit.js'

const mats = new Map()
function mat(color, rough = 0.5, metal = 0.2, extra = {}) {
  const key = `${color}|${rough}|${metal}|${JSON.stringify(extra)}`
  let m = mats.get(key)
  if (!m) mats.set(key, (m = new MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra })))
  return m
}
const CHROME = () => mat('#d9dee6', 0.22, 0.9)
const DARK = () => mat('#2a2f3a', 0.55, 0.5)
const RUBBER = () => mat('#1b1b1f', 0.9, 0)
// See-through (ghosts, glass, water) and self-lit (liquids, crystals) variants.
const clear = (color, opacity = 0.55, rough = 0.3) => mat(color, rough, 0.05, { transparent: true, opacity, depthWrite: false })
const lit = (color, k = 0.5, rough = 0.4, extra = {}) => mat(color, rough, 0.1, { emissive: color, emissiveIntensity: k, ...extra })
const stone = (color, k = 0) => mat(color, 0.95, 0.05, k ? { flatShading: true, emissive: color, emissiveIntensity: k } : { flatShading: true })
// Neon materials are cached too (thumbnails build every model once more).
const neons = new Map()
function glowM(color, k = 2.5) {
  const key = `${color}|${k}`
  let m = neons.get(key)
  if (!m) neons.set(key, (m = neon(color, k)))
  return m
}

// Flat 2D outline extruded 1 m along Z, centred on the extrusion.
function prism(pts) {
  const g = new ExtrudeGeometry(new Shape(pts.map(([x, y]) => new Vector2(x, y))), { depth: 1, bevelEnabled: false })
  g.translate(0, 0, -0.5)
  return g
}
const geo = {
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(1, 1, 1, 18),
  cyl8: new CylinderGeometry(1, 1, 1, 8),
  sphere: new SphereGeometry(1, 14, 10),
  torus: new TorusGeometry(1, 0.22, 8, 20),
  ring: new TorusGeometry(1, 0.07, 6, 28), // thin hoop
  gear: new TorusGeometry(1, 0.12, 6, 22),
  rockRing: new TorusGeometry(1, 0.34, 5, 8), // chunky octagon ring
  cone: new CylinderGeometry(0, 1, 1, 8), // apex at +Y
  rib: new CylinderGeometry(1, 0.3, 1, 6), // wide end at +Y
  pot: new CylinderGeometry(1, 0.78, 1, 10),
  hemi: new SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
  bowl: new SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), // open top
  halfDisc: new CylinderGeometry(1, 1, 1, 16, 1, false, -Math.PI / 2, Math.PI), // +Z half
  octa: new OctahedronGeometry(1),
  ico: new IcosahedronGeometry(1, 0),
  taper4: new CylinderGeometry(1, 0.78, 1, 4).rotateY(Math.PI / 4), // square, narrower at the bottom
  sail: prism([[0, 0], [0, 1], [1, 0]]), // right triangle, mast edge on x = 0
  // Engine block's top: side profile (z, y), extruded along X.
  notch: prism([[-0.42, 0], [0.42, 0], [0.42, 0.14], [0.08, 0.36], [-0.42, 0.36]]).rotateY(-Math.PI / 2),
  // Coffin outline (top view); extruded up Y from 0 to 1, head towards -Z.
  coffin: prism([[-0.22, 0.55], [-0.34, 0.28], [-0.2, -0.55], [0.2, -0.55], [0.34, 0.28], [0.22, 0.55]]).translate(0, 0, 0.5).rotateX(-Math.PI / 2),
}

function part(parent, g, m, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const o = new Mesh(g, m)
  o.position.set(x, y, z)
  o.scale.set(sx, sy, sz)
  o.rotation.set(rx, ry, rz)
  o.castShadow = true
  o.receiveShadow = true
  parent.add(o)
  return o
}
const box = (p, m, x, y, z, w, h, d, rx, ry, rz) => part(p, geo.box, m, x, y, z, w, h, d, rx, ry, rz)
// Cylinder along Y by default; axis 'x' or 'z' turns it.
function cyl(p, m, x, y, z, r, len, axis = 'y', g = geo.cyl) {
  const rx = axis === 'z' ? Math.PI / 2 : 0
  const rz = axis === 'x' ? Math.PI / 2 : 0
  return part(p, g, m, x, y, z, r, len, r, rx, 0, rz)
}

// --- Body -------------------------------------------------------------------------
const BODY = { len: 2.5, wid: 1.8, y0: 0.62, h: 1.22, lean: 0.14 }

function body(parent, color, stripe) {
  const g = new Group()
  const shell = studMat(color, { rough: 0.55, metal: 0.25 })
  const rim = mat('#0f1525', 0.45, 0.5)
  const { len, wid, y0, h, lean } = BODY
  const cy = y0 + h / 2
  // Four leaning walls make the hopper shape; a floor inside.
  for (const s of [-1, 1]) {
    const w = new Mesh(studBox(0.14, h, len), shell)
    w.position.set(s * (wid / 2), cy, 0)
    w.rotation.z = -s * lean
    w.castShadow = w.receiveShadow = true
    g.add(w)
    const e = new Mesh(studBox(wid + 0.1, h, 0.14), shell)
    e.position.set(0, cy, s * (len / 2))
    e.rotation.x = s * lean
    e.castShadow = e.receiveShadow = true
    g.add(e)
  }
  box(g, shell, 0, y0 + 0.08, 0, wid - 0.1, 0.16, len - 0.1)
  // Rim around the top edge.
  const topW = wid + 2 * Math.sin(lean) * h * 0.5
  const topL = len + 2 * Math.sin(lean) * h * 0.5
  for (const s of [-1, 1]) {
    box(g, rim, s * (topW / 2 + 0.02), y0 + h, 0, 0.2, 0.16, topL + 0.22)
    box(g, rim, 0, y0 + h, s * (topL / 2 + 0.02), topW + 0.2, 0.16, 0.2)
  }
  // Glowing stripe along both sides and the back.
  if (stripe) {
    const glowM = neon(stripe, 2.4)
    for (const s of [-1, 1]) box(g, glowM, s * (wid / 2 + 0.13), y0 + h * 0.62, 0, 0.04, 0.1, len * 0.7, 0, 0, -s * lean)
  }
  // Bottom band + rivets.
  for (const s of [-1, 1]) {
    box(g, rim, s * (wid / 2 - 0.02), y0 + 0.12, 0, 0.18, 0.2, len + 0.1)
    for (let k = -2; k <= 2; k++) part(g, geo.sphere, CHROME(), s * (wid / 2 + 0.05), y0 + 0.14, k * 0.55, 0.05, 0.05, 0.05)
  }
  parent.add(g)
  return g
}

function chassis(parent, extendBack, extendFront) {
  const frame = DARK()
  box(parent, frame, 0, 0.55, (extendBack - extendFront) / 2, 1.3, 0.14, BODY.len + extendBack + extendFront)
  for (const s of [-1, 1]) box(parent, frame, s * 0.62, 0.48, 0, 0.12, 0.2, BODY.len + 0.3)
  // Couplers.
  box(parent, frame, 0, 0.5, -(BODY.len / 2 + extendFront + 0.25), 0.3, 0.18, 0.5)
  box(parent, frame, 0, 0.5, BODY.len / 2 + extendBack + 0.25, 0.3, 0.18, 0.5)
  for (const s of [-1, 1]) part(parent, geo.torus, CHROME(), 0, 0.5, s * (BODY.len / 2 + (s > 0 ? extendBack : extendFront) + 0.5), 0.12, 0.12, 0.12, 0, Math.PI / 2, 0)
}

// --- Wheels -------------------------------------------------------------------------
export const WHEEL_R = 0.38
function wheelSet(parent, wheels) {
  const spin = []
  const style = wheels?.id ?? 'wooden'
  const xs = [-0.75, 0.75]
  const zs = [-0.82, 0.82]
  if (style === 'hover') {
    const glowM = neon('#33e6ff', 3)
    for (const x of xs) for (const z of zs) {
      cyl(parent, mat('#202a3a', 0.3, 0.7), x, 0.36, z, 0.36, 0.14)
      cyl(parent, glowM, x, 0.27, z, 0.3, 0.04)
    }
    // Axles still there for looks.
    for (const z of zs) cyl(parent, DARK(), 0, 0.42, z, 0.06, 1.5, 'x')
    return { spin, hover: true }
  }
  for (const z of zs) cyl(parent, DARK(), 0, WHEEL_R, z, 0.06, 1.62, 'x')
  for (const x of xs) {
    for (const z of zs) {
      const w = new Group()
      w.position.set(x, WHEEL_R, z)
      parent.add(w)
      spin.push(w)
      const side = Math.sign(x)
      if (style === 'wooden') {
        cyl(w, mat('#8b5a2b', 0.85, 0), 0, 0, 0, WHEEL_R, 0.16, 'x', geo.cyl8)
        cyl(w, mat('#5f3a19', 0.85, 0), side * 0.03, 0, 0, 0.12, 0.2, 'x')
        for (let k = 0; k < 4; k++) box(w, mat('#4a2c12', 0.9, 0), side * 0.08, 0, 0, 0.03, WHEEL_R * 1.7, 0.05, k * (Math.PI / 4), 0, 0)
        // Iron flange on the rail side.
        cyl(w, mat('#555b66', 0.5, 0.7), -side * 0.07, 0, 0, WHEEL_R + 0.05, 0.03, 'x')
      } else {
        const rim = style === 'sport' ? '#e74c3c' : style === 'racing' ? '#f1c40f' : '#9aa3ae'
        const width = style === 'racing' ? 0.24 : 0.18
        cyl(w, RUBBER(), 0, 0, 0, WHEEL_R, width, 'x')
        cyl(w, mat(rim, 0.3, 0.7), side * 0.01, 0, 0, WHEEL_R * 0.62, width + 0.02, 'x')
        for (let k = 0; k < 5; k++) box(w, mat(rim, 0.3, 0.7), side * (width / 2 + 0.01), 0, 0, 0.03, WHEEL_R * 1.15, 0.06, k * ((Math.PI * 2) / 5), 0, 0)
        cyl(w, CHROME(), side * (width / 2 + 0.03), 0, 0, 0.07, 0.05, 'x')
        cyl(w, mat('#555b66', 0.5, 0.7), -side * (width / 2 + 0.02), 0, 0, WHEEL_R + 0.05, 0.03, 'x')
      }
    }
  }
  return { spin, hover: false }
}

// --- Shape helpers --------------------------------------------------------------------
const UP = new Vector3(0, 1, 0)
const v3 = (x, y, z) => new Vector3(x, y, z)
// Mesh stretched from a to b (the geometry's +Y end at b); r = radius / width.
function seg(p, m, a, b, r, g = geo.cyl) {
  const d = new Vector3().subVectors(b, a)
  const len = d.length()
  const o = new Mesh(g, m)
  o.position.copy(a).addScaledVector(d, 0.5)
  o.scale.set(r, len, r)
  o.quaternion.setFromUnitVectors(UP, d.divideScalar(len))
  o.castShadow = o.receiveShadow = true
  p.add(o)
  return o
}
// Five-armed star centred on c, lying flat (XZ) and tilted by rx about X
// (rx = PI/2 stands it up facing +Z). One arm points to -Z (flat) / up (standing).
function starfish(p, m, c, r, rx, w = 0.32) {
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (k * Math.PI * 2) / 5
    const dx = Math.cos(a)
    const dz0 = -Math.sin(a)
    const dy = -dz0 * Math.sin(rx)
    const dz = dz0 * Math.cos(rx)
    part(p, geo.cone, m, c.x + (dx * r) / 2, c.y + (dy * r) / 2, c.z + (dz * r) / 2, r * w * 0.4, r, r * w, rx, a, -Math.PI / 2)
  }
  part(p, geo.sphere, m, c.x, c.y, c.z, r * 0.3, r * 0.3, r * 0.3)
}
// Hoop around the Y axis (torus geometries lie in XY by default).
const hoop = (p, m, x, y, z, r, g = geo.ring) => part(p, g, m, x, y, z, r, r, r, Math.PI / 2, 0, 0)
// Capsule standing on y = 0: radius r, straight section h.
function capsule(p, m, r, h) {
  part(p, geo.sphere, m, 0, r, 0, r, r, r)
  cyl(p, m, 0, r + h / 2, 0, r, h)
  part(p, geo.sphere, m, 0, r + h, 0, r, r, r)
}

// --- Engines ------------------------------------------------------------------------
// Built around (0, 0, 0) = bottom centre; size ~1.1 x 0.9..1.3 x 1, back of the cart
// = +Z. userData.exhausts = local tips (smoke), userData.nozzle = big flame tip.

// V engines: n cylinders a side. n <= 4 gets the classic per-cylinder heads, longer
// blocks get one long head per side with fins (ribs); `blower` = the OP V8 supercharger.
function vEngine(g, pipe, { n, block, head, rib, wide = 1, blower = false }) {
  const sp = Math.min(0.26, 1.0 / n)
  const len = sp * n + 0.2
  box(g, block, 0, 0.28, 0, 0.7 * wide, 0.56, len)
  box(g, mat('#2a2e35', 0.6, 0.5), 0, 0.06, 0, 0.8 * wide, 0.12, len + 0.1) // oil pan
  for (const s of [-1, 1]) {
    const tilt = s * 0.55
    if (n <= 4) {
      for (let k = 0; k < n; k++) {
        const z = (k - (n - 1) / 2) * sp
        box(g, head, s * 0.38 * wide, 0.72, z, 0.36, 0.24, sp - 0.04, 0, 0, tilt) // cylinder head
        cyl(g, CHROME(), s * 0.56 * wide, 0.6, z, 0.05, 0.22, 'x')
      }
    } else {
      box(g, head, s * 0.38 * wide, 0.72, 0, 0.36, 0.24, len - 0.12, 0, 0, tilt)
      for (let k = 0; k < n; k++) box(g, rib, s * 0.39 * wide, 0.73, (k - (n - 1) / 2) * sp, 0.42, 0.28, sp * 0.35, 0, 0, tilt)
    }
    box(g, head, s * 0.36 * wide, 0.86, 0, 0.3, 0.08, len, 0, 0, tilt) // valve cover
    pipe(s * 0.5 * wide, 0.35, len / 2, 0.45)
  }
  if (blower) {
    box(g, mat('#c9ccd3', 0.25, 0.9), 0, 0.98, 0, 0.42, 0.32, 0.55)
    box(g, mat('#1a1a1a', 0.6, 0.2), 0, 1.2, -0.05, 0.36, 0.14, 0.3)
    for (let k = 0; k < 3; k++) box(g, mat('#f4c21b', 0.3, 0.6), 0, 1.0, -0.2 + k * 0.2, 0.46, 0.06, 0.06)
  } else {
    for (const z of n > 4 ? [-len / 4, len / 4] : [0]) {
      cyl(g, CHROME(), 0, 0.98, z, 0.18, 0.12)
      cyl(g, mat('#c0392b', 0.5, 0.2), 0, 1.07, z, 0.2, 0.06)
    }
  }
  box(g, mat('#1a1a1a', 0.7, 0.1), 0, 0.35, -len / 2 - 0.08, 0.5, 0.42, 0.06) // belt cover
}

// Mast + triangular sail (the plain and the ghost one).
function sailRig(g, baseM, mastM, clothM) {
  box(g, baseM, 0, 0.07, 0, 0.6, 0.14, 0.6)
  cyl(g, mastM, -0.25, 0.72, 0, 0.035, 1.16)
  cyl(g, mastM, 0.11, 0.28, 0, 0.025, 0.74, 'x') // boom
  part(g, geo.sail, clothM, -0.22, 0.3, 0, 0.68, 0.92, 0.03, 0, -0.12, 0)
}

const ENGINES = {
  rusty(g, { pipe }) {
    box(g, mat('#8a5a3c', 0.95, 0.2), 0, 0.3, 0, 0.8, 0.6, 0.7)
    cyl(g, mat('#6d4630', 0.9, 0.3), 0, 0.75, 0, 0.22, 0.35, 'y', geo.cyl8)
    for (let k = 0; k < 4; k++) box(g, mat('#5b3a26', 0.95, 0.2), 0, 0.62 + k * 0.07, 0, 0.5, 0.025, 0.5)
    box(g, mat('#c47a3a', 0.9, 0.2), 0.42, 0.35, 0.1, 0.06, 0.3, 0.3) // pull cord housing
    pipe(-0.25, 0.5, 0.3, 0.4, true)
  },
  // Toy-brick engine block: studs on the flat front, bevelled notch at the back.
  engine(g, { body, pipe }) {
    box(g, body, 0, 0.25, 0, 1.0, 0.5, 0.86)
    part(g, geo.notch, body, 0, 0.5, 0, 0.9, 1, 1)
    for (const x of [-0.22, 0.22]) for (const z of [-0.3, -0.07]) cyl(g, body, x, 0.89, z, 0.09, 0.06)
    for (let k = 0; k < 3; k++) box(g, mat('#3a3f48', 0.6, 0.3), 0.505, 0.25, -0.25 + k * 0.25, 0.02, 0.3, 0.1)
    pipe(0.3, 0.32, 0.43, 0.3)
  },
  sail(g, { color }) {
    sailRig(g, mat('#3a3f48', 0.6, 0.3), mat('#2a2622', 0.7, 0.2), mat(color, 0.8, 0))
  },
  v8: (g, { body, pipe }) => vEngine(g, pipe, { n: 4, block: mat('#2b2f36', 0.5, 0.6), head: body }),
  seashell(g, { body }) {
    const shell = mat('#b8c4d6', 0.55, 0.1)
    const spike = mat('#9aa8bd', 0.55, 0.1)
    part(g, geo.ico, stone('#d8c8a0'), 0, 0.1, 0, 0.5, 0.15, 0.45)
    for (let k = 0; k < 3; k++) {
      const a = 0.5 + k * 2.1
      const d = v3(Math.cos(a), 0, Math.sin(a))
      const c = v3(d.x * 0.2, 0.32, d.z * 0.2)
      part(g, geo.sphere, shell, c.x, c.y, c.z, 0.2, 0.2, 0.2)
      seg(g, shell, c, v3(c.x + d.x * 0.36, 0.52, c.z + d.z * 0.36), 0.16, geo.cone)
      for (const t of [-0.6, 0, 0.6]) {
        const o = v3(-d.z * t, 0.8, d.x * t).normalize()
        seg(g, spike, c.clone().addScaledVector(o, 0.15), c.clone().addScaledVector(o, 0.32), 0.04, geo.cone)
      }
    }
    starfish(g, body, v3(0, 0.6, 0.05), 0.17, 0.5)
  },
  v12: (g, { body, pipe }) => vEngine(g, pipe, { n: 6, block: body, head: body, rib: mat('#151515', 0.6, 0.3) }),
  turbo(g, { body, pipe }) {
    box(g, mat('#3e434c', 0.5, 0.5), 0, 0.3, 0, 0.8, 0.6, 0.76)
    box(g, body, 0, 0.66, 0, 0.7, 0.12, 0.62)
    for (let k = 0; k < 3; k++) box(g, DARK(), 0, 0.73, -0.2 + k * 0.2, 0.6, 0.03, 0.06)
    const housing = mat('#b8bec8', 0.3, 0.8)
    part(g, geo.torus, housing, 0.55, 0.42, 0.02, 0.2, 0.2, 0.3, 0, Math.PI / 2, 0) // the snail
    cyl(g, mat('#8a9099', 0.4, 0.7), 0.55, 0.42, 0.02, 0.15, 0.16, 'x')
    cyl(g, mat('#1a1a1a', 0.6, 0.2), 0.64, 0.42, 0.02, 0.08, 0.04, 'x')
    pipe(0.55, 0.42, 0.18, 0.4)
    pipe(-0.25, 0.35, 0.38, 0.3)
  },
  coil(g, { color, pipe }) {
    box(g, mat('#151517', 0.6, 0.3), 0, 0.1, 0, 0.9, 0.2, 0.8)
    cyl(g, DARK(), 0, 0.62, 0, 0.08, 0.86)
    const gold = mat(color, 0.3, 0.85)
    for (let k = 0; k < 5; k++) part(g, geo.torus, gold, 0, 0.32 + k * 0.15, 0, 0.3, 0.3, 0.3, Math.PI / 2, 0, k % 2 ? 0.12 : -0.12)
    cyl(g, mat('#151517', 0.6, 0.3), 0, 1.06, 0, 0.18, 0.06)
    for (const x of [-0.3, 0.3]) pipe(x, 0.12, 0.4, 0.25)
  },
  dome(g, { color, pipe }) {
    box(g, mat('#33363d', 0.6, 0.4), 0, 0.15, 0, 1.0, 0.3, 0.9)
    part(g, geo.hemi, mat(color, 0.2, 0.6), 0, 0.3, 0, 0.45, 0.45, 0.45)
    hoop(g, mat('#55595f', 0.4, 0.7), 0, 0.31, 0, 0.45, geo.torus)
    part(g, geo.sphere, glowM('#7fd0ff', 2), 0, 0.76, 0, 0.05, 0.05, 0.05)
    pipe(0.32, 0.15, 0.45, 0.3)
  },
  ghostsail(g, { color }) {
    const c = color
    sailRig(g, clear(c, 0.5), clear(c, 0.6), clear(c, 0.55))
  },
  v16: (g, { body, pipe }) => vEngine(g, pipe, { n: 8, block: body, head: mat('#7a808c', 0.45, 0.5), rib: mat('#3a3e46', 0.5, 0.5), wide: 1.2 }),
  ghost(g) {
    const sheet = clear('#f4f8ff', 0.6, 0.6)
    box(g, mat('#2b2f3a', 0.6, 0.3), 0, 0.06, 0, 0.5, 0.12, 0.5)
    part(g, geo.sphere, sheet, 0, 0.86, 0, 0.32, 0.32, 0.32)
    cyl(g, sheet, 0, 0.67, 0, 0.32, 0.38)
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2
      part(g, geo.cone, sheet, Math.cos(a) * 0.24, 0.42, Math.sin(a) * 0.24, 0.1, 0.16, 0.1, Math.PI, 0, 0) // wavy hem
    }
    for (const x of [-0.11, 0.11]) part(g, geo.sphere, mat('#14161c', 0.4, 0), x, 0.88, 0.29, 0.06, 0.09, 0.04)
  },
  v18: (g, { pipe }) => vEngine(g, pipe, { n: 9, block: mat('#8a8f99', 0.45, 0.5), head: mat('#c8322a', 0.45, 0.3), rib: mat('#2a2e35', 0.5, 0.5), wide: 1.2 }),
  coffin(g, { body, pipe }) {
    box(g, DARK(), 0, 0.05, 0, 0.6, 0.1, 0.95)
    part(g, geo.coffin, body, 0, 0.1, 0, 1, 0.32, 1)
    part(g, geo.coffin, mat('#4a3018', 0.8, 0.1), 0, 0.42, 0, 1.06, 0.08, 1.04)
    const brass = mat('#d8b04a', 0.35, 0.7)
    box(g, brass, 0, 0.515, 0.02, 0.08, 0.03, 0.44)
    box(g, brass, 0, 0.515, -0.08, 0.28, 0.03, 0.08)
    for (const x of [-0.12, 0.12]) pipe(x, 0.24, 0.52, 0.3)
  },
  f140(g, { body, pipe }) {
    box(g, mat('#1a1a1a', 0.6, 0.3), 0, 0.1, 0, 1.0, 0.2, 0.9)
    box(g, mat('#b8bec8', 0.3, 0.8), 0, 0.52, 0, 0.36, 0.64, 0.8)
    for (const s of [-1, 1]) {
      box(g, body, s * 0.33, 0.7, 0, 0.3, 1.0, 0.72)
      box(g, mat('#1a1a1a', 0.6, 0.3), s * 0.33, 1.24, 0, 0.32, 0.08, 0.74)
      for (const z of [-0.22, 0, 0.22]) cyl(g, CHROME(), s * 0.33, 1.34, z, 0.06, 0.14)
      pipe(s * 0.33, 0.45, 0.36, 0.35)
    }
  },
  opv8: (g, { body, pipe }) => vEngine(g, pipe, { n: 4, block: mat('#3b4048', 0.5, 0.6), head: body, blower: true }),
  cauldron(g, { exhausts }) {
    const wood = mat('#6b4423', 0.85, 0.05)
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5
      seg(g, wood, v3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42), v3(Math.cos(a) * 0.24, 0.42, Math.sin(a) * 0.24), 0.05, geo.cyl8)
    }
    part(g, geo.bowl, mat('#232328', 0.5, 0.6), 0, 0.52, 0, 0.48, 0.4, 0.48)
    hoop(g, mat('#3a3a42', 0.5, 0.6), 0, 0.8, 0, 0.34, geo.torus)
    cyl(g, glowM('#b44cff', 2.4), 0, 0.77, 0, 0.33, 0.02)
    for (const [x, z, r] of [[0.1, 0.05, 0.06], [-0.12, -0.08, 0.045]]) part(g, geo.sphere, glowM('#d68cff', 2.4), x, 0.8, z, r, r, r)
    exhausts.push(v3(0, 0.9, 0))
  },
  chain(g, { color, pipe }) {
    const steel = mat(color, 0.35, 0.8)
    box(g, DARK(), 0, 0.07, 0, 0.9, 0.14, 0.7)
    for (const x of [-0.38, 0.38]) box(g, steel, x, 0.64, 0, 0.1, 1.0, 0.1)
    for (const y of [0.38, 0.66, 0.94, 1.12]) box(g, steel, 0, y, 0, 0.76, 0.06, 0.06) // rungs
    for (const x of [-0.17, 0.17]) for (let k = 0; k < 4; k++) part(g, geo.torus, steel, x, 1.01 - k * 0.14, 0, 0.07, 0.1, 0.07, 0, k % 2 ? Math.PI / 2 : 0, 0)
    pipe(0, 0.14, 0.35, 0.3)
  },
  cactus(g, { body }) {
    const clay = mat('#c0643a', 0.8, 0.05)
    part(g, geo.pot, clay, 0, 0.17, 0, 0.3, 0.34, 0.3)
    cyl(g, clay, 0, 0.36, 0, 0.33, 0.08)
    cyl(g, mat('#4a3020', 0.95, 0), 0, 0.4, 0, 0.29, 0.02)
    cyl(g, body, 0, 0.77, 0, 0.15, 0.76, 'y', geo.cyl8)
    part(g, geo.sphere, body, 0, 1.15, 0, 0.15, 0.15, 0.15)
    for (const [s, y, h] of [[-1, 0.72, 0.3], [1, 0.58, 0.24]]) {
      cyl(g, body, s * 0.25, y, 0, 0.09, 0.22, 'x', geo.cyl8)
      cyl(g, body, s * 0.34, y + h / 2, 0, 0.09, h, 'y', geo.cyl8)
      part(g, geo.sphere, body, s * 0.34, y + h, 0, 0.09, 0.09, 0.09)
    }
    part(g, geo.sphere, mat('#ff7eb8', 0.6, 0), 0, 1.3, 0, 0.07, 0.05, 0.07) // flower
  },
  spirit(g) {
    box(g, DARK(), 0, 0.08, 0, 0.5, 0.16, 0.6)
    cyl(g, DARK(), 0, 0.24, 0, 0.06, 0.18)
    part(g, geo.sphere, mat('#24263a', 0.8, 0.1), 0, 0.62, 0, 0.3, 0.3, 0.3)
    part(g, geo.sphere, clear('#5a6488', 0.35, 0.9), 0, 0.62, 0, 0.4, 0.4, 0.4) // smoke shell
    const bolt = glowM('#cfeaff', 3)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4
      const d = v3(Math.cos(a), 0, Math.sin(a))
      const t = v3(-d.z, 0, d.x)
      const pts = [[0.4, 0.36, 0], [0.55, 0.1, 0.08], [0.44, -0.06, -0.05], [0.58, -0.34, 0.04]].map(([r, y, w]) => v3(d.x * r + t.x * w, 0.62 + y, d.z * r + t.z * w))
      for (let i = 0; i < 3; i++) seg(g, bolt, pts[i], pts[i + 1], 0.04, geo.box)
    }
    part(g, geo.torus, mat('#2a2f3a', 0.4, 0.7), 0, 0.62, 0.42, 0.16, 0.16, 0.16)
    g.userData.nozzle = v3(0, 0.62, 0.5)
  },
  soulbinder(g) {
    const navy = mat('#3a3f6e', 0.45, 0.4)
    const spikeM = mat('#22264a', 0.45, 0.4)
    cyl(g, spikeM, 0, 0.08, 0, 0.26, 0.16)
    cyl(g, spikeM, 0, 0.24, 0, 0.07, 0.2)
    const c = v3(0, 0.62, 0)
    part(g, geo.sphere, navy, c.x, c.y, c.z, 0.3, 0.3, 0.3)
    const N = 22
    for (let i = 0; i < N; i++) {
      const y = 1 - ((i + 0.5) * 2) / N
      if (y < -0.7) continue
      const r = Math.sqrt(1 - y * y)
      const d = v3(Math.cos(i * 2.39996) * r, y, Math.sin(i * 2.39996) * r)
      seg(g, spikeM, c.clone().addScaledVector(d, 0.24), c.clone().addScaledVector(d, 0.6), 0.07, geo.cone)
    }
    hoop(g, glowM('#8a7cff', 2.2), c.x, c.y, c.z, 0.305)
  },
  seashell2(g, { color, pipe }) {
    const dark = mat('#8a5530', 0.6, 0.05)
    const shell = mat(color, 0.55, 0.05)
    part(g, geo.ico, stone('#8d8a84'), 0, 0.08, 0, 0.42, 0.12, 0.36)
    const fan = new Group()
    fan.position.set(0, 0.2, 0)
    fan.rotation.x = -0.2
    g.add(fan)
    part(fan, geo.halfDisc, shell, 0, 0, 0, 0.56, 0.08, 0.56, -Math.PI / 2, 0, 0)
    for (let k = 0; k < 7; k++) {
      const a = ((k - 3) / 3) * 1.25
      seg(fan, k % 2 ? dark : shell, v3(0, 0, 0.05), v3(Math.sin(a) * 0.62, Math.cos(a) * 0.62, 0.05), 0.08, geo.rib)
    }
    box(fan, dark, 0, 0.02, 0.02, 0.4, 0.12, 0.12) // hinge ears
    for (const x of [-0.3, 0.3]) pipe(x, 0.12, 0.15, 0.3)
  },
  firerocket(g, { body }) {
    const rib = mat('#7a3a14', 0.55, 0.3)
    cyl(g, body, 0, 0.55, 0.05, 0.34, 0.9, 'z')
    for (const z of [-0.28, -0.08, 0.12, 0.32]) part(g, geo.ring, rib, 0, 0.55, z, 0.345, 0.345, 0.345)
    part(g, geo.cone, mat('#ff7a1a', 0.5, 0.2), 0, 0.55, -0.52, 0.34, 0.26, 0.34, -Math.PI / 2, 0, 0) // nose
    part(g, geo.rib, mat('#3a3f48', 0.4, 0.8), 0, 0.55, 0.65, 0.36, 0.4, 0.36, Math.PI / 2, 0, 0) // bell, wide end back
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4 // X-pattern fins
      box(g, rib, Math.cos(a) * 0.46, 0.55 + Math.sin(a) * 0.46, 0.3, 0.22, 0.05, 0.5, 0, 0, a)
    }
    cyl(g, glowM('#ff8a2a', 2.5), 0, 0.55, 0.78, 0.22, 0.02, 'z')
    box(g, DARK(), 0, 0.08, 0, 0.3, 0.16, 0.9)
    g.userData.nozzle = v3(0, 0.55, 0.9)
  },
  cinderlord(g, { color, exhausts }) {
    box(g, DARK(), 0, 0.08, 0, 0.6, 0.16, 0.6)
    const c = v3(0, 0.5, 0)
    part(g, geo.ico, stone('#6b3a1e', 0.15), c.x, c.y, c.z, 0.34, 0.34, 0.34)
    hoop(g, glowM('#ff6a1a', 2.6), c.x, c.y, c.z, 0.33)
    const gold = mat(color, 0.35, 0.6)
    const orange = mat('#ff6a1a', 0.45, 0.2, { emissive: '#ff4a00', emissiveIntensity: 0.4 })
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      const base = v3(Math.cos(a) * 0.2, 0.7, Math.sin(a) * 0.2)
      seg(g, k % 2 ? orange : gold, base, v3(Math.cos(a) * 0.34, k % 2 ? 0.98 : 1.08, Math.sin(a) * 0.34), 0.08, geo.cone)
    }
    part(g, geo.cone, glowM('#ffb02a', 2.6), 0, 0.92, 0, 0.12, 0.36, 0.12)
    for (const [x, y, z] of [[0.38, 0.86, 0.1], [-0.3, 0.98, -0.12], [0.1, 1.16, 0.2]]) part(g, geo.sphere, glowM('#ff8a2a', 2.6), x, y, z, 0.035, 0.035, 0.035)
    exhausts.push(v3(0, 1.1, 0))
  },
  firebarrel(g, { body, exhausts }) {
    const band = mat('#3a2a1e', 0.6, 0.4)
    cyl(g, body, 0, 0.42, 0, 0.36, 0.8, 'y', geo.cyl8)
    cyl(g, body, 0, 0.42, 0, 0.39, 0.36, 'y', geo.cyl8)
    for (const y of [0.1, 0.42, 0.74]) cyl(g, band, 0, y, 0, y === 0.42 ? 0.41 : 0.38, 0.05, 'y', geo.cyl8)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 8
      box(g, band, Math.cos(a) * 0.385, 0.42, Math.sin(a) * 0.385, 0.05, 0.78, 0.05, 0, -a, 0)
    }
    part(g, geo.cone, glowM('#ff6a1a', 2.6), 0, 1.02, 0, 0.26, 0.42, 0.26)
    part(g, geo.cone, glowM('#ffd23a', 2.6), 0, 0.96, 0, 0.14, 0.28, 0.14)
    exhausts.push(v3(0, 1.2, 0))
  },
  bubblegum(g, { body, pipe }) {
    const lav = mat('#c8a8f0', 0.4, 0.15)
    const pink = mat('#ff8fd0', 0.35, 0.2)
    const drums = [[0.42, 0.28, body], [0.36, 0.26, lav], [0.3, 0.24, body]]
    let y = 0
    for (const [r, h, m] of drums) {
      cyl(g, m, 0, y + h / 2, 0, r, h)
      y += h
      hoop(g, pink, 0, y, 0, r, geo.torus)
    }
    part(g, geo.sphere, clear('#ff8fd0', 0.7, 0.2), 0, y + 0.16, 0, 0.2, 0.2, 0.2) // the bubble
    for (const x of [-0.25, 0.25]) pipe(x, 0.2, 0.38, 0.3)
  },
  water(g, { color }) {
    cyl(g, DARK(), 0, 0.06, 0, 0.28, 0.12)
    cyl(g, DARK(), 0, 0.2, 0, 0.05, 0.2)
    const c = v3(0, 0.64, 0)
    part(g, geo.sphere, clear(color, 0.6, 0.1), c.x, c.y, c.z, 0.34, 0.34, 0.34)
    part(g, geo.sphere, glowM('#9fe0ff', 2.2), c.x, c.y, c.z, 0.13, 0.13, 0.13)
    const ringM = mat('#cfe6ff', 0.25, 0.8)
    for (const [rx, ry, rz] of [[Math.PI / 2, 0, 0.25], [0.3, 0, 0], [0, Math.PI / 2, 0.3]]) part(g, geo.ring, ringM, c.x, c.y, c.z, 0.47, 0.47, 0.47, rx, ry, rz)
  },
  seaweed(g, { color, body, exhausts }) {
    part(g, geo.ico, stone('#6b6f78'), 0, 0.06, 0, 0.36, 0.1, 0.3)
    part(g, geo.sphere, lit(color, 0.25, 0.3), 0, 0.4, 0, 0.3, 0.3, 0.3)
    cyl(g, body, 0, 0.78, 0, 0.09, 0.3)
    const frond = mat('#6a2fa8', 0.5, 0.1)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      seg(g, frond, v3(0, 0.88, 0), v3(Math.cos(a) * 0.32, 1.22, Math.sin(a) * 0.32), 0.05, geo.cone)
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3
      seg(g, frond, v3(Math.cos(a) * 0.2, 0.25, Math.sin(a) * 0.2), v3(Math.cos(a) * 0.5, 0.42, Math.sin(a) * 0.45), 0.045, geo.cone)
    }
    exhausts.push(v3(0, 1.0, 0))
  },
  hamburger(g, { body, pipe }) {
    cyl(g, body, 0, 0.09, 0, 0.48, 0.18)
    cyl(g, mat('#5a3218', 0.85, 0.05), 0, 0.25, 0, 0.5, 0.14) // patty
    box(g, mat('#f7c531', 0.5, 0.05), 0, 0.34, 0, 0.88, 0.04, 0.88, 0, Math.PI / 4, 0) // cheese
    cyl(g, mat('#5cc23a', 0.7, 0.05), 0, 0.385, 0, 0.54, 0.05, 'y', geo.cyl8) // lettuce
    cyl(g, mat('#e0322b', 0.5, 0.05), 0, 0.44, 0, 0.44, 0.06) // tomato
    part(g, geo.hemi, body, 0, 0.47, 0, 0.5, 0.36, 0.5) // top bun
    const seed = mat('#fbefcf', 0.6, 0)
    for (const [phi, th] of [[0.35, 0.3], [0.4, 2.4], [0.45, 4.3], [0.8, 1.0], [0.85, 3.1], [0.8, 5.2], [0.1, 0]]) {
      part(g, geo.sphere, seed, 0.5 * Math.sin(phi) * Math.cos(th), 0.47 + 0.36 * Math.cos(phi), 0.5 * Math.sin(phi) * Math.sin(th), 0.04, 0.02, 0.025, 0, th, 0)
    }
    for (const x of [-0.25, 0.25]) pipe(x, 0.25, 0.42, 0.3)
  },
}
// Unknown id: a plain coloured block so the slot is never empty.
function fallbackEngine(g, { body, pipe }) {
  box(g, body, 0, 0.3, 0, 0.85, 0.6, 0.75)
  box(g, DARK(), 0, 0.66, 0, 0.6, 0.12, 0.5)
  pipe(0.25, 0.3, 0.38, 0.35)
}

export function buildEngine(id, color = '#9aa3ae') {
  const g = new Group()
  const body = mat(color, 0.45, 0.35)
  const exhausts = []
  const pipe = (x, y, z, len = 0.5, up = false) => {
    if (up) cyl(g, CHROME(), x, y + len / 2, z, 0.06, len)
    else cyl(g, CHROME(), x, y, z + len / 2, 0.06, len, 'z')
    exhausts.push(up ? new Vector3(x, y + len, z) : new Vector3(x, y, z + len))
  }
  ;(ENGINES[id] ?? fallbackEngine)(g, { body, color, pipe, exhausts })
  g.userData.exhausts = exhausts
  return g
}

// --- Fuel tanks ---------------------------------------------------------------------
// Bottom centre at (0, 0, 0), about 0.6-1.0 m. Big ones are scaled down in buildCart.
const TANKS = {
  jerry(g, m) {
    box(g, m, 0, 0.32, 0, 0.55, 0.64, 0.3)
    box(g, m, 0, 0.7, 0.05, 0.3, 0.08, 0.08) // handle
    cyl(g, mat('#2b2b2b', 0.6, 0.3), -0.18, 0.68, 0, 0.05, 0.12)
    box(g, mat('#ffffff', 0.6, 0), 0, 0.35, -0.16, 0.3, 0.12, 0.01)
  },
  smallfuel(g, m) {
    cyl(g, m, 0, 0.28, 0, 0.22, 0.56)
    part(g, geo.hemi, m, 0, 0.56, 0, 0.22, 0.18, 0.22)
    cyl(g, mat('#f2f2f2', 0.6, 0), 0, 0.3, 0, 0.225, 0.12)
    cyl(g, mat('#1a1a1a', 0.6, 0.2), 0, 0.78, 0, 0.06, 0.1)
  },
  bigfuel(g, m) {
    const black = mat('#1a1a1a', 0.6, 0.2)
    box(g, m, 0, 0.29, 0, 0.8, 0.58, 0.44)
    box(g, black, 0, 0.3, 0, 0.82, 0.1, 0.46)
    for (const x of [-0.24, 0.24]) cyl(g, black, x, 0.63, 0, 0.07, 0.1)
    box(g, black, 0, 0.64, 0, 0.26, 0.05, 0.07) // handle
  },
  giantfuel(g, m) {
    cyl(g, m, 0, 0.47, 0, 0.42, 0.94)
    for (const y of [0.18, 0.47, 0.76]) cyl(g, mat('#8a1a1a', 0.5, 0.3), 0, y, 0, 0.44, 0.06)
    cyl(g, mat('#1a1a1a', 0.6, 0.2), 0.18, 0.97, 0, 0.07, 0.07)
  },
  tesla(g, m, col) {
    const black = mat('#141416', 0.5, 0.4)
    cyl(g, black, 0, 0.08, 0, 0.4, 0.16)
    cyl(g, glowM('#fff6d0', 2.4), 0, 0.52, 0, 0.11, 0.74)
    const gold = mat(col, 0.3, 0.8)
    for (let k = 0; k < 4; k++) hoop(g, gold, 0, 0.28 + k * 0.17, 0, 0.3 - k * 0.025, geo.torus)
    cyl(g, black, 0, 0.92, 0, 0.16, 0.08)
  },
  spacetank(g, m) {
    capsule(g, m, 0.27, 0.48)
    for (const y of [0.34, 0.68]) cyl(g, mat('#5a1a1a', 0.5, 0.3), 0, y, 0, 0.28, 0.06)
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2
      box(g, DARK(), Math.cos(a) * 0.26, 0.12, Math.sin(a) * 0.26, 0.06, 0.24, 0.16, 0, -a, 0)
    }
  },
  hydrogen(g, m, col) {
    capsule(g, mat(col, 0.3, 0.5), 0.28, 0.5)
    cyl(g, mat('#f2f2f2', 0.6, 0), 0, 0.53, 0, 0.285, 0.14)
    cyl(g, CHROME(), 0, 1.1, 0, 0.06, 0.12)
    box(g, CHROME(), 0, 1.18, 0, 0.12, 0.08, 0.12)
    hoop(g, mat('#2a7fd4', 0.4, 0.4), 0, 1.25, 0, 0.09, geo.torus)
  },
  nuclear(g) {
    cyl(g, mat('#1f2833', 0.4, 0.7), 0, 0.12, 0, 0.42, 0.24)
    cyl(g, glowM('#2ef06a', 3), 0, 0.6, 0, 0.26, 0.8)
    for (const y of [0.32, 0.6, 0.88]) cyl(g, mat('#2f3b48', 0.35, 0.8), 0, y, 0, 0.32, 0.08)
    cyl(g, mat('#1f2833', 0.4, 0.7), 0, 1.06, 0, 0.3, 0.12)
    for (let k = 0; k < 3; k++) box(g, mat('#f7d21c', 0.5, 0.2), Math.cos(k * 2.1) * 0.33, 0.6, Math.sin(k * 2.1) * 0.33, 0.04, 0.5, 0.04)
  },
  frost(g, m, col) {
    part(g, geo.ico, stone('#dff4ff'), 0, 0.08, 0, 0.4, 0.12, 0.35)
    const ice = mat(col, 0.15, 0.1, { emissive: col, emissiveIntensity: 0.35, flatShading: true, transparent: true, opacity: 0.85 })
    const shards = [
      [0, 0.5, 0, 0.45, 0, 0],
      [0.18, 0.35, 0.05, 0.3, -0.45, 0.1],
      [-0.17, 0.38, -0.03, 0.33, 0.4, -0.1],
      [0.05, 0.3, 0.17, 0.25, -0.1, 0.5],
      [-0.06, 0.28, -0.17, 0.22, 0.1, -0.5],
    ]
    for (const [x, y, z, h, rz, rx] of shards) part(g, geo.octa, ice, x, y, z, 0.13, h, 0.13, rx, 0, rz)
  },
  rockfuel(g, m, col) {
    part(g, geo.ico, stone('#4a4d54'), 0, 0.1, 0, 0.4, 0.14, 0.3)
    part(g, geo.rockRing, stone(col), 0, 0.52, 0, 0.36, 0.36, 0.42)
    part(g, geo.ico, stone('#c8ccd2', 0.3), 0, 0.52, 0, 0.2, 0.2, 0.2)
  },
  flask(g, m, col) {
    const glass = clear('#dff2ff', 0.3, 0.05)
    hoop(g, DARK(), 0, 0.04, 0, 0.2, geo.torus)
    part(g, geo.sphere, lit(col, 0.45, 0.3), 0, 0.3, 0, 0.27, 0.2, 0.27)
    part(g, geo.sphere, glass, 0, 0.36, 0, 0.32, 0.32, 0.32)
    cyl(g, glass, 0, 0.8, 0, 0.08, 0.32)
    cyl(g, mat('#a0703a', 0.85, 0), 0, 0.98, 0, 0.09, 0.1)
  },
  cauldronfuel(g, m, col) {
    const iron = mat(col, 0.45, 0.6)
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2
      box(g, iron, Math.cos(a) * 0.24, 0.06, Math.sin(a) * 0.24, 0.08, 0.12, 0.08)
    }
    part(g, geo.bowl, iron, 0, 0.42, 0, 0.42, 0.36, 0.42)
    hoop(g, iron, 0, 0.68, 0, 0.3, geo.torus)
    cyl(g, lit('#3a7a2a', 0.5), 0, 0.66, 0, 0.29, 0.02)
    for (const x of [-0.43, 0.43]) part(g, geo.torus, iron, x, 0.5, 0, 0.08, 0.08, 0.08, 0, Math.PI / 2, 0)
  },
  clockwork(g, m, col) {
    const bronze = mat(col, 0.35, 0.75)
    cyl(g, DARK(), 0, 0.05, 0, 0.24, 0.1)
    cyl(g, DARK(), 0, 0.15, 0, 0.05, 0.16)
    const c = v3(0, 0.56, 0)
    part(g, geo.sphere, mat('#8a5a2a', 0.4, 0.7), c.x, c.y, c.z, 0.2, 0.2, 0.2)
    for (const [rx, ry] of [[Math.PI / 2, 0], [0, 0], [0, Math.PI / 2]]) part(g, geo.gear, bronze, c.x, c.y, c.z, 0.36, 0.36, 0.36, rx, ry, 0)
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2
      box(g, bronze, Math.cos(a) * 0.41, c.y, Math.sin(a) * 0.41, 0.08, 0.07, 0.07, 0, -a, 0) // flat ring teeth
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2
      box(g, bronze, Math.cos(a) * 0.41, c.y + Math.sin(a) * 0.41, 0, 0.08, 0.07, 0.07, 0, 0, a) // front ring teeth
    }
  },
  crystal(g, m, col) {
    const stand = mat('#24242c', 0.5, 0.5)
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2
      seg(g, stand, v3(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32), v3(Math.cos(a) * 0.13, 0.4, Math.sin(a) * 0.13), 0.03, geo.cyl8)
    }
    hoop(g, stand, 0, 0.4, 0, 0.15, geo.torus)
    const gem = lit(col, 0.75, 0.15, { flatShading: true })
    part(g, geo.octa, gem, 0, 0.74, 0, 0.18, 0.36, 0.18)
    part(g, geo.octa, gem, 0.15, 0.55, 0.06, 0.07, 0.15, 0.07, 0, 0, -0.5)
    part(g, geo.octa, gem, -0.14, 0.53, -0.05, 0.06, 0.13, 0.06, 0, 0, 0.5)
  },
  fuel67(g, m, col) {
    const bar = mat(col, 0.45, 0.3)
    const h = 0.315
    for (const x of [-h, h]) for (const z of [-h, h]) box(g, bar, x, 0.35, z, 0.07, 0.7, 0.07)
    for (const y of [0.035, 0.35, 0.665]) {
      for (const z of [-h, h]) box(g, bar, 0, y, z, 0.7, 0.07, 0.07)
      if (y !== 0.35) for (const x of [-h, h]) box(g, bar, x, y, 0, 0.07, 0.07, 0.7)
    }
    box(g, mat('#8a4a10', 0.6, 0.2), 0, 0.35, 0, 0.42, 0.56, 0.42)
  },
  coral(g, m) {
    part(g, geo.ico, stone('#7a7a80'), 0, 0.12, 0, 0.32, 0.18, 0.28)
    const branches = [
      [[0, 0.2, 0], [0, 0.62, 0]],
      [[0, 0.45, 0], [0.22, 0.76, 0.05]],
      [[0, 0.52, 0], [-0.18, 0.86, -0.05]],
      [[0.1, 0.22, 0.1], [0.27, 0.5, 0.15]],
      [[-0.1, 0.22, 0.05], [-0.28, 0.46, 0.1]],
      [[0, 0.6, 0], [0.05, 0.96, 0]],
    ]
    const tip = mat('#8fe07a', 0.55, 0.05)
    for (const [a, b] of branches) {
      seg(g, m, v3(...a), v3(...b), 0.05, geo.cyl8)
      part(g, geo.sphere, tip, b[0], b[1], b[2], 0.065, 0.065, 0.065)
    }
  },
  starfish(g, m) {
    part(g, geo.ico, stone('#e8d6a8'), 0, 0.05, 0, 0.3, 0.08, 0.22)
    starfish(g, m, v3(0, 0.5, 0), 0.42, Math.PI / 2, 0.3)
    const dot = mat('#ffd0a0', 0.6, 0)
    for (let k = 0; k < 5; k++) {
      const a = Math.PI / 2 + (k * Math.PI * 2) / 5
      part(g, geo.sphere, dot, Math.cos(a) * 0.2, 0.5 + Math.sin(a) * 0.2, 0.05, 0.03, 0.03, 0.03)
    }
  },
  cybercontact(g, m, col) {
    const blue = mat(col, 0.3, 0.6)
    const dark = mat('#1a1e2e', 0.4, 0.6)
    cyl(g, dark, 0, 0.05, 0, 0.22, 0.1)
    cyl(g, dark, 0, 0.18, 0, 0.05, 0.18)
    const c = v3(0, 0.56, 0)
    part(g, geo.octa, blue, c.x, c.y, c.z, 0.24, 0.32, 0.24)
    hoop(g, glowM('#4ad8ff', 2.4), c.x, c.y, c.z, 0.17)
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const d = v3(sx * 0.87, sy * 0.5, 0)
      for (let i = 0; i < 3; i++) seg(g, i % 2 ? dark : blue, c.clone().addScaledVector(d, 0.2 + i * 0.1), c.clone().addScaledVector(d, 0.3 + i * 0.1), 0.05)
      const t = c.clone().addScaledVector(d, 0.52)
      part(g, geo.sphere, glowM('#4a8aff', 2.4), t.x, t.y, t.z, 0.05, 0.05, 0.05)
    }
  },
  cyberquadric(g, m, col) {
    const shell = mat(col, 0.35, 0.6, { flatShading: true })
    const plate = mat('#2a2a7a', 0.35, 0.6, { flatShading: true })
    box(g, DARK(), 0, 0.05, 0, 0.72, 0.1, 0.6)
    box(g, shell, 0, 0.36, 0, 0.6, 0.52, 0.5)
    for (const x of [-0.28, 0.28]) for (const z of [-0.23, 0.23]) box(g, plate, x, 0.36, z, 0.18, 0.5, 0.18, 0, Math.PI / 4, 0)
    part(g, geo.octa, mat('#5a6ad8', 0.3, 0.6, { flatShading: true }), 0, 0.64, 0, 0.34, 0.16, 0.28)
    const slit = glowM('#4ad8ff', 2.4)
    box(g, slit, 0, 0.42, 0.255, 0.36, 0.05, 0.01)
    for (const x of [-0.305, 0.305]) box(g, slit, x, 0.42, 0, 0.01, 0.05, 0.26)
  },
  fries(g, m) {
    part(g, geo.taper4, m, 0, 0.26, 0, 0.42, 0.52, 0.32)
    box(g, mat('#f7d24a', 0.5, 0.05), 0, 0.3, 0.205, 0.2, 0.12, 0.01, -0.09, 0, 0)
    const fry = mat('#f7d24a', 0.6, 0.05)
    const sticks = [[-0.16, -0.07, 0.1, 0.05], [0, -0.08, -0.05, 0.1], [0.15, -0.06, 0.12, -0.08], [-0.08, 0.06, -0.12, 0.06], [0.08, 0.07, 0.04, -0.1], [-0.18, 0.05, 0.15, -0.04], [0.18, 0.04, -0.14, 0.07], [0.02, 0, 0.02, 0.02], [-0.04, 0.1, 0.08, 0.12]]
    sticks.forEach(([x, z, rz, rx], i) => box(g, fry, x, 0.56 + (i % 3) * 0.04, z, 0.06, 0.5, 0.06, rx, 0, rz))
  },
}
// Unknown id: a plain can in the gear's colour.
function fallbackTank(g, m) {
  box(g, m, 0, 0.3, 0, 0.5, 0.6, 0.32)
  cyl(g, mat('#2b2b2b', 0.6, 0.3), 0.14, 0.65, 0, 0.06, 0.1)
}

export function buildTank(id, color = '#c0392b') {
  const g = new Group()
  ;(TANKS[id] ?? fallbackTank)(g, mat(color, 0.45, 0.3), color)
  return g
}
// Tall/wide tanks shrink on the cart's front platform so they clear the body.
const TANK_SCALE = { giantfuel: 0.85, spacetank: 0.85, hydrogen: 0.8, fries: 0.9, crystal: 0.9, rockfuel: 0.9, cybercontact: 0.9 }

// --- Boosters (one per side) -----------------------------------------------------------
function buildBooster(id, color) {
  const g = new Group()
  if (id === 'none') return g
  const tubes = id === 'twinnitro' ? 2 : 1
  for (let t = 0; t < tubes; t++) {
    const y = tubes === 2 ? 0.95 + t * 0.32 : 1.05
    if (id === 'firework') {
      cyl(g, mat('#ffffff', 0.5, 0), 0, y, 0, 0.13, 1.1, 'z')
      for (let k = -2; k <= 2; k++) cyl(g, mat('#e8344a', 0.5, 0), 0, y, k * 0.2, 0.135, 0.08, 'z')
      part(g, new CylinderGeometry(0, 0.15, 0.35, 12), mat('#e8344a', 0.5, 0), 0, y, -0.72, 1, 1, 1, -Math.PI / 2, 0, 0)
    } else if (id === 'nitro' || id === 'twinnitro') {
      cyl(g, mat(color, 0.25, 0.6), 0, y, 0, 0.14, 0.95, 'z')
      part(g, geo.sphere, mat(color, 0.25, 0.6), 0, y, -0.48, 0.14, 0.14, 0.14)
      cyl(g, CHROME(), 0, y, 0.54, 0.09, 0.16, 'z')
      box(g, mat('#ffffff', 0.5, 0), 0, y + 0.01, 0, 0.29, 0.12, 0.4)
    } else if (id === 'afterburner') {
      cyl(g, mat('#3a3f48', 0.35, 0.8), 0, y, 0, 0.2, 1.1, 'z')
      part(g, geo.torus, mat('#ff7b00', 0.4, 0.5), 0, y, 0.55, 0.22, 0.22, 0.22)
      cyl(g, neon('#ff9a2a', 2.5), 0, y, 0.58, 0.14, 0.02, 'z')
    }
  }
  box(g, DARK(), 0, 0.85, 0, 0.12, 0.1, 0.5) // bracket
  return g
}

// --- Carried parts ---------------------------------------------------------------------
// An engine or fuel tank on its own (carried in hand, or the ghost on the cart).
export const buildPart = (g) => (g.type === 'engine' ? buildEngine(g.id, g.color) : buildTank(g.id, g.color))
// Puts an engine / tank where it bolts onto the cart (in the cart's tilt group).
export function mountPart(type, id, obj) {
  if (type === 'engine') obj.position.set(0, 0.62, BODY.len / 2 + 0.55)
  else {
    obj.position.set(0, 0.62, -(BODY.len / 2 + 0.5))
    obj.scale.setScalar(TANK_SCALE[id] ?? 1)
  }
  return obj
}
// The see-through preview of a part about to be attached (one shared material,
// so the ride can pulse its opacity).
export const GHOST_MAT = new MeshStandardMaterial({ color: '#bff6ff', emissive: '#5fdcff', emissiveIntensity: 0.7, roughness: 0.4, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false })
export function buildGhost(g) {
  const obj = buildPart(g)
  obj.traverse((o) => {
    if (o.isMesh) {
      o.material = GHOST_MAT
      o.castShadow = o.receiveShadow = false
      o.renderOrder = 2
    }
  })
  return obj
}

// --- Assembly ------------------------------------------------------------------------
// gear: { engine, fuel, wheels, booster } GEAR entries (any may be missing = bare).
export function buildCart(gear = {}, { color = '#1d2846', stripe = '#ff2a3a' } = {}) {
  const root = new Group()
  const tilt = new Group() // pitches with the slope; the root sits on the rails
  root.add(tilt)
  body(tilt, color, stripe)
  chassis(tilt, gear.engine ? 0.9 : 0, gear.fuel ? 0.7 : 0)
  const wheels = wheelSet(tilt, gear.wheels)
  const exhausts = []
  const flames = []
  const parts = {}
  let nozzle = null
  if (gear.engine) {
    const e = mountPart('engine', gear.engine.id, buildEngine(gear.engine.id, gear.engine.color))
    tilt.add(e)
    parts.engine = e
    for (const p of e.userData.exhausts) exhausts.push(p.clone().add(e.position))
    if (e.userData.nozzle) nozzle = e.userData.nozzle.clone().add(e.position)
  }
  if (gear.fuel) {
    const t = mountPart('fuel', gear.fuel.id, buildTank(gear.fuel.id, gear.fuel.color))
    tilt.add(t)
    parts.fuel = t
  }
  if (gear.booster && gear.booster.id !== 'none') {
    for (const side of [-1, 1]) {
      const b = buildBooster(gear.booster.id, gear.booster.color)
      b.position.set(side * (BODY.wid / 2 + 0.32), 0, 0)
      tilt.add(b)
      flames.push(new Vector3(side * (BODY.wid / 2 + 0.32), gear.booster.id === 'twinnitro' ? 1.1 : 1.05, 0.65))
    }
  }
  root.userData = { tilt, parts, spin: wheels.spin, hover: wheels.hover, exhausts, flames, nozzle, seat: new Vector3(0, 0.78, 0.1) }
  return root
}

// A trailing cart with cargo (coal and gold), matched to the lead cart's wheels.
// golden = a Golden Cart (rebirth reward): a gold body with a white stripe, full of gold.
export function buildWagon(index, wheelsGear, golden = false) {
  const colors = ['#2a3a6e', '#5a2a6e', '#6e2a2a', '#2a6e4a', '#6e5a2a', '#2a5a6e', '#4a4a4a', '#6e2a5a']
  const look = golden ? { color: '#e8b21c', stripe: '#fff6c8' } : { color: colors[index % colors.length], stripe: index % 2 ? '#ffd23a' : '#3ad4ff' }
  const root = buildCart({ wheels: wheelsGear }, look)
  const tilt = root.userData.tilt
  const lumps = 14
  for (let i = 0; i < lumps; i++) {
    const gold = golden || i % 4 === 0
    const s = 0.22 + ((i * 37) % 10) / 40
    part(tilt, geo.sphere, gold ? mat('#ffcf2e', 0.3, 0.8, { emissive: '#5a3a00', emissiveIntensity: 0.4 }) : mat('#24242a', 0.9, 0.1), ((i % 4) - 1.5) * 0.36, 1.45 + ((i * 13) % 5) * 0.04, (Math.floor(i / 4) - 1.5) * 0.5, s, s * 0.8, s)
  }
  return root
}
