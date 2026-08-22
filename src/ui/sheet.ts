/**
 * The sheet view.
 *
 * 256 pencil drawings is far too much work for one frame, so rendering is
 * chunked against a frame budget and the grid fills in visibly, row by row.
 * That is also nicer to watch than a spinner: you can see the population
 * arriving.
 */

import { ART, type Genome } from '../core/genome'
import { drawCharacter } from '../render/character'
import { makePaper } from '../render/pencil'
import { hsl, type Hsl } from '../core/color'

/** Device-pixel size of one thumbnail. Big enough to stay crisp when zoomed. */
const CELL_W = 208
const CELL_H = Math.round((CELL_W * ART.h) / ART.w)

/** Milliseconds of work per frame — leaves the UI responsive while drawing. */
const FRAME_BUDGET = 11

export interface SheetCallbacks {
  onSelect(index: number): void
  onProgress(done: number, total: number): void
  onDone(): void
}

export class SheetView {
  private readonly el: HTMLElement
  private readonly cb: SheetCallbacks
  private cells: HTMLCanvasElement[] = []
  private characters: Genome[] = []
  private queue: number[] = []
  private raf = 0
  private detail = 0.58
  private paper: Hsl = hsl(42, 32, 96)
  /** One paper tile, reused by every cell at a per-cell offset. */
  private paperTile: HTMLCanvasElement | null = null

  constructor(el: HTMLElement, cb: SheetCallbacks) {
    this.el = el
    this.cb = cb
    this.el.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell')
      if (cell?.dataset.index) this.cb.onSelect(Number(cell.dataset.index))
    })
  }

  /** Paper is a DOM background so the grid reads as one continuous sheet. */
  setPaper(tone: Hsl, seed: string): void {
    this.paper = tone
    // Generated at twice cell size so each cell can take a different window
    // out of it — the sheet then reads as one sheet of paper rather than 256
    // identical swatches.
    this.paperTile = makePaper(CELL_W * 2, CELL_H * 2, tone, seed)
    this.el.style.backgroundImage = `url(${makePaper(420, 420, tone, `${seed}-bg`).toDataURL('image/png')})`
  }

  setZoom(px: number): void {
    this.el.style.gridTemplateColumns = `repeat(${this.cols}, ${px}px)`
  }

  private cols = 16

  /** Rebuild the grid and start drawing into it. */
  render(characters: Genome[], cols: number, detail: number, zoom: number): void {
    this.cancel()
    this.characters = characters
    this.cols = cols
    this.detail = detail
    this.cells = []
    this.el.textContent = ''
    this.el.style.gridTemplateColumns = `repeat(${cols}, ${zoom}px)`

    const frag = document.createDocumentFragment()
    for (let i = 0; i < characters.length; i++) {
      const wrap = document.createElement('div')
      wrap.className = 'cell pending'
      wrap.dataset.index = String(i)
      wrap.title = characters[i]!.word

      const canvas = document.createElement('canvas')
      canvas.width = CELL_W
      canvas.height = CELL_H
      wrap.appendChild(canvas)
      frag.appendChild(wrap)
      this.cells.push(canvas)
    }
    this.el.appendChild(frag)

    this.queue = characters.map((_, i) => i)
    this.pump()
  }

  cancel(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.queue = []
  }

  canvasFor(index: number): HTMLCanvasElement | undefined {
    return this.cells[index]
  }

  private pump = (): void => {
    const start = performance.now()
    const total = this.characters.length
    while (this.queue.length > 0 && performance.now() - start < FRAME_BUDGET) {
      const i = this.queue.shift()!
      this.drawCell(i)
    }
    this.cb.onProgress(total - this.queue.length, total)
    if (this.queue.length > 0) {
      this.raf = requestAnimationFrame(this.pump)
    } else {
      this.raf = 0
      this.cb.onDone()
    }
  }

  private drawCell(i: number): void {
    const canvas = this.cells[i]
    const g = this.characters[i]
    if (!canvas || !g) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (this.paperTile) {
      const ox = (i * 53) % CELL_W
      const oy = (i * 89) % CELL_H
      ctx.drawImage(this.paperTile, ox, oy, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H)
    }
    ctx.save()
    ctx.scale(CELL_W / ART.w, CELL_H / ART.h)
    drawCharacter(ctx, g, { detail: this.detail, caption: true, paperTone: this.paper })
    ctx.restore()
    canvas.parentElement?.classList.remove('pending')
  }

  /** Redraw one cell in place, after a subsystem reroll. */
  replace(index: number, g: Genome): void {
    this.characters[index] = g
    this.drawCell(index)
  }
}
