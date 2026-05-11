// Fabric object metadata: operator + phase tagging.
//
// Strokes (pencil paths) and markers (images) carry custom
// properties so we can later:
//   - filter by operator (visibility toggle, see App.tsx +
//     useOperatorVisibility plumbing)
//   - distinguish plan vs record (visual dashArray applied at
//     creation time inside usePencil)
//
// Pattern: fabric objects accept arbitrary JS properties. The
// codebase already uses this pattern for the `REPLAY` sentinel in
// src/tools/undo.ts — see that file for the canonical example.
// Type-cast through `any` is the accepted shape; eslint.config.js
// permits no-explicit-any for fabric integration.
//
// Design reference: claudedocs/design_p0_slice.md §5.3.

import type * as fabric from "fabric";
import type { OperatorId } from "@/state/operators";
import type { Phase } from "@/state/phase";

const OPERATOR_KEY = "__operatorId" as const;
const PHASE_KEY = "__phase" as const;

// Augment fabric object with custom keys. The keys are deliberately
// double-underscore-prefixed to signal "internal sentinel, not part
// of fabric's public schema."

export function tagObject(
  obj: fabric.FabricObject,
  operatorId: OperatorId | null,
  phase: Phase,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any)[OPERATOR_KEY] = operatorId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any)[PHASE_KEY] = phase;
}

export function readOperator(
  obj: fabric.FabricObject,
): OperatorId | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[OPERATOR_KEY];
  // Three possible reads: undefined (untagged, legacy stroke), null
  // (tagged but no active operator at creation time), or a string.
  // We treat undefined the same as null — "no operator association".
  return typeof v === "string" ? v : null;
}

export function readPhase(obj: fabric.FabricObject): Phase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[PHASE_KEY];
  return v === "plan" || v === "record" ? v : "record";
}
