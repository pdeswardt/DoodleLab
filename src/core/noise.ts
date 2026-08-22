/**
 * Value noise + fBm.
 *
 * Used for three separate jobs: wobbling outlines so nothing looks
 * vector-perfect, modulating pencil pressure across a hatch fill, and building
 * the paper-grain tile that every pigment layer is filtered through.
 */

import { Rng } from './rng'

const TABLE_SIZE = 256
const TABLE_MASK = TABLE_SIZE - 1

export class Noise {
  private readonly perm: Uint8Array
  private readonly grad: Float32Array

  constructor(rng: Rng) {
    const p = new Uint8Array(TABLE_SIZE * 2)
    const base = new Uint8Array(TABLE_SIZE)
    for (let i = 0; i < TABLE_SIZE; i++) base[i] = i
    for (let i = TABLE_SIZE - 1; i > 0; i--) {
      const j = rng.int(0, i)
      const t = base[i]!
      base[i] = base[j]!
      base[j] = t
    }
    for (let i = 0; i < TABLE_SIZE * 2; i++) p[i] = base[i & TABLE_MASK]!
    this.perm = p

    const g = new Float32Array(TABLE_SIZE)
    for (let i = 0; i < TABLE_SIZE; i++) g[i] = rng.range(-1, 1)
    this.grad = g
  }

  private valueAt(ix: number, iy: number): number {
    const h = this.perm[(this.perm[ix & TABLE_MASK]! + (iy & TABLE_MASK)) & TABLE_MASK]!
    return this.grad[h]!
  }

  /** 2D value noise in roughly [-1, 1]. */
  at(x: number, y: number): number {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    // Quintic smoothstep keeps second derivatives continuous — no visible grid.
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    const a = this.valueAt(x0, y0)
    const b = this.valueAt(x0 + 1, y0)
    const c = this.valueAt(x0, y0 + 1)
    const d = this.valueAt(x0 + 1, y0 + 1)
    const top = a + (b - a) * u
    const bottom = c + (d - c) * u
    return top + (bottom - top) * v
  }

  /** 1D slice — handy for wobbling a path by arc length. */
  at1(t: number, lane = 0): number {
    return this.at(t, lane * 37.13 + 0.5)
  }

  /** Fractal Brownian motion: `octaves` layers of noise at halving amplitude. */
  fbm(x: number, y: number, octaves = 3, lacunarity = 2.03, gain = 0.5): number {
    let amp = 1
    let freq = 1
    let sum = 0
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.at(x * freq, y * freq)
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }
}

/** A single shared noise field for texture work that need not be per-character. */
export const sharedNoise = new Noise(new Rng('pencilfolk::paper-grain::v1'))
