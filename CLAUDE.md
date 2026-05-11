# Tarkov Debrief — Repo Conventions for AI Assistants

This file captures durable conventions for any AI assistant
working in this codebase. Read it before making changes.

## Source of truth for design

Substantive design decisions live in `claudedocs/`:

- `claudedocs/design_p0_slice.md` — the P0 starter slice
  (quasi-modes, operator chips, phase toggle, marker radial)
- `claudedocs/tactical_input_design_2026-05-10.md` — the
  tactical-input design memo that drove the P0 slice
- `claudedocs/research_ergonomic_input_2026-05-10.md` — the
  underlying UX research
- `claudedocs/vocabulary_visual_language_2026-05-11.md` — the
  forward-looking visual decisions for future mark types

When implementing, **refer to the design doc by section number**
(e.g., "see §4.5 of design_p0_slice.md") rather than restating
its content in code comments. The doc is canonical; comments
point at it.

## Comments and locality

Two non-negotiable rules for any new code in this repo:

1. **Clarify all potential WTFs and edge cases with comments.**
   If a line of code would make a reader pause and ask "why?",
   add a comment that answers the question. Prefer the *why*
   over the *what* — well-named identifiers already convey what.
   This includes:
   - Why this guard is here (what would go wrong without it).
   - Why this ref-mirror instead of a state read.
   - Why this button gate, this event order, this dependency
     array.
   - Edge cases the code is intentionally not handling (and
     why that's correct).

2. **Mention relevant other code when behavior is non-local.**
   When the correctness of a function depends on something
   happening in another file/hook/component, reference it. For
   example: "this depends on `useKeyboardShortcuts` having
   already flipped `tool.type` — see hooks/useKeyboardShortcuts.ts
   §Right-mouse handler." Or: "the matching tear-down lives in
   the cleanup branch of the same effect."

The intent is that a new reader (human or AI) can land on any
file and trace the relevant context without re-deriving it from
the design doc.

## fabric.js integration patterns to know

The codebase has three recurring patterns that look weird but
are intentional. Don't "fix" them without reading the comments.

- **Ref-mirror for live state in fabric handlers.** fabric event
  handlers can outlive a React render and capture stale closure
  values. Pattern: mirror props into a ref, update the ref on
  every render, and read through the ref inside the handler. See
  `src/tools/pan.ts` for the canonical example (commented
  there). ESLint's `react-hooks/refs` rule is **off** specifically
  to allow this (see `eslint.config.js`).
- **Custom properties on fabric objects.** fabric objects accept
  arbitrary properties. Two existing uses: the `REPLAY` sentinel
  in `useUndo` (prevents undo from itself triggering the action
  stack) and metadata tags (`__operatorId`, `__phase`) in
  `tools/metadata.ts`. Type-cast through `any` is the accepted
  shape; ESLint allows it for fabric integration.
- **`unerasable: Set<string>`.** A stable ref-owned Set of object
  src URLs the eraser and undo must skip (the loaded map image is
  the main case). Created in `App.tsx`, threaded through
  `useEraser` / `useUndo` / `eraserCore`. Reset on every map
  switch to prevent leakage across maps.

## React + ESLint conventions

`eslint.config.js` disables three `react-hooks/*` rules
(`immutability`, `refs`, `set-state-in-effect`) because they
conflict with fabric.js integration. The reasons are documented
in the config file itself. If those rules ever start tripping
elsewhere, read the rationale before re-enabling.

## Testing patterns

- Hook tests use `renderHook` + `src/test/mockCanvas.ts`. The
  mock is intentionally minimal; extend it (with a comment
  explaining why) when a new test needs a method.
- E2E tests live in `e2e/`. Smoke spec asserts the
  fabric-v7 center-origin regression — preserve that assertion
  verbatim when modifying it.

## Commit/PR norms

- Conventional commit subjects (e.g., `feat: …`, `fix: …`).
- Each phase of the P0 slice is its own PR per the sequencing
  in `design_p0_slice.md` §9.
- Run `pnpm typecheck && pnpm lint && pnpm test` before
  committing. `pnpm test:e2e` before merging.
