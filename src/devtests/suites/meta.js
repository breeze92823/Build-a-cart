// Rebirth, the daily gift, the Lucky Wheel, Quests (daily, weekly, stars and levels), Save Slots
// and the save itself. Every number comes from config.js.
import { ECONOMY, GEAR, QUESTS, REBIRTH, SAVE_SLOTS, UPGRADES, WHEEL } from '../../config.js'
import { fmt } from '../../track.js'
import { driveRun } from '../drive.js'

const gearById = Object.fromEntries(GEAR.map((g) => [g.id, g]))
const totalOwned = (h) => Object.values(h.state.owned).reduce((a, n) => a + n, 0)

export default {
  name: 'Progress & extras',
  tests: [
    {
      name: 'Rebirth: requirements grow, refusals, then a real rebirth resets and rewards correctly',
      async fn(t) {
        const h = t.h
        await h.reset()
        const S = h.S
        for (let r = 0; r < 6; r++) {
          h.state.rebirths = r
          t.ok(S.rebirthCash() === REBIRTH.cash(r) && S.rebirthCarts() === REBIRTH.carts(r), `rebirth ${r + 1} needs ${fmt(REBIRTH.cash(r))} and ${REBIRTH.carts(r)} carts`)
        }
        h.state.rebirths = 0
        t.gt(REBIRTH.cash(1), REBIRTH.cash(0), 'each rebirth costs more cash than the last')
        // A player with stuff worth resetting.
        h.give('v12')
        h.state.upgrades[UPGRADES[0].id] = 3
        h.state.upgrades.cur = 5
        h.state.passes = ['trader']
        h.state.stats.rides = 7
        h.state.topRuns = [{ d: 123, cash: 4 }]
        await h.openByHud('rebirth', 'rebirth')
        const go = () => h.$('.rb-btns .pbtn.go')
        t.step('too little cash')
        h.state.wagons = REBIRTH.carts(0)
        h.setCash(REBIRTH.cash(0) - 1)
        await h.frames(2)
        await h.click(go(), 'Rebirth button')
        t.eq(h.state.rebirths, 0, 'one dollar short: refused')
        t.step('cash but too few carts')
        h.state.wagons = 0
        h.setCash(REBIRTH.cash(0))
        await h.frames(2)
        await h.click(go(), 'Rebirth button')
        t.eq(h.state.rebirths, 0, 'cash but only one cart: refused')
        t.ok(h.toasts().some((s) => s.includes('carts')), 'a "Need N carts" toast shows')
        t.step('everything ready')
        h.state.wagons = REBIRTH.carts(0) - 1
        h.setCash(REBIRTH.cash(0))
        await h.frames(2)
        t.ok(h.$('.side-btn.rebirth .badge.on'), 'the REBIRTH button shows its "!" badge')
        const discovered = [...h.state.discovered]
        await h.click(go(), 'Rebirth button')
        t.eq(h.state.rebirths, 1, 'rebirth count is 1')
        t.eq(h.state.goldenCarts, 1, 'the player got a Golden Cart')
        t.eq(h.state.cash, 0, 'cash was reset')
        t.eq(h.state.wagons, 0, 'extra carts were reset')
        t.ok(Object.values(h.state.upgrades).every((l) => l === 0), 'Cart Upgrades were reset')
        t.ok(!(h.state.owned.v12 > 0), 'gear was reset')
        t.ok(h.state.owned[REBIRTH.engine] > 0, `the free ${gearById[REBIRTH.engine].name} was given`)
        t.eq(h.state.equipped.engine, REBIRTH.engine, 'and it is on the cart')
        t.eq(h.state.passes, ['trader'], 'passes are kept')
        t.eq(h.state.stats.rides, 7, 'stats are kept')
        t.eq(h.state.topRuns.length, 1, 'the record board is kept')
        t.ok(discovered.every((id) => h.state.discovered.includes(id)), 'the Index discoveries are kept')
        t.near(h.S.cashMultiplier(), (1 + ECONOMY.goldenCash) * (1 + REBIRTH.cashStep) * 1, 1e-9, 'run cash x(golden cart) x(rebirth step)')
        t.eq(h.win(), '', 'the window closed')
        t.step('the Skip button rebirths without the carts for a markup')
        await h.openByHud('rebirth', 'rebirth')
        t.eq(h.S.skipPrice(), Math.round(REBIRTH.cash(1) * REBIRTH.skipMarkup), `Skip costs ${REBIRTH.skipMarkup}x the cash: ${fmt(h.S.skipPrice())}`)
        h.setCash(h.S.skipPrice() - 1)
        await h.frames(2)
        await h.click(h.$('.rb-btns .pbtn.pink'), 'Skip button')
        t.eq(h.state.rebirths, 1, 'a dollar short: Skip refused')
        h.setCash(h.S.skipPrice())
        await h.frames(2)
        await h.click(h.$('.rb-btns .pbtn.pink'), 'Skip button')
        t.eq(h.state.rebirths, 2, 'Skip rebirths with just one cart')
        t.eq(h.state.goldenCarts, 2, 'a second Golden Cart')
      },
    },
    {
      name: 'Rebirth tiers unlock exactly the Shop items that ask for them',
      async fn(t) {
        const h = t.h
        await h.reset()
        const tiers = [...new Set(h.S.SHOP_LIST.map((g) => g.reb))].sort((a, b) => a - b)
        for (const r of tiers) {
          h.state.rebirths = r
          const wrong = h.S.SHOP_LIST.filter((g) => h.S.shopLocked(g) !== g.reb > r)
          t.ok(wrong.length === 0, `with ${r} rebirth(s): ${h.S.SHOP_LIST.filter((g) => g.reb <= r).length} items open, the rest locked`)
        }
        t.ok(tiers.length > 1, `the Shop has ${tiers.length} rebirth tiers (${tiers.join(', ')})`)
        const sold = new Set(h.S.SHOP_LIST.map((g) => g.id))
        const orphan = GEAR.filter((g) => !g.shop && !g.starter && !g.special && !sold.has(g.id) && g.type !== 'wheels' && g.type !== 'booster')
        t.ok(orphan.every((g) => g.price > 0), `${orphan.length} gear pieces are not sold: they come from Mystery Dice and the Lucky Wheel`)
      },
    },
    {
      name: 'Daily Gift pad: claim once, then it is on cooldown',
      async fn(t) {
        const h = t.h
        await h.reset()
        const sp = h.game.cave.spots.gift
        const c0 = h.state.cash
        await h.stand(sp.x, sp.z, 'Daily Gift')
        t.ok(h.prompt().sub.includes('Claim'), `the prompt says "${h.prompt().sub}"`)
        await h.holdE(() => h.state.cash > c0, 2)
        t.eq(h.state.cash - c0, ECONOMY.dailyGift, `the gift paid ${fmt(ECONOMY.dailyGift)}`)
        t.ok(h.toasts().some((s) => s.includes('Daily Gift')), 'a toast shows')
        await h.frames(3)
        t.ok(h.prompt().deny && h.prompt().sub.includes('Back in'), `afterwards the prompt says "${h.prompt().sub}"`)
        const c1 = h.state.cash
        await h.holdE(() => h.state.cash > c1, 1.5)
        t.eq(h.state.cash, c1, 'a second claim pays nothing')
        t.near(h.S.giftLeft(), ECONOMY.dailyEvery, 5, 'the cooldown is a day')
      },
    },
    {
      name: 'Lucky Wheel: HUD timer, hold E to spin, the prize is awarded, the next spin is on a timer',
      timeout: 180000,
      async fn(t) {
        const h = t.h
        await h.reset()
        const sp = h.game.cave.spots.wheel
        t.ok(h.S.spinLeft() > 0, 'a new player has to wait for the first free spin')
        await h.click(h.$('.wheel-timer'), 'wheel timer')
        t.ok(h.toasts().some((s) => s.includes('Next free spin')), 'tapping the timer early says when the next spin is')
        const kinds = new Set()
        for (let i = 0; i < 12; i++) {
          h.state.spinAt = 0
          await h.frames(20)
          if (i === 0) t.ok(h.text(h.$('.wheel-timer')).includes('SPIN'), 'the HUD timer says SPIN! when a spin is ready')
          await h.stand(sp.x, sp.z, 'Lucky Wheel')
          const before = { cash: h.state.cash, fuel: h.state.fuelNextRun, boost: h.state.cashBoostUntil, owned: totalOwned(h), spins: h.state.stats.spins }
          await h.holdE(() => h.state.stats.spins > before.spins, 2)
          if (h.state.stats.spins !== before.spins + 1) {
            t.fail(`spin ${i + 1}: holding E did not start a spin`)
            continue
          }
          h.clearToasts()
          const won = await h.until(() => h.toasts().some((s) => s.includes('Lucky Wheel:')), WHEEL.spinTime + 2)
          const prize = h.toasts().find((s) => s.includes('Lucky Wheel:')) ?? ''
          const effect = h.state.cash > before.cash ? 'cash' : h.state.fuelNextRun && !before.fuel ? 'fuel' : h.state.cashBoostUntil > before.boost ? 'boost' : totalOwned(h) > before.owned ? 'gear' : 'none'
          kinds.add(effect)
          if (!won || effect === 'none') t.fail(`spin ${i + 1}: prize "${prize}" had no effect on the save`)
          if (h.S.spinLeft() < WHEEL.every - 5) t.fail(`spin ${i + 1}: next spin is in ${Math.round(h.S.spinLeft())}s, expected ${WHEEL.every}s`)
          h.state.fuelNextRun = false
          await h.frames(5)
        }
        t.ok(kinds.size >= 2, `12 spins gave ${[...kinds].join(', ')} prizes, each applied to the save`)
        t.eq(h.state.stats.spins, 12, 'spins counter is 12')
        await h.frames(3)
        t.ok(h.prompt().deny, 'the wheel prompt is greyed while the timer runs')
      },
    },
    {
      name: 'Quests window: five Daily and five Weekly, progress from real play, SKIP, stars, levels, REFRESH',
      timeout: 120000,
      async fn(t) {
        const h = t.h
        const S = h.S
        await h.reset({ quests: true })
        await h.openByHud('quests', 'quests')
        const tabs = h.$$('.qs-tab')
        t.eq(tabs.length, 2, 'Daily and Weekly tabs')
        t.eq(h.$$('.qs-row').length, QUESTS.count, `${QUESTS.count} daily quests`)
        await h.click(tabs[1], 'Weekly tab')
        t.eq(h.$$('.qs-row').length, QUESTS.count, `${QUESTS.count} weekly quests`)
        t.ok(h.text(h.$('.lw-sub')).includes('Refreshes In'), 'a refresh countdown is shown')
        await h.click(h.$$('.qs-tab')[0], 'Daily tab')
        await h.closeWin()

        t.step('real play moves the counters')
        const run = await driveRun(h, { boostAt: null })
        const p = h.state.quests.daily.progress
        t.eq(p.rides, 1, 'a ride counts as 1 Ride')
        t.eq(p.distance, Math.round(run.maxS), `the ride counted ${Math.round(run.maxS)} studs of distance`)
        t.eq(p.cash, run.cashAfter - run.cashBefore, 'and the cash it earned')
        t.ok(h.state.quests.weekly.progress.rides === 1, 'the Weekly tab counts it too')
        h.setCash(1e8)
        S.buyUpgrade(UPGRADES[0].id)
        S.buyUpgrade(UPGRADES[UPGRADES.length - 1].id)
        t.eq(h.state.quests.daily.progress.upgrades, 2, 'two Cart Upgrades counted')

        t.step('SKIP every daily quest')
        h.setCash(1e8)
        await h.openByHud('quests', 'quests')
        const rows = S.questRows('daily').map((r) => ({ ...r }))
        const owned0 = totalOwned(h)
        let expectCash = 1e8
        let stars = h.state.stars
        const level0 = h.state.questLevel
        for (const [i, r] of rows.entries()) {
          if (r.done) continue
          const price = S.skipQuestPrice(r.id)
          const before = h.state.cash
          const lvlBefore = h.state.questLevel
          await h.click(h.$$('.qs-row .qs-skip')[i], `SKIP on ${r.name}`)
          stars += QUESTS.daily.stars
          // Reaching a new star level pays its cash at the same moment.
          let lvlCash = 0
          for (let l = lvlBefore + 1; l <= h.state.questLevel; l++) lvlCash += S.levelReward(l)?.cash ?? 0
          t.eq(h.state.cash - before, r.reward - price + lvlCash, `${r.name}: SKIP cost ${fmt(price)} and paid its ${fmt(r.reward)} reward${lvlCash ? ` + ${fmt(lvlCash)} level reward` : ''}`)
          expectCash += r.reward - price + lvlCash
          t.ok(S.questRows('daily')[i].done, `${r.name} is marked done`)
          t.eq(h.state.stars, stars, `${r.name}: +${QUESTS.daily.stars} stars (${stars} total)`)
        }
        const level = S.levelFor(h.state.stars)
        t.eq(h.state.questLevel, level, `${h.state.stars} stars = quest level ${level}`)
        t.ok(level > level0, 'the player levelled up')
        let levelCash = 0
        let dice = 0
        for (let l = level0 + 1; l <= level; l++) {
          const r = S.levelReward(l)
          levelCash += r?.cash ?? 0
          dice += r?.dice ?? 0
        }
        t.eq(h.state.cash, expectCash, `level rewards added ${fmt(levelCash)} cash in total`)
        t.eq(totalOwned(h) - owned0, dice, `and ${dice} Mystery Dice gear piece(s)`)
        const slotLevels = Array.from({ length: level - level0 }, (_, k) => S.levelReward(level0 + 1 + k)?.slot).filter(Boolean).length
        t.eq(h.state.slotsOpen.length, Math.min(slotLevels, SAVE_SLOTS.quest), `${slotLevels} quest Save Slot(s) unlocked`)
        t.ok(h.text(h.$('.qs-stars')).includes(h.state.stars.toLocaleString('en-US')), 'the star total is shown in the window')

        t.step('REFRESH QUESTS')
        await h.click(h.$$('.qs-tab')[1], 'Weekly tab')
        const price = S.refreshQuestPrice('weekly')
        h.setCash(price - 1)
        await h.frames(2)
        await h.click(h.btn('REFRESH'), 'REFRESH')
        t.ok(h.toasts().some((s) => s.includes('Refreshing costs')), 'without the cash REFRESH is refused')
        h.setCash(price)
        await h.frames(2)
        const idsBefore = S.questRows('weekly').map((r) => r.id)
        await h.click(h.btn('REFRESH'), 'REFRESH')
        await h.frames(5)
        t.eq(h.state.cash, 0, `REFRESH cost ${fmt(price)}`)
        t.eq(S.questRows('weekly').length, QUESTS.count, 'still five weekly quests')
        if (!S.usesServerSchedule()) t.ok(S.questRows('weekly').map((r) => r.id).join() !== idsBefore.join(), 'the unfinished weekly quests were re-rolled')
        await h.click(h.$$('.qs-tab')[0], 'Daily tab')
        h.setCash(1e6)
        await h.frames(2)
        await h.click(h.btn('REFRESH'), 'REFRESH')
        t.ok(h.toasts().some((s) => s.includes('All quests are done')), 'with every daily quest done, REFRESH says so and takes nothing')
        await h.closeWin()
      },
    },
    {
      name: 'Save Slots: save a cart, change it, load it back; unlock locked slots for their price',
      async fn(t) {
        const h = t.h
        await h.reset()
        const S = h.S
        h.give('rubber')
        await h.openByHud('saves', 'saves')
        t.eq(h.$$('.sv-slot').length, SAVE_SLOTS.total, `${SAVE_SLOTS.total} slots`)
        const tiles = () => h.$$('.sv-slot')
        const free = tiles().filter((s) => h.btn('Save', s))
        t.eq(free.length, SAVE_SLOTS.free, `${SAVE_SLOTS.free} slots are open from the start`)
        t.ok(tiles()[0].querySelector('.pbtn.green').disabled, 'Load is greyed out on an empty slot')
        await h.click(h.btn('Save', tiles()[0]), 'Save on slot 1')
        t.eq(h.state.loadouts[0], h.state.equipped, 'slot 1 holds the starter cart')
        S.equip('rubber')
        await h.frames(2)
        await h.click(h.btn('Save', tiles()[1]), 'Save on slot 2')
        t.eq(h.state.loadouts[1].wheels, 'rubber', 'slot 2 holds the rubber-wheel cart')
        await h.click(h.btn('Load', tiles()[0]), 'Load on slot 1')
        t.eq(h.state.equipped.wheels, 'wooden', 'loading slot 1 puts the Wooden Wheels back')
        await h.click(h.btn('Load', tiles()[1]), 'Load on slot 2')
        t.eq(h.state.equipped.wheels, 'rubber', 'loading slot 2 puts the Rubber Wheels back')
        // The slots live in the save (and so in the backend): a reload keeps them and they still load.
        const saved = JSON.parse(JSON.stringify(S.snapshot()))
        S.hydrate(saved)
        t.eq(h.state.loadouts[0].wheels, 'wooden', 'after a reload slot 1 still holds the Wooden Wheels cart')
        t.eq(h.state.loadouts[1].wheels, 'rubber', 'after a reload slot 2 still holds the Rubber Wheels cart')
        S.equip('wooden')
        t.ok(S.loadLoadout(1), 'a reloaded slot loads')
        t.eq(h.state.equipped.wheels, 'rubber', 'and puts its cart back on')
        // Locked slots.
        const q = SAVE_SLOTS.free
        const c = SAVE_SLOTS.free + SAVE_SLOTS.quest
        h.setCash(SAVE_SLOTS.questPrice - 1)
        await h.frames(2)
        await h.click(h.btn('Unlock', tiles()[q]), 'Unlock on a quest slot')
        t.ok(!S.slotOpen(q), 'a dollar short: the quest slot stays locked')
        h.setCash(SAVE_SLOTS.questPrice)
        await h.frames(2)
        await h.click(h.btn('Unlock', tiles()[q]), 'Unlock on a quest slot')
        t.ok(S.slotOpen(q), `the quest slot unlocks for ${fmt(SAVE_SLOTS.questPrice)}`)
        t.eq(h.state.cash, 0, 'exactly that was taken')
        await h.click(h.btn('Save', tiles()[q]), 'Save on the new slot')
        t.ok(h.state.loadouts[q], 'and it can hold a cart')
        h.setCash(SAVE_SLOTS.cashPrice)
        await h.frames(2)
        await h.click(tiles()[c].querySelector('.pbtn'), 'Unlock on a Cash slot')
        t.ok(S.slotOpen(c), `a Cash slot unlocks for ${fmt(SAVE_SLOTS.cashPrice)}`)
        t.eq(h.state.cash, 0, 'exactly that was taken')
        const muted = h.text(h.btn('Sound'))
        await h.click(h.btn('Sound'), 'Sound toggle')
        t.ok(h.text(h.btn('Sound')) !== muted, `the Sound button toggles (${muted} -> ${h.text(h.btn('Sound'))})`)
        await h.click(h.btn('Sound'), 'Sound toggle')
        await h.closeWin()
      },
    },
    {
      name: 'The save: snapshot and reload give the same player; broken saves fall back to safe values',
      async fn(t) {
        const h = t.h
        await h.reset()
        const S = h.S
        h.setCash(12345)
        h.give('v12', 2)
        h.give('giantfuel')
        h.gear({ wheels: 'sport', engine: 'v12' })
        for (const u of UPGRADES) h.state.upgrades[u.id] = 3
        h.state.wagons = 4
        h.state.rebirths = 1
        h.state.goldenCarts = 1
        h.state.passes = ['cash2']
        h.state.stars = 40
        h.S.saveLoadout(0)
        h.state.stats.rides = 9
        const snap = S.snapshot()
        const wire = JSON.parse(JSON.stringify(snap))
        S.resetSave()
        t.eq(h.state.cash, ECONOMY.startCash, 'a reset puts a new player back')
        S.hydrate(wire)
        t.eq(S.snapshot(), snap, 'loading the saved copy restores every field')
        S.hydrate({ cash: 'lots', owned: { nonexistent: 5, v12: -3 }, equipped: { engine: 'nonexistent' }, wagons: 9999, upgrades: { [UPGRADES[0].id]: 9999, nope: 1 }, passes: ['nope'] })
        t.eq(h.state.cash, ECONOMY.startCash, 'a non-number cash falls back to the start cash')
        t.ok(!('nonexistent' in h.state.owned), 'gear from an old catalogue is dropped')
        t.eq(h.state.equipped.engine, 'rusty', 'an unknown equipped part falls back to the starter')
        t.eq(h.state.wagons, ECONOMY.maxWagons, 'extra carts are capped')
        t.eq(h.state.upgrades[UPGRADES[0].id], UPGRADES[0].max, 'upgrade levels are capped at their max')
        t.eq(h.state.passes, [], 'unknown passes are dropped')
        S.hydrate(null)
        t.eq(h.state.cash, ECONOMY.startCash, 'no save at all = a new player')
      },
    },
  ],
}
