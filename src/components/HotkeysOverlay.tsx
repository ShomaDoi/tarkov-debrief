// Hotkeys reference overlay.
//
// Triggered by `?` (Shift+/). Modal-style sheet listing every
// keyboard shortcut grouped by category. Dismisses on Esc or
// outside-click. Excalidraw's keyboard cheatsheet is the visual
// inspiration; layout is denser, two-column where it fits.
//
// Cross-cutting concerns this component owns (mirrors MarkerRadial
// item 1 + 2 — the established pattern for modal-style overlays):
//
//   1. SHORTCUT SUSPENSION. Flips `suspendedRef.current = true` on
//      mount and back to false on dismiss. Without this, typing V/
//      B/A/etc. while the overlay is open would silently switch
//      tools underneath the user.
//
//   2. FOCUS OWNERSHIP. Captures `document.activeElement` on mount
//      and focuses the overlay's close button. On dismiss, restores
//      focus to the prior element (or falls back to body). Keeps
//      the keyboard flow continuous.
//
// Hotkeys data lives in this file as a static const. App.tsx
// passes nothing through — the overlay's only inputs are
// open/close + the suspension ref. If a new binding ships in
// useKeyboardShortcuts and isn't reflected here, the overlay will
// silently omit it; periodic audits are the only safeguard.

import { useEffect, useRef } from "react";
import type { SuspensionRef } from "@/hooks/useKeyboardShortcuts";
import "./HotkeysOverlay.css";

interface HotkeyRow {
  /** Keys to render — pre-formatted display string (e.g. "Cmd/Ctrl+Z"). */
  keys: string;
  /** Short human description of the action. */
  label: string;
}

interface HotkeySection {
  title: string;
  rows: HotkeyRow[];
}

// The hotkeys catalog. Order within a section is the visual order;
// section order is the layout order top-to-bottom. Single source of
// truth — if a binding moves in App.tsx, update its row here.
const SECTIONS: HotkeySection[] = [
  {
    title: "Tools",
    rows: [
      { keys: "V", label: "Select" },
      { keys: "B", label: "Pencil" },
      { keys: "E", label: "Eraser" },
      { keys: "M", label: "Open markers" },
    ],
  },
  {
    title: "Tactical marks",
    rows: [
      { keys: "A", label: "Arrow (freehand)" },
      { keys: "S", label: "Sightline (chained)" },
      { keys: "O", label: "Overwatch cone (chained)" },
      { keys: "X", label: "Engagement X" },
      { keys: "I", label: "Sound ping" },
      { keys: "D", label: "Position dot" },
      { keys: "T", label: "Text label" },
    ],
  },
  {
    title: "Phase",
    rows: [{ keys: "P", label: "Toggle record / plan" }],
  },
  {
    title: "Other",
    rows: [
      { keys: "Cmd / Ctrl + Z", label: "Undo" },
      { keys: "Space (drag)", label: "Pan" },
      { keys: "Middle mouse (drag)", label: "Pan" },
      { keys: "Right mouse (drag)", label: "Eraser" },
      { keys: "?", label: "This overlay" },
      { keys: "Esc", label: "Close (radial, overlay, gestures)" },
    ],
  },
];

export interface HotkeysOverlayProps {
  /** Whether the overlay is open. Controlled by the parent. */
  open: boolean;
  /** Called when the overlay should close. */
  onClose: () => void;
  /** Shared with the global shortcut hook — see header comment 1. */
  suspendedRef: SuspensionRef;
}

export function HotkeysOverlay({
  open,
  onClose,
  suspendedRef,
}: HotkeysOverlayProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const priorActiveRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    suspendedRef.current = true;
    priorActiveRef.current = document.activeElement;
    // Focus the close button so Enter/Space dismiss naturally and
    // Esc lands in the overlay's onKeyDown.
    closeButtonRef.current?.focus();

    return () => {
      suspendedRef.current = false;
      const prior = priorActiveRef.current;
      if (prior instanceof HTMLElement && document.contains(prior)) {
        prior.focus();
      }
    };
  }, [open, suspendedRef]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <>
      {/* Transparent backdrop catches outside-clicks. Sized to
          cover the whole viewport. */}
      <div
        className="HotkeysOverlay-backdrop"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="HotkeysOverlay"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        // Stop click propagation so clicking inside the panel
        // doesn't bubble to the backdrop's onClick and dismiss.
        onClick={(e) => e.stopPropagation()}
      >
        <header className="HotkeysOverlay-header">
          <h2 className="HotkeysOverlay-title">Keyboard shortcuts</h2>
          <button
            ref={closeButtonRef}
            className="HotkeysOverlay-close"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="HotkeysOverlay-grid">
          {SECTIONS.map((section) => (
            <section className="HotkeysOverlay-section" key={section.title}>
              <h3 className="HotkeysOverlay-sectionTitle">{section.title}</h3>
              <ul className="HotkeysOverlay-list">
                {section.rows.map((row) => (
                  <li className="HotkeysOverlay-row" key={row.keys + row.label}>
                    <kbd className="HotkeysOverlay-keys">{row.keys}</kbd>
                    <span className="HotkeysOverlay-label">{row.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
