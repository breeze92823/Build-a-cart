import { ACESFilmicToneMapping, Clock, Group, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { ADS, BASES, BUNDLES, CAMERA, CART, ECONOMY, GEAR, graphicsPreset, RENDER, SPAWN, SPAWN_FACING, WHEEL } from './config.js'
import * as bloxity from './bloxity.js'
import { inputState, install as installInput, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, pinPlayer, player, resetPlayer, setFrozen } from './player.js'
import { kickCamera, rideState, setCameraSensitivity, setRide, syncYawToPlayer, update as updateCamera } from './camera.js'
import { onModeChanged, toggleMode } from './modes.js'
import { alpha as physicsAlpha, bodyCount, initPhysics, stepPhysics } from './physics.js'
import * as physics from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { createZones } from './zones.js'
import { createRoute } from './route.js'
import { buildTracks, fmt } from './track.js'
import { buildCave, clock } from './cave.js'
import { buildOutside } from './outside.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import * as S from './state.js'
import { createRide } from './ride.js'
import { createFx } from './fx.js'
import { createEvents } from './events.js'
import { createHud } from './ui/hud.js'
import { initThumbs, thumb } from './ui/thumbs.js'
import * as W from './ui/windows.js'
import { initNet, net, refreshQuestSchedule, sendEmote } from './net.js'
import { addSpot, updateInteract } from './interact.js'
import { createCarry } from './carry.js'
import { installAudio, sfx, setAdMuted, setVolume, updateAudio } from './audio/index.js'
import { createRemotePlayers } from './remote.js'
import { createPresence } from './presence.js'
import { createEmotePlayer } from './avatar/emotes.js'
import { adsReady, watchAd, watchForCashBoost } from './ads.js'

// Boot order: Bloxity SDK -> renderer -> Rapier -> world (valley, cave, tracks),
// player body -> avatar (async) -> game (state, HUD, ride, fx, audio) -> loop.
let lighting = null
let renderer = null
let postfx = null
let fx = null

function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'master_volume') setVolume(value / 100)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    postfx?.setSize(window.innerWidth, window.innerHeight)
    resize()
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement)

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  fx?.resize(renderer.domElement.height / (2 * Math.tan((CAMERA.fov * Math.PI) / 360)))
}
window.addEventListener('resize', resize)
resize()
for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- World ----------------------------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()
bloxity.loadingStep('Building the valley')
lighting = createLighting(scene, renderer, preset)
const world = createWorld(scene)
const zones = createZones(scene)
const route = createRoute(scene)
const tracks = buildTracks(scene, S.gearById)
const cave = buildCave(scene)
buildOutside(scene)
createPlayerBody()
syncYawToPlayer()

// --- Player avatar ----------------------------------------------------------
const playerGroup = new Group()
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false
const emote = createEmotePlayer()
function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  animator = makeAnimator(avatar)
  emote.setAvatar(avatar, animator)
}
setAvatar(buildDefaultCharacter())
async function loadAvatar() {
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}
let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar()
  }
  refreshOwner()
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))

// Portal emotes (the emote picker): played on the local avatar, sent to the room so the others see them.
emote.onChange((id) => sendEmote(id))
bloxity.onPortalEmote((id) => (id ? emote.play(id) : emote.stop()))

// Chat bubbles (Bloxity chat): the local player's float over their own avatar, the others' over theirs
// (remote.js matches the verified Bloxity id).
let remotes = null
let myBubble = null
bloxity.onChatMessage((m) => {
  if (!m.isLocal) return void remotes?.say(m.userId, m.text)
  try {
    myBubble?.remove?.()
  } catch {
    // Already gone.
  }
  myBubble = bloxity.attachChatBubble(playerGroup, m.text, 2.6)
})

let playerHidden = false
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player' && !playerHidden
})

// --- Game ----------------------------------------------------------------------------
installAudio()
fx = createFx(scene, preset.particles)
resize()
const events = createEvents()
initThumbs(renderer)
// The save: this browser's copy now, the server's once it answers (net.js).
initNet()

const playerApi = {
  freeze: setFrozen,
  pin: pinPlayer,
  teleport(x, y, z, facing) {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  },
  setHidden(h) {
    playerHidden = h
    playerGroup.visible = !h
  },
}

function celebrate(big = false) {
  const p = player.renderPosition
  fx.confetti({ x: p.x, y: p.y + 2.5, z: p.z }, big ? 90 : 40, big ? 1 : 0.7)
  fx.glint({ x: p.x, y: p.y + 2, z: p.z }, 12, '#fff2a8', 1.2)
}

let ride = null
const hud = createHud({
  launch: () => {
    if (W.isWindowOpen()) W.closeWindow()
    ride.launchOrReturn()
  },
  wheel: () => {
    if (ride.riding) return
    if (S.spinLeft() > 0) {
      hud.toast(`Next free spin in ${clock(S.spinLeft())}`, 'bad')
      return
    }
    // Walk them over: stand in front of the wheel.
    playerApi.teleport(cave.spots.wheel.x - 1.5, 0.05, cave.spots.wheel.z, Math.PI / 2)
    hud.toast('Hold E to spin the Lucky Wheel!')
  },
  offer: () => W.openBundle('starter'),
  shop: () => {
    hud.shopSeen()
    W.openShop()
  },
  quests: W.openQuests,
  rebirth: W.openRebirth,
  saves: W.openSaves,
  backpack: W.openBackpack,
  hold: (id) => carry.hold(id),
  boost: () => ride.boost(),
  pedal: (k, on) => ride.pedal(k, on),
  lean: (dir, on) => ride.leanButton(dir, on),
  lane: (dir) => ride.lane(dir),
  revive: () => ride.revive(),
  restart: () => ride.restart(),
  // Rewarded ads (Bloxity only; the buttons stay hidden without an ad to show).
  adRevive: async () => {
    if (await watchAd(ADS.revive)) ride.revive(true)
    else hud.toast('No ad right now, try again in a minute', 'bad')
  },
  adBoost: async () => {
    const got = await watchForCashBoost()
    if (got) {
      sfx.prize(false)
      hud.toast(`2x Cash for ${Math.round(got / 60)} minutes!`, 'gold')
      celebrate()
      refreshAll()
    } else hud.toast('No ad right now, try again in a minute', 'bad')
  },
})
W.initWindows({
  toast: hud.toast,
  fx: { celebrate },
  onOpen: (name) => {
    if (name === 'quests') questNews = false
    bloxity.showAdScreen('menu') // screen ads (Bloxity): menus only, never over the ride
    refreshAll()
  },
  onClose: () => bloxity.showAdScreen(null),
})
// Quest and quest-level notices.
let questNews = false
S.onNotice((kind, d) => {
  if (kind === 'quest') {
    if (W.openName() !== 'quests') questNews = true
    sfx.quest()
    hud.toast(`Quest complete: ${d.name}! +${fmt(d.reward)} · +${d.stars} Stars`, 'gold')
    celebrate()
  } else if (kind === 'level') {
    sfx.prize(true)
    hud.banner(`QUEST LEVEL ${d.level}!`, [d.cash ? `+${fmt(d.cash)}` : '', d.slot >= 0 ? 'Save slot unlocked' : '', ...d.gear.map((g) => g.name)].filter(Boolean).join(' · '))
    celebrate(true)
  }
  refreshAll()
})
ride = createRide(scene, { hud, fx, player: playerApi, camera: { setRide, rideState, kick: kickCamera }, events, lighting, adReady: adsReady })
// The other players of the room (up to 4 more): their carts on the other bases and on the shared line.
remotes = createRemotePlayers(scene, { fx, tracks })
const presence = createPresence({ ride })
const remoteVecs = [new Vector3(), new Vector3(), new Vector3()]
// An ad break (Bloxity): freeze the game and mute it until the portal says it is over.
bloxity.onAdBreak((on) => {
  setAdMuted(on)
  paused = on
  if (!on) clockT.getDelta() // the break is not game time
})
// No server (offline play inside the portal): submit the best distance to the portal's board ourselves.
S.onChange((what) => {
  if (what === 'run' && !net.connected) bloxity.submitScore('best', S.state.stats.best)
})
// Bought engines / fuel tanks: hotbar -> in hand -> hold E at the cart to attach.
const hand = new Group()
playerGroup.add(hand)
const carry = createCarry({ hand, ride, hud, fx, playerPos: () => player.renderPosition })

// --- Interactive spots ------------------------------------------------------------------
const cartSpot = addSpot({
  x: 0,
  z: 0,
  y: 3,
  radius: 4.6,
  hold: 1,
  enabled: () => !carry.held, // carrying a part: the prompt attaches it instead
  title: () => 'Ride Cart',
  sub: () => 'Hold E',
  action: () => ride.mount(),
})
const sp = tracks.spots
addSpot({
  x: sp.plusCart.x,
  z: sp.plusCart.z,
  y: 2.6,
  radius: 3.4,
  hold: 0.6,
  enabled: () => state().wagons < ECONOMY.maxWagons,
  title: () => '+1 Cart',
  sub: () => (state().cash >= S.wagonPrice() ? `Buy for ${fmt(S.wagonPrice())} · +${Math.round(ECONOMY.wagonCash * 100)}% cash, +${Math.round(CART.wagonFuel * 100)}% fuel` : `Need ${fmt(S.wagonPrice())}`),
  deny: () => state().cash < S.wagonPrice(),
  action: () => {
    const r = S.buyWagon()
    if (r === 'ok') {
      sfx.purchase()
      hud.toast(`+1 Cart! Run cash x${(1 + state().wagons * ECONOMY.wagonCash).toFixed(1)}, fuel +${Math.round(state().wagons * CART.wagonFuel * 100)}%`, 'gold')
      celebrate()
    } else {
      sfx.deny()
      hud.toast(r === 'max' ? 'Carts maxed!' : 'Not enough cash!', 'bad')
    }
  },
})
addSpot({ x: sp.starter.x, z: sp.starter.z, y: 3.2, radius: 4.6, title: () => 'Starter Pack', sub: () => fmt(BUNDLES.starter.price), action: () => W.openBundle('starter') })
addSpot({ x: sp.v8.x, z: sp.v8.z, y: 3.2, radius: 4.6, title: () => 'OP V8 Engine', sub: () => fmt(BUNDLES.v8.price), action: () => W.openBundle('v8') })
addSpot({ x: sp.stall.x, z: sp.stall.z, y: 2.6, radius: 3.6, title: () => 'Cart Upgrades', sub: () => 'Distance, Currency, Multiplier', action: W.openCartUpgrades })
const cs = cave.spots
addSpot({ x: cs.upgrades.x, z: cs.upgrades.z, y: 3, radius: 4.2, title: () => 'Shop', sub: () => `Restock in ${clock(S.restockLeft())}`, action: W.openStock })
addSpot({ x: cs.sell.x, z: cs.sell.z, y: 2.4, radius: 2.8, title: () => 'Sell Gear', sub: () => 'Spare gear for cash', action: W.openSell })
addSpot({ x: cs.index.x, z: cs.index.z, y: 2.4, radius: 2.8, title: () => 'Index', sub: () => `${GEAR.filter((g) => S.isDiscovered(g.id)).length}/${GEAR.length} found`, action: W.openIndex })
addSpot({
  x: cs.gift.x,
  z: cs.gift.z,
  y: 2.4,
  radius: 2.8,
  title: () => 'Daily Gift',
  sub: () => (S.giftLeft() > 0 ? `Back in ${clock(S.giftLeft())}` : `Claim ${fmt(ECONOMY.dailyGift)}`),
  deny: () => S.giftLeft() > 0,
  action: () => {
    const got = S.claimGift()
    if (got) {
      sfx.gift('trophy')
      hud.toast(`+${fmt(got)} Daily Gift!`, 'gold')
      celebrate()
    } else {
      sfx.deny()
      hud.toast(`Come back in ${clock(S.giftLeft())}`, 'bad')
    }
  },
})
let spinning = null
addSpot({
  x: cs.wheel.x,
  z: cs.wheel.z,
  y: 2.4,
  radius: 4,
  hold: 0.5,
  title: () => 'Lucky Wheel',
  sub: () => (spinning ? 'Spinning...' : S.spinLeft() > 0 ? `Spin in ${clock(S.spinLeft())}` : 'Hold E to spin!'),
  deny: () => S.spinLeft() > 0 && !spinning,
  action: () => {
    if (spinning) return
    const i = S.takeSpin()
    if (i < 0) {
      sfx.deny()
      return
    }
    const n = WHEEL.prizes.length
    const step = (Math.PI * 2) / n
    const disk = cave.wheelDisk
    const from = disk.rotation.z
    const base = from - (from % (Math.PI * 2))
    const to = base + Math.PI * 2 * WHEEL.turns + i * step + (Math.random() - 0.5) * step * 0.6
    spinning = { from, to, t: 0, i, lastPeg: Math.floor(from / step) }
  },
})
function updateWheel(dt) {
  if (!spinning) return
  spinning.t += dt / WHEEL.spinTime
  const k = Math.min(1, spinning.t)
  const e = 1 - Math.pow(1 - k, 4)
  const rot = spinning.from + (spinning.to - spinning.from) * e
  cave.wheelDisk.rotation.z = rot
  const step = (Math.PI * 2) / WHEEL.prizes.length
  const peg = Math.floor((rot + step / 2) / step)
  if (peg !== spinning.lastPeg) {
    spinning.lastPeg = peg
    sfx.wheelTick()
  }
  if (k >= 1) {
    const text = S.awardPrize(spinning.i)
    const big = WHEEL.prizes[spinning.i].weight <= 8
    sfx.prize(big)
    hud.toast(`Lucky Wheel: ${text}`, 'gold')
    celebrate(big)
    spinning = null
  }
}

const state = () => S.state

// --- State -> HUD and signs -------------------------------------------------------------
function refreshOwner() {
  tracks.setOwner(bloxity.displayName() === 'Offline' ? 'Your Base' : bloxity.displayName(), S.state.stats.rides)
}
function refreshBoards() {
  const runs = S.state.topRuns.map((r) => [`${r.d.toLocaleString('en-US')}m`, fmt(r.cash)])
  while (runs.length < 8) runs.push(['---', ''])
  const st = S.state.stats
  const rec = [
    ['Best distance', `${st.best.toLocaleString('en-US')}m`],
    ['Rides', st.rides.toLocaleString('en-US')],
    ['Canyon jumps', st.jumps.toLocaleString('en-US')],
    ['Total earned', fmt(S.state.totalEarned)],
    ['Carts', `${S.cartCount()} (${S.state.goldenCarts} golden)`],
    ['Rebirths', String(S.state.rebirths)],
    ['Gear found', `${GEAR.filter((g) => S.isDiscovered(g.id)).length}/${GEAR.length}`],
    ['Cash multiplier', `x${S.cashMultiplier(events.cash()).toFixed(1)}`],
  ]
  cave.setBoards(runs, rec)
}
function refreshAll() {
  const mult = S.cashMultiplier(events.cash())
  hud.setCash(S.state.cash, mult > 1.01 ? `x${mult.toFixed(1)}` : '')
  tracks.setCartBar(S.state.cash, S.wagonPrice(), S.state.wagons >= ECONOMY.maxWagons)
  refreshOwner()
  hud.setBadges(questNews, S.canRebirth())
  const starterOwned = BUNDLES.starter.gear.every((id) => S.state.owned[id] > 0)
  hud.setOffer(thumb(BUNDLES.starter.gear[0]), fmt(BUNDLES.starter.price), !starterOwned)
}
S.onChange((what) => {
  refreshAll()
  if (what === 'run' || what === 'gear' || what === 'rebirth' || what === 'wagons' || what === 'reset') refreshBoards()
})
tracks.redrawOnFont(() => {
  refreshAll()
  refreshBoards()
})
refreshAll()
refreshBoards()

// Keep the HUD out of the platform's toolbar and chat corner.
const hudLeft = hud.root.querySelector('.hud-left')
const hudTop = hud.root.querySelector('.hud-top')
let reserved = []
function layoutHud() {
  let chatBottom = 0
  let toolbarBottom = 0
  let toolbarRight = 0
  for (const a of reserved) {
    if (a.id === 'chat') chatBottom = Math.max(chatBottom, a.top + a.height)
    else {
      toolbarBottom = Math.max(toolbarBottom, a.top + a.height)
      toolbarRight = Math.max(toolbarRight, a.left + a.width)
    }
  }
  const topW = hudTop.offsetWidth
  const push = toolbarRight > (window.innerWidth - topW) / 2 - 8 ? toolbarBottom : 0
  hudTop.style.marginTop = push ? `${push}px` : ''
  hud.root.style.setProperty('--top-push', `${push}px`)
  const h = hudLeft.offsetHeight
  const centred = (window.innerHeight - h) / 2
  hudLeft.style.top = `${Math.max(centred, Math.min(chatBottom + 8, window.innerHeight - h - 90))}px`
  hudLeft.style.transform = 'none'
}
bloxity.onReservedAreas((areas) => {
  reserved = areas
  layoutHud()
})
window.addEventListener('resize', layoutHud)
setTimeout(layoutHud, 300)

// --- Keys ------------------------------------------------------------------------------------
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
const respawnHome = () => {
  if (ride.riding) return
  playerApi.teleport(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN_FACING)
}
onKey('KeyR', respawnHome)
onKey('KeyE', () => ride.interactKey())
onKey('Digit1', () => (W.isWindowOpen() ? W.closeWindow() : W.openBackpack()))
onKey('KeyB', () => (W.isWindowOpen() ? W.closeWindow() : W.openBackpack()))
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn: respawnHome })
bloxity.onRespawnRequest(respawnHome)

// --- Loop -------------------------------------------------------------------------------------
const clockT = new Clock()
let paused = false
let shownLoading = true
let readySince = 0
let slowTick = 0
let lastPeriod = S.restockPeriod()
let questRoll = false
const camPos = new Vector3()
let welcome = false

// One frame. forceDt (dev: __game.frame) steps it by a fixed time, e.g. while the tab is hidden.
// draw = false (the browser tests' fast mode) steps everything but skips the GPU render.
function frame(forceDt, draw = true) {
  if (paused && forceDt === undefined) return // an ad break is playing
  const dt = forceDt ?? Math.min(clockT.getDelta(), 0.1)
  const t = clockT.elapsedTime
  events.update(dt)
  const ts = ride.timeScale
  const gdt = dt * ts

  stepPhysics(gdt)
  interpolatePlayer()
  cartSpot.x = ride.cartSpot().x + 2.2
  cartSpot.z = ride.cartSpot().z
  ride.update(gdt, physics.alpha ?? physicsAlpha)
  carry.update(dt)

  const p = player.renderPosition
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  animator?.update(gdt, {
    grounded: ride.riding ? true : player.grounded,
    speed: ride.riding ? 0 : Math.hypot(player.velocity.x, player.velocity.z),
    verticalVelocity: ride.riding ? 0 : player.velocity.y,
    turn: 0,
    carry: !!carry.held && !ride.riding,
  })
  emote.update(gdt, ride.riding ? 0 : Math.hypot(player.velocity.x, player.velocity.z), ride.riding ? true : player.grounded)

  updateCamera(camera, dt)
  world.update(dt, events.storm(), events.wind())
  zones.update(dt)
  camera.getWorldPosition(camPos)
  // The other players of the room, and what we tell them.
  remotes.update(dt, t, camPos, p, remoteVecs, camera)
  presence.update(dt)
  route.update(dt, t, camPos.z, ride.cartS, ride.riding, lighting.nightLevel())
  tracks.update(dt, t)
  cave.update(dt, t)
  updateWheel(dt)

  // Indoors: the hub cave, or a Glow Mine bore (riding through or walking in).
  const indoor = Math.max(cave.depth(p), ride.tunnel * 0.85, zones.indoorAt(p))
  lighting.setMods(events.storm(), events.gold(), indoor)
  lighting.update(dt, playerGroup.position)
  if (events.lightning(dt)) {
    const near = Math.random() < 0.3
    camera.getWorldPosition(camPos)
    fx.lightning({ x: camPos.x + (Math.random() - 0.5) * (near ? 80 : 300), y: 0, z: camPos.z - 60 - Math.random() * (near ? 60 : 400) })
    if (indoor < 0.7) lighting.flash(near ? 1 : 0.6)
    setTimeout(() => sfx.thunder(near ? 0.15 : 0.7), near ? 120 : 900)
  }
  // Gold rush: sparkles drifting around.
  if (events.gold() > 0.3 && indoor < 0.5 && Math.random() < 0.6) fx.glint({ x: p.x + (Math.random() - 0.5) * 20, y: p.y + 1 + Math.random() * 6, z: p.z + (Math.random() - 0.5) * 20 }, 1, '#ffd23a', 0.5)
  const speed = ride.speed
  const lines = ride.riding ? Math.max(0, (speed - 26) / 30) + (ride.audioState().boosting ? 0.6 : 0) : events.wind() * 0.35 * (1 - indoor)
  fx.update(gdt, camera, { rain: events.storm() * (1 - indoor), speed: Math.min(1, lines), forward: -1 })
  // Radial speed blur (bloom presets only: it rides the same composer).
  postfx.setBlur(ride.riding ? Math.min(1, Math.max(0, (speed - 30) / 70) + (ride.audioState().boosting ? 0.45 : 0)) : 0, dt)

  updateInteract(dt, p, camera, ride.riding || W.isWindowOpen())
  updateAudio(dt, { cart: ride.audioState(), remote: remotes.audioState(), cave: indoor, rain: events.storm(), water: zones.waterAt(p), t, windowOpen: W.isWindowOpen() })

  // Timers on signs and HUD, a few times a second.
  slowTick -= dt
  if (slowTick <= 0) {
    slowTick = 0.25
    const line = events.line()
    hud.setEvent(line.html, line.active)
    const spinLeft = S.spinLeft()
    hud.setWheel(spinLeft <= 0, spinLeft <= 0 ? 'SPIN!' : clock(spinLeft))
    cave.setWheel(spinLeft <= 0, spinLeft)
    cave.setRestock(S.restockLeft())
    // A quest period ended: the server rolls the new one (the client already shows its own pick).
    if (S.questEndsIn('daily') <= 0 || S.questEndsIn('weekly') <= 0) {
      if (!questRoll) refreshQuestSchedule()
      questRoll = true
    } else questRoll = false
    // The rewarded-ad button: only inside Bloxity, only while there is no ad boost running.
    hud.setAdOffer(adsReady() && S.cashBoostLeft() <= 0 && !ride.riding ? ADS.boost.hint : '')
    cave.setGift(S.giftLeft() <= 0, S.giftLeft(), ECONOMY.dailyGift)
    const mult = S.cashMultiplier(events.cash())
    hud.setCash(S.state.cash, mult > 1.01 ? `x${mult.toFixed(1)}` : '')
    if (S.restockPeriod() !== lastPeriod) {
      lastPeriod = S.restockPeriod()
      sfx.restockBell()
      hud.toast('The Shop restocked!', 'gold')
    }
  }

  if (draw) postfx.render()

  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
  if (!welcome && t > 1.2) {
    welcome = true
    if (S.state.stats.rides === 0) {
      hud.banner('Welcome to the Cart Cave!', 'Head outside, hold E on your cart and ride!')
    }
  }
}
renderer.setAnimationLoop(() => frame())

window.addEventListener('beforeunload', bloxity.teardown)

if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  const look = (dx, dy, zoom = 0) => {
    inputState.look.dx += dx
    inputState.look.dy += dy
    inputState.zoom += zoom
  }
  window.__game = { look, player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, teleport, ride, carry, state: S.state, S, W, events, fx, cave, tracks, zones, BASES, frame, remotes, emote }
  // In-browser player tests (src/devtests): open http://localhost:<port>/?tests (add =run to start at once).
  // The loop is handed over so the tests can step frames by hand and put it back afterwards.
  import('./devtests/index.js').then((m) => m.installTests({ game: window.__game, loop: () => frame(), params: new URLSearchParams(location.search) }))
}
