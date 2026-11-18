// Gear: the cave Shop, carrying parts to the cart, selling, the backpack, the Index, the bundle
// pads, the passes and the +1 Cart pad. Prices and stock come from config.js and state.js.
import { BUNDLES, ECONOMY, GEAR, INDEX_TABS, PASSES, RESTOCK, WHEEL } from '../../config.js'
import { fmt } from '../../track.js'

const gearById = Object.fromEntries(GEAR.map((g) => [g.id, g]))
const openShopStall = async (h) => {
  const sp = h.game.cave.spots.upgrades
  await h.use(sp.x, sp.z, 'Shop', () => h.win() === 'stock')
}
const rowFor = (h, g) => h.$$('.rs-row').find((r) => h.text(h.$('.rs-name', r)) === g.name)
// Buys through the row: green (stock) or pink (instant) button. Returns the price the game should charge.
async function buyRow(h, g, instant) {
  const row = rowFor(h, g)
  if (!row) throw new Error(`no Shop row for ${g.name}`)
  const btn = h.$(instant ? '.pbtn.pink' : '.pbtn.green', row)
  if (!btn) throw new Error(`no ${instant ? 'instant' : 'stock'} button on the ${g.name} row`)
  await h.click(btn, `${g.name} button`)
}
const stocked = (h, pred) => h.S.SHOP_LIST.find((g) => !h.S.shopLocked(g) && h.S.stock()[g.id] > 0 && pred(g))
const unstocked = (h) => h.S.SHOP_LIST.find((g) => !h.S.shopLocked(g) && h.S.stock()[g.id] === 0)

export default {
  name: 'Gear & shops',
  tests: [
    {
      name: 'Shop stall (cave): lists every item with its stock, rebirth locks and prices',
      async fn(t) {
        const h = t.h
        await h.reset()
        await openShopStall(h)
        const left = h.S.stock()
        const rows = h.$$('.rs-row')
        t.eq(rows.length, h.S.SHOP_LIST.length, `${h.S.SHOP_LIST.length} rows, one per item the Shop sells`)
        let mismatches = 0
        for (const g of h.S.SHOP_LIST) {
          const row = rowFor(h, g)
          if (!row) {
            mismatches++
            t.fail(`missing row for ${g.name}`)
            continue
          }
          const txt = h.text(row)
          if (!txt.includes(`X${left[g.id]} stock`)) mismatches++, t.fail(`${g.name}: shows the wrong stock (should be X${left[g.id]})`)
          if (g.reb > 0 && !h.$('.rs-lock', row)) mismatches++, t.fail(`${g.name}: needs ${g.reb} rebirths but is not marked locked`)
          if (!txt.includes(fmt(h.S.instantPrice(g)))) mismatches++, t.fail(`${g.name}: instant price ${fmt(h.S.instantPrice(g))} not shown`)
        }
        t.ok(mismatches === 0, 'every row shows its stock, its lock and its instant price')
        for (const id of RESTOCK.always) t.ok(left[id] >= 1, `${gearById[id].name} is always in stock`)
        t.ok(h.text(h.$('.rs-head')).includes('Next restock in'), 'the restock countdown is shown')
        await h.closeWin()
      },
    },
    {
      name: 'Buy a stocked engine: cash, stock, counters, hotbar slot and held in hand',
      async fn(t) {
        const h = t.h
        await h.reset()
        await openShopStall(h)
        const g = stocked(h, (x) => x.type === 'engine' && x.reb === 0 && x.price <= 5000)
        t.ok(g, `an engine in stock to buy: ${g?.name}`)
        h.setCash(g.price * 3)
        await h.frames(2)
        const before = h.S.stock()[g.id]
        await buyRow(h, g, false)
        t.eq(h.state.cash, g.price * 2, `cost exactly ${fmt(g.price)}`)
        t.eq(h.state.owned[g.id], 1, `${g.name} is owned`)
        t.eq(h.S.stock()[g.id], before - 1, 'stock went down by one')
        t.eq(h.state.stats.gearBought, 1, 'gear-bought counter is 1')
        t.ok(h.toasts().some((s) => s.includes(g.name)), 'a "Bought" toast shows')
        t.eq(h.shownCash(), h.state.cash, 'HUD cash matches')
        t.eq(h.carry.held, g.id, 'the part is in the hands of the player')
        t.ok(h.$(`.slot.item[data-id="${g.id}"]`), 'it has a hotbar slot')
        t.eq(h.state.equipped.engine, 'rusty', 'it is NOT on the cart yet (it has to be carried there)')
        await h.closeWin()
      },
    },
    {
      name: 'Carry the part to the cart: ghost prompt, hold E to attach, old part back in the hotbar',
      async fn(t) {
        const h = t.h
        await h.reset()
        const g = h.S.SHOP_LIST.find((x) => x.type === 'engine' && x.reb === 0 && !x.special)
        h.setCash(1e6)
        await openShopStall(h)
        await buyRow(h, g, true)
        await h.closeWin()
        t.eq(h.carry.held, g.id, `holding the ${g.name}`)
        // Far from the cart there is nothing to attach to.
        await h.goto(0, 40)
        t.ok(!h.prompt().on || !h.prompt().title.startsWith('Attach'), 'no Attach prompt far from the cart')
        const mount = new h.V3()
        h.ride.mountPoint('engine', mount)
        await h.goto(mount.x + 2, mount.z)
        const p = h.prompt()
        t.eq(p.title, `Attach ${g.name}`, 'the Attach prompt shows next to the cart')
        t.ok(p.sub.includes('Rusty Motor'), `it says what it replaces: "${p.sub}"`)
        const ok = await h.holdE(() => h.state.equipped.engine === g.id, 3)
        t.ok(ok, 'holding E bolts the engine on')
        t.eq(h.carry.held, null, 'hands are free again')
        t.eq(h.state.equipped.engine, g.id, `${g.name} is the equipped engine`)
        t.ok(h.$('.slot.item[data-id="rusty"]'), 'the replaced Rusty Motor is back in the hotbar')
        t.ok(h.toasts().some((s) => s.includes('attached')), 'an "attached" toast shows')
      },
    },
    {
      name: 'Hotbar: number keys and taps pick a carried part up and put it away',
      async fn(t) {
        const h = t.h
        await h.reset()
        const engine = h.S.SHOP_LIST.find((x) => x.type === 'engine' && x.reb === 0)
        const fuel = h.S.SHOP_LIST.find((x) => x.type === 'fuel' && x.reb === 0)
        h.setCash(1e6)
        await openShopStall(h)
        await buyRow(h, engine, true)
        await buyRow(h, fuel, true)
        await h.closeWin()
        const slots = h.$$('.slot.item')
        t.eq(slots.length, 2, 'two carried parts, two hotbar slots')
        t.eq(h.carry.held, engine.id, 'the first bought part is in hand')
        await h.tap('Digit2')
        t.eq(h.carry.held, null, 'key 2 puts the held part away')
        await h.tap('Digit2')
        t.eq(h.carry.held, h.$$('.slot.item')[0].dataset.id, 'key 2 picks slot 1 up again')
        await h.tap('Digit3')
        t.eq(h.carry.held, h.$$('.slot.item')[1].dataset.id, 'key 3 swaps to slot 2')
        await h.click(h.$$('.slot.item')[1], 'slot 2')
        t.eq(h.carry.held, null, 'tapping the held slot puts it away')
        await h.click(h.$$('.slot.item')[0], 'slot 1')
        t.eq(h.carry.held, h.$$('.slot.item')[0].dataset.id, 'tapping a slot holds that part (touch path)')
      },
    },
    {
      name: 'Instant (pink) buy skips the stock for the marked-up price; a sold-out row refuses the normal buy',
      async fn(t) {
        const h = t.h
        await h.reset()
        h.setCash(1e7)
        await openShopStall(h)
        let g = unstocked(h)
        if (!g) {
          t.info('everything is in stock right now: forcing a sold-out item')
          g = h.S.SHOP_LIST.find((x) => !h.S.shopLocked(x))
          for (let i = 0; i < 30 && h.S.stock()[g.id] > 0; i++) h.S.buyFromStall(g.id)
        }
        const row = rowFor(h, g)
        t.ok(h.$('.pbtn.grey', row) && h.text(h.$('.pbtn.grey', row)).includes('No Stock'), `${g.name} shows a "No Stock" button`)
        const c0 = h.state.cash
        await h.click(h.$('.pbtn.grey', rowFor(h, g)), 'No Stock button')
        t.eq(h.state.cash, c0, 'clicking No Stock takes no cash')
        t.ok(h.toasts().some((s) => s.includes('No stock')), 'a "No stock" toast shows')
        await buyRow(h, g, true)
        t.eq(c0 - h.state.cash, h.S.instantPrice(g), `instant buy cost ${fmt(h.S.instantPrice(g))} (${fmt(g.price)} x markup)`)
        t.eq(h.state.owned[g.id], 1, `${g.name} is owned`)
        t.gt(h.S.instantPrice(g), g.price - 1, 'instant price is not below the normal price')
        await h.closeWin()
      },
    },
    {
      name: 'Rebirth-locked items are refused until the player has the rebirths; poor players are refused',
      async fn(t) {
        const h = t.h
        await h.reset()
        const g = h.S.SHOP_LIST.find((x) => x.reb > 0)
        h.setCash(1e8)
        await openShopStall(h)
        t.ok(h.$('.rs-lock', rowFor(h, g)), `${g.name} is shown locked (${g.reb} rebirth${g.reb > 1 ? 's' : ''})`)
        await buyRow(h, g, true)
        t.ok(!(h.state.owned[g.id] > 0), 'locked: not bought')
        t.eq(h.state.cash, 1e8, 'locked: no cash taken')
        t.ok(h.toasts().some((s) => s.includes('Rebirth')), 'a "Rebirth Required" toast shows')
        h.state.rebirths = g.reb
        h.S.changed('rebirth')
        await h.frames(2)
        t.ok(!h.$('.rs-lock', rowFor(h, g)), 'after the rebirths the lock is gone')
        await buyRow(h, g, true)
        t.eq(h.state.owned[g.id], 1, `${g.name} can be bought now`)
        // Poor.
        h.setCash(0)
        await h.frames(2)
        const cheap = h.S.SHOP_LIST.find((x) => x.reb === 0 && x.price > 0)
        await buyRow(h, cheap, true)
        t.ok(!(h.state.owned[cheap.id] > 0), 'with $0 nothing is bought')
        t.ok(h.toasts().some((s) => s.includes('Not enough cash')), 'a "Not enough cash!" toast shows')
        await h.closeWin()
      },
    },
    {
      name: 'Restock button: costs its price, rolls new stock and clears what was bought',
      async fn(t) {
        const h = t.h
        await h.reset()
        h.setCash(100000)
        await openShopStall(h)
        const g = stocked(h, (x) => x.reb === 0 && x.type !== 'engine' && x.type !== 'fuel')
        await buyRow(h, g, false)
        t.ok(Object.keys(h.state.restock.bought).length > 0, 'a bought item is remembered for this stock')
        const price = h.S.restockPrice()
        const c0 = h.state.cash
        const nonce = h.state.restock.nonce
        const btn = h.$('.rs-head .pbtn.gold')
        t.ok(h.text(btn).includes(`$${h.W.short(price)}`), `the Restock button shows $${h.W.short(price)}`)
        await h.click(btn, 'Restock button')
        t.eq(c0 - h.state.cash, price, 'restock cost its price')
        t.eq(h.state.restock.nonce, nonce + 1, 'the restock counter went up')
        t.eq(h.state.restock.bought, {}, 'bought-this-stock is cleared')
        h.setCash(0)
        await h.frames(2)
        await h.click(h.$('.rs-head .pbtn.gold'), 'Restock button')
        t.eq(h.state.restock.nonce, nonce + 1, 'with $0 the restock is refused')
        await h.closeWin()
      },
    },
    {
      name: 'Every item the Shop sells can be bought through its row at its price',
      timeout: 240000,
      async fn(t) {
        const h = t.h
        await h.reset()
        await openShopStall(h)
        let bad = 0
        for (const g of h.S.SHOP_LIST) {
          h.state.rebirths = g.reb
          h.setCash(1e9)
          await h.frames(1)
          const inStock = h.S.stock()[g.id] > 0
          const want = inStock ? g.price : h.S.instantPrice(g)
          const owned = h.state.owned[g.id] ?? 0
          const bought = h.state.stats.gearBought
          try {
            await buyRow(h, g, !inStock)
          } catch (e) {
            bad++
            t.fail(`${g.name}: ${e.message}`)
            continue
          }
          const paid = 1e9 - h.state.cash
          if (paid !== want || (h.state.owned[g.id] ?? 0) !== owned + 1 || h.state.stats.gearBought !== bought + 1) {
            bad++
            t.fail(`${g.name}: paid ${paid} (expected ${want}), owned ${h.state.owned[g.id] ?? 0} (expected ${owned + 1})`)
          }
          if (h.carry.held) h.carry.hold(h.carry.held)
        }
        t.ok(bad === 0, `all ${h.S.SHOP_LIST.length} Shop items bought at the right price (${h.S.SHOP_LIST.filter((g) => g.reb > 0).length} of them after unlocking by rebirth)`)
        await h.closeWin()
      },
    },
    {
      name: 'Wheels and boosters are fitted straight onto the cart when better',
      async fn(t) {
        const h = t.h
        await h.reset()
        h.setCash(1e7)
        await openShopStall(h)
        const wheels = h.S.SHOP_LIST.find((g) => g.type === 'wheels' && g.reb === 0 && g.roll < 0.55)
        const booster = h.S.SHOP_LIST.find((g) => g.type === 'booster' && g.reb === 0)
        await buyRow(h, wheels, true)
        t.eq(h.state.equipped.wheels, wheels.id, `${wheels.name} are on the cart`)
        await buyRow(h, booster, true)
        t.eq(h.state.equipped.booster, booster.id, `${booster.name} is on the cart`)
        t.eq(h.carry.held, null, 'neither goes to the hands')
        await h.closeWin()
      },
    },
    {
      name: 'Sell Gear pad: spare gear sells for the sell-back share, the cart and starter gear do not',
      async fn(t) {
        const h = t.h
        await h.reset()
        const sp = h.game.cave.spots.sell
        const a = GEAR.find((g) => g.type === 'engine' && !g.starter && g.price > 0)
        const b = GEAR.find((g) => g.type === 'fuel' && !g.starter && g.price > 0)
        h.give(a.id, 2)
        h.give(b.id, 1)
        await h.use(sp.x, sp.z, 'Sell Gear', () => h.win() === 'sell')
        const cards = h.$$('.ui-grid .card')
        t.eq(cards.length, 2, 'two kinds of spare gear are listed (not the starter gear on the cart)')
        t.ok(h.text(h.winEl()).includes(`${Math.round(ECONOMY.sellBack * 100)}% back`), `the window says ${Math.round(ECONOMY.sellBack * 100)}% back`)
        const c0 = h.state.cash
        await h.click(h.btn('Sell', cards[0]), 'Sell button')
        t.eq(h.state.cash - c0, Math.round(a.price * ECONOMY.sellBack), `selling one ${a.name} pays ${fmt(Math.round(a.price * ECONOMY.sellBack))}`)
        t.eq(h.state.owned[a.id], 1, 'one copy left')
        const c1 = h.state.cash
        await h.click(h.btn('Sell all spares'), 'Sell all button')
        t.eq(h.state.cash - c1, Math.round(a.price * ECONOMY.sellBack) + Math.round(b.price * ECONOMY.sellBack), 'Sell all pays for every spare')
        t.eq(h.state.owned.rusty, 1, 'the starter engine was kept')
        t.ok(h.text(h.winEl()).includes('Only spare gear'), 'the window now says there is nothing to sell')
        await h.closeWin()
      },
    },
    {
      name: 'Backpack: equip a spare, trash a spare; starter gear cannot be trashed',
      async fn(t) {
        const h = t.h
        await h.reset()
        const wheels = GEAR.find((g) => g.type === 'wheels' && !g.starter)
        const trash = GEAR.find((g) => g.type === 'booster' && !g.starter)
        h.give(wheels.id)
        h.give(trash.id)
        await h.tap('KeyB')
        t.eq(h.win(), 'backpack', 'B opens the backpack')
        const card = h.$$('.ui-grid .card').find((c) => h.text(c).includes(wheels.name))
        await h.click(h.btn('Equip', card), 'Equip')
        t.eq(h.state.equipped.wheels, wheels.id, `Equip puts the ${wheels.name} on the cart`)
        t.ok(h.$$('.equip-row .card').some((c) => h.text(c).includes(wheels.name)), 'they show up under Equipped')
        const tcard = h.$$('.ui-grid .card').find((c) => h.text(c).includes(trash.name))
        await h.click(h.btn('Trash', tcard), 'Trash')
        t.ok(!(h.state.owned[trash.id] > 0), `${trash.name} was trashed`)
        const starterCard = h.$$('.ui-grid .card').find((c) => h.text(c).includes('Wooden Wheels'))
        t.ok(starterCard && !h.btn('Trash', starterCard), 'the starter Wooden Wheels (now spare) have no Trash button')
        await h.closeWin()
      },
    },
    {
      name: 'Index pad: both tabs, found counts, details of a card',
      async fn(t) {
        const h = t.h
        await h.reset()
        const sp = h.game.cave.spots.index
        await h.use(sp.x, sp.z, 'Index', () => h.win() === 'index')
        for (const tab of INDEX_TABS) {
          await h.click(h.$$('.ix-tab').find((b) => h.text(b) === tab.name), `${tab.name} tab`)
          const items = GEAR.filter((g) => g.type === tab.type)
          const found = items.filter((g) => h.S.isDiscovered(g.id)).length
          t.eq(h.$$('.ix-card').length, items.length, `${tab.name}: ${items.length} cards`)
          t.ok(h.text(h.$('.lw-sub')).includes(`${found}/${items.length}`), `${tab.name}: shows ${found}/${items.length} found`)
          t.eq(h.$$('.ix-card:not(.unknown)').length, found, `${tab.name}: ${found} known cards, the rest are hidden`)
        }
        await h.click(h.$$('.ix-card')[0], 'first card')
        t.ok(h.$('.ix-detail .nm') && !h.text(h.$('.ix-detail .nm')).includes('Select'), 'clicking a card shows its details')
        await h.closeWin()
      },
    },
    ...Object.entries(BUNDLES).map(([key, b]) => ({
      name: `Base pad "${b.name}": confirm window, cash, every item given, HUD offer`,
      async fn(t) {
        const h = t.h
        await h.reset()
        const sp = h.game.tracks.spots[key === 'starter' ? 'starter' : 'v8']
        await h.use(sp.x, sp.z, b.name, () => h.win() === 'bundle')
        t.ok(h.text(h.winEl()).includes(b.name), 'the confirm window names the bundle')
        const buy = h.btn('Buy for')
        t.ok(h.text(buy).includes(fmt(b.price)), `it shows the price ${fmt(b.price)}`)
        await h.click(buy, 'Buy button')
        t.ok(h.toasts().some((s) => s.includes('Not enough cash')), 'with too little cash it is refused')
        h.setCash(b.price + 7)
        await h.frames(2)
        await h.click(h.btn('Buy for'), 'Buy button')
        t.eq(h.state.cash, 7, `it cost ${fmt(b.price)}`)
        for (const id of b.gear) t.ok(h.state.owned[id] > 0, `${gearById[id].name} was given`)
        t.eq(h.win(), '', 'the window closed')
        const better = b.gear.filter((id) => !['engine', 'fuel'].includes(gearById[id].type))
        for (const id of better) t.eq(h.state.equipped[gearById[id].type], id, `${gearById[id].name} went straight onto the cart`)
        if (key === 'starter') t.eq(h.$('.offer').style.display, 'none', 'the STARTER! offer button is hidden once owned')
      },
    })),
    {
      name: 'HUD STARTER! offer button opens the Starter Pack window',
      async fn(t) {
        const h = t.h
        await h.reset()
        t.ok(h.$('.offer').style.display !== 'none', 'the offer button shows for a new player')
        await h.click(h.$('.offer'), 'STARTER! button')
        t.eq(h.win(), 'bundle', 'it opens the bundle window')
        await h.closeWin()
      },
    },
    {
      name: 'SHOP window: bundles and every pass can be bought and take effect',
      async fn(t) {
        const h = t.h
        await h.reset()
        await h.openByHud('shop', 'shop')
        t.ok(h.$$('.ui-grid .card').length >= Object.keys(BUNDLES).length + PASSES.length, 'bundles and passes are listed')
        const card = (name) => h.$$('.ui-grid .card').find((c) => h.text(h.$('.nm', c)) === name)
        const p0 = PASSES[0]
        await h.click(h.btn(fmt(p0.price), card(p0.name)), 'pass button')
        t.ok(!h.S.hasPass(p0.id), 'a pass is refused without the cash')
        for (const p of PASSES) {
          h.setCash(p.price)
          await h.frames(2)
          await h.click(h.btn(fmt(p.price), card(p.name)), `${p.name} button`)
          t.ok(h.S.hasPass(p.id), `${p.name} pass bought for ${fmt(p.price)}`)
          t.eq(h.state.cash, 0, `${p.name}: exactly its price was taken`)
          t.ok(h.text(card(p.name)).includes('OWNED'), `${p.name} shows OWNED`)
        }
        t.near(h.S.cashMultiplier(), 2, 1e-9, '2x Cash doubles run cash')
        t.near(h.S.currentStats().burn, gearById.rusty.burn * 0.75, 1e-9, 'Fuel Saver cuts the burn rate by 25%')
        t.eq(h.S.spinEvery(), WHEEL.luckyEvery, `Lucky Wheel makes spins ${WHEEL.luckyEvery / 60} min apart`)
        h.give('v12')
        t.eq(h.S.sellPrice('v12'), Math.round(gearById.v12.price * 0.7), 'Trader pays 70% for gear')
        await h.closeWin()
      },
    },
    {
      name: '+1 Cart pad: every extra cart at its price, the multiplier and fuel grow, the cap holds',
      timeout: 240000,
      async fn(t) {
        const h = t.h
        await h.reset()
        const sp = h.game.tracks.spots.plusCart
        await h.stand(sp.x, sp.z, '+1 Cart')
        h.setCash(0)
        await h.frames(3)
        t.ok(h.prompt().deny && h.prompt().sub.startsWith('Need'), `without cash the prompt says "${h.prompt().sub}"`)
        await h.holdE(() => h.state.wagons > 0, 1.2)
        t.eq(h.state.wagons, 0, 'holding E without cash buys nothing')
        const base = h.S.currentStats()
        let bad = 0
        for (let n = 0; n < ECONOMY.maxWagons; n++) {
          const price = ECONOMY.wagonPrice(n)
          if (h.S.wagonPrice() !== price) {
            bad++
            t.fail(`cart ${n + 1}: price ${h.S.wagonPrice()} (expected ${price})`)
          }
          h.setCash(price)
          await h.frames(3)
          const sub = h.prompt().sub
          if (!sub.includes(fmt(price))) {
            bad++
            t.fail(`cart ${n + 1}: prompt says "${sub}", expected the price ${fmt(price)}`)
          }
          await h.holdE(() => h.state.wagons === n + 1, 2)
          if (h.state.wagons !== n + 1 || h.state.cash !== 0) {
            bad++
            t.fail(`cart ${n + 1}: wagons ${h.state.wagons}, cash left ${h.state.cash}`)
          }
        }
        t.ok(bad === 0, `all ${ECONOMY.maxWagons} extra carts bought at their price with real hold-E`)
        t.eq(h.state.wagons, ECONOMY.maxWagons, `${ECONOMY.maxWagons} extra carts is the cap`)
        t.near(h.S.cashMultiplier(), 1 + ECONOMY.maxWagons * ECONOMY.wagonCash, 1e-9, 'run cash multiplier grew +10% per cart')
        t.gt(h.S.currentStats().tank, base.tank, 'the tank grew (fuel wagons)')
        h.setCash(1e9)
        await h.frames(3)
        t.ok(!(h.prompt().on && h.prompt().title === '+1 Cart'), 'at the cap the +1 Cart prompt is gone')
        t.eq(h.S.buyWagon(), 'max', 'and buying more is refused')
        t.eq(h.state.stats.wagonsBought, ECONOMY.maxWagons, 'wagons-bought counter is right')
      },
    },
  ],
}
