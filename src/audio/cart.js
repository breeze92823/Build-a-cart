// The cart as heard from the chase cam. Layers, each following the ride state:
//  - motor: the exhaust worklet (worklet.js), rpm/load from speed and throttle,
//    voiced per engine (a rusty single-pot putter up to a burbling V8); jets and
//    rockets add a turbine/rocket roar of shaped noise instead
//  - rails: a low rolling rumble and a faint steel ring at speed (the clack-clack of
//    the rail joints is cued per axle by ride.js: sfx.railJoint)
//  - wind rushing past, louder at speed and in the air
//  - brake squeal (narrow, wobbling band of noise) while braking at speed
//  - booster roar while a booster burns
import { A, onStart } from './core.js'
import { saturation } from './synth.js'
import { WORKLET } from './worklet.js'

// idle/max rpm, motor level, roar level (turbine/rocket noise), whine (turbine tone).
const PROFILES = {
  rusty: { idle: 520, max: 2600, motor: 0.55, roar: 0, whine: 0, sputter: 0.25, tone: 420 },
  mower: { idle: 1100, max: 4200, motor: 0.45, roar: 0, whine: 0, sputter: 0.08, tone: 900 },
  scooter: { idle: 1200, max: 5600, motor: 0.45, roar: 0, whine: 0, sputter: 0, tone: 1100 },
  v4: { idle: 760, max: 4800, motor: 0.55, roar: 0.04, whine: 0, sputter: 0, tone: 700 },
  v6: { idle: 760, max: 5400, motor: 0.6, roar: 0.06, whine: 0.02, sputter: 0, tone: 800 },
  v8: { idle: 650, max: 5600, motor: 0.7, roar: 0.08, whine: 0.03, sputter: 0, tone: 650 },
  jet: { idle: 400, max: 1400, motor: 0.12, roar: 0.35, whine: 0.06, sputter: 0, tone: 400 },
  rocket: { idle: 300, max: 900, motor: 0.05, roar: 0.5, whine: 0, sputter: 0, tone: 300 },
}
// Engine id -> which voice above it borrows (ids named in PROFILES use their own):
// small blocks putter like the mower/scooter, V engines and big piston-ish ones
// burble, the magic/elemental ones roar like a turbine, flame-throwers like a rocket.
const VOICE = {
  engine: 'mower',
  sail: 'scooter',
  seashell: 'scooter',
  ghostsail: 'scooter',
  cactus: 'scooter',
  coil: 'v4',
  dome: 'v4',
  v12: 'v6',
  turbo: 'v6',
  coffin: 'v6',
  chain: 'v6',
  seashell2: 'v6',
  bubblegum: 'v6',
  v16: 'v8',
  v18: 'v8',
  opv8: 'v8',
  f140: 'v8',
  hamburger: 'v8',
  ghost: 'jet',
  cauldron: 'jet',
  soulbinder: 'jet',
  water: 'jet',
  seaweed: 'jet',
  cinderlord: 'jet',
  spirit: 'rocket',
  firerocket: 'rocket',
  firebarrel: 'rocket',
}
export const profileFor = (id) => PROFILES[id] ?? PROFILES[VOICE[id]] ?? PROFILES.rusty

const s = { ok: false, misfire: 0 }
const K = 0.05

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

async function motorSource(ctx) {
  try {
    if (!ctx.audioWorklet) throw new Error('no worklet')
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const node = new AudioWorkletNode(ctx, 'cart-engine', { outputChannelCount: [2] })
    return { node, rpm: node.parameters.get('rpm'), load: node.parameters.get('load') }
  } catch {
    const out = gain(0.5)
    const a = ctx.createOscillator()
    a.type = 'sawtooth'
    const b = ctx.createOscillator()
    b.type = 'square'
    const bg = gain(0.4)
    a.connect(out)
    b.connect(bg).connect(out)
    a.start()
    b.start()
    const load = gain(0)
    const rpm = {
      setTargetAtTime(v, t, k) {
        a.frequency.setTargetAtTime((v / 60) * 4, t, k)
        b.frequency.setTargetAtTime((v / 60) * 2, t, k)
      },
    }
    return { node: out, rpm, load: load.gain }
  }
}

onStart(async (ctx) => {
  const bus = A.engine
  const m = await motorSource(ctx)
  s.rpm = m.rpm
  s.load = m.load
  const shaper = ctx.createWaveShaper()
  shaper.curve = saturation(1.6)
  shaper.oversample = '2x'
  s.tone = filt('lowpass', 600, 0.5)
  const body = filt('peaking', 120, 0.9)
  body.gain.value = 4
  const soft = filt('highshelf', 2400, 0.7)
  soft.gain.value = -8
  s.motor = gain(0)
  m.node.connect(shaper).connect(s.tone).connect(body).connect(soft).connect(s.motor).connect(bus)

  s.roarF = filt('bandpass', 300, 0.5)
  s.roar = gain(0)
  loop('pink', true).connect(s.roarF).connect(s.roar).connect(bus)
  s.whine = ctx.createOscillator()
  s.whine.type = 'triangle'
  s.whine.frequency.value = 2000
  s.whineG = gain(0)
  s.whine.connect(s.whineG).connect(bus)
  s.whine.start()

  s.rollF = filt('lowpass', 140, 0.7)
  s.roll = gain(0)
  loop('brown', true).connect(s.rollF).connect(s.roll).connect(bus)
  s.ringF = filt('bandpass', 950, 4)
  s.ring = gain(0)
  loop('pink', true).connect(s.ringF).connect(s.ring).connect(bus)

  s.windF = filt('bandpass', 700, 0.4)
  s.wind = gain(0)
  loop('pink', true).connect(s.windF).connect(s.wind).connect(A.amb)

  s.screechF = filt('bandpass', 3200, 14)
  s.screech = gain(0)
  loop('white').connect(s.screechF).connect(s.screech).connect(bus)
  const wob = ctx.createOscillator()
  wob.frequency.value = 7
  const wobG = gain(260)
  wob.connect(wobG).connect(s.screechF.frequency)
  wob.start()

  s.boostF = filt('bandpass', 380, 0.6)
  s.boost = gain(0)
  loop('pink', true).connect(s.boostF).connect(s.boost).connect(bus)
  s.ok = true
})

// st: { riding, engine (id), speed m/s (signed), top, throttle 0..1, brake 0..1,
//       air, boosting, fuel (bool: has fuel) }
export function update(dt, st) {
  if (!s.ok || !A.ctx) return
  const t = A.ctx.currentTime
  const P = profileFor(st.engine)
  const v = Math.abs(st.speed)
  const f = Math.min(1, v / Math.max(8, st.top))
  const on = st.riding ? 1 : 0
  const running = on && st.fuel ? 1 : 0
  const thr = running ? st.throttle : 0
  // Misfires for the old motors: the rpm stumbles now and then.
  if (running && P.sputter && Math.random() < P.sputter * dt * 6) s.misfire = 0.25
  s.misfire = Math.max(0, s.misfire - dt)
  // In the air the wheels spin free: on the gas the engine flares up, unloaded.
  const free = st.air ? thr * 0.3 : 0
  const rpm = P.idle + (P.max - P.idle) * Math.min(1, f * 0.75 + thr * 0.25 + free + (st.boosting ? 0.15 : 0)) * (s.misfire > 0 ? 0.7 : 1)
  s.rpm.setTargetAtTime(rpm, t, K)
  s.load.setTargetAtTime(Math.min(1, 0.12 + thr * (st.air ? 0.45 : 0.88)), t, K)
  s.tone.frequency.setTargetAtTime(P.tone * (0.6 + thr * 1.4 + f * 0.6), t, K)
  s.motor.gain.setTargetAtTime(running * P.motor * (0.45 + 0.55 * thr) * (s.misfire > 0 ? 0.4 : 1), t, K)
  s.roarF.frequency.setTargetAtTime(220 + (thr * 0.6 + f * 0.4) * 900, t, K)
  s.roar.gain.setTargetAtTime(running * P.roar * (0.2 + thr * 0.8), t, K)
  s.whine.frequency.setTargetAtTime(1400 + f * 3000 + thr * 600, t, 0.2)
  s.whineG.gain.setTargetAtTime(running * P.whine * (0.3 + thr), t, 0.1)

  const grounded = on && !st.air ? 1 : 0
  s.rollF.frequency.setTargetAtTime(90 + Math.min(1, v / 40) * 260, t, 0.1)
  s.roll.gain.setTargetAtTime(grounded * 0.55 * Math.min(1, v / 14), t, 0.08)
  s.ringF.frequency.setTargetAtTime(700 + Math.min(1, v / 50) * 900, t, 0.2)
  s.ring.gain.setTargetAtTime(grounded * 0.05 * Math.min(1, v / 30) ** 2, t, 0.15)
  const windK = Math.min(1, v / 55)
  s.windF.frequency.setTargetAtTime(500 + windK * 1600, t, 0.2)
  s.wind.gain.setTargetAtTime(on * (st.air ? 0.55 : 0.35) * windK * windK, t, 0.15)
  s.screech.gain.setTargetAtTime(grounded * st.brake * 0.12 * Math.min(1, v / 8), t, 0.04)
  s.boost.gain.setTargetAtTime(on && st.boosting ? 0.5 : 0, t, st.boosting ? 0.03 : 0.25)
  // Rail joints are cued per axle by ride.js (cartFeel.js), in step with the body's bumps: sfx.railJoint.
}
