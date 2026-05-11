// Centralized keyboard shortcut hook.
//
// This is the single place all keyboard input flows through.
// Subsumes the window keydown listener that used to live in
// src/tools/undo.ts (atomic migration — see §4.6 of the design doc;
// if you see a separate keydown listener for Cmd/Ctrl+Z elsewhere,
// undo will double-fire — that's R11).
//
// Two binding kinds:
//   - "press" (tap):   fires on keydown; effect persists (locked-mode
//                      switch or one-shot action).
//   - "hold" (quasi):  fires onEnter on keydown, onExit on keyup —
//                      release reverts to the previous tool.
//
// Plus a mouse-button hold binding for right-mouse-as-eraser.
//
// CRITICAL implementation notes — read before changing:
//
//   1. BINDINGS LIVE IN A REF. The hook stores bindings in a ref
//      that's overwritten on every render. The window listener is
//      installed once per canvas and reads bindings *through the
//      ref*. Without this, every App.tsx render would tear down
//      and re-add the window listener (R12). This mirrors the
//      ref-mirror pattern documented in src/tools/pan.ts. ESLint's
//      react-hooks/refs rule is off for this reason (see
//      eslint.config.js).
//
//   2. MODIFIER-STRICT MATCHING. A binding matches only if every
//      modifier in `modifiers` is present AND every modifier not
//      in `modifiers` is absent. Without this, `Ctrl+Shift+Z`
//      would fire a binding defined as `Ctrl+Z` and (once redo
//      lands) double-fire alongside undo. See design doc §4.2.
//
//   3. SUSPENDED MODE. When the radial (or any future modal) is
//      open, it sets `suspended.current = true`. While suspended,
//      unmodified taps and all holds do NOT fire; modified
//      shortcuts (Cmd/Ctrl+Z) DO. The radial owns its own keys
//      while open — see src/components/MarkerRadial.tsx §Focus.
//
//   4. AUTO-RELEASE ON BLUR. window.blur() exits any active hold.
//      Without this, alt-tabbing while holding Space leaves the
//      app stuck in pan mode forever (R1).
//
//   5. QUASI-MODE MUTUAL EXCLUSION. Only one hold can be active at
//      a time. While one is held, OTHER unmodified taps are
//      suppressed (no accidental tool switching mid-pan). But
//      MODIFIED taps (Cmd/Ctrl+Z) DO fire — undo while panning is
//      a legitimate workflow.
//
//   6. TAP REPEAT IS ALLOWED. keydown auto-repeats; we don't
//      suppress that for taps. Holding Cmd+Z to spam undo is a
//      desirable behavior we preserve from the original useUndo.
//      We DO suppress repeat for holds (otherwise onEnter would
//      fire on every repeat).
//
// Design reference: claudedocs/design_p0_slice.md §4.

import { useEffect, useRef } from "react";
import type * as fabric from "fabric";
import type { TPointerEventInfo, TPointerEvent } from "fabric";

export type Modifier = "cmdOrCtrl" | "shift" | "alt";

export type PressBinding = {
  kind: "press";
  key: string; // lowercased single-key value, e.g. "v", "b", "z", " "
  modifiers?: Modifier[]; // default [] (unmodified-only match)
  onPress: () => void;
};

export type HoldBinding = {
  kind: "hold";
  key: string; // typically " " (space)
  onEnter: () => void;
  onExit: () => void;
};

export type MouseHoldBinding = {
  kind: "mouseHold";
  button: 0 | 1 | 2; // 0=left, 1=middle, 2=right
  onEnter: () => void;
  onExit: () => void;
};

export type Binding = PressBinding | HoldBinding | MouseHoldBinding;

// Ref the hook exposes so the radial (and future modals) can freeze
// keyboard shortcuts while they own focus. The ref shape is shared
// — callers mutate `.current` directly.
export type SuspensionRef = { current: boolean };

export interface UseKeyboardShortcutsOptions {
  bindings: Binding[];
  // The radial flips this on mount/dismiss. See §4.4 item 10.
  suspendedRef: SuspensionRef;
}

const isInput = (el: Element | null): boolean =>
  !!el &&
  (el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    (el as HTMLElement).isContentEditable);

// Modifier-strict matcher. Every modifier in `wanted` must be present;
// every modifier NOT in `wanted` must be absent. See note 2 above.
function modifiersMatch(
  e: KeyboardEvent,
  wanted: Modifier[] | undefined,
): boolean {
  const set = new Set<Modifier>(wanted ?? []);
  const hasCmdOrCtrl = e.metaKey || e.ctrlKey;
  if (set.has("cmdOrCtrl") !== hasCmdOrCtrl) return false;
  if (set.has("shift") !== e.shiftKey) return false;
  if (set.has("alt") !== e.altKey) return false;
  return true;
}

export function useKeyboardShortcuts(
  canvas: fabric.Canvas | null,
  options: UseKeyboardShortcutsOptions,
): void {
  // Ref-mirror the bindings array. The window listener reads through
  // bindingsRef.current; callers can pass a fresh array on every
  // render without re-triggering the effect. See note 1.
  const bindingsRef = useRef<Binding[]>(options.bindings);
  bindingsRef.current = options.bindings;

  // Tracks which hold key (if any) is currently active. Used to
  // suppress duplicate onEnter calls from keydown auto-repeat AND
  // to suppress other unmodified taps during a quasi-mode (note 5).
  const activeHoldKey = useRef<string | null>(null);
  // Same idea for mouse-button holds.
  const activeMouseButton = useRef<number | null>(null);
  // Cached reference to the matching binding for the currently-held
  // key — so we can call its onExit without re-searching bindings on
  // keyup (which would risk picking up a stale binding after the
  // user has reconfigured them).
  const activeHoldBinding = useRef<HoldBinding | null>(null);
  const activeMouseBinding = useRef<MouseHoldBinding | null>(null);

  const suspendedRef = options.suspendedRef;

  useEffect(() => {
    if (!canvas) return;

    const isSuspended = () => suspendedRef.current === true;

    const onKeyDown = (e: KeyboardEvent) => {
      // Skip when the user is typing in an input. Reused from the
      // original useUndo logic.
      if (isInput(document.activeElement)) return;

      const lowerKey = e.key.toLowerCase();
      const bindings = bindingsRef.current;

      // Hold bindings first — these can enter even when nothing else
      // is happening. Also check that no hold is already active (note
      // 5: one quasi-mode at a time; auto-repeat doesn't re-fire).
      // The mutex covers BOTH keyboard holds and mouse holds: if the
      // user is right-mouse-erasing, pressing Space must not also
      // enter pan, or the shared previousTool tracking in the caller
      // gets clobbered (see App.tsx — `previousToolRef`).
      if (
        activeHoldKey.current === null &&
        activeMouseButton.current === null &&
        !isSuspended()
      ) {
        for (const b of bindings) {
          if (b.kind !== "hold") continue;
          if (b.key.toLowerCase() !== lowerKey) continue;
          // Holds are unmodified-only. Don't trigger a Space-pan on
          // Cmd+Space, for example.
          if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) continue;
          activeHoldKey.current = lowerKey;
          activeHoldBinding.current = b;
          e.preventDefault(); // Space scrolls the page otherwise.
          b.onEnter();
          return;
        }
      }

      // Press bindings. Modified presses (Cmd+Z) fire even when
      // suspended OR when a hold is active — see notes 3 and 5.
      for (const b of bindings) {
        if (b.kind !== "press") continue;
        if (b.key.toLowerCase() !== lowerKey) continue;
        if (!modifiersMatch(e, b.modifiers)) continue;

        const isUnmodified = !(b.modifiers && b.modifiers.length > 0);
        if (isUnmodified && (isSuspended() || activeHoldKey.current !== null)) {
          // Suppress unmodified taps while a modal is open or while
          // a quasi-mode is held. Modified taps (Cmd/Ctrl+Z) skip
          // both gates so undo still works in those contexts.
          continue;
        }

        e.preventDefault();
        b.onPress();
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const lowerKey = e.key.toLowerCase();
      // Release-on-keyup ONLY if it matches the active hold. Other
      // keyups (a stray Shift release) shouldn't reset state.
      if (activeHoldKey.current === lowerKey) {
        const b = activeHoldBinding.current;
        activeHoldKey.current = null;
        activeHoldBinding.current = null;
        if (b) b.onExit();
      }
    };

    // Auto-release on focus loss. Without this, alt-tabbing during
    // a hold (or opening devtools) leaves the app stuck in pan mode.
    // See note 4 and R1 in the risk register.
    const onBlur = () => {
      if (activeHoldKey.current !== null) {
        const b = activeHoldBinding.current;
        activeHoldKey.current = null;
        activeHoldBinding.current = null;
        if (b) b.onExit();
      }
      if (activeMouseButton.current !== null) {
        const b = activeMouseBinding.current;
        activeMouseButton.current = null;
        activeMouseBinding.current = null;
        if (b) b.onExit();
      }
    };

    // Mouse-button holds are bound to fabric events because that's
    // where canvas-scoped mouse events live in this app. The order
    // matters: we register here BEFORE any tool hook gets a chance
    // to register its own mouse:down handler — fabric dispatches in
    // registration order, but stamping/erasing tools gate on
    // e.button === 0 (button-reservation contract, §4.5), so even
    // if our listener doesn't run first, the others won't conflict
    // on right-button events.
    // Fabric's TPointerEvent is MouseEvent|TouchEvent — narrow to
    // MouseEvent here because mouse-button holds (right-mouse-as-
    // eraser) only make sense for pointer devices. Touch events
    // route through a separate codepath that we don't intercept.
    const onCanvasMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
      const e = opt.e as MouseEvent;
      if (typeof e.button !== "number") return; // touch event — skip
      // Mutex across BOTH keyboard and mouse holds — see the matching
      // gate in onKeyDown for the rationale.
      if (activeMouseButton.current !== null) return;
      if (activeHoldKey.current !== null) return;
      if (isSuspended()) return;
      for (const b of bindingsRef.current) {
        if (b.kind !== "mouseHold") continue;
        if (b.button !== e.button) continue;
        activeMouseButton.current = e.button;
        activeMouseBinding.current = b;
        b.onEnter();
        return;
      }
    };
    const onCanvasMouseUp = (opt: TPointerEventInfo<TPointerEvent>) => {
      const e = opt.e as MouseEvent;
      if (typeof e.button !== "number") return;
      if (activeMouseButton.current !== e.button) return;
      const b = activeMouseBinding.current;
      activeMouseButton.current = null;
      activeMouseBinding.current = null;
      if (b) b.onExit();
    };

    // Suppress the browser context menu for right-clicks on the
    // canvas, otherwise our right-mouse eraser quasi-mode gets
    // hijacked by the OS menu. See design doc §4.5 final paragraph.
    // We attach to upperCanvasEl because that's the DOM node fabric
    // routes events through; the "canvas" element under it is
    // covered.
    const contextMenuTarget = (canvas as unknown as {
      upperCanvasEl?: HTMLElement;
    }).upperCanvasEl;
    const onContextMenu = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    canvas.on("mouse:down", onCanvasMouseDown);
    canvas.on("mouse:up", onCanvasMouseUp);
    contextMenuTarget?.addEventListener("contextmenu", onContextMenu);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.off("mouse:down", onCanvasMouseDown);
      canvas.off("mouse:up", onCanvasMouseUp);
      contextMenuTarget?.removeEventListener("contextmenu", onContextMenu);
      // Defensive: if we tear down mid-hold, make sure onExit runs
      // so the parent doesn't end up in a leaked quasi-state.
      if (activeHoldBinding.current) {
        activeHoldBinding.current.onExit();
        activeHoldBinding.current = null;
        activeHoldKey.current = null;
      }
      if (activeMouseBinding.current) {
        activeMouseBinding.current.onExit();
        activeMouseBinding.current = null;
        activeMouseButton.current = null;
      }
    };
    // `suspendedRef` is a ref object — its identity is stable.
    // `bindingsRef` is updated above and intentionally NOT in deps.
    // Effect re-runs only when `canvas` changes (i.e. once per
    // canvas lifecycle).
  }, [canvas, suspendedRef]);
}
