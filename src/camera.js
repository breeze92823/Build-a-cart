import { inputState } from './input.js'
import { player } from './player.js'
import { segmentClear } from './physics.js'
import { isFirstPerson, onModeChanged, setMode } from './modes.js'
import { CAMERA, PHYSICS } from './config.js'

// One camera, two modes (modes.js). Character mode is a third-person chase cam
// (ported from Clean Leaves for Loot): it owns its own yaw/pitch and orbits the
// player, ONE smoothing stage on the followed point, eased wheel zoom, sprint
// FOV, and a ray against static colliders pulls the boom in so it never sits
// inside a wall. Player mode puts the camera at eye height looking along
// yaw/pitch. Wheel in past minDistance -> player mode; wheel out -> character.
const state = { yaw: 0, pitch: CAMERA.startPitch }
const TELEPORT_DISTANCE = 15 // a same-frame jump bigger than this is a respawn: snap

// Driven by the Bloxity `camera_sensitivity` setting.
let sensitivity = 1
export function setCameraSensitivity(value) {
  sensitivity = value
}
export const getCameraSensitivity = () => sensitivity

const followed = { x: 0, y: 0, z: 0 } // smoothed feet position
const lastPlayerPos = { x: 0, y: 0, z: 0 }
const look = { x: 0, y: 0, z: 0 }
let initialised = false
let zoomTarget = CAMERA.distance
let zoomEased = CAMERA.distance
let rush = 0 // eased 0..1 sprint factor
let clearance = 1 // 0..1 of the boom the walls allow, eased back out

// Ride mode (ride.js): the boom swings in behind the cart unless the player is
// looking around, pulls back with speed and in the air, tips with the slope
// (down a drop it looks down it), the FOV widens with speed and punches out
// while a booster burns, the view shakes, and landings kick it down (a spring).
const ride = { on: false, speed: 0, shake: 0, air: 0, crashed: false, lookAt: -10, savedZoom: CAMERA.distance, time: 0, slope: 0, boost: false, punch: 0, slopeK: 0, heading: 0, roll: 0, rollK: 0 }
const kick = { y: 0, v: 0 }
export function setRide(on) {
  if (on === ride.on) return
  ride.on = on
  if (on) {
    ride.savedZoom = zoomTarget
    zoomTarget = Math.max(zoomTarget, 9.5)
    state.yaw = 0
    state.pitch = 0.16
  } else {
    zoomTarget = ride.savedZoom
    ride.speed = ride.shake = ride.air = ride.punch = ride.slopeK = ride.heading = ride.roll = ride.rollK = 0
    ride.boost = false
    kick.y = kick.v = 0
  }
}
// air: 0..1 (eased by the ride), slope: rail slope under the cart, boost: a booster burning,
// heading: the rails' yaw (bends), roll: the cart's lean (the camera banks a little with it).
export function rideState(speed01, shake, air, crashed, slope = 0, boost = false, heading = 0, roll = 0) {
  ride.heading = heading
  ride.roll = roll
  ride.speed = speed01
  ride.shake = shake
  ride.air = typeof air === 'number' ? air : air ? 1 : 0
  ride.crashed = crashed
  ride.slope = slope
  ride.boost = boost
}
// A landing / splash: the camera dips by k and springs back.
export function kickCamera(k = 1) {
  kick.v -= 6 * k
}

export const getYaw = () => state.yaw
export const getPitch = () => state.pitch

// Snaps the orbit to sit directly behind the player.
export function syncYawToPlayer() {
  state.yaw = player.facing + Math.PI
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// Entering first person keeps the view direction; leaving it backs the boom out
// a little so a single wheel notch doesn't flip straight back in. (The
// listener also runs once at registration; that call keeps the resting boom.)
let modeSeen = false
onModeChanged((mode) => {
  const first = !modeSeen
  modeSeen = true
  if (first) return
  if (mode === 'player') {
    state.pitch = clamp(state.pitch * 0.5, -CAMERA.firstPersonPitch, CAMERA.firstPersonPitch) // + = looking down in both modes
  } else {
    state.pitch = CAMERA.startPitch
    zoomTarget = zoomEased = CAMERA.minDistance + 2
  }
})

export function update(camera, dt) {
  ride.time += dt
  if (inputState.look.dx || inputState.look.dy) ride.lookAt = ride.time
  state.yaw -= inputState.look.dx * CAMERA.lookSensitivity * sensitivity
  state.pitch += inputState.look.dy * CAMERA.lookSensitivity * sensitivity
  inputState.look.dx = 0
  inputState.look.dy = 0
  const fp = isFirstPerson()
  if (ride.on) {
    ride.slopeK += (ride.slope - ride.slopeK) * (1 - Math.exp(-3 * dt))
    ride.punch += ((ride.boost ? 1 : 0) - ride.punch) * (1 - Math.exp(-(ride.boost ? 8 : 2.5) * dt))
    // The landing spring.
    kick.v += (-kick.y * 90 - kick.v * 11) * dt
    kick.y += kick.v * dt
  }
  if (ride.on && !ride.crashed && ride.time - ride.lookAt > 1.4) {
    // Swing back behind the cart (yaw 0 = looking down the track, -Z); look
    // down a drop, up a climb, and a little down on the cart in the air.
    const k = 1 - Math.exp(-2.5 * dt)
    state.yaw += Math.atan2(Math.sin(ride.heading - state.yaw), Math.cos(ride.heading - state.yaw)) * k
    const want = 0.16 + ride.air * 0.12 - Math.max(-0.22, Math.min(0.3, ride.slopeK * 0.45))
    state.pitch += (want - state.pitch) * k
  }
  state.pitch = fp ? clamp(state.pitch, -CAMERA.firstPersonPitch, CAMERA.firstPersonPitch) : clamp(state.pitch, CAMERA.minPitch, CAMERA.maxPitch)

  // Wheel: zoom the boom, or cross between the two modes at its inner end.
  if (inputState.zoom !== 0) {
    if (fp) {
      if (inputState.zoom > 0) setMode('character')
    } else {
      const next = zoomTarget + inputState.zoom * CAMERA.zoomStep
      if (next < CAMERA.minDistance && inputState.zoom < 0) setMode('player')
      else zoomTarget = clamp(next, CAMERA.minDistance, CAMERA.maxDistance)
    }
    inputState.zoom = 0
  }

  const p = player.renderPosition
  const jump = Math.hypot(p.x - lastPlayerPos.x, p.y - lastPlayerPos.y, p.z - lastPlayerPos.z)
  const teleported = initialised && jump > TELEPORT_DISTANCE
  lastPlayerPos.x = p.x
  lastPlayerPos.y = p.y
  lastPlayerPos.z = p.z
  if (teleported) {
    state.yaw = player.facing + Math.PI
    state.pitch = fp ? 0 : CAMERA.startPitch
  }

  if (!initialised || teleported) {
    followed.x = p.x
    followed.y = p.y
    followed.z = p.z
    clearance = 1
    initialised = true
  } else if (fp) {
    // First person: no horizontal lag (it reads as input delay); only steps are eased.
    followed.x = p.x
    followed.z = p.z
    followed.y += (p.y - followed.y) * (1 - Math.exp(-25 * dt))
  } else {
    const t = dt > 0 ? 1 - Math.exp(-CAMERA.followLerp * dt) : 1
    followed.x += (p.x - followed.x) * t
    followed.y += (p.y - followed.y) * t
    followed.z += (p.z - followed.z) * t
  }

  // Sprint framing: FOV widens a little at speed.
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  const targetRush = ride.on ? ride.speed * 2.4 : clamp((speed - PHYSICS.walkSpeed) / (PHYSICS.sprintSpeed - PHYSICS.walkSpeed), 0, 1)
  rush += (targetRush - rush) * (1 - Math.exp(-CAMERA.speedEase * dt))
  const fov = CAMERA.fov + CAMERA.speedFov * rush + (ride.on ? 9 * ride.punch + 4 * ride.air : 0)
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }

  if (fp) {
    const eyeY = followed.y + player.dims.height * CAMERA.eyeHeight
    const cp = Math.cos(state.pitch)
    camera.position.set(followed.x, eyeY, followed.z)
    camera.lookAt(followed.x - Math.sin(state.yaw) * cp, eyeY - Math.sin(state.pitch), followed.z - Math.cos(state.yaw) * cp)
    return
  }

  zoomEased += (zoomTarget - zoomEased) * (1 - Math.exp(-CAMERA.zoomEase * dt))
  const distance = Math.max(1, zoomEased) + (ride.on ? ride.speed * 3 + ride.air * 4 - ride.punch * 1.5 : 0)

  look.x = followed.x
  look.y = followed.y + player.dims.height * CAMERA.targetHeight
  look.z = followed.z

  const cp = Math.cos(state.pitch)
  const px = look.x + Math.sin(state.yaw) * cp * distance
  const py = look.y + Math.sin(state.pitch) * distance
  const pz = look.z + Math.cos(state.yaw) * cp * distance

  // Never inside a solid: pull in to the first static collider between the
  // player and the camera at once, and ease back out once it is clear.
  const hit = segmentClear(look.x, look.y, look.z, px, py, pz)
  const want = hit < 1 ? Math.max(0.08, hit - 0.05) : 1
  clearance = want < clearance ? want : clearance + (want - clearance) * (1 - Math.exp(-CAMERA.clearEase * dt))

  camera.position.set(look.x + (px - look.x) * clearance, look.y + (py - look.y) * clearance, look.z + (pz - look.z) * clearance)
  camera.lookAt(look.x, look.y, look.z)
  if (ride.on) {
    ride.rollK += (ride.roll - ride.rollK) * (1 - Math.exp(-5 * dt))
    if (Math.abs(ride.rollK) > 0.001) camera.rotateZ(ride.rollK * 0.35)
    camera.position.y += kick.y
    const k = ride.shake * 0.35 + (1 - ride.air) * ride.speed * ride.speed * 0.025 + ride.punch * 0.04
    if (k > 0.001) {
      camera.position.x += (Math.random() - 0.5) * k
      camera.position.y += (Math.random() - 0.5) * k
    }
  }
}
