---
name: NoteMinds
description: Study documents turned into a Vietnamese school notebook you read, drill and come back to.
colors:
  paper: "#f8f8f7"
  ink: "#120f5a"
  ink-soft: "#3a3778"
  cta-ink: "#282782"
  on-cta: "#ffffff"
  rule: "#c4c3e4"
  rule-faint: "#f0f0f8"
  rule-grid: "#f4f4f9"
  margin-red: "#ec8a85"
  pen-red: "#cc2219"
typography:
  doc-title:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "17.4px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 90"
  headline:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: "53.2px"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: "39.9px"
  body:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "17.7px"
    fontWeight: 400
    lineHeight: "26.6px"
  body-narrow:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.35
    fontVariation: "'wdth' 90"
  label:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.2
  caption:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  pen-mark:
    fontFamily: "'Patrick Hand', cursive"
    fontSize: "19.5px"
    fontWeight: 400
    lineHeight: 1
rounded:
  mark: "4px"
  button: "5px"
  card: "6px"
  field-chat: "8px"
  sheet: "12px"
  round: "50%"
spacing:
  row: "26.6px"
  gutter: "23px"
  margin-left: "51px"
  margin-right: "46px"
  touch: "44px"
components:
  button-primary:
    backgroundColor: "{colors.cta-ink}"
    textColor: "{colors.on-cta}"
    rounded: "{rounded.button}"
    height: "44px"
    typography: "{typography.title}"
  button-text:
    textColor: "{colors.ink}"
    height: "44px"
    padding: "0 4px"
  button-round:
    textColor: "{colors.ink}"
    rounded: "{rounded.round}"
    size: "44px"
  step-cell:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    height: "74px"
    padding: "4px 2px 6px"
  step-cell-hover:
    backgroundColor: "{colors.rule-faint}"
  name-label:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.doc-title}"
    padding: "7px 14px 0"
  notebook-cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "4px 8px 8px 4px"
    padding: "14px 10px"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    height: "46px"
    padding: "0 12px"
  grade-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    height: "52px"
  grade-button-again:
    textColor: "{colors.pen-red}"
  due-mark:
    textColor: "{colors.pen-red}"
    typography: "{typography.pen-mark}"
    height: "51px"
    padding: "0 18px 2px"
---

<!-- Recorded from the shipped build (client/src/styles.css, commit 13c5ab5) on 2026-10-07. Light theme is the reviewed world; dark tokens are PROVISIONAL (see Colors). -->

# Design System: NoteMinds

## Overview

**Creative North Star: "Vở ô li"**

Every document is a Vietnamese school notebook used as a working typographic system. The ô li ruling is the baseline grid, not a backdrop: one row (26.6px) is one line of body text, each row closed by a strong violet line with three faint lines inside it and faint verticals marking the squares. The learner's material is set in purple-black ink; a red ballpoint belongs to review alone, circling what is due and marking what was forgotten. A nhãn vở name label with a double border and scooped corners identifies each document, and a double red margin rule runs down the left of every page.

The world is ink on paper and nothing else: flat surfaces, line-drawn controls (1.5px ink strokes), one filled ink button per screen. Hand-drawn strokes exist only as three raster plates (the red due circle, the ink step underline, the violet key-term underline) and as Patrick Hand lettering for red-pen marks. Body text is never handwritten. The world refuses the AI-SaaS dashboard: no gradient tiles, no sparkles, no toolbar of a dozen buttons over tabs.

Density is a reading density: generous row height, a 65ch measure, one primary action in the thumb zone. Mobile is the native size; wider screens open the notebook rather than adding chrome.

**Key Characteristics:**
- Ruling-as-baseline: line-heights are multiples of one row (26.6px).
- Two inks: purple-black for everything the learner owns, red ballpoint only for review state.
- Line-drawn components (1.5px ink borders) on flat paper; shadows only on floating layers.
- One variable family (Archivo, width axis) plus one hand for red-pen marks.
- Hand-drawn marks are raster plates with embedded provenance, never CSS imitations.

## Colors

Cool white paper, purple-black ink, violet ruling and one red ballpoint; a two-ink world, not a palette.

### Primary
- **Purple-Black Ink** (`ink`): all text, line-drawn borders on cards, fields, bubbles, mind-map branches; the nhãn vở frame stroke is drawn in this ink.
- **Notebook Cover Ink** (`cta-ink`): the single filled primary action ("Học tiếp", "Bắt đầu ôn", submit) and the focus ring (2px outline, 2px offset). Hover mixes 12% paper into it. Text on it is `on-cta` white.

### Secondary
- **Red Ballpoint** (`pen-red`): due counts, the due circle, quiz score and explanations, wrong answers, the "again" grade, failed-step slash, error notes, destructive menu item, invalid field border, text caret and selection tint (22%).

### Neutral
- **Cool Notebook Paper** (`paper`): every surface, including floating sheet, menu and cards. Cool white, never cream.
- **Faded Ink** (`ink-soft`): secondary text (dates, counts, hints, step status).
- **Ô Li Strong Rule** (`rule`): the strong line closing each row, structural dividers (step strip, sheet head, app header), notebook spine lines, scrollbar thumb.
- **Ô Li Faint Rule** (`rule-faint`): the three thin lines inside a row; also the quiet hover fill for icon buttons, menu items and grades.
- **Ô Li Grid** (`rule-grid`): faint verticals of the squares.
- **Margin Red** (`margin-red`): the double margin rule only.

### Dark theme (PROVISIONAL)
A "notebook at night" token set ships under `:root[data-theme='dark']` (paper #15132b, ink #ecebf8, ink-soft #c3c1e4, cta #c9c6ff, on-cta #15132b, rule #35326b, rule-faint #1f1d42, rule-grid #1b1a3a, margin #b4524e, pen #ff5a4f). It is an open decision ("decide once light exists"), was never captured or reviewed, and is not normative. The three raster plates are fixed-colour (red #E0281F, ink #2E2A6B, violet #3B2FA0) and do not switch with the theme. Treat dark mode as unresolved until it is reviewed.

### Named Rules
**The Red Pen Rule.** Red ballpoint marks review state only: due, wrong, forgotten, failed, destructive. Never decoration, never a brand accent, never a second CTA colour.

**The Two Inks Rule.** Text, borders and the primary action are purple-black ink; there is no third hue. New states are expressed with fill, stroke and the red pen, not new colours.

## Typography

**Display / UI Font:** Archivo Variable (with system-ui, sans-serif), loaded from `@fontsource-variable/archivo/standard.css`
**Pen Font:** Patrick Hand (with cursive), `@fontsource/patrick-hand/400`

**Character:** One grotesque family worked on its width axis: UI and headings at 100% width, long reading and card text at 90% (`--narrow`), which matched the approved comp's lettering on a 75-glyph Vietnamese sample (width +0%, weight +1%). Both faces carry full Vietnamese diacritics; that requirement ruled out the first font-match candidates. Patrick Hand is the red pen's handwriting and appears nowhere else.

### Hierarchy
- **Headline** (700, 25px, two rows = 53.2px, -0.01em): step heading on the page ("Tóm tắt"). Auth title 26px/700, shelf title 22px/700.
- **Doc title** (500, 17.4px mobile / 22px ≥768px, 1.35, 90% width): the document name inside the nhãn vở label; overflow-wraps anywhere.
- **Title** (600, 19px, 1.5 rows): sub-headings inside a summary; the CTA (600, 17px, +0.01em) and sheet head (600, 18px) sit at this weight.
- **Body** (400, 17.7px, line-height exactly one row 26.6px, max 65ch, ragged right with `text-wrap: pretty`): summary prose, quiz questions. Paragraph spacing is one row. Chat answers drop to 16.5px.
- **Body narrow** (16.5-19px at 90% width): quiz options, mind-map nodes, flashcard backs, notebook names.
- **Label** (400, 14.5px, 1.2): step cells; menu and text buttons 15px.
- **Caption** (400, 12-12.5px, `ink-soft`): step status, meta under the title, notebook dates, chat button label.
- **Pen mark** (Patrick Hand 400, 18-30px, red): due count 19.5px (26px on the library), pen notes 20px, quiz explanation 18px, score 30px. The "writing" progress note uses Patrick Hand 21px in ink.

### Named Rules
**The One Row Rule.** Reading text sets its line-height to `--row` (26.6px) and block spacing in whole or half rows, so every baseline lands on a strong ô li line (ruling offset -7px).

**The Hand Is the Pen Rule.** Patrick Hand is only for red-pen marks and the transient "writing" note. Body, headings and controls stay in Archivo.

**Key Terms Are Underlined By Hand.** `strong` in prose is weight 500 (not bold) with the violet term-underline plate beneath it, cloned across line breaks.

## Layout

Mobile-first at 360-390px. The study screen stacks: a 52px top bar (back, ⋯), the nhãn vở label inset by the 23px gutter, the four-cell step strip (equal columns, ruled top and bottom, ≥74px tall with the status mark in a fixed slot), then the ruled page with padding 0 46px 112px 51px (text starts right of the double margin at 27px). The primary action and a round chat button sit fixed in an 80px thumb zone (plus safe-area inset), on paper.

At ≥768px the study screen becomes a 180px + fluid grid capped at 960px and centred: the label spans both columns (max 560px), the steps become a left column on the ruling with a strong rule on its right, and the thumb zone becomes sticky under the page column, its button starting on the text edge (78px inset, max 65ch + 78px). At ≥1280px the chat leaves the bottom sheet and becomes a 400px right column sheet.

The library is capped at 1080px with the 23px gutter: today's date, the red-circled due count and the review CTA (full width to 420px), a strong rule, then the shelf: an auto-fill grid of 3:4 notebook cells (min 150px, 14px gap; 2 columns on phones), fixed at 5 columns from 900px. Auth is a single 400px column.

Spacing rhythm is the row: paragraph and question spacing = one row; headings = 1.5 or 2 rows; flashcard minimum = 8 rows. Touch targets are 44px minimum.

## Elevation & Depth

Flat by default. Depth comes from ink lines and the ruling, not shadow. Only layers that float above the page cast a soft, ink-tinted ambient shadow, and they keep a 1.5px ink edge.

### Shadow Vocabulary
- **Sheet lift** (`box-shadow: 0 -8px 28px color-mix(in srgb, var(--ink) 16%, transparent)`): the chat bottom sheet, with a 22% ink scrim behind it.
- **Menu lift** (`box-shadow: 0 10px 24px color-mix(in srgb, var(--ink) 18%, transparent)`): the ⋯ overflow menu.

### Named Rules
**The Paper Stays Flat Rule.** Cards, notebooks, fields and buttons have no shadow at rest or on hover; a notebook lifts by transform (-2px, -0.4deg), not by shadow.

## Shapes

Small, honest corners from stationery: 4px marks and menu items, 5px buttons and grades, 6px cards, fields and menus, 8px chat input, 12px top corners on the mobile sheet, round icon buttons and quiz bubbles. Notebook covers are asymmetric (4px at the spine, 8px at the fore-edge) with two thin spine rules at 9px and 13px. Lines are 1px for ruling and dividers, 1.5px for drawn component edges; new-notebook cells are dashed. The nhãn vở frame is a 60px SVG 9-slice (`border-image` 14 / 14px stretch; 10px on notebook cells): an outer 1.25px and inner 0.8px stroke with concave scooped corners, stroke colour baked per theme.

## Components

### Buttons
Line-drawn, with one ink-filled exception.
- **Shape:** gently squared (5px).
- **Primary:** filled `cta-ink`, white 17px/600 text, 44px tall (48px on auth), an inline arrow icon splitting "Học tiếp → Sơ đồ tư duy". One per screen.
- **Hover / Focus:** hover blends 12% paper into the fill; focus is a 2px `cta-ink` outline at 2px offset; disabled 55% opacity with progress cursor.
- **Text button:** ink, 15px, underlined at 4px offset, 44px min height (cancel, retry).
- **Round button:** 44px circle with 1.5px ink edge for chat; bare 44px icon buttons for back, ⋯, close, with a `rule-faint` hover disc.

### Cards / Containers
- **Notebook cell:** 3:4, 1.5px ink edge, spine rules, nhãn vở label inside, red-circled due count top-right; hover lifts -2px and tilts -0.4deg (200ms). "Vở mới" is the dashed first cell.
- **Flashcard:** 1.5px ink, 6px corners, min 8 rows, flips on Y over 450ms; four grade buttons beneath (again in red pen), keys 1-4 shown as small captions.

### Inputs / Fields
- **Style:** 1.5px ink edge, paper fill, 6px corners, 46px tall, 16px text. Chat textarea grows with content (44-140px), 8px corners.
- **Error:** border turns red pen; message in 14px red below.

### Navigation
- **Step strip:** a tablist of four equal cells (number, label, status mark). The current step is underlined with the ink pen-underline plate. Status marks: filled ink circle = ready, half-filled = generating, hollow = not yet, red slash = failed; optional caption ("Đang tạo") below. At ≥768px the cells become 52px rows with the mark in the right slot.
- **App header:** quiet masthead (brand 19px/700, 1px-ruled bottom), 36px controls with 1px borders.

### Due Mark (signature)
Red-pen count in Patrick Hand set inside the due-circle plate. The circle draws itself in: a left-to-right `clip-path` reveal over 0.7s (`cubic-bezier(0.16, 1, 0.3, 1)`, 0.15s delay). The same plate circles the quiz score and per-notebook due counts.

### Answer Bubbles
26px round ink bubbles lettered A-D; chosen and right answers fill with ink, wrong answers turn red and are struck through.

### Mind Map
An outline drawn as branches: 1.5px ink trunk and 24px ticks per child, root in a 4px-cornered ink box, depth 3 in faded ink.

### Motion
Signature motion is the pen drawing the due circle and step marks filling with ink (fill transition 0.5s, same ease). The flashcard flip, sheet entrance (0.28s, up on mobile, from the right at ≥1280px), notebook lift and the "writing" nib pulse support it. `prefers-reduced-motion` disables the pen draw, ink fill, flip, sheet entrance, notebook lift and nib.

## Do's and Don'ts

### Do:
- **Do** set reading text on `--row` (26.6px) and space blocks in whole or half rows so baselines sit on the strong ô li line.
- **Do** keep a single filled `cta-ink` primary action per screen, in the thumb zone on mobile.
- **Do** draw components with 1.5px ink edges on paper; use 1px `rule` for structural dividers.
- **Do** use the red pen for due, wrong, forgotten, failed and destructive states, and only those.
- **Do** ship hand-drawn marks as raster plates with their generation prompt embedded, colour-matched to the ink they represent.
- **Do** set long reading text and card text at Archivo 90% width; keep headings and UI at 100%.
- **Do** keep 44px minimum targets and a reduced-motion path for every animation.

### Don't:
- **Don't** use red ballpoint as decoration, a brand accent or a second CTA colour.
- **Don't** set body text, headings or controls in Patrick Hand or any handwritten face.
- **Don't** add gradient tiles, sparkles, or a toolbar of feature buttons over the steps.
- **Don't** put shadows on resting surfaces; only the sheet and menu float.
- **Don't** warm the paper toward cream.
- **Don't** treat the dark tokens as reviewed; they are provisional.
