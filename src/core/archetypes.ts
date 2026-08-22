/**
 * The archetype and role tables.
 *
 * The reference is one member of a population: a soft-edged, warm, coloured-
 * pencil storybook person, drawn from the chest up with an oversized head, a
 * plain everyday garment, and a pale wash behind them. That reading is written
 * down in ARCHETYPE.md; this file is the machine-readable half of it.
 *
 * An archetype is a *bias*, never a rule. Every archetype can produce any hair,
 * any collar and any quirk — it just makes some of them likelier, which is what
 * lets a sheet of 256 read as one world without any two people matching.
 */

import type { CollarStyle, HatStyle, LidStyle, MouthStyle } from './types'
import type { WordPool } from './words'

export interface Role {
  id: string
  name: string
  /** Multiplier on the archetype's default weathering. */
  exposure: number
  /** Nudge to the age distribution, -1 younger .. 1 older. */
  ageBias: number
}

export interface Archetype {
  id: string
  name: string
  pool: WordPool
  collars: CollarStyle[]
  hats: HatStyle[]
  hair: string[]
  /** Quirk ids this role makes markedly likelier (on top of quirk-side bias). */
  quirks: string[]
  /** Hue band clothing pulls toward, when the mood allows it. */
  hue?: [number, number]
  /** Baseline environmental exposure, 0..1 — drives grime and wear. */
  exposure: number
  /** Expression bias. */
  lids: LidStyle[]
  mouths: MouthStyle[]
  roles: Role[]
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'botanist', name: 'Botanist', pool: 'green',
    collars: ['apron', 'buttonup', 'overalls'], hats: ['sunhat', 'band', 'kerchief', 'none'],
    hair: ['bun', 'curls', 'braids', 'fringe'], quirks: ['sprout', 'leaf', 'snail', 'flower'],
    hue: [80, 150], exposure: 0.75,
    lids: ['open', 'half'], mouths: ['smile', 'flat'],
    roles: [
      { id: 'nursery-hand', name: 'nursery hand', exposure: 1.1, ageBias: -0.3 },
      { id: 'seed-librarian', name: 'seed librarian', exposure: 0.5, ageBias: 0.3 },
      { id: 'orchard-keeper', name: 'orchard keeper', exposure: 1.25, ageBias: 0.2 },
      { id: 'glasshouse-warden', name: 'glasshouse warden', exposure: 0.8, ageBias: 0 },
    ],
  },
  {
    id: 'sailor', name: 'Sailor', pool: 'salty',
    collars: ['sailor', 'crew', 'turtleneck'], hats: ['cap', 'kerchief', 'boat', 'none'],
    hair: ['buzz', 'swoop', 'waves', 'bald'], quirks: ['bird', 'star', 'thread', 'goggles-up'],
    hue: [185, 235], exposure: 0.95,
    lids: ['squint', 'open'], mouths: ['smirk', 'whistle', 'flat'],
    roles: [
      { id: 'deckhand', name: 'deckhand', exposure: 1.2, ageBias: -0.4 },
      { id: 'net-mender', name: 'net mender', exposure: 0.9, ageBias: 0.4 },
      { id: 'harbour-pilot', name: 'harbour pilot', exposure: 0.8, ageBias: 0.5 },
      { id: 'lamp-keeper', name: 'lamp keeper', exposure: 0.7, ageBias: 0.3 },
    ],
  },
  {
    id: 'tinkerer', name: 'Tinkerer', pool: 'clever',
    collars: ['overalls', 'buttonup', 'hoodie'], hats: ['band', 'cap', 'none'],
    hair: ['wild', 'topknot', 'buzz', 'swoop'],
    quirks: ['pencil', 'antenna', 'ink-smudge', 'ear-defenders', 'goggles-up'],
    exposure: 0.7,
    lids: ['squint', 'wide'], mouths: ['flat', 'smirk', 'ohh'],
    roles: [
      { id: 'clockmender', name: 'clockmender', exposure: 0.5, ageBias: 0.3 },
      { id: 'bellows-wright', name: 'bellows-wright', exposure: 1.1, ageBias: 0.1 },
      { id: 'apprentice', name: 'apprentice', exposure: 1, ageBias: -0.8 },
      { id: 'wire-splicer', name: 'wire splicer', exposure: 0.9, ageBias: 0 },
    ],
  },
  {
    id: 'baker', name: 'Baker', pool: 'sweet',
    collars: ['apron', 'buttonup', 'ruffle'], hats: ['kerchief', 'band', 'none'],
    hair: ['bun', 'bob', 'curls', 'pigtails'], quirks: ['steam', 'freckle-storm', 'mole', 'patched'],
    hue: [340, 380], exposure: 0.45,
    lids: ['open', 'sparkle'], mouths: ['grin', 'smile'],
    roles: [
      { id: 'dough-hand', name: 'dough hand', exposure: 0.6, ageBias: -0.4 },
      { id: 'pastry-cook', name: 'pastry cook', exposure: 0.4, ageBias: 0 },
      { id: 'oven-keeper', name: 'oven keeper', exposure: 0.8, ageBias: 0.4 },
    ],
  },
  {
    id: 'scholar', name: 'Scholar', pool: 'curious',
    collars: ['buttonup', 'vneck', 'robe'], hats: ['none', 'beret', 'band'],
    hair: ['fringe', 'bob', 'bald', 'long'], quirks: ['pencil', 'ink-smudge', 'moth', 'third-eye'],
    exposure: 0.25,
    lids: ['squint', 'open', 'wide'], mouths: ['flat', 'ohh', 'smirk'],
    roles: [
      { id: 'margin-annotator', name: 'margin annotator', exposure: 0.2, ageBias: 0.2 },
      { id: 'map-copyist', name: 'map copyist', exposure: 0.3, ageBias: 0 },
      { id: 'night-reader', name: 'night reader', exposure: 0.2, ageBias: -0.2 },
      { id: 'emeritus', name: 'emeritus', exposure: 0.2, ageBias: 0.9 },
    ],
  },
  {
    id: 'napper', name: 'Napper', pool: 'sleepy',
    collars: ['hoodie', 'turtleneck', 'crew'], hats: ['beanie', 'none', 'band'],
    hair: ['waves', 'long', 'topknot', 'bob'], quirks: ['bubble', 'moth', 'star', 'cowlick'],
    exposure: 0.3,
    lids: ['half', 'closed'], mouths: ['flat', 'pout', 'smile'],
    roles: [
      { id: 'porch-sitter', name: 'porch sitter', exposure: 0.5, ageBias: 0.4 },
      { id: 'late-shift', name: 'late shift', exposure: 0.6, ageBias: -0.1 },
      { id: 'professional-resting', name: 'professionally resting', exposure: 0.2, ageBias: -0.3 },
    ],
  },
  {
    id: 'sprite', name: 'Sprite', pool: 'bright',
    collars: ['ruffle', 'crew', 'vneck'], hats: ['crown', 'band', 'none'],
    hair: ['pigtails', 'afro', 'curls', 'ponytail'], quirks: ['star', 'bubble', 'halo', 'flower'],
    exposure: 0.5,
    lids: ['sparkle', 'wide', 'wink'], mouths: ['grin', 'toothy', 'smile'],
    roles: [
      { id: 'errand-runner', name: 'errand runner', exposure: 0.9, ageBias: -0.9 },
      { id: 'bell-ringer', name: 'bell ringer', exposure: 0.6, ageBias: -0.6 },
      { id: 'festival-hand', name: 'festival hand', exposure: 0.7, ageBias: -0.5 },
    ],
  },
  {
    id: 'ruffian', name: 'Ruffian', pool: 'wild',
    collars: ['crew', 'hoodie', 'vneck'], hats: ['cap', 'kerchief', 'none'],
    hair: ['mohawk', 'wild', 'buzz', 'afro'], quirks: ['bandaid', 'toothgap', 'scar', 'missing-button'],
    exposure: 0.85,
    lids: ['squint', 'wink', 'wide'], mouths: ['toothy', 'smirk', 'grin'],
    roles: [
      { id: 'alley-scrapper', name: 'alley scrapper', exposure: 1.2, ageBias: -0.5 },
      { id: 'cart-wrangler', name: 'cart wrangler', exposure: 1.1, ageBias: 0 },
      { id: 'retired-terror', name: 'retired terror', exposure: 0.8, ageBias: 0.8 },
    ],
  },
  {
    id: 'grandee', name: 'Grandee', pool: 'grand',
    collars: ['ruffle', 'robe', 'buttonup'], hats: ['crown', 'beret', 'sunhat', 'none'],
    hair: ['waves', 'bun', 'long', 'bald'], quirks: ['monocle-chain', 'mole', 'badges', 'old-tie'],
    exposure: 0.2,
    lids: ['half', 'open'], mouths: ['smirk', 'flat', 'pout'],
    roles: [
      { id: 'salon-fixture', name: 'salon fixture', exposure: 0.2, ageBias: 0.6 },
      { id: 'minor-heir', name: 'minor heir', exposure: 0.3, ageBias: -0.6 },
      { id: 'patron', name: 'patron of something', exposure: 0.2, ageBias: 0.5 },
    ],
  },
  {
    id: 'mender', name: 'Mender', pool: 'gentle',
    collars: ['apron', 'crew', 'buttonup'], hats: ['kerchief', 'band', 'none'],
    hair: ['bob', 'bun', 'braids', 'fringe'], quirks: ['thread', 'patched', 'bandaid', 'charm'],
    exposure: 0.4,
    lids: ['open', 'half'], mouths: ['smile', 'flat'],
    roles: [
      { id: 'darning-hand', name: 'darning hand', exposure: 0.3, ageBias: 0.4 },
      { id: 'bone-setter', name: 'bone-setter', exposure: 0.5, ageBias: 0.3 },
      { id: 'poultice-maker', name: 'poultice maker', exposure: 0.4, ageBias: 0.1 },
    ],
  },
  {
    id: 'keeper', name: 'Keeper', pool: 'sturdy',
    collars: ['overalls', 'turtleneck', 'buttonup'], hats: ['beanie', 'cap', 'none'],
    hair: ['buzz', 'bald', 'waves', 'swoop'], quirks: ['bird', 'snail', 'big-ear', 'patched'],
    exposure: 0.9,
    lids: ['open', 'squint'], mouths: ['flat', 'smile'],
    roles: [
      { id: 'gate-warden', name: 'gate warden', exposure: 1, ageBias: 0.4 },
      { id: 'byre-hand', name: 'byre hand', exposure: 1.25, ageBias: 0 },
      { id: 'hedge-layer', name: 'hedge layer', exposure: 1.2, ageBias: 0.3 },
    ],
  },
  {
    id: 'oddity', name: 'Oddity', pool: 'odd',
    collars: ['robe', 'ruffle', 'hoodie', 'vneck'], hats: ['boat', 'crown', 'beanie', 'none'],
    hair: ['wild', 'mohawk', 'afro', 'topknot'], quirks: ['third-eye', 'antenna', 'halo', 'star'],
    exposure: 0.5,
    lids: ['wide', 'wink', 'sparkle'], mouths: ['ohh', 'whistle', 'toothy'],
    roles: [
      { id: 'unspecified', name: 'occupation unspecified', exposure: 0.5, ageBias: 0 },
      { id: 'weather-listener', name: 'weather listener', exposure: 0.9, ageBias: 0.3 },
      { id: 'inventor-of-one-thing', name: 'inventor of one thing', exposure: 0.4, ageBias: 0.2 },
    ],
  },
]

export const ARCHETYPE_BY_ID = new Map(ARCHETYPES.map((a) => [a.id, a]))

export function archetypeById(id: string): Archetype {
  return ARCHETYPE_BY_ID.get(id) ?? ARCHETYPES[0]!
}
