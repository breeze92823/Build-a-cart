// Particles and weather. A few pooled point systems (one draw call each), each
// with its own sprite and blending: smoke (soft, normal blend), fire and sparks
// (additive, bloom-bright), confetti and skulls (spinning cut-outs). Plus rain
// streaks and speed lines that live in a box around the camera, and lightning
// bolts. Every system is CPU-simulated in preallocated typed arrays, so a
// burst never allocates.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LineBasicMaterial,
  LineSegments,
  NormalBlending,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { paintSoftDot, paintSparkle } from './textures.js'

const vert = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  attribute float rot;
  varying vec4 vTint;
  varying float vRot;
  uniform float scale;
  void main() {
    vTint = tint;
    vRot = rot;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Fade out right in front of the lens (a puff passing the chase cam would fill the screen).
    vTint.a *= smoothstep(1.5, 6.0, -mv.z);
    gl_PointSize = size * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`
const frag = /* glsl */ `
  uniform sampler2D map;
  uniform float boost;
  varying vec4 vTint;
  varying float vRot;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    vec4 t = texture2D(map, p);
    gl_FragColor = vec4(t.rgb * vTint.rgb * boost, t.a * vTint.a);
    if (gl_FragColor.a < 0.01) discard;
  }`

function paintSkull(size = 64) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const x = c.getContext('2d')
  const s = size / 64
  x.fillStyle = '#ffffff'
  x.beginPath()
  x.arc(32 * s, 28 * s, 22 * s, 0, Math.PI * 2)
  x.fill()
  x.fillRect(19 * s, 38 * s, 26 * s, 16 * s)
  x.fillStyle = '#000000'
  x.globalCompositeOperation = 'destination-out'
  x.beginPath()
  x.arc(23 * s, 28 * s, 6.5 * s, 0, Math.PI * 2)
  x.arc(41 * s, 28 * s, 6.5 * s, 0, Math.PI * 2)
  x.fill()
  x.beginPath()
  x.moveTo(32 * s, 34 * s)
  x.lineTo(28 * s, 41 * s)
  x.lineTo(36 * s, 41 * s)
  x.fill()
  for (const tx of [25, 31, 37]) x.fillRect(tx * s, 48 * s, 2.4 * s, 7 * s)
  return c
}
function paintSquare(size = 16) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const x = c.getContext('2d')
  x.fillStyle = '#ffffff'
  x.fillRect(2, 4, size - 4, size - 8)
  return c
}
function paintPuff(size = 64) {
  // Lumpy smoke puff: a few soft dots overlapped.
  const c = document.createElement('canvas')
  c.width = c.height = size
  const x = c.getContext('2d')
  for (const [px, py, r] of [
    [32, 34, 22],
    [22, 28, 14],
    [42, 26, 15],
    [30, 22, 13],
  ]) {
    const g = x.createRadialGradient(px, py, 0, px, py, r)
    g.addColorStop(0, 'rgba(255,255,255,0.75)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g
    x.fillRect(0, 0, size, size)
  }
  return c
}

class System {
  constructor(scene, canvas, max, { additive = false, boost = 1, depthTest = true } = {}) {
    this.max = max
    this.n = 0
    this.pos = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.tint = new Float32Array(max * 4)
    this.size = new Float32Array(max)
    this.rot = new Float32Array(max)
    this.spin = new Float32Array(max)
    this.life = new Float32Array(max)
    this.maxLife = new Float32Array(max)
    this.size0 = new Float32Array(max)
    this.grow = new Float32Array(max)
    this.drag = new Float32Array(max)
    this.grav = new Float32Array(max)
    this.alpha0 = new Float32Array(max)
    this.fadeIn = new Float32Array(max)
    this.color0 = new Float32Array(max * 3)
    this.color1 = new Float32Array(max * 3)
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(this.pos, 3))
    geo.setAttribute('tint', new BufferAttribute(this.tint, 4))
    geo.setAttribute('size', new BufferAttribute(this.size, 1))
    geo.setAttribute('rot', new BufferAttribute(this.rot, 1))
    geo.setDrawRange(0, 0)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    this.material = new ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 400 }, boost: { value: boost } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      depthTest,
      blending: additive ? AdditiveBlending : NormalBlending,
    })
    this.points = new Points(geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = additive ? 3 : 2
    scene.add(this.points)
    this.geo = geo
  }

  // o: { x,y,z, vx,vy,vz, size, grow (x size over life), life, color, color2, alpha, drag, gravity, spin, rot }
  add(o) {
    if (this.n >= this.max) return
    const i = this.n++
    const i3 = i * 3
    this.pos[i3] = o.x
    this.pos[i3 + 1] = o.y
    this.pos[i3 + 2] = o.z
    this.vel[i3] = o.vx ?? 0
    this.vel[i3 + 1] = o.vy ?? 0
    this.vel[i3 + 2] = o.vz ?? 0
    this.size0[i] = this.size[i] = o.size ?? 1
    this.grow[i] = o.grow ?? 1
    this.life[i] = 0
    this.maxLife[i] = o.life ?? 1
    this.drag[i] = o.drag ?? 0
    this.grav[i] = o.gravity ?? 0
    this.alpha0[i] = o.alpha ?? 1
    this.fadeIn[i] = o.fadeIn ?? 0.08
    this.rot[i] = o.rot ?? Math.random() * 6.28
    this.spin[i] = o.spin ?? 0
    const c0 = o.color ?? WHITE
    const c1 = o.color2 ?? c0
    this.color0[i3] = c0.r
    this.color0[i3 + 1] = c0.g
    this.color0[i3 + 2] = c0.b
    this.color1[i3] = c1.r
    this.color1[i3 + 1] = c1.g
    this.color1[i3 + 2] = c1.b
  }

  update(dt) {
    let i = 0
    while (i < this.n) {
      this.life[i] += dt
      if (this.life[i] >= this.maxLife[i]) {
        this.kill(i)
        continue
      }
      const i3 = i * 3
      const k = this.life[i] / this.maxLife[i]
      const d = Math.max(0, 1 - this.drag[i] * dt)
      this.vel[i3] *= d
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt
      this.vel[i3 + 2] *= d
      this.pos[i3] += this.vel[i3] * dt
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt
      this.size[i] = this.size0[i] * (1 + (this.grow[i] - 1) * k)
      this.rot[i] += this.spin[i] * dt
      const fin = this.fadeIn[i] > 0 ? Math.min(1, this.life[i] / (this.maxLife[i] * this.fadeIn[i])) : 1
      const i4 = i * 4
      this.tint[i4] = this.color0[i3] + (this.color1[i3] - this.color0[i3]) * k
      this.tint[i4 + 1] = this.color0[i3 + 1] + (this.color1[i3 + 1] - this.color0[i3 + 1]) * k
      this.tint[i4 + 2] = this.color0[i3 + 2] + (this.color1[i3 + 2] - this.color0[i3 + 2]) * k
      this.tint[i4 + 3] = this.alpha0[i] * fin * (1 - k * k)
      i++
    }
    this.geo.setDrawRange(0, this.n)
    for (const name of ['position', 'tint', 'size', 'rot']) this.geo.attributes[name].needsUpdate = true
  }

  // Swap the last live particle into slot i.
  kill(i) {
    const j = --this.n
    if (i === j) return
    const copy = (arr, w) => {
      for (let c = 0; c < w; c++) arr[i * w + c] = arr[j * w + c]
    }
    copy(this.pos, 3)
    copy(this.vel, 3)
    copy(this.tint, 4)
    copy(this.color0, 3)
    copy(this.color1, 3)
    for (const arr of [this.size, this.rot, this.spin, this.life, this.maxLife, this.size0, this.grow, this.drag, this.grav, this.alpha0, this.fadeIn]) arr[i] = arr[j]
  }
}

const WHITE = new Color('#ffffff')
const C = (hex) => new Color(hex)
const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
// Ambient air of each area (ride.js spawns these ahead of the cart; as it passes
// them they stream by like wind). Colours are made once.
const AMB = {
  pollen: { cols: ['#fff6b0', '#ffffff', '#d8ff9a'].map(C) },
  leaves: { cols: ['#5fd14a', '#3aa636', '#d8e04a', '#ff9a2a'].map(C) },
  spray: { cols: ['#e8f6ff', '#bfe4ff'].map(C) },
  mist: { cols: ['#f2fbff', '#d6efff'].map(C) },
  sparkle: { cols: ['#d07bff', '#4fe3ff', '#ffffff'].map(C) },
  sand: { cols: ['#f0cf8a', '#e0b26a', '#fff0c8'].map(C) },
  snow: { cols: ['#ffffff', '#eaf4ff', '#dbe9ff'].map(C) },
  fireflies: { cols: ['#d8ff6a', '#fff27a', '#a8ff7a'].map(C) },
}
// Cached colours for the route's emitters (no allocation per particle).
const COLS = new Map()
const col = (hex) => {
  let c = COLS.get(hex)
  if (!c) COLS.set(hex, (c = new Color(hex)))
  return c
}
const STAR_COLS = ['#ffe066', '#ffffff', '#ffd23a'].map(C)
const FIREWORK = ['#ff3b5c', '#ffd23a', '#3ad4ff', '#5dff6a', '#b05cff', '#ffffff'].map(C)

// --- Rain + speed lines: segments recycled inside a box around the camera -------------
class Streaks {
  constructor(scene, count, color, opacity) {
    this.count = count
    this.pos = new Float32Array(count * 6)
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(this.pos, 3))
    this.mat = new LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: false })
    this.lines = new LineSegments(geo, this.mat)
    this.lines.frustumCulled = false
    this.lines.visible = false
    this.geo = geo
    this.opacity = opacity
    this.level = 0
    scene.add(this.lines)
    this.seeded = false
  }
}

export function createFx(scene, quality = 1) {
  const q = Math.max(0.3, quality)
  const smoke = new System(scene, paintPuff(), Math.round(900 * q))
  const fire = new System(scene, paintSoftDot(), Math.round(900 * q), { additive: true, boost: 1.5 })
  const sparks = new System(scene, paintSparkle(), Math.round(700 * q), { additive: true, boost: 3 })
  const confetti = new System(scene, paintSquare(), Math.round(500 * q))
  const skulls = new System(scene, paintSkull(), 60)
  const systems = [smoke, fire, sparks, confetti, skulls]

  const rain = new Streaks(scene, Math.round(1600 * q), '#bcd6ff', 0.55)
  const speed = new Streaks(scene, 140, '#ffffff', 0.5)
  const camPos = new Vector3()

  // Lightning: a jagged bolt drawn for a few frames.
  const boltPos = new Float32Array(40 * 6)
  const boltGeo = new BufferGeometry()
  boltGeo.setAttribute('position', new BufferAttribute(boltPos, 3))
  const bolt = new LineSegments(boltGeo, new LineBasicMaterial({ color: '#e8f0ff', transparent: true, opacity: 1, fog: false }))
  bolt.visible = false
  bolt.frustumCulled = false
  scene.add(bolt)
  let boltLife = 0

  const scaleAll = (h) => {
    for (const s of systems) s.material.uniforms.scale.value = h
  }

  const api = {
    // Engine exhaust puff (dirty grey, rising).
    exhaust(p, vx, vy, vz, dark = 0.5, drag = 1.2) {
      const g = 0.35 + (1 - dark) * 0.4
      smoke.add({ x: p.x, y: p.y, z: p.z, vx: vx + rnd(-0.4, 0.4), vy: vy + rnd(0.6, 1.4), vz: vz + rnd(-0.4, 0.4), size: rnd(0.35, 0.6), grow: 4, life: rnd(0.7, 1.2), color: new Color(g, g, g), alpha: 0.55, drag })
    },
    // Dust kicked up from the rails/ground.
    dust(p, n = 4, color = '#c9a77a') {
      const c = C(color)
      for (let i = 0; i < n; i++) smoke.add({ x: p.x + rnd(-0.8, 0.8), y: p.y + 0.1, z: p.z + rnd(-0.6, 0.6), vx: rnd(-1.5, 1.5), vy: rnd(0.5, 2), vz: rnd(-1, 1.5), size: rnd(0.5, 0.9), grow: 3, life: rnd(0.6, 1.1), color: c, alpha: 0.45, drag: 2 })
    },
    // Booster / nozzle flame.
    flame(p, vx, vy, vz, scale = 1, color = '#ff9a2a', color2 = '#ff3a1a') {
      fire.add({ x: p.x, y: p.y, z: p.z, vx: vx + rnd(-0.6, 0.6), vy: vy + rnd(-0.3, 0.6), vz: vz + rnd(-0.6, 0.6), size: rnd(0.5, 0.8) * scale, grow: 0.2, life: rnd(0.18, 0.3), color: C(color), color2: C(color2), alpha: 0.9, fadeIn: 0 })
      if (Math.random() < 0.35) smoke.add({ x: p.x, y: p.y, z: p.z, vx: vx * 0.6, vy: vy + 1, vz: Math.abs(vz) > 8 ? vz : vz * 0.6, size: 0.5 * scale, grow: 4, life: 0.8, color: C('#5a5a60'), alpha: 0.35, drag: Math.abs(vz) > 8 ? 0 : 1.5 })
    },
    // Wheel sparks (braking, landing).
    sparks(p, n, vx = 0, vz = 0) {
      for (let i = 0; i < n; i++) sparks.add({ x: p.x, y: p.y, z: p.z, vx: vx + rnd(-3, 3), vy: rnd(1, 5), vz: vz + rnd(-2, 2), size: rnd(0.15, 0.3), life: rnd(0.25, 0.55), color: C('#ffd27a'), color2: C('#ff6a1a'), gravity: 14, fadeIn: 0, drag: 0.5 })
    },
    // Glints (purchases, crystals, gold rush).
    glint(p, n = 1, color = '#fff2a8', spread = 1) {
      for (let i = 0; i < n; i++) sparks.add({ x: p.x + rnd(-spread, spread), y: p.y + rnd(-spread, spread), z: p.z + rnd(-spread, spread), vx: rnd(-0.4, 0.4), vy: rnd(0.2, 1.2), vz: rnd(-0.4, 0.4), size: rnd(0.25, 0.6), life: rnd(0.6, 1.2), color: C(color), alpha: 0.9, spin: rnd(-2, 2) })
    },
    // The crash: fireball, black smoke, debris sparks, a ring of skulls.
    explosion(p, scale = 1) {
      for (let i = 0; i < 46 * q; i++) {
        const a = Math.random() * Math.PI * 2
        const up = Math.random()
        const sp = rnd(2, 9) * scale
        fire.add({ x: p.x, y: p.y + 0.5, z: p.z, vx: Math.cos(a) * sp * (1 - up * 0.5), vy: up * sp * 1.1, vz: Math.sin(a) * sp * (1 - up * 0.5), size: rnd(1.2, 2.2) * scale, grow: 1.8, life: rnd(0.5, 1), color: C('#ffb04a'), color2: C('#c42a08'), alpha: 0.75, drag: 2.5, fadeIn: 0 })
      }
      for (let i = 0; i < 40 * q; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = rnd(1, 5) * scale
        smoke.add({ x: p.x, y: p.y + 1, z: p.z, vx: Math.cos(a) * sp, vy: rnd(1.5, 5), vz: Math.sin(a) * sp, size: rnd(1.6, 2.8) * scale, grow: 2.6, life: rnd(1.6, 3), color: C('#1e1a18'), color2: C('#3a3634'), alpha: 0.85, drag: 1.4, fadeIn: 0.15 })
      }
      api.sparks({ x: p.x, y: p.y + 0.6, z: p.z }, Math.round(50 * q))
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        skulls.add({ x: p.x + Math.cos(a) * 1.5, y: p.y + 2, z: p.z + Math.sin(a) * 1.5, vx: Math.cos(a) * 2.5, vy: rnd(3, 6), vz: Math.sin(a) * 2.5, size: rnd(1.2, 2), life: rnd(1.6, 2.4), color: i % 2 ? C('#ff7a1a') : C('#1a0f0a'), alpha: 1, gravity: 2, drag: 1, spin: rnd(-1, 1), rot: 0 })
      }
    },
    // Chunks flying off something: wool, leaves, rock bits, splinters, tumbleweed twigs.
    chunks(p, n = 16, color = '#ffffff', power = 1, size = 0.3, gravity = 9) {
      const c = col(color)
      for (let i = 0; i < n * q; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = rnd(1.5, 6) * power
        confetti.add({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: rnd(2, 7) * power, vz: Math.sin(a) * sp, size: rnd(0.6, 1.2) * size, life: rnd(0.9, 1.6), color: c, alpha: 1, gravity, drag: 1.4, spin: rnd(-10, 10), fadeIn: 0 })
      }
    },
    // Cartoon stars circling above a dizzy head (or cart).
    stars(p, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        sparks.add({ x: p.x + Math.cos(a) * 0.9, y: p.y, z: p.z + Math.sin(a) * 0.9, vx: -Math.sin(a) * 2.2, vy: rnd(0.1, 0.5), vz: Math.cos(a) * 2.2, size: rnd(0.35, 0.55), life: rnd(0.9, 1.3), color: STAR_COLS[i % 3], alpha: 1, spin: rnd(-4, 4), fadeIn: 0 })
      }
    },
    // A coin / gem picked up: a burst of glints in its colour.
    pickup(p, color = '#ffd23a', n = 10) {
      const c = col(color)
      for (let i = 0; i < n * q; i++) sparks.add({ x: p.x, y: p.y, z: p.z, vx: rnd(-3, 3), vy: rnd(0.5, 4), vz: rnd(-3, 3), size: rnd(0.2, 0.45), life: rnd(0.35, 0.7), color: c, alpha: 1, gravity: 4, drag: 2, fadeIn: 0 })
    },
    // A sideways gust of wind / sand streaming across the track at p (dir -1 / 1).
    gust(p, dir = 1, color = '#f2fbff', n = 6, alpha = 0.22) {
      const c = col(color)
      for (let i = 0; i < n; i++) smoke.add({ x: p.x - dir * rnd(4, 14), y: p.y + rnd(0, 5), z: p.z + rnd(-10, 10), vx: dir * rnd(9, 16), vy: rnd(-0.3, 0.6), vz: rnd(-1, 1), size: rnd(0.8, 1.6), grow: 2, life: rnd(0.8, 1.3), color: c, alpha, drag: 0.2, fadeIn: 0.15 })
    },
    // Celebration: confetti fountain.
    confetti(p, n = 80, power = 1) {
      const cols = ['#ff3b5c', '#ffd23a', '#3ad4ff', '#5dff6a', '#b05cff', '#ffffff']
      for (let i = 0; i < n * q; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = rnd(2, 7) * power
        confetti.add({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: rnd(5, 11) * power, vz: Math.sin(a) * sp, size: rnd(0.25, 0.45), life: rnd(1.8, 3), color: C(cols[i % cols.length]), alpha: 1, gravity: 9, drag: 1.6, spin: rnd(-12, 12), fadeIn: 0 })
      }
    },
    // Landing thump: dust ring.
    ring(p, color = '#c9a77a', n = 24) {
      const c = C(color)
      for (let i = 0; i < n * q; i++) {
        const a = (i / n) * Math.PI * 2
        smoke.add({ x: p.x, y: p.y + 0.2, z: p.z, vx: Math.cos(a) * 6, vy: rnd(0.4, 1.5), vz: Math.sin(a) * 6, size: rnd(0.7, 1.1), grow: 2.5, life: rnd(0.6, 1), color: c, alpha: 0.5, drag: 3 })
      }
    },
    // One mote of an area's air (AMB) at p.
    ambient(p, kind) {
      const c = pick(AMB[kind].cols)
      if (kind === 'pollen') sparks.add({ x: p.x, y: p.y, z: p.z, vx: rnd(-0.3, 0.3), vy: rnd(-0.1, 0.3), vz: rnd(-0.3, 0.3), size: rnd(0.07, 0.13), life: rnd(1.8, 2.8), color: c, alpha: 0.5, fadeIn: 0.2 })
      else if (kind === 'leaves') confetti.add({ x: p.x, y: p.y, z: p.z, vx: rnd(1, 3), vy: rnd(-0.5, 0.5), vz: rnd(-0.5, 0.5), size: rnd(0.22, 0.36), life: rnd(2.2, 3.2), color: c, alpha: 1, gravity: 0.8, drag: 0.4, spin: rnd(-5, 5), fadeIn: 0.1 })
      else if (kind === 'spray') smoke.add({ x: p.x, y: p.y - 0.5, z: p.z, vx: rnd(-0.5, 0.5), vy: rnd(0.4, 1.2), vz: rnd(-0.5, 0.5), size: rnd(0.6, 1.1), grow: 2.2, life: rnd(1.2, 1.8), color: c, alpha: 0.22, drag: 0.6, fadeIn: 0.25 })
      else if (kind === 'mist') smoke.add({ x: p.x, y: p.y, z: p.z, vx: rnd(-1, 1), vy: rnd(-0.5, 1.5), vz: rnd(0, 2), size: rnd(2, 3.6), grow: 1.8, life: rnd(1.6, 2.4), color: c, alpha: 0.24, drag: 0.4, fadeIn: 0.25 })
      else if (kind === 'sparkle') sparks.add({ x: p.x, y: p.y, z: p.z, vx: 0, vy: rnd(-0.2, 0.2), vz: 0, size: rnd(0.05, 0.09), life: rnd(0.9, 1.5), color: c, alpha: 0.6, spin: rnd(-3, 3), fadeIn: 0.3 })
      else if (kind === 'snow') confetti.add({ x: p.x, y: p.y + 3, z: p.z, vx: rnd(-0.6, 0.6), vy: rnd(-1.6, -0.8), vz: rnd(-0.6, 0.6), size: rnd(0.1, 0.2), life: rnd(2.2, 3.4), color: c, alpha: 0.95, gravity: 0, drag: 0.2, spin: rnd(-3, 3), fadeIn: 0.15 })
      else if (kind === 'fireflies') sparks.add({ x: p.x, y: p.y, z: p.z, vx: rnd(-0.5, 0.5), vy: rnd(-0.2, 0.4), vz: rnd(-0.5, 0.5), size: rnd(0.12, 0.2), life: rnd(1.6, 2.6), color: c, alpha: 0.9, fadeIn: 0.4 })
      else if (kind === 'sand') smoke.add({ x: p.x, y: p.y - 1, z: p.z, vx: rnd(3, 7), vy: rnd(-0.2, 0.4), vz: rnd(-1, 1), size: rnd(0.3, 0.6), grow: 2.5, life: rnd(1.2, 1.8), color: c, alpha: 0.32, drag: 0.3, fadeIn: 0.2 })
    },
    // Bursting through the waterfall: a cloud of spray and droplets.
    spray(p, n = 80) {
      const c = AMB.mist.cols
      for (let i = 0; i < n * q; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = rnd(2, 9)
        smoke.add({ x: p.x + rnd(-3, 3), y: p.y + rnd(-1, 3), z: p.z, vx: Math.cos(a) * sp, vy: rnd(0, 5), vz: Math.sin(a) * sp * 0.4 + 4, size: rnd(1.2, 2.6), grow: 2.2, life: rnd(0.8, 1.6), color: c[i % 2], alpha: 0.4, drag: 1.6, fadeIn: 0 })
        if (i % 2 === 0) sparks.add({ x: p.x + rnd(-2, 2), y: p.y + rnd(0, 2), z: p.z, vx: Math.cos(a) * sp, vy: rnd(2, 7), vz: rnd(-2, 4), size: rnd(0.12, 0.22), life: rnd(0.5, 0.9), color: c[0], alpha: 0.9, gravity: 14, fadeIn: 0 })
      }
    },
    // A firework shell bursting at p: a sphere of glitter in one colour, then crackle.
    firework(p) {
      const col = pick(FIREWORK)
      const n = Math.round(70 * q)
      for (let i = 0; i < n; i++) {
        const u = Math.random() * 2 - 1
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(1 - u * u)
        const sp = rnd(9, 13)
        sparks.add({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * r * sp, vy: u * sp, vz: Math.sin(a) * r * sp, size: rnd(0.35, 0.55), life: rnd(1, 1.6), color: col, color2: WHITE, alpha: 1, gravity: 4, drag: 1.4, fadeIn: 0 })
      }
      for (let i = 0; i < 12; i++) fire.add({ x: p.x, y: p.y, z: p.z, vx: rnd(-2, 2), vy: rnd(-2, 2), vz: rnd(-2, 2), size: rnd(2, 3), grow: 0.3, life: 0.3, color: col, alpha: 0.8, fadeIn: 0 })
    },
    lightning(at) {
      // Bolt from the clouds down to `at`, zig-zagging, with a branch.
      let x = at.x + rnd(-20, 20)
      let y = at.y + 150
      let z = at.z + rnd(-20, 20)
      let k = 0
      const steps = 22
      for (let i = 0; i < steps; i++) {
        const t = (i + 1) / steps
        const nx = at.x + (x - at.x) * 0.0 + rnd(-6, 6) + (1 - t) * (x - at.x) * 0.2
        const ny = at.y + 150 * (1 - t)
        const nz = at.z + rnd(-6, 6)
        boltPos.set([x, y, z, nx, ny, nz], k * 6)
        k++
        x = nx
        y = ny
        z = nz
      }
      let bx = boltPos[30]
      let by = boltPos[31]
      let bz = boltPos[32]
      for (let i = 0; i < 10 && k < 40; i++) {
        const nx = bx + rnd(2, 8)
        const ny = by - rnd(5, 10)
        const nz = bz + rnd(-5, 5)
        boltPos.set([bx, by, bz, nx, ny, nz], k * 6)
        k++
        bx = nx
        by = ny
        bz = nz
      }
      boltGeo.setDrawRange(0, k * 2)
      boltGeo.attributes.position.needsUpdate = true
      bolt.visible = true
      boltLife = 0.18
    },
    // weather: { rain 0..1 }, speedLines 0..1, the camera.
    update(dt, camera, weather) {
      for (const s of systems) s.update(dt)
      camera.getWorldPosition(camPos)
      updateStreaks(rain, dt, camPos, weather.rain, 'rain')
      updateStreaks(speed, dt, camPos, weather.speed, 'speed', weather.forward)
      if (boltLife > 0) {
        boltLife -= dt
        bolt.material.opacity = Math.random() < 0.5 ? 1 : 0.4
        if (boltLife <= 0) bolt.visible = false
      }
    },
    // h = pixels per metre at 1 m distance (drawing-buffer height / (2 tan(fov/2))).
    resize(h) {
      scaleAll(h)
    },
  }
  return api
}

// Rain falls in a 60 m box around the camera; speed lines stream past it
// toward the back (the ride's forward axis is -Z).
function updateStreaks(st, dt, cam, level, kind, forward = -1) {
  st.level += (level - st.level) * Math.min(1, dt * 2)
  const on = st.level > 0.02
  st.lines.visible = on
  if (!on) return
  st.mat.opacity = st.opacity * st.level
  const p = st.pos
  const R = kind === 'rain' ? 30 : 9
  if (!st.seeded) {
    for (let i = 0; i < st.count; i++) seed(p, i, cam, R, kind, true)
    st.seeded = true
  }
  const fall = kind === 'rain' ? 34 * dt : 0
  const flow = kind === 'speed' ? -forward * 90 * dt : 0
  const visible = Math.floor(st.count * Math.min(1, st.level * 1.2))
  for (let i = 0; i < st.count; i++) {
    const o = i * 6
    if (i >= visible) {
      p[o + 1] = p[o + 4] = -1000
      continue
    }
    p[o + 1] -= fall
    p[o + 4] -= fall
    p[o + 2] += flow
    p[o + 5] += flow
    const dx = p[o] - cam.x
    const dz = p[o + 2] - cam.z
    if (p[o + 4] < cam.y - 12 || Math.abs(dx) > R || Math.abs(dz) > R || p[o + 1] < -900) seed(p, i, cam, R, kind, false)
  }
  st.geo.attributes.position.needsUpdate = true
}

function seed(p, i, cam, R, kind, anywhere) {
  const o = i * 6
  if (kind === 'rain') {
    const x = cam.x + (Math.random() * 2 - 1) * R
    const z = cam.z + (Math.random() * 2 - 1) * R
    const y = cam.y + (anywhere ? Math.random() * 30 - 10 : 18 + Math.random() * 6)
    p.set([x, y, z, x + 0.05, y - 1.1, z + 0.12], o)
  } else {
    // A ring around the view axis, ahead of the camera.
    const a = Math.random() * Math.PI * 2
    const r = 2.5 + Math.random() * 5
    const x = cam.x + Math.cos(a) * r
    const y = cam.y + Math.sin(a) * r * 0.7
    const z = cam.z - (anywhere ? Math.random() * 2 * R - R : R * 0.95)
    p.set([x, y, z, x, y, z + 2.5 + Math.random() * 3], o)
  }
}
