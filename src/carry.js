// Carried parts. Engines and fuel tanks bought in the Shop land in the hotbar
// (slots 2-9) instead of going straight onto the cart. Tap a slot (or press its
// number) to hold that part out in front of you, walk it to the parked cart and a
// see-through copy shows where it bolts on; hold E there to attach it. The part
// it replaces goes back into the hotbar. Tunables: CARRY in config.js.
import { Vector3 } from 'three'
import { CARRY, GEAR } from './config.js'
import { buildPart, GHOST_MAT } from './cartModel.js'
import * as S from './state.js'
import { addSpot } from './interact.js'
import { onKey } from './input.js'
import { thumb } from './ui/thumbs.js'
import { sfx } from './audio/index.js'

// deps: { hand (Group that follows the player), ride, hud, fx, playerPos () => Vector3 }
export function createCarry({ hand, ride, hud, fx, playerPos }) {
  let held = null // gear id in hand
  let model = null // its 3D copy in hand
  let near = false // close enough to the cart for the ghost
  const mount = new Vector3()

  // Spare engines / fuel tanks (not on the cart), at most CARRY.slots of them.
  const items = () =>
    GEAR.filter((g) => S.isCarried(g) && (S.state.owned[g.id] ?? 0) > 0 && S.spare(g.id) > 0)
      .slice(0, CARRY.slots)
      .map((g) => ({ id: g.id, name: g.name, count: S.spare(g.id), img: thumb(g.id) }))

  function setHeld(id) {
    if (id === held) return
    held = id
    if (model) hand.remove(model)
    model = null
    if (id) {
      const g = S.gearById[id]
      model = buildPart(g)
      model.scale.multiplyScalar(CARRY.hand.scale)
      // Centre the part on the hands (parts are built bottom-centred, ~0.6-1 m tall).
      model.position.set(0, CARRY.hand.y - 0.3 * CARRY.hand.scale, CARRY.hand.z)
      model.traverse((o) => o.isMesh && (o.castShadow = true))
      hand.add(model)
    }
    refresh()
  }
  // Tap / key on a slot: hold it, or put it away if already held.
  function toggle(id) {
    if (ride.riding) return
    setHeld(held === id ? null : id)
    sfx.equip?.()
  }
  function refresh() {
    // Sold, trashed, equipped from the Backpack or reset: nothing left to hold.
    if (held && !(S.spare(held) > 0)) return setHeld(null)
    hud.setHotbar(items(), held)
  }

  function attach() {
    if (!held || ride.riding) return
    const g = S.gearById[held]
    const old = S.gearById[S.state.equipped[g.type]]
    ride.mountPoint(g.type, mount)
    if (!S.equip(held)) return
    const name = g.name
    setHeld(null)
    ride.preview(null)
    sfx.equip?.()
    fx.dust?.(mount, 10)
    fx.glint?.(mount, 14, '#bff6ff', 1.1)
    hud.toast(`${name} attached!${old ? ` ${old.name} back in your hotbar` : ''}`, 'gold')
  }

  const spot = addSpot({
    x: 0,
    z: 0,
    y: 2.4,
    radius: CARRY.attachRange,
    hold: CARRY.attachHold,
    enabled: () => !!held && !ride.riding,
    title: () => `Attach ${held ? S.gearById[held].name : ''}`,
    sub: () => {
      const g = held && S.gearById[held]
      const old = g && S.gearById[S.state.equipped[g.type]]
      return old ? `Replaces ${old.name}` : 'Hold E'
    },
    action: attach,
  })

  // Keys 2-9: the hotbar's item slots.
  for (let n = 2; n <= 9; n++)
    onKey(`Digit${n}`, () => {
      const it = items()[n - 2]
      if (it) toggle(it.id)
    })

  S.onChange(refresh)
  // Freshly bought part: straight into your hands if they are empty.
  S.onNotice((kind, d) => {
    if (kind !== 'bought' || !S.isCarried(S.gearById[d.id])) return
    if (held || ride.riding) return
    setHeld(d.id)
    hud.toast(`Carry the ${S.gearById[d.id].name} to your cart and hold E to attach it`)
  })
  refresh()

  let pulse = 0
  return {
    // A hotbar slot was tapped.
    hold: toggle,
    get held() {
      return held
    },
    update(dt) {
      const riding = ride.riding
      hand.visible = !riding
      if (!held || riding) {
        if (near) ride.preview(null)
        near = false
        return
      }
      const g = S.gearById[held]
      ride.mountPoint(g.type, mount)
      spot.x = mount.x
      spot.z = mount.z
      spot.y = mount.y + 1.2
      const p = playerPos()
      const d = Math.hypot(p.x - mount.x, p.z - mount.z)
      near = d < CARRY.previewRange
      ride.preview(near ? g : null)
      if (near) {
        pulse += dt
        GHOST_MAT.opacity = 0.35 + 0.2 * (0.5 + 0.5 * Math.sin(pulse * 5))
      }
    },
  }
}
