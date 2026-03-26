# Accounts Page Refactor Guide — Constellation Visual Parity

This document summarizes the **accounts page** updates for TenWorks → Constellation visual parity and layout. Use it when refactoring other pages (Contacts, Deals, etc.). It **excludes** global loader and auth fixes.

---

## 1. HTML Structure

### 1.1 No Main Body Wrapper

- The **details panel** (`#account-details.account-details-content.details-panel`) must **not** act as a visible wrapper.
- In CSS, make the details panel **transparent**: no background, box-shadow, or border. Only the **cards** (form card, deals card, contacts card, activities card) draw visible boxes.
- Override both `.account-details-content.details-panel` and `.account-details-content.details-panel.glass-panel` so the panel is visually “invisible” (transparent, no glass styling).

### 1.2 Content Hierarchy

- **main.content-area** → single child **#accounts.accounts-layout** → **account-picker-panel** + **#account-details.account-details-content**.
- Inside **#account-details**:
  - **.account-details-top-row**: form card + deals card (grid: `minmax(0, 1fr) 320px`).
  - **.account-cards-row**: contacts card + activities card (flex, two equal columns).
- No extra wrapper div around the cards; the details panel is just a flex column container.

### 1.3 Associated Contacts Header (Three Controls)

- Header must have **three** controls: list view button, org chart view button, **expand/full-screen** button.
- Expand button: `#org-chart-maximize-btn`, class `btn-icon-header`, initially `hidden`; JS shows it only in org chart view.
- Markup: `.view-mode-toggle` (list + org chart buttons) and the expand button sibling, e.g. `flex items-center gap-2`.

### 1.4 Pending Task Reminder

- Place the pending-task reminder **inside** the form’s `.form-buttons` div.
- Use the **banner** variant (e.g. `.pending-task-reminder-banner`) so it can be styled as a full-width row **above** the action buttons via CSS (order + flex-basis).

---

## 2. Layout and “Fill the Whole Page”

### 2.1 Height Chain (Viewport Fill)

- **html** and **body**: `height: 100%` so the flex chain can fill the viewport.
- **.crm-container**: `height: 100%`, `min-height: 0`, `overflow: hidden`, `display: flex`.
- **.content-area**: Must be a **flex container** so its child can grow:
  - `display: flex; flex-direction: column;`
  - `flex: 1 1 0; min-height: 0;`
  - `overflow: hidden` (so the layout fills; inner sections scroll, not the main area).
- **.accounts-layout**: `display: flex; flex: 1 1 0; min-height: 0; overflow: hidden; gap: 1.25rem;`
- **.account-picker-panel**: `flex: 0 0 auto; width: 18rem` — does **not** grow.
- **.account-details-content**: `flex: 1 1 0; min-height: 0; overflow: hidden` — takes all remaining space. Do **not** give the details panel `overflow-y: auto`; only inner card bodies scroll.

### 2.2 Details Panel Structure

- **.account-details-top-row**: `flex-shrink: 0` so the row keeps its height and doesn’t collapse.
- **.account-cards-row**:
  - `display: flex; flex: 1 1 0; min-height: 220px; gap: 1.25rem; margin-top: 1.25rem;`
  - So the bottom row **grows** and fills the rest of the details panel.
- **.account-cards-row .section-card**: `flex: 1; min-width: 0; min-height: 200px` so the two cards share space 50/50 and keep a minimum height when empty.

### 2.3 Scrolling

- **Deals / Contacts / Activities card bodies**: `flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden` so they fill the card and scroll when content overflows.
- No `max-height: calc(100vh - …)` on the details content; let flex and `min-height: 0` control height.

---

## 3. Card Styling (and Picker Match)

### 3.1 Section Cards (Deals, Contacts, Activities)

- **Background**: `rgba(0,0,0,0.12)` (or `0.15` for form card).
- **Border**: `1px solid var(--glass-border)`.
- **Border-radius**: `var(--glass-radius)`.
- No heavy glass (no backdrop-filter / box-shadow) so all cards look the same.

### 3.2 Account Details Form Card

- Same border/radius as above; background `rgba(0,0,0,0.15)`.
- **Padding**: `1.25rem 1rem 1rem` so the **top** has padding and the title + AI button don’t overrun the card.
- **.account-details-form-header**: margin-bottom only; no extra top padding needed if the card has top padding.

### 3.3 Picker Panel

- Use the **same** visual style as the section cards so it’s consistent:
  - `background: rgba(0,0,0,0.12);`
  - `border: 1px solid var(--glass-border);`
  - `border-radius: var(--glass-radius);`
- Remove picker-only glass (e.g. `backdrop-filter`, `box-shadow`, `var(--glass-content-bg)`) so it matches the cards.

### 3.4 Section Card Headers (Accounts)

- For **.account-deals-card**, **.account-contacts-card**, **.account-activities-card** `.section-card-header`:
  - `flex-shrink: 0;`
  - `padding-inline: 1.25rem; padding-top: 1.25rem; padding-bottom: 0.5rem;`

---

## 4. Form Buttons and Pending-Task Banner

### 4.1 Form Buttons Row

- **.account-details-form-card .form-buttons**: `display: flex; flex-wrap: wrap; align-items: center; gap: 0.625rem; margin-top: 1.25rem; margin-bottom: 0.5rem;`

### 4.2 Pending-Task Banner Above Actions

- Banner lives inside `.form-buttons` but should **look** like a full-width row above the buttons:
  - `.account-details-form-card .form-buttons .pending-task-reminder-banner`: `width: 100%; flex-basis: 100%; order: -1; margin-bottom: 0.5rem;`
- Banner styling: strong emphasis (e.g. danger border/background, icon) and readable padding.

---

## 5. Associated Contacts: List / Org Chart / Expand

### 5.1 JS Behavior

- **References**: `orgChartMaximizeBtn`, `orgChartModalBackdrop`, `orgChartModalContent`, `orgChartModalCloseBtn`.
- When switching to **org chart view**: remove `hidden` from `orgChartMaximizeBtn`.
- When switching to **list view**: add `hidden` to `orgChartMaximizeBtn`.
- **Expand click**: Copy current org chart view HTML (and unassigned section if present) into `orgChartModalContent`, then remove `hidden` from `orgChartModalBackdrop`.
- **Close**: Add `hidden` to backdrop on close-button click and on backdrop click (when `e.target === orgChartModalBackdrop`).

### 5.2 View-Mode Toggle

- **.view-mode-btn.active**: Use theme color (e.g. `var(--primary-gold)`) and `var(--text-bright)` so the active state matches the rest of the app.

---

## 6. Deal Cards: Product Pills

### 6.1 Full Set

- Use a single source of truth for product families (e.g. `DEAL_PRODUCT_FAMILIES`: Internet, Ethernet, UC, PRI/SIP, SD-WAN, Firewall, 5G, Cloud Connect, Waves). Render **all** of them on each deal card.

### 6.2 Inactive Pills (Muted)

- Give inactive pills a class (e.g. `product-pill-inactive`).
- CSS for inactive state: `background-color: transparent; color: var(--text-muted); border-color: var(--border-color);` (and optional opacity). On hover, slight background so they stay clearly interactive but muted.

---

## 7. Org Chart Modal

- Modal structure: backdrop → `.org-chart-modal` → header (title + close) + `#org-chart-modal-content`.
- When opening from expand: inject the cloned chart (and unassigned block if used) into `#org-chart-modal-content` (e.g. with wrappers like `.org-chart-modal-inner` and `.org-chart-modal-unassigned`).
- **#org-chart-modal-content**: `flex: 1; min-height: 0; overflow: auto; padding: 1rem` so the modal fills and scrolls if needed.

---

## 8. Checklist for Refactoring Another Page

- [ ] Details/main content panel has no visible wrapper (transparent); only cards have background/border.
- [ ] Layout chain: content-area is `display: flex; flex-direction: column`, child layout has `flex: 1 1 0; min-height: 0; overflow: hidden`.
- [ ] Picker (if any) is `flex: 0 0 auto`; details/content area is `flex: 1 1 0` and `overflow: hidden`.
- [ ] Bottom “cards row” uses `flex: 1 1 0` and a minimum height; section cards use `flex: 1` and `min-height`.
- [ ] Card bodies that should scroll have `flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden`.
- [ ] All cards (and picker) use the same card style: `rgba(0,0,0,0.12)` (or 0.15), `var(--glass-border)`, `var(--glass-radius)`.
- [ ] Top row of details has padding so titles/buttons don’t overrun (e.g. card padding includes top).
- [ ] Section card headers use consistent padding (e.g. 1.25rem inline/top, 0.5rem bottom).
- [ ] Form buttons row: gap and margins as above; pending-task banner full-width above via `order: -1` and `flex-basis: 100%`.
- [ ] View toggles (list/org chart) and expand button present and wired; expand only visible in the relevant view.
- [ ] Product pills (if applicable): full family set; inactive pills muted via class and CSS.
