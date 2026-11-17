// The V8 exhaust model (an AudioWorklet), shared by every combustion engine on the cart.
// Ported from the boat game: cylinder pulses into two damped exhaust pipes, uneven
// cross-plane firing for the burble, slow rev wander so a held note never buzzes.

export const WORKLET = `
class CartEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 700, minValue: 200, maxValue: 9000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ]
  }
  constructor() {
    super()
    this.phase = 0
    this.fire = 0
    this.amp = 1
    this.env = 0
    this.n = 1e9 // samples since the last firing
    this.bank = 0
    // Two banks, two exhaust pipes of slightly different length: left and right, which
    // spreads the note and keeps it from sounding nasal like a single tube would.
    this.pipes = [{ buf: new Float32Array(4096), lp: 0 }, { buf: new Float32Array(4096), lp: 0 }]
    this.w = 0
    this.grit = 0
    this.dc = [0, 0]
    this.dcx = [0, 0]
    this.seed = 22222
    this.wander = 0
    this.wanderTo = 0
    this.wanderIn = 0
    // Cross-plane V8: firing gaps, strengths and banks are not even, and that is the burble.
    this.gap = [1.08, 0.92, 1.03, 0.97, 1.1, 0.9, 1.0, 1.0]
    this.str = [1.0, 0.84, 1.08, 0.92, 1.04, 0.82, 1.06, 0.95]
    this.side = [0, 1, 0, 0, 1, 0, 1, 1]
  }
  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return this.seed / 4294967296
  }
  process(inputs, outputs, params) {
    const L = outputs[0][0]
    const R = outputs[0][1] ?? L
    if (!L) return true
    const rpm = params.rpm[0]
    const load = params.load[0]
    // A real engine never holds an exact speed: it drifts a percent or so, slowly.
    if (--this.wanderIn <= 0) {
      this.wanderTo = (this.rand() * 2 - 1) * 0.014
      this.wanderIn = 40 + Math.floor(this.rand() * 80) // blocks (~0.1-0.3 s)
    }
    this.wander += (this.wanderTo - this.wander) * 0.02
    const fireHz = (rpm / 60) * 4 * (1 + this.wander) // 8 cylinders, 4-stroke: 4 firings per turn
    const attack = Math.round(sampleRate * 0.0012) // soft rise: no click, no buzz
    const tau = 0.0022 + 0.003 * (1 - load) * (900 / Math.max(rpm, 400))
    const decay = Math.exp(-1 / (sampleRate * tau))
    const D0 = Math.max(16, Math.min(3500, Math.round(sampleRate / (90 + rpm * 0.01))))
    const Ds = [D0, Math.round(D0 * 1.13)]
    const fb = 0.32 + 0.14 * load // low feedback: a warm pipe, not a ringing tube
    const gritK = 0.1 + 0.22 * load
    let env = this.env
    for (let i = 0; i < L.length; i++) {
      this.phase += fireHz / sampleRate / this.gap[this.fire]
      if (this.phase >= 1) {
        this.phase -= 1
        this.fire = (this.fire + 1) & 7
        this.bank = this.side[this.fire]
        this.amp = this.str[this.fire] * (0.88 + 0.24 * this.rand()) * (0.45 + 0.55 * load)
        this.n = 0
      }
      if (this.n < attack) {
        const x = Math.sin((Math.PI / 2) * (this.n / attack))
        env = x * x
      } else env *= decay
      this.n++
      this.grit += 0.12 * ((this.rand() * 2 - 1) - this.grit) // dull rumble of combustion, not hiss
      const pulse = this.amp * env * (1 + gritK * this.grit * 3)
      for (let b = 0; b < 2; b++) {
        const p = this.pipes[b]
        const delayed = p.buf[(this.w - Ds[b] + 4096) & 4095]
        p.lp += 0.2 * (delayed - p.lp) // each bounce loses its highs
        const y = (b === this.bank ? pulse : pulse * 0.25) + fb * p.lp
        p.buf[this.w] = y
        const o = y - this.dcx[b] + 0.995 * this.dc[b]
        this.dcx[b] = y
        this.dc[b] = o
      }
      this.w = (this.w + 1) & 4095
      L[i] = (this.dc[0] * 0.75 + this.dc[1] * 0.25) * 0.4
      R[i] = (this.dc[1] * 0.75 + this.dc[0] * 0.25) * 0.4
    }
    this.env = env
    return true
  }
}
registerProcessor('cart-engine', CartEngine)
`
