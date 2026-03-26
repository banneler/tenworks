# Command Center: TenWorks vs Constellation-V — Comprehensive Diff & Game Plan

This document lists differences between TenWorks and Constellation-V command center (HTML, JS, CSS) line-by-line, then provides a prioritized game plan for aligning TenWorks with Constellation-V **layout, text formatting, and behavior** while keeping TenWorks-only features (ERP row, Downloads, no Salesforce) and TenWorks color scheme.

---

## 1. HTML (command-center.html)

### 1.1 Head / meta

| Location | Constellation-V | TenWorks | Action |
|----------|-----------------|----------|--------|
| Title | `Strategic - CRM - Command Center` | `TenWorks Command Center` | Keep TenWorks (brand). |
| Stylesheet | `output.css` + `css/global-loader.css` | `css/style.css` | Keep TenWorks. |
| Fonts | No preconnect/Inter/Rajdhani | Preconnect + Inter, Rajdhani | Keep TenWorks (optional to match C-V). |
| Tom-select | Yes (link + script) | No | Optional: add only if quick-add uses Tom-select. |

### 1.2 Body / loader

| Location | Constellation-V | TenWorks | Action |
|----------|-----------------|----------|--------|
| Body class | (set by inline script from localStorage) | `class="theme-dark" data-nav="crm"` | Keep TenWorks. |
| Loader content | SVG (constellation line + stars) | `<img src="assets/logo.svg" ...>` | Optional: match C-V loader SVG for consistency. |
| Nav | `nav-sidebar` + `#global-nav-container` (flex), inline collapse script on `currentScript.parentElement` | `id="nav-container"` + comment "CRM nav loaded by nav-loader.js" | Keep TenWorks (nav-loader.js). |

### 1.3 Dashboard structure

| Location | Constellation-V | TenWorks | Action |
|----------|-----------------|----------|--------|
| Above grid | Nothing | **ERP Overview** row: 3 cards (Active Projects, Staffing Gaps, Pending Proposals) | **Keep** (TenWorks-only). |
| Grid wrapper | `#dashboard` → single `#dashboard-sections-grid` (no id on outer in C-V; class only) | `#dashboard` → `#erp-overview` then `.dashboard-sections-grid` | Keep structure; ensure grid has same class. |
| Grid ID | `id="dashboard-sections-grid"` on grid div | Class only `.dashboard-sections-grid` | Optional: add `id="dashboard-sections-grid"` to TenWorks for parity. |

### 1.4 AI Daily Briefing card

| Location | Constellation-V | TenWorks | Action |
|----------|-----------------|----------|--------|
| Header | `section-card-header flex justify-between items-center gap-3` | Inline style `display: flex; justify-content: space-between; align-items: center;` | Align: use same layout (flex + gap); can add utility class or keep inline. |
| Refresh button | `id="ai-briefing-refresh-btn"` class `btn-primary btn-icon-header` title "Refresh Briefing" `<i class="fas fa-rotate-right"></i>` | Same id, `btn-icon-header btn-primary` title "Refresh briefing" `<i class="fas fa-rotate"></i>` | Match icon: use `fa-rotate-right` for parity. |
| Content order | **Container first:** `#ai-briefing-container.ai-briefing-content.hidden` then `#ai-briefing-placeholder` (placeholder after) | **Placeholder first:** `#ai-briefing-placeholder` then `#ai-briefing-container.hidden` inside `.ai-briefing-card-body` | **Align:** Either (a) swap order in TenWorks to container-then-placeholder and update CSS/JS for visibility, or (b) keep current order and keep using `.briefing-visible` on body (current approach is fine). |
| Container class | `ai-briefing-content hidden` | `hidden` only | Optional: add class `ai-briefing-content` to container for C-V-style CSS selectors. |
| Placeholder class | `ai-briefing-placeholder px-4 pb-4 text-sm text-[var(--text-medium)]` | `ai-briefing-placeholder` + parent `.ai-briefing-card-body` with padding | Ensure placeholder has same padding/size (e.g. 0.875rem, var(--text-medium)). |

### 1.5 My Tasks card

| Location | Constellation-V | TenWorks | Action |
|----------|-----------------|----------|--------|
| Add-task control | Single **plus icon** `#my-tasks-hamburger` "Add task" (hamburger toggles quick-add visibility) | **Plus icon** `#add-new-task-btn` "Add new task" (opens modal) | **Behavior:** C-V uses inline quick-add form + hamburger; TenWorks uses modal. To match C-V layout: add optional quick-add form in card and use plus to toggle or add; keep modal as alternative. |
| "Generate AI Daily Briefing" | Not in My Tasks card | Button in My Tasks header `#ai-daily-briefing-btn` | **Keep** TenWorks (no need to remove). |
| Body content | **Quick-add form** (`#quick-add-card`, `#quick-add-task-form`, description, contact/account select, due date, Add) + **list** `#my-tasks-list` (no table) | **Table** `#my-tasks-table` (Due Date, Description, Linked To, Actions) in `.table-container` | **Major:** C-V uses **list** (`.task-item` divs); TenWorks uses **table**. Game plan: either (1) add list-based DOM + JS render to match C-V exactly, or (2) keep table and only align styling (typography, spacing, icons). |
| Task actions (C-V) | Icon-only: mark complete (check), edit (pen), delete (trash) | Text buttons: Complete, Edit, Delete | To match C-V: use icon-only buttons (same classes/data attrs) and add `.btn-icon-only` styles. |

### 1.6 Sequence Steps card

| Location | Constellation-V | TenWorks | Action |
|----------|-----------------|----------|--------|
| Toggle container | `sequence-steps-toggle flex rounded-lg border border-[var(--border-color)] p-0.5 bg-[var(--bg-medium)]` | `sequence-steps-toggle` (no rounded; border; no p-0.5/bg in class) | TenWorks uses zero radius; keep. Ensure toggle has same padding/background via CSS. |
| Toggle buttons | `sequence-toggle-btn active rounded-md px-3 py-1.5 text-sm font-medium transition-colors` | `sequence-toggle-btn active` + role/aria | C-V uses rounded-md; TenWorks razor-sharp. Keep TenWorks radius. Match padding/font (e.g. px-3 py-1.5, text-sm). |
| Content | **Single list** `#sequence-steps-list` (one list; JS swaps Due vs Upcoming by re-rendering same list) | **Two panels:** `#sequence-steps-due-panel` (table `#dashboard-table`) and `#sequence-steps-upcoming-panel` (table `#all-tasks-table`); CSS/JS toggles visibility | **Major:** C-V = one list, single container; TenWorks = two table panels. To match C-V: either (1) switch to single `#sequence-steps-list` and re-render on tab change (list-based items), or (2) keep two panels + tables and only align look (headers, spacing). |
| Sequence step item (C-V) | Div-based: `.sequence-step-item` with `.sequence-step-left` (due date + action button), `.sequence-step-content` (meta, description, sequence name) | Rows in tables with th/td | If aligning to C-V: add list markup and render sequence steps as `.sequence-step-item` divs; else keep tables. |

### 1.7 Recent Activities card

| Location | Constellation-V | TenWorks | Action |
|----------|-----------------|----------|--------|
| Content | **List** `#recent-activities-list` (`.recent-activity-item` divs: icon wrap, body with meta/description/date, **Log to SF** button) | **Table** `#recent-activities-table` (Date, Account, Contact, Activity) | **Major:** C-V = list with icons + "Log to SF"; TenWorks = table, **no** Salesforce. To match C-V layout: use list + `.recent-activity-item` and **omit** Log to SF button. |
| Activity item (C-V) | `.activity-icon-wrap` (type-based icon), `.activity-body` (meta, description, date), `.activity-actions` (Log to SF) | Table row with 4 cells | Add list-based render and CSS for `.recent-activity-item`, `.activity-icon-wrap`, `.activity-body`, `.activity-date`; do not add `.btn-log-sf`. |

### 1.8 Below grid

| Location | Constellation-V | TenWorks | Action |
|----------|-----------------|----------|--------|
| Downloads | None | **Download CSV Templates** section (subsection-title, links) | **Keep** TenWorks-only. |

### 1.9 Modal / scripts

| Location | Constellation-V | TenWorks | Action |
|----------|-----------------|----------|--------|
| Modal | Same structure; inside extra `</div>` (typo in C-V) | Same structure; no extra wrapper | Keep TenWorks. |
| Theme script | Inline: set `body.className` from `localStorage.getItem('crm-theme')` | None (body has theme-dark) | Keep TenWorks. |
| Tom-select | Script tag | None | Optional. |
| Nav | None | `js/nav-loader.js` | Keep. |
| Main script | `js/command-center.js` | Same | Keep. |

---

## 2. JavaScript (js/command-center.js)

### 2.1 Imports

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| `initializeAppState`, `getState`, `injectGlobalNavigation`, `logToSalesforce`, `showGlobalLoader`, `refreshHUDNodes` | No `initializeAppState`, `getState`, `injectGlobalNavigation`, `logToSalesforce`, `refreshHUDNodes` | TenWorks uses local state + `hideGlobalLoader`; no Salesforce. **Keep** TenWorks pattern; do not add `logToSalesforce` or Salesforce. |

### 2.2 State and DOM refs

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| No `currentUser`/`isManager` in initial state; uses `getState()` for user/effectiveUserId | `state.currentUser`, `state.isManager`; loads from session + user_quotas | Keep TenWorks (manager + ERP logic). |
| Refs: `sequenceStepsList`, `recentActivitiesList`, `myTasksList`, `sequenceToggleDue`, `sequenceToggleUpcoming`, `myTasksHamburger`, `aiBriefingContainer`, `aiBriefingRefreshBtn` | Refs: `dashboardTable`, `recentActivitiesTable`, `allTasksTable`, `myTasksTable` (tbody), `addNewTaskBtn`, `aiDailyBriefingBtn`, `aiBriefingContainer` | If switching to lists: add refs for `sequenceStepsList`, `recentActivitiesList`, `myTasksList` and use them in render. |

### 2.3 loadAllData

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| Uses `getState()`; `effectiveUserId || currentUser.id`; no ERP fetch | Fetches ERP (projects, project_tasks, task_assignments, deals) and updates `#erp-*` counts; user from state.currentUser | Keep TenWorks ERP + user logic. |
| Loading UI: `myTasksList.innerHTML = '<p class="my-tasks-empty ...">Loading tasks...</p>'` | `myTasksTable.innerHTML = '<tr><td colspan="4">Loading tasks...</td></tr>'` | If moving to list: use list empty state. |

### 2.4 completeStep

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| Uses `contact_sequence_steps` update by `sequence_step_id` + `contact_sequence_id` | Same (contact_sequence_steps) | Already aligned. |
| Uses `getState().currentUser.id` for activities | `state.currentUser.id` | Keep TenWorks. |

### 2.5 AI Briefing

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| `renderAIBriefing`: builds `.ai-briefing-priority-card` divs (`.priority-title`, `.priority-reason`); stores HTML in sessionStorage; removes `hidden` from container | `renderAIBriefing`: builds `<ol id="ai-briefing-list">` with `<li>` (strong + em); no sessionStorage | **Align:** (1) Switch to `.ai-briefing-priority-card` markup and add CSS; (2) optionally add sessionStorage restore for briefing HTML. |
| Init: if `crm-briefing-generated`, restore from `crm-briefing-html` else run `handleGenerateBriefing()`; else placeholder text "Refresh to generate..." | No auto-run; no sessionStorage; placeholder "Loading your briefing…" | Optional: auto-run once per session + sessionStorage; or keep current. |
| Placeholder hide: C-V hides placeholder when container has content (CSS `.ai-briefing-content:not(.hidden) + .ai-briefing-placeholder { display: none }`) | JS adds `.briefing-visible` to `.ai-briefing-card-body` to hide placeholder | Keep TenWorks approach or adopt C-V DOM order + CSS. |

### 2.6 renderDashboard — My Tasks

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| Builds `.task-item` divs: `.task-left` (`.task-due`), `.task-content` (`.task-linked`, `.task-description`), `.task-actions` (icon buttons: mark complete, edit, delete) | Builds table rows: Due Date, Description, Linked To, Actions (Complete, Edit, Delete text buttons) | To match C-V: render into `#my-tasks-list` as `.task-item` and use `.btn-icon-only` (check, pen, trash). |
| Empty: `<p class="my-tasks-empty ...">No pending tasks. Great job!</p>` | `<tr><td colspan="4" class="placeholder-text">...</td></tr>` | If list: use my-tasks-empty paragraph. |
| Quick-add: `populateQuickAddSelect()`; form submit inserts task and reloads | Modal for add task | Optional: add quick-add form + populateQuickAddSelect; keep modal as fallback. |
| Hamburger / quick-add visibility: `quick-add-hidden` when task count > 3; `hamburger-expanded` toggles form; icon switches plus/times | Plus opens modal only | If adding quick-add: implement quick-add-hidden and hamburger-expanded logic. |

### 2.7 renderDashboard — Sequence Steps

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| Single list `sequenceStepsList`; `sequenceViewMode` ('due' | 'upcoming'); `renderSequenceStepsList()` fills list from `salesSequenceTasks` or `upcomingSalesTasks` | Two tbody refs: `dashboardTable` (due), `allTasksTable` (upcoming); tab toggle shows/hides panels | To match C-V: use single list + sequenceViewMode; on tab click set mode and call renderDashboard (or renderSequenceStepsList only). |
| Item: `.sequence-step-item` with `.sequence-step-left` (due date, action button), `.sequence-step-content` (meta: contact · type, description, sequence name) | Table rows: Due Date, Contact, Sequence, Step, Description, Action | If list: build `.sequence-step-item` with same structure; reuse step-type icons (LinkedIn, email, call, complete, revisit). |

### 2.8 renderDashboard — Recent Activities

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| Builds `.recent-activity-item`: `.activity-icon-wrap` (type icon), `.activity-body` (meta, description, date), `.activity-actions` with **Log to SF** button (if !logged_to_sf) | Builds table rows: Date, Account, Contact, Activity (no icon, no SF) | To match C-V: render list items with icon + body + date; **do not** add Log to SF button or logged_to_sf. |
| Filter: by effectiveUserId / currentUser (C-V) | By isManager or act.user_id === currentUser.id | Keep TenWorks filter. |

### 2.9 Event listeners

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| recentActivitiesList: click `.btn-log-sf` → logToSalesforce, update activity logged_to_sf | No SF listener | Do not add. |
| sequenceToggleDue/Upcoming: set sequenceViewMode, toggle .active, call renderDashboard() | Toggle .show-upcoming on #sequence-steps-content, toggle .active and aria-selected | C-V re-renders one list; TenWorks swaps panels. If staying with tables, keep panel toggle. |
| myTasksHamburger: toggle hamburger-expanded, swap plus/times icon, title/aria-label | addNewTaskBtn: open modal | If adding quick-add, add hamburger listener. |
| quick-add form submit | Modal submit | If adding quick-add, add form submit. |
| Button delegates: mark-task-complete-btn, delete-task-btn, edit-task-btn, log-call-btn, send-email-btn, send-linkedin-message-btn, complete-step-btn, revisit-step-btn | Same (except C-V uses log-call-btn → openLogCallModal; TenWorks has dial-call-btn + modal) | Keep TenWorks button classes; align class names if switching to list (e.g. mark-task-complete-btn, btn-icon-only). |

### 2.10 Init

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| injectGlobalNavigation(); then createClient; then initializeAppState(supabase); setupUserMenuAndAuth(..., { skipImpersonation: true }); loadAllData(); setupPageEventListeners(); then auto briefing or restore from sessionStorage | loadSVGs; updateActiveNavLink; getSession; user_quotas (isManager); setupUserMenuAndAuth; setupGlobalSearch; checkAndSetNotifications; loadAllData(); aiDailyBriefingBtn + aiBriefingRefreshBtn; setupPageEventListeners | Keep TenWorks init; optionally add briefing auto-run + sessionStorage. |

---

## 3. CSS

### 3.1 Dashboard layout (grid, columns, cards)

| Constellation-V (output.css) | TenWorks (style.css) | Action |
|------------------------------|----------------------|--------|
| #dashboard: not explicit in snippet; .dashboard-sections-grid margin-bottom, grid 2 cols | #dashboard flex column, gap; .dashboard-sections-grid 2 cols, gap, min-height 0 | Already similar; keep TenWorks. |
| .dashboard-column-left/right flex, gap; .dashboard-column-right .section-card flex 1 | Same idea | Aligned. |
| .dashboard-left-top-row grid 2 cols; .ai-briefing-card, .my-tasks-card min-height 0 | Same | Aligned. |
| .section-card margin-bottom, section-card-header padding | TenWorks has section-card-header; margin in grid | Ensure padding on section-card-header matches (e.g. padding-inline, padding-block). |

### 3.2 Section title and table headers

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| #dashboard .section-title font-size var(--text-sm), font-weight semibold | .section-title globally 0.875rem, uppercase, etc.; #dashboard .dashboard-table th same idea | Aligned. |
| #dashboard table th, td padding-inline; th font-weight semibold | #dashboard .dashboard-table th uppercase, 0.875rem, 600, letter-spacing | Aligned. |

### 3.3 AI Briefing card

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| .ai-briefing-card .ai-briefing-content:not(.hidden) + .ai-briefing-placeholder { display: none } | .ai-briefing-card-body.briefing-visible #ai-briefing-placeholder { display: none } | Different approach; both work. |
| .ai-briefing-card .ai-briefing-content:not(.hidden) { display: flex; flex: 1; ...; padding; gap } | #ai-briefing-container (inside card) margin-bottom 0; list styles for #ai-briefing-list | Add .ai-briefing-priority-card styles (border, padding, .priority-title, .priority-reason) if switching briefing to cards. |
| #ai-briefing-container display flex; flex-direction column; gap | TenWorks #ai-briefing-container has background, border-left, etc. | If using priority cards: container as flex column + gap; remove list-only styles. |

### 3.4 Sequence Steps

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| .sequence-toggle-btn color, hover, .active (white, primary-blue) | .sequence-toggle-btn same idea (text-on-primary, primary-color) | Aligned. |
| .sequence-steps-list flex column, overflow-y, padding | TenWorks uses .sequence-steps-content and two .sequence-steps-panel (tables) | If switching to single list: add .sequence-steps-list and .sequence-step-item styles (left, due, actions, content, meta, description, sequence). |
| .sequence-step-item border-bottom, padding; .sequence-step-left width; .sequence-step-due font; .sequence-step-actions; .sequence-step-content; .sequence-step-meta, .sequence-step-description, .sequence-step-sequence | N/A (tables) | Add these if moving to list. |

### 3.5 My Tasks

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| .my-tasks-card, .my-tasks-body, .my-tasks-list flex column, overflow | TenWorks .my-tasks-body + .table-container | If list: add .my-tasks-list, .task-item, .task-left, .task-due, .task-content, .task-linked, .task-description, .task-actions; .task-item.past-due .task-due color | Add if switching to list. |
| .quick-add-card, .quick-add-task-form, .quick-add-input, .quick-add-row | None | Add if adding quick-add form. |
| .my-tasks-hamburger; .my-tasks-card.quick-add-hidden .quick-add-card { display: none }; .my-tasks-card.quick-add-hidden .my-tasks-hamburger { display: inline-flex }; .my-tasks-card:not(.quick-add-hidden) .my-tasks-hamburger { display: none }; hamburger-expanded | N/A | Add if adding quick-add + hamburger. |
| .task-item .task-actions .btn-icon-only size/padding | TenWorks uses .button-group-wrapper with text buttons | Add .btn-icon-only for task actions if using icons. |

### 3.6 Recent Activities

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| .recent-activities-list flex column, padding, overflow | TenWorks uses table | If list: add .recent-activities-list, .recent-activity-item, .activity-icon-wrap (and .icon-email, .icon-call, etc.), .activity-body, .activity-meta, .activity-description, .activity-date, .activity-actions | Add; do not add .btn-log-sf. |

### 3.7 Buttons

| Constellation-V | TenWorks | Action |
|-----------------|----------|--------|
| .btn-icon-header (flex, size, radius) in .ai-briefing-card, .my-tasks-card | .btn-icon-header 2rem, radius 0 | Aligned (TenWorks zero radius). |
| .btn-icon-only for task and sequence actions | Not present | Add .btn-icon-only (min-height/width, padding) for task and sequence action buttons. |
| .btn-log-sf | Do not add | Omit. |

---

## 4. Second pass — Exact game plan (prioritized)

### Must-have (layout and formatting parity)

1. **HTML**
   - Refresh icon: use `fa-rotate-right` (Constellation) instead of `fa-rotate` for parity.
   - Optional: add `id="dashboard-sections-grid"` to the grid div.
   - Keep: ERP row, Downloads, no Salesforce, current nav/theme.

2. **AI Briefing**
   - **Option A (recommended):** Change `renderAIBriefing` to output `.ai-briefing-priority-card` divs (`.priority-title`, `.priority-reason`) instead of `<ol>`/`<li>`; add CSS for `.ai-briefing-priority-card`, `.priority-title`, `.priority-reason` and container as flex column + gap.
   - Keep placeholder + briefing-visible or container-first order; both are fine.

3. **Typography and containers**
   - Ensure all section headers use .section-title (already in place).
   - Ensure dashboard table headers use #dashboard .dashboard-table th (already in place).
   - No change to radius (keep zero).

### Should-have (visual/UX parity)

4. **My Tasks**
   - **Option A:** Keep table; only change action buttons from text to **icon-only** (check, pen, trash) with classes `.mark-task-complete-btn`, `.edit-task-btn`, `.delete-task-btn` and `.btn-icon-only`; add CSS for .btn-icon-only in #dashboard.
   - **Option B:** Add list-based My Tasks: add `#my-tasks-list`, render `.task-item` (task-left, task-content, task-actions with icon buttons), add quick-add form and hamburger toggle; add all C-V list and quick-add CSS (no Salesforce).

5. **Sequence Steps**
   - **Option A:** Keep two-panel tables; ensure toggle and panel styling match (padding, font, active state).
   - **Option B:** Switch to single `#sequence-steps-list`, `sequenceViewMode`, and re-render list on tab change; render `.sequence-step-item` with same structure as C-V; add .sequence-step-* CSS.

6. **Recent Activities**
   - **Option A:** Keep table; optionally add a small type icon in first column (e.g. email/call/LinkedIn icon) via cell content.
   - **Option B:** Switch to list: `#recent-activities-list`, render `.recent-activity-item` with `.activity-icon-wrap`, `.activity-body`, `.activity-meta`, `.activity-description`, `.activity-date`; **no** .activity-actions / Log to SF. Add CSS for .recent-activities-list and .recent-activity-item.

### Nice-to-have

7. **Briefing**
   - Optional: sessionStorage for briefing HTML and auto-run once per session (like C-V).
   - Optional: placeholder text "Refresh to generate a new briefing." when no saved briefing.

8. **Quick-add**
   - Optional: add quick-add form in My Tasks card + hamburger to show/hide; keep modal as secondary.

9. **Loader**
   - Optional: replace loader image with Constellation-style SVG for brand consistency (or keep TenWorks logo).

### Explicitly out of scope

- No Salesforce: no "Log to SF" button, no `logToSalesforce`, no `logged_to_sf` in activities.
- No removal of ERP row or Downloads.
- No change to TenWorks auth/state (currentUser, isManager, user_quotas) or nav (nav-loader.js).

---

## 5. Summary table (what to change per file)

| File | Change summary |
|------|----------------|
| **command-center.html** | Refresh icon `fa-rotate-right`; optional grid id; optional container/placeholder order and class `ai-briefing-content`. |
| **js/command-center.js** | renderAIBriefing → priority cards; optional: list-based My Tasks / Sequence Steps / Recent Activities (and refs + event logic); optional: sessionStorage + auto briefing; keep no Salesforce. |
| **css/style.css** | .ai-briefing-priority-card (and children); optional: .my-tasks-list, .task-item, .quick-add-*, .sequence-steps-list, .sequence-step-item, .recent-activities-list, .recent-activity-item, .btn-icon-only; do not add .btn-log-sf. |

Use this diff as the single source of truth for aligning TenWorks Command Center with Constellation-V while preserving TenWorks-only behavior and omitting Salesforce.

---

## 6. Exact game plan — ordered checklist (second pass)

Use this as the execution order; each line is one concrete task.

### Phase 1 — Quick wins (no DOM/structure change)

- [ ] **HTML:** Change refresh icon from `fa-rotate` to `fa-rotate-right` in `command-center.html`.
- [ ] **JS:** In `renderAIBriefing`, replace `<ol>`/`<li>` with divs: for each priority output `<div class="ai-briefing-priority-card"><div class="priority-title">…</div><div class="priority-reason">…</div></div>`; set container innerHTML to those cards (and optional empty message).
- [ ] **CSS:** Add rules for `#ai-briefing-container` (display flex, flex-direction column, gap), `.ai-briefing-priority-card` (border, padding, background), `.ai-briefing-priority-card .priority-title`, `.ai-briefing-priority-card .priority-reason` (font size/weight/color). Remove or keep `#ai-briefing-list` styles depending on whether any legacy markup remains.

### Phase 2 — My Tasks: icon buttons (keep table)

- [ ] **JS:** In My Tasks table render, replace "Complete", "Edit", "Delete" text buttons with icon-only buttons: same data attributes and classes (e.g. `mark-task-complete-btn`, `edit-task-btn`, `delete-task-btn`) and add class `btn-icon-only`; use `<i class="fa-solid fa-square-check">`, `fa-pen`, `fa-trash` (or Constellation’s exact icon classes).
- [ ] **CSS:** Add `#dashboard .task-actions .btn-icon-only` (or equivalent) min-height/width, padding, so icon buttons match C-V size.

### Phase 3 — Sequence Steps and Recent Activities (choose one path)

**Path A — Keep tables, improve match**

- [ ] **CSS:** Verify sequence toggle and table panels already match (padding, active state); add any missing `.sequence-step-item`-like spacing for table rows if desired.
- [ ] **JS:** No structural change for Sequence Steps or Recent Activities.
- [ ] **Optional:** In Recent Activities table, add an icon (e.g. in first column or before date) based on activity type (email/call/LinkedIn) using same icon mapping as C-V.

**Path B — Switch to list-based (full C-V layout)**

- [ ] **HTML:** Replace My Tasks table body with a wrapper div `#my-tasks-list`. Replace Sequence Steps two panels with a single `#sequence-steps-list`. Replace Recent Activities table with `#recent-activities-list`.
- [ ] **JS:** Add refs for `myTasksList`, `sequenceStepsList`, `recentActivitiesList`. My Tasks: render `.task-item` (task-left/task-due, task-content/task-linked/task-description, task-actions with icon buttons). Sequence Steps: introduce `sequenceViewMode`; on tab click set mode and re-render `sequenceStepsList` with `.sequence-step-item` (sequence-step-left with due + button, sequence-step-content with meta/description/sequence). Recent Activities: render `.recent-activity-item` (activity-icon-wrap, activity-body with meta/description/date); no Log to SF.
- [ ] **CSS:** Add .my-tasks-list, .task-item, .task-left, .task-due, .task-content, .task-linked, .task-description, .task-actions; .sequence-steps-list, .sequence-step-item, .sequence-step-left, .sequence-step-due, .sequence-step-actions, .sequence-step-content, .sequence-step-meta, .sequence-step-description, .sequence-step-sequence; .recent-activities-list, .recent-activity-item, .activity-icon-wrap (and .icon-email, .icon-call, etc.), .activity-body, .activity-meta, .activity-description, .activity-date. Do not add .btn-log-sf.

### Phase 4 — Optional

- [ ] **Quick-add:** Add `#quick-add-card` and form (description, contact/account select, due date, Add) in My Tasks card; add `#my-tasks-hamburger` to toggle visibility; when task count > 3 hide quick-add and show only hamburger; add populateQuickAddSelect and form submit handler; add .quick-add-* and .my-tasks-card.quick-add-hidden / .hamburger-expanded CSS.
- [ ] **Briefing:** Optional sessionStorage save/restore of briefing HTML and auto-run once per session; optional placeholder "Refresh to generate a new briefing." when no briefing.
- [ ] **HTML:** Optional `id="dashboard-sections-grid"`; optional container/placeholder order and class `ai-briefing-content` for C-V-style CSS.

### Do not do

- Do not add any Salesforce button, `logToSalesforce`, or `logged_to_sf` UI/logic.
- Do not remove ERP overview row or Download CSV section.
- Do not change nav (nav-loader.js) or theme/body class strategy unless desired for other reasons.
