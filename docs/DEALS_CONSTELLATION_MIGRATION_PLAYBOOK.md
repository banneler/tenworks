# Deals Page: Constellation Migration Playbook

Line-by-line plan to align TenWorks Deals with Constellation-V structure and behavior (keeping TenWorks data: `deals_tw`, no Salesforce/HUD).

---

## 1. HTML (deals.html)

| # | Action | Constellation reference | TenWorks current |
|---|--------|-------------------------|-------------------|
| 1.1 | Replace top block with single `.deals-top-section` containing: (1) row with `h2.page-title` "Deals", My/Team toggle, List/Board toggle; (2) `.deals-metrics-container.flex.gap-4` with metric cards. | C lines 44–84 | `.deals-main-header` + `.deals-header` + separate view toggle |
| 1.2 | My/Team toggle: use `.deals-view-toggle` with two `.view-mode-btn` (icons: fa-user, fa-users), same IDs. | C 48–50 | btn-secondary buttons |
| 1.3 | List/Board toggle: second `.view-mode-toggle` with list/board buttons, same IDs. | C 52–55 | First in DOM currently |
| 1.4 | Add 5th metric card: "Average Deal Size (ARPU)" with `#metric-arpu` (value $0). Place before Closed Won. | C 76–78 | TenWorks has 4 cards |
| 1.5 | Wrap table + kanban + options in `.section-card.deals-pipeline-card`. Inside: `.section-card-header` (title "Deal Pipeline", add-deal button, filters, Reset) and `.section-card-body`. | C 86–148 | `#list-view-container.glass-panel` and `#kanban-board-view` at root |
| 1.6 | Header row: "Deal Pipeline" in `h2.section-title`, then `#add-deal-btn.btn-icon-header` (New Deal), then `.deals-filters` with: Committed pills `#filter-committed-pills`, Stage pills `#filter-stage-pills`, Close Month group `#filter-close-month-scroll` + prev/next buttons, then `#deals-filters-reset`. | C 87–113 | None |
| 1.7 | Body: optional `#new-deal-inline-container.hidden`, then `#list-view-container` (table), then `#kanban-board-view`, then row with Show closed lost toggle. | C 114–147 | Table and kanban and `.deals-table-options` |
| 1.8 | Show closed lost: replace checkbox block with `<label class="deals-filter-toggle">` containing switch span, `<input type="checkbox" id="show-closed-lost" class="sr-only">`, and text "Show closed lost". | C 142–146 | `#show-closed-lost-check` in `.deals-table-options` |
| 1.9 | Remove `glass-panel` from list and kanban containers (card provides surface). | — | `#list-view-container.glass-panel`, kanban has `glass-panel` |
| 1.10 | Table thead: align column order with C if desired (Committed | Stage | Close Month | Deal Details | Products | Term | MRC | Notes). TenWorks can keep current columns for phase 1; add Term and Notes columns if DB has them. | C 121–128 | Committed | Deal Name | Account | Stage | Project Value | Close Month | Job Details | Actions |
| 1.11 | Charts: wrap in `.section-card.deals-charts-section` with `.section-card-header` (title "Deal Insights") and `.section-card-body`; add third chart container "Pipeline by Product" with `#deals-by-product-chart` and `#product-chart-empty-message`. | C 151–186 | `.deals-charts-section` with hr and h3, two charts |

---

## 2. JavaScript (js/deals.js)

| # | Action | Notes |
|---|--------|--------|
| 2.1 | Imports: add `showToast`, `showGlobalLoader`; omit Constellation-only (injectGlobalNavigation, refreshHUDNodes, removeDealInsightsWireframe, addDealInsightsWireframe, reloadHUDWireframes, getState). | TenWorks already has showToast. |
| 2.2 | State: add `filterStage: ''`, `filterCloseMonth: ''`, `filterCommitted: ''`, `closeMonthOffset: 0`, `dealsByProductChart: null`; set `showClosedLost: false` default. | C 44–48 |
| 2.3 | DOM: add refs for `filterStagePills`, `filterCloseMonthPills`, `filterCloseMonthScroll`, `closeMonthPrevBtn`, `closeMonthNextBtn`, `filterCommittedPills`, `showClosedLostEl` (id show-closed-lost), `dealsFiltersResetBtn`, `dealsByProductCanvas`, `productChartEmptyMessage`, `addDealBtn`. | — |
| 2.4 | Add `getBaseDeals()`: if !showClosedLost return getFutureDeals(); else return deals in future or closed-lost (C logic). | C 237–247 |
| 2.5 | Add `getFilteredDeals()`: from getBaseDeals(), apply filterStage, filterCloseMonth, filterCommitted. | C 251–258 |
| 2.6 | Add `createFilterPill(value, label, active)` returning button.deals-filter-pill with data-value. | C 141–147 |
| 2.7 | Add `getCloseMonthRange()`: 25 months (e.g. -12 to +12 from current). | C 149–157 |
| 2.8 | Add `populateDealsFilters()`: fill stage pills, close month pills, committed pills (All / Committed / Uncommitted); set show-closed-lost checkbox; scroll close month to current. | C 161–198 |
| 2.9 | loadAllData: call `populateDealsFilters()` in finally; add `renderDealsByProductChart()`. Keep table name `deals_tw`. | — |
| 2.10 | renderDealsPage: use `getFilteredDeals()` (and include Closed Won in list if desired); keep current column structure unless 1.10 done. | C 466–501 |
| 2.11 | renderDealsByStageChart / renderDealsByTimeChart: use `getFilteredDeals()` instead of getFunnelDeals() for chart data. | C 293–296, 338–341 |
| 2.12 | Add `renderDealsByProductChart()`: aggregate by product (split products string), doughnut chart; use getFilteredDeals(). Add helper getProductColor(label) if needed. | C 388–463 |
| 2.13 | renderDealsMetrics: add ARPU calculation (closed won count > 0 ? closedWonSum / count : 0), set metric-arpu. | — |
| 2.14 | Event listeners: filter pill clicks (stage, close month, committed) set state and re-render; close-month-prev/next adjust closeMonthOffset and populateDealsFilters; deals-filters-reset clears filters and re-renders; show-closed-lost change updates state.showClosedLost and renderAll. Use id `show-closed-lost`. | C (various) |
| 2.15 | Add #add-deal-btn listener: open modal (or inline form) for new deal; on save insert into deals_tw and loadAllData. | — |
| 2.16 | Toggle closed lost: read initial from localStorage; persist on change. Keep checkbox id `show-closed-lost` for new markup. | — |

---

## 3. CSS (css/style.css)

| # | Action | Selector / purpose |
|---|--------|---------------------|
| 3.1 | Deals top section | `.deals-top-section`, `.deals-top-section .page-title`; flex layout for title + toggles row and metrics row. |
| 3.2 | View toggles | `.deals-view-toggle` pill container (bg, border, padding, rounded); `.deals-view-toggle .view-mode-btn` (padding, rounded-md); .view-mode-btn.active (bg primary-gold). Match accounts/contacts pill style. |
| 3.3 | Metrics row | `.deals-metrics-container` display flex, gap; .metric-card unchanged. |
| 3.4 | Pipeline card | `.deals-pipeline-card`, `.deals-pipeline-card .section-card-header`, `.deals-pipeline-card .section-card-body` (padding). |
| 3.5 | Filter groups | `.deals-filters` flex wrap gap; `.deals-filter-group` label + pills; `.deals-filter-pills` flex gap rounded border p; `.deals-filter-pill` button style, .active state. |
| 3.6 | Close month scroll | `.deals-close-month-scroll` overflow-x auto; `.deals-close-month-nav` prev/next buttons. |
| 3.7 | Reset button | `.deals-filter-reset` text button style. |
| 3.8 | Show closed lost toggle | `.deals-filter-toggle` (label flex); `.deals-filter-toggle-switch` (track); `.deals-filter-toggle-knob` (thumb); :has(input:checked) state. |
| 3.9 | Charts section card | `.deals-charts-section.section-card`; section-card-header and body. |
| 3.10 | Add deal button | `#deals .deals-pipeline-card .btn-icon-header` same as accounts (no container, gold icon). |

---

## 4. Out of scope (TenWorks)

- TomSelect (C uses for some selects).
- HUD / wireframes / injectGlobalNavigation.
- Constellation table inline editing (deal-cell-editable, contenteditable) — keep TenWorks modal edit for phase 1.
- Kanban card flip/notes edit — keep simple Kanban for phase 1.
- DB table name: keep `deals_tw`; C uses `deals`.

---

## 5. Execution order

1. HTML: apply 1.1–1.11 (structure, toggles, metrics, pipeline card, filters, toggle, charts wrapper + product chart).
2. CSS: add 3.1–3.10 under `#deals` or .deals-* where appropriate.
3. JS: state + DOM (2.1–2.3); getBaseDeals, getFilteredDeals, filter helpers (2.4–2.8); loadAllData + populateDealsFilters + product chart (2.9); renderDealsPage/Charts using filtered (2.10–2.12); metrics ARPU (2.13); event listeners filters + add deal + show closed lost (2.14–2.16).

---

## 6. Second pass (post–first implementation)

After first playbook enacted, re-scan TenWorks vs Constellation:

| Gap | Resolution |
|-----|------------|
| Pipeline header layout | C groups "Deal Pipeline" + add-deal in one flex div, then filters in second row. TenWorks has single row with flex-wrap — OK. |
| Table columns | C order: Committed, Stage, Close Month, Deal Details, Products, Term, MRC, Notes (no Actions). TenWorks keeps Deal Name, Account, Stage, Project Value, Close Month, Job Details, Actions by design; Term/Notes optional if schema exists. No change in pass 2. |
| Toast container | C has `#toast-container` in deals view. TenWorks uses shared toast from shared_constants — OK. |
| new-deal-inline-container | C has hidden div for inline add. TenWorks uses modal for new deal — OK. |
| View toggle pill styling | Already applied in .deals-top-row .deals-view-toggle / .view-mode-toggle. |
| Show closed lost default | Set to false; persisted in localStorage. |

No further code changes required in second pass; migration is complete for scope (no inline table edit, no Kanban flip/notes).
