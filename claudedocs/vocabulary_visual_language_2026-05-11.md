# Future Vocabulary — Visual Language for Anchored Marks

**Date:** 2026-05-11
**Status:** Forward-looking design brainstorm — captured so the
future-vocabulary slice (when it opens) has a starting point. Not
shipped in the P0 starter slice.
**Companion docs:** `design_p0_slice.md` (the P0 design that
*defers* this), `tactical_input_design_2026-05-10.md` (the memo
that proposed the mark vocabulary in the first place).
**Decision recorded:** **Idea 1 (cone family)** is selected for
when the vocabulary slice ships. May be revisited.

---

## 1. Context

The future tactical-mark vocabulary adds five primitives beyond
the existing PMC/Scav markers: **arrow**, **sightline**,
**engagement X**, **sound ping**, **overwatch cone**. Three of
those — arrow, sightline, overwatch — share enough of a "from a
position, toward a thing" structure that they could collide
visually if treated naively. This document records the brainstorm
about how to keep them visually distinct, and the decision made.

The other two (engagement X, sound ping) are simple free-placement
stamps and don't participate in this question.

## 2. Shared mental model

| Mark | Input | Anchor | What it represents |
|---|---|---|---|
| Arrow | Freehand path while `B`-equivalent or `A` is active | None (user's hand defines start and end) | Movement |
| Sightline | Hold `S`, single click | Tip of the last drawn arrow | Where a unit was looking / aiming |
| Overwatch cone | Hold `O`, click + drag | Tip of the last drawn arrow | Sector of fire / area of coverage |

Two important shared properties of sightline and overwatch:

- **Anchor-dependent.** Origin is implicit (= last arrow's tip);
  the user supplies only the target / spread. One click for
  sightline, one click+drag for overwatch.
- **Single-shot.** Both are hold-quasi per `design_p0_slice.md`
  §4.8 — the user briefly enters the mode, places one, returns to
  their previous tool on release.

## 3. Two ideas considered

### Idea 1 — Three distinct geometric primitives, with a cone family (**CHOSEN**)

| Mark | Geometry | Style |
|---|---|---|
| Arrow | Open curve (the freehand path) + filled arrowhead at the end | Solid stroke, operator color, ~3 px screen width |
| Sightline | Long narrow triangle — apex at anchor, base at target | Translucent fill in operator color, **~5° angular width** (initial; tune from screenshots), fades from full alpha at apex to ~20% at base |
| Overwatch cone | Circular sector — apex at anchor, angular extent defined by click+drag | Same translucent fill, **15°–120° angular width** (drag-controlled), same alpha fade |

**Why it works:**
- Geometry alone disambiguates the three marks — no reliance on
  subtle stroke styling that may not survive busy map backgrounds.
- Sightline and overwatch share a single visual family ("a fan of
  attention from this anchor"); the only parameter that varies is
  angular width. Users learning one immediately understand the
  other.
- The alpha fade from apex to base does real work: it conveys
  "attention diminishes with distance" and pulls the eye toward
  the *origin* (= the looker), which is the semantically meaningful
  end of the mark.
- Translucent fans overlap legibly. Multiple sightlines from the
  same anchor (one squad member watching several directions over
  time) compose without becoming opaque chaos.

**Known concerns:**
- At short anchor-to-target distance, a 5° fan reads almost like a
  thick line, with the potential to be mistaken for an arrow segment.
  Mitigation: tune the angular width upward (try 7–8°) if testing
  shows confusion at typical zoom levels.
- The anchor (last arrow's tip) needs to be visually obvious so the
  user can see *which* arrow a sightline is "from." Possible
  reinforcement: a small operator-colored dot rendered at the
  anchor when a sightline or overwatch is hovered/selected. Defer
  the exact treatment to implementation.

### Idea 2 — Origin badges + line stylings (rejected for now)

| Mark | Stroke | Origin | Terminal |
|---|---|---|---|
| Arrow | Solid, ~3 px freehand path | None | Filled arrowhead |
| Sightline | Thin dashed, ~1 px, straight | Small open circle ("eye") at anchor | Small cross ("aim") at target |
| Overwatch cone | Translucent fan (same as Idea 1) | Cone apex | Cone arc |

**Why it was attractive:**
- Iconographic; reads as a tactical convention rather than a
  generic geometric primitive.
- Visually lighter than a fan for every "from here, watching there."

**Why it was rejected:**
- Sightline and overwatch no longer share a visual family — they're
  conceptually similar but visually unrelated, which costs the user
  the "learn one, get the other free" property.
- Two dashed stroke conventions in the system (the planned-phase
  dash from `design_p0_slice.md` §6.3, plus this sightline dash)
  would require careful pattern differentiation to keep them from
  reading as the same thing.
- Origin/terminal badges are screen-space iconography that needs
  zoom-compensation (mirror `zoom.ts`'s brush-width-over-zoom
  trick), which is extra implementation surface.

## 4. Decision

**Idea 1.** When the future-vocabulary slice ships:

- Arrow: freehand path, ~3 px solid, operator color, terminal
  arrowhead.
- Sightline: narrow translucent fan, ~5° initial angular width,
  apex at last arrow's tip, alpha fades 100% → ~20% from apex to
  base.
- Overwatch cone: wide translucent fan, 15°–120° angular width
  set by the user's click+drag, same alpha fade.

The phase toggle (`PLAN | RECORD`) interacts with all three the
same way it does with the existing pencil: planned arrows / planned
sightlines / planned overwatch cones get the dashed treatment on
their outline. Fill-translucency for plan-phase fans may need to
drop further (e.g., to ~10% fill) to keep them visually subordinate
to record-phase fans — defer to implementation.

## 5. Open parameters (to settle during /sc:design for the
   vocabulary slice)

- **Sightline angular width.** Start at 5°; validate against
  screenshots at common zoom levels. Acceptable range 3°–10°.
- **Alpha curve.** Linear fade is the default; an exponential or
  ease-out curve might pull more visual weight to the apex. Try
  linear first.
- **Anchor reinforcement.** Should a small filled circle at the
  apex always render, or only on hover/selection? Lean toward
  "always render at low contrast" so the anchor is discoverable
  without interaction.
- **Plan-phase visual.** Same dashArray as planned strokes, or
  reduced-alpha fill, or both? Probably both, validated visually.
- **Color.** Default = active operator's color. Confirm no special-
  case overrides (e.g., red for "enemy" sightlines) — the operator
  metaphor should be sufficient.

## 6. Edge cases worth resolving early

- **No "last arrow" exists yet.** First sightline/overwatch of a
  session, or right after a map switch (which clears the canvas).
  Options:
  - **Refuse and hint.** Tooltip / status line: "Draw an arrow
    first." Simplest to ship.
  - **Fall back to last placed unit marker.** A bit more useful —
    a static defender position has no movement arrow but does have
    a unit on the map.
  - **Fall back to the cursor's current position.** Maximally
    permissive but loses the anchor metaphor.
  Recommendation: ship "refuse and hint" first; revisit if users
  ask for the fallback.
- **User wants to anchor to an older arrow, not the most recent.**
  Two paths: (a) select the older arrow first via the select tool,
  then hold S/O; (b) hover any arrow tip while holding S/O to
  rebind the anchor visually. (b) is more fluid but more code.
  Defer to implementation.
- **User pans or zooms mid-preview.** The anchor stays bound to
  the arrow object (not to a screen position), so the preview line
  follows naturally. The relationship between anchor and the
  pending target click is in world coordinates; the viewport
  changes don't affect it.
- **The anchored arrow is later deleted (via eraser).** The
  sightline/overwatch becomes orphaned. Options: delete dependent
  marks on anchor deletion, leave them in place with an inferred
  apex, or visually flag them as orphaned. Probably "delete with
  the anchor" is least surprising — matches how erasing a unit
  in tabletop games removes its threat range.

## 7. Boundary

This document captures a design *decision* and the reasoning behind
it. It is not a full design — it doesn't specify component
boundaries, data model, integration with existing tool hooks, test
strategy, or migration. Those belong to the future-vocabulary
slice's own `/sc:design` pass, which should treat this document as
an *input* and produce a full design analogous to
`design_p0_slice.md`.

If the cone-family approach proves wrong in practice (e.g., users
consistently confuse short sightlines with arrows even after width
tuning), revisit and consider Idea 2 or a hybrid.
