# Ops punch list

Director of Operations roadmap: run down until complete. Order = priority.

---

## 1. Actuals and job costing

- [x] **Define where actual hours are entered** – e.g. on task (Schedule/Talent) or timesheet-style.
- [x] **Persist actual hours** – ensure `project_tasks.actual_hours` (or equivalent) is the single source; UI to enter/update.
- [x] **Job cost view** – per project: estimated vs actual hours (and labor value if we have rates); optional: material cost from BOM.
- [x] **Use actuals in “progress”** – Projects detail “Actual Hours” and progress % driven by real actuals.

**Done when:** We can see true margin by job and improve estimates from history.

---

## 2. Materials: reorder and receiving

- [x] **Reorder flow** – from Inventory (item or low-stock list): “Create reorder” / “Order more” → record what to order (item, qty, optional due date). Either a `purchase_orders` (or `reorder_requests`) table or a clear “to order” list.
- [x] **Receiving** – when stock arrives: “Receive” action that updates `qty_on_hand` and optionally ties to the reorder (so we know what’s been received).
- [x] **Low-stock → reorder** – link from “Low Stock” / “Items Short” into the reorder flow so we close the loop.

**Done when:** “Items short” and “Low stock” lead to an order and receiving, not just a red number.

---

## 3. At-risk and behind schedule

- [x] **Overdue tasks** – filter/list: tasks where `end_date < today` and status ≠ Completed.
- [x] **Overdue projects** – filter/list: projects where `end_date` (or CRDD) < today and status ≠ Completed.
- [x] **At-risk definition** – e.g. project “at risk” if end date within X days and (remaining tasks or hours suggest we’ll miss). Implement a simple rule and flag.
- [x] **Surface in UI** – Command Center and/or Schedule/Projects: “Behind schedule” / “At risk” section or badges so we don’t have to dig.

**Done when:** We see what’s late and what’s at risk without opening every project.

---

## 4. Capacity and load

- [x] **Capacity** – define “hours per week” per person (or derive from availability/PTO). Stored or config (e.g. default 40).
- [x] **Load vs capacity** – by person and week: booked hours (from `task_assignments`) vs capacity.
- [x] **Overload view** – “People over 100%” or “Weeks where load > capacity” so we can move work or add labor.
- [x] **Wire to Schedule/Talent** – utilization or capacity bar reflects real capacity, not just a ratio of tasks.

**Done when:** We can answer “Are we over capacity next week?” and “Who’s overloaded?”

---

## 5. Change orders and scope

- [x] **Schema** – e.g. `project_change_orders` (project_id, description, amount, approved_at or status).
- [x] **UI** – on project detail: “Add change order” and list of changes with amount.
- [x] **Revised project value** – display “Original + change orders” so we don’t treat first proposal as final contract value.

**Done when:** Scope creep is tracked and we know the real contract value.

---

## 6. One version of the truth (Schedule/Talent/Projects)

- [x] **Realtime** – Supabase Realtime on `project_tasks` (and optionally `projects`) so open Schedule/Projects/Talent update when data changes.
- [x] Or **clear staleness** – prominent “Data may be stale; click Refresh” and one obvious Refresh so nobody assumes they’re looking at live data without clicking.

**Done when:** Two people in different tabs don’t see conflicting truth.

---

## 7. Client-facing status (optional)

- [x] **Project status page** – public or tokenized URL: project name, status, next milestone, PM contact. No internal schedule or costs.
- [x] **Link from proposal or project** – optional “Share status link” for the client.

**Done when:** Clients can see “where’s my job?” without calling.

---

## Progress key

- `[ ]` Not started  
- `[x]` Complete  

Update this file as items are completed. When all sections are checked, the punch list is complete.
