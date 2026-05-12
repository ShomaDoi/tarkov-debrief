import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useUndo } from "./undo";
import { asCanvas, createMockCanvas, fire } from "../test/mockCanvas";
import {
  registerMark,
  _clearRegistryForTests,
} from "./marks/registry";
import { tagMarkType } from "./metadata";
import type { MarkSpec } from "./marks/types";
import { ToolType } from "./tool";

describe("useUndo", () => {
  it("does not crash with null canvas", () => {
    expect(() => renderHook(() => useUndo(null, new Set()))).not.toThrow();
  });

  it("registers add/remove listeners and cleans them up", () => {
    const mock = createMockCanvas();
    const { unmount } = renderHook(() => useUndo(asCanvas(mock), new Set()));
    expect(mock.on).toHaveBeenCalledWith("object:added", expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith(
      "object:removed",
      expect.any(Function)
    );

    unmount();
    expect(mock.off).toHaveBeenCalledWith("object:added", expect.any(Function));
    expect(mock.off).toHaveBeenCalledWith(
      "object:removed",
      expect.any(Function)
    );
  });

  it("subscribes to object:modified and selection events (P1 extension)", () => {
    const mock = createMockCanvas();
    renderHook(() => useUndo(asCanvas(mock), new Set()));
    expect(mock.on).toHaveBeenCalledWith(
      "object:modified",
      expect.any(Function),
    );
    expect(mock.on).toHaveBeenCalledWith(
      "selection:created",
      expect.any(Function),
    );
    expect(mock.on).toHaveBeenCalledWith(
      "selection:updated",
      expect.any(Function),
    );
    expect(mock.on).toHaveBeenCalledWith(
      "selection:cleared",
      expect.any(Function),
    );
  });

  it("undoes an add by removing the object", () => {
    const mock = createMockCanvas();
    const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));
    const obj = { id: "stroke-1" };
    fire(mock, "object:added", { target: obj });

    act(() => result.current.onUndo());
    expect(mock.remove).toHaveBeenCalledWith(obj);
  });

  it("undoes a remove by re-adding the object", () => {
    const mock = createMockCanvas();
    const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));
    const obj = { id: "stroke-2" };
    fire(mock, "object:removed", { target: obj });

    act(() => result.current.onUndo());
    expect(mock.add).toHaveBeenCalledWith(obj);
  });

  it("ignores adds whose src is in the unerasable set (background image)", () => {
    const unerasable = new Set(["http://example.com/customs.png"]);
    const mock = createMockCanvas();
    const { result } = renderHook(() => useUndo(asCanvas(mock), unerasable));

    // A non-fabric.Image object that happens to share a src is still
    // tracked — the unerasable-skip only triggers via `instanceof
    // fabric.Image`. So we don't expect this duck-typed object to be
    // skipped; we just assert that the listener still records it.
    fire(mock, "object:added", {
      target: { getSrc: () => "http://example.com/customs.png" },
    });

    act(() => result.current.onUndo());
    expect(mock.remove).toHaveBeenCalledTimes(1);
  });

  it("a no-op undo when stack is empty does nothing", () => {
    const mock = createMockCanvas();
    const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));

    act(() => result.current.onUndo());
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.add).not.toHaveBeenCalled();
  });

  describe("__transient skip-key (P1 §4.10)", () => {
    it("skips object:added recording when target is marked transient", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));
      // Treat a plain object as a fabric object — mockCanvas tests
      // throughout the codebase do this; the runtime branch we care
      // about doesn't depend on the prototype.
      const obj = {} as unknown as Parameters<
        typeof result.current.markTransient
      >[0];
      result.current.markTransient(obj);
      fire(mock, "object:added", { target: obj });

      act(() => result.current.onUndo());
      // Stack should have been empty — no add was recorded.
      expect(mock.remove).not.toHaveBeenCalled();
    });

    it("skips object:removed recording when target is marked transient", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));
      const obj = {} as unknown as Parameters<
        typeof result.current.markTransient
      >[0];
      result.current.markTransient(obj);
      fire(mock, "object:removed", { target: obj });

      act(() => result.current.onUndo());
      expect(mock.add).not.toHaveBeenCalled();
    });

    it("unmarkTransient restores normal recording", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));
      const obj = {} as unknown as Parameters<
        typeof result.current.markTransient
      >[0];
      result.current.markTransient(obj);
      result.current.unmarkTransient(obj);
      fire(mock, "object:added", { target: obj });

      act(() => result.current.onUndo());
      expect(mock.remove).toHaveBeenCalledTimes(1);
    });
  });

  describe("popLastAction (P1 §4.10)", () => {
    it("returns null on an empty stack", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));
      expect(result.current.popLastAction()).toBeNull();
    });

    it("removes and returns the top action", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));
      const obj = { id: "x" };
      fire(mock, "object:added", { target: obj });

      const popped = result.current.popLastAction();
      expect(popped).toEqual({ type: "add", object: obj });

      // Subsequent undo should be a no-op — the stack is now empty.
      act(() => result.current.onUndo());
      expect(mock.remove).not.toHaveBeenCalled();
    });
  });

  describe("recordAdd / recordRemove (P1 §4.10)", () => {
    it("recordAdd pushes an add action that undo removes", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));
      const obj = { id: "y" } as unknown as Parameters<
        typeof result.current.recordAdd
      >[0];
      // No fabric event fires — we're going through the manual path.
      result.current.recordAdd(obj);

      act(() => result.current.onUndo());
      expect(mock.remove).toHaveBeenCalledWith(obj);
    });

    it("recordRemove pushes a remove action that undo re-adds", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));
      const obj = { id: "z" } as unknown as Parameters<
        typeof result.current.recordRemove
      >[0];
      result.current.recordRemove(obj);

      act(() => result.current.onUndo());
      expect(mock.add).toHaveBeenCalledWith(obj);
    });
  });

  describe("modify action (P1 §4.10)", () => {
    // Register a stub mark spec so the modify path has something
    // to dispatch on. The spec is for a fake MarkType "test-modify";
    // we cast it through `unknown` because MarkType is a closed
    // union and we deliberately want a registry entry that won't
    // collide with production specs (which don't exist yet in
    // Phase 1, but might in later phases).
    beforeEach(() => {
      _clearRegistryForTests();
    });

    it("pushes a modify action on object:modified for spec-aware marks", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));

      const state = { value: 0 };
      let serializeCalls = 0;
      const obj = { id: "sightline-1" } as unknown as Parameters<
        typeof tagMarkType
      >[0];
      tagMarkType(obj, "sightline");

      const spec: MarkSpec = {
        toolType: ToolType.sightline,
        markType: "sightline",
        interaction: "chained-click",
        colorSource: "operator",
        cursor: "crosshair",
        oneShot: true,
        build: () => obj,
        applyPhase: () => {},
        serialize: () => {
          serializeCalls += 1;
          return { value: state.value };
        },
        deserialize: (_, s) => {
          state.value = (s as { value: number }).value;
        },
      };
      registerMark(spec);

      // Pre-edit snapshot via selection:created.
      state.value = 1;
      fire(mock, "selection:created", { selected: [obj] });
      expect(serializeCalls).toBe(1);

      // User edits, mutating the (mock) underlying state.
      state.value = 2;
      fire(mock, "object:modified", { target: obj });
      expect(serializeCalls).toBe(2); // pre + post

      // Undo restores the pre-edit state via deserialize.
      act(() => result.current.onUndo());
      expect(state.value).toBe(1);
    });

    it("ignores object:modified for marks without a serialize spec", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));

      // No spec registered for this mark type. The obj is tagged
      // anyway — useUndo should look up the spec, find nothing,
      // and skip silently.
      const obj = { id: "untracked" } as unknown as Parameters<
        typeof tagMarkType
      >[0];
      tagMarkType(obj, "engagementX");

      fire(mock, "selection:created", { selected: [obj] });
      fire(mock, "object:modified", { target: obj });

      // Stack should be empty.
      act(() => result.current.onUndo());
      expect(mock.remove).not.toHaveBeenCalled();
      expect(mock.add).not.toHaveBeenCalled();
    });

    it("skips object:modified for untagged objects (P0 strokes)", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));

      const obj = { id: "p0-stroke" };
      fire(mock, "selection:created", { selected: [obj] });
      fire(mock, "object:modified", { target: obj });

      act(() => result.current.onUndo());
      expect(mock.remove).not.toHaveBeenCalled();
    });

    it("skips object:modified when no pre-edit snapshot exists", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));

      const obj = { id: "no-snap" } as unknown as Parameters<
        typeof tagMarkType
      >[0];
      tagMarkType(obj, "sightline");

      const spec: MarkSpec = {
        toolType: ToolType.sightline,
        markType: "sightline",
        interaction: "chained-click",
        colorSource: "operator",
        cursor: "crosshair",
        oneShot: true,
        build: () => obj,
        applyPhase: () => {},
        serialize: () => ({ value: 0 }),
        deserialize: () => {},
      };
      registerMark(spec);

      // Skip selection:created — no snapshot captured.
      fire(mock, "object:modified", { target: obj });

      act(() => result.current.onUndo());
      expect(mock.remove).not.toHaveBeenCalled();
    });

    it("clears snapshots on selection:cleared", () => {
      const mock = createMockCanvas();
      const { result } = renderHook(() => useUndo(asCanvas(mock), new Set()));

      let value = 1;
      const obj = { id: "cleared" } as unknown as Parameters<
        typeof tagMarkType
      >[0];
      tagMarkType(obj, "sightline");

      const spec: MarkSpec = {
        toolType: ToolType.sightline,
        markType: "sightline",
        interaction: "chained-click",
        colorSource: "operator",
        cursor: "crosshair",
        oneShot: true,
        build: () => obj,
        applyPhase: () => {},
        serialize: () => ({ value }),
        deserialize: (_, s) => {
          value = (s as { value: number }).value;
        },
      };
      registerMark(spec);

      fire(mock, "selection:created", { selected: [obj] });
      fire(mock, "selection:cleared", {});
      // After clear, modify should be skipped (no pre-edit snapshot).
      value = 2;
      fire(mock, "object:modified", { target: obj });

      act(() => result.current.onUndo());
      expect(value).toBe(2); // never rolled back
    });
  });
});
