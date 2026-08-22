# Archetype specification

This is the analysis the generator is built from: what the reference character
*is*, which of its properties are fixed, which may vary, which appear only
sometimes, and which are forbidden. It corresponds to Phases 1 and 2 of the
design brief. Everything in `src/core/` is a direct implementation of the
tables below.

> **Scope note.** The brief also covers 3D production concerns — rig and
> animation compatibility, mesh generation strategy, LODs. PencilFolk produces
> 2D coloured-pencil drawings, so those sections do not apply and are not
> implemented. Every other section is.

---

## 1. Reference analysis

The reference is a single bust portrait in soft coloured pencil: a friendly,
slightly stylised adult drawn from mid-chest up, oversized head, warm skin, a
plain buttoned work shirt, round dark-rimmed glasses, and a pale hazy wash of
colour sitting behind the figure on visible paper.

### Identity

| Property | Reading |
| --- | --- |
| Species | Human, stylised |
| Age range | Adult, roughly 25–45 |
| Morphology | Soft, heavyset, no strong dimorphism cues |
| Role | Ordinary working person; occupation implied, never stated |
| Condition | Healthy, unhurried, clean |
| Context | Domestic or small-trade, pre-industrial-to-timeless |
| Setting | No visible technology; nothing dates the picture |

### Body language

Wide sloping shoulders, short thick neck, upright and relaxed posture, weight
carried forward. The silhouette is a broad trapezoid under a large circle. The
frame is cropped mid-chest — there is no waist, no arms, no hands.

### Face

Large rounded cranium, soft jaw with little definition, full cheeks, low
prominent brow, large round eyes with clearly drawn dark lids and a small white
catchlight, a small warm button nose several shades redder than the surrounding
skin, a small closed smile, ears low and close to the skull. Proportions are
child-adjacent: eyes below the vertical midline, features gathered into the
lower half of the face. Asymmetry is present but subtle.

### Hair

Short, thick, swept up and back off the forehead, warm blond, tidy but not
styled. Visible individual strands at the silhouette edge. Light stubble on the
jaw. Grooming level: average.

### Clothing

Modular, not a costume: a collared button-up shirt in muted teal, rolled short
sleeves, one chest pocket, plain buttons, a faint check woven into the cloth,
white undershirt visible at the collar. Fit is easy. Construction is simple and
domestic.

### Equipment

None visible. This is a portrait, not a loadout.

### Materials

Cotton or cotton-blend shirt, skin, hair, glass and dark plastic or horn for the
spectacles. No metal, leather, rubber or synthetics.

### Surface condition

Essentially clean. No dirt, staining, tearing or repair. A little softness at
the collar edge suggests the garment is worn but cared for.

### Art direction

Stylised, warm, low contrast. Detail density is moderate and concentrated in the
face. Colour is desaturated with one or two saturated accents. Line is soft and
broken, never uniform. Tone is built by hatching, and the paper shows through
everywhere. Highlights are bare paper, not white pigment. The background is a
single soft rounded wash of a complementary hue with feathered edges — the
element that gives the portrait its depth.

---

## 2. Invariants, variables, optional features, forbidden variation

### A. Archetype invariants

Fixed for every member of the population. Changing any of these produces
something that is no longer the same set of drawings.

- Bust framing, cropped mid-chest, figure centred
- Oversized head relative to body; features gathered low on the face
- Coloured-pencil mark-making: hatched tone, broken contours, visible paper
- Highlights are gaps in pigment, never applied light pigment
- Outlines are deep, desaturated versions of the local colour — never black
- One soft rounded background wash per character, lighter than everything in
  front of it
- One-word caption below each figure
- Warm, low-contrast, desaturated palette with limited saturated accents

### A2. Silhouette families

Variation within an archetype is not only parametric. A population built by
jittering one head shape and one shoulder line reads as one drawing redrawn,
however far the numbers are pushed — so the two most visible structures each
have a set of genuinely different constructions:

**Head** — ten families, each a half-width profile sampled at six heights
(crown, upper temple, temple, cheek, jaw, chin) plus its own superellipse
exponents for how flat the sides and crown are: `oval`, `heart`, `blocky`,
`pear`, `long`, `bulb`, `angular`, `lopsided`, `chinny`, `wide`. Height and
width are computed independently, so a jowly skull and a long narrow one are
different shapes rather than the same egg with different multipliers. Family
choice is weighted by frame, mass and morph; the control points are then
jittered individually.

**Shoulders** — six constructions: `sloped`, `square`, `round`, `hunched`,
`narrow`, `uneven`. The control point placement is what separates them — high
and wide gives square shoulders, low and close gives a soft round slope, and
pulling it above the neckline gives the shoulders-by-the-ears look that no
amount of width jitter would produce.

**Eyes** — eight outlines built from corner positions rather than by clamping an
ellipse: `round`, `almond`, `narrow`, `droop`, `upturn`, `wide`, `dot`,
`hooded`. Dropping the outer corner gives a droop, lifting it an upturn.

**Brows** — twelve, each a spine plus a width function: `bar`, `wedge`, `comma`,
`dash`, `angled`, `unibrow`, `arched`, `straight`, `thin`, `bushy`, `worried`,
`soft`. Thick styles are drawn as a hatched ribbon, thin ones as individual
hairs.

### A3. Drawing style

One artist filling a sheet still varies. Six per-character parameters govern how
a figure is *drawn* rather than what it looks like: pressure, nib width (how
blunt the pencil is, which sets whether hatching fuses into flat tone or stays
legible as strokes), line looseness, hatch direction, wrist wobble, and degree
of finish. A slight head turn and variation in how large the figure sits within
its frame complete the set.

### B. Constrained variables

Continuous, sampled around a population mean and correlated with each other.
Implemented in `dna.ts` stages 2–8.

| Variable | Range | Distribution | Depends on |
| --- | --- | --- | --- |
| Age | 7–82 | Weighted bands, normal within band | Sheet age skew, role |
| Skeletal frame | −1…1 | Normal | — |
| Body mass | −1…1 | Normal | Frame, age band |
| Muscularity | −1…1 | Normal | Frame, age band |
| Posture | −1…1 | Normal | Age band |
| Head scale | 0.82–1.24 | Normal | Age band, frame |
| Jaw width | 0.74–1.34 | Derived + noise | Frame, muscularity, mass, morph |
| Cheek fullness | 0.76–1.40 | Derived + noise | Mass, age |
| Shoulder span | 1.5–2.6 | Derived + noise | Frame, muscularity, mass, age band |
| Eye size | 0.12–0.245 | Normal | Age |
| Eye spacing | 0.42–0.64 | Normal | Cheek fullness |
| Brow weight | 0.45–1.9 | Normal | Morph, age |
| Nose size | 0.7–1.45 | Normal | Morph, age |
| Ear size | 0.72–1.42 | Normal | Age |
| Hair density | 0.15–1.2 | Derived | Age, morph |
| Greying | 0–1 | Derived | Age |
| Garment hue | Mood bands | Uniform within band | Mood, archetype, warmth |
| Grime | 0–1 | Derived | Exposure, shift length, cleanliness, meticulousness |
| Garment wear | 0–1 | Derived | Years in role, exposure, wear control |
| Stain count | 0–6 | Poisson | Grime |
| Stain size | — | Log-normal | Grime |
| Patch count | 0+ | Poisson | Years in role, meticulousness |

### C. Optional features

Appear probabilistically, weighted by context.

Glasses · hat · scarf · earring · necklace · facial hair · freckles · blush ·
pocket · lapel · buttons · patches · stains · visible damage · every entry in
the quirk catalogue.

### D. Forbidden variation

Enforced by `validate()` in `dna.ts`, which rerolls the offending subsystem
rather than the whole character.

- Shoulder span outside 1.45–2.7, or head scale outside 0.80–1.28 — proportions
  that stop reading as the same population
- Eyes that do not fit within the skull
- Facial hair on a character under 17
- A fitted hat (beanie, cap) over standing hair (mohawk, top bun)
- A scarf over a turtleneck — bulk the silhouette cannot carry
- Goggles with a crown — an equipment/status combination that breaks the world
- More quirks than the per-sheet cap
- More than one quirk at `strong` or `extreme` intensity
- Both ear slots claimed at once (ear defenders plus a pencil behind the ear)
- A garment within 16 lightness units of its own background wash
- A background wash darker than 74% lightness — the figure must sit in front

---

## 3. Dependency graph

Arrows read "influences". Nothing downstream is sampled independently of
what feeds it.

```
archetype ─┬─> role ─┬─> exposure ──┬─> grime, wear, weathered skin
           │         └─> age bias ──┤
           │                        │
           ├─> clothing weights     │
           ├─> headwear weights     │
           ├─> hairstyle weights    │
           ├─> quirk weights        │
           └─> word pool            │
                                    │
age ─┬─> greying ─> hair colour     │
     ├─> thinning ─> hairstyle, hair density
     ├─> eye size, ear size, nose size, brow weight
     ├─> age lines
     └─> years in role ─┬─> garment wear
                        ├─> patches
                        └─> quirk weights (veteran traits)

frame, mass, muscularity ─> head shape, jaw, cheeks, shoulder span, neck
morph ─> jaw, brow weight, facial-hair likelihood
posture ─> shoulder slope, figure tilt
grooming ─> hairstyle tidiness, stray strands, stubble
personality ─> quirk weights (meticulous, eccentric, superstitious, sociable)
shift length ─> tiredness, half-lidded eyes, face lines, grime
hair height ─> which hats are permitted
mood ─> every hue decision on the sheet
```

---

## 4. Distributions used, and why

| Shape | Applied to | Reason |
| --- | --- | --- |
| Normal | Head scale, jaw, spans, feature sizes, personality | Ordinary population variation clusters around a mean |
| Weighted categorical | Archetype, role, hairstyle, collar, hat, expression | Discrete choices with unequal, context-dependent likelihood |
| Log-normal | Stain size, years in role | Usually small, occasionally much larger; never negative |
| Poisson | Stains, patches, stray hair tufts | Counts of independent small events |
| Explicit discrete | Quirk count, quirk intensity | The brief names exact percentages; the code matches them literally |

Quirk count is **55 / 30 / 12 / 3** for zero / one / two / three, and quirk
intensity is **50 / 30 / 17 / 3** across subtle / moderate / strong / extreme.
The `memorability` control tilts those distributions rather than replacing
them, and the tilt is anchored at the default setting so that quirk density
1.00 means literally the designed rarity.

Observed counts on a 256-character sheet land close to the target but a little
short at two and three quirks — the compatibility rules legitimately cut a
selection short when a character's remaining options all conflict with what it
has already been given. That is the constraint system working, not drift.

---

## 5. Memorability versus variation strength

Kept deliberately separate, because they answer different questions.

- **Variation strength** — *how unusual does this person look?* Scales the
  standard deviation of every latent trait and the size of facial asymmetry. At
  1.0 the result is a population outlier, still unmistakably the same set.
- **Memorability** — *how much does this person stick in the mind?* Raises the
  probability and intensity of quirks, the chance of an unusual hair colour, and
  the presence of accent-coloured detail. It does not widen anatomy at all.

A character can be physically average and unforgettable, physically unusual and
completely understated, both, or neither.

---

## 6. Population-level guarantees

Handled in `population.ts`, because none of them can be decided one character at
a time.

- **Clone protection.** Each character is reduced to a feature vector weighted
  toward what a viewer notices first — silhouette, colour, loud features. If a
  new character lands within a threshold distance of anyone already on the
  sheet, its face, hair, wardrobe and palette are rerolled while its identity
  and role are held. Some natural resemblance is allowed to survive; real
  populations contain it.
- **Memorable density.** Even with correct per-character rarity, a run of
  quirked people is possible. The running share is tracked against a target
  derived from the sheet's memorability and quirk density, and the next
  character's quirk layer is rerolled if the sheet drifts high.
- **Word uniqueness.** One shared lexicon bag issues 256 distinct captions,
  falling through to neighbouring pools when a preferred word is taken.
