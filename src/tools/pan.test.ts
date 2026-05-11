import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { usePan } from "./pan";
import { ToolType, type Tool } from "./tool";
import { asCanvas, createMockCanvas, fire } from "../test/mockCanvas";

const baseTool = (type: ToolType): Tool => ({
  active: false,
  type,
  cursor: null,
});

describe("usePan", () => {
  it("does not crash with null canvas", () => {
    expect(() =>
      renderHook(() => usePan(null, vi.fn(), baseTool(ToolType.pencil)))
    ).not.toThrow();
  });

  it("registers mouse:down and mouse:up listeners and removes them on unmount", () => {
    const mock = createMockCanvas();
    const { unmount } = renderHook(() =>
      usePan(asCanvas(mock), vi.fn(), baseTool(ToolType.pencil))
    );

    expect(mock.on).toHaveBeenCalledWith("mouse:down", expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith("mouse:up", expect.any(Function));

    unmount();
    expect(mock.off).toHaveBeenCalledWith("mouse:down", expect.any(Function));
    expect(mock.off).toHaveBeenCalledWith("mouse:up", expect.any(Function));
  });

  it("survives a tool flip without re-registering handlers (regression)", () => {
    // Pan flips the active tool inside its own mouse:down handler. If the
    // useEffect depends on `tool`, the resulting parent re-render tears
    // down the listeners mid-drag and mouse:up never restores the prior
    // tool. This test asserts handlers persist across a tool change.
    const mock = createMockCanvas();
    const { rerender } = renderHook(
      ({ tool }: { tool: Tool }) =>
        usePan(asCanvas(mock), vi.fn(), tool),
      { initialProps: { tool: baseTool(ToolType.pencil) } }
    );

    expect(mock.on).toHaveBeenCalledTimes(2); // initial mount: down + up
    mock.off.mockClear();

    rerender({ tool: baseTool(ToolType.pan) });

    expect(mock.off).not.toHaveBeenCalled();
  });

  it("middle-click drag flips to pan, mouse:up restores the previous tool", () => {
    const mock = createMockCanvas();
    const setTool = vi.fn();
    renderHook(() =>
      usePan(asCanvas(mock), setTool, baseTool(ToolType.pencil))
    );

    // middle-click down
    fire(mock, "mouse:down", {
      e: {
        button: 1,
        clientX: 50,
        clientY: 50,
        preventDefault: () => {},
      },
    });
    expect(setTool).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: ToolType.pan })
    );

    // mouse:up — should restore the prior tool (pencil)
    fire(mock, "mouse:up", {});
    expect(setTool).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: ToolType.pencil })
    );
  });

  it("ignores non-middle-click mouse:down", () => {
    const mock = createMockCanvas();
    const setTool = vi.fn();
    renderHook(() =>
      usePan(asCanvas(mock), setTool, baseTool(ToolType.pencil))
    );

    fire(mock, "mouse:down", {
      e: { button: 0, clientX: 0, clientY: 0, preventDefault: () => {} },
    });
    expect(setTool).not.toHaveBeenCalled();
  });

  describe("path 2 — Space-hold integration (tool.type === pan)", () => {
    // Verifies R14: when the keyboard hook flips tool.type to 'pan',
    // usePan must bind left-button drag handlers and actually pan
    // the viewport. Without this, Space-hold pan would silently no-op.

    it("disables drawing mode while pan is the active tool", () => {
      const mock = createMockCanvas();
      mock.isDrawingMode = true;
      const { rerender } = renderHook(
        ({ tool }: { tool: Tool }) => usePan(asCanvas(mock), vi.fn(), tool),
        { initialProps: { tool: baseTool(ToolType.pencil) } },
      );

      expect(mock.isDrawingMode).toBe(true);
      rerender({ tool: baseTool(ToolType.pan) });
      expect(mock.isDrawingMode).toBe(false);
    });

    it("LEFT-button drag while tool.type === pan moves the viewport", () => {
      const mock = createMockCanvas();
      // Start the viewport at the origin
      mock.viewportTransform = [1, 0, 0, 1, 0, 0];
      renderHook(() =>
        usePan(asCanvas(mock), vi.fn(), baseTool(ToolType.pan)),
      );

      fire(mock, "mouse:down", {
        e: { button: 0, clientX: 100, clientY: 100 },
      });
      fire(mock, "mouse:move", {
        e: { button: 0, clientX: 150, clientY: 120 },
      });
      // viewport should have translated by (50, 20)
      expect(mock.viewportTransform[4]).toBe(50);
      expect(mock.viewportTransform[5]).toBe(20);

      fire(mock, "mouse:up", {});
      // dragging stops — further movement shouldn't translate
      fire(mock, "mouse:move", {
        e: { button: 0, clientX: 300, clientY: 300 },
      });
      expect(mock.viewportTransform[4]).toBe(50);
      expect(mock.viewportTransform[5]).toBe(20);
    });

    it("ignores right-click drag in pan mode (button reservation)", () => {
      const mock = createMockCanvas();
      mock.viewportTransform = [1, 0, 0, 1, 0, 0];
      renderHook(() =>
        usePan(asCanvas(mock), vi.fn(), baseTool(ToolType.pan)),
      );
      fire(mock, "mouse:down", {
        e: { button: 2, clientX: 100, clientY: 100 },
      });
      fire(mock, "mouse:move", {
        e: { button: 2, clientX: 200, clientY: 200 },
      });
      // No translation should have happened — right-button is
      // reserved for the eraser quasi-mode.
      expect(mock.viewportTransform[4]).toBe(0);
      expect(mock.viewportTransform[5]).toBe(0);
    });
  });
});
