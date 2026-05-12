// Integration test for the chain-anchor recompute loop: each arrow
// commit tags __arrowTip on its group; an App-level subscriber to
// object:added / object:removed walks canvas objects in reverse and
// updates lastArrowTipRef. Undo of an arrow removes the group,
// fires object:removed, and the recomputer correctly picks the
// next-most-recent arrow's tip (or null if there isn't one).
//
// This file unit-tests the *recomputer* itself in isolation —
// App.tsx's effect builds the same machine. Lives in tools/ because
// it exercises arrow.ts + metadata.ts together.

import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import * as fabric from "fabric";
import { asCanvas, createMockCanvas, fire } from "../test/mockCanvas";
import { readMarkType, readArrowTip, tagMarkType, tagArrowTip } from "./metadata";
import { useEffect, useRef } from "react";

// A trimmed copy of the App.tsx recomputer effect. Keeping the
// logic mirrored here (rather than exporting it from App.tsx)
// keeps the App-level wiring lean.
function useRecomputeLastArrowTip(canvas: fabric.Canvas | null) {
  const lastArrowTipRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!canvas) return;
    const recompute = () => {
      const objs = canvas.getObjects();
      for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i];
        if (o === undefined) continue;
        if (readMarkType(o) !== "arrow") continue;
        const tip = readArrowTip(o);
        if (tip !== null) {
          lastArrowTipRef.current = tip;
          return;
        }
      }
      lastArrowTipRef.current = null;
    };
    canvas.on("object:added", recompute);
    canvas.on("object:removed", recompute);
    recompute();
    return () => {
      canvas.off("object:added", recompute);
      canvas.off("object:removed", recompute);
    };
  }, [canvas]);
  return lastArrowTipRef;
}

/** Build a duck-typed "arrow group" with the metadata our recomputer
 *  cares about. We don't need a real fabric.Group because the
 *  recomputer never touches Group-specific APIs — just markType +
 *  arrowTip metadata. */
function fakeArrow(tip: { x: number; y: number }): fabric.FabricObject {
  const obj = {} as unknown as fabric.FabricObject;
  tagMarkType(obj, "arrow");
  tagArrowTip(obj, tip);
  return obj;
}

describe("lastArrowTipRef recompute", () => {
  it("returns null when canvas is empty", () => {
    const mock = createMockCanvas();
    const { result } = renderHook(() => useRecomputeLastArrowTip(asCanvas(mock)));
    expect(result.current.current).toBeNull();
  });

  it("picks the most-recently-added arrow's tip on add", () => {
    const mock = createMockCanvas();
    const a1 = fakeArrow({ x: 100, y: 100 });
    const a2 = fakeArrow({ x: 200, y: 200 });
    let objects: fabric.FabricObject[] = [];
    mock.getObjects.mockImplementation(() => objects);

    const { result } = renderHook(() => useRecomputeLastArrowTip(asCanvas(mock)));
    objects = [a1];
    fire(mock, "object:added", { target: a1 });
    expect(result.current.current).toEqual({ x: 100, y: 100 });

    objects = [a1, a2];
    fire(mock, "object:added", { target: a2 });
    expect(result.current.current).toEqual({ x: 200, y: 200 });
  });

  it("on undo (object:removed of the latest arrow) falls back to the previous arrow's tip", () => {
    // This is the user's exact complaint: undo of arrow2 should
    // reset lastArrowTipRef to arrow1's tip, so the next sightline
    // anchors at arrow1's terminal.
    const mock = createMockCanvas();
    const a1 = fakeArrow({ x: 100, y: 100 });
    const a2 = fakeArrow({ x: 200, y: 200 });
    let objects: fabric.FabricObject[] = [a1, a2];
    mock.getObjects.mockImplementation(() => objects);

    const { result } = renderHook(() => useRecomputeLastArrowTip(asCanvas(mock)));
    // Initial recompute (run-once on mount) picks the latest.
    expect(result.current.current).toEqual({ x: 200, y: 200 });

    // Undo removes a2.
    objects = [a1];
    fire(mock, "object:removed", { target: a2 });
    expect(result.current.current).toEqual({ x: 100, y: 100 });

    // Undo again removes a1 → no arrows left → null.
    objects = [];
    fire(mock, "object:removed", { target: a1 });
    expect(result.current.current).toBeNull();
  });

  it("ignores non-arrow objects on the canvas (markers, sightlines)", () => {
    const mock = createMockCanvas();
    const arrow = fakeArrow({ x: 50, y: 50 });
    const sightline = (() => {
      const o = {} as unknown as fabric.FabricObject;
      tagMarkType(o, "sightline");
      return o;
    })();
    const markerImg = {} as unknown as fabric.FabricObject; // untagged
    const objects: fabric.FabricObject[] = [markerImg, arrow, sightline];
    mock.getObjects.mockImplementation(() => objects);

    const { result } = renderHook(() => useRecomputeLastArrowTip(asCanvas(mock)));
    fire(mock, "object:added", { target: sightline });
    // The most-recent ARROW (not sightline / not untagged) is at
    // index 1. Recomputer walks in reverse, skips index 2
    // (sightline), finds arrow at index 1.
    expect(result.current.current).toEqual({ x: 50, y: 50 });
  });

  it("ignores arrows that somehow lack __arrowTip metadata (defensive)", () => {
    const mock = createMockCanvas();
    const goodArrow = fakeArrow({ x: 10, y: 10 });
    const untaggedArrow = (() => {
      const o = {} as unknown as fabric.FabricObject;
      tagMarkType(o, "arrow"); // marked as arrow…
      // …but no tagArrowTip — readArrowTip returns null.
      return o;
    })();
    const objects: fabric.FabricObject[] = [goodArrow, untaggedArrow];
    mock.getObjects.mockImplementation(() => objects);
    const { result } = renderHook(() => useRecomputeLastArrowTip(asCanvas(mock)));
    fire(mock, "object:added", { target: untaggedArrow });
    // The reverse walk hits the untagged arrow first, sees null
    // tip, continues, finds goodArrow.
    expect(result.current.current).toEqual({ x: 10, y: 10 });
  });
});
