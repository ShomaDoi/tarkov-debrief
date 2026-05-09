import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useZoom } from "./zoom";
import { asCanvas, createMockCanvas, fire } from "../test/mockCanvas";

describe("useZoom", () => {
  it("does not crash with null canvas", () => {
    expect(() => renderHook(() => useZoom(null, 5))).not.toThrow();
  });

  it("registers a wheel listener and zooms toward the cursor", () => {
    const mock = createMockCanvas();
    renderHook(() => useZoom(asCanvas(mock), 5));
    expect(mock.on).toHaveBeenCalledWith("mouse:wheel", expect.any(Function));

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    fire(mock, "mouse:wheel", {
      e: {
        deltaY: -100,
        offsetX: 30,
        offsetY: 40,
        preventDefault,
        stopPropagation,
      },
    });

    expect(mock.zoomToPoint).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it("scales the brush width inversely with zoom", () => {
    const mock = createMockCanvas();
    let currentZoom = 1;
    mock.getZoom.mockImplementation(() => currentZoom);
    mock.zoomToPoint.mockImplementation((_p: unknown, z: number) => {
      currentZoom = z;
    });

    renderHook(() => useZoom(asCanvas(mock), 10));
    fire(mock, "mouse:wheel", {
      e: {
        deltaY: -100,
        offsetX: 0,
        offsetY: 0,
        preventDefault: () => {},
        stopPropagation: () => {},
      },
    });

    expect(mock.freeDrawingBrush.width).toBeCloseTo(10 / currentZoom, 5);
  });
});
