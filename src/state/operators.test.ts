import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_OPERATORS,
  getActiveOperator,
  loadActiveOperatorId,
  loadOperators,
  saveActiveOperatorId,
  saveOperators,
} from "./operators";

const STORAGE_KEY = "tarkov-debrief:operators:v1";
const ACTIVE_KEY = "tarkov-debrief:active-operator:v1";

beforeEach(() => {
  localStorage.clear();
});

describe("operators persistence", () => {
  it("returns defaults on empty storage", () => {
    expect(loadOperators()).toEqual(DEFAULT_OPERATORS);
  });

  it("round-trips through saveOperators/loadOperators", () => {
    const roster = [
      { id: "op-x", name: "X", color: "#fff", visible: true },
    ];
    saveOperators(roster);
    expect(loadOperators()).toEqual(roster);
  });

  it("falls back to defaults on malformed JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadOperators()).toEqual(DEFAULT_OPERATORS);
  });

  it("filters out entries with the wrong shape", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "ok", name: "OK", color: "#000", visible: true },
        { id: "bad" /* missing name */ },
        "junk",
      ]),
    );
    expect(loadOperators()).toEqual([
      { id: "ok", name: "OK", color: "#000", visible: true },
    ]);
  });
});

describe("active operator persistence", () => {
  it("defaults to the first operator's id on first run", () => {
    expect(loadActiveOperatorId()).toBe(DEFAULT_OPERATORS[0].id);
  });

  it("round-trips a specific id", () => {
    saveActiveOperatorId("op-bravo");
    expect(loadActiveOperatorId()).toBe("op-bravo");
  });

  it("round-trips an explicit null (empty string in storage)", () => {
    saveActiveOperatorId(null);
    // The "" sentinel distinguishes "explicitly cleared" from "never
    // set" — see operators.ts loadActiveOperatorId.
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("");
    expect(loadActiveOperatorId()).toBeNull();
  });
});

describe("getActiveOperator", () => {
  it("returns null when active id is null", () => {
    expect(getActiveOperator(DEFAULT_OPERATORS, null)).toBeNull();
  });

  it("returns the matching operator when present", () => {
    expect(getActiveOperator(DEFAULT_OPERATORS, "op-bravo")).toEqual(
      DEFAULT_OPERATORS.find((op) => op.id === "op-bravo"),
    );
  });

  it("returns null when the id has no match (e.g., deleted)", () => {
    expect(getActiveOperator(DEFAULT_OPERATORS, "op-ghost")).toBeNull();
  });
});
