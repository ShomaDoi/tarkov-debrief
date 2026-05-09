import { vi } from "vitest";
import type * as fabric from "fabric";

type Handler = (e: unknown) => void;

export interface MockCanvas {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  getScenePoint: ReturnType<typeof vi.fn>;
  requestRenderAll: ReturnType<typeof vi.fn>;
  getZoom: ReturnType<typeof vi.fn>;
  zoomToPoint: ReturnType<typeof vi.fn>;
  freeDrawingBrush: { color: string; width: number };
  isDrawingMode: boolean;
  defaultCursor: string;
  hoverCursor: string;
  selection: boolean;
  perPixelTargetFind: boolean;
  viewportTransform: number[];
  _handlers: Map<string, Set<Handler>>;
  [key: string]: unknown;
}

export function createMockCanvas(): MockCanvas {
  const handlers = new Map<string, Set<Handler>>();
  return {
    _handlers: handlers,
    on: vi.fn((event: string, fn: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    }),
    off: vi.fn((event: string, fn: Handler) => {
      handlers.get(event)?.delete(fn);
    }),
    add: vi.fn(),
    remove: vi.fn(),
    getScenePoint: vi.fn(() => ({ x: 10, y: 20 })),
    requestRenderAll: vi.fn(),
    getZoom: vi.fn(() => 1),
    zoomToPoint: vi.fn(),
    freeDrawingBrush: { color: "#000", width: 5 },
    isDrawingMode: true,
    defaultCursor: "auto",
    hoverCursor: "auto",
    selection: false,
    perPixelTargetFind: true,
    viewportTransform: [1, 0, 0, 1, 0, 0],
  };
}

export function fire(canvas: MockCanvas, event: string, payload: unknown) {
  canvas._handlers.get(event)?.forEach((h) => h(payload));
}

export function asCanvas(mock: MockCanvas): fabric.Canvas {
  return mock as unknown as fabric.Canvas;
}
