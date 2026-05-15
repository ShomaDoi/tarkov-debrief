// Replay timeline projection + hook.
//
// The replay timeline is a *projection* over the marks on the
// canvas, not a stored sequence. Given (marks in __seq order,
// animation config, speed multiplier), it computes a slot list
// + total duration that the Scrubber and the render-composition
// effect (App.tsx) consume to drive playback.
//
// Why synthetic timing rather than wall-clock createdAt:
// design_p2_slice.md §3.2. tl;dr: a literal recording has dead air
// and uneven within-stroke pacing, which fights the goal of using
// this tool to *communicate* a debrief.
//
// Slot model:
//   - Each tagged mark occupies a [logicalSlotStart, logicalSlotEnd)
//     window in LOGICAL time.
//   - logicalAnimDuration: how long this mark's intrinsic animation
//     takes (pathReveal for pencil/arrow, coneSweep for cone, 0
//     for instant-appear marks).
//   - Consecutive marks are separated by INTER_MARK_GAP_MS (the
//     "fake gap" that makes playback feel polished even when the
//     user paused mid-session). No trailing gap — the total ends
//     at the last slot's end.
//   - Speed multiplier is applied at the playback-time ↔ logical-
//     time mapping, NOT baked into the projection. Changing speed
//     does not recompute slots — the same logical structure just
//     plays back faster/slower. See §5.6.
//
// Hook lifecycle:
//   - useTimeline subscribes to object:added / object:removed on
//     the canvas (the same hooks useUndo and the chain-anchor
//     recomputer in App.tsx use). The subscriber rebuilds slots
//     from canvas truth — no internal mirror of the marks.
//   - "Auto-track live": if playhead was at live position before
//     a rebuild, snap to the new live position. Drawing a mark in
//     live mode keeps the scrubber idle on the right.
//   - On map switch the canvas gets cleared (many object:removed
//     events from the previous map's marks); slots collapse to []
//     and playhead snaps to 0. No special map-switch hook needed.
//
// Design references:
//   - claudedocs/design_p2_slice.md §3.2, §5

import { useCallback, useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import {
  readId,
  readMarkType,
  readSeq,
  type MarkType,
} from "@/tools/metadata";

// ===== Animation configuration =====

/**
 * Tunable constants for the replay projection. Values are starting
 * guesses; per design §12.2 #3–4 they're expected to drift as
 * playback feel is tuned. Adjust here, not at call sites.
 */
export interface AnimationConfig {
  /** Pencil / arrow path reveal speed in canvas-units per second. */
  drawSpeedPxPerSec: number;
  /** Cone angular-sweep duration in ms. */
  coneSweepMs: number;
  /** Pause between consecutive marks in ms. The whole point of
   *  synthetic timing: cap pauses so dead-air doesn't drag the
   *  playback. */
  interMarkGapMs: number;
}

export const ANIMATION_CONFIG: AnimationConfig = {
  drawSpeedPxPerSec: 2400,
  coneSweepMs: 250,
  interMarkGapMs: 250,
};

// ===== Slot model =====

export interface Slot {
  /** Mark's __id. Stable across rebuilds. */
  id: string;
  /** Mark's __seq. Determines order; ties broken by stable sort. */
  seq: number;
  /** Live fabric reference so the visibility effect can call
   *  applyAnimation without re-fetching. The slot list is rebuilt
   *  on every object:added/removed so this never goes stale. */
  obj: fabric.FabricObject;
  /** Logical time ms at which this mark starts animating. */
  logicalSlotStart: number;
  /** Logical-time animation duration. 0 for instant-appear marks
   *  (engagement X, sound ping, position dot, text, sightline as
   *  of P2 — sightline animator deferred per §6.6). */
  logicalAnimDuration: number;
}

export interface Projection {
  slots: Slot[];
  /** Logical-time duration of the entire timeline; equals the last
   *  slot's logicalSlotStart + logicalAnimDuration, or 0 if empty. */
  logicalTotalDuration: number;
}

// ===== Path arc-length =====
//
// Pencil and arrow get a draw duration proportional to their path
// length, so we cache the arc length on the path itself the first
// time we measure it. Cached as __pathArcLength matching the
// __operatorId / __phase / __id custom-property convention.
//
// Linear approximation: each path command's contribution is the
// straight-line distance from the previous endpoint to this
// command's endpoint. The brush emits sub-pixel-spaced Q commands
// (decimate=4 px in App.tsx initializeCanvas), so the error vs.
// true arc length is bounded by that spacing — within the noise
// floor for picking a playback duration. If precision ever
// matters (it shouldn't, but design §12.2 #1 flags it), swap in
// fabric.util.getPathSegmentsInfo or per-segment de Casteljau.

const PATH_ARC_LENGTH_KEY = "__pathArcLength" as const;

interface PathCommandArrayCarrier {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  path?: any[][];
}

function readCachedArcLength(obj: fabric.FabricObject): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (obj as any)[PATH_ARC_LENGTH_KEY];
  return typeof v === "number" ? v : null;
}

function writeCachedArcLength(
  obj: fabric.FabricObject,
  len: number,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (obj as any)[PATH_ARC_LENGTH_KEY] = len;
}

/**
 * Walk a fabric.Path's command array and sum the chord lengths.
 * Exported for tests + the animator (which also needs to find
 * fractional segment boundaries; it can use the cached total to
 * avoid recomputing).
 */
export function computePathArcLength(path: fabric.FabricObject): number {
  const commands = (path as unknown as PathCommandArrayCarrier).path ?? [];
  let total = 0;
  let cx = 0;
  let cy = 0;
  for (const cmd of commands) {
    const op = String(cmd[0]);
    switch (op) {
      case "M":
        cx = Number(cmd[1]);
        cy = Number(cmd[2]);
        break;
      case "L": {
        const nx = Number(cmd[1]);
        const ny = Number(cmd[2]);
        total += Math.hypot(nx - cx, ny - cy);
        cx = nx;
        cy = ny;
        break;
      }
      case "Q": {
        // Quadratic Bezier from (cx,cy) via (cmd[1],cmd[2]) to
        // (cmd[3],cmd[4]). Chord ≈ arc length for short segments.
        const ex = Number(cmd[3]);
        const ey = Number(cmd[4]);
        total += Math.hypot(ex - cx, ey - cy);
        cx = ex;
        cy = ey;
        break;
      }
      case "C": {
        // Cubic Bezier. Same chord approximation.
        const ex = Number(cmd[5]);
        const ey = Number(cmd[6]);
        total += Math.hypot(ex - cx, ey - cy);
        cx = ex;
        cy = ey;
        break;
      }
      case "Z":
        // Close-path. fabric brush doesn't emit Z for freehand
        // paths but it's cheap to be defensive.
        break;
    }
  }
  return total;
}

/**
 * Find the "body" path inside an arrow group, or return the path
 * itself for plain pencil strokes. Arrow groups are built by
 * tools/arrow.ts's appendArrowhead as `new fabric.Group([path,
 * arrowhead], ...)` — the body path is the first child. Pencil
 * strokes are bare fabric.Path objects.
 *
 * Exported so animators.ts and tests can share the same lookup.
 */
export function getBodyPath(
  obj: fabric.FabricObject,
): fabric.FabricObject | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (obj as any).type as string | undefined;
  if (t === "path") return obj;
  if (t === "group") {
    const group = obj as unknown as fabric.Group;
    const children = group.getObjects();
    for (const child of children) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((child as any).type === "path") return child;
    }
  }
  return null;
}

/**
 * Per-mark animation duration in LOGICAL ms. Pure function of the
 * mark's geometry + the config.
 */
export function animDurationFor(
  obj: fabric.FabricObject,
  config: AnimationConfig,
): number {
  const mt = readMarkType(obj);
  switch (mt) {
    case "pencil":
    case "arrow": {
      const body = getBodyPath(obj);
      if (!body) return 0;
      let len = readCachedArcLength(body);
      if (len === null) {
        len = computePathArcLength(body);
        writeCachedArcLength(body, len);
      }
      if (len <= 0) return 0;
      return Math.round((len / config.drawSpeedPxPerSec) * 1000);
    }
    case "cone":
      return config.coneSweepMs;
    default:
      return 0;
  }
}

// ===== Projection =====

/**
 * Pure projection: marks → ordered slot list. Marks without
 * __id/__seq (the loaded map image, legacy strokes from before
 * P2) are filtered out. Sorted by __seq ascending (ties broken
 * by Array.sort stability — JS engines guarantee stable sort
 * since ES2019).
 */
export function projectTimeline(
  marks: fabric.FabricObject[],
  config: AnimationConfig,
): Projection {
  const tagged: { obj: fabric.FabricObject; id: string; seq: number }[] = [];
  for (const obj of marks) {
    const id = readId(obj);
    const seq = readSeq(obj);
    if (id === null || seq === null) continue;
    tagged.push({ obj, id, seq });
  }
  tagged.sort((a, b) => a.seq - b.seq);

  const slots: Slot[] = [];
  let cursor = 0;
  for (const t of tagged) {
    const dur = animDurationFor(t.obj, config);
    slots.push({
      id: t.id,
      seq: t.seq,
      obj: t.obj,
      logicalSlotStart: cursor,
      logicalAnimDuration: dur,
    });
    cursor += dur + config.interMarkGapMs;
  }
  // Total = last slot's end. Trailing gap is discarded so the
  // scrubber's "live" position lines up with the last mark's
  // completion, not a phantom pause beyond it.
  const last = slots.length > 0 ? slots[slots.length - 1] : null;
  const total = last
    ? last.logicalSlotStart + last.logicalAnimDuration
    : 0;
  return { slots, logicalTotalDuration: total };
}

// ===== useTimeline hook =====

export type SpeedMultiplier = 0.5 | 1 | 2;

export interface UseTimelineReturn {
  /** Slot list in seq order. Rebuilt on object:added / removed. */
  slots: Slot[];
  /** Total duration in LOGICAL ms (independent of speed). */
  logicalTotalDuration: number;
  /** Total duration in PLAYBACK ms (logical / speed). */
  playbackTotalDuration: number;
  /** Current playhead position in PLAYBACK ms. */
  playhead: number;
  /** Set playhead (in playback ms); clamps to [0, playbackTotal]. */
  setPlayhead: (ms: number) => void;
  /** True iff playhead is at (or beyond) the live position. */
  isLive: boolean;
  /** True iff RAF advance loop is active. */
  isPlaying: boolean;
  speed: SpeedMultiplier;
  setSpeed: (s: SpeedMultiplier) => void;
  /** If at live: jump to 0 and start playing. Else: resume from
   *  current playhead. */
  play: () => void;
  pause: () => void;
}

export function useTimeline(
  canvas: fabric.Canvas | null,
): UseTimelineReturn {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [logicalTotalDuration, setLogicalTotalDuration] = useState(0);
  const [playhead, setPlayheadState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState<SpeedMultiplier>(1);

  // Ref-mirrors: the RAF tick and the canvas-event rebuild both
  // need to read live state without re-establishing subscriptions
  // on every render. Same pattern documented in
  // src/hooks/useKeyboardShortcuts.ts (bindingsRef) and
  // src/tools/pan.ts (toolRef).
  const playheadRef = useRef<number>(playhead);
  playheadRef.current = playhead;
  const speedRef = useRef<SpeedMultiplier>(speed);
  speedRef.current = speed;
  const totalRef = useRef<number>(logicalTotalDuration);
  totalRef.current = logicalTotalDuration;

  const playbackTotalDuration = logicalTotalDuration / speed;
  const isLive =
    playbackTotalDuration === 0 || playhead >= playbackTotalDuration;

  const setPlayhead = useCallback((ms: number) => {
    const cap = totalRef.current / speedRef.current;
    const clamped = Math.max(0, Math.min(ms, cap));
    setPlayheadState(clamped);
  }, []);

  // Speed change rescales the playhead to preserve relative
  // position. Without this, switching from 1× to 2× while
  // scrubbed mid-timeline would snap to "live" (because the
  // playback cap halved) — surprising. Preserve ratio instead.
  const setSpeed = useCallback((s: SpeedMultiplier) => {
    const prevCap = totalRef.current / speedRef.current;
    const newCap = totalRef.current / s;
    if (prevCap > 0) {
      const ratio = playheadRef.current / prevCap;
      setPlayheadState(ratio * newCap);
    }
    setSpeedState(s);
  }, []);

  const play = useCallback(() => {
    // Per R-F: play-from-live jumps to start.
    const cap = totalRef.current / speedRef.current;
    if (cap > 0 && playheadRef.current >= cap) {
      setPlayheadState(0);
    }
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Canvas subscriber: rebuild slots on every add/remove.
  // Filter is `readId(obj) !== null` — defensive against the
  // loaded map image and any legacy untagged objects. Matches
  // the operator-visibility filter at App.tsx:499–510 in posture.
  useEffect(() => {
    if (!canvas) {
      setSlots([]);
      setLogicalTotalDuration(0);
      setPlayheadState(0);
      return;
    }
    const rebuild = () => {
      const objs = canvas.getObjects().filter((o) => readId(o) !== null);
      const projection = projectTimeline(objs, ANIMATION_CONFIG);
      const wasAtLive =
        totalRef.current === 0 ||
        playheadRef.current >= totalRef.current / speedRef.current;
      setSlots(projection.slots);
      setLogicalTotalDuration(projection.logicalTotalDuration);
      // Update the ref synchronously so the wasAtLive comparison
      // for the NEXT rebuild reads the new total.
      totalRef.current = projection.logicalTotalDuration;
      if (wasAtLive) {
        const newCap = projection.logicalTotalDuration / speedRef.current;
        setPlayheadState(newCap);
      } else {
        // If playhead exceeds the new playback total (a mid-replay
        // undo dropped slots), clamp down. Otherwise leave it.
        const newCap = projection.logicalTotalDuration / speedRef.current;
        if (playheadRef.current > newCap) {
          setPlayheadState(newCap);
        }
      }
    };
    canvas.on("path:created", () => {
      setTimeout(rebuild, 0); // run rebuild on next tick
    });
    canvas.on("object:added", rebuild);
    canvas.on("object:removed", rebuild);
    rebuild();
    return () => {
      canvas.off("object:added", rebuild);
      canvas.off("object:removed", rebuild);
    };
  }, [canvas]);

  // RAF advance loop. Re-installed on isPlaying toggle.
  useEffect(() => {
    if (!isPlaying) return;
    let lastT =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    let rafId = 0;

    const schedule = (cb: FrameRequestCallback) => {
      if (typeof requestAnimationFrame === "function") {
        return requestAnimationFrame(cb);
      }
      // setTimeout fallback for SSR / non-browser test environments.
      // Animation isn't visually meaningful in those contexts, so a
      // 16ms tick is fine.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return setTimeout(() => cb(Date.now()), 16) as any;
    };
    const cancel = (id: number) => {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(id);
      } else {
        clearTimeout(id);
      }
    };

    const tick = (now: number) => {
      const delta = now - lastT;
      lastT = now;
      const cap = totalRef.current / speedRef.current;
      const next = playheadRef.current + delta;
      if (cap <= 0 || next >= cap) {
        // Reached end (or there's nothing to play). Snap to live
        // and pause — auto-revert per R-G.
        setPlayheadState(cap);
        setIsPlaying(false);
        return;
      }
      setPlayheadState(next);
      rafId = schedule(tick);
    };

    rafId = schedule(tick);
    return () => cancel(rafId);
  }, [isPlaying]);

  return {
    slots,
    logicalTotalDuration,
    playbackTotalDuration,
    playhead,
    setPlayhead,
    isLive,
    isPlaying,
    speed,
    setSpeed,
    play,
    pause,
  };
}

// Re-export MarkType for consumers that route on it (animators.ts).
export type { MarkType };
