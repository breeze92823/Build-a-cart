// Tells the room what the others should draw of this player (backend presence.ts):
//   `pose`    on foot: where they stand (world coordinates, the same on every client), heading, speed;
//   `cart`    while riding: the cart's place on the line (s), height, pitch / roll, lane, speed, throttle,
//             brake / boost / air / fuel flags and the crash kind, ~20 times a second;
//   `loadout` the equipped gear (engine / fuel tank / wheels / booster) and how many carts trail it.
// Each is only sent when it changed (plus a slow heartbeat so a late joiner sees it), and never throws.
import { NET } from './config.js'
import { net, onJoinedRoom, sendCart, sendLoadout, sendPose, setJoinHook } from './net.js'
import { player } from './player.js'
import { state } from './state.js'

const now = () => performance.now() / 1000

function loadoutNow() {
  const e = state.equipped || {}
  return { engine: e.engine || '', fuel: e.fuel || '', wheels: e.wheels || '', booster: e.booster || '', wagons: state.wagons | 0, golden: Math.min(100, state.goldenCarts | 0) }
}
const loadoutKey = (l) => `${l.engine}|${l.fuel}|${l.wheels}|${l.booster}|${l.wagons}|${l.golden}`

function poseNow() {
  const p = player.renderPosition
  return { x: p.x, y: p.y, z: p.z, yaw: player.facing, speed: Math.hypot(player.velocity.x, player.velocity.z), grounded: !!player.grounded }
}

export function createPresence({ ride }) {
  let poseAt = 0
  let cartAt = 0
  let lastPose = null
  let lastCart = ''
  let lastLoad = ''
  let wasRiding = false
  let loadAt = 0

  // The pose and loadout ride along with the join, so the others draw the newcomer at once.
  setJoinHook(() => ({ pose: poseNow(), loadout: loadoutNow() }))
  onJoinedRoom(() => {
    lastPose = null
    lastCart = ''
    lastLoad = ''
  })

  return {
    update(dt) {
      if (!net.connected) return
      const t = now()

      // Loadout: checked a few times a second (equipping, buying carts, a rebirth, the save arriving).
      if (t - loadAt > 0.4) {
        loadAt = t
        const l = loadoutNow()
        const k = loadoutKey(l)
        if (k !== lastLoad) {
          lastLoad = k
          sendLoadout(l)
        }
      }

      const c = ride.presence()
      if (c) {
        wasRiding = true
        if (t - cartAt < NET.cartEvery) return
        const k = `${c.ride}|${c.crash}|${c.s.toFixed(2)}|${c.cy.toFixed(2)}|${c.v.toFixed(1)}|${c.roll.toFixed(2)}|${c.lx.toFixed(2)}|${c.boosting}|${c.braking}|${c.throttle.toFixed(1)}|${c.air}|${c.fuelOk}`
        // A cart that is not changing (crashed, stopped) only needs the heartbeat.
        if (k === lastCart && t - cartAt < NET.heartbeat) return
        cartAt = t
        lastCart = k
        sendCart(c)
        return
      }
      if (wasRiding) {
        // Back at the base: on foot again.
        wasRiding = false
        lastCart = ''
        sendCart({ ride: 'foot', crash: '', throttle: 0, braking: false, boosting: false, air: false, fuelOk: true, v: 0 })
        lastPose = null
      }
      if (t - poseAt < NET.poseEvery) return
      const p = poseNow()
      const moved = !lastPose || Math.abs(p.x - lastPose.x) > 0.02 || Math.abs(p.y - lastPose.y) > 0.02 || Math.abs(p.z - lastPose.z) > 0.02 || Math.abs(p.yaw - lastPose.yaw) > 0.03 || p.grounded !== lastPose.grounded || Math.abs(p.speed - lastPose.speed) > 0.3
      if (!moved && t - poseAt < NET.heartbeat) return
      poseAt = t
      lastPose = p
      sendPose(p)
    },
  }
}
