// Proximity prompts: walk up to something and hold E (or press and hold the
// prompt on a touch screen) until the ring fills. One prompt at a time, for
// the nearest enabled spot in range, pinned above it in screen space.
import { Vector3 } from 'three'
import { sfx } from './audio/index.js'

const spots = []
// spot: { x, y, z, radius, hold (s), title() , sub() , enabled() , action() , deny() -> bool (sub shown red) }
export function addSpot(spot) {
  const s = { radius: 3.5, hold: 0.35, y: 2.5, enabled: () => true, deny: () => false, sub: () => '', ...spot }
  spots.push(s)
  return s
}

const el = document.createElement('div')
el.className = 'prompt hud-prompt'
el.innerHTML = `<div class="key stroke"><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15" stroke-dasharray="94.25" stroke-dashoffset="94.25"/></svg><span>E</span></div><div class="txt"><b class="stroke"></b><small class="stroke"></small></div>`
const ring = el.querySelector('.fg')
const titleEl = el.querySelector('b')
const subEl = el.querySelector('small')
let mounted = false

let keyHeld = false
let touchHeld = false
let progress = 0
let active = null
let latched = false // completed: wait for release before another
let lastTitle = ''
let lastSub = ''

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat) keyHeld = true
})
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') {
    keyHeld = false
    latched = false
  }
})
window.addEventListener('blur', () => {
  keyHeld = touchHeld = false
  latched = false
})
el.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  e.stopPropagation()
  touchHeld = true
  try {
    el.setPointerCapture(e.pointerId)
  } catch {
    // Fine without.
  }
})
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
  el.addEventListener(ev, () => {
    touchHeld = false
    latched = false
  })

const v = new Vector3()
// pos: the player's feet; blocked: riding or a window is open.
export function updateInteract(dt, pos, camera, blocked) {
  if (!mounted) {
    const layer = document.createElement('div')
    layer.className = 'hud prompt-layer'
    layer.appendChild(el)
    document.body.appendChild(layer)
    mounted = true
  }
  let best = null
  let bestD = Infinity
  if (!blocked) {
    for (const s of spots) {
      if (!s.enabled()) continue
      const d = Math.hypot(pos.x - s.x, pos.z - s.z)
      if (d < s.radius && d < bestD && Math.abs(pos.y - (s.floor ?? 0)) < 6) {
        best = s
        bestD = d
      }
    }
  }
  if (best !== active) {
    active = best
    progress = 0
  }
  if (!active) {
    el.classList.remove('on')
    return
  }
  // Screen position; behind the camera it sits at the bottom centre instead.
  v.set(active.x, active.y, active.z).project(camera)
  el.classList.add('on')
  let x = (v.x * 0.5 + 0.5) * window.innerWidth
  let y = (-v.y * 0.5 + 0.5) * window.innerHeight
  if (v.z > 1 || x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) {
    x = window.innerWidth / 2
    y = window.innerHeight * 0.72
  }
  el.style.transform = `translate(${Math.round(x - el.offsetWidth / 2)}px, ${Math.round(y - el.offsetHeight / 2)}px)`
  const t = active.title()
  const s = active.sub()
  if (t !== lastTitle) titleEl.textContent = lastTitle = t
  if (s !== lastSub) subEl.textContent = lastSub = s
  el.classList.toggle('deny', active.deny())

  const holding = (keyHeld || touchHeld) && !latched
  if (holding) {
    const before = progress
    progress = Math.min(1, progress + dt / active.hold)
    if (active.hold > 0.5 && Math.floor(before * 6) !== Math.floor(progress * 6)) sfx.holdTick(progress)
    if (progress >= 1) {
      progress = 0
      latched = true
      active.action()
    }
  } else progress = Math.max(0, progress - dt * 4)
  ring.style.strokeDashoffset = String(94.25 * (1 - progress))
}
