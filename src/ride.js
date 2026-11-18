// The ride. The home cart (with the equipped gear on it) and its trailing
// extra carts sit at the base until the player holds E on it (or presses
// LAUNCH). Riding: W / GAS accelerates while fuel lasts, S / BRAKE brakes,
// Space / Shift / BOOST fires a booster charge. The cart physics runs at the
// physics rate (cartPhysics.js); the trailing carts follow the lead cart's
// path (breadcrumbs), so they fly the same arc over the canyon. A run ends
// when the cart stops with no fuel, on RETURN, or in a crash (REVIVE for cash
// or RESTART); its cash (state.js runPayout: distance / Distance Per Currency x Currency x
// multipliers) is banked at the end.
import { Group, SpotLight, Vector3 } from 'three'
import { BASES, CART, CHECKPOINTS, ECONOMY, LEAN, TRACK, ZONES, zoneAt } from './config.js'
import { FLOOR_Y, VALLEY_Y, bendAt, fireBoost, newCart, safeSpeed, stepCart, topSpeed, trackHeight, trackSlope, trackX, trackXSlope } from './cartPhysics.js'
import { createEncounters } from './encounters.js'
import { buildCart, buildGhost, buildWagon, mountPart, WHEEL_R } from './cartModel.js'
import { RAIL_TOP } from './track.js'
import { zAt } from './world.js'
import { addCash, currentStats, equippedGear, onChange, recordBoost, recordJump, recordRun, runPayout, spend, state } from './state.js'
import { onTick } from './physics.js'
import { inputState } from './input.js'
import { sfx } from './audio/index.js'
import { hideDeathScreen, showAdScreen, showDeathScreen } from './bloxity.js'

const HIST = 2048
// Rails on timber (river bridge, Sky Trestle) sound hollower (audio/cart.js).
const supportWood = (s) => (s > TRACK.river.s0 - 50 && s < TRACK.river.s1 + 50) || (s > TRACK.gorge.s0 + 10 && s < TRACK.mine.s0)
// Carts pulled behind the lead cart: Golden Carts (rebirth rewards) first, then extra carts.
const trailing = () => state.wagons + state.goldenCarts

// Tunnels the cart dives into (the mine's bores and the Mountain Tunnel): 0..1 inside.
const TUNNELS = [TRACK.mine, ...TRACK.tunnels]
function tunnelAt(s) {
  let k = 0
  for (const t of TUNNELS) k = Math.max(k, Math.min(1, Math.max(0, Math.min((s - t.s0) / 14, (t.s1 - s) / 14))))
  return k
}
// Where REVIVE puts the cart back after crashing at s.
function checkpointFor(s) {
  let best = CART.safeS
  for (const c of CHECKPOINTS) if (c <= s - 15 && c > best) best = c
  // Never back onto the canyon flight or into a bend's middle.
  return best
}

export function createRide(scene, deps) {
  const { hud, fx, player, camera: cam, events, lighting } = deps
  const adOffered = () => !!deps.adReady?.() // a rewarded ad can be shown (Bloxity only)
  const baseX = BASES.xs[BASES.home]
  const root = new Group()
  scene.add(root)
  const enc = createEncounters(scene, { fx, hud, cam })
  // The cart's headlight: always in the scene (adding a light later recompiles every
  // material), dark until a tunnel or the night calls for it.
  const headlight = new SpotLight('#fff1c8', 0, 70, 0.55, 0.45, 1.4)
  headlight.castShadow = false
  root.add(headlight, headlight.target)
  let leanBtnL = false
  let leanBtnR = false
  let crashKind = null
  let cart = null
  let wagons = []
  let builtKey = ''

  // Debris from a crash: simple ballistic chunks.
  const debris = []

  function rebuild() {
    const g = equippedGear()
    const key = `${state.equipped.engine}|${state.equipped.fuel}|${state.equipped.wheels}|${state.equipped.booster}|${trailing()}|${state.goldenCarts}`
    if (key === builtKey) return
    builtKey = key
    if (cart) root.remove(cart)
    for (const w of wagons) root.remove(w)
    cart = buildCart(g)
    root.add(cart)
    ghost = null
    ghostKey = ''
    wagons = []
    for (let i = 0; i < trailing(); i++) {
      const w = buildWagon(i, g.wheels, i < state.goldenCarts)
      root.add(w)
      wagons.push(w)
    }
    if (mode === 'idle') park()
  }

  // --- Part preview (carry.js) ---------------------------------------------------------------
  // While the player carries an engine / fuel tank near the parked cart, a see-through
  // copy sits where it would bolt on and the part it replaces is hidden.
  let ghost = null
  let ghostKey = ''
  function preview(g) {
    const key = g && mode === 'idle' ? `${g.type}|${g.id}` : ''
    if (key === ghostKey || !cart) return
    ghostKey = key
    if (ghost) cart.userData.tilt.remove(ghost)
    ghost = null
    for (const p of Object.values(cart.userData.parts)) p.visible = true
    if (!key) return
    ghost = mountPart(g.type, g.id, buildGhost(g))
    cart.userData.tilt.add(ghost)
    const old = cart.userData.parts[g.type]
    if (old) old.visible = false
  }
  // World position of where a part of this type bolts on.
  function mountPoint(type, out) {
    if (!cart) return out.set(baseX, 0, zAt(restS()))
    cart.updateMatrixWorld()
    out.set(0, 0.9, 0)
    const p = cart.userData.parts[type]
    if (p) out.add(p.position)
    return cart.userData.tilt.localToWorld(out)
  }

  // --- State -------------------------------------------------------------------------
  let mode = 'idle' // idle | riding | crashed | ending
  let c = null // cart physics state
  let st = null // stats for this run
  const prev = { s: 0, y: 0, pitch: 0 }
  const events_ = []
  let startS = 0
  let runCashNow = 0
  let crashTimer = 0
  let endTimer = 0
  let boostedThisRun = false
  let timeScale = 1
  let pedalGas = false
  let pedalBrake = false
  let boostQueued = false
  let lastSpace = false
  let shake = 0
  let landedFirstThisRun = false
  let distThisFrame = 0
  let lastRenderS = 0
  let smokeAcc = 0
  // The areas along the line (config ZONES): the one the cart is in, the best
  // distance before this run (new areas past it pay their bonus once).
  let zoneIdx = 0
  let bestAtStart = 0
  let fallsDone = false
  let tunnel = 0 // 0..1 inside a mine bore
  let airK = 0 // eased 0..1 while flying
  let ambientAcc = 0

  let lastTunnel = 0
  let screechAcc = 0
  // Breadcrumbs of the lead cart's path for the trailing carts: (path length, s, y, pitch).
  const hist = new Float32Array(HIST * 4)
  let hHead = 0
  let hCount = 0
  let pathLen = 0
  function histReset(s) {
    hHead = 0
    hCount = 0
    pathLen = 0
    // Straight rails behind the lead cart.
    const n = Math.min(HIST - 2, Math.ceil((trailing() + 1) * CART.wagonGap * 2) + 2)
    for (let i = n; i >= 0; i--) {
      const ss = s - i * 0.5
      histPush(ss, railY(ss), 0, i === n)
    }
  }
  function histPush(s, y, pitch, first = false) {
    if (!first && hCount) {
      const j = ((hHead - 1 + HIST) % HIST) * 4
      pathLen += Math.hypot(s - hist[j + 1], y - hist[j + 2])
    }
    const i = hHead * 4
    hist[i] = pathLen
    hist[i + 1] = s
    hist[i + 2] = y
    hist[i + 3] = pitch
    hHead = (hHead + 1) % HIST
    hCount = Math.min(HIST, hCount + 1)
  }
  // The point `back` metres of path behind the head.
  const sample = { s: 0, y: 0, pitch: 0 }
  function histAt(back) {
    const target = pathLen - back
    let hi = (hHead - 1 + HIST) % HIST
    for (let k = 1; k < hCount; k++) {
      const lo = (hi - 1 + HIST) % HIST
      if (hist[lo * 4] <= target) {
        const a = hist[lo * 4]
        const b = hist[hi * 4]
        const t = b > a ? (target - a) / (b - a) : 0
        sample.s = hist[lo * 4 + 1] + (hist[hi * 4 + 1] - hist[lo * 4 + 1]) * t
        sample.y = hist[lo * 4 + 2] + (hist[hi * 4 + 2] - hist[lo * 4 + 2]) * t
        sample.pitch = hist[lo * 4 + 3] + (hist[hi * 4 + 3] - hist[lo * 4 + 3]) * t
        return sample
      }
      hi = lo
    }
    const last = ((hHead - hCount + HIST) % HIST) * 4
    sample.s = hist[last + 1] - (target - hist[last])
    sample.y = railY(sample.s)
    sample.pitch = 0
    return sample
  }
  const railY = (s) => (s < 0 ? 0 : trackHeight(s))

  // Lead cart rests far enough up the station that its carts fit behind it.
  const restS = () => trailing() * CART.wagonGap + 0.5
  function park() {
    const s = restS()
    histReset(s)
    place(s, railY(s), 0, 0)
  }

  // Positions the train for this frame: lead at (s, y, pitch), carts along the breadcrumbs.
  const tmp = new Vector3()
  const xAt = (s) => baseX + trackX(s) + enc.laneX(s)
  const yawAt = (s) => -Math.atan(trackXSlope(s) + (enc.laneX(s + 0.5) - enc.laneX(s - 0.5)))
  let roll = 0
  function place(s, y, pitch, spinV, dt = 0) {
    if (!cart) return
    cart.position.set(xAt(s), y + RAIL_TOP + (cart.userData.hover ? 0.25 : 0), zAt(s))
    cart.rotation.y = yawAt(s)
    // Lean into the bend; past the green the cart rides up on two wheels (away from the turn).
    if (c && mode === 'riding' && !c.air) {
      const over = Math.max(0, Math.abs(c.tip) - LEAN.green)
      const want = -c.lean * 0.16 + Math.sign(c.tip) * Math.min(0.42, over * 0.55)
      roll += (want - roll) * Math.min(1, dt * 12)
    } else roll += (0 - roll) * Math.min(1, dt * 6)
    cart.rotation.z = roll
    cart.userData.tilt.rotation.x = pitch
    for (const w of cart.userData.spin) w.rotation.x -= (spinV / WHEEL_R) * dt
    wagons.forEach((w, i) => {
      const p = histAt((i + 1) * CART.wagonGap)
      w.position.set(xAt(p.s), p.y + RAIL_TOP, zAt(p.s))
      w.rotation.y = yawAt(p.s)
      w.rotation.z = roll * 0.6
      w.userData.tilt.rotation.x = p.pitch
      for (const wh of w.userData.spin) wh.rotation.x -= (spinV / WHEEL_R) * dt
      w.visible = mode !== 'crashed'
    })
  }

  // World position of a local point on the lead cart.
  function cartPoint(local, out) {
    out.copy(local)
    cart.userData.tilt.localToWorld(out)
    return out
  }

  // --- Mount / dismount ------------------------------------------------------------------
  function seatPos(out) {
    return cartPoint(cart.userData.seat, out)
  }
  function mount() {
    if (mode !== 'idle') return
    preview(null)
    rebuild()
    st = currentStats(events.speed(), events.storm() > 0.5)
    const s0 = restS()
    c = newCart(st, s0)
    enc.reset(c, events.cash())
    crashKind = null
    roll = 0
    startS = s0
    prev.s = c.s
    prev.y = c.y
    prev.pitch = 0
    histReset(s0)
    mode = 'riding'
    runCashNow = 0
    boostedThisRun = false
    landedFirstThisRun = false
    lastRenderS = c.s
    zoneIdx = zoneAt(c.s)
    bestAtStart = state.stats.best
    fallsDone = false
    hud.resetRun()
    hud.setRiding(true)
    player.freeze(true)
    sfx.mount()
    fx.dust(seatPos(tmp), 6)
    cam.setRide(true)
  }

  // The portal's death screen (Bloxity): its countdown (>= 4 s, with ads) gates every respawn. `death`
  // is its handle, deathLeft the seconds still to wait. Without the SDK the game's own timer rules.
  let death = null
  let deathLeft = 0
  let deathOff = null
  function startDeath() {
    endDeath()
    death = showDeathScreen()
    if (!death) return
    deathLeft = 4
    try {
      deathOff = death.onCountdown?.((n) => (deathLeft = n)) ?? null
    } catch {
      deathOff = null
    }
    showAdScreen('results')
  }
  function endDeath() {
    if (deathOff) {
      try {
        deathOff()
      } catch {
        // Already gone.
      }
    }
    deathOff = null
    if (death) hideDeathScreen()
    death = null
    deathLeft = 0
    showAdScreen(null)
  }
  // True when a respawn may happen now: always without a death screen, else once the portal says so.
  function mayRespawn() {
    if (!death) return true
    try {
      return !!death.respawn()
    } catch {
      return true
    }
  }

  function dismountAtBase() {
    endDeath()
    mode = 'idle'
    c = null
    timeScale = 1
    tunnel = 0
    airK = 0
    headlight.intensity = 0
    hud.speedFx(0, false, 0)
    hud.lean(0, false)
    hud.bend(null)
    hud.alert(null)
    hud.junction(null)
    hud.setRiding(false)
    hud.showCrash(false)
    cart.visible = true
    for (const w of wagons) w.visible = true
    clearDebris()
    park()
    player.freeze(false)
    player.teleport(baseX + 3.2, 0.05, BASES.cartZ - restS() + 1, Math.PI)
    cam.setRide(false)
  }

  // Bank the run and go back to the base.
  function finishRun(reason) {
    if (!c) return
    const dist = Math.max(0, c.maxS - startS)
    const cash = runPayout(c.maxS, events.cash())
    if (dist > 2 || reason === 'crash') {
      const got = addCash(cash)
      recordRun(c.maxS, got, c.jumped)
      if (got > 0) {
        hud.toast(`+$${got.toLocaleString('en-US')}`, 'good')
        sfx.payout(Math.min(1, got / 300))
      }
    }
    dismountAtBase()
  }

  // --- Crash ------------------------------------------------------------------------------
  const CRASH_TEXT = { derail: 'DERAILED!', herd: 'THE MOOSE WON!', rocks: 'CRUSHED BY ROCKS!', splash: 'INTO THE RIVER!' }
  function crash(kind = 'spikes') {
    mode = 'crashed'
    crashKind = kind
    crashTimer = ECONOMY.reviveCountdown
    const p = cartPoint(new Vector3(0, 0.8, 0), new Vector3())
    if (kind === 'splash') {
      fx.spray(p, 120)
      sfx.splash(2.6)
    } else fx.explosion(p, kind === 'spikes' ? 1.3 : 0.9)
    if (kind === 'derail') {
      sfx.derail()
      fx.sparks(p, 60)
      fx.dust(p, 16, ZONES[zoneIdx].dust)
    }
    if (kind === 'herd') {
      sfx.moose()
      fx.stars(p.clone().setY(p.y + 1.6), 10)
    }
    if (kind === 'rocks') fx.chunks(p, 30, '#8a8a92', 1.4, 0.45)
    if (CRASH_TEXT[kind]) hud.banner(CRASH_TEXT[kind], 'Revive to keep going')
    startDeath()
    for (const w of wagons) fx.explosion(w.getWorldPosition(new Vector3()), 0.6)
    // Off the rails sideways (bends, animals), down into the canyon, or into the river.
    const side = kind === 'derail' ? Math.sign(c.tip || 1) * -1 : 0
    const floor = kind === 'spikes' ? FLOOR_Y + 0.3 : kind === 'splash' ? VALLEY_Y - 0.6 : Math.min(trackHeight(c.s), VALLEY_Y) + 0.3
    spawnDebris(p, floor, side)
    cart.visible = false
    for (const w of wagons) w.visible = false
    player.setHidden(true)
    if (kind === 'spikes' || kind === 'rocks') sfx.crash()
    shake = 1.2
    timeScale = 1
    runCashNow = runPayout(c.maxS, events.cash())
    hud.lean(0, false)
    hud.alert(null)
  }
  // free = a watched rewarded ad paid for it (main.js), not Cash.
  function revive(free = false) {
    if (mode !== 'crashed') return
    const price = ECONOMY.revivePrice(runCashNow)
    if (!free && state.cash < price) {
      sfx.deny()
      hud.toast('Not enough cash to revive', 'bad')
      return
    }
    if (!mayRespawn()) return // the portal's countdown is still running
    if (!free) spend(price)
    endDeath()
    // Back on the rails at the last checkpoint with a full tank and boosters.
    const maxS = c.maxS
    const jumped = c.jumped
    const at = crashKind === 'spikes' ? CART.safeS : checkpointFor(c.s)
    c = newCart(st, at)
    enc.revive(at)
    roll = 0
    c.maxS = maxS
    c.jumped = jumped
    zoneIdx = zoneAt(c.s)
    fallsDone = false
    prev.s = c.s
    prev.y = c.y
    histReset(c.s)
    mode = 'riding'
    cart.visible = true
    player.setHidden(false)
    hud.showCrash(false)
    clearDebris()
    sfx.revive()
    fx.confetti(cartPoint(new Vector3(0, 1.5, 0), new Vector3()), 30, 0.6)
  }

  function spawnDebris(p, floor = FLOOR_Y + 0.3, side = 0) {
    const parts = []
    cart.traverse((o) => {
      if (o.isMesh && parts.length < 14 && Math.random() < 0.35) parts.push(o)
    })
    for (const src of parts) {
      const m = src.clone()
      m.position.copy(p)
      m.scale.multiplyScalar(1)
      root.add(m)
      debris.push({ m, floor, vx: (Math.random() - 0.5) * 12 + side * 9, vy: 4 + Math.random() * 9, vz: (Math.random() - 0.5) * 12 - (side ? 6 : 0), rx: Math.random() * 8, rz: Math.random() * 8 })
    }
  }
  function clearDebris() {
    for (const d of debris) root.remove(d.m)
    debris.length = 0
  }

  // --- Fixed-rate simulation -----------------------------------------------------------------
  onTick((dt) => {
    if (mode !== 'riding' || !c) return
    prev.s = c.s
    prev.y = c.y
    prev.pitch = c.pitch
    const mv = inputState.move.z
    const throttle = Math.max(mv > 0.2 ? mv : 0, pedalGas ? 1 : 0)
    const brake = Math.max(mv < -0.2 ? -mv : 0, pedalBrake ? 1 : 0)
    if (boostQueued) {
      boostQueued = false
      if (fireBoost(c, st)) {
        sfx.boost()
        boostedThisRun = true
        recordBoost()
        shake = Math.max(shake, 0.35)
      }
    }
    const mx = inputState.move.x
    const lean = Math.max(-1, Math.min(1, (Math.abs(mx) > 0.15 ? mx : 0) + (leanBtnR ? 1 : 0) - (leanBtnL ? 1 : 0)))
    const input = enc.beforeStep(c, { throttle, brake, lean }, dt)
    const before = c.s
    stepCart(c, input, st, dt, events_)
    const hit = enc.afterStep(c, st, before, dt)
    if (hit && !c.crashed) {
      c.crashed = hit
      events_.push('crash')
    }
    histPush(c.s, c.y, c.pitch)
    for (const e of events_) {
      if (e === 'fuelOut') {
        sfx.fuelOut()
        hud.toast('Out of fuel!', 'bad')
      } else if (e === 'launch') {
        sfx.launch()
        shake = 0.4
      } else if (e === 'land') {
        sfx.cartLand(1)
        shake = 0.9
        const p = cartPoint(new Vector3(0, 0.2, 0), new Vector3())
        fx.ring(p, '#b98a5a', 30)
        fx.sparks(p, 40)
        if (!landedFirstThisRun) {
          landedFirstThisRun = true
          const first = state.stats.jumps === 0
          const bonus = addCash(first ? ECONOMY.firstJumpBonus : ECONOMY.jumpBonus)
          recordJump()
          hud.banner('CANYON CLEARED!', `+$${bonus.toLocaleString('en-US')} jump bonus`)
          sfx.jumpSuccess(first)
          fx.confetti(cartPoint(new Vector3(0, 2, -2), new Vector3()), 120, 1.2)
        }
      } else if (e === 'wallHit') {
        sfx.cartLand(0.8)
        shake = 1
        const p = cartPoint(new Vector3(0, 0.5, -1.4), new Vector3())
        fx.sparks(p, 30, 0, 6)
        fx.dust(p, 10, '#9a6337')
      } else if (e === 'hop') {
        sfx.whoosh(Math.min(1, Math.abs(c.vx) / 60))
      } else if (e === 'touchdown') {
        // Airtime over a crest: a thump scaled by how long it flew.
        const k = Math.min(1, c.airTime / 1.2)
        if (c.airTime > 0.3) {
          sfx.cartLand(0.35 + k * 0.6)
          shake = Math.max(shake, 0.25 + k * 0.6)
          cam.kick(0.4 + k)
          const p = cartPoint(new Vector3(0, 0.2, 0), new Vector3())
          fx.sparks(p, Math.round(8 + k * 30), 0, -Math.abs(c.v) * 0.8)
          fx.ring(p, ZONES[zoneIdx].dust, Math.round(10 + k * 20))
          if (c.airTime > 0.8) hud.airtime(c.airTime)
        }
      } else if (e === 'crash') crash(c.crashed === true ? 'spikes' : c.crashed)
      else if (e === 'derail') crash('derail')
      else if (e === 'lift') {
        sfx.liftEngage()
        hud.pop('CHAIN LIFT!', '#e9f6ff', 1.1)
      } else if (e === 'bufferStop') {
        sfx.bufferClang()
        shake = 0.6
      } else if (e === 'arrived') {
        // Golden Station: the end of the line.
        mode = 'ending'
        endTimer = 4
        const cash = runPayout(c.maxS, events.cash())
        enc.arrived(c.s)
        hud.banner('END OF THE LINE!', `${Math.round(c.maxS)}m · +$${Math.round(cash).toLocaleString('en-US')}`)
        sfx.finish(true)
        const p = cartPoint(new Vector3(0, 2, 0), new Vector3())
        fx.confetti(p, 160, 1.4)
        for (let i = 0; i < 6; i++) setTimeout(() => fx.firework({ x: p.x + (Math.random() - 0.5) * 40, y: p.y + 14 + Math.random() * 12, z: p.z - 10 - Math.random() * 30 }), 300 + i * 380)
      } else if (e === 'stopped') {
        mode = 'ending'
        endTimer = 1.6
        const cash = runPayout(c.maxS, events.cash())
        hud.banner(`${Math.round(c.maxS)}m`, `+$${Math.round(cash).toLocaleString('en-US')}`)
      }
    }
  })

  // --- Per-frame ---------------------------------------------------------------------------------
  const seat = new Vector3()
  const p = new Vector3()
  const back = new Vector3()
  let ride_t = 0
  function update(dt, alpha) {
    ride_t += dt
    rebuild()
    // Debris.
    for (const d of debris) {
      d.vy -= CART.gravity * dt
      d.m.position.x += d.vx * dt
      d.m.position.y += d.vy * dt
      d.m.position.z += d.vz * dt
      d.m.rotation.x += d.rx * dt
      d.m.rotation.z += d.rz * dt
      const floor = d.floor
      if (d.m.position.y < floor && d.vy < 0) {
        d.m.position.y = floor
        d.vy *= -0.3
        d.vx *= 0.6
        d.vz *= 0.6
        d.rx *= 0.5
        d.rz *= 0.5
      }
    }
    shake = Math.max(0, shake - dt * 1.6)

    if (mode === 'idle') {
      place(restS(), 0, 0, 0)
      enc.update(dt, ride_t, null, false)
      return
    }
    if (!c) return
    const s = prev.s + (c.s - prev.s) * alpha
    const y = prev.y + (c.y - prev.y) * alpha
    const pitch = prev.pitch + (c.pitch - prev.pitch) * alpha
    distThisFrame = Math.abs(s - lastRenderS)
    lastRenderS = s
    const v = c.air ? c.vx : c.v
    if (mode !== 'crashed') place(s, y, pitch, v, dt)
    if (mode === 'riding' || mode === 'ending') areas(s, v, dt)

    // The player rides in the seat.
    if (mode !== 'crashed') {
      seatPos(seat)
      const rumble = !c.air && Math.abs(v) > 5 ? (Math.random() - 0.5) * 0.03 * Math.min(1, Math.abs(v) / 40) : 0
      player.pin(seat.x, seat.y + rumble, seat.z, Math.PI)
    }

    // Effects.
    const top = topSpeed(st)
    const speed01 = Math.min(1, Math.abs(v) / 45)
    if (mode === 'riding') {
      smokeAcc += dt * (4 + c.throttle * 22)
      // Puffs and flames move with the cart (world -Z) and drift back slowly, so
      // at speed they trail behind it instead of flying through the chase cam.
      const carry = -Math.abs(v)
      while (smokeAcc > 1) {
        smokeAcc -= 1
        for (const e of cart.userData.exhausts) {
          cartPoint(e, p)
          if (c.fuel > 0) fx.exhaust(p, 0, 0.5, carry * 0.93 + 1.5, c.throttle, Math.abs(v) > 8 ? 0 : 1.2)
        }
      }
      if (cart.userData.nozzle && c.throttle > 0 && c.fuel > 0) {
        cartPoint(cart.userData.nozzle, p)
        for (let i = 0; i < 2; i++) fx.flame(p, 0, 0, carry * 0.96 + 6, 1.2, '#ffd27a', '#ff5a1a')
      }
      if (c.boostLeft > 0) {
        for (const f of cart.userData.flames) {
          cartPoint(f, p)
          for (let i = 0; i < 2; i++) fx.flame(p, 0, 0, carry * 0.96 + 7, 1, '#9fe8ff', '#ff6a1a')
        }
      }
      // On two wheels: sparks off the low side, a screech, the creak of the frame.
      const over = !c.air ? Math.abs(c.tip) - LEAN.green : 0
      if (over > 0) {
        const k = Math.min(1, over * 1.6)
        sfx.screech(k)
        if (Math.abs(c.tip) > 0.85) sfx.tiltWarn(k)
        screechAcc += dt * (10 + k * 30)
        while (screechAcc > 1) {
          screechAcc -= 1
          back.set(Math.sign(c.tip) * 0.8, 0.05, Math.random() < 0.5 ? 0.82 : -0.82)
          cartPoint(back, p)
          fx.sparks(p, 2, 0, -Math.abs(v) * 0.85)
        }
      }
      if (c.chain) sfx.chainClack(c.v)
      // Brake sparks off the wheels.
      const brakeIn = inputState.move.z < -0.2 || pedalBrake
      if (brakeIn && !c.air && Math.abs(v) > 6 && Math.random() < 0.8) {
        back.set(Math.random() < 0.5 ? -0.75 : 0.75, 0.05, 0.82)
        cartPoint(back, p)
        fx.sparks(p, 2, 0, -Math.abs(v) * 0.8)
      }
      // Dust kicked up at speed.
      if (!c.air && tunnel < 0.5 && Math.abs(v) > 12 && Math.random() < speed01 * 0.5) {
        back.set(0, 0, 1.6)
        cartPoint(back, p)
        fx.dust(p, 1, c.s > TRACK.rampStart && c.s < TRACK.landEnd ? '#b98a5a' : ZONES[zoneIdx].dust)
      }
      // Wheel sparks off the rails at full tilt (more in the mine, where they show).
      if (!c.air && Math.abs(v) > 30 && Math.random() < (tunnel > 0.3 ? 0.7 : 0.15) * speed01) {
        back.set(Math.random() < 0.5 ? -0.75 : 0.75, 0.05, Math.random() < 0.5 ? 0.82 : -0.82)
        cartPoint(back, p)
        fx.sparks(p, 1, 0, -Math.abs(v) * 0.97) // carried along, trailing off the wheels
      }
      // A little slow motion while flying over the canyon, and on the big airs.
      const canyon = c.air && c.s > TRACK.lipS - 2 && c.s < TRACK.gapEnd + 4
      const bigAir = c.air && c.hop && c.airTime > 0.35 && c.y - trackHeight(c.s) > 4
      const target = canyon ? 0.55 : bigAir ? 0.72 : 1
      timeScale += (target - timeScale) * Math.min(1, dt * 6)
    }

    if (mode === 'crashed') {
      const price = ECONOMY.revivePrice(runCashNow)
      const ad = adOffered()
      if (death) {
        // The portal's countdown decides when anything may respawn; never on a timer.
        hud.showCrash(true, deathLeft, price, state.cash >= price, { wait: deathLeft > 0, ad, hold: deathLeft <= 0 })
      } else {
        crashTimer -= dt
        hud.showCrash(true, crashTimer, price, state.cash >= price, { ad })
        if (Math.ceil(crashTimer) !== Math.ceil(crashTimer + dt) && crashTimer > 0) sfx.countdown(crashTimer < 1)
        if (crashTimer <= 0) {
          hud.showCrash(false)
          player.setHidden(false)
          finishRun('crash')
          return
        }
      }
    }
    if (mode === 'ending') {
      endTimer -= dt
      if (endTimer <= 0) {
        finishRun('stopped')
        return
      }
    }

    // Headlight: tunnels, the mine, the night.
    const nightK = lighting?.nightLevel?.() ?? 0
    const lightK = mode === 'crashed' ? 0 : Math.max(tunnel, nightK * 0.8)
    headlight.intensity = lightK * 220
    if (lightK > 0.01) {
      cartPoint(tmp.set(0, 1.3, -1.6), headlight.position)
      cartPoint(tmp.set(0, 0.2, -24), headlight.target.position)
    }
    // Lean meter and the bend ahead.
    if (mode === 'riding') {
      const v0 = c.air ? 0 : c.v
      const inBend = bendAt(c.s) >= 0 || Math.abs(enc.windSide()) > 0.05
      hud.lean(c.tip, inBend || Math.abs(c.tip) > 0.2)
      let bendText = null
      let hot = false
      for (let i = 0; i < TRACK.bends.length; i++) {
        const [b0, b1] = TRACK.bends[i]
        if (c.s > b1 || c.s < b0 - 160) continue
        let vs = Infinity
        for (let x = b0 + 1; x < b1; x += 3) vs = Math.min(vs, safeSpeed(x, st.grip))
        if (vs > 70 || v0 < vs * 0.6) break
        bendText = `BEND! MAX ${Math.floor(vs)}`
        hot = v0 > vs * 1.05
        break
      }
      hud.bend(bendText, hot)
    }
    enc.update(dt, ride_t, c, mode === 'riding' || mode === 'ending')
    runCashNow = runPayout(c.maxS, events.cash())
    const charges = c.charges
    hud.setRide({
      cash: runCashNow,
      dist: Math.max(0, c.maxS),
      speed: v,
      top,
      fuel: c.fuel / st.tank,
      charges,
      boostReady: charges > 0 && c.boostLeft <= 0 && mode === 'riding',
      burning: c.boostLeft > 0,
      hasBooster: st.charges > 0,
    })
    airK += ((c.air && (!c.hop || c.airTime > 0.25) ? 1 : 0) - airK) * Math.min(1, dt * 5)
    cam.rideState(speed01, shake, airK, mode === 'crashed', c.air ? 0 : trackSlope(c.s), c.boostLeft > 0, yawAt(s), roll)
    hud.speedFx(mode === 'crashed' ? 0 : Math.max(0, (Math.abs(v) - 22) / 50), c.boostLeft > 0, tunnel)
  }

  // --- Areas: zone cards, first-visit bonuses, the falls, the mine, ambient particles -----------
  const amb = new Vector3()
  function areas(s, v, dt) {
    // Zone changes (forward only: rolling back doesn't re-announce).
    const zi = zoneAt(s)
    if (zi > zoneIdx) {
      zoneIdx = zi
      const z = ZONES[zi]
      const fresh = !!z.bonus && z.s > bestAtStart + 1
      if (!z.quiet) {
        let sub = z.sub ?? ''
        if (fresh) {
          const got = addCash(z.bonus)
          sub = `NEW AREA! +$${got.toLocaleString('en-US')}`
          // Two poppers either side of the line ahead: the cart drives between them.
          for (const side of [-1, 1]) {
            const p = cart.getWorldPosition(new Vector3())
            p.x += side * 7.5
            p.z -= 12 + Math.abs(v) * 0.4
            fx.confetti(p, 45, 1.1)
          }
        }
        hud.zone(z.name, sub, z.color, fresh)
        sfx.zone(fresh)
      }
    }
    // Through the waterfall: a wall of spray, the splash, droplets on the screen.
    if (!fallsDone && s >= TRACK.falls - 1) {
      fallsDone = true
      sfx.splash(2.4)
      shake = Math.max(shake, 0.7)
      cam.kick(0.6)
      hud.splash()
      fx.spray(cartPoint(new Vector3(0, 1.5, -1), new Vector3()), 90)
    }
    // Tunnels (the mine, the Mountain Tunnel): dark and echoing.
    const inT = tunnelAt(s)
    if (inT > 0.05 && lastTunnel <= 0.05) sfx.tunnelEnter()
    lastTunnel = inT
    tunnel += (inT - tunnel) * Math.min(1, dt * 6)
    // Sandstorm wind over the Golden Sands junction.
    if (s > TRACK.junction.s0 - 40 && s < TRACK.junction.s1 + 30) sfx.sandstorm(0.7)

    // Ambient particles ahead of the cart: as it passes them they stream by
    // like wind. Denser at speed.
    const night = (lighting?.nightLevel?.() ?? 0) > 0.5
    const kind = s > TRACK.falls - 90 && s < TRACK.falls + 4 ? 'mist' : tunnel > 0.5 && zoneIdx !== zoneAt(TRACK.mine.s0 + 1) ? null : night && ZONES[zoneIdx].id === 'forest' ? 'fireflies' : ZONES[zoneIdx].air
    if (!kind) return
    ambientAcc += dt * (5 + Math.min(40, Math.abs(v)) * (kind === 'mist' ? 1.6 : kind === 'sparkle' ? 0.2 : 0.6))
    while (ambientAcc > 1) {
      ambientAcc -= 1
      cart.getWorldPosition(amb)
      // Off to the sides (never down the camera's line, where they'd fill the screen).
      const side = Math.random() < 0.5 ? -1 : 1
      const mine = kind === 'sparkle'
      amb.x += side * (mine ? 1.6 + Math.random() * 2.2 : 3.5 + Math.random() * 11)
      amb.y += mine ? 0.6 + Math.random() * 9 : 0.5 + Math.random() * (kind === 'mist' ? 10 : 7)
      amb.z -= 10 + Math.random() * 40
      fx.ambient(amb, kind)
    }
  }

  // --- Input from the HUD / keys ------------------------------------------------------------------
  function boost() {
    if (mode === 'riding') boostQueued = true
  }
  function launchOrReturn() {
    if (mode === 'idle') {
      mount()
      return
    }
    if (mode === 'crashed') return
    finishRun('return')
  }
  function interactKey() {
    // E while riding: get off (counts as a return).
    if (mode === 'riding' && c && Math.abs(c.v) < 0.5 && c.maxS - startS < 2) {
      sfx.mount()
      dismountAtBase()
    }
  }

  // Space / Shift: booster (edge-triggered).
  function pollKeys() {
    const space = inputState.jump || inputState.sprint
    if (mode !== 'idle' && space && !lastSpace) boost()
    lastSpace = space
    if (mode !== 'idle') inputState.jump = false
  }

  onChange((what) => {
    if (what === 'equip' || what === 'wagons' || what === 'reset' || what === 'rebirth') rebuild()
  })
  rebuild()
  park()

  return {
    update(dt, alpha) {
      pollKeys()
      update(dt, alpha)
    },
    mount,
    preview,
    mountPoint,
    revive,
    restart: () => {
      if (mode !== 'crashed' || !mayRespawn()) return
      crashTimer = 0
      hud.showCrash(false)
      player.setHidden(false)
      finishRun('crash')
    },
    // What the other players draw of this cart (net.js `cart` message), null while it is parked.
    presence() {
      if (mode === 'idle' || !c) return null
      const air = !!c.air
      return {
        ride: mode,
        crash: mode === 'crashed' && typeof crashKind === 'string' ? crashKind : '',
        s: c.s,
        cy: c.y,
        pitch: c.pitch,
        roll,
        lx: enc.laneX(c.s),
        v: air ? c.vx : c.v,
        throttle: c.throttle ?? 0,
        braking: !air && (inputState.move.z < -0.2 || pedalBrake),
        boosting: c.boostLeft > 0,
        air,
        fuelOk: c.fuel > 0,
        tip: c.tip ?? 0,
      }
    },
    boost,
    launchOrReturn,
    interactKey,
    pedal(key, on) {
      if (key === 'gas') pedalGas = on
      else pedalBrake = on
    },
    // Touch lean buttons (dir -1 left / 1 right).
    leanButton(dir, on) {
      if (dir < 0) leanBtnL = on
      else leanBtnR = on
      if (on) enc.pickLane(dir)
    },
    lane: (dir) => enc.pickLane(dir),
    get encounters() {
      return enc
    },
    get riding() {
      return mode !== 'idle'
    },
    get timeScale() {
      return timeScale
    },
    get mode() {
      return mode
    },
    // Dev (browser tests): the live cart physics state and this run's stats (null while parked).
    get debug() {
      return c ? { c, st, startS, bestAtStart, zoneIdx } : null
    },
    // Where to stand to get in: beside the lead cart.
    cartSpot: () => ({ x: baseX, z: zAt(restS()) }),
    audioState() {
      const v = c ? (c.air ? c.vx : c.v) : 0
      return {
        riding: mode === 'riding' || mode === 'ending',
        engine: state.equipped.engine,
        speed: v,
        top: st ? topSpeed(st) : 20,
        throttle: c?.throttle ?? 0,
        brake: c && (inputState.move.z < -0.2 || pedalBrake) ? 1 : 0,
        air: !!c?.air,
        boosting: !!c && c.boostLeft > 0,
        fuel: !!c && c.fuel > 0,
        dist: distThisFrame,
        wood: !!c && !c.air && supportWood(c.s),
      }
    },
    // 0..1 inside a mine bore while riding (main.js: the indoor light and sound).
    get tunnel() {
      return mode === 'idle' ? 0 : tunnel
    },
    get speed() {
      return c ? Math.abs(c.air ? c.vx : c.v) : 0
    },
    // The lead cart's s on the line (-1e9 while parked).
    get cartS() {
      return c && mode !== 'idle' ? c.s : -1e9
    },
    // Dev: put the riding cart at s with speed v (__game.ride.warp(2500, 60)).
    warp(s, v = 40) {
      if (!import.meta.env.DEV || mode !== 'riding' || !c) return
      c.s = c.maxS = s
      c.v = v
      c.air = c.hop = false
      c.lean = c.tip = c.danger = 0
      c.y = trackHeight(s)
      prev.s = s
      prev.y = c.y
      histReset(s)
    },
  }
}

