// Combined tests for the three point-interaction MarkSpecs (engagement X,
// sound ping, position dot). Their interaction lifecycles are
// identical (single-click commit, sticky); the differences are in
// build geometry, color resolution, and phase treatment.

import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import * as fabric from "fabric";
import { ENGAGEMENT_X_SPEC } from "./engagementX";
import { SOUND_PING_SPEC } from "./soundPing";
import { POSITION_DOT_SPEC } from "./positionDot";
import { useMark, type UseMarkOptions } from "./useMark";
import { asCanvas, createMockCanvas, fire } from "../../test/mockCanvas";
import { ToolType, type Tool } from "../tool";
import type { Operator } from "@/state/operators";
import type { Point } from "./geometry";
import { readOperator, readMarkType, readPhase } from "../metadata";
import type { MarkSpec } from "./types";

const ALPHA: Operator = {
  id: "op-alpha",
  name: "Alpha",
  color: "#0693E3",
  visible: true,
};

function baseTool(type: ToolType): Tool {
  return { type, active: false, cursor: null };
}

function makeUndoStub() {
  return {
    onUndo: vi.fn(),
    markTransient: vi.fn(),
    unmarkTransient: vi.fn(),
    popLastAction: vi.fn(),
    recordAdd: vi.fn(),
    recordRemove: vi.fn(),
  };
}

function makeOpts(
  spec: MarkSpec,
  overrides: Partial<UseMarkOptions> & {
    canvas: UseMarkOptions["canvas"];
  },
): UseMarkOptions {
  const lastArrowTipRef = {
    current: null as Point | null,
  } as UseMarkOptions["lastArrowTipRef"];
  const tool = overrides.tool ?? baseTool(spec.toolType);
  return {
    canvas: overrides.canvas,
    tool,
    setTool: overrides.setTool ?? vi.fn(),
    activeOperator: overrides.activeOperator ?? ALPHA,
    activeOperatorId: overrides.activeOperatorId ?? ALPHA.id,
    phase: overrides.phase ?? "record",
    lastArrowTipRef,
    undo: overrides.undo ?? makeUndoStub(),
  };
}

// ---- Spec-by-spec geometry / phase behavior ---------------------

describe("ENGAGEMENT_X_SPEC", () => {
  it("declares fixed-red point-interaction sticky spec", () => {
    expect(ENGAGEMENT_X_SPEC.toolType).toBe(ToolType.engagementX);
    expect(ENGAGEMENT_X_SPEC.markType).toBe("engagementX");
    expect(ENGAGEMENT_X_SPEC.interaction).toBe("point");
    expect(ENGAGEMENT_X_SPEC.colorSource).toBe("fixed");
    expect(ENGAGEMENT_X_SPEC.fixedColor).toBe("#D0312D");
    expect(ENGAGEMENT_X_SPEC.oneShot).toBe(false);
  });

  it("build produces a fabric.Group of two crossed lines in fixed red", () => {
    const obj = ENGAGEMENT_X_SPEC.build({
      kind: "point",
      at: { x: 100, y: 50 },
      color: "#D0312D",
    });
    expect(obj).toBeInstanceOf(fabric.Group);
    const group = obj as fabric.Group;
    expect(group.getObjects().length).toBe(2);
    // Both lines are red.
    for (const child of group.getObjects()) {
      expect((child as fabric.Line).stroke).toBe("#D0312D");
    }
  });

  it("applyPhase halves opacity under plan", () => {
    const obj = ENGAGEMENT_X_SPEC.build({
      kind: "point",
      at: { x: 0, y: 0 },
      color: "#D0312D",
    });
    ENGAGEMENT_X_SPEC.applyPhase(obj, "plan");
    expect(obj.opacity).toBe(0.5);
    ENGAGEMENT_X_SPEC.applyPhase(obj, "record");
    expect(obj.opacity).toBe(1);
  });
});

describe("SOUND_PING_SPEC", () => {
  it("declares fixed-yellow point-interaction sticky spec", () => {
    expect(SOUND_PING_SPEC.toolType).toBe(ToolType.soundPing);
    expect(SOUND_PING_SPEC.colorSource).toBe("fixed");
    expect(SOUND_PING_SPEC.fixedColor).toBe("#E6C229");
    expect(SOUND_PING_SPEC.oneShot).toBe(false);
  });

  it("build produces three concentric circles in fixed yellow", () => {
    const obj = SOUND_PING_SPEC.build({
      kind: "point",
      at: { x: 50, y: 50 },
      color: "#E6C229",
    });
    expect(obj).toBeInstanceOf(fabric.Group);
    const group = obj as fabric.Group;
    const rings = group.getObjects();
    expect(rings.length).toBe(3);
    for (const ring of rings) {
      expect((ring as fabric.Circle).stroke).toBe("#E6C229");
    }
    // Radii should be in increasing order — inner first.
    const radii = (rings as fabric.Circle[]).map((c) => c.radius!);
    expect(radii).toEqual([4, 9, 14]);
  });

  it("applyPhase halves opacity under plan", () => {
    const obj = SOUND_PING_SPEC.build({
      kind: "point",
      at: { x: 0, y: 0 },
      color: "#E6C229",
    });
    SOUND_PING_SPEC.applyPhase(obj, "plan");
    expect(obj.opacity).toBe(0.5);
  });
});

describe("POSITION_DOT_SPEC", () => {
  it("declares operator-colored point-interaction sticky spec", () => {
    expect(POSITION_DOT_SPEC.toolType).toBe(ToolType.positionDot);
    expect(POSITION_DOT_SPEC.colorSource).toBe("operator");
    expect(POSITION_DOT_SPEC.oneShot).toBe(false);
  });

  it("build produces a filled circle in the operator's color", () => {
    const obj = POSITION_DOT_SPEC.build({
      kind: "point",
      at: { x: 100, y: 100 },
      color: ALPHA.color,
    });
    expect(obj).toBeInstanceOf(fabric.Circle);
    const c = obj as fabric.Circle;
    expect(c.fill).toBe(ALPHA.color);
    expect(c.stroke).toBe(ALPHA.color);
    expect(c.radius).toBe(6);
  });

  it("applyPhase swaps fill for stroke under plan (hollow dot)", () => {
    const obj = POSITION_DOT_SPEC.build({
      kind: "point",
      at: { x: 0, y: 0 },
      color: ALPHA.color,
    });
    POSITION_DOT_SPEC.applyPhase(obj, "plan");
    const c = obj as fabric.Circle;
    expect(c.fill).toBeUndefined();
    expect(c.strokeWidth).toBeGreaterThan(0);

    POSITION_DOT_SPEC.applyPhase(obj, "record");
    expect(c.fill).toBe(ALPHA.color);
    expect(c.strokeWidth).toBe(0);
  });
});

// ---- Shared interaction lifecycle (point) ------------------------

describe("useMark — point interaction", () => {
  it("commits an engagement X on left mouse:down (sticky)", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 200, y: 100 }));
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        ENGAGEMENT_X_SPEC,
        makeOpts(ENGAGEMENT_X_SPEC, {
          canvas: asCanvas(mock),
          setTool,
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });

    expect(mock.add).toHaveBeenCalledTimes(1);
    const committed = mock.add.mock.calls[0]![0] as fabric.Group;
    expect(readMarkType(committed)).toBe("engagementX");
    expect(readPhase(committed)).toBe("record");
    // operator tag still present even though color is fixed —
    // ensures visibility-toggle works.
    expect(readOperator(committed)).toBe(ALPHA.id);
    // Sticky: no setTool call after commit.
    expect(setTool).not.toHaveBeenCalled();
  });

  it("places multiple position dots in sequence (sticky)", () => {
    const mock = createMockCanvas();
    let p = { x: 100, y: 50 };
    mock.getScenePoint = vi.fn(() => p);
    renderHook(() =>
      useMark(
        POSITION_DOT_SPEC,
        makeOpts(POSITION_DOT_SPEC, {
          canvas: asCanvas(mock),
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    p = { x: 150, y: 75 };
    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    p = { x: 200, y: 100 };
    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });

    expect(mock.add).toHaveBeenCalledTimes(3);
    const dots = mock.add.mock.calls.map(
      (c) => c[0] as fabric.Circle,
    );
    expect(dots[0]!.left).toBeCloseTo(100 - 6); // at.x - radius
    expect(dots[1]!.left).toBeCloseTo(150 - 6);
    expect(dots[2]!.left).toBeCloseTo(200 - 6);
  });

  it("ignores right-mouse-button down (button-reservation contract)", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 100, y: 50 }));
    renderHook(() =>
      useMark(
        SOUND_PING_SPEC,
        makeOpts(SOUND_PING_SPEC, {
          canvas: asCanvas(mock),
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 2 }),
    });

    expect(mock.add).not.toHaveBeenCalled();
  });

  it("applies the current phase to each newly-committed point mark", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 100, y: 50 }));
    renderHook(() =>
      useMark(
        ENGAGEMENT_X_SPEC,
        makeOpts(ENGAGEMENT_X_SPEC, {
          canvas: asCanvas(mock),
          phase: "plan",
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });

    const obj = mock.add.mock.calls[0]![0] as fabric.Group;
    expect(obj.opacity).toBe(0.5);
    expect(readPhase(obj)).toBe("plan");
  });
});
