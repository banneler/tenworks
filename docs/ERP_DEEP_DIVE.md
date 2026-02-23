# ERP Module: Page-by-Page Deep Dive

Regimented review of **Schedule**, **Talent**, **Projects**, and **Inventory**: current functionality, connective tissue (data and cross-links), and feature build-out. Use this as a roadmap for fixes and enhancements.

---

## Shared context

- **Tables:** `projects`, `project_tasks`, `task_assignments`, `shop_trades`, `shop_talent`, `talent_skills`, `talent_availability`, `shop_machines`, `inventory_items`, `project_bom`, `project_notes`, `project_contacts`; storage bucket `project_files`.
- **Single source of truth:** Schedule and Projects both read/write `projects` and `project_tasks`. Talent reads the same tasks + `task_assignments`. No formal sync beyond “refresh”; optional later: Realtime or `projectTasksUpdated` event.
- **Nav:** ERP nav (partials/nav-erp.html) = Schedule, Talent, Projects, Inventory; CRM pill for Command Center.

### Assignee: single source of truth

- **Canonical field:** `project_tasks.assigned_talent_id` is the single source of truth for “who is assigned to this task” for display and conflict checks.
- **Talent page:** When the user drags a task onto a person/date, the app (1) inserts/upserts `task_assignments` (task_id, talent_id, assigned_date) and (2) updates `project_tasks.assigned_talent_id` to that person. Both must be updated so Schedule and Command Center stay consistent.
- **Schedule:** Reads `assigned_talent_id` only (for conflict detection: same person, same day). Schedule does not write assignee; use Talent to assign. Use **Refresh** to see assignee changes made in Talent.
- **Command Center:** Staffing Gaps use `task_assignments` (hours per row) to compute “booked” hours; assignee display elsewhere should use `assigned_talent_id` when you need “the” assignee for a task.
- **Stale UI:** If Schedule and Talent are both open, changes in one do not appear in the other until refresh. Use the Refresh button on Schedule (and reload on Projects) to sync.

---

## 1. Schedule (`schedule.html` + `js/schedule.js`)

### Current functionality
- **Views:** Resource (by trade/person), Project (by project), Machine. Toggle and filters (e.g. show/hide completed).
- **Data:** Loads `shop_trades`, `project_tasks` (with project + trade names), `projects`, `talent_availability`, `shop_machines`. Filters out completed projects when “hide completed” is on.
- **Gantt:** Renders tasks as bars; drag to resize or move. Dependency chain: moving a task can push dependent tasks (by `dependency_task_id`). Conflict check uses `assigned_talent_id` (same person, same day = conflict).
- **Task edit modal:** Edit name, dates, estimated hours, **status** (Pending / In Progress / Completed). No assignee picker in Schedule modal (assignee lives in Talent and `project_tasks.assigned_talent_id`).
- **Launch Project:** Modal to pick a deal, set phase dates, create project + default tasks (Kickoff, CAD, Fabrication, Installation) with dependencies. Supports `?launch_deal_id=` from Deals (Closed Won).

### Connective tissue
- **Read/write:** `project_tasks` (insert, update, delete), `projects` (e.g. end_date when dragging project bar). Same tables as Projects page.
- **Talent:** Schedule uses `assigned_talent_id` for conflict detection only; actual assignment is done in Talent (drag task to person/date → `task_assignments` + `project_tasks.assigned_talent_id`).
- **Deals:** Launch Project uses `deals_tw`; new project gets `deal_id`.

### Gaps / risks
- **Staffing Gaps (Command Center):** Count assumes 8 hrs per `task_assignments` row. If assignments store actual hours, the count is wrong; confirm schema and align.
- **No assignee in Schedule:** Can’t assign a person from Schedule; user must go to Talent. Documented behavior but could add a small “Assign” link that opens Talent with context.
- **Realtime:** If user has Schedule and Projects open, changes don’t appear until refresh. Optional: Supabase Realtime on `project_tasks` or custom event.

### Feature build-out
- Add “Assign” (or “Open in Talent”) from task context in Schedule when task has no assignee.
- Optional: show assignee name on the bar (from `assigned_talent_id` + `shop_talent`) or tooltip.
- Optional: Realtime or manual “Refresh” for cross-tab consistency.

---

## 2. Talent (`talent.html` + `js/talent.js`)

### Current functionality
- **Matrix:** Rows = people (shop_talent), columns = dates. Cells show assignments (from `task_assignments` + `project_tasks`). Drag task from staging lane onto a cell to assign (writes `task_assignments` and `project_tasks.assigned_talent_id`).
- **Staging lane:** Unassigned / partially assigned tasks (from `project_tasks` where status ≠ Completed). “Shop Infrastructure” internal project created if missing (for internal tasks).
- **Data:** `shop_talent`, `shop_trades`, `talent_skills`, `talent_availability`, `task_assignments`, `project_tasks` (non-completed). Filter by trade.
- **PTO / availability:** Can block dates (talent_availability) and bulk-delete assignments in a range; PTO flow deletes assignments and marks availability.
- **Internal tasks:** Add internal task (e.g. “Machine Maintenance”) to Shop Infrastructure project.

### Connective tissue
- **project_tasks:** Same as Schedule/Projects. Talent updates `assigned_talent_id` and uses `task_assignments` for per-date allocation. Schedule’s conflict check reads `assigned_talent_id`.
- **task_assignments:** One row per (task, talent, date) style allocation; Command Center uses these for “Staffing Gaps” (tasks where assigned hours < estimated_hours, with 8 hrs/row assumption).

### Gaps / risks
- **Hours model:** If `task_assignments` is “1 row = 1 day” and each row counted as 8 hrs, that’s consistent with Command Center. If you add an `hours` column later, Talent and Command Center need to use it.
- **Staging lane source:** Unassigned tasks = tasks with no (or insufficient) assignments. Ensure same status filter as Schedule (e.g. exclude Completed).

### Feature build-out
- Link from Talent cell/task to Schedule or Projects (e.g. “View on Schedule”).
- Optional: show remaining hours per task in staging (estimated_hours − assigned hours).
- Optional: “Suggested assignee” by trade/skills (talent_skills vs project_tasks.trade_id).

---

## 3. Projects (`projects.html` + `js/projects.js`)

### Current functionality
- **List:** All projects; search, hide $0. Select project → detail panel.
- **Detail:** Name, status, start/end, scope (description), countdown, value. **Generate Proposal** → `proposals.html?project_id=&deal_id=` (if deal linked). Link to deal not shown in UI but deal_id stored.
- **Tasks:** Read-only list of `project_tasks` for selected project (“Edit in Schedule”). Total estimated hours shown.
- **Tabs:** Tasks, Contacts, Files, Notes, BOM. Contacts from `project_contacts` → contacts; Files from storage `project_files` (upload, preview, download); Notes from `project_notes` (add note, system notes on save); BOM from `project_bom` (add line: inventory item + qty_allocated, delete line).
- **Launch Project:** Same deal-pick + phase-dates modal as Schedule; creates project + default tasks. Supports `?launch_deal_id=` from Deals (Closed Won).
- **Delete project:** Soft or hard delete; confirm.

### Connective tissue
- **project_tasks:** Same as Schedule/Talent. Projects does not edit tasks (read-only; “Edit in Schedule”).
- **project_bom:** Links to `inventory_items`. BOM lines have `qty_allocated`; inventory “Items Allocated” could sum these (not yet wired in inventory.js).
- **project_files:** Storage bucket; path `{projectId}/{fileName}`.
- **Deals:** `deal_id` on project; Launch from deal (Deals page or Projects/Schedule).

### Gaps / risks
- **No proposal_id on project:** Winning proposal not attached (see DEAL_TO_PROJECT_FLOW.md).
- **Gantt on Projects:** Detail shows task list only, no Gantt; Schedule is the Gantt. Documented; optional later: minimal Gantt in Projects or “Open in Schedule” with project filter.
- **BOM qty_allocated:** Projects BOM has qty; inventory doesn’t yet consume BOM to show “allocated” per item or reserve stock.

### Feature build-out
- Add `proposal_id` to projects; when launching from deal, attach latest (or selected) proposal for that deal.
- “Open in Schedule” / “Open in Talent” from project detail (deep link with project filter if supported).
- Use `project_bom` to drive Inventory “Items Allocated” (and optionally “reserved” or “available”).

---

## 4. Inventory (`inventory.html` + `js/inventory.js`)

### Current functionality
- **List:** `inventory_items`; search (SKU, name), filter by category. Columns: SKU, name, category, location, qty on hand, **allocated** (hardcoded “0 (Sim)”), cost, actions.
- **KPIs:** Total stock value (qty × cost); low stock count (qty_on_hand ≤ reorder_point); **Items Allocated** (metric exists in HTML but never set in JS; stays 0).
- **Add item:** Modal with SKU, name, category, location, qty on hand, cost. Insert into `inventory_items`. **reorder_point** and **uom** not in add form (schema may have them; new items may have null reorder_point).
- **Edit:** `editItem(id)` is a stub: “Edit feature coming in V2!”.

### Connective tissue
- **project_bom:** Projects BOM references `inventory_items` and has `qty_allocated`. Inventory does not yet query `project_bom` to show allocated qty per item or total “Items Allocated.”
- **Projects:** When adding BOM line, dropdown loads `inventory_items`; BOM is the only consumer of inventory in the app so far.

### Gaps / risks
- **Allocated = 0:** Not computed from `project_bom`. Sum of `project_bom.qty_allocated` by `inventory_item_id` (or by item for each row) would give real allocated.
- **Add item:** Missing `reorder_point`, `uom` in form if schema has them; low-stock logic uses reorder_point (so new items may be treated as not low stock).
- **Edit:** Not implemented.

### Feature build-out
- **Items Allocated:** Query `project_bom` (e.g. sum qty_allocated per inventory_item_id, or total lines); set `metric-allocated` and per-row “Allocated” from that.
- Add **reorder_point** and **uom** to Add (and Edit) item form; ensure schema supports them.
- Implement **Edit item** (modal with pre-filled fields, update `inventory_items`).
- Optional: “Allocated to projects” drill-down (which projects have this item in BOM and qty).

---

## 5. Cross-cutting

| Area | Status | Note |
|------|--------|------|
| **project_tasks** | Single source of truth | Schedule + Projects + Talent all use it; no sync layer yet. |
| **task_assignments** | Used by Talent + Command Center | 8 hrs/row assumption for Staffing Gaps; confirm schema. |
| **assigned_talent_id** | Set in Talent, read in Schedule | Conflict check only; assignment only in Talent. |
| **project_bom ↔ inventory** | One-way | Projects consumes inventory for BOM; Inventory doesn’t show BOM allocations yet. |
| **Deal → Project** | Implemented | Launch from Deals (Closed Won) and from Projects/Schedule; `launch_deal_id` pre-select. |
| **Proposal → Project** | Not attached | No `proposal_id` on project yet. |

---

## 6. Suggested priority order

1. **Inventory: allocated from BOM** – Implement “Items Allocated” (and per-row allocated) from `project_bom` so inventory reflects real allocations.
2. **Inventory: Add/Edit** – Add reorder_point + uom to Add; implement Edit item.
3. **Projects: proposal_id** – Add column and attach winning proposal when launching from deal (see DEAL_TO_PROJECT_FLOW.md).
4. **Command Center: Staffing Gaps** – Confirm `task_assignments` schema (hours vs 8 hrs/row); adjust count if needed.
5. **Optional: cross-links** – “Open in Schedule” / “Open in Talent” from Projects; “View on Schedule” from Talent task.
6. **Optional: Realtime or refresh** – Keep Schedule and Projects in sync when both open.

Use this doc as the regimented ERP backlog: fix connective tissue first (allocated, edit, proposal_id, staffing count), then add cross-links and Realtime if you want them.
