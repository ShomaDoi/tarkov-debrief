# Tarkov Debrief — Repo Conventions for AI Assistants

This file captures durable conventions for any AI assistant
working in this codebase. Read it before making changes.

## Source of truth for design

Substantive design decisions live in `claudedocs/`:

- `claudedocs/design_p0_slice.md` — the P0 starter slice
  (quasi-modes, operator chips, phase toggle, marker radial)
- `claudedocs/tactical_input_design_2026-05-10.md` — the
  tactical-input design memo that drove the P0 slice
- `claudedocs/research_ergonomic_input_2026-05-10.md` — the
  underlying UX research
- `claudedocs/vocabulary_visual_language_2026-05-11.md` — the
  forward-looking visual decisions for future mark types

When implementing, **refer to the design doc by section number**
(e.g., "see §4.5 of design_p0_slice.md") rather than restating
its content in code comments. The doc is canonical; comments
point at it.

## Comments and locality

Two non-negotiable rules for any new code in this repo:

1. **Clarify all potential WTFs and edge cases with comments.**
   If a line of code would make a reader pause and ask "why?",
   add a comment that answers the question. Prefer the *why*
   over the *what* — well-named identifiers already convey what.
   This includes:
   - Why this guard is here (what would go wrong without it).
   - Why this ref-mirror instead of a state read.
   - Why this button gate, this event order, this dependency
     array.
   - Edge cases the code is intentionally not handling (and
     why that's correct).

2. **Mention relevant other code when behavior is non-local.**
   When the correctness of a function depends on something
   happening in another file/hook/component, reference it. For
   example: "this depends on `useKeyboardShortcuts` having
   already flipped `tool.type` — see hooks/useKeyboardShortcuts.ts
   §Right-mouse handler." Or: "the matching tear-down lives in
   the cleanup branch of the same effect."

The intent is that a new reader (human or AI) can land on any
file and trace the relevant context without re-deriving it from
the design doc.

## fabric.js integration patterns to know

The codebase has three recurring patterns that look weird but
are intentional. Don't "fix" them without reading the comments.

- **Ref-mirror for live state in fabric handlers.** fabric event
  handlers can outlive a React render and capture stale closure
  values. Pattern: mirror props into a ref, update the ref on
  every render, and read through the ref inside the handler. See
  `src/tools/pan.ts` for the canonical example (commented
  there). ESLint's `react-hooks/refs` rule is **off** specifically
  to allow this (see `eslint.config.js`).
- **Custom properties on fabric objects.** fabric objects accept
  arbitrary properties. Two existing uses: the `REPLAY` sentinel
  in `useUndo` (prevents undo from itself triggering the action
  stack) and metadata tags (`__operatorId`, `__phase`) in
  `tools/metadata.ts`. Type-cast through `any` is the accepted
  shape; ESLint allows it for fabric integration.
- **`unerasable: Set<string>`.** A stable ref-owned Set of object
  src URLs the eraser and undo must skip (the loaded map image is
  the main case). Created in `App.tsx`, threaded through
  `useEraser` / `useUndo` / `eraserCore`. Reset on every map
  switch to prevent leakage across maps.

## React + ESLint conventions

`eslint.config.js` disables three `react-hooks/*` rules
(`immutability`, `refs`, `set-state-in-effect`) because they
conflict with fabric.js integration. The reasons are documented
in the config file itself. If those rules ever start tripping
elsewhere, read the rationale before re-enabling.

## Testing patterns

- Hook tests use `renderHook` + `src/test/mockCanvas.ts`. The
  mock is intentionally minimal; extend it (with a comment
  explaining why) when a new test needs a method.
- E2E tests live in `e2e/`. Smoke spec asserts the
  fabric-v7 center-origin regression — preserve that assertion
  verbatim when modifying it.

## Adding a new tool or mark — touchpoint checklist

Tools and marks have a *lot* of integration surface. Easy to add
the implementation and forget some of the discoverability /
persistence / undo plumbing. Use this checklist whenever a new
tool (V/B/E/M/A/S/O/X/I/D/T-class binding) or a new tactical mark
ships, and update the checklist when you discover a new
touchpoint a future addition would need.

### Always

- **`src/tools/tool.ts`** — add the new value to the `ToolType`
  enum.
- **`src/state/tool.ts`** — if the tool is one-shot / transient
  (auto-reverts after a single commit, like sightline / cone /
  text), add it to `TRANSIENT_TOOLS` so persistence falls back
  to `pencil` on reload instead of restoring a tool whose anchor
  / edit-session is gone.
- **`src/App.tsx`** — five distinct edits:
  1. Import the tool's hook (`useArrow`, `useMark(SPEC)`, …).
  2. Instantiate it; grab its `onChoice` setter.
  3. Add a `Binding` entry in the `bindings` `useMemo` array,
     and add the new `onChoice` to the array's deps.
  4. If it's a continuous-capture tool that uses the freehand
     brush, wire any brush effects that depend on the active
     tool (see existing "brush.arrowhead follows tool" effect
     as a template).
  5. If it should appear in the toolbar, add the icon button JSX
     and wire its `onClick`.
- **`src/components/HotkeysOverlay.tsx`** — add a row to the
  appropriate `SECTIONS` entry so the binding shows up in the `?`
  reference overlay. Tests in `HotkeysOverlay.test.tsx` enforce
  that every P1 tactical-mark key has a kbd pill — if you add a
  mark binding, extend that assertion list.

### When the tool produces a fabric object that should integrate with the rest of the canvas

- **`src/tools/metadata.ts`** — add a literal to the `MarkType`
  union and to the validation `switch` in `readMarkType`. The
  `__id` and `__seq` fields are written by `tagObject` for free
  — no per-mark wiring needed. `tagObject` is idempotent on
  re-call, so it's safe to invoke from any number of code paths.
- **`useUndo` integration** — the new mark's `canvas.add` already
  flows through `useUndo`'s `object:added` listener for free
  (undo of an add = remove from canvas). If the mark supports
  direct-manipulation handle edits, also implement
  `serialize` / `deserialize` on its `MarkSpec` so the
  `object:modified` → modify-action path (`useUndo` §4.10) can
  roll back handle edits.
- **`useEraser` integration** — generic; works on any fabric
  object as long as it's `evented: true`. No code change needed
  unless the mark needs to be unerasable (then add it to the
  `unerasable` set in App.tsx, alongside the map image).
- **Operator visibility** — if the mark carries operator metadata
  (most do — see `tagObject` in `metadata.ts`), the existing
  per-operator visibility effect in App.tsx will toggle it
  automatically. No new wiring.
- **Replay timeline (P2)** — `tagObject` writes `__id` + `__seq`
  on every fabric object it touches, so any new mark inherits
  timeline participation for free. The replay scrubber will pick
  the mark up via its `object:added` subscriber and slot it into
  the projection (`src/state/timeline.ts`) at the next tick.
  - **Animation defaults to instant-appear.** That's correct for
    most marks (engagement X, sound ping, position dot, text,
    sightline today). If the mark has intrinsic temporal
    structure that's worth animating in replay (think: cone
    sweep, path reveal), add an entry to `ANIMATORS` in
    `src/tools/marks/animators.ts` keyed by its `MarkType`.
    See the `pathReveal` / `coneSweep` implementations for the
    `applyAnimation(obj, t)` contract (`t ∈ [0,1]`,
    geometry-agnostic mutation, `t = 1` restores fully).
  - **Per-mark animation duration.** Edit `animDurationFor` in
    `src/state/timeline.ts` so the projection knows how long the
    new mark takes to play back. Path-style marks use the cached
    arc length + `drawSpeedPxPerSec`; fixed-duration animations
    pull a constant from `ANIMATION_CONFIG`.

### When the tool is a discrete-gesture `MarkSpec` (the common case for new tactical marks)

- **`src/tools/marks/{name}.ts`** — define and export `{NAME}_SPEC`
  (typed `MarkSpec`) with `build`, `applyPhase`, plus
  optional `serialize` / `deserialize` (for modify-undo) and
  `buildControls` (for Slice K direct-manipulation handles).
- **`src/App.tsx`** — register the spec in the central
  `registerMark(...)` effect; without this `useUndo`'s modify
  lookup and `registerControls` both fail silently because
  `getSpecByMarkType` returns null.
- **`src/tools/marks/useMark.ts`** — if the new mark needs an
  interaction kind that doesn't exist yet (`chained-click`,
  `chained-drag`, `point`, `text`), extend `MarkInteraction` in
  `types.ts` and add the corresponding `useEffect` lifecycle
  here. Use the existing chained-click effect as a template
  (note the `previousAtActivation` snapshot pattern).
- **Tests** — add `{name}.test.ts` covering the spec contract
  (build / applyPhase round-trip) and, if the spec has it,
  serialize/deserialize round-trip + the interaction lifecycle
  (soft-fail when no anchor, commit flow, click-cancel, Esc).

### When the tool is a continuous-capture freehand tool (pencil / arrow / future siblings)

- Wraps `useFreehand` from `src/tools/freehand/useFreehand.ts` —
  see `src/tools/arrow.ts` for the canonical example with
  postprocess (`appendArrowhead`).
- If the postprocess does a path → group swap (or any other
  multi-step canvas mutation that fabric would otherwise record
  as multiple undo actions), use the `useUndo` API
  (`popLastAction`, `markTransient`, `recordAdd`) to keep the
  undo stack at exactly one entry per user action. See arrow's
  step-8 comment for the contract.

### When the tool chains off the most-recent arrow tip

- The chain anchor is `lastArrowTipRef` in App.tsx, populated by
  a canvas-walk effect that subscribes to `object:added` /
  `object:removed` and reads each arrow group's `__arrowTip`.
  Reading the ref is enough; the recompute keeps it in sync
  through undo and eraser automatically.
- The arrow tool tags `__arrowTip` on commit via `tagArrowTip`
  in `metadata.ts` — don't read fabric path internals; use the
  helper.

### Last check

- `pnpm typecheck && pnpm lint && pnpm test` before committing;
  `pnpm test:e2e` before merging.
- Press `?` in the live app and visually confirm the new
  binding appears in the overlay. Tests would catch a missing
  section, but a visual check confirms the row formatting.

## Commit/PR norms

- Conventional commit subjects (e.g., `feat: …`, `fix: …`).
- Each phase of the P0 slice is its own PR per the sequencing
  in `design_p0_slice.md` §9.
- Run `pnpm typecheck && pnpm lint && pnpm test` before
  committing. `pnpm test:e2e` before merging.
