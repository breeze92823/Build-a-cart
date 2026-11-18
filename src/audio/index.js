// Game audio, the one import the rest of the game uses:
//   installAudio() once at boot (waits for the first gesture), updateAudio(dt, st)
//   every frame, sfx.<name>() for one-shots. Every press on a button anywhere gets
//   its click here (one capture-phase listener), so menus need no wiring of their own.
import { A, installAudio as installCore, isMuted, onStart, setAdMuted, setDucked, setMuted, setVolume, toggleMuted } from './core.js'
import * as sfx from './sfx.js'
import * as cart from './cart.js'
import * as ambience from './ambience.js'

export { sfx, setVolume, setMuted, setAdMuted, isMuted, toggleMuted }

function onPress(e) {
  if (e.button > 0) return
  const b = e.target.closest?.('button, [role="button"]')
  if (!b || b.disabled) return
  const pan = Math.max(-0.6, Math.min(0.6, (e.clientX / window.innerWidth - 0.5) * 1.2))
  if (b.classList.contains('big')) sfx.press(pan)
  else if (b.closest('.ui-grid')) sfx.tick(pan)
  else sfx.click(pan)
}

export function installAudio() {
  installCore()
  window.addEventListener('pointerdown', onPress, { capture: true, passive: true })
}

let started = false
onStart(() => (started = true))
// st: { cart: {...cart.update}, cave 0..1, rain 0..1, t, windowOpen }
export function updateAudio(dt, st) {
  if (!started || !A.ctx || A.ctx.state !== 'running') return
  setDucked(st.windowOpen)
  cart.update(dt, st.cart)
  ambience.update(dt, st)
}
