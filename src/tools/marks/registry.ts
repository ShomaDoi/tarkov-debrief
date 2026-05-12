// Mark-spec registry.
//
// Each mark module (./sightline.ts, ./cone.ts, etc.) exports one
// MarkSpec; this module collects them into a single ToolType-keyed
// map that useUndo, useMark, and the radial all consume.
//
// In Phase 1 (the current pass) the registry is empty — no marks are
// implemented yet. Phases 2–4 fill it in as each mark ships. The
// registry exposes `getSpec(toolType)` which returns null for
// unknown tools; consumers (useMark, useUndo) treat that as "not a
// MarkSpec consumer" and bail out gracefully. This is what lets
// later phases land incrementally without touching this file's
// readers.
//
// Design reference: claudedocs/design_p1_slice.md §4.10 (the
// serialize/deserialize lookup useUndo performs).

import type { ToolType } from "@/tools/tool";
import type { MarkType } from "@/tools/metadata";
import type { MarkSpec } from "./types";

// Internal registry. Populated by `registerMark` calls (which mark
// modules invoke at module-load time once they exist) and consulted
// by `getSpec` / `getSpecByMarkType`.
const byToolType = new Map<ToolType, MarkSpec>();
const byMarkType = new Map<MarkType, MarkSpec>();

/**
 * Register a mark spec at module-load time. Call from the body of
 * each mark module after the spec literal is declared.
 *
 * Idempotent: re-registering the same toolType replaces the prior
 * entry. This is intentional — keeps hot-module-reload sane during
 * development and avoids needing an "is the registry mounted" flag.
 */
export function registerMark(spec: MarkSpec): void {
  byToolType.set(spec.toolType, spec);
  byMarkType.set(spec.markType, spec);
}

/**
 * Look up a spec by the ToolType the user activated. Returns null
 * for tools that aren't MarkSpec consumers (pencil, arrow, eraser,
 * select, marker, pan).
 */
export function getSpec(toolType: ToolType): MarkSpec | null {
  return byToolType.get(toolType) ?? null;
}

/**
 * Look up a spec by the mark-type tag attached to a fabric object.
 * Used by `useUndo` to find the serialize/deserialize pair for a
 * modified object. Returns null for untagged objects (legacy P0
 * strokes, fabric.Image markers).
 */
export function getSpecByMarkType(markType: MarkType): MarkSpec | null {
  return byMarkType.get(markType) ?? null;
}

/**
 * Test-only escape hatch. Vitest tests register specs with their own
 * dummy MarkType strings; clearing between tests prevents cross-test
 * leakage. Not exported from the public surface used by production
 * code paths — it's marked with an underscore prefix and meant for
 * test setup only.
 */
export function _clearRegistryForTests(): void {
  byToolType.clear();
  byMarkType.clear();
}
