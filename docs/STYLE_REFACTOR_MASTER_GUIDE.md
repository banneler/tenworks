# TenWorks Style Refactor — Master Guide

This document is the **single source of truth** for the TenWorks portal style refresh. It merges the **Constellation-V layout** (Accounts Page Refactor Guide), the **Proposals skin** (Skin Merge Plan), and all subsequent refinements (zero radius, lighter grey cards, typography lock, picker parity) into one reference.

---

## Critical: Where Layout Comes From

**Card layout and structure come from Constellation-V.**

- All **flexbox layout**, **height chains**, **viewport fill**, **picker vs. details split**, **card rows**, and **scrolling behavior** are defined by the Constellation-V architecture and must **not** be changed when applying visual (skin) updates.
- The **Accounts Page Refactor Guide** ([ACCOUNTS_PAGE_REFACTOR_GUIDE.md](ACCOUNTS_PAGE_REFACTOR_GUIDE.md)) is the authority for:
  - HTML structure (no main body wrapper, content hierarchy, account-details-top-row, account-cards-row).
  - Layout chain (content-area → accounts-layout / contacts-layout → picker + details).
  - Which elements are transparent (details panel) vs. which draw visible boxes (cards only).
  - Card body scrolling, min-heights, and flex distribution.
- **Skin changes** (colors, radius, typography, padding) are applied **on top of** this layout. Do not alter `display`, `flex`, `flex-direction`, `flex: 1 1 0`, `min-height: 0`, or `overflow` on layout containers when refreshing the look.

---

## Part 1: Layout (Constellation-V — Do Not Change)

### 1.1 Structure

- **main.content-area** → single child **#accounts.accounts-layout** or **#contacts.contacts-layout** → **picker panel** + **details content**.
- **Details panel** (`#account-details` / `#contact-details`) must be **transparent**: no background, border, or box-shadow. Only the **cards** (form card, deals card, contacts card, activities card, etc.) draw visible boxes.
- Override both `.account-details-content.details-panel` and `.account-details-content.details-panel.glass-panel` so the panel is visually invisible.

### 1.2 Height Chain

- **html**, **body**: `height: 100%`.
- **.crm-container**: `height: 100%`, `min-height: 0`, `overflow: hidden`, `display: flex`.
- **.content-area**: `display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; overflow: hidden`.
- **.accounts-layout** / **.contacts-layout**: `display: flex; flex: 1 1 0; min-height: 0; overflow: hidden; gap: var(--card-gap)`.
- **Picker panel**: `flex: 0 0 auto; width: 18rem` — does not grow.
- **Details content**: `flex: 1 1 0; min-height: 0; overflow: hidden` — takes remaining space. Only **inner card bodies** scroll.

### 1.3 Card Rows (Layout Only)

- **.account-details-top-row** / **.contact-details-top-row**: form card + deals card (or equivalent); `flex-shrink: 0`; grid or flex as per guide.
- **.account-cards-row** / **.contact-cards-row**: `display: flex; flex: 1 1 0; min-height: 220px; gap: var(--card-gap); margin-top: var(--card-gap)`.
- **.section-card** inside cards row: `flex: 1; min-width: 0; min-height: 200px` (or as specified in refactor guide).
- **Card bodies** (deals, contacts, activities): `flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden`.

### 1.4 Checklist (Layout)

- [ ] Details panel has no visible wrapper (transparent); only cards have background/border.
- [ ] content-area is flex column; child layout has `flex: 1 1 0; min-height: 0; overflow: hidden`.
- [ ] Picker is `flex: 0 0 auto`; details area is `flex: 1 1 0` and `overflow: hidden`.
- [ ] Cards row uses `flex: 1 1 0` and minimum height; section cards use `flex: 1` and `min-height`.
- [ ] Card bodies that scroll have `flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden`.

---

## Part 2: Skin — Design Tokens and Card Look

### 2.1 Radius: Sharp Corners (Zero Radius)

- **All containers, cards, inputs, and buttons** use **zero border-radius** (Proposals “gold standard”).
- In **:root** and **body.theme-dark**:
  - `--glass-radius: 0`
  - `--radius-sm: 0`
  - `--radius-md: 0`
  - `--radius-lg: 0`
- **No hardcoded radii** (e.g. 4px, 5px, 6px, 8px, 10px) on cards, panels, inputs, or buttons. Use the variables above (all 0). Exception: circular elements (e.g. avatars, slider thumbs) may keep `border-radius: 50%` where appropriate.

### 2.2 Card Colors: Lighter Grey Cards

- Cards must read as **lighter grey** than the main page background so they “pop” (Proposals-style).
- In **:root** and **body.theme-dark**:
  - `--card-bg: #252a30` (lighter than typical page background e.g. `#1F2329`)
  - `--card-bg-form: #2a2e35` (slightly lighter for form panels)
  - `--card-border: rgba(255,255,255,0.12)`
  - `--card-border-strong: rgba(255,255,255,0.22)`
- Use **var(--card-bg)** and **var(--card-border)** for:
  - Picker panels (account, contact)
  - Section cards (deals, contacts, activities, AI, logged emails, sequence status)
  - Form cards (account details, contact details)
  - Glass panels used as cards (e.g. item-list-container.glass-panel, details-panel.glass-panel when used as card)
  - Modals, toasts, and other card-like surfaces that should match the portal skin

### 2.3 Other Skin Variables

- **--section-header-padding:** `0.75rem 1rem`
- **--card-gap:** `1rem`
- **Section card headers:** `padding: var(--section-header-padding); padding-bottom: 0.375rem; border-bottom: 1px solid var(--card-border)`.

---

## Part 3: Typography (Proposals Gold Standard)

### 3.1 Section Titles and Panel Headers

- **Font:** `var(--font-headers)` (Rajdhani)
- **Size:** `0.875rem`
- **Weight:** `600`
- **Letter-spacing:** `0.05em`
- **Text-transform:** `uppercase`
- **Color:** `var(--text-bright)`

Apply to:

- `.section-card .section-title`
- `.account-picker-header .section-title`
- `.contact-picker-header .section-title`
- `.details-panel-title` (including account/contact form headers, sequence status card header)
- `.item-list-container h4`
- `#campaign-details h3`, `#campaign-details h4`
- `.sequence-status-card-header .details-panel-title`
- Any other section-style headers that should match the portal

### 3.2 Labels and Body Inputs

- **Labels:** `font-size: 0.875rem; font-weight: 600; font-family: var(--font-body)`.
- **Inputs / textareas:** `font-size: 0.875rem`, `font-family: var(--font-body)` where appropriate.

### 3.3 Proposals Page Headings

- **h1:** `font-size: 1.125rem`, `font-family: var(--font-headers)`, `letter-spacing: 0.05em`, `text-transform: uppercase`.
- **h3** (section-style): `font-size: 0.875rem`, `letter-spacing: 0.05em`, `text-transform: uppercase`, `font-family: var(--font-headers)`, `font-weight: 600`.

---

## Part 4: Picker Typography (Account = Contact)

- **Contact picker** is the typography source of truth for list and search.
- **Account picker** must use the **exact same** fonts and sizes.

### 4.1 Picker Section Title

- Both pickers: `.account-picker-header .section-title` and `.contact-picker-header .section-title` use the same rule: `0.875rem`, `font-weight: 600`, `font-family: var(--font-headers)`, `letter-spacing: 0.05em`, `text-transform: uppercase`, `color: var(--text-bright)`.

### 4.2 Picker Search Input

- **Account:** `.account-picker-body .item-search-input`
- **Contact:** `.contact-picker-body input[type="text"]`
- Both: `font-size: 0.875rem`, `font-family: var(--font-body)`.

### 4.3 Picker List Item (Primary Name)

- **Contact picker:** `.contact-picker-list .list-item .contact-name` — `font-size: 1em`, `font-weight: 500`, `font-family: var(--font-headers)`, `letter-spacing: 0.05em`, `text-transform: uppercase`, `color: var(--text-bright)`.
- **Account picker:** `#account-list .account-list-name` — **same:** `font-size: 1em`, `font-weight: 500`, `font-family: var(--font-headers)`, `letter-spacing: 0.05em`, `text-transform: uppercase`, `color: var(--text-bright)`.

### 4.4 Picker List Item (Secondary Line)

- **Contact picker:** `.contact-picker-list .list-item .account-name` — `font-size: 0.8rem`, `font-family: var(--font-body)`, `color: var(--text-dim)`.
- If the account picker ever has a secondary line, use the same.

---

## Part 5: Proposals Page Scoped Overrides

- The Proposals page uses **Tailwind CDN** and utility classes. To get the same sharp corners, lighter grey cards, and typography as the rest of the portal, **scoped overrides** in **css/style.css** under **body.proposals-page** are used.
- **Card-like containers:** Override Tailwind `bg-white/5`, `bg-white/10`, `border-white/10`, `border-white/20` to use `var(--card-bg)` and `var(--card-border)`.
- **Radius:** Override any `rounded-*` to `border-radius: 0` (or `var(--radius-md)` which is 0).
- **Inputs, selects, textareas:** `border-radius: 0`, `background: #1e2228` (or similar dark), `border: 1px solid var(--card-border)`, `font-size: 0.875rem`, `font-family: var(--font-body)`.
- **Buttons:** `border-radius: 0`.
- **Section headings (h1, h3):** Same as Part 3 (0.875rem, uppercase, 0.05em, font-headers).
- **.proposal-cover-panel:** `border-radius: 0`, `background: var(--card-bg)`, `border: 1px solid var(--card-border)`. Readiness panel can use `var(--card-bg-form)` and `var(--card-border-strong)`.

---

## Part 6: Padding, Gaps, and Form Buttons

- **Layout gaps:** `.accounts-layout`, `.contacts-layout`, `.account-details-top-row`, `.contact-details-top-row`, `.account-cards-row`, `.contact-cards-row` use `gap: var(--card-gap)` (or `margin-top: var(--card-gap)` where applicable).
- **Form card padding:** Tighter than original; e.g. `1rem 0.75rem 0.75rem` for form cards.
- **Form grid:** `.account-details-form-card .form-grid`, `.contact-details-form-card .form-grid` — `gap: 0.5rem 0.75rem`.
- **Form buttons row:** `gap: 0.5rem`, `margin-top: 1rem`, `margin-bottom: 0.375rem`. Pending-task banner: full-width above buttons via `order: -1`, `flex-basis: 100%`, `margin-bottom: 0.375rem`.
- **Card bodies:** Section card bodies use padding such as `0.5rem 1rem` (or as specified in the refactor guide for density).

---

## Part 7: Verification Checklist

### Layout (Constellation-V — unchanged)

- [ ] Details panel transparent; only cards have background/border.
- [ ] content-area and layout chain use `flex: 1 1 0`, `min-height: 0`, `overflow: hidden` where specified.
- [ ] Picker `flex: 0 0 auto`; details `flex: 1 1 0`; card bodies scroll with `overflow-y: auto`.

### Skin

- [ ] All card/panel/input/button radii are 0 (no visible rounded corners except intentional circles).
- [ ] Cards use `var(--card-bg)` / `var(--card-bg-form)` and `var(--card-border)` (lighter grey than page background).
- [ ] Section titles and details-panel titles: 0.875rem, uppercase, 0.05em, font-headers.
- [ ] Account picker list and search use same fonts as contact picker (Part 4).
- [ ] Proposals page: scoped overrides apply so it matches sharp corners, card colors, and typography.

### Cross-Page

- [ ] Accounts, Contacts, and Proposals pages checked; no layout regressions; skin consistent.

---

## Part 8: Files and Scope

- **Primary file:** `css/style.css`. All skin and typography changes are made here.
- **No HTML or JS changes** are required for the style refresh; layout structure is already defined by Constellation-V and the Accounts/Contacts refactor.
- **Reference docs:**
  - [ACCOUNTS_PAGE_REFACTOR_GUIDE.md](ACCOUNTS_PAGE_REFACTOR_GUIDE.md) — **layout and structure** (card layout from Constellation-V).
  - [PROPOSALS_SKIN_MERGE_PLAN.md](PROPOSALS_SKIN_MERGE_PLAN.md) — original 3-pass skin plan (variables and class updates); this master guide supersedes it for the final token values (zero radius, lighter grey cards, typography).

---

## Quick Reference: Token Summary

| Token | Value | Purpose |
|-------|--------|---------|
| `--glass-radius` | `0` | All card/panel/input/button corners sharp |
| `--radius-sm` / `--radius-md` / `--radius-lg` | `0` | Same |
| `--card-bg` | `#252a30` | Lighter grey card background |
| `--card-bg-form` | `#2a2e35` | Lighter grey form card |
| `--card-border` | `rgba(255,255,255,0.12)` | Card/panel border |
| `--card-border-strong` | `rgba(255,255,255,0.22)` | Stronger border where needed |
| `--section-header-padding` | `0.75rem 1rem` | Section card headers |
| `--card-gap` | `1rem` | Gaps between cards and rows |
| Section title font | `0.875rem`, `var(--font-headers)`, `600`, `0.05em`, `uppercase` | All section titles |
