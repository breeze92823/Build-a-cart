// The toy-brick look: one tileable "studs" texture pair (colour + normal map),
// painted once, multiplied by each material's colour; and box/plane geometry
// whose UVs are scaled to world size, so every surface shows studs at the same
// size (STUD m) whatever the box. Materials are cached by colour so baked
// scenery merges into few draw calls.
import { BoxGeometry, CanvasTexture, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector2 } from 'three'
import { heightToNormal } from './textures.js'

const PER_TILE = 4 // studs per texture tile edge
export const STUD = 0.5 // m per stud
const TILE = PER_TILE * STUD // m per texture tile

function paint(size = 256) {
  const cell = size / PER_TILE
  const col = document.createElement('canvas')
  col.width = col.height = size
  const ctx = col.getContext('2d')
  ctx.fillStyle = '#e9e9e9'
  ctx.fillRect(0, 0, size, size)
  const heights = new Float32Array(size * size)
  const inset = cell * 0.2
  const side = cell - inset * 2
  const bevel = cell * 0.07
  for (let gy = 0; gy < PER_TILE; gy++) {
    for (let gx = 0; gx < PER_TILE; gx++) {
      const x0 = gx * cell + inset
      const y0 = gy * cell + inset
      // Seam between bricks: a faint darker line on the cell edge.
      ctx.fillStyle = 'rgba(0,0,0,0.07)'
      ctx.fillRect(gx * cell, gy * cell, cell, 1.5)
      ctx.fillRect(gx * cell, gy * cell, 1.5, cell)
      // The stud: lit top-left edge, shaded bottom-right edge, flat face.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x0, y0, side, bevel)
      ctx.fillRect(x0, y0, bevel, side)
      ctx.fillStyle = '#b9b9b9'
      ctx.fillRect(x0, y0 + side - bevel, side, bevel)
      ctx.fillRect(x0 + side - bevel, y0, bevel, side)
      ctx.fillStyle = '#f2f2f2'
      ctx.fillRect(x0 + bevel, y0 + bevel, side - bevel * 2, side - bevel * 2)
      for (let y = Math.floor(y0); y < y0 + side; y++) {
        for (let x = Math.floor(x0); x < x0 + side; x++) {
          const e = Math.min(x - x0, y - y0, x0 + side - x, y0 + side - y)
          heights[y * size + x] = Math.min(1, e / bevel)
        }
      }
    }
  }
  return { color: col, normal: heightToNormal(heights, size, 1.6) }
}

let tex = null
function textures() {
  if (tex) return tex
  const p = paint()
  const map = new CanvasTexture(p.color)
  map.colorSpace = SRGBColorSpace
  const normalMap = new CanvasTexture(p.normal)
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.anisotropy = 8
  }
  tex = { map, normalMap }
  return tex
}

const mats = new Map()
// Studded material in `color`. opts: { rough, metal, emissive, emissiveIntensity, flat (no studs) }
export function studMat(color, opts = {}) {
  const key = `${color}|${opts.rough ?? 0.78}|${opts.metal ?? 0}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 0}|${opts.flat ? 1 : 0}`
  let m = mats.get(key)
  if (m) return m
  const t = opts.flat ? {} : textures()
  m = new MeshStandardMaterial({
    color,
    map: t.map ?? null,
    normalMap: t.normalMap ?? null,
    normalScale: new Vector2(0.55, 0.55),
    roughness: opts.rough ?? 0.78,
    metalness: opts.metal ?? 0,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  })
  mats.set(key, m)
  return m
}

// Box with stud UVs at world scale. (BoxGeometry face order: +x, -x, +y, -y, +z, -z.)
const boxes = new Map()
export function studBox(w, h, d) {
  const key = `${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}`
  let g = boxes.get(key)
  if (g) return g
  g = new BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f]
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, (uv.getX(k) * su) / TILE, (uv.getY(k) * sv) / TILE)
    }
  }
  boxes.set(key, g)
  return g
}

// Flat ground plane (XZ) with stud UVs.
export function studPlane(w, d) {
  const g = new PlaneGeometry(w, d)
  g.rotateX(-Math.PI / 2)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / TILE, (uv.getY(i) * d) / TILE)
  return g
}
