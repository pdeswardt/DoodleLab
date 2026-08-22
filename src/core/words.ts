/**
 * The one-word lexicon.
 *
 * Every character is captioned with a single word. The word is not decoration —
 * it is chosen from the pool that matches the character's loudest trait, so a
 * sprout-headed one gets a growing word and a half-lidded one gets a sleepy
 * word. Pools are large enough that a full 16x16 sheet (256 words) can be
 * captioned without repeating.
 */

export type WordPool =
  | 'bright' | 'sleepy' | 'curious' | 'gentle' | 'sturdy' | 'wild'
  | 'green' | 'salty' | 'sweet' | 'clever' | 'odd' | 'grand'

export const WORDS: Record<WordPool, string[]> = {
  bright: [
    'Beam', 'Spark', 'Glimmer', 'Sunny', 'Kindle', 'Flare', 'Gleam', 'Radiant',
    'Chipper', 'Bubbly', 'Zest', 'Giddy', 'Merry', 'Buoyant', 'Perky', 'Vivid',
    'Blaze', 'Twinkle', 'Cheer', 'Dazzle', 'Lark', 'Shine', 'Frolic', 'Glee',
    'Rally', 'Whee', 'Bounce', 'Sizzle',
  ],
  sleepy: [
    'Drowse', 'Hush', 'Doze', 'Lull', 'Slumber', 'Yawn', 'Drift', 'Dusk',
    'Murmur', 'Snug', 'Cosy', 'Lounge', 'Mellow', 'Languid', 'Nod', 'Pillow',
    'Quilt', 'Dream', 'Sigh', 'Idle', 'Wander', 'Amble', 'Blanket', 'Nestle',
    'Wistful', 'Halfmast', 'Softly', 'Later',
  ],
  curious: [
    'Ponder', 'Wonder', 'Peek', 'Query', 'Squint', 'Notice', 'Perhaps', 'Maybe',
    'Hmm', 'Riddle', 'Puzzle', 'Seek', 'Probe', 'Sift', 'Trace', 'Detect',
    'Inkling', 'Hunch', 'Nosey', 'Snoop', 'Compass', 'Almanac', 'Margin',
    'Footnote', 'Ellipsis', 'Bookmark', 'Wander', 'Rummage',
  ],
  gentle: [
    'Soften', 'Tender', 'Kindly', 'Balm', 'Downy', 'Velvet', 'Petal', 'Hush',
    'Cradle', 'Mercy', 'Grace', 'Gauze', 'Feather', 'Meek', 'Bashful', 'Shy',
    'Blush', 'Fond', 'Dote', 'Tuck', 'Woolen', 'Mitten', 'Lullaby', 'Poultice',
    'Peaceable', 'Marshmallow', 'Cushion', 'Careful',
  ],
  sturdy: [
    'Anchor', 'Oak', 'Granite', 'Steadfast', 'Bulwark', 'Buttress', 'Keel',
    'Girder', 'Cobble', 'Ballast', 'Stalwart', 'Mainstay', 'Boulder', 'Timber',
    'Iron', 'Rivet', 'Sturdy', 'Foundation', 'Lodestone', 'Trunk', 'Beam',
    'Kettle', 'Cast', 'Plinth', 'Hearth', 'Bedrock', 'Stout', 'Brace',
  ],
  wild: [
    'Ruckus', 'Tumble', 'Havoc', 'Gale', 'Bramble', 'Thicket', 'Feral', 'Roam',
    'Scamper', 'Kerfuffle', 'Bluster', 'Squall', 'Tangle', 'Riot', 'Scuffle',
    'Rowdy', 'Whirl', 'Clatter', 'Stampede', 'Wallop', 'Careen', 'Frazzle',
    'Bristle', 'Untamed', 'Yonder', 'Barefoot', 'Thunder', 'Scrabble',
  ],
  green: [
    'Sprout', 'Moss', 'Fern', 'Sapling', 'Thistle', 'Clover', 'Bloom', 'Bud',
    'Vine', 'Lichen', 'Bracken', 'Pollen', 'Compost', 'Trowel', 'Orchard',
    'Hedge', 'Meadow', 'Rootlet', 'Photosynth', 'Greenhouse', 'Cuttings',
    'Mulch', 'Sunflower', 'Nettle', 'Sorrel', 'Bramblejam', 'Seedling', 'Graft',
  ],
  salty: [
    'Harbour', 'Tide', 'Brine', 'Keelhaul', 'Barnacle', 'Fathom', 'Squid',
    'Rigging', 'Foghorn', 'Driftwood', 'Gull', 'Skiff', 'Lantern', 'Compass',
    'Undertow', 'Portside', 'Shanty', 'Kelp', 'Trawler', 'Buoy', 'Netting',
    'Saltcrust', 'Estuary', 'Mizzen', 'Anchorage', 'Spindrift', 'Cove', 'Wharf',
  ],
  sweet: [
    'Marzipan', 'Sugarloaf', 'Custard', 'Dollop', 'Praline', 'Nougat', 'Syrup',
    'Fondant', 'Trifle', 'Meringue', 'Truffle', 'Jamjar', 'Brioche', 'Toffee',
    'Sprinkle', 'Gumdrop', 'Sherbet', 'Crumb', 'Butterscotch', 'Marmalade',
    'Shortcake', 'Waffle', 'Honeycomb', 'Cocoa', 'Sundae', 'Icing', 'Compote',
    'Danish',
  ],
  clever: [
    'Tinker', 'Cog', 'Schematic', 'Lever', 'Solve', 'Deduce', 'Abacus',
    'Sextant', 'Blueprint', 'Calibrate', 'Wrench', 'Circuit', 'Theorem',
    'Astute', 'Ledger', 'Cipher', 'Protractor', 'Bellows', 'Filament',
    'Crankshaft', 'Widget', 'Escapement', 'Fulcrum', 'Prototype', 'Sprocket',
    'Slide-rule', 'Ratchet', 'Contraption',
  ],
  odd: [
    'Peculiar', 'Sideways', 'Askew', 'Bewilder', 'Kink', 'Quirk', 'Whimsy',
    'Wobble', 'Fluke', 'Anomaly', 'Doodad', 'Whatsit', 'Tangent', 'Bemused',
    'Loopy', 'Skewiff', 'Hodgepodge', 'Flummox', 'Discombob', 'Nonsense',
    'Boggle', 'Uncanny', 'Cattywampus', 'Malarkey', 'Balderdash', 'Persnickety',
    'Higgledy', 'Gubbins',
  ],
  grand: [
    'Regal', 'Plume', 'Flourish', 'Pageant', 'Velveteen', 'Fanfare', 'Opulent',
    'Baroque', 'Cravat', 'Monocle', 'Estate', 'Gallant', 'Debonair', 'Aplomb',
    'Panache', 'Swagger', 'Ceremony', 'Laurels', 'Marquee', 'Gilded', 'Bravura',
    'Coronet', 'Statuesque', 'Emeritus', 'Grandiose', 'Salon', 'Epaulette',
    'Toast',
  ],
}

export const ALL_POOLS = Object.keys(WORDS) as WordPool[]

/**
 * Sheet-wide word bookkeeping. Characters ask for a word from their preferred
 * pool; if it is taken, we walk the pool, then fall back to neighbouring pools,
 * so 256 characters get 256 distinct words.
 */
export class WordBag {
  private used = new Set<string>()

  take(pool: WordPool, offset: number): string {
    const preferred = WORDS[pool]
    const found = this.walk(preferred, offset)
    if (found) return found
    for (const other of ALL_POOLS) {
      const alt = this.walk(WORDS[other], offset)
      if (alt) return alt
    }
    // Every word is spoken for — extremely large sheets only.
    const fallback = preferred[offset % preferred.length]!
    return fallback
  }

  private walk(list: string[], offset: number): string | null {
    for (let i = 0; i < list.length; i++) {
      const w = list[(offset + i) % list.length]!
      if (!this.used.has(w)) {
        this.used.add(w)
        return w
      }
    }
    return null
  }
}
