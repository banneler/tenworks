# Ten Works — Wiring Trace

**Purpose:** Where wires are crossed, what’s not patched yet, and where to prioritize development.

---

## 1. Crossed wires (fix first)

### 1.1 Proposals: prefill when both `deal_id` and `project_id` are in the URL

- **Where:** `js/proposals.js` init (around line 632–634).
- **Behavior:** `if (state.dealId) prefillFromDeal(...); else if (state.projectId) prefillFromProject(...)`.
- **Problem:** From **Projects**, the link is `proposals.html?project_id=X&deal_id=Y`. The code runs **prefillFromDeal** because `deal_id` is checked first, so the form is filled from the deal instead of the project.
- **Fix:** Prefer **project_id** when both are present (e.g. `if (state.projectId) await prefillFromProject(...); else if (state.dealId) await prefillFromDeal(...)`).

### 1.2 ~~Command center nav vs ERP nav~~ → Gang plank (resolved)

- **Design:** CRM and ERP are two “ships”; we use **one link each way** so sales and ops can see the full picture without linking every page.
- **CRM → ERP:** Command Center has a single **“Production”** link (pill) → `schedule.html`. ERP Overview cards still link to Projects, Talent, Proposals for the counts. Other CRM pages do *not* get Production in the nav—sales focuses on CRM; when they need ops view they go to Command Center then Production.
- **ERP → CRM:** ERP nav has no sidebar link to Command Center; ops use the **CRM** pill to reach `command-center.html`.
- **User-guide and IRR:** Removed from Ten Works portal (cognito.html, ai-admin.html). They were Constellation migration ghosts and are not used.

### 1.3 Staffing Gaps count: hours vs days

- **Where:** `js/command-center.js` `loadErpOverview()`.
- **Behavior:** Each `task_assignments` row is counted as **8 hours** (`hoursByTask[a.task_id] += 8`). Gap = tasks where `booked < estimated_hours`.
- **Risk:** If `task_assignments` is “one row per person per day” and real hours per day vary (e.g. 4 vs 8), the count can be wrong. If the table has an `hours` column, it should be used instead of a fixed 8.
- **Action:** Confirm schema of `task_assignments` (hours per row or “day”); if hours exist, use them for the gap count.

### 1.4 ~~Broken nav links~~ → Ghost links removed

- **cognito.html:** User Guide link removed (Constellation ghost; not used in Ten Works).
- **ai-admin.html:** IRR Calculator and User Guide links removed (Constellation ghosts; not used in Ten Works).
- **CRM-only pages** (social_hub, sequences, campaigns, contacts, accounts) intentionally do *not* have Production/ERP in the sidebar—sales stays in CRM; they reach ERP via Command Center → Production.

---

## 2. Not patched yet (incomplete or missing)

### 2.1 `proposals_tw` table

- **Where:** `js/proposals.js` — save, load, list (refreshLoadSelect) all use `proposals_tw`.
- **Plan:** F1 doc says “optional `proposals` table later”.
- **Current:** Code uses **`proposals_tw`** with columns: `id`, `user_id`, `deal_id`, `project_id`, `title`, `client_name`, `content_json`, `status`, `updated_at`. If the table doesn’t exist in Tenworks Supabase, **Save** falls back to `localStorage` (saveToLocalFallback); **Load** list will be empty and **Load** from DB will fail.
- **Action:** Either create `proposals_tw` in Tenworks (matching the row shape above) so save/load/list work, or document that proposal persistence is local-only until the table exists.

### 2.2 ~~Command center: Schedule / Projects / Talent not in sidebar~~ → Gang plank in place

- **Patched:** Command center has one **“Production”** link → schedule.html. ERP Overview cards link to Projects, Talent, Proposals. No need to add every ERP page to CRM nav.

### 2.3 CRM-only pages (intentional)

- **Pages:** social_hub, sequences, campaigns, contacts, accounts use CRM sidebar only (no Production/ERP links).
- **By design:** Sales focuses on their job; to see the full picture they go to Command Center → Production. We do not link every CRM page to ERP.

### 2.4 Inventory / Shop dashboard / Admin

- **inventory.html:** Uses ERP nav (Schedule, Talent, Projects, Inventory); no Command Center link (use CRM pill).
- **shop-dashboard.html:** Not in the main sidebar of command-center or other pages; entry is unclear.
- **admin.html:** Internal admin nav only; “Exit Admin Portal” → command-center.
- **Action:** Decide if Inventory and Shop Dashboard should be in the main sidebar and add them; otherwise document as “alternate entry” pages.

---

## 3. Data and table usage (reference)

- **Single Supabase project:** All app code uses `shared_constants.js` → `SUPABASE_URL` / `SUPABASE_ANON_KEY` (Tenworks project `ccrnueyxmnzqlaphqdjn`). No mixed projects.
- **Tables the app expects (by area):**
  - **Auth / user:** `user_quotas`, `user_preferences`, `user_page_visits` (via shared_constants).
  - **Proposals:** `proposals_tw` (optional; fallback to localStorage).
  - **Deals / CRM:** `deals_tw`, `accounts`, `deal_stages`.
  - **Projects / ERP:** `projects`, `project_tasks`, `task_assignments`; Storage bucket `project_files`; `project_contacts`, `project_notes`, `project_bom`.
  - **Schedule:** `projects`, `project_tasks`, `shop_trades`, `talent_availability`, `shop_machines`.
  - **Talent:** `shop_talent`, `shop_trades`, `talent_skills`, `talent_availability`, `task_assignments`, `project_tasks` (incl. `assigned_talent_id`).
  - **Command center:** `projects`, `project_tasks`, `task_assignments` (ERP counts); `tasks` (My Tasks); `contact_sequences`, `sequence_steps`, `contact_sequence_steps`, `activities`; `user_quotas`; `deals_tw` (Pending Proposals = stage `'Proposal'`).
  - **Other:** `sequences`, `sequence_steps`, `contacts`, `accounts`, `activities`, `social_hub_posts_tw`, `user_post_interactions`, `inventory_items`, `product_knowledge`, `marketing_sequences`, `marketing_sequence_steps`, `cognito_alerts`, etc.
- **Deal stage:** Deals use `deal.stage`; stages come from `deal_stages.stage_name`. “Pending Proposals” in command center = deals where `stage === 'Proposal'`. Ensure that stage exists in `deal_stages` if you use it.

---

## 4. Where to prioritize development

### P0 — Fix soon

1. **Proposals prefill when both deal_id and project_id:** Prefer `project_id` so “Generate Proposal” from Projects fills from project (see §1.1).
2. **Create or confirm `proposals_tw`:** If you want DB-backed proposal save/load, add the table and (if needed) RLS; otherwise treat as local-only and document.

### P1 — UX / consistency

3. **Gang plank:** Done. CRM hub is Command Center with “Production” pill → Schedule; ERP nav has no Command Center link; ops use CRM pill to reach command-center. We do not link every page.
4. **Ghost links:** Done. User Guide and IRR Calculator links removed from cognito.html and ai-admin.html (Constellation ghosts; not used in Ten Works).

### P2 — Optional / later

5. **Staffing Gaps:** Align with real `task_assignments` schema (hours vs fixed 8 hrs/day) and adjust command-center logic if needed.
6. **CRM pages:** Intentionally not given ERP links; gang plank is Command Center → Production (pill) only.
7. **Realtime / sync:** Per F1 plan, optional `projectTasksUpdated` event or Supabase Realtime on `project_tasks` when Schedule and Projects are used in parallel.

---

## 5. Summary

| Category              | Count | Notes                                              |
|-----------------------|-------|----------------------------------------------------|
| Crossed wires         | 2     | Prefill priority (fixed), staffing hours logic     |
| Not patched           | 2     | proposals_tw table, Inventory/Shop/Admin placement |
| P0 priorities         | 1     | proposals_tw (or document local-only)              |
| P1 (done)             | 2     | Gang plank (Production / Command Center), ghost links removed |

**Gang plank:** CRM → ERP via “Production” pill (Command Center); ERP → CRM via “CRM” pill (no Command Center in ERP sidebar). Hub renamed to Command Center. User Guide and IRR removed from Ten Works (Constellation ghosts).

All app code targets the **Tenworks** Supabase project; no other project refs were found in the repo.
