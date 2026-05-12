// Active-tool persistence.
//
// Persists the user's last-active ToolType across reloads. Operator
// and phase already persist (operators.ts, phase.ts); this completes
// the persistence triad (tool + operator + phase).
//
// Why not the full Tool record: cursor + active flag are derived
// state — cursor is set by each tool hook on activation, and active
// is recomputed from canvas state. Persisting only the ToolType keeps
// the storage shape stable across UI changes to the Tool record.
//
// One-shot hydration rule: sightline / cone / text are transient
// tools — they auto-revert to arrow after a single commit. Restoring
// them on reload would put the user in a mode whose anchor (the
// lastArrowTipRef) was lost. Soft-fail the hydration to `pencil`
// instead — that's the app's pre-P0 default and the safest landing.
//
// Design reference: claudedocs/design_p1_slice.md §9.3, §15.1 R-E.

import { ToolType } from "@/tools/tool";

const STORAGE_KEY = "tarkov-debrief:tool:v1";

export const DEFAULT_TOOL: ToolType = ToolType.pencil;

// Tools that should NOT survive a reload. These are all one-shot
// transient tools that depend on `lastArrowTipRef` (sightline, cone)
// or on an active edit session (text). See design doc §9.3.
const TRANSIENT_TOOLS: ReadonlySet<ToolType> = new Set([
  ToolType.sightline,
  ToolType.cone,
  ToolType.text,
]);

// Valid string -> ToolType lookup. Built once from the enum values
// so adding a new ToolType automatically widens the accepted set.
const VALID_TOOL_VALUES: ReadonlySet<string> = new Set(
  Object.values(ToolType),
);

export function loadTool(): ToolType {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_TOOL;
    if (!VALID_TOOL_VALUES.has(raw)) return DEFAULT_TOOL;
    const tool = raw as ToolType;
    // One-shot tools fall back to the default — see header comment.
    if (TRANSIENT_TOOLS.has(tool)) return DEFAULT_TOOL;
    return tool;
  } catch {
    return DEFAULT_TOOL;
  }
}

export function saveTool(tool: ToolType): void {
  try {
    localStorage.setItem(STORAGE_KEY, tool);
  } catch {
    // Quota / disabled storage — in-memory still works this session.
  }
}

// Used by App.tsx to suppress persistence writes for spring-loaded
// quasi-modes (Space-hold pan, RMB-hold eraser). Those modes flip
// the tool transiently and shouldn't churn localStorage. See §9.3
// "Persistence is write-only-on-change to avoid storage churn during
// quasi-mode entry/exit."
//
// We don't try to detect quasi-mode from inside this module —
// instead, App.tsx skips the saveTool call for the quasi-mode
// transitions, which keeps the rule local to where the spring-load
// is wired.
export function isTransientTool(tool: ToolType): boolean {
  return TRANSIENT_TOOLS.has(tool);
}
