import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { usePan } from "./pan";
import { ToolType, type Tool } from "./tool";
import { asCanvas, createMockCanvas } from "../test/mockCanvas";

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
});
