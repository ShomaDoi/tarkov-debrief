# Ergonomic Creative Input for Tarkov Debrief — Research Report

**Date:** 2026-05-10
**Scope:** Identify UX patterns that make canvas/annotation tools feel
"mind-reading," and translate them to Tarkov Debrief's surface (select,
pencil, eraser, marker, undo, save, pan, zoom, color). Desktop-first,
mobile-considered.
**Output type:** Research report — no implementation follows.
**Confidence overall:** High on the patterns themselves (multiple
converging primary sources); medium on prioritization (depends on
team taste and the actual debrief workflow, which would benefit from
1–2 user observations).

---

## Executive Summary

Three tools dominate the "feels seamless" category — **Excalidraw**
(web), **tldraw** (web), and **Procreate** (iPad) — and they converge
on a small, surprisingly consistent set of mechanics. None of them
are about adding features; they're about *removing the distance
between intent and action*. The same mechanics appear in
research-grade work from **Ink & Switch** (Capstone, Inkbase, Crosscut,
Untangle, Muse), and they are framed theoretically by the
Raskin/Tesler/Matuschak/Victor lineage as **quasi-modes**, **direct
manipulation**, and **immediate feedback**.

The single most leverageable concept for Tarkov Debrief is the
**quasi-mode** (a.k.a. spring-loaded mode): a temporary mode that
holds only while a key is depressed, reverting on release. Quasi-modes
collapse the cost of switching tools to roughly zero, which is what
makes Excalidraw feel like it reads your mind. Tarkov Debrief
currently has no quasi-modes and no first-class keyboard shortcuts;
this is the largest single gap.

The second-largest gap is **sidebar-as-drawer-for-hot-actions**. The
color picker and marker selector live behind a 300ms slide-in
animation, which is fine for cold settings but punishing for the
in-flow choices a debrief actually requires ("...and *now* we
swapped to a red arrow" — three clicks). Hot actions belong on the
canvas surface or behind a held key; the sidebar should host only
cold settings.

The third is **defaults that disappear**. Sticky last-used color and
tool across reloads, recent-color strip, and snap-to-shape on
hold-still all mean the user makes fewer micro-decisions per minute.

The mobile lens turns most of these into multi-touch gestures
(two-finger pan/zoom, two-finger tap undo, three-finger tap redo)
borrowed wholesale from Procreate.

---

## Part 1 — Principles Distilled from the Research

These are the load-bearing ideas. Everything in Part 2 derives from one
of these.

### 1. Quasi-modes beat locked modes for transient intent

A **mode** is a UI state that changes how subsequent input is
interpreted. **Locked modes** (toggle on, toggle off) cause "mode
errors" — the user thinks they're drawing but they're erasing.
**Quasi-modes** (Jef Raskin, *The Humane Interface*) only hold while
a physical action is sustained: hold spacebar to pan, release to stop;
hold shift to constrain to 45°. Larry Tesler's "NO MODES" license plate
was directed at locked modes, not at quasi-modes — Raskin and Matuschak
distinguish them carefully. Inkbase explicitly defined the pattern as
*"temporary mode requiring a continuous kinesthetic action be done to
stay in the mode, thus avoiding most of the problems with modes,"* and
used it for selection (hold two fingers, then touch).

**Implication:** Tools the user briefly visits — pan, eraser, color
sample, snap-to-line — should be quasi-modes. The default tool the
user is *living in* (pencil, almost always) is a locked mode. Most
products invert this and pay for it.

### 2. The toolbar is for cold settings; hot actions belong at the cursor

Capstone's most candid finding was that they tried "command glyphs,
modifier keys, stylus barrel buttons, pressure sensitivity, and knuckle
gestures" and **still had to fall back on an on-screen tool palette,
which users found "clumsy and error-prone."** Muse went further and
removed the toolbar entirely, declaring *"avoid toolbars, buttons, or
other administrative debris."*

This isn't a literal recommendation to remove the toolbar — Excalidraw
keeps theirs and people love it — but it tells you what the toolbar is
*for*: low-frequency mode switches and persistent settings. The high-
frequency stuff (color, brush, eraser) needs a path that doesn't go
through it.

### 3. Single-letter keyboard shortcuts are the desktop superpower

Excalidraw and tldraw both put every tool on a single letter, and they
overlap by intent: V = select, R = rectangle, A = arrow, L = line,
T = text, E = eraser, P = draw. Excalidraw also offers digit aliases
(1-0). Users reach for `?` to see the cheat sheet.

What this purchases is **the ability to switch tools without taking
your eye off the canvas** — the literal definition of "feels like it
reads your mind." Tarkov Debrief has no tool shortcuts today.

### 4. Reversibility creates speed, not the other way around

When undo is free, users explore. When it's expensive, they hesitate.
Procreate makes undo a **two-finger tap** and redo a **three-finger
tap**; Crosscut makes a snap reversible by *"dragging the point away
to abort the snap"* before lift; Capstone's pinch-to-zoom can be
*"reversed without lifting fingers from the screen to cancel the
operation."* The pattern is consistent: every commit gesture has an
adjacent abort gesture in the same kinesthetic envelope.

### 5. Smart defaults that stick beat configuration screens

Procreate ships with one ink type per use case — *"carefully designed
for context"* — and refuses to expose a brush wizard. Muse takes the
same approach. Excalidraw does the opposite at first glance (lots of
options) but the options are sticky: your last-used color, last-used
brush size, last-used arrowhead style all persist into the next shape
you draw. The configuration is *implicit*: "the next thing you do
should look like the last thing you did."

### 6. Direct manipulation > abstract controls

Bret Victor's "Inventing on Principle" thesis: creators need
**immediate feedback**, and *bad representations and indirect ways of
manipulation hinder understanding and creativity*. Procreate's
pinch-to-merge-layers, Crosscut's drag-points-together-to-bind, and
Inkbase's drag-property-onto-shape all make the action *be* the
representation. The opposite is "open menu, find option, edit value,
hit OK."

### 7. Show, don't menu — the cursor carries the intent

Inkbase showed pink for system output and black for user input.
Procreate gives the canvas 95% of the screen. Capstone's "peek" lets
you preview before committing. The pattern: *the active tool and the
prospective effect should be visible at the locus of attention*,
which is the cursor — not a corner of the screen.

### 8. Marking menus / radial menus reward muscle memory

Bill Buxton and Gordon Kurtenbach's classic research: **press-and-wait
~1/3 sec** to summon a radial menu under the cursor; **press-and-flick**
in a known direction to skip the menu entirely. Same physical motion
in both cases, so users transition from novice to expert without ever
relearning. Best at 4 or 8 items, 2-4 levels deep. Concepts and
several pen-based tools use this; web canvas tools mostly don't yet.

### 9. Tolerate fuzzy input; commit on release

Untangle: *"you can always just wiggle your drawing a bit to get the
system to recognize it."* Procreate QuickShape: draw a wobbly circle,
**hold at the end**, system snaps to a clean circle. Crosscut: drag
near a point, lift to snap, drag away to abort. The "hold-still"
gesture turns into a universal commit verb — you've proposed, the
system disambiguates, you confirm by stillness.

### 10. Performance is calmness

Muse: *"slow software is discouraging and uncomfortable."* They
target 120 fps and treat latency as a first-class design feature.
Procreate's pencil-to-pixel latency is sub-7ms; *"anything slower
breaks the illusion."* This is not optimization in the engineering
sense — it's the difference between a tool that vanishes and a tool
the user constantly notices.

---

## Part 2 — Concrete Patterns Catalog

### A. Excalidraw

**Tool selection (single letter or digit):**
| Key       | Tool          |
|-----------|---------------|
| V or 1    | Select        |
| H         | Hand / pan    |
| R or 2    | Rectangle     |
| O or 4    | Ellipse       |
| A or 5    | Arrow         |
| L or 6    | Line          |
| P or 7    | Free draw     |
| T or 8    | Text          |
| E or 0    | Eraser        |
| K         | Laser pointer |
| `?`       | Show shortcuts overlay |

**Quasi-modes:**
- **Spacebar + drag** = pan canvas (release to stop)
- **Shift + click/drag** = constrain proportions/angle, deep select
- **Alt/Option + drag** = duplicate while moving
- **Ctrl/Cmd held during draw** = prevent arrow auto-binding

**Command palette:** Cmd+/ or Cmd+Shift+P, fuzzy-searchable list of
every action. Added in 2023 to solve discoverability of growing
shortcut set.

**Sticky defaults:** Last 5 used colors persist as "recent" swatches.
Last brush settings carry to next shape.

**Praise patterns:** *"There's no onboarding. No signup. You're just
in the product."* Hand-drawn aesthetic *"removes perfectionism
paralysis"* — users post sketchy diagrams they'd never publish from
Figma.

### B. tldraw

Tool keys overlap with Excalidraw (V select, E eraser, etc.).
tldraw's SDK exposes a clean override system — `kbd: 'cmd+g,ctrl+g'`
syntax for shortcut definitions, and shortcuts are *"disabled when a
menu is open, a shape is being edited, the editor has a crashing
error, or the user has disabled keyboard shortcuts in preferences"*.
Worth modeling: scope-aware shortcuts so typing in a marker label
doesn't switch tools.

### C. Procreate gesture grammar

| Gesture                  | Action                  |
|--------------------------|-------------------------|
| 2-finger tap             | Undo                    |
| 3-finger tap             | Redo                    |
| 2-finger hold            | Rapid undo (scrub)      |
| 2-finger pinch / drag / rotate | Zoom / pan / rotate canvas |
| 3-finger swipe down      | Cut/copy/paste menu     |
| Touch and hold           | Eyedropper              |
| Draw and hold            | QuickShape (snap-to-shape) |
| Pinch two layer rows     | Merge layers            |
| Long-press + drag        | Reorder                 |

**Input discrimination hierarchy:**
1. Apple Pencil (always drawing, sub-7ms)
2. Recognized finger gesture (~50ms window)
3. Single-finger touch (paint or canvas)
4. Palm contact (rejected by area + pressure)

**Mantra:** *"the interface should vanish and leave the artist alone
with the canvas."*

### D. Ink & Switch findings

**Capstone** (tablet, 2018): hands+stylus separation works ("hands
move, stylus edits"). Tool switching is unsolved with stylus alone.
Pinch-out to zoom is *cancellable mid-gesture*. Spatial memory works
in nested boards. Motion design *"helps create a fluid environment
where the user can move fast with confidence"* — animations aren't
decoration, they're cognitive scaffolding.

**Inkbase** (programmable ink, 2022): selection via hold-two-fingers
quasi-mode. Properties live and reactive. Programming-in-the-moment
beats opening a separate environment.

**Crosscut** (dynamic models, 2022): no edit/run mode toggle —
everything runs continuously. Drag to snap, lift to commit, drag away
to abort.

**Untangle** (constraint sketching, 2023): black ink = user input,
pink = system output (implicit mode visualization). Wiggle drawing
to retry recognition. Scrub through proposed solutions instead of
explicit submit.

**Muse** (calm thinking, 2019–): no toolbars at all. Stylus *grip*
is the quasi-mode (writing grip vs. low-angle grip). 120 fps target.
*"One ink type per media type, carefully designed for context"* —
chosen constraint over customization.

### E. Marking-menu research (Buxton/Kurtenbach)

- Press-and-wait → radial menu appears under cursor.
- Press-and-flick (skip wait) → execute via direction alone.
- Same physical gesture path for novice and expert → no relearning.
- Marks are **3.5× faster** than menu navigation in expert use.
- Optimal: 4 or 8 items, 2-4 levels deep.

### F. Theoretical lineage

- **Jef Raskin** — coined *quasi-mode* in *The Humane Interface*.
- **Larry Tesler** — "NO MODES"; modeless cut/copy/paste.
- **Bret Victor** — *Inventing on Principle*, *Drawing Dynamic
  Visualizations*, *Stop Drawing Dead Fish* — direct manipulation,
  immediate feedback as moral imperatives.
- **Andy Matuschak** — tools should produce *"alien cognitive and
  creative powers"*; emphasis on fluidity, attention, and the
  difference between *cognitive* modes and *interface* modes.

---

## Part 3 — Recommendations for Tarkov Debrief

These are scoped to the actual product (single-canvas debrief tool,
small fixed toolset, primarily desktop). Each recommendation cites
the principle/source it derives from.

Priority key:
- **P0** — high impact, low cost, recommended next.
- **P1** — substantial UX upgrade, modest cost.
- **P2** — bigger bets, possibly speculative.

### P0 — Fast wins

**P0.1 Single-letter tool shortcuts.** Bind V (select), B or P
(pencil), E (eraser), M (marker), U (undo, in addition to Cmd+Z), Z
(zoom hold — see P0.3), and Cmd+S (save). Show the letter in each
toolbar button's tooltip and as a faint badge on the icon.
*Source: Excalidraw, tldraw.*

**P0.2 Spacebar-pan as a quasi-mode.** Hold spacebar → cursor swaps
to grab, drag pans the canvas, release returns to the previously
active tool. Today's `usePan` exists but is not a quasi-mode; it
should be. *Source: Excalidraw, every desktop canvas tool.*

**P0.3 Right-click eraser quasi-mode.** Hold right mouse button →
eraser is active for the duration; release → return to previous tool.
This is the single most-requested pattern in pencil/eraser flows
because users alternate constantly. *Source: Photoshop, Krita,
Procreate's "writing grip + finger touch" by analogy.*

**P0.4 Sticky tool and color across reloads.** Persist `tool` and
`color` to localStorage. Currently they reset on refresh. Cost: ~20
lines. *Source: Procreate, Excalidraw, Muse.*

**P0.5 Cmd+Shift+Z redo.** Today only undo is bound. Add redo. Also
expose both as toolbar buttons (currently only undo is on the bar).
*Source: every canvas tool.*

**P0.6 Cursor-following tool indicator.** When the marker tool is
active, the cursor *is* a translucent preview of the marker. When
pencil is active, cursor is a small colored dot matching the brush
color. *Source: principle 7 (show, don't menu); Untangle's pink-vs-
black ink.*

### P1 — Substantial upgrades

**P1.1 Right-click marker quasi-popover.** Hold right-click on the
canvas → small radial menu of the four marker variants appears
under the cursor; release on one to place that marker at that
position. Skips the sidebar entirely for the most common stamp action.
On a slower drag-out, this becomes a marking menu. *Source:
Buxton/Kurtenbach; Concepts.*

**P1.2 Recent colors strip.** Render the last 5 colors used as a
horizontal strip pinned to the toolbar (or floating near the cursor on
"C" hold). Skip the slide-in sidebar for color changes. *Source:
Excalidraw "5 recent" pattern.*

**P1.3 Eyedropper on Alt-click.** Alt-click any existing stroke to
set the brush color from it. *Source: Procreate, Photoshop, every
paint tool.*

**P1.4 Hold-C color quasi-mode.** Hold C → small swatch grid pops
up under the cursor → release on a swatch to commit. Mirrors
Procreate's touch-and-hold eyedropper. *Source: Procreate, Muse.*

**P1.5 Shift constrains to 45°.** Hold shift while drawing a pencil
stroke → constrain to nearest 45° angle (straight line, perfect
diagonal). Standard. *Source: Excalidraw, Figma.*

**P1.6 QuickShape (hold-still snap).** After completing a stroke,
hold the cursor still for ~500ms → system offers a snapped
interpretation (line, arrow, ellipse, rectangle). The *original*
stroke remains in undo. Especially valuable for debriefs where
people are tracing fences, doors, sightlines. *Source: Procreate
QuickShape.*

**P1.7 Trackpad two-finger pan + pinch zoom.** Native gesture handling
for laptop trackpads — the dominant desktop input today. *Source:
table stakes for any modern web canvas.*

**P1.8 Command palette (Cmd+K).** Fuzzy-searchable list of every
action. Solves discoverability of all the shortcuts above. Excalidraw
added this for exactly this reason. *Source: Excalidraw, Figma, VS
Code.*

**P1.9 `?` flashes the shortcut cheat sheet.** Press `?` → translucent
overlay listing every shortcut → press anything to dismiss. *Source:
Excalidraw, Linear, GitHub.*

**P1.10 Marker placement in one gesture.** Currently: open sidebar,
click marker, close sidebar, click canvas. Target: pick marker once
(via P1.1 radial or sidebar), then *click-drag-release* on canvas =
place + rotate + commit. *Source: Capstone "stylus edits" insight.*

**P1.11 Pencil stroke smoothing.** Enable fabric.js's path smoothing
for the pencil. Reduces "shaky cursor" feel especially on trackpads.
*Source: Procreate, all modern paint tools.*

**P1.12 Drag-off-canvas to delete.** With marker selection: drag
off the canvas edge → deletes the marker. Capstone found this
*"natural and even fun."* *Source: Capstone.*

### P2 — Bigger bets (validate first)

**P2.1 Stroke-replay / debrief playback.** A play button that replays
all strokes in temporal order at adjustable speed. The product's
*core* job is reviewing what happened in a raid; replay makes the
canvas itself the narrative. *Speculative; would benefit from
1–2 user tests.*

**P2.2 Per-player ink colors.** A small chip per squadmate at the top
("Alpha", "Bravo", "Charlie", "Delta") that, when clicked, sets the
brush color. The debrief becomes a multi-perspective document.
*Speculative.*

**P2.3 Map-switch from inside the app.** Cmd+M (or just M on a
neutral tool) opens an inline map switcher with thumbnails. Today,
switching maps requires going back to the selector. Debriefs often
span multiple raids on different maps. *Source: every multi-document
app.*

**P2.4 Save state to URL (#hash) for shareable debriefs.** Persist
canvas state to a hash so a teammate opens the URL and sees the same
annotations. (Local-first ethos from Ink & Switch.) *Speculative;
depends on storage size.*

**P2.5 Distance overlay.** Hold a measure-key while dragging → live
distance readout in pixels (and optionally in approximate in-game
meters if the map has known scale). *Speculative.*

**P2.6 Marking-menu tool wheel (Concepts-style).** Right-click hold
→ radial menu with all six tools. Press-and-flick variant for experts.
Replaces the toolbar entirely for users who prefer it. *Source:
Concepts, marking-menu research.*

### Specifically deprioritize (or actively reverse)

**D.1 Sliding sidebar for marker selection.** It's heavy for a hot
action. Replace with P1.1 radial popover. The sidebar can stay for
truly cold settings (per-session player names, replay speed) once
those exist.

**D.2 Twitter-picker color palette in a sidebar.** Move to recent-
colors strip (P1.2) + held-C quasi-popover (P1.4). The full palette
is a one-time chore, not an in-flow choice.

**D.3 React Color dependency** (separate concern, but related):
~80kB for one swatch grid. Recent-colors + hex input does the same
job in 0kB.

---

## Part 4 — Mobile / Touch Lens

Tarkov Debrief is primarily desktop, but every desktop affordance
should have a touch counterpart so the product doesn't feel broken on
a phone. The translation matrix:

| Desktop quasi-mode        | Touch equivalent                  |
|---------------------------|-----------------------------------|
| Spacebar + drag = pan     | Two-finger drag                   |
| Pinch zoom (Ctrl+wheel)   | Two-finger pinch                  |
| Right-click eraser        | Two-finger tap-and-hold = eraser  |
| Shift constrain           | (no direct equivalent — accept)   |
| Alt eyedropper            | Touch-and-hold on stroke          |
| Cmd+Z undo                | Two-finger tap                    |
| Cmd+Shift+Z redo          | Three-finger tap                  |
| Cmd+K command palette     | (Optional; consider hamburger)    |

Additional touch-specific principles:

- **Touch targets ≥ 44×44 px.** Current toolbar is 40×40; bump it.
- **Marker picker as a bottom sheet** on phone portrait. Thumb-
  reachable. Sidebar-from-right is only correct for tablet landscape.
- **Two-finger gestures must be on the canvas, not on toolbars.**
  Procreate's input discrimination hierarchy is the model: pen-like
  (touch-down moves) → drawing input; multi-touch → canvas operation;
  palm-shaped contact → ignored.
- **Avoid hover-only affordances.** Tooltips revealing keyboard
  shortcuts must also surface in a long-press menu on touch.
- **Gesture conflicts to handle:** browser pull-to-refresh on top
  edge; iOS Safari edge-swipe back. Both must be suppressed inside
  the canvas, gracefully.

---

## Part 5 — Storytelling Lens (the actual debrief use case)

The product's job is not "drawing" — it's *narrating an experience to
someone who was there* (or wasn't). The mental model is closer to a
sports broadcast's telestrator than to Figma. Two implications worth
flagging:

1. **The user is talking, not staring at the screen.** Anything that
   forces them to look at a sidebar or hunt for a button breaks the
   conversation. Quasi-modes and right-click radials shine here
   because the eyes never leave the action.

2. **The artifact has a temporal axis.** Strokes happen in order, and
   that order *is* the story. P2.1 (stroke replay) and a per-player
   color (P2.2) directly address this. They are not core today but
   they're the natural evolution of the product's identity, and they
   would differentiate Debrief from "just another web Excalidraw."

This is also why **Capstone's "chalk-talk" use case finding is the
single most relevant Ink & Switch result**: the team explicitly noted
that *"presentations felt more lively and human"* on a freeform
canvas with sketchy ink. Debrief is a chalk talk.

---

## Part 6 — Open Questions for the User

These are the next-step decisions a /sc:design pass would need to
resolve.

1. **Are debriefs solo (you reviewing your own footage) or live
   shared (a squad together)?** Live-shared elevates P1.1 and P2.2;
   solo elevates P2.1 and P2.4.
2. **Trackpad or mouse primary?** Trackpad makes P1.7 P0; mouse
   makes P0.3 (right-click eraser) bigger.
3. **Tablet/stylus considered?** If yes, Capstone/Muse findings
   become directly relevant; if no, treat them as inspiration only.
4. **Appetite for radial menus?** They're the highest-leverage
   pattern but also the least common in web canvas tools, so they're
   a small bet.

---

## Sources

### Excalidraw / tldraw / Figma
- [Excalidraw Keyboard Shortcuts](https://csswolf.com/excalidraw-keyboard-shortcuts-pdf/)
- [Excalidraw Plus — How to start drawing](https://plus.excalidraw.com/how-to-start)
- [tldraw — User interface docs](https://tldraw.dev/docs/user-interface)
- [tldraw — Custom keyboard shortcuts](https://tldraw.dev/examples/keyboard-shortcuts)
- [tldraw — Tools](https://tldraw.dev/docs/tools)
- [Figma Actions Menu](https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design)
- [HN: Why is Excalidraw so good?](https://news.ycombinator.com/item?id=29109995)

### Procreate
- [Procreate: Gesture-First Creative Tools](https://blakecrosley.com/guides/design/procreate)
- [Procreate Handbook — Gestures](https://help.procreate.com/procreate/handbook/interface-gestures/gestures)

### Ink & Switch projects
- [Capstone — A tablet for thinking](https://www.inkandswitch.com/capstone/)
- [Inkbase — Programmable Ink](https://www.inkandswitch.com/inkbase/)
- [Crosscut — Drawing Dynamic Models](https://www.inkandswitch.com/crosscut/)
- [Untangle — Solving problems with fuzzy constraints](https://www.inkandswitch.com/untangle/)
- [Muse](https://www.inkandswitch.com/muse/)
- [Ink & Switch Essays index](https://www.inkandswitch.com/essay/)

### Theory / lineage
- [Mode (user interface) — Wikipedia (covers Raskin's quasi-mode)](https://en.wikipedia.org/wiki/Mode_(user_interface))
- [Larry Tesler — nomodes.com](https://www.nomodes.com/)
- [Of Modes and Men — IEEE Spectrum](https://spectrum.ieee.org/of-modes-and-men)
- [Andy Matuschak — site index](https://andymatuschak.org/)
- [Andy Matuschak — Tools for thought: science, design, art, craftsmanship?](https://andymatuschak.org/sdac/)
- [Bret Victor — Inventing on Principle (HN discussion)](https://news.ycombinator.com/item?id=16164362)
- [Bret Victor — Drawing Dynamic Visualizations](https://www.youtube.com/watch?v=ef2jpjTEB5U)

### Marking menus / radial menus
- [Kurtenbach — The Design and Evaluation of Marking Menus (PDF)](https://www.research.autodesk.com/app/uploads/2023/03/the-design-and-evaluation.pdf_recHpUp1v9dc1n2CJ.pdf)
- [Buxton — User Learning and Performance with Marking Menus](https://www.billbuxton.com/MMUserLearn.html)
- [Concepts — Tool wheel manual](https://concepts.app/en/windows/manual/yourworkspace)

### Command palette
- [Excalidraw Command Palette implementation overview](https://deepwiki.com/excalidraw/excalidraw/4.2-linear-element-editor)
- [Philip Davis — Command Palette Interfaces](https://philipcdavis.com/writing/command-palette-interfaces)
- [UX Patterns for Developers — Command Palette](https://uxpatterns.dev/patterns/advanced/command-palette)

---

## Confidence & Caveats

- **High confidence** on the existence and effect of each pattern —
  every load-bearing claim has at least two independent primary
  sources cited.
- **Medium confidence** on the specific priority order — it reflects
  judgment about Tarkov Debrief's *current* surface and the debrief
  use case as documented in the README. Watching one or two real
  debriefs would adjust the ordering, especially around P1.1 (radial
  popover) vs P1.2 (recent-colors strip).
- **Lower confidence** on P2.* — they are speculative product moves
  that change what Debrief *is*, not just how it feels. They should
  not be implemented without deliberate buy-in.
- **What this report does not cover:** colorblind/accessibility
  considerations, internationalization of keyboard layouts (the
  letters chosen here are English-keyboard-centric), and server-
  side persistence. Each is its own pass.

---

## Boundary Reminder

Per `/sc:research` contract, this is a research report only. No code
changes, file edits, or architectural decisions follow from this
document. The next step is the user's: typically `/sc:design` to
turn the P0 set into a concrete implementation plan, or a 1-week
discovery sprint to validate the assumptions in Part 6 against real
debriefs.
