// Portal emotes (docs.bloxity.io, "Add emote support"). The player picks an emote in the portal's emote
// picker; the SDK sends play_emote with its id (stop_emote when they take it off). The catalogue
// (bloxity.getEmoteClip) gives each emote a clip { len, loop, tracks: { Bone: [[t, xDeg, yDeg, zDeg], ...] } }:
// degree deltas over the bind pose (XYZ euler), smoothstep between keys. The clip is applied on top of the
// animator's pose, blended in over BLEND_IN seconds, and stops when the character moves. Unknown ids and
// bones are ignored, ownership is never checked, nothing here throws.
// One player per emote player: the local avatar, and each remote avatar (their emote id arrives through
// the room state, remote.js).
import { Euler, MathUtils, Quaternion } from 'three'
import { getEmoteClip } from '../bloxity.js'

const BLEND_IN = 0.1 // s
const MOVE_STOP = 0.6 // m/s of horizontal speed that cancels the emote

const smooth = (t) => t * t * (3 - 2 * t)

// One track's delta (degrees) at time t: smoothstep between the surrounding keys, clamped outside them.
export function sampleTrack(keys, t, out) {
  const n = keys.length
  const first = keys[0]
  const last = keys[n - 1]
  if (t <= first[0]) {
    out[0] = first[1]
    out[1] = first[2]
    out[2] = first[3]
    return out
  }
  if (t >= last[0]) {
    out[0] = last[1]
    out[1] = last[2]
    out[2] = last[3]
    return out
  }
  let i = 1
  while (keys[i][0] < t) i++
  const a = keys[i - 1]
  const b = keys[i]
  const k = smooth((t - a[0]) / (b[0] - a[0] || 1))
  out[0] = a[1] + (b[1] - a[1]) * k
  out[1] = a[2] + (b[2] - a[2]) * k
  out[2] = a[3] + (b[3] - a[3]) * k
  return out
}

// play(id) / stop(), then update(dt, speed, grounded) every frame AFTER the animator wrote its pose.
// onChange(fn): fn(id) when an emote starts, fn('') when it stops (the local player's goes to the room).
export function createEmotePlayer() {
  let want = '' // the id asked for ('' = none)
  let current = null // { id, clip, t, tracks: [{ bone, rest, keys }] }
  let avatar = null
  let rigRests = new Map() // bone -> bind quaternion, for the bones the animator drives
  const rests = new WeakMap() // other bones: their bind quaternion, captured before an emote first touches them
  const euler = new Euler()
  const q = new Quaternion()
  const target = new Quaternion()
  const delta = [0, 0, 0]
  const listeners = new Set()
  const notify = (id) => {
    for (const fn of listeners) {
      try {
        fn(id)
      } catch (err) {
        console.warn('[emotes] listener threw', err)
      }
    }
  }

  function restOf(bone) {
    const rig = rigRests.get(bone)
    if (rig) return rig
    if (!rests.has(bone)) rests.set(bone, bone.quaternion.clone())
    return rests.get(bone)
  }

  function clear() {
    if (!current) return
    for (const tr of current.tracks) tr.bone.quaternion.copy(tr.rest)
    current = null
  }
  function stop() {
    if (!current) return
    clear()
    notify('')
  }

  function begin(clip, id) {
    clear()
    if (!avatar?.nodes) return
    const tracks = []
    for (const [name, keys] of Object.entries(clip.tracks)) {
      const bone = avatar.nodes[name]
      if (!bone || !Array.isArray(keys) || !keys.length) continue // e.g. the stand-in character has no elbows
      tracks.push({ bone, rest: restOf(bone), keys })
    }
    if (tracks.length) {
      current = { id, clip, t: 0, tracks }
      notify(id)
    }
  }

  async function start(id) {
    want = id
    if (!id) return stop()
    const clip = await getEmoteClip(id)
    if (want !== id) return // changed meanwhile
    if (!clip) return stop() // unknown id: ignore
    begin(clip, id)
  }

  return {
    get playing() {
      return !!current
    },
    get id() {
      return current?.id ?? ''
    },
    onChange(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    play: start,
    stop() {
      want = ''
      stop()
    },
    // The avatar was rebuilt (sign-in, customizer edit, a remote's new look): its bones are new objects.
    setAvatar(next, animator) {
      const was = current?.id
      avatar = next
      rigRests = new Map((animator?.rig?.bindings ?? []).map((b) => [b.bone, b.rest]))
      current = null
      if (was) notify('')
    },
    // After the animator wrote this frame's pose. speed = horizontal m/s, grounded = on the floor.
    update(dt, speed, grounded) {
      if (!current) return
      if (speed > MOVE_STOP || !grounded) {
        want = ''
        return stop()
      }
      const c = current
      c.t += dt
      const len = c.clip.len > 0 ? c.clip.len : 1
      let t = c.t
      if (c.clip.loop) t %= len
      else if (t > len) {
        want = ''
        return stop()
      }
      const w = Math.min(1, c.t / BLEND_IN)
      for (const tr of c.tracks) {
        sampleTrack(tr.keys, t, delta)
        euler.set(MathUtils.degToRad(delta[0]), MathUtils.degToRad(delta[1]), MathUtils.degToRad(delta[2]), 'XYZ')
        q.setFromEuler(euler)
        target.copy(tr.rest).multiply(q)
        tr.bone.quaternion.slerp(target, w)
      }
    },
  }
}
