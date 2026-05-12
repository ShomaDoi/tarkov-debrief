# P1 Slice — Tactical Mark Vocabulary

**Date:** 2026-05-11
**Inputs:** `claudedocs/tactical_input_design_2026-05-10.md`,
`claudedocs/design_p0_slice.md`,
`claudedocs/research_ergonomic_input_2026-05-10.md`
**Output type:** Architecture / component design — implementation
will follow via `/sc:implement`.
**Scope:** Expand the canvas vocabulary from "freehand + unit
markers" to the tactical-grammar primitives identified in the input
design. Operator color + phase (from P0) automatically apply to
the new marks. Direct manipulation lets users edit mark geometry
post-creation (sightlines and cones; arrows excluded — see §10.2).
Temporal replay, snap-to-shape (QuickShape), mobile touch
fallbacks, and sidebar removal are explicitly **deferred** to later
passes.

---

## 1. What this slice ships

P0 turned the canvas into a multi-author, phase-aware drawing
surface but left vocabulary at "freehand + four unit markers." P1
delivers the tactical grammar that surface was built to carry:
seven new mark types covering the patterns the input design
identifies as covering ~90% of tactical narration.

**Slice E — Shared tactical-mark infrastructure.** A
`MarkType` registry and a `useMark`-style hook factory that
encapsulates the four discrete-gesture interaction patterns
(`chained-click`, `chained-drag`, `point`, `text`). New
discrete-gesture marks plug into P0's keyboard / operator / phase
system without duplicating it. Pencil and arrow are separate —
they're continuous-capture tools that share a `useFreehand` factory
(see §5.1); they're not `MarkSpec` consumers. `useEraser` and
`useStamp` keep their bespoke hooks unchanged.

**Slice F — Movement arrow (freehand with arrowhead) + sightline
(chained from last arrow tip).** **Arrow** is an evolution of the
existing pencil tool: it uses fabric's `freeDrawingBrush` to
capture a curved freehand path exactly like `usePencil`, then on
`path:created` appends an arrowhead polygon at the path's final
point, oriented along the last segment's tangent. Curved arrows
are the right primitive for the use case — tactical narration is
"around that corner, up the stairs, then through the door," not
"point A to point B in a straight line." Solid by default,
dashed when phase is `plan` (the dashArray applies to the path
body; the arrowhead stays solid). **Sightline** is not a drag —
it auto-anchors at the *final point* of the most-recently-created
arrow path. On tool activation a preview line renders from that
anchor to the cursor, rotating live (15° angle snap by default;
hold `Shift` for free angle). A single click commits the sightline.
The tool then **auto-reverts to the arrow tool** — the narrative
pattern is arrow → sightline → arrow → sightline. If no arrow
exists yet, the tool soft-fails with a transient hint and reverts
to arrow.

**Slice G — Overwatch cone (chained from last arrow tip, drag
defines arc).** Like sightline, the cone's origin auto-anchors at
the most-recently-created arrow's tip. The user then drags: the
`mouse:down` point defines one edge of the cone (its direction
from origin), the cursor's live position defines the other edge,
and the release point's distance from the origin defines the
range. The preview renders continuously throughout the drag so
the user can estimate the final shape. Renders as a translucent
**circular sector** built with `fabric.Path` — origin + arc edges
+ curved arc closing across the far side at distance = range. The
two radial edges share the same length; the arc itself is a true
circular arc (SVG path `A` command). Spread is **fully unclamped**
at creation and at direct-manipulation time. Like sightline, the
tool soft-fails if no arrow exists yet and auto-reverts to the
arrow tool after commit.

**Slice H — Point marks: engagement X, sound ping, position dot.**
Single click drops a fabric primitive at the cursor.
**Engagement X** is a fixed red X glyph (a `fabric.Group` of two
crossed lines). **Sound ping** is three concentric rings (a
`fabric.Group` of three `fabric.Circle`s, fixed neutral-yellow).
**Position dot** is a single small operator-colored
`fabric.Circle`.

**Slice I — Text label.** Click on the canvas opens an inline
`fabric.IText` in edit mode at that point. Operator-colored. Tab or
Esc commits. Empty text auto-deletes on commit.

**Slice J — Radial expansion + keyboard bindings.** The P0
marker radial is renamed `TacticalRadial`. Seven of its eight
wedges hold tactical primitives (arrow, sightline, engagement X,
overwatch cone, sound ping, position dot, text label); the eighth
wedge opens a **sub-radial** containing the four unit markers
(PMC-thick, PMC-med, PMC-light, scav). The sub-radial keeps the
existing P0 marker UX intact behind one extra click — full
rationale and the alternative quadrant layout are in §9.1. New
tap bindings: `A` arrow, `S` sightline, `X` engagement X, `O`
overwatch cone, `I` sound ping, `D` position dot, `T` text. (`D`
is chosen for position dot because `P` is already bound to the
phase toggle in the live app — see §9.2.) Active tool is now also
persisted to localStorage alongside operator and phase
(completing the persistence triad — the input-design §8 "sticky
defaults" triad referenced *stamp* as the third element, but the
existing stamp tool keeps its marker URL in an in-memory ref only,
so the actual persisted triad is **tool + operator + phase**).

**Slice K — Direct manipulation handles.** Selected **sightlines**
expose a single endpoint control on the cursor-side end (the anchor
end is frozen). Selected **cones** expose three controls: origin
(re-anchor), apex (range + bisector angle), and spread (cone
half-angle). **Arrows** expose no custom controls in P1 — curved-
path editing is deferred (§10.2). Point marks and text labels keep
fabric's default single-object move-only selection. Dragging a
handle live-updates geometry; on `mouse:up` `useUndo`'s new
`modify` action pushes the edit to the undo stack (see §4.10 for
the undo extension that supports this).

---

## 2. What this slice does NOT ship (explicit non-goals)

- **Temporal replay / scrubber.** The input design's #5 lever. Each
  mark already timestamps via fabric's object-add, but no UI
  consumes timestamps in P1. Deferred — needs a temporal model and
  a separate UX pass.
- **QuickShape / snap-to-shape.** The input design's #4 lever
  (scribble → clean primitive after a 500 ms dwell). Out of P1.
  Marks created via the dedicated tools are already clean; freehand
  cleanup is a distinct workflow.
- **Mobile touch fallbacks.** Two-finger pan, three-finger redo,
  long-press stamp mode. Out of P1. The radial works on touch via
  the toolbar button (carried over from P0 §7.6); the new
  quasi-mode keys are keyboard-only by definition.
- **Sidebar removal + `react-color` deletion.** Cleanup of the now-
  vestigial sidebar from P0. Out of P1 (queued as a small tech-debt
  slice).
- **Engagement X variants** (contact vs. kill vs. spotted as
  visually distinct glyphs). P1 ships one neutral red X. Variants
  are a P2 concern once we see whether real squads actually need
  them or just use one mark + a text label.
- **Sound ping animation.** P1 ping is a static three-ring glyph.
  Animation only makes sense once replay exists.
- **Curved-arrow direct manipulation.** P1 arrows *are* curved
  freehand paths (§5.1). What's deferred is the *editing* of
  those curves post-creation — endpoint redirect, midpoint bend,
  partial retrace. No clean single-handle gesture exists for
  curved-path editing; deferring it keeps Slice K scoped to
  sightlines and cones. See §10.2.
- **Operator visibility toggling for tactical marks.** Inherited
  from P0 — toggling an operator off hides their tactical marks
  exactly the same way it hides their freehand strokes. No new
  work required, but called out so it's not re-designed.
- **Per-mark-type style customization.** Stroke width, opacity, and
  phase-on/off per mark type are out of scope. Each mark type has
  fixed styling tied to its semantic identity (engagement X is red;
  sightline is thin dashed; cone is translucent fill).
- **A `?` / Cmd+K shortcut overlay.** Still deferred from P0; the
  shortcut surface in P1 is larger but the case for an overlay is
  still weak without telemetry on user struggle.

---

## 3. Architecture overview

### 3.1 Where P0 left us

After P0:

- `useKeyboardShortcuts` centralizes all keyboard bindings; new
  bindings register declaratively.
- `src/tools/metadata.ts` tags any fabric object with
  `operatorId` + `phase` at creation (keys `__operatorId` and
  `__phase`; helpers `tagObject`, `readOperator`, `readPhase`).
- `src/state/operators.ts` and `src/state/phase.ts` own the
  active-operator and active-phase state with localStorage
  persistence. `Phase = "record" | "plan"`, default `"record"`,
  plan dash pattern exported as `PLAN_DASH_ARRAY` (`[10, 15]`).
- `TacticalRadial` (née `MarkerRadial`) renders an 8-wedge overlay
  with 4 filled wedges (markers) and 4 placeholders.
- The `Tool` union in `src/tools/tool.ts` knows about `select`,
  `pencil`, `eraser`, `marker`, `pan`. Spring-loaded variants
  (Space → pan, RMB → eraser) live in the keyboard hook.

P1 adds new tools, new components for tool affordances, and a new
manipulator layer — without changing any of P0's contracts.

### 3.2 New abstractions

```
                       App.tsx
                          │
       ┌──────────────┬───┴──┬──────────────────┐
       │              │      │                  │
   tool state    operator   phase        lastArrowTip
   (existing,    state      state        (NEW: Point|null,
   newly         (existing) (existing)   ref-owned, updated
   persisted                              on arrow commit)
   — §9.3)
       │              │      │                  │
       └──────┬───────┴──────┴──────────────────┘
              │
        useKeyboardShortcuts(canvas, bindings, refs)        (existing, extended)
              │
   ┌──────────┼──────────┬──────────┬──────────┬──────────┐
   │          │          │          │          │          │
useSelect  usePencil  useEraser  useStamp  useUndo    useMark(spec)    ← NEW factory
                                                          │
                  ┌───────────────┬───────────────┬────────────────┐
                  │               │               │                │
              useArrow      useSightline      useCone         usePointMark
              useText                                         (× engagement,
                                                              ping, dot)

  <TacticalRadial />       (existing component, expanded wedge set)
  <ManipulationHandles />  ← NEW: registers custom fabric controls per
                             mark type when a mark is selected
```

Five additions:

1. **`MarkType` registry** (`src/tools/marks/registry.ts`) — a
   const map keyed by `ToolType` (extended) that pairs each mark
   with its construction function, manipulation controls, and
   color-resolution rule (operator-colored vs. intrinsic). Covers
   the *new vector primitives* only — not arrow (see below).
2. **`useMark(spec)` hook factory** (`src/tools/marks/useMark.ts`)
   — accepts a `MarkSpec` describing the interaction pattern
   (`'chained-click' | 'chained-drag' | 'point' | 'text'`) and
   the fabric factory. Returns the same `{ onChoice }` shape as
   existing tool hooks so `App.tsx` wiring is uniform.
   *Two-point* is not in the union — arrow, the only would-be
   consumer, now extends pencil instead.
3. **`useFreehand`** factory or shared core
   (`src/tools/freehand/useFreehand.ts`) — refactors the freehand
   brush + `path:created` listener pattern out of the existing
   `usePencil`. Both `usePencil` and the new `useArrow` consume
   it. Arrow's only delta vs. pencil is a `path:created`
   postprocess that appends an arrowhead polygon and groups the
   result. This is the architectural answer to "arrow is an
   evolution of pencil, not a wholly new tool" (see §5.1).
4. **`registerControls(canvas)`** (`src/tools/marks/controls.ts`)
   — installs custom `fabric.Control` instances on tactical-mark
   classes. Activates on `selection:created` and tears down on
   `selection:cleared`. Curved arrows opt **out** (no endpoint
   controls in P1; see §10).
5. **`lastArrowTipRef`** (in `App.tsx`) — a ref-owned
   `Point | null` updated every time an arrow commits, set to the
   *final point* of the arrow's freehand path. Read by **both**
   the sightline tool and the overwatch cone tool to determine
   their anchor / origin point. Ref (not state) because the read
   happens inside fabric handlers; consumers don't need a re-
   render when it changes. Cleared on map switch.

### 3.3 Tool union extension

```ts
// src/tools/tool.ts — DESIGN
export enum ToolType {
  // existing
  select = "select",
  pencil = "pencil",
  eraser = "eraser",
  marker = "marker",
  pan = "pan",
  // new in P1
  arrow = "arrow",
  sightline = "sightline",
  cone = "cone",
  engagementX = "engagementX",
  soundPing = "soundPing",
  positionDot = "positionDot",
  text = "text",
}
```

The `Tool` type's `cursor` field carries each tool's distinct
cursor hint (e.g., crosshair for two-point, plus for point marks).

### 3.4 Mark color resolution

Operator color does not blanket-apply to tactical marks. Some marks
are semantic callouts whose color carries meaning independent of
authorship. The rule:

| Mark | Color rule | Rationale |
|---|---|---|
| Movement arrow | Operator | "Whose path is this?" |
| Sightline | Operator | "Whose line of fire?" |
| Overwatch cone | Operator (translucent fill) | "Whose sector?" |
| Position dot | Operator | "Where is the operator?" |
| Text label | Operator | "Whose note?" |
| Engagement X | **Fixed red** (`#D0312D`) | Contact is a fact, not an authorship marker |
| Sound ping | **Fixed neutral-yellow** (`#E6C229`) | A heard sound is environmental, not authored |

Engagement X and sound ping still carry the `operatorId` tag —
so toggling an operator off still hides "the engagement X Bravo
called out" — but the **fill color does not derive from operator
color**. This preserves the visual grammar of the marks while
keeping the visibility model uniform.

`registry.ts` encodes this as a `colorSource: 'operator' | 'fixed'`
field on each `MarkType` entry.

### 3.5 Phase (plan / record) treatment per mark type

P0 applied `strokeDashArray: PLAN_DASH_ARRAY` (= `[10, 15]`,
exported from `src/state/phase.ts`) to freehand paths when phase
was `plan`. For tactical marks, the rule generalizes but is not
universal:

| Mark | `plan` treatment |
|---|---|
| Arrow | Line dashed with `PLAN_DASH_ARRAY`; arrowhead stays solid (dashed arrowheads read poorly) |
| Sightline | Already dashed by default (`[6, 6]`); `plan` uses a tighter dash `[4, 4]` to distinguish from `record` |
| Cone | Reduced fill opacity (0.15 → 0.08) + dashed outline (use `PLAN_DASH_ARRAY`) |
| Engagement X | Reduced opacity (0.7 → 0.4) |
| Sound ping | Reduced opacity (0.7 → 0.4) |
| Position dot | Hollow (stroke only, no fill) |
| Text label | Italicized + dashed underline |

This generalizes "plan looks less committed than record" rather
than mechanically applying dashArray everywhere. Each mark's
registry entry carries an `applyPhase(obj, phase)` function so the
rule lives next to the mark definition.

### 3.6 Patterns reused from P0

| Pattern | Source | Reused for |
|---|---|---|
| Metadata helper (`tagObject`) | P0 §5.3 | All new mark types |
| Ref-mirror for `tool`/`setTool` mid-handler | `usePan` | `useMark` |
| `unerasable` allowlist | `useUndo` | Selection handles (so handle drags don't generate erase events) |
| Custom property pattern (`REPLAY`, `__operatorId`) | `useUndo` / metadata | Per-mark-type discriminator (`__markType`) |
| Toolbar `onChoice` shape | All P0 tools | Every new tool hook |
| Skip-when-input-focused (`isInput`) | `useUndo` | Inline text editor input detection |
| Versioned localStorage key | P0 operators/phase | Persisted active tool (`tarkov-debrief:tool:v1`) |

---

## 4. Slice E — Shared mark infrastructure

### 4.1 Design intent

Five of the seven new marks share enough lifecycle that copying the
event-handler skeleton seven times would be wasteful. The shared
parts are: read active operator + phase, attach `mouse:down`,
build the fabric object on drag-end or click, tag it with metadata,
call `canvas.requestRenderAll()`, optionally restore the previous
tool on commit (one-shot vs. sticky behavior).

The differences are: how many drag points define the mark, what
fabric object to build, what color rule to apply, what phase
treatment to apply. These live in the registry.

### 4.2 `MarkSpec` interface

```ts
// src/tools/marks/types.ts — DESIGN
export type MarkInteraction =
  | 'chained-click'  // anchor = lastArrowTip; cursor rotates preview; click commits (sightline)
  | 'chained-drag'   // anchor = lastArrowTip; drag defines arc + range (cone)
  | 'point'          // single click drops mark (X, ping, dot)
  | 'text';          // click opens inline editor

// Arrow is not a MarkInteraction — it extends pencil's freehand
// mechanism (see §5.1 and the useFreehand factory).

export type MarkSpec = {
  toolType: ToolType;
  interaction: MarkInteraction;
  colorSource: 'operator' | 'fixed';
  fixedColor?: string;                 // required iff colorSource === 'fixed'
  cursor: string;                       // 'crosshair', 'cell', etc.
  oneShot: boolean;                     // revert to previous tool after commit?
  build: (params: MarkBuildParams) => fabric.FabricObject;
  applyPhase: (obj: fabric.FabricObject, phase: Phase) => void;
  controls?: ManipulationControls;      // optional; see Slice K
};

export type MarkBuildParams =
  | { kind: 'chained-click'; anchor: Point; end: Point; color: string }
  | { kind: 'chained-drag';  anchor: Point; dragStart: Point; dragEnd: Point; color: string }
  | { kind: 'point';         at: Point; color: string }
  | { kind: 'text';          at: Point; color: string };
```

Each new mark file (`marks/arrow.ts`, `marks/sightline.ts`, etc.)
exports a `MarkSpec`. The registry imports them and indexes by
`toolType`.

### 4.3 `useMark` hook factory

```ts
// src/tools/marks/useMark.ts — DESIGN
export function useMark(
  canvas: fabric.Canvas | null,
  tool: Tool,
  setTool: SetToolFn,
  spec: MarkSpec,
  activeOperator: Operator | null,
  phase: Phase,
): { onChoice: () => void } { /* ... */ }
```

The hook:

1. **Registers handlers when active** — attaches `mouse:down` and
   (for two-point / region) `mouse:move` + `mouse:up`.
2. **Resolves color at click time** — operator color or fixed.
3. **Builds the fabric object** via `spec.build`.
4. **Tags metadata** via `tagObject` (operator + phase) and adds
   `__markType` as a separate property via `tagMarkType`.
5. **Applies phase treatment** via `spec.applyPhase`.
6. **Calls `canvas.add(obj)`** and `requestRenderAll`.
7. **One-shot return** — if `spec.oneShot`, switches back to the
   previous tool (point marks behave like Excalidraw's "place once,
   resume select"). Otherwise stays sticky.
8. **Uses the ref-mirror pattern** from `usePan` so mid-handler
   tool flips don't tear down the in-flight handler.

`oneShot` defaults are: point marks (engagement X, sound ping,
position dot) **= sticky** (the tactical-narration pattern is
"place 5–10 of these in a row"), text label **= one-shot** (one
text edit per invocation), sightline and overwatch cone **=
one-shot reverting to arrow** (see below). Arrow's stickiness is
inherited from pencil — `useFreehand` is sticky by construction —
and isn't expressed via `MarkSpec`.

For sightlines and cones specifically, "revert" doesn't mean
"back to whatever tool was active before" — it means **back to
the arrow tool**, unconditionally. This is a narrative-driven
decision: both marks are annotations on arrows, so the workflow
loops arrow → sightline/cone → arrow → sightline/cone. The
`MarkSpec` exposes this as a `revertTo?: ToolType` field
overriding the default "previous tool" behavior; sightline and
cone both set `revertTo: ToolType.arrow` in P1.

### 4.4 (No two-point pattern in P1)

The earlier draft of this design included a two-point drag pattern
intended for the arrow tool. Arrow now extends `usePencil` via the
`useFreehand` factory (§5.1) and produces a curved path with an
appended arrowhead, not a straight two-point line. Two-point is
not used by any P1 mark and is therefore not part of
`MarkInteraction`. It can be reintroduced in a later slice if a
future mark type needs it.

The `lastArrowTipRef` update — formerly described here as "on
commit, set ref to the arrow's `end`" — moves into §5.1's
description of `useFreehand`'s arrow postprocess, where the tip is
the final point of the path's command array.

### 4.5 Chained-click interaction pattern (sightline)

The sightline is not a drag. It is anchored at the tip of the most
recently created arrow, and the user uses cursor movement +
single-click to set its direction and length.

```
on tool activation:
  if lastArrowTipRef.current === null:
    // No arrow yet — soft-fail so the user isn't stranded in a
    // mode that can't do anything. The hint is transient (toast
    // or floating label near the cursor).
    showTransientHint("Draw an arrow first")
    setTool(arrow)            // hard revert
    return
  anchor = lastArrowTipRef.current
  render preview line from anchor to current pointer position
  attach mouse:move + mouse:down handlers

mouse:move  → update preview end to cursor position
              apply 15° snap unless Shift is held
mouse:down  → spec.build({ anchor, end: previewEnd }), commit
            → tagObject + applyPhase
            → tear down preview
            → setTool(arrow)  // unconditional revert (see §4.3)
Esc         → tear down preview without committing
            → setTool(arrow)  // unconditional revert
```

**Why anchor is frozen, not tethered.** The sightline records the
anchor coordinate at creation; it does not hold a reference to the
arrow object. If the user later drags the arrow head (via direct
manipulation, §10), the sightline's anchor does **not** follow.
Rationale: arrows and sightlines are independent statements in
the debrief artifact; coupling them would invite a class of
surprising-edit bugs ("I moved this arrow and lines I'd forgotten
about all moved with it"). Tethering is a P2 question (§15).

**Modifier behavior:**

- `Shift` held: free angle (15° snap is the default for chained
  sightlines, inverse of the two-point pattern).

**Most-recent-arrow rule.** `lastArrowTipRef` is updated on every
arrow commit. It is **not** consulted when arrows are deleted
(via eraser or undo); a deleted arrow's tip remains a valid
anchor until a new arrow replaces it. This is the simpler
semantic; revisit in P2 if user testing shows it confuses people.

### 4.6 Chained-drag interaction pattern (cone)

The overwatch cone shares the chained pattern with sightline — its
origin is anchored at `lastArrowTipRef.current` — but instead of a
single click setting one direction, the user performs a two-point
drag that defines the arc's angular spread *and* its range.

```
on tool activation:
  if lastArrowTipRef.current === null:
    showTransientHint("Draw an arrow first")
    setTool(arrow)            // hard revert
    return
  origin = lastArrowTipRef.current
  // No preview yet — user must press to define edge 1.
  attach mouse:down handler

mouse:down at A:
  edge1 = normalize(A - origin)
  begin preview rendering (initially just a line from origin to A)
  attach mouse:move + mouse:up handlers

mouse:move to B':
  edge2 = normalize(B' - origin)
  range = |B' - origin|
  if |B' - A| < MIN_DRAG: preview = single line (degenerate sector)
  else:                   preview = full triangular sector with
                                    vertices [origin,
                                              origin + range*edge1,
                                              origin + range*edge2]

mouse:up at B:
  if |B - A| < MIN_DRAG: discard (click-cancel, no commit)
  else:
    spec.build({ anchor: origin, dragStart: A, dragEnd: B })
    tagObject + applyPhase
    canvas.add(polygon)
    setTool(arrow)          // unconditional revert (see §4.3)

Esc during preview:
  tear down preview, no commit
  setTool(arrow)
```

**Why preview begins at `mouse:down`, not on activation.** The
sightline's single-click commit makes it natural to preview
immediately on activation (the user knows what they're about to
commit). The cone's preview can't be drawn without an edge-1
direction, which the user hasn't supplied yet. Showing nothing
until `mouse:down` avoids a confusing "ghost cone follows your
cursor" state.

The user's stated requirement — *preview shown at all times during
drawing* — is satisfied: from `mouse:down` through `mouse:up` the
preview is live and continuously updated. The "drawing" phase is
the drag itself.

**Anchor freeze rule** is identical to sightline (§4.5): the
origin is recorded at activation time and does *not* follow the
arrow if the arrow is later edited.

**Degenerate-edge edge case.** If `mouse:down` lands at or
extremely close to `origin` (within MIN_DRAG), edge1's direction is
undefined. The handler discards the gesture and emits a transient
"point further from the operator's position" hint. Acceptable
because the user can immediately re-click without losing the
chained anchor — the tool stays active.

### 4.7 Point interaction pattern

```
mouse:down  → commit immediately at cursor (no drag step)
```

### 4.8 Text interaction pattern

```
mouse:down  → commit a fabric.IText at cursor, immediately enter
              edit mode (obj.enterEditing(); obj.selectAll())
              The hook adds an 'editing:exited' listener that:
                - deletes the object if final text is empty/whitespace
                - tags the object and commits otherwise
```

### 4.9 Testing

`useMark.test.ts` covers the lifecycle generically using a mock
`MarkSpec` per interaction kind, including:

- chained: tool activation with `lastArrowTipRef === null` triggers
  hint + revert, no preview attached
- chained: cursor movement updates preview; Shift disables 15° snap
- chained: single click commits and reverts to `arrow`, not to the
  previous tool

Per-mark tests (`marks/arrow.test.ts`, etc.) cover geometry and
styling.

Mock-canvas needs no extension — P0's `mockCanvas.ts` already
supports the events used here.

### 4.10 Undo extension: API surface + `modify` action

P1 lifecycles produce mutations that P0's `useUndo` can't model:

1. **Preview objects** (cone drag, sightline rotation) — added
   and removed inside a single user gesture; neither should
   appear on the undo stack.
2. **Path→group swap** in `useFreehand`'s arrow postprocess —
   fabric has *already* emitted `object:added` for the raw path
   by the time `path:created` fires, so the path's add is
   already on the stack. The postprocess then does
   `canvas.remove(path)` + `canvas.add(group)`. We need the
   stack to end up with exactly one entry: `add group`.
3. **Text auto-delete-on-empty** — an `IText` is added in edit
   mode; if the user exits with empty text, it's removed. The
   add+remove pair should be invisible to undo. If the user
   *does* commit non-empty text, the IText is already on the
   canvas (no fresh `object:added` will fire), but the stack
   needs an entry that "undo removes the IText."
4. **Handle drags** (Slice K) — `object:modified` events that
   P0's hook ignores; handle drags must be undoable.

These can't all be solved by a single sentinel. (2) needs
retroactive stack manipulation; (3-commit) needs to push an
add action without a fabric event; (4) needs a new action type.
`useUndo`'s API has to widen.

**Extended `useUndo` return shape:**

```ts
// src/tools/undo.ts — DESIGN (extension)
return {
  // existing
  onUndo,

  // NEW — transient flag handling. Callers tag objects to
  // suppress the listeners' default record-on-add /
  // record-on-remove. Object remains transient until
  // explicitly cleared.
  markTransient:   (obj: fabric.FabricObject) => void,
  unmarkTransient: (obj: fabric.FabricObject) => void,

  // NEW — explicit stack manipulation for callers that can't
  // express their intent via the auto-recording listeners.
  popLastAction:   () => Action | null,        // for the
                    // arrow path→group swap (§5.1): pops the
                    // path's auto-recorded add so we can
                    // replace it with the group's add.
  recordAdd:       (obj: fabric.FabricObject) => void,
                    // for the text commit (§8.2): the IText
                    // is already on the canvas and we want
                    // it in the undo stack now that commit
                    // succeeded — but no fresh object:added
                    // event will fire, so we push directly.

  // NEW — modify support. `serialize` / `deserialize` come
  // from the mark-spec registry; useUndo doesn't know the
  // per-mark state shape, only how to invoke the
  // (de)serializer.
  // (No public method needed for callers; the canvas-level
  // object:modified subscription does the work internally.)
};
```

```ts
// Internal sentinels.
const REPLAY    = '__undoReplay' as const;  // existing
const TRANSIENT = '__transient'  as const;  // new
```

**Behavioral rules:**

- `markTransient(obj)` sets `obj.__transient = true`.
  Subsequent `object:added` and `object:removed` events whose
  target carries this flag are skipped by the auto-recording
  listeners.
- `unmarkTransient(obj)` deletes the flag. Future events behave
  normally.
- `popLastAction()` removes and returns the top stack entry.
  Returns `null` if the stack is empty. Used by the arrow
  postprocess to retract the path's auto-recorded add.
- `recordAdd(obj)` pushes `{ type: 'add', object: obj }`
  manually — no event, no transient-flag check, no
  REPLAY-bypass. Useful when an object is already on the
  canvas but was added under a transient guard that's since
  been cleared.
- `recordRemove(obj)` (parallel, for completeness; no P1
  caller uses it but it's symmetric with `recordAdd`).

**Modify action.** A new variant of the `Action` discriminated
union:

```ts
type Action =
  | { type: 'add';    object: fabric.FabricObject }
  | { type: 'remove'; object: fabric.FabricObject }
  | { type: 'modify'; object: fabric.FabricObject;
                      before: SerializedState;
                      after: SerializedState };
```

`SerializedState` is a per-mark-type blob:

- Sightline: `{ x1, y1, x2, y2 }`.
- Cone: `ConeParams` from §6.3 — `(origin, startAngle, sweep,
  range)`.
- Text: `{ text }` (added if/when text editing of *committed*
  ITexts becomes a tracked action).
- Arrow (future, if curved-path editing arrives): would be the
  path-data string. Out of scope for P1.

Each mark spec exports a `serialize(obj)` / `deserialize(obj,
state)` pair. `useUndo` invokes them when pushing and replaying
modify actions.

Subscribe to `object:modified` on the canvas. On fire:

```ts
const spec = registryFor(readMarkType(target));
if (!spec?.serialize) return;        // not a modify-aware mark

const before = lastSnapshotFor(target);   // captured at
                                           // selection time
const after  = spec.serialize(target);
if (before && !equal(before, after)) {
  stack.push({ type: 'modify', object: target, before, after });
}
```

`lastSnapshotFor` is a `WeakMap<fabric.Object, SerializedState>`
populated on `selection:created` (so we know the pre-edit state
when the modify finishes). Cleared on `selection:cleared`.

On undo of a modify action:

```ts
(target as any)[REPLAY] = true;
spec.deserialize(target, action.before);
canvas.requestRenderAll();
delete (target as any)[REPLAY];
```

`serialize` / `deserialize` live on the mark-spec registry
(parallel to `build` / `applyPhase`), so each mark type owns its
own state shape and `useUndo` stays type-agnostic.

**Testing — `undo.test.ts` (extension):**

- `markTransient(obj)` + `canvas.add(obj)` does not push.
- `markTransient(obj)` + `canvas.remove(obj)` does not push.
- An object marked transient *after* its `object:added` event
  still has that prior add on the stack (the flag is honored at
  event time, not retroactively). The caller is responsible for
  calling `popLastAction()` if a retroactive pop is needed —
  the arrow path→group swap (§5.1 step 8) does this.
- `popLastAction()` on an empty stack returns `null`.
- `recordAdd(obj)` pushes an `add` action; subsequent undo
  removes the object. Verifies the manual-record path doesn't
  rely on a synthetic fabric event.
- `object:modified` on a mark with a registered `serialize`
  produces a `modify` action; undoing it restores the previous
  state via `deserialize`.
- `object:modified` on a mark *without* a registered
  `serialize` (e.g., a P0 freehand pencil path) is ignored —
  the stack length doesn't change.
- Multiple sequential modifies on the same object produce
  multiple stack entries (each undo step rolls back one edit).
- Replay sentinel still suppresses re-entry exactly as before
  (regression: P0 undo paths unchanged).

---

## 5. Slice F — Movement arrow + chained sightline

### 5.1 Arrow (freehand with arrowhead)

The arrow tool is an evolution of `usePencil`: same brush, same
event lifecycle, same operator/phase tagging, **plus** a
`path:created` postprocess that appends an arrowhead at the path's
final point. The user gestures naturally — a scribbled curve
through the corridors and around the room — and gets a curved
arrow that points where the gesture ended.

**Why curved, not straight.** Tactical narration is shaped by
terrain: "around that corner, up the stairs, then through the
door." A straight two-point line can't express that path; the user
either has to chain many short arrows or settle for a misleading
abstraction. Freehand-with-arrowhead is the right primitive for
the use case the input design describes (§1).

**Shared core: `useFreehand`.**

```ts
// src/tools/freehand/useFreehand.ts — DESIGN
type FreehandSpec = {
  toolType: ToolType;             // pencil or arrow
  brushColor: () => string;       // resolved from active operator
  brushWidth: number;             // 3 px in canvas units
  onPathCreated?: (
    path: fabric.Path,
    canvas: fabric.Canvas,
  ) => fabric.FabricObject;       // optional postprocess; may
                                  // return a different fabric obj
                                  // (e.g., a Group containing path
                                  // + arrowhead); falls back to
                                  // the path itself if undefined.
};

useFreehand(
  canvas, tool, setTool, spec, operator, phase
): { onChoice }
```

`usePencil` becomes `useFreehand({ ..., onPathCreated: undefined })`.
`useArrow` becomes `useFreehand({ ..., onPathCreated: appendArrowhead })`.
Both keep their distinct `ToolType` (so the toolbar, radial,
keyboard binding, and sticky-tool persistence treat them as
distinct surfaces), but they share one body of brush+listener+
tag+phase logic.

**Refactor scope on `usePencil`.** The existing hook currently
inlines the brush setup, `path:created` listener, metadata tag,
and dashArray application. The refactor lifts those into
`useFreehand` and reduces `usePencil` to a configuration record
(`onPathCreated: undefined`). The arrow tool is `useFreehand` with
`onPathCreated: appendArrowhead`. Existing pencil tests should
pass with no modifications. **Decision (per §15 R-G): refactor.**

**`appendArrowhead(path, canvas)`** (the arrow postprocess):

1. Read the path's final point from `path.path` (fabric stores
   commands like `[['M', x0, y0], ['Q', cx, cy, x1, y1], ...]`).
   The final point is the last two entries of the last command.
2. Compute the *tangent direction* at the final point. For the
   common case where the last command is `Q` (quadratic Bézier),
   the tangent at t=1 is `normalize(endpoint - controlPoint)`.
   For an `L` or `M` command, use the previous point as the
   control. Fall back to `(1, 0)` if the path is degenerate (a
   single point — shouldn't happen but guard anyway).
3. Build an arrowhead `fabric.Polygon` (isoceles triangle, base
   10 px, height 14 px) positioned at the final point and rotated
   to align with the tangent.
4. Group the path + arrowhead into a `fabric.Group([path, head])`.
   The group becomes the selectable / erasable unit.
5. Tag the group via `tagObject(group, operator, phase)` and
   `tagMarkType(group, 'arrow')`.
6. Apply phase: if `plan`, set `path.strokeDashArray =
   PLAN_DASH_ARRAY` (the arrowhead stays solid — small dashed
   triangles render poorly).
7. **Update `lastArrowTipRef.current = finalPoint`** so the next
   sightline or cone activation has an anchor.
8. Return the group from `onPathCreated`; `useFreehand` replaces
   the just-added path on the canvas with the group. Fabric has
   *already* emitted `object:added` for the raw path by the time
   `path:created` fires, so `useUndo` has recorded `{ type:
   'add', object: path }`. The swap therefore looks like this
   (uses the §4.10 API):

   ```ts
   undo.popLastAction();           // retract the path's
                                   // auto-recorded add
   undo.markTransient(path);       // skip the upcoming remove
   canvas.remove(path);            // skipped by useUndo
   canvas.add(group);              // recorded normally as
                                   // { type: 'add', object: group }
   ```

   Net stack effect: one `add` entry for the group. The path
   never appears in history. On undo, the group is removed
   (which is what the user wants — they expect "Ctrl+Z removes
   the arrow I just drew").

   The group itself is **not** marked transient — it should
   enter history on its `canvas.add(group)` so future undos
   work.

**Geometry:**

- Stroke width: 3 px in canvas units. Inherits the pencil's
  existing zoom compensation via `zoom.ts` if any (no new
  scaling logic needed).
- Arrowhead: isoceles, 10 px base × 14 px height, filled with
  path's stroke color.
- Color: operator color at creation time, resolved via
  `spec.brushColor()` at brush configuration time.

**Phase treatment:**

- `record`: path solid, arrowhead solid.
- `plan`: path `strokeDashArray: PLAN_DASH_ARRAY`, arrowhead solid.

**Why a group, not separate objects.** Keeping the path and the
arrowhead bound by a fabric.Group means: eraser deletes both
atomically, undo restores both atomically, selection picks both at
once. Slice K (direct manipulation) does **not** expose endpoint
controls for arrows in P1 — curved paths have no meaningful "tail"
or "head" handle short of redrawing — so the group's transform
semantics never become a problem.

### 5.2 Sightline

**Fabric representation.** `fabric.Line` from `anchor` to `end`,
positioned in canvas world coordinates (no group — the visual is
simple enough).

- `anchor` = `lastArrowTipRef.current` at the moment the sightline
  tool was activated.
- `end` = cursor position at the moment of commit-click.

**Interaction mechanics** are defined in §4.5 (chained pattern).
Summary: activate tool → preview emanates from last arrow tip →
cursor rotates preview → single click commits → tool auto-reverts
to arrow.

**Geometry:**

- Stroke width: 1.5 px.
- Default dash: `[6, 6]` (sightlines are dashed regardless of
  phase — that's their visual identity).
- Color: operator color at creation time.
- No arrowhead.

**Angle snap:**

- **Default** (no modifier): snap end direction to 15° increments
  from anchor. The tactical design's §1 calls this out as the
  sightline-specific quasi-mode.
- **`Shift` held**: free angle.

**Phase treatment:**

- `record`: dash `[6, 6]`.
- `plan`: dash `[4, 4]` (tighter dash distinguishes plan sightlines
  from record ones at a glance).

**No-anchor fallback.** If `lastArrowTipRef.current === null` when
the tool activates, the tool soft-fails per §4.5 — no preview is
shown, a transient hint surfaces, and the tool reverts to arrow.

### 5.3 Keyboard bindings

- `A` tap → activate arrow tool (sticky; place multiple arrows in
  succession; repeat `A` while in arrow mode → no-op).
- `S` tap → activate sightline tool (transient; preview renders
  immediately, one click commits, then unconditionally reverts to
  arrow tool — see §4.3 for why "arrow" not "previous tool").

`S` is meaningful from any tool, not just from arrow. Pressing `S`
from eraser still commits a sightline and lands the user in arrow
afterward. This may surprise users who expect "previous tool"
semantics; confirmed in §15.

### 5.4 Testing

- `freehand/useFreehand.test.ts`: brush configuration applied;
  `path:created` listener invokes `spec.onPathCreated` when
  provided, otherwise tags the raw path; metadata tagging happens
  regardless; refactored pencil tests still pass.
- `freehand/arrowhead.test.ts`: tangent computed from final `Q`
  segment matches `normalize(end - control)`; arrowhead polygon
  vertices are correct for axis-aligned and 45° tangents;
  degenerate single-point path returns the `(1, 0)` fallback
  tangent.
- `arrow.test.ts`: a freehand drag produces a `fabric.Group`
  whose children are `[path, arrowhead]`; group is tagged with
  `__markType: 'arrow'`; `plan` phase dashes the path but not
  the arrowhead; `lastArrowTipRef.current` equals the path's
  final point after commit; the path→group swap does NOT enter
  the undo stack (R1c / §4.10).
- `marks/sightline.test.ts`: activation with null `lastArrowTip`
  → soft-fail path; activation with valid anchor → preview render;
  cursor movement → preview rotation; commit click → builds line
  from anchor to click point; angle-snap math (input 17° → snapped
  15°, input 23° → 30°); Shift disables snap; commit reverts to
  arrow regardless of prior tool.

---

## 6. Slice G — Overwatch cone (chained-drag)

### 6.1 Interaction summary

Defined in §4.6. Origin is anchored at `lastArrowTipRef`. The
`mouse:down` point defines edge 1's direction from origin; the
release point defines edge 2's direction AND the range. The tool
is one-shot and auto-reverts to arrow.

### 6.2 Fabric representation

`fabric.Path` built from an SVG path-data string describing a
true circular sector:

```
M origin.x origin.y
L B.x B.y
A range range 0 largeArcFlag sweepFlag C.x C.y
Z
```

Where:

- `origin = lastArrowTipRef.current` at activation time.
- `B = origin + range * (cos(startAngle), sin(startAngle))` —
  the first radial edge endpoint.
- `C = origin + range * (cos(startAngle + sweep),
  sin(startAngle + sweep))` — the second radial edge endpoint.
- `largeArcFlag = |sweep| > π ? 1 : 0`.
- `sweepFlag = sweep > 0 ? 1 : 0` (SVG's sweep-flag convention;
  see §6.3 for sign convention rationale and the
  implementation-time verification note).

The path data is generated from the four-parameter store
`(origin, startAngle, sweep, range)` defined in §6.3. The
signed-sweep representation is what makes unambiguous
reconstruction of reflex sectors possible — two edge directions
alone underdetermine the sector (they admit both a minor and a
major solution), so the *direction the user dragged in* must be
part of the stored params, not derivable from the endpoints.

This is a true circular sector (option C(ii) in the design
review): the chord between B and C is replaced with the actual
arc, so cones visually read as "fan from the operator," not
"triangle with a flat back."

### 6.3 Stored parameterization

The path-data string is generated on demand; the *source of truth*
is a four-parameter store:

```ts
type ConeParams = {
  origin:     Point;
  startAngle: number;  // radians; angle of the first edge from
                       // +X, in fabric's screen coords (Y-down)
  sweep:      number;  // SIGNED radians; positive = the CCW or
                       // CW direction the user dragged in (which
                       // one is CCW vs CW in screen pixels
                       // depends on the Y-axis convention; verify
                       // at implementation time). |sweep| is
                       // clamped to [MIN_SWEEP, 2π].
  range:      number;
};
// stored as: (obj as any).__cone = ConeParams
```

**Why signed `sweep` instead of `(bisector, halfSpread)`.** A
prior draft of this doc used `(origin, bisector, range,
halfSpread)`, derived as `bisector = normalize(edge1 + edge2)`
and `halfSpread = acos(dot(edge1, bisector))`. That
parameterization only recovers the *minor*-angle solution — it
cannot represent a reflex cone (`|sweep| > π`) because `acos`
ranges over `[0, π]` and `edge1 + edge2` always points into the
minor sector. With unclamped spread per §15.1 R-D, we have to
distinguish minor and reflex sectors; the only invariant that
carries that information through is the signed angular
displacement of the cursor during the drag (§6.5).

**Derivation at creation time** (also see §6.5 for the live
preview math):

- `startAngle = atan2(dragStart.y - origin.y, dragStart.x -
  origin.x)`.
- `sweep` is the *integrated* signed angular delta of the
  cursor's position around `origin` from `mouse:down` to
  `mouse:up`. See §6.5 for the integration step that handles
  branch-cut crossings correctly.
- `range = |dragEnd - origin|`.

**Direct manipulation** (Slice K) mutates these params and
regenerates the path-data string. The path object's `path`
property is reassigned and `canvas.requestRenderAll()` invoked.
Specifically:

- `origin` control: translate `origin`; other params preserved.
- `apex` control (positioned at `origin + range *
  (cos(startAngle + sweep/2), sin(startAngle + sweep/2))`):
  drag updates the bisector direction and the range. The new
  bisector angle θ_b is `atan2(newApex - origin)`; the new
  `startAngle = θ_b - sweep/2`. New `range = |newApex - origin|`.
  **`sweep` (magnitude AND sign) is preserved.**
- `spread` control (positioned on the arc at the first edge,
  i.e., at `origin + range * (cos(startAngle), sin(startAngle))`,
  but moves tangentially along the arc): drag updates `|sweep|`
  symmetrically around the bisector (so the *bisector direction*
  stays put while the arc widens or narrows), preserving the
  sign of `sweep`. Clamped to `[MIN_SWEEP, 2π]` only at the
  extremes — no 90° cap.

### 6.4 Styling

- Fill: operator color at 15% opacity (`record`) or 8% (`plan`).
- Stroke: operator color at full opacity, 1.5 px width. When
  `plan`, stroke uses `PLAN_DASH_ARRAY`.
- `selectable: true`, `evented: true` (default).

### 6.5 Preview rendering

During the drag (between `mouse:down` and `mouse:up`), a temporary
`fabric.Path` previews the cone. The temp path is `evented: false`
and is marked `__transient: true` so `useUndo` skips both its
`object:added` and its `object:removed` (see §4.10). It's removed
on `mouse:up`; the *final* committed path enters the undo stack
normally.

The preview begins as a degenerate sliver (`sweep` = 0) at the
moment of `mouse:down` and opens out as the cursor moves. This
satisfies the "preview shown at all times during drawing"
requirement (§1 Slice G): from `mouse:down` through `mouse:up` the
visual reflects the eventual shape.

**Signed-sweep integration.** The cone's `sweep` is *not* the
naive angle between the start vector and the current cursor
vector (which would max out at ±π and never reach reflex). It's
the cumulative signed angular displacement of the cursor around
the origin since `mouse:down`.

Algorithm (executed on every `mouse:move`):

```
state at mouse:down:
  startAngle = atan2(dragStart - origin)
  prevAngle  = startAngle
  sweep      = 0

on mouse:move with cursor at P:
  curAngle = atan2(P - origin)
  dθ       = wrapToPi(curAngle - prevAngle)
              // wrapToPi maps (-3π, 3π) → (-π, π] so a frame-to-
              // frame angular jump never exceeds π in either
              // direction — at typical mouse-move rates this is
              // a safe assumption.
  sweep    += dθ
  sweep    = clamp(sweep, -2π, 2π)
              // a full revolution caps the cone; further cursor
              // travel in the same direction is ignored.
  prevAngle = curAngle
  range     = |P - origin|
  // regenerate preview path-data from
  // (origin, startAngle, sweep, range) per §6.2
  preview.set({ path: parsePathData(...) })
  canvas.requestRenderAll()
```

`wrapToPi` ensures that crossing the ±π branch cut of `atan2`
doesn't flip the integrated sweep by 2π. As long as the cursor
moves smoothly (no per-frame angular jumps near π — which would
require the cursor to teleport across the screen at sub-1-frame
latency), the integration is robust.

`MIN_SWEEP` (used in the click-cancel check at `mouse:up`): a
small threshold like 0.05 rad (~3°). If `|sweep| < MIN_SWEEP` AND
`|cursor - mouseDown| < MIN_DRAG`, treat the gesture as a click-
cancel (no commit). The combined threshold avoids committing
either a vanishingly thin sliver or an arbitrarily narrow but
visually present sliver.

### 6.6 Keyboard

- `O` tap → activate cone tool (one-shot; reverts to arrow on
  commit or Esc; soft-fails to arrow if no anchor exists).

### 6.7 Testing

- Activation with `lastArrowTipRef === null` → soft-fail path,
  hint surfaced, tool reverts to arrow, no preview attached.
- **Minor-sector creation:** `mouse:down` at A, drag straight to
  B without crossing past the anti-bisector, release. Asserts:
  `origin = anchor`, `startAngle = atan2(A - origin)`,
  `sign(sweep) =` direction the cursor went, `|sweep|` equals
  the angle between (A - origin) and (B - origin), `range =
  |B - origin|`, `|sweep| < π`.
- **Reflex-sector creation:** `mouse:down` at A, drag the cursor
  the "long way around" past the anti-bisector, release at B.
  Asserts: `|sweep| > π`. The end-point (B - origin) lies on
  the *complement* of the minor angle between (A - origin) and
  (B - origin) — only achievable via cumulative integration,
  not via `acos(dot(...))`. The rendered path's `A` command has
  `largeArcFlag = 1`.
- **Branch-cut crossing:** drag in a circle that crosses ±π in
  `atan2` (e.g., start on the +X axis, drag down-left, pass
  through the −X axis). Asserts: `sweep` is continuous through
  the crossing (no 2π discontinuity); the rendered cone matches
  the visual cursor path.
- **Full revolution clamp:** drag continuously for more than 2π
  around the origin. Asserts: `sweep` clamps to ±2π (sign
  matches drag direction); further cursor motion in the same
  direction does not change `sweep`.
- **Path-data structure:** rendered SVG path-data starts with
  `M`, contains exactly one `A` arc command with `rx = ry =
  range`, and ends with `Z`.
- **largeArcFlag rule:** `largeArcFlag = 1` iff `|sweep| > π`.
- **sweepFlag rule:** `sweepFlag = (sweep > 0 ? 1 : 0)`. (The
  visual direction this corresponds to depends on the Y-axis
  convention — verify with a fabric snapshot test in the
  implementation.)
- **Click-cancel:** `|sweep| < MIN_SWEEP` AND `|cursor -
  mouseDown| < MIN_DRAG` at `mouse:up` → no commit, tool stays
  mounted (only commit triggers revert).
- **`ConeParams` round-trips:** derive from a known drag,
  regenerate path-data, re-parse, recover the same
  `(origin, startAngle, sweep, range)`.
- **Preview cone carries `__transient: true`:** asserted against
  the undo stack length — drawing a cone produces exactly one
  net `add` entry (the committed path), never the preview.
- **Esc** cancels the preview and reverts to arrow.

---

## 7. Slice H — Point marks: engagement X, sound ping, position dot

### 7.1 Engagement X

**Fabric representation.** `fabric.Group` of two `fabric.Line`s
crossed at center: `(-8,-8)→(8,8)` and `(-8,8)→(8,-8)` in group-
local units, with the group positioned at click point.

- Stroke width: 3 px.
- Color: fixed `#D0312D`.

**Phase treatment:**

- `record`: opacity 1.0.
- `plan`: opacity 0.5.

### 7.2 Sound ping

**Fabric representation.** `fabric.Group` of three concentric
`fabric.Circle`s with radii `[4, 9, 14]` and matching `stroke`
(`#E6C229`), no fill, stroke widths `[2, 1.5, 1]` (inner thicker
to imply origin).

**Phase treatment:**

- `record`: opacity 1.0.
- `plan`: opacity 0.5.

### 7.3 Position dot

**Fabric representation.** `fabric.Circle` with radius 6 px, fill
operator color, no stroke.

**Phase treatment:**

- `record`: fill solid.
- `plan`: fill removed, stroke added (operator color, 2 px,
  no fill).

### 7.4 Keyboard

- `X` tap → engagement X tool.
- `I` tap → sound ping tool.
- `D` tap → position dot tool.

All three sticky. (Letter choice rationale: `X` is canonical for
"X marks the spot", `I` for "I heard...", `D` for "dot." `P` was
the original mnemonic for "position" but is already bound to the
phase toggle in the live app — see App.tsx ~line 440 — so `D`
takes over here.)

### 7.5 Testing

Per-mark tests verify: build at given point, correct intrinsic
color, phase treatment applied, `__markType` discriminator set.

---

## 8. Slice I — Text label

### 8.1 Fabric representation

`fabric.IText` (not `fabric.Textbox` — IText is single-line and
fits the "0:45 — flank from north" use case better; multi-line
labels are a P2 concern).

- Font family: existing site typeface (Bender, per design system).
- Font size: 16 px.
- Fill: operator color.
- No background or border by default.

### 8.2 Inline edit lifecycle

Uses the §4.10 undo API (`markTransient`, `unmarkTransient`,
`recordAdd`):

```
mouse:down on canvas
  → it = new fabric.IText('', ...)
  → undo.markTransient(it)         // skip the upcoming add
                                   // and any subsequent remove
  → canvas.add(it)                 // skipped by useUndo
  → it.enterEditing()
  → it.hiddenTextarea.focus()

editing:exited
  → if it.text.trim() === '':
      // Still transient — both the add and the remove are
      // skipped by useUndo.
      canvas.remove(it)            // skipped
  → else:
      // Commit: clear the transient flag, tag, then push a
      // manual add to the undo stack. The IText is already on
      // the canvas; fabric will NOT re-emit object:added, so
      // the auto-recorder can't pick it up.
      undo.unmarkTransient(it)
      tagObject(it, operator, phase)
      tagMarkType(it, 'text')
      applyPhase(it, phase)
      undo.recordAdd(it)           // explicit push — see §4.10
  → exit to previous tool (text tool is one-shot)
```

The hook detects `editing:exited` on the IText itself rather than
a global keyboard listener.

**Why `recordAdd` rather than a synthetic event.** A prior draft
left this as "implementation choice" between firing a synthetic
`object:added` event and calling a `useUndo` method. The
synthetic-event path is fragile (other listeners on
`object:added` would also fire — Slice K's selection snapshot,
e.g.); the direct API call is targeted to the stack and nothing
else. `useUndo` exposes `recordAdd` (§4.10) specifically for
this case.

**Why `__transient` here.** Without it, the empty add at
`mouse:down` would already be on the undo stack by the time the
user types anything. A subsequent empty-exit would push a remove,
giving the undo stack two unwanted entries that the user never
caused. The transient flag suppresses both.

### 8.3 Phase treatment

- `record`: upright weight, no underline.
- `plan`: `fontStyle: 'italic'` + a dashed underline (rendered
  via `underline: true` with `linethrough: false`; if fabric
  doesn't expose dashed underline natively, fall back to italic
  only — confirm in `/sc:implement`).

### 8.4 Keyboard

- `T` tap → activate text tool. One-shot: after the IText commits,
  return to the previous tool.

### 8.5 Re-editing

Double-click on an existing IText puts it back into edit mode
(fabric default). The edit produces an `object:modified` event;
text changes are picked up by `useUndo`'s `modify` action (§4.10)
once a `serialize`/`deserialize` pair for text is registered
(text serializer = `{ text }`). No design work needed in this
slice beyond ensuring the text tool is not active when the user
double-clicks (since text tool would otherwise create a new
IText).

### 8.6 Testing

- Click commits an IText in edit mode with `__transient: true`.
- Typing then Esc with non-empty text → `__transient` cleared,
  tagged, committed; undo stack gains exactly one `add` entry.
- Typing then Esc with empty text → IText removed; undo stack
  unchanged (both the original add and the auto-remove skipped
  by the transient flag).
- Tagged with `__operatorId`, `__phase`, `__markType: 'text'`.
- Re-editing a committed IText: typed change produces a `modify`
  action; undo reverts to the previous text.

---

## 9. Slice J — Radial expansion + new bindings

### 9.1 Radial wedge assignment

The eight wedges, going clockwise from 12 o'clock:

```
                    [ arrow ]                          (12 o'clock)
        [ text ]                  [ sightline ]
   [ position-dot ]                  [ engagement-X ]
        [ ping ]                  [ cone ]
                    [ markers ▶ ]                      (6 o'clock)
```

Seven tactical primitives + one "markers ▶" wedge that opens a
**second-level radial** of the four unit markers (PMC-thick,
PMC-med, PMC-light, scav). The sub-radial is a four-wedge variant
of the same `TacticalRadial` component — same geometry, same
shortcut-suspension contract, same focus-ownership contract that
P0 established. Sub-radial dismissal returns focus to the parent
radial; the parent dismissal returns focus to the canvas (per
P0 §7.5b).

Rationale: tactical narrators reach for vector marks more often
than for unit markers once they're set up. Clustering markers
behind one wedge keeps the top-level surface optimized for
vocabulary breadth. The submenu hides under one extra click,
which is the right trade for a less-frequent action.

**Component change.** P0's `MarkerRadial` is renamed and extended:

- Rename: `MarkerRadial` → `TacticalRadial`. Existing 8-slot
  `slots: (MarkerOption | null)[]` API kept for backward source
  parity, but `MarkerOption` widens into a discriminated union
  so a wedge can carry either a marker-URL or a tactical-tool
  identifier, or be a "submenu" leaf opening the sub-radial:

  ```ts
  type WedgeOption =
    | { kind: 'marker'; url: string; label: string }
    | { kind: 'tool';   tool: ToolType; label: string; icon: string }
    | { kind: 'submenu'; label: string; icon: string;
                         children: WedgeOption[] };
  ```

- The sub-radial render is the same component instance, mounted
  at the same screen position, with `slots = children` from the
  parent's submenu wedge. Stack depth is capped at 2 in P1; the
  component asserts in dev mode if a deeper nest is attempted.

### 9.2 Keyboard binding additions

New tap bindings in the `useKeyboardShortcuts` registry, applied
on top of P0's table:

| Trigger | Action | Sticky? |
|---|---|---|
| `a` | activate arrow tool | sticky |
| `s` | activate sightline tool (anchor = last arrow tip) | one-shot → reverts to **arrow** |
| `x` | activate engagement X tool | sticky |
| `o` | activate overwatch cone tool (origin = last arrow tip) | one-shot → reverts to **arrow** |
| `i` | activate sound ping tool | sticky |
| `d` | activate position dot tool | sticky |
| `t` | activate text label tool | one-shot → reverts to previous tool |

All previous P0 bindings preserved. Modifier-aware tap and
input-focus skip rules unchanged.

**Conflict review** (against the live app, not the doc's
historical drafts):

- `A`, `S`, `O`, `I`, `T` — unbound in the current app. Free.
- `D` — unbound in the current app. The earlier-doc note that
  "P0 used `D` for intent flip" was incorrect; the live binding
  for the phase toggle is `P`, not `D` (see App.tsx ~line 440).
  `D` was always free; using it for position dot resolves the
  `P` collision cleanly.
- `P` — **bound** in the current app to the phase toggle
  (`record ↔ plan`). Earlier doc drafts proposed `P` for position
  dot; this slice does **not** do that. `P` stays on phase; the
  mnemonic for position dot is `D`-for-"dot."
- `B` remains pencil; `M` remains the marker radial trigger; the
  P0 secondary `P`-alias for pencil was already removed when the
  P phase-toggle binding landed.

### 9.3 Sticky tool persistence

Add a third localStorage key:

```ts
// src/state/tool.ts — DESIGN
const TOOL_STORAGE_KEY = 'tarkov-debrief:tool:v1';
// Persists the active ToolType only; the cursor + active flag are
// derived from the canonical Tool record at hydration.
```

This expands the persistence set to **tool + operator + phase**.
(The earlier-doc framing of "tool + operator + stamp" as the
sticky-defaults triad referenced the input design §8, but the
live `useStamp` keeps its marker URL in an in-memory ref only —
see src/tools/stamp.ts:35 — so the persisted triad is tool +
operator + phase, not tool + operator + stamp.)

**Hydration default and one-shot guard.** First-load default is
`ToolType.pencil` — matches the current `App.tsx` initial state
and is the safest behavior for users who reload mid-session
before ever choosing a tool. On hydration:

- If the persisted value parses as a valid `ToolType` AND is not
  a transient one-shot tool (`sightline`, `cone`, `text`), use
  it. Pencil, arrow, eraser, select, marker, pan, and the new
  sticky marks (engagement X, sound ping, position dot) all
  hydrate as themselves.
- If the persisted value is a transient one-shot tool, **fall
  back to `pencil`**. Restoring a chained tool would put the user
  in a mode whose anchor (`lastArrowTipRef`) was lost on reload —
  the soft-fail path would fire immediately, which is noisy.
  Pencil is the cleanest landing.
- If the persisted value is missing or malformed, fall back to
  `pencil`.

Persistence is write-only-on-change to avoid storage churn during
quasi-mode entry/exit (Space-hold pan does not write `pan`).

### 9.4 Testing

`TacticalRadial.test.tsx`:

- Renders 7 tactical wedges + 1 markers-submenu wedge.
- Clicking a tactical wedge sets the active tool and closes the
  radial.
- Clicking the markers-submenu wedge opens the sub-radial with
  the four unit markers; clicking a marker in the sub-radial
  sets the marker tool with that marker selected and closes
  both radial levels.
- Arrow-key navigation cycles through wedges at each level
  (carried over from P0 §7.5).
- Esc at the sub-radial closes the sub-radial and returns focus
  to the parent radial; a second Esc closes the parent and
  returns focus to the canvas.

`tool.test.ts`:

- Persistence round-trip: writing a valid sticky tool and
  reloading restores it.
- Hydrating a transient one-shot tool (`sightline`, `cone`,
  `text`) falls back to `pencil`.
- Malformed JSON falls back to `pencil`.
- Spring-loaded entries (Space-hold pan, RMB-hold eraser) do not
  trigger persistence writes.

---

## 10. Slice K — Direct manipulation handles

### 10.1 Why this is non-negotiable

From the input design §7: *tactical narration is constantly being
corrected mid-sentence.* "Actually they came from the north, not
the east." If the user has to delete and redraw the arrow, the
flow breaks. Direct manipulation is the single piece of P1 where
the "objects, not pixels" principle is load-bearing.

### 10.2 Custom fabric controls per mark

fabric.js's `fabric.Control` lets you attach an arbitrary handle to
an object with position, render, and action callbacks. P1 uses
this for:

**Arrow (curved freehand):**

- **No custom controls in P1.** A curved freehand path doesn't
  have a meaningful "head" or "tail" handle short of redrawing —
  changing the path's terminus would require recomputing the tail-
  end segments, and there's no natural single-handle gesture that
  expresses "redirect the end." Deferred to P2 along with any
  curved-path editing (e.g., midpoint bend, partial retrace).
- **Default move-by-body is preserved** — clicking and dragging
  the arrow's fabric.Group translates the whole arrow (path +
  arrowhead) as a unit.
- **`lastArrowTipRef` is NOT updated** by translation. The ref is
  set once on creation and remains the creation-time tip position,
  consistent with the frozen-anchor rule for sightlines and cones
  (§4.5, §4.6). If users find the disconnect surprising — "I
  moved my arrow and now my sightlines emanate from where the
  arrowhead used to be" — revisit in P2.
- Default scaling/rotation disabled (consistent with all tactical
  marks).

**Sightline (chained):**

- Only the `end` (cursor-side) endpoint is editable. No `tail`
  control — the anchor is frozen (per §4.5).
- Default scaling/rotation controls disabled.
- Default move-by-body **also disabled**: a sightline's anchor is
  semantically tied to the location of "where the operator was."
  Letting the whole line drag would let users invalidate that
  semantic accidentally. To re-anchor a sightline, the user
  deletes it and creates a new one. Confirmed in §15.
- Dragging `end` updates the line's `x2/y2` only. 15° snap from
  anchor remains active during the drag.

**Cone (chained-drag):**

The cone's editable parameters are `ConeParams = (origin,
startAngle, sweep, range)` per §6.3 — signed `sweep` so that
reflex sectors (`|sweep| > π`) round-trip unambiguously. Each
control maps to one or two of these. Path-data is regenerated on
every mutation.

For convenience, controls are described in terms of the derived
*bisector angle* `θ_b = startAngle + sweep/2`; an apex-drag that
sets a new `θ_b'` updates `startAngle ← θ_b' - sweep/2` while
preserving `sweep`'s magnitude and sign.

- `origin` control at the path's first vertex (the frozen
  creation-time anchor). Drag translates the entire cone —
  `origin` updates; `startAngle`, `sweep`, `range` are
  preserved. **Note:** unlike sightlines (§10.2), cones *can* be
  re-anchored via drag, because dragging an angular sector
  preserves its semantic ("this operator covers that sector,"
  just from a different position).
- `apex` control at `origin + range * (cos(θ_b), sin(θ_b))` (the
  midpoint of the arc). Drag updates the bisector angle θ_b
  (rotation around origin) and `range` (distance from origin)
  together — the same gesture as the cone's creation drag, but
  *symmetric*: `sweep` (magnitude AND sign) is preserved.
- `spread` control on the arc at the first edge endpoint
  (`origin + range * (cos(startAngle), sin(startAngle))`). Drag
  tangentially along the arc updates `|sweep|` symmetrically
  around the bisector — meaning `startAngle` also adjusts to keep
  the bisector angle fixed. Sign of `sweep` is preserved (the
  cone widens or narrows on its existing side; it does not flip
  through the bisector to the complementary side). **Sweep is
  fully unclamped** — per §15.1 R-D, `|sweep|` can range from
  `MIN_SWEEP` up to `2π`. The path's `A` command's
  `largeArcFlag` flips automatically when `|sweep|` crosses π
  (see §6.2). No visual cap; what you set is what renders.
- Default scaling/rotation disabled.

Each handle drag emits `object:modified` on `mouse:up`, picked up
by `useUndo`'s extension (§4.10). The cone's `serialize` /
`deserialize` pair is `ConeParams = { origin, startAngle, sweep,
range }` — round-trip equivalence is asserted in §6.7.

**Point marks and text:**

- Default fabric move-only behavior. No custom controls.
- Rotation control hidden; the marks are rotation-invariant.

### 10.3 Control registration timing

```
canvas.on('selection:created', ({ selected }) => {
  for (const obj of selected) {
    applyControlsForMarkType(obj, readMarkType(obj));
  }
});

canvas.on('selection:cleared', () => {
  // No teardown needed — controls live on the object, hidden when
  // not selected. Fabric renders them only for the active object.
});
```

`applyControlsForMarkType` is a switch on `__markType` that
attaches the appropriate `fabric.Control` instances to that
specific object via `obj.controls = { ... }`.

Existing P0 freehand paths (which have no `__markType`) get
nothing applied — they keep fabric defaults, which is fine because
freehand strokes aren't expected to be precision-edited.

### 10.4 Live preview vs. commit

On `selection:created` for a mark with a registered `serialize`
(sightline, cone), `useUndo` captures `before = spec.serialize(
target)` into a `WeakMap<Object, SerializedState>` (see §4.10).

During drag of a handle:

1. Fabric's `actionHandler` callback fires on `mouse:move`.
2. The callback updates the mark's parameter object (for cones:
   `__cone`; for sightlines: x2/y2). For cones, regenerate the
   path-data string from the new params; for sightlines, mutate
   `x2/y2` directly.
3. `canvas.requestRenderAll()` (fabric does this implicitly
   after `actionHandler`).
4. The handle's position is kept in sync with the new geometry.

On `mouse:up`, fabric emits `object:modified`. `useUndo` reads
`after = spec.serialize(target)` and, if `before !== after`,
pushes `{ type: 'modify', object: target, before, after }` to
the stack. Undo restores `before`; redo (when implemented in a
follow-up slice) would re-apply `after`. The mechanism is
specified in detail in §4.10.

**Note:** `useUndo` did **not** previously listen for
`object:modified`. The extension in §4.10 adds that subscription;
without it, P0's pure add/remove model can't represent handle
edits.

### 10.5 Eraser interaction with handles

When the eraser tool is active, fabric's selection is suppressed.
Dragging across an arrow erases the whole arrow (its underlying
group is a single fabric object). Dragging across a cone erases
the `fabric.Path`. Handle controls are not visible because no
object is selected. This is the desired behavior — the eraser
shouldn't accidentally interact with mid-edit handles.

### 10.6 Testing

`controls.test.ts`:

- Selecting a sightline exposes a single endpoint control (the
  cursor-side end, not the anchor). Anchor end is non-draggable;
  body is non-draggable.
- Selecting a cone exposes `origin`, `apex`, `spread` controls.
- Selecting an arrow exposes **no custom controls** (curved-path
  editing is out of scope for P1, per §10.2). Default move-by-
  body is still available.
- Selecting a position dot, engagement X, sound ping, or text
  label exposes no custom controls (default move only).
- Dragging the sightline endpoint updates `x2/y2` with 15° snap
  from anchor; Shift disables snap.
- Dragging the cone `apex` control mutates the bisector angle
  `θ_b` (and therefore `startAngle = θ_b − sweep/2`) and `range`;
  `sweep` is preserved with sign. Dragging `spread` mutates
  `|sweep|` symmetrically around the bisector — `sweep`'s sign
  preserved. **Sweep is fully unclamped** — extreme values up to
  full wraparound (`|sweep| > π`) render correctly via
  `largeArcFlag` (asserted against the regenerated path-data
  string).
- Each handle drag produces exactly one `modify` action on the
  undo stack; undo restores the pre-drag state.

---

## 11. Modified files and new files

### 11.1 New files

```
src/
  state/
    tool.ts                            (Slice J — active tool persistence)
    tool.test.ts
  tools/
    freehand/
      useFreehand.ts                   (Slice F — shared brush + path listener)
      useFreehand.test.ts
      arrowhead.ts                     (Slice F — tangent + polygon math)
      arrowhead.test.ts
    arrow.ts                           (Slice F — useFreehand consumer)
    arrow.test.ts
    marks/
      types.ts                         (Slice E — MarkSpec interface)
      registry.ts                      (Slice E — MarkType registry)
      useMark.ts                       (Slice E — hook factory)
      useMark.test.ts
      controls.ts                      (Slice K — custom fabric controls)
      controls.test.ts
      sightline.ts                     (Slice F)
      sightline.test.ts
      cone.ts                          (Slice G)
      cone.test.ts
      engagementX.ts                   (Slice H)
      engagementX.test.ts
      soundPing.ts                     (Slice H)
      soundPing.test.ts
      positionDot.ts                   (Slice H)
      positionDot.test.ts
      text.ts                          (Slice I)
      text.test.ts
      geometry.ts                      (shared math: rotate, snap-to-15°)
      geometry.test.ts
```

Arrow lives at `src/tools/arrow.ts` (peer to the existing
`src/tools/pencil.ts`) rather than under `marks/`, reflecting that
it's a freehand-tool variant rather than a `MarkSpec` consumer.

### 11.2 Modified files

| File | Change |
|---|---|
| `src/tools/tool.ts` | Add 7 new `ToolType` enum values (`arrow`, `sightline`, `cone`, `engagementX`, `soundPing`, `positionDot`, `text`) |
| `src/App.tsx` | Wire `useFreehand` for both pencil and arrow; wire `useMark` invocations (one per `MarkSpec`); add active-tool persistence hydration with the one-shot-skip rule (§9.3); pass new wedge config to `TacticalRadial`; own `lastArrowTipRef` and clear it on map switch (alongside `unerasable`) |
| `src/hooks/useKeyboardShortcuts.ts` | No code change — new bindings (`A`, `S`, `X`, `O`, `I`, `D`, `T`) are added via App.tsx's bindings array. `P` (phase toggle) stays as-is. `B` (pencil) stays as-is |
| `src/tools/pencil.ts` | Refactor to consume `useFreehand` with `onPathCreated: undefined` (no behavior change). The secondary `P`-alias for pencil is already removed in the live app (replaced by P-as-phase-toggle); no further removal needed here |
| `src/tools/undo.ts` | **Extended** (§4.10). New internal sentinel `TRANSIENT = '__transient'` alongside existing `REPLAY`. Auto-recording `object:added` / `object:removed` listeners skip targets carrying either flag. New canvas subscription on `object:modified` consults per-mark `serialize`/`deserialize` from the registry and pushes `{ type: 'modify', object, before, after }`. Pre-edit snapshots captured on `selection:created` into a `WeakMap<Object, SerializedState>`. **Public API additions:** `markTransient(obj)`, `unmarkTransient(obj)`, `popLastAction(): Action \| null`, `recordAdd(obj)`, `recordRemove(obj)`. Existing `onUndo` and P0 behavior unchanged |
| `src/components/MarkerRadial.tsx` | Rename to `TacticalRadial.tsx`; widen `MarkerOption` to a `WedgeOption` discriminated union (`marker` \| `tool` \| `submenu`); add sub-radial rendering for the submenu case (one level of nesting in P1; assert in dev if deeper) |
| `src/components/MarkerRadial.css` | Rename to `TacticalRadial.css`; sub-radial styling |
| `src/tools/metadata.ts` | Add `MARK_TYPE_KEY = '__markType'` and `tagMarkType` / `readMarkType` helpers. The existing `__operatorId`, `__phase`, `tagObject`, `readPhase` stay unchanged |

### 11.3 No-change-needed files

- `src/state/operators.ts`, `src/state/phase.ts` — unaffected.
- P0 hooks not listed above (`useSelect`, `usePan`, `useEraser`,
  `useStamp`, `useZoom`) — unaffected. The eraser already handles
  any fabric object generically; new mark types erase via the
  generic path.
- `src/test/mockCanvas.ts` — already supports `path:created`,
  `object:added`, `object:removed`, `selection:created`,
  `mouse:*`, fabric controls via `selection:cleared`. Add
  `object:modified` only if not already supported (verify in
  implementation).

---

## 12. Sequencing for implementation

Five phases. Each independently shippable; no big-bang. Phases 1
and 5 are mandatory bookends; phases 2–4 can ship in any order.

**Phase 1 — Infrastructure.** Slice E foundation:
`types.ts`, `registry.ts`, `useMark.ts`, `controls.ts` (skeleton
only, no per-mark specs yet), `geometry.ts`. Add `__markType`
metadata helper. Extend `ToolType` enum. Add active-tool
persistence (Slice J §9.3). Refactor `usePencil` to use a new
`useFreehand` factory (no behavior change for pencil; sets the
stage for arrow in Phase 2). Nothing visually changes; tests
verify the scaffolding.

**Phase 2 — Arrow + sightline.** Slice F. **Arrow** lands first as
a `useFreehand` consumer with the `appendArrowhead` postprocess
(§5.1) and updates `lastArrowTipRef` on commit. **Sightline**
lands second, depending on the ref being populated. Wire both
into `App.tsx`, `useKeyboardShortcuts` (`A`, `S`), and
`TacticalRadial`. First visible "the vocabulary expanded" moment.

**Phase 3 — Overwatch cone.** Slice G (chained-drag, anchored at
`lastArrowTipRef`). Wire `O` key and radial wedge. Most
geometrically interesting; lands once arrow has populated the
anchor for sightline+cone to consume.

**Phase 4 — Point marks + text.** Slice H (engagement X, sound
ping, position dot) and Slice I (text label). Wire `X`, `I`, `D`,
`T` tap bindings. Fill the remaining `TacticalRadial` wedges so
all seven tactical primitives (arrow, sightline, engagement X,
cone, sound ping, position dot, text) sit at the top level and
the markers sub-radial occupies the eighth wedge per §9.1. The
markers sub-radial component logic is also wired in this phase
(it can ship slightly earlier if convenient, but is grouped here
because it's the last radial-shape change). Easiest of the
per-mark phases — intentionally late so direct-manipulation
infrastructure (Phase 5)
is already validating against the more complex marks.

**Phase 5 — Direct manipulation.** Slice K — custom fabric
controls for sightlines and cones. Arrows are intentionally
excluded in P1 (curved-path editing is a P2 question; §10.2).
Phases 2 and 3 ship without handles (objects are immutable post-
creation in those phases); Phase 5 retroactively adds editability
to sightlines and cones. Critical "feels like it reads my mind"
moment for those two marks.

A single PR per phase is recommended. Phases 1–2 may bundle if
they land in the same week; Phase 5 should always be its own PR
because it touches selection lifecycle.

---

## 13. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `useFreehand` refactor of `usePencil` is more invasive than expected (e.g., pencil's existing tests depend on internal structure) | Med | Phase 1 includes a spike: refactor pencil with `useFreehand`, run existing pencil tests. If invasive, fall back to `useArrow` duplicating the brush setup. The duplication is small (~30 lines); the refactor is still preferred but not load-bearing. Decision logged in §15 |
| R1b | `appendArrowhead` mis-orients the arrowhead because fabric's path command format isn't what we expect (e.g., uses different control-point conventions) | Med | Phase 2 starts with a probe test that draws a known curve and asserts the command array shape. Implementation logic for tangent computation follows from the asserted shape |
| R1c | Replacing the just-added path with a Group in `path:created` interferes with undo | Med | Resolved at the design level (§4.10 + §5.1 step 8): `useUndo.popLastAction()` retracts the path's auto-add, `markTransient(path)` suppresses the path's remove, and the group's add is recorded normally. The path never appears in history |
| R2 | Cone path regeneration on every `mouse:move` is laggy | Low | Path-data string assembly is trivial (one `M`, one `L`, one `A`, one `Z`); RAF-throttle the preview render if profiling shows it matters |
| R2b | Signed-sweep integration loses precision over a long drag (cumulative rounding error) | Low | Each `mouse:move` adds a `dθ` bounded in (−π, π]; over ≤ a few hundred frames the accumulated `sweep` is good to ~6 decimal places. If users notice drift on multi-second drags, snapshot the integrated value periodically against a fresh `atan2` baseline |
| R2c | Cone created with very narrow sweep is hard to select | Med | Don't prevent creation — a sliver cone is a valid tactical statement ("they're watching that exact alley"). Ensure selection still works via fabric's hitbox padding (`perPixelTargetFind: false` for cones) |
| R3 | Text `editing:exited` fires unexpectedly when canvas re-renders mid-edit (e.g., zoom event) | Med | Verify in implementation; if observed, gate text auto-delete on `e.action === 'commit'` rather than any `editing:exited` |
| R4 | Operator visibility toggle hides tactical marks but leaves direct-manipulation handles for those marks active | Low | Handles render only on selected object; hidden objects can't be selected; check empirically |
| R5 | Stroke widths and arrowhead sizes don't scale with zoom (input design §4 hints at QuickShape needing this) | Med | Out of P1 scope to fix; document that marks created at one zoom render at the same pixel scale regardless of viewing zoom (already true for freehand strokes per P0) |
| R6 | The `P` key was historically reserved for "position" in early-draft P1 thinking but is bound to phase-toggle in the live app | Low | Resolved (§15.1 R-A): position dot uses `D`. `P` stays on phase. The earlier-draft proposal never shipped to users; no muscle-memory rebinding required |
| R7 | Sub-radial for markers adds a click that wasn't there in P0 | Med | Accepted (§15.1 R-B). Mitigation: sub-radial inner radius matches parent's outer radius so the cursor naturally lands at the sub-menu after a flick (see R11). Validate visually in implementation |
| R8 | Engagement X fixed-red collides with a future user-customizable color palette | Low | The "colorSource: fixed" registry field makes it trivial to flip an individual mark to operator-color in the future without touching `useMark` |
| R9 | Text label IME (input-method-editor) flows for non-Latin scripts break fabric.IText | Low | Fabric supports IME via its hidden textarea; test with at least one non-ASCII input in implementation |
| R10 | Direct-manipulation drag of a control bypasses the undo stack | Med | Resolved at design level (§4.10): `useUndo` is extended to subscribe to `object:modified` and consult the mark spec's `serialize` / `deserialize`. Verify fabric emits `object:modified` for control-driven mutations as well as user-translation; if not, the control's `actionHandler` cleanup can fire the event manually |
| R11 | Radial sub-menu (markers wedge) opens an additional 8-wedge widget that overlaps the cursor → fitts'-law regression | Med | Sub-radial inner radius matches the outer radius of the parent so the cursor naturally lands at the sub-menu's center wedge after a flick. Validate visually in implementation |
| R12 | Sightline activated before any arrow exists → user lands in a dead mode | Med | Soft-fail path per §4.5: transient hint + hard revert to arrow. Hint copy and presentation are an implementation detail; verify it's discoverable but not obtrusive |
| R13 | `lastArrowTipRef` leaks across map switches (anchor points reference the *previous* map's coordinates) | High | Reset the ref to `null` in the same effect that clears the canvas on map switch. Cite the existing `unerasable` reset point as the precedent — same lifecycle |
| R14 | User expects sightline to revert to the tool they were in *before* sightline, not to arrow | Med | Behavior is documented in §5.3 and called out as deliberate. If user testing finds this surprising, expose `revertTo` as a per-user preference in a follow-up; do **not** change the default — the narrative cycle is the point |
| R15 | A sightline whose anchor arrow is later deleted appears to "float" with no visible connection | Low | Acceptable in P1 — the sightline's identity doesn't depend on the arrow. P2 may add a faint pip at the anchor point for orphaned sightlines. Applies equally to cones (R15 covers both) |
| R16 | Cone tool activated then `mouse:down` lands too close to origin → degenerate edge1 | Low | Discard gesture per §4.6; tool stays active so user can retry. Hint copy is an implementation detail |
| R17 | Origin-control drag on a cone allows the cone to be moved away from its semantic anchor | Med | Deliberate per §10.2 — cones are intentionally re-anchorable (unlike sightlines). Flagged in §15.2 #11 for user confirmation |
| R18 | Cone's `__cone` parameterization drifts from its rendered path after manual edits | Med | All control handlers update `__cone = { origin, startAngle, sweep, range }` first, then regenerate the path-data string from those params (§6.3). Round-trip equivalence (`params → path-data → reparsed params`) asserted in §6.7 |
| R19 | `useUndo` API expansion (`popLastAction`, `recordAdd`, etc., §4.10) ships with mistakes that subtly break the existing P0 undo flow | Med | The hook's `object:added` / `object:removed` listeners and `REPLAY` semantics are *unchanged*; the new methods only add capability. Phase 1 includes an explicit regression test pass over the P0 undo behaviors before the new methods are wired into any caller. The §14 checklist already covers "existing P0 behaviors still work unchanged" |

---

## 14. Validation checklist

Before merging any phase:

- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm test` clean (vitest unit tests)
- [ ] `pnpm test:e2e` clean (existing smoke spec + new tactical-mark spec)
- [ ] Manual: page reload preserves last operator + phase + tool
      (and one-shot tools like sightline/cone/text fall back to
      pencil per §9.3)
- [ ] Manual: each new key shortcut activates the right tool;
      `P` still toggles phase (not position dot)
- [ ] Manual: each new mark applies the correct color rule
      (operator vs. fixed) and phase treatment per §3.5
- [ ] Manual: selecting an arrow exposes NO custom handles
      (move-by-body only); selecting a sightline exposes one
      endpoint handle (cursor-side); selecting a cone exposes
      origin / apex / spread handles
- [ ] Manual: cone spread is fully unclamped — reflex cones
      (`|sweep| > π`) render as proper reflex-angle sectors via
      the SVG `A` command's `largeArcFlag`; the drag direction
      (CW vs CCW around the origin) determines which side of
      the arc the cone fills
- [ ] Manual: text label commits on Esc, deletes on empty;
      neither empty-add nor auto-delete enter the undo stack
      (per §4.10 / §8.2)
- [ ] Manual: handle drags on sightlines and cones are undoable
      (single Cmd+Z reverts a handle edit)
- [ ] Manual: arrow path→group swap does not produce stray
      undo-stack entries
- [ ] Manual: preview objects (cone drag, sightline rotation)
      never enter the undo stack
- [ ] Manual: erasing tactical marks works exactly like erasing
      freehand strokes
- [ ] Manual: toggling operator off hides their tactical marks
- [ ] Manual: `plan` phase treatment is visually distinct from
      `record` for every mark type
- [ ] Manual: radial markers sub-menu reachable in two clicks
      (or one flick + one click); Esc collapses one level at a
      time
- [ ] Manual: existing P0 behaviors (operator chips, phase
      toggle on `P`, marker radial → tactical radial, undo, pan,
      eraser) still work unchanged

---

## 15. Open questions for resolution before /sc:implement

### 15.1 Resolved (recorded here for traceability)

These were settled in the design-review pass; implementation
should treat them as decisions, not options:

- **R-A. Position dot key = `D`.** `P` stays bound to the live
  phase toggle (App.tsx ~line 440). `D`-for-"dot" is free and
  mnemonically clean.
- **R-B. Radial layout = sub-radial.** Seven tactical wedges +
  one markers-submenu wedge that opens a four-wedge sub-radial.
  The "iterate later" note covers later polish (animation,
  break-out into separate component, etc.) without changing
  scope.
- **R-C. Cone geometry = true circular sector** via `fabric.Path`
  with an SVG `A` arc command, not a 3-vertex triangle (§6.2).
- **R-D. Cone spread = fully unclamped.** No 15°–75° clamp, no
  visual cap at 90°. The `largeArcFlag` in the SVG arc handles
  wraparound (§6.2).
- **R-E. One-shot tool hydration falls back to `pencil`.** First-
  load default is `pencil` (matches the live app); persisted
  transient tools (sightline/cone/text) hydrate as `pencil`
  rather than restoring a mode whose anchor is gone (§9.3).
- **R-F. Undo extension is in scope.** `__transient` skip-key +
  `modify` action variant (§4.10). Handle drags on sightlines
  and cones are undoable.
- **R-G. Pencil and arrow share `useFreehand`.** Pencil refactors
  to consume the new factory with `onPathCreated: undefined`;
  arrow consumes it with `appendArrowhead`. Same brush, same
  listener, same metadata path. Distinct `ToolType` values and
  distinct bindings (B vs. A).

### 15.2 Still open

1. **Engagement X color.** `#D0312D` proposed. Confirm against
   the gunmetal/walnut design system; should not clash.
2. **Sound ping color.** `#E6C229` (neutral yellow). Same
   question.
3. **Text label `plan` treatment.** `italic + dashed underline`
   proposed. If fabric can't render dashed underline natively,
   fall back to italic-only. Confirm fallback is acceptable.
4. **Sticky vs. one-shot point marks.** §4.3 proposes sticky for
   engagement X, sound ping, position dot (place-many) and
   one-shot for text label. Confirm — alternative is uniform
   one-shot, which matches Excalidraw but contradicts the input
   design §8.
5. **Direct-manipulation scope for point marks.** Slice K covers
   sightlines and cones (and explicitly excludes arrows).
   Default fabric move-by-body is correct for point marks and
   text; confirm we don't want anything fancier (re-color handle
   on a position dot, resize handle on text, etc.).
6. **Sightline anchor: frozen vs. tethered.** P1 freezes the
   anchor at creation time (§4.5). Alternative is tethering — the
   sightline holds a reference to the arrow object and tracks
   its head live. Tethering reads better narratively but
   introduces an object-reference graph that complicates undo,
   eraser, and serialization. Confirm: frozen is fine for P1?
7. **Which arrow's tip is "the last"?** P1 proposes: most
   recently *created* arrow (insertion order, regardless of
   selection). Alternatives: selected-arrow-tip-if-any-else-most-
   recent, or "most recently *touched*" (created or
   head-translated). Confirm.
8. **Sightline-from-no-arrow behavior.** P1 proposes transient
   hint + hard revert to arrow. Alternative: silently no-op
   (cleaner but less educational). Or: fall back to "last cursor
   position" as the anchor (more permissive, breaks the
   narrative). Confirm.
9. **Sightline auto-reverts to arrow, not to previous tool.**
   Deliberate per §5.3. Confirm — this is the surprising one.
10. **Sightline body is not draggable** (§10.2). Only the free
    endpoint moves. To reposition a sightline, the user deletes
    and recreates. Confirm — alternative is allowing the whole
    line to drag, with the anchor going wherever the user puts
    it.
11. **Cone IS draggable (re-anchorable) via origin control.**
    Asymmetric with sightline (#10). Rationale in §10.2: a cone
    represents an angular sector — its semantic survives
    translation. A sightline represents "from this point to that
    point" — moving the anchor invalidates that. Confirm the
    asymmetry is acceptable.
12. **Cone tool auto-reverts to arrow on commit**, same as
    sightline. The narrative cycle is arrow → annotate (sightline
    or cone) → arrow. Confirm this also applies to cones, or
    should cone be sticky (since covering multiple sectors from
    one operator position is plausible)?
13. **`lastArrowTipRef` is captured at *tool activation* time**
    for both sightline and cone (not at `mouse:down`). If the
    user activates the cone tool, then somehow triggers a new
    arrow commit before completing the cone drag, the cone's
    anchor is still the original tip captured at activation.
    Confirm — this keeps behavior consistent across sightline
    and cone.
14. **Straight-arrow modifier.** P1 arrows are always curved
    freehand. A future ergonomic could be "hold `Shift` while
    drawing to constrain to a straight line." Out of P1; flagging
    so it's not lost.
15. **Curved-arrow direct manipulation.** Slice K skips arrows
    (§10.2). Confirm acceptable for P1 — alternative is to
    expose a simple "drag the head to redirect (recompute the
    last 20% of the path)" interaction, which is awkward but
    non-zero useful.
16. **Arrow `lastArrowTipRef` does not update on translate**
    (§10.2). If users translate an arrow after committing it,
    the ref still points to the creation-time tip. Confirm.
    Alternative is to update the ref on `object:modified` for
    arrows, which couples translate to chain semantics and may
    surprise in the opposite direction.

Each remaining open question is small enough that the user can
answer all in one short reply.

---

## 16. What this slice unlocks (forward-looking)

After P1 ships, the canvas can express every primitive in the input
design's tactical grammar. The two highest-leverage remaining
features both depend on this foundation:

- **Replay scrubber** (input design §5) — every mark now timestamps
  via fabric's natural `object:added` event; a temporal index can
  read them and a scrubber UI can fade objects in/out by time. No
  retrofit of the marks themselves is needed.
- **QuickShape / snap-to-shape** (input design §4) — only meaningful
  once there are clean primitives to snap into. P1 provides them.
  A wobbly drag of a line followed by a 500ms dwell can now be
  interpreted as "you meant an arrow" and the freehand stroke can
  be replaced with the corresponding `MarkSpec`-built object.

These are P2 candidates, queued for design after P1 lands and one
or two real squads have used the expanded vocabulary in anger.

Two future directions worth flagging:

- **The chained-anchor pattern** (§4.5, §4.6) is reusable beyond
  sightline and cone. Other marks could plausibly chain off
  `lastArrowTipRef` — a sound ping anchored at "where you heard it
  from," a position dot auto-placed at the arrow's terminus to
  visually annotate "here." The `MarkInteraction` union is the
  extension point; new variants can be added without rewriting the
  hook factory.

- **The freehand-with-postprocess pattern** (§5.1) is also
  reusable. Anything that wants to be "scribble it, then a
  computed visual gets appended" — e.g., a freehand path that
  becomes an exclamation hash mark at the end (signaling "stopped
  and held") — can plug into `useFreehand` with a different
  `onPathCreated` callback. P1 has one consumer (arrow) plus the
  null-postprocess case (pencil); P2 vocabulary can stack on the
  same factory.

A direct-manipulation slice for curved arrows is its own future
candidate (§15.2 #15) — the gesture vocabulary for editing
freehand paths is genuinely unsolved and deserves its own design
pass, not a P1 shoehorn.

---

## 17. Boundary

Per `/sc:design` contract, this document defines the design but
ships **no code**. The `/sc:implement` pass that follows should
execute the phases in §12, validate against §14, and resolve §15
before each phase. Per-phase PRs are recommended; bundle Phases
1–2 only if the spike resolving R1 is uneventful.
