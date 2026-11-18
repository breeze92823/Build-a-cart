// A bot plays the whole game from a new save, the way a sensible player would: ride, bank the
// cash, buy whatever pays itself back fastest (Cart Upgrades, Shop gear, bundles, extra carts),
// rebirth when nothing is worth buying, and keep going until it reaches Golden Station. It checks
// that the save stays sane the whole way and that the finish is reachable. The first two rides and
// the last one are driven for real (keys, physics, HUD); the hundreds in between run on the
// headless simulator, which the "simulator = real ride" test keeps honest.
import { BUNDLES, ECONOMY, GEAR, TRACK, UPGRADES, ZONES } from '../../config.js'
import { fmt } from '../../track.js'
import { driveRun } from '../drive.js'
import { bank, projected, simRide } from '../sim.js'

const TYPES = ['engine', 'fuel', 'wheels', 'booster']
const MAX_RIDES = 4000
const BUY_PAYBACK = 80 // buy anything that pays back within this many rides...
const REBIRTH_PAYBACK = 30 // ...and rebirth once nothing is better than this
const hours = (s) => `${(s / 3600).toFixed(1)} h`

function createBot(h) {
  const S = h.S
  const st = h.state
  const income = () => projected().payout

  // Free: put the best owned piece of each kind on the cart.
  function freeEquip() {
    for (const type of TYPES) {
      let bestId = st.equipped[type]
      let best = income()
      for (const g of GEAR) {
        if (g.type !== type || !(st.owned[g.id] > 0) || g.id === st.equipped[type]) continue
        const p = projected({ equipped: { [type]: g.id } }).payout
        if (p > best * 1.0001) {
          best = p
          bestId = g.id
        }
      }
      if (bestId !== st.equipped[type]) S.equip(bestId)
    }
  }

  // Everything buyable (within reach of the cash) that raises what a ride pays, best payback first.
  function plan(reach) {
    const base = income()
    const list = []
    const add = (label, price, patch, buy) => {
      if (price > reach) return
      const gain = projected(patch).payout - base
      if (gain > 0) list.push({ label, price, gain, payback: price / gain, buy })
    }
    for (const u of UPGRADES) if (!S.upgradeMaxed(u.id)) add(u.name, S.upgradePrice(u.id, 1), { upgrades: { [u.id]: S.upgradeLevel(u.id) + 1 } }, () => S.buyUpgrade(u.id) === 'ok')
    if (st.wagons < ECONOMY.maxWagons) add('+1 Cart', S.wagonPrice(), { wagons: st.wagons + 1 }, () => S.buyWagon() === 'ok')
    const stock = S.stock()
    for (const g of S.SHOP_LIST) {
      if (S.shopLocked(g) || !S.isBetter(g)) continue
      const inStock = stock[g.id] > 0
      add(g.name, inStock ? g.price : S.instantPrice(g), { equipped: { [g.type]: g.id } }, () => {
        const ok = S.buyFromStall(g.id, !inStock) === 'ok'
        if (ok) S.equip(g.id)
        return ok
      })
    }
    for (const [key, b] of Object.entries(BUNDLES)) {
      const gear = b.gear.map((id) => S.gearById[id])
      const better = gear.filter((g) => S.isBetter(g))
      if (!better.length) continue
      add(b.name, b.price, { equipped: Object.fromEntries(better.map((g) => [g.type, g.id])) }, () => {
        if (!S.buyBundle(key)) return false
        for (const g of better) S.equip(g.id)
        return true
      })
    }
    list.sort((a, b) => a.payback - b.payback)
    return list
  }

  // Wagons still needed (and what they cost) before the next rebirth.
  function rebirthCost() {
    const missing = Math.max(0, S.rebirthCarts() - S.cartCount())
    let cost = S.rebirthCash()
    for (let k = 0; k < missing; k++) cost += ECONOMY.wagonPrice(st.wagons + k)
    return { missing, cost }
  }
  function rebirth() {
    const { missing } = rebirthCost()
    for (let k = 0; k < missing; k++) if (S.buyWagon() !== 'ok') return false
    return S.rebirth(false)
  }
  return { freeEquip, plan, rebirthCost, rebirth, income }
}

export default {
  name: 'Full playthrough',
  tests: [
    {
      name: 'A bot plays from a new save to Golden Station: upgrades, gear, carts, rebirths; the save stays sane',
      timeout: 600000,
      async fn(t) {
        const h = t.h
        const S = h.S
        const st = h.state
        await h.reset()
        const bot = createBot(h)
        const log = { rides: 0, buys: 0, rebirths: 0, simSeconds: 0, bonus: 0, firstJump: 0 }
        const reached = new Map()
        const problems = []
        let lastBest = 0
        let list = []
        let planCash = -1
        let needPlan = true
        let sinceBuy = 0
        let arrived = false
        const t0 = performance.now()
        const bad = (msg) => problems.length < 8 && problems.push(`ride ${log.rides}: ${msg}`)
        const note = (what) => {
          for (const z of ZONES) if (z.bonus && !reached.has(z.id) && st.stats.best >= z.s) reached.set(z.id, { ride: log.rides, rebirths: log.rebirths, seconds: log.simSeconds, what })
          if (!log.firstJump && st.stats.jumps > 0) {
            log.firstJump = log.rides
            t.info(`first canyon jump on ride ${log.rides} after ${hours(log.simSeconds)} of riding (${log.rebirths} rebirths)`)
          }
        }

        t.step('rides 1-2 are played for real')
        bot.freeEquip()
        for (let i = 0; i < 2; i++) {
          const run = await driveRun(h, { boostAt: null, maxSeconds: 120 })
          t.ok(run.ended && run.maxS > 20, `real ride ${i + 1}: ${Math.round(run.maxS)} m, banked ${fmt(run.cashAfter - run.cashBefore)}`)
          log.rides++
          log.simSeconds += 25 + run.maxS / 20
        }
        note('real')

        while (log.rides < MAX_RIDES && !arrived) {
          if (log.rides % 20 === 0) {
            await h.pause()
            t.step(`ride ${log.rides} · ${fmt(st.cash)} · best ${st.stats.best} m · rebirths ${st.rebirths} · carts ${S.cartCount()} · ~${hours(log.simSeconds)} played`)
          }
          // Spend: the best-value purchase we can afford.
          let acted = true
          while (acted) {
            acted = false
            if (needPlan || st.cash > planCash * 2) {
              needPlan = false
              bot.freeEquip()
              list = bot.plan(Math.max(st.cash * 4, 500))
              planCash = Math.max(st.cash, 1)
            }
            const pick = list.find((c) => c.price <= st.cash && c.payback <= BUY_PAYBACK * (1 + sinceBuy / 40))
            if (pick) {
              if (pick.buy()) {
                log.buys++
                sinceBuy = 0
                acted = true
                needPlan = true
                list = []
              } else list = list.filter((c) => c !== pick)
            }
          }
          // Rebirth once nothing is worth buying (and it is affordable).
          const rb = bot.rebirthCost()
          const best = list[0]
          if (st.cash >= rb.cost && (!best || best.payback > REBIRTH_PAYBACK)) {
            const before = S.rebirthCash()
            if (bot.rebirth()) {
              log.rebirths++
              t.info(`rebirth ${log.rebirths} on ride ${log.rides} (needed ${fmt(before)}), ~${hours(log.simSeconds)} played, best ${st.stats.best} m`)
              list = []
              needPlan = true
              bot.freeEquip()
              sinceBuy = 0
              continue
            }
          }
          // Ride.
          const r = simRide()
          if (r.distance <= 2 && r.end !== 'crash') {
            // Cannot even move: the bot would be stuck (should never happen with a fuelled cart).
            bad(`the cart cannot move (${r.end})`)
            break
          }
          const before = st.cash
          bank(r)
          if (!(st.cash >= before)) bad(`cash went down after a ride (${before} -> ${st.cash})`)
          if (!Number.isFinite(st.cash) || st.cash < 0) bad(`cash is ${st.cash}`)
          if (st.stats.best < lastBest) bad(`best distance went down (${lastBest} -> ${st.stats.best})`)
          lastBest = st.stats.best
          log.rides++
          sinceBuy++
          log.simSeconds += 25 + r.seconds
          note('sim')
          if (r.end === 'arrived') arrived = true
        }
        const wall = (performance.now() - t0) / 1000

        t.ok(problems.length === 0, problems.length ? `save problems: ${problems.join(' | ')}` : 'cash never dropped, best never went down, every payout was a sane number')
        t.ok(arrived, arrived ? `reached Golden Station on ride ${log.rides}` : `did NOT reach Golden Station in ${MAX_RIDES} rides (best ${st.stats.best} m of ${TRACK.length}, ${st.rebirths} rebirths)`)
        for (const z of ZONES.filter((x) => x.bonus)) {
          const r = reached.get(z.id)
          t.ok(!!r, r ? `${z.name}: first reached on ride ${r.ride} (${r.rebirths} rebirths, ~${hours(r.seconds)} played)` : `${z.name} was never reached`)
        }
        t.info(`${log.rides} rides, ${log.buys} purchases, ${log.rebirths} rebirths, ~${hours(log.simSeconds)} of play at ~25 s overhead per ride; ${wall.toFixed(1)} s to simulate`)
        t.ok(Object.keys(st.upgrades).length === UPGRADES.length, 'every Cart Upgrade is tracked in the save')
        t.info(`final: ${fmt(st.cash)} cash, upgrades ${UPGRADES.map((u) => `${u.name} ${S.upgradeLevel(u.id)}/${u.max}`).join(', ')}`)

        if (arrived) {
          t.step('the bot cart drives the line for real')
          // The line has random events (wind gusts on the Sky Trestle, the Golden Ticket...), so a
          // careful player gets a second try if one catches the cart out; both tries are reported.
          let w = { end: false }
          let run = null
          for (let attempt = 1; attempt <= 2; attempt++) {
            w = { end: false }
            run = await driveRun(h, { maxSeconds: 300, onFrame: () => (w.end ||= h.banner().includes('END OF THE LINE')) })
            if (run.maxS > TRACK.station) break
            t.info(`attempt ${attempt}: the real ride stopped at ${Math.round(run.maxS)} m: ${JSON.stringify(run.last)}, waited ${run.waited.toFixed(1)} s at blocked lines`)
            if (h.ride.mode === 'crashed') h.ride.restart()
            await h.frames(2)
          }
          t.ok(run.ended && run.maxS > TRACK.station, `real ride with the bot cart: ${Math.round(run.maxS)} m, past the station platform at ${TRACK.station} m`)
          t.ok(w.end, 'END OF THE LINE banner showed')
        }
      },
    },
  ],
}
