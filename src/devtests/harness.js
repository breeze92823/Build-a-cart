// Helpers that let a test play the game the way a person does: press real keys, hold E at a
// prompt, click the real buttons in the menus, and let frames pass. The game loop is driven by
// hand (game.frame) so a test is deterministic and runs the same with the tab hidden.
//   Watch mode: one frame per screen refresh (real time), every frame drawn, so you can follow it.
//   Fast mode: frames are stepped in batches and drawn now and then.
import { ECONOMY } from '../config.js'

export const DT = 1 / 60
export class AbortRun extends Error {}

const chan = new MessageChannel()
// A macrotask yield that stays quick in a hidden tab (setTimeout is throttled there).
const macro = () =>
  new Promise((res) => {
    chan.port1.onmessage = () => res()
    chan.port2.postMessage(0)
  })
const raf = () =>
  new Promise((res) => {
    const t = setTimeout(res, 100) // a hidden pane never fires rAF
    requestAnimationFrame(() => {
      clearTimeout(t)
      res()
    })
  })

export function createHarness({ game, ui }) {
  const { S, W, ride, carry, events, state } = game
  const V3 = game.camera.position.constructor
  const held = new Set()
  let counter = 0
  let deadline = Infinity
  const h = {
    game,
    S,
    W,
    state,
    ride,
    carry,
    events,
    V3,
    speed: 'fast', // 'watch' | 'fast'
    aborted: false,
    sinceYield: 0,

    // --- Time ------------------------------------------------------------------------------
    setDeadline(ms) {
      deadline = performance.now() + ms
    },
    async frames(n = 1) {
      for (let i = 0; i < n; i++) {
        if (h.aborted) throw new AbortRun('stopped')
        if (performance.now() > deadline) throw new Error('test timed out')
        counter++
        const watch = h.speed === 'watch' && !document.hidden
        game.frame(DT, watch || counter % 30 === 0)
        if (watch) await raf()
        else if (++h.sinceYield >= 40) {
          h.sinceYield = 0
          await macro()
        }
      }
    },
    seconds: (s) => h.frames(Math.max(1, Math.round(s * 60))),
    // Lets the page breathe during long work that does not step frames (the headless campaign).
    async pause() {
      if (h.aborted) throw new AbortRun('stopped')
      if (performance.now() > deadline) throw new Error('test timed out')
      await macro()
    },
    // Steps until pred() is true. Returns whether it became true within `max` seconds.
    async until(pred, max = 10) {
      const n = Math.round(max * 60)
      for (let i = 0; i < n; i++) {
        if (pred()) return true
        await h.frames(1)
      }
      return !!pred()
    },

    // --- Keyboard (real KeyboardEvents on window, like the browser sends them) -----------------
    keyDown(code) {
      held.add(code)
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
    },
    keyUp(code) {
      held.delete(code)
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
    },
    async tap(code, frames = 3) {
      h.keyDown(code)
      await h.frames(frames)
      h.keyUp(code)
      await h.frames(1)
    },
    releaseAll() {
      for (const c of [...held]) h.keyUp(c)
    },
    // Holds E until pred() is true (or `max` s), then lets go: the real "hold E at a prompt".
    async holdE(pred = () => false, max = 3) {
      h.clearToasts()
      h.keyDown('KeyE')
      const ok = await h.until(pred, max)
      h.keyUp('KeyE')
      await h.frames(2)
      return ok
    },

    // --- Screen ---------------------------------------------------------------------------------
    $: (sel, root = document) => root.querySelector(sel),
    $$: (sel, root = document) => [...root.querySelectorAll(sel)],
    text: (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    // The first visible button whose text contains `text`.
    btn(text, root = document) {
      const want = text.toLowerCase()
      return h.$$('button', root).find((b) => h.text(b).toLowerCase().includes(want)) ?? null
    },
    // Toasts stay on screen for 2.5 s of real time, which is many game seconds when the tests run
    // fast: clear them before an action so a test only ever sees the toasts that action made.
    clearToasts: () => document.querySelectorAll('.toast').forEach((e) => e.parentNode?.removeChild(e)),
    async click(el, why = 'button') {
      if (!el) throw new Error(`cannot click: ${why} not found`)
      h.clearToasts()
      el.click()
      await h.frames(2)
    },
    // A touch-style press-and-hold (pedals, boost): pointerdown now, pointerup later.
    down(el) {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch' }))
    },
    up(el) {
      for (const ev of ['pointerup', 'lostpointercapture']) el.dispatchEvent(new PointerEvent(ev, { bubbles: true, pointerId: 7, pointerType: 'touch' }))
    },
    prompt() {
      const p = h.$('.hud-prompt')
      return { on: !!p?.classList.contains('on'), title: h.text(p?.querySelector('b')), sub: h.text(p?.querySelector('small')), deny: !!p?.classList.contains('deny') }
    },
    toasts: () => h.$$('.toast').map((t) => h.text(t)),
    banner: () => h.text(h.$('.banner')),
    shownCash: () => Number((h.text(h.$('.money')).match(/[\d,]+/)?.[0] ?? '0').replace(/,/g, '')),
    win: () => W.openName(),
    winEl: () => h.$('.ui-shade.on .ui-win'),

    // --- Placing the player ----------------------------------------------------------------------
    async goto(x, z, facing = Math.PI) {
      game.teleport(x, 0.05, z, facing)
      await h.frames(3)
    },
    async toCart() {
      const c = ride.cartSpot()
      await h.goto(c.x + 2.2, c.z)
    },
    // Stands on a spot's marker and checks the prompt that a player would see.
    async stand(x, z, title) {
      await h.goto(x, z)
      const p = h.prompt()
      return p.on && p.title.toLowerCase().includes(title.toLowerCase()) ? p : null
    },
    // Walk up to a prompt, hold E until `opened()` and return the window's root.
    async use(x, z, title, opened, max = 3) {
      const p = await h.stand(x, z, title)
      if (!p) throw new Error(`no "${title}" prompt at (${x}, ${z}); the prompt says "${h.prompt().title}"`)
      const ok = await h.holdE(opened, max)
      if (!ok) throw new Error(`holding E at "${title}" did nothing`)
      await h.frames(2)
    },
    async openByHud(cls, name) {
      await h.click(h.$(`.side-btn.${cls}`), `${cls} button`)
      if (h.win() !== name) throw new Error(`HUD ${cls} button did not open "${name}" (open: "${h.win()}")`)
      return h.winEl()
    },
    async closeWin() {
      if (h.win()) {
        W.closeWindow()
        await h.frames(1)
      }
    },

    // --- Game state shortcuts (a tester's cheat, not part of the flow under test) ------------------
    setCash(n) {
      state.cash = n
      S.changed('cash')
    },
    give(id, n = 1) {
      S.giveGear(id, n)
    },
    // Sets the equipped gear directly (state only), e.g. { engine: 'v12', fuel: 'giantfuel' }.
    gear(set) {
      for (const [type, id] of Object.entries(set)) {
        if (!(state.owned[id] > 0)) S.giveGear(id)
        S.equip(id)
      }
    },
    // Marks today's Daily and Weekly quests as done so their cash rewards (and star levels) do not
    // pop up in the middle of a test that counts cash. The Quests tests leave them on.
    muteQuests() {
      for (const k of ['daily', 'weekly']) for (const r of S.questRows(k)) if (!state.quests[k].done.includes(r.id)) state.quests[k].done.push(r.id)
    },
    // A fresh save, calm weather, player at the base, nothing open, nothing held.
    async reset({ quests = false } = {}) {
      h.releaseAll()
      await h.closeWin()
      if (ride.mode === 'crashed') ride.restart()
      else if (ride.riding) ride.launchOrReturn()
      await h.frames(2)
      S.resetSave()
      events.force = 'none'
      if (carry.held) carry.hold(carry.held)
      game.state.cash = ECONOMY.startCash
      if (!quests) h.muteQuests()
      await h.toCart()
      await h.frames(2)
    },
  }
  return h
}

// --- Assertions ----------------------------------------------------------------------------------
// Soft: a failed check is recorded and the test keeps going, so one run shows everything that is wrong.
export function createT(record, h) {
  const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(+v.toFixed(3))) : JSON.stringify(v))
  const t = {
    h,
    step: (msg) => record({ kind: 'step', msg }),
    ok(cond, msg) {
      record({ kind: cond ? 'pass' : 'fail', msg })
      return !!cond
    },
    eq(actual, expected, msg) {
      const ok = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected)
      record({ kind: ok ? 'pass' : 'fail', msg: ok ? msg : `${msg} (expected ${fmt(expected)}, got ${fmt(actual)})` })
      return ok
    },
    near(actual, expected, tol, msg) {
      const ok = Math.abs(actual - expected) <= tol
      record({ kind: ok ? 'pass' : 'fail', msg: ok ? msg : `${msg} (expected ${fmt(expected)} ±${tol}, got ${fmt(actual)})` })
      return ok
    },
    between(actual, lo, hi, msg) {
      const ok = actual >= lo && actual <= hi
      record({ kind: ok ? 'pass' : 'fail', msg: ok ? msg : `${msg} (expected ${fmt(lo)}..${fmt(hi)}, got ${fmt(actual)})` })
      return ok
    },
    gt(actual, floor, msg) {
      const ok = actual > floor
      record({ kind: ok ? 'pass' : 'fail', msg: ok ? msg : `${msg} (expected > ${fmt(floor)}, got ${fmt(actual)})` })
      return ok
    },
    fail: (msg) => record({ kind: 'fail', msg }),
    info: (msg) => record({ kind: 'info', msg }),
  }
  return t
}
