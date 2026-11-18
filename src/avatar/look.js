// Another player's Bloxity look -> a dressed character, from what the room replicates: ids only (the
// `avatar` JSON { equipped, proportions }) and the outfit key, never URLs. In order:
//   1. the Bloxity character kit (Legion.SDK.character.dress with the outfit key) when this game has it;
//   2. the manual path: skin texture, body parts and accessories from the CDN (loader.js).
// Never throws; resolves null when even the base rig failed (the caller keeps its blocky stand-in).
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { loadBaseCharacter } from './character.js'
import { applyProportions, attachEquippedAccessories } from './loader.js'
import * as bloxity from '../bloxity.js'

const KIT_TIMEOUT = 12000

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

// The replicated form of the LOCAL look (net.js sends it as `avatar`): ids only, length-capped.
export function lookToJson(equipped, proportions) {
  if (!equipped) return ''
  try {
    return JSON.stringify({ equipped, proportions: proportions || null }).slice(0, 2900)
  } catch {
    return ''
  }
}

export function lookFromJson(json) {
  let look = null
  try {
    look = json ? JSON.parse(json) : null
  } catch {
    look = null
  }
  if (!look || typeof look !== 'object') return {}
  // A url never comes in a look: drop any string value that looks like one.
  if (look.equipped && typeof look.equipped === 'object') {
    for (const [k, v] of Object.entries(look.equipped)) if (typeof v === 'string' && /[/:]/.test(v)) delete look.equipped[k]
  }
  return look
}

// look: { equipped, proportions, outfitKey }. Returns the dressed root (with `nodes`), or null.
export async function buildLook(look = {}) {
  const equipped = look.equipped && typeof look.equipped === 'object' ? look.equipped : null
  if (!equipped && !look.outfitKey) return null
  try {
    const kit = bloxity.characterKit()
    const key = look.outfitKey || (equipped ? bloxity.getOutfitKeyFor(equipped) : '')
    if (kit && key) {
      let can = false
      try {
        can = !!kit.canDress(key)
      } catch {
        can = false
      }
      if (can) {
        const base = await loadBaseCharacter()
        try {
          const handle = await withTimeout(kit.dress({ THREE, GLTFLoader, root: base, outfitKey: key }), KIT_TIMEOUT)
          if (handle) {
            base.userData.lookHandle = handle
            applyProportions(base, null) // the kit already shaped the body: the unit scale only
            return base
          }
        } catch (err) {
          console.warn('[look] character kit failed, drawing the look by hand', err)
        }
      }
    }
    if (!equipped) return null
    const base = await loadBaseCharacter()
    await attachEquippedAccessories(base, equipped, { skinTextureUrl: bloxity.getSkinTextureUrlFor(equipped) || undefined })
    applyProportions(base, look.proportions || null)
    return base
  } catch (err) {
    console.warn('[look] building the look failed', err)
    return null
  }
}

// Frees a dressed root's kit outfit before the root is dropped.
export function disposeLook(root) {
  try {
    root?.userData?.lookHandle?.dispose?.()
  } catch {
    // Already gone.
  }
  if (root?.userData) root.userData.lookHandle = null
}
