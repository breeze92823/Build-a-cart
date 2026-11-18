// Every one-shot sound in the game, synthesised from physical recipes (synth.js).
// Nothing here throws or plays before the first gesture: each export returns
// quietly when audio isn't running or the voice budget is spent.
//
// Materials are mode tables [ratio, amplitude, decay s]: a coin is a thin
// metal plate, the glockenspiel a free bar (2.756 is the real bar overtone),
// the bell a church/hand-bell partial set, wood and plastic die in tens of ms.
import { COARSE_POINTER } from '../config.js'
import { A, isMuted, now, voice } from './core.js'
import { bubble, bubbles, burst, crinkle, modal, pick, rnd, route, saturation, tone, vary } from './synth.js'

const COIN = [[1, 1, 0.5], [1.504, 0.6, 0.36], [2.24, 0.45, 0.26], [2.71, 0.3, 0.18], [3.47, 0.22, 0.12], [4.03, 0.12, 0.08]]
const TROPHY = [[1, 1, 0.7], [2.05, 0.5, 0.5], [3.1, 0.34, 0.32], [4.33, 0.2, 0.2], [5.6, 0.1, 0.12]]
const GLOCK = [[1, 1, 1.4], [2.756, 0.32, 0.45], [5.404, 0.1, 0.18], [8.933, 0.04, 0.08]]
const BELL = [[0.5, 0.3, 1.5], [1, 1, 1.3], [1.19, 0.45, 1], [1.5, 0.3, 0.85], [2, 0.42, 0.75], [2.5, 0.18, 0.5], [2.66, 0.22, 0.45], [3.01, 0.1, 0.35], [4.1, 0.06, 0.25]]
const WOOD = [[1, 1, 0.07], [2.57, 0.45, 0.035], [4.2, 0.22, 0.016], [6.1, 0.08, 0.01]]
const PLASTIC = [[1, 1, 0.026], [2.31, 0.5, 0.016], [3.93, 0.28, 0.01]]
const GLASS = [[1, 1, 0.45], [2.32, 0.5, 0.28], [4.25, 0.28, 0.16], [6.63, 0.14, 0.1]]

const semi = (n) => Math.pow(2, n / 12)
const C6 = 1046.5

// --- Bookkeeping -----------------------------------------------------------------------------
const lastAt = new Map()
// false if `name` played less than `ms` ago (keeps rapid repeats from stacking).
function limit(name, ms) {
  const t = performance.now()
  if (t - (lastAt.get(name) ?? -1e9) < ms) return false
  lastAt.set(name, t)
  return true
}
// A specific sound claims the moment, so the generic feedback sounds (uiWindow's
// replay, hud's spend detection) that fire in the same handler stay quiet.
let claimed = -1e9
const claim = () => (claimed = performance.now())
export const claimedRecently = (ms = 80) => performance.now() - claimed < ms

// Phone haptics for the big moments (Android; iOS ignores it).
function buzz(pattern) {
  if (!COARSE_POINTER || isMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not allowed in this frame.
  }
}

// --- UI ------------------------------------------------------------------------------------------
// HUD button: a short plastic press with a felt-y body thump.
export function click(pan = 0) {
  if (!limit('click', 30) || !voice(0.1, 2)) return
  const t = now()
  const bus = A.ui
  burst({ t, f: vary(4200, 0.1), q: 1.2, d: 0.006, gain: 0.2, bus, pan })
  modal({ t, f: vary(1250, 0.06), modes: PLASTIC, gain: 0.16, bus, pan })
  tone({ t, f: vary(170, 0.05), f2: 85, d: 0.04, gain: 0.22, bus, pan })
}

// Big chunky menu button: deeper, a rubbery squish under the click.
export function press(pan = 0) {
  if (!limit('click', 30) || !voice(0.12, 2)) return
  const t = now()
  const bus = A.ui
  burst({ t, f: vary(3000, 0.1), q: 1, d: 0.008, gain: 0.2, bus, pan })
  modal({ t, f: vary(820, 0.05), modes: PLASTIC, gain: 0.18, bus, pan })
  tone({ t, f: vary(140, 0.05), f2: 68, d: 0.06, gain: 0.3, bus, pan })
  burst({ t, type: 'lowpass', f: 900, q: 0.6, a: 0.004, d: 0.045, gain: 0.08, bus, pan })
}

// Picking a card in a grid: a light tap on a plastic tile.
export function tick(pan = 0) {
  if (!limit('click', 30) || !voice(0.06, 2)) return
  const t = now()
  const bus = A.ui
  burst({ t, f: vary(6000, 0.1), q: 1.4, d: 0.004, gain: 0.12, bus, pan })
  modal({ t, f: vary(2300, 0.06), modes: PLASTIC, gain: 0.1, bus, pan })
}

// Toggle switch (AUTO TRAIN / RACE): two clicks a few ms apart and a tiny spring ring.
export function toggle(on) {
  if (!voice(0.2, 2)) return
  const t = now()
  const bus = A.ui
  modal({ t, f: on ? 1500 : 1700, modes: PLASTIC, gain: 0.14, bus, strike: 0.12 })
  modal({ t: t + 0.016, f: on ? 2100 : 1250, modes: PLASTIC, gain: 0.16, bus, strike: 0.1 })
  modal({ t: t + 0.016, f: on ? 3400 : 2900, modes: COIN, gain: 0.025, decay: 0.3, bus })
  tone({ t, f: 180, f2: 90, d: 0.04, gain: 0.15, bus })
}

// Window opens: air pushed aside, then the card lands on felt.
export function windowOpen() {
  if (!limit('win', 90) || !voice(0.35, 2)) return
  const t = now()
  const bus = A.ui
  burst({ t, noise: 'pink', f: 320, f2: 2400, q: 0.9, a: 0.09, d: 0.17, gain: 0.32, bus })
  tone({ t: t + 0.11, f: 125, f2: 70, d: 0.09, gain: 0.22, bus })
  burst({ t: t + 0.11, type: 'lowpass', f: 1500, q: 0.5, d: 0.05, gain: 0.1, bus })
}

export function windowClose() {
  if (!limit('win', 90) || !voice(0.2, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 2100, f2: 300, q: 0.9, a: 0.02, d: 0.14, gain: 0.38, bus: A.ui })
}

// No: two dull knocks on wood. Firm but never a harsh buzzer.
export function deny() {
  if (!limit('deny', 140) || !voice(0.2, 2)) return
  const t = now()
  const bus = A.ui
  modal({ t, f: vary(215, 0.03), modes: WOOD, gain: 0.42, strike: 0.15, bus })
  modal({ t: t + 0.09, f: vary(168, 0.03), modes: WOOD, gain: 0.36, strike: 0.12, bus })
  buzz(30)
}

// Coins tumbling onto a counter: n clinks of random small coins, fading out.
function coins(t, n, spread, gain, pan = 0) {
  for (let i = 0; i < n; i++) {
    const at = t + Math.pow(i / n, 1.3) * spread + rnd(0, 0.02)
    modal({ t: at, f: rnd(2500, 4400), modes: COIN, gain: gain * (1 - (i / n) * 0.7), beat: 7, strike: 0.25, decay: rnd(0.5, 1), pan: pan + rnd(-0.3, 0.3), bus: A.sfx, verb: 0.08 })
  }
  // The rattle of them settling.
  crinkle({ t: t + spread * 0.4, n: COARSE_POINTER ? 6 : 12, dur: spread, gain: 0.03, f0: 4000, f1: 9000 })
}

// Spending Wins: the till drawer clunks, the bell rings, coins pour out.
export function purchase() {
  if (!limit('buy', 200) || !voice(1.4, 3)) return
  claim()
  const t = now()
  burst({ t, type: 'lowpass', f: 700, q: 0.7, d: 0.1, gain: 0.32 })
  tone({ t, f: 95, f2: 52, d: 0.1, gain: 0.32 })
  modal({ t: t + 0.04, f: 1046, modes: BELL, gain: 0.2, beat: 4, strike: 0.2, verb: 0.15 })
  coins(t + 0.06, COARSE_POINTER ? 6 : 10, 0.45, 0.09)
  buzz([20, 40, 30])
}

// Equip: a latch clicking home, a small metal clack, a lift of air.
export function equip() {
  if (!limit('equip', 120) || !voice(0.4, 2)) return
  claim()
  const t = now()
  modal({ t, f: vary(1800, 0.04), modes: PLASTIC, gain: 0.16, strike: 0.15, bus: A.ui })
  modal({ t: t + 0.045, f: vary(2400, 0.04), modes: COIN, gain: 0.07, decay: 0.45, strike: 0.3, bus: A.ui })
  tone({ t: t + 0.045, f: 210, f2: 120, d: 0.035, gain: 0.2, bus: A.ui })
  burst({ t, noise: 'pink', f: 600, f2: 1900, q: 0.8, a: 0.03, d: 0.1, gain: 0.08, bus: A.ui })
}

// A soft cork-like pop (pets hopping in or out of the team).
export function pop(up = true) {
  if (!limit('pop', 50) || !voice(0.15, 2)) return
  claim()
  const t = now()
  bubble({ t, f: up ? vary(480, 0.08) : vary(720, 0.08), d: 0.06, gain: 0.28, rise: up ? 1.1 : -0.45, bus: A.ui })
  burst({ t, f: 2600, q: 1, d: 0.008, gain: 0.1, bus: A.ui })
}

// Padlock shackle snapping shut / open.
export function lock() {
  if (!voice(0.3, 2)) return
  claim()
  const t = now()
  modal({ t, f: vary(1900, 0.03), modes: COIN, gain: 0.12, decay: 0.35, strike: 0.4, beat: 9, bus: A.ui })
  modal({ t: t + 0.03, f: 1100, modes: PLASTIC, gain: 0.12, bus: A.ui })
}

// Hotbar slot: pulling a tool off the belt.
export function holster() {
  if (!voice(0.15, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 1500, q: 1.2, a: 0.02, d: 0.08, gain: 0.12, bus: A.ui })
  modal({ t: t + 0.05, f: 1600, modes: PLASTIC, gain: 0.1, bus: A.ui })
}

// Glockenspiel notes (semitones above C6), `gap` s apart.
function glock(t, notes, gap, gain = 0.14, verb = 0.25, bus = A.sfx) {
  notes.forEach((n, i) => modal({ t: t + i * gap, f: C6 * semi(n), modes: GLOCK, gain: gain * rnd(0.85, 1), strike: 0.12, pan: (i / Math.max(1, notes.length - 1) - 0.5) * 0.5, verb, bus }))
}

// --- World + race --------------------------------------------------------------------------------
// Water splash: the impact thud, white spray, then a cloud of bubbles and the drops coming back down.
export function splash(size = 1, pan = 0, bus = A.sfx) {
  if (!voice(1.2, 2)) return
  const t = now()
  const k = COARSE_POINTER ? 0.6 : 1
  burst({ t, noise: 'pink', type: 'lowpass', f: 650, f2: 200, q: 0.7, a: 0.004, d: 0.2 * size, gain: 0.4 * Math.min(1.4, size), pan, bus })
  tone({ t, f: 90, f2: 45, d: 0.13, gain: 0.28 * Math.min(1.4, size), pan, bus })
  burst({ t, type: 'highpass', f: 2400, q: 0.5, a: 0.012, d: 0.5 * size, gain: 0.16 * size, pan, bus, verb: 0.12 })
  bubbles({ t, n: Math.round(26 * size * k), dur: 0.35 * size, f0: 330, f1: 2200, gain: 0.08, bus, verb: 0.12 })
  bubbles({ t: t + 0.22 * size, n: Math.round(14 * size * k), dur: 0.5 * size, f0: 1200, f1: 4200, gain: 0.035, d: [0.008, 0.02], bus })
}

// Every boost tap: a slap of spray off the bow (the engine blips itself, engine.js).
export function tapSpray() {
  if (!limit('tap', 45) || !voice(0.2, 1)) return
  const t = now()
  const pan = rnd(-0.25, 0.25)
  burst({ t, f: vary(3200, 0.15), f2: 1700, q: 0.7, a: 0.006, d: 0.09, gain: 0.07, pan })
  bubbles({ t, n: 3, dur: 0.06, f0: 700, f1: 2400, gain: 0.03 })
}

// Stadium air horn: two reeds a major third apart, a breath of air, and the
// beach throwing it back. len s of blast.
export function airHorn(len = 0.7, t = now(), gain = 0.17) {
  const ctx = A.ctx
  const out = ctx.createGain()
  out.gain.value = gain
  route(out, { verb: 0.45 })
  const shape = ctx.createWaveShaper()
  shape.curve = saturation(2.5)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1300
  bp.Q.value = 0.6
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 4200
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.linearRampToValueAtTime(1, t + 0.04)
  amp.gain.setValueAtTime(1, t + len)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.16)
  shape.connect(bp).connect(lp).connect(amp).connect(out)
  for (const f of [370, 371.5, 466]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f * 0.94, t) // reeds start flat and snap up to pitch
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06)
    const g = ctx.createGain()
    g.gain.value = 0.33
    o.connect(g).connect(shape)
    o.start(t)
    o.stop(t + len + 0.2)
  }
  burst({ t, f: 2200, q: 0.6, a: 0.03, hold: len, d: 0.12, gain: 0.025 })
  return t + len + 0.16
}

export function raceStart() {
  if (!voice(1.2, 3)) return
  claim()
  airHorn(0.75)
  buzz(60)
}

// Through a checkpoint wall: a doppler-ish whoosh past the ears.
function whooshPast(t) {
  burst({ t, noise: 'pink', f: 2600, f2: 380, q: 1.1, a: 0.06, d: 0.3, gain: 0.38 })
  tone({ t: t + 0.04, f: 110, f2: 58, d: 0.24, gain: 0.16 })
}

// Party popper: the crack, the cardboard body, paper fluttering down.
function popper(t, pan) {
  burst({ t, type: 'highpass', f: 2800, q: 0.6, a: 0.0005, d: 0.012, gain: 0.5, pan, verb: 0.2 })
  burst({ t, f: 900, q: 0.9, a: 0.001, d: 0.05, gain: 0.26, pan })
  tone({ t, f: 170, f2: 60, d: 0.06, gain: 0.2, pan })
  crinkle({ t: t + 0.05, n: COARSE_POINTER ? 14 : 28, dur: 0.9, gain: 0.05, f0: 2500, f1: 8000, width: 0.9 })
}

// A checkpoint paid out: whoosh, the "+N" pops, confetti poppers either side;
// lucky ones add a glockenspiel run. The trophies' landings are clink(i).
export function checkpoint(lucky = false) {
  if (!voice(1.4, 3)) return
  claim()
  const t = now()
  whooshPast(t)
  // Cork-ish pop of the "+N".
  tone({ t: t + 0.06, f: 900, f2: 210, glide: 0.035, d: 0.06, gain: 0.3 })
  burst({ t: t + 0.06, f: 2500, q: 1, d: 0.01, gain: 0.2 })
  popper(t + 0.1, -0.55)
  popper(t + 0.15, 0.55)
  if (lucky) glock(t + 0.2, [0, 4, 7, 12, 16, 19, 24], 0.06, 0.15, 0.3)
  buzz(lucky ? [30, 50, 30, 50, 60] : 25)
}

// A trophy landing in the counter (top right): metal cup clinks rising up a pentatonic scale.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19]
export function clink(i = 0) {
  if (!voice(0.8, 2)) return
  const t = now()
  const f = 1320 * semi(PENTA[Math.min(i, PENTA.length - 1)])
  modal({ t, f: vary(f, 0.006), modes: TROPHY, gain: 0.17, beat: 7, strike: 0.3, pan: rnd(0.35, 0.65), verb: 0.12 })
}

// Applause + cheering crowd: dozens of random claps (that is what applause is)
// over a roar of vowel-filtered noise voices and a couple of two-finger whistles.
export function applause(dur = 2.4, amount = 1, t = now()) {
  const claps = Math.round(dur * (COARSE_POINTER ? 30 : 55) * amount)
  for (let i = 0; i < claps; i++) {
    // Swells in fast, holds, thins out.
    const x = Math.random()
    const at = t + (x < 0.15 ? Math.sqrt(x / 0.15) * 0.15 : 0.15 + Math.pow((x - 0.15) / 0.85, 1.6) * 0.85) * dur
    burst({ t: at, f: rnd(900, 2600), q: rnd(1.4, 3), a: 0.0008, d: rnd(0.02, 0.05), gain: rnd(0.04, 0.12) * amount, pan: rnd(-0.85, 0.85), verb: 0.3 })
  }
  const voices = COARSE_POINTER ? 3 : 6
  for (let i = 0; i < voices; i++) {
    burst({ t: t + rnd(0, 0.2), noise: 'pink', f: rnd(450, 1100), f2: rnd(700, 1800), q: rnd(2, 4.5), a: 0.25, hold: dur * 0.35, d: dur * 0.6, gain: 0.07 * amount, pan: rnd(-0.7, 0.7), verb: 0.35 })
  }
  for (let i = 0; i < 2; i++) {
    const at = t + rnd(0.2, dur * 0.5)
    const f = rnd(2200, 2700)
    tone({ t: at, f, f2: f * 1.28, glide: 0.18, a: 0.03, hold: 0.22, d: 0.12, gain: 0.04 * amount, pan: rnd(-0.6, 0.6), verb: 0.3 })
    burst({ t: at, f: f * 1.1, q: 3, a: 0.03, hold: 0.22, d: 0.1, gain: 0.012 * amount, pan: 0, verb: 0.3 })
  }
}

// Passing the personal best mid-race.
export function record() {
  if (!voice(3, 4)) return
  claim()
  const t = now()
  airHorn(0.35, t, 0.13)
  glock(t + 0.1, [0, 4, 7, 12, 7, 12, 16], 0.07, 0.13, 0.35)
  applause(2.6, 0.9, t + 0.15)
  buzz([40, 60, 40, 60, 80])
}

// Top speed went up: a turbo spooling up, then the blow-off valve.
export function speedUp() {
  if (!voice(1.4, 3)) return
  claim()
  const t = now()
  tone({ t, f: 1500, f2: 6200, glide: 0.55, a: 0.18, hold: 0.25, d: 0.25, gain: 0.03 })
  burst({ t, f: 1400, f2: 5200, q: 2, a: 0.18, hold: 0.25, d: 0.2, sweep: 0.55, gain: 0.07 })
  burst({ t: t + 0.66, f: 3600, f2: 1600, q: 0.6, a: 0.004, d: 0.4, gain: 0.22, verb: 0.1 })
  glock(t + 0.7, [7, 12], 0.08, 0.1)
}

// Race over: two short horn blasts, the result card slaps down; a new best gets the crowd.
export function finish(best = false) {
  if (!voice(3, 4)) return
  claim()
  const t = now()
  airHorn(0.2, t, 0.15)
  airHorn(0.42, t + 0.32, 0.15)
  burst({ t: t + 0.8, noise: 'pink', f: 400, f2: 2200, q: 0.8, a: 0.07, d: 0.12, gain: 0.25 })
  tone({ t: t + 0.92, f: 120, f2: 65, d: 0.1, gain: 0.25 })
  if (best) {
    glock(t + 0.95, [0, 4, 7, 12, 16], 0.08, 0.14, 0.35)
    applause(2.8, 1, t + 0.95)
  }
}

// Lightning gained (training tick): a little electric crackle plus a glassy tick.
export function zap(n = 1) {
  if (!limit('zap', 250) || !voice(0.25, 1)) return
  const t = now()
  const k = Math.min(1, 0.55 + Math.log10(n + 1) * 0.15)
  const sparks = 4 + Math.floor(Math.random() * 4)
  for (let i = 0; i < sparks; i++) {
    burst({ t: t + Math.random() * 0.06, type: 'highpass', f: rnd(2500, 4500), q: 0.7, a: 0.0004, d: rnd(0.002, 0.008), gain: rnd(0.06, 0.12) * k, pan: rnd(-0.2, 0.2) })
  }
  tone({ t, type: 'sawtooth', f: 118, d: 0.08, gain: 0.025 * k, lp: 900 })
  modal({ t: t + 0.04, f: vary(3100, 0.05), modes: GLASS, gain: 0.03 * k, decay: 0.4, pan: 0.3 })
}

// Rebirth: a swell rushing in, a deep boom, a bright chord ringing out, the crowd.
export function rebirth() {
  if (!voice(3.5, 5)) return
  claim()
  const t = now()
  burst({ t, noise: 'pink', f: 200, f2: 3800, q: 0.8, a: 0.7, d: 0.06, gain: 0.32 })
  burst({ t, type: 'highpass', f: 5000, q: 0.5, a: 0.7, d: 0.05, gain: 0.08 })
  const hit = t + 0.74
  tone({ t: hit, f: 72, f2: 30, glide: 1.2, d: 1.6, gain: 0.6 })
  burst({ t: hit, noise: 'brown', type: 'lowpass', f: 420, q: 0.6, a: 0.005, d: 1.3, gain: 0.5, verb: 0.3 })
  burst({ t: hit, type: 'highpass', f: 4000, q: 0.5, a: 0.003, d: 0.7, gain: 0.12, verb: 0.3 })
  ;[0, 4, 7, 12, 16].forEach((n) => modal({ t: hit + 0.03, f: C6 * semi(n), modes: GLOCK, gain: 0.1, decay: 1.6, strike: 0.1, pan: rnd(-0.5, 0.5), verb: 0.4 }))
  applause(2.3, 0.8, hit + 0.1)
  buzz([0, 740, 120, 60, 80])
}

// Craft All: rising magic, glass shimmer, a pop, then a run up the glockenspiel.
export function craft() {
  if (!voice(1.5, 3)) return
  claim()
  const t = now()
  burst({ t, noise: 'pink', f: 300, f2: 3000, q: 1.4, a: 0.42, d: 0.05, gain: 0.22 })
  for (let i = 0; i < (COARSE_POINTER ? 8 : 16); i++) modal({ t: t + Math.random() * 0.42, f: rnd(2800, 6000), modes: GLASS, gain: 0.025, decay: 0.5, pan: rnd(-0.7, 0.7) })
  bubble({ t: t + 0.45, f: 420, d: 0.07, gain: 0.3, rise: 1.4 })
  glock(t + 0.5, [0, 4, 7, 12, 16, 19], 0.055, 0.13)
  buzz([30, 30, 50])
}

// Pets deleted: paper crumpled, swept off, a soft thud in the bin.
export function trash() {
  if (!voice(0.6, 2)) return
  claim()
  const t = now()
  crinkle({ t, n: COARSE_POINTER ? 22 : 40, dur: 0.32, gain: 0.12, f0: 1200, f1: 6000 })
  burst({ t: t + 0.25, noise: 'pink', f: 1800, f2: 300, q: 0.9, a: 0.02, d: 0.15, gain: 0.2 })
  tone({ t: t + 0.4, f: 110, f2: 60, d: 0.1, gain: 0.25 })
}

// Online gift claimed: wrapping paper torn, the lid pops, then what was inside.
export function gift(type) {
  if (!voice(1.6, 3)) return
  claim()
  const t = now()
  crinkle({ t, n: COARSE_POINTER ? 18 : 34, dur: 0.28, gain: 0.12 })
  tone({ t: t + 0.22, f: 230, f2: 120, d: 0.06, gain: 0.2 })
  burst({ t: t + 0.22, type: 'lowpass', f: 1100, q: 0.6, d: 0.05, gain: 0.12 })
  const r = t + 0.3
  if (type === 'trophy') {
    coins(r, COARSE_POINTER ? 6 : 10, 0.4, 0.09)
    modal({ t: r, f: 1320, modes: TROPHY, gain: 0.15, beat: 7, strike: 0.3, verb: 0.15 })
  } else if (type === 'bolt') {
    for (let i = 0; i < 10; i++) burst({ t: r + Math.random() * 0.18, type: 'highpass', f: rnd(2500, 5000), q: 0.7, a: 0.0004, d: rnd(0.003, 0.01), gain: rnd(0.08, 0.16), pan: rnd(-0.4, 0.4) })
    tone({ t: r, type: 'sawtooth', f: 110, f2: 160, d: 0.25, gain: 0.04, lp: 1200 })
    glock(r + 0.12, [7, 12, 19], 0.06, 0.11)
  } else if (type === 'potion') {
    modal({ t: r, f: 2100, modes: GLASS, gain: 0.14, beat: 3, strike: 0.3 })
    modal({ t: r + 0.12, f: 2350, modes: GLASS, gain: 0.1, beat: 3, strike: 0.2 })
    // Glug: big low bubbles through the neck.
    for (let i = 0; i < 5; i++) bubble({ t: r + 0.25 + i * 0.09 + rnd(0, 0.03), f: rnd(180, 380), d: 0.07, gain: 0.16, rise: 0.7 })
  } else {
    bubble({ t: r, f: 450, d: 0.07, gain: 0.28, rise: 1.2 })
    glock(r + 0.05, [0, 4, 7, 12, 16], 0.06, 0.13)
  }
  buzz([20, 40, 40])
}

// Driving onto a hub pad: a low energy hum swelling under a few sparkles.
export function padEnter() {
  if (!limit('pad', 600) || !voice(0.7, 2)) return
  const t = now()
  tone({ t, f: 82, a: 0.12, d: 0.45, gain: 0.12 })
  tone({ t, f: 164, a: 0.12, d: 0.35, gain: 0.04 })
  burst({ t, noise: 'pink', f: 500, f2: 2200, q: 1, a: 0.14, d: 0.25, gain: 0.08 })
  for (let i = 0; i < 4; i++) modal({ t: t + 0.05 + Math.random() * 0.3, f: C6 * semi(pick([12, 16, 19, 24])), modes: GLOCK, gain: 0.035, decay: 0.6, pan: rnd(-0.6, 0.6), verb: 0.3 })
}

// A training lane unlocked.
export function unlock() {
  if (!voice(1.2, 3)) return
  claim()
  const t = now()
  lock()
  burst({ t, noise: 'pink', f: 400, f2: 2600, q: 0.9, a: 0.12, d: 0.2, gain: 0.15 })
  glock(t + 0.12, [0, 7, 12, 16, 19], 0.07, 0.13)
}

// The boat hops: air lifts it, a little sand kicks up.
export function jump() {
  if (!limit('jump', 150) || !voice(0.25, 1)) return
  const t = now()
  burst({ t, noise: 'pink', f: 450, f2: 1400, q: 0.9, a: 0.03, d: 0.12, gain: 0.12 })
  crinkle({ t, n: 7, dur: 0.12, gain: 0.04, f0: 2500, f1: 7000 })
}

// Landing on sand (k 0..1 = how hard): a thud, sand spraying out, grains settling.
export function land(k = 0.5) {
  if (!limit('land', 120) || !voice(0.4, 1)) return
  const t = now()
  k = Math.max(0.25, Math.min(1, k))
  tone({ t, f: vary(85, 0.06), f2: 48, d: 0.11, gain: 0.4 * k })
  burst({ t, noise: 'brown', type: 'lowpass', f: 520, q: 0.6, a: 0.003, d: 0.13, gain: 0.4 * k })
  burst({ t, type: 'highpass', f: 3400, q: 0.5, a: 0.006, d: 0.2, gain: 0.07 * k })
  crinkle({ t: t + 0.03, n: Math.round(6 + 8 * k), dur: 0.25, gain: 0.035 * k, f0: 3000, f1: 9000 })
}

// Respawn: a whoosh in and a small splash as the boat drops back.
export function respawnFx() {
  if (!limit('respawn', 400) || !voice(0.9, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 3000, f2: 400, q: 1, a: 0.05, d: 0.3, gain: 0.25 })
  modal({ t: t + 0.05, f: C6 * semi(12), modes: GLOCK, gain: 0.06, verb: 0.4 })
}

// Day <-> night: a long soft swell of air.
export function dayNight() {
  if (!voice(1.2, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 250, f2: 1200, q: 0.6, a: 0.5, d: 0.6, gain: 0.12 })
}

// Trails scene in/out: a big sweep of air and sea.
export function sceneIn() {
  if (!limit('scene', 300) || !voice(1, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 280, f2: 2600, q: 0.7, a: 0.16, d: 0.35, gain: 0.3, bus: A.ui })
  bubbles({ t: t + 0.12, n: COARSE_POINTER ? 8 : 16, dur: 0.4, f0: 500, f1: 2600, gain: 0.04, bus: A.ui })
}
export function sceneOut() {
  if (!limit('scene', 300) || !voice(0.5, 2)) return
  burst({ t: now(), noise: 'pink', f: 2400, f2: 260, q: 0.7, a: 0.03, d: 0.25, gain: 0.25, bus: A.ui })
}

// Previewing a trail: a swish of water past the hull.
export function swish() {
  if (!limit('swish', 60) || !voice(0.3, 1)) return
  const t = now()
  burst({ t, noise: 'pink', f: 900, f2: 2600, q: 0.9, a: 0.04, d: 0.16, gain: 0.3, bus: A.ui })
  bubbles({ t: t + 0.04, n: 5, dur: 0.15, f0: 800, f1: 3000, gain: 0.03, bus: A.ui })
}

// Egg hatch: shell cracks (sharp, brittle snaps), then the reveal (bigger for rarer pets: 0..5).
export function eggCrack() {
  if (!voice(0.3, 2)) return
  const t = now()
  for (let i = 0; i < 3; i++) {
    const at = t + i * rnd(0.03, 0.06)
    burst({ t: at, f: rnd(2500, 5000), q: 2, a: 0.0005, d: 0.01, gain: 0.25 })
    modal({ t: at, f: rnd(900, 1500), modes: WOOD, gain: 0.14, decay: 0.6 })
  }
  crinkle({ t, n: 10, dur: 0.15, gain: 0.06, f0: 3000, f1: 8000 })
}
export function reveal(rarity = 0) {
  if (!voice(2.5, 4)) return
  claim()
  const t = now()
  bubble({ t, f: 420, d: 0.08, gain: 0.3, rise: 1.3 })
  const runs = [[0, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12, 16], [0, 4, 7, 12, 16, 19], [0, 4, 7, 12, 16, 19, 24], [0, 4, 7, 12, 16, 19, 24, 28]]
  glock(t + 0.05, runs[Math.max(0, Math.min(5, rarity))], 0.065, 0.14, 0.35)
  if (rarity >= 3) applause(1.6 + rarity * 0.3, 0.6 + rarity * 0.08, t + 0.3)
  if (rarity >= 4) airHorn(0.3, t + 0.1, 0.1)
  buzz(rarity >= 3 ? [40, 50, 40, 50, 80] : 30)
}

// Eggs rocking on the counter for `dur` s before they hatch: knocks coming faster, a creak of shell.
export function eggWobble(dur = 1.6) {
  if (!voice(dur, 2)) return
  const t = now()
  let at = t + 0.05
  let gap = 0.28
  while (at < t + dur - 0.05) {
    modal({ t: at, f: rnd(330, 420), modes: WOOD, gain: 0.16 + (at - t) / dur * 0.12, strike: 0.06, pan: rnd(-0.2, 0.2) })
    at += gap * rnd(0.85, 1.15)
    gap = Math.max(0.09, gap * 0.82)
  }
  crinkle({ t: t + dur * 0.6, n: 6, dur: dur * 0.35, gain: 0.03, f0: 3000, f1: 7000 })
}

// =============================================================================================
// Build a Cart
// =============================================================================================
const IRON = [[1, 1, 0.9], [2.76, 0.55, 0.6], [5.4, 0.3, 0.35], [8.93, 0.15, 0.2], [13.3, 0.07, 0.12]]

// Climbing into the cart: boots on steel, the cart rocks on its springs, a latch.
export function mount() {
  if (!voice(0.8, 3)) return
  claim()
  const t = now()
  modal({ t, f: vary(220, 0.03), modes: IRON, gain: 0.22, strike: 0.3, beat: 5, verb: 0.15 })
  tone({ t, f: 95, f2: 55, d: 0.16, gain: 0.35 })
  burst({ t: t + 0.02, noise: 'brown', type: 'lowpass', f: 500, d: 0.12, gain: 0.25 })
  for (let i = 0; i < 3; i++) tone({ t: t + 0.12 + i * 0.11, f: 420 - i * 30, f2: 380 - i * 30, d: 0.08, gain: 0.05 / (i + 1), lp: 1200 }) // spring creak
  modal({ t: t + 0.36, f: 1700, modes: COIN, gain: 0.08, decay: 0.3, strike: 0.3 })
}

// Hold-to-interact progress tick (pitch rises with progress 0..1).
export function holdTick(k) {
  if (!limit('hold', 70) || !voice(0.08, 1)) return
  modal({ t: now(), f: 900 + k * 900, modes: PLASTIC, gain: 0.05, bus: A.ui })
}

// Launch off the broken bridge: the rails ring, then wind rushing over the gap.
export function launch() {
  if (!voice(2, 4)) return
  claim()
  const t = now()
  modal({ t, f: 340, modes: IRON, gain: 0.2, strike: 0.4, beat: 6, verb: 0.3 })
  burst({ t, noise: 'pink', f: 400, f2: 2400, q: 0.7, a: 0.25, hold: 0.4, d: 0.9, gain: 0.3 })
  burst({ t: t + 0.1, type: 'highpass', f: 3000, q: 0.5, a: 0.3, hold: 0.3, d: 0.8, gain: 0.06 })
}

// Wheels slam back onto the rails: a heavy iron thud, sparks hissing, springs bottoming.
export function cartLand(k = 1) {
  if (!limit('cartLand', 200) || !voice(0.8, 3)) return
  const t = now()
  tone({ t, f: 70, f2: 34, d: 0.3, gain: 0.55 * k })
  burst({ t, noise: 'brown', type: 'lowpass', f: 700, q: 0.6, a: 0.002, d: 0.25, gain: 0.55 * k, verb: 0.25 })
  modal({ t, f: vary(180, 0.04), modes: IRON, gain: 0.25 * k, strike: 0.5, beat: 6, verb: 0.2 })
  modal({ t: t + 0.04, f: vary(260, 0.04), modes: IRON, gain: 0.18 * k, strike: 0.4, beat: 6 })
  burst({ t: t + 0.03, type: 'highpass', f: 4500, q: 0.5, a: 0.01, d: 0.35, gain: 0.07 * k })
  buzz(60)
}

// The cart hits the canyon: a big boom with debris raining after.
export function crash() {
  if (!voice(3, 5)) return
  claim()
  const t = now()
  tone({ t, f: 60, f2: 22, glide: 0.9, d: 1.4, gain: 0.75 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 900, f2: 160, q: 0.5, a: 0.003, d: 1.6, gain: 0.85, verb: 0.5 })
  burst({ t, noise: 'white', type: 'lowpass', f: 5000, f2: 600, q: 0.4, a: 0.002, d: 0.5, gain: 0.35, verb: 0.3 })
  modal({ t: t + 0.02, f: 140, modes: IRON, gain: 0.3, strike: 0.6, beat: 8, verb: 0.4 })
  for (let i = 0; i < (COARSE_POINTER ? 6 : 12); i++) {
    const at = t + 0.3 + Math.random() * 1.4
    modal({ t: at, f: rnd(300, 1400), modes: Math.random() < 0.5 ? IRON : WOOD, gain: rnd(0.04, 0.1), strike: 0.3, pan: rnd(-0.8, 0.8), verb: 0.2 })
  }
  crinkle({ t: t + 0.2, n: 20, dur: 1.2, gain: 0.04, f0: 1500, f1: 6000, width: 0.9 })
  buzz([0, 200, 80, 120])
}

// Countdown tick on the crash screen (last = the final, lower beep).
export function countdown(last = false) {
  if (!voice(0.3, 2)) return
  const t = now()
  modal({ t, f: last ? 660 : 990, modes: GLOCK, gain: 0.14, bus: A.ui })
}

// Revive: a rising shimmer and the engine catching again.
export function revive() {
  if (!voice(1.5, 4)) return
  claim()
  const t = now()
  burst({ t, noise: 'pink', f: 300, f2: 4000, q: 1, a: 0.4, d: 0.2, gain: 0.25 })
  glock(t + 0.3, [0, 7, 12, 19], 0.06, 0.12, 0.4)
}

// Made it over the canyon!
export function jumpSuccess(first = false) {
  if (!voice(3, 5)) return
  claim()
  const t = now()
  airHorn(0.3, t, 0.12)
  glock(t + 0.05, [0, 4, 7, 12, 16, 19, 24], 0.065, 0.14, 0.4)
  applause(first ? 3 : 2, first ? 1 : 0.7, t + 0.1)
  buzz([40, 60, 40, 60, 80])
}

// Out of fuel: the engine coughs and sputters out.
export function fuelOut() {
  if (!voice(1.2, 3)) return
  const t = now()
  for (let i = 0; i < 4; i++) {
    const at = t + i * rnd(0.14, 0.24)
    burst({ t: at, noise: 'brown', type: 'lowpass', f: 380, q: 0.8, a: 0.005, d: 0.07, gain: 0.35 / (i * 0.6 + 1), bus: A.engine })
    tone({ t: at, f: rnd(60, 80), f2: 40, d: 0.07, gain: 0.25 / (i + 1), bus: A.engine })
  }
  burst({ t: t + 0.8, noise: 'pink', f: 1200, f2: 300, q: 0.7, a: 0.05, d: 0.5, gain: 0.08 })
}

// Booster ignites: a hiss, a whump of flame and a rising whoosh.
export function boost() {
  if (!voice(1.4, 4)) return
  claim()
  const t = now()
  burst({ t, type: 'highpass', f: 3500, q: 0.5, a: 0.01, d: 0.1, gain: 0.15 })
  tone({ t: t + 0.05, f: 90, f2: 40, d: 0.2, gain: 0.45 })
  burst({ t: t + 0.05, noise: 'brown', type: 'lowpass', f: 600, q: 0.5, a: 0.005, d: 0.3, gain: 0.45 })
  burst({ t: t + 0.08, noise: 'pink', f: 500, f2: 3200, q: 0.8, a: 0.15, hold: 0.3, d: 0.6, gain: 0.25 })
  buzz(40)
}

// End of the line / back at the base buffer: iron bumpers clang.
export function bufferClang() {
  if (!limit('buffer', 300) || !voice(1, 3)) return
  const t = now()
  modal({ t, f: 160, modes: IRON, gain: 0.3, strike: 0.6, beat: 7, verb: 0.3 })
  tone({ t, f: 80, f2: 40, d: 0.2, gain: 0.4 })
}

// Thunder: a crack then a long rolling rumble (dist 0 = close, 1 = far).
export function thunder(dist = 0.5) {
  if (!voice(5, 2)) return
  const t = now()
  const near = 1 - dist
  const lag = dist * 0.9
  burst({ t: t + lag, type: 'highpass', f: 1800, q: 0.4, a: 0.002, d: 0.25 * near + 0.05, gain: 0.35 * near, verb: 0.6 })
  burst({ t: t + lag, noise: 'brown', type: 'lowpass', f: 500 - dist * 300, f2: 90, q: 0.5, a: 0.02, d: 3.5, gain: 0.75 - dist * 0.3, verb: 0.6, bus: A.amb })
  for (let i = 0; i < 5; i++) burst({ t: t + lag + 0.3 + i * rnd(0.3, 0.6), noise: 'brown', type: 'lowpass', f: rnd(120, 260), q: 0.6, a: 0.1, d: rnd(0.6, 1.2), gain: rnd(0.15, 0.35), pan: rnd(-0.6, 0.6), bus: A.amb })
}

// Lucky wheel peg tick (pitch varies a hair).
export function wheelTick() {
  if (!limit('wtick', 25) || !voice(0.08, 1)) return
  const t = now()
  modal({ t, f: vary(2600, 0.05), modes: PLASTIC, gain: 0.12, bus: A.ui })
  burst({ t, f: 5000, q: 1, d: 0.004, gain: 0.06, bus: A.ui })
}

// Cash ticking up after a run: quick coin chimes rising, then the till.
export function payout(k = 1) {
  if (!voice(1.5, 3)) return
  claim()
  const t = now()
  const n = Math.round(4 + 6 * Math.min(1, k))
  for (let i = 0; i < n; i++) modal({ t: t + i * 0.055, f: 2100 * semi(i * 0.7), modes: COIN, gain: 0.07, beat: 7, strike: 0.25, pan: rnd(-0.3, 0.3), verb: 0.08 })
  coins(t + n * 0.055, COARSE_POINTER ? 5 : 8, 0.35, 0.07)
}

// The stall restocked: a shop bell.
export function restockBell() {
  if (!voice(1.5, 2)) return
  const t = now()
  modal({ t, f: 1568, modes: BELL, gain: 0.12, beat: 4, strike: 0.2, verb: 0.3 })
  modal({ t: t + 0.18, f: 1318, modes: BELL, gain: 0.1, beat: 4, strike: 0.2, verb: 0.3 })
}

// Quest complete: a short bright fanfare.
export function quest() {
  if (!voice(1.5, 3)) return
  claim()
  const t = now()
  glock(t, [0, 4, 7, 12], 0.08, 0.14, 0.3)
  modal({ t: t + 0.32, f: 1046, modes: BELL, gain: 0.1, beat: 4, strike: 0.2, verb: 0.3 })
}

// Wheel prize fanfare.
export function prize(big = false) {
  reveal(big ? 4 : 2)
}

// --- The extended line (ride.js) -----------------------------------------------------------------
// Leaving the rails over a crest: air rushing up past the ears, the springs unloading.
export function whoosh(k = 0.5) {
  if (!limit('whoosh', 450) || !voice(0.9, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 500, f2: 2600 + k * 1600, q: 0.8, a: 0.12, hold: 0.1, d: 0.45, gain: 0.16 + k * 0.18 })
  tone({ t: t + 0.02, f: 300, f2: 190, d: 0.12, gain: 0.05, lp: 900 }) // spring creak
}

// Entering an area: a sweep up into a bright chord; a new area adds the confetti poppers
// and a glockenspiel run.
export function zone(fresh = false) {
  if (!limit('zone', 600) || !voice(1.6, 3)) return
  claim()
  const t = now()
  burst({ t, noise: 'pink', f: 400, f2: 3200, q: 0.9, a: 0.25, d: 0.25, gain: 0.16 })
  glock(t + 0.22, fresh ? [0, 4, 7, 12, 16, 19, 24] : [0, 7, 12], 0.07, fresh ? 0.12 : 0.09, 0.3)
  modal({ t: t + 0.22, f: C6 / 2, modes: BELL, gain: 0.08, beat: 3, strike: 0.2, verb: 0.3 })
  if (fresh) {
    popper(t + 0.2, -0.5)
    popper(t + 0.26, 0.5)
    coins(t + 0.4, COARSE_POINTER ? 6 : 10, 0.5, 0.08)
    buzz([30, 40, 30])
  }
}

// =============================================================================================
// Build a Cart: pickups, warnings, animals, ride grains and line events
// =============================================================================================
// Every export in this section is wrapped in `safe`, so a bad argument (NaN, 0 Hz) can never
// throw into the frame. Grains (screech, chainClack, windGust, sandstorm, rumble, and the
// rate-limited warningBell / tiltWarn) are meant to be called every frame while their
// condition holds: each one rate-limits itself and schedules at most one short grain per call;
// the grains overlap so they blend into one continuous sound.
const STONE = [[1, 1, 0.05], [2.31, 0.5, 0.03], [3.89, 0.3, 0.018], [5.6, 0.14, 0.01]]
const XBELL = [[1, 1, 0.55], [2.02, 0.5, 0.4], [2.76, 0.32, 0.3], [4.1, 0.16, 0.18], [5.4, 0.08, 0.12]] // crossing gong bell
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

const fin = (x, d) => (Number.isFinite(x) ? x : d)
const clamp = (x, lo, hi, d = lo) => Math.max(lo, Math.min(hi, fin(x, d)))
const few = (desk, phone) => (COARSE_POINTER ? phone : desk)
const twin = (cents) => (COARSE_POINTER ? 0 : cents) // beating twin oscillators: desktop only

function safe(fn) {
  return function (...args) {
    try {
      fn(...args)
    } catch {
      // A sound must never break the frame.
    }
  }
}

// Linear attack, optional hold, exponential decay on a gain param.
function shape(param, t, a, peak, d, hold = 0) {
  param.setValueAtTime(0.0001, t)
  param.linearRampToValueAtTime(Math.max(0.0002, peak), t + a)
  if (hold) param.setValueAtTime(Math.max(0.0002, peak), t + a + hold)
  param.exponentialRampToValueAtTime(0.0001, t + a + hold + d)
  return t + a + hold + d
}

// A voiced animal call: a buzzy source (the vocal folds) through formant band-passes (the
// mouth), with optional vibrato, growl (rough amplitude flutter) and breath noise.
// path: [[s after t, Hz], ...] pitch contour; formants: [[Hz, Q, amp, Hz at end of `morph`?], ...].
function voc(o) {
  const ctx = A.ctx
  const t = o.t
  const a = o.a ?? 0.02
  const hold = o.hold ?? 0
  const d = o.d ?? 0.2
  const dur = a + hold + d
  const stopAt = t + dur + 0.05
  const path = o.path
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sawtooth'
  osc.frequency.setValueAtTime(Math.max(20, path[0][1]), t)
  for (let i = 1; i < path.length; i++) osc.frequency.exponentialRampToValueAtTime(Math.max(20, path[i][1]), t + Math.max(0.001, path[i][0]))
  if (o.vib) {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = o.vibRate ?? 6
    const depth = ctx.createGain()
    depth.gain.value = path[0][1] * o.vib
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(t)
    lfo.stop(stopAt)
  }
  let src = osc
  if (o.growl) {
    const am = ctx.createGain()
    am.gain.value = 1 - o.growl
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = o.growlRate ?? 28
    const depth = ctx.createGain()
    depth.gain.value = o.growl
    lfo.connect(depth).connect(am.gain)
    lfo.start(t)
    lfo.stop(stopAt)
    osc.connect(am)
    src = am
  }
  const out = ctx.createGain()
  shape(out.gain, t, a, o.gain ?? 0.5, d, hold)
  for (const [ff, q, amp, ff2] of o.formants) {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(ff, t)
    if (ff2) bp.frequency.exponentialRampToValueAtTime(ff2, t + (o.morph ?? dur))
    bp.Q.value = q
    const fg = ctx.createGain()
    fg.gain.value = amp
    src.connect(bp).connect(fg).connect(out)
  }
  osc.start(t)
  osc.stop(stopAt)
  const r = { bus: o.bus ?? A.sfx, pan: o.pan ?? 0, verb: o.verb ?? 0 }
  route(out, r)
  if (o.breath) burst({ t, noise: 'pink', f: o.formants[0][0], q: 1.2, a, hold, d, gain: o.breath, ...r })
}

// Stick-slip creak: a slow pulse train (each pulse one slip) ringing a resonant body
// (wood: low, damped; steel: higher, ringing).
function creak({ t, rate, rate2, f, q = 8, a = 0.03, d = 0.2, gain = 0.1, body = 2.3, pan = 0, verb = 0 }) {
  const ctx = A.ctx
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(Math.max(5, rate), t)
  osc.frequency.exponentialRampToValueAtTime(Math.max(5, rate2 ?? rate), t + a + d)
  const out = ctx.createGain()
  shape(out.gain, t, a, gain * 8, d) // a pulse train through a narrow band is quiet: make up for it
  for (const [ff, amp] of [[f, 1], [f * body, 0.45]]) {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = ff
    bp.Q.value = q
    const g = ctx.createGain()
    g.gain.value = amp
    osc.connect(bp).connect(g).connect(out)
  }
  osc.start(t)
  osc.stop(t + a + d + 0.05)
  route(out, { pan, verb })
}

// A brass note: detuned saws through a low-pass that blares open on the attack and settles.
function brass(t, f, len, gain, pan = 0) {
  const ctx = A.ctx
  const out = ctx.createGain()
  const end = shape(out.gain, t, 0.025, gain, 0.18, len)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 1.4
  lp.frequency.setValueAtTime(f * 1.2, t)
  lp.frequency.exponentialRampToValueAtTime(f * 7, t + 0.05)
  lp.frequency.exponentialRampToValueAtTime(f * 3.5, t + 0.06 + len * 0.6)
  lp.connect(out)
  route(out, { pan, verb: 0.2 })
  for (const cents of COARSE_POINTER ? [0] : [-6, 7]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f * 0.985, t) // lips start a hair flat
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04)
    o.detune.value = cents
    o.connect(lp)
    o.start(t)
    o.stop(end + 0.05)
  }
}

// --- Pickups + rewards ---------------------------------------------------------------------------
// Coin: a bright two-step "ka-ching" on a thin plate; combo 0..20 climbs a major scale, then wraps.
export const coin = safe(function coin(combo = 0) {
  if (!limit('coin', 35) || !voice(0.6, 2)) return
  claim()
  const i = ((Math.floor(fin(combo, 0)) % 21) + 21) % 21
  const f = 587 * semi(MAJOR[i % 7] + 12 * Math.floor(i / 7)) // D5 .. ~4.4 kHz
  const t = now()
  const pan = rnd(-0.15, 0.15)
  modal({ t, f, modes: COIN, gain: 0.08, beat: twin(6), strike: 0.2, decay: 0.35, pan, verb: 0.06 })
  modal({ t: t + 0.055, f: f * semi(5), modes: COIN, gain: 0.1, beat: twin(6), strike: 0.15, decay: 0.6, pan, verb: 0.06 })
})

// Gem: a glassy arpeggio and a scatter of tiny high glints.
export const gem = safe(function gem() {
  if (!limit('gem', 60) || !voice(1, 2)) return
  claim()
  const t = now()
  ;[0, 4, 7, 12, 16].forEach((n, i) => modal({ t: t + i * 0.045, f: 1568 * semi(n), modes: GLASS, gain: 0.085, beat: twin(3), strike: 0.15, pan: -0.3 + i * 0.15, verb: 0.2 }))
  for (let i = 0; i < few(6, 3); i++) modal({ t: t + 0.1 + Math.random() * 0.3, f: rnd(4000, 7000), modes: GLASS, gain: 0.02, decay: 0.5, pan: rnd(-0.6, 0.6) })
})

// Fuel can: a few big glugs, then the tank filling (bubbles climbing as the air space shrinks).
export const fuelPickup = safe(function fuelPickup() {
  if (!limit('fuel', 120) || !voice(1, 2)) return
  claim()
  const t = now()
  for (let i = 0; i < 3; i++) bubble({ t: t + i * 0.075 + rnd(0, 0.015), f: rnd(140, 220), d: 0.08, gain: 0.25, rise: 0.9 })
  const n = few(9, 5)
  for (let i = 0; i < n; i++) bubble({ t: t + 0.2 + i * (0.36 / n), f: 380 * semi(i * (18 / n)), d: 0.04, gain: 0.08, rise: 0.4, pan: rnd(-0.2, 0.2) })
  burst({ t: t + 0.18, noise: 'pink', f: 500, f2: 1800, q: 4, a: 0.05, hold: 0.25, d: 0.12, gain: 0.08 })
  modal({ t: t + 0.62, f: 1900, modes: COIN, gain: 0.05, decay: 0.3, strike: 0.2 })
})

// Boost pad: an electric zap, a rising whine and a rush of air.
export const boostPad = safe(function boostPad() {
  if (!limit('bpad', 250) || !voice(1.1, 3)) return
  claim()
  const t = now()
  for (let i = 0; i < few(8, 4); i++) burst({ t: t + Math.random() * 0.07, type: 'highpass', f: rnd(2500, 5000), q: 0.7, a: 0.0004, d: rnd(0.003, 0.01), gain: rnd(0.08, 0.16), pan: rnd(-0.3, 0.3) })
  tone({ t, type: 'sawtooth', f: 110, f2: 440, glide: 0.18, d: 0.2, gain: 0.05, lp: 1800 })
  tone({ t, f: 220, f2: 880, glide: 0.2, d: 0.22, gain: 0.04 })
  tone({ t: t + 0.03, f: 90, f2: 45, d: 0.15, gain: 0.3 })
  burst({ t: t + 0.04, noise: 'pink', f: 500, f2: 3500, q: 0.8, a: 0.08, hold: 0.1, d: 0.4, gain: 0.3 })
  buzz(30)
})

// Through a gate: good = a rising double ding + whoosh; bad = a dull low buzz-thunk.
export const gatePass = safe(function gatePass(good = true) {
  if (!limit('gate', 150) || !voice(0.8, 2)) return
  const t = now()
  if (good) {
    claim()
    modal({ t, f: C6 * semi(7), modes: GLOCK, gain: 0.13, strike: 0.12, pan: -0.15, verb: 0.2 })
    modal({ t: t + 0.09, f: C6 * semi(12), modes: GLOCK, gain: 0.14, strike: 0.12, pan: 0.15, verb: 0.2 })
    burst({ t, noise: 'pink', f: 2600, f2: 380, q: 1.1, a: 0.05, d: 0.28, gain: 0.3 })
  } else {
    tone({ t, type: 'sawtooth', f: 98, a: 0.01, hold: 0.12, d: 0.15, gain: 0.12, lp: 520 })
    tone({ t, type: 'square', f: 104, a: 0.01, hold: 0.12, d: 0.15, gain: 0.06, lp: 400 })
    modal({ t, f: vary(150, 0.03), modes: WOOD, gain: 0.4, strike: 0.15 })
    tone({ t, f: 90, f2: 45, d: 0.12, gain: 0.3 })
    buzz(25)
  }
})

// Golden ticket jackpot: slot-machine bells ringing, a pop, a shower of coins, the glockenspiel.
export const ticket = safe(function ticket() {
  if (!limit('ticket', 500) || !voice(2.4, 4)) return
  claim()
  const t = now()
  for (let i = 0; i < few(6, 4); i++) modal({ t: t + i * 0.07, f: i % 2 ? 1318 : 1568, modes: XBELL, gain: 0.09, beat: twin(4), strike: 0.15, pan: i % 2 ? 0.3 : -0.3, verb: 0.15 })
  bubble({ t, f: 420, d: 0.08, gain: 0.25, rise: 1.3 })
  coins(t + 0.12, few(12, 6), 1.1, 0.09)
  glock(t + 0.45, [0, 4, 7, 12, 16, 19, 24], 0.06, 0.13, 0.3)
  modal({ t: t + 0.9, f: 1046, modes: BELL, gain: 0.12, beat: 4, strike: 0.2, verb: 0.3 })
  buzz([30, 40, 30, 40, 80])
})

// Lean bonus: a short happy jingle, bigger with level 1..3.
export const leanBonus = safe(function leanBonus(level = 1) {
  if (!limit('lean', 250) || !voice(0.9, 2)) return
  claim()
  const L = Math.round(clamp(level, 1, 3, 1))
  const t = now()
  bubble({ t, f: 460, d: 0.06, gain: 0.2, rise: 1.1 })
  glock(t + 0.03, [[0, 4, 7], [0, 4, 7, 12], [0, 4, 7, 12, 16, 19]][L - 1], 0.055, 0.1 + L * 0.015, 0.2)
  if (L >= 2) modal({ t: t + 0.25, f: 2600, modes: COIN, gain: 0.05, beat: twin(6), decay: 0.4, strike: 0.15 })
  if (L === 3) coins(t + 0.2, few(6, 3), 0.3, 0.06)
})

// Perfect stop: a brass "ta-ta-ta-DAAH" fanfare, a timpani hit and a cymbal crash.
export const perfectStop = safe(function perfectStop() {
  if (!limit('perfect', 800) || !voice(2.2, 4)) return
  claim()
  const t = now()
  for (let i = 0; i < 3; i++) {
    brass(t + i * 0.13, 392, 0.07, 0.07, -0.1) // G4 x3
    burst({ t: t + i * 0.13, f: 1800, q: 0.8, a: 0.001, d: 0.06, gain: 0.08 }) // snare tap
  }
  const hit = t + 0.4
  ;[523.25, 659.25, 783.99].forEach((f, i) => brass(hit, f, 0.55, 0.055, (i - 1) * 0.3))
  if (!COARSE_POINTER) brass(hit, 261.63, 0.55, 0.045)
  tone({ t: hit, f: 98, f2: 88, d: 0.6, gain: 0.35 }) // timpani
  burst({ t: hit, type: 'highpass', f: 5500, q: 0.5, a: 0.002, d: 1.1, gain: 0.16, verb: 0.3 })
  burst({ t: hit, f: 3200, q: 0.8, a: 0.002, d: 0.4, gain: 0.1 })
  buzz([40, 60, 80])
})

// Summit: a cheery steam-whistle toot (three pipes in a chord, plus the steam), short-long.
function steamWhistle(t, len, gain) {
  for (const f of [523, 659, 784]) tone({ t, type: 'triangle', f: f * 0.96, f2: f, glide: 0.06, a: 0.04, hold: len, d: 0.12, gain, lp: 3000, verb: 0.3 })
  burst({ t, f: 1300, q: 2.5, a: 0.04, hold: len, d: 0.12, gain: gain * 0.5, verb: 0.3 })
}
export const summit = safe(function summit() {
  if (!limit('summit', 1500) || !voice(1.4, 3)) return
  claim()
  const t = now()
  steamWhistle(t, 0.14, 0.06)
  steamWhistle(t + 0.3, 0.55, 0.06)
})

// --- Warnings ------------------------------------------------------------------------------------
// Level-crossing bell: one ding per call, at most every 320 ms (call it every frame while active).
export const warningBell = safe(function warningBell() {
  if (!limit('xbell', 320) || !voice(0.6, 1)) return
  modal({ t: now(), f: vary(1180, 0.01), modes: XBELL, gain: 0.11, beat: twin(5), strike: 0.25, decay: 0.8, pan: rnd(-0.1, 0.1), verb: 0.1 })
})

// Bridge foghorn: a deep diaphone blast with the grunt at the end, ~1.4 s.
let fogCurve = null
export const bridgeHorn = safe(function bridgeHorn() {
  if (!limit('fog', 1200) || !voice(1.8, 3)) return
  const ctx = A.ctx
  const t = now()
  const len = 1.4
  const out = ctx.createGain()
  out.gain.value = 0.2
  route(out, { verb: 0.45 })
  const sat = ctx.createWaveShaper()
  sat.curve = fogCurve ??= saturation(2)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 650
  lp.Q.value = 0.9
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.linearRampToValueAtTime(1, t + 0.12)
  amp.gain.setValueAtTime(1, t + len - 0.25)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + len)
  sat.connect(lp).connect(amp).connect(out)
  for (const f of COARSE_POINTER ? [98, 147] : [98, 98.6, 147]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f * 0.92, t)
    o.frequency.exponentialRampToValueAtTime(f, t + 0.15)
    o.frequency.setValueAtTime(f, t + len - 0.3)
    o.frequency.exponentialRampToValueAtTime(f * 0.78, t + len) // the diaphone's grunt
    const g = ctx.createGain()
    g.gain.value = 0.33
    o.connect(g).connect(sat)
    o.start(t)
    o.stop(t + len + 0.05)
  }
  burst({ t, noise: 'brown', type: 'lowpass', f: 300, q: 0.6, a: 0.1, hold: 1, d: 0.3, gain: 0.12 })
})

// Cart tilting: a wooden or steel creak, k 0..1 intensity; at most every 180 ms.
export const tiltWarn = safe(function tiltWarn(k) {
  k = clamp(k, 0, 1, 0)
  if (k < 0.02 || !limit('tilt', 180) || !voice(0.35, 1)) return
  const steel = Math.random() < 0.4
  creak({
    t: now(),
    rate: rnd(28, 45) * (1 + k * 0.5),
    rate2: rnd(20, 60),
    f: steel ? rnd(1400, 2200) : rnd(500, 900),
    q: steel ? 14 : 7,
    body: steel ? 2.76 : 2.3,
    a: 0.04,
    d: rnd(0.12, 0.22) + k * 0.08,
    gain: 0.04 + 0.1 * k,
    pan: rnd(-0.4, 0.4),
  })
})

// --- Animals (cartoon-friendly) -----------------------------------------------------------------
export const deer = safe(function deer() {
  if (!limit('deer', 400) || !voice(0.5, 2)) return
  const f = vary(620, 0.08)
  voc({ t: now(), path: [[0, f], [0.05, f * 1.08], [0.22, f * 0.7]], a: 0.015, hold: 0.04, d: 0.16, gain: 0.55, formants: [[1000, 5, 1], [2100, 7, 0.5], [3200, 9, 0.2]], vib: 0.04, vibRate: 22, growl: 0.15, breath: 0.06, pan: rnd(-0.3, 0.3), verb: 0.1 })
})

export const moose = safe(function moose() {
  if (!limit('moose', 1500) || !voice(1.6, 2)) return
  voc({ t: now(), path: [[0, 115], [0.3, 150], [1.4, 85]], a: 0.12, hold: 0.6, d: 0.7, gain: 0.75, formants: [[380, 4, 1, 650], [1000, 5, 0.45, 850], [2300, 7, 0.12]], morph: 0.6, vib: 0.025, vibRate: 4.5, growl: 0.12, growlRate: 22, breath: 0.04, verb: 0.25 })
})

export const bear = safe(function bear() {
  if (!limit('bear', 900) || !voice(1.2, 3)) return
  const t = now()
  voc({ t, path: [[0, 85], [0.18, 150], [0.9, 75]], a: 0.06, hold: 0.25, d: 0.6, gain: 0.8, formants: [[550, 3, 1, 800], [1300, 4, 0.5, 1100], [2600, 5, 0.2]], morph: 0.3, growl: 0.45, growlRate: 32, breath: 0.12, verb: 0.15 })
  tone({ t, f: 70, f2: 50, a: 0.05, d: 0.4, gain: 0.15 })
  buzz(40)
})

export const wolfHowl = safe(function wolfHowl() {
  if (!limit('wolf', 2500) || !voice(2, 2)) return
  const f = vary(340, 0.05)
  voc({ t: now(), type: 'triangle', path: [[0, f], [0.35, f * 1.65], [1.2, f * 1.75], [1.75, f * 1.2]], a: 0.25, hold: 0.9, d: 0.6, gain: 0.5, formants: [[700, 3, 1, 1100], [1400, 5, 0.35]], morph: 0.5, vib: 0.012, vibRate: 5.5, breath: 0.02, pan: rnd(-0.4, 0.4), verb: 0.45 })
})

export const sheep = safe(function sheep() {
  if (!limit('sheep', 500) || !voice(0.8, 2)) return
  const f = vary(330, 0.08)
  voc({ t: now(), path: [[0, f], [0.05, f * 1.12], [0.6, f * 0.9]], a: 0.03, hold: 0.2, d: 0.35, gain: 0.6, formants: [[450, 5, 1, 850], [1150, 6, 0.6, 1300], [2600, 8, 0.25]], morph: 0.08, vib: 0.05, vibRate: 8, breath: 0.03, pan: rnd(-0.3, 0.3), verb: 0.1 })
})

export const cow = safe(function cow() {
  if (!limit('cow', 900) || !voice(1.1, 2)) return
  const f = vary(140, 0.06)
  voc({ t: now(), path: [[0, f], [0.25, f * 1.1], [1, f * 0.75]], a: 0.08, hold: 0.45, d: 0.45, gain: 0.8, formants: [[260, 4, 1, 480], [750, 5, 0.5, 950], [2200, 7, 0.1]], morph: 0.4, vib: 0.015, vibRate: 5, growl: 0.08, breath: 0.03, pan: rnd(-0.3, 0.3), verb: 0.15 })
})

export const chicken = safe(function chicken() {
  if (!limit('chicken', 500) || !voice(0.8, 2)) return
  const t = now()
  const pan = rnd(-0.4, 0.4)
  let at = t
  for (let i = 0; i < 3; i++) {
    const f = rnd(480, 560)
    voc({ t: at, path: [[0, f], [0.06, f * 0.85]], a: 0.005, d: 0.06, gain: 0.45, formants: [[900, 5, 1], [1900, 7, 0.5]], growl: 0.2, growlRate: 45, pan })
    at += rnd(0.1, 0.14)
  }
  voc({ t: at + 0.05, path: [[0, 560], [0.06, 820], [0.3, 700]], a: 0.01, hold: 0.08, d: 0.2, gain: 0.5, formants: [[1100, 5, 1, 1300], [2300, 7, 0.5]], morph: 0.1, growl: 0.25, growlRate: 50, breath: 0.03, pan })
})

export const dogBark = safe(function dogBark() {
  if (!limit('dog', 450) || !voice(0.6, 2)) return
  const t = now()
  const pan = rnd(-0.4, 0.4)
  for (let i = 0; i < 2; i++) {
    const f = vary(i ? 300 : 330, 0.05)
    voc({ t: t + i * rnd(0.19, 0.24), path: [[0, f * 0.8], [0.025, f * 1.15], [0.13, f * 0.7]], a: 0.006, hold: 0.02, d: 0.1, gain: 0.6, formants: [[650, 3, 1, 900], [1400, 4, 0.6], [2700, 5, 0.25]], morph: 0.04, growl: 0.2, growlRate: 40, breath: 0.12, pan, verb: 0.1 })
  }
})

// A herd galloping past for ~1 s; k = herd size / intensity (0.2..3).
export const hooves = safe(function hooves(k = 1) {
  if (!limit('hooves', 700) || !voice(1.2, 2)) return
  const kk = clamp(k, 0.2, 3, 1)
  const t = now()
  const n = Math.min(few(40, 18), Math.round(few(16, 8) * (0.6 + kk)))
  for (let i = 0; i < n; i++) {
    const x = Math.random()
    const at = t + x
    const g = 1 - x * 0.45 // the herd thins out as it passes
    const pan = rnd(-0.6, 0.6)
    burst({ t: at, noise: 'brown', type: 'lowpass', f: rnd(350, 700), q: 0.8, a: 0.002, d: rnd(0.03, 0.06), gain: rnd(0.12, 0.25) * g, pan })
    if (i % 2 === 0) {
      const f = rnd(70, 130)
      tone({ t: at, f, f2: f * 0.55, d: 0.05, gain: 0.12 * g, pan })
    }
    if (!COARSE_POINTER && i % 3 === 0) modal({ t: at + 0.004, f: rnd(700, 1100), modes: WOOD, gain: 0.05 * g, pan })
  }
  crinkle({ t, n: few(10, 5), dur: 1, gain: 0.02, f0: 2000, f1: 6000, width: 0.7 })
})

// Bumping an animal: a woodblock bonk, a soft thud and a cartoon boing.
export const animalHit = safe(function animalHit(k = 1) {
  if (!limit('ahit', 150) || !voice(0.7, 2)) return
  const kk = clamp(k, 0.3, 2, 1)
  const t = now()
  modal({ t, f: vary(520, 0.05), modes: WOOD, gain: 0.25, strike: 0.2 })
  tone({ t, f: 120, f2: 55, d: 0.12, gain: 0.35 * kk })
  burst({ t, noise: 'brown', type: 'lowpass', f: 600, q: 0.6, a: 0.003, d: 0.1, gain: 0.3 * kk })
  voc({ t: t + 0.02, type: 'sine', path: [[0, 140], [0.07, 360], [0.45, 310]], a: 0.005, d: 0.45, gain: 0.22, formants: [[400, 0.5, 1]], vib: 0.18, vibRate: 13 })
  buzz(30)
})

// Cartoon stars circling a dizzy head: twinkles panning round.
export const dizzy = safe(function dizzy() {
  if (!limit('dizzy', 700) || !voice(1.3, 2)) return
  const t = now()
  const notes = [12, 16, 19, 24, 19, 16, 12, 16]
  const n = few(8, 5)
  for (let i = 0; i < n; i++) modal({ t: t + i * 0.11, f: C6 * semi(notes[i]), modes: GLASS, gain: 0.07 * (1 - i / 12), decay: 0.6, pan: Math.sin(i * 1.2) * 0.7, verb: 0.2 })
})

// A flock taking off: many wings beating, a few alarm chirps.
export const birdsFlush = safe(function birdsFlush() {
  if (!limit('birds', 900) || !voice(1.2, 2)) return
  const t = now()
  const birds = few(5, 3)
  const flaps = few(9, 6)
  for (let b = 0; b < birds; b++) {
    const start = t + rnd(0, 0.15)
    const rate = rnd(11, 16)
    const pan0 = rnd(-0.7, 0.7)
    const dir = rnd(-0.5, 0.5)
    const fc = rnd(700, 1400)
    for (let j = 0; j < flaps; j++) burst({ t: start + (j / rate) * rnd(0.9, 1.1), noise: 'pink', f: fc, q: 0.9, a: 0.004, d: 0.035, gain: 0.07 * (1 - (j / flaps) * 0.6), pan: pan0 + (dir * j) / flaps })
  }
  for (let i = 0; i < few(6, 3); i++) {
    const f = rnd(2800, 4200)
    tone({ t: t + rnd(0.05, 0.7), f, f2: f * rnd(1.2, 1.5), glide: 0.04, a: 0.004, d: 0.05, gain: 0.035, pan: rnd(-0.6, 0.6) })
  }
})

// Bats: quick high squeaks over leathery wing flaps.
export const bats = safe(function bats() {
  if (!limit('bats', 900) || !voice(1, 2)) return
  const t = now()
  for (let b = 0; b < few(4, 2); b++) {
    const start = t + rnd(0, 0.2)
    const fc = rnd(350, 650)
    const pan = rnd(-0.7, 0.7)
    for (let j = 0; j < 8; j++) burst({ t: start + j * rnd(0.06, 0.08), f: fc, q: 1.2, a: 0.003, d: 0.025, gain: 0.08 * (1 - j / 12), pan })
  }
  for (let i = 0; i < few(8, 4); i++) {
    const f = rnd(5200, 7500)
    tone({ t: t + rnd(0, 0.7), f, f2: f * 0.7, glide: 0.03, a: 0.002, d: 0.03, gain: 0.03, pan: rnd(-0.7, 0.7) })
  }
})

// A fish jumping: a small plop and a few drops.
export const fishSplash = safe(function fishSplash() {
  if (!limit('fish', 120) || !voice(0.5, 1)) return
  const t = now()
  const pan = rnd(-0.4, 0.4)
  bubble({ t, f: vary(420, 0.15), d: 0.06, gain: 0.22, rise: 1.3, pan })
  burst({ t, type: 'highpass', f: 2800, q: 0.6, a: 0.003, d: 0.12, gain: 0.07, pan })
  bubbles({ t: t + 0.03, n: few(6, 3), dur: 0.2, f0: 900, f1: 3000, gain: 0.04 })
})

// --- Ride grains (call every frame while the condition holds) ------------------------------------
// Steel wheel squeal on two wheels, k 0..1. ~0.21 s grains every ~85 ms; the pitch random-walks
// across grains so the overlap blends into one wavering squeal.
let scF = 2800
export const screech = safe(function screech(k) {
  k = clamp(k, 0, 1, 0)
  if (k < 0.02 || !limit('screech', 85) || !voice(0.3, 1)) return
  const t = now()
  const f0 = scF
  scF = clamp(scF + rnd(-90, 90) + (2900 + k * 500 - scF) * 0.1, 2200, 3800, 2800)
  const g = 0.012 + 0.045 * k
  const pan = rnd(-0.1, 0.1)
  tone({ t, f: f0, f2: scF, glide: 0.2, a: 0.07, hold: 0.04, d: 0.1, gain: g, pan })
  tone({ t, f: f0 * 2.01, f2: scF * 2.01, glide: 0.2, a: 0.07, hold: 0.04, d: 0.1, gain: g * 0.35, pan })
  if (!COARSE_POINTER) burst({ t, f: f0, f2: scF, q: 14, a: 0.07, hold: 0.04, d: 0.1, gain: g * 1.2, pan })
})

// Chain lift ratchet: one clack per call at a cadence set by speed (m/s, ~3..8 -> ~150..56 ms),
// alternating two pitches for the clack-clack.
let chainHi = false
export const chainClack = safe(function chainClack(speed) {
  const v = clamp(speed, 0, 12, 0)
  if (v < 0.3) return
  const gap = clamp(0.45 / v, 0.055, 0.35)
  if (!limit('chain', gap * 1000) || !voice(0.18, 1)) return
  chainHi = !chainHi
  const t = now()
  modal({ t, f: vary(chainHi ? 1150 : 860, 0.03), modes: IRON, gain: 0.07, decay: 0.12, strike: 0.25, pan: rnd(-0.1, 0.1) })
  tone({ t, f: 140, f2: 80, d: 0.03, gain: 0.08 })
  if (!COARSE_POINTER && chainHi) burst({ t: t + 0.01, f: 2500, q: 1.5, a: 0.001, d: 0.015, gain: 0.04 }) // links rattling
})

// One gust swelling past (k 0..1); at most every 1.5 s.
export const windGust = safe(function windGust(k) {
  k = clamp(k, 0, 1, 0.5)
  if (k < 0.02 || !limit('gust', 1500) || !voice(1.8, 1)) return
  const t = now()
  const pan = rnd(-0.6, 0.6)
  burst({ t, noise: 'pink', f: rnd(280, 400), f2: 700 + k * 900, sweep: 0.6, q: 0.7, a: 0.55, hold: 0.2, d: 0.9, gain: 0.08 + 0.2 * k, pan })
  const w = rnd(1500, 2400)
  burst({ t: t + 0.1, f: w, f2: w * 1.3, sweep: 0.5, q: 6, a: 0.45, hold: 0.1, d: 0.7, gain: 0.02 + 0.04 * k, pan: -pan * 0.5 })
})

// Sandstorm hiss grain (k 0..1), ~0.37 s every ~140 ms, with grains ticking.
export const sandstorm = safe(function sandstorm(k) {
  k = clamp(k, 0, 1, 0)
  if (k < 0.02 || !limit('sand', 140) || !voice(0.45, 1)) return
  const t = now()
  burst({ t, f: rnd(3200, 5200), q: 0.7, a: 0.12, hold: 0.05, d: 0.2, gain: 0.03 + 0.08 * k, pan: rnd(-0.5, 0.5) })
  if (!COARSE_POINTER) burst({ t, noise: 'pink', f: rnd(500, 800), q: 0.6, a: 0.12, hold: 0.05, d: 0.2, gain: 0.03 + 0.07 * k, pan: rnd(-0.5, 0.5) })
  crinkle({ t, n: few(4, 2), dur: 0.15, gain: 0.015 + 0.03 * k, f0: 4000, f1: 10000, width: 0.8 })
})

// Low earth rumble grain for the rockslide (k 0..1), ~0.55 s every ~180 ms, with a stray stone.
export const rumble = safe(function rumble(k) {
  k = clamp(k, 0, 1, 0)
  if (k < 0.02 || !limit('rumble', 180) || !voice(0.6, 1)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: rnd(90, 170), q: 0.7, a: 0.15, hold: 0.1, d: 0.3, gain: 0.12 + 0.35 * k, pan: rnd(-0.3, 0.3) })
  if (!COARSE_POINTER) tone({ t, f: rnd(32, 44), a: 0.15, hold: 0.1, d: 0.3, gain: 0.08 + 0.15 * k })
  if (Math.random() < 0.35 * k) modal({ t: t + rnd(0, 0.15), f: rnd(500, 1400), modes: STONE, gain: rnd(0.04, 0.1) * k, strike: 0.2, pan: rnd(-0.7, 0.7) })
})

// --- Line events ---------------------------------------------------------------------------------
// Derail: flanges shrieking off the rail, the cart slamming down, tumbling over, debris raining.
export const derail = safe(function derail() {
  if (!limit('derail', 1500) || !voice(3.5, 5)) return
  claim()
  const t = now()
  tone({ t, f: 3100, f2: 1900, glide: 0.45, a: 0.02, hold: 0.2, d: 0.25, gain: 0.07 })
  tone({ t, f: 4650, f2: 2900, glide: 0.45, a: 0.02, hold: 0.2, d: 0.25, gain: 0.035 })
  burst({ t, f: 3000, f2: 1800, q: 10, a: 0.02, hold: 0.2, d: 0.25, gain: 0.18 })
  burst({ t, type: 'highpass', f: 5000, q: 0.5, a: 0.01, hold: 0.25, d: 0.2, gain: 0.08 }) // sparks
  const hit = t + 0.42
  tone({ t: hit, f: 58, f2: 22, glide: 1, d: 1.5, gain: 0.8 })
  burst({ t: hit, noise: 'brown', type: 'lowpass', f: 1000, f2: 150, q: 0.5, a: 0.003, d: 1.7, gain: 0.85, verb: 0.45 })
  burst({ t: hit, type: 'lowpass', f: 6000, f2: 700, q: 0.4, a: 0.002, d: 0.5, gain: 0.35, verb: 0.25 })
  modal({ t: hit + 0.01, f: 130, modes: IRON, gain: 0.32, strike: 0.6, beat: 8, verb: 0.35 })
  let at = hit + 0.28
  let gap = 0.22
  for (let i = 0; i < 5; i++) {
    const g = 1 - i * 0.15
    tone({ t: at, f: rnd(70, 95), f2: 38, d: 0.18, gain: 0.45 * g })
    burst({ t: at, noise: 'brown', type: 'lowpass', f: 600, q: 0.6, a: 0.003, d: 0.18, gain: 0.36 * g })
    modal({ t: at, f: rnd(150, 320), modes: IRON, gain: 0.16 * g, strike: 0.4, beat: twin(6), pan: rnd(-0.5, 0.5) })
    at += gap
    gap *= 1.18
  }
  for (let i = 0; i < few(14, 6); i++) modal({ t: hit + 0.3 + Math.random() * 1.7, f: rnd(300, 1400), modes: pick([IRON, WOOD, STONE]), gain: rnd(0.04, 0.1), strike: 0.3, pan: rnd(-0.8, 0.8), verb: 0.15 })
  crinkle({ t: hit + 0.2, n: few(24, 10), dur: 1.4, gain: 0.045, f0: 1500, f1: 6000, width: 0.9 })
  buzz([0, 250, 80, 150])
})

// Chain dog catching the cart at the lift: a heavy clunk and the first ratchet clacks.
export const liftEngage = safe(function liftEngage() {
  if (!limit('lift', 500) || !voice(0.9, 3)) return
  claim()
  const t = now()
  tone({ t, f: 80, f2: 40, d: 0.2, gain: 0.5 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 650, q: 0.6, a: 0.002, d: 0.16, gain: 0.45 })
  modal({ t, f: vary(210, 0.03), modes: IRON, gain: 0.26, strike: 0.6, beat: twin(6), verb: 0.15 })
  for (let i = 0; i < 4; i++) modal({ t: t + 0.12 + i * 0.065, f: vary(i % 2 ? 1150 : 880, 0.03), modes: IRON, gain: 0.09 * (1 - i * 0.15), decay: 0.12, strike: 0.3 })
  buzz(50)
})

// Rockslide, ~2 s: rock cracking, a deep rumble, stones bouncing down, grit.
export const rockslide = safe(function rockslide() {
  if (!limit('rockslide', 1500) || !voice(2.6, 4)) return
  const t = now()
  let at = t
  for (let i = 0; i < few(5, 3); i++) {
    burst({ t: at, type: 'highpass', f: rnd(2000, 3500), q: 0.7, a: 0.0005, d: 0.02, gain: 0.35, verb: 0.25 })
    modal({ t: at, f: rnd(400, 900), modes: STONE, gain: 0.25, strike: 0.3, pan: rnd(-0.4, 0.4) })
    at += rnd(0.04, 0.1)
  }
  burst({ t: t + 0.1, noise: 'brown', type: 'lowpass', f: 260, f2: 90, q: 0.6, a: 0.25, hold: 0.8, d: 1, gain: 0.7, verb: 0.3 })
  tone({ t: t + 0.1, f: 48, f2: 30, a: 0.2, hold: 0.8, d: 0.9, gain: 0.35 })
  for (let i = 0; i < few(16, 7); i++) {
    const s = t + 0.2 + Math.random() * 1.7
    const f = rnd(90, 140)
    const pan = rnd(-0.7, 0.7)
    tone({ t: s, f, f2: f * 0.5, d: 0.08, gain: rnd(0.1, 0.25), pan })
    modal({ t: s, f: rnd(300, 1200), modes: STONE, gain: rnd(0.05, 0.14), strike: 0.2, pan })
  }
  crinkle({ t: t + 0.1, n: few(30, 12), dur: 1.8, gain: 0.03, f0: 1500, f1: 5000, width: 0.9 })
  buzz([0, 100, 60, 300])
})

// A boulder hitting the cart or the track: a heavy stone thud with a crack and grit.
export const boulderHit = safe(function boulderHit() {
  if (!limit('boulder', 150) || !voice(0.8, 3)) return
  const t = now()
  tone({ t, f: 62, f2: 28, d: 0.4, gain: 0.65 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 550, f2: 200, q: 0.6, a: 0.002, d: 0.35, gain: 0.6, verb: 0.2 })
  modal({ t, f: vary(170, 0.05), modes: STONE, gain: 0.4, strike: 0.5 })
  burst({ t, f: 1200, q: 0.8, a: 0.001, d: 0.05, gain: 0.2 })
  crinkle({ t: t + 0.02, n: few(10, 5), dur: 0.3, gain: 0.04, f0: 1500, f1: 6000 })
  buzz(70)
})

// A drawbridge / winch working for `dur` s: wooden creaks, gear teeth ticking, a low groan.
export const bridgeCreak = safe(function bridgeCreak(dur = 2.5) {
  const D = clamp(dur, 0.3, 6, 2.5)
  if (!limit('bcreak', 400) || !voice(D + 0.3, 3)) return
  const t = now()
  const n = Math.ceil(D * few(2.5, 1.5))
  for (let i = 0; i < n; i++) creak({ t: t + (i / n) * D * 0.9 + rnd(0, 0.15), rate: rnd(18, 35), rate2: rnd(15, 45), f: rnd(450, 850), q: 7, a: 0.08, d: rnd(0.25, 0.45), gain: 0.12, pan: rnd(-0.4, 0.4), verb: 0.15 })
  const m = Math.min(few(50, 25), Math.floor(D / 0.11))
  for (let i = 0; i < m; i++) modal({ t: t + i * 0.11 + rnd(0, 0.01), f: vary(i % 2 ? 1500 : 1250, 0.02), modes: IRON, gain: 0.04, decay: 0.08, strike: 0.15, pan: 0.2 })
  tone({ t, type: 'sawtooth', f: 55, f2: 48, a: 0.3, hold: Math.max(0, D - 0.6), d: 0.3, gain: 0.05, lp: 300 })
})

// Crossing barrier arm dropping onto its rest: wooden clunk, counterweight clank, a bounce.
export const barrier = safe(function barrier() {
  if (!limit('barrier', 200) || !voice(0.7, 2)) return
  const t = now()
  modal({ t, f: vary(240, 0.04), modes: WOOD, gain: 0.4, strike: 0.25 })
  tone({ t, f: 120, f2: 60, d: 0.1, gain: 0.35 })
  modal({ t: t + 0.015, f: vary(520, 0.04), modes: IRON, gain: 0.12, decay: 0.35, strike: 0.3, beat: twin(6) })
  modal({ t: t + 0.14, f: vary(260, 0.04), modes: WOOD, gain: 0.15, strike: 0.1 })
  modal({ t: t + 0.22, f: vary(270, 0.04), modes: WOOD, gain: 0.06 })
})

// Tumbleweed bounce: a light thump and a crackle of dry twigs.
export const tumbleweed = safe(function tumbleweed() {
  if (!limit('tweed', 150) || !voice(0.5, 1)) return
  const t = now()
  tone({ t, f: 150, f2: 85, d: 0.07, gain: 0.18 })
  burst({ t, noise: 'pink', type: 'lowpass', f: 900, q: 0.6, a: 0.003, d: 0.08, gain: 0.15 })
  crinkle({ t, n: few(22, 10), dur: 0.3, gain: 0.08, f0: 1500, f1: 6500, width: 0.6 })
})

// Over a set of points: two axles clack-clack over the switch rails and the frog.
export const junctionClack = safe(function junctionClack() {
  if (!limit('junction', 300) || !voice(0.7, 2)) return
  const t = now()
  ;[0, 0.075, 0.3, 0.375].forEach((o, i) => {
    modal({ t: t + o, f: vary(i % 2 ? 560 : 620, 0.03), modes: IRON, gain: 0.14, decay: 0.2, strike: 0.5, pan: i % 2 ? 0.15 : -0.15 })
    tone({ t: t + o, f: 110, f2: 60, d: 0.05, gain: 0.25 })
  })
})

// Into a tunnel: the pressure whoomp, air rushing, slapback echoes off the bore.
export const tunnelEnter = safe(function tunnelEnter() {
  if (!limit('tunnel', 800) || !voice(1.4, 3)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 320, f2: 80, q: 0.8, a: 0.02, d: 0.45, gain: 0.55 })
  tone({ t, f: 60, f2: 32, d: 0.35, gain: 0.35 })
  burst({ t, noise: 'pink', f: 1900, f2: 280, q: 0.9, a: 0.03, d: 0.35, gain: 0.22, verb: 0.35 })
  ;[[0.11, 0.4, -0.4], [0.23, 0.22, 0.4], [0.37, 0.12, -0.3]].slice(0, few(3, 2)).forEach(([dt, g, pan]) => burst({ t: t + dt, noise: 'brown', type: 'lowpass', f: 260, f2: 90, q: 0.8, a: 0.01, d: 0.25, gain: 0.55 * g, pan }))
})

// --- Cart feel (cartFeel.js cues, ride.js / remote.js) -------------------------------------------
// One axle over a rail joint (k 0..1 with speed): the iron wheel drops into the gap and rings.
// On a timber trestle (wood) it is a hollow knock on the bent instead.
export const railJoint = safe(function railJoint(k = 0.5, wood = false) {
  k = clamp(k, 0, 1, 0)
  if (!limit('railJoint', 28) || !voice(0.12, 1)) return
  const t = now()
  if (wood) {
    modal({ t, f: rnd(110, 150), modes: WOOD, gain: 0.14 + 0.14 * k, strike: 0.2, bus: A.engine })
    tone({ t, f: 62, f2: 40, d: 0.08, gain: 0.12 + 0.1 * k, bus: A.engine })
    return
  }
  modal({ t, f: rnd(150, 190), modes: [[1, 1, 0.07], [2.7, 0.5, 0.04], [5.2, 0.25, 0.02]], gain: 0.16 + 0.18 * k, strike: 0.15, bus: A.engine })
  tone({ t, f: 70, f2: 42, d: 0.06, gain: 0.16 + 0.14 * k, bus: A.engine })
  burst({ t, noise: 'brown', type: 'lowpass', f: 600, d: 0.04, gain: 0.1 * k, bus: A.engine })
})

// A coupler running out of slack (k 0..1, i = which cart down the train: further = softer, duller):
// a heavy iron clank, the pins rattling, a dull thud through the frames.
export const coupler = safe(function coupler(k = 0.5, i = 0) {
  k = clamp(k, 0, 1, 0) / (1 + i * 0.35)
  if (k < 0.05 || !limit('coupler', 45) || !voice(0.5, 2)) return
  const t = now()
  modal({ t, f: vary(480 - i * 25, 0.05), modes: IRON, gain: 0.08 + 0.18 * k, decay: 0.35, strike: 0.55, beat: 7, verb: 0.15 })
  tone({ t, f: 95, f2: 48, d: 0.12, gain: 0.12 + 0.25 * k })
  burst({ t: t + 0.015, noise: 'brown', type: 'lowpass', f: 900, d: 0.06, gain: 0.12 * k })
  if (!COARSE_POINTER) burst({ t: t + 0.03, type: 'highpass', f: 3200, q: 0.7, a: 0.002, d: 0.05, gain: 0.05 * k }) // pins rattling
})

// Wheels meeting the rails at the wrong speed after airtime: a short steel squeal and a hiss.
export const wheelChirp = safe(function wheelChirp(k = 0.5) {
  k = clamp(k, 0, 1, 0)
  if (k < 0.05 || !limit('chirp', 150) || !voice(0.4, 2)) return
  const t = now()
  const f = rnd(2300, 2900)
  tone({ t, f, f2: f * 0.78, glide: 0.18 + k * 0.15, a: 0.005, hold: 0.04 + k * 0.08, d: 0.12, gain: 0.04 + 0.08 * k })
  tone({ t, f: f * 1.51, f2: f * 1.2, glide: 0.2, a: 0.005, hold: 0.03, d: 0.1, gain: 0.015 + 0.03 * k })
  burst({ t, type: 'highpass', f: 4200, q: 0.6, a: 0.005, d: 0.2 + k * 0.2, gain: 0.05 + 0.06 * k })
})

// Lifting off the throttle at revs: unburnt fuel popping in the exhaust (two or three pops).
export const backfire = safe(function backfire(k = 1) {
  k = clamp(k, 0, 1, 0)
  if (!limit('backfire', 700) || !voice(0.6, 2)) return
  const t = now()
  const n = 1 + Math.floor(Math.random() * 3)
  for (let i = 0; i < n; i++) {
    const at = t + i * rnd(0.07, 0.15)
    const g = (0.3 + 0.3 * k) / (1 + i * 0.5)
    burst({ t: at, noise: 'brown', type: 'lowpass', f: 1400, f2: 300, q: 0.7, a: 0.001, d: 0.07, gain: g, bus: A.engine, verb: 0.15 })
    tone({ t: at, f: rnd(110, 150), f2: 50, d: 0.06, gain: g * 0.6, bus: A.engine })
    burst({ t: at, type: 'highpass', f: 2500, q: 0.5, a: 0.001, d: 0.025, gain: g * 0.25, bus: A.engine })
  }
})

// A piece of crashed cart landing (k 0..1): iron or wood skittering on the ground.
export const debris = safe(function debris(k = 0.5) {
  k = clamp(k, 0, 1, 0)
  if (k < 0.05 || !limit('debris', 55) || !voice(0.3, 1)) return
  const t = now()
  modal({ t, f: rnd(300, 1100), modes: Math.random() < 0.6 ? IRON : WOOD, gain: 0.03 + 0.08 * k, strike: 0.4, pan: rnd(-0.6, 0.6), verb: 0.15 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 500, d: 0.06, gain: 0.08 * k })
})
