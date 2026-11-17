// Everything the player owns and has done. One mutable `state` object; mutate it
// only through the helpers below, which notify listeners (HUD, signs, windows) and
// ask net.js to save (to the server for signed-in players, this browser for guests).
// The run cash formula, Cart Upgrades, Shop stock, rebirth, quests and save slots
// all live here; config.js holds their numbers.
import {
  BUNDLES, CARRY, DEFAULT_GEAR, DICE, ECONOMY, GEAR, INSTANT_MARKUP, PASSES, QUEST_LEVELS, QUESTS, REBIRTH, RESTOCK, SAVE_SLOTS, UPGRADE_BULK, UPGRADES, WHEEL,
} from './config.js'
import { cartStats } from './cartPhysics.js'
import { mulberry32 } from './textures.js'
import { nowMs, nowS } from './clock.js'

export const gearById = Object.fromEntries(GEAR.map((g) => [g.id, g]))
export const upgradeById = Object.fromEntries(UPGRADES.map((u) => [u.id, u]))
const KINDS = ['daily', 'weekly']

function freshQuests() {
  return { period: -1, progress: {}, done: [], rerolls: 0 }
}
function fresh() {
  const owned = {}
  for (const id of Object.values(DEFAULT_GEAR)) owned[id] = 1
  return {
    cash: ECONOMY.startCash,
    totalEarned: 0,
    owned,
    equipped: { ...DEFAULT_GEAR },
    discovered: Object.values(DEFAULT_GEAR),
    wagons: 0,
    goldenCarts: 0,
    rebirths: 0,
    passes: [],
    stats: { rides: 0, best: 0, gearBought: 0, wagonsBought: 0, spins: 0, boosts: 0, jumps: 0, totalDistance: 0, playtime: 0, upgradesBought: 0, invites: 0 },
    upgrades: { dist: 0, mult: 0, cur: 0 },
    topRuns: [],
    lastGift: 0,
    spinAt: nowS() + 60, // first free spin a minute in
    restock: { period: -1, nonce: 0, bought: {} },
    cashBoostUntil: 0,
    fuelNextRun: false,
    loadouts: Array(SAVE_SLOTS.total).fill(null),
    slotsOpen: [],
    stars: 0,
    questLevel: 1,
    dice: 0,
    quests: { daily: freshQuests(), weekly: freshQuests() },
  }
}

export const state = fresh()

// --- Save in / out (net.js) -------------------------------------------------------------
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
// A saved doc (server `progress` or the browser save) -> state. Unknown gear ids
// (an old catalogue) are dropped; missing fields keep their fresh defaults.
export function hydrate(doc) {
  const f = fresh()
  const d = isObj(doc) ? doc : {}
  const s = { ...f }
  s.cash = num(d.cash, f.cash)
  s.totalEarned = num(d.totalEarned)
  s.owned = {}
  if (isObj(d.owned)) for (const [id, n] of Object.entries(d.owned)) if (gearById[id] && num(n) > 0) s.owned[id] = Math.floor(n)
  for (const id of Object.values(DEFAULT_GEAR)) s.owned[id] = Math.max(1, s.owned[id] ?? 0)
  s.equipped = { ...DEFAULT_GEAR }
  if (isObj(d.equipped)) for (const [type, id] of Object.entries(d.equipped)) if (gearById[id]?.type === type && s.owned[id] > 0) s.equipped[type] = id
  s.discovered = [...new Set([...(Array.isArray(d.discovered) ? d.discovered.filter((id) => gearById[id]) : []), ...Object.keys(s.owned)])]
  s.wagons = Math.min(ECONOMY.maxWagons, Math.floor(num(d.wagons)))
  s.goldenCarts = Math.floor(num(d.goldenCarts))
  s.rebirths = Math.floor(num(d.rebirths))
  s.passes = Array.isArray(d.passes) ? d.passes.filter((id) => PASSES.some((p) => p.id === id)) : []
  s.stats = { ...f.stats }
  if (isObj(d.stats)) for (const k of Object.keys(f.stats)) s.stats[k] = num(d.stats[k])
  s.upgrades = { ...f.upgrades }
  if (isObj(d.upgrades)) for (const u of UPGRADES) s.upgrades[u.id] = Math.min(u.max, Math.floor(num(d.upgrades[u.id])))
  s.topRuns = Array.isArray(d.topRuns) ? d.topRuns.filter(isObj).map((r) => ({ d: num(r.d), cash: num(r.cash) })).slice(0, 8) : []
  s.lastGift = num(d.lastGift)
  s.spinAt = num(d.spinAt, f.spinAt)
  s.cashBoostUntil = num(d.cashBoostUntil)
  s.fuelNextRun = d.fuelNextRun === true
  s.restock = isObj(d.restock) ? { period: num(d.restock.period, -1), nonce: num(d.restock.nonce), bought: isObj(d.restock.bought) ? { ...d.restock.bought } : {} } : f.restock
  s.loadouts = f.loadouts.map((_, i) => {
    const l = Array.isArray(d.loadouts) ? d.loadouts[i] : null
    return isObj(l) ? { engine: l.engine, fuel: l.fuel, wheels: l.wheels, booster: l.booster } : null
  })
  s.slotsOpen = Array.isArray(d.slotsOpen) ? [...new Set(d.slotsOpen.filter((i) => Number.isInteger(i) && i >= 0 && i < SAVE_SLOTS.total))] : []
  s.stars = Math.floor(num(d.stars))
  s.questLevel = Math.max(1, Math.floor(num(d.questLevel, 1)))
  s.dice = Math.floor(num(d.dice))
  s.quests = { daily: freshQuests(), weekly: freshQuests() }
  if (isObj(d.quests))
    for (const k of KINDS) {
      const q = d.quests[k]
      if (!isObj(q)) continue
      s.quests[k] = { period: num(q.period, -1), progress: isObj(q.progress) ? { ...q.progress } : {}, done: Array.isArray(q.done) ? [...q.done] : [], rerolls: num(q.rerolls) }
    }
  for (const k of Object.keys(state)) delete state[k]
  Object.assign(state, s)
  syncQuestPeriods()
  changed('reset')
}
export const snapshot = () => JSON.parse(JSON.stringify(state))

const listeners = new Set()
export function onChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
let dirty = () => {}
export const setSaver = (fn) => (dirty = fn)
export function changed(what = 'any') {
  for (const fn of listeners) fn(what)
  dirty()
}
// Game notices for the HUD (quest finished, level reached...): fn(kind, data).
const notices = new Set()
export function onNotice(fn) {
  notices.add(fn)
  return () => notices.delete(fn)
}
const notice = (kind, data) => notices.forEach((fn) => fn(kind, data))

// --- Cash ----------------------------------------------------------------------------
// earned = counts toward Cash Earned quests (runs, jumps, gifts, the wheel).
export function addCash(n, earned = true) {
  n = Math.max(0, Math.round(n))
  state.cash += n
  state.totalEarned += n
  if (earned) track('cash', n)
  changed('cash')
  return n
}
export function spend(n) {
  if (state.cash < n) return false
  state.cash -= n
  changed('cash')
  return true
}
export const hasPass = (id) => state.passes.includes(id)

// The carts on the rails: the cart itself, extra carts and Golden Carts.
export const cartCount = () => 1 + state.wagons + state.goldenCarts
// Run-cash multiplier from carts, rebirths, passes and boosts (event passed in).
export function cashMultiplier(eventCash = 1) {
  let k = (1 + state.wagons * ECONOMY.wagonCash + state.goldenCarts * ECONOMY.goldenCash) * (1 + state.rebirths * REBIRTH.cashStep) * eventCash
  if (hasPass('cash2')) k *= 2
  if (state.cashBoostUntil > nowS()) k *= 2
  return k
}

// --- Cart Upgrades -----------------------------------------------------------------------
export const upgradeLevel = (id) => state.upgrades[id] ?? 0
export const upgradeValue = (id, level = upgradeLevel(id)) => upgradeById[id].value(level)
export const upgradeMaxed = (id) => upgradeLevel(id) >= upgradeById[id].max
// Price of the next n levels (fewer when the max is closer).
export function upgradePrice(id, n = 1) {
  const u = upgradeById[id]
  let p = 0
  for (let l = upgradeLevel(id); l < Math.min(u.max, upgradeLevel(id) + n); l++) p += u.price(l)
  return p
}
export const bulkCount = (id) => Math.min(UPGRADE_BULK, upgradeById[id].max - upgradeLevel(id))
export function buyUpgrade(id, n = 1) {
  const u = upgradeById[id]
  if (!u) return 'bad'
  n = Math.min(n, u.max - upgradeLevel(id))
  if (n <= 0) return 'max'
  if (!spend(upgradePrice(id, n))) return 'cash'
  state.upgrades[id] = upgradeLevel(id) + n
  state.stats.upgradesBought += n
  track('upgrades', n)
  changed('upgrade')
  return 'ok'
}
// What a run pays for its furthest distance (m), all multipliers in.
export function runPayout(distance, eventCash = 1) {
  const steps = Math.floor(Math.max(0, distance) / upgradeValue('dist'))
  return steps * upgradeValue('cur') * upgradeValue('mult') * cashMultiplier(eventCash)
}

// --- Gear ----------------------------------------------------------------------------
export const equippedGear = () => ({
  engine: gearById[state.equipped.engine],
  fuel: gearById[state.equipped.fuel],
  wheels: gearById[state.equipped.wheels],
  booster: gearById[state.equipped.booster],
})
export function currentStats(eventSpeed = 1) {
  return cartStats(equippedGear(), state.wagons + state.goldenCarts, { fuelSaver: hasPass('fuel'), fuelBonus: state.fuelNextRun ? 1.5 : 1, speed: eventSpeed })
}
export const isDiscovered = (id) => state.discovered.includes(id)
export function giveGear(id, n = 1) {
  state.owned[id] = (state.owned[id] ?? 0) + n
  if (!isDiscovered(id)) state.discovered.push(id)
  changed('gear')
}
export function equip(id) {
  const g = gearById[id]
  if (!g || !(state.owned[id] > 0)) return false
  state.equipped[g.type] = id
  changed('equip')
  return true
}
// Owned copies not on the cart.
export const spare = (id) => (state.owned[id] ?? 0) - (state.equipped[gearById[id].type] === id ? 1 : 0)
export const sellPrice = (id) => Math.round(gearById[id].price * (hasPass('trader') ? 0.7 : ECONOMY.sellBack))
export function sellGear(id, n = 1) {
  const g = gearById[id]
  if (!g || g.starter) return 0
  n = Math.min(n, spare(id))
  if (n <= 0) return 0
  state.owned[id] -= n
  const cash = sellPrice(id) * n
  state.cash += cash
  changed('gear')
  return cash
}
export function trashGear(id) {
  const g = gearById[id]
  if (!g || g.starter || spare(id) <= 0) return false
  state.owned[id]--
  changed('gear')
  return true
}
function power(g) {
  if (g.type === 'engine') return g.accel
  if (g.type === 'fuel') return g.tank
  if (g.type === 'wheels') return -g.roll
  return g.boost * g.charges
}
export const isBetter = (g) => power(g) > power(gearById[state.equipped[g.type]])
// Gives one and puts a clear upgrade straight onto the cart.
function gain(id) {
  const first = !(state.owned[id] > 0)
  giveGear(id)
  if (first && isBetter(gearById[id])) equip(id)
}
// Bought gear: engines / fuel tanks go to the hotbar for the player to carry to the
// cart and attach (carry.js); the rest still goes straight on when it is better.
export const isCarried = (g) => CARRY.types.includes(g.type)
function bought(id) {
  if (isCarried(gearById[id])) giveGear(id)
  else gain(id)
  notice('bought', { id })
}

// --- Shop stock (cave stall) ---------------------------------------------------------
// The Shop's rows: every gear it sells, by rebirths needed then price.
export const SHOP_LIST = GEAR.filter((g) => g.shop).sort((a, b) => a.reb - b.reb || a.price - b.price)
export const restockPeriod = () => Math.floor(nowS() / RESTOCK.every)
export const restockLeft = () => RESTOCK.every - (nowS() % RESTOCK.every)
export const restockPrice = () => RESTOCK.price(state.rebirths)
export const instantPrice = (g) => {
  const p = g.price * INSTANT_MARKUP
  const step = p >= 10000 ? 500 : p >= 1000 ? 50 : 5
  return Math.ceil(p / step) * step
}
export const shopLocked = (g) => g.reb > state.rebirths
let stockCache = { key: '', stock: null }
export function stock() {
  const period = restockPeriod()
  if (state.restock.period !== period) state.restock = { period, nonce: 0, bought: {} }
  const key = `${period}:${state.restock.nonce}`
  if (stockCache.key !== key) {
    const rand = mulberry32(period * 7919 + state.restock.nonce * 104729 + 17)
    const s = {}
    for (const g of SHOP_LIST) {
      const odds = RESTOCK.odds[g.rarity]
      const r1 = rand()
      const r2 = rand()
      s[g.id] = r1 < odds.chance ? odds.count[0] + Math.floor(r2 * (odds.count[1] - odds.count[0] + 1)) : 0
    }
    for (const id of RESTOCK.always) s[id] = Math.max(s[id], 1)
    stockCache = { key, stock: s }
  }
  const left = {}
  for (const g of SHOP_LIST) left[g.id] = shopLocked(g) ? 0 : Math.max(0, stockCache.stock[g.id] - (state.restock.bought[g.id] ?? 0))
  return left
}
// instant = the pink button: skips the stock (not the rebirth lock) for instantPrice.
export function buyFromStall(id, instant = false) {
  const g = gearById[id]
  if (!g || !g.shop) return 'bad'
  if (shopLocked(g)) return 'locked'
  if (!instant && stock()[id] <= 0) return 'nostock'
  if (!spend(instant ? instantPrice(g) : g.price)) return 'cash'
  if (!instant) state.restock.bought[id] = (state.restock.bought[id] ?? 0) + 1
  state.stats.gearBought++
  track('gear', 1)
  bought(id)
  return 'ok'
}
// A fresh roll of the Shop right now (only for this player).
export function paidRestock() {
  stock()
  if (!spend(restockPrice())) return false
  state.restock.nonce++
  state.restock.bought = {}
  changed('restock')
  return true
}

export function buyBundle(key) {
  const b = BUNDLES[key]
  if (!spend(b.price)) return false
  for (const id of b.gear) bought(id)
  state.stats.gearBought++
  track('gear', 1)
  changed('gear')
  return true
}

// --- Carts (wagons), rebirth, passes -------------------------------------------------
export const wagonPrice = () => ECONOMY.wagonPrice(state.wagons)
export function buyWagon() {
  if (state.wagons >= ECONOMY.maxWagons) return 'max'
  if (!spend(wagonPrice())) return 'cash'
  state.wagons++
  state.stats.wagonsBought++
  changed('wagons')
  return 'ok'
}
export const rebirthCash = () => REBIRTH.cash(state.rebirths)
export const rebirthCarts = () => REBIRTH.carts(state.rebirths)
export const skipPrice = () => Math.round(rebirthCash() * REBIRTH.skipMarkup)
export const canRebirth = () => state.cash >= rebirthCash() && cartCount() >= rebirthCarts()
// skip = without the carts requirement, for skipPrice() Cash in hand.
export function rebirth(skip = false) {
  if (skip ? state.cash < skipPrice() : !canRebirth()) return false
  const owned = {}
  for (const id of Object.values(DEFAULT_GEAR)) owned[id] = 1
  state.cash = 0
  state.owned = owned
  state.equipped = { ...DEFAULT_GEAR }
  state.wagons = 0
  state.upgrades = { dist: 0, mult: 0, cur: 0 }
  state.fuelNextRun = false
  state.rebirths++
  state.goldenCarts++
  gain(REBIRTH.engine)
  changed('rebirth')
  return true
}
export function buyPass(id) {
  const p = PASSES.find((x) => x.id === id)
  if (!p || hasPass(id)) return false
  if (!spend(p.price)) return false
  state.passes.push(id)
  changed('pass')
  return true
}

// --- Daily gift + wheel ------------------------------------------------------------
export const giftLeft = () => Math.max(0, state.lastGift + ECONOMY.dailyEvery - nowS())
export function claimGift() {
  if (giftLeft() > 0) return 0
  state.lastGift = nowS()
  return addCash(ECONOMY.dailyGift)
}
export const spinEvery = () => (hasPass('lucky') ? WHEEL.luckyEvery : WHEEL.every)
export const spinLeft = () => Math.max(0, state.spinAt - nowS())
// Rolls a prize index and starts the next timer; -1 if not ready.
export function takeSpin() {
  if (spinLeft() > 0) return -1
  state.spinAt = nowS() + spinEvery()
  state.stats.spins++
  track('spins', 1)
  const total = WHEEL.prizes.reduce((a, p) => a + p.weight, 0)
  let r = Math.random() * total
  for (let i = 0; i < WHEEL.prizes.length; i++) {
    r -= WHEEL.prizes[i].weight
    if (r <= 0) return i
  }
  return 0
}
// Applies a prize; returns a short description.
export function awardPrize(i) {
  const p = WHEEL.prizes[i]
  if (p.kind === 'cash') {
    addCash(p.amount)
    return `+$${p.amount.toLocaleString('en-US')}`
  }
  if (p.kind === 'fuel') {
    state.fuelNextRun = true
    changed('boost')
    return '+50% fuel on your next ride'
  }
  if (p.kind === 'boost') {
    state.cashBoostUntil = Math.max(state.cashBoostUntil, nowS()) + WHEEL.boostTime
    changed('boost')
    return '2x Cash for 5 minutes'
  }
  const pool = GEAR.filter((g) => DICE.pool(g) && ['uncommon', 'rare', 'epic'].includes(g.rarity))
  const g = pool[Math.floor(Math.random() * pool.length)]
  gain(g.id)
  return `${g.name}!`
}
export const cashBoostLeft = () => Math.max(0, state.cashBoostUntil - nowS())

// Mystery Dice: one random gear from the dice pool, rarer = less likely.
const DICE_WEIGHT = { common: 30, uncommon: 24, rare: 16, epic: 9, legendary: 4, mythic: 1.5 }
export function rollDice() {
  const pool = GEAR.filter(DICE.pool)
  const total = pool.reduce((a, g) => a + DICE_WEIGHT[g.rarity], 0)
  let r = Math.random() * total
  let pick = pool[0]
  for (const g of pool) {
    r -= DICE_WEIGHT[g.rarity]
    if (r <= 0) {
      pick = g
      break
    }
  }
  gain(pick.id)
  return pick
}

// --- Runs ------------------------------------------------------------------------------
export function recordRun(distance, cash, jumped) {
  const s = state.stats
  s.rides++
  s.totalDistance += distance
  s.best = Math.max(s.best, Math.round(distance))
  state.fuelNextRun = false
  state.topRuns.push({ d: Math.round(distance), cash: Math.round(cash) })
  state.topRuns.sort((a, b) => b.d - a.d)
  state.topRuns.length = Math.min(state.topRuns.length, 8)
  track('rides', 1)
  track('distance', Math.round(distance))
  changed('run')
}
export function recordBoost() {
  state.stats.boosts++
  track('boosts', 1)
}
export function recordJump() {
  state.stats.jumps++
  track('jumps', 1)
}
export function recordInvite() {
  state.stats.invites++
  track('invites', 1)
  changed('invite')
}

// --- Quests ----------------------------------------------------------------------------
// The schedule (which quests this period) comes from the server (net.js setSchedule);
// without one the client picks its own the same way. Progress is per stat per period.
export const questById = Object.fromEntries(KINDS.flatMap((k) => QUESTS[k].pool.map((q) => [q.id, { ...q, kind: k }])))
const DAY = 86_400_000
export const questPeriod = (kind, now = nowMs()) => (kind === 'daily' ? Math.floor(now / DAY) : Math.floor((Math.floor(now / DAY) + 3) / 7))
const periodEnd = (kind, p) => (kind === 'daily' ? (p + 1) * DAY : ((p + 1) * 7 - 3) * DAY)
function localPick(kind, period, rerolls, keep = []) {
  const rand = mulberry32(period * 7919 + rerolls * 104729 + (kind === 'daily' ? 11 : 23))
  const ids = QUESTS[kind].pool.map((q) => q.id).filter((id) => !keep.includes(id))
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return [...keep, ...ids].slice(0, QUESTS.count)
}
const schedule = { daily: null, weekly: null }
let serverSchedule = false
// From the server: { daily: { period, ids, endsAt }, weekly: {...} }.
export function setSchedule(view) {
  serverSchedule = true
  for (const k of KINDS) if (view?.[k] && Array.isArray(view[k].ids)) schedule[k] = { period: view[k].period, ids: view[k].ids.filter((id) => questById[id]?.kind === k), endsAt: view[k].endsAt }
  syncQuestPeriods()
  changed('quests')
}
export const usesServerSchedule = () => serverSchedule
function currentSchedule(kind) {
  const period = questPeriod(kind)
  const s = schedule[kind]
  if (s && s.period === period) return s
  // No server answer yet (or the period just ended): pick locally.
  const q = state.quests[kind]
  const rerolls = q.period === period ? q.rerolls : 0
  return (schedule[kind] = { period, ids: localPick(kind, period, rerolls), endsAt: periodEnd(kind, period), local: true })
}
// A new period wipes the old progress.
function syncQuestPeriods() {
  for (const k of KINDS) {
    const s = currentSchedule(k)
    if (state.quests[k].period !== s.period) state.quests[k] = { ...freshQuests(), period: s.period }
  }
}
export const questEndsIn = (kind) => Math.max(0, currentSchedule(kind).endsAt - nowMs()) / 1000
// The tab's rows: [{ id, name, stat, goal, reward, value, done }].
export function questRows(kind) {
  syncQuestPeriods()
  const q = state.quests[kind]
  return currentSchedule(kind).ids.map((id) => {
    const def = questById[id]
    const done = q.done.includes(id)
    return { ...def, value: done ? def.goal : Math.min(def.goal, q.progress[def.stat] ?? 0), done }
  })
}
function finishQuest(kind, id) {
  const q = state.quests[kind]
  if (q.done.includes(id)) return
  q.done.push(id)
  const def = questById[id]
  addCash(def.reward, false)
  state.stars += QUESTS[kind].stars
  notice('quest', { name: def.name, reward: def.reward, stars: QUESTS[kind].stars })
  checkLevels()
}
// Adds n to a quest stat in both tabs and finishes what it completes.
export function track(stat, n) {
  if (!n) return
  syncQuestPeriods()
  for (const k of KINDS) {
    const q = state.quests[k]
    q.progress[stat] = (q.progress[stat] ?? 0) + n
    for (const id of currentSchedule(k).ids) {
      const def = questById[id]
      if (def.stat === stat && !q.done.includes(id) && q.progress[stat] >= def.goal) finishQuest(k, id)
    }
  }
}
export const skipQuestPrice = (id) => Math.round(questById[id].reward * QUESTS.skipMarkup)
export function skipQuest(kind, id) {
  if (state.quests[kind].done.includes(id) || !currentSchedule(kind).ids.includes(id)) return false
  if (!spend(skipQuestPrice(id))) return false
  finishQuest(kind, id)
  changed('quest')
  return true
}
export const refreshQuestPrice = (kind) => QUESTS[kind].refreshPrice(state.rebirths)
// Re-rolls the unfinished quests of a tab. reroll(kind, keep) asks the server (net.js)
// and resolves with its answer (null = no server: pick locally). Cash is refunded on failure.
export async function refreshQuests(kind, reroll) {
  syncQuestPeriods()
  const q = state.quests[kind]
  const ids = currentSchedule(kind).ids
  if (ids.every((id) => q.done.includes(id))) return 'alldone'
  const price = refreshQuestPrice(kind)
  if (!spend(price)) return 'cash'
  const keep = ids.filter((id) => q.done.includes(id))
  const answer = serverSchedule ? await reroll(kind, keep) : null
  if (serverSchedule && !answer?.ok) {
    state.cash += price
    changed('cash')
    return 'offline'
  }
  // The server answers the re-rolled tab only: { ok, kind, period, ids, endsAt }.
  if (answer?.ok) setSchedule({ [kind]: answer })
  else {
    q.rerolls++
    schedule[kind] = { period: q.period, ids: localPick(kind, q.period, q.rerolls, keep), endsAt: periodEnd(kind, q.period), local: true }
  }
  // Fresh quests may already be met by this period's progress.
  for (const id of schedule[kind].ids) {
    const def = questById[id]
    if (!q.done.includes(id) && (q.progress[def.stat] ?? 0) >= def.goal) finishQuest(kind, id)
  }
  changed('quests')
  return 'ok'
}

// Star levels: the level for a star count (1-based) and its threshold.
export function levelStars(level) {
  const L = QUEST_LEVELS.stars
  if (level <= L.length) return L[level - 1]
  return L[L.length - 1] + (level - L.length) * QUEST_LEVELS.after
}
export function levelFor(stars) {
  let l = 1
  while (levelStars(l + 1) <= stars) l++
  return l
}
export const levelReward = (level) => QUEST_LEVELS.rewards[Math.min(level, QUEST_LEVELS.rewards.length) - 1] ?? QUEST_LEVELS.rewards[QUEST_LEVELS.rewards.length - 1]
function checkLevels() {
  while (levelFor(state.stars) > state.questLevel) {
    state.questLevel++
    const r = levelReward(state.questLevel)
    if (!r) continue
    if (r.cash) addCash(r.cash, false)
    let slot = -1
    if (r.slot) {
      slot = nextQuestSlot()
      if (slot >= 0) state.slotsOpen.push(slot)
    }
    const gear = []
    for (let i = 0; i < (r.dice ?? 0); i++) gear.push(rollDice())
    notice('level', { level: state.questLevel, cash: r.cash ?? 0, slot, gear })
  }
}

// Playtime: one second at a time while the game is on screen.
setInterval(() => {
  if (typeof document !== 'undefined' && document.hidden) return
  state.stats.playtime++
  track('playtime', 1)
}, 1000)

// --- Save Slots (SAVES) ------------------------------------------------------------------
export const slotOpen = (i) => i < SAVE_SLOTS.free || state.slotsOpen.includes(i)
export const slotIsQuest = (i) => i >= SAVE_SLOTS.free && i < SAVE_SLOTS.free + SAVE_SLOTS.quest
export const slotPrice = (i) => (slotIsQuest(i) ? SAVE_SLOTS.questPrice : SAVE_SLOTS.cashPrice)
function nextQuestSlot() {
  for (let i = SAVE_SLOTS.free; i < SAVE_SLOTS.free + SAVE_SLOTS.quest; i++) if (!slotOpen(i)) return i
  return -1
}
export function unlockSlot(i) {
  if (slotOpen(i) || i < 0 || i >= SAVE_SLOTS.total) return false
  if (!spend(slotPrice(i))) return false
  state.slotsOpen.push(i)
  changed('slots')
  return true
}
export function saveLoadout(i) {
  if (!slotOpen(i)) return false
  state.loadouts[i] = { ...state.equipped }
  changed('loadout')
  return true
}
export function loadLoadout(i) {
  const l = state.loadouts[i]
  if (!l) return false
  let all = true
  for (const id of Object.values(l)) {
    if (state.owned[id] > 0) equip(id)
    else all = false
  }
  return all
}

export function resetSave() {
  hydrate(null)
}
