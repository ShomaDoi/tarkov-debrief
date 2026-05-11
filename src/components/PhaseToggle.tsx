// Phase toggle — two-segment control reading [RECORD | PLAN].
//
// "Record" is the dominant default (post-raid review is the
// product's primary use case). "Plan" applies a dashArray to new
// strokes so brief/debrief layers can be visually distinguished
// on the same canvas. See design doc §6.
//
// Keyboard: `P` flips the phase (wired in App.tsx via the
// useKeyboardShortcuts press binding).
//
// Like the operator chips, the segment buttons blur() after click
// to keep canvas focus available for Space-pan (§4.4 item 11).

import type { MouseEvent } from "react";
import type { Phase } from "@/state/phase";
import "./PhaseToggle.css";

export interface PhaseToggleProps {
  phase: Phase;
  onChange: (next: Phase) => void;
}

export function PhaseToggle({ phase, onChange }: PhaseToggleProps) {
  const onClick = (e: MouseEvent<HTMLButtonElement>, target: Phase) => {
    if (phase !== target) onChange(target);
    (e.currentTarget as HTMLElement).blur();
  };

  return (
    <div className="PhaseToggle" role="group" aria-label="Stroke phase">
      <button
        type="button"
        className={`PhaseToggle-seg ${phase === "record" ? "active" : ""}`}
        onClick={(e) => onClick(e, "record")}
        aria-pressed={phase === "record"}
        title="Marks represent what actually happened"
      >
        <span className="PhaseToggle-glyph">───</span>
        record
      </button>
      <button
        type="button"
        className={`PhaseToggle-seg ${phase === "plan" ? "active" : ""}`}
        onClick={(e) => onClick(e, "plan")}
        aria-pressed={phase === "plan"}
        title="Marks represent the brief / what the squad plans"
      >
        <span className="PhaseToggle-glyph">- - -</span>
        plan
      </button>
    </div>
  );
}
