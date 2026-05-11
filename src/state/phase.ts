// Phase state for brief-vs-debrief input.
//
// Each freehand stroke and marker is tagged with a "phase":
//   - "record": something that actually happened (debrief mode)
//   - "plan":   something the squad intends to do (brief mode)
//
// "record" is the default because the product is named Debrief and
// the dominant use case is post-raid review.
//
// Visual treatment for plan-phase strokes is a fixed dashArray
// applied post-creation in src/tools/pencil.ts; see
// claudedocs/design_p0_slice.md §5.4 and §6.3.
//
// Design reference: claudedocs/design_p0_slice.md §6 (Slice C).

export type Phase = "record" | "plan";

export const DEFAULT_PHASE: Phase = "record";

const STORAGE_KEY = "tarkov-debrief:phase:v1";

export function loadPhase(): Phase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "plan" || raw === "record") return raw;
    return DEFAULT_PHASE;
  } catch {
    return DEFAULT_PHASE;
  }
}

export function savePhase(phase: Phase): void {
  try {
    localStorage.setItem(STORAGE_KEY, phase);
  } catch {
    // Quota / disabled storage — in-memory still works this session.
  }
}

// Dash pattern applied to plan-phase strokes. Fixed (no zoom
// compensation in P0) — if dashes look stretched at extreme zoom,
// mirror zoom.ts's brush-width compensation (see design_p0_slice.md
// §6.3 open question).
export const PLAN_DASH_ARRAY: number[] = [10, 15];
