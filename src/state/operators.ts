// Operator model and persistence.
//
// Operators represent the squadmates whose actions are being annotated
// during a brief/debrief. Each operator carries a stable id, a display
// name, a color (used as the pencil brush color when active), and a
// visibility flag that controls whether their marks render on the
// canvas.
//
// Design references:
//   - claudedocs/design_p0_slice.md §5 (Slice B — operator metadata)
//   - claudedocs/design_p0_slice.md §5.6 (visibility & "hidden cannot
//     be active" rule)
//
// Persistence note: operators live in localStorage with versioned keys
// so future schema changes can be migrated cleanly. A parse failure
// silently falls back to defaults — the alternative (throwing) would
// strand a user behind a bad localStorage value with no UI to fix it.

export type OperatorId = string;

export type Operator = {
  id: OperatorId;
  name: string;
  color: string;
  visible: boolean;
};

// Default roster. Colors are drawn from the existing pickable palette
// in src/App.tsx, deliberately excluding red so it stays available for
// future engagement-mark types (see claudedocs/design_p0_slice.md §5.1).
export const DEFAULT_OPERATORS: Operator[] = [
  { id: "op-alpha", name: "Alpha", color: "#0693E3", visible: true },
  { id: "op-bravo", name: "Bravo", color: "#FCB900", visible: true },
  { id: "op-charlie", name: "Charlie", color: "#00D084", visible: true },
  { id: "op-delta", name: "Delta", color: "#F78DA7", visible: true },
];

// Versioned keys so a future schema bump doesn't read stale shapes.
// If the structure changes, bump v1 -> v2 and let the v1 read fall
// through to defaults.
const STORAGE_KEY = "tarkov-debrief:operators:v1";
const ACTIVE_KEY = "tarkov-debrief:active-operator:v1";

export function loadOperators(): Operator[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPERATORS;
    const parsed = JSON.parse(raw) as unknown;
    // Defensive shape check. A malformed entry shouldn't crash the app
    // on boot — we just fall back to defaults and overwrite on next
    // save.
    if (!Array.isArray(parsed)) return DEFAULT_OPERATORS;
    return parsed.filter(isOperator);
  } catch {
    return DEFAULT_OPERATORS;
  }
}

export function saveOperators(operators: Operator[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(operators));
  } catch {
    // Quota exceeded or storage disabled — silently no-op rather than
    // crashing. The in-memory state still works for this session.
  }
}

export function loadActiveOperatorId(): OperatorId | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    // Empty string from localStorage means "explicitly null" (we
    // serialize null as ""). A missing key means "first run".
    if (raw === null) return DEFAULT_OPERATORS[0]?.id ?? null;
    if (raw === "") return null;
    return raw;
  } catch {
    return DEFAULT_OPERATORS[0]?.id ?? null;
  }
}

export function saveActiveOperatorId(id: OperatorId | null): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id ?? "");
  } catch {
    // See saveOperators comment.
  }
}

function isOperator(v: unknown): v is Operator {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.color === "string" &&
    typeof o.visible === "boolean"
  );
}

// Look up the active operator object from id + roster. Returns null
// when active is null OR when the active id no longer exists in the
// roster (e.g., the operator was deleted while we were away).
export function getActiveOperator(
  operators: Operator[],
  activeId: OperatorId | null,
): Operator | null {
  if (activeId === null) return null;
  return operators.find((op) => op.id === activeId) ?? null;
}
