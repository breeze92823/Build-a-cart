// Small building helpers shared by the world, cave and track builders.
import { Group, Mesh } from 'three'
import { studBox, studMat } from './studs.js'
import { solidBox } from './propkit.js'

// A studded block centred at (x, y, z). opts: { solid, yaw, rough, metal,
// emissive, emissiveIntensity, flat, mat (material override), shadow }
export function block(parent, w, h, d, x, y, z, color, opts = {}) {
  const m = new Mesh(studBox(w, h, d), opts.mat ?? studMat(color, opts))
  m.position.set(x, y, z)
  if (opts.yaw) m.rotation.y = opts.yaw
  if (opts.pitch) m.rotation.x = opts.pitch
  if (opts.roll) m.rotation.z = opts.roll
  m.castShadow = opts.shadow !== false
  m.receiveShadow = true
  parent.add(m)
  if (opts.solid) solidBox(w / 2, h / 2, d / 2, x + (parent.position?.x ?? 0), y + (parent.position?.y ?? 0), z + (parent.position?.z ?? 0), opts.yaw ?? 0)
  return m
}

// Block standing on y = base (bottom face at base).
export function pillar(parent, w, h, d, x, base, z, color, opts) {
  return block(parent, w, h, d, x, base + h / 2, z, color, opts)
}

export function group(parent, x = 0, y = 0, z = 0, yaw = 0) {
  const g = new Group()
  g.position.set(x, y, z)
  g.rotation.y = yaw
  parent.add(g)
  return g
}

// Mixes two hex colours: t = 0 -> a, 1 -> b.
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t)
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`
}
