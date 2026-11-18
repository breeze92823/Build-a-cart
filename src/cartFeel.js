// How a cart feels: the body on its springs over the wheels, the wheels themselves, and the
// slack in the couplers of the trailing carts. Purely visual (and the sounds it cues): it reads
// the ride state, never writes it, so ride physics, the sims and the tests are untouched.
// Used by the player's own train (ride.js) and every remote train (remote.js). No DOM, no three.js:
// it can be stepped in Node like cartPhysics.js.
//
//   const feel = new CartFeel()
//   feel.update(dt, { s, v, air, airTime, throttle, brake, fuel, wood, wagons: [{ s, air }] })
//   feel.apply(cart, wagons, dt, running, throttle)   // writes the body offsets + wheel spin
//   feel.back(i)                                     // extra metres of path behind wagon i (slack)
//   feel.out                                         // this frame's cues: joints, clank, chirp, landed
import { CART_FEEL as F } from './config.js'
import { trackSlope } from './cartPhysics.js'

const W = 2 * Math.PI * F.freq
const K = W * W
const C = 2 * F.damp * W
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x)
const MAX_SUB = 1 / 120

// Rail load: v^2 x the profile's curvature (positive in a dip = pressed into the rails).
function railLoad(s, v) {
  const a = trackSlope(s - 0.6)
  const b = trackSlope(s + 0.6)
  const k = (b - a) / 1.2 / Math.pow(1 + ((a + b) / 2) ** 2, 1.5)
  return v * v * k
}

// One body on springs: heave (m), pitch and roll (rad), each a damped spring to a target.
class Body {
  constructor() {
    this.reset(0)
  }
  reset(s) {
    this.h = this.hv = 0
    this.p = this.pv = 0
    this.r = this.rv = 0
    this.lastS = s
    this.wasAir = false
    this.airT = 0
  }
  // Rail joints crossed by an axle at ax metres from the centre since lastS.
  static crossings(a, b, ax, gap) {
    return Math.abs(Math.floor((b + ax) / gap) - Math.floor((a + ax) / gap))
  }
  // accelK scales the squat (wagons have no engine: they only feel the brake through the couplers).
  step(dt, s, v, air, accel, accelK, wood, out) {
    const speedK = Math.min(1, Math.abs(v) / 30)
    let joints = 0
    if (air) this.airT += dt
    // A big jump in s = a warp / revive: no joints, no landing.
    const jumped = Math.abs(s - this.lastS) > 30
    if (!air && !jumped) {
      if (this.wasAir && this.airT > 0.12) {
        const k = Math.min(1, this.airT / 1.2)
        this.hv -= F.landKick * (0.3 + k)
        this.pv += (Math.random() - 0.5) * 0.5 * (0.3 + k)
        this.rv += (Math.random() - 0.5) * 0.35 * (0.3 + k)
        if (out) out.landed = Math.max(out.landed, k)
      }
      if (Math.abs(v) > 1.5) {
        const gap = wood ? F.jointGapWood : F.jointGap
        const front = Body.crossings(this.lastS, s, F.axle, gap)
        const rear = Body.crossings(this.lastS, s, -F.axle, gap)
        const kick = F.jointKick * (0.25 + speedK)
        // Front axle drops into the joint (nose down), then the back one (nose up).
        const dir = Math.sign(v) || 1
        for (let i = 0; i < Math.min(2, front); i++) {
          this.hv -= kick
          this.pv -= F.jointPitch * (0.25 + speedK) * dir
          this.rv += (Math.random() - 0.5) * 0.04 * speedK
        }
        for (let i = 0; i < Math.min(2, rear); i++) {
          this.hv -= kick * 0.8
          this.pv += F.jointPitch * (0.25 + speedK) * dir
        }
        joints = front + rear
      }
    }
    if (!air) this.airT = 0
    this.wasAir = air
    this.lastS = s

    const ht = air ? F.airLift : clamp(-railLoad(s, v) * F.heaveLoad, -F.heaveMax, F.heaveMax)
    const pt = air ? 0 : clamp(accel * F.squat * accelK, -F.pitchMax, F.pitchMax)
    // Sub-step the springs so a slow frame never blows them up.
    const n = Math.max(1, Math.ceil(dt / MAX_SUB))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      this.hv += (-(this.h - ht) * K - this.hv * C) * h
      this.h += this.hv * h
      this.pv += (-(this.p - pt) * K - this.pv * C) * h
      this.p += this.pv * h
      this.rv += (-this.r * K - this.rv * C) * h
      this.r += this.rv * h
    }
    // Bottoming out on the bump stops.
    if (this.h < -F.heaveMax * 1.3) {
      this.h = -F.heaveMax * 1.3
      if (this.hv < 0) this.hv *= -0.3
    }
    return joints
  }
  write(tilt) {
    tilt.position.y = this.h
    tilt.rotation.x = this.p
    tilt.rotation.z = this.r
  }
}

export class CartFeel {
  constructor() {
    this.lead = new Body()
    this.cars = [] // one Body per trailing cart
    this.slack = [] // per coupler: { d, u, a } (d > 0 = the cart hangs back, taut)
    this.out = { joints: 0, wood: false, clank: 0, clankAt: -1, chirp: 0, landed: 0 }
    this.reset(0)
  }
  // s: where the train is now (after a mount, revive or warp).
  reset(s = 0) {
    this.lead.reset(s)
    for (const b of this.cars) b.reset(s)
    for (const k of this.slack) k.d = k.u = k.a = 0
    this.wheel = 0 // wheel surface speed, m/s
    this.wagonWheel = 0
    this.acc = 0
    this.lastV = null
    this.wasAir = false
    this.shakeT = 0
  }
  setWagons(n) {
    while (this.cars.length < n) this.cars.push(new Body())
    this.cars.length = n
    while (this.slack.length < n) this.slack.push({ d: 0, u: 0, a: 0 })
    this.slack.length = n
  }
  // st: { s, v (signed, m/s), air, throttle 0..1, brake 0..1, fuel (bool), wood (bool),
  //       wagons: [{ s, air }] per trailing cart (its own spot on the path) }
  update(dt, st) {
    const out = this.out
    out.joints = 0
    out.clank = 0
    out.clankAt = -1
    out.chirp = 0
    out.landed = 0
    out.wood = !!st.wood
    if (!(dt > 0)) return out
    const v = st.v
    if (this.lastV !== null) {
      const a = clamp((v - this.lastV) / dt, -60, 60)
      this.acc += (a - this.acc) * Math.min(1, dt * 12)
    }
    this.lastV = v

    // The wheels: locked by the brake, free in the air (the engine revs them, then they coast).
    if (st.air) {
      if (st.throttle > 0 && st.fuel) this.wheel = clamp(this.wheel + (Math.sign(v) || 1) * F.airRev * st.throttle * dt, -F.airRevMax, F.airRevMax)
      else this.wheel *= Math.exp(-F.airSpinDecay * dt)
      this.wagonWheel *= Math.exp(-F.airSpinDecay * dt)
    } else {
      if (this.wasAir) {
        const miss = Math.abs(this.wheel - v)
        if (miss > F.chirpFrom) out.chirp = Math.min(1, (miss - F.chirpFrom) / 30 + 0.2)
        this.wheel = v
      }
      const locked = st.brake > 0.5 && Math.abs(v) > F.lockFrom
      const target = locked ? v * 0.12 : v
      this.wheel += (target - this.wheel) * Math.min(1, dt * (locked ? 10 : 30))
      this.wagonWheel += (target - this.wagonWheel) * Math.min(1, dt * 30)
    }
    this.wasAir = st.air

    out.joints = this.lead.step(dt, st.s, v, st.air, this.acc, 1, out.wood, out)

    // Coupler slack: each cart feels the lead's acceleration a little later than the one before.
    for (let i = 0; i < this.slack.length; i++) {
      const k = this.slack[i]
      k.a += (this.acc - k.a) * Math.min(1, dt / (F.slackLag * (i + 1)))
      const n = Math.max(1, Math.ceil(dt / MAX_SUB))
      const h = dt / n
      for (let j = 0; j < n; j++) {
        k.u += (k.a - F.slackSpring * k.d - F.slackDamp * k.u) * h
        k.d += k.u * h
        if (Math.abs(k.d) > F.slack) {
          k.d = Math.sign(k.d) * F.slack
          const hit = Math.abs(k.u)
          if (hit > F.clankMin) {
            const c = Math.min(1, (hit - F.clankMin) / (F.clankFull - F.clankMin) + 0.15)
            if (c > out.clank) {
              out.clank = c
              out.clankAt = i
            }
            // The jolt runs into both carts' springs.
            const car = this.cars[i]
            if (car) car.pv += Math.sign(k.u) * 0.25 * c
            if (i === 0) this.lead.pv -= Math.sign(k.u) * 0.12 * c
          }
          k.u *= -0.25
        }
      }
      const w = st.wagons?.[i]
      if (w && this.cars[i]) this.cars[i].step(dt, w.s, v, w.air, k.a, 0.4, out.wood, null)
    }
    return out
  }
  // Extra path metres behind wagon i: its own coupler plus every one in front of it.
  back(i) {
    let d = 0
    for (let j = 0; j <= i && j < this.slack.length; j++) d += this.slack[j].d
    return d
  }
  // Writes the bodies and the wheels. running: the engine is on (fuel), throttle 0..1.
  apply(cart, wagons, dt, running = false, throttle = 0) {
    if (!cart) return
    const u = cart.userData
    this.lead.write(u.tilt)
    const R = u.wheelR || 0.38
    for (const w of u.spin) w.rotation.x -= (this.wheel / R) * dt
    // The engine block shakes on its mounts with the revs.
    const eng = u.parts?.engine
    if (eng) {
      const home = (eng.userData.home ??= eng.position.clone())
      if (running) {
        const a = F.engineShake * (0.3 + 0.7 * throttle)
        eng.position.set(home.x + (Math.random() - 0.5) * a, home.y + (Math.random() - 0.5) * a * 1.4, home.z)
        eng.rotation.z = (Math.random() - 0.5) * a * 1.2
      } else if (eng.position.y !== home.y || eng.position.x !== home.x) {
        eng.position.copy(home)
        eng.rotation.z = 0
      }
    }
    for (let i = 0; i < wagons.length; i++) {
      const w = wagons[i]
      if (this.cars[i]) this.cars[i].write(w.userData.tilt)
      for (const wh of w.userData.spin) wh.rotation.x -= (this.wagonWheel / R) * dt
    }
  }
  // Puts every body and part back at rest (parked).
  rest(cart, wagons) {
    this.reset(this.lead.lastS)
    if (!cart) return
    this.lead.write(cart.userData.tilt)
    const eng = cart.userData.parts?.engine
    if (eng?.userData.home) {
      eng.position.copy(eng.userData.home)
      eng.rotation.z = 0
    }
    for (let i = 0; i < wagons.length; i++) if (this.cars[i]) this.cars[i].write(wagons[i].userData.tilt)
  }
}
