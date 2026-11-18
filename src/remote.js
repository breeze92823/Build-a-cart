// The other players in the room (net.js -> the backend's WorldState.players, ../Build-a-cart-backend). The
// room seats 5: each client plays on the HOME (middle) base and puts the other players on the four
// remaining bases (MULTI.basePrefs), nearest first, each keeping its base while it stays in the room.
// What is drawn, all diffed against the roster every frame (so joins and leaves need no events):
//   * a parked cart on their base with their gear and trailing carts, their avatar walking around it
//     (the walk is shifted by the base offset while outside; in the hub cave they are at their true spot),
//   * while they ride: the cart on the shared line (dead-reckoned from `s` / `v`), the avatar in its seat,
//     wheels turning, trailing carts following the lead cart's path, exhaust, boosters, brake and wheel
//     sparks, dust, a crash (explosion, the cart is gone) and a revive,
//   * a name tag, chat bubbles (Bloxity chat) and the portal's emotes (avatar/emotes.js).
// Never throws: a missing field or a failed look just leaves the stand-in character.
import { Group } from 'three'
import { BASES, CART, CAVE, LEAN, MULTI, NET, TRACK } from './config.js'
import { laneX, laneXSlope, trackHeight } from './cartPhysics.js'
import { buildCart, buildWagon, WHEEL_R } from './cartModel.js'
import { RAIL_TOP, canvasSprite } from './track.js'
import { zAt } from './world.js'
import { net } from './net.js'
import { gearById } from './state.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { buildLook, disposeLook, lookFromJson } from './avatar/look.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { createEmotePlayer } from './avatar/emotes.js'
import { attachChatBubble, playerInRoom, playerJoined } from './bloxity.js'

const HOME = BASES.xs[BASES.home]
const CAVE_Z = CAVE.mouth.z0 + 1 // z from which a walker is in the cave tunnel / hub, not on the base plateaus
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
const hasGear = (id) => !!id && !!gearById[id]
const railY = (s) => (s < 0 ? 0 : trackHeight(s))

// --- Breadcrumbs of the lead cart's path: the trailing carts follow them (same idea as ride.js) -------
const TRAIL = 512
class Trail {
  constructor() {
    this.a = new Float32Array(TRAIL * 4)
    this.head = 0
    this.count = 0
    this.len = 0
    this.out = { s: 0, y: 0, pitch: 0 }
  }
  reset() {
    this.head = 0
    this.count = 0
    this.len = 0
  }
  push(s, y, pitch) {
    if (this.count) {
      const j = ((this.head - 1 + TRAIL) % TRAIL) * 4
      const d = Math.hypot(s - this.a[j + 1], y - this.a[j + 2])
      if (d < 0.25) return
      this.len += d
    }
    const i = this.head * 4
    this.a[i] = this.len
    this.a[i + 1] = s
    this.a[i + 2] = y
    this.a[i + 3] = pitch
    this.head = (this.head + 1) % TRAIL
    this.count = Math.min(TRAIL, this.count + 1)
  }
  // The point `back` metres of path behind the head (straight rails behind the oldest crumb).
  at(back) {
    const a = this.a
    const target = this.len - back
    let hi = (this.head - 1 + TRAIL) % TRAIL
    for (let k = 1; k < this.count; k++) {
      const lo = (hi - 1 + TRAIL) % TRAIL
      if (a[lo * 4] <= target) {
        const x0 = a[lo * 4]
        const x1 = a[hi * 4]
        const t = x1 > x0 ? (target - x0) / (x1 - x0) : 0
        this.out.s = a[lo * 4 + 1] + (a[hi * 4 + 1] - a[lo * 4 + 1]) * t
        this.out.y = a[lo * 4 + 2] + (a[hi * 4 + 2] - a[lo * 4 + 2]) * t
        this.out.pitch = a[lo * 4 + 3] + (a[hi * 4 + 3] - a[lo * 4 + 3]) * t
        return this.out
      }
      hi = lo
    }
    const last = ((this.head - this.count + TRAIL) % TRAIL) * 4
    this.out.s = (this.count ? a[last + 1] : 0) - (target - (this.count ? a[last] : 0))
    this.out.y = railY(this.out.s)
    this.out.pitch = 0
    return this.out
  }
}

// --- One remote player --------------------------------------------------------------------------------
class Remote {
  constructor(root, id, base) {
    this.id = id
    this.base = base // index into BASES.xs
    this.x0 = BASES.xs[base]
    this.root = root
    this.group = new Group() // the walking avatar (when on foot)
    root.add(this.group)
    this.avatarRoot = new Group()
    this.group.add(this.avatarRoot)
    this.anchor = new Group() // name tag + chat bubble, follows whoever is shown
    root.add(this.anchor)
    this.avatar = null
    this.animator = null
    this.emote = createEmotePlayer()
    this.lookKey = null
    this.gen = 0
    this.name = ''
    this.tag = null
    this.bubble = null
    this.dead = false
    this.uid = ''
    this.lastCrash = ''
    this.parkedS = 0.5
    this.emoteSeq = null
    this.loadKey = ''
    this.cart = null
    this.wagons = []
    this.trail = new Trail()
    this.placed = false
    this.region = ''
    this.vy = 0
    this.lastY = 0
    // Riding state (smoothed).
    this.ride = 'foot'
    this.s = 0
    this.y = 0
    this.pitch = 0
    this.roll = 0
    this.lx = 0
    this.v = 0
    this.srvS = NaN
    this.srvAt = 0
    this.riding = false
    this.smokeAcc = 0
    this.sparkAcc = 0
    this.crashed = false
    this.setAvatar(buildDefaultCharacter())
  }

  setAvatar(next) {
    if (this.avatar) {
      this.avatarRoot.remove(this.avatar)
      disposeLook(this.avatar)
    }
    disposeAnimator(this.animator)
    this.avatar = next
    this.avatarRoot.add(next)
    this.animator = makeAnimator(next)
    this.emote.setAvatar(next, this.animator)
  }

  // A signed-in player's look arrives as JSON { equipped, proportions } + the outfit key; "" = the base rig.
  async syncLook(p) {
    const key = `${p.avatar}|${p.outfit}`
    if (key === this.lookKey) return
    this.lookKey = key
    const mine = ++this.gen
    try {
      const look = lookFromJson(p.avatar)
      look.outfitKey = p.outfit || ''
      const built = look.equipped || look.outfitKey ? await buildLook(look) : await loadBaseCharacter()
      if (mine !== this.gen || this.dead) {
        if (built) disposeLook(built)
        return
      }
      if (built) this.setAvatar(built)
    } catch (err) {
      console.warn('[remote] look failed', err)
    }
  }

  syncName(name) {
    if (name === this.name && this.tag) return
    this.name = name
    if (!this.tag) {
      this.tag = canvasSprite(512, 112, 0.95, (ctx, w, h, text) => {
        ctx.font = '700 62px Fredoka, "Arial Black", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 12
        ctx.strokeStyle = '#0b1a3a'
        ctx.strokeText(text, w / 2, h / 2)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(text, w / 2, h / 2)
      })
      this.tag.material.depthTest = false
      this.tag.renderOrder = 10
      this.anchor.add(this.tag)
    }
    this.tag.userData.redraw(name)
  }

  // A newer message replaces the bubble (the SDK removes it itself after chat.bubbleSeconds).
  say(text) {
    this.clearBubble()
    this.bubble = attachChatBubble(this.anchor, text, 0.9)
  }
  clearBubble() {
    try {
      this.bubble?.remove?.()
    } catch {
      // Already gone.
    }
    this.bubble = null
  }

  // The cart (lead + trailing carts), rebuilt when the gear or the cart count changes.
  syncLoadout(p) {
    const wagons = Math.min(MULTI.wagonDraw, p.wagons + p.golden)
    const key = `${p.engine}|${p.fuel}|${p.wheels}|${p.booster}|${wagons}|${p.golden}`
    if (key === this.loadKey) return
    this.loadKey = key
    if (this.cart) this.root.remove(this.cart)
    for (const w of this.wagons) this.root.remove(w)
    const g = {
      engine: hasGear(p.engine) ? gearById[p.engine] : undefined,
      fuel: hasGear(p.fuel) ? gearById[p.fuel] : undefined,
      wheels: hasGear(p.wheels) ? gearById[p.wheels] : undefined,
      booster: hasGear(p.booster) ? gearById[p.booster] : undefined,
    }
    this.cart = buildCart(g)
    this.root.add(this.cart)
    this.wagons = []
    for (let i = 0; i < wagons; i++) {
      const w = buildWagon(i, g.wheels, i < p.golden)
      this.root.add(w)
      this.wagons.push(w)
    }
    this.trail.reset()
    this.parkedS = wagons * CART.wagonGap + 0.5
    this.placed = false
    if (this.avatar && this.riding) this.cart.userData.tilt.add(this.avatarRoot)
  }

  // Where the cart is at track position s (x from this player's base, merged onto the shared line).
  cartX(s) {
    return laneX(this.x0, HOME, s) + this.lx
  }
  cartYaw(s) {
    return -Math.atan(laneXSlope(this.x0, HOME, s))
  }

  placeCart(s, y, pitch, roll, spinV, dt, visible) {
    const c = this.cart
    c.visible = visible
    c.position.set(this.cartX(s), y + RAIL_TOP + (c.userData.hover ? 0.25 : 0), zAt(s))
    c.rotation.y = this.cartYaw(s)
    c.rotation.z = roll
    c.userData.tilt.rotation.x = pitch
    for (const w of c.userData.spin) w.rotation.x -= (spinV / WHEEL_R) * dt
    this.wagons.forEach((w, i) => {
      const q = this.riding ? this.trail.at((i + 1) * CART.wagonGap) : { s: s - (i + 1) * CART.wagonGap, y: railY(s - (i + 1) * CART.wagonGap), pitch: 0 }
      w.visible = visible
      w.position.set(this.cartX(q.s), q.y + RAIL_TOP, zAt(q.s))
      w.rotation.y = this.cartYaw(q.s)
      w.rotation.z = roll * 0.6
      w.userData.tilt.rotation.x = q.pitch
      for (const wh of w.userData.spin) wh.rotation.x -= (spinV / WHEEL_R) * dt
    })
  }

  // Per-frame update from the synced PlayerState p. cam = camera world position (for effect range).
  update(p, dt, t, ctx) {
    this.syncName(p.username || 'Player')
    this.syncLook(p)
    this.syncLoadout(p)
    // Emotes: a new sequence number restarts (or stops) the clip.
    if (p.emoteSeq !== this.emoteSeq) {
      this.emoteSeq = p.emoteSeq
      if (p.emote) this.emote.play(p.emote)
      else this.emote.stop()
    }
    const riding = p.ride === 'riding' || p.ride === 'ending' || p.ride === 'crashed'
    if (riding !== this.riding) {
      this.riding = riding
      this.placed = false
      this.trail.reset()
      if (riding) {
        this.cart.userData.tilt.add(this.avatarRoot)
        this.avatarRoot.position.copy(this.cart.userData.seat)
        this.avatarRoot.rotation.set(0, Math.PI, 0)
        this.group.visible = false
      } else {
        this.group.add(this.avatarRoot)
        this.avatarRoot.position.set(0, 0, 0)
        this.avatarRoot.rotation.set(0, 0, 0)
        this.group.visible = true
        this.crashed = false
        this.cart.visible = true
      }
    }
    return riding ? this.updateRiding(p, dt, ctx) : this.updateFoot(p, dt, ctx)
  }

  // --- On foot: parked cart at the base, the avatar walking ------------------------------------------
  updateFoot(p, dt, ctx) {
    const s = this.parkedS
    this.placeCart(s, railY(s), 0, 0, 0, dt, true)
    // Walking: outside the cave the walk is shifted onto this player's base; in the cave / tunnel it is
    // at its true spot, and only shown to a viewer who is in the cave as well.
    const inCave = p.z >= CAVE_Z
    const region = inCave ? 'cave' : 'base'
    const shown = !inCave || ctx.viewerInCave
    this.group.visible = shown
    const tx = inCave ? p.x : p.x + (this.x0 - HOME)
    const g = this.group
    if (region !== this.region || !this.placed) {
      g.position.set(tx, p.y, p.z)
      g.rotation.y = p.yaw
      this.region = region
      this.placed = true
      this.lastY = p.y
    }
    const k = 1 - Math.exp(-NET.remoteLerp * dt)
    g.position.x += (tx - g.position.x) * k
    g.position.y += (p.y - g.position.y) * k
    g.position.z += (p.z - g.position.z) * k
    g.rotation.y += angleDelta(g.rotation.y, p.yaw) * k
    this.vy += ((g.position.y - this.lastY) / Math.max(dt, 1e-3) - this.vy) * Math.min(1, dt * 10)
    this.lastY = g.position.y
    if (shown) {
      this.animator?.update(dt, { grounded: p.grounded, speed: p.speed, verticalVelocity: this.vy, turn: 0 })
      this.emote.update(dt, p.speed, p.grounded)
    }
    this.anchor.visible = shown
    this.anchor.position.set(g.position.x, g.position.y + NET.nameTagHeight, g.position.z)
    this.ride = 'foot'
    return { x: this.cart.position.x, z: this.cart.position.z, near: shown }
  }

  // --- Riding: the cart on the line ------------------------------------------------------------------------
  updateRiding(p, dt, ctx) {
    const crashed = p.ride === 'crashed'
    // Dead reckoning: the last `s` plus the speed times the time since it changed.
    const nowT = ctx.t
    if (p.s !== this.srvS) {
      this.srvS = p.s
      this.srvAt = nowT
    }
    const ahead = Math.min(0.2, nowT - this.srvAt)
    const sTarget = p.s + (crashed ? 0 : p.v * ahead)
    if (!this.placed) {
      this.s = sTarget
      this.y = p.cy
      this.pitch = p.pitch
      this.roll = p.roll
      this.lx = p.lx
      this.v = p.v
      this.trail.reset()
      this.trail.push(this.s - 0.5, railY(this.s - 0.5), 0)
      this.placed = true
    }
    const k = 1 - Math.exp(-NET.remoteLerp * dt)
    this.s += (sTarget - this.s) * k
    this.y += (p.cy - this.y) * k
    this.pitch += (p.pitch - this.pitch) * k
    this.roll += (p.roll - this.roll) * k
    this.lx += (p.lx - this.lx) * k
    this.v += (p.v - this.v) * k
    this.trail.push(this.s, this.y, this.pitch)

    // A crash: the explosion once, then the cart is gone until they revive.
    if (crashed && !this.crashed) {
      this.crashed = true
      this.crashFx(ctx)
    } else if (!crashed && this.crashed) {
      this.crashed = false
      const c = this.cart.position
      ctx.fx.confetti({ x: c.x, y: c.y + 1.5, z: c.z }, 24, 0.5)
    }
    this.placeCart(this.s, this.y, this.pitch, this.roll, this.v, dt, !crashed)
    this.avatarRoot.visible = !crashed
    const cart = this.cart
    this.anchor.visible = !crashed
    this.anchor.position.set(cart.position.x, cart.position.y + NET.nameTagHeight - 0.4, cart.position.z)
    if (!crashed) {
      this.animator?.update(dt, { grounded: true, speed: 0, verticalVelocity: 0, turn: 0 })
      this.emote.update(dt, 0, true)
      this.effects(p, dt, ctx)
    }
    this.ride = p.ride
    return { x: cart.position.x, z: cart.position.z, near: true }
  }

  // Cart world point from a local point on the lead cart (the cart's tilt group).
  point(local, out) {
    out.copy(local)
    this.cart.userData.tilt.localToWorld(out)
    return out
  }

  crashFx(ctx) {
    const p = this.point(ctx.tmp.set(0, 0.8, 0), ctx.tmp2)
    const kind = this.lastCrash || 'spikes'
    if (kind === 'splash') ctx.fx.spray(p, 100)
    else ctx.fx.explosion(p, kind === 'spikes' ? 1.3 : 0.9)
    if (kind === 'derail') ctx.fx.sparks(p, 50)
    for (const w of this.wagons) ctx.fx.explosion(w.getWorldPosition(ctx.tmp3), 0.5)
  }

  // Exhaust, boosters, brake and wheel sparks, dust: the same looks as the local cart (ride.js), only
  // spawned when the camera is close enough to see them.
  effects(p, dt, ctx) {
    const d = Math.hypot(this.cart.position.x - ctx.cam.x, this.cart.position.z - ctx.cam.z)
    if (d > MULTI.smokeRange) return
    const { fx, tmp } = ctx
    const v = this.v
    const carry = -Math.abs(v)
    this.smokeAcc += dt * (4 + p.throttle * 22)
    while (this.smokeAcc > 1) {
      this.smokeAcc -= 1
      if (p.fuelOk) {
        for (const e of this.cart.userData.exhausts) fx.exhaust(this.point(e, tmp), 0, 0.5, carry * 0.93 + 1.5, p.throttle, Math.abs(v) > 8 ? 0 : 1.2)
      }
    }
    if (this.cart.userData.nozzle && p.throttle > 0 && p.fuelOk) {
      this.point(this.cart.userData.nozzle, tmp)
      for (let i = 0; i < 2; i++) fx.flame(tmp, 0, 0, carry * 0.96 + 6, 1.2, '#ffd27a', '#ff5a1a')
    }
    if (p.boosting) {
      for (const f of this.cart.userData.flames) {
        this.point(f, tmp)
        for (let i = 0; i < 2; i++) fx.flame(tmp, 0, 0, carry * 0.96 + 7, 1, '#9fe8ff', '#ff6a1a')
      }
    }
    // Two wheels in a bend: sparks off the low side.
    const over = !p.air ? Math.abs(p.tip) - LEAN.green : 0
    this.sparkAcc += dt * (over > 0 ? 10 + Math.min(1, over * 1.6) * 30 : 0)
    while (this.sparkAcc > 1) {
      this.sparkAcc -= 1
      this.point(ctx.tmp2.set(Math.sign(p.tip) * 0.8, 0.05, Math.random() < 0.5 ? 0.82 : -0.82), tmp)
      fx.sparks(tmp, 2, 0, -Math.abs(v) * 0.85)
    }
    // Brake sparks, dust and wheel sparks at speed.
    if (p.braking && !p.air && Math.abs(v) > 6 && Math.random() < 0.8) {
      this.point(ctx.tmp2.set(Math.random() < 0.5 ? -0.75 : 0.75, 0.05, 0.82), tmp)
      fx.sparks(tmp, 2, 0, -Math.abs(v) * 0.8)
    }
    const speed01 = Math.min(1, Math.abs(v) / 45)
    if (!p.air && Math.abs(v) > 12 && Math.random() < speed01 * 0.5) {
      this.point(ctx.tmp2.set(0, 0, 1.6), tmp)
      fx.dust(tmp, 1, this.s > TRACK.rampStart && this.s < TRACK.landEnd ? '#b98a5a' : '#c9a77a')
    }
    if (!p.air && Math.abs(v) > 30 && Math.random() < 0.15 * speed01) {
      this.point(ctx.tmp2.set(Math.random() < 0.5 ? -0.75 : 0.75, 0.05, Math.random() < 0.5 ? 0.82 : -0.82), tmp)
      fx.sparks(tmp, 1, 0, -Math.abs(v) * 0.97)
    }
  }

  dispose() {
    this.dead = true
    this.clearBubble()
    this.emote.stop()
    this.root.remove(this.group, this.anchor)
    if (this.cart) this.root.remove(this.cart)
    for (const w of this.wagons) this.root.remove(w)
    disposeAnimator(this.animator)
    disposeLook(this.avatar)
    if (this.tag) {
      this.tag.material.map?.dispose()
      this.tag.material.dispose()
    }
  }
}

// --- The roster -------------------------------------------------------------------------------------------
export function createRemotePlayers(scene, { fx, tracks }) {
  const root = new Group()
  scene.add(root)
  const remotes = new Map() // sessionId -> Remote
  const taken = new Map() // base index -> sessionId
  // Players already in the room when we join are announced as "in the room", later arrivals as "joined":
  // the roster takes a moment to sync after the join, so the first seconds count as already-here.
  let announced = false
  let joinedAt = 0
  let wasConnected = false
  const ctx = { fx, cam: null, t: 0, viewerInCave: false, tmp: null, tmp2: null, tmp3: null }

  const freeBase = () => MULTI.basePrefs.find((b) => !taken.has(b) && b !== BASES.home)

  function drop(id) {
    const r = remotes.get(id)
    if (!r) return
    r.dispose()
    remotes.delete(id)
    taken.delete(r.base)
    tracks?.setBaseOwner(r.base, null)
  }

  return {
    get count() {
      return remotes.size
    },
    get remotes() {
      return remotes
    },
    // A chat message from Bloxity: floats over the matching remote's head (the local player's own bubble
    // is main.js's). userId is the verified Bloxity id the server relays as PlayerState.uid.
    say(userId, text) {
      if (!userId) return false
      for (const r of remotes.values()) {
        if (r.uid === userId) {
          r.say(text)
          return true
        }
      }
      return false
    },
    // cam: the camera's world position (effects spawn near it); viewer: the local player's position;
    // vecs: three scratch Vector3s (no per-frame allocation).
    update(dt, t, cam, viewer, vecs) {
      const players = net.players
      const mine = net.sessionId
      if (!players || !net.connected) {
        if (wasConnected) for (const id of [...remotes.keys()]) drop(id)
        wasConnected = false
        announced = false
        return
      }
      if (!wasConnected) joinedAt = t
      wasConnected = true
      ctx.t = t
      ctx.cam = cam
      ctx.viewerInCave = viewer.z >= CAVE_Z
      ctx.tmp = vecs[0]
      ctx.tmp2 = vecs[1]
      ctx.tmp3 = vecs[2]
      // Leavers first, so their bases are free for this frame's newcomers.
      const present = new Set()
      players.forEach((_p, id) => id !== mine && present.add(id))
      for (const id of [...remotes.keys()]) if (!present.has(id)) drop(id)
      players.forEach((p, id) => {
        if (id === mine) return
        let r = remotes.get(id)
        if (!r) {
          const base = freeBase()
          if (base === undefined) return // more players than bases (can't happen with 5 seats)
          r = new Remote(root, id, base)
          remotes.set(id, r)
          taken.set(base, id)
          const name = p.username || 'Player'
          if (announced) playerJoined(name)
          else playerInRoom(name)
        }
        r.uid = p.uid
        r.lastCrash = p.crash
        try {
          r.update(p, dt, t, ctx)
          tracks?.setBaseOwner(r.base, { name: p.username || 'Player', status: p.ride === 'crashed' ? 'Crashed!' : p.ride === 'foot' ? 'At the base' : 'On the line!' })
        } catch (err) {
          console.warn('[remote] update failed', err)
        }
      })
      if (!announced && t - joinedAt > 2.5) announced = true
    },
  }
}
