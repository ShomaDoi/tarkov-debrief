import { describe, it, expect } from "vitest";
import {
  readId,
  readOperator,
  readPhase,
  readSeq,
  tagObject,
} from "./metadata";
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

describe("readId / readSeq (P2 identity fields)", () => {
  it("assigns a non-empty string id on tagObject", () => {
    const obj = mkObj();
    tagObject(obj, null, "record");
    const id = readId(obj);
    expect(typeof id).toBe("string");
    expect((id ?? "").length).toBeGreaterThan(0);
  });

  it("assigns a numeric seq on tagObject", () => {
    const obj = mkObj();
    tagObject(obj, null, "record");
    expect(typeof readSeq(obj)).toBe("number");
  });

  it("two consecutive tagObject calls produce strictly increasing seqs", () => {
    // Module-scoped counter; we don't assert absolute values
    // because other tests in the same module share the counter.
    // Relative monotonicity is the contract.
    const a = mkObj();
    const b = mkObj();
    tagObject(a, null, "record");
    tagObject(b, null, "record");
    const sa = readSeq(a);
    const sb = readSeq(b);
    expect(sa).not.toBeNull();
    expect(sb).not.toBeNull();
    expect((sb as number) > (sa as number)).toBe(true);
  });

  it("two consecutive tagObject calls produce distinct ids", () => {
    const a = mkObj();
    const b = mkObj();
    tagObject(a, null, "record");
    tagObject(b, null, "record");
    expect(readId(a)).not.toEqual(readId(b));
  });

  it("tagObject is idempotent: a second call does not overwrite id/seq", () => {
    // This guard catches the future regression where someone
    // re-tags an object that's already on the timeline (e.g., a
    // map switch that walks existing marks). Re-assignment would
    // re-key the mark and confuse the timeline projection.
    const obj = mkObj();
    tagObject(obj, null, "record");
    const idBefore = readId(obj);
    const seqBefore = readSeq(obj);
    tagObject(obj, "op-x", "plan");
    expect(readId(obj)).toBe(idBefore);
    expect(readSeq(obj)).toBe(seqBefore);
    // Operator/phase WERE re-applied — those are not write-once.
    expect(readOperator(obj)).toBe("op-x");
    expect(readPhase(obj)).toBe("plan");
  });

  it("untagged objects read back as null id / null seq", () => {
    const obj = mkObj();
    expect(readId(obj)).toBeNull();
    expect(readSeq(obj)).toBeNull();
  });
});
