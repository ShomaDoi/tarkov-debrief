import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as fabric from "fabric";
import { TwitterPicker } from "react-color";
import { Link, useParams } from "wouter";
import "@/App.css";
import "@/Sidebar.css";

import { maps } from "@/MapSelector";

import githubLogo from "./icons/github.png";
import selectIcon from "./icons/select.svg";
import pencilIcon from "./icons/pencil.svg";
import eraserIcon from "./icons/eraser.svg";
import addMarkerIcon from "./icons/marker.svg";
import saveIcon from "./icons/save.svg";
import undoIcon from "./icons/undo.svg";

import thickPMCMarker from "./icons/pmc-thick.svg";
import mediumPMCMarker from "./icons/pmc-med.svg";
import lightPMCMarker from "./icons/pmc-light.svg";
import scavMarker from "./icons/scav.svg";
import { Tool, ToolType } from "./tools/tool";
import { useSelect } from "./tools/select";
import { usePencil } from "./tools/pencil";
import { useEraser } from "./tools/eraser";
import { useStamp } from "./tools/stamp";
import { useZoom } from "./tools/zoom";
import { usePan } from "./tools/pan";
import { useUndo } from "./tools/undo";
import {
  useKeyboardShortcuts,
  type Binding,
  type SuspensionRef,
} from "./hooks/useKeyboardShortcuts";
import { createEraserSession } from "./tools/eraserCore";
import { dashArrayForZoom } from "./tools/dashCompensation";
import { OutlinedPencilBrush } from "./tools/OutlinedBrush";
import {
  getActiveOperator,
  loadActiveOperatorId,
  loadOperators,
  saveActiveOperatorId,
  saveOperators,
  type Operator,
  type OperatorId,
} from "./state/operators";
import { loadPhase, savePhase, type Phase } from "./state/phase";
import { readOperator } from "./tools/metadata";
import { OperatorChips } from "./components/OperatorChips";
import { PhaseToggle } from "./components/PhaseToggle";
import {
  MarkerRadial,
  type MarkerOption,
} from "./components/MarkerRadial";

const githubUrl = "https://github.com/jrocketfingers/tarkov-debrief";

type Size = { width: number; height: number };

const defaultSize: Size = { width: 300, height: 300 };

function startDownload(url: string, name: string): void {
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const brushWidth = 5;
const PENCIL_COLOR: string = "#f00";

function initializeCanvas() {
  const canvas = new fabric.Canvas("canvas", {
    height: defaultSize.height,
    width: defaultSize.width,
    isDrawingMode: true,
    perPixelTargetFind: true,
    selection: false,
    fireMiddleClick: true,
    fireRightClick: true,
  });

  // OutlinedPencilBrush is a thin two-pass subclass of PencilBrush
  // — see src/tools/OutlinedBrush.ts. It renders a wider solid
  // outline pass underneath each main stroke (both live and
  // finalized), and emits OutlinedPath instances so the finalized
  // strokes keep the same outline behavior. needsFullRender is
  // forced true inside the subclass, which also subsumes the
  // dash-pattern continuity requirement (without full re-render,
  // dashes would discontinue between segments) — so we don't need
  // a separate needsFullRender override here.
  const brush = new OutlinedPencilBrush(canvas);
  brush.color = PENCIL_COLOR;
  brush.width = brushWidth;
  // Override fabric's default decimate (0.4 zoom-adjusted screen px),
  // which is so tight it captures every mouse-jitter point and
  // produces visibly wavy "straight" lines — especially obvious when
  // the path is later viewed at higher zoom than it was drawn at.
  // fabric internally divides this by canvas zoom, so the value is
  // an effective screen-pixel threshold: points closer than ~4 px
  // (post zoom-compensation) are dropped before the path is
  // finalized. See fabric@7.3.1/src/brushes/PencilBrush.ts line
  // 250–251 (decimatePoints) for the math.
  brush.decimate = 4;

  canvas.freeDrawingBrush = brush;

  canvas.setCursor(`url(${pencilIcon})`);

  return canvas;
}

interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
}

function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className="sidebar-section">
      <h1 className="sidebar-section-title">{title}</h1>
      <div className="sidebar-section-content">{children}</div>
    </div>
  );
}

interface Params {
  map: string;
}

function App() {
  const { map } = useParams<Params>();
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>({
    type: ToolType.pencil,
    active: false,
    cursor: null,
  });

  const [color, setColor] = useState<string>(PENCIL_COLOR);
  const [maybeCanvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [sidebar, setSidebar] = useState<boolean>(false);
  // Stable Set of object src URLs the eraser/undo must skip (e.g. the
  // background map image). Owned by App so it survives re-renders, and
  // gets reset on every map switch (PR 4 leak fix).
  const unerasableRef = useRef<Set<string>>(new Set());
  const unerasable = unerasableRef.current;

  // === Operator + phase state (Phase 4 of design_p0_slice.md) ===
  //
  // The roster and active id are mirrored to localStorage on every
  // change. Initial value comes from localStorage on mount (lazy
  // initializer = runs once). Defaults live in src/state/operators.ts.
  //
  // Why operator state lives here and not deeper: pencil + future
  // tools all need to read the active operator's color and id; the
  // chip strip + radial / sidebar all mutate it. App.tsx is the
  // canonical owner per design doc §5.2.
  const [operators, setOperators] = useState<Operator[]>(() =>
    loadOperators(),
  );
  const [activeOperatorId, setActiveOperatorId] = useState<OperatorId | null>(
    () => loadActiveOperatorId(),
  );
  const [phase, setPhase] = useState<Phase>(() => loadPhase());

  // Persist on every change. localStorage writes are synchronous in
  // jsdom and fast in browsers; no debounce needed for the change
  // volumes this UI produces.
  useEffect(() => {
    saveOperators(operators);
  }, [operators]);
  useEffect(() => {
    saveActiveOperatorId(activeOperatorId);
  }, [activeOperatorId]);
  useEffect(() => {
    savePhase(phase);
  }, [phase]);

  const activeOperator = useMemo(
    () => getActiveOperator(operators, activeOperatorId),
    [operators, activeOperatorId],
  );

  const save = () => {
    if (maybeCanvas) {
      const url = maybeCanvas.toDataURL({ multiplier: 3 });
      startDownload(url, "strategy.png");
    }
  };

  const { onChoice: setSelect } = useSelect(maybeCanvas, setTool, tool);

  // usePencil reads operator + phase via ref-mirror — see the
  // pencil.ts comment for why. We pass them through so new strokes
  // get tagged with the currently active operator (or null) and
  // the current phase. The ref-mirror inside usePencil ensures that
  // a switch between operators / phases takes effect on the very
  // next stroke without re-mounting the effect.
  const { onChoice: setPencil, onColorChoice } = usePencil(
    maybeCanvas,
    setTool,
    tool,
    setColor,
    activeOperatorId,
    phase,
  );

  const { onChoice: setEraser } = useEraser(
    maybeCanvas,
    setTool,
    tool,
    unerasable
  );

  // Phase 5 uses the radial-friendly `selectMarker` entry; the
  // legacy DOM-event `onChoice` is still exported from useStamp
  // for ergonomic continuity but no longer rendered from here
  // (the sidebar marker section is gone — see JSX below).
  // Sidebar removal + react-color cleanup is tech debt (§8.4).
  const { selectMarker: setMarkerByUrl } = useStamp(
    maybeCanvas,
    setSidebar,
    tool,
    setTool,
  );

  usePan(maybeCanvas, setTool, tool);

  // FIXME: untie zoom tool from brush
  useZoom(maybeCanvas, brushWidth);

  const { onUndo } = useUndo(maybeCanvas, unerasable);

  // === Brush color follows active operator ===
  //
  // When the active operator changes, update fabric's free-drawing
  // brush color. If no operator is active (null), fall back to
  // PENCIL_COLOR — the legacy red default. This keeps the brush
  // synchronized; usePencil reads activeOperatorId via ref-mirror
  // independently for the metadata tagging.
  useEffect(() => {
    if (!maybeCanvas?.freeDrawingBrush) return;
    maybeCanvas.freeDrawingBrush.color = activeOperator?.color ?? PENCIL_COLOR;
  }, [maybeCanvas, activeOperator?.color]);

  // === Brush strokeDashArray follows phase ===
  //
  // Drives the LIVE drawing preview's dash pattern. When phase is
  // 'plan', the brush's strokeDashArray is set to a zoom-compensated
  // dash so the in-progress stroke shows as dashed; when 'record',
  // it's null (solid). The resulting path inherits the same value
  // automatically via PencilBrush.createPath (see fabric source).
  //
  // Zoom-driven refreshes of the SAME setting also happen in
  // src/tools/zoom.ts (wheel-zoom) and the map-switch effect below
  // (fit-to-viewport) — those keep the live dash visually constant
  // in screen pixels as the user zooms.
  useEffect(() => {
    if (!maybeCanvas?.freeDrawingBrush) return;
    maybeCanvas.freeDrawingBrush.strokeDashArray =
      phase === "plan" ? dashArrayForZoom(maybeCanvas.getZoom()) : null;
  }, [maybeCanvas, phase]);

  // === Operator visibility application ===
  //
  // When an operator is hidden, iterate the canvas's objects and
  // toggle `visible` on any object whose metadata `operatorId`
  // matches. Objects with no operator tag (legacy strokes from
  // before this slice shipped, or strokes drawn with no active
  // operator) stay visible always — the "legacy strokes are
  // everyone's strokes" semantic from §5.6.
  //
  // We re-run on every operators change. That's O(objects) per
  // change, which is fine for the object counts a debrief produces.
  useEffect(() => {
    if (!maybeCanvas) return;
    const hidden = new Set(
      operators.filter((op) => !op.visible).map((op) => op.id),
    );
    for (const obj of maybeCanvas.getObjects()) {
      const opId = readOperator(obj);
      if (opId === null) continue; // untagged objects always visible
      obj.visible = !hidden.has(opId);
    }
    maybeCanvas.requestRenderAll();
  }, [maybeCanvas, operators]);

  // === Marker radial state (Phase 5 of design_p0_slice.md) ===
  //
  // The radial is open when `radialCenter` is non-null. We track
  // the latest cursor position over the canvas so the M-key path
  // can open the radial at the cursor; the toolbar-button path
  // passes "center" to anchor it at canvas center per §7.1.
  //
  // This block is hoisted above the keyboard bindings because one
  // of the bindings (`M`) calls openRadial.
  const [radialCenter, setRadialCenter] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const lastCursorRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    // Stored in a ref because tracking on every mouse move via
    // state would re-render the whole tree.
    const onMove = (e: MouseEvent) => {
      lastCursorRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  type RadialOrigin = "cursor" | "center";
  const computeCanvasCenter = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect)
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };
  const openRadial = useCallback((origin: RadialOrigin) => {
    if (origin === "center") {
      setRadialCenter(computeCanvasCenter());
      return;
    }
    setRadialCenter(lastCursorRef.current ?? computeCanvasCenter());
  }, []);
  const closeRadial = useCallback(() => setRadialCenter(null), []);

  const radialSlots = useMemo<(MarkerOption | null)[]>(
    () => [
      // First four positions: existing markers. Per §7.2 we cluster
      // them so future vocabulary slots (which fill the null
      // positions) can be added without rearranging.
      { url: thickPMCMarker, label: "thick PMC" },
      { url: mediumPMCMarker, label: "medium PMC" },
      { url: lightPMCMarker, label: "light PMC" },
      { url: scavMarker, label: "scav" },
      null,
      null,
      null,
      null,
    ],
    [],
  );

  const onRadialSelect = useCallback(
    (url: string) => {
      setMarkerByUrl(url);
      closeRadial();
    },
    [setMarkerByUrl, closeRadial],
  );

  // === Keyboard shortcuts (Phase 2 + 3 of design_p0_slice.md) ===
  //
  // The bindings array is recomputed every render (useMemo just
  // memoizes for reference stability when nothing relevant changed).
  // The hook reads bindings through a ref-mirror, so re-creating
  // the array does NOT re-install the window listener — see
  // useKeyboardShortcuts.ts note 1.
  //
  // Suspension ref is owned here and read by the marker radial
  // (MarkerRadial sets it to true on mount, false on dismiss).
  const shortcutsSuspended = useRef<boolean>(false) as SuspensionRef;
  const previousToolRef = useRef<Tool | null>(null);

  // Space-hold pan: flip tool to pan on enter, restore on exit.
  // usePan picks up tool.type === 'pan' via its second activation
  // path (see src/tools/pan.ts path 2). The "previous tool" is
  // tracked here in a ref so the rapid keydown → React render →
  // keyup sequence doesn't lose track of the original tool.
  const enterPan = useCallback(() => {
    previousToolRef.current = tool;
    setTool({ ...tool, type: ToolType.pan });
  }, [tool]);
  const exitPan = useCallback(() => {
    const prev = previousToolRef.current;
    if (prev) setTool({ ...prev });
    previousToolRef.current = null;
  }, []);

  // Right-mouse-hold eraser. The shortcut hook calls these directly
  // on mouse:down/up; we arm the erasure session SYNCHRONOUSLY here
  // (i.e. without waiting for React state) so the triggering
  // mouse:down doesn't pass before erasing begins. See
  // src/tools/eraserCore.ts header for the rationale (R19).
  const quasiEraserSession = useRef<ReturnType<
    typeof createEraserSession
  > | null>(null);
  const enterRightMouseEraser = useCallback(() => {
    if (!maybeCanvas) return;
    // Create a fresh session per quasi-mode invocation. They're
    // cheap and short-lived; reusing across invocations would
    // require careful clean-up tracking that isn't worth it here.
    const session = createEraserSession(maybeCanvas, unerasable);
    quasiEraserSession.current = session;
    previousToolRef.current = tool;
    setTool({ ...tool, type: ToolType.eraser });
    session.start();
  }, [maybeCanvas, tool, unerasable]);
  const exitRightMouseEraser = useCallback(() => {
    quasiEraserSession.current?.stop();
    quasiEraserSession.current = null;
    const prev = previousToolRef.current;
    if (prev) setTool({ ...prev });
    previousToolRef.current = null;
  }, []);

  const bindings = useMemo<Binding[]>(
    () => [
      // Press bindings (locked-mode switches and one-shot actions).
      { kind: "press", key: "v", onPress: setSelect },
      { kind: "press", key: "b", onPress: setPencil },
      { kind: "press", key: "e", onPress: setEraser },
      // M opens the marker radial at the last known cursor
      // position (or canvas center if we don't have one yet). The
      // radial owns its own keyboard while open via the
      // shortcutsSuspended ref — see MarkerRadial.tsx item 1.
      { kind: "press", key: "m", onPress: () => openRadial("cursor") },
      // Cmd/Ctrl+Z — replaces the listener that used to live in
      // useUndo. Modifier-strict matching prevents accidental
      // Ctrl+Shift+Z double-fire (relevant once redo lands).
      {
        kind: "press",
        key: "z",
        modifiers: ["cmdOrCtrl"],
        onPress: onUndo,
      },
      // P toggles phase (record ↔ plan). See §6.2 of the design
      // doc. P-as-pencil-alias was dropped to reclaim this key;
      // B remains the pencil shortcut.
      {
        kind: "press",
        key: "p",
        onPress: () =>
          setPhase((cur) => (cur === "plan" ? "record" : "plan")),
      },
      // Space-hold pan.
      { kind: "hold", key: " ", onEnter: enterPan, onExit: exitPan },
      // Right-mouse-hold eraser.
      {
        kind: "mouseHold",
        button: 2,
        onEnter: enterRightMouseEraser,
        onExit: exitRightMouseEraser,
      },
    ],
    [
      setSelect,
      setPencil,
      setEraser,
      onUndo,
      openRadial,
      enterPan,
      exitPan,
      enterRightMouseEraser,
      exitRightMouseEraser,
    ],
  );

  useKeyboardShortcuts(maybeCanvas, {
    bindings,
    suspendedRef: shortcutsSuspended,
  });

  // showSidebar was previously wired to the toolbar marker button;
  // the radial replaces that path. `setSidebar(true)` remains
  // available via the underlying state setter for any future
  // direct caller. hideSidebar is still used by the closeArea
  // overlay so a user can dismiss the (now nearly-empty) sidebar.
  const hideSidebar = () => {
    setSidebar(false);
  };

  // === Operator chip interaction matrix (design doc §5.7) ===
  //
  // Click on visible op:        activate
  // Click on hidden op:         unhide AND activate
  // Shift+click on visible op:  hide (if active, also deactivate
  //                             to null — see §5.6 "hidden cannot
  //                             be active")
  // Shift+click on hidden op:   unhide (does not change active)
  //
  // Both handlers blur their button before App rerender — the
  // OperatorChips component handles that internally.
  const onOperatorClick = useCallback(
    (id: OperatorId) => {
      const op = operators.find((o) => o.id === id);
      if (!op) return;
      if (!op.visible) {
        // Unhide AND activate.
        setOperators((cur) =>
          cur.map((o) => (o.id === id ? { ...o, visible: true } : o)),
        );
      }
      setActiveOperatorId(id);
    },
    [operators],
  );

  const onOperatorShiftClick = useCallback(
    (id: OperatorId) => {
      const op = operators.find((o) => o.id === id);
      if (!op) return;
      const nextVisible = !op.visible;
      setOperators((cur) =>
        cur.map((o) => (o.id === id ? { ...o, visible: nextVisible } : o)),
      );
      // If we just HID the active operator, deactivate. This is the
      // load-bearing "hidden cannot be active" rule from §5.6.
      if (!nextVisible && activeOperatorId === id) {
        setActiveOperatorId(null);
      }
    },
    [operators, activeOperatorId],
  );

  // Convenience to blur a button after a toolbar click — keeps
  // canvas focus available for Space-pan (§4.4 item 11). Wrapping
  // every toolbar onClick is verbose but mechanical.
  const blurOnClick =
    (handler: () => void) =>
    (e: React.MouseEvent<HTMLButtonElement>) => {
      handler();
      (e.currentTarget as HTMLElement).blur();
    };


  // Run-once
  useEffect(() => {
    const canvas = initializeCanvas();
    setCanvas(canvas);

    // Cleanup: dispose canvas on unmount
    return () => {
      canvas.dispose();
    };
  }, []);

  // Load map and ensure it's fullscreen
  useEffect(() => {
    if (!maybeCanvas) return;
    const canvas = maybeCanvas;

    // Reset the unerasable allowlist; without this, switching maps would
    // leave the previous map's image src registered, leaking across maps.
    unerasable.clear();

    fabric.Image.fromURL(maps[map]).then((image) => {
      image.canvas = canvas;
      image.selectable = false;
      unerasable.add(image.getSrc());
      canvas.add(image);

      // Fit-to-viewport on initial load and on every map switch. Image's
      // origin stays at center (fabric v7 default), so scaling around
      // (canvas.w/2, canvas.h/2) puts the image's center at the canvas
      // center and the entire map fits. We don't refit on window resize
      // — by then the user has likely zoomed/panned somewhere meaningful.
      const scale = Math.min(
        canvas.getWidth() / image.width,
        canvas.getHeight() / image.height,
      );
      canvas.setViewportTransform([
        scale,
        0,
        0,
        scale,
        canvas.getWidth() / 2,
        canvas.getHeight() / 2,
      ]);
      // Mirror zoom.ts's brush-width compensation for the fit zoom so
      // pencil strokes render at the configured screen-pixel width.
      // Existing plan-phase dashes are intentionally NOT
      // recompensated — they keep their canvas-unit dashArrays from
      // creation time and zoom with the rest of the canvas. See
      // src/tools/dashCompensation.ts header.
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.width = brushWidth / scale;
        // Refresh the LIVE preview's dashArray for the new zoom so
        // the next plan-phase stroke draws with screen-pixel-consistent
        // gaps. Only touch it if it's currently set — null means
        // record phase.
        if (canvas.freeDrawingBrush.strokeDashArray) {
          canvas.freeDrawingBrush.strokeDashArray = dashArrayForZoom(scale);
        }
      }
    });

    function resizeListener() {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        const height = containerRef.current.offsetHeight;
        maybeCanvas?.setDimensions({ width, height });
      } else {
        maybeCanvas?.setDimensions(defaultSize);
      }
    }

    resizeListener();

    window.addEventListener("resize", resizeListener);
    return () => {
      window.removeEventListener("resize", resizeListener);
    };
  }, [map, maybeCanvas, unerasable]);

  return (
    <div className="App" ref={appRef}>
      <header className="App-header">
        <section className="App-header-left">
          <Link className="App-header-title" to="/">
            Tarkov Debrief
          </Link>
          <a href={githubUrl}>
            <img src={githubLogo} alt="github logo" className="App-header-github-logo"/>
          </a>
          <a href={githubUrl} className="App-header-github">Read more on github</a>
        </section>
        {/* Middle section: operator chips + phase toggle. Centered
            via App.css's three-section flex (header-middle:flex-1
            with content centered). See design doc §5.7. */}
        <section className="App-header-middle">
          <OperatorChips
            operators={operators}
            activeId={activeOperatorId}
            onClick={onOperatorClick}
            onShiftClick={onOperatorShiftClick}
          />
          <PhaseToggle phase={phase} onChange={setPhase} />
        </section>
        {/* Toolbar buttons. Each onClick is wrapped in blurOnClick
            so canvas focus returns after a click and Space-pan keeps
            working on the next press (§4.4 item 11, R16). */}
        <section className="App-header-buttons">
          <button onClick={blurOnClick(setSelect)} title="Select (V)">
            <img src={selectIcon} alt="select" />
          </button>
          <button onClick={blurOnClick(setPencil)} title="Pencil (B)">
            <img src={pencilIcon} alt="pencil" />
          </button>
          <button onClick={blurOnClick(setEraser)} title="Eraser (E)">
            <img src={eraserIcon} alt="eraser" />
          </button>
          <button
            onClick={blurOnClick(() => openRadial("center"))}
            title="Markers (M)"
          >
            <img src={addMarkerIcon} alt="markers" />
          </button>
          <button onClick={blurOnClick(onUndo)} title="Undo (Ctrl/Cmd+Z)">
            <img src={undoIcon} alt="undo" />
          </button>
          <button onClick={blurOnClick(save)} title="Save">
            <img
              className="App-header-buttons-save"
              src={saveIcon}
              alt="save"
            />
          </button>
        </section>
      </header>
      {/* Sidebar stays as a stub for the color picker only — the
          marker section moved to the radial below. Full removal
          of the sidebar (and the react-color dep) is tech debt
          queued in design doc §8.4. */}
      <aside className={sidebar ? "enter" : ""}>
        <section onClick={hideSidebar} id="closeArea"></section>
        <section id="sidebar">
          <SidebarSection title="">
            <TwitterPicker
              color={color}
              triangle="hide"
              onChangeComplete={onColorChoice}
            ></TwitterPicker>
          </SidebarSection>
        </section>
      </aside>
      <div className="Canvas" ref={containerRef} tabIndex={0}>
        <canvas id="canvas"></canvas>
      </div>
      {radialCenter && (
        <MarkerRadial
          center={radialCenter}
          slots={radialSlots}
          onSelect={onRadialSelect}
          onCancel={closeRadial}
          suspendedRef={shortcutsSuspended}
        />
      )}
    </div>
  );
}

export default App;
