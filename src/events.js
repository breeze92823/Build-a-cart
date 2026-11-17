// World events on a wall-clock cycle (the same for everyone, and across reloads):
// `calm` seconds of normal weather, then one event for `length` seconds, rotating
// through EVENTS.list. Thunderstorm: dark sky, rain, lightning + thunder, x1.5
// cash. Tailwind: gusts and streaks, +15% top speed. Gold Rush: warm light,
// gold sparkles, x2 cash. Exposes the multipliers the ride uses.
import { EVENTS } from './config.js'
import { clock } from './cave.js'

export function createEvents() {
  const cycle = EVENTS.calm + EVENTS.length
  let current = null
  let left = 0
  let weight = 0 // eased 0..1 strength of the current event (fades in/out)
  let boltAt = 3
  const out = {
    force: null, // dev: __game.events.force = 'storm'
    update(dt) {
      const t = Date.now() / 1000
      const n = Math.floor(t / cycle)
      const into = t - n * cycle
      if (out.force) {
        current = EVENTS.list.find((e) => e.id === out.force) ?? null
        left = EVENTS.length
      } else if (into >= EVENTS.calm) {
        current = EVENTS.list[n % EVENTS.list.length]
        left = cycle - into
      } else {
        current = null
        left = EVENTS.calm - into
      }
      const target = current ? 1 : 0
      weight += (target - weight) * Math.min(1, dt * 0.6)
      return out
    },
    get event() {
      return current
    },
    get id() {
      return current?.id ?? null
    },
    weight: () => weight,
    storm: () => (current?.id === 'storm' || (!current && weight > 0.01 && last === 'storm') ? weight : 0),
    gold: () => (current?.id === 'goldrush' || (!current && last === 'goldrush') ? weight : 0),
    wind: () => (current?.id === 'tailwind' || (!current && last === 'tailwind') ? weight : 0),
    cash: () => current?.cash ?? 1,
    speed: () => current?.speed ?? 1,
    // HUD line.
    line() {
      if (current) return { html: `Current Event: ${current.name} - ${clock(left)} <span class="tag">${current.desc}</span>`, active: true }
      return { html: `Next Event: ${clock(left)}`, active: false }
    },
    // Lightning: true when a bolt should strike now (storm only).
    lightning(dt) {
      if (out.storm() < 0.6) return false
      boltAt -= dt
      if (boltAt > 0) return false
      boltAt = 4 + Math.random() * 9
      return true
    },
  }
  let last = null
  const remember = setInterval(() => {
    if (current) last = current.id
  }, 500)
  void remember
  return out
}
