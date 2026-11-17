// The hub: a big cave room inside a blocky mountain. Navy studded walls with
// voxel lumps, green moss, glowing crystals (red ones set in the walls,
// colourful clusters on the floor), cobwebs, dynamite and fences. Along the
// walls: the Upgrades stall (restocking shop), the Sell Gear, Gear Index and
// Daily Gift pads, the Lucky Wheel in a glass case and two record boards. The
// mouth opens north (-Z) through a timbered tunnel onto the valley and bases.
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
} from 'three'
import { CAVE, WHEEL } from './config.js'
import { RAPIER, addFixed } from './physics.js'
import { block, group, mixHex, pillar } from './build.js'
import { bake } from './bake.js'
import { fontReady, label, neon } from './propkit.js'
import { mulberry32, paintFade } from './textures.js'
import { canvasSprite, fmt } from './track.js'

const C = CAVE
const I = C.inner
const H = C.height
const M = C.mouth
const WOOD = '#8a5a32'
const WOOD_DARK = '#5e3a1e'

const solid = (hx, hy, hz, x, y, z) => addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y, z })
// Solid studded block from min/max corners.
function slab(g, x0, x1, y0, y1, z0, z1, color, opts = {}) {
  const w = x1 - x0
  const h = y1 - y0
  const d = z1 - z0
  block(g, w, h, d, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, color, opts)
  if (opts.solid !== false) solid(w / 2, h / 2, d / 2, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
}

// --- Textures ------------------------------------------------------------------------
function paintWeb(size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.strokeStyle = 'rgba(235,240,255,0.85)'
  ctx.lineWidth = 3
  const cx = size / 2
  const spokes = 9
  const pts = []
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.2
    pts.push([Math.cos(a), Math.sin(a)])
    ctx.beginPath()
    ctx.moveTo(cx, cx)
    ctx.lineTo(cx + Math.cos(a) * cx * 0.96, cx + Math.sin(a) * cx * 0.96)
    ctx.stroke()
  }
  ctx.lineWidth = 2.4
  for (let r = 0.16; r < 0.95; r += 0.15) {
    ctx.beginPath()
    for (let i = 0; i <= spokes; i++) {
      const [x, y] = pts[i % spokes]
      const sag = i % 2 ? 0.92 : 1
      const px = cx + x * cx * r * sag
      const py = cx + y * cx * r * sag
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  return c
}

function paintWheel(size = 512) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const r = size / 2
  const n = WHEEL.prizes.length
  const step = (Math.PI * 2) / n
  WHEEL.prizes.forEach((p, i) => {
    // Wedge i centred i*step clockwise from the top.
    const mid = -Math.PI / 2 + i * step
    ctx.beginPath()
    ctx.moveTo(r, r)
    ctx.arc(r, r, r - 6, mid - step / 2, mid + step / 2)
    ctx.closePath()
    ctx.fillStyle = p.color
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.save()
    ctx.translate(r, r)
    ctx.rotate(mid + Math.PI / 2)
    ctx.font = '700 38px Fredoka, "Arial Black", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    const words = p.label.split(' ')
    words.forEach((wd, k) => {
      const y = -r * 0.66 + k * 40
      ctx.strokeText(wd, 0, y)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(wd, 0, y)
    })
    ctx.restore()
  })
  ctx.beginPath()
  ctx.arc(r, r, r - 4, 0, Math.PI * 2)
  ctx.lineWidth = 10
  ctx.strokeStyle = '#f7e27a'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(r, r, 46, 0, Math.PI * 2)
  ctx.fillStyle = '#f7e27a'
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = '#a8862a'
  ctx.stroke()
  return c
}

// --- Props ---------------------------------------------------------------------------
const crystalGeo = new OctahedronGeometry(1, 0)
const gemGeo = new IcosahedronGeometry(1, 0)
const crystalMats = new Map()
function crystalMat(color, k = 1) {
  const key = color + k
  let m = crystalMats.get(key)
  if (!m) crystalMats.set(key, (m = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55 * k, roughness: 0.25, metalness: 0.1, flatShading: true })))
  return m
}

function crystal(g, x, y, z, s, color, rx = 0, rz = 0, k = 1) {
  const m = new Mesh(crystalGeo, crystalMat(color, k))
  m.position.set(x, y, z)
  m.scale.set(s * 0.55, s * 1.25, s * 0.5)
  m.rotation.set(rx, (x * 7 + z * 3) % 3, rz)
  m.castShadow = true
  g.add(m)
  return m
}

// A cluster of three big chunky gems (the coloured rocks in the cave corners).
function gemCluster(g, x, y, z, s, colors, rand) {
  colors.forEach((c, i) => {
    const m = new Mesh(gemGeo, crystalMat(c, 0.6))
    const a = (i / colors.length) * Math.PI * 2 + rand()
    m.position.set(x + Math.cos(a) * s * 0.7, y + s * (0.5 + rand() * 0.6), z + Math.sin(a) * s * 0.7)
    m.scale.set(s * (0.8 + rand() * 0.4), s * (0.9 + rand() * 0.5), s * (0.6 + rand() * 0.3))
    m.rotation.set(rand() * 2, rand() * 3, rand() * 2)
    m.castShadow = true
    g.add(m)
  })
}

function dynamite(g, x, z, yaw) {
  const sticks = new Group()
  sticks.position.set(x, 0.42, z)
  sticks.rotation.set(0, yaw, Math.PI / 2)
  const red = new MeshStandardMaterial({ color: '#a01818', roughness: 0.7 })
  const band = new MeshStandardMaterial({ color: '#141414', roughness: 0.8 })
  const geo = new CylinderGeometry(0.24, 0.24, 2.6, 12)
  for (const [dx, dz] of [
    [0, 0],
    [0.46, 0],
    [0.23, 0.4],
  ]) {
    const m = new Mesh(geo, red)
    m.position.set(dx, 0, dz)
    m.castShadow = true
    sticks.add(m)
  }
  for (const y of [-0.7, 0.7]) {
    const b = new Mesh(new CylinderGeometry(0.5, 0.5, 0.22, 14), band)
    b.position.set(0.23, y, 0.15)
    sticks.add(b)
  }
  g.add(sticks)
}

function fence(g, x, z, len, yaw) {
  const f = group(g, x, 0, z, yaw)
  const red = '#a5462a'
  for (let i = 0; i <= len; i += 2) pillar(f, 0.35, 1.8, 0.35, i - len / 2, 0, 0, red)
  for (const y of [0.7, 1.35]) block(f, len + 0.4, 0.3, 0.2, 0, y, 0, mixHex(red, '#ffffff', 0.08))
  for (let i = 0; i < len; i += 2) block(f, 0.25, 1.9, 0.18, i - len / 2 + 1, 0.95, 0.05, red, { roll: 0.75 })
}

function lantern(g, x, y, z) {
  pillar(g, 0.5, 0.12, 0.5, x, y, z, '#3a2a14')
  const glass = new Mesh(new BoxGeometry(0.4, 0.55, 0.4), neon('#ffc24a', 2.6))
  glass.position.set(x, y + 0.4, z)
  g.add(glass)
  pillar(g, 0.55, 0.12, 0.55, x, y + 0.67, z, '#3a2a14')
}

// Glowing floor pad with a soft light column over it.
function pad(root, staticG, x, z, color, fadeTex) {
  pillar(staticG, 4.6, 0.3, 4.6, x, 0, z, mixHex(color, '#000000', 0.25))
  const top = new Mesh(new BoxGeometry(4.2, 0.08, 4.2), neon(color, 2.2))
  top.position.set(x, 0.32, z)
  root.add(top)
  const colMat = new MeshBasicMaterial({ map: fadeTex, color, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
  const column = new Mesh(new CylinderGeometry(2.1, 2.1, 3, 4, 1, true), colMat)
  column.rotation.y = Math.PI / 4
  column.position.set(x, 1.85, z)
  root.add(column)
  return { top, column }
}

function board(root, x, z, yaw, title, accent) {
  const g = group(root, x, 0, z, yaw)
  const frame = accent
  block(g, 7.6, 9.4, 0.5, 0, 6.2, 0, mixHex(frame, '#000000', 0.1))
  block(g, 6.8, 8.6, 0.2, 0, 6.2, -0.3, '#1b4f9c')
  const sprite = canvasSprite(512, 640, 8.2, () => {})
  const tex = sprite.material.map
  const plane = new Mesh(new PlaneGeometry(6.56, 8.2), new MeshBasicMaterial({ map: tex, transparent: true }))
  plane.position.set(0, 6.2, -0.42)
  plane.rotation.y = Math.PI
  g.add(plane)
  const draw = (rows) => {
    sprite.userData.redraw = null
    const c = tex.image
    const ctx = c.getContext('2d')
    const w = c.width
    ctx.clearRect(0, 0, w, c.height)
    ctx.fillStyle = '#2a63c8'
    ctx.beginPath()
    ctx.roundRect(36, 18, w - 72, 70, 18)
    ctx.fill()
    ctx.font = '700 46px Fredoka, "Arial Black", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 8
    ctx.strokeStyle = '#0b1a3a'
    ctx.strokeText(title, w / 2, 55)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(title, w / 2, 55)
    rows.forEach((row, i) => {
      const y = 112 + i * 64
      ctx.fillStyle = i === 0 ? '#f0a020' : i === 1 ? '#c6ccd8' : i === 2 ? '#d07a3a' : '#3b8ae8'
      ctx.beginPath()
      ctx.roundRect(30, y, w - 60, 54, 14)
      ctx.fill()
      ctx.font = '700 30px Fredoka, "Arial Black", sans-serif'
      ctx.textAlign = 'left'
      ctx.lineWidth = 6
      ctx.strokeText(`#${i + 1}`, 44, y + 28)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`#${i + 1}`, 44, y + 28)
      ctx.strokeText(row[0], 104, y + 28)
      ctx.fillText(row[0], 104, y + 28)
      ctx.textAlign = 'right'
      ctx.strokeText(row[1], w - 46, y + 28)
      ctx.fillStyle = '#ffe86a'
      ctx.fillText(row[1], w - 46, y + 28)
    })
    tex.needsUpdate = true
  }
  return { draw }
}

function wallText(root, text, x, y, z, yaw, height, color = '#7fd06a') {
  const c = document.createElement('canvas')
  const draw = () => {
    const ctx = c.getContext('2d')
    ctx.font = '700 160px Fredoka, "Arial Black", sans-serif'
    c.width = Math.ceil(ctx.measureText(text).width + 60)
    c.height = 220
    ctx.font = '700 160px Fredoka, "Arial Black", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 18
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(10,30,20,0.85)'
    ctx.strokeText(text, c.width / 2, 115)
    ctx.fillStyle = color
    ctx.fillText(text, c.width / 2, 115)
  }
  draw()
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const mesh = new Mesh(new PlaneGeometry((height * c.width) / c.height, height), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
  mesh.position.set(x, y, z)
  mesh.rotation.y = yaw
  root.add(mesh)
  fontReady.then(() => {
    draw()
    mesh.geometry.dispose()
    mesh.geometry = new PlaneGeometry((height * c.width) / c.height, height)
    tex.dispose()
    tex.needsUpdate = true
  })
}

// --- Build -------------------------------------------------------------------------------
export function buildCave(scene) {
  const root = new Group()
  scene.add(root)
  const g = new Group() // static, baked at the end
  const rand = mulberry32(4242)
  const rock = C.rock
  const rockDark = C.rockDark
  const T = 3 // wall thickness

  // Floor, ceiling, walls.
  slab(g, I.x0, I.x1, -0.3, 0.04, I.z0, I.z1, C.floor, { shadow: false })
  slab(g, I.x0 - T, I.x1 + T, H, H + 4, I.z0 - T, I.z1 + T, rockDark)
  slab(g, I.x0 - T, I.x0, 0, H, I.z0 - T, I.z1 + T, rock)
  slab(g, I.x1, I.x1 + T, 0, H, I.z0 - T, I.z1 + T, rock)
  slab(g, I.x0, I.x1, 0, H, I.z1, I.z1 + T, rock)
  slab(g, I.x0, -M.halfWidth, 0, H, I.z0 - T, I.z0, rock)
  slab(g, M.halfWidth, I.x1, 0, H, I.z0 - T, I.z0, rock)
  slab(g, -M.halfWidth, M.halfWidth, M.height, H, I.z0 - T, I.z0, rock)
  // Tunnel out to the valley.
  slab(g, -M.halfWidth - T, -M.halfWidth, 0, M.height, M.z0, I.z0 - T, rock)
  slab(g, M.halfWidth, M.halfWidth + T, 0, M.height, M.z0, I.z0 - T, rock)
  slab(g, -M.halfWidth - T, M.halfWidth + T, M.height, M.height + 3, M.z0, I.z0 - T, rockDark)
  slab(g, -M.halfWidth, M.halfWidth, -3, 0.04, M.z0, I.z0, C.floor, { shadow: false })

  // Voxel lumps on the inner walls so they read as carved rock.
  const lump = (x, y, z, sx, sy, sz) => block(g, sx, sy, sz, x, y, z, rand() < 0.5 ? rock : rockDark, { shadow: false })
  for (let i = 0; i < 70; i++) {
    const side = Math.floor(rand() * 3)
    const y = rand() * H
    const s = 1 + rand() * 3
    if (side === 0) lump(I.x0 + s * 0.25, y, I.z0 + rand() * (I.z1 - I.z0), s, s * (0.6 + rand()), s * 1.5)
    else if (side === 1) lump(I.x1 - s * 0.25, y, I.z0 + rand() * (I.z1 - I.z0), s, s * (0.6 + rand()), s * 1.5)
    else {
      const x = I.x0 + rand() * (I.x1 - I.x0)
      if (Math.abs(x) < 16 && y > 6) continue // keep the title wall clear
      lump(x, y, I.z1 - s * 0.25, s * 1.5, s * (0.6 + rand()), s)
    }
  }
  // Ceiling stalactites.
  for (let i = 0; i < 26; i++) {
    const s = 0.8 + rand() * 1.6
    block(g, s, s * (1 + rand() * 2), s, I.x0 + 3 + rand() * (I.x1 - I.x0 - 6), H - s, I.z0 + 3 + rand() * (I.z1 - I.z0 - 6), rockDark, { shadow: false })
  }
  // Moss: green carpets on the floor edges and glowing streaks on the walls.
  const mossMat = { emissive: C.moss, emissiveIntensity: 0.25 }
  for (let i = 0; i < 22; i++) {
    const w = 2 + rand() * 6
    const d = 2 + rand() * 5
    const along = rand() < 0.5
    const x = along ? I.x0 + 1 + rand() * 3 + (rand() < 0.5 ? 0 : I.x1 - I.x0 - 6) : I.x0 + 2 + rand() * (I.x1 - I.x0 - 4)
    const z = along ? I.z0 + rand() * (I.z1 - I.z0) : I.z1 - 1 - rand() * 4
    block(g, w, 0.2 + rand() * 0.5, d, x, 0.12, z, C.moss, { ...mossMat, shadow: false })
  }
  for (let i = 0; i < 14; i++) {
    const h = 2 + rand() * 6
    const x = rand() < 0.5 ? I.x0 + 0.1 : I.x1 - 0.1
    block(g, 0.3, h, 1 + rand() * 3, x, H - h / 2 - rand() * 3, I.z0 + rand() * (I.z1 - I.z0), C.moss, { ...mossMat, shadow: false })
  }
  // Vines hanging from the ceiling.
  for (let i = 0; i < 18; i++) {
    const len = 2 + rand() * 5
    block(g, 0.2, len, 0.2, I.x0 + 2 + rand() * (I.x1 - I.x0 - 4), H - len / 2, I.z0 + 2 + rand() * (I.z1 - I.z0 - 4), '#2e9a3a', { shadow: false })
  }

  // The mountain outside (the long cliff wall with every base's cave mouth) is outside.js.

  // Timbered mine entrance.
  for (const s of [-1, 1]) pillar(g, 1, M.height, 1, s * (M.halfWidth - 0.4), 0, M.z0 - 0.2, WOOD_DARK)
  block(g, M.halfWidth * 2 + 1.6, 1.1, 1.2, 0, M.height - 0.4, M.z0 - 0.2, WOOD)
  for (let z = M.z0 + 2.5; z < I.z0 - T; z += 3) {
    for (const s of [-1, 1]) pillar(g, 0.6, M.height - 0.6, 0.6, s * (M.halfWidth - 0.4), 0, z, WOOD_DARK, { shadow: false })
    block(g, M.halfWidth * 2, 0.6, 0.6, 0, M.height - 0.4, z, WOOD, { shadow: false })
  }

  // Red crystals in the walls (inside and on the front face).
  const crystalsG = new Group()
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(rand() * 4)
    const y = 2 + rand() * (H - 4)
    const s = 0.8 + rand() * 1.1
    let x
    let z
    if (side === 0) [x, z] = [I.x0 + 0.2, I.z0 + 2 + rand() * (I.z1 - I.z0 - 4)]
    else if (side === 1) [x, z] = [I.x1 - 0.2, I.z0 + 2 + rand() * (I.z1 - I.z0 - 4)]
    else if (side === 2) [x, z] = [I.x0 + 2 + rand() * (I.x1 - I.x0 - 4), I.z1 - 0.2]
    else [x, z] = [rand() < 0.5 ? -M.halfWidth - 2 - rand() * 18 : M.halfWidth + 2 + rand() * 18, I.z0 + 0.2]
    crystal(crystalsG, x, y, z, s, '#ff2a2a', (rand() - 0.5) * 0.8, (rand() - 0.5) * 1.2, 1.6)
  }
  // Gem clusters on the floor.
  const palettes = [
    ['#4aa8ff', '#9a4dff', '#53d64a'],
    ['#9a4dff', '#53d64a', '#ff8a2a'],
    ['#ff8a2a', '#53d64a', '#b44dff'],
    ['#53d64a', '#4aa8ff', '#9a4dff'],
  ]
  const clusterAt = [
    [-23, 70],
    [23, 70],
    [-9, 72],
    [9, 72],
    [-24, 28],
    [24, 28],
    [-12, 30],
    [13, 41],
  ]
  clusterAt.forEach(([x, z], i) => gemCluster(crystalsG, x, 0, z, 1.1 + rand() * 0.6, palettes[i % palettes.length], rand))
  // Outside by the mouth too.
  gemCluster(crystalsG, -M.halfWidth - 6, 0, M.z0 - 3, 1.2, palettes[0], rand)
  gemCluster(crystalsG, M.halfWidth + 6, 0, M.z0 - 3, 1.2, palettes[1], rand)
  root.add(crystalsG)

  // Dynamite, fences, cobwebs.
  dynamite(g, -12, 36, 0.4)
  dynamite(g, 15, 60, -0.3)
  dynamite(g, -5, 22.5, 1.4)
  dynamite(g, 9, 30, 0.2)
  fence(g, 17, 36, 6, Math.PI / 2)
  fence(g, -17, 66, 6, 0.3)
  fence(g, 11, 70, 4, 0)
  const webTex = new CanvasTexture(paintWeb())
  webTex.colorSpace = SRGBColorSpace
  const webMat = new MeshBasicMaterial({ map: webTex, transparent: true, depthWrite: false, side: DoubleSide })
  const web = (x, y, z, yaw, s) => {
    const m = new Mesh(new PlaneGeometry(s, s), webMat)
    m.position.set(x, y, z)
    m.rotation.y = yaw
    root.add(m)
  }
  web(I.x0 + 0.3, H - 3, I.z0 + 3, Math.PI / 2, 5)
  web(I.x1 - 0.3, H - 3, I.z1 - 4, Math.PI / 2, 6)
  web(-14, 10, I.z1 - 0.3, 0, 5)
  web(14, 12, I.z1 - 0.3, 0, 4)
  web(-8, 9, I.z0 + 0.3, 0, 4)
  web(I.x1 - 0.3, 9, 46, Math.PI / 2, 3.5)
  web(-M.halfWidth - 2, 7, M.z0 - 0.4, 0, 4)
  web(M.halfWidth + 3, 10, M.z0 - 0.4, 0, 5)

  // --- Upgrades stall (back wall) ---------------------------------------------------
  const sx = 0
  const sz = I.z1 - 6
  for (const [dx, dz] of [
    [-3.4, -1.6],
    [3.4, -1.6],
    [-3.4, 1.8],
    [3.4, 1.8],
  ])
    pillar(g, 0.4, 4.4, 0.4, sx + dx, 0, sz + dz, WOOD)
  slab(g, sx - 4, sx + 4, 0, 1.4, sz - 2.2, sz - 1, WOOD)
  block(g, 8.4, 0.2, 1.5, sx, 1.5, sz - 1.6, '#a87445')
  for (let i = 0; i < 10; i++) block(g, 0.8, 0.2, 4.4, sx - 3.6 + i * 0.8, 4.6, sz, i % 2 ? '#ffffff' : '#2f6fe0', { pitch: 0.2 })
  for (let i = 0; i < 10; i++) block(g, 0.8, 0.6, 0.08, sx - 3.6 + i * 0.8, 4.05, sz - 2.25, i % 2 ? '#ffffff' : '#2f6fe0')
  // Hooded shopkeeper.
  pillar(g, 1.1, 1.3, 0.6, sx, 1.1, sz + 0.4, '#1d1d24')
  pillar(g, 0.75, 0.75, 0.75, sx, 2.4, sz + 0.4, '#d9c6a5')
  block(g, 0.95, 0.95, 0.95, sx, 2.8, sz + 0.5, '#24242c')
  for (const s of [-1, 1]) block(g, 0.32, 1.1, 0.32, sx + s * 0.72, 1.85, sz + 0.25, '#1d1d24')
  // Gear on the counter and shelves.
  for (let i = 0; i < 5; i++) pillar(g, 0.5, 0.5, 0.5, sx - 2.8 + i * 1.4, 1.6, sz - 1.6, ['#f1c40f', '#e67e22', '#3498db', '#2ecc71', '#e74c3c'][i])
  slab(g, sx - 3.2, sx + 3.2, 2.6, 2.8, sz + 1.2, sz + 1.8, WOOD, { solid: false })
  lantern(g, sx - 3.4, 3.2, sz - 1.8)
  lantern(g, sx + 3.4, 3.2, sz - 1.8)
  fence(g, sx - 7.5, sz - 1.6, 4, 0)
  fence(g, sx + 7.5, sz - 1.6, 4, 0)

  // Pads along the west wall.
  const fade = paintFade('#ffffff', 128)
  const fadeTex = new CanvasTexture(fade)
  const padX = I.x0 + 5.5
  const sellPad = pad(root, g, padX, 60, '#ff2f3a', fadeTex)
  const indexPad = pad(root, g, padX, 51, '#a35cff', fadeTex)
  const giftPad = pad(root, g, padX, 42, '#38e04a', fadeTex)

  // Lucky wheel in a glass case (east wall), facing west.
  const wx = I.x1 - 4.5
  const wz = 52
  slab(g, wx - 2, wx + 2.5, 0, 1.2, wz - 3.6, wz + 3.6, '#c8d4e8')
  const caseMat = new MeshPhysicalMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, depthWrite: false })
  const glass = new Mesh(new BoxGeometry(4.2, 7.2, 7), caseMat)
  glass.position.set(wx + 0.2, 4.8, wz)
  root.add(glass)
  solid(2.1, 3.6, 3.5, wx + 0.2, 4.8, wz)
  pillar(g, 0.8, 4.2, 0.8, wx + 1.4, 1.2, wz, '#6b7280')
  const wheelTex = new CanvasTexture(paintWheel())
  wheelTex.colorSpace = SRGBColorSpace
  const wheelHolder = group(root, wx, 4.9, wz, -Math.PI / 2)
  const wheelDisk = new Mesh(new CircleGeometry(2.9, 64), new MeshStandardMaterial({ map: wheelTex, roughness: 0.4, emissive: '#ffffff', emissiveMap: wheelTex, emissiveIntensity: 0.25 }))
  wheelHolder.add(wheelDisk)
  const rimM = new Mesh(new CylinderGeometry(3.02, 3.02, 0.3, 48, 1, true), new MeshStandardMaterial({ color: '#f7e27a', metalness: 0.6, roughness: 0.3, side: DoubleSide }))
  rimM.rotation.x = Math.PI / 2
  wheelHolder.add(rimM)
  const pointer = new Mesh(new CylinderGeometry(0, 0.5, 1.1, 3), new MeshStandardMaterial({ color: '#e0202a', roughness: 0.4 }))
  pointer.rotation.z = Math.PI
  pointer.position.set(0, 3.1, 0.2)
  wheelHolder.add(pointer)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const bulb = new Mesh(new BoxGeometry(0.18, 0.18, 0.18), neon(i % 2 ? '#ffffff' : '#ffd84a', 2.5))
    bulb.position.set(Math.cos(a) * 3.05, Math.sin(a) * 3.05, 0.12)
    wheelHolder.add(bulb)
  }
  fence(g, wx - 3, wz - 6.5, 4, Math.PI / 2 + 0.2)

  // Record boards by the entrance.
  const runsBoard = board(root, I.x0 + 0.6, 34, -Math.PI / 2, 'YOUR TOP RUNS', '#2fb04a')
  const recBoard = board(root, I.x1 - 0.6, 34, Math.PI / 2, 'RECORDS', '#3a7be0')

  // Titles painted on the walls.
  wallText(root, 'BUILD A CART', 0, 13.4, I.z1 - 0.3, Math.PI, 3.4)
  wallText(root, 'Ride • Upgrade • Jump the canyon', 0, 11, I.z1 - 0.3, Math.PI, 1.2, '#bfe8ff')

  // Floating labels.
  const mk = (text, h, opts, x, y, z) => {
    const l = label(text, h, opts)
    l.position.set(x, y, z)
    root.add(l)
    return l
  }
  mk('Shop', 1.6, { color: '#ffffff' }, sx, 7.1, sz - 1)
  mk('Sell Gear', 0.9, { color: '#ffffff' }, padX, 4.2, 60)
  mk('Index', 0.9, { color: '#ffffff' }, padX, 4.2, 51)
  const restock = canvasSprite(560, 110, 0.95, (ctx, w, h, text) => {
    ctx.font = '700 66px Fredoka, "Arial Black", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 12
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0b1a3a'
    ctx.strokeText(text, w / 2, h / 2)
    ctx.fillStyle = '#4dff5a'
    ctx.fillText(text, w / 2, h / 2)
  })
  restock.position.set(sx, 8.3, sz - 1)
  root.add(restock)
  const gift = canvasSprite(560, 220, 1.6, (ctx, w, h, top, bottom) => {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.font = '700 84px Fredoka, "Arial Black", sans-serif'
    ctx.lineWidth = 14
    ctx.strokeStyle = '#0b3a14'
    ctx.strokeText(top, w / 2, 62)
    ctx.fillStyle = '#5dff6a'
    ctx.fillText(top, w / 2, 62)
    ctx.font = '700 60px Fredoka, "Arial Black", sans-serif'
    ctx.strokeStyle = '#0b1a3a'
    ctx.strokeText(bottom, w / 2, 160)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(bottom, w / 2, 160)
  })
  gift.position.set(padX, 4.6, 42)
  root.add(gift)
  const wheelSign = canvasSprite(620, 220, 2.2, (ctx, w, h, text, ready) => {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.font = '700 88px Fredoka, "Arial Black", sans-serif'
    ctx.lineWidth = 14
    ctx.strokeStyle = '#1a2148'
    ctx.strokeText('LUCKY WHEEL', w / 2, 62)
    ctx.fillStyle = '#d9defa'
    ctx.fillText('LUCKY WHEEL', w / 2, 62)
    ctx.font = '700 76px Fredoka, "Arial Black", sans-serif'
    ctx.strokeStyle = '#06303a'
    ctx.strokeText(text, w / 2, 160)
    ctx.fillStyle = ready ? '#5dff6a' : '#3df2ff'
    ctx.fillText(text, w / 2, 160)
  })
  wheelSign.position.set(wx - 0.5, 10, wz)
  root.add(wheelSign)

  // Lights: lanterns at the stall, the pads' glow, a cool fill.
  const lights = [
    [sx, 4, sz - 3, '#ffb35c', 30, 16],
    [padX + 2, 2.5, 51, '#b05cff', 18, 14],
    [padX + 2, 2.5, 40, '#4dff5a', 16, 12],
    [wx - 3, 5, wz, '#ffe08a', 16, 13],
    [0, 9, 38, '#5fa8ff', 26, 26],
  ]
  for (const [x, y, z, color, intensity, dist] of lights) {
    const l = new PointLight(color, intensity, dist, 1.6)
    l.position.set(x, y, z)
    root.add(l)
  }

  root.add(bake(g, true))

  const inside = (p) => p.x > I.x0 - 1 && p.x < I.x1 + 1 && p.z > M.z0 + 2 && p.z < I.z1 + 1 && p.y < H
  // 0..1 how far into the cave: 0 at the mouth, 1 once inside the room.
  const depth = (p) => {
    if (!(p.x > I.x0 - 1 && p.x < I.x1 + 1 && p.y < H)) return 0
    return Math.max(0, Math.min(1, (p.z - M.z0) / (I.z0 + 4 - M.z0)))
  }

  return {
    spots: {
      upgrades: { x: sx, z: sz - 3.2 },
      sell: { x: padX, z: 60 },
      index: { x: padX, z: 51 },
      gift: { x: padX, z: 42 },
      wheel: { x: wx - 3.6, z: wz },
    },
    inside,
    depth,
    setRestock: (seconds) => restock.userData.redraw(`Restock: ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`),
    setGift: (ready, secondsLeft, amount) => gift.userData.redraw(`+${fmt(amount)}`, ready ? 'Daily Gift: READY!' : `Daily Gift in ${clock(secondsLeft)}`),
    setWheel: (ready, secondsLeft) => wheelSign.userData.redraw(ready ? 'SPIN READY!' : `SPIN IN: ${clock(secondsLeft)}`, ready),
    setBoards(runs, records) {
      runsBoard.draw(runs)
      recBoard.draw(records)
    },
    wheelDisk,
    update(dt, t) {
      for (const p of [sellPad, indexPad, giftPad]) {
        p.column.material.opacity = 0.32 + Math.sin(t * 2.2) * 0.1
      }
      crystalsG.children.forEach((c, i) => {
        if (c.material.emissiveIntensity !== undefined && i % 3 === 0) c.rotation.y += dt * 0.15
      })
    },
  }
}

export function clock(s) {
  s = Math.max(0, Math.floor(s))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
