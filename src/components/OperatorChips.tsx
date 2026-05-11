// Operator chips — horizontal strip rendered inside the header.
//
// Each chip represents a squadmate. The active chip's color drives
// the pencil brush color and is attached to every new stroke as
// metadata. Hidden chips suppress their operator's marks on the
// canvas (the visibility application happens in App.tsx — see the
// `useOperatorVisibility` effect there).
//
// Interaction matrix (per design doc §5.7):
//
//   Click on visible chip:        activate this operator
//   Click on hidden chip:         unhide AND activate
//   Shift+click on visible chip:  hide it (auto-deactivates if it
//                                 was active — sets activeId=null)
//   Shift+click on hidden chip:   unhide (does not change active)
//
// "Hidden operators cannot be active" — see §5.6. The auto-
// deactivation on shift-click is the load-bearing rule that makes
// the "show only Alpha's path" workflow actually work; without it,
// hiding Alpha while still drawing as Alpha would leave new marks
// invisible-yet-being-created.
//
// Every chip button calls `blur()` on its target after click so
// the canvas regains focus and Space-pan keeps working on the next
// keypress (§4.4 item 11).

import type { MouseEvent } from "react";
import type { Operator, OperatorId } from "@/state/operators";
import "./OperatorChips.css";

export interface OperatorChipsProps {
  operators: Operator[];
  activeId: OperatorId | null;
  // Caller is App.tsx; it handles the matrix in §5.7 by updating
  // both the operators list (visibility flag) and the active id.
  onClick: (id: OperatorId) => void;
  onShiftClick: (id: OperatorId) => void;
}

export function OperatorChips({
  operators,
  activeId,
  onClick,
  onShiftClick,
}: OperatorChipsProps) {
  const handle = (e: MouseEvent<HTMLButtonElement>, id: OperatorId) => {
    if (e.shiftKey) {
      onShiftClick(id);
    } else {
      onClick(id);
    }
    // Blur restores canvas focus; without this, the next Space
    // press would re-click this very button instead of panning
    // (§4.4 item 11, R16).
    (e.currentTarget as HTMLElement).blur();
  };

  return (
    <div className="OperatorChips" role="toolbar" aria-label="Operators">
      {operators.map((op) => {
        const active = op.id === activeId;
        const className = [
          "OperatorChip",
          active && "active",
          !op.visible && "hidden",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={op.id}
            type="button"
            className={className}
            onClick={(e) => handle(e, op.id)}
            aria-pressed={active}
            aria-label={`${op.name}${op.visible ? "" : " (hidden)"}`}
            title={
              op.visible
                ? "Click to activate, Shift+click to hide"
                : "Click to unhide and activate, Shift+click to unhide only"
            }
          >
            <span
              className="OperatorChip-dot"
              style={{ background: op.color }}
              aria-hidden
            />
            <span className="OperatorChip-name">{op.name}</span>
          </button>
        );
      })}
    </div>
  );
}
