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
import { hydrate, setSaver, setSchedule, snapshot } from './state.js'
import { setServerTime } from './clock.js'
import { authState, canResolveServer, getPfp, launchRoomId, locateRoom, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'

export const net = { room: null, connected: false, hydrated: false }

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
const DEV = DEV_MODE ? storedId('build-a-cart.dev', () => `dev-${rand()}`) : ''

function identity() {
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}` }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (!id) return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest' }
  return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player') }
}
const isGuestId = (id) => id.startsWith('guest-')

// --- Browser save (guests, or no server) -------------------------------------------
export const hasServer = () => !!(SERVER_URL || canResolveServer())
const keepsLocal = () => !net.connected || isGuestId(sentId || identity().userId)
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
  if (!net.connected || !net.hydrated || isGuestId(sentId)) return
  const snap = JSON.stringify(snapshot())
  if (snap === lastSaved) return
  lastSaved = snap
  send('saveProgress', JSON.parse(snap))
}
// Saves where the current identity's progress lives. A signed-in player who is not connected
// (yet) also keeps a browser copy, so a reload before the server answers loses nothing.
// Dev mode keeps a browser copy as well: a local backend usually has no MongoDB.
export function saveNow() {
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
  // Messages this client doesn't use yet (the backend's wheel/daily/leaderboard systems).
  for (const type of ['spins', 'daily', 'leaderboard']) room.onMessage(type, (m) => setServerTime(m?.serverTime))
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    updateRoom('')
    setTimeout(connect, NET.rejoin * 1000)
  })
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
    const { room, relay } = (await joinLaunchRoom({ ...id, pfp: getPfp() })) ?? (await joinAnyRoom({ ...id, pfp: getPfp() }))
    retryIn = NET.retry
    attach(room)
    updateRoom(relay ? `${relay}~${room.roomId}` : room.roomId)
  } catch (err) {
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
  window.addEventListener('pagehide', saveNow)
  document.addEventListener('visibilitychange', () => document.hidden && saveNow())
  if (!hasServer()) return console.info('[net] no server configured; progress is kept in this browser')
  subscribeAuth((s) => {
    if (!s.ready && !DEV) return
    if (!net.connected) return void connect()
    const id = identity()
    if (id.userId === sentId) return send('identify', { username: id.username, pfp: getPfp() })
    // Save under the OLD identity before switching (auth has already moved on).
    if (isGuestId(sentId)) localSave()
    else serverSave()
    net.hydrated = false
    // Signed out: back to this browser's guest save (the account's progress stays on the server).
    if (isGuestId(id.userId)) hydrate(localLoad())
    sentId = id.userId
    send('identify', { userId: id.userId, username: id.username, pfp: getPfp() })
  })
}
