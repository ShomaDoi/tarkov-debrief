# P2 Slice — Replay Scrubber and Animated Playback

**Date:** 2026-05-13
**Status:** Design only. `/sc:implement` consumes this.
**Companion docs:** `design_p0_slice.md` (quasi-modes / chips /
phase / radial), `design_p1_slice.md` (tactical vocabulary +
direct manipulation), `tactical_input_design_2026-05-10.md`
(input research; replay is §5),
`research_ergonomic_input_2026-05-10.md` (underlying UX).

---

## 0. Decisions resolved since brainstorm

These are settled. Implementation should treat them as
decisions, not options.

- **R-A. Synthetic timing, not wall-clock.** Marks store a
  monotonic sequence number `__seq`; the playback timeline is
  *projected* from sequence order with constant draw speed and
  fixed inter-mark gaps. A literal recording leaves dead air
  and uneven pacing — this tool's job is to *communicate* a
  debrief, not log keystrokes.
- **R-B. Stable per-mark UUID.** `tagObject` writes
  `__id: string` (crypto.randomUUID()) at creation. Today
  marks are identified only by in-memory fabric reference;
  the UUID is the forward-compatibility hook future
  cooperative editing will require.
- **R-C. Per-mark animators only for marks with intrinsic
  temporal structure that are stable under upcoming vocabulary
  changes.** Two animators ship in P2:
  - `PathReveal` for pencil + arrow (progressive freehand
    reveal at constant px/sec).
  - `ConeSweep` for cone (angular extent grows from 0 to
    committed sweep).
  Sightline's animator is *deferred* because sightline geometry
  is anticipated to change to a narrow-cone-extension model;
  building against today's `fabric.Line` would be throwaway.
  Engagement X, sound ping, position dot, text are
  instant-appear at slot start.
- **R-D. Plan-phase marks filter under the same playhead rule
  as record-phase marks.** Existing dashed / italic styling
  remains the visual differentiator; nothing temporal changes
  per phase.
- **R-E. Discrete speed multiplier buttons (0.5× / 1× / 2×).**
  Slider considered and rejected: too imprecise on a 60-pixel
  scrubber strip and unnecessary degrees of freedom.
- **R-F. Play-from-live = jump to start, play forward.** The
  intuitive "watch the playback" gesture.
- **R-G. Auto-revert to live on completion.** When playback
  reaches the end of the timeline, the scrubber returns to
  live state (canvas is fully drawn, playhead pinned right,
  drawing re-enabled).
- **R-H. Drawing is disabled during replay.** When the
  playhead is anywhere but live, the canvas reflects past
  state; allowing new strokes would be confusing. Drawing
  inputs are blocked; clicking the live indicator (or pressing
  Shift+Space twice to advance through play→pause→live) returns
  to live and re-enables drawing. See §7.4.
- **R-I. In-session only.** Marks are not persisted across
  reload (matches P0/P1; localStorage carries session prefs
  only). The scrubber is the working artifact for a single
  open tab. Persistence is its own future slice.

---

## 1. What this slice ships

A replay scrubber that turns the current annotation session into
a polished animated playback of the debrief.

- **Replay timeline projection.** A pure function from
  `(marks in __seq order, animation config, speed)` to a
  `{ markId, logicalSlotStart, logicalAnimDuration }[]` slot
  list plus `logicalTotalDuration`. Recomputed on
  `object:added` / `object:removed` from the same canvas event
  hooks `useUndo` and `lastArrowTipRef` already subscribe to.
- **Per-mark animators.** Two functions matching the
  `applyAnimation(obj: fabric.Object, t: number) → void`
  signature:
  - `pathReveal` truncates the freehand path's command array
    to a prefix corresponding to `t × cached total arc length`.
  - `coneSweep` rebuilds the cone's SVG path with angular
    extent `t × committedSweep` rather than the full sweep.
  Dispatched by `__markType` (added in P2 to pencil + arrow
  outputs; already present on other marks).
- **Scrubber UI** (`src/components/Scrubber.tsx`): a horizontal
  bar overlaid at the bottom of the canvas viewport. Track,
  draggable playhead, play/pause button, three speed buttons,
  and a relative time label (`0:03 / 0:08`). Hidden when the
  timeline is empty; appears as soon as the first mark exists.
- **Auto-advance loop** driven by `requestAnimationFrame`.
  Increments the playhead in logical-time space, applies the
  speed multiplier when mapping to playback time, auto-reverts
  to live on completion.
- **Keyboard.** `Shift+Space` toggles play/pause. Plain Space
  stays bound to hold-pan (P0 §4.5). Hotkeys overlay gets a
  row in "Other".
- **Mark identity.** `tagObject` newly writes `__id` and
  `__seq`. Freehand outputs (pencil, arrow) newly tag
  `__markType` so the animator dispatch has a reliable key.
  Both reader functions (`readId`, `readSeq`) join the existing
  `readOperator` / `readPhase` / `readMarkType` set.
- **Render composition.** The existing operator-visibility
  effect at App.tsx:499–510 is rewritten as a unified
  "compute visibility + apply animation" effect that ANDs
  operator-hidden with playhead-after-slot-start, dispatches
  animators for marks mid-animation, and calls
  `canvas.requestRenderAll()` once per playhead tick.

---

## 2. What this slice does NOT ship (explicit non-goals)

- **Persistence of marks across reload** (R-I). Scrubber is
  in-session only.
- **Sound-ping animation tied to playhead crossings.** P1 §2
  flagged this as gated on replay. It's still small and could
  layer on later via a "ping appears with pulse" animator;
  out of P2 to keep scope tight.
- **"New mark" glow in live view.** A "you just drew this"
  highlight in the live state. Future.
- **Plan-only / record-only filter toggle.** R-D filters them
  identically; a UI toggle adds surface without a clear win.
- **Point-mark pulse-in, text typewriter, text fade.** User
  explicitly excluded — instant-appear for those marks is the
  V1 behavior. Per-mark animator addition stays additive when
  any of these wants in later.
- **Sightline animator** (R-C). Deferred to the slice that
  changes sightline geometry to a narrow-cone-extension.
- **Per-mark *override* of animation timing.** "Dwell on this
  arrow longer," "skip this one," etc. Future.
- **The whole cooperative editing surface.** Op log, sync,
  conflict resolution, transport, multi-client undo, peer
  presence. P2 only puts in the *data primitives* coop needs
  (`__id`, `__seq`); the sync layer is its own multi-slice
  effort.
- **Mark editing from the scrubber.** Read-only on the canvas;
  never mutates marks.
- **Persisted speed preference.** The 0.5× / 1× / 2× choice
  defaults to 1× per session and does not survive reload. Adds
  no real value vs. tap-to-set; matching the (still narrow)
  list of persisted prefs requires no new persistence work.

---

## 3. Architecture overview

### 3.1 Where P1 left us

After P1, the canvas has:

- A complete tactical-mark vocabulary, each tagged with
  `__operatorId` + `__phase` via `tagObject`
  (`src/tools/metadata.ts:22–58`). Mark-typed marks (sightline,
  cone, engagement X, sound ping, position dot, text)
  additionally carry `__markType`.
- An undo extension with `__transient` skip-key, `modify`
  actions for handle drags, and a stable `popLastAction` /
  `recordAdd` API (`src/tools/undo.ts`).
- The `lastArrowTipRef` chain anchor, recomputed by a canvas
  walk subscribed to `object:added` / `object:removed`
  (`src/App.tsx:427–428`).
- A per-operator visibility effect that walks the canvas and
  sets `obj.visible` based on the active visibility map
  (`src/App.tsx:499–510`).
- A `?` hotkeys overlay (`src/components/HotkeysOverlay.tsx`)
  enumerating every binding with periodic-drift safeguards
  (`HotkeysOverlay.test.tsx`).

P2 builds on these without breaking any contract.

### 3.2 Why synthetic timing, not wall-clock

P1 §16 anticipated the scrubber would run on wall-clock
`createdAt`. Walking through that model surfaced two problems
worth recording for posterity:

1. **Dead air.** Real annotation sessions have natural pauses
   while the user thinks or types. Played back literally, the
   timeline has long stretches where nothing happens — actively
   anti-communicative for a debrief.
2. **Uneven within-stroke pacing.** A fast user draws a long
   arrow in 200ms; a slow user draws the same arrow in 2s.
   Playback at 1× wall-clock would reflect this difference, but
   semantically the two arrows are identical; the variation is
   meaningless and visually distracting.

Synthetic timing dodges both. Every mark plays back at a pace
chosen for legibility (`DRAW_SPEED_PX_PER_SEC` for paths;
`CONE_SWEEP_DURATION_MS` for cones; `INTER_MARK_GAP_MS` between
marks). The user's original drawing speed is irrelevant; the
projection is a function of *what* was drawn, not *when*.

Side benefit: synthetic timing collapses to a clean speed
multiplier. 2× simply halves all logical durations.

### 3.3 New abstractions

```
                          App.tsx
                             │
       ┌─────────────────┬───┴──┬──────────────────┐
       │                 │      │                  │
   tool state        operator  phase        lastArrowTip
                                                    │
   ┌───────────────────────────────────────────────┘
   │
   │   ┌─────────────────────────────────────────────┐
   │   │  useTimeline(canvas)                        │  ← NEW
   │   │  ────────────────                           │
   │   │  • subscribes to object:added / :removed    │
   │   │  • rebuilds slot list on change             │
   │   │  • exposes { slots, totalDuration,          │
   │   │              playhead, setPlayhead,         │
   │   │              isLive, play, pause,           │
   │   │              speed, setSpeed }              │
   │   └─────────────────────────────────────────────┘
   │                       │
   │                       │
   │   ┌───────────────────┴──────────────────────────┐
   │   │                                              │
   │   │   Render composition effect                  │ ← REFACTORED
   │   │   ─────────────────────────                  │
   │   │   deps: [canvas, operators, playhead,        │
   │   │          slots, speed]                       │
   │   │   per object: AND(operator-visible,          │
   │   │                   playhead ≥ slotStart)      │
   │   │   if mid-animation: dispatch                 │
   │   │                     spec.applyAnimation      │
   │   │   end: canvas.requestRenderAll()             │
   │   └──────────────────────────────────────────────┘
   │
   ├──> <Scrubber />                        ← NEW component
   │      props: { timeline }
   │
   └──> useKeyboardShortcuts (Shift+Space) ← extended

  src/tools/marks/animators.ts             ← NEW
    pathReveal(obj, t)
    coneSweep(obj, t)
    dispatch(obj, t) — routes by __markType
```

Five additions plus one refactor:

1. **`__id` + `__seq` + `__markType` on every mark.** Written
   by `tagObject` (P2 extends it). `__markType` for the four
   spec-built marks already exists; P2 also tags pencil/arrow
   outputs.
2. **`src/state/timeline.ts`** — a hook + projection module
   that owns the slot list, playhead, speed, and play/pause
   state.
3. **`src/tools/marks/animators.ts`** — the two animators
   plus a dispatcher. Per-spec `applyAnimation` hookups for
   marks that need it.
4. **`src/components/Scrubber.tsx`** + CSS — the UI.
5. **Render composition refactor in App.tsx** — single
   canvas-walk effect for visibility + animation, replacing
   the standalone operator-visibility effect.
6. **Shift+Space binding** added to the App.tsx bindings
   table.

### 3.4 Mark identity fields and coop forethought

Three fields written by `tagObject`:

- **`__id: string`** — `crypto.randomUUID()`. Stable across
  the mark's lifetime on the canvas. Survives object
  serialization (used by undo/redo and the timeline subscriber)
  unchanged. Future coop syncs reference marks by this.
- **`__seq: number`** — local monotonic counter (module-scoped
  in `metadata.ts`, incremented on each `tagObject`). Provides
  a stable creation order. Naturally Lamport: a future coop
  layer pairs `__seq` with a peer ID for cross-client total
  order without wall-clock skew.
- **`__markType: MarkType`** — already present for the
  spec-built marks; P2 newly sets it on pencil and arrow
  outputs (`"pencil"` and `"arrow"` literals added to the
  `MarkType` union and the `readMarkType` switch).

What P2 deliberately does NOT introduce for coop:

- No op log. The timeline is by-object, not by-op. Replay
  reads canvas state, not history.
- No conflict resolution semantics.
- No transport, network layer, or peer presence.
- No multi-client undo model. (Each client's undo stays local
  in any future coop slice; that's the standard.)

These are their own future design pass. The data primitives
in P2 are necessary but not sufficient — they exist so coop
doesn't have to retrofit every existing mark.

### 3.5 Patterns reused from P0 / P1

- **`tagObject` writes metadata at construction.** The same
  helper that already sets `__operatorId` and `__phase` is the
  natural place to extend with `__id`/`__seq`/`__markType`.
  Every mark inherits for free.
- **Canvas-walk visibility effect.** P0 / P1's
  per-operator-visibility pattern (App.tsx:499–510) is the
  template the render-composition effect refactors *to*, not
  *from*: collapse two filters into one walk.
- **`object:added` / `object:removed` subscribers.** Already
  used by `useUndo` and the `lastArrowTipRef` recomputer. The
  timeline subscriber is a third reader on the same events;
  ordering is independent — none of the three has dependencies
  on the others.
- **Ref-mirror for live state in fabric handlers.** The
  scrubber's auto-advance loop reads `playheadRef.current`
  rather than capturing playhead from a closure, matching the
  pattern documented in `src/tools/pan.ts` and the project
  CLAUDE.md.
- **Modal-style overlay shortcut suspension.** Not used in P2
  — the scrubber isn't modal, doesn't capture focus, doesn't
  suspend shortcuts. Called out because a reader looking for
  the pattern won't find it here.

---

## 4. Slice L — Mark identity in metadata.ts

### 4.1 Design intent

Add the three new metadata fields, threaded through the one
function that all mark creation paths already use. Avoid
per-mark wiring; future marks inherit for free.

### 4.2 Data model changes

```ts
// src/tools/metadata.ts — DESIGN
let nextSeq = 1;

export function tagObject(
  obj: fabric.Object,
  operatorId: OperatorId | null,
  phase: Phase,
  markType: MarkType | null = null,
) {
  (obj as any).__operatorId = operatorId;
  (obj as any).__phase = phase;
  (obj as any).__id = crypto.randomUUID();
  (obj as any).__seq = nextSeq++;
  if (markType) (obj as any).__markType = markType;
}
```

`nextSeq` is module-scoped; resets only on full page reload
(when the module reinitializes). Map switch does *not* reset
it — `__seq` only needs to be monotonic within a session, and
maps share the session.

### 4.3 Reader functions

Mirror the existing readers:

```ts
export function readId(obj: fabric.Object): string | null {
  return (obj as any).__id ?? null;
}
export function readSeq(obj: fabric.Object): number | null {
  return (obj as any).__seq ?? null;
}
```

`readMarkType` already exists; the `MarkType` union extends:

```ts
export type MarkType =
  | "pencil"   // NEW in P2
  | "arrow"    // NEW in P2
  | "sightline"
  | "cone"
  | "engagementX"
  | "soundPing"
  | "positionDot"
  | "text";
```

The `readMarkType` validation switch gets two more cases.

### 4.4 Freehand markType tagging

Today, `useFreehand` and `useArrow` call `tagObject(path,
operatorRef.current, phaseRef.current)` without a mark type.
P2 passes the type literal:

```ts
// src/tools/freehand/useFreehand.ts — DESIGN
tagObject(path, operatorRef.current, phaseRef.current, "pencil");

// src/tools/arrow.ts — DESIGN (the postprocess swap site)
tagObject(group, operatorRef.current, phaseRef.current, "arrow");
```

Spec-built marks already pass their type via the spec; no
change there.

### 4.5 Testing

- `metadata.test.ts` — add cases: `tagObject` writes `__id` as
  a non-empty string, `__seq` monotonically increases across
  calls, `readId`/`readSeq` round-trip.
- A test that two marks tagged in quick succession have
  distinct `__id` and `__seq + 1`.
- Existing mark-builder tests should still pass (the new
  fields are additive).

---

## 5. Slice M — Replay timeline projection

### 5.1 Design intent

Own a single source of truth for the playback timeline. Be a
pure function of the marks on the canvas + a small config; let
React subscribers re-render off the resulting slot list.

### 5.2 Projection function

```ts
// src/state/timeline.ts — DESIGN
export interface Slot {
  id: string;          // mark's __id
  seq: number;         // mark's __seq
  obj: fabric.Object;  // live reference for animator dispatch
  logicalSlotStart: number;     // ms in logical time
  logicalAnimDuration: number;  // ms; 0 for instant-appear
}

export function projectTimeline(
  marks: fabric.Object[],
  config: AnimationConfig,
): { slots: Slot[]; logicalTotalDuration: number } {
  const sorted = [...marks].sort(
    (a, b) => (readSeq(a) ?? 0) - (readSeq(b) ?? 0),
  );
  const slots: Slot[] = [];
  let cursor = 0;
  for (const obj of sorted) {
    const dur = animDurationFor(obj, config);
    slots.push({
      id: readId(obj)!,
      seq: readSeq(obj)!,
      obj,
      logicalSlotStart: cursor,
      logicalAnimDuration: dur,
    });
    cursor += dur + config.interMarkGapMs;
  }
  // Trailing gap is removed; total ends at last slot's end.
  const last = slots[slots.length - 1];
  const total = last
    ? last.logicalSlotStart + last.logicalAnimDuration
    : 0;
  return { slots, logicalTotalDuration: total };
}
```

`animDurationFor` per mark type (§5.3 config):

| markType | duration |
|----------|----------|
| pencil   | pathArcLength(obj) / drawSpeedPxPerSec × 1000 |
| arrow    | pathArcLength(obj) / drawSpeedPxPerSec × 1000 |
| cone     | config.coneSweepMs |
| (all other) | 0 |

`pathArcLength` is computed once per mark on its first projection
and cached on the mark as `__pathArcLength: number`. fabric
provides `fabric.util.getPathSegmentsInfo(path)` for this;
implementation can refine.

### 5.3 Animation configuration

```ts
// src/state/timeline.ts — DESIGN
export const ANIMATION_CONFIG = {
  drawSpeedPxPerSec: 600,   // pencil + arrow reveal speed
  coneSweepMs: 500,         // cone angular animation duration
  interMarkGapMs: 250,      // pause between consecutive marks
  // Speed multiplier is applied at playback-time mapping, not
  // baked into the projection. See §5.6.
} as const;
```

Numbers are starting points; tune from playback feel in
implementation. They're constants for V1 — no UI control;
adjusting requires a code change.

### 5.4 useTimeline hook

```ts
// src/state/timeline.ts — DESIGN
export interface UseTimelineReturn {
  slots: Slot[];
  logicalTotalDuration: number;
  playbackTotalDuration: number;  // = logical / speed
  playhead: number;               // ms in playback-time
  setPlayhead: (ms: number) => void;
  isLive: boolean;                // playhead >= playbackTotal
  isPlaying: boolean;
  speed: 0.5 | 1 | 2;
  setSpeed: (s: 0.5 | 1 | 2) => void;
  play: () => void;
  pause: () => void;
}

export function useTimeline(
  canvas: fabric.Canvas | null,
): UseTimelineReturn;
```

State held internally:
- `slots` / `logicalTotalDuration`: rebuilt on
  `object:added` / `object:removed` (subscribed in a
  mount-time effect).
- `playhead`: React state, clamped to
  `[0, playbackTotalDuration]`.
- `isPlaying`: React state, driven by play/pause API and the
  auto-revert at end.
- `speed`: React state, initial value `1`.

Map switch: the timeline subscriber sees the canvas-clear as a
flurry of `object:removed` events. Slots collapse to `[]`,
playhead snaps to 0. No special map-switch hook needed.

### 5.5 Subscriber wiring

```ts
useEffect(() => {
  if (!canvas) return;
  const rebuild = () => setSlots(projectTimeline(
    canvas.getObjects().filter(o => readId(o) !== null),
    ANIMATION_CONFIG,
  ));
  canvas.on("object:added", rebuild);
  canvas.on("object:removed", rebuild);
  rebuild(); // initial
  return () => {
    canvas.off("object:added", rebuild);
    canvas.off("object:removed", rebuild);
  };
}, [canvas]);
```

The filter `readId !== null` excludes legacy / untagged objects
(e.g., the loaded map image, which isn't tagged). Same defensive
posture as the operator-visibility filter at App.tsx:499–510.

### 5.6 Speed multiplier handling

Apply at the playback-time ↔ logical-time mapping, not in the
projection:

- `playbackTotalDuration = logicalTotalDuration / speed`
- When the auto-advance loop ticks at wall-clock rate Δms, it
  advances `playhead` by `Δms` (in playback-time); the
  visibility effect converts back to logical-time via
  `logicalPlayhead = playhead × speed` to find which slot
  applies.

This way changing speed mid-playback rescales the *display*
without recomputing projections. Setting speed 2× while the
playhead is at the midpoint keeps it at the midpoint (same
relative position).

### 5.7 Playhead clamping rules

- Clamp to `[0, playbackTotalDuration]` on every set.
- If a `setPlayhead` lands inside a slot, that's fine (the
  render effect handles partial animation).
- If a slot is removed (undo) while playhead was inside it:
  the timeline rebuild fires before any render tick; playhead
  is then potentially beyond the new `playbackTotalDuration`
  and gets clamped down. Snapping to the previous slot's end
  is not specifically modeled — clamping suffices.
- On the initial mark add (timeline goes from empty →
  one-slot), playhead defaults to `playbackTotalDuration` (=
  live). The scrubber appears in its idle state.

### 5.8 Testing

`src/state/timeline.test.ts`:
- Empty marks → empty slots, total = 0.
- Three marks (pencil, cone, engagement X) with known
  `__pathArcLength` / config → slot starts at expected logical
  times, total = last slot end.
- Speed 2× → `playbackTotalDuration` = half of logical.
- Speed change preserves relative playhead position
  (playhead/total ratio invariant).
- Clamping: `setPlayhead(-100)` → 0; `setPlayhead(huge)` →
  total.
- Subscriber test: after `object:added`, slots include the new
  mark; after `object:removed`, slot count drops by one.
- Playhead-beyond-new-total after undo → clamps down on next
  set.

---

## 6. Slice N — Per-mark animators

### 6.1 Design intent and interface

An animator is a pure function (well — it mutates fabric
object state, which is the only way fabric renders) of the
form:

```ts
type AnimatorFn = (obj: fabric.Object, t: number) => void;
```

`t ∈ [0, 1]` is the progress through the mark's animation
window. The dispatcher routes by `__markType`:

```ts
// src/tools/marks/animators.ts — DESIGN
const ANIMATORS: Partial<Record<MarkType, AnimatorFn>> = {
  pencil: pathReveal,
  arrow: pathReveal,
  cone: coneSweep,
};

export function applyAnimation(
  obj: fabric.Object,
  t: number,
): void {
  const mt = readMarkType(obj);
  if (mt && ANIMATORS[mt]) ANIMATORS[mt](obj, t);
}
```

Mark types with no entry render in their final committed state
(no partial reveal). This is the "instant-appear" path — the
mark is visible when playhead reaches slotStart and stays
visible until reset.

### 6.2 `pathReveal` mechanics

For a fabric.Path or a fabric.Group wrapping a path:

1. On first call for this mark, cache the original `path`
   command array as `__pathOriginal` and the precomputed
   cumulative arc lengths as `__pathArcLengths: number[]`.
2. Compute `targetLen = t × totalArcLength`.
3. Binary-search `__pathArcLengths` for the segment containing
   `targetLen`.
4. Build a new path array: `original.slice(0, segIdx + 1)`
   plus a partial trailing segment computed by linear
   interpolation on the segment's parameter (de Casteljau for
   Q curves; lerp for L/M). The brush emits sub-pixel-spaced Q
   commands, so linear-on-parameter is visually
   indistinguishable from arc-length-accurate.
5. Assign `obj.path = newPath; obj.setCoords();`.
6. At `t === 1`, restore `obj.path = __pathOriginal` and
   delete the override key so future renders skip the
   animator path.

The cached `__pathOriginal` and `__pathArcLengths` are set
once at first animation and never mutated, so subsequent
scrubs are O(log segments) per tick.

### 6.3 Arrow group handling

Arrow is a fabric.Group with two children: the freehand body
path and the outlined chevron arrowhead. Both are added to the
group when the arrow tool commits (`src/tools/arrow.ts`).

`pathReveal` for arrow:
- Walks the group's `_objects` to find the body path (the one
  that is NOT the arrowhead).
- Applies the path-reveal mutation to the body only.
- Sets the arrowhead child's `visible = (t === 1)` so the head
  appears only when the body is fully drawn.

The body vs. head distinction is identified by a `__role`
field set when the arrow tool builds the group:
`__role = "body"` on the path, `__role = "head"` on the
arrowhead. Mirrors the `__arrowTip` tagging pattern already in
use (`src/tools/arrow.ts` / `src/tools/metadata.ts`
`tagArrowTip`).

### 6.4 `coneSweep` mechanics

The cone is a fabric.Path built from `ConeParams` by
`src/tools/marks/cone.ts`. The build helper takes
`{ origin, originAngle, sweep, length }` and produces the SVG
path commands.

`coneSweep(obj, t)`:
1. On first call, cache `__coneParams` (the original params
   stored on the object at build time — they're already on
   `obj` via the existing `__cone` field).
2. Rebuild the path with `sweep = original.sweep × t`.
3. Reassign `obj.path = newPath`.
4. At `t < ε` (e.g., t < 0.02), the cone collapses to
   degenerate. Set `obj.visible = false` until t ≥ ε to avoid
   a flash of zero-area path.
5. At `t === 1`, restore the original path (cached at first
   call) and delete the override key.

Implementation note: the cone's existing build helper should
be exported as a pure function so `coneSweep` calls it
directly rather than duplicating the SVG-A-command logic. The
fix in P1 (use `new fabric.Path(d).path` to get normalized
commands) applies here too.

### 6.5 State restoration

Both animators follow the same lifecycle around an `__animActive`
flag:

```ts
function pathReveal(obj, t) {
  if (t < 1) {
    if (!obj.__animActive) {
      obj.__pathOriginal = obj.path;
      obj.__pathArcLengths = computeArcLengths(obj.path);
      obj.__animActive = true;
    }
    obj.path = computePartial(
      obj.__pathOriginal, obj.__pathArcLengths, t,
    );
  } else {
    if (obj.__animActive) {
      obj.path = obj.__pathOriginal;
      delete obj.__pathOriginal;
      delete obj.__pathArcLengths;
      delete obj.__animActive;
    }
  }
}
```

This pattern matches the `__transient` / `__arrowTip` /
`__REPLAY` custom-property convention already in the codebase
(CLAUDE.md "Custom properties on fabric objects"). ESLint's
no-explicit-any is acceptable for these fabric-internal tags.

A render tick that crosses `t=1` (forward play) cleans up the
cache automatically. A render tick that scrubs backward past
the slot's start should also clean up: the render-composition
effect (§7) calls `obj.visible = false` for marks ahead of the
playhead, and additionally calls `resetAnimation(obj)` to
clear the cache so the next entry into the slot rebuilds it.

### 6.6 Sightline deferral

`sightline.ts` is *not* modified in P2. Sightline marks
participate in the timeline (they get `__id` / `__seq` via
`tagObject` like everything else) but have no animator entry
in `ANIMATORS`, so they instant-appear at slot start.

When the geometry-change slice ships, it adds a `sightline`
entry to `ANIMATORS` (probably reusing or extending
`coneSweep` if sightline becomes a narrow cone). The
`applyAnimation` dispatcher signature doesn't change.

### 6.7 Testing

`src/tools/marks/animators.test.ts`:
- `pathReveal` at t=0 → path is empty or single-point.
- `pathReveal` at t=0.5 → path command count is roughly half of
  original (within tolerance).
- `pathReveal` at t=1 → `obj.path === __pathOriginal`
  reference equality (cache restored).
- `pathReveal` round trip (t=0 → 0.5 → 1 → 0.5 → 0 → 1) leaves
  the mark in its final, fully-restored state.
- `coneSweep` at t=0 → `visible = false`.
- `coneSweep` at t=0.5 → cone sweep is half of original.
- `coneSweep` at t=1 → restored to original path.
- Arrow group: at t<1 the arrowhead child has `visible = false`,
  at t=1 it has `visible = true`.

---

## 7. Slice O — Render composition refactor

### 7.1 Design intent

Today's per-operator visibility effect (App.tsx:499–510) sets
`obj.visible` from a single source of truth (the operator
visibility map). P2 needs to AND that with the playhead
filter and additionally dispatch animators for marks in
mid-animation. Doing this in two separate effects creates
ordering bugs (whoever runs last wins on `visible`); collapse
into one walk.

### 7.2 The composed effect

```ts
// src/App.tsx — DESIGN
useEffect(() => {
  if (!canvas) return;
  const hidden = new Set(
    operators.filter((op) => !op.visible).map((op) => op.id),
  );
  const logicalPlayhead = playhead * speed;
  const slotsById = new Map(slots.map(s => [s.id, s]));

  for (const obj of canvas.getObjects()) {
    const id = readId(obj);
    if (id === null) continue;  // map image, etc.
    const opId = readOperator(obj);
    const operatorVisible = opId === null || !hidden.has(opId);
    const slot = slotsById.get(id);
    if (!slot) {
      obj.visible = operatorVisible;
      continue;
    }
    const slotEnd = slot.logicalSlotStart + slot.logicalAnimDuration;
    if (logicalPlayhead < slot.logicalSlotStart) {
      obj.visible = false;
      resetAnimation(obj);
    } else if (logicalPlayhead >= slotEnd) {
      obj.visible = operatorVisible;
      resetAnimation(obj);
    } else {
      // Mid-animation
      obj.visible = operatorVisible;
      const t = slot.logicalAnimDuration === 0
        ? 1
        : (logicalPlayhead - slot.logicalSlotStart)
          / slot.logicalAnimDuration;
      applyAnimation(obj, t);
    }
  }
  canvas.requestRenderAll();
}, [canvas, operators, playhead, slots, speed]);
```

Notes:
- `resetAnimation(obj)` is the explicit reset path (§6.5) —
  clears the `__animActive` cache so the next entry rebuilds.
  Calls `applyAnimation(obj, 1)` internally for cleanliness.
- Untagged objects (map image, legacy strokes from before P2)
  remain visible per their operator filter alone. The map
  image has no `__operatorId`, so it stays visible.
- Performance: this runs on every `setPlayhead` and on every
  RAF tick during play. Canvas-walk is O(n marks). For
  reasonable n (< 200 marks per session), this is fine. The
  per-mark cost is dominated by `applyAnimation` for the
  handful mid-animation; everything else is a visible-bool
  set.

### 7.3 Drawing disabled during replay

When `!isLive`, the canvas's interactive surface should not
accept new strokes. Two layers:

1. **Brush disabled.** `canvas.isDrawingMode = false` when
   `!isLive`. Restored to its tool-driven value when isLive
   returns. This blocks freehand path creation immediately.
2. **Tool buttons / shortcuts disabled.** When `!isLive`,
   keyboard tool shortcuts (B, A, S, O, etc.) are suppressed.
   The simplest implementation: an additional check in the
   binding `when` predicate or the `enabled` field. A
   small `useEffect` toggling `canvas.skipTargetFind = true`
   also disables selection-by-click. A visible "replaying"
   state on the toolbar (greyed buttons) reinforces.

The user can return to live by:
- Clicking the live-indicator on the scrubber (a dedicated
  button at the right of the track).
- Pressing Shift+Space twice (play → pause → live, or just
  play to end which auto-reverts).
- Dragging the playhead to the rightmost position.

### 7.4 Testing

The render-composition effect is hard to unit test directly
(JSDOM + fabric mock is heavy). Integration testing via the
Scrubber RTL tests and an e2e smoke covers the behavior:

- e2e (`e2e/replay.spec.ts`):
  - Draw three marks; scrub to start; assert all three are
    `visible: false` on the canvas.
  - Scrub forward to middle; assert two visible, one not.
  - Press play; observe playhead advancing; eventually all
    visible; scrubber returns to live.

Unit tests on individual pieces (timeline projection §5.8,
animators §6.7) cover correctness of the inputs.

---

## 8. Slice P — Scrubber UI component

### 8.1 Visual design

A 56-pixel-tall horizontal bar overlaid at the bottom of the
canvas viewport. Translucent dark background (matching the
toolbar's visual register) so map content shows through if
the bar overlaps detail.

```
┌───────────────────────────────────────────────────────────┐
│ ▶ [────────●────────────────────]  0:03 / 0:08  ▌▌ 0.5 1 2│
│   ^play                          ^time          ^speed btns│
│        ^track + draggable playhead             ^live btn │
└───────────────────────────────────────────────────────────┘
```

Track fills available width. Playhead is a 4-px-wide vertical
line; clickable area is wider (12px) for ergonomic dragging.
Speed buttons highlight the active selection.

### 8.2 Component structure

```tsx
// src/components/Scrubber.tsx — DESIGN
export function Scrubber({ timeline }: { timeline: UseTimelineReturn }) {
  if (timeline.slots.length === 0) return null;
  return (
    <div className="Scrubber" role="region" aria-label="Replay scrubber">
      <PlayPauseButton ... />
      <ScrubberTrack ... />
      <TimeLabel ... />
      <LiveButton ... />
      <SpeedButtons ... />
    </div>
  );
}
```

Empty timeline → renders null. The first `object:added` flips
the slot count to 1; the scrubber appears.

### 8.3 Track + handle interaction

- Mouse down on track → seek to that position; begin drag.
- Mouse move while dragging → update playhead in real time
  (debounced to RAF if perf demands; not initially).
- Mouse up → end drag; if playing was active before the drag,
  do NOT resume (the user explicitly took control).
- Keyboard arrows on focused track: ←/→ seek by 1% of total;
  Home/End jump to 0 / live.

Drag deltas are computed in playback-time space (the
horizontal position maps to playhead 0..playbackTotalDuration).

### 8.4 Play/pause button

- Plays from current playhead. If at live (playhead = total),
  play jumps to 0 first (R-F).
- Pauses by setting `isPlaying = false` and stopping the RAF
  loop.
- Icon swaps between ▶ and ▌▌ based on `isPlaying`.

### 8.5 Speed buttons

Three buttons: 0.5×, 1×, 2×. Click sets `speed`. Active state
visible via a `.Scrubber-speed--active` class.

### 8.6 Time label

Format: `M:SS / M:SS` (`current / total` in playback-time
seconds, mm:ss). Updates on every playhead change. Reusing an
HTML `<time>` element is appropriate; no Intl needed for this
range.

### 8.7 Live indicator

A small button at the right that's highlighted when
`isLive === true`. Clicking it sets playhead to
`playbackTotalDuration` (jumps to live).

### 8.8 Testing

`src/components/Scrubber.test.tsx`:
- With empty timeline, renders null.
- With one slot, renders the dialog region.
- Play button calls `timeline.play()`.
- Click on track at the midpoint sets playhead to ~50% of
  total (within tolerance).
- Speed button click sets speed and highlights the active
  button.
- Live button click sets playhead to total.
- The component does NOT capture focus or suspend shortcuts
  (per §3.5).

---

## 9. Slice Q — Auto-advance + keyboard

### 9.1 RAF advance loop

```ts
// inside useTimeline — DESIGN
useEffect(() => {
  if (!isPlaying) return;
  let lastT = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const delta = now - lastT;
    lastT = now;
    setPlayhead(prev => {
      const next = prev + delta;
      if (next >= playbackTotalDuration) {
        setIsPlaying(false);
        return playbackTotalDuration; // snap to live
      }
      return next;
    });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}, [isPlaying, playbackTotalDuration]);
```

`delta` is in milliseconds wall-clock. Playhead is in
playback-time milliseconds, which is the same unit. Speed
multiplier is folded in via the `playbackTotalDuration` /
logical-time mapping (§5.6), so no separate scaling here.

### 9.2 Auto-revert to live on completion

Already in §9.1: when `next >= playbackTotalDuration`,
`isPlaying` flips to false and playhead snaps to the end. The
render effect's next pass sees playhead at end, marks become
fully visible, and `canvas.isDrawingMode` is restored by the
`isLive` watcher (§7.3).

### 9.3 Shift+Space binding

```ts
// src/App.tsx bindings — DESIGN
{
  key: " ",
  modifiers: ["shift"],
  action: () => {
    if (!timeline.isPlaying) timeline.play();
    else timeline.pause();
  },
  when: ({ canvas }) => canvas !== null,
},
```

Modifier-strict matcher in `useKeyboardShortcuts` (P0 §4.2)
ensures Shift+Space and plain Space don't conflict. Pan
(plain Space hold) continues to work.

### 9.4 Hotkeys overlay row

`src/components/HotkeysOverlay.tsx` gets one new row in the
"Other" section:

```tsx
{ keys: "Shift+Space", label: "Play/pause replay" }
```

The existing test (`HotkeysOverlay.test.tsx`) verifies
section headings and the P1 tactical-mark binding list; P2
adds a one-line assertion that "Shift+Space" appears.

### 9.5 Testing

- Unit (`timeline.test.ts`): `play()` flips `isPlaying`;
  RAF-driven advance is hard to unit-test cleanly. Use
  `vi.useFakeTimers()` + manual RAF stub.
- Integration (RTL on Scrubber): click play, advance timers,
  assert `setPlayhead` invocations.
- e2e: draw three marks, press Shift+Space, observe the
  playhead advancing and the canvas filling in.

---

## 10. Implementation phasing

The slices are sequenced as follows. Each is one PR unless a
spike merits bundling.

| Phase | Slice(s)         | Notes |
|-------|------------------|-------|
| 1     | L                | Identity fields. Standalone; doesn't affect runtime behavior visibly. |
| 2     | M                | Timeline projection + hook. Add behind a feature flag or just unused. Tests cover projection contract. |
| 3     | N                | Animators. Unit-testable in isolation. |
| 4     | O                | Render composition refactor. Behavior-equivalent at live (no playhead movement). |
| 5     | P + Q            | Scrubber UI + auto-advance + keyboard. The user-visible payoff lands together. |

Bundle Phases 1+2 if L is trivial (very likely). Phase 4 is
the risky one — replacing a live render effect — so it gets
its own PR.

---

## 11. Manual validation checklist

- [ ] Draw three arrows at varied speeds; press play; all
      three reveal at the same visual pace
- [ ] Draw an arrow → cone sequence; scrub backward; arrow
      partially retracts, cone sweep closes back to 0°
- [ ] Sightline is instant-appear (no progressive reveal)
      pending the geometry-change slice
- [ ] Drag playhead to start → all marks hidden
- [ ] Drag playhead to end → all marks visible, scrubber
      returns to live state
- [ ] 0.5× / 1× / 2× buttons visibly change pacing
- [ ] Shift+Space toggles play/pause
- [ ] Plain Space still triggers hold-pan
- [ ] During replay, drawing is disabled; tool keys are
      suppressed
- [ ] Returning to live re-enables drawing
- [ ] Switch maps → scrubber disappears (timeline empty);
      draw new marks → scrubber reappears
- [ ] Operator visibility toggle still works in combination
      with playhead
- [ ] Undo while scrubbed back → the undone mark drops from
      the timeline; surrounding slots compact; playhead clamps
      into the new range if it was beyond
- [ ] Existing P0/P1 behavior unchanged (chips, phase toggle,
      radial, undo, eraser, hotkeys overlay)

---

## 12. Open questions for resolution before /sc:implement

### 12.1 Resolved (recorded in §0)

R-A through R-I — see top of doc.

### 12.2 Still open

1. **Path arc-length precision.** The brush emits Q-curves
   spaced at sub-pixel intervals; treating segments as
   straight-line for length computation is fine. Confirm we
   don't need de Casteljau-accurate arc lengths.
2. **Speed multiplier set: 0.5× / 1× / 2× vs. wider range.**
   Confirm three buttons covers the case. Add 4× if users
   actually want fast-forward through long debriefs.
3. **Inter-mark gap value.** 250ms at 1× is a starting guess.
   Tune from playback feel.
4. **Default draw speed.** 600 px/sec is a starting guess; the
   subjective right answer is "an arrow that fills 30% of the
   viewport draws in about 1 second."
5. **Scrubber visibility threshold.** Currently: appears when
   ≥1 mark exists. Alternative: always show when canvas has
   focus. Lean toward current; less chrome.
6. **Live button placement.** Current sketch puts it next to
   the speed buttons. Could also go inside the track at the
   rightmost position (clicking the live marker = jump to
   live). Confirm.
7. **Disabled-drawing affordance during replay.** Greying
   tool buttons is the minimum. A more obvious "replaying"
   banner / overlay over the canvas could be clearer.
   Confirm minimum is enough.
8. **Map image filter exclusion.** Currently relying on the
   filter `readId(obj) !== null` to skip the map. The map
   image is never tagged today. Confirm we don't ever want
   it filterable via this mechanism (we don't — but
   documenting the assumption).
9. **Undo of a partially-animated mark.** If a mark is being
   played back (mid-animation) and the user undoes it: the
   `object:removed` event fires; the timeline rebuilds; the
   render effect's next pass doesn't see the mark. The
   animator caches on the (now-removed) fabric object are
   leaked but the object itself is GC'd. Confirm this is
   acceptable.
10. **Performance ceiling.** At what mark count does the
    canvas-walk-per-tick start to drag? V1 doesn't optimize.
    Likely needs profiling at > 200 marks; out of P2 to
    optimize prematurely.

Each open question is small enough to answer in one short
reply.

---

## 13. Boundary

Per `/sc:design` contract, this document defines the design
but ships no code. The `/sc:implement` pass that follows
should execute the phases in §10, validate against §11, and
resolve §12.2 as each phase opens. Per-phase PRs are
recommended.

Forward-looking deferrals are recorded in §0 and §2 so future
slices know where they sit. The sightline animator is the
nearest-term continuation; whatever slice changes sightline
geometry should also ship its animator.
