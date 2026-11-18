// Audio core: one AudioContext for the whole game, made on the first user
// gesture (browsers refuse to start audio before one; iOS also needs a sound
// started inside that gesture). Everything is synthesised at runtime, no files.
//
// Graph:  ui ─────────────────────────────┐
//         sfx ──┬──────────────────────────┤
//               └─ reverb send ─ convolver ┤
//         world (duck) ─┬─ amb ────────────┼─ master ─ glue comp ─ limiter ─ out
//                       └─ engine ─────────┘
// `world` dips while a menu window is open so the UI sits on top of the scene.
// The reverb is a generated impulse response: a few early reflections (the
// cliffs and stalls) and a short, darkening tail, so one-shots sit in the beach
// instead of sounding pasted on top of it.
import { AUDIO, COARSE_POINTER } from '../config.js'

export const A = {
  ctx: null,
  master: null,
  ui: null,
  sfx: null,
  verb: null, // reverb send input
  world: null,
  amb: null,
  engine: null,
  noise: {}, // white / pink / brown mono buffers, pinkStereo for beds
  voices: 0, // one-shot voices sounding now (see voice())
}

const startHooks = []
const oneShotBuses = [] // [bus, base gain]: see autoGain
let ducked = false // menu window open: see setDucked
// fn(ctx) runs once the context exists (immediately if it already does).
export function onStart(fn) {
  if (A.master) fn(A.ctx)
  else startHooks.push(fn)
}

// --- Volume + mute (persisted) ---------------------------------------------------
let volume = AUDIO.volume
let muted = false
try {
  muted = localStorage.getItem(AUDIO.storageKey) === 'muted'
} catch {
  // Storage blocked: unmuted.
}
let adMuted = false // an ad break is playing: silence, never persisted
const level = () => (muted || adMuted ? 0 : volume * volume) // perceptual: the slider feels even
export function setAdMuted(on) {
  adMuted = !!on
  applyLevel(0.01)
}
function applyLevel(t = 0.05) {
  if (A.master) A.master.gain.setTargetAtTime(level(), A.ctx.currentTime, t)
}
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0))
  applyLevel()
}
export const isMuted = () => muted
export function setMuted(on) {
  muted = !!on
  try {
    localStorage.setItem(AUDIO.storageKey, muted ? 'muted' : 'on')
  } catch {
    // Storage blocked: this session only.
  }
  applyLevel()
}
export const toggleMuted = () => setMuted(!muted)

// --- Noise -------------------------------------------------------------------------
function makeNoise(ctx, seconds, kind, channels = 1) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate)
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'white') d[i] = w * 0.5
      else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      } else {
        // Paul Kellet's pink filter.
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      }
    }
    // Crossfade the ends so a looping buffer has no click at the seam.
    const fade = Math.min(2048, len >> 3)
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      d[i] = d[i] * k + d[len - fade + i] * (1 - k)
    }
  }
  return buf
}

// Output safety: straight through below `knee`, then a smooth bend that never
// passes 1, so a peak is rounded off instead of clipped flat (which is the harsh,
// "broken speaker" crackle). A WaveShaper reads its curve over input -1..1, so the
// signal is halved on the way in (clipIn) and the curve covers -2..2 of the real level.
function softClip(knee) {
  const n = 4096
  const c = new Float32Array(n)
  const room = 1 - knee
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 4 - 2 // real level -2..2 (shaper input -1..1)
    const ax = Math.abs(x)
    const y = ax <= knee ? ax : knee + room * Math.tanh((ax - knee) / room)
    c[i] = Math.sign(x) * y
  }
  return c
}

// Stereo impulse response: pre-delay, sparse early reflections, then a noise
// tail whose high end dies first (air + sand absorb the highs).
function makeImpulse(ctx) {
  const R = AUDIO.reverb
  const sr = ctx.sampleRate
  const len = Math.floor(sr * R.seconds)
  const buf = ctx.createBuffer(2, len, sr)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    const pre = Math.floor(sr * R.preDelay)
    for (const [ms, g] of R.early) {
      const i = pre + Math.floor(sr * (ms / 1000) * (c ? 1.07 : 0.94))
      if (i < len) d[i] += g * (Math.random() < 0.5 ? -1 : 1)
    }
    let lp = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr
      const k = Math.min(0.95, 0.15 + t * R.darken) // one-pole lowpass that closes over time
      lp += (1 - k) * ((Math.random() * 2 - 1) - lp)
      d[i] += lp * Math.exp((-6.9 * t) / R.decay) * R.tail
    }
  }
  return buf
}

// The context itself is made inside the gesture (autoplay rules); the noise buffers,
// the reverb IR and the bus graph (~2M generated samples: a hitch on a phone) follow
// a moment later, so the first tap doesn't stall the frame it lands in.
function build() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return false
  let ctx
  try {
    ctx = new AC({ latencyHint: COARSE_POINTER ? AUDIO.latencyTouch : AUDIO.latency })
  } catch {
    try {
      ctx = new AC() // an old engine that rejects a numeric hint
    } catch {
      return false
    }
  }
  A.ctx = ctx
  setTimeout(buildGraph, 0)
  return true
}

function buildGraph() {
  const ctx = A.ctx
  A.noise.white = makeNoise(ctx, 2, 'white')
  A.noise.pink = makeNoise(ctx, 4, 'pink')
  A.noise.brown = makeNoise(ctx, 4, 'brown')
  A.noise.pinkStereo = makeNoise(ctx, 6, 'pink', 2)
  A.noise.brownStereo = makeNoise(ctx, 6, 'brown', 2)

  // Master chain. Overlapping sounds used to crackle here: a DynamicsCompressor adds
  // its own automatic makeup gain (several dB at these settings) and a 2 ms attack
  // lets transients through, so a stack of one-shots went past 0 dBFS and hard-clipped
  // at the output; the 100 ms release on top made the level pump audibly. Now: headroom
  // first, a gentle glue, a limiter with a soft knee and an unhurried release, the
  // makeup gain taken back off, and a soft clipper last so a peak that still slips
  // through is rounded off instead of squared off.
  const M = AUDIO.mix
  const headroom = ctx.createGain()
  headroom.gain.value = M.headroom
  const glue = ctx.createDynamicsCompressor() // gentle bus glue
  glue.threshold.value = -20
  glue.knee.value = 18
  glue.ratio.value = 2
  glue.attack.value = 0.02
  glue.release.value = 0.3
  const limit = ctx.createDynamicsCompressor() // catches stacks of rewards
  limit.threshold.value = -8
  limit.knee.value = 6
  limit.ratio.value = 20
  limit.attack.value = 0.003
  limit.release.value = 0.25
  const trim = ctx.createGain() // takes the compressors' makeup gain back off
  trim.gain.value = M.trim
  trim.gain.value *= 0.5 // clipIn: see softClip
  const clip = ctx.createWaveShaper()
  clip.curve = softClip(M.clipKnee)
  clip.oversample = '2x'
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(headroom).connect(glue).connect(limit).connect(trim).connect(clip).connect(ctx.destination)

  const bus = (gain, to = master) => {
    const g = ctx.createGain()
    g.gain.value = gain
    g.connect(to)
    return g
  }
  A.ui = bus(AUDIO.buses.ui)
  A.sfx = bus(AUDIO.buses.sfx)
  oneShotBuses.push([A.ui, AUDIO.buses.ui], [A.sfx, AUDIO.buses.sfx]) // kept even while sfxAt swaps A.sfx
  A.world = bus(ducked ? AUDIO.duck : 1)
  A.amb = bus(AUDIO.buses.amb, A.world)
  A.engine = bus(AUDIO.buses.engine, A.world)
  const conv = ctx.createConvolver()
  conv.buffer = makeImpulse(ctx)
  A.verb = ctx.createGain()
  A.verb.gain.value = AUDIO.reverb.send
  A.verb.connect(conv).connect(master)
  A.master = master // last: ready() (and every sound) waits for the whole graph

  applyLevel(0.3) // fade in, no thump at start
  for (const fn of startHooks.splice(0)) {
    try {
      fn(ctx)
    } catch (e) {
      console.warn('[audio]', e) // one broken layer must not take the rest down
    }
  }
}

// iOS only opens the output for a sound started inside the gesture itself.
function kick() {
  const src = A.ctx.createBufferSource()
  src.buffer = A.ctx.createBuffer(1, 1, A.ctx.sampleRate)
  src.connect(A.ctx.destination)
  src.start()
}

function unlock() {
  if (!A.ctx && !build()) return
  if (A.ctx.state !== 'running' && !document.hidden) A.ctx.resume?.().catch(() => {})
  kick()
}

export function installAudio() {
  for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, { capture: true, passive: true })
  // A hidden tab goes silent (and stops costing battery).
  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return
    if (document.hidden) A.ctx.suspend?.().catch(() => {})
    else A.ctx.resume?.().catch(() => {})
  })
}

export const ready = () => !!A.master && A.ctx.state === 'running'
// Start time for a one-shot: a hair ahead of the clock, so the nodes reach the audio
// thread before their envelope begins even if the main thread stalls right after.
export const now = () => A.ctx.currentTime + AUDIO.lead

// Menu window open: the world (ambience + engine) steps back.
export function setDucked(on) {
  if (on === ducked) return
  ducked = on
  if (A.world) A.world.gain.setTargetAtTime(on ? AUDIO.duck : 1, A.ctx.currentTime, 0.12)
}

// One-shot voice budget: a burst of rewards on a weak phone skips the extras
// instead of crackling. Returns false when the voice should not play.
// `priority` (1..5) picks how much of the budget a sound may use: small ticks and
// taps drop out first, big moments (crash, rebirth) still get through. The budget
// is a hard ceiling (it used to be multiplied by the priority, so up to 5x it).
const MAX_VOICES = COARSE_POINTER ? AUDIO.maxVoicesTouch : AUDIO.maxVoices
export function voice(seconds, priority = 1) {
  if (!ready()) return false
  const share = Math.min(1, 0.5 + 0.125 * priority)
  if (A.voices >= Math.ceil(MAX_VOICES * share)) return false
  A.voices++
  autoGain()
  setTimeout(() => {
    A.voices--
    autoGain()
  }, seconds * 1000 + 50)
  return true
}

// Many one-shots at once add up far past what one sounds like: the one-shot buses
// step down as voices stack (about -3 dB per doubling past a few), so the limiter
// only has to catch peaks instead of squashing (pumping) the whole mix.
function autoGain() {
  if (!oneShotBuses.length) return
  const M = AUDIO.mix
  const extra = Math.max(0, A.voices - M.freeVoices)
  const k = 1 / Math.sqrt(1 + extra / M.freeVoices)
  const t = A.ctx.currentTime
  for (const [bus, base] of oneShotBuses) {
    bus.gain.cancelScheduledValues(t)
    bus.gain.setTargetAtTime(base * k, t, extra > 0 ? 0.015 : 0.12) // quick down, slow back up
  }
}
