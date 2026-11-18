// Game audio, the one import the rest of the game uses:
//   installAudio() once at boot (waits for the first gesture), updateAudio(dt, st)
//   every frame, sfx.<name>() for one-shots. Every press on a button anywhere gets
//   its click here (one capture-phase listener), so menus need no wiring of their own.
import { A, installAudio as installCore, isMuted, onStart, setAdMuted, setDucked, setMuted, setVolume, toggleMuted } from './core.js'
import * as sfx from './sfx.js'
import * as cart from './cart.js'
import * as ambience from './ambience.js'
import * as remoteCarts from './remote.js'

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
// st: { cart: {...cart.update}, remote: {...remote.update} | null, cave 0..1, rain 0..1, t, windowOpen }
export function updateAudio(dt, st) {
  if (!started || !A.ctx || A.ctx.state !== 'running') return
  setDucked(st.windowOpen)
  cart.update(dt, st.cart)
  remoteCarts.update(dt, st.remote ?? null)
  ambience.update(dt, st)
}

// A one-shot from somewhere else in the world (another player's cart): fn() plays any sfx.* call
// as usual, but routed through a gain for the distance (m) and a pan (-1..1), its reverb send
// scaled less than its level so far-off sounds stay a little roomier.
export function sfxAt(dist, pan, fn) {
  if (!started || !A.ctx || A.ctx.state !== 'running') return
  const vol = 1 / (1 + (dist / 14) ** 2)
  if (vol < 0.04) return
  const ctx = A.ctx
  const g = ctx.createGain()
  g.gain.value = vol
  const p = ctx.createStereoPanner()
  p.pan.value = Math.max(-0.9, Math.min(0.9, pan || 0))
  g.connect(p).connect(A.sfx)
  const vg = ctx.createGain()
  vg.gain.value = Math.min(1, vol * 1.8)
  vg.connect(A.verb)
  const saved = [A.sfx, A.engine, A.verb]
  A.sfx = A.engine = g
  A.verb = vg
  try {
    fn()
  } catch {
    // A sound never breaks the game.
  } finally {
    ;[A.sfx, A.engine, A.verb] = saved
  }
  setTimeout(() => {
    g.disconnect()
    p.disconnect()
    vg.disconnect()
  }, 5000)
}
