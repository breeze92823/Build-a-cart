// Real rides, played with the real controls and the real cart physics, frame by frame: getting in,
// gas, brake, boost, banking the cash, crashing and reviving, clearing the canyon, the areas and
// bonuses all the way to Golden Station, and the weather events.
import { CART, ECONOMY, EVENTS, GEAR, TRACK, UPGRADES, ZONES } from '../../config.js'
import { fmt } from '../../track.js'
import { driveRun } from '../drive.js'
import { bank, scanGear, simRide } from '../sim.js'

// What the first run past the old best pays on top of the run cash: each new area once.
const zoneBonuses = (bestBefore, maxS) => ZONES.filter((z) => z.bonus && !z.quiet && z.s > bestBefore + 1 && maxS >= z.s).reduce((a, z) => a + z.bonus, 0)
// Cash a run paid besides its distance money: coins, gems, fuel-style pickups, skill bonuses (all
// tallied by the driver as `run.bonus`) minus the one-off jump / new-area bonuses that went with them.
// Pickups are worth metres of run pay, so they can only add to the total, never take away.
const pickupCash = (run, oneOff) => run.cashAfter - run.cashBefore - run.banked - oneOff
const bestOf = (type, score) => GEAR.filter((g) => g.type === type).sort((a, b) => score(b) - score(a))[0]
// The strongest cart the catalogue allows, every performance upgrade bought.
function topCart(h) {
  h.gear({
    engine: bestOf('engine', (g) => g.accel).id,
    fuel: bestOf('fuel', (g) => g.tank).id,
    wheels: bestOf('wheels', (g) => -g.roll).id,
    booster: bestOf('booster', (g) => g.boost * g.charges * g.time).id,
  })
  for (const u of UPGRADES) h.state.upgrades[u.id] = u.max
}
// Samples of the on-screen state while a ride runs.
function watcher(h) {
  const w = { zones: [], tunnel: 0, drops: false, air: false, banner: new Set(), toasts: new Set(), maxS: 0 }
  w.frame = (d) => {
    w.maxS = Math.max(w.maxS, d.c.maxS)
    // The area card is only read in the frame the cart crosses into a new area (the previous
    // card stays on screen until the next one replaces it).
    if (w.lastZone !== undefined && d.zoneIdx !== w.lastZone && !ZONES[d.zoneIdx].quiet) {
      const zc = h.$('.zone-card')
      const name = h.text(zc?.querySelector('b'))
      if (name) w.zones.push({ name, fresh: zc.classList.contains('fresh'), sub: h.text(zc.querySelector('small')) })
    }
    w.lastZone = d.zoneIdx
    w.tunnel = Math.max(w.tunnel, h.ride.tunnel)
    if (h.$('.drops.on')) w.drops = true
    if (h.$('.air-pop.on')) w.air = true
    const b = h.banner()
    if (b) w.banner.add(b)
    for (const s of h.toasts()) w.toasts.add(s)
  }
  return w
}
const has = (set, part) => [...set].some((s) => s.includes(part))

export default {
  name: 'Rides',
  tests: [
    {
      name: 'Starter cart: walk up, hold E to board, hold W to the end of the fuel, cash is banked',
      async fn(t) {
        const h = t.h
        await h.reset()
        const sim = simRide()
        const w = watcher(h)
        let hud = null
        let n = 0
        const run = await driveRun(h, {
          boostAt: null,
          onFrame: (d) => {
            w.frame(d)
            if (++n === 90) hud = { riding: !!h.$('.hud.riding'), launch: h.text(h.$('.launch')), dist: h.text(h.$('.run-dist')), speed: h.text(h.$('.speed-num')), fuel: h.text(h.$('.bar.fuel')) }
          },
        })
        t.ok(run.mounted, 'holding E at the cart boards it')
        t.ok(hud?.riding, 'the HUD switches to the riding layout')
        t.eq(hud?.launch, 'RETURN', 'LAUNCH turns into RETURN')
        t.ok(/Distance: \d+/.test(hud?.dist ?? ''), `the distance counter runs (${hud?.dist})`)
        t.ok(/\d+ studs\/s/.test(hud?.speed ?? '') && !hud?.speed.startsWith('0 '), `the speed readout moves (${hud?.speed})`)
        t.ok(run.ended, 'the run ends by itself when the fuel is gone and the cart stops')
        t.ok(run.modes.includes('ending'), `it went riding -> ending -> parked (${run.modes.join(' > ')})`)
        t.gt(run.maxS, 30, `the starter cart rolled ${Math.round(run.maxS)} m`)
        t.near(run.maxS, sim.maxS, Math.max(3, sim.maxS * 0.01), `the headless simulator predicted ${Math.round(sim.maxS)} m`)
        const gain = run.cashAfter - run.cashBefore
        t.eq(run.banked, Math.round(h.S.runPayout(run.maxS)), `banked exactly the run payout (${fmt(run.banked)})`)
        t.gt(run.bonus, 0, `the coins on the way paid ${fmt(run.bonus)} as they were picked up`)
        t.eq(h.state.stats.rides, 1, 'rides counter is 1')
        t.eq(h.state.stats.best, Math.round(run.maxS), 'best distance is saved')
        t.eq(h.state.topRuns[0]?.d, Math.round(run.maxS), 'the run is on the record board list')
        t.eq(h.text(h.$('.launch')), 'LAUNCH', 'the button says LAUNCH again')
        t.ok(!h.$('.hud.riding'), 'the riding HUD is gone')
        t.ok(h.toasts().some((x) => x.includes('+$')) || gain === 0, 'a "+$" payout toast showed')
        const p = h.game.player.position
        t.ok(Math.abs(p.x - h.game.BASES.xs[h.game.BASES.home]) < 6 && p.y < 3, 'the player is standing at the base again')
      },
    },
    {
      name: 'Touch controls: LAUNCH, GAS and BRAKE pedals, BOOST button, RETURN (no keyboard)',
      async fn(t) {
        const h = t.h
        await h.reset()
        t.step('LAUNCH then RETURN straight away pays nothing')
        await h.click(h.$('.launch'), 'LAUNCH')
        t.ok(h.ride.riding, 'LAUNCH boards the cart')
        await h.seconds(0.3)
        await h.click(h.$('.launch'), 'RETURN')
        t.ok(!h.ride.riding, 'RETURN gets off again')
        t.eq(h.state.stats.rides, 0, 'a ride of under 2 m is not counted')
        t.eq(h.state.cash, ECONOMY.startCash, 'and pays nothing')
        t.step('ride with the pedals')
        await h.click(h.$('.launch'), 'LAUNCH')
        const gas = h.$('.pedal.gas')
        const brake = h.$('.pedal.brake')
        let maxS = 0
        const step = async (n) => {
          for (let i = 0; i < n; i++) {
            await h.frames(1)
            maxS = Math.max(maxS, h.ride.debug?.c.maxS ?? 0)
          }
        }
        h.down(gas)
        await step(150)
        const v1 = h.ride.speed
        t.gt(v1, 3, `holding GAS speeds the cart up (${v1.toFixed(1)} m/s)`)
        t.ok(gas.classList.contains('held'), 'the GAS pedal shows as held')
        h.up(gas)
        await step(2)
        t.ok(!gas.classList.contains('held'), 'releasing it lets go')
        h.down(brake)
        await step(90)
        h.up(brake)
        t.ok(h.ride.speed < v1 * 0.6, `BRAKE slows the cart (${v1.toFixed(1)} -> ${h.ride.speed.toFixed(1)} m/s)`)
        t.ok(h.$('.boost-btn').disabled, 'BOOST is greyed out with no booster fitted')
        const c0 = h.state.cash
        await h.click(h.$('.launch'), 'RETURN')
        t.ok(!h.ride.riding, 'RETURN ends the run')
        t.eq(h.state.cash - c0, Math.round(h.S.runPayout(maxS)), 'the distance so far was banked')
        t.eq(h.state.stats.rides, 1, 'one ride counted')
      },
    },
    {
      name: 'Brake (S) slows the cart much faster than coasting',
      async fn(t) {
        const h = t.h
        await h.reset()
        await h.toCart()
        await h.holdE(() => h.ride.riding, 3)
        h.keyDown('KeyW')
        await h.until(() => h.ride.speed > 9, 15)
        h.keyUp('KeyW')
        const v0 = h.ride.speed
        await h.seconds(0.5)
        const coast = h.ride.speed
        h.keyDown('KeyS')
        await h.seconds(0.5)
        h.keyUp('KeyS')
        const braked = h.ride.speed
        t.gt(v0 - coast, -0.01, `coasting for 0.5 s: ${v0.toFixed(1)} -> ${coast.toFixed(1)} m/s`)
        t.ok(coast - braked > 4, `braking for 0.5 s: ${coast.toFixed(1)} -> ${braked.toFixed(1)} m/s`)
      },
    },
    {
      name: 'Booster: Space fires a charge once, the HUD counts down, the stat is recorded',
      async fn(t) {
        const h = t.h
        await h.reset()
        const b = GEAR.filter((g) => g.type === 'booster' && !g.starter).sort((a, c) => a.price - c.price)[0]
        h.gear({ booster: b.id })
        await h.toCart()
        await h.holdE(() => h.ride.riding, 3)
        h.keyDown('KeyW')
        await h.seconds(1)
        const st = h.ride.debug.st
        t.eq(h.ride.debug.c.charges, b.charges, `${b.name} has ${b.charges} charge(s)`)
        t.ok(h.text(h.$('.boost-btn')).includes(`x${b.charges}`), `the BOOST button shows x${b.charges}`)
        t.ok(!h.$('.boost-btn').disabled, 'and is ready')
        await h.tap('Space')
        t.eq(h.ride.debug.c.charges, b.charges - 1, 'Space uses one charge')
        t.gt(h.ride.debug.c.boostLeft, 0, 'the booster is burning')
        t.ok(h.$('.boost-btn.burning'), 'the BOOST button shows it is burning')
        t.eq(h.state.stats.boosts, 1, 'boosts counter is 1')
        await h.tap('Space')
        t.eq(h.ride.debug.c.charges, b.charges - 1, 'pressing again while it burns does nothing')
        await h.seconds(st.boostTime + 0.3)
        if (b.charges > 1) {
          await h.tap('Space')
          t.eq(h.state.stats.boosts, 2, 'the next charge fires once the first has burnt out')
        }
        h.keyUp('KeyW')
      },
    },
    {
      name: 'Upgrades, extra carts and the 2x pass all show up in a real run payout',
      async fn(t) {
        const h = t.h
        await h.reset()
        for (const u of UPGRADES.filter((x) => x.kind === 'cash')) h.state.upgrades[u.id] = 4
        h.state.wagons = 3
        h.state.passes = ['cash2']
        h.S.changed('upgrade')
        const run = await driveRun(h, { boostAt: null })
        t.ok(run.ended, 'the run finished')
        t.gt(run.banked, 0, `it banked ${fmt(run.banked)} (+ ${fmt(run.bonus)} of pickups on the way)`)
        t.eq(run.banked, Math.round(h.S.runPayout(run.maxS)), 'exactly distance steps x currency x multiplier x carts x pass')
        t.gt(run.bonus, 0, 'the coins on the way are worth more with the multipliers too')
        t.eq(h.S.cashMultiplier(), (1 + 3 * ECONOMY.wagonCash) * 2, 'the multiplier is carts x 2 pass')
      },
    },
    {
      name: 'Crash into the canyon: crash screen, REVIVE (cash, back before the ramp), RESTART, countdown',
      timeout: 240000,
      async fn(t) {
        const h = t.h
        await h.reset()
        const combo = scanGear().find((x) => x.end === 'crash' && x.equipped.booster === 'none')
        if (!t.ok(combo, 'the catalogue has a cart that reaches the canyon and falls in')) return
        h.gear(combo.equipped)
        h.setCash(1e7)
        t.step(`ride ${combo.equipped.engine} + ${combo.equipped.fuel} into the gap`)
        const run = await driveRun(h, { boostAt: null, endOnCrash: true })
        t.ok(run.crashed && h.ride.mode === 'crashed', 'the cart crashed')
        t.ok(h.$('.crash.on'), 'the crash screen is up')
        const runCash = h.S.runPayout(run.maxS)
        const price = ECONOMY.revivePrice(runCash)
        t.ok(h.text(h.$('.crash .revive')).includes(fmt(price)), `REVIVE shows its price ${fmt(price)}`)
        t.ok(Number(h.text(h.$('.crash .count'))) >= ECONOMY.reviveCountdown - 1, `the countdown starts at ${ECONOMY.reviveCountdown}`)
        const c0 = h.state.cash
        await h.click(h.$('.crash .revive'), 'REVIVE')
        t.eq(h.ride.mode, 'riding', 'REVIVE puts the cart back on the rails')
        t.eq(c0 - h.state.cash, price, 'it cost the revive price')
        t.near(h.ride.debug.c.s, CART.safeS, 40, `the cart is back at s = ${Math.round(h.ride.debug.c.s)}, before the ramp (safe spot ${CART.safeS})`)
        t.near(h.ride.debug.c.fuel, h.ride.debug.st.tank, 0.5, 'with a full tank')
        t.ok(!h.$('.crash.on'), 'the crash screen is gone')
        h.keyDown('KeyW')
        t.ok(await h.until(() => h.ride.mode === 'crashed', 150), 'the same cart crashes again')
        h.keyUp('KeyW')
        h.setCash(0)
        await h.frames(3)
        t.ok(h.$('.crash .revive').disabled, 'with no cash REVIVE is greyed out')
        const maxS = h.ride.debug.c.maxS
        const c1 = h.state.cash
        await h.click(h.$('.crash .restart'), 'RESTART')
        t.ok(!h.ride.riding, 'RESTART ends the run')
        t.eq(h.state.cash - c1, Math.round(h.S.runPayout(maxS)), 'the distance is banked')
        t.eq(h.state.stats.rides, 1, 'one ride counted for the whole attempt')
        t.step('crash and let the countdown run out')
        const r2 = await driveRun(h, { boostAt: null, endOnCrash: true })
        t.ok(r2.crashed, 'crashed again')
        const before = h.state.cash
        await h.seconds(ECONOMY.reviveCountdown + 1)
        t.ok(!h.ride.riding, 'when the countdown runs out the run ends by itself')
        t.eq(h.state.cash - before, Math.round(h.S.runPayout(r2.maxS)), 'and the distance is banked')
      },
    },
    {
      name: 'Clear the canyon with a boost: jump bonus first time, smaller after, areas pay once',
      timeout: 240000,
      async fn(t) {
        const h = t.h
        await h.reset()
        const combo = scanGear().find((x) => x.jumped && x.end !== 'crash')
        if (!t.ok(combo, 'the catalogue has a cart that clears the canyon')) return
        h.gear(combo.equipped)
        t.step(`ride ${combo.equipped.engine} + ${combo.equipped.fuel} + ${combo.equipped.booster}, boost on the ramp`)
        const w = watcher(h)
        const run = await driveRun(h, { onFrame: w.frame })
        t.ok(run.jumped, 'the cart landed on the far side')
        t.gt(run.boosts, 0, 'Space was pressed on the ramp')
        t.ok(has(w.banner, 'CANYON CLEARED'), 'the CANYON CLEARED banner showed')
        t.eq(h.state.stats.jumps, 1, 'jumps counter is 1')
        const oneOff = ECONOMY.firstJumpBonus + zoneBonuses(run.bestBefore, run.maxS)
        t.eq(run.banked, Math.round(h.S.runPayout(run.maxS)), `the run cash banked at the end: ${fmt(run.banked)}`)
        t.ok(pickupCash(run, oneOff) >= 0, `first clear paid the ${fmt(ECONOMY.firstJumpBonus)} jump bonus + area bonuses ${fmt(oneOff)} (+ ${fmt(pickupCash(run, oneOff))} of pickups) = ${fmt(run.cashAfter - run.cashBefore)}`)
        const first = w.zones.filter((z) => z.fresh)
        t.ok(first.length === ZONES.filter((z) => z.bonus && !z.quiet && z.s > 0 && z.s <= run.maxS).length, `new areas announced as NEW: ${first.map((z) => z.name).join(', ') || 'none'}`)
        t.step('second ride with the same cart')
        const w2 = watcher(h)
        const r2 = await driveRun(h, { onFrame: w2.frame })
        const best2 = run.maxS
        t.eq(h.state.stats.jumps, 2, 'jumps counter is 2')
        t.eq(r2.banked, Math.round(h.S.runPayout(r2.maxS)), 'the second run banked its distance')
        t.ok(pickupCash(r2, ECONOMY.jumpBonus + zoneBonuses(best2, r2.maxS)) >= 0, `second clear paid the smaller ${fmt(ECONOMY.jumpBonus)} jump bonus (${fmt(r2.cashAfter - r2.cashBefore)} in all)`)
        t.ok(!w2.zones.some((z) => z.fresh && r2.maxS <= best2 + 1), 'areas already reached do not pay again')
      },
    },
    {
      name: 'The whole line to Golden Station: every area card and bonus, END OF THE LINE, payout (top cart)',
      timeout: 300000,
      async fn(t) {
        const h = t.h
        await h.reset()
        topCart(h)
        const sim = simRide()
        t.ok(sim.end === 'arrived', `a fully maxed cart can finish the line (headless sim: ${sim.end} at ${Math.round(sim.maxS)} m of ${TRACK.length})`)
        const w = watcher(h)
        const run = await driveRun(h, { maxSeconds: 280, onFrame: w.frame })
        t.ok(run.ended, 'the run ended and the cart went home')
        t.ok(run.modes.includes('ending'), `it ended at the station (${run.modes.join(' > ')})`)
        t.gt(run.maxS, TRACK.station, `it rolled onto the station platform: ${Math.round(run.maxS)} m (platform from ${TRACK.station} m, line ends at ${TRACK.length} m)`)
        t.ok(has(w.banner, 'END OF THE LINE'), 'the END OF THE LINE banner showed')
        t.near(run.maxS, sim.maxS, Math.max(5, sim.maxS * 0.01), 'the real ride matches the headless simulation')
        const cards = ZONES.filter((z) => !z.quiet && z.s > 0 && z.s <= run.maxS).map((z) => z.name)
        t.eq(w.zones.map((z) => z.name).filter((n) => cards.includes(n)), cards, `area cards in order: ${cards.join(' > ')}`)
        t.ok(w.zones.filter((z) => cards.includes(z.name)).every((z) => z.fresh), 'every area was marked NEW the first time')
        t.ok(w.tunnel > 0.5, `the Glow Mine got dark (${w.tunnel.toFixed(2)})`)
        t.ok(w.drops, 'the waterfall splashed the screen')
        t.ok(w.air, 'an AIRTIME pop showed over the meadow humps')
        t.ok(run.jumped, 'the canyon was cleared on the way')
        const oneOff = ECONOMY.firstJumpBonus + zoneBonuses(run.bestBefore, run.maxS)
        t.eq(run.banked, Math.round(h.S.runPayout(run.maxS)), `the run cash banked at the end: ${fmt(run.banked)}`)
        t.ok(pickupCash(run, oneOff) >= 0, `payout = jump bonus + all area bonuses ${fmt(oneOff)} + pickups and skill bonuses ${fmt(pickupCash(run, oneOff))} + run cash ${fmt(run.banked)}`)
        t.eq(h.state.stats.best, Math.round(run.maxS), 'best distance is the whole line')
        t.step('second run: nothing new to pay')
        const w2 = watcher(h)
        const r2 = await driveRun(h, { maxSeconds: 280, onFrame: w2.frame })
        t.ok(w2.zones.every((z) => !z.fresh), 'no area is marked NEW on the second run')
        t.eq(r2.banked, Math.round(h.S.runPayout(r2.maxS)), 'the second run banked its distance')
        t.ok(pickupCash(r2, ECONOMY.jumpBonus) >= 0, `only the small jump bonus ${fmt(ECONOMY.jumpBonus)} (no new areas) came with the pickups ${fmt(pickupCash(r2, ECONOMY.jumpBonus))}`)
      },
    },
    {
      name: 'Headless simulator = the real ride (distance and banked cash), for three carts',
      timeout: 300000,
      async fn(t) {
        const h = t.h
        await h.reset()
        const scan = scanGear()
        const picks = [
          ['the starter cart', { engine: 'rusty', fuel: 'jerry', wheels: 'wooden', booster: 'none' }],
          ['a cart that falls into the canyon', scan.find((x) => x.end === 'crash' && x.equipped.booster === 'none')?.equipped],
          ['the cheapest cart that clears the canyon', scan.find((x) => x.jumped && x.end !== 'crash')?.equipped],
        ]
        for (const [label, equipped] of picks) {
          if (!equipped) {
            t.fail(`no cart found for: ${label}`)
            continue
          }
          await h.reset()
          h.gear(equipped)
          const before = h.S.snapshot()
          const sim = simRide()
          const real = await driveRun(h, { endOnCrash: sim.end === 'crash' })
          if (h.ride.mode === 'crashed') h.ride.restart()
          await h.frames(2)
          const afterReal = h.S.snapshot()
          const realBanked = afterReal.cash - before.cash - real.bonus // a crashed run is banked by RESTART, after driveRun returned
          t.near(real.maxS, sim.maxS, Math.max(3, sim.maxS * 0.01), `${label}: real ${Math.round(real.maxS)} m, simulated ${Math.round(sim.maxS)} m`)
          t.eq(real.crashed, sim.end === 'crash', `${label}: same ending (${sim.end})`)
          // Roll the save back and let the simulator bank its ride: the save should end up the same.
          h.S.hydrate(before)
          const simBanked = bank(sim)
          const afterSim = h.S.snapshot()
          t.near(simBanked, realBanked, Math.max(3, realBanked * 0.01), `${label}: run cash banked after the real ride ${fmt(realBanked)}, after the simulated one ${fmt(simBanked)}`)
          t.eq([afterSim.stats.rides, afterSim.stats.jumps], [afterReal.stats.rides, afterReal.stats.jumps], `${label}: rides and jumps counters agree`)
        }
      },
    },
    {
      name: 'Weather events: Thunderstorm x1.5 and Gold Rush x2 cash, Tailwind faster, shown on the HUD',
      async fn(t) {
        const h = t.h
        for (const ev of EVENTS.list) {
          await h.reset()
          h.events.force = ev.id
          await h.seconds(1)
          t.ok(h.text(h.$('.event-line')).includes(ev.name), `${ev.name}: the HUD event line says "${h.text(h.$('.event-line')).slice(0, 45)}"`)
          t.eq(h.events.cash(), ev.cash, `${ev.name}: cash multiplier x${ev.cash}`)
          t.eq(h.events.speed(), ev.speed, `${ev.name}: speed factor x${ev.speed}`)
          if (ev.cash > 1) {
            const run = await driveRun(h, { boostAt: null })
            t.eq(run.banked, Math.round(h.S.runPayout(run.maxS, ev.cash)), `${ev.name}: a real run paid x${ev.cash}`)
            t.gt(run.bonus, 0, `${ev.name}: the pickups on the way paid too (${fmt(run.bonus)})`)
          } else {
            await h.toCart()
            await h.holdE(() => h.ride.riding, 3)
            const top = (st) => Math.sqrt(Math.max(0, st.accel - st.roll) / st.drag)
            t.near(top(h.ride.debug.st) / top(h.S.currentStats(1)), ev.speed, 0.01, `${ev.name}: the cart's top speed is x${ev.speed}`)
            h.ride.launchOrReturn()
            await h.frames(2)
          }
        }
        h.events.force = 'none'
      },
    },
  ],
}
