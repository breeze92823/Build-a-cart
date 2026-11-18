// In-browser player tests (dev server only). Open the game with ?tests to get the panel, or
// ?tests=run to start straight away (&suite=<name part> picks suites, &speed=watch plays them in
// real time). The tests press real keys, hold E at real prompts and click the real menu buttons,
// stepping the game frame by frame, then put your own save back. window.__tests.run() does the same
// from the console and resolves with the report.
import { setSavePaused } from '../net.js'
import { AbortRun, createHarness, createT } from './harness.js'
import world from './suites/world.js'
import upgrades from './suites/upgrades.js'
import shop from './suites/shop.js'
import ride from './suites/ride.js'
import meta from './suites/meta.js'
import campaign from './suites/campaign.js'
import multiplayer from './suites/multiplayer.js'

const SUITES = [world, upgrades, shop, ride, meta, multiplayer, campaign]
const STYLE = `
#dt{position:fixed;right:8px;top:8px;z-index:2147483000;width:min(430px,94vw);max-height:calc(100dvh - 16px);display:flex;flex-direction:column;font:12px/1.35 system-ui,Segoe UI,sans-serif;color:#e8edf7;background:rgba(14,20,36,.94);border:1px solid #3a4a72;border-radius:10px;box-shadow:0 6px 30px rgba(0,0,0,.5);pointer-events:auto;user-select:text}
#dt *{box-sizing:border-box}
#dt.min{width:auto}#dt.min .dt-body,#dt.min .dt-head span{display:none}
#dt .dt-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #2b3a5e;font-weight:700;font-size:13px}
#dt .dt-head span{flex:1}
#dt button{font:inherit;color:#fff;background:#2f4a86;border:0;border-radius:6px;padding:5px 9px;cursor:pointer;min-height:28px}
#dt button:hover{background:#3d5fae}#dt button:disabled{opacity:.45;cursor:default}
#dt button.go{background:#1f9d55}#dt button.go:hover{background:#27b866}#dt button.stop{background:#b53a3a}
#dt .dt-bar{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px}
#dt .dt-prog{height:6px;background:#26324f;margin:0 10px;border-radius:3px;overflow:hidden}
#dt .dt-prog i{display:block;height:100%;width:0;background:#3fa8ff;transition:width .15s}
#dt .dt-prog i.bad{background:#e5484d}#dt .dt-prog i.good{background:#30c06a}
#dt .dt-sum{padding:6px 10px 2px;font-weight:600}
#dt .dt-now{padding:0 10px 6px;color:#9fb3d9;min-height:1.4em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#dt .dt-list{overflow:auto;padding:0 6px 8px;flex:1;min-height:60px}
#dt .dt-suite{margin:8px 4px 2px;display:flex;align-items:center;gap:6px;color:#8fa6d6;font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:11px}
#dt .dt-suite span{flex:1}
#dt .dt-suite button{padding:1px 7px;min-height:20px;font-size:11px}
#dt .dt-test{border-radius:6px}
#dt .dt-row{display:flex;gap:7px;align-items:flex-start;padding:4px 6px;cursor:pointer;border-radius:6px}
#dt .dt-row:hover{background:#1c2744}
#dt .dt-ic{width:16px;text-align:center;flex:none;font-weight:700}
#dt .dt-nm{flex:1}#dt .dt-ms{color:#7f93bd;flex:none;font-variant-numeric:tabular-nums}
#dt .pending .dt-ic{color:#6b7da6}#dt .pass .dt-ic{color:#30c06a}#dt .fail .dt-ic,#dt .error .dt-ic{color:#ff6b6b}
#dt .running .dt-ic{color:#ffd23a;animation:dtp .8s infinite}#dt .stopped .dt-ic{color:#ffb35a}
@keyframes dtp{50%{opacity:.25}}
#dt .dt-run{flex:none;padding:0 6px;min-height:20px;font-size:11px;background:#25365f}
#dt .dt-det{display:none;margin:0 6px 6px 29px;padding:6px 8px;background:#0d1426;border-radius:6px;max-height:260px;overflow:auto;font-size:11.5px}
#dt .dt-test.open .dt-det{display:block}
#dt .dt-det div{padding:1px 0;word-break:break-word}
#dt .dt-det .pass{color:#7de3a1}#dt .dt-det .fail{color:#ff8f8f;font-weight:600}#dt .dt-det .step{color:#8fa6d6}#dt .dt-det .info{color:#c9d3ea}
#dt select{font:inherit;background:#1b2745;color:#fff;border:1px solid #3a4a72;border-radius:6px;padding:4px}
`

export function installTests({ game, loop, params }) {
  const S = game.S
  const tests = []
  for (const suite of SUITES) for (const test of suite.tests) tests.push({ suite: suite.name, timeout: 90000, ...test, status: 'pending', log: [], ms: 0 })
  // Last, so it sees every error the run produced.
  const errors = []
  tests.push({
    suite: 'Health',
    name: 'No script errors or failed promises during the whole run',
    status: 'pending',
    log: [],
    ms: 0,
    timeout: 5000,
    async fn(t) {
      t.ok(errors.length === 0, errors.length ? `${errors.length} error(s): ${errors.slice(0, 5).join(' | ')}` : 'console stayed free of errors')
    },
  })

  // --- Panel -----------------------------------------------------------------------------------
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)
  const root = document.createElement('div')
  root.id = 'dt'
  root.innerHTML = `
    <div class="dt-head"><span>🧪 Build a Cart · player tests</span><button class="dt-min" title="Collapse">–</button></div>
    <div class="dt-body" style="display:flex;flex-direction:column;min-height:0">
      <div class="dt-bar">
        <button class="go dt-all">▶ Run all</button>
        <button class="dt-failed" disabled>↻ Failed only</button>
        <button class="stop dt-stop" disabled>■ Stop</button>
        <select class="dt-speed" title="Fast: steps the game as fast as it can. Watch: real time, every frame drawn."><option value="fast">Fast</option><option value="watch">Watch (real time)</option></select>
        <button class="dt-copy">Copy report</button>
      </div>
      <div class="dt-prog"><i></i></div>
      <div class="dt-sum">Not run yet · ${tests.length} tests</div>
      <div class="dt-now"></div>
      <div class="dt-list"></div>
    </div>`
  document.body.appendChild(root)
  const q = (s) => root.querySelector(s)
  const listEl = q('.dt-list')
  const nowEl = q('.dt-now')
  const sumEl = q('.dt-sum')
  const bar = q('.dt-prog i')
  const btnAll = q('.dt-all')
  const btnFailed = q('.dt-failed')
  const btnStop = q('.dt-stop')
  const speedSel = q('.dt-speed')
  let running = false

  const ICON = { pending: '○', running: '●', pass: '✓', fail: '✗', error: '!', stopped: '■' }
  let lastSuite = ''
  for (const test of tests) {
    if (test.suite !== lastSuite) {
      lastSuite = test.suite
      const head = document.createElement('div')
      head.className = 'dt-suite'
      head.innerHTML = `<span>${test.suite}</span><button>▶ suite</button>`
      head.querySelector('button').onclick = () => start(tests.filter((x) => x.suite === head.firstChild.textContent))
      listEl.appendChild(head)
    }
    const el = document.createElement('div')
    el.className = 'dt-test'
    el.innerHTML = `<div class="dt-row pending"><span class="dt-ic">○</span><span class="dt-nm"></span><span class="dt-ms"></span><button class="dt-run" title="Run this test">▶</button></div><div class="dt-det"></div>`
    el.querySelector('.dt-nm').textContent = test.name
    el.querySelector('.dt-row').onclick = (e) => {
      if (e.target.closest('.dt-run')) return
      el.classList.toggle('open')
    }
    el.querySelector('.dt-run').onclick = () => start([test])
    test.el = el
    listEl.appendChild(el)
  }
  q('.dt-min').onclick = () => {
    root.classList.toggle('min')
    q('.dt-min').textContent = root.classList.contains('min') ? '🧪' : '–'
  }

  function paint(test) {
    const row = test.el.querySelector('.dt-row')
    row.className = `dt-row ${test.status}`
    row.querySelector('.dt-ic').textContent = ICON[test.status]
    row.querySelector('.dt-ms').textContent = test.ms ? `${(test.ms / 1000).toFixed(1)}s` : ''
    const det = test.el.querySelector('.dt-det')
    det.replaceChildren(
      ...test.log.slice(-400).map((l) => {
        const d = document.createElement('div')
        d.className = l.kind
        d.textContent = `${l.kind === 'pass' ? '✓' : l.kind === 'fail' ? '✗' : l.kind === 'step' ? '›' : '·'} ${l.msg}`
        return d
      }),
    )
    det.scrollTop = det.scrollHeight
    if (test.status === 'fail' || test.status === 'error') test.el.classList.add('open')
  }
  function summary(done) {
    const c = { pass: 0, fail: 0, error: 0, pending: 0, running: 0, stopped: 0 }
    for (const t of tests) c[t.status]++
    const finished = c.pass + c.fail + c.error
    const total = tests.length
    const bad = c.fail + c.error
    sumEl.innerHTML = `${c.pass} passed · <span style="color:${bad ? '#ff6b6b' : 'inherit'}">${bad} failed</span> · ${total - finished} to go${done ? (bad ? ' — <b style="color:#ff6b6b">SOME TESTS FAILED</b>' : ' — <b style="color:#30c06a">ALL PASSED</b>') : ''}`
    bar.style.width = `${(finished / total) * 100}%`
    bar.className = bad ? 'bad' : finished === total ? 'good' : ''
    btnFailed.disabled = running || !bad
  }
  summary(false)

  // --- Running ---

  let h = null
  let current = null
  const origError = console.error
  const onWinError = (e) => errors.push(String(e.message || e.error || e))
  const onRejection = (e) => errors.push(`unhandled promise: ${String(e.reason?.message ?? e.reason)}`)
  // Noise that is not the game's fault (blocked fonts / SDK, no backend running).
  const benign = (s) => /Failed to load resource|fonts\.g|net::ERR|WebSocket|sdk\.bloxity|favicon|AudioContext|autoplay/i.test(s)

  async function start(list) {
    if (running) return
    running = true
    for (const t of list) {
      t.status = 'pending'
      t.log = []
      t.ms = 0
      paint(t)
    }
    errors.length = 0
    btnAll.disabled = btnFailed.disabled = true
    btnStop.disabled = false
    root.querySelectorAll('.dt-run').forEach((b) => (b.disabled = true))
    h = createHarness({ game })
    h.speed = speedSel.value
    // Throw-away save: the player's own progress is backed up and put back at the end.
    const backup = S.snapshot()
    const here = { x: game.player.position.x, y: game.player.position.y, z: game.player.position.z, facing: game.player.facing }
    setSavePaused(true)
    game.renderer.setAnimationLoop(null)
    console.error = (...a) => {
      const s = a.map((x) => (x instanceof Error ? x.message : typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')
      if (!benign(s)) errors.push(s)
      origError.apply(console, a)
    }
    window.addEventListener('error', onWinError)
    window.addEventListener('unhandledrejection', onRejection)
    try {
      for (const test of list) {
        if (h.aborted) {
          test.status = 'stopped'
          paint(test)
          continue
        }
        current = test
        test.status = 'running'
        paint(test)
        test.el.scrollIntoView({ block: 'nearest' })
        const t0 = performance.now()
        const t = createT((rec) => {
          test.log.push(rec)
          if (rec.kind === 'step') nowEl.textContent = rec.msg
          paint(test)
          summary(false)
        }, h)
        h.setDeadline(test.timeout)
        nowEl.textContent = test.name
        let thrown = null
        try {
          await test.fn(t)
        } catch (e) {
          thrown = e
        }
        test.ms = performance.now() - t0
        if (thrown instanceof AbortRun) test.status = 'stopped'
        else if (thrown) {
          test.status = 'error'
          test.log.push({ kind: 'fail', msg: `exception: ${thrown.message}` })
          console.warn('[tests]', test.name, thrown)
        } else test.status = test.log.some((l) => l.kind === 'fail') ? 'fail' : test.log.some((l) => l.kind === 'pass') ? 'pass' : 'fail'
        if (test.status === 'fail' && !test.log.some((l) => l.kind === 'fail')) test.log.push({ kind: 'fail', msg: 'the test made no assertions' })
        paint(test)
        summary(false)
        try {
          h.setDeadline(20000)
          h.releaseAll()
          await h.closeWin()
          if (game.ride.mode === 'crashed') game.ride.restart()
          else if (game.ride.riding) game.ride.launchOrReturn()
        } catch {
          // best effort
        }
      }
    } finally {
      h.releaseAll()
      try {
        if (game.W.isWindowOpen()) game.W.closeWindow()
        if (game.ride.mode === 'crashed') game.ride.restart()
        else if (game.ride.riding) game.ride.launchOrReturn()
        if (game.carry.held) game.carry.hold(game.carry.held)
      } catch {
        // best effort
      }
      game.events.force = null
      S.hydrate(backup)
      setSavePaused(false)
      game.teleport(here.x, here.y, here.z, here.facing)
      console.error = origError
      window.removeEventListener('error', onWinError)
      window.removeEventListener('unhandledrejection', onRejection)
      game.renderer.setAnimationLoop(loop)
      running = false
      current = null
      btnAll.disabled = false
      btnStop.disabled = true
      root.querySelectorAll('.dt-run').forEach((b) => (b.disabled = false))
      nowEl.textContent = h.aborted ? 'Stopped. Your own save was put back.' : 'Done. Your own save was put back.'
      summary(true)
      h = null
    }
    return report()
  }

  function report() {
    const out = tests.map((t) => ({ suite: t.suite, name: t.name, status: t.status, seconds: +(t.ms / 1000).toFixed(1), log: t.log.map((l) => `${l.kind}: ${l.msg}`) }))
    const failed = out.filter((t) => t.status === 'fail' || t.status === 'error')
    return { passed: out.filter((t) => t.status === 'pass').length, failed: failed.length, total: out.length, failures: failed, tests: out }
  }
  const textReport = () => {
    const r = report()
    const lines = [`Build a Cart player tests: ${r.passed}/${r.total} passed, ${r.failed} failed`]
    for (const t of r.tests) {
      lines.push(`${t.status === 'pass' ? 'PASS' : t.status.toUpperCase()}  [${t.suite}] ${t.name} (${t.seconds}s)`)
      if (t.status !== 'pass') for (const l of t.log.filter((x) => !x.startsWith('pass:') && !x.startsWith('step:'))) lines.push(`        ${l}`)
    }
    return lines.join('\n')
  }

  btnAll.onclick = () => start(tests)
  btnFailed.onclick = () => start(tests.filter((t) => t.status === 'fail' || t.status === 'error'))
  btnStop.onclick = () => {
    if (h) h.aborted = true
  }
  q('.dt-copy').onclick = async () => {
    const text = textReport()
    try {
      await navigator.clipboard.writeText(text)
      nowEl.textContent = 'Report copied to the clipboard.'
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      nowEl.textContent = 'Report copied.'
    }
  }
  // Keys typed after clicking a panel button must still reach the game, not re-press the button.
  root.addEventListener('click', (e) => e.target instanceof HTMLButtonElement && e.target.blur())

  window.__tests = {
    run: (filter) => start(filter ? tests.filter((t) => `${t.suite} ${t.name}`.toLowerCase().includes(String(filter).toLowerCase())) : tests),
    report,
    text: textReport,
    list: () => tests.map((t) => `[${t.suite}] ${t.name}`),
    setSpeed: (s) => (speedSel.value = s),
  }

  const mode = params.get('tests')
  if (params.get('speed') === 'watch') speedSel.value = 'watch'
  if (mode === '' || mode === null || mode === '1' || mode === 'run') {
    if (mode === 'run') {
      const only = params.get('suite')
      setTimeout(() => start(only ? tests.filter((t) => t.suite.toLowerCase().includes(only.toLowerCase())) : tests), 1500)
    }
  }
  // Without ?tests the panel stays out of the way: a small tab you can open.
  if (mode === null) {
    root.classList.add('min')
    q('.dt-min').textContent = '🧪'
  }
}
