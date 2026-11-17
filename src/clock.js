// The game clock: the server's time when connected (net.js keeps the offset from
// each message's serverTime), else this device's. Restocks and quest periods use
// it so every player sees the same Shop and the same day.
let offset = 0
export const nowMs = () => Date.now() + offset
export const nowS = () => nowMs() / 1000
export function setServerTime(serverTime) {
  if (typeof serverTime === 'number' && Number.isFinite(serverTime)) offset = serverTime - Date.now()
}
