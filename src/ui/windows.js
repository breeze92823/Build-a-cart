// Menu windows: one modal at a time over a shade. Each window rebuilds its body
// from state when something changes while it is open (state.onChange).
// The reference-style windows (Shop restock list, Cart Upgrades, Index, Rebirth,
// Quests, Save Slots) are "bare": they draw their own header (panels.css).
// Everything is priced in Cash (root CLAUDE.md): no premium currency anywhere.
import './panels.css'
import { BUNDLES, ECONOMY, GEAR, GEAR_TYPES, INDEX_TABS, PASSES, QUEST_STATS, QUESTS, RARITY, REBIRTH, SAVE_SLOTS, UPGRADES } from '../config.js'
import { topSpeed } from '../cartPhysics.js'
import * as S from '../state.js'
import { gearById, state } from '../state.js'
import { sfx, isMuted, toggleMuted } from '../audio/index.js'
import { fmt } from '../track.js'
import { clock } from '../cave.js'
import { thumb } from './thumbs.js'
import { ICONS } from './icons.js'
import { rerollQuests } from '../net.js'
import { shareInvite } from '../bloxity.js'

function el(tag, cls, html = '') {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
function button(text, cls, fn, disabled = false) {
  const b = el('button', `btn ${cls}`, text)
  b.disabled = disabled
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    fn(b)
  })
  return b
}
function pbtn(html, cls, fn, disabled = false) {
  const b = el('button', `pbtn ${cls}`, html)
  b.disabled = disabled
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!b.disabled) fn(b)
  })
  return b
}
// $1.26K / $25K / $1.5M
export function short(n) {
  n = Math.floor(n)
  const units = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]
  for (const [v, u] of units) if (n >= v) return `${+(n / v).toFixed(n >= v * 100 ? 0 : 2)}${u}`
  return String(n)
}
const money = (n) => `$${short(n)}`
// "38m 6s", "1hr 0s", "6d 3hr 24m 25s"
function span(s) {
  s = Math.max(0, Math.floor(s))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const out = []
  if (d) out.push(`${d}d`)
  if (h) out.push(`${h}hr`)
  if (m) out.push(`${m}m`)
  if (sec || !out.length) out.push(`${sec}s`)
  return out.join(' ')
}

const shade = el('div', 'ui-shade hud')
const win = el('div', 'ui-win')
const head = el('div', 'ui-head')
const title = el('h2', 'stroke')
const sub = el('div', 'sub stroke')
const close = el('button', 'ui-close stroke', '✕')
const body = el('div', 'ui-body')
head.append(title, sub, close)
win.append(head, body)
shade.appendChild(win)
document.body.appendChild(shade)
shade.addEventListener('pointerdown', (e) => {
  if (e.target === shade) closeWindow()
})
close.addEventListener('click', () => closeWindow())
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && current) {
    e.stopImmediatePropagation()
    closeWindow()
  }
})

let current = null // { name, render, tick, scrollSel }
let toast = () => {}
let fx = { celebrate() {} }
let onOpen = () => {}
export function initWindows(opts) {
  toast = opts.toast
  fx = opts.fx
  onOpen = opts.onOpen ?? onOpen
}
export const isWindowOpen = () => !!current
export const openName = () => current?.name ?? ''

// bare: the window draws its own frame (lw / rs); scroll: the selector of its scrolling list.
function open(name, { heading = '', color, narrow = false, bare = false, scroll = null, render, tick = null }) {
  current = { name, render, tick, scroll: scroll ?? '.ui-body' }
  title.textContent = heading
  head.style.setProperty('--head', color)
  win.className = `ui-win${narrow ? ' narrow' : ''}${bare ? ' bare' : ''}`
  shade.classList.add('on')
  sfx.windowOpen()
  redraw()
  onOpen(name)
  if (document.pointerLockElement) document.exitPointerLock?.()
}
export function closeWindow() {
  if (!current) return
  current = null
  shade.classList.remove('on')
  body.replaceChildren()
  sfx.windowClose()
}
function redraw() {
  if (!current) return
  const sc = current.scroll === '.ui-body' ? body : body.querySelector(current.scroll)
  const scroll = sc?.scrollTop ?? 0
  body.replaceChildren()
  sub.textContent = ''
  current.render(body)
  const next = current.scroll === '.ui-body' ? body : body.querySelector(current.scroll)
  if (next) next.scrollTop = scroll
}
onChange(() => redraw())
function onChange(fn) {
  S.onChange((what) => {
    // Quest progress ticks are drawn by the Quests window's own tick.
    if (what !== 'tick') fn(what)
  })
}
// Per-second refresh (timers).
setInterval(() => current?.tick?.(), 1000)

// The studded cyan frame of the bare windows.
function frame(heading, icon, { cls = '', subText = '', width } = {}) {
  const root = el('div', `lw ${cls}`)
  if (width) root.style.setProperty('--lw-w', width)
  const h = el('div', 'lw-head')
  if (icon) h.append(el('div', 'ic', ICONS[icon] ?? icon))
  h.append(el('div', 'lw-title', heading))
  const subEl = el('div', 'lw-sub', subText)
  if (subText !== null) h.append(subEl)
  const x = pbtn('X', 'lw-x', () => closeWindow())
  x.className = 'lw-x'
  h.append(x)
  const b = el('div', 'lw-body')
  root.append(h, b)
  return { root, head: h, body: b, sub: subEl }
}

const statText = (g) => {
  if (g.type === 'engine') return `Speed ${g.speed} · Burn x${g.burn.toFixed(2)}`
  if (g.type === 'fuel') return `${g.tank}s of fuel`
  if (g.type === 'wheels') return `Grip ${Math.round((1 - g.roll) * 100)} · Aero ${Math.round((2 - g.drag) * 50)}`
  if (g.id === 'none') return 'Nothing fitted'
  return `+${g.boost} thrust · ${g.time}s · x${g.charges}`
}
function gearCard(g, extra) {
  const r = RARITY[g.rarity]
  const c = el('div', 'card')
  c.style.setProperty('--rar', r.color)
  const img = el('img')
  img.src = thumb(g.id)
  img.alt = ''
  c.append(img, el('div', 'nm stroke', g.name), el('div', 'rar', r.name), el('div', 'st', statText(g)))
  extra?.(c)
  return c
}
function deny(text) {
  sfx.deny()
  toast(text, 'bad')
}

// --- Shop: the restocking list (cave stall) -----------------------------------------------
export function openStock() {
  let shownPeriod = S.restockPeriod()
  let timer = null
  open('stock', {
    bare: true,
    scroll: '.rs-body',
    tick() {
      if (S.restockPeriod() !== shownPeriod) return redraw()
      if (timer) timer.textContent = `Next restock in: ${clock(S.restockLeft())}`
    },
    render(b) {
      shownPeriod = S.restockPeriod()
      const root = el('div', 'rs')
      const h = el('div', 'rs-head')
      timer = el('div', 't', `Next restock in: ${clock(S.restockLeft())}`)
      const restock = pbtn(`Restock<small>${money(S.restockPrice())}</small>`, 'gold', () => {
        if (S.paidRestock()) {
          sfx.restockBell()
          toast('Shop restocked!', 'gold')
        } else deny(`Restock costs ${fmt(S.restockPrice())}`)
      })
      const x = pbtn('X', 'lw-x', () => closeWindow())
      x.className = 'lw-x'
      h.append(timer, restock, x)
      const list = el('div', 'rs-body')
      const left = S.stock()
      for (const g of S.SHOP_LIST) {
        const n = left[g.id] ?? 0
        const locked = S.shopLocked(g)
        const row = el('div', `rs-row${locked ? ' locked' : ''}`)
        const pic = el('div', 'rs-thumb')
        const img = el('img')
        img.src = thumb(g.id)
        img.alt = ''
        pic.append(img)
        const info = el('div', 'rs-info')
        info.append(el('div', 'rs-name', g.name), el('div', 'rs-desc', g.desc ?? ''), el('div', 'rs-stock', `X${n} stock`))
        const buy = el('div', 'rs-buy')
        if (!n) buy.append(el('div', 'rs-price', fmt(g.price)))
        const btns = el('div', 'rs-btns')
        const result = (r) => {
          if (r === 'ok') {
            sfx.purchase()
            toast(`Bought ${g.name}!`)
            fx.celebrate()
          } else if (r === 'cash') deny('Not enough cash!')
          else if (r === 'locked') deny(`${g.reb} Rebirth${g.reb === 1 ? '' : 's'} Required`)
          else deny('No stock - wait for the restock')
        }
        btns.append(pbtn(fmt(S.instantPrice(g)), 'pink', () => result(S.buyFromStall(g.id, true))))
        btns.append(n ? pbtn(fmt(g.price), 'green', () => result(S.buyFromStall(g.id))) : pbtn('No Stock', 'grey', () => result(locked ? 'locked' : 'nostock')))
        buy.append(btns)
        row.append(pic, info, buy)
        if (locked) row.append(el('div', 'rs-lock', `<b>${g.reb}</b> Rebirth${g.reb === 1 ? '' : 's'} Required`))
        list.append(row)
      }
      root.append(h, list)
      b.append(root)
    },
  })
}

// --- Cart Upgrades (base stall) --------------------------------------------------------------
export function openCartUpgrades() {
  open('cartUpgrades', {
    bare: true,
    scroll: '.lw-body',
    render(b) {
      const f = frame('Cart Upgrades', null, { width: '50rem', subText: null })
      for (const u of UPGRADES) {
        const row = el('div', 'up-row')
        row.append(el('div', 'ic', ICONS[u.icon]))
        const name = el('div', 'up-name', u.name.replace(/ /g, '<br>'))
        const level = S.upgradeLevel(u.id)
        const maxed = S.upgradeMaxed(u.id)
        const now = u.text(S.upgradeValue(u.id))
        const next = maxed ? 'MAX' : u.text(S.upgradeValue(u.id, level + 1))
        name.append(el('div', 'up-change', `${now} ➜ ${next}`))
        row.append(name)
        row.append(el('div', `up-val${now.length > 4 ? ' small' : ''}`, now), el('div', 'up-arrow', ICONS.arrow), el('div', `up-val${next.length > 4 ? ' small' : ''}`, next))
        const btns = el('div', 'up-btns')
        if (maxed) btns.append(el('div', 'up-max', 'MAXED'))
        else {
          const one = S.upgradePrice(u.id, 1)
          const k = S.bulkCount(u.id)
          const many = S.upgradePrice(u.id, k)
          const buy = (n) => {
            const r = S.buyUpgrade(u.id, n)
            if (r === 'ok') {
              sfx.purchase()
              toast(`${u.name}: ${u.text(S.upgradeValue(u.id))}`)
            } else if (r === 'cash') deny('Not enough cash!')
          }
          btns.append(pbtn(money(one), 'green', () => buy(1)), pbtn(`x${k} <small>${money(many)}</small>`, 'green', () => buy(k)))
        }
        row.append(btns)
        f.body.append(row)
      }
      b.append(f.root)
    },
  })
}

// --- Index (cave pad) ---------------------------------------------------------------------------
let indexTab = 'engine'
let indexSel = null
export function openIndex() {
  open('index', {
    bare: true,
    scroll: '.lw-body',
    render(b) {
      const wrap = el('div', 'ix')
      const tabs = el('div', 'ix-tabs')
      for (const t of INDEX_TABS) {
        const btn = pbtn(t.name, `ix-tab${indexTab === t.type ? ' on' : ''}`, () => {
          indexTab = t.type
          indexSel = null
          sfx.windowOpen()
          redraw()
        })
        btn.className = `ix-tab${indexTab === t.type ? ' on' : ''}`
        tabs.append(btn)
      }
      const tab = INDEX_TABS.find((t) => t.type === indexTab)
      const items = GEAR.filter((g) => g.type === indexTab).sort((a, b) => (indexTab === 'engine' ? b.speed - a.speed : b.tank - a.tank))
      const found = items.filter((g) => S.isDiscovered(g.id)).length
      const f = frame('Index', 'book', { cls: 'ix-main', subText: `${found}/${items.length}` })
      const grid = el('div', 'ix-grid')
      for (const g of items) {
        const known = S.isDiscovered(g.id)
        const card = el('button', `ix-card${known ? '' : ' unknown'}${indexSel === g.id ? ' sel' : ''}`)
        const img = el('img')
        img.src = thumb(g.id)
        img.alt = ''
        card.append(el('div', 'nm', g.name), img)
        card.addEventListener('click', (e) => {
          e.stopPropagation()
          indexSel = g.id
          sfx.equip()
          redraw()
        })
        grid.append(card)
      }
      f.body.append(grid)
      const det = el('div', 'ix-detail')
      const g = indexSel && gearById[indexSel]
      if (!g) det.append(el('div', 'pic'), el('div', 'nm', 'Select a Item'), el('div', 'box'))
      else {
        const pic = el('div', 'pic')
        const img = el('img')
        img.src = thumb(g.id)
        img.alt = ''
        pic.append(img)
        const box = el('div', 'box', `<b>${tab.stat}:</b><span>${indexTab === 'engine' ? g.speed : `${g.tank}s`}</span>`)
        const where = S.isDiscovered(g.id) ? `Owned x${state.owned[g.id] ?? 0}` : g.shop ? (g.reb ? `Shop · ${g.reb} Rebirth${g.reb === 1 ? '' : 's'}` : 'Sold in the Shop') : g.special ? 'Sold at your base' : 'Mystery Dice / Lucky Wheel'
        det.append(pic, el('div', 'nm', g.name), box, el('div', 'owned', where))
      }
      wrap.append(tabs, f.root, det)
      b.append(wrap)
    },
  })
}

// --- Rebirth ---------------------------------------------------------------------------------------
export function openRebirth() {
  open('rebirth', {
    bare: true,
    render(b) {
      const f = frame('Rebirth', 'rebirth', { cls: 'rb', subText: null })
      const rw = el('div', 'rb-rewards')
      rw.append(el('h4', '', 'Rewards'))
      const tiles = el('div', 'rb-tiles')
      const tile = (pic, label) => {
        const t = el('div', 'rb-tile')
        const p = el('div', 'pic', pic)
        t.append(p, el('b', '', label))
        tiles.append(t)
      }
      const nextMult = 1 + (state.rebirths + 1) * REBIRTH.cashStep
      tile(ICONS.goldcart, '+1 Golden Cart')
      tile(ICONS.bills, `${+nextMult.toFixed(1)}x Cash`)
      tile(`<img src="${thumb(REBIRTH.engine)}" alt="">`, `1x ${gearById[REBIRTH.engine].name}`)
      rw.append(tiles, el('div', 'rb-warn', '[WARNING] All your items, including cash and carts will be reset!'))
      const req = el('div', 'rb-req')
      req.append(el('h5', '', 'Requirements'))
      const bar = (label, have, need, text) => {
        req.append(el('div', 'lab', label))
        const r = el('div', 'rb-bar', `<i style="transform:scaleX(${Math.min(1, have / need)})"></i><span>${text}</span>`)
        req.append(r)
      }
      bar('Cash', state.cash, S.rebirthCash(), `$ ${short(state.cash)} / $ ${short(S.rebirthCash())}`)
      bar('Carts', S.cartCount(), S.rebirthCarts(), `${S.cartCount()} / ${S.rebirthCarts()}`)
      const btns = el('div', 'rb-btns')
      const done = (skip) => {
        if (S.rebirth(skip)) {
          sfx.rebirth()
          toast(`Rebirthed! Cash x${+nextMult.toFixed(1)} + a Golden Cart`, 'gold')
          fx.celebrate(true)
          closeWindow()
        } else if (skip) deny(`Skip needs ${fmt(S.skipPrice())} cash`)
        else deny(state.cash < S.rebirthCash() ? `Need ${fmt(S.rebirthCash())}` : `Need ${S.rebirthCarts()} carts`)
      }
      btns.append(pbtn('Rebirth', 'go', () => done(false)), pbtn(`Skip<small>${money(S.skipPrice())}</small>`, 'pink', () => done(true)))
      f.body.append(rw, req, btns, el('div', 'rb-mult', `Rebirths: ${state.rebirths} · Golden Carts: ${state.goldenCarts} · Skip ignores the carts`))
      b.append(f.root)
    },
  })
}

// --- Quests ----------------------------------------------------------------------------------------
let questTab = 'daily'
let invitedAt = 0
export function openQuests() {
  let refs = null
  let busy = false
  open('quests', {
    bare: true,
    scroll: '.qs-list',
    tick() {
      if (!refs) return
      refs.timer.textContent = `Refreshes In ${span(S.questEndsIn(questTab))}`
      const rows = S.questRows(questTab)
      if (rows.length !== refs.rows.length || rows.some((r, i) => r.id !== refs.rows[i].id || r.done !== refs.rows[i].done)) return redraw()
      rows.forEach((r, i) => {
        refs.rows[i].fill.style.transform = `scaleX(${r.value / r.goal})`
        refs.rows[i].prog.textContent = progText(r)
      })
    },
    render(b) {
      const f = frame('Quests', 'scroll', { cls: 'qs', subText: `Refreshes In ${span(S.questEndsIn(questTab))}` })
      const wrap = el('div', 'qs-wrap')
      const left = el('div', 'qs-left')
      const tabs = el('div', 'qs-tabs')
      for (const k of ['daily', 'weekly']) {
        const t = pbtn(k === 'daily' ? 'Daily' : 'Weekly', `green qs-tab${questTab === k ? ' on' : ''}`, () => {
          questTab = k
          sfx.windowOpen()
          redraw()
        })
        tabs.append(t)
      }
      const list = el('div', 'qs-list')
      const rowRefs = []
      for (const q of S.questRows(questTab)) {
        const row = el('div', 'qs-row')
        const card = el('div', `qs-card${q.done ? ' done' : ''}`)
        const fill = el('i')
        fill.style.transform = `scaleX(${q.done ? 1 : q.value / q.goal})`
        const prog = el('small', '', progText(q))
        const tx = el('div', 'tx')
        tx.append(el('b', '', q.name), prog)
        card.append(fill, tx, el('div', 'rw', `${ICONS.bills.replace('<svg', '<svg class="cash-ic"')}${short(q.reward)}`))
        if (q.done) card.append(el('div', 'qs-done', 'COMPLETED!'))
        row.append(card)
        const skip = el('button', `qs-skip${q.done ? ' ghost' : ''}`, `${ICONS.skip}<b>SKIP</b><small>${money(S.skipQuestPrice(q.id))}</small>`)
        skip.addEventListener('click', (e) => {
          e.stopPropagation()
          if (S.skipQuest(questTab, q.id)) {
            sfx.quest()
            fx.celebrate()
          } else deny(`Skipping costs ${fmt(S.skipQuestPrice(q.id))}`)
        })
        row.append(skip)
        list.append(row)
        rowRefs.push({ id: q.id, done: q.done, fill, prog })
      }
      const foot = el('div', 'qs-foot')
      foot.append(
        pbtn(`REFRESH QUESTS<small>${money(S.refreshQuestPrice(questTab))}</small>`, 'blue', async (btn) => {
          if (busy) return
          busy = true
          btn.disabled = true
          const r = await S.refreshQuests(questTab, rerollQuests)
          busy = false
          if (r === 'ok') {
            sfx.restockBell()
            toast('New quests!', 'gold')
          } else if (r === 'cash') deny(`Refreshing costs ${fmt(S.refreshQuestPrice(questTab))}`)
          else if (r === 'alldone') deny('All quests are done!')
          else deny('Could not reach the server - refunded')
          redraw()
        }),
        pbtn('INVITE', 'green', async () => {
          const r = await shareInvite()
          if (!r) return
          toast(r === 'copied' ? 'Invite link copied!' : 'Invite sent!', 'gold')
          // One invite counted per minute (sharing the same link again is not a new friend).
          if (Date.now() - invitedAt > 60000) {
            invitedAt = Date.now()
            S.recordInvite()
          }
        }),
      )
      left.append(tabs, list, foot)
      wrap.append(left, questSide())
      f.body.append(wrap)
      b.append(f.root)
      refs = { timer: f.sub, rows: rowRefs }
    },
  })
}
function progText(q) {
  const label = QUEST_STATS[q.stat]
  if (q.stat === 'playtime') return `${span(q.value)} / ${span(q.goal)} ${label}`
  if (q.stat === 'cash') return `${money(q.value)} / ${money(q.goal)} ${label}`
  return `${short(q.value)} / ${short(q.goal)} ${label}`
}
// The star level track: the next three levels' rewards beside the bar.
function questSide() {
  const side = el('div', 'qs-side')
  const lv = state.questLevel
  const first = Math.max(1, lv)
  const levels = el('div', 'qs-levels')
  const track = el('div', 'qs-track')
  const rail = el('div', 'rail', '<i></i>')
  track.append(rail)
  for (let l = first; l < first + 3; l++) {
    const r = S.levelReward(l)
    const box = el('div', `qs-lvl${l <= lv ? ' got' : ''}`)
    if (r && l > 1) {
      if (r.cash) box.append(el('div', 'qs-rw', `${ICONS.bills}<span class="cash">$${short(r.cash)}</span>`))
      if (r.slot) box.append(el('div', 'qs-rw', `${ICONS.floppy}<span>+${r.slot}</span>`))
      if (r.dice) box.append(el('div', 'qs-rw', `${ICONS.dice}<span>x${r.dice}</span>`))
    }
    levels.append(box)
    track.append(el('div', `qs-node${l <= lv ? ' on' : ''}`, `LVL ${l}`))
  }
  const lo = S.levelStars(first)
  const hi = S.levelStars(first + 2)
  rail.firstChild.style.height = `${Math.max(8, Math.min(100, ((state.stars - lo) / Math.max(1, hi - lo)) * 100))}%`
  side.append(levels, track)
  side.append(el('div', 'qs-stars', `<span>Quest = ${QUESTS[questTab].stars} Stars</span><b>${ICONS.star}${state.stars.toLocaleString('en-US')}</b>`))
  return side
}

// --- Save Slots ---------------------------------------------------------------------------------------
export function openSaves() {
  open('saves', {
    bare: true,
    scroll: '.lw-body',
    render(b) {
      const f = frame('Save Slots', 'floppy', { cls: 'sv', subText: null })
      const grid = el('div', 'sv-grid')
      for (let i = 0; i < SAVE_SLOTS.total; i++) {
        const tile = el('div', 'sv-slot')
        if (S.slotOpen(i)) {
          const l = state.loadouts[i]
          tile.append(el('div', `tag${l ? ' full' : ''}`, l ? 'SAVED' : 'EMPTY'), el('div', 'flop', ICONS.floppy), el('div', 'nm', i < SAVE_SLOTS.free ? `Free Slot ${i + 1}` : `Slot ${i + 1}`))
          if (l) tile.append(el('div', 'gear', [l.engine, l.fuel].map((id) => gearById[id]?.name ?? '?').join(' + ')))
          const acts = el('div', 'sv-acts')
          acts.append(
            pbtn('Save', 'blue', () => {
              S.saveLoadout(i)
              sfx.equip()
              toast(`Cart saved to slot ${i + 1}`)
            }),
            pbtn(
              'Load',
              'green',
              () => {
                const all = S.loadLoadout(i)
                sfx.equip()
                toast(all ? `Loaded slot ${i + 1}` : 'Loaded (some gear is no longer owned)', all ? 'good' : 'bad')
              },
              !l,
            ),
          )
          tile.append(acts)
        } else if (S.slotIsQuest(i)) {
          tile.append(el('div', 'lock', ICONS.lock), el('div', 'q', 'COMPLETE A SLOT QUEST TO UNLOCK<br>OR'))
          tile.append(
            pbtn(`Unlock ${money(S.slotPrice(i))}`, 'gold', () => {
              if (S.unlockSlot(i)) {
                sfx.purchase()
                toast(`Slot ${i + 1} unlocked!`, 'gold')
              } else deny(`Need ${fmt(S.slotPrice(i))}`)
            }),
          )
        } else {
          tile.append(el('div', 'lock big', ICONS.lock))
          tile.append(
            pbtn(money(S.slotPrice(i)), 'pink', () => {
              if (S.unlockSlot(i)) {
                sfx.purchase()
                toast(`Slot ${i + 1} unlocked!`, 'gold')
              } else deny(`Need ${fmt(S.slotPrice(i))}`)
            }),
          )
        }
        grid.append(tile)
      }
      f.body.append(grid, el('div', 'sv-note', 'Each slot keeps one cart setup. Quest levels unlock slots too. Progress saves automatically.'))
      const foot = el('div', 'sv-foot')
      foot.append(
        pbtn(isMuted() ? 'Sound: OFF' : 'Sound: ON', isMuted() ? 'grey' : 'blue', () => {
          toggleMuted()
          redraw()
        }),
      )
      f.body.append(foot)
      b.append(f.root)
    },
  })
}

// --- Backpack / your cart ---------------------------------------------------------------
export function openBackpack() {
  open('backpack', {
    heading: 'Your Cart',
    color: 'linear-gradient(#ffb066, #e0661a)',
    render(b) {
      const st = S.currentStats()
      const line = el('div', 'stats-line')
      const stat = (v, l) => line.append(el('div', 'stat', `<b class="stroke">${v}</b><small>${l}</small>`))
      stat(`${Math.round(topSpeed(st))} m/s`, 'Top speed')
      stat(`${gearById[state.equipped.engine].speed}`, 'Engine speed')
      stat(`${Math.round(st.tank)}s`, 'Fuel')
      stat(st.charges ? `x${st.charges}` : '—', 'Boosts')
      stat(`x${S.cashMultiplier().toFixed(2)}`, `${S.cartCount()} carts`)
      b.append(line)
      b.append(el('h3', 'stroke', 'Equipped'))
      const eq = el('div', 'equip-row ui-grid')
      for (const { type } of GEAR_TYPES) eq.append(gearCard(gearById[state.equipped[type]], (c) => c.classList.add('equipped')))
      b.append(eq)
      b.append(el('h3', 'stroke', 'Backpack'))
      const grid = el('div', 'ui-grid')
      const owned = GEAR.filter((g) => state.owned[g.id] > 0 && state.equipped[g.type] !== g.id)
      const extra = GEAR.filter((g) => state.equipped[g.type] === g.id && S.spare(g.id) > 0)
      for (const g of [...owned, ...extra]) {
        grid.append(
          gearCard(g, (c) => {
            c.append(el('div', 'cnt stroke', `x${S.spare(g.id)}`))
            const r = el('div', 'row2')
            if (state.equipped[g.type] !== g.id)
              r.append(
                button('Equip', 'blue small', () => {
                  S.equip(g.id)
                  sfx.equip()
                }),
              )
            if (!g.starter)
              r.append(
                button('Trash', 'red small', () => {
                  if (S.trashGear(g.id)) sfx.trash()
                }),
              )
            c.append(r)
          }),
        )
      }
      if (!grid.children.length) b.append(el('div', 'muted center', 'Nothing spare yet. Buy gear at the Shop in the cave!'))
      b.append(grid)
    },
  })
}

// --- Sell gear ----------------------------------------------------------------------------
export function openSell() {
  open('sell', {
    heading: 'Sell Gear',
    color: 'linear-gradient(#ff7a7a, #d01a1a)',
    render(b) {
      const items = GEAR.filter((g) => !g.starter && S.spare(g.id) > 0)
      sub.textContent = `${S.hasPass('trader') ? 70 : Math.round(ECONOMY.sellBack * 100)}% back`
      if (!items.length) {
        b.append(el('div', 'muted center', 'Only spare gear can be sold (not what is on your cart).'))
        return
      }
      const total = items.reduce((a, g) => a + S.sellPrice(g.id) * S.spare(g.id), 0)
      b.append(
        button(`Sell all spares for ${fmt(total)}`, 'gold', () => {
          let cash = 0
          for (const g of items) cash += S.sellGear(g.id, S.spare(g.id))
          sfx.payout(1)
          toast(`+${fmt(cash)}`)
        }),
      )
      const grid = el('div', 'ui-grid')
      grid.style.marginTop = '0.8rem'
      for (const g of items) {
        grid.append(
          gearCard(g, (c) => {
            c.append(el('div', 'cnt stroke', `x${S.spare(g.id)}`))
            c.append(
              button(`Sell ${fmt(S.sellPrice(g.id))}`, 'gold small', () => {
                const cash = S.sellGear(g.id)
                if (cash) {
                  sfx.payout(0.4)
                  toast(`+${fmt(cash)}`)
                }
              }),
            )
          }),
        )
      }
      b.append(grid)
    },
  })
}

// --- Shop (bundles + passes) ------------------------------------------------------------------
export function openShop() {
  open('shop', {
    heading: 'Shop',
    color: 'linear-gradient(#ffe066, #f59a12)',
    render(b) {
      b.append(el('h3', 'stroke', 'Bundles'))
      const grid = el('div', 'ui-grid')
      for (const [key, bundle] of Object.entries(BUNDLES)) {
        const first = gearById[bundle.gear[0]]
        const c = gearCard(first)
        c.style.setProperty('--rar', RARITY[first.rarity].color)
        c.querySelector('.nm').textContent = bundle.name
        c.querySelector('.rar').textContent = bundle.gear.length > 1 ? 'Bundle' : RARITY[first.rarity].name
        c.querySelector('.st').textContent = bundle.gear.map((id) => gearById[id].name).join(' + ')
        c.append(
          button(fmt(bundle.price), 'gold', () => {
            if (S.buyBundle(key)) {
              sfx.purchase()
              toast(`${bundle.name} unlocked!`, 'gold')
              fx.celebrate(true)
            } else deny('Not enough cash!')
          }),
        )
        grid.append(c)
      }
      b.append(grid)
      b.append(el('h3', 'stroke', 'Passes (forever)'))
      const pg = el('div', 'ui-grid')
      for (const p of PASSES) {
        const owned = S.hasPass(p.id)
        const c = el('div', 'card')
        c.style.setProperty('--rar', owned ? '#5dff6a' : '#ffd23a')
        c.append(el('div', 'big-num stroke', { cash: '💰', fuel: '⛽', wheel: '🎡', tag: '🏷️' }[p.icon]), el('div', 'nm stroke', p.name), el('div', 'st', p.desc))
        c.append(
          owned
            ? el('div', 'stock', 'OWNED')
            : button(fmt(p.price), 'gold', () => {
                if (S.buyPass(p.id)) {
                  sfx.purchase()
                  toast(`${p.name} pass unlocked!`, 'gold')
                  fx.celebrate(true)
                } else deny('Not enough cash!')
              }),
        )
        pg.append(c)
      }
      b.append(pg)
    },
  })
}

// Buy-a-bundle confirm (from the base display pads).
export function openBundle(key) {
  const bundle = BUNDLES[key]
  open('bundle', {
    heading: bundle.name,
    color: key === 'v8' ? 'linear-gradient(#7fc2ff, #2f6fe0)' : 'linear-gradient(#ffe066, #f59a12)',
    narrow: bundle.gear.length === 1,
    render(b) {
      const grid = el('div', 'ui-grid')
      for (const id of bundle.gear) grid.append(gearCard(gearById[id], (c) => state.owned[id] > 0 && c.append(el('div', 'cnt stroke', 'owned'))))
      b.append(grid)
      const buy = button(`Buy for ${fmt(bundle.price)}`, 'gold', () => {
        if (S.buyBundle(key)) {
          sfx.purchase()
          toast(`${bundle.name} unlocked!`, 'gold')
          fx.celebrate(true)
          closeWindow()
        } else deny('Not enough cash!')
      })
      buy.style.marginTop = '0.8rem'
      b.append(buy)
    },
  })
}
