import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_PHASE, loadPhase, savePhase } from "./phase";

beforeEach(() => {
  localStorage.clear();
});

describe("phase persistence", () => {
  it("defaults to 'record' on empty storage", () => {
    expect(loadPhase()).toBe(DEFAULT_PHASE);
    expect(DEFAULT_PHASE).toBe("record");
  });

  it("round-trips 'plan'", () => {
    savePhase("plan");
    expect(loadPhase()).toBe("plan");
  });

  it("round-trips 'record'", () => {
    savePhase("record");
    expect(loadPhase()).toBe("record");
  });

  it("falls back to default when storage holds an unknown value", () => {
    localStorage.setItem("tarkov-debrief:phase:v1", "speculative");
    expect(loadPhase()).toBe(DEFAULT_PHASE);
  });
});
