# Ten Works ERP: F1 Proposal Engine & Wiring Plan

**Pipeline flow:** Account → Deal → Proposal → Sale (stage) → Projects. The Proposal module sits between Deal and Sale; when a deal is won it can launch a Project.

## 1. Proposal Engine Port (F1 → Ten Works)

**Source:** Standalone Proposal Engine (JenniB/Enterprise-Proposals) — *not in repo; implemented natively in Ten Works.*

**Approach:**
- **New module:** `proposals.html` + `js/proposals.js` inside Ten Works.
- **Features ported:** Client name, services (line items), pricing, totals, PDF generation. *Sticky notes and inspiration UI omitted.*
- **PDF:** Use browser print (window.print) with a print-only stylesheet for “Save as PDF”. Optional: add `pdf-lib` later for direct PDF generation if needed.
- **Branding:** Ten Works only — logo from `assets/logo.svg`, palette (gold `#b38c62` / `var(--primary-gold)`, dark bg), no Spectrum/GPC references.

**Data pre-fill:**
- From **Deal** (`proposals.html?deal_id=...`): fetch `deals_tw` + `accounts` → Client Name = account name (or deal name), Services = deal products/description or single line “Project”, Pricing = deal `mrc` or `amount`.
- From **Project** (`proposals.html?project_id=...`): fetch `projects` (+ optional `deals_tw` via `deal_id`) and `project_tasks` → Client Name = project name or linked deal’s account, Services = scope/description or task names, Pricing = `project_value` (and optional line items from phases/tasks).

**Integration points:**
- **Deals:** “Generate Proposal” button → `proposals.html?deal_id=<id>`.
- **Projects:** “Generate Proposal” button in project detail → `proposals.html?project_id=<id>` (and pass `deal_id` if present for account name).

---

## 2. ERP Connective Wiring

### 2.1 Project ↔ Schedule Sync
- **Current state:** Both read/write the same Supabase tables: `projects`, `project_tasks`. Schedule loads via `loadShopData()`; Projects loads via `loadProjectDetails()` / `loadProjectsList()`.
- **Conclusion:** No extra sync logic required. Task updates in Projects (Gantt) or Schedule (drag, edit modal) persist to `project_tasks`; the other page sees changes on next load/refresh.
- **Optional enhancement:** If both views are used in parallel, consider a custom event (e.g. `projectTasksUpdated`) and a lightweight refresh when the user returns to the Schedule tab (or use Supabase Realtime on `project_tasks` later).

### 2.2 Talent ↔ Project Allocation
- **Current state:** Talent Matrix uses `project_tasks` (non-completed) and `task_assignments`; staging lane shows unassigned hours; grid shows assignments by person/date.
- **Conclusion:** Talent already reflects “real-time” availability based on active Gantt/project data. No schema change needed. Ensure Talent’s `activeTasks` query stays aligned with Schedule (e.g. same filters for status).

---

## 3. Navigation & Command Center

- **Hub:** Use `command-center.html` as the main CRM hub; add an **ERP Overview** section that aggregates:
  - **Active Projects:** Count of `projects` where `status != 'Completed'` (link to `projects.html`).
  - **Staffing Gaps:** Count of tasks with remaining unassigned hours (from `project_tasks` + `task_assignments`), or link to Talent “Pending” count (link to `talent.html`).
  - **Pending Proposals:** Count of deals in stage “Proposal” (or a dedicated `proposals` table if we add one later); link to `proposals.html` or `deals.html` filtered by stage.
- **Nav:** Add “Proposals” link in the sidebar on Deals, Projects, Schedule, and Talent pages so users can open the Proposal Generator from anywhere.

---

## 4. File and Data Summary

| Item | Action |
|------|--------|
| `proposals.html` | New; Ten Works shell + proposal form + print area |
| `js/proposals.js` | New; Supabase pre-fill (deal_id/project_id), line items, totals, print |
| `projects.html` / `js/projects.js` | Add “Generate Proposal” button → link with `project_id` (and deal_id) |
| `deals.html` / `js/deals.js` | Add “Generate Proposal” button → link with `deal_id` |
| `command-center.html` / `js/command-center.js` | Add ERP Overview section (Active Projects, Staffing Gaps, Pending Proposals) |
| Schedule / Talent | Confirm they use same `project_tasks`; add Proposals nav link |
| Nav (all ERP pages) | Add “Proposals” nav link |

---

## 5. Supabase Usage (Existing)

- **deals_tw:** id, name, deal_name, account_id, stage, mrc, amount, products, close_month, user_id
- **accounts:** id, name, ...
- **projects:** id, deal_id, name, project_value, description, start_date, end_date, status
- **project_tasks:** id, project_id, trade_id, name, start_date, end_date, estimated_hours, ...
- **task_assignments:** task_id, talent_id, assigned_date
- No new tables required for MVP; optional `proposals` table later to store generated proposals and status.
