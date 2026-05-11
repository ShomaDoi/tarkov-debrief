import { describe, it, expect } from "vitest";
import { readOperator, readPhase, tagObject } from "./metadata";
import type * as fabric from "fabric";

// Helper: create a bare object that "looks like" a fabric object for
// metadata purposes. The functions in metadata.ts treat the input
// as a property bag — they don't call any fabric APIs.
function mkObj(): fabric.FabricObject {
  return {} as unknown as fabric.FabricObject;
}

describe("tagObject / readOperator / readPhase", () => {
  it("attaches operator and phase, reads them back", () => {
    const obj = mkObj();
    tagObject(obj, "op-alpha", "plan");
    expect(readOperator(obj)).toBe("op-alpha");
    expect(readPhase(obj)).toBe("plan");
  });

  it("supports null operator (untagged-but-tracked stroke)", () => {
    const obj = mkObj();
    tagObject(obj, null, "record");
    expect(readOperator(obj)).toBeNull();
    expect(readPhase(obj)).toBe("record");
  });

  it("reads default values from a fresh untagged object", () => {
    // Legacy strokes (drawn before this slice shipped) have no
    // metadata; the read helpers must treat that as "no operator,
    // record phase" so they remain visible and undashed by default.
    const obj = mkObj();
    expect(readOperator(obj)).toBeNull();
    expect(readPhase(obj)).toBe("record");
  });

  it("ignores corrupt metadata (e.g., wrong type)", () => {
    // These are pathological cases (could only happen if someone
    // mutated the object directly). Defensive read still returns
    // sane defaults. Go through `unknown` to bypass fabric's
    // private property signature, which doesn't admit string-keyed
    // augmentation directly.
    const obj = mkObj();
    const bag = obj as unknown as Record<string, unknown>;
    bag.__operatorId = 42;
    bag.__phase = "speculative";
    expect(readOperator(obj)).toBeNull();
    expect(readPhase(obj)).toBe("record");
  });
});
