---
name: فرین PMIS
description: Persian control room for gas pipeline and station projects, every party on one live picture
colors:
  night-hull: "#070b14"
  panel-steel: "#101826"
  panel-glass: "rgba(17, 25, 40, 0.72)"
  hairline: "rgba(148, 163, 184, 0.14)"
  ink-bright: "#e5edf7"
  ink-secondary: "#94a3b8"
  ink-muted: "#8593a8"
  daylight-hull: "#eef2f7"
  daylight-panel: "#ffffff"
  daylight-ink: "#0f172a"
  daylight-ink-secondary: "#475569"
  signal-sky: "#38bdf8"
  signal-sky-deep: "#0ea5e9"
  radar-green: "#22ff9e"
  radar-amber: "#f0a836"
  status-done: "#2ecc71"
  status-progress: "#f1c40f"
  status-pending: "#e74c3c"
  status-testing: "#3498db"
  health-green: "#22c55e"
  health-yellow: "#f5b31b"
  health-red: "#ef4444"
  health-high: "#f97316"
  health-blocked: "#94a3b8"
  portfolio-indigo: "#6366f1"
typography:
  display:
    fontFamily: "Vazirmatn, Segoe UI, sans-serif"
    fontSize: "1.55rem"
    fontWeight: 900
    lineHeight: 1.2
  headline:
    fontFamily: "Vazirmatn, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 800
    lineHeight: 1.4
  title:
    fontFamily: "Vazirmatn, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 900
    lineHeight: 1.5
  body:
    fontFamily: "Vazirmatn, Segoe UI, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "Vazirmatn, Segoe UI, sans-serif"
    fontSize: "11.5px"
    fontWeight: 700
    lineHeight: 1.5
  numeric:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "12px"
    fontWeight: 500
    fontFeature: "\"tnum\""
rounded:
  sm: "0.5rem"
  md: "0.7rem"
  lg: "1rem"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.7rem"
  lg: "1rem"
components:
  button-primary:
    backgroundColor: "{colors.portfolio-indigo}"
    textColor: "{colors.ink-bright}"
    rounded: "0.6rem"
    padding: "0 0.8rem"
    height: "34px"
  button-secondary:
    backgroundColor: "{colors.panel-steel}"
    textColor: "{colors.ink-bright}"
    rounded: "0.6rem"
    padding: "0 0.8rem"
    height: "34px"
  input:
    backgroundColor: "rgba(0, 0, 0, 0.2)"
    textColor: "{colors.ink-bright}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  panel:
    backgroundColor: "{colors.panel-steel}"
    rounded: "{rounded.lg}"
    padding: "1rem 1.05rem"
  tab:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.8rem"
    height: "40px"
  chip-health:
    rounded: "{rounded.pill}"
    padding: "0.12rem 0.5rem"
    typography: "{typography.label}"
---

# Design System: فرین PMIS

## Overview

**Creative North Star: "The Control Room"**

فرین PMIS looks and behaves like the control room of a gas transmission network. The room is dark and quiet, the instruments are lit, and nothing moves or glows unless a reading needs attention. Every party to a project, whether employer, consultant, contractor or supervisor, sits in the same room and reads the same instruments. Gauges, the radar, health chips and S-curves carry the story; prose explains what an instrument means, never what it should have said.

Density is high, the way an operator's console is high: 12–13px Persian body text, compact panels, numbers set large and heavy. Translucent glass sits over the night background on the shell (top bar, hub, radar, floating layers). Solid steel panels carry the working content. Each module has exactly one accent colour that identifies its room, while the status and health colours are shared and mean the same thing in every room. A light "daylight" theme mirrors the whole system for office and outdoor use.

The interface is right to left throughout, with Persian digits and Jalali dates on every number and axis. Latin script appears only for established technical terms (EVM, CPI, SPI, BAC, EAC, Stage-Gate) and codes.

**Key Characteristics:**
- Dark night background by default, with a full light mirror under `data-theme="light"`.
- Glass on the shell, solid steel for working panels.
- One accent per module; shared status and health colours.
- Numbers lead: heavy weight, tabular figures, Persian digits.
- One fast ease-out easing for every movement; reduced motion turns movement off.

## Colors

A night palette of navy and steel, lit by signal colours that each carry one meaning.

### Primary
- **Signal Sky** (`signal-sky`): the platform's brand light. Input focus rings, the default top-bar action accent, links and the radar's cyan ring. Its deeper step (`signal-sky-deep`) is the pressed or saturated variant.

### Secondary
- **Module accent**: every module owns exactly one accent, set where the module mounts (portfolio uses **Portfolio Indigo**, `portfolio-indigo`; others use amber, teal, violet, rose and similar). It colours the module's header icon, active tab pill, panel-title icons, primary button and focus outlines inside that module, and nothing else.

### Tertiary
- **Radar Green** (`radar-green`) and **Radar Amber** (`radar-amber`): reserved for the project radar's sweep, grid and signal markers.

### Neutral
- **Night Hull** (`night-hull`): the app background, under a faint sky and green radial glow.
- **Panel Steel** (`panel-steel`): solid working panels, pickers and secondary buttons.
- **Panel Glass** (`panel-glass`): the translucent shell surface, always paired with an 18px backdrop blur.
- **Hairline** (`hairline`): every border and divider; at 14% slate it separates without drawing.
- **Ink Bright / Secondary / Muted** (`ink-bright`, `ink-secondary`, `ink-muted`): primary text, supporting text and hints, and the faintest captions.
- **Daylight Hull / Panel / Ink** (`daylight-hull`, `daylight-panel`, `daylight-ink`, `daylight-ink-secondary`): the light-theme mirrors of the above.

### Status and health
- **Work status** (`status-done`, `status-progress`, `status-pending`, `status-testing`): completed, in progress, not started and under test, for lines, welds and activities.
- **Health** (`health-green`, `health-yellow`, `health-high`, `health-red`, `health-blocked`): healthy, needs attention, high, critical, and gate blocked or no data. Risk levels use the same ramp: low, medium, high, critical.

### Named Rules
**The One Accent Rule.** A module shows exactly one accent colour. A second hue on a module screen must come from the status or health set and must mean a state.

**The Shared Meaning Rule.** Green, yellow, orange and red mean the same thing in every module. Never use a health colour as decoration or as a module accent.

## Typography

**Body Font:** Vazirmatn (with Segoe UI, sans-serif)
**Numeric Font:** JetBrains Mono, for tabular numbers in dense tables only
**Latin Tag Font:** Montserrat, only for the hub's English module tags and the radar's reference typography

**Character:** a single Persian sans carries everything from headings to captions, with hierarchy built from weight (400 to 900) rather than size jumps. It reads like an instrument label: compact, firm and legible at small sizes.

### Hierarchy
- **Display** (900, 1.35–1.55rem, 1.2): KPI values and the big numbers in gauges and donut centres.
- **Headline** (800, 14px, 1.4): the module name in its header.
- **Title** (900, 13.5px, 1.5): panel titles, always paired with an accent-coloured icon.
- **Body** (400–600, 12–13px, 1.8): panel text and table cells; hints are capped at 80ch.
- **Label** (700, 11–11.5px): KPI labels, chips, legends, tab and picker captions.

### Named Rules
**The Persian Digit Rule.** Every number a person reads, including chart axes, tick labels, heat-map cells and dates, is written in Persian digits, and dates are Jalali. Format through the shared helpers (`faNum`, `faDigits`, `formatJalali`); a Latin digit on screen is a defect.

**The Tabular Rule.** Numbers that line up in columns use tabular figures. JetBrains Mono is used only inside dense tables; on cards, numbers stay in Vazirmatn so the Persian digits match the text around them.

## Layout

Each module is a full-height column: a glass header bar (module icon, name and one-line purpose, plus the shared top-bar actions), an optional sticky scope bar (horizontally scrolling tabs, then scope pickers), then a scrolling content area padded 12px on phones and 16px from 640px up.

Content is built from a KPI row and panel grids. KPI rows auto-fit tiles with a minimum of 11.5–12rem, gap 0.7rem. Panels sit in two-column grids on desktop and collapse to one column on phones. Spacing is tight inside groups (0.25–0.5rem) and wider between groups (0.7–1rem).

The single breakpoint that changes structure is 640px. Below it, grids stack, pickers go full width (or share one row), and tables scroll horizontally inside their wrapper rather than squeezing.

**The Two-Desk Rule.** Every screen is designed for both the office desktop and the site phone. A flow used on site must be complete at 390px wide; a management view must hold its grid at 1440px.

## Elevation & Depth

Depth comes from layering, not lifting. The night background sits at the bottom; glass panels float over it with an 18px blur, 140% saturation and one soft ambient shadow (`0 8px 32px rgba(2, 6, 23, 0.28)`). Solid steel panels inside a module are flat and separated by hairline borders. Floating lists and popovers carry a tinted drop shadow so they read above animated cards.

### Shadow Vocabulary
- **Glass ambient** (`box-shadow: 0 8px 32px rgba(2, 6, 23, 0.28)`): the glass panel and shell bars.
- **Popover** (`box-shadow: 0 22px 44px -20px rgb(15 23 42 / 0.45)`): picker lists and dropdowns.
- **Accent lift** (`box-shadow: 0 10px 26px -16px <accent at 70%>`): an open picker or a pressed selection, tinted from the module accent.

### Named Rules
**The Flat-Panel Rule.** Working panels have no shadow at rest. A shadow means the layer floats: glass shell, open list or dialog.

## Shapes

Corners are soft and graded by size. Inputs and small buttons use 0.5–0.6rem, tabs 0.7rem, pickers 0.9rem, panels and KPI tiles 1rem, and chips, badges and the sliding tab indicator are full pills. Borders are always one hairline (1px). Colour is never carried by a thick edge stripe; a card's tone lives in its icon, a tinted border and a faint tinted gradient.

**The Hairline Rule.** Borders are 1px. A coloured border thicker than 1px on one side of a card, list item or alert is not part of this system.

## Components

### Buttons
- **Shape:** gently rounded (0.6rem), minimum height 34px.
- **Primary:** white text on a 135° gradient of the module accent to its deeper step.
- **Secondary:** primary text on Panel Steel with a hairline border.
- **States:** press scales to 0.97; focus shows a 2px accent outline offset 2px; disabled drops to 50% opacity with a not-allowed cursor.

### Tabs
- **Style:** a horizontally scrolling row of 40px-high tabs (icon plus label, 12.5px, weight 700) in secondary text, with arrows when the row overflows.
- **Active:** a single accent-filled pill slides under the active tab (260ms) and turns its label white. There is one indicator, never a per-tab fill.

### Inputs / Fields
- **Style:** full-width, 0.5rem corners, a dark 20% wash (4% slate in light), hairline border, 14px text.
- **Focus:** the border turns Signal Sky with a 3px sky ring at 16%.
- **Dates:** always the shared Jalali picker, never a native date input.

### Cards / Containers
- **Panel:** Panel Steel, 1rem corners, hairline border, padding 1rem. The header has a title with an accent icon and an optional hint line in secondary text, with actions aligned to the far side.
- **KPI tile:** 1rem corners, a border tinted 22% from its tone, a faint radial tint from the top corner, an icon chip in the tone colour, a label, a heavy value and a sub line. A tile that drills down is a button and scales on press.
- **Empty state:** a dashed hairline box with centred secondary text that says what is missing and where it comes from.

### Chips
- **Health / status chip:** a pill with a 7px dot, 11px bold label in the status colour, the background at 14% and the border at 35% of that colour.

### Scope Picker
- **Style:** 44px-high trigger with an icon chip in its tone, a small caption over the bold current value, and a chevron that rotates when open. The open list floats with the popover shadow and animates in over 170ms.

### Instruments (signature)
The control room's instruments are the system's signature: semicircular gauges with a tinted arc and a needle that settles into place, donuts with a clickable legend that drills into the projects behind each slice, the 5×5 risk heat map, S-curves and the project radar. Every instrument is clickable where a list of records stands behind it, and every value comes from records, never a typed-in percentage.

## Do's and Don'ts

### Do:
- **Do** give each module exactly one accent and use it only for its icon, active tab, panel-title icons, primary button and focus outline.
- **Do** write every visible number in Persian digits and every date in Jalali, including chart axes and ticks.
- **Do** keep a minus sign attached to its number inside RTL text (an LTR isolate), as `fmtMoney` does.
- **Do** use glass for the shell and floating layers and solid steel for working panels.
- **Do** make drill-down tiles, donut slices and heat-map cells real buttons with press feedback and a visible focus ring.
- **Do** design every flow at 390px and 1440px, and keep reduced motion working.

### Don't:
- **Don't** add a 3px coloured stripe to the side of a card, list item or log row.
- **Don't** use a status or health colour as decoration or as a module accent.
- **Don't** show Latin digits or Gregorian dates in the interface.
- **Don't** mix spellings of the same term within the product (one spelling per concept, for example «پورتفولیو»).
- **Don't** fill empty or unapproved data with estimates that look real; show the empty state instead.
