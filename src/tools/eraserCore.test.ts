import { describe, it, expect } from "vitest";
import { createEraserSession, eraseTargetIfAllowed } from "./eraserCore";
import { asCanvas, createMockCanvas, fire } from "../test/mockCanvas";
import type * as fabric from "fabric";

describe("eraseTargetIfAllowed", () => {
  it("removes a non-protected target", () => {
    const mock = createMockCanvas();
    const target = { foo: "bar" } as unknown as fabric.FabricObject;
    eraseTargetIfAllowed(asCanvas(mock), target, new Set());
    expect(mock.remove).toHaveBeenCalledWith(target);
  });

  it("no-ops on undefined target", () => {
    const mock = createMockCanvas();
    eraseTargetIfAllowed(asCanvas(mock), undefined, new Set());
    expect(mock.remove).not.toHaveBeenCalled();
  });

  // The unerasable check is exercised end-to-end through useEraser
  // tests; we can't easily construct a `fabric.FabricImage` instance
  // here without a real DOM canvas, and instanceof guards against
  // duck-typed mocks.
});

describe("EraserSession lifecycle", () => {
  it("attaches mouse:move on start, detaches on stop", () => {
    const mock = createMockCanvas();
    const session = createEraserSession(asCanvas(mock), new Set());
    expect(mock.on).not.toHaveBeenCalled();

    session.start();
    expect(mock.on).toHaveBeenCalledWith("mouse:move", expect.any(Function));
    expect(session.isActive()).toBe(true);

    session.stop();
    expect(mock.off).toHaveBeenCalledWith("mouse:move", expect.any(Function));
    expect(session.isActive()).toBe(false);
  });

  it("start/stop are idempotent", () => {
    const mock = createMockCanvas();
    const session = createEraserSession(asCanvas(mock), new Set());

    session.start();
    session.start();
    expect(mock.on).toHaveBeenCalledTimes(1);

    session.stop();
    session.stop();
    expect(mock.off).toHaveBeenCalledTimes(1);
  });

  it("erases targets during a session, doesn't between sessions", () => {
    const mock = createMockCanvas();
    const session = createEraserSession(asCanvas(mock), new Set());
    const target = { foo: "bar" } as unknown as fabric.FabricObject;

    // Outside a session, mouse:move shouldn't erase even if a
    // target is present — but no handler is registered yet, so
    // this just confirms the wiring.
    expect(mock.remove).not.toHaveBeenCalled();

    session.start();
    fire(mock, "mouse:move", { target });
    expect(mock.remove).toHaveBeenCalledWith(target);

    session.stop();
    mock.remove.mockClear();
    fire(mock, "mouse:move", { target });
    expect(mock.remove).not.toHaveBeenCalled();
  });
});
