// The Bloxity (Legion) SDK facade. Every SDK call goes through here. Nothing
// here may throw when the SDK is missing: a blocked sdk.bloxity.io leaves the
// game fully playable on the default avatar and keyboard controls.
// Docs: https://docs.bloxity.io/#html5
import * as THREE from 'three'
import { AD_SCREENS, GAME_SLUG, GAME_TITLE, LEADERBOARDS, MULTI, SETTINGS, DEV_MODE, coerceSetting } from './config.js'

export function sdk() {
  if (DEV_MODE) return null
  return (typeof window !== 'undefined' && window.Legion && window.Legion.SDK) || null
}
export const hasSdk = () => !!sdk()

// --- State --------------------------------------------------------------
export const settings = {}
for (const key of Object.keys(SETTINGS)) settings[key] = coerceSetting(key, SETTINGS[key].def)

// `user` is only written from onUserChanged (re-reading getUser()). `ready`
// flips once auth has settled so the signed-in avatar load isn't pre-empted.
export const authState = { ready: false, user: null, guest: null }

let latestEquipped = null
let latestProportions = null
const avatarListeners = new Set()
const proportionListeners = new Set()
const authListeners = new Set()
const settingListeners = new Set()
const respawnListeners = new Set()
const adBreakListeners = new Set()
const emoteListeners = new Set()
const chatListeners = new Set()
const unsubscribers = []
let adBreakActive = false

function emit(listeners, ...args) {
  for (const fn of listeners) {
    try {
      fn(...args)
    } catch (err) {
      console.warn('[bloxity] listener threw', err)
    }
  }
}

// Fires on any customizer change (may fire twice: optimistic, then confirmed;
// keep handlers idempotent). Each returns an unsubscribe.
export function onAvatarChanged(fn) {
  avatarListeners.add(fn)
  return () => avatarListeners.delete(fn)
}
export function onProportionsChanged(fn) {
  proportionListeners.add(fn)
  return () => proportionListeners.delete(fn)
}
export function subscribeAuth(fn) {
  authListeners.add(fn)
  fn(authState)
  return () => authListeners.delete(fn)
}
// fn(key, value) on every change of a SETTINGS key (already coerced).
export function onSetting(fn) {
  settingListeners.add(fn)
  return () => settingListeners.delete(fn)
}
// The portal's own pause-menu "Respawn" button.
export function onRespawnRequest(fn) {
  respawnListeners.add(fn)
  return () => respawnListeners.delete(fn)
}

// --- Auth ---------------------------------------------------------------
// The SDK fires onUserChanged immediately with a null user, then again once the
// portal handshake answers; a null user only settles auth after a grace period.
const GUEST_SETTLE_MS = 2500
let settleTimer = null

function settleAuth() {
  settleTimer = null
  if (authState.ready) return
  authState.ready = true
  emit(authListeners, authState)
}

function onUser() {
  const SDK = sdk()
  const user = SDK ? SDK.auth.getUser() : null
  latestEquipped = null // a different account's equip event must not linger
  latestProportions = null

  if (user || authState.ready) {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = null
    authState.ready = true
  } else if (!settleTimer) {
    settleTimer = setTimeout(settleAuth, GUEST_SETTLE_MS)
  }
  authState.user = user
  try {
    authState.guest = user || typeof SDK.auth.getGuest !== 'function' ? null : SDK.auth.getGuest()
  } catch {
    authState.guest = null
  }
  emit(authListeners, authState)
}

// Name for the HUD badge.
export function displayName() {
  const u = authState.user
  if (u) return u.displayName || u.username || u.name || 'Player'
  const g = authState.guest
  if (g) return g.displayName || g.username || g.name || 'Guest'
  return sdk() ? 'Guest' : 'Offline'
}

// The player's Bloxity profile picture (user, else the guest's derived one) as an absolute
// http(s) URL, '' when there is none. Relative paths resolve against the CDN (staticUrl).
export function getPfp() {
  const raw = authState.user?.pfp || authState.guest?.pfp
  if (typeof raw !== 'string' || !raw) return ''
  try {
    let base = 'https://static.bloxity.io'
    try {
      base = sdk()?.environment?.()?.staticUrl || base
    } catch {
      // Older SDK builds have no environment().
    }
    const url = new URL(raw, base)
    return /^https?:$/.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

// --- Invites ---------------------------------------------------------------
// The Quests window's INVITE: shares the portal's invite link for this game (the page's own
// address without the SDK), with the system share sheet or else the clipboard. Resolves
// 'shared' | 'copied' | '' (cancelled / blocked). Never throws.
export async function shareInvite() {
  let url = ''
  try {
    url = sdk()?.social?.getInviteFriendsLink?.({ gameSlug: GAME_SLUG }) || ''
  } catch {
    url = ''
  }
  if (!url) url = location.href.split('?')[0]
  try {
    if (navigator.share) {
      await navigator.share({ title: GAME_TITLE, text: `Come build a cart with me in ${GAME_TITLE}!`, url })
      return 'shared'
    }
  } catch {
    return ''
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return ''
  }
}

// --- Init ---------------------------------------------------------------
let initialised = false

export function init() {
  if (initialised) return
  initialised = true

  const SDK = sdk()
  if (!SDK) {
    if (DEV_MODE) console.info('[bloxity] VITE_DEV_MODE=true: skipping SDK/CDN, running on the default avatar')
    else console.info('[bloxity] SDK not loaded: running offline on the default avatar')
    authState.ready = true
    emit(authListeners, authState)
    return
  }

  try {
    const onLocalhost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    SDK.init(onLocalhost ? { gameSlug: GAME_SLUG, portalUrl: 'https://bloxity.io' } : { gameSlug: GAME_SLUG })
    SDK.game.loadingStep(`Loading ${GAME_TITLE}`)

    for (const key of Object.keys(SETTINGS)) {
      const off = SDK.settings.listen(key, (raw) => {
        const next = coerceSetting(key, raw)
        if (settings[key] === next) return
        settings[key] = next
        emit(settingListeners, key, next)
      })
      if (typeof off === 'function') unsubscribers.push(off)
    }
    SDK.settings.triggerAll?.()

    unsubscribers.push(SDK.auth.onUserChanged(onUser))

    if (typeof SDK.avatar?.onAvatarChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onAvatarChanged((equipped) => {
          // The event payload wins over getEquipped(), which can lag the event.
          if (equipped && typeof equipped === 'object') latestEquipped = equipped
          emit(avatarListeners)
        }),
      )
    }
    if (typeof SDK.avatar?.onProportionsChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onProportionsChanged((proportions) => {
          if (proportions && typeof proportions === 'object') latestProportions = proportions
          emit(proportionListeners)
        }),
      )
    }

    unsubscribers.push(
      SDK.player.onEvent((event, data) => {
        if (event === 'respawn_request') emit(respawnListeners)
        else if (event === 'play_emote' && typeof data === 'string') emit(emoteListeners, data)
        else if (event === 'stop_emote') emit(emoteListeners, '')
      }),
    )

    initAds(SDK)
    initLeaderboards(SDK)
    // Party play: friends who launch together are seated in one room (hosted matchmaker, automatic
    // with maxClients set); a room seats MULTI.maxPlayers.
    try {
      SDK.party?.enable?.({ maxPartySize: MULTI.maxPlayers })
    } catch (err) {
      console.warn('[bloxity] party.enable failed', err)
    }
    // The portal draws the emote picker only for games that register this (after init resolved).
    registerFeature('emotes')
    // Overhead chat bubbles: the portal draws the chat UI, the game floats the text over the head.
    try {
      const off = SDK.chat?.onMessage?.((m) => {
        let text = ''
        try {
          text = SDK.chat.bubbleText ? SDK.chat.bubbleText(m) : m?.text || ''
        } catch {
          text = ''
        }
        if (text) emit(chatListeners, { userId: m?.userId ?? '', username: m?.username ?? '', text, isLocal: !!m?.isLocalPlayer })
      })
      if (typeof off === 'function') unsubscribers.push(off)
    } catch (err) {
      console.warn('[bloxity] chat.onMessage failed', err)
    }

    SDK.game.loadingStep('Building the island')
  } catch (err) {
    console.warn('[bloxity] init failed; running without the SDK', err)
    authState.ready = true
    emit(authListeners, authState)
  }
}

export function loadingStep(text) {
  try {
    sdk()?.game.loadingStep(text)
  } catch {
    // Non-fatal.
  }
}

let announcedFirstFrame = false

// Call once the scene has rendered: tells the portal loading is done.
export function notifyFirstFrame() {
  if (announcedFirstFrame) return
  announcedFirstFrame = true
  const SDK = sdk()
  if (!SDK) return
  try {
    SDK.game.loadingEnd()
    SDK.game.gameplayStart()
  } catch {
    // Non-fatal.
  }
}

export function teardown() {
  for (const off of unsubscribers.splice(0)) {
    try {
      off()
    } catch {
      // Tearing down anyway.
    }
  }
  try {
    sdk()?.game.gameplayEnd()
  } catch {
    // Non-fatal.
  }
}

// --- Avatar accessors (null when the SDK is unavailable or the call throws) ---
export function getEquippedAvatar() {
  if (latestEquipped) return latestEquipped
  try {
    return sdk()?.avatar.getEquipped() ?? null
  } catch {
    return null
  }
}

// { height, shoulderWidth, armLength, legOffsetX, torsoScaleX, neckHeight,
// headScale }, normalised around 1.0; loader.js applyProportions() consumes it.
export function getProportions() {
  try {
    const current = sdk()?.avatar.getProportions()
    return latestProportions ? { ...current, ...latestProportions } : current ?? null
  } catch {
    return latestProportions
  }
}

// Skin texture URL with the worn face, shirt and pants already drawn on.
export function getSkinTextureUrl() {
  try {
    const url = sdk()?.avatar?.getSkinTextureUrl?.()
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

export const canCustomize = () => typeof sdk()?.avatar?.toggleCustomizer === 'function'

// Opens / closes the portal's avatar editor; edits come back through onAvatarChanged.
export function toggleCustomizer() {
  try {
    sdk()?.avatar.toggleCustomizer()
  } catch {
    // Ignore.
  }
}

// --- Game server ------------------------------------------------------
// Bloxity hosting has no fixed socket URL: the matchmaker picks a pod with room (or wakes one) and
// the SDK returns its endpoint (the dev channel reaches the dev backend, prod the prod one). Each
// endpoint is pinned to one pod, so net.js builds a new Client per resolve.
export function canResolveServer() {
  try {
    return typeof sdk()?.net?.resolveEndpoint === 'function'
  } catch {
    return false
  }
}
// { endpoint, relayRoomId }: relayRoomId is the matchmaker relay pinning the pod (the endpoint is
// {playUrl}/v1/ws/<relayRoomId>). Rejects (net.js retries with backoff) when the matchmaker can't answer.
export async function resolveServerEndpoint(userId) {
  const { endpoint, roomId, cold } = await sdk().net.resolveEndpoint(GAME_SLUG, userId ? { userId } : undefined)
  if (cold) console.info('[net] waking up a server...')
  return { endpoint, relayRoomId: roomId }
}

// The ?roomId= the page was opened with: the game page's Open Rooms Join button (a bare Colyseus
// room id) or a friend invite (what updateRoom() reported: "<relayRoomId>~<colyseusRoomId>").
export function launchRoomId() {
  try {
    return new URLSearchParams(location.search).get('roomId') || ''
  } catch {
    return ''
  }
}

// Where a launch room lives: { endpoint, roomId, relayRoomId }, or null when it is gone, full or
// can't be found. A bare id needs the matchmaker's cross-pod directory (a plain joinById through
// any relay would usually land on another pod); a relay~room id is joined through its relay.
export async function locateRoom(id) {
  const playUrl = (() => {
    try {
      return sdk()?.environment?.()?.playUrl
    } catch {
      return '' // Older SDK builds have no environment().
    }
  })()
  if (!playUrl || !id) return null
  const base = playUrl.replace(/\/$/, '')
  const [relay, roomId] = id.includes('~') ? id.split('~', 2) : ['', id]
  if (relay) return { endpoint: `${base.replace(/^http/i, 'ws')}/v1/ws/${encodeURIComponent(relay)}`, roomId, relayRoomId: relay }
  const res = await fetch(`${base}/v1/dir/${encodeURIComponent(GAME_SLUG)}/list`)
  const rooms = res.ok ? (await res.json())?.rooms ?? [] : []
  const r = rooms.find((r) => r.colyseusRoomId === roomId && !r.locked && r.players < r.maxPlayers)
  return r ? { endpoint: r.joinUrl, roomId: r.colyseusRoomId, relayRoomId: r.relayRoomId } : null
}

// Reports the room this player is in ('' = not in a joinable room), so the portal's friend invites
// land in it.
export function updateRoom(roomId) {
  try {
    sdk()?.game?.updateRoom?.(roomId)
  } catch {
    // Ignore.
  }
}

// --- Portal -----------------------------------------------------------
export function showMenu() {
  try {
    sdk()?.portal.showMenu(true)
  } catch {
    // Ignore.
  }
}

// Where Boxity draws its own controls over the game: the toolbar in the top-left corner and
// the chat feed under it, as [{ id, left, top, width, height }] in CSS px. fn runs now and on
// every change (resize, toolbar change). Without the SDK (dev mode, blocked CDN) it gets the
// default footprint the SDK itself assumes until the portal reports, so the HUD is laid out
// the same everywhere. Returns an unsubscribe.
export function onReservedAreas(fn) {
  try {
    const off = sdk()?.ui?.onReservedAreasChange?.((areas) => fn(Array.isArray(areas) ? areas : []))
    if (typeof off === 'function') return off
  } catch {
    // Fall back to the estimate below.
  }
  const update = () => fn(estimatedReservedAreas(window.innerWidth, window.innerHeight))
  window.addEventListener('resize', update)
  update()
  return () => window.removeEventListener('resize', update)
}

// The SDK's estimate (legion-sdk ui.estimatedAreas): an 8 px margin round one row of buttons,
// the whole width on narrow phones, and the chat feed under it.
function estimatedReservedAreas(w, h) {
  const compact = w < 640 || h <= 500
  const toolbarHeight = 16 + (w < 640 ? 32 : w < 768 ? 40 : 44)
  const chatWidth = compact ? Math.min(w * 0.7, 260) : Math.min(w * 0.8, 360)
  return [
    { id: 'toolbar', left: 0, top: 0, width: Math.min(w, w < 480 ? w : 330), height: toolbarHeight },
    { id: 'chat', left: 0, top: toolbarHeight, width: Math.round(chatWidth + 8), height: compact ? 140 : 180 },
  ]
}

export function requestFullscreen(on) {
  try {
    const SDK = sdk()
    if (!SDK) return
    if (on) SDK.portal.requestFullscreen()
    else SDK.portal.exitFullscreen()
  } catch {
    // Ignore.
  }
}

// --- Ads ----------------------------------------------------------------------------------
// Ad breaks (required): the portal can start one at any time; main.js freezes the simulation and mutes
// the audio while isAdBreak(). Screen ads (required): declared once, then screen(type) as the player
// moves between menus / the run results / the ride. Rewarded ads: showRewardedAd() below.
function initAds(SDK) {
  const ads = SDK.ads
  if (!ads) return
  const setBreak = (on) => {
    adBreakActive = on
    emit(adBreakListeners, on)
  }
  for (const [method, on] of [['onBreakStart', true], ['onBreakEnd', false]]) {
    try {
      const off = ads[method]?.(() => setBreak(on))
      if (typeof off === 'function') unsubscribers.push(off)
    } catch (err) {
      console.warn(`[bloxity] ads.${method} failed`, err)
    }
  }
  try {
    ads.declareScreens?.(AD_SCREENS)
  } catch (err) {
    console.warn('[bloxity] ads.declareScreens failed', err)
  }
}

export const isAdBreak = () => adBreakActive
// fn(active): true when a break starts, false when it ends. Returns an unsubscribe.
export function onAdBreak(fn) {
  adBreakListeners.add(fn)
  return () => adBreakListeners.delete(fn)
}

let adScreenType = ''
// 'menu' | 'results' | 'gameplay' (declared, off unless the dashboard turns it on) | null = nothing showing.
export function showAdScreen(type) {
  if ((type || '') === adScreenType) return
  adScreenType = type || ''
  try {
    const ads = sdk()?.ads
    if (type) ads?.screen?.(type)
    else ads?.hideScreen?.()
  } catch {
    // Non-fatal.
  }
}

export const canShowRewardedAd = () => {
  try {
    return !!sdk()?.ads?.isAvailable?.()
  } catch {
    return false
  }
}
// Plays a rewarded ad. Resolves { status, rewardToken? }: status 'completed' is the only one that earns
// the reward; anything else ('disabled', 'dismissed', 'error', ...) does not. Never rejects.
export async function showRewardedAd(placement) {
  try {
    const ads = sdk()?.ads
    if (!ads?.showRewarded || !ads.isAvailable?.()) return { status: 'disabled' }
    const r = await ads.showRewarded(placement)
    return { status: r?.status ?? 'error', rewardToken: typeof r?.rewardToken === 'string' ? r.rewardToken : '' }
  } catch {
    return { status: 'error' }
  }
}

// --- Leaderboards --------------------------------------------------------------------------
// The server reports signed-in players' scores (hosted games); define() only declares the boards.
function initLeaderboards(SDK) {
  try {
    Promise.resolve(SDK.leaderboard?.define?.(LEADERBOARDS)).catch((err) => console.warn('[bloxity] leaderboard.define failed', err))
  } catch (err) {
    console.warn('[bloxity] leaderboard.define failed', err)
  }
}
// Client-side fallback when no game server is reachable (the server reports otherwise). Never throws.
export async function submitScore(board, score) {
  try {
    if (!(score > 0)) return null
    return (await sdk()?.leaderboard?.submit?.(board, Math.floor(score))) ?? null
  } catch {
    return null
  }
}
// The top rows of one of Bloxity's hosted boards (the ones behind the trophy button), for the hub's
// corner boards: [{ name, value }], or null when the SDK / board is unavailable. Never throws.
export async function getBoardTop(board, limit = 10) {
  try {
    const lb = sdk()?.leaderboard
    if (typeof lb?.getTop !== 'function') return null
    const res = await lb.getTop(board, { limit })
    if (!Array.isArray(res?.rows)) return null
    return res.rows.slice(0, limit).map((r) => ({ name: String(r.displayName || r.username || 'Player'), value: Number(r.score) || 0 }))
  } catch {
    return null
  }
}

// --- Death screen ----------------------------------------------------------------------------
// The portal runs the respawn countdown (>= 4 s, banner ads); the game draws the buttons and only
// restarts when handle.respawn() returns true. Without the SDK the game's own timer is the fallback.
export const hasDeathScreen = () => typeof sdk()?.deathScreen?.show === 'function'
// { onCountdown(fn) -> unsubscribe, respawn() -> boolean, ready }, or null.
export function showDeathScreen() {
  try {
    return sdk()?.deathScreen?.show?.() ?? null
  } catch {
    return null
  }
}
export function hideDeathScreen() {
  try {
    sdk()?.deathScreen?.hide?.()
  } catch {
    // Non-fatal.
  }
}

// --- Emotes ------------------------------------------------------------------------------------
// fn(emoteId) when the portal's emote picker plays one; fn('') when it asks to stop.
export function onPortalEmote(fn) {
  emoteListeners.add(fn)
  return () => emoteListeners.delete(fn)
}
export function apiUrl() {
  try {
    return (sdk()?.environment?.()?.apiUrl || 'https://api.bloxity.io').replace(/\/$/, '')
  } catch {
    return 'https://api.bloxity.io'
  }
}
let emoteCatalog = null
// The catalogue clip { len, loop, tracks: { Bone: [[t, xDeg, yDeg, zDeg], ...] } } for an emote id, or null.
export async function getEmoteClip(id) {
  try {
    if (!sdk()) return null
    if (!emoteCatalog) {
      const res = await fetch(`${apiUrl()}/v1/avatar/emotes`)
      if (!res.ok) return null
      const json = await res.json()
      const list = Array.isArray(json) ? json : json?.emotes ?? []
      emoteCatalog = new Map(list.filter((e) => e?.id && e.clip?.tracks).map((e) => [String(e.id), e.clip]))
    }
    return emoteCatalog.get(String(id)) ?? null
  } catch {
    return null
  }
}

// --- Chat --------------------------------------------------------------------------------------
// fn({ userId, username, text, isLocal }) for every room chat message. Returns an unsubscribe.
export function onChatMessage(fn) {
  chatListeners.add(fn)
  return () => chatListeners.delete(fn)
}
// A speech bubble over `root` (three.js sprite built by the SDK with the game's own THREE), or null.
export function attachChatBubble(root, text, height = 2.3) {
  try {
    return sdk()?.chat?.attachBubble?.(THREE, root, text, { height }) ?? null
  } catch {
    return null
  }
}

// --- Identity for the server -----------------------------------------------------------------------
// The player's game token: the server verifies it with Bloxity and uses only the verified id.
export function getToken() {
  try {
    const t = sdk()?.auth?.getToken?.()
    return typeof t === 'string' && t ? t : null
  } catch {
    return null
  }
}

const featuresDone = new Set()
export function registerFeature(name) {
  if (featuresDone.has(name)) return
  try {
    if (!sdk()?.game?.registerFeature) return
    sdk().game.registerFeature(name)
    featuresDone.add(name)
  } catch {
    // Non-fatal.
  }
}

// --- Party play ------------------------------------------------------------------------------------
// Hosted matchmaking seats a party in one room by itself; the game reports where it landed.
export function partyLaunch() {
  try {
    return sdk()?.party?.getLaunch?.() ?? null
  } catch {
    return null
  }
}
export function partyJoined(roomId) {
  try {
    sdk()?.party?.joined?.(roomId)
  } catch {
    // Non-fatal.
  }
}
export function partyFailed(reason) {
  try {
    sdk()?.party?.failed?.(reason)
  } catch {
    // Non-fatal.
  }
}

// Friend-join notifications: someone joined the room / was already in it (non-friends show nothing).
export function playerJoined(name) {
  try {
    sdk()?.game?.playerJoined?.(name)
  } catch {
    // Non-fatal.
  }
}
export function playerInRoom(name) {
  try {
    sdk()?.game?.playerInRoom?.(name)
  } catch {
    // Non-fatal.
  }
}

// --- Looks of other players ---------------------------------------------------------------------------
// Other players' outfits travel as the outfit key (never item URLs); the character kit draws it.
const avatarApi = () => sdk()?.avatar ?? null
export function getOutfitKey() {
  try {
    const k = avatarApi()?.getOutfitKey?.()
    return typeof k === 'string' && k ? k : ''
  } catch {
    return ''
  }
}
export function getOutfitKeyFor(equipped) {
  try {
    const k = avatarApi()?.getOutfitKeyFor?.(equipped)
    return typeof k === 'string' && k ? k : ''
  } catch {
    return ''
  }
}
export function characterKit() {
  try {
    const kit = sdk()?.character
    return kit && typeof kit.dress === 'function' && typeof kit.canDress === 'function' ? kit : null
  } catch {
    return null
  }
}
export function getSkinTextureUrlFor(equipped) {
  try {
    const url = avatarApi()?.getSkinTextureUrlFor?.(equipped)
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}
