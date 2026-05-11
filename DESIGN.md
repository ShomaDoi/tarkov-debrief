---
design_system:
  name: Tarkov Debrief
  version: 1.0.0
  theme: tactical-military
  description: >
    A post-apocalyptic, militaristic strategy-mapping UI inspired by Escape
    from Tarkov's in-game documents and operator menus. The aesthetic
    pairs a desaturated steel-gunmetal canvas with worn khaki, olive,
    and tan fatigue tones, evoking field-issued maps and printed
    debrief reports rather than a polished consumer SaaS.

color:
  brand:
    khaki:
      value: "#9A8866"
      usage: "Primary brand accent; toolbar fill, header title text, map-card fill, brand mark."
    khaki_dark:
      value: "#7B6C51"
      usage: "Pressed/hover state for tan controls; sidebar fill; secondary tan."
    khaki_light:
      value: "#C2B7A3"
      usage: "Default fill for tool buttons sitting inside the khaki toolbar."
    sand:
      value: "#C6B29C"
      usage: "Scavenger marker fabric tone; soft beige used inside marker illustrations."
  surface:
    canvas:
      value: "#282C34"
      usage: "Primary dark surface — header strip and full-screen map-list backdrop."
    canvas_inset:
      value: "#1F232A"
      usage: "Deeper variant of the canvas surface used for shadow wells (derived)."
    paper:
      value: "#FFFFFF"
      usage: "Drawing canvas / paper surface beneath user strokes; also marker highlights."
  border:
    chocolate:
      value: "#3D3629"
      usage: "Heavy 2px outline around the toolbar — gives it a riveted-metal-frame feel."
    walnut:
      value: "#5C513D"
      usage: "1px outline around tool buttons; secondary stitched/ammo-crate border."
  ink:
    primary:
      value: "#000000"
      usage: "Body copy on tan surfaces, icon glyphs, marker outlines."
    inverse:
      value: "#FFFFFF"
      usage: "Inverted glyphs on hover (icon `filter: invert(100%)` over dark khaki)."
    muted:
      value: "#474836"
      usage: "Olive/drab — body shading inside PMC marker armor blocks."
    gunmetal:
      value: "#4B4B48"
      usage: "Helmet/gear shading inside markers."
    smoke:
      value: "#929292"
      usage: "Face / lightest non-white tone inside markers."
    charcoal:
      value: "#232425"
      usage: "Hood and shadow tone inside the Scav marker."
  semantic:
    pencil_default:
      value: "#FF0000"
      usage: "Default free-draw brush color — bright tactical red, like grease-pencil annotation."
  palette_swatches:
    description: "Twitter-picker swatch row offered for stroke color selection."
    values:
      - "#FF6900"
      - "#FCB900"
      - "#7BDCB5"
      - "#00D084"
      - "#8ED1FC"
      - "#0693E3"
      - "#ABB8C3"
      - "#EB144C"
      - "#F78DA7"
      - "#9900EF"
  legacy:
    cyan_link:
      value: "#61DAFB"
      usage: "Vestigial React-blue link color; reserved, not visible in product surfaces."

typography:
  font_family:
    primary:
      value: "'Bender', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif"
      usage: "All UI chrome — headings, buttons, body. Bender is the in-game EFT typeface; condensed, mechanical, slightly stenciled."
    mono:
      value: "source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace"
      usage: "Reserved for code/debug surfaces."
  font_weight:
    regular: 400
    bolder: 800
  font_face:
    - family: Bender
      weight: 400
      source: bender.woff
    - family: Bender
      weight: 800
      source: bender-black.woff
  font_size:
    body: "16px"
    button_label:
      value: "large"
      computed: "~18px"
    header_title:
      value: "calc(10px + 2vmin)"
      note: "Fluid headline; ~28px on desktop, scales down on small viewports."
    header_link_small: "10px"
  letter_spacing: "normal"
  line_height: "normal"
  case: "lowercase preferred for navigation/labels (e.g. map names)"

spacing:
  base_unit: "5px"
  scale:
    xxs: "2.5px"
    xs:  "5px"
    sm:  "10px"
    md:  "1em"
    lg:  "20px"
  inset:
    header_horizontal: "1em"
    toolbar_horizontal: "5px"
    sidebar_left_inset: "20px"
  gap:
    button_horizontal: "2.5px"
    button_vertical: "5px"
    map_card_margin: "1em"

sizing:
  control:
    icon_button: "40px"
    icon_glyph: "38px"
    sidebar_marker_button_height: "70px"
  layout:
    header_min_height: "50px"
    sidebar_width: "400px"
    map_card_width: "380px"
    canvas_default: { width: "300px", height: "300px" }

radius:
  none: "0px"
  description: >
    The system uses sharp 90° corners exclusively. Hard edges reinforce
    the stenciled, equipment-crate aesthetic; rounded corners are
    avoided everywhere.

border:
  toolbar:
    width: "2px"
    style: "solid"
    color: "#3D3629"
  button:
    width: "1px"
    style: "solid"
    color: "#5C513D"

elevation:
  flat:
    box_shadow: "none"
    usage: "Default for almost every surface — the UI is intentionally flat."
  marker_drop:
    box_shadow: "0 0 5px rgba(0, 0, 0, 0.25)"
    usage: "Soft 2.5px gaussian blur stamped behind PMC silhouette markers (SVG feDropShadow)."
  marker_drop_strong:
    box_shadow: "0 0 5px rgba(0, 0, 0, 0.5)"
    usage: "Stronger drop applied to the Scav marker for higher contrast on busy maps."

motion:
  easing:
    default: "ease"
  duration:
    instant: "0ms"
    fast: "150ms"
    base: "250ms"
    slide: "300ms"
  transition:
    sidebar_slide:
      property: "right"
      from: "-100vw"
      to: "0"
      duration: "300ms"
      easing: "ease"
      note: "Right-anchored panel slides in from off-screen on `aside.enter`."
    button_hover:
      property: "background-color, filter"
      duration: "150ms"
      easing: "ease"
  reduced_motion:
    respects_prefers_reduced_motion: true
    note: "Decorative animations are gated behind `@media (prefers-reduced-motion: no-preference)`."

iconography:
  style: "Hand-drawn line glyphs, mostly 1px monochrome black strokes on transparent SVGs."
  viewbox: "Most tool icons are 38×38; marker SVGs are larger illustrative pieces (~85×82 to ~101×71)."
  set:
    tools: [select, pencil, eraser, marker, undo, save, zoom]
    markers: [pmc-thick, pmc-medium, pmc-light, scav]
    external: [github]
  treatment:
    default: "Black stroke on the tan button face."
    hover: "Glyph color-inverts (`filter: invert(100%)`) against the darker khaki hover background, producing white-on-olive."

cursors:
  drawing: "url(pencil-icon) — replaces the system cursor while drawing mode is active."
  default: "auto / pointer on interactive elements."

layout:
  app_shell:
    structure: "header (fixed top) + flex canvas (fills remaining height) + sliding aside (overlay, full viewport)."
    header_layout: "Two horizontal sections — brand cluster on the left, square-button toolbar on the right."
  toolbar:
    arrangement: "Inline row of 40×40 square buttons inside a single tan plate with a chocolate-brown border."
    spacing: "5px vertical, 2.5px horizontal between buttons."
  sidebar:
    position: "Absolute, right-anchored, 400px wide, full viewport height."
    sections: "Stacked sidebar-section blocks; each section has a left-aligned title and a horizontal row of contents."
    overlay: "Invisible #closeArea (opacity 0, flex:1) acts as a click-outside dismiss target."
  map_list:
    layout: "Wrapping flex grid of 380px-wide map cards on the dark canvas."
    card: "Tan plate showing a thumbnail above a centered, lowercased map name."

ui_patterns:
  primary_action_button:
    surface: "#C2B7A3"
    border: "1px solid #5C513D"
    label: "Black icon, no text"
    states:
      hover:
        surface: "#7B6C51"
        glyph: "Inverted (white)"
      focus:
        glyph: "Inverted (white)"
      active: "Same as hover"
  brand_link:
    color: "#9A8866"
    decoration: "none"
    weight: "regular"
  card:
    surface: "#9A8866"
    border: "none"
    radius: "0"
    text_color: "#000000"
    decoration: "none"
  panel:
    surface: "#7B6C51"
    border: "none"
    radius: "0"
    inset_left: "20px"

accessibility:
  contrast:
    title_on_canvas: "#9A8866 on #282C34 — ~5.2:1, meets WCAG AA for large text."
    body_on_card: "#000 on #9A8866 — ~9:1, meets WCAG AAA."
    glyph_on_button: "#000 on #C2B7A3 — ~10:1, meets WCAG AAA."
  focus: "Native browser focus ring is preserved; no custom suppression."
  reduced_motion: "Honored for the spinning logo and other decorative motion."

assets:
  background_imagery:
    type: "Photographic in-game raid map screenshots, encoded as WebP (~76% size reduction vs source PNG)."
    treatment: "Used full-bleed as the drawing surface; thumbnails at 380px wide for the selector grid."
  drawing_surface:
    engine: "fabric.js canvas; supports pencil strokes, eraser, undo, marker stamps, pan/zoom."
    background: "The current map image, fit-to-viewport on load and on map switch."

tone_and_voice:
  product_register: "Terse, lowercased, utilitarian — labels read like equipment tags ('customs', 'reserve', 'factory')."
  copy_style: "Imperative and brief; the product is a tool, not a tutorial."
---

# Tarkov Debrief — Visual Identity

## Concept

Tarkov Debrief is a tactical strategy board for reviewing Escape from
Tarkov raids. The interface is meant to feel like a printed field
debrief stapled to a steel clipboard: photographic raid maps under
hand-drawn red grease-pencil annotations, framed by tan canvas
toolbars with riveted-looking borders. It deliberately rejects the
glassy, rounded, animated tropes of consumer SaaS in favor of
something that reads as **issued equipment** — sharp corners, dense
chrome, a small but purposeful set of glyphs, and the same in-game
typeface (Bender) the source material uses.

The result is a UI that is loud about its subject matter without ever
showing a single piece of source-game art outside the maps
themselves. Two color families — gunmetal canvas and worn khaki — do
almost all of the work.

## Palette

The palette is built around **two surfaces** and **three tan tones**:

- **Gunmetal canvas (`#282C34`)** is the world. It backs the header
  bar, the map-selector grid, and any chrome that is not a control.
  It reads almost-black at a glance but has a faint blue cast that
  keeps it from looking dead.
- **Khaki (`#9A8866`)** is the brand. It carries the wordmark, fills
  the toolbar plate, and forms the body of every map card. It's the
  color of a faded canvas tag — neither yellow nor brown, slightly
  desaturated.
- **Light khaki (`#C2B7A3`)** is the "key" surface — it's where your
  fingers go. Every actionable square button uses it.
- **Dark khaki (`#7B6C51`)** is pressure: hover, the slide-out
  sidebar, the moment a control becomes engaged.
- **Chocolate (`#3D3629`)** and **walnut (`#5C513D`)** are not used
  as fills — only as 1–2px borders that frame the tan plates and
  give them a stamped/metal-clad quality.

Drawing color defaults to **bright tactical red (`#FF0000`)**, the
unmistakable color of a grease-pencil arrow on a printed map. A small
preset palette (the Twitter-picker swatch row) lets users switch to
warmer or cooler accent colors without leaving the tactical register.

Inside the marker SVGs, a separate sub-palette of olives, gunmetals,
and bone tones (`#474836`, `#4B4B48`, `#929292`, `#232425`, `#C6B29C`)
shades the PMC and Scav silhouettes so they sit naturally on top of
the green/grey raid maps without competing with the user's strokes.

## Typography

A single typeface, **Bender**, sets the entire interface. It's the
condensed, slightly stenciled sans the source game uses for HUD chrome
and operator menus. Locally-installed copies are preferred; otherwise
the bundled WOFFs (regular and black) are served. Two weights are
used and only two — regular for body, black for emphasis on
square-button glyphs that need to stay readable at 40px.

The wordmark in the top-left uses a fluid `calc(10px + 2vmin)` size,
which lands around 28px on a desktop monitor and gracefully shrinks
on smaller viewports. Map names are intentionally lowercased
("customs", "reserve", "factory") — this matters: it's the equipment-tag
register the rest of the product is written in. Title-case here would
feel marketing-y and break the tone.

## Geometry & Surfaces

Every corner is **square**. There are no rounded radii anywhere in
the system — not on buttons, not on cards, not on the sliding panel.
This is load-bearing: round corners would soften the field-issued feel.

Surfaces are **flat**. The only shadows in the product are the gaussian
drop-shadows baked into the marker SVGs themselves (a 2.5px blur at
25–50% opacity), used to lift the silhouettes off whatever map terrain
they are stamped onto. The chrome itself does not float, hover, or
glow.

Borders carry the visual weight that elevation usually would. The
toolbar gets a 2px chocolate frame; each button inside gets a 1px
walnut frame. The result reads like a riveted plate of buttons rather
than a row of independent CSS controls.

## Layout

The shell is a thin **dark header strip** (50px min-height) above a
**full-bleed canvas**. The header has the wordmark and a github link
on the left, and a single tan toolbar — six square 40×40 buttons —
floated to the right. There is no secondary navigation, no breadcrumb,
no footer. The product has one job per screen.

The **map selector** is a wrapping flex grid of map cards on the
gunmetal canvas. Each card is a 380px-wide tan plate showing a
photographic thumbnail above a centered lowercase label.

The **marker drawer** is a 400px-wide dark-khaki panel that slides in
from the right edge (`right: -100vw → 0`) with a default ease
transition. The remaining viewport is filled by an invisible
click-outside region that dismisses the panel. Inside the panel,
sections stack vertically; section contents flow horizontally so
marker buttons sit in a row alongside the color picker.

## Motion

Motion is **purposeful and rare**. The only first-class transition in
the chrome is the sidebar slide. Hover on the toolbar buttons is a
crisp instant swap (background darkens, glyph inverts), not a
fade — closer to a mechanical click than a UI animation. A small
decorative spinning-logo animation exists but is gated behind
`prefers-reduced-motion: no-preference`, in line with the system's
respect for accessibility preferences.

## Iconography

Icons are **hand-drawn line glyphs**, mostly 38×38 SVGs with a single
1px black stroke on transparent backgrounds. They look closer to
margin sketches than to a polished icon set, and that's intentional —
they continue the grease-pencil-on-map metaphor that the drawing
brush establishes.

Hover treatment is unified: the glyph color-inverts to white via a
CSS `filter: invert(100%)` while the button surface darkens to the
khaki-dark fill. The same trick works across both photographic icons
(the github mark) and pure-vector icons (pencil, eraser, etc.) without
needing per-icon hover assets.

The marker glyphs are larger illustrative pieces — small caricatures
of PMC operators in three armor weights and a Scav silhouette — drawn
in olive/gunmetal/bone shades and finished with a soft drop shadow so
they pop off any map background.

## Tone & Voice

Lowercased, terse, and instrumental. Map names are tags, button
labels are verbs, copy is functional. The product never explains
itself in long sentences inside the UI — the README does that. Inside
the chrome, every word is sized to fit a 40px button or a 380px card
label.

## In One Line

A flat, square-cornered, two-tone tactical workspace — gunmetal
canvas under tan toolbars, set in Bender, animated only when it has
to be — that treats raid review as field work rather than as a
product demo.
