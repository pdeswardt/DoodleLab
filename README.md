# PencilFolk

A seeded procedural **population generator** that draws coloured-pencil
character sheets. Sixteen by sixteen, 256 people to a sheet, every one of them
a different individual from the same small world — and one word underneath each
that sums them up.

It is deliberately not an image-variation tool. There is no source image being
perturbed. There is a character archetype, a set of latent traits with real
distributions and real dependencies between them, a constraint system that
rejects combinations that would not hold together, and a mark-making engine that
draws the result the way a coloured pencil behaves on toothy paper.

```
npm install
npm run dev
```

---

## What it does

**Seeded and reproducible.** A seed string is hashed to 64 bits, so the seed
space is about 1.8 × 10¹⁹ sheets — and every character on a sheet draws from its
own derived stream, so the same seed always rebuilds the same 256 people, on any
machine.

**Layered, not random.** Each character is generated in dependency order, and
each subsystem gets its own seed derived from the master:

```
role → identity → body → face → hair → wardrobe → condition → palette → quirks
```

Because `faceSeed = hash(masterSeed, index, "face", salt)`, rerolling a face
consumes a different number of random values without shifting the wardrobe by a
single button. That is what makes "keep this person, give them different
clothes" possible at all.

**Traits are caused.** Shoulder width is not a random number — it is a base
value plus contributions from skeletal frame, muscularity and body mass. Years
in a role drive garment wear and the odds of a patched sleeve. Age drives
greying, thinning, eye size, ear size and the lines around the eyes. A long
shift shows up as half-lidded eyes and grime pooled low on the chest. Almost
nothing is sampled on its own.

**Quirks are rare, and they are earned.** 55% of the population has no
signature trait at all; 30% has one, 12% two, 3% three — and each quirk draws
its own intensity, 50/30/17/3 across subtle, moderate, strong and extreme. Which
quirk you get is weighted by age, years in the role, grooming, personality and
occupation, so an experienced tinkerer is likelier to have a pencil behind the
ear, a superstitious character likelier to have a charm pinned where a thumb can
reach it, and an eccentric one likelier to have a sprout growing out of their
head. At most one quirk per character is allowed to shout.

**Invalid combinations are rejected, not tolerated.** A validation pass checks
anatomy, wardrobe compatibility, quirk stacking and figure-to-background
contrast. When something fails, only the offending subsystem is regenerated —
the rest of the character is untouched.

**No accidental clones.** Every character is compared against everyone already
on the sheet using a feature vector weighted toward what a viewer notices first.
Too close, and the loud subsystems are rerolled while identity and role are
held. Natural resemblance survives; twins do not.

The full analysis this is built on — what is invariant, what may vary, what is
forbidden, and the complete dependency graph — is in
**[ARCHETYPE.md](./ARCHETYPE.md)**.

---

## How it draws

Everything visible is deposited by four methods on one `Pencil` class, following
a handful of rules taken from how the medium actually behaves:

1. **A line is never one line.** It is two or three passes, each offset a
   fraction of a millimetre, each broken into short chunks with occasional
   lifts.
2. **Pressure varies along a mark.** Ends are lighter, because the hand lifts.
3. **Tone is hatched, never filled.** Flat fills read as vector art instantly.
   A hatch line is drawn about as wide as the gap to its neighbour, so tone
   fuses while the grain still shows through — that single relationship is most
   of the difference between "scribbled" and "shaded".
4. **Pigment sits on the tooth of the paper.** Every layer is filtered through
   the same grain field.
5. **Shadows shift hue as they darken.** A shadow on warm skin heads toward
   red-violet, not toward black. Outlines are deep, desaturated cousins of the
   local colour — never black.
6. **Highlights are gaps.** Because layers multiply, the only way to get a
   catchlight in an eye is to leave the paper alone, so the iris hatch has a
   pressure function that drops to zero where the light hits.

Form shading comes from one function: an ellipsoid field that returns 0 in the
light and 1 in the core shadow, easing off at the rim to leave a sliver of
reflected light. Passing it to a hatch fill is what turns a flat oval into a
head.

The soft wash behind each figure — the thing that gives the reference its depth
— is broad, very faint side-of-the-pencil marks in a rounded off-square, with
the boundary deliberately broken up by short marks straddling the edge so it
fades into the paper instead of stopping at a line.

---

## Controls

| Control | What it does |
| --- | --- |
| **Seed** | Any string. Type a word, or hit the dice. |
| **Mood** | Six palettes — Meadow, Harbour, Orchard, Confetti, Dusk, Bakery. Biases every hue on the sheet so 256 characters read as one set. |
| **Grid** | 8×8 up to 20×20. |
| **Quality** | Draft / Standard / Fine. Changes stroke density, not stroke size — a thumbnail and its hi-res twin are the same drawing. |
| **Variation strength** | How far individuals stray from the archetype mean. |
| **Memorability** | How likely and how loud a signature trait is. Separate from variation on purpose. |
| **Age skew** | Tilts the whole population younger or older. |
| **Quirk density / maximum** | Scales the designed rarity without replacing it. |
| **Cleanliness / garment wear** | Biases the condition layer; the rest comes from the character's own history. |
| **Warmth** | Pulls every hue toward orange or toward blue. |
| **Locks** | Lock any subsystem and it survives a reroll. |

Click any character to open the inspector: a high-detail render, their full
description, their quirks with intensity, per-subsystem reroll buttons, a PNG
download, and their DNA as a copyable string.

`R` draws a new seed. Arrow keys move through the sheet. `Esc` closes the
inspector.

---

## Character DNA

Every character serialises to a single string containing enough to rebuild them
exactly — master seed, archetype, role, latent identity, every subsystem's
parameters, the condition layer, the quirk list, and the reroll salts. Paste one
back into the inspector to load that person into a slot.

```
Copy DNA → eyJ2ZXJzaW9uIjoyLCJtYXN0ZXJTZWVkIjoi…
```

Generation modes for working from an existing character — *similar*, *same
role*, *same person new wardrobe*, *same person new day*, *same person new
quirks* — are implemented in `population.ts` as lock presets over the same
generator.

---

## Layout

```
src/
  core/
    rng.ts          64-bit seed hashing, PRNG, and the statistical distributions
    noise.ts        value noise and fBm — wobble, pressure fields, paper grain
    color.ts        HSL model, pencil shade/tint behaviour, the six moods
    archetypes.ts   the twelve archetypes and their sub-roles
    quirks.ts       the quirk catalogue, rarity, intensity, compatibility
    dna.ts          the genotype: layered generation, validation, serialisation
    phenotype.ts    expression — genotype into drawable numbers
    types.ts        the drawable phenotype
    population.ts   sheet generation, clone protection, memorable density
    words.ts        the caption lexicon and its uniqueness bag
  render/
    pencil.ts       the mark-making engine: stroke, hatch, contour, wash, paper
    shapes.ts       path geometry — blobs, superellipses, resampling, clipping
    character.ts    composition and draw order
    caption.ts      the one-word caption, cut out of hatched pigment
    features/       hair, face, garment, extras and quirk props
  ui/
    sheet.ts        the grid, rendered progressively against a frame budget
    exporter.ts     PNG export, re-rendered from the genome at any scale
  main.ts           state, controls, inspector
```

A 16×16 sheet generates its genomes in around 130 ms and finishes drawing in
about 2.5 seconds, filling in visibly rather than behind a spinner.

---

## Notes

Captions use Caveat from Google Fonts, with a handwriting fallback stack — the
drawing does not depend on the webfont loading. Exports re-render from the
genome at the requested scale rather than upscaling thumbnails; there is no
fixed-resolution original.
