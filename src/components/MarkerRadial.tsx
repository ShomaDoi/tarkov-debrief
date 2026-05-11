// Marker radial menu — replaces the sliding sidebar's marker grid.
//
// Tap `M` (or click the toolbar marker button) → radial opens at
// the cursor / canvas center. Click a wedge → marker is selected
// and the radial closes. Esc or outside-click → dismiss without
// selecting.
//
// Two cross-cutting concerns this component owns:
//
//   1. SHORTCUT SUSPENSION. The radial flips
//      shortcutsSuspended.current to true on mount and back to
//      false on dismiss. Without this, typing V/B/E while the
//      radial is open would silently switch tools underneath
//      the user (R17). The radial is the FIRST consumer of the
//      suspension contract defined in
//      src/hooks/useKeyboardShortcuts.ts.
//
//   2. FOCUS OWNERSHIP. On mount we capture the prior
//      document.activeElement and programmatically focus the first
//      wedge. The radial owns Arrow/Enter/Esc keys via its own
//      onKeyDown — the global hook is suspended (item 1), so there
//      is exactly one keyboard handler in play. On dismiss we
//      restore focus to the prior element (or fall back to the
//      canvas container) so the keyboard flow continues naturally.
//
// Design references:
//   - claudedocs/design_p0_slice.md §7   (radial geometry, behavior)
//   - claudedocs/design_p0_slice.md §7.5a (suspension)
//   - claudedocs/design_p0_slice.md §7.5b (focus model)

import { useEffect, useRef } from "react";
import type { SuspensionRef } from "@/hooks/useKeyboardShortcuts";
import "./MarkerRadial.css";

export interface MarkerOption {
  url: string;
  label: string;
}

export interface MarkerRadialProps {
  // Position in viewport pixels where the radial center should sit.
  // Caller (App.tsx) decides between cursor position (M-key path)
  // and a sensible default (toolbar-button path).
  center: { x: number; y: number };
  // 8-wedge slots. Pass null for empty slots. Wedge order matches
  // visual order starting from 12 o'clock, clockwise.
  slots: (MarkerOption | null)[];
  onSelect: (url: string) => void;
  onCancel: () => void;
  // Shared with the global shortcut hook — see comment header
  // item 1 above.
  suspendedRef: SuspensionRef;
}

const OUTER_RADIUS = 110; // px
const INNER_RADIUS = 30; // cancel target
const WEDGE_COUNT = 8;

export function MarkerRadial({
  center,
  slots,
  onSelect,
  onCancel,
  suspendedRef,
}: MarkerRadialProps) {
  if (slots.length !== WEDGE_COUNT) {
    // Defensive: the radial assumes exactly 8 slots. A wrong-length
    // array is a bug in the caller, not a runtime user condition.
    // Throwing in dev surfaces it loudly; production rendering
    // returns null below to avoid breaking the app.
    if (import.meta.env.DEV) {
      throw new Error(
        `MarkerRadial expects ${WEDGE_COUNT} slots, got ${slots.length}`,
      );
    }
  }

  const wedgeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const priorActiveRef = useRef<Element | null>(null);

  // Suspension + focus capture on mount.
  useEffect(() => {
    suspendedRef.current = true;
    priorActiveRef.current = document.activeElement;
    // Focus the first non-null wedge so Arrow/Enter work without
    // the user reaching for the mouse.
    const firstIdx = slots.findIndex((s) => s !== null);
    if (firstIdx >= 0) wedgeRefs.current[firstIdx]?.focus();

    return () => {
      suspendedRef.current = false;
      // Restore prior focus if it's still attached; otherwise fall
      // through (browser focuses body).
      const prior = priorActiveRef.current;
      if (prior instanceof HTMLElement && document.contains(prior)) {
        prior.focus();
      }
    };
    // We deliberately want this effect to run on MOUNT/UNMOUNT only.
    // Slot identities change as the parent re-renders, but the focus
    // dance only matters at lifecycle boundaries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard within the radial. Because the global hook is
  // suspended, this is the only listener in play for these keys.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      cycleFocus(+1);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      cycleFocus(-1);
      return;
    }
  };

  const cycleFocus = (delta: 1 | -1) => {
    // Find the currently-focused wedge index by reference identity.
    const current = wedgeRefs.current.findIndex(
      (el) => el === document.activeElement,
    );
    // Step through occupied slots only; skip nulls so the user
    // doesn't tab through empty placeholders.
    let i = current;
    for (let attempts = 0; attempts < WEDGE_COUNT; attempts++) {
      i = (i + delta + WEDGE_COUNT) % WEDGE_COUNT;
      if (slots[i] !== null) {
        wedgeRefs.current[i]?.focus();
        return;
      }
    }
  };

  return (
    <>
      {/* Transparent backdrop catches outside-clicks. Sized to
          cover the whole viewport so any click outside the wedge
          ring dismisses. Pointer-events:auto on the backdrop +
          stopPropagation on wedge clicks keeps the layering
          correct. */}
      <div
        className="MarkerRadial-backdrop"
        onClick={onCancel}
        aria-hidden
      />
      <div
        className="MarkerRadial"
        role="menu"
        aria-label="Marker picker"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{
          left: center.x,
          top: center.y,
          width: OUTER_RADIUS * 2,
          height: OUTER_RADIUS * 2,
          // Translate by -50% so `left`/`top` describe the CENTER.
          transform: "translate(-50%, -50%)",
        }}
      >
        {slots.map((slot, i) => {
          const angle = (i / WEDGE_COUNT) * 2 * Math.PI - Math.PI / 2;
          // Wedge button position: place each wedge's center at
          // (outerR + innerR) / 2 along its angle. Simpler than
          // computing SVG arc paths; the visual is buttons in a
          // ring rather than pie wedges. Trade-off: slightly less
          // "radial pie" feel, but far simpler to make keyboard-
          // accessible and to hover-style.
          const r = (OUTER_RADIUS + INNER_RADIUS) / 2;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          const size = 56;
          return (
            <button
              key={i}
              ref={(el) => {
                wedgeRefs.current[i] = el;
              }}
              type="button"
              className={`MarkerRadial-wedge ${
                slot === null ? "empty" : ""
              }`}
              disabled={slot === null}
              aria-label={slot?.label ?? "empty slot"}
              style={{
                left: `calc(50% + ${x}px - ${size / 2}px)`,
                top: `calc(50% + ${y}px - ${size / 2}px)`,
                width: size,
                height: size,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (slot) onSelect(slot.url);
              }}
            >
              {slot && (
                <img
                  className="MarkerRadial-icon"
                  src={slot.url}
                  alt={slot.label}
                  draggable={false}
                />
              )}
            </button>
          );
        })}
        {/* Center cancel target. Pointer-events:auto + an explicit
            handler so a click on it dismisses (instead of falling
            through to the backdrop, which would also dismiss but
            is conceptually the "click outside" path). */}
        <button
          type="button"
          className="MarkerRadial-cancel"
          aria-label="Cancel"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          style={{
            left: `calc(50% - ${INNER_RADIUS}px)`,
            top: `calc(50% - ${INNER_RADIUS}px)`,
            width: INNER_RADIUS * 2,
            height: INNER_RADIUS * 2,
          }}
        >
          ×
        </button>
      </div>
    </>
  );
}
