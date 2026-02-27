# TenWorks Facelift Design System
## Source of Truth — Constellation Deploy (structure) + TenWorks Main (brand)

This document is the **single source of truth** for the TenWorks portal UI/UX overhaul. It references the **Constellation deploy branch** as the gold standard for structural improvements and the **TenWorks main branch** for brand identity. **No .html or .css files are modified until this blueprint is approved.**

---

# Task 1: The Color & Variable Fusion

## 1.1 New `:root` CSS Variable Tree

Canonical primary brand color is **TenWorks Gold**; `--primary-blue` exists only as a legacy alias to avoid breaking existing selectors. All page-scoped overrides that rely on undefined `--text-bright` or `--text-dim` must be replaced by these global definitions.

```css
/* ==========================================================================
   TENWORKS FACELIFT — CANONICAL :root (inject into css/style.css)
   ========================================================================== */
:root {
    /* --- Primary brand (Gold is canonical) --- */
    --primary-gold: #b38c62;
    --primary-blue: var(--primary-gold);   /* legacy alias; do not use for new work */

    /* --- Backgrounds (TenWorks Dark Slate family) --- */
    --bg-dark: #1F2329;
    --bg-medium: #23272e;
    --bg-light: #1f2329;

    /* --- Text (global; prevents page-scoped breaks) --- */
    --text-light: #ffffff;
    --text-bright: #ffffff;                /* alias for headings / emphasis */
    --text-medium: #b0b0b0;
    --text-dim: #9aa0a6;                   /* secondary labels, metadata */
    --text-muted: #9aa0a6;                 /* same as --text-dim for compatibility */

    /* --- Borders & gradients --- */
    --border-color: #454a52;
    --gradient-start: #1F2329;
    --gradient-end: #181b20;

    /* --- Semantic (status, alerts, pills) --- */
    --danger-red: #e74c3c;
    --warning-yellow: #f1c40f;
    --completed-color: #98ff98;
    --success-color: #28a745;
    --error-color: #dc3545;
    --meeting-purple: #8A2BE2;
    --secondary-gray: #6d6d6d;

    /* --- Shadows --- */
    --shadow-light: rgba(0, 0, 0, 0.3);
    --shadow-medium: rgba(0, 0, 0, 0.5);
    --shadow-strong: rgba(0, 0, 0, 0.7);

    /* --- Glassmorphism (TenWorks-tuned; see § 1.2) --- */
    --glass-overlay-bg: rgba(31, 35, 41, 0.6);      /* #1F2329 @ 0.6 */
    --glass-overlay-blur: 4px;
    --glass-content-bg: rgba(35, 39, 46, 0.7);      /* #23272e @ 0.7 */
    --glass-content-blur: 24px;
    --glass-border: rgba(69, 74, 82, 0.5);          /* #454a52 @ 0.5 */
    --glass-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    --glass-radius: 1rem;

    /* --- Spacing scale (Constellation) --- */
    --spacing: 0.25rem;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 1rem;

    /* --- Typography --- */
    --font-headers: 'Rajdhani', sans-serif;
    --font-body: 'Inter', 'Montserrat', sans-serif;
    --font-main: var(--font-body);
}
```

**Rule:** Any page or partial that currently uses inline or scoped `--text-bright` / `--text-dim` (e.g. in `projects.css` or inline styles) must be updated to reference these global variables so that theme and facelift changes apply consistently.

---

## 1.2 Glassmorphism Recipe for TenWorks

Use **Constellation’s structural constants** (24px backdrop-blur, 1rem border-radius) and **TenWorks Dark Slate** for background transparency so glass panels sit correctly on `#1F2329`.

**Constants from Constellation (do not change):**
- Backdrop blur: **24px** for the content panel, **4px** for the overlay.
- Border radius: **1rem** for modal/glass panels.

**TenWorks-adjusted transparency (rgba):**
- Overlay: `rgba(31, 35, 41, 0.6)` — Dark Slate `#1F2329` at 60% opacity.
- Content panel: `rgba(35, 39, 46, 0.7)` — Card tone `#23272e` at 70% opacity.
- Border: `rgba(69, 74, 82, 0.5)` — `#454a52` at 50% opacity.

**Applied recipe:**

| Element | Property | Value |
|--------|----------|--------|
| Modal backdrop | background-color | `var(--glass-overlay-bg)` or `rgba(31, 35, 41, 0.6)` |
| Modal backdrop | backdrop-filter | `blur(4px)` |
| Modal content | backdrop-filter | `blur(24px)` |
| Modal content | background-color | `var(--glass-content-bg)` or `rgba(35, 39, 46, 0.7)` |
| Modal content | border | `1px solid var(--glass-border)` |
| Modal content | box-shadow | `var(--glass-shadow)` |
| Modal content | border-radius | `var(--glass-radius)` (1rem) |

Use this for `.modal-backdrop`, `.modal-content`, `.email-view-modal`, and any other overlay panels. No blue/slate from Constellation in the glass; TenWorks Dark Slate only.

---

## 1.3 Global Text Aliases

- **`--text-bright`** = `#ffffff`. Use for: row primary text, card titles, button text on dark, and any “headline” that must read as primary.
- **`--text-dim`** = `#9aa0a6`. Use for: secondary labels, metadata, “as of” dates, placeholders, and any supporting copy that should recede.

Define both in `:root` (§ 1.1) and remove page-scoped redefinitions (e.g. in `projects.css` or inline styles on Schedule, Talent, Inventory) so the design system stays consistent.

---

# Task 2: Structural Soul & Precision Engineering

## 2.1 Actionable Row Hierarchy

Use this for every clickable list row that has a primary label and secondary metadata (Contacts, Accounts, Projects list, Schedule trade list, Talent people list, etc.).

**Anchored primary:**
- One line that identifies the row (name, title, project name).
- CSS: `font-weight: bold` (or 600), `font-size: 1em`, `color: var(--text-bright)`, `margin-bottom: 2px`.
- No truncation unless a max-width is set; prefer `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` only when the container is constrained.

**Muted secondary:**
- One line of metadata (account name, role, date range, status).
- CSS: `font-size: 0.85em`, `color: var(--text-dim)` (or `var(--text-medium)`).

**Row container (Constellation `.list-item`):**
- `padding: 0.625rem 0.9375rem` (comfortable) or Condensed tokens when `data-density="condensed"` (§ 3.2).
- `border-bottom: 1px solid var(--border-color)`.
- `display: flex; justify-content: space-between; align-items: center`.
- Hover: `background-color: var(--bg-light); transform: translateX(2px)`.
- Selected: `background-color: var(--primary-gold); color: var(--text-light); font-weight: bold` and `box-shadow: inset 3px 0 0 0 var(--primary-gold)`.

Apply the same hierarchy in table rows when the first column is “primary” and others are “metadata” (e.g. Schedule grid rows, Talent matrix row labels).

---

## 2.2 Sub-Pixel Precision for ERP Views

For complex ERP views (Gantt grids, talent matrix, inventory tables), use **sub-pixel precision** so lines and grid cells align without 1px gaps or double lines.

**Rule: center or split at 50% with 1px correction**
- Vertical or horizontal center of a line/grid: use `calc(50% - 1px)` for positioning (or equivalent) so the line sits on a pixel boundary when the container has an even height/width.
- Connecting lines (e.g. org chart, Gantt dependencies): use `left: 50%; transform: translateX(-50%)` for horizontal centering; where a line must meet an edge exactly, use `calc(50% - 1px)` for the offset so the stroke doesn’t blur across two pixels.

**Grids:**
- For CSS Grid or flex-based ERP grids, define column widths with `calc()` so total width is exact (e.g. `calc((100% - N * 1px) / N)` for N columns with 1px borders) to avoid rounding drift.
- Gantt date columns: use a fixed pixel or rem column width and ensure the track uses `background-size` or borders that align to those columns (e.g. `background-position: 0 calc(50% - 1px)` if a line must sit between rows).

Document in code comments: “Sub-pixel precision: calc(50% - 1px) for visual stability in ERP grids/lines.”

---

## 2.3 Global Loader Implementation

**Visual:** Adapt the Constellation deploy **animated constellation spinner** (line-draw + twinkling stars) to TenWorks:
- Stroke and star fill use **TenWorks Gold**: `var(--primary-gold)` or `#b38c62`.
- Overlay: same glass treatment as modals — `rgba(31, 35, 41, 0.6)` and `backdrop-filter: blur(8px)` (Constellation uses 8px for the loader).
- “Loading…” text: `color: var(--text-bright)`.

**Integration with async data fetching:**
1. **Bootstrap:** On app init (e.g. in shared_constants.js or the first script that runs), call `showGlobalLoader()` before any async work (auth, nav, first data fetch).
2. **Hide when ready:** Call `hideGlobalLoader()` when:
   - Initial layout is rendered (nav, shell), and
   - The first critical data for the current page has been fetched (or after a minimum display time, e.g. 400ms, to avoid flash).
3. **Page-level fetches:** For heavy ERP pages (Schedule, Talent, Inventory), optionally show the global loader again when the user switches context (e.g. new week, new trade) and hide when the new data is rendered. Use a single loader instance; do not stack multiple overlays.
4. **API:** Export `showGlobalLoader()` and `hideGlobalLoader()` from the shared module (e.g. `js/shared_constants.js`). The overlay markup lives in a single place (e.g. partial or first line of `content-area` wrapper) included by all CRM/ERP pages. Standalone pages (e.g. status.html) can keep their existing loading UX unless they are brought into the same shell.

---

# Task 3: ERP Component Blueprinting

## 3.1 Pattern Transfer (Non-CRM Pages)

### Talent & Schedule

- **List/Detail split (Constellation pattern):**
  - **Talent:** Left = scrollable list of people (each row = actionable row: name primary, role/secondary). Right = detail panel (assignments, notes, availability). Same structure as Contacts list + details-panel.
  - **Schedule:** Left = scrollable list of trades (each row = actionable row: trade name primary, count or secondary). Right = timeline/Gantt or day-detail. Same structure as list + detail.
- **Table pattern (Constellation Deals Table):**
  - **Schedule:** The Gantt grid = table: sticky header row (dates), body rows = trades; cell alignment and borders follow the sub-pixel rules (§ 2.2). Use table or CSS grid with table-like semantics.
  - **Talent:** The matrix (people × dates) = table: header row = dates, first column = people (actionable row style), cells = assignments. Use Condensed Mode tokens for the matrix body (§ 3.2).

Apply Constellation’s list-item and details-panel spacing, typography, and selection state; and the Deals table’s sticky header, sortable header (if applicable), and row hover.

### Inventory

- **KPI cards (Dashboard pattern):** Top of page = row of KPI cards (Total Stock Value, Low Stock Alerts, Items Allocated, etc.). Use the same grid and card style as Command Center / Dashboard (e.g. `repeat(auto-fit, minmax(200px, 1fr))`, label + value hierarchy).
- **Deals Table logic:** Main content = data table (items, SKU, category, quantity, etc.). Use the same table structure as Deals: sticky header, row hover, optional filter pills above (e.g. category). Prefer table for ledger density; Kanban is optional later for “by category” or “by status” views.

So: **Inventory = Dashboard KPI strip + Deals-style table** (and optional filter pills).

---

## 3.2 Condensed Mode Specification

Condensed Mode is for high-density ERP ledger/schedule views. It keeps the same “breathable” structure (spacing scale, typography hierarchy) but uses **tighter spacing tokens** so more rows fit without feeling cramped.

**Spacing tokens (add to `:root` or a `.condensed` scope):**

| Token | Comfortable (default) | Condensed |
|-------|------------------------|-----------|
| List row padding (block) | `0.625rem` | `0.375rem` |
| List row padding (inline) | `0.9375rem` | `0.75rem` |
| Table cell padding | `0.5rem 0.75rem` | `0.35rem 0.6rem` |
| Table body font-size | `0.875rem` | `0.8125rem` (13px) |
| Table header font-size | unchanged | unchanged |
| KPI card padding (optional) | `1rem` / `1.25rem` | `0.75rem` / `1rem` |

**Activation:** A class on the container (e.g. `.erp-condensed` or `data-density="condensed"`) or a body class (e.g. `body.condensed-mode`). Do not change header font-size or weight in Condensed Mode.

**Where to use:** Schedule (trade list + Gantt grid), Talent (people list + matrix), Inventory (table). Optionally a user preference or a per-page toggle in the header.

---

# Task 4: Implementation Protocol

## 4.1 Order of Operations

1. **Global variable injection**
   - Update `css/style.css` `:root` with the full variable tree (§ 1.1), including `--text-bright`, `--text-dim`, and glass tokens.
   - Replace any existing `--primary-blue` value with `var(--primary-gold)` (or keep alias) and add `--primary-gold: #b38c62`.
   - Add Condensed Mode spacing tokens (as variables or under a class).

2. **Shared layout / nav overhaul**
   - Apply glassmorphism recipe to `.modal-backdrop`, `.modal-content`, `.email-view-modal` (and any other overlay panels) in `css/style.css`.
   - Introduce Global Loader markup (one overlay element) in the shared shell or partial used by CRM/ERP pages; add loader CSS (TenWorks Gold spinner, overlay blur).
   - Export `showGlobalLoader` / `hideGlobalLoader` from the shared JS module and wire bootstrap to show on init and hide when shell + first data are ready.
   - Ensure nav and shell use `--text-bright` / `--text-dim` and `--primary-gold` (no ad-hoc colors).

3. **Module-specific page modernizations**
   - **CRM pages (Accounts, Contacts, Deals, etc.):** Replace page-scoped `--text-bright` / `--text-dim` with global variables; apply Actionable Row hierarchy to list rows; align modals to glass recipe.
   - **Projects:** List/detail + KPI bar; apply list-item and details-panel patterns; optional Condensed toggle.
   - **Schedule:** List/detail + table (Gantt); sub-pixel precision for grid; Condensed Mode; filter pills if applicable.
   - **Talent:** List/detail + table (matrix); Actionable Row on people list; Condensed Mode for matrix.
   - **Inventory:** KPI strip + Deals-style table; optional filter pills; Condensed Mode for table.
   - **Command Center:** KPI grid and task list already aligned to Dashboard pattern; ensure variables and loader are used.

---

## 4.2 File-by-File Plan (Surgery Map)

| Order | File(s) | Action |
|-------|---------|--------|
| 1 | `css/style.css` | Inject full `:root` variable tree (§ 1.1); add `--text-bright`, `--text-dim`, glass tokens, Condensed tokens. Replace modal/backdrop styles with glass recipe (§ 1.2). Add Global Loader overlay and spinner styles (TenWorks Gold). |
| 2 | `css/projects.css` (if exists) | Remove or replace any local `--text-bright` / `--text-dim` / `--primary-gold`; use global variables. Add Condensed Mode rules if not in style.css. |
| 3 | Shared partial or layout (e.g. nav partial, main wrapper) | Insert Global Loader overlay markup (one place). Ensure partial is included on all CRM/ERP pages that use the loader. |
| 4 | `js/shared_constants.js` (or equivalent) | Add `showGlobalLoader()`, `hideGlobalLoader()`; call show on init and hide when ready (and optionally in ERP async fetch blocks). |
| 5 | CRM pages (accounts, contacts, deals, campaigns, sequences, etc.) | Replace scoped text/brand variables; apply Actionable Row to list rows; ensure modals use glass classes. |
| 6 | `projects.html` + `js/projects.js` | List/detail + KPI; list-item and details-panel spacing/typography; optional Condensed. |
| 7 | `schedule.html` + `js/schedule.js` | List/detail + table (Gantt); sub-pixel precision; Condensed; filter pills if any. |
| 8 | `talent.html` + `js/talent.js` | List/detail + matrix table; Actionable Row on list; Condensed for matrix. |
| 9 | `inventory.html` + `js/inventory.js` | KPI strip + table; Deals table pattern; Condensed; optional filter pills. |
| 10 | `command-center.html` + related JS | Verify KPI and task list use global variables and loader. |
| 11 | Standalone pages (e.g. `status.html`) | No change unless they are later brought into the shared shell and loader. |

---

## Summary

- **Task 1:** New `:root` with `--primary-gold` (and `--primary-blue` alias), TenWorks Dark Slate, and **global `--text-bright` / `--text-dim`**. Glassmorphism recipe uses 24px blur and 1rem radius with TenWorks-tuned rgba on `#1F2329`.
- **Task 2:** Actionable Row = primary (bold, bright) + secondary (smaller, dim). Sub-pixel precision = `calc(50% - 1px)` (and exact grid math) for ERP lines/grids. Global Loader = TenWorks Gold spinner + blur overlay, integrated into bootstrap and optional ERP async flows.
- **Task 3:** Talent & Schedule = List/Detail + Table patterns; Inventory = KPI cards + Deals Table. Condensed Mode = dedicated spacing tokens for list/table density without losing hierarchy.
- **Task 4:** Implement in order: (1) Global variable injection in `css/style.css`, (2) Shared layout/nav + glass + loader, (3) Module-specific page modernizations per the file-by-file table.

**Do not modify any existing .html or .css until this blueprint is approved.** After approval, proceed in the order above and use this doc as the single source of truth.
