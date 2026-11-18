// Boot, HUD, walking and the prompts a player meets.
import { DEFAULT_GEAR, ECONOMY, SPAWN, SPAWN_FACING, UPGRADES } from '../../config.js'

export default {
  name: 'World & player',
  tests: [
    {
      name: 'Game is up: canvas, HUD buttons, cash, starter gear',
      async fn(t) {
        const h = t.h
        t.ok(h.$('canvas'), 'WebGL canvas is on the page')
        for (const [sel, label] of [
          ['.launch', 'LAUNCH button'],
          ['.side-btn.shop', 'SHOP button'],
          ['.side-btn.quests', 'QUESTS button'],
          ['.side-btn.rebirth', 'REBIRTH button'],
          ['.side-btn.saves', 'SAVES button'],
          ['.money', 'cash readout'],
          ['.hotbar .slot', 'backpack slot'],
          ['.wheel-timer', 'Lucky Wheel timer'],
          ['.event-line', 'event line'],
        ])
          t.ok(h.$(sel), `${label} is in the HUD`)
        await h.reset()
        t.eq(h.text(h.$('.launch')), 'LAUNCH', 'the button says LAUNCH on foot')
        t.eq(h.shownCash(), ECONOMY.startCash, `a new player starts with $${ECONOMY.startCash}`)
        t.eq(h.state.equipped, DEFAULT_GEAR, 'the cart starts with the starter gear')
        t.eq(h.state.upgrades, Object.fromEntries(UPGRADES.map((u) => [u.id, 0])), 'all Cart Upgrades start at level 0')
        t.eq(h.S.cartCount(), 1, 'one cart')
      },
    },
    {
      name: 'Walk from the cave spawn out to the cart and see the ride prompt',
      async fn(t) {
        const h = t.h
        const { player } = h.game
        await h.reset()
        h.game.teleport(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN_FACING)
        await h.frames(5)
        t.ok(h.game.cave.depth(player.renderPosition) > 0.5, 'the player spawns deep inside the hub cave')
        const z0 = player.position.z
        t.step('hold W and walk north out of the cave')
        h.keyDown('KeyW')
        const got = await h.until(() => h.prompt().on && h.prompt().title === 'Ride Cart', 20)
        h.keyUp('KeyW')
        t.ok(got, `a "Ride Cart" prompt shows up on the way (walked ${Math.round(z0 - player.position.z)} m)`)
        t.ok(player.position.z < z0 - 40, 'the player left the cave and reached the base')
        t.ok(!h.game.cave.depth(player.renderPosition) || h.game.cave.depth(player.renderPosition) < 0.2, 'the player is outside the cave')
        t.eq(h.prompt().sub, 'Hold E', 'the prompt tells the player to hold E')
      },
    },
    {
      name: 'Jump and sprint work',
      async fn(t) {
        const h = t.h
        const { player } = h.game
        await h.reset()
        h.game.teleport(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN_FACING)
        await h.frames(10)
        let top = 0
        h.keyDown('Space')
        for (let i = 0; i < 40; i++) {
          await h.frames(1)
          top = Math.max(top, player.position.y)
          if (i === 1) h.keyUp('Space')
        }
        t.gt(top, 0.8, `Space makes the player jump (peak ${top.toFixed(2)} m)`)
        t.ok(await h.until(() => player.grounded, 2), 'the player lands again')
        const walk = async (sprint) => {
          h.game.teleport(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN_FACING)
          await h.frames(5)
          const z = player.position.z
          if (sprint) h.keyDown('ShiftLeft')
          h.keyDown('KeyW')
          await h.seconds(1)
          h.keyUp('KeyW')
          h.keyUp('ShiftLeft')
          return z - player.position.z
        }
        const w = await walk(false)
        const s = await walk(true)
        t.gt(w, 4, `walking covers ${w.toFixed(1)} m in a second`)
        t.gt(s, w + 1.5, `sprinting is faster (${s.toFixed(1)} m vs ${w.toFixed(1)} m)`)
      },
    },
    {
      name: 'Every place a player can interact with shows its prompt',
      async fn(t) {
        const h = t.h
        const cs = h.game.cave.spots
        const ts = h.game.tracks.spots
        await h.reset()
        const rows = [
          [cs.upgrades, 'Shop'],
          [cs.sell, 'Sell Gear'],
          [cs.index, 'Index'],
          [cs.gift, 'Daily Gift'],
          [cs.wheel, 'Lucky Wheel'],
          [ts.stall, 'Cart Upgrades'],
          [ts.plusCart, '+1 Cart'],
          [ts.starter, 'Starter Pack'],
          [ts.v8, 'OP V8 Engine'],
        ]
        for (const [spot, title] of rows) {
          const p = await h.stand(spot.x, spot.z, title)
          t.ok(p, `"${title}" prompt appears at its pad`)
        }
        await h.toCart()
        t.eq(h.prompt().title, 'Ride Cart', '"Ride Cart" prompt appears next to the cart')
      },
    },
    {
      name: 'Backpack opens with B, the 1 key and the HUD slot, and closes again',
      async fn(t) {
        const h = t.h
        await h.reset()
        await h.tap('KeyB')
        t.eq(h.win(), 'backpack', 'B opens the backpack')
        await h.tap('KeyB')
        t.eq(h.win(), '', 'B closes it')
        await h.tap('Digit1')
        t.eq(h.win(), 'backpack', '1 opens the backpack')
        await h.tap('Escape')
        t.eq(h.win(), '', 'Esc closes it')
        await h.click(h.$('.hotbar .slot'), 'backpack slot')
        t.eq(h.win(), 'backpack', 'the HUD slot opens the backpack')
        t.ok(h.text(h.winEl()).includes('Rusty Motor'), 'the starter engine is shown as equipped')
        const stats = h.$$('.stats-line .stat').map((e) => h.text(e))
        t.ok(stats.length === 5, 'the stats line shows top speed, engine, fuel, boosts and cart multiplier')
        await h.closeWin()
      },
    },
  ],
}
