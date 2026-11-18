// The other players' carts as heard from here. One shared voice follows the loudest riding
// remote (remote.js picks it: nearest, weighted by its revs): a lighter engine than our own
// (two oscillators through a saturator, voiced by the same engine profiles), the roar of jets and
// rockets, and its wheels' rumble on the rails. Distance sets the level and the muffling, the
// side the pan, and the closing speed a Doppler shift, so a cart racing past goes "neeeoww".
import { A, onStart } from './core.js'
import { saturation } from './synth.js'
import { profileFor } from './cart.js'

const s = { ok: false }
const K = 0.06

function loop(kind) {
  const src = A.ctx.createBufferSource()
  src.buffer = A.noise[kind]
  src.loop = true
  src.start(0, Math.random() * (src.buffer.duration - 0.1))
  return src
}
function filt(type, f, q = 0.7) {
  const b = A.ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}
function gain(v = 0) {
  const g = A.ctx.createGain()
  g.gain.value = v
  return g
}

onStart((ctx) => {
  s.pan = ctx.createStereoPanner()
  s.air = filt('lowpass', 6000, 0.5) // distance muffling
  s.air.connect(s.pan).connect(A.engine)
  s.a = ctx.createOscillator()
  s.a.type = 'sawtooth'
  s.b = ctx.createOscillator()
  s.b.type = 'square'
  const bG = gain(0.35)
  const shaper = ctx.createWaveShaper()
  shaper.curve = saturation(1.8)
  s.tone = filt('lowpass', 500, 0.6)
  s.motor = gain(0)
  s.a.connect(shaper)
  s.b.connect(bG).connect(shaper)
  shaper.connect(s.tone).connect(s.motor).connect(s.air)
  s.a.start()
  s.b.start()
  s.roarF = filt('bandpass', 400, 0.5)
  s.roar = gain(0)
  loop('pink').connect(s.roarF).connect(s.roar).connect(s.air)
  s.rollF = filt('lowpass', 160, 0.7)
  s.roll = gain(0)
  loop('brown').connect(s.rollF).connect(s.roll).connect(s.air)
  s.ok = true
})

// r: null (no remote riding near) or { dist m, pan -1..1, v m/s, top, throttle 0..1, engine id,
//    fuel (bool), air (bool), closing m/s (+ = coming closer) }
export function update(dt, r) {
  if (!s.ok || !A.ctx) return
  const t = A.ctx.currentTime
  if (!r) {
    s.motor.gain.setTargetAtTime(0, t, 0.3)
    s.roar.gain.setTargetAtTime(0, t, 0.3)
    s.roll.gain.setTargetAtTime(0, t, 0.3)
    return
  }
  const P = profileFor(r.engine)
  const v = Math.abs(r.v)
  const f = Math.min(1, v / Math.max(8, r.top || 40))
  const thr = r.fuel ? r.throttle : 0
  const vol = 1 / (1 + (r.dist / 16) ** 2)
  const doppler = Math.max(0.75, Math.min(1.3, 343 / (343 - Math.max(-80, Math.min(80, r.closing)))))
  const rpm = (P.idle + (P.max - P.idle) * Math.min(1, f * 0.75 + thr * 0.25 + (r.air ? thr * 0.3 : 0))) * doppler
  s.a.frequency.setTargetAtTime((rpm / 60) * 2, t, K)
  s.b.frequency.setTargetAtTime(rpm / 60, t, K)
  s.tone.frequency.setTargetAtTime(P.tone * (0.6 + thr * 1.2 + f * 0.5) * doppler, t, K)
  s.motor.gain.setTargetAtTime(r.fuel ? vol * P.motor * 0.35 * (0.4 + 0.6 * thr) : 0, t, K)
  s.roarF.frequency.setTargetAtTime((220 + (thr * 0.6 + f * 0.4) * 900) * doppler, t, K)
  s.roar.gain.setTargetAtTime(r.fuel ? vol * P.roar * 0.8 * (0.2 + thr * 0.8) : 0, t, K)
  s.rollF.frequency.setTargetAtTime((90 + Math.min(1, v / 40) * 260) * doppler, t, 0.1)
  s.roll.gain.setTargetAtTime(r.air ? 0 : vol * 0.5 * Math.min(1, v / 14), t, 0.08)
  s.air.frequency.setTargetAtTime(Math.max(700, 9000 / (1 + r.dist / 25)), t, 0.1)
  s.pan.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, r.pan)), t, 0.05)
}
