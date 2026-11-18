// Rewarded ads (docs.bloxity.io, Ads): the player opts in with a button; the reward is granted only when
// the portal says the ad 'completed' AND the game server confirmed the reward token with Bloxity
// (net.verifyAdReward). Nothing is ever sold for Gems: watching an ad only gives the small perks in
// config ADS. Outside Bloxity (dev, blocked SDK) there are no ads and no buttons.
import { ADS, NET } from './config.js'
import { canShowRewardedAd, showRewardedAd } from './bloxity.js'
import { verifyAdReward } from './net.js'
import { grantCashBoost } from './state.js'

let busy = false
let lastAt = -1e9

export const adsReady = () => !busy && canShowRewardedAd()

// Plays the ad for `offer` (an ADS entry). Resolves true when the reward may be granted.
export async function watchAd(offer) {
  if (busy || !canShowRewardedAd()) return false
  if (performance.now() - lastAt < NET.adCooldown * 1000) return false // the server refuses faster ones
  busy = true
  try {
    const r = await showRewardedAd(offer.placement)
    if (r.status !== 'completed') return false
    lastAt = performance.now()
    return await verifyAdReward(r.rewardToken)
  } finally {
    busy = false
  }
}

// HUD "x2 CASH": 2x run cash for a while. Resolves the seconds granted (0 = no reward).
export async function watchForCashBoost() {
  if (!(await watchAd(ADS.boost))) return 0
  return grantCashBoost(ADS.boost.seconds)
}
