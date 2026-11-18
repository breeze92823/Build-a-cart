// The 5-player room: the other players on the other four bases, their carts and avatars on the line.
// The room is faked (net.room with a plain Map roster shaped like the backend's WorldState.players), so the
// suite needs no server; presence.js / remote.js see exactly what Colyseus would give them.
import { BASES, DEFAULT_GEAR, MULTI } from '../../config.js'
import { laneX } from '../../cartPhysics.js'
import { net, verifyAdReward } from '../../net.js'

const HOME = BASES.xs[BASES.home]

const remote = (o = {}) => ({
  username: 'Rex', uid: '', signedIn: true, pfp: '', avatar: '', outfit: '',
  x: 0, y: 0.05, z: -2, yaw: Math.PI, speed: 0, grounded: true,
  engine: DEFAULT_GEAR.engine, fuel: DEFAULT_GEAR.fuel, wheels: DEFAULT_GEAR.wheels, booster: '', wagons: 0, golden: 0,
  ride: 'foot', crash: '', s: 0, cy: 0, pitch: 0, roll: 0, lx: 0, v: 0, throttle: 0, braking: false, boosting: false, air: false, fuelOk: true, tip: 0,
  emote: '', emoteSeq: 0,
  ...o,
})

// Puts a fake room in place for the test and takes it away again (success or not).
async function withRoom(t, players, fn) {
  const roster = new Map([['me', remote({ username: 'Me' })], ...Object.entries(players)])
  const was = { room: net.room, connected: net.connected }
  net.room = { sessionId: 'me', state: { players: roster }, send() {}, onMessage() {}, onLeave() {} }
  net.connected = true
  try {
    await fn(roster, t.h.game.remotes.remotes)
  } finally {
    net.room = was.room
    net.connected = was.connected
    await t.h.frames(3) // the remotes notice the room is gone and clean up
  }
}

export default {
  name: 'Multiplayer',
  tests: [
    {
      name: 'Four other players take the four other bases, a fifth does not fit (room of 5)',
      async fn(t) {
        const h = t.h
        await h.reset()
        t.eq(MULTI.maxPlayers, 5, 'a room seats 5 players')
        const players = {}
        for (let i = 0; i < 5; i++) players[`p${i}`] = remote({ username: `Rider${i}` })
        await withRoom(t, players, async (_roster, remotes) => {
          await h.frames(5)
          t.eq(remotes.size, 4, 'me + 4 others fill the room: the fifth remote has no base')
          t.eq([...remotes.values()].map((r) => r.base), MULTI.basePrefs, `bases are handed out nearest first (${MULTI.basePrefs.join(', ')})`)
          t.ok([...remotes.values()].every((r) => r.base !== BASES.home), 'nobody takes the home base')
          for (const r of remotes.values()) {
            t.near(r.cart.position.x, BASES.xs[r.base], 0.5, `${r.name}'s parked cart sits on base ${r.base}`)
            t.ok(r.cart.visible, `${r.name}'s cart is drawn`)
          }
        })
      },
    },
    {
      name: 'A walking player is drawn at their own base; a leaver frees the base for the next one',
      async fn(t) {
        const h = t.h
        await h.reset()
        await withRoom(t, { a: remote({ username: 'Ann', x: 3, z: -5 }) }, async (roster, remotes) => {
          await h.frames(5)
          const a = remotes.get('a')
          t.near(a.group.position.x, 3 + (BASES.xs[a.base] - HOME), 0.1, "their walk is shifted onto their base (x + the base offset)")
          t.near(a.group.position.z, -5, 0.1, 'z is unchanged')
          t.ok(a.group.visible && a.tag, 'avatar and name tag are there')
          roster.get('a').x = 8
          roster.get('a').speed = 5
          await h.frames(60)
          t.near(a.group.position.x, 8 + (BASES.xs[a.base] - HOME), 0.3, 'the avatar follows their walk')
          const base = a.base
          roster.delete('a')
          await h.frames(3)
          t.eq(remotes.size, 0, 'leaving removes them')
          roster.set('b', remote({ username: 'Bo' }))
          await h.frames(3)
          t.eq(remotes.get('b')?.base, base, 'the next newcomer gets the freed base')
        })
      },
    },
    {
      name: 'A riding player: cart on the shared line, avatar in the seat, wheels spin, crash and revive',
      async fn(t) {
        const h = t.h
        await h.reset()
        await withRoom(t, { a: remote({ username: 'Ann', wagons: 2 }) }, async (roster, remotes) => {
          await h.frames(3)
          const a = remotes.get('a')
          Object.assign(roster.get('a'), { ride: 'riding', s: 400, cy: 0, v: 40, throttle: 1, boosting: true })
          await h.frames(5)
          t.near(a.cart.position.x, laneX(BASES.xs[a.base], HOME, 400), 0.5, 'past the merge the cart is on the one shared line')
          t.eq(a.wagons.length, 2, 'two trailing carts follow it')
          t.ok(a.avatarRoot.parent === a.cart.userData.tilt, 'the rider sits in the cart')
          t.ok(a.cart.visible && a.anchor.visible, 'cart and name tag are drawn')
          const spin = a.cart.userData.spin[0].rotation.x
          await h.frames(10)
          t.ok(a.cart.userData.spin[0].rotation.x !== spin, 'the wheels turn')
          roster.get('a').s = 460
          await h.frames(40)
          t.gt(a.s, 440, `the cart follows the server's position along the line (${a.s.toFixed(0)} m)`)
          Object.assign(roster.get('a'), { ride: 'crashed', crash: 'rocks', v: 0 })
          await h.frames(3)
          t.ok(!a.cart.visible, 'a crash takes the cart off the line')
          Object.assign(roster.get('a'), { ride: 'riding', crash: '', v: 20 })
          await h.frames(3)
          t.ok(a.cart.visible, 'reviving puts it back')
          Object.assign(roster.get('a'), { ride: 'foot', z: -3 })
          await h.frames(3)
          t.ok(a.group.visible && a.avatarRoot.parent === a.group, 'back at the base the avatar walks again')
          t.near(a.cart.position.x, BASES.xs[a.base], 0.5, 'and the cart is parked on its base')
        })
      },
    },
    {
      name: 'Presence: the local cart reports itself while riding and nothing while parked',
      async fn(t) {
        const h = t.h
        await h.reset()
        t.eq(h.ride.presence(), null, 'parked: no cart state to send')
        h.ride.mount()
        await h.frames(30)
        const p = h.ride.presence()
        t.eq(p?.ride, 'riding', 'riding: the state says so')
        t.near(p?.s, h.ride.debug.c.s, 0.01, 's is the cart position on the line')
        t.eq(Object.keys(p).sort(), ['air', 'boosting', 'braking', 'crash', 'cy', 'fuelOk', 'lx', 'pitch', 'ride', 'roll', 's', 'throttle', 'tip', 'v'], 'exactly the fields the server accepts')
        h.ride.launchOrReturn()
        await h.frames(3)
        t.eq(h.ride.presence(), null, 'back at the base: nothing to send again')
      },
    },
    {
      name: 'Rewarded ads: no ad outside Bloxity, and an offline reward check does not block',
      async fn(t) {
        const h = t.h
        const { adsReady, watchAd } = await import('../../ads.js')
        const { ADS } = await import('../../config.js')
        t.ok(!adsReady(), 'no rewarded ad is offered in dev mode')
        t.ok(!(await watchAd(ADS.revive)), 'watchAd refuses without an ad')
        t.ok(await verifyAdReward(''), 'a reward with no token (not inside Bloxity) has nothing to verify and is granted')
        t.ok(!h.$('.ad-btn') || h.$('.ad-btn').style.display === 'none', 'the ad button stays hidden')
      },
    },
  ],
}
