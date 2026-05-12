import { describe, it, expect, beforeEach } from "vitest";
import * as fabric from "fabric";
import { registerControls } from "./controls";
import {
  registerMark,
  _clearRegistryForTests,
} from "./registry";
import { SIGHTLINE_SPEC } from "./sightline";
import {
  CONE_SPEC,
  writeConeParams,
  readConeParams,
} from "./cone";
import { ENGAGEMENT_X_SPEC } from "./engagementX";
import { tagMarkType } from "../metadata";
import { asCanvas, createMockCanvas, fire } from "../../test/mockCanvas";

beforeEach(() => {
  _clearRegistryForTests();
});

// ---- Public surface (registerControls subscribes/teardown) -------

describe("registerControls", () => {
  it("subscribes to selection:created and selection:updated", () => {
    const mock = createMockCanvas();
    registerControls(asCanvas(mock));
    expect(mock.on).toHaveBeenCalledWith(
      "selection:created",
      expect.any(Function),
    );
    expect(mock.on).toHaveBeenCalledWith(
      "selection:updated",
      expect.any(Function),
    );
  });

  it("cleanup unsubscribes both handlers", () => {
    const mock = createMockCanvas();
    const cleanup = registerControls(asCanvas(mock));
    cleanup();
    expect(mock.off).toHaveBeenCalledWith(
      "selection:created",
      expect.any(Function),
    );
    expect(mock.off).toHaveBeenCalledWith(
      "selection:updated",
      expect.any(Function),
    );
  });

  it("no-ops on a null canvas", () => {
    const cleanup = registerControls(null);
    expect(() => cleanup()).not.toThrow();
  });
});

// ---- Installation behavior on selection --------------------------

describe("registerControls — install on selection", () => {
  it("installs the sightline spec's controls on a sightline selection", () => {
    registerMark(SIGHTLINE_SPEC);
    const mock = createMockCanvas();
    registerControls(asCanvas(mock));

    const line = new fabric.Line([10, 10, 100, 100], { stroke: "#000" });
    tagMarkType(line, "sightline");
    fire(mock, "selection:created", { selected: [line] });

    // Sightline declares one control: `endpoint`.
    expect(Object.keys(line.controls ?? {})).toContain("endpoint");
    expect(line.hasControls).toBe(true);
  });

  it("installs the cone spec's three controls (origin, apex, spread)", () => {
    registerMark(CONE_SPEC);
    const mock = createMockCanvas();
    registerControls(asCanvas(mock));

    const path = new fabric.Path("M 0 0 L 100 0 A 100 100 0 0 1 0 100 Z", {
      fill: "#0693E3",
      stroke: "#0693E3",
    });
    tagMarkType(path, "cone");
    writeConeParams(path, {
      origin: { x: 50, y: 50 },
      startAngle: 0,
      sweep: Math.PI / 2,
      range: 100,
    });
    fire(mock, "selection:created", { selected: [path] });

    const ctrlNames = Object.keys(path.controls ?? {});
    expect(ctrlNames).toContain("origin");
    expect(ctrlNames).toContain("apex");
    expect(ctrlNames).toContain("spread");
    expect(path.hasControls).toBe(true);
  });

  it("does NOT install controls on point marks (engagement X opts out)", () => {
    registerMark(ENGAGEMENT_X_SPEC);
    const mock = createMockCanvas();
    registerControls(asCanvas(mock));

    // ENGAGEMENT_X_SPEC has no buildControls — engagement X marks
    // get only the default fabric move-by-body.
    const xGroup = new fabric.Group([], {});
    tagMarkType(xGroup, "engagementX");
    const controlsBefore = xGroup.controls;
    fire(mock, "selection:created", { selected: [xGroup] });
    expect(xGroup.controls).toBe(controlsBefore);
  });

  it("skips untagged objects (legacy P0 strokes, markers)", () => {
    registerMark(SIGHTLINE_SPEC);
    const mock = createMockCanvas();
    registerControls(asCanvas(mock));

    const untagged = new fabric.Line([0, 0, 50, 50]);
    const controlsBefore = untagged.controls;
    fire(mock, "selection:created", { selected: [untagged] });
    expect(untagged.controls).toBe(controlsBefore);
  });

  it("also installs on selection:updated (e.g. shift-click add to multi-select)", () => {
    registerMark(SIGHTLINE_SPEC);
    const mock = createMockCanvas();
    registerControls(asCanvas(mock));

    const line = new fabric.Line([10, 10, 100, 100]);
    tagMarkType(line, "sightline");
    fire(mock, "selection:updated", { selected: [line] });
    expect(Object.keys(line.controls ?? {})).toContain("endpoint");
  });
});

// ---- Sightline endpoint control actionHandler ---------------------

describe("sightline endpoint control", () => {
  it("dragging without modifier snaps the endpoint to a 15° increment", () => {
    const line = new fabric.Line([0, 0, 100, 0], { stroke: "#000" });
    tagMarkType(line, "sightline");
    const controls = SIGHTLINE_SPEC.buildControls!(line);
    const endpoint = controls.endpoint!;

    // Drag to (100, 17): raw angle atan2(17,100) ≈ 9.65°, snaps to
    // 15° (the nearest 15° multiple). Range = √(100²+17²) ≈ 101.43.
    // End = origin + range * (cos 15°, sin 15°) ≈ (97.98, 26.26).
    const acted = endpoint.actionHandler!(
      new MouseEvent("mousemove"),
      {} as never,
      100,
      17,
    );
    expect(acted).toBe(true);
    const range = Math.hypot(100, 17);
    const θ = Math.PI / 12; // 15°
    expect(line.x2).toBeCloseTo(range * Math.cos(θ), 6);
    expect(line.y2).toBeCloseTo(range * Math.sin(θ), 6);
  });

  it("Shift-held drag commits the raw cursor position (no snap)", () => {
    const line = new fabric.Line([0, 0, 100, 0]);
    tagMarkType(line, "sightline");
    const controls = SIGHTLINE_SPEC.buildControls!(line);
    const endpoint = controls.endpoint!;

    endpoint.actionHandler!(
      new MouseEvent("mousemove", { shiftKey: true }),
      {} as never,
      150,
      75,
    );
    expect(line.x2).toBe(150);
    expect(line.y2).toBe(75);
  });

  it("positionHandler reports the line's cursor-side endpoint in scene coords", () => {
    const line = new fabric.Line([10, 20, 80, 90]);
    tagMarkType(line, "sightline");
    const controls = SIGHTLINE_SPEC.buildControls!(line);
    const endpoint = controls.endpoint!;
    const pt = endpoint.positionHandler!(
      {} as never,
      {} as never,
      line as unknown as fabric.FabricObject,
      endpoint,
    );
    expect(pt.x).toBe(80);
    expect(pt.y).toBe(90);
  });
});

// ---- Cone origin / apex / spread actionHandlers ------------------

describe("cone controls", () => {
  function makeCone() {
    const path = new fabric.Path("M 0 0", { fill: "#0693E3", stroke: "#0693E3" });
    tagMarkType(path, "cone");
    writeConeParams(path, {
      origin: { x: 100, y: 100 },
      startAngle: 0,
      sweep: Math.PI / 2,
      range: 50,
    });
    return path;
  }

  it("origin actionHandler translates origin while preserving startAngle/sweep/range", () => {
    const path = makeCone();
    const controls = CONE_SPEC.buildControls!(path);
    const acted = controls.origin!.actionHandler!(
      new MouseEvent("mousemove"),
      {} as never,
      200,
      150,
    );
    expect(acted).toBe(true);
    const params = readConeParams(path)!;
    expect(params.origin).toEqual({ x: 200, y: 150 });
    expect(params.startAngle).toBeCloseTo(0, 9);
    expect(params.sweep).toBeCloseTo(Math.PI / 2, 9);
    expect(params.range).toBeCloseTo(50, 9);
  });

  it("apex actionHandler updates bisector angle + range; preserves sweep magnitude AND sign", () => {
    const path = makeCone();
    // Initial bisector angle θ_b = startAngle + sweep/2 = π/4
    // (i.e., +X, +Y diagonal). Apex point = origin + 50*(cos π/4,
    // sin π/4) ≈ (100 + 35.36, 100 + 35.36).
    // Drag apex straight up to (100, 30): new vector (0, -70), so
    // new θ_b = atan2(-70, 0) = -π/2 (straight up in math, but
    // since canvas Y is positive-down, this corresponds to
    // straight up on screen).
    const controls = CONE_SPEC.buildControls!(path);
    const acted = controls.apex!.actionHandler!(
      new MouseEvent("mousemove"),
      {} as never,
      100,
      30,
    );
    expect(acted).toBe(true);
    const params = readConeParams(path)!;
    // sweep unchanged.
    expect(params.sweep).toBeCloseTo(Math.PI / 2, 9);
    // range = 70.
    expect(params.range).toBeCloseTo(70, 9);
    // new bisector = -π/2; startAngle = bisector - sweep/2 = -π/2 - π/4 = -3π/4.
    expect(params.startAngle).toBeCloseTo(-(3 * Math.PI) / 4, 9);
  });

  it("apex actionHandler preserves sweep SIGN (negative sweep stays negative)", () => {
    const path = new fabric.Path("M 0 0");
    tagMarkType(path, "cone");
    writeConeParams(path, {
      origin: { x: 0, y: 0 },
      startAngle: Math.PI / 4,
      sweep: -Math.PI / 2, // negative — drag direction was CW
      range: 100,
    });

    const controls = CONE_SPEC.buildControls!(path);
    controls.apex!.actionHandler!(
      new MouseEvent("mousemove"),
      {} as never,
      100,
      0,
    );
    const params = readConeParams(path)!;
    expect(params.sweep).toBeCloseTo(-Math.PI / 2, 9);
  });

  it("spread actionHandler widens/narrows around bisector, preserving direction", () => {
    const path = makeCone();
    // Initial: startAngle 0, sweep π/2, range 50. θ_b = π/4.
    // First edge endpoint = origin + 50*(cos 0, sin 0) = (150, 100).
    // Drag spread to a point that maps to first-edge-angle 0 — no
    // change. Then drag it to (100, 150) (= origin + 50*(0,1)),
    // which means new first edge angle = π/2. New half-sweep = θ_b -
    // newθ1 = π/4 - π/2 = -π/4, so new sweep = 2 * -π/4 = -π/2,
    // and new startAngle = θ_b - sweep/2 = π/4 + π/4 = π/2.
    const controls = CONE_SPEC.buildControls!(path);
    controls.spread!.actionHandler!(
      new MouseEvent("mousemove"),
      {} as never,
      100,
      150,
    );
    const params = readConeParams(path)!;
    // Bisector preserved.
    expect(params.startAngle + params.sweep / 2).toBeCloseTo(
      Math.PI / 4,
      9,
    );
    expect(Math.abs(params.sweep)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("origin actionHandler updates positionHandler output", () => {
    const path = makeCone();
    const controls = CONE_SPEC.buildControls!(path);
    controls.origin!.actionHandler!(
      new MouseEvent("mousemove"),
      {} as never,
      200,
      200,
    );
    const pt = controls.origin!.positionHandler!(
      {} as never,
      {} as never,
      path as unknown as fabric.FabricObject,
      controls.origin!,
    );
    expect(pt.x).toBe(200);
    expect(pt.y).toBe(200);
  });
});
