/**
 * Application shell: state, controls, and the inspector.
 *
 * The whole app is a pure function of (seed, controls, locks, generation) ->
 * sheet. Nothing here holds hidden state that would stop a seed from
 * reproducing a sheet exactly, which is the guarantee the rest of the system
 * is built on.
 */

import './styles.css'
import { randomSeed } from './core/rng'
import { MOODS, moodById, css, type Mood } from './core/color'
import {
  DEFAULT_CONTROLS, SUBSYSTEMS, decodeDNA, encodeDNA, generateDNA,
  type Controls, type Locks, type Subsystem,
} from './core/dna'
import { express, describe } from './core/phenotype'
import { generateSheet, type SheetStats } from './core/population'
import { WordBag } from './core/words'
import type { Genome } from './core/types'
import { ART } from './core/types'
import { drawCharacter } from './render/character'
import { makePaper } from './render/pencil'
import { SheetView } from './ui/sheet'
import { exportCharacter, exportSheet } from './ui/exporter'

/* ------------------------------------------------------------------ state */

interface State {
  seed: string
  cols: number
  detail: number
  controls: Controls
  locks: Locks
  mood: Mood
  characters: Genome[]
  stats: SheetStats | null
  selected: number | null
}

const state: State = {
  seed: randomSeed(),
  cols: 16,
  detail: 0.58,
  controls: { ...DEFAULT_CONTROLS },
  locks: {},
  mood: MOODS[0]!,
  characters: [],
  stats: null,
  selected: null,
}

/** How many times each cell has been hand-rerolled, so clicks keep changing. */
const rerollCounts = new Map<string, number>()

const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel) ?? (() => { throw new Error(`missing ${sel}`) })()

const seedInput = $<HTMLInputElement>('#seed')
const moodSelect = $<HTMLSelectElement>('#mood')
const gridSelect = $<HTMLSelectElement>('#grid')
const qualitySelect = $<HTMLSelectElement>('#quality')
const zoomInput = $<HTMLInputElement>('#zoom')
const progressEl = $<HTMLElement>('#progress')
const progressBar = $<HTMLElement>('.progress-bar span')
const progressLabel = $<HTMLElement>('.progress-label')
const statsEl = $<HTMLElement>('#stats')
const studioEl = $<HTMLElement>('#studio')
const toastEl = $<HTMLElement>('#toast')

/* ------------------------------------------------------------------ toast */

let toastTimer = 0
function toast(message: string): void {
  toastEl.textContent = message
  toastEl.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastEl.hidden = true }, 2200)
}

/* ------------------------------------------------------------------ sheet */

const PENCIL_LINES = [
  'Sharpening pencils…',
  'Deciding who wears what…',
  'Handing out quirks, sparingly…',
  'Checking nobody is a twin…',
  'Blocking in the background wash…',
  'Laying the tooth of the paper…',
]

const sheet = new SheetView($<HTMLElement>('#sheet'), {
  onSelect: (i) => openInspector(i),
  onProgress: (done, total) => {
    progressBar.style.width = `${(done / total) * 100}%`
  },
  onDone: () => { progressEl.hidden = true },
})

function draw(): void {
  const t0 = performance.now()
  progressEl.hidden = false
  progressBar.style.width = '0%'
  progressLabel.textContent = PENCIL_LINES[Math.floor(Math.random() * PENCIL_LINES.length)]!

  const count = state.cols * state.cols
  const result = generateSheet({
    seed: state.seed,
    count,
    controls: state.controls,
    mood: state.mood,
    locks: state.locks,
  })
  state.characters = result.characters
  state.stats = result.stats
  rerollCounts.clear()

  sheet.setPaper(state.mood.paper, state.seed)
  sheet.render(state.characters, state.cols, state.detail, Number(zoomInput.value))
  renderStats(result.stats, performance.now() - t0)
}

function renderStats(stats: SheetStats, genMs: number): void {
  const total = state.characters.length
  const top = Object.entries(stats.archetypes).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const pct = (n: number): string => `${Math.round((n / total) * 100)}%`
  const swatches = state.characters
    .slice(0, 8)
    .map((g) => `<i class="stat-swatch" style="background:${css(g.palette.garment)}"></i>`)
    .join('')

  statsEl.innerHTML = [
    `<span class="stat"><b>${total}</b> people</span>`,
    `<span class="stat">quirks: <b>${pct(stats.quirkCounts[0]!)}</b> none · <b>${pct(stats.quirkCounts[1]!)}</b> one · <b>${pct(stats.quirkCounts[2]!)}</b> two · <b>${pct(stats.quirkCounts[3]!)}</b> three</span>`,
    `<span class="stat">mean age <b>${stats.ageMean.toFixed(0)}</b></span>`,
    `<span class="stat">roles: ${top.map(([k, v]) => `<b>${k}</b> ${v}`).join(' · ')}</span>`,
    `<span class="stat"><b>${stats.reroots}</b> anti-clone rerolls</span>`,
    `<span class="stat">genome in <b>${genMs.toFixed(0)}ms</b><span class="stat-swatches">${swatches}</span></span>`,
  ].join('')
}

/* -------------------------------------------------------------- inspector */

const inspectorEl = $<HTMLElement>('#inspector')
const inspectorCanvas = $<HTMLCanvasElement>('#inspector-canvas')
const dnaText = $<HTMLTextAreaElement>('#dna-text')

function openInspector(index: number): void {
  const g = state.characters[index]
  if (!g) return
  state.selected = index
  inspectorEl.hidden = false
  paintInspector(g)
}

function paintInspector(g: Genome): void {
  const ctx = inspectorCanvas.getContext('2d')
  if (ctx) {
    const scale = inspectorCanvas.width / ART.w
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, inspectorCanvas.width, inspectorCanvas.height)
    ctx.drawImage(
      makePaper(inspectorCanvas.width, inspectorCanvas.height, state.mood.paper, `${g.seed}-${g.index}`),
      0, 0,
    )
    ctx.scale(scale, scale)
    drawCharacter(ctx, g, { detail: 1.15, caption: true, paperTone: state.mood.paper })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  $<HTMLElement>('#inspector-word').textContent = g.word
  $<HTMLElement>('#inspector-sub').textContent =
    `${g.archetypeName} · ${g.role} · seed ${g.seed} #${g.index} · ${g.dna.fingerprint}`

  const quirksEl = $<HTMLElement>('#inspector-quirks')
  quirksEl.innerHTML = g.quirks.length === 0
    ? '<p class="quirks-empty">No quirk — one of the ordinary majority.</p>'
    : g.quirks.map((q) =>
      `<div class="quirk"><span class="tier" data-tier="${q.tier}">${q.tier}</span><span>${q.label}<em style="color:var(--ink-faint)"> — ${q.category}, ${q.persistence}</em></span></div>`,
    ).join('')

  $<HTMLElement>('#inspector-rows').innerHTML = describe(g)
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('')

  dnaText.value = encodeDNA(g.dna)
}

/** Reroll exactly one subsystem, holding everything else in place. */
function rerollSubsystem(sub: Subsystem): void {
  const index = state.selected
  if (index === null) return
  const current = state.characters[index]
  if (!current) return

  const locks: Locks = {}
  for (const s of SUBSYSTEMS) locks[s] = s !== sub

  const key = `${index}:${sub}`
  const n = (rerollCounts.get(key) ?? 0) + 1
  rerollCounts.set(key, n)

  const dna = generateDNA(state.seed, index, {
    controls: state.controls,
    mood: state.mood,
    locks,
    base: current.dna,
    generation: n * 17 + 3,
  })

  const next = express(dna, { mood: state.mood, words: new WordBag() })
  // The caption belongs to the person, not to the subsystem being rerolled.
  next.word = current.word
  next.wordPool = current.wordPool

  state.characters[index] = next
  sheet.replace(index, next)
  paintInspector(next)
  toast(`Rerolled ${sub}`)
}

function closeInspector(): void {
  inspectorEl.hidden = true
  state.selected = null
}

/* ---------------------------------------------------------------- controls */

function buildMoodOptions(): void {
  moodSelect.innerHTML = MOODS
    .map((m) => `<option value="${m.id}">${m.name} — ${m.blurb}</option>`)
    .join('')
  moodSelect.value = state.mood.id
}

function buildLockChips(): void {
  const el = $<HTMLElement>('#locks')
  el.innerHTML = SUBSYSTEMS
    .map((s) => `<button class="chip" data-lock="${s}" aria-pressed="false">${s}</button>`)
    .join('')
  el.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-lock]')
    if (!btn) return
    const key = btn.dataset.lock as Subsystem
    const on = !state.locks[key]
    state.locks[key] = on
    btn.setAttribute('aria-pressed', String(on))
  })
}

function bindSliders(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.slider')) {
    const key = el.dataset.key as keyof Controls
    const input = el.querySelector<HTMLInputElement>('input')!
    const out = el.querySelector<HTMLOutputElement>('output')!
    const show = (): void => {
      const v = Number(input.value)
      out.textContent = input.step === '1' ? String(v) : v.toFixed(2)
    }
    show()
    input.addEventListener('input', () => {
      ;(state.controls[key] as number) = Number(input.value)
      show()
    })
  }
}

function bindBar(): void {
  seedInput.value = state.seed
  seedInput.addEventListener('change', () => {
    state.seed = seedInput.value.trim() || randomSeed()
    seedInput.value = state.seed
    draw()
  })

  $('#dice').addEventListener('click', () => {
    state.seed = randomSeed()
    seedInput.value = state.seed
    draw()
  })

  moodSelect.addEventListener('change', () => {
    state.mood = moodById(moodSelect.value)
    state.controls.moodId = state.mood.id
    draw()
  })

  gridSelect.addEventListener('change', () => {
    state.cols = Number(gridSelect.value)
    draw()
  })

  qualitySelect.addEventListener('change', () => {
    state.detail = Number(qualitySelect.value)
    draw()
  })

  zoomInput.addEventListener('input', () => sheet.setZoom(Number(zoomInput.value)))

  $('#draw').addEventListener('click', () => draw())

  $('#studio-toggle').addEventListener('click', () => {
    studioEl.hidden = !studioEl.hidden
  })

  $('#export').addEventListener('click', async () => {
    progressEl.hidden = false
    progressLabel.textContent = 'Pressing the full-size sheet…'
    progressBar.style.width = '0%'
    try {
      await exportSheet({
        characters: state.characters,
        cols: state.cols,
        seed: state.seed,
        paperTone: state.mood.paper,
        scale: 1,
        onProgress: (done, total) => { progressBar.style.width = `${(done / total) * 100}%` },
      })
      toast('Sheet saved')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed')
    } finally {
      progressEl.hidden = true
    }
  })
}

function bindInspector(): void {
  $('#inspector-close').addEventListener('click', closeInspector)
  inspectorEl.addEventListener('click', (e) => {
    if (e.target === inspectorEl) closeInspector()
  })

  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-reroll]')) {
    btn.addEventListener('click', () => rerollSubsystem(btn.dataset.reroll as Subsystem))
  }

  $('#download-one').addEventListener('click', () => {
    const g = state.selected !== null ? state.characters[state.selected] : null
    if (g) {
      exportCharacter(g, state.mood.paper)
      toast('Portrait saved')
    }
  })

  $('#copy-dna').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(dnaText.value)
      toast('DNA copied')
    } catch {
      dnaText.select()
      toast('Select and copy')
    }
  })

  $('#load-dna').addEventListener('click', () => {
    const index = state.selected
    if (index === null) return
    const dna = decodeDNA(dnaText.value)
    if (!dna) {
      toast('That DNA could not be read')
      return
    }
    const g = express({ ...dna, index }, { mood: state.mood, words: new WordBag() })
    state.characters[index] = g
    sheet.replace(index, g)
    paintInspector(g)
    toast('DNA loaded into this slot')
  })

  $('#quirks-on').addEventListener('change', (e) => {
    state.controls.quirksEnabled = (e.target as HTMLInputElement).checked
  })
}

function bindKeys(): void {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'Escape') closeInspector()
    if (e.key === 'r' || e.key === 'R') {
      state.seed = randomSeed()
      seedInput.value = state.seed
      draw()
    }
    if (state.selected !== null && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? state.cols : -state.cols
      const next = state.selected + step
      if (next >= 0 && next < state.characters.length) openInspector(next)
    }
  })
}

/* ------------------------------------------------------------------- boot */

async function boot(): Promise<void> {
  buildMoodOptions()
  buildLockChips()
  bindSliders()
  bindBar()
  bindInspector()
  bindKeys()

  // Captions are drawn into a canvas, so the handwriting face has to be
  // resident before the first character is rendered.
  try {
    await document.fonts.load('700 26px Caveat')
    await document.fonts.ready
  } catch {
    // A fallback face is fine; the drawing does not depend on it.
  }

  draw()
}

void boot()
