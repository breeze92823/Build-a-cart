// The areas past the Great Arch, along the extended line (TRACK.hills, ZONES):
//  - Bumpy Meadows: flower patches, hay bales and AIRTIME signs by the humps
//  - Crystal River: a blue river across the valley under a low trestle bridge,
//    white stone banks, bluffs and pools
//  - Waterfall Gorge: tall stepped walls closing in, a lake under the Sky
//    Trestle, the waterfall pouring down the mountain face, mist and a rainbow
//  - Glow Mine: the mountain behind the falls, one bore per track, lined with
//    timber frames, glowing crystals and lanterns
//  - Golden Sands: sand, mesas, cacti; Golden Station and its finish arch
// Everything static is baked (one mesh per material). The water textures scroll.
import {
  CanvasTexture,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  TorusGeometry,
} from 'three'
import { BASES, TRACK, VALLEY, ZONES } from './config.js'
import { VALLEY_Y, trackHeight } from './cartPhysics.js'
import { RAPIER, addFixed } from './physics.js'
import { mulberry32 } from './textures.js'
import { block, mixHex, pillar } from './build.js'
import { bake } from './bake.js'
import { label, neon } from './propkit.js'

const T = TRACK
const V = VALLEY
const zAt = (s) => BASES.cartZ - s // (world.js has the same; imported there from here would be a cycle)
const sAt = (z) => BASES.cartZ - z
const XS = BASES.xs
const W = V.halfWidth + 60 // half width of the full-valley pieces
const WOOD = '#8a5a32'
const WOOD_DARK = '#6a4224'
const STONE = '#e9edf3'
const STONE_DARK = '#c9d0db'
const SAND = '#e8c07a'
const MESA = '#d9874a'
const MESA_DARK = '#b8652a'
const GOLD = '#f4c21b'

// Colliders relative to the valley floor (this module's root sits at VALLEY_Y).
const fixedV = (hx, hy, hz, x, y, z) => addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y: y + VALLEY_Y, z })
// True if x is clear of every track by `gap` m.
const clearOfTracks = (x, gap) => XS.every((tx) => Math.abs(x - tx) > gap)

// Where world.js may plant its valley trees and grass patches.
export function grassyAt(z) {
  const s = sAt(z)
  return s < T.river.s0 - 40 || (s > T.river.s1 + 40 && s < T.gorge.s0 - 10)
}
// Side-cliff colours by area: sandstone along the desert.
export function cliffColors(z) {
  return sAt(z) > T.mine.s1 - 20 ? { rock: '#d9a066', dark: '#c4844a', top: '#f0cf8a' } : null
}

// --- Textures ---------------------------------------------------------------------------------
function canvasTex(w, h, paint) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d'), w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 4
  return t
}
// Blocky ripples: a blue field with lighter dashes.
function waterTex() {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#3d8fe8'
    x.fillRect(0, 0, w, h)
    const rand = mulberry32(12)
    for (let i = 0; i < 70; i++) {
      x.fillStyle = rand() < 0.5 ? '#6fb6ff' : '#9fd2ff'
      x.globalAlpha = 0.5 + rand() * 0.5
      x.fillRect(Math.floor(rand() * 16) * 8, Math.floor(rand() * 32) * 4, 8 + Math.floor(rand() * 3) * 8, 3)
    }
    x.globalAlpha = 1
  })
}
// Falling water: vertical streaks, white near the top of each streak.
function fallsTex() {
  return canvasTex(128, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#4aa6ff')
    g.addColorStop(1, '#2f7fe0')
    x.fillStyle = g
    x.fillRect(0, 0, w, h)
    const rand = mulberry32(44)
    for (let i = 0; i < 90; i++) {
      const sx = Math.floor(rand() * 32) * 4
      const sy = rand() * h
      const len = 20 + rand() * 90
      const sg = x.createLinearGradient(0, sy, 0, sy + len)
      sg.addColorStop(0, 'rgba(255,255,255,0.85)')
      sg.addColorStop(1, 'rgba(160,210,255,0)')
      x.fillStyle = sg
      x.fillRect(sx, sy, 3 + Math.floor(rand() * 2) * 2, len)
      if (sy + len > h) x.fillRect(sx, sy - h, 4, len)
    }
  })
}
function foamTex() {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#d8eeff'
    x.fillRect(0, 0, w, h)
    const rand = mulberry32(5)
    for (let i = 0; i < 120; i++) {
      x.fillStyle = rand() < 0.5 ? '#ffffff' : '#b8dcff'
      x.fillRect(Math.floor(rand() * 32) * 4, Math.floor(rand() * 32) * 4, 8, 8)
    }
  })
}

// --- Small props --------------------------------------------------------------------------------
function tree(g, x, y, z, s, rand) {
  const trunkH = 3.5 * s
  pillar(g, 1.1 * s, trunkH, 1.1 * s, x, y, z, '#7a4a25')
  const leaf = rand() < 0.5 ? '#2f8f2a' : '#3aa636'
  pillar(g, 5 * s, 2.4 * s, 5 * s, x, y + trunkH - 0.4 * s, z, leaf)
  pillar(g, 3.6 * s, 2 * s, 3.6 * s, x, y + trunkH + 1.9 * s, z, mixHex(leaf, '#ffffff', 0.12))
}
function cactus(g, x, z, s, rand) {
  const c = rand() < 0.5 ? '#3fa83a' : '#2f8f2a'
  const h = 4 * s
  pillar(g, 0.9 * s, h, 0.9 * s, x, 0, z, c)
  for (const side of [-1, 1]) {
    if (rand() < 0.3) continue
    const at = h * (0.35 + rand() * 0.25)
    block(g, 1.2 * s, 0.6 * s, 0.6 * s, x + side * 0.9 * s, at, z, c)
    pillar(g, 0.6 * s, 1.6 * s, 0.6 * s, x + side * 1.4 * s, at - 0.3 * s, z, c)
  }
}
function signboard(root, g, text, x, z, color) {
  for (const side of [-1, 1]) pillar(g, 0.35, 5.2, 0.35, x + side * 2.6, 0, z, WOOD_DARK)
  block(g, 6.4, 2.6, 0.3, x, 4.4, z, WOOD)
  const l = label(text, 1.6, { colors: ['#ffffff', color] })
  l.position.set(x, 4.45, z + 0.3)
  root.add(l)
}

// --- Bumpy Meadows ------------------------------------------------------------------------------
function meadows(root, g, rand) {
  const s0 = T.archS + 20
  const s1 = T.river.s0 - 120
  const flowers = ['#ff5a7a', '#ffd23a', '#ffffff', '#b05cff', '#ff9a2a']
  for (let i = 0; i < 160; i++) {
    const x = (rand() - 0.5) * V.halfWidth * 1.8
    const z = zAt(s0 + rand() * (s1 - s0))
    if (!clearOfTracks(x, 9)) continue
    const c = flowers[i % flowers.length]
    for (let k = 0; k < 4; k++) pillar(g, 0.5, 0.5 + rand() * 0.4, 0.5, x + (rand() - 0.5) * 3, 0, z + (rand() - 0.5) * 3, c, { shadow: false })
  }
  // Hay bales.
  for (let i = 0; i < 26; i++) {
    const x = (rand() - 0.5) * V.halfWidth * 1.7
    const z = zAt(s0 + rand() * (s1 - s0))
    if (!clearOfTracks(x, 10)) continue
    pillar(g, 2.4, 1.6, 3.2, x, 0, z, '#e8c35a')
    block(g, 2.5, 0.25, 3.3, x, 0.8, z, '#c99a32', { shadow: false })
  }
  signboard(root, g, 'AIRTIME AHEAD!', 19, zAt(1590), '#8dff5a')
}

// --- Crystal River --------------------------------------------------------------------------------
function river(root, g, rand, mats) {
  const zA = zAt(T.river.s0)
  const zB = zAt(T.river.s1)
  const width = zA - zB
  const water = new Mesh(new PlaneGeometry(W * 2, width), mats.river)
  water.rotation.x = -Math.PI / 2
  water.position.set(0, 0.16, (zA + zB) / 2)
  water.receiveShadow = true
  root.add(water)
  // White stone banks, stepped.
  for (const [edge, dir] of [
    [zA, 1],
    [zB, -1],
  ]) {
    for (let x = -W; x < W; ) {
      const w = 4 + rand() * 9
      const h = 0.5 + rand() * 1.6
      if (clearOfTracks(x + w / 2, 4) && clearOfTracks(x, 4) && clearOfTracks(x + w, 4)) {
        pillar(g, w, h, 2.5 + rand() * 3, x + w / 2, 0, edge + dir * (1 + rand() * 1.5), rand() < 0.6 ? STONE : STONE_DARK)
      }
      x += w + rand() * 3
    }
  }
  // Bluffs and boulders along the river stretch, pools between them.
  const r0 = ZONES.find((z) => z.id === 'river').s
  const r1 = T.gorge.s0 - 10
  for (let i = 0; i < 70; i++) {
    const s = r0 + rand() * (r1 - r0)
    if (s > T.river.s0 - 8 && s < T.river.s1 + 8) continue
    const big = rand() < 0.35
    const x = big ? (rand() < 0.5 ? -1 : 1) * (95 + rand() * 80) : (rand() - 0.5) * V.halfWidth * 1.8
    const w = big ? 14 + rand() * 20 : 3 + rand() * 6
    if (!clearOfTracks(x, w / 2 + 4)) continue
    const z = zAt(s)
    let h = big ? 8 + rand() * 18 : 1 + rand() * 3
    let ww = w
    let y = 0
    // Stepped: each tier smaller than the last.
    for (let k = 0; k < (big ? 3 : 1); k++) {
      pillar(g, ww, h, ww * (0.7 + rand() * 0.6), x, y, z, k % 2 ? STONE_DARK : STONE)
      if (big) fixedV(ww / 2, h / 2, ww / 2, x, y + h / 2, z)
      y += h
      ww *= 0.65
      h *= 0.6
    }
    if (big && rand() < 0.6) pillar(g, ww * 1.4, 0.6, ww * 1.4, x, y, z, '#45ab31')
  }
  for (let i = 0; i < 14; i++) {
    const x = (rand() - 0.5) * V.halfWidth * 1.7
    const s = r0 + rand() * (r1 - r0)
    if (s > T.river.s0 - 12 && s < T.river.s1 + 12) continue
    const w = 6 + rand() * 10
    const d = 5 + rand() * 8
    if (!clearOfTracks(x, w / 2 + 3)) continue
    pillar(g, w + 1.6, 0.35, d + 1.6, x, 0, zAt(s), STONE_DARK, { shadow: false })
    const pool = new Mesh(new PlaneGeometry(w, d), mats.river)
    pool.rotation.x = -Math.PI / 2
    pool.position.set(x, 0.38, zAt(s))
    root.add(pool)
  }
  signboard(root, g, 'CRYSTAL RIVER', 19, zAt(ZONES.find((z) => z.id === 'river').s + 10), '#7fe8ff')
}

// --- Waterfall Gorge ----------------------------------------------------------------------------
function gorge(root, g, rand, mats, out) {
  const G = T.gorge
  const zA = zAt(G.s0)
  const zB = zAt(G.s1 + 4)
  // Walls: stepped grey tiers either side, taller further back, grass tops, trees.
  for (const side of [-1, 1]) {
    for (let z = zA; z > zB; ) {
      const len = 18 + rand() * 22
      const zEnd = Math.max(zB, z - len)
      const d = z - zEnd
      const cz = (z + zEnd) / 2
      const inset = rand() * 6
      const h1 = 44 + rand() * 22 + (sAt(cz) - G.s0) * 0.04
      const x0 = side * (G.wallX + inset)
      const x1 = side * (G.wallX + 40)
      const cx = (x0 + x1) / 2
      pillar(g, Math.abs(x1 - x0), h1, d, cx, 0, cz, rand() < 0.5 ? '#a9b1c0' : '#8f99ad')
      pillar(g, Math.abs(x1 - x0) + 0.6, 1.4, d + 0.6, cx, h1 - 0.2, cz, '#45ab31')
      fixedV(Math.abs(x1 - x0) / 2, h1 / 2, d / 2, cx, h1 / 2, cz)
      for (let t = -d / 2; t < d / 2; t += 2 + rand() * 4) {
        const dh = 1 + rand() * 6
        block(g, 0.8, dh, 1 + rand() * 2, x0 - side * 0.35, h1 - dh / 2, cz + t, '#3a9a2a', { shadow: false })
      }
      // Strata ledges on the face.
      for (let y = 8; y < h1 - 6; y += 7 + rand() * 9) block(g, 1.6, 1.2 + rand(), d * (0.4 + rand() * 0.6), x0 - side * 0.6, y, cz, '#7d879c', { shadow: false })
      const h2 = h1 + 14 + rand() * 20
      const x2 = side * (G.wallX + 90)
      pillar(g, Math.abs(x2 - x1), h2, d, (x1 + x2) / 2, 0, cz, '#9aa3b6')
      pillar(g, Math.abs(x2 - x1) + 0.6, 1.4, d + 0.6, (x1 + x2) / 2, h2 - 0.2, cz, '#45ab31')
      if (rand() < 0.7) tree(g, side * (G.wallX + 8 + rand() * 26), h1 + 1, cz, 1 + rand() * 0.5, rand)
      z = zEnd
    }
  }
  // The lake under the Sky Trestle.
  const lA = zAt(G.lake)
  const lB = zAt(T.falls)
  const lake = new Mesh(new PlaneGeometry(G.wallX * 2 + 4, lA - lB + 6), mats.lake)
  lake.rotation.x = -Math.PI / 2
  lake.position.set(0, 0.2, (lA + lB) / 2 - 3)
  root.add(lake)
  for (let x = -G.wallX; x < G.wallX; x += 3 + rand() * 6) pillar(g, 3 + rand() * 4, 0.4 + rand() * 0.6, 2 + rand() * 2, x, 0, lA + 1, rand() < 0.5 ? STONE : STONE_DARK, { shadow: false })

  // The waterfall over the mountain face: two scrolling sheets, foam, the river on top.
  const H = MOUNTAIN_H
  const fz = zAt(T.falls)
  const sheet = new Mesh(new PlaneGeometry(G.wallX * 2, H), mats.falls)
  sheet.position.set(0, H / 2, fz)
  const sheet2 = new Mesh(new PlaneGeometry(G.wallX * 2, H), mats.falls2)
  sheet2.position.set(0, H / 2, fz + 1.4)
  sheet.renderOrder = sheet2.renderOrder = 2
  root.add(sheet, sheet2)
  const foam = new Mesh(new PlaneGeometry(G.wallX * 2 + 8, 18), mats.foam)
  foam.rotation.x = -Math.PI / 2
  foam.position.set(0, 0.32, fz + 8)
  root.add(foam)
  for (let x = -G.wallX; x < G.wallX; x += 2 + rand() * 4) {
    const s = 1.2 + rand() * 2.4
    block(g, s, s * 0.7, s, x, 0.3, fz + 2 + rand() * 10, '#ffffff', { shadow: false, flat: true })
  }
  const top = new Mesh(new PlaneGeometry(G.wallX * 2, 40), mats.lake)
  top.rotation.x = -Math.PI / 2
  top.position.set(0, H + 0.3, zAt(T.mine.s0) - 20)
  root.add(top)
  // Rainbow in the spray.
  const bows = ['#ff4a4a', '#ff9a2a', '#ffe14a', '#5dff6a', '#3ab0ff', '#8a5aff']
  bows.forEach((c, i) => {
    const arc = new Mesh(new TorusGeometry(70 - i * 2.2, 1.1, 6, 48, Math.PI), new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false }))
    arc.position.set(-30, -6, fz + 40)
    root.add(arc)
  })
  out.falls = { z: fz }
  signboard(root, g, 'SKY TRESTLE', 19, zAt(G.s0 + 12), '#5ab8ff')
}

// --- Glow Mine -------------------------------------------------------------------------------------
const MOUNTAIN_H = 72
function mine(root, g, rand) {
  const M = T.mine
  const zA = zAt(M.s0) // face behind the falls
  const zB = zAt(M.s1) // exit into the desert
  const len = zA - zB
  const cz = (zA + zB) / 2
  const R = M.roof
  const half = M.boreHalf
  const rock = '#8f99ad'
  // Above the bores: one slab; between them: pillars.
  block(g, W * 2, MOUNTAIN_H - R, len, 0, (MOUNTAIN_H + R) / 2, cz, rock)
  fixedV(W, (MOUNTAIN_H - R) / 2, len / 2, 0, (MOUNTAIN_H + R) / 2, cz)
  const edges = [-W, ...XS.flatMap((x) => [x - half, x + half]), W]
  for (let i = 0; i < edges.length; i += 2) {
    const x0 = edges[i]
    const x1 = edges[i + 1]
    pillar(g, x1 - x0, R, len, (x0 + x1) / 2, 0, cz, '#7d879c')
    fixedV((x1 - x0) / 2, R / 2, len / 2, (x0 + x1) / 2, R / 2, cz)
  }
  // Stepped top with grass, trees.
  for (let k = 0; k < 3; k++) {
    const d = len - 40 - k * 50
    if (d < 20) break
    pillar(g, W * 2 - 40 - k * 60, 10, d, 0, MOUNTAIN_H + k * 10, cz - 10, k % 2 ? '#9aa3b6' : rock)
    pillar(g, W * 2 - 39 - k * 60, 1.2, d + 1, 0, MOUNTAIN_H + k * 10 + 9.6, cz - 10, '#45ab31')
  }
  for (let i = 0; i < 24; i++) tree(g, (rand() - 0.5) * W * 1.6, MOUNTAIN_H + 1.2, cz - 10 + (rand() - 0.5) * (len - 60), 1 + rand() * 0.6, rand)

  // The bores: dark lining, timber frames, crystals and lanterns.
  const lining = '#2a3150'
  const crystal = [neon('#c46bff', 3.2), neon('#4fe3ff', 3.2)]
  const lamp = neon('#ffb347', 3)
  const cone = new ConeGeometry(0.5, 1, 5)
  cone.translate(0, 0.5, 0)
  for (const x of XS) {
    for (const side of [-1, 1]) block(g, 0.4, R, len, x + side * (half - 0.2), R / 2, cz, lining, { shadow: false })
    block(g, half * 2, 0.4, len, x, R - 0.2, cz, lining, { shadow: false })
    block(g, half * 2, 0.3, len, x, 0.15, cz, '#353b58', { shadow: false }) // floor (over the valley grass)
    for (let s = M.s0 + 6; s < M.s1 - 4; s += 14) {
      const z = zAt(s)
      const floor = Math.max(0, trackHeight(s) - VALLEY_Y)
      for (const side of [-1, 1]) pillar(g, 0.6, R - floor, 0.6, x + side * (half - 0.7), floor, z, WOOD_DARK, { shadow: false })
      block(g, half * 2 - 0.6, 0.7, 0.7, x, R - 0.8, z, WOOD, { shadow: false })
      // A lantern on every other frame.
      if (Math.round(s / 14) % 2 === 0) {
        const m = new Mesh(cone, lamp)
        m.scale.set(0.5, 0.7, 0.5)
        m.position.set(x + (half - 1.1), R - 3.2, z + 0.4)
        g.add(m)
      }
    }
    for (let i = 0; i < 26; i++) {
      const s = M.s0 + 4 + rand() * (M.s1 - M.s0 - 8)
      const side = rand() < 0.5 ? -1 : 1
      const top = rand() < 0.3
      const n = 2 + Math.floor(rand() * 3)
      for (let k = 0; k < n; k++) {
        const m = new Mesh(cone, crystal[(i + k) % 2])
        const sz = 0.6 + rand() * 1.3
        m.scale.set(sz, sz * (1.6 + rand()), sz)
        if (top) {
          m.position.set(x + (rand() - 0.5) * half, R - 0.4, zAt(s) + (rand() - 0.5) * 2)
          m.rotation.set(Math.PI + (rand() - 0.5) * 0.6, rand() * 3, 0)
        } else {
          m.position.set(x + side * (half - 0.4), 1 + rand() * (R - 3), zAt(s) + (rand() - 0.5) * 2)
          m.rotation.set((rand() - 0.5) * 0.5, rand() * 3, -side * (1 + rand() * 0.5))
        }
        g.add(m)
      }
    }
  }
  // Faces: timber portals round every bore, both ends.
  for (const z of [zA, zB]) {
    for (const x of XS) {
      for (const side of [-1, 1]) pillar(g, 1.2, R + 1, 1.2, x + side * (half + 0.4), 0, z, WOOD_DARK)
      block(g, half * 2 + 3, 1.4, 1.4, x, R + 0.6, z, WOOD)
    }
  }
  const sign = label('GLOW MINE', 6, { colors: ['#ffffff', '#d07bff'] })
  sign.position.set(0, R + 10, zB - 2)
  root.add(sign)
}

// --- Golden Sands + Golden Station -------------------------------------------------------------
function desert(root, g, rand, mats) {
  const zA = zAt(T.mine.s1)
  const zB = V.front
  const sand = new Mesh(new PlaneGeometry(W * 2, zA - zB), mats.sand)
  sand.rotation.x = -Math.PI / 2
  sand.position.set(0, 0.07, (zA + zB) / 2)
  sand.receiveShadow = true
  root.add(sand)
  // Dunes (low, wide) and mesas (tall, striped, flat-topped).
  for (let i = 0; i < 60; i++) {
    const x = (rand() - 0.5) * V.halfWidth * 1.9
    const z = zA - 10 - rand() * (zA - zB - 20)
    const w = 6 + rand() * 14
    if (!clearOfTracks(x, w / 2 + 4)) continue
    pillar(g, w, 0.6 + rand() * 1.2, w * (0.5 + rand() * 0.6), x, 0, z, rand() < 0.5 ? '#e0b26a' : '#ecc887', { shadow: false })
  }
  for (let i = 0; i < 26; i++) {
    const side = rand() < 0.5 ? -1 : 1
    const x = side * (96 + rand() * 80)
    const z = zA - 20 - rand() * (zA - zB - 60)
    let w = 16 + rand() * 18
    let y = 0
    const tiers = 2 + Math.floor(rand() * 3)
    for (let k = 0; k < tiers; k++) {
      const h = 6 + rand() * 10
      pillar(g, w, h, w * (0.7 + rand() * 0.5), x, y, z, k % 2 ? MESA_DARK : MESA)
      block(g, w + 0.3, 0.8, w * 0.7 + 0.3, x, y + h * 0.5, z, '#e8a060', { shadow: false })
      if (k === 0) fixedV(w / 2, h / 2, (w * 0.7) / 2, x, h / 2, z)
      y += h
      w *= 0.7
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = (rand() - 0.5) * V.halfWidth * 1.9
    const z = zA - 8 - rand() * (zA - zB - 16)
    if (!clearOfTracks(x, 6)) continue
    cactus(g, x, z, 0.8 + rand() * 0.7, rand)
  }
  for (let i = 0; i < 40; i++) {
    const x = (rand() - 0.5) * V.halfWidth * 1.9
    const z = zA - 8 - rand() * (zA - zB - 16)
    if (!clearOfTracks(x, 5)) continue
    const s = 0.6 + rand() * 1.8
    pillar(g, s, s * 0.7, s * 1.2, x, 0, z, rand() < 0.5 ? '#f3e6cf' : '#c9b79a', { shadow: false })
  }

  // Golden Station: platforms along every track, the finish arch, flags, a station house.
  const s0 = T.station
  const s1 = T.length + 6
  const pz = (zAt(s0) + zAt(s1)) / 2
  const plen = s1 - s0
  for (const x of XS) {
    for (const side of [-1, 1]) {
      pillar(g, 3.6, 1.1, plen, x + side * 3.6, 0, pz, '#f3e2b8')
      block(g, 0.5, 0.12, plen, x + side * 2.05, 1.12, pz, GOLD, { shadow: false })
      for (let s = s0 + 4; s < s1; s += 16) {
        pillar(g, 0.3, 4.2, 0.3, x + side * 4.9, 1.1, zAt(s), '#5a5f6b')
        block(g, 1.3, 0.5, 0.5, x + side * 4.6, 5.2, zAt(s), '#ffe8a0', { emissive: '#ffcf5a', emissiveIntensity: 1.2, shadow: false })
      }
    }
  }
  const az = zAt(s0)
  const gold = neon('#ffd23a', 2.6)
  for (const side of [-1, 1]) {
    pillar(g, 4, 20, 4, side * 98, 0, az, GOLD, { metal: 0.6, rough: 0.35 })
    pillar(g, 5.4, 1.4, 5.4, side * 98, 20, az, '#ffe066', { metal: 0.6, rough: 0.35 })
  }
  block(g, 200, 4, 3, 0, 18.5, az, GOLD, { metal: 0.6, rough: 0.35 })
  // Checkered finish band under the beam.
  for (let i = 0; i < 100; i++) {
    for (let r = 0; r < 2; r++) block(g, 1.96, 1, 0.3, -98 + i * 1.98 + 1, 15.9 + r, az + 1.6, (i + r) % 2 ? '#111111' : '#ffffff', { shadow: false, flat: true })
  }
  const rim = new Mesh(new PlaneGeometry(200, 0.5), gold)
  rim.position.set(0, 20.6, az + 1.6)
  g.add(rim)
  const flagCols = ['#ff3b5c', '#ffd23a', '#3ad4ff', '#5dff6a']
  for (let i = 0; i < 24; i++) {
    const x = -96 + i * 8.35
    block(g, 1.6, 2, 0.1, x, 13.8, az + 1.7, flagCols[i % 4], { shadow: false })
  }
  const title = label('GOLDEN STATION', 7, { colors: ['#fff6c8', '#ffd23a'] })
  title.position.set(0, 26, az)
  root.add(title)
  // Station house to the side.
  const hx = 112
  const hz = zAt(s0 + 40)
  pillar(g, 18, 9, 14, hx, 0, hz, '#f3e2b8')
  block(g, 20, 1.2, 16, hx, 9.6, hz, '#c0392b')
  block(g, 14, 1.2, 12, hx, 10.8, hz, '#d6453a')
  pillar(g, 3, 5, 0.3, hx, 0, hz + 7.1, '#6a4224')
  fixedV(9, 4.5, 7, hx, 4.5, hz)
  signboard(root, g, 'GOLDEN SANDS', 19, zAt(T.mine.s1 + 14), '#ffd23a')
}

export function createZones(scene) {
  const root = new Group()
  root.position.y = VALLEY_Y
  scene.add(root)
  const g = new Group()
  const rand = mulberry32(8080)
  const wTex = waterTex()
  wTex.repeat.set(W / 8, 6)
  const lTex = waterTex()
  lTex.repeat.set(26, 40)
  const fTex = fallsTex()
  fTex.repeat.set(T.gorge.wallX / 12, 2)
  const fTex2 = fallsTex()
  fTex2.repeat.set(T.gorge.wallX / 18, 1.4)
  fTex2.offset.x = 0.37
  const foTex = foamTex()
  foTex.repeat.set(30, 4)
  const mats = {
    river: new MeshStandardMaterial({ map: wTex, color: '#ffffff', roughness: 0.15, metalness: 0.1, emissive: '#1a4a8a', emissiveIntensity: 0.25 }),
    lake: new MeshStandardMaterial({ map: lTex, color: '#ffffff', roughness: 0.15, metalness: 0.1, emissive: '#1a4a8a', emissiveIntensity: 0.25 }),
    falls: new MeshBasicMaterial({ map: fTex, transparent: true, opacity: 0.88, side: DoubleSide, depthWrite: false }),
    falls2: new MeshBasicMaterial({ map: fTex2, transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false, color: '#dff0ff' }),
    foam: new MeshBasicMaterial({ map: foTex, transparent: true, opacity: 0.85, depthWrite: false }),
    sand: new MeshStandardMaterial({ color: SAND, roughness: 0.95 }),
  }
  const out = {}
  meadows(root, g, rand)
  river(root, g, rand, mats)
  gorge(root, g, rand, mats, out)
  mine(root, g, rand)
  desert(root, g, rand, mats)
  root.add(bake(g, true))

  const fz = out.falls.z
  const M = T.mine
  return {
    root,
    update(dt) {
      wTex.offset.x -= dt * 0.18
      lTex.offset.y += dt * 0.02
      fTex.offset.y += dt * 0.9
      fTex2.offset.y += dt * 1.25
      foTex.offset.x += dt * 0.05
      foTex.offset.y -= dt * 0.12
    },
    // 0..1 how far inside a mine bore the point is (for the indoor light and sound).
    indoorAt(p) {
      const s = sAt(p.z)
      if (s < M.s0 || s > M.s1 || p.y > VALLEY_Y + M.roof) return 0
      if (!XS.some((x) => Math.abs(p.x - x) < M.boreHalf + 0.5)) return 0
      return Math.min(1, (s - M.s0) / 18, (M.s1 - s) / 18) * 0.85
    },
    // How loud the water is at p: { falls, river } 0..1.
    waterAt(p) {
      const df = Math.abs(p.z - fz)
      const falls = Math.abs(p.x) < T.gorge.wallX + 60 && sAt(p.z) < M.s0 + 30 ? Math.max(0, 1 - df / 320) ** 2 : 0
      const rz = (zAt(T.river.s0) + zAt(T.river.s1)) / 2
      const river = Math.max(0, 1 - Math.max(0, Math.abs(p.z - rz) - 25) / 110) ** 2
      return { falls, river }
    },
    fallsZ: fz,
  }
}
