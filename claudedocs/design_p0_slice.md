# P0 Starter Slice — Design Document

**Created:** 2026-05-10
**Updated:** 2026-05-11
**Inputs:** `claudedocs/tactical_input_design_2026-05-10.md`,
`claudedocs/research_ergonomic_input_2026-05-10.md`
**Output type:** Architecture / component design — implementation
will follow via `/sc:implement`.
**Scope:** Four cohesive sub-designs (Slices A–D below). Vocabulary
expansion (new mark types: arrow, sightline, cone, engagement X,
sound ping) is **explicitly deferred** to a follow-up design pass.

---

## 0. Decisions resolved since first draft

These were open questions in the original draft; they are now
settled and the rest of the document reflects them.

| Decision | Resolution |
|---|---|
| Operator color defaults | Accepted as proposed: Alpha `#0693E3`, Bravo `#FCB900`, Charlie `#00D084`, Delta `#F78DA7` |
| Chip strip placement | **Inside the header**, centered between brand-cluster and toolbar |
| Phase toggle placement | Inside the header, adjacent to the chip strip |
| Redo (`Cmd/Ctrl+Shift+Z`) | **Dropped from P0** — `useUndo` stays single-directional |
| Sidebar deletion + `react-color` removal | **Deferred** — sidebar stays as a near-empty stub; cleanup is queued as tech debt |
| Naming of the planned-vs-actual attribute | Renamed `intent` → **`phase`**, values `planned`/`actual` → **`plan`/`record`**. UI label reads `PLAN │ RECORD`. Keyboard `P` toggles. The previously-proposed `P` alias for pencil is dropped (`B` alone covers pencil; matches Excalidraw/tldraw) |

Three small implementation corrections (surfaced in the
"keyboard listener rebinding" and "Cmd vs Ctrl" exchanges) are
also folded in:

- The binding type is modifier-aware with a single `'cmdOrCtrl'`
  token that matches `e.metaKey || e.ctrlKey`. Matcher logic is
  modifier-**strict** — `Ctrl+Shift+Z` does not fire an undo binding
  defined as `Ctrl+Z`.
- The shortcut hook stores bindings in a **ref-mirror** so the
  window listener is installed once per canvas, not re-installed on
  every App.tsx render.
- Modified taps (`Cmd/Ctrl+Z`) fire **even while a quasi-mode is
  held**; only unmodified taps are suppressed during quasi-mode.

---

## 1. What this slice ships

**Slice A — Quasi-mode infrastructure + keyboard shortcuts.** A
centralized keyboard hook that supports two kinds of bindings:
*tap* (locked-mode switch) and *hold* (spring-loaded quasi-mode).
Initial bindings cover existing tools only: `V` select, `B` pencil,
`E` eraser, `M` open marker radial, `P` toggle phase,
`Space` (held) pan, right-mouse (held) eraser. Subsumes the
keyboard listener currently inside `useUndo`.

**Slice B — Operator chip strip + per-operator stroke tagging.**
A horizontal chip strip rendered inside the header, centered.
Selecting an operator drives the brush color and tags subsequent
strokes with the operator id. Shift-click toggles a single
operator's visibility. Persisted to localStorage.

**Slice C — Solid / dashed phase toggle.** A single segmented
control in the header next to the chip strip. When phase is
`plan`, new freehand strokes get a `strokeDashArray` post-
creation. Tap `P` to flip. Persisted to localStorage.

**Slice D — Marking-menu radial stamp picker.** Replaces the
slide-in sidebar's marker grid with an 8-segment radial overlay
positioned at the cursor. Triggered by tap-`M` (and, optionally,
right-mouse-hold elsewhere later). Press-and-flick variant for
expert use. The four existing markers occupy four wedges; the
remaining wedges are placeholders.

## 2. What this slice does NOT ship (explicit non-goals)

- **New mark types** (arrow, sightline, overwatch cone, engagement
  X, sound ping). Each is its own tool design.
- **Stroke replay / temporal scrubber.** Deferred to a separate
  slice; depends on a temporal model not yet designed.
- **Stroke editing / direct manipulation of arrows.** Requires
  object-mode arrows, which depend on the new mark types.
- **Marker recolor per operator.** Markers retain their intrinsic
  color identity (PMC armor, Scav rags). Authorship is conveyed via
  the chip strip's operator-visibility toggle, not by tinting.
- **Per-tool brush widths or alternative pencil styles.** Out of
  scope.
- **Redo (`Cmd/Ctrl+Shift+Z`).** Dropped from P0. `useUndo`'s
  single-direction stack stays as-is.
- **Removing the existing sidebar.** It loses its marker section
  but stays in the DOM as a near-empty stub. Sidebar deletion and
  `react-color` removal are queued as a tech-debt follow-up.
- **Cmd+K command palette and `?` shortcut overlay.** Out of P0 —
  flagged as P1 follow-ups once the shortcut surface stabilizes.

---

## 3. Architecture Overview

### 3.1 Current state (recap)

`App.tsx` owns the canonical state and stitches together one hook
per tool. Each tool hook (`usePencil`, `useEraser`, `useStamp`,
`usePan`, `useSelect`, `useUndo`, `useZoom`) takes the fabric
canvas, the current `Tool`, and a `setTool` setter; it registers
fabric event handlers when its tool is active and tears them down
on cleanup. Keyboard handling is one-off in `useUndo`. `usePan` is
already a quasi-mode (middle-click); it documents the **ref-mirror
pattern** required because tool flips mid-handler would otherwise
tear down the very handler that triggered the flip.

### 3.2 New architecture (after this slice)

```
                       App.tsx
                          │
       ┌──────────────────┼────────────────────┐
       │                  │                    │
   tool state       operator state         phase state
   (existing)       (new, localStorage)    (new, localStorage)
       │                  │                    │
       └──────┬───────────┴────────────────────┘
              │
        useKeyboardShortcuts(canvas, bindingsRef)  ← new, central
              │
   ┌──────────┼───────────┬──────────┬─────────┐
   │          │           │          │         │
useSelect  usePencil   useEraser  useStamp  useUndo
                       │
                       └─ uses metadata helper to tag strokes

  <OperatorChips />    <PhaseToggle />    <MarkerRadial /> ← new components
```

Three new additions, plus targeted refactors to existing tool
hooks (correction: an earlier draft framed this as "no existing
tool contracts change," which was wrong — see §8.2 for the actual
hook-signature changes).

- A new `useKeyboardShortcuts` hook centralizes keyboard binding
  (subsumes `useUndo`'s window-level listener) and adds quasi-mode
  semantics.
- A new metadata module (`src/tools/metadata.ts`) attaches and
  reads `operatorId`/`phase` properties on fabric objects via the
  same "augment fabric object with custom property" pattern the
  codebase already uses for the undo `REPLAY` sentinel and the
  `unerasable` Set.
- Three new React components for the chip strip, phase toggle, and
  marker radial. The chip strip and phase toggle live inside the
  header; the radial is a transient overlay above the canvas.

Targeted refactors to existing hooks:

- `usePencil` gains access to active operator and phase (via
  refs, mirroring the pattern in `usePan`) so `path:created` can
  tag and dashArray new strokes.
- `useStamp.onChoice` changes from a DOM-event signature to a
  plain `(url: string) => void` so the radial menu can drive it.
- `usePan` grows a second activation path: in addition to its
  existing middle-click drag, it binds left-button drag handlers
  while `tool.type === 'pan'`, so the keyboard hook can drive
  Space-pan by flipping the tool. See §4.5.
- All tool `mouse:down` handlers gate on `e.button === 0` so the
  right-mouse-hold eraser doesn't race them. See §4.5.

### 3.3 Existing patterns reused

| Pattern | Source | Reused for |
|---|---|---|
| Ref-mirror to read live state mid-handler | `usePan` | `useKeyboardShortcuts` (bindings ref) |
| Custom property on fabric objects (`REPLAY`) | `useUndo` | Operator/phase metadata |
| `Set<string>` of allowlisted sources | `unerasable` | (Reused as-is) |
| Skip listener when input focused (`isInput`) | `useUndo` | `useKeyboardShortcuts` |
| Hook returns `{ onChoice, ... }` for toolbar wiring | All tools | Stamp's `onChoice` becomes the radial's onSelect callback |
| Vitest `mockCanvas` for hook tests | `src/test/mockCanvas.ts` | All new hook tests |

---

## 4. Slice A — Quasi-mode infrastructure + keyboard shortcuts

### 4.1 Design intent

A single hook owns all keyboard input. It supports two binding
kinds and exposes a small API to App.tsx. Tool-hook `onChoice`
callbacks are invoked by keyboard events the same way they're
invoked by toolbar clicks.

Each existing tool hook also receives **targeted refactors** to
support this slice (corrected from an earlier draft that said
"the existing tool hooks do not change"): pencil gains
ref-mirrored access to operator/phase, stamp's `onChoice` takes a
URL string, pan grows a second activation path keyed on
`tool.type`, and eraser logic is extracted into a shared session
so the right-mouse quasi-mode can drive it directly (see §4.5).
The exact per-hook deltas are in §8.2.

### 4.2 API surface

```ts
// src/hooks/useKeyboardShortcuts.ts — DESIGN, not final code

type Modifier = 'cmdOrCtrl' | 'shift' | 'alt';

type TapBinding = {
  kind: 'tap';
  key: string;                // single-key value, lowercased
  modifiers?: Modifier[];     // default: [] (= unmodified only)
  onTap: () => void;
};

type HoldBinding = {
  kind: 'hold';
  key: string;                // ' ' (space) etc.
  onEnter: () => void;        // switch to quasi-mode tool
  onExit: () => void;         // restore previous tool
};

type MouseBinding = {
  kind: 'mouseHold';
  button: 0 | 1 | 2;          // 0 = left, 1 = middle, 2 = right
  onEnter: () => void;
  onExit: () => void;
};

type Binding = TapBinding | HoldBinding | MouseBinding;

useKeyboardShortcuts(
  canvas: fabric.Canvas | null,
  bindings: Binding[],
): void;
```

**Internal storage.** The hook stores `bindings` in a ref that is
overwritten on every render (the `usePan` ref-mirror pattern,
already endorsed by the ESLint config's `react-hooks/refs: off`
exception). The single `window.addEventListener('keydown', …)` is
installed once per canvas, depends only on `canvas` in its
effect deps, and reads bindings through the ref. Without this,
every App.tsx render would tear down and re-add the window
listener — including the undo binding.

**Matcher (modifier-strict).** A binding matches a `KeyboardEvent`
only when every modifier in `binding.modifiers` is present *and*
every modifier not in the list is absent:

```ts
// Conceptual
const wants = new Set(binding.modifiers ?? []);
const hasCmdOrCtrl = e.metaKey || e.ctrlKey;
if (wants.has('cmdOrCtrl') !== hasCmdOrCtrl) return false;
if (wants.has('shift')     !== e.shiftKey)     return false;
if (wants.has('alt')       !== e.altKey)       return false;
return e.key.toLowerCase() === binding.key.toLowerCase();
```

The strict equality on each modifier is load-bearing — without it,
`Ctrl+Shift+Z` would match a binding defined as `Ctrl+Z`, and once
redo lands in a future slice it would double-fire alongside undo.

`'cmdOrCtrl'` is the cross-platform primary-modifier token,
matching the existing check in `useUndo` (`e.ctrlKey || e.metaKey`).
If a Mac-only or Windows-only shortcut is ever needed, the
`Modifier` union can grow to include literal `'cmd'` / `'ctrl'`
without breaking `'cmdOrCtrl'`.

### 4.3 Binding table (initial)

| Trigger | Kind | Binding form | Action |
|---|---|---|---|
| `v` | tap | `{ key: 'v' }` | `setSelect.onChoice()` |
| `b` | tap | `{ key: 'b' }` | `setPencil.onChoice()` |
| `e` | tap | `{ key: 'e' }` | `setEraser.onChoice()` |
| `m` | tap | `{ key: 'm' }` | open marker radial at last cursor position |
| `p` | tap | `{ key: 'p' }` | toggle phase (`plan` ↔ `record`) |
| `1`–`4` | tap | `{ key: '1'..'4' }` | activate operator 1..4 (no-op if slot empty) |
| `Space` (held) | hold | `{ key: ' ' }` | enter pan; exit returns to prior tool |
| Right mouse (held) | mouseHold | `{ button: 2 }` | enter eraser; exit returns to prior tool |
| `Cmd/Ctrl+Z` | tap | `{ key: 'z', modifiers: ['cmdOrCtrl'] }` | undo |

**Notes:**
- `V` is the canonical select key (matches Excalidraw/tldraw).
- `P` is reclaimed from the previously-proposed pencil alias and
  reassigned to phase. `B` alone covers pencil.
- Digits `1`–`4` are operator slots only — not also bound to tool
  selection. The research showed digit-as-tool to be a minor
  convenience, and operator activation is more valuable.
- Redo (`Cmd/Ctrl+Shift+Z`) is dropped from P0. Per §4.2's
  modifier-strict matcher, the future redo binding will not
  collide with the present undo binding.

### 4.4 Quasi-mode semantics

1. **One quasi-mode at a time.** A ref `quasiModeKey: string | null`
   tracks which key is currently held. While it's set, other hold
   keys are ignored (no "Space + Shift" simultaneously).
2. **Unmodified taps are suppressed while a quasi-mode is held.**
   This prevents accidental tool switching mid-pan. Bindings like
   `V`, `B`, `E`, `M`, `P` do not fire while space is depressed.
3. **Modified taps fire regardless of quasi-mode state.** `Cmd/Ctrl+Z`
   works while space is held. Quasi-mode and modifier-driven actions
   are orthogonal: panning the canvas should not block undoing.
4. **`previousTool` is captured on `onEnter`.** A ref
   `previousToolRef: Tool | null` holds the tool that was active
   when the quasi-mode was entered. `onExit` restores it.
5. **Auto-release on `blur`.** A `window.addEventListener('blur', ...)`
   calls `onExit` for any active quasi-mode. Without this, an
   alt-tab while holding space leaves the app in permanent pan
   mode.
6. **Repeat suppression for holds.** `keydown` fires repeatedly
   while a key is held. The hook checks `if (quasiModeKey === e.key)
   return` before invoking `onEnter`. **Tap bindings deliberately
   do NOT have repeat suppression** — holding `Cmd+Z` continues to
   spam undo, which is the current (desirable) behavior.
7. **Input focus skip.** Reuse `isInput(document.activeElement)`
   from `useUndo`.
8. **Canvas focus required for `Space`.** The canvas div already
   has `tabIndex={0}`. The hook additionally checks
   `document.activeElement === canvasContainer || isBodyFocused()`
   so spacebar doesn't hijack textarea inputs elsewhere.
9. **`preventDefault` for `Space`.** Without it, the browser
   scrolls. Always preventDefault for known bindings when not in
   input.
10. **Shortcut suspension while a modal is open.** A ref
    `shortcutsSuspended: boolean` lets transient overlays (the
    marker radial in this slice; future shortcut overlays, command
    palette) freeze the shortcut hook. When suspended:
    unmodified taps and holds (`V`, `B`, `E`, `M`, `P`, `Space`,
    right-mouse) do **not** fire; modified bindings (`Cmd/Ctrl+Z`)
    still fire. The radial sets `suspended = true` on open and
    `false` on close (including Esc-dismiss). Without this, typing
    `V` over a radial menu would switch tools and confuse state.
11. **Button-focus blur after click.** Toolbar buttons, chips, and
    the phase toggle are real `<button>` elements; after a click,
    browser focus stays on the button, and Space then re-clicks
    that button instead of panning. Every clickable control in
    this slice must call `(e.currentTarget as HTMLElement).blur()`
    at the end of its handler so canvas-or-body focus is restored
    and the spacebar quasi-mode works on the very next press. This
    is a tool-hook-side rule; the shortcut hook can't fix it from
    its side.

### 4.5 Mouse button reservation and Space-pan integration

The shortcut hook can't own right-mouse semantics unless every
tool's `mouse:down` handler defers to it. fabric.js emits
`mouse:down` as a plain pub-sub event with no propagation control,
so multiple handlers fire in registration order, and `preventDefault`
on a DOM `contextmenu` event does nothing about already-queued
fabric handlers. The contract that makes the design work:

**Button reservation contract (all tool hooks).** Every fabric
`mouse:down` handler in every tool gates on `e.button === 0`
(left). Right (`2`) and middle (`1`) are reserved:

- **Right (`2`)** — reserved for the shortcut hook's eraser
  quasi-mode (see below).
- **Middle (`1`)** — reserved for `usePan`'s middle-click pan
  (already gated correctly today in `usePan` line 47).

Concretely, the `mouse:down` handlers in `useStamp.placeMarker`
and `useEraser.onClick` must each add an early-return on
non-left-button. `usePencil` uses fabric's `isDrawingMode` (not a
custom handler), so its button gating is delegated to fabric's
internal logic — to validate during implementation that
right-button drag does not produce a freehand stroke.

**Right-mouse-hold eraser** — and the eraser-core extraction.

A naive design ("flip `tool.type` to `eraser` on right-mouse-down
and let `useEraser` take over") doesn't work because of a timing
window:

1. Right-mouse-down fires on the canvas.
2. The shortcut hook handles it: calls `setTool({type: 'eraser'})`.
3. The fabric `mouse:down` event for that very click has already
   propagated to all currently-registered handlers.
4. React then re-renders; `useEraser`'s effect runs and registers
   *its* `mouse:down` / `mouse:move` / `mouse:up` handlers.
5. The user begins dragging while right-mouse is still down.
6. `mouse:move` fires, but `useEraser.activeRef` was never set,
   because step 4's handlers missed the mouse:down in step 1.
   Erasing never happens.

So `useEraser` can't be the implementation site for the quasi
mode — it's structurally too late. The fix is to **extract
erasure into a shared session** that the shortcut hook can drive
directly, independent of React state.

**New module `src/tools/eraserCore.ts`** exposes:

```ts
// DESIGN
export interface EraserSession {
  start(): void;       // begin erasing on subsequent mouse:moves
  stop():  void;       // stop and detach the move handler
  isActive(): boolean;
}

export function createEraserSession(
  canvas: fabric.Canvas,
  unerasable: Set<string>,
): EraserSession;
```

`createEraserSession` owns the same `eraseTargetIfAllowed` core
(the unerasable-Set guard plus `canvas.remove(target)`) that
`useEraser` currently inlines, and attaches a `mouse:move`
listener on `start()` / detaches it on `stop()`. The session is
canvas-side state; it doesn't know about React.

**Wiring:**
- **Locked eraser (`useEraser`).** When `tool.type === 'eraser'`,
  the hook creates a session and binds `mouse:down → start`,
  `mouse:up → stop`. Effect cleanup calls `stop` and detaches.
  The `mouse:down` gating on `e.button === 0` is preserved (so a
  right-click in locked eraser mode doesn't re-trigger the quasi
  flow on top of itself).
- **Right-mouse quasi eraser (shortcut hook).** On right-mouse
  down (`e.button === 2`), the shortcut hook creates a session
  (or reuses a hook-scoped one), calls `session.start()`,
  captures `previousTool`, and flips `tool.type` to `'eraser'`
  for visual state. On right-mouse up, calls `session.stop()` and
  restores `previousTool`. The two-step "arm session + flip tool"
  happens synchronously in the same fabric mouse:down handler, so
  the next mouse:move erases reliably without waiting for React.

Both paths use the same erasure logic, so behavior is identical;
the difference is only in lifecycle (effect-driven vs.
handler-driven).

Browser context menu is suppressed via a DOM `contextmenu`
listener on `canvas.upperCanvasEl` calling `preventDefault`.
Because every other tool's `mouse:down` handler is gated on
`e.button === 0`, no other tool acts on the right-click.

**Spacebar pan via `usePan`.** Today `usePan` only binds drag
handlers under `e.button === 1`; flipping `tool.type` to `pan`
from the keyboard would change React state but not behavior. The
refactor:

- `usePan` keeps its existing middle-button drag (active
  regardless of `tool.type`).
- `usePan` additionally registers `mouse:down` / `mouse:move` /
  `mouse:up` for `e.button === 0` **only when `tool.type === 'pan'`**.
  This second path is gated by an effect that depends on
  `[canvas, tool.type]` rather than `[canvas]`.
- The keyboard hook's Space binding flips the tool to `pan` on
  enter, back on exit. `usePan` reacts to the flip.

The ref-mirror pattern in `usePan`'s `toolRef` / `setToolRef`
already handles the case where the tool changes mid-handler, so
the refactor is additive — the existing middle-click logic is not
disturbed. The earlier draft's claim that `usePan` "stays as-is"
is therefore corrected: `usePan` does receive a second activation
path, but its existing behavior is preserved.

### 4.6 Migration of `useUndo`'s keyboard

`useUndo`'s window-level `keydown` listener moves into
`useKeyboardShortcuts` as one of the bindings. `useUndo` exports
`onUndo` as today; the action stack (fabric `object:added` /
`object:removed` subscriptions) stays in place — it's data, not
input.

**Migration must be atomic.** Adding the central binding without
deleting `useUndo`'s window listener in the same change would
register both listeners and every undo would fire twice. The
checklist in §11 explicitly verifies this.

### 4.8 Choosing tap vs hold for new bindings (forward-looking)

This slice ships only the existing tools; future vocabulary
expansion (arrow, sightline, engagement, sound, overwatch cone)
will add more bindings. To prevent inertial misclassification, the
rule for picking between `tap` (locked) and `hold` (quasi) is:

**Default to tap. Reserve hold for two specific cases:**

1. **Transient tool invocations** where the user briefly assumes a
   different role to do one motion and immediately wants to be back
   in their previous tool. Pan is the canonical example — you
   become a pan tool just long enough to reposition the canvas,
   then on release you're drawing again. (The viewport itself stays
   where you panned to; only the tool reverts.) The release-key
   motion does real ergonomic work — it spares the user a manual
   re-selection. Anchor-dependent single-shot placements
   (sightline, overwatch cone — both anchored to the last arrow's
   tip) are also transient by this definition: each invocation is
   one click (or one click+drag), then back to the previous tool.
2. **Genuinely rare modes** invoked once or twice per debrief, where
   the muscle memory of "I'm holding this key, so I'm in that mode"
   is welcome rather than fatiguing.

Frequency and selection state both push toward tap. Tools used
many times per debrief, or tools that carry a "which variant did I
pick" state (which marker, which color), should be tap regardless
of how individual invocations feel.

**Forecast for the future vocabulary slice:**

| Future tool | Tap or hold? | Reason |
|---|---|---|
| Arrow | **tap** | Most-used mark in a debrief; sustained drawing is comfortable locked |
| Engagement X | **tap** | Multiple per debrief; free placement; users live in "contact recording mode" briefly |
| Sound ping | **tap** | Same |
| Sightline | **hold** | Anchor-dependent single-shot — one click from last arrow's tip, then back to previous tool |
| Overwatch cone | **hold** | Anchor-dependent single-shot — one click+drag from last arrow's tip, then back |

The split is essentially "free placement, repeatable" (tap) vs
"anchor-dependent single-shot" (hold), with arrow as the sustained-
drawing exception that's clearly tap.

The *visual* treatment for the anchored marks (sightline,
overwatch cone) and their relationship to the arrow is captured
separately in `claudedocs/vocabulary_visual_language_2026-05-11.md`
— Idea 1 (cone family) is the decision recorded there.

### 4.7 Testing

New file `src/hooks/useKeyboardShortcuts.test.ts`:

- Tap binding fires `onTap` on keydown when modifier set matches
  exactly.
- **Modifier-strict:** binding `{ key: 'z', modifiers: ['cmdOrCtrl'] }`
  does **not** fire on `Ctrl+Shift+Z`.
- **`cmdOrCtrl` matches both:** the same binding fires on `Ctrl+Z`
  and on `Meta+Z`.
- Tap binding suppressed when an input is focused.
- Hold binding fires `onEnter` once on keydown, `onExit` once on
  keyup, regardless of `keydown` repeat events.
- Tap bindings allow repeat (holding `Cmd+Z` fires multiple times).
- Two simultaneous holds: second is ignored.
- `blur` releases an active hold.
- **Modified tap fires while a quasi-mode is held** (regression for
  the quasi-mode carve-out in §4.4 item 3).
- Bindings updated between renders are seen by the next event
  without re-installing the window listener (ref-mirror regression).

---

## 5. Slice B — Operator metadata + chip strip

### 5.1 Data model

```ts
// src/state/operators.ts — DESIGN
export type OperatorId = string; // 'op-alpha', 'op-bravo', ...

export type Operator = {
  id: OperatorId;
  name: string;        // 'Alpha', 'Bravo', or user-renamed
  color: string;       // '#0693E3' etc.
  visible: boolean;    // toggled via shift-click
};

// Default roster — four operators.
export const DEFAULT_OPERATORS: Operator[] = [
  { id: 'op-alpha',   name: 'Alpha',   color: '#0693E3', visible: true },
  { id: 'op-bravo',   name: 'Bravo',   color: '#FCB900', visible: true },
  { id: 'op-charlie', name: 'Charlie', color: '#00D084', visible: true },
  { id: 'op-delta',   name: 'Delta',   color: '#F78DA7', visible: true },
];

const STORAGE_KEY = 'tarkov-debrief:operators:v1';
const ACTIVE_KEY  = 'tarkov-debrief:active-operator:v1';
```

**Color choice rationale.** Reds are deliberately excluded so they
remain available for engagement marks (a future tactical-vocabulary
slice). The four selected hexes are drawn from the existing
color-picker swatch palette to stay coherent with the design
system. Confirmed acceptable for P0; user-recolor is a P1 concern.

### 5.2 State location

Operators (the roster) and `activeOperatorId` live in `App.tsx`
as two `useState`s, mirrored to localStorage on every change. They
are **not** scoped to a map — the squad is the squad across maps.

### 5.3 Metadata helper

```ts
// src/tools/metadata.ts — DESIGN
const OPERATOR_KEY = '__operatorId' as const;
const PHASE_KEY    = '__phase' as const;

export type StrokePhase = 'plan' | 'record';

export function tagObject(
  obj: fabric.FabricObject,
  operatorId: OperatorId | null,
  phase: StrokePhase,
): void {
  (obj as any)[OPERATOR_KEY] = operatorId;
  (obj as any)[PHASE_KEY]    = phase;
}

export function readOperator(obj: fabric.FabricObject): OperatorId | null {
  return (obj as any)[OPERATOR_KEY] ?? null;
}

export function readPhase(obj: fabric.FabricObject): StrokePhase {
  return (obj as any)[PHASE_KEY] ?? 'record';
}
```

This mirrors the `REPLAY` sentinel pattern in `useUndo` line by
line. Type-cast through `any` (ESLint already permits this for
fabric integration; see the eslint config rationale comments).

### 5.4 Where metadata is attached

For freehand pencil strokes: fabric.js emits a `path:created`
event when the brush completes a stroke (before `object:added`
fires for the same path). Attach metadata in `path:created` to
ensure it's present by the time anything else sees the path.

```ts
// Conceptual — inside usePencil after slice integrates
canvas.on('path:created', ({ path }) => {
  tagObject(path, activeOperatorId, phase);
  if (phase === 'plan') {
    path.set({ strokeDashArray: [10, 5] });
    canvas.requestRenderAll();
  }
});
```

For markers (`useStamp`): tag at `canvas.add(image)` time. Markers
don't get dashArray (they're images, not strokes).

### 5.5 Brush color follows active operator

When the operator changes (chip click), update the brush color:

```ts
useEffect(() => {
  if (!canvas?.freeDrawingBrush || !activeOperator) return;
  canvas.freeDrawingBrush.color = activeOperator.color;
}, [canvas, activeOperator?.color]);
```

The standalone `color` state in `App.tsx` becomes derived from
`activeOperator.color`; the sidebar's color picker section goes
empty (the Twitter color picker stays mounted but invisible — its
removal is queued as tech debt with the sidebar cleanup).

### 5.6 Visibility toggling

When a chip's `visible` flips to `false`, iterate `canvas.getObjects()`
and set `obj.visible = false` on any object whose
`readOperator(obj) === toggledId`. Call `canvas.requestRenderAll()`.
Visibility state lives on the Operator object, not on the fabric
object, so re-toggling is cheap and undo doesn't have to track it.

For objects with no operator (drawn before this slice shipped, or
when no operator is active), they remain always visible. This is
the "legacy strokes are everyone's strokes" semantic.

**Hidden operators cannot be active.** If the user hides the
currently active operator, `activeOperatorId` is set to `null`
in the same state transition. From that point until the user
selects a visible operator, new strokes are tagged with
`operatorId = null` and use the fallback `PENCIL_COLOR`. They
remain visible (they have no operator association to hide
behind).

Without this rule, hiding "Alpha" while Alpha is active would not
actually stop new Alpha-marks from appearing on the canvas — the
chip would say hidden, the marks would keep showing up, and the
"show only Alpha's path" workflow described in the tactical input
memo would silently break.

### 5.7 Chip strip component

```
┌─ header ──────────────────────────────────────────────────────────┐
│  Tarkov Debrief   [● Alpha] [● Bravo] [○ Charlie] [● Delta] [+]   │
│  (github mark)    PLAN │ RECORD                       [V][B][E]…  │
└───────────────────────────────────────────────────────────────────┘
```

**Placement.** Inside the existing `<header className="App-header">`.
The header transitions from a two-section flex (brand-cluster |
toolbar) to a three-section flex (brand-cluster | operator-cluster
| toolbar). The operator cluster contains the chip strip and the
phase toggle (Slice C), grouped because they share conceptual
adjacency (who + which phase).

CSS rationale:
- Header keeps `display: flex; justify-content: space-between`.
- The operator-cluster becomes a centered middle child.
  Implementation likely uses `flex: 1; justify-content: center;
  display: flex; gap: …`.
- Both edge clusters keep their natural width.
- Header `min-height` may need to grow slightly (current 50px;
  expect ~64px) to clear two stacked rows of chip + toggle on
  narrower viewports — to be validated visually.

Visual states per chip:
- **Active** (currently selected operator): solid outline in
  operator color, filled background tint.
- **Visible & inactive**: solid color dot + name on the
  dark-header background.
- **Hidden** (shift-clicked off): grayed-out + a slash through the
  dot. Cursor `pointer` remains.

Interactions (explicit matrix to lock semantics per §5.6):

| Gesture | On visible chip | On hidden chip |
|---|---|---|
| Click | Activate this operator | Unhide **and** activate |
| Shift+click | Hide this operator (auto-deactivates if it was active — sets `activeOperatorId = null`) | Unhide this operator (does not change active) |
| Double-click | Enter rename mode (out of P0; UI leaves room) | Same |
| Right-click | Context menu — rename / recolor / delete (out of P0) | Same |

After every chip click, the chip's button must blur per §4.4 item
11 so the canvas regains focus and Space-pan keeps working.

The `+` button creates a new operator with a generated name
("Echo", "Foxtrot", ...) and a color picked from a remaining
palette of distinct hexes. Capped at 8 operators.

Style follows the existing design system: tan-on-gunmetal,
square corners, 1px walnut border, Bender typeface. Each chip is
sized to ~80×32 px to keep mobile reach reasonable; the row may
need to wrap to a second line on narrow viewports (acceptable for
desktop-first P0, formal mobile pass follows in the next slice).

### 5.8 Empty operator state

If `activeOperator === null`, strokes are tagged with `operatorId =
null` and use a fallback color (the previous `PENCIL_COLOR`
constant). This preserves the current behavior for users who don't
engage with the chip strip — nothing breaks.

---

## 6. Slice C — Solid / dashed phase toggle

### 6.1 Data model

`phase: 'plan' | 'record'` is attached to each tagged fabric
object (see §5.3). The global "current phase" state lives in
App.tsx and is persisted to localStorage:

```ts
const PHASE_STORAGE_KEY = 'tarkov-debrief:phase:v1';
// 'plan' | 'record'
```

Default on first load: `'record'`. The product is named "Debrief"
and the dominant use case is post-raid review; defaulting to
`'record'` matches that path of least surprise.

### 6.2 Toggle component

Rendered inside the header next to the chip strip (see §5.7):

```
[ ─── RECORD │ - - - PLAN ]
```

A two-segment control. Active segment has the tan-light fill; the
other has the dark-khaki fill (matches existing button hover).
Keyboard: `P` to flip. Click: flip. Persisted via localStorage.

Order chosen so `RECORD` (the more common path) is on the left,
matching reading order.

### 6.3 Effect on strokes

When `phase === 'plan'`, the **brush itself** carries a
`strokeDashArray` (set by an effect in `App.tsx`). `PLAN_DASH_ARRAY`
is interpreted as desired **screen-pixel** values; we divide by
the current zoom to produce canvas-unit values so the dash pattern
looks correct at the zoom the user is drawing at. Because the
dashArray lives on the brush:

- **Live preview** of an in-progress plan stroke is dashed
  (fabric's `BaseBrush._setBrushStyles` calls
  `ctx.setLineDash(this.strokeDashArray || [])` per render).
- **Finalized paths** inherit `strokeDashArray` from the brush via
  `PencilBrush.createPath`, so the released stroke has the same
  dash automatically — no separate `path.set` needed.

A small caveat: fabric's `BaseBrush.needsFullRender` doesn't
consider `strokeDashArray`, so without an override the brush
draws each new segment with a fresh `setLineDash`, producing
visible dash discontinuities across segments. We override
`needsFullRender` on the brush to also return true when a
non-empty `strokeDashArray` is set. See the comment in
`App.tsx`'s `initializeCanvas`.

**Existing strokes are intentionally not recompensated on later
zoom changes.** Once a stroke is created, its dashArray is
canvas-unit-fixed and scales naturally with the viewport — the
same semantics as any other fabric object. Zooming in makes both
the stroke and its gaps bigger; zooming out makes both smaller.
This matches user expectation: zoom shouldn't retroactively
change the look of marks that are already on the canvas. The
brush's own `strokeDashArray` *is* recompensated on zoom changes
(by `zoom.ts` after wheel zoom, and `App.tsx` after fit-to-
viewport on map switch) so the LIVE preview keeps its
screen-pixel-consistent gaps.

Implementation lives in `src/tools/dashCompensation.ts`
(`dashArrayForZoom` helper). Call sites: App.tsx's phase-watch
effect, `zoom.ts`'s wheel handler, App.tsx's map-switch effect.
This resolves the open question that previously lived here.

### 6.4 Effect on markers

P0: **none**. Markers carry the metadata but don't render
differently for plan vs record. The intended visual treatment
(e.g., reduced opacity for plan markers) is deferred.

### 6.5 Eraser semantics

Eraser doesn't filter by phase. Erasing a plan stroke removes
it the same way it removes a record stroke.

---

## 7. Slice D — Marker radial menu

### 7.1 Trigger semantics

- **Tap `M`**: radial appears centered at the last known cursor
  position over the canvas. (If no recent cursor position is
  known, appears at canvas center.) Click a wedge → close radial
  and enter marker tool with that marker selected. Press Esc →
  close without selecting.
- **Click the existing toolbar marker button**: same behavior —
  open the radial at canvas center. The toolbar button is the
  discoverable entry point.
- **Press-and-flick variant**: deferred to P1. Initial P0 ships
  with the menu-only behavior.

### 7.2 Geometry

8 segments at 45° each. The four existing markers occupy four
adjacent positions (e.g., top-right quadrant) so the future
vocabulary expansion can fill the remaining quadrants without
moving existing markers.

```
        [ - placeholder - ]
   [ - ]              [ PMC-thick ]
 [ - ]                    [ PMC-med ]
   [ - ]               [ PMC-light ]
        [    scav     ]
```

(Exact wedge assignment is a visual-design decision; the
constraint is "existing 4 markers cluster together, additions
fill in.")

Dimensions: ~200px outer radius, ~40px inner radius (center
target). Each wedge displays its marker SVG at ~40px scaled.

### 7.3 Cancel zones

- Center circle (inner ~40px): "cancel" target. Click to close
  without selection.
- Outside the outer radius: click closes without selection.
- Esc: close without selection.

### 7.4 Visual style

Matches the existing design system. The radial is a tan plate with
a 2px chocolate border (mirroring the toolbar's chrome). Each
wedge gets a 1px walnut divider line. Hover over a wedge darkens
it to dark-khaki (matches existing button hover).

### 7.5 Accessibility

- Arrow keys cycle through wedges; Enter selects the highlighted
  one.
- Each wedge has an `aria-label` matching the marker name.
- Esc closes.
- Focus returns to the canvas container on close.

### 7.5a Shortcut suspension while open

The radial sets `shortcutsSuspended = true` (see §4.4 item 10) on
mount and `false` on dismiss (wedge click, center click, outside
click, or Esc). While open, unmodified tap and hold bindings do
not fire, so a stray `V` or `B` during wedge selection cannot
shift tool state out from under the user. `Cmd/Ctrl+Z` still
fires for undo.

### 7.5b Focus model

The radial owns focus while it is open. Specifically:

- **Container is focusable.** The radial's outer `<div>` has
  `tabIndex={-1}` so it can receive programmatic focus without
  becoming a tab stop.
- **First wedge focused on mount.** On `useEffect(..., [])` the
  radial calls `firstWedgeRef.current?.focus()`. Wedges are
  rendered as `<button>` elements with `aria-label` matching the
  marker name (e.g., "Thick PMC marker").
- **Local keyDown handler.** The radial's container has an
  `onKeyDown` that handles **Arrow** (cycle focus among wedges in
  layout order), **Enter** / **Space** (activate the focused
  wedge), and **Esc** (dismiss without selection). Because
  `shortcutsSuspended` is `true`, the global keyboard hook will
  not race these — there is exactly one keyboard handler in play
  while the radial is open.
- **Focus restoration on close.** Whatever opened the radial
  records the prior `document.activeElement`; on dismiss, the
  radial calls `priorActiveElement.focus()` if it's still
  connected, otherwise focuses the canvas container. This matters
  because the trigger paths leave focus in different places:
  the toolbar-button path calls `blur()` per §4.4 item 11 (focus
  on body), the `M`-key path keeps focus where it was (usually
  the canvas container or body). Restoring to the prior element
  is correct in both cases.
- **Outside-click dismiss.** A transparent backdrop element
  intercepts pointer events outside the wedge ring; clicking it
  dismisses the radial. This also catches the "user tapped the
  toolbar marker button again to close" case.

### 7.6 Mobile touch fallback

For P0: tapping the toolbar marker button opens the radial just
like keyboard `M` does. Mobile-specific long-press triggers are
deferred — the radial is keyboard-or-button-only for P0.

### 7.7 Replacing the sidebar marker section

The sliding sidebar currently has two sections: "Markers" and an
unnamed color-picker section. P0 removes the "Markers" section
content; the heading stays as a stub. The sidebar still slides
in, but it's now nearly empty. The color section also goes empty
(per §5.5).

Sidebar deletion and `react-color` dependency removal are queued
as tech debt; not in this slice.

---

## 8. Modified files and new files

### 8.1 New files

```
src/
  hooks/
    useKeyboardShortcuts.ts            (Slice A)
    useKeyboardShortcuts.test.ts
  state/
    operators.ts                       (Slice B — model + persistence)
    operators.test.ts
    phase.ts                           (Slice C — state + persistence)
    phase.test.ts
  tools/
    metadata.ts                        (Slice B + C — fabric tagging)
    metadata.test.ts
    eraserCore.ts                      (Slice A — shared erasure session, §4.5)
    eraserCore.test.ts
  components/
    OperatorChips.tsx                  (Slice B)
    OperatorChips.css
    OperatorChips.test.tsx
    PhaseToggle.tsx                    (Slice C)
    PhaseToggle.css
    PhaseToggle.test.tsx
    MarkerRadial.tsx                   (Slice D)
    MarkerRadial.css
    MarkerRadial.test.tsx
```

### 8.2 Modified files

| File | Change |
|---|---|
| `src/App.tsx` | Wire `useKeyboardShortcuts`, mount the three new components inside the header (chip strip + phase toggle) and above the canvas (radial), manage operator/phase state. All toolbar buttons gain `blur` on click handler per §4.4 item 11 |
| `src/tools/undo.ts` | Remove the window keyboard listener (moves to `useKeyboardShortcuts`). Keep `onUndo` and the action stack |
| `src/tools/pencil.ts` | **Signature change**: gain ref-mirrored access to `activeOperatorId` and `phase` (the ref-mirror pattern from `usePan` — refs updated each render, read inside the fabric handler). Subscribe to `path:created`, call `tagObject`, apply dashArray if phase is `plan`. Brush color updates via effect when active operator changes |
| `src/tools/stamp.ts` | **Signature change**: `onChoice(evt: MouseEvent)` → `onChoice(url: string)` so MarkerRadial (which has no DOM event) can drive it. Internal `markerUrlRef` is set from the string. `mouse:down` placement handler adds `if (e.button !== 0) return` early gate (§4.5 button reservation). `setSidebar` parameter retained but unused; removal queued as tech debt |
| `src/tools/eraser.ts` | Inline erasure logic extracted into `eraserCore.ts` (§4.5). Hook now creates a session and binds `mouse:down → start`, `mouse:up → stop`. `mouse:down` handler adds `if (e.button !== 0) return` early gate. Cleanup calls `session.stop()` |
| `src/tools/pan.ts` | **Behavioral change**: gains a second activation path for `e.button === 0` drags while `tool.type === 'pan'` (§4.5). Existing middle-click path is preserved unchanged. Effect that installs the new path depends on `[canvas, tool.type]` |
| `src/App.css` | Update header to three-section flex layout; add chip strip and phase toggle styles; add radial overlay positioning |
| `src/Sidebar.css` | No change in P0 (sidebar stays as a stub; cleanup is later) |

### 8.3 Test harness updates

The existing `src/test/mockCanvas.ts` covers most of what's
needed but is short two methods:

- **`getObjects(): fabric.FabricObject[]`** — needed by Slice B's
  visibility-toggle test (§5.6 iterates `canvas.getObjects()` to
  flip `obj.visible`). Add as `vi.fn(() => [])` by default; tests
  can override per-case.
- **`upperCanvasEl: HTMLCanvasElement | { addEventListener:
  Function }`** — needed by Slice A's `contextmenu`-suppression
  listener (§4.5). A stub object with `addEventListener` /
  `removeEventListener` spies is sufficient.

These additions don't break existing tests because none of them
read these properties today.

**E2E spec update.** `e2e/smoke.spec.ts` currently drives the
sidebar's marker section to verify stamp placement. Phase 5
removes that section, so the spec must be updated in the same
phase to drive the new `MarkerRadial` flow instead (open via
toolbar marker button, click a wedge, verify placement). The
existing assertion about a marker landing at the cursor position
(the fabric v7 center-origin regression) must be preserved
verbatim — only the picker interaction changes.

### 8.4 Tech debt queued (not in P0)

- Delete the sidebar entirely.
- Remove the `react-color` dependency (~80kB) once the Twitter
  picker has no consumers.
- Remove the now-unused `setSidebar` plumbing in `useStamp`'s
  `onChoice` signature.

These are intentionally deferred so the P0 slice can land without
also touching the sidebar's CSS, animation, or layout.

### 8.5 No-change-needed files

- `src/index.css`, `src/MapSelector.tsx`, `src/MapSelector.css` —
  unaffected.
- `src/tools/zoom.ts`, `src/tools/select.ts` — untouched.

---

## 9. Sequencing for implementation

Each phase is independently shippable; no big-bang.

**Phase 1 — Foundation.** Build `metadata.ts`, `operators.ts`,
`phase.ts` (state + persistence, no UI yet). Add the metadata
attachment into pencil and stamp. Strokes get tagged with `null`
operator and `'record'` phase by default; nothing visible changes.

**Phase 2 — Keyboard hook.** Land `useKeyboardShortcuts` and
migrate `useUndo`'s listener (atomically — see §4.6). Wire taps
for `V`, `B`, `E`, `M`, `P`. The marker `M` key opens the existing
sidebar in this phase (radial doesn't ship yet); `P` flips the
in-memory phase state but no UI shows it yet either.

**Phase 3 — Quasi-modes.** Add Space-hold pan and right-mouse-hold
eraser through the hook. First visible "feels like Excalidraw"
moment.

**Phase 4 — Operator chips + phase toggle.** Land the two UI
components inside the header. Strokes start getting per-operator
color and `plan`-vs-`record` dashArray. First visible "this is a
tactical tool" moment.

**Phase 5 — Marker radial.** Replace the sidebar marker section
with the radial component triggered by the toolbar button and
the `M` key.

A single PR per phase is recommended; Phases 1+2 and Phases 3+4
can merge as two larger PRs if the team prefers.

---

## 10. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Quasi-mode "stuck" if keyup is missed (alt-tab, devtools opening) | High | `window.blur` always exits any active quasi-mode |
| R2 | Browser `Space` scrolls the page when canvas is unfocused | Med | `preventDefault` only when canvas container has focus or body is focused; never when an input is focused |
| R3 | Right-click eraser collides with browser context menu | Med | `contextmenu` listener with `preventDefault` on the canvas element |
| R4 | dashArray on freehand strokes renders wrong under viewport transform | Med | Validate in implementation; if broken, store dashArray in screen-pixel terms and update on zoom (mirror `zoom.ts`'s brush-width compensation) |
| R5 | localStorage corruption (manual edit, schema drift) | Low | Versioned keys (`:v1`); on parse failure, fall back to defaults silently |
| R6 | Operator color collides with the pencil red default | Low | Defaults exclude reds; user-recolor is a P1 concern |
| R7 | Visibility toggle leaves strokes hidden after operator deletion | Low | Operator delete is out of P0; visibility state lives on Operator, not on fabric objects, so it can't "leak" |
| R8 | Radial menu z-index conflicts with sliding sidebar | Low | Radial z-index 20, sidebar z-index 10 (already set), header z-index 5 |
| R9 | `M` key opens radial while a marker is hovered for placement | Low | Tap action is suppressed when `quasiModeActive` is set; placement is unaffected |
| R10 | Mobile testing skipped in P0 | Med | Document explicitly; mobile-specific design lives in the next slice |
| R11 | Double-fire of undo if `useUndo`'s old listener is not removed atomically with the new central binding | Med | Phase-2 acceptance check in §11 verifies exactly one undo per `Cmd/Ctrl+Z` |
| R12 | Re-render of App.tsx tears down the window keyboard listener if bindings array is treated as an effect dep | Med | Ref-mirror pattern in §4.2; effect deps include `canvas` only. Regression test in §4.7 |
| R13 | Header overflow on narrow desktop viewports with all four operators + phase toggle + toolbar | Low | Chip row may wrap to two lines; header `min-height` grows; formal mobile pass follows |
| R14 | Space-down flips `tool.type` but no pan actually happens because `usePan` only listens to middle-click | High (would silently break the feature) | `usePan` refactor in §4.5 adds a `tool.type === 'pan'` activation path; Phase 3 e2e check asserts left-button drag pans while space is held |
| R15 | Right-click in marker mode places a stamp before the shortcut hook can flip to eraser | High (silently produces unwanted markers) | Button reservation contract in §4.5: every tool's `mouse:down` gates on `e.button === 0`; explicit acceptance check in §11 |
| R16 | Toolbar/chip button retains focus after click; Space then re-clicks the button instead of panning | Med | All clickable controls call `(e.currentTarget as HTMLElement).blur()` at end of handler (§4.4 item 11); manual acceptance in §11 |
| R17 | Pressing tool letters or Space while the radial is open mutates state under it | Med | `shortcutsSuspended` ref set by radial (§7.5a); shortcut hook short-circuits unmodified bindings while suspended |
| R18 | Hidden operator stays active; new strokes keep appearing in their color | Med | "Hidden operators cannot be active" rule in §5.6 — hiding the active operator sets `activeOperatorId = null` in the same transition |
| R19 | Right-mouse quasi-eraser enters eraser mode without actually erasing because `useEraser`'s `activeRef` was never armed | High (silently no-ops the feature) | Erasure logic extracted into `eraserCore.ts` session; shortcut hook calls `session.start()` synchronously alongside the tool flip, independent of React state (§4.5) |
| R20 | Radial keyboard navigation doesn't work after the trigger button blurs | Med | Radial owns focus while open — `tabIndex={-1}` container, first wedge focused on mount, local Arrow/Enter/Esc handler, prior `activeElement` restored on close (§7.5b) |

---

## 11. Validation checklist

Before merging any phase:

- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm test` clean (vitest unit tests)
- [ ] `pnpm test:e2e` clean (existing smoke spec still passes)
- [ ] Manual: page reload preserves last operator + phase
- [ ] Manual: switching maps preserves operator state (operators
      are global, not per-map)
- [ ] Manual: alt-tab during a Space-hold does not leave the
      app stuck in pan mode
- [ ] Manual: typing in any text input doesn't switch tools
- [ ] Manual: existing undo (Cmd/Ctrl+Z) still works exactly as
      before
- [ ] **Manual: Cmd/Ctrl+Z fires exactly one undo** (no double-fire
      from a leftover listener in `useUndo` — see R11)
- [ ] **Manual: Ctrl+Shift+Z does not fire undo** (modifier-strict
      matching — see §4.2; this also pre-protects against a future
      redo binding's collision)
- [ ] Manual: Cmd/Ctrl+Z works *while space is held* (modified-tap
      carve-out — see §4.4 item 3)
- [ ] Manual: existing markers still render at correct position
      under fabric v7's center origin (regression covered in
      `e2e/smoke.spec.ts`)
- [ ] **Manual: Space + left-drag actually pans the canvas** (R14
      — `usePan`'s second activation path is wired and reactive
      to `tool.type === 'pan'`)
- [ ] **Manual: right-click in marker mode does NOT drop a
      stamp** (R15 — `useStamp.placeMarker` early-returns on
      non-left button)
- [ ] **Manual: after clicking a toolbar/chip/toggle button,
      Space still pans on the next press** (R16 — controls blur
      on click)
- [ ] **Manual: opening the radial freezes tool shortcuts**
      (typing `V`/`B` while the radial is open does not change
      tool; Esc closes the radial; Cmd/Ctrl+Z still undoes)
      (R17)
- [ ] **Manual: shift-clicking the active operator clears
      activation** (chip turns gray, `activeOperatorId` becomes
      null, next stroke uses fallback color and stays visible)
      (R18)
- [ ] **Manual: right-mouse-hold actually erases** (drag with
      right button held over strokes — they disappear; release
      restores previous tool) (R19)
- [ ] **Manual: radial keyboard nav works after toolbar trigger**
      (click marker button → radial opens → Arrow keys cycle
      wedges → Enter activates → focus returns sensibly; same
      flow via `M` keystroke) (R20)

---

## 12. Open questions still to resolve before /sc:implement

1. **Marker visibility coupling.** Should toggling an operator
   off hide *all* their marks including stamped markers? Proposed:
   yes — implementation iterates `canvas.getObjects()` and toggles
   `visible` on every object whose `readOperator` matches.
   Confirm.
2. **`?` shortcut overlay.** In or out of P0? Proposed: out (P1
   follow-up once the shortcut surface stabilizes).
3. **Touch-device fallbacks for radial.** Long-press right-mouse
   doesn't exist on touch. Proposed: the toolbar button works on
   touch; radial opens the same way. Confirm.

Three small confirmations; everything else from the original
draft is resolved in §0.

---

## 13. Boundary

Per `/sc:design` contract, this document defines the design but
ships **no code**. The `/sc:implement` pass that follows should
execute the phases in §9, validate against §11, and resolve §12
before each phase.
