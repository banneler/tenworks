# Deal → Project flow (gang plank)

## Current state

**How projects are triggered from deals today**
- There is **no** “Launch Project” or “Convert to Project” on the **Deals** page.
- The gang plank is only on the **Production** side:
  - **Projects** and **Schedule** have a “Launch Project” button that opens a modal.
  - User picks a **deal** from a dropdown (all deals), enters phase dates, and submits.
  - A project is created with `deal_id`, name, dates, `project_value`, and default tasks.
- So: deal → project is manual and only from Projects/Schedule, not from the deal itself.

**Proposals**
- **Deals:** “Proposal” link opens `proposals.html?deal_id=X` (create/edit proposal for that deal).
- **proposals_tw** stores `deal_id` and `project_id` when saving.
- **Implemented:** When launching a project (Projects or Schedule), the app looks up the latest proposal for the selected deal and sets **`projects.proposal_id`** to that proposal’s id. The **projects** table must have a nullable `proposal_id` column (FK to `proposals_tw.id`); add it via Supabase if missing.

---

## Recommendations

### 1. Trigger projects from Deals (lay the gang plank from CRM)

**Option A – “Launch Project” on the deal (recommended)**  
- On the Deals page (list and/or kanban), add a **“Launch Project”** action per deal (e.g. next to “Proposal”).
- Prefer showing it when **stage = Closed Won** (or always; you can restrict later).
- Behavior: open the same Launch Project flow with **this deal pre-selected** (and optionally pre-filled from deal name/amount).  
  - **Implementation:** e.g. link to `projects.html?launch_deal_id=<id>` (or `schedule.html?launch_deal_id=<id>`). On load, if `launch_deal_id` is present, open the Launch Project modal with that deal selected and optionally auto-focus “Confirm” so the user only adjusts dates if needed.

**Option B – After “Closed Won”**  
- When the user changes a deal’s stage to **Closed Won**, show a prompt: “Launch project for this deal?” → Yes opens the Launch Project flow (same as above) with that deal pre-selected.

Either way, the **same** Launch Project modal and `projects.insert` logic (Projects or Schedule) stay the single place where projects are created; we only add a **trigger from the deal** and a pre-selected deal.

### 2. Attach the winning proposal to the project

**Why**
- Keeps the sold scope and pricing (the proposal) tied to the project for ops and for reference.

**Data**
- Add a nullable **`proposal_id`** (or `winning_proposal_id`) on **projects** (FK to `proposals_tw.id`), if it doesn’t already exist.
- **proposals_tw** already has `deal_id` (and optionally `project_id` when created from a project). No change required there for the link.

**When launching a project from a deal**
- **Option A – Auto-attach:** After user selects the deal in the Launch modal, look up the most recent proposal with `deal_id = selected deal` (and optionally `status = 'accepted'` if you add that). If one exists, set `project.proposal_id` when inserting the project.
- **Option B – Let user choose:** In the Launch modal, if the selected deal has any saved proposals, show a dropdown “Attach proposal (optional)” and set `project.proposal_id` from the chosen proposal (or “None”).
- **Option C – Both:** Auto-select the latest (or latest accepted) proposal for that deal, but allow the user to change it or clear it in the modal.

**Proposal status (optional)**  
- If you want “winning” to be explicit, add a status on **proposals_tw** (e.g. `draft` | `sent` | `accepted`) and set it when the deal is Closed Won (e.g. from the deal page or when attaching to the project). Then “winning proposal” = proposal with that deal and status `accepted`.

---

## Summary

| Question | Answer |
|----------|--------|
| How are we triggering projects from deals? | Only from **Projects** or **Schedule** via “Launch Project” and picking a deal. No trigger from the Deals page. |
| Should we attach the winning proposal? | **Yes.** Add `proposal_id` on projects and set it when launching from a deal (auto or user choice). |
| Suggested next steps | (1) Add “Launch Project” from Deals (e.g. when Closed Won) linking to Projects with `?launch_deal_id=`. (2) Add `proposal_id` to projects and, in the Launch flow, attach the latest (or user-selected) proposal for the chosen deal. |
