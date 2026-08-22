/**
 * Barrel for the character system.
 *
 * `types` is the drawable phenotype, `dna` is the genotype and its generator,
 * `phenotype` expresses one into the other, and `quirks` is the layer that
 * makes some of them memorable. Renderers only ever need what is re-exported
 * here.
 */

export * from './types'
export * from './dna'
export * from './quirks'
export * from './phenotype'
export * from './archetypes'
