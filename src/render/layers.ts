/**
 * Layered compositing with explicit occlusion.
 *
 * The drawing used to be built by painting parts onto one surface back to
 * front, and making the nearer ones opaque so they hid what was behind. That
 * has two costs. Pigment is translucent, so an opaque part needs a flat plate
 * of local colour underneath it — and a plate reads as a sticker, which is
 * exactly what a face looked like sitting on a hair mass. And nothing ever
 * knows what is in front of what, so nothing can cast a shadow onto anything.
 *
 * Here each part group is drawn into its own buffer as pigment on nothing.
 * Occlusion is then explicit: the region a nearer part occupies is *erased*
 * from the buffers behind it, so when everything is finally multiplied down
 * onto the paper, each part sits on bare paper rather than on its neighbours.
 * No plates, no stickers, and the paper shows through the pigment everywhere,
 * which is the whole point of the medium.
 *
 * The same silhouettes then give cast shadow for free: offset a region, soften
 * it, and multiply it into the buffer of whatever sits behind.
 */

import type { Pt } from './shapes'
import { tracePath } from './shapes'

/** Reused between characters — allocating six canvases per cell is not free. */
const pool: { w: number; h: number; free: HTMLCanvasElement[] } = { w: 0, h: 0, free: [] }

function take(w: number, h: number): HTMLCanvasElement {
  if (pool.w !== w || pool.h !== h) {
    pool.w = w
    pool.h = h
    pool.free = []
  }
  const c = pool.free.pop() ?? document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function give(c: HTMLCanvasElement): void {
  if (pool.free.length < 12) pool.free.push(c)
}

export interface LayerHandle {
  name: string
  ctx: CanvasRenderingContext2D
}

export class LayerStack {
  private readonly order: string[]
  private readonly buffers = new Map<string, HTMLCanvasElement>()
  private readonly contexts = new Map<string, CanvasRenderingContext2D>()
  private readonly w: number
  private readonly h: number
  private readonly scale: number

  /**
   * @param artW  width in art units
   * @param artH  height in art units
   * @param scale device pixels per art unit, taken from the target transform
   */
  constructor(order: string[], artW: number, artH: number, scale: number) {
    this.order = order
    this.scale = scale
    this.w = Math.max(1, Math.round(artW * scale))
    this.h = Math.max(1, Math.round(artH * scale))

    for (const name of order) {
      const canvas = take(this.w, this.h)
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, this.w, this.h)
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      // Within a layer, pigment still behaves as pigment.
      ctx.globalCompositeOperation = 'multiply'
      this.buffers.set(name, canvas)
      this.contexts.set(name, ctx)
    }
  }

  ctx(name: string): CanvasRenderingContext2D {
    const c = this.contexts.get(name)
    if (!c) throw new Error(`no layer "${name}"`)
    return c
  }

  /**
   * Erase `region` from every layer behind `name`.
   *
   * This is the occlusion step: the nearer part does not cover what is behind
   * it, it removes it, so the nearer part can then be drawn translucently onto
   * bare paper.
   */
  occlude(name: string, region: readonly Pt[], smooth = true): void {
    if (region.length < 3) return
    const from = this.order.indexOf(name)
    if (from < 0) return
    for (let i = 0; i < from; i++) {
      const ctx = this.ctx(this.order[i]!)
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      tracePath(ctx, region, true, smooth)
      ctx.fillStyle = '#000'
      ctx.fill()
      ctx.restore()
    }
  }

  /**
   * Drop a soft shadow of `region` onto the layer named `onto`.
   *
   * What makes a head sit on a body rather than hover in front of it. The
   * offset follows the key light; the blur keeps it from reading as a second
   * copy of the shape.
   */
  castShadow(
    onto: string, region: readonly Pt[],
    dx: number, dy: number, blur: number, alpha: number, tint = '#6b5a49',
  ): void {
    if (region.length < 3 || alpha <= 0.01) return
    const ctx = this.contexts.get(onto)
    if (!ctx) return
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = alpha
    // `filter` is the only cheap blur available here; if the browser lacks it
    // the shadow simply lands hard-edged rather than not at all.
    try {
      ctx.filter = `blur(${blur}px)`
    } catch {
      /* hard-edged fallback */
    }
    ctx.translate(dx, dy)
    tracePath(ctx, region, true)
    ctx.fillStyle = tint
    ctx.fill()
    ctx.restore()
  }

  /** Multiply every layer, back to front, onto the target. */
  flush(target: CanvasRenderingContext2D, artW: number, artH: number): void {
    target.save()
    target.globalCompositeOperation = 'multiply'
    for (const name of this.order) {
      const canvas = this.buffers.get(name)
      if (canvas) target.drawImage(canvas, 0, 0, artW, artH)
    }
    target.restore()
    for (const canvas of this.buffers.values()) give(canvas)
    this.buffers.clear()
    this.contexts.clear()
  }

  get pixelScale(): number {
    return this.scale
  }
}
