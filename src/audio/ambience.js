// Where you are, as a bed of sound:
//  - the cave: a low room tone, water drips echoing (single Minnaert bubbles
//    through a big reverb send) and a faint crystal shimmer
//  - the valley: soft wind over the grass, leaves, and birds chirping (short
//    pitch-swept whistles in little phrases) - quiet in a storm
//  - rain: a hiss with drop patter, muffled inside the cave
import { A, onStart } from './core.js'
import { bubble, burst, modal, rnd, tone } from './synth.js'

const s = { ok: false, dripAt: 0, birdAt: 2, leafAt: 0, shimmerAt: 0 }

function loop(kind, stereo = false) {
  const src = A.ctx.createBufferSource()
  src.buffer = stereo ? (kind === 'brown' ? A.noise.brownStereo : A.noise.pinkStereo) : A.noise[kind]
  src.loop = true
  src.start(0, Math.random() * (src.buffer.duration - 0.1))
  return src
}
const filt = (type, f, q = 0.7) => {
  const b = A.ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}
const gain = (v = 0) => {
  const g = A.ctx.createGain()
  g.gain.value = v
  return g
}

onStart(() => {
  const bus = A.amb
  s.room = gain(0)
  loop('brown', true).connect(filt('lowpass', 160)).connect(s.room).connect(bus)
  s.windF = filt('lowpass', 700, 0.5)
  s.wind = gain(0)
  loop('pink', true).connect(filt('highpass', 120)).connect(s.windF).connect(s.wind).connect(bus)
  // Water: the waterfall's roar (dark, broad) and the river's babble (brighter).
  s.falls = gain(0)
  loop('pink', true).connect(filt('highpass', 120)).connect(filt('lowpass', 1500, 0.4)).connect(s.falls).connect(bus)
  s.riverF = filt('bandpass', 1800, 0.6)
  s.river = gain(0)
  loop('pink', true).connect(s.riverF).connect(s.river).connect(bus)
  s.rainF = filt('lowpass', 6000, 0.5)
  s.rain = gain(0)
  loop('pink', true).connect(filt('highpass', 900)).connect(s.rainF).connect(s.rain).connect(bus)
  s.ok = true
})

// st: { cave 0..1, rain 0..1, water: { falls, river } 0..1, t (s) }
export function update(dt, st) {
  if (!s.ok || !A.ctx) return
  const t = A.ctx.currentTime
  const cave = st.cave
  const out = 1 - cave
  s.room.gain.setTargetAtTime(cave * 0.35, t, 0.4)
  const gust = 0.7 + 0.3 * Math.sin(st.t * 0.37) * Math.sin(st.t * 0.13)
  s.wind.gain.setTargetAtTime(out * (0.16 + st.rain * 0.25) * gust, t, 0.5)
  s.windF.frequency.setTargetAtTime(500 + gust * 500 + st.rain * 600, t, 0.5)
  s.rain.gain.setTargetAtTime(st.rain * (0.35 - cave * 0.22), t, 0.6)
  const water = st.water ?? { falls: 0, river: 0 }
  s.falls.gain.setTargetAtTime(water.falls * 0.9 * (1 - cave * 0.6), t, 0.4)
  s.river.gain.setTargetAtTime(water.river * 0.3, t, 0.4)
  s.riverF.frequency.setTargetAtTime(1500 + Math.sin(st.t * 1.7) * 300 + Math.sin(st.t * 4.3) * 150, t, 0.1)
  s.rainF.frequency.setTargetAtTime(cave > 0.5 ? 1400 : 6000, t, 0.5)
  // Reverb grows inside the cave.
  if (A.verb) A.verb.gain.setTargetAtTime(0.9 * (1 + cave * 1.6), t, 0.4)

  const now = st.t
  // Cave drips: a plink and its echo.
  if (cave > 0.3 && now > s.dripAt) {
    s.dripAt = now + rnd(0.6, 2.4)
    const f = rnd(900, 2200)
    const pan = rnd(-0.8, 0.8)
    bubble({ t: t + 0.01, f, d: 0.05, gain: 0.08 * cave, rise: 0.6, pan, verb: 1.2, bus: A.amb })
    if (Math.random() < 0.4) bubble({ t: t + 0.14, f: f * 1.3, d: 0.03, gain: 0.04 * cave, rise: 0.5, pan, verb: 1, bus: A.amb })
  }
  if (cave > 0.5 && now > s.shimmerAt) {
    s.shimmerAt = now + rnd(4, 9)
    modal({ t: t + 0.01, f: rnd(2200, 3600), modes: [[1, 1, 2.2], [2.32, 0.4, 1.4]], gain: 0.012 * cave, beat: 3, pan: rnd(-0.6, 0.6), verb: 1.4, bus: A.amb })
  }
  // Birds outside (not in the rain).
  if (out > 0.6 && st.rain < 0.2 && now > s.birdAt) {
    s.birdAt = now + rnd(3, 9)
    const pan = rnd(-0.9, 0.9)
    const base = rnd(2600, 4200)
    const notes = 2 + Math.floor(Math.random() * 4)
    let at = t + 0.02
    for (let i = 0; i < notes; i++) {
      const f = base * rnd(0.85, 1.2)
      tone({ t: at, f, f2: f * rnd(1.2, 1.6), glide: 0.07, a: 0.01, d: rnd(0.06, 0.12), gain: 0.025 * out, pan, verb: 0.3, bus: A.amb })
      at += rnd(0.09, 0.16)
    }
  }
  // Leaves rustling in a gust.
  if (out > 0.6 && now > s.leafAt) {
    s.leafAt = now + rnd(2, 6)
    burst({ t: t + 0.01, noise: 'pink', f: rnd(2500, 4500), q: 1.2, a: 0.3, d: 0.6, gain: 0.02 * out, pan: rnd(-0.8, 0.8), bus: A.amb })
  }
}
