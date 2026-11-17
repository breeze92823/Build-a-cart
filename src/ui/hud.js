// The on-screen HUD: LAUNCH/RETURN, the wheel timer and event line on top; the
// starter offer and SHOP / QUESTS / REBIRTH / SAVES on the left; cash at the
// bottom left; the backpack slot at the bottom; toasts and banners; and while
// riding: run cash, distance, speed, speed + fuel bars, BOOST, touch pedals, the
// area title cards, AIRTIME pops, waterfall droplets, the speed vignette/streaks
// and the crash screen (countdown, REVIVE for cash, RESTART).
import './hud.css'
import { fmt } from '../track.js'

const ICON = {
  shop: '<svg viewBox="0 0 64 64"><path d="M10 26h44l-4 30H14z" fill="#f7b733" stroke="#4a2a00" stroke-width="3"/><path d="M6 18h52v10H6z" fill="#ff8a1a" stroke="#4a2a00" stroke-width="3"/><path d="M22 18c0-8 4-12 10-12s10 4 10 12" fill="none" stroke="#4a2a00" stroke-width="4"/><path d="M24 36h16v12H24z" fill="#ffe08a" stroke="#4a2a00" stroke-width="2.5"/></svg>',
  quests: '<svg viewBox="0 0 64 64"><rect x="12" y="8" width="40" height="48" rx="5" fill="#f3e2b8" stroke="#3a2a10" stroke-width="3"/><path d="M20 22h24M20 32h24M20 42h16" stroke="#8a6a3a" stroke-width="4" stroke-linecap="round"/><path d="M40 40l5 5 9-12" fill="none" stroke="#1fa83a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  rebirth: '<svg viewBox="0 0 64 64"><path d="M32 8a24 24 0 1 1-21 12" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M4 12l8 12 12-6z" fill="#fff"/><circle cx="32" cy="32" r="9" fill="#ffd23a" stroke="#4a2a00" stroke-width="3"/></svg>',
  saves: '<svg viewBox="0 0 64 64"><path d="M10 8h36l10 10v38H10z" fill="#e8f2ff" stroke="#0b2a5a" stroke-width="3"/><rect x="18" y="8" width="24" height="16" fill="#5aa8ff" stroke="#0b2a5a" stroke-width="3"/><rect x="18" y="34" width="28" height="18" rx="2" fill="#fff" stroke="#0b2a5a" stroke-width="3"/><path d="M22 40h20M22 46h14" stroke="#ff5a7a" stroke-width="3"/></svg>',
  backpack: '<svg viewBox="0 0 64 64"><path d="M16 22c0-10 6-14 16-14s16 4 16 14v32H16z" fill="#c98a3a" stroke="#3a2210" stroke-width="3"/><rect x="22" y="32" width="20" height="14" rx="3" fill="#a86a2a" stroke="#3a2210" stroke-width="3"/><path d="M26 10c0-4 12-4 12 0" fill="none" stroke="#3a2210" stroke-width="3"/></svg>',
}

function el(tag, cls, html = '') {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
function tap(node, fn) {
  node.addEventListener('click', (e) => {
    e.stopPropagation()
    fn(e)
  })
  return node
}

export function createHud(actions) {
  const root = el('div', 'hud')
  document.body.appendChild(root)
  // Screen effects under everything else: speed streaks + vignette, droplets.
  const speedFx = el('div', 'speed-fx', '<i class="rays"></i><i class="vig"></i>')
  const drops = el('div', 'drops')
  root.append(speedFx, drops)

  // --- Top --------------------------------------------------------------------
  const top = el('div', 'hud-top')
  const row = el('div', 'top-row')
  const launch = tap(el('button', 'launch big'), () => actions.launch())
  launch.textContent = 'LAUNCH'
  const wheel = tap(el('button', 'wheel-timer', '<div class="disc"></div><span class="stroke">--:--</span>'), () => actions.wheel())
  row.append(launch, wheel)
  const eventLine = el('div', 'event-line stroke', 'Next Event: --:--')
  top.append(row, eventLine)

  // --- Left -------------------------------------------------------------------
  const left = el('div', 'hud-left')
  const offer = tap(el('button', 'offer'), () => actions.offer())
  const side = el('div', 'side-grid')
  const sideBtn = (key, label) => {
    const b = tap(el('button', `side-btn ${key}`, `${ICON[key]}<b class="stroke">${label}</b><span class="badge">!</span>`), () => actions[key]())
    side.appendChild(b)
    return b
  }
  const shopB = sideBtn('shop', 'SHOP')
  const questB = sideBtn('quests', 'QUESTS')
  const rebirthB = sideBtn('rebirth', 'REBIRTH')
  sideBtn('saves', 'SAVES')
  shopB.querySelector('.badge').textContent = 'NEW!'
  shopB.querySelector('.badge').classList.add('on')
  left.append(offer, side)

  // --- Money, hotbar, toasts, banner -------------------------------------------------
  const money = el('div', 'money', '$ 0')
  const hotbar = el('div', 'hotbar')
  const bag = tap(el('button', 'slot', `<i class="stroke">1</i>${ICON.backpack}`), () => actions.backpack())
  hotbar.appendChild(bag)
  // Carried parts (carry.js): one slot per spare engine / fuel tank, tap to hold.
  let hotbarKey = ''
  const itemSlots = []
  const toasts = el('div', 'toasts')
  const banner = el('div', 'banner stroke')

  // --- Ride ----------------------------------------------------------------------
  const ride = el('div', 'ride')
  const info = el('div', 'run-info')
  const runCash = el('div', 'run-cash', '+$0')
  const runDist = el('div', 'run-dist stroke', 'Distance: 0')
  info.append(runCash, el('br'), runDist)
  const gauges = el('div', 'gauges')
  const speedNum = el('div', 'speed-num stroke', '0 studs/s')
  const speedBar = el('div', 'bar speedbar', '<div class="fill"></div><span class="stroke">SPEED</span>')
  const fuelBar = el('div', 'bar fuel', '<div class="fill"></div><span>FUEL</span>')
  gauges.append(speedNum, speedBar, fuelBar)
  const boostBtn = el('button', 'boost-btn stroke', 'BOOST<small>x0</small>')
  boostBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    actions.boost()
  })
  const hint = el('div', 'ride-hint stroke', 'W gas · S brake · Space boost · E / RETURN to get off')
  const pedals = el('div', 'pedals')
  const pedal = (cls, label, key) => {
    const p = el('button', `pedal ${cls} stroke`, label)
    const set = (on) => {
      p.classList.toggle('held', on)
      actions.pedal(key, on)
    }
    p.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        p.setPointerCapture(e.pointerId)
      } catch {
        // Fine without capture.
      }
      set(true)
    })
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) p.addEventListener(ev, () => set(false))
    pedals.appendChild(p)
  }
  pedal('gas', 'GAS', 'gas')
  pedal('brake', 'BRAKE', 'brake')
  const zoneCard = el('div', 'zone-card')
  const airPop = el('div', 'air-pop stroke')
  ride.append(info, zoneCard, airPop, gauges, boostBtn, hint, pedals)

  // --- Crash -------------------------------------------------------------------------
  const crash = el('div', 'crash')
  const count = el('div', 'count stroke', '5')
  const crow = el('div', 'row')
  const revive = tap(el('button', 'revive', 'REVIVE<small>$0</small>'), () => actions.revive())
  const restart = tap(el('button', 'restart', 'RESTART'), () => actions.restart())
  crow.append(revive, restart)
  crash.append(count, crow)

  root.append(top, left, money, hotbar, toasts, banner, ride, crash)

  let shownCash = -1
  let lastRunCash = -1
  return {
    root,
    setRiding(on) {
      root.classList.toggle('riding', on)
      document.body.classList.toggle('is-riding', on)
      launch.textContent = on ? 'RETURN' : 'LAUNCH'
      launch.classList.toggle('return', on)
    },
    setCash(n, mult) {
      if (n === shownCash && !mult) return
      if (n > shownCash && shownCash >= 0) {
        money.classList.add('bump')
        setTimeout(() => money.classList.remove('bump'), 150)
      }
      shownCash = n
      money.innerHTML = `$ ${Math.floor(n).toLocaleString('en-US')}${mult ? `<span class="mult">${mult}</span>` : ''}`
    },
    setWheel(ready, text) {
      wheel.classList.toggle('ready', ready)
      wheel.querySelector('span').textContent = text
    },
    setEvent(html, active) {
      eventLine.innerHTML = html
      eventLine.classList.toggle('active', active)
    },
    setOffer(img, priceText, visible) {
      offer.style.display = visible ? '' : 'none'
      offer.innerHTML = `${img ? `<img src="${img}" alt="">` : ''}<span class="price stroke">${priceText}</span><b class="stroke">STARTER!</b>`
    },
    setBadges(quests, rebirth) {
      questB.querySelector('.badge').classList.toggle('on', quests)
      rebirthB.querySelector('.badge').classList.toggle('on', rebirth)
    },
    shopSeen() {
      shopB.querySelector('.badge').classList.remove('on')
    },
    toast(text, kind = 'good') {
      const t = el('div', `toast ${kind} stroke`, text)
      toasts.appendChild(t)
      while (toasts.children.length > 4) toasts.firstChild.remove()
      setTimeout(() => t.remove(), 2500)
    },
    banner(big, small = '') {
      banner.innerHTML = `<b>${big}</b>${small ? `<small>${small}</small>` : ''}`
      banner.classList.remove('on')
      void banner.offsetWidth
      banner.classList.add('on')
    },
    // r: { cash, dist, speed, top, fuel 0..1, charges, boostReady, burning, hasBooster }
    setRide(r) {
      const c = Math.floor(r.cash)
      if (c !== lastRunCash) {
        runCash.textContent = `+${fmt(c)}`
        if (c > lastRunCash && lastRunCash >= 0) {
          runCash.classList.remove('pop')
          void runCash.offsetWidth
          runCash.classList.add('pop')
        }
        lastRunCash = c
      }
      runDist.textContent = `Distance: ${Math.floor(r.dist).toLocaleString('en-US')}`
      speedNum.textContent = `${Math.round(Math.abs(r.speed))} studs/s`
      speedBar.firstChild.style.transform = `scaleX(${Math.min(1, Math.abs(r.speed) / Math.max(1, r.top))})`
      fuelBar.firstChild.style.transform = `scaleX(${Math.max(0, r.fuel)})`
      fuelBar.classList.toggle('low', r.fuel > 0 && r.fuel < 0.2)
      fuelBar.lastChild.textContent = r.fuel <= 0 ? 'NO FUEL' : 'FUEL'
      boostBtn.classList.toggle('on', r.hasBooster)
      boostBtn.disabled = !r.boostReady
      boostBtn.classList.toggle('burning', r.burning)
      boostBtn.querySelector('small').textContent = `x${r.charges}`
    },
    resetRun() {
      lastRunCash = -1
    },
    // An area's title card sweeping in under the distance.
    zone(name, sub, color, fresh) {
      zoneCard.style.setProperty('--zc', color)
      zoneCard.innerHTML = `<b class="stroke">${name}</b>${sub ? `<small class="stroke">${sub}</small>` : ''}`
      zoneCard.classList.toggle('fresh', !!fresh)
      zoneCard.classList.remove('on')
      void zoneCard.offsetWidth
      zoneCard.classList.add('on')
    },
    // A long flight off a crest.
    airtime(seconds) {
      airPop.textContent = `AIRTIME! ${seconds.toFixed(1)}s`
      airPop.classList.remove('on')
      void airPop.offsetWidth
      airPop.classList.add('on')
    },
    // Water on the lens after the waterfall: a scatter of droplets that run and fade.
    splash() {
      const n = 26
      let bg = ''
      for (let i = 0; i < n; i++) {
        const x = Math.round(Math.random() * 100)
        const y = Math.round(Math.random() * 100)
        const r = (1.2 + Math.random() * 3.4).toFixed(1)
        bg += `${i ? ',' : ''}radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.55) 0, rgba(190,225,255,0.35) ${r}vmin, transparent ${(+r + 0.4).toFixed(1)}vmin)`
      }
      drops.style.backgroundImage = bg
      drops.classList.remove('on')
      void drops.offsetWidth
      drops.classList.add('on')
    },
    // k 0..1+ speed (streaks + vignette), boost (warm edges), dark 0..1 (in the mine).
    speedFx(k, boost, dark = 0) {
      const sk = Math.min(1, k)
      speedFx.style.setProperty('--sk', sk.toFixed(3))
      speedFx.style.setProperty('--dk', Math.min(1, dark).toFixed(3))
      speedFx.classList.toggle('boost', !!boost)
      speedFx.classList.toggle('on', sk > 0.01 || dark > 0.01 || !!boost)
    },
    showCrash(on, seconds = 0, price = 0, affordable = true) {
      crash.classList.toggle('on', on)
      root.classList.toggle('crashed', on)
      if (!on) return
      count.textContent = String(Math.ceil(seconds))
      revive.querySelector('small').textContent = fmt(price)
      revive.disabled = !affordable
    },
    // items: [{ id, name, count, img }]; held: the id in hand (or null).
    setHotbar(items, held) {
      const key = items.map((it) => `${it.id}:${it.count}:${it.img ? 1 : 0}`).join(',')
      if (key !== hotbarKey) {
        hotbarKey = key
        for (const s of itemSlots) s.remove()
        itemSlots.length = 0
        items.forEach((it, i) => {
          const s = tap(el('button', 'slot item'), () => actions.hold(it.id))
          s.dataset.id = it.id
          s.innerHTML = `<i class="stroke">${i + 2}</i>${it.img ? `<img src="${it.img}" alt="">` : ''}<span class="nm stroke">${it.name}<br>[x${it.count}]</span>`
          hotbar.appendChild(s)
          itemSlots.push(s)
        })
      }
      for (const s of itemSlots) s.classList.toggle('held', s.dataset.id === held)
    },
    windowOpen: () => false,
  }
}
