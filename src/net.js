// Colyseus link to ../Build-a-cart-backend (room "world"), after Bowling Roll's net.js.
// Signed-in players' progress lives on the server: on join it answers `progress` (the saved doc
// -> state.hydrate), `noProgress` (new account, guest or no database: keep the current state and
// save it) or `serverError` (the save could not be read: never overwrite it). From then on
// state.snapshot() goes up as `saveProgress` whenever it changed, at most every NET.saveEvery s,
// and when the tab hides or closes.
// Guests (not signed in to Bloxity), and everyone when no server is reachable, keep their progress
// in this browser (localStorage, NET.localSave), loaded at start.
// The server owns the quest schedule: `quests` { daily, weekly: { period, ids, endsAt }, serverTime }
// (state.setSchedule); rerollQuests asks it to re-roll a tab (REFRESH QUESTS).
// Every message's serverTime keeps clock.js on the server's clock (restocks, quest periods).
// Never throws and never blocks play: without a server the game runs on the browser save.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET, SERVER_URL } from './config.js'
import { hydrate, onChange, setSaver, setSchedule, snapshot } from './state.js'
import { setServerTime } from './clock.js'
import { authState, canResolveServer, getEquippedAvatar, getOutfitKey, getPfp, getProportions, getToken, launchRoomId, locateRoom, onAvatarChanged, onProportionsChanged, partyFailed, partyJoined, partyLaunch, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'
import { lookToJson } from './avatar/look.js'

// The room: `players` is the synced roster (Map sessionId -> PlayerState, see the backend's
// WorldState), `sessionId` is ours in it. remote.js draws everyone else from it.
export const net = {
  room: null,
  connected: false,
  hydrated: false,
  get sessionId() {
    return this.room?.sessionId ?? null
  },
  get players() {
    return this.room?.state?.players ?? null
  },
}

// --- Identity ---------------------------------------------------------------------
// Signed-in players use their Bloxity id; everyone else a per-browser guest id (never saved on
// the server). Dev mode (no SDK) plays as a per-browser dev id so a local server with Mongo keeps
// its progress.
function storedId(key, make) {
  try {
    let id = localStorage.getItem(key)
    if (!id) localStorage.setItem(key, (id = make()))
    return id
  } catch {
    return make()
  }
}
const rand = () => Math.random().toString(36).slice(2, 8)
const GUEST = storedId('build-a-cart.guest', () => `guest-${rand()}`)
// Dev mode: `?dev=<name>` plays as dev-<name> (two tabs of one browser need two ids to meet in a room).
const devParam = DEV_MODE ? new URLSearchParams(location.search).get('dev') : ''
const DEV = DEV_MODE ? (devParam ? `dev-${devParam.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20)}` : storedId('build-a-cart.dev', () => `dev-${rand()}`)) : ''

function identity() {
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}` }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (!id) return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest' }
  return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player') }
}
const isGuestId = (id) => id.startsWith('guest-')

// What this client tells the server about itself, in the join options and `identify`: the Bloxity game
// token (the server verifies it and uses only the id Bloxity returns), the dev id (local dev only), the
// look (ids + outfit key, never URLs) and the display name.
function lookFields() {
  const signed = !!authState.user
  return {
    avatar: signed ? lookToJson(getEquippedAvatar(), getProportions()) : '',
    outfit: signed ? getOutfitKey() : '',
  }
}
function who() {
  const id = identity()
  return { ...id, token: getToken(), ...(DEV && { devId: DEV }), pfp: getPfp(), ...lookFields() }
}

// --- Browser save (guests, or no server) -------------------------------------------
export const hasServer = () => !!(SERVER_URL || canResolveServer())
// The server only saves players it could verify (a Bloxity token, or the dev id locally): when it
// reports us as a guest the progress stays in this browser, whatever id we sent.
const serverSaves = () => net.room?.state?.players?.get?.(net.room?.sessionId)?.signedIn !== false
const keepsLocal = () => !net.connected || isGuestId(sentId || identity().userId) || !serverSaves()
function localLoad() {
  try {
    const raw = localStorage.getItem(NET.localSave)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
let lastLocal = ''
function localSave() {
  try {
    const snap = JSON.stringify(snapshot())
    if (snap === lastLocal) return
    lastLocal = snap
    localStorage.setItem(NET.localSave, snap)
  } catch {
    // Private mode / storage full: this session's progress lasts the page.
  }
}

// --- Saving -----------------------------------------------------------------------
let lastSaved = ''
let sentId = ''
let loadedId = ''
let dirty = false

function send(type, payload) {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}
function serverSave() {
  if (!net.connected || !net.hydrated || isGuestId(sentId) || !serverSaves()) return
  const snap = JSON.stringify(snapshot())
  if (snap === lastSaved) return
  lastSaved = snap
  send('saveProgress', JSON.parse(snap))
}
// Saves where the current identity's progress lives. A signed-in player who is not connected
// (yet) also keeps a browser copy, so a reload before the server answers loses nothing.
// Dev mode keeps a browser copy as well: a local backend usually has no MongoDB.
// The browser tests (src/devtests) play with a throw-away save: while paused nothing is written
// to this browser or the server, so the real progress is never overwritten.
let savePaused = false
export const setSavePaused = (on) => (savePaused = on)
export function saveNow() {
  if (savePaused) return
  dirty = false
  if (keepsLocal() || DEV) localSave()
  if (!keepsLocal()) serverSave()
}

// --- Requests ---------------------------------------------------------------------------
// One request of each kind in flight; resolves with the server's answer, or { ok: false, reason }
// ('offline' | 'busy' | 'timeout') without one.
const waiting = {}
function request(type, payload, answer) {
  return new Promise((resolve) => {
    if (!net.connected || !net.hydrated) return resolve({ ok: false, reason: 'offline' })
    if (waiting[answer]) return resolve({ ok: false, reason: 'busy' })
    const timer = setTimeout(() => {
      delete waiting[answer]
      resolve({ ok: false, reason: 'timeout' })
    }, NET.requestTimeout * 1000)
    waiting[answer] = (msg) => {
      clearTimeout(timer)
      delete waiting[answer]
      resolve(msg)
    }
    send(type, payload)
  })
}
// REFRESH QUESTS: { ok, kind, daily, weekly, serverTime } | { ok: false, reason }.
export const rerollQuests = (kind, keep) => request('rerollQuests', { kind, keep }, 'questsResult')
// A quest countdown reached zero: the server rolls the new period and answers `quests`.
export const refreshQuestSchedule = () => net.connected && net.hydrated && send('questsRefresh', {})

// A rewarded ad finished: the server checks its token with Bloxity. Resolves true only when it says
// so; with no server to ask (guest on an offline session) the client's own 'completed' is all there is.
export async function verifyAdReward(rewardToken) {
  if (!net.connected) return true
  if (!rewardToken) return true // no token (not inside Bloxity): nothing to verify
  const r = await request('adReward', { rewardToken }, 'adReward')
  return r.ok === true || r.reason === 'offline' || r.reason === 'timeout' // only a refusal withholds it
}

// --- Presence (what the other players draw: remote.js) --------------------------------------------
// All of these are fire-and-forget and bounded again by the server; they never throw.
export const sendPose = (pose) => net.connected && send('pose', pose)
export const sendCart = (cart) => net.connected && send('cart', cart)
export const sendLoadout = (loadout) => net.connected && send('loadout', loadout)
export const sendEmote = (id) => net.connected && send('emote', { id })
export function sendLook() {
  if (!net.connected) return
  const { avatar, outfit } = lookFields()
  send('setAvatar', { avatar, outfit })
}

// --- Connection -------------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
  room.onMessage('progress', (doc) => {
    net.hydrated = true
    lastSaved = ''
    setServerTime(doc?.serverTime)
    // A reconnect under the same identity: this tab is newer than the save, so push it instead.
    if (loadedId === sentId || !doc) return saveNow()
    loadedId = sentId
    hydrate(doc)
    saveNow()
  })
  room.onMessage('noProgress', (msg) => {
    net.hydrated = true
    setServerTime(msg?.serverTime)
    loadedId = sentId
    lastSaved = ''
    saveNow()
  })
  room.onMessage('serverError', () => {
    net.hydrated = false
    console.warn('[net] server could not read the saved progress; saving is off for this session')
  })
  room.onMessage('quests', (view) => {
    setServerTime(view?.serverTime)
    setSchedule(view)
  })
  room.onMessage('questsResult', (r) => {
    setServerTime(r?.serverTime)
    waiting.questsResult?.(r)
  })
  room.onMessage('adReward', (r) => waiting.adReward?.(r))
  // Messages this client doesn't use yet (the backend's wheel/daily/leaderboard systems).
  for (const type of ['spins', 'daily', 'leaderboard']) room.onMessage(type, (m) => setServerTime(m?.serverTime))
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    updateRoom('')
    for (const fn of leaveListeners) fn()
    setTimeout(connect, NET.rejoin * 1000)
  })
  for (const fn of joinListeners) fn(room)
}

// remote.js / presence.js: fn(room) after every (re)join, fn() when the room closed.
const joinListeners = new Set()
const leaveListeners = new Set()
export function onJoinedRoom(fn) {
  joinListeners.add(fn)
  if (net.room) fn(net.room)
  return () => joinListeners.delete(fn)
}
export function onLeftRoom(fn) {
  leaveListeners.add(fn)
  return () => leaveListeners.delete(fn)
}

let launchRoom = launchRoomId()
async function joinLaunchRoom(options) {
  const id = launchRoom
  launchRoom = ''
  if (!id) return null
  try {
    if (SERVER_URL) return { room: await new Client(SERVER_URL).joinById(id.split('~').pop(), options), relay: '' }
    const at = await locateRoom(id)
    if (at) return { room: await new Client(at.endpoint).joinById(at.roomId, options), relay: at.relayRoomId }
  } catch (err) {
    console.info('[net] the invited room is gone or full; matchmaking instead', err?.message ?? err)
  }
  return null
}
async function joinAnyRoom(options) {
  if (SERVER_URL) return { room: await new Client(SERVER_URL).joinOrCreate('world', options), relay: '' }
  const { endpoint, relayRoomId } = await resolveServerEndpoint(/^(guest|dev)-/.test(options.userId) ? undefined : options.userId)
  return { room: await new Client(endpoint).joinOrCreate('world', options), relay: relayRoomId }
}

let connecting = false
let retryIn = NET.retry
async function connect() {
  if (!hasServer() || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    const options = { ...who(), ...(joinHook?.() ?? {}) }
    const { room, relay } = (await joinLaunchRoom(options)) ?? (await joinAnyRoom(options))
    retryIn = NET.retry
    attach(room)
    updateRoom(relay ? `${relay}~${room.roomId}` : room.roomId)
    // Friends who launched together were seated in one room by the matchmaker: report where it landed.
    if (partyLaunch()) partyJoined(room.roomId)
  } catch (err) {
    // A full room (5 seats) of a party that was meant to stay together: say so.
    if (partyLaunch() && /full|locked/i.test(String(err?.message ?? err))) partyFailed('room-full')
    console.info(`[net] could not reach the server (retrying in ${retryIn}s); playing on the browser save`, err?.message ?? err)
    setTimeout(connect, retryIn * 1000)
    retryIn = Math.min(retryIn * 2, NET.retryMax)
  } finally {
    connecting = false
  }
}

let savedAt = 0
setInterval(() => {
  if (dirty && !document.hidden && performance.now() - savedAt >= NET.saveEvery * 1000) {
    savedAt = performance.now()
    saveNow()
  }
}, 1000)

export function initNet() {
  // The browser save first: a guest plays on it; a signed-in player until the server answers.
  const local = localLoad()
  if (local) hydrate(local)
  setSaver(() => (dirty = true))
  // A Save Slot is the player's built cart: write it (and a freshly unlocked slot) to the server
  // at once instead of waiting for the debounce, so closing the tab right after never loses it.
  onChange((what) => (what === 'loadout' || what === 'slots') && saveNow())
  window.addEventListener('pagehide', saveNow)
  document.addEventListener('visibilitychange', () => document.hidden && saveNow())
  if (!hasServer()) return console.info('[net] no server configured; progress is kept in this browser')
  subscribeAuth((s) => {
    if (!s.ready && !DEV) return
    if (!net.connected) return void connect()
    const id = identity()
    if (id.userId === sentId) return send('identify', { username: id.username, pfp: getPfp(), ...lookFields() })
    // Save under the OLD identity before switching (auth has already moved on).
    if (isGuestId(sentId)) localSave()
    else serverSave()
    net.hydrated = false
    // Signed out: back to this browser's guest save (the account's progress stays on the server).
    if (isGuestId(id.userId)) hydrate(localLoad())
    sentId = id.userId
    send('identify', who())
  })
  // A new look (the portal's avatar editor) goes to the others.
  onAvatarChanged(sendLook)
  onProportionsChanged(sendLook)
}

// presence.js adds its own join options (the current pose and loadout, so the others draw the newcomer
// at once): hook() -> { pose, loadout }.
let joinHook = null
export const setJoinHook = (fn) => (joinHook = fn)
