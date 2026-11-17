// Gear thumbnails: each gear's 3D model rendered once (with the main renderer,
// into an offscreen target) to a PNG data URL for the shop cards.
import { AmbientLight, Box3, Color, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderTarget } from 'three'
import { buildCart, buildEngine, buildTank } from '../cartModel.js'
import { gearById } from '../state.js'

let renderer = null
const cache = new Map()
export function initThumbs(r) {
  renderer = r
}

function modelFor(g) {
  if (g.type === 'engine') return buildEngine(g.id, g.color)
  if (g.type === 'fuel') return buildTank(g.id, g.color)
  if (g.type === 'wheels') return buildCart({ wheels: g }, { color: '#3a4560', stripe: null })
  return buildCart({ booster: g }, { color: '#3a4560', stripe: null })
}

const SIZE = 160
const GAMMA = new Uint8Array(256).map((_, i) => {
  const v = Math.min(1, (i / 255) * 1.15)
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))
})
export function thumb(id) {
  if (cache.has(id)) return cache.get(id)
  const g = gearById[id]
  if (!renderer || !g) return ''
  const scene = new Scene()
  scene.add(new AmbientLight('#ffffff', 1.6))
  const sun = new DirectionalLight('#ffffff', 2.6)
  sun.position.set(3, 5, 4)
  scene.add(sun)
  const model = modelFor(g)
  scene.add(model)
  const box = new Box3().setFromObject(model)
  const c = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3()).length()
  const cam = new PerspectiveCamera(30, 1, 0.01, 100)
  const dir = new Vector3(1.1, 0.8, 1.4).normalize()
  cam.position.copy(c).addScaledVector(dir, size * 1.9)
  cam.lookAt(c)
  const rt = new WebGLRenderTarget(SIZE, SIZE, { samples: 0 })
  const prevTarget = renderer.getRenderTarget()
  const prevColor = renderer.getClearColor(new Color())
  const prevAlpha = renderer.getClearAlpha()
  renderer.setRenderTarget(rt)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  renderer.render(scene, cam)
  const px = new Uint8Array(SIZE * SIZE * 4)
  renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, px)
  renderer.setRenderTarget(prevTarget)
  renderer.setClearColor(prevColor, prevAlpha)
  rt.dispose()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(SIZE, SIZE)
  // Flip vertically (GL rows start at the bottom).
  // and linear -> sRGB (render targets are written linear).
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4)
  for (let i = 0; i < img.data.length; i += 4) for (let c = 0; c < 3; c++) img.data[i + c] = GAMMA[img.data[i + c]]
  ctx.putImageData(img, 0, 0)
  const url = canvas.toDataURL()
  cache.set(id, url)
  return url
}
