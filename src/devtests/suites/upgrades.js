// The Cart Upgrades stall: every upgrade, every level. Nothing here hard-codes a price or a
// count: it all comes from UPGRADES in config.js, so a balance change never breaks the tests.
import { CART, ECONOMY, REBIRTH, UPGRADES, UPGRADE_BULK } from '../../config.js'
import { fmt } from '../../track.js'

const cash = UPGRADES.filter((u) => u.kind === 'cash')
const cart = UPGRADES.filter((u) => u.kind === 'cart')
const byId = Object.fromEntries(UPGRADES.map((u) => [u.id, u]))
const openStall = async (h) => {
  const st = h.game.tracks.spots.stall
  await h.use(st.x, st.z, 'Cart Upgrades', () => h.win() === 'cartUpgrades')
}
const money = (h, n) => `$${h.W.short(n)}`

export default {
  name: 'Cart Upgrades',
  tests: [
    {
      name: 'Config sanity: prices rise, values improve, tables are complete',
      async fn(t) {
        for (const u of UPGRADES) {
          let prevPrice = 0
          let prevValue = u.value(0)
          let ok = true
          for (let l = 0; l < u.max; l++) {
            const p = u.price(l)
            const v = u.value(l + 1)
            if (!(p > prevPrice) || !Number.isFinite(p)) ok = false
            // Distance Per Currency and Aerodynamics get smaller as they improve.
            const lowerIsBetter = u.id === 'dist' || u.stat === 'aero'
            if (!Number.isFinite(v) || (lowerIsBetter ? !(v < prevValue) : !(v > prevValue))) ok = false
            prevPrice = p
            prevValue = v
          }
          t.ok(ok, `${u.name}: ${u.max} levels, each priced above the last and each value better than the last`)
        }
        t.ok(cash.length > 0 && cart.length >= 0, `${cash.length} cash upgrades and ${cart.length} cart upgrades`)
      },
    },
    {
      name: 'Walk to the base stall, hold E, the window lists every upgrade',
      async fn(t) {
        const h = t.h
        await h.reset()
        await openStall(h)
        const rows = h.$$('.up-row')
        t.eq(rows.length, UPGRADES.length, `${UPGRADES.length} upgrade rows`)
        for (const [i, u] of UPGRADES.entries()) {
          const row = rows[i]
          t.ok(h.text(row).includes(u.name.split(' ')[0]), `row ${i + 1} is "${u.name}"`)
          t.ok(h.text(row).includes(u.text(u.value(0))) && h.text(row).includes(u.text(u.value(1))), `${u.name} shows ${u.text(u.value(0))} ➜ ${u.text(u.value(1))}`)
          const btns = h.$$('.pbtn', row)
          t.eq(btns.length, 2, `${u.name} has a buy-1 and a buy-${UPGRADE_BULK} button`)
          t.ok(h.text(btns[0]).includes(money(h, u.price(0))), `${u.name}: the buy button shows ${money(h, u.price(0))}`)
        }
        await h.closeWin()
      },
    },
    {
      name: 'Buying one level: cash, level, HUD and toast update; too little cash is refused',
      async fn(t) {
        const h = t.h
        await h.reset()
        await openStall(h)
        h.setCash(1e7)
        await h.frames(2)
        let bought = 0
        for (const [i, u] of UPGRADES.entries()) {
          const before = h.state.cash
          await h.click(h.$$('.up-row .pbtn.green')[i * 2], `${u.name} buy button`)
          bought++
          t.eq(h.S.upgradeLevel(u.id), 1, `${u.name} is level 1 after one click`)
          t.eq(h.state.cash, before - u.price(0), `${u.name} cost exactly ${fmt(u.price(0))}`)
          t.eq(h.shownCash(), h.state.cash, 'the HUD cash matches')
          t.ok(h.toasts().some((s) => s.includes(u.name)), `a toast names ${u.name}`)
        }
        t.eq(h.state.stats.upgradesBought, bought, `the upgrades-bought counter is ${bought}`)
        h.setCash(0)
        await h.frames(2)
        await h.click(h.$$('.up-row .pbtn.green')[0], 'buy button')
        t.eq(h.S.upgradeLevel(UPGRADES[0].id), 1, 'with $0 the purchase is refused (level unchanged)')
        t.ok(h.toasts().some((s) => s.includes('Not enough cash')), 'and a "Not enough cash!" toast shows')
        t.eq(h.state.cash, 0, 'no cash was taken')
        await h.closeWin()
      },
    },
    {
      name: 'Every level of every upgrade, bought through the window at its exact price',
      timeout: 240000,
      async fn(t) {
        const h = t.h
        await h.reset()
        await openStall(h)
        for (const [i, u] of UPGRADES.entries()) {
          let bad = 0
          for (let l = 0; l < u.max; l++) {
            const price = u.price(l)
            // One dollar short: refused (prices past 2^53 cannot show a dollar: use a hair under instead).
            const short = price > 2 ** 50 ? price * 0.999 : price - 1
            h.setCash(short)
            await h.frames(1)
            const buy = h.$('.pbtn.green', h.$$('.up-row')[i])
            if (h.text(buy) !== money(h, price)) {
              bad++
              t.fail(`${u.name} level ${l + 1}: button shows ${h.text(buy)}, expected ${money(h, price)}`)
            }
            buy.click()
            await h.frames(1)
            if (h.S.upgradeLevel(u.id) !== l) {
              bad++
              t.fail(`${u.name} level ${l + 1}: bought with $${short} (price ${price})`)
            }
            // The exact price: bought.
            h.setCash(price)
            await h.frames(1)
            h.$('.pbtn.green', h.$$('.up-row')[i]).click()
            await h.frames(1)
            if (h.S.upgradeLevel(u.id) !== l + 1 || h.state.cash !== 0) {
              bad++
              t.fail(`${u.name} level ${l + 1}: level ${h.S.upgradeLevel(u.id)}, cash left ${h.state.cash} (expected ${l + 1}, $0)`)
            }
            if (!h.text(h.$$('.up-row')[i]).includes(u.text(u.value(l + 1)))) {
              bad++
              t.fail(`${u.name} level ${l + 1}: the row does not show ${u.text(u.value(l + 1))}`)
            }
          }
          t.ok(bad === 0, `${u.name}: all ${u.max} levels bought at their exact price and refused $1 short`)
          const row = h.$$('.up-row')[i]
          t.ok(h.text(row).includes('MAXED'), `${u.name} shows MAXED at level ${u.max}`)
          t.eq(h.$$('.pbtn', row).length, 0, `${u.name} has no buy buttons at the max`)
          t.eq(h.S.buyUpgrade(u.id), 'max', `${u.name} cannot be bought past the max`)
        }
        t.eq(h.state.stats.upgradesBought, UPGRADES.reduce((a, u) => a + u.max, 0), 'the upgrades-bought counter counts every level')
        await h.closeWin()
      },
    },
    {
      name: `The bulk button buys ${UPGRADE_BULK} levels (fewer near the max) for the summed price`,
      async fn(t) {
        const h = t.h
        await h.reset()
        await openStall(h)
        h.setCash(1e12)
        await h.frames(2)
        const i = UPGRADES.findIndex((u) => u.max >= UPGRADE_BULK * 2)
        const u = UPGRADES[i]
        const want = Array.from({ length: UPGRADE_BULK }, (_, k) => u.price(k)).reduce((a, b) => a + b, 0)
        await h.click(h.$$('.up-row .pbtn.green')[i * 2 + 1], `${u.name} bulk button`)
        t.eq(h.S.upgradeLevel(u.id), UPGRADE_BULK, `${u.name} jumps to level ${UPGRADE_BULK}`)
        t.eq(1e12 - h.state.cash, want, 'the bulk price is the sum of the level prices')
        const near = u.max - 2
        h.state.upgrades[u.id] = near
        h.S.changed('upgrade')
        await h.frames(2)
        const btn = h.$$('.up-row .pbtn.green')[i * 2 + 1]
        t.ok(h.text(btn).startsWith('x2'), `at level ${near} the bulk button says x2 (only two levels left)`)
        await h.click(btn, 'bulk button')
        t.eq(h.S.upgradeLevel(u.id), u.max, `${u.name} reaches the max`)
        await h.closeWin()
      },
    },
    {
      name: 'Cash upgrades feed the run payout formula',
      async fn(t) {
        const h = t.h
        await h.reset()
        const S = h.S
        const L = { dist: 5, mult: 10, cur: 3 }
        const v = (id) => byId[id].value(L[id])
        t.eq(S.runPayout(1000), Math.floor(1000 / byId.dist.value(0)) * byId.cur.value(0) * byId.mult.value(0), 'level 0: floor(distance / per) x currency x multiplier')
        Object.assign(h.state.upgrades, L)
        const base = Math.floor(1000 / v('dist')) * v('cur') * v('mult')
        t.near(S.runPayout(1000), base, 1e-6, `dist L5, mult L10, cur L3 pay ${base} for 1000 m`)
        h.state.wagons = 4
        t.near(S.runPayout(1000), base * (1 + 4 * ECONOMY.wagonCash), 1e-6, `four extra carts add +${4 * ECONOMY.wagonCash * 100}%`)
        h.state.goldenCarts = 2
        const carts = 1 + 4 * ECONOMY.wagonCash + 2 * ECONOMY.goldenCash
        t.near(S.runPayout(1000), base * carts, 1e-6, `two Golden Carts add +${ECONOMY.goldenCash * 100}% each`)
        h.state.rebirths = 2
        t.near(S.runPayout(1000), base * carts * (1 + 2 * REBIRTH.cashStep), 1e-6, 'each rebirth adds its cash step')
        h.state.passes = ['cash2']
        t.near(S.runPayout(1000), base * carts * (1 + 2 * REBIRTH.cashStep) * 2, 1e-6, 'the 2x Cash pass doubles it')
        t.near(S.runPayout(1000, 1.5), base * carts * (1 + 2 * REBIRTH.cashStep) * 2 * 1.5, 1e-6, 'a Thunderstorm (x1.5) multiplies on top')
        h.state.cashBoostUntil = Date.now() / 1000 + 100
        t.near(S.runPayout(1000), base * carts * (1 + 2 * REBIRTH.cashStep) * 4, 1e-6, 'the wheel 2x boost doubles again')
      },
    },
    {
      name: 'Cart upgrades change the cart stats (power, fuel tank, aerodynamics)',
      async fn(t) {
        const h = t.h
        await h.reset()
        const S = h.S
        const base = S.currentStats()
        for (const u of cart) {
          h.state.upgrades[u.id] = 10
          const now = S.currentStats()
          const k = u.value(10)
          if (u.stat === 'power') t.near(now.accel, base.accel * k, 1e-9, `${u.name} L10 multiplies thrust by ${k}`)
          else if (u.stat === 'tankMul') t.near(now.tank, base.tank * k, 1e-9, `${u.name} L10 multiplies the tank by ${k}`)
          else if (u.stat === 'aero') {
            t.near(now.drag, base.drag * k, 1e-12, `${u.name} L10 scales air drag by ${k}`)
            t.near(now.roll, base.roll * k, 1e-9, `${u.name} L10 scales rolling resistance by ${k}`)
          } else t.info(`${u.name} (stat ${u.stat}) is a new kind of cart upgrade with no dedicated check`)
          h.state.upgrades[u.id] = 0
        }
        // Extra carts are fuel wagons: more tank, a little less thrust.
        h.state.wagons = 5
        const w = S.currentStats()
        t.near(w.tank, base.tank * (1 + 5 * CART.wagonFuel), 1e-9, `5 extra carts add +${5 * CART.wagonFuel * 100}% tank`)
        t.near(w.accel, base.accel / (1 + 5 * CART.wagonMass), 1e-9, 'and weigh down the thrust')
      },
    },
  ],
}
