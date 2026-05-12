import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import * as fabric from "fabric";
import { TEXT_SPEC } from "./text";
import { useMark, type UseMarkOptions } from "./useMark";
import { asCanvas, createMockCanvas, fire } from "../../test/mockCanvas";
import { ToolType, type Tool } from "../tool";
import type { Operator } from "@/state/operators";
import type { Point } from "./geometry";
import { readOperator, readMarkType } from "../metadata";

const ALPHA: Operator = {
  id: "op-alpha",
  name: "Alpha",
  color: "#0693E3",
  visible: true,
};

function baseTool(type: ToolType = ToolType.text): Tool {
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
  overrides: Partial<UseMarkOptions> & {
    canvas: UseMarkOptions["canvas"];
  },
): UseMarkOptions {
  const lastArrowTipRef = {
    current: null as Point | null,
  } as UseMarkOptions["lastArrowTipRef"];
  const tool = overrides.tool ?? baseTool();
  return {
    canvas: overrides.canvas,
    tool,
    setTool: overrides.setTool ?? vi.fn(),
    activeOperator: overrides.activeOperator ?? ALPHA,
    activeOperatorId: overrides.activeOperatorId ?? ALPHA.id,
    phase: overrides.phase ?? "record",
    lastArrowTipRef,
    undo: overrides.undo ?? makeUndoStub(),
    suspendedRef: overrides.suspendedRef,
  };
}

describe("TEXT_SPEC", () => {
  it("declares operator-colored text-interaction one-shot spec", () => {
    expect(TEXT_SPEC.toolType).toBe(ToolType.text);
    expect(TEXT_SPEC.markType).toBe("text");
    expect(TEXT_SPEC.interaction).toBe("text");
    expect(TEXT_SPEC.colorSource).toBe("operator");
    expect(TEXT_SPEC.oneShot).toBe(true);
    expect(TEXT_SPEC.revertTo).toBeUndefined(); // falls back to previous tool
  });

  it("build returns an empty IText at the click point with the operator color", () => {
    const obj = TEXT_SPEC.build({
      kind: "text",
      at: { x: 50, y: 30 },
      color: ALPHA.color,
    });
    expect(obj).toBeInstanceOf(fabric.IText);
    const it = obj as fabric.IText;
    expect(it.text).toBe("");
    expect(it.fill).toBe(ALPHA.color);
    expect(it.left).toBe(50);
    expect(it.top).toBe(30);
  });

  it("applyPhase italicizes + underlines under plan", () => {
    const obj = TEXT_SPEC.build({
      kind: "text",
      at: { x: 0, y: 0 },
      color: ALPHA.color,
    });
    TEXT_SPEC.applyPhase(obj, "plan");
    const it = obj as fabric.IText;
    expect(it.fontStyle).toBe("italic");
    expect(it.underline).toBe(true);

    TEXT_SPEC.applyPhase(obj, "record");
    expect(it.fontStyle).toBe("normal");
    expect(it.underline).toBe(false);
  });

  it("serialize reads text + left + top off a fabric.IText-shaped object", () => {
    // Construct a minimal duck-typed object instead of a real
    // fabric.IText: setting the `text` property on a fabric.IText
    // via `.set` triggers text remeasurement, which requires a
    // canvas 2D context that jsdom doesn't provide. The serialize
    // function we're testing just reads three fields, so a plain
    // object is sufficient.
    const it = {
      text: "0:45 — flank from north",
      left: 50,
      top: 30,
    } as unknown as fabric.IText;
    const state = TEXT_SPEC.serialize!(it);
    expect(state).toEqual({
      text: "0:45 — flank from north",
      left: 50,
      top: 30,
    });
  });

  it("build throws on non-text params (defensive)", () => {
    expect(() =>
      TEXT_SPEC.build({
        kind: "point",
        at: { x: 0, y: 0 },
        color: "#000",
      }),
    ).toThrow(/text/);
  });
});

describe("useMark(TEXT_SPEC) — text interaction", () => {
  it("creates an IText in edit mode on mouse:down, marked transient", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 50, y: 30 }));
    const undo = makeUndoStub();
    renderHook(() =>
      useMark(
        TEXT_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          undo,
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });

    expect(mock.add).toHaveBeenCalledTimes(1);
    const it = mock.add.mock.calls[0]![0] as fabric.IText;
    expect(it).toBeInstanceOf(fabric.IText);
    expect(it.text).toBe("");
    // Empty add suppressed from undo until commit.
    expect(undo.markTransient).toHaveBeenCalledWith(it);
  });

  it("auto-deletes the IText on empty editing:exited (undo untouched)", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 50, y: 30 }));
    const undo = makeUndoStub();
    const setTool = vi.fn();

    // Mount with tool = pencil to seed the "previous tool" tracker.
    // Then rerender into tool = text — this is what the activation
    // path looks like in production (App.tsx flips the tool and the
    // hook re-runs with the new value, while the prior render's
    // tool.type is what previousToolTypeRef holds).
    const { rerender } = renderHook(
      ({ t }: { t: Tool }) =>
        useMark(
          TEXT_SPEC,
          makeOpts({
            canvas: asCanvas(mock),
            setTool,
            undo,
            tool: t,
          }),
        ),
      { initialProps: { t: baseTool(ToolType.pencil) } },
    );
    rerender({ t: baseTool(ToolType.text) });

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    const it = mock.add.mock.calls[0]![0] as fabric.IText;
    // Empty text → editing:exited triggers auto-delete.
    it.fire("editing:exited");

    expect(mock.remove).toHaveBeenCalledWith(it);
    expect(undo.unmarkTransient).not.toHaveBeenCalled();
    expect(undo.recordAdd).not.toHaveBeenCalled();
    // One-shot: reverts to previous tool (pencil — the value the
    // ref held at activation time).
    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.pencil }),
    );
  });

  it("commits a non-empty IText, unmarks transient, and recordAdds", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 50, y: 30 }));
    const undo = makeUndoStub();
    const setTool = vi.fn();

    // Stub the spec's applyPhase: the real one calls
    // fabric.IText.set({fontStyle, underline}) which triggers
    // text-content remeasurement, and fabric's measurement path
    // needs a canvas-2D context (null in jsdom). This test is
    // about commit *plumbing* — undo+tag+revert — not about the
    // applyPhase visual outcome, which is covered by the spec
    // tests above.
    const specNoApply = {
      ...TEXT_SPEC,
      applyPhase: vi.fn(),
    };

    const { rerender } = renderHook(
      ({ t }: { t: Tool }) =>
        useMark(
          specNoApply,
          makeOpts({
            canvas: asCanvas(mock),
            setTool,
            undo,
            tool: t,
          }),
        ),
      { initialProps: { t: baseTool(ToolType.eraser) } },
    );
    rerender({ t: baseTool(ToolType.text) });

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    const it = mock.add.mock.calls[0]![0] as fabric.IText;
    // Bypass fabric.IText.set({text}) which needs canvas context
    // in jsdom. Direct property mutation skips the remeasurement
    // pipeline; the editing:exited path just reads .text.
    (it as fabric.IText).text = "spotted at 0:45";
    it.fire("editing:exited");

    expect(mock.remove).not.toHaveBeenCalled();
    expect(undo.unmarkTransient).toHaveBeenCalledWith(it);
    expect(undo.recordAdd).toHaveBeenCalledWith(it);
    expect(readOperator(it)).toBe(ALPHA.id);
    expect(readMarkType(it)).toBe("text");
    // One-shot: reverts to previous tool (eraser).
    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.eraser }),
    );
  });

  it("ignores right-button mouse:down", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 50, y: 30 }));
    renderHook(() =>
      useMark(
        TEXT_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 2 }),
    });
    expect(mock.add).not.toHaveBeenCalled();
  });

  it("ignores subsequent mouse:downs while an edit is in flight", () => {
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 50, y: 30 }));
    renderHook(() =>
      useMark(
        TEXT_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
        }),
      ),
    );

    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });

    // Only the first click created an IText.
    expect(mock.add).toHaveBeenCalledTimes(1);
  });

  it("suspends global shortcuts while waiting for the first click", () => {
    // Regression for the "type any letter and you pop out of text
    // mode" bug. Without suspension, unmodified letter keys
    // (e.g. `a`) match other tool bindings in App.tsx and switch
    // the active tool before the user has a chance to click and
    // place the IText. useMark's text effect flips suspendedRef
    // on mount; useKeyboardShortcuts's modifier-strict matcher
    // then skips unmodified taps until suspension lifts.
    const mock = createMockCanvas();
    const suspendedRef = { current: false };
    const { unmount } = renderHook(() =>
      useMark(
        TEXT_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          suspendedRef,
        }),
      ),
    );
    expect(suspendedRef.current).toBe(true);
    unmount();
    expect(suspendedRef.current).toBe(false);
  });

  it("lifts suspension as soon as the first click places the IText", () => {
    // The previous "always-on while text-mode-active" model
    // blocked V/B/E even after the IText took focus — the user
    // reported it as "cannot exit to any other tool" because
    // letter-keyed tool bindings stayed suppressed for the
    // entire text session. Once the textarea is focused, the
    // global hook's `isInput` check handles keystroke routing
    // on its own and suspension becomes redundant. Lifting it
    // here lets the user switch tools via keyboard after Esc
    // (or via toolbar) without ceremony.
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 50, y: 30 }));
    const suspendedRef = { current: false };
    renderHook(() =>
      useMark(
        TEXT_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          suspendedRef,
        }),
      ),
    );
    expect(suspendedRef.current).toBe(true);
    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    expect(suspendedRef.current).toBe(false);
  });

  it("Esc before clicking cancels text mode and reverts to previous tool", () => {
    // The user pressed T by accident (or wants to back out before
    // placing). Esc before the first click reverts to the prior
    // tool — without this they'd be stuck in text mode until
    // they clicked somewhere.
    const mock = createMockCanvas();
    const setTool = vi.fn();
    const { rerender } = renderHook(
      ({ t }: { t: Tool }) =>
        useMark(
          TEXT_SPEC,
          makeOpts({
            canvas: asCanvas(mock),
            setTool,
            tool: t,
            suspendedRef: { current: false },
          }),
        ),
      { initialProps: { t: baseTool(ToolType.eraser) } },
    );
    // Switch into text mode so the effect's mount captures the
    // previous tool (eraser) and installs the Esc handler.
    rerender({ t: baseTool(ToolType.text) });

    // Dispatch Esc — handler should fire because no IText is in
    // flight yet.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(setTool).toHaveBeenCalledWith(
      expect.objectContaining({ type: ToolType.eraser }),
    );
    // And nothing was added to the canvas (no orphan IText).
    expect(mock.add).not.toHaveBeenCalled();
  });

  it("Esc DURING editing is left to fabric's IText (does not double-fire revert)", () => {
    // fabric.IText handles Esc itself via its keysMap (keyCode 27
    // → exitEditing). Our window-level Esc handler must bail out
    // when an IText is already in flight, otherwise we'd revert
    // the tool TWICE — once via fabric's editing:exited → our
    // handleEditingExited, and once via the Esc handler directly.
    const mock = createMockCanvas();
    mock.getScenePoint = vi.fn(() => ({ x: 50, y: 30 }));
    const setTool = vi.fn();
    renderHook(() =>
      useMark(
        TEXT_SPEC,
        makeOpts({
          canvas: asCanvas(mock),
          setTool,
        }),
      ),
    );
    fire(mock, "mouse:down", {
      e: new MouseEvent("mousedown", { button: 0 }),
    });
    // IText is now in flight. Dispatching Esc on the window
    // should be a no-op from our handler's perspective (fabric
    // would handle it via the textarea, not via window keydown).
    setTool.mockClear();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(setTool).not.toHaveBeenCalled();
  });
});
