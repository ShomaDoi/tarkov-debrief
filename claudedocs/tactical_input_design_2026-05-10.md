# Tactical Briefing / Debriefing Input — Design Translation

**Date:** 2026-05-10
**Status:** Design memo — input to a follow-up `/sc:design` pass.
**Companion doc:** `research_ergonomic_input_2026-05-10.md` (the
underlying research; this memo translates it to the tactical use case).
**Scope:** Desktop-first input model with a mobile lens. Visual/style
decisions deferred to the existing `DESIGN.md`.

---

## What makes tactical input different from general drawing

Five constraints that aren't true for Excalidraw:

1. **Hands follow speech.** Users are *narrating*, often over voice
   chat. Eyes are on the map; the toolbar is dead space.
2. **Multiple actors, one story.** A 4-person squad debrief layers
   4 perspectives. Drawing is fundamentally multi-author even when
   one person holds the mouse.
3. **Time is the narrative.** "First we pushed, then they flanked,
   then I died" — order is the artifact, not just metadata.
4. **The map carries 95% of the meaning.** Strokes are *annotation*,
   not *sketching*. Precision matters less than direction and intent.
5. **A small fixed vocabulary covers ~90% of marks.** Movement
   arrows, sightlines, contact points, hold positions, kill markers,
   sound pings. This is closer to a sports telestrator than to a
   whiteboard.

The research patterns that bend hardest toward this case are
**quasi-modes** (hands follow speech), **per-actor color** (multi-
author), **temporal replay** (time as narrative), and **marking
menus** (vocabulary as muscle memory).

---

## Proposed mark vocabulary

Eight primitives cover the tactical grammar:

| Mark            | Meaning                            | Visual                            |
|-----------------|------------------------------------|-----------------------------------|
| Movement arrow  | Where someone went or plans to go  | Solid (actual) / dashed (planned) |
| Sightline       | Line of fire / line of sight       | Thin dashed straight              |
| Overwatch cone  | Sector covered from a position     | Triangular fan from a marker      |
| Engagement X    | Contact / kill / spotted           | Red X variants                    |
| Sound ping      | Heard footsteps / shot             | Concentric ring at a point        |
| Position dot    | Hold here / objective / loot       | Small filled dot                  |
| Unit marker    | PMC thick/med/light, Scav          | (already exists)                  |
| Text label      | Timestamp, callsign, note          | "0:45 — flank from north"         |

Plus the existing **free pencil** as the safety valve — anything the
vocabulary doesn't cover, you can scribble.

---

## Translating each research principle to tactical mechanics

### 1. Quasi-modes → fast tool switching while talking

Single-letter holds, all spring-loaded (revert on release):

- `Space` — pan
- `A` — arrow (drag start→end, release commits)
- `S` — sightline (snaps to 15° increments while held)
- `X` — engagement mark (click drops red X)
- `O` — overwatch cone (drag from origin to set angle/range)
- `C` — color/operator picker pop
- Right-mouse — eraser

The user's hand never leaves the canvas and the eyes never leave the
map. This is the single biggest "feels like it reads my mind" lever
for tactical narration.

### 2. Marking menu → tactical stamp radial

Right-click hold (or `Q` hold) → 8-position radial appears under the
cursor:

```
        arrow
   sightline   X
hold              sound
   PMC-med   PMC-thick
        scav
```

Press-and-flick = expert (skip the menu, mark in the direction).
Press-and-wait = novice (menu appears). Same gesture path teaches
expertise. From Buxton/Kurtenbach: 3.5× faster than menu navigation
in expert use.

This replaces the current sliding sidebar for marker selection.

### 3. Per-operator color → "active operator" chip strip

A horizontal chip strip at the top of the canvas:

```
[Alpha]  [Bravo]  [Charlie]  [Delta]   [+]
```

Click a chip → all subsequent strokes carry that operator's color
and tag. Shift-click → toggle that operator's visibility, letting
you say "first show only Alpha's path... now add Bravo." This is the
cleanest implementation of "multi-author" the research patterns
surface, and it doesn't require an explicit layer panel.

It's also the only piece that **inverts a current product
assumption** — that strokes are anonymous. Worth validating with one
observation session before committing.

### 4. QuickShape → tactical snap

After a stroke, hold cursor still ~500ms:

- Wobbly line → straight line
- Loose curved arrow → clean arrow with arrowhead aligned to direction
- Rough circle → clean hold-position dot
- Triangle-ish drag → symmetric overwatch cone

Original stroke stays in undo. The trade users make is: scribble
fast, stop to commit clean. Briefings get tidy without slowing the
talker down.

### 5. Temporal axis → replay scrubber

Every stroke timestamps automatically. A thin scrubber at the bottom:

- Drag scrubber → strokes appear/disappear in temporal order.
- Play button → animated replay at adjustable speed.
- Pause on any stroke → that's now the "current frame."

This is the single feature that makes a Debrief artifact different
from a screenshot. It's also the most expensive — worth observing
one real debrief before committing.

### 6. Brief vs Debrief → solid vs dashed, one canvas

Don't gate planning behind a mode toggle. Add a single dashed/solid
switch (call it "intent: planned / actual") near the operator chip.
Then:

- A briefing is a canvas of all-dashed strokes.
- A debrief is solid strokes laid on top of the prior dashed plan.
- The artifact tells you the *delta* between what you planned and
  what happened — visually, in one glance.

This is the most product-defining recommendation. It costs almost
nothing to implement and changes what Debrief *means*.

### 7. Direct manipulation → arrows are objects, not strokes

Click an arrow's tail to extend, head to redirect. When someone says
"actually they came from over there," you grab the head and drag.
Excalidraw / Figma model. This is the only place where the
research's "objects, not pixels" principle is non-negotiable for
tactical — because tactical narration is constantly being corrected
mid-sentence.

### 8. Sticky defaults → triple stickiness

Persist `tool` + `operator` + `stamp` across reloads. Tactical users
place 5–10 markers in a row of the same kind ("OK so the squad was
here, here, here, and here"). Re-picking each time is the death of
flow.

---

## Mobile lens

A debrief on a phone happens — squadmate on a walk, Discord call,
"show me where you were." Specific touch translations:

- **Bottom sheet, not right sidebar** for the operator chips and
  stamp picker. Thumb-reachable on portrait phones.
- **Long-press a stamp button → "stamp mode"** (tap to place
  repeatedly until dismissed) vs **short-press → one-shot mode**
  (places once at the press location).
- **Two-finger pan/zoom** (Procreate parity).
- **Two-finger tap = undo, three-finger tap = redo** — verbatim from
  Procreate. Fits the "I'm telling a story and just misspoke" use
  case perfectly.
- **Replay scrubber at the bottom**, finger-sized.
- **No quasi-mode keyboard shortcuts on touch** — they collapse into
  the radial menu.

---

## What to validate before building

Three observation-worthy questions, in order of leverage:

1. **Operator-centric or event-centric mental model?** When you ask
   a squad to recreate a raid on paper, do they say "first Alpha did
   X, then Bravo did Y" or "first contact was here, then sound here,
   then push here"? If the latter, the chip strip is wrong — it
   should be a *time-of-event* axis instead. Probably the answer is
   "both," but the primary metaphor matters for the default.
2. **Is replay the killer feature or a nice-to-have?** Most expensive
   thing on the list. Watch one debrief end-to-end and you'll know.
3. **Solid/dashed brief-vs-debrief on one canvas, or two-step
   (snapshot the brief, then overlay)?** The single-canvas version
   is cleaner; the two-step version respects "the plan is a fixed
   reference" more honestly. Depends on whether teams actually plan
   in this tool or just debrief.

---

## What this *doesn't* need

- **No explicit layer panel.** Operator tag does the same job
  invisibly.
- **No brush settings.** One pencil width per vocabulary type; users
  don't want to pick.
- **No customizable color palette.** Operator chips define color;
  the freeform pencil gets a small recent-colors strip; that's it.
- **No "presentation mode" toggle.** The replay scrubber + chip-
  visibility toggles already cover live narration; a separate mode
  would just be a second thing to learn.

---

## Suggested P0 starter set for /sc:design

If we want one cohesive slice that proves the new model without
over-committing, these four work together and are mutually
reinforcing:

1. **Quasi-mode tool shortcuts** (Space, A, S, X, O, C, right-mouse
   for eraser). Necessary infrastructure for everything else.
2. **Marking-menu radial stamp picker.** Replaces the slide-in
   sidebar; surfaces the expanded vocabulary in one gesture.
3. **Operator chip strip + per-operator color tagging.** Establishes
   the multi-author model and makes the artifact tell a story.
4. **Solid / dashed intent toggle.** Tiny addition that unifies
   brief + debrief into one canvas.

Replay (#5 from the principles list) and snap-to-shape (#4) are
high-leverage but each deserves its own slice; they shouldn't gate
the rest.

---

## Anchoring summary

**The toolbar is for the cold settings and the canvas is for the
story.** Quasi-modes, a marking menu of tactical stamps, an operator
chip strip, and a temporal scrubber turn the canvas itself into the
debrief.

---

## Boundary reminder

This is a design memo, not an implementation plan. Concrete file
changes, fabric.js integration, state-management decisions, and
mobile event handling all belong to the `/sc:design` pass this memo
feeds into.
