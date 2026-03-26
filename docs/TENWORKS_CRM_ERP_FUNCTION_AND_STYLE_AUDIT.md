# Tenworks CRM & ERP — Triple-Dip Audit: Function Handling, Styles, and Modal vs Inline Edit

**Scope:** Entire Tenworks CRM and ERP codebase (all HTML + JS under tenworks).  
**Focus:** Function-handling patterns, style consistency, and **modal vs inline edit** inconsistencies.

---

## RUN 1 — Function handling and modal vs inline edit map

### 1.1 Deal editing (major inconsistency)

| Location | Edit mechanism | Notes |
|----------|----------------|--------|
| **Deals page — List view** | **Modal** | Table row has `.edit-deal-btn` → `handleEditDeal(dealId)` opens "Edit Deal" modal. Fields: Deal Name, Account, Stage, Project Value, Close Month, Elements (checkboxes), Notes. Uses `modal-deal-name`, `modal-deal-value`, `modal-deal-notes`, etc. |
| **Deals page — Kanban view** | **Inline only** | Card has `.deal-card-editable` for value, name, account, close_month; stage pill cycles; back has notes edit; elements toggled via pills. **No** "Edit Deal" modal button on card. |
| **Accounts page — Current Deals** | **Inline only** | Same kanban-style card: inline value, name, account, close_month, stage cycle, notes on back, element pills. **Also** `handleEditDeal(dealId)` exists and is wired via delegation to `.edit-deal-btn` — but the **kanban card HTML does not include** `edit-deal-btn`, so the modal is never opened from the account page. User can only inline-edit. |

**Edit Deal modal content differs by page:**

- **deals.js (Deals page):** Label "Project Value" + `modal-deal-value`; "Notes" + `modal-deal-notes`; Elements as checkboxes (`modal-deal-element`). No "Job Details" / products.
- **accounts.js (Account page):** Label "Project Value" + `modal-deal-mrc`; "Job Details" + `modal-deal-products` (textarea). No Notes, no Elements. Create Deal modal uses "Monthly Recurring Revenue (MRC)" and "Products".

So the **same entity (deal)** is edited via:
1. **Deals list:** Full modal (name, account, stage, value, close month, elements, notes).
2. **Deals kanban:** Inline only (no full modal on card).
3. **Accounts:** Inline only on card; a separate "Edit Deal" modal exists in code but is unreachable from the current card markup (no edit button). That modal, if reached, would show a **different form** (mrc, products, no notes/elements).

**Recommendation:** Unify deal edit UX: either (a) add an "Edit" action on account deal cards that opens a modal with the **same** fields as deals.js (value, notes, elements), or (b) standardize on inline-only everywhere and remove/replace the Edit Deal modals with a single shared form when "full edit" is needed.

---

### 1.2 Contact editing

| Action | Mechanism |
|--------|-----------|
| **View/Edit contact** | **Details panel (inline form)** — `#contact-details` with `#contact-form`. Edit in place; Save button in panel. No modal for main contact fields. |
| **Create contact** | **Modal** — "New Contact" with first name, last name, email, etc. Confirm: "Create Contact". |
| **Delete contact** | **Modal** — "Confirm Deletion". Button: "Delete" (btn-danger) + Cancel. |
| **Log Activity** | **Modal** — "Log Activity" with type, description. Confirm: "Add Activity". |

Consistent: create/delete/destructive and "add activity" use modals; main edit is panel form.

---

### 1.3 Account editing

| Action | Mechanism |
|--------|-----------|
| **View/Edit account** | **Details panel (inline form)** — `#account-details` with `#account-form`. Save/Delete in panel. |
| **Create account** | **Modal** — "New Account" (name only). Confirm: "Create Account". |
| **Delete account** | **Modal** — "Confirm Deletion". Button: "Delete" (btn-danger) + Cancel. |
| **Create Deal** (from account) | **Modal** — "Create New Deal" with name, stage, MRC, close month, products. Confirm: "Create Deal". |
| **Create Task** (from account) | **Modal** — "Create Task for {name}" with description, due date. Confirm: "Add Task". |

Same pattern as contacts: panel for main entity edit; modals for create and secondary creates (deal, task).

---

### 1.4 Inventory (ERP)

| Action | Mechanism |
|--------|-----------|
| **Edit item** | **Modal** — `openEditItemModal(item)` → showModal('Edit Inventory Item', …). **Inconsistency:** Modal body contains its **own** "Save Changes" button (`#btn-save-inv`) inside the body; `onConfirm` is `async () => {}`. So the **modal-actions** footer is not used for save; save is handled by a button in the body and `setTimeout` + `onclick`. Other modals use `modal-confirm-btn` in customActionsHtml. |
| **Validation** | Uses `alert('SKU and Name are required.')` and `alert('Update failed: ' + ...)` instead of `showModal("Error", ...)`. |

---

### 1.5 Sequences

| Action | Mechanism |
|--------|-----------|
| **Edit sequence details** | **Inline** — sequence name/description edited in place (state.isEditingSequenceDetails). |
| **Edit step** | **Inline** — step row expands to inputs: `sequence-step-inline-input`, `sequence-step-inline-textarea` for type, delay_days, assigned_to, subject, message. Save/Cancel per step. |
| **Create sequence / Add step / Import / Delete** | **Modals** — various showModal(…) with "Create", "Add Step", "Import Selected", "Discard", "Save Sequence", etc. |
| **Validation** | Mix: showModal("Error", "Please save or cancel…") for edit-state guards; some flows may use alert (not fully audited). |

---

### 1.6 Campaigns

| Action | Mechanism |
|--------|-----------|
| **Template edit** | **Inline** — `template-form-inline`, `template-form-inline-title`, `template-delete-confirm-inline`. Template name/body edited in inline form; delete confirm is inline wrapper. |
| **Campaign create / other actions** | **Modals** or **inline** — e.g. campaign name required validated with `alert('Campaign name is required.')`. Many error/success messages use `alert()` instead of showModal. |

---

### 1.7 Command center

| Action | Mechanism |
|--------|-----------|
| **Edit task** | **Modal** — "Edit Task" with description, due date, linked entity. Confirm: standard modal buttons. |
| **Compose Email / LinkedIn / Log Call / Revisit Step** | **Modal** — all use showModal with form fields and custom action buttons. |
| **Validation** | Mostly `alert()` for required fields and errors (e.g. "Description is required.", "Task not found."). |

---

### 1.8 Cognito & Social hub

- **Cognito:** Action Center is a **modal** ("Action Center") with Mark Completed / Close. Log Activity, Create Task, etc. in modal body. Some validation/feedback via `alert()`.
- **Social hub:** **Modal** for article preview (title, link, Prepare Post, etc.). Refine prompt validation: `alert("Please enter a prompt to refine the text.")`.

---

### 1.9 Projects, Talent, Schedule, Status, Admin

- **Projects:** Add Material to BOM, Add Change Order, Launch Project Plan → **modals**. Some `alert()` for errors.
- **Admin:** User/context management uses modals and table actions; many messages via `alert()` (e.g. "Error adding deal stage", "Records reassigned successfully!").
- **Talent / Schedule / Status:** Not fully scanned; likely modal or panel patterns similar to above.

---

## RUN 2 — Style and function-handling differences

### 2.1 Modal action button order and wording

- **Convention (shared_constants default):** `Confirm` (btn-primary) then `Cancel` (btn-secondary).
- **Custom modals:** Most use **primary first, secondary second** (e.g. "Save Deal" + "Cancel", "Create Contact" + "Cancel"). **Cognito** Action Center: "Mark Completed" (btn-primary) then "Close" (btn-secondary). Consistent.
- **Deals (New Deal):** "Create" + "Cancel". **Accounts (Create Deal):** "Create Deal" + "Cancel". Wording differs ("Create" vs "Create Deal") for similar action.

### 2.2 Form controls in modals

- **accounts.js / contacts.js / deals.js:** Modal body often uses raw `<label>…</label><input>` without a shared class. No consistent `form-control` in accounts/contacts/deals modal bodies.
- **command-center.js:** Uses `class="form-control"` on inputs/textarea (e.g. `modal-email-subject`, `modal-email-body`, `modal-task-description`).
- **inventory.js:** Uses `class="form-control"` in Edit Inventory Item modal body.
- **Inconsistency:** Some modals use `.form-control`, others do not. Form layout also varies (inline grid in inventory vs stacked labels elsewhere).

### 2.3 Error and success feedback

- **showModal("Error", message, …)** — Used in accounts, contacts, sequences, and many create/update flows for validation and API errors.
- **alert(message)** — Used extensively in: deals.js (commit error, deal name required, update deal error, stage update); cognito.js (many validations and "Logged!", "Task created!"); command-center.js (description required, task not found, contact sequence not found, etc.); campaigns.js (call notes, campaign name, template name, clone/delete success); admin.js (load error, reassign success, user updated); projects.js; social_hub.js; shared_constants (profile save).
- **Inconsistency:** Same type of error (e.g. "X is required") is sometimes showModal and sometimes alert. Success messages similarly split (showModal("Success", …) vs alert("… success!")). Recommend standardizing on showModal for errors and optional success toasts so styling and accessibility are consistent.

### 2.4 Section and card structure

- **section-card** used in: accounts, contacts, command-center, deals, sequences, campaigns (HTML). Not every page uses the same wrapper (e.g. admin strips section-card in places; social_hub simplified).
- **details-panel** + **glass-panel** used for account and contact side panels. **details-panel-scrim** and **details-panel-close-btn** on accounts and contacts for overlay/close.
- **form-grid** used in account form, contact form, and inventory modal; not all modals use a grid (e.g. single-column label/input stacks).

### 2.5 Button styles

- **btn-primary**, **btn-secondary**, **btn-danger**, **btn-icon**, **btn-icon-header** used across pages. Generally consistent.
- **Inventory** table: Edit button uses `class="btn-secondary" style="padding:4px 8px;"` — inline style for padding where other pages may use utility classes or no override.
- **Deals** (list) table: Edit likely uses a small icon/button; need to confirm class matches other list actions.

---

## RUN 3 — Final pass: consolidated inconsistency list

### Modal vs inline edit — summary table

| Entity / Feature | Create | Edit | Delete / Destructive |
|------------------|--------|------|----------------------|
| **Deal (Deals list)** | Modal | **Modal** | — |
| **Deal (Deals kanban)** | — | **Inline** (card) | — |
| **Deal (Accounts)** | Modal | **Inline only** (card; Edit Deal modal exists in code but no trigger on card) | — |
| **Deal modal form** | — | **Different** in deals.js (value, notes, elements) vs accounts.js (mrc, products) | — |
| **Contact** | Modal | **Panel form** | Modal |
| **Account** | Modal | **Panel form** | Modal |
| **Inventory item** | — | **Modal** (save button inside body, not footer) | — |
| **Sequence** | Modal | **Inline** (name/details + step rows) | Modal |
| **Sequence step** | Modal (Add Step) | **Inline** (expand row) | — |
| **Campaign template** | — | **Inline** | Inline confirm |
| **Task (Command center)** | — | **Modal** | Modal |
| **Cognito alert** | — | **Modal** (Action Center) | — |

### Function-handling inconsistencies

1. **Deal edit:** Two different "Edit Deal" modal forms (deals.js vs accounts.js) and three entry points (list modal, kanban inline, account inline-only). Account card has no way to open full modal.
2. **Inventory edit modal:** Save is a button inside modal body with empty onConfirm; other modals use footer confirm/cancel. Validation uses alert().
3. **Validation/errors:** Mixed use of `showModal("Error", …)` vs `alert()`. Same for success (showModal("Success", …) vs alert("… success!")).
4. **Modal form styling:** Some modals use `.form-control`, others plain inputs. Layout (grid vs stack) inconsistent.

### Style inconsistencies

1. **Modal body form controls:** command-center and inventory use `form-control`; accounts, contacts, deals modal bodies often do not.
2. **Inline styles:** Inventory edit button uses `style="padding:4px 8px;"`; some modal bodies use inline `style="width:100%; margin-top:15px;"` for buttons. Prefer CSS classes.
3. **Section structure:** admin and social_hub use simpler or no section-card wrappers; others use section-card consistently.

---

## RUN 2 (second read) — Additional notes

### Deals list view: Edit button missing in table

- **deals.js** attaches a click listener to `#deals-table tbody` for `.edit-deal-btn` and `.deal-name-link`. If edit-deal-btn is clicked, `handleEditDeal(dealId)` runs.
- The **list view row** (`deal-cell-actions`) is rendered with only: (1) nothing for Closed Lost, (2) "Launch Project" link for Closed Won, (3) "Proposal" link otherwise. There is **no** `.edit-deal-btn` in the row markup. So in **List view**, the Edit Deal modal is **never** openable from the table — the handler exists but the button is not rendered. Either the list view used to have an Edit icon and it was removed, or it was never added. **Recommendation:** Add an Edit action (e.g. icon button with class `edit-deal-btn` and `data-deal-id`) in `deal-cell-actions` so list view users can open the same Edit Deal modal as intended.

### Talent and Schedule (ERP)

- **Talent:** Create Internal Task → **modal** with form-control inputs. Manage Skills and Schedule (per person) → **modals**; Schedule modal includes "Save Allocation" and PTO dates with buttons inside the body (similar to inventory: primary action sometimes inside modal body).
- **Schedule:** "Manage: {project}", "Edit Task: {task}", "Launch Project Plan" → **modals**. Edit Task is modal-based edit.
- **Status:** No showModal in status.js (minimal or no modal usage).

### Talent / Schedule modals

- Talent uses `form-control` and inline `style="..."` for grid/gap (e.g. `style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;"`). Schedule modals also use form-control and inline styles. Same pattern as inventory: form-control present, layout via inline style.

---

## RUN 3 (third read) — Final in-depth notes

### Data model vs UI: Deal value and products

- **deals_tw** supports both `value` and `mrc` (getDealValue uses value ?? mrc). It also has `elements` (Steel, Aluminum, …) and optionally `products` (comma-separated text). **accounts.js** Edit Deal and Create Deal use **mrc** and **products** only. **deals.js** Edit Deal uses **value**, **notes**, and **elements** (checkboxes). So the same table is being written with different field sets from different pages — risk of overwriting or leaving one set stale when editing from the other flow. Unifying the Edit Deal form (and ensuring one source of truth: value vs mrc, elements vs products) will require a product decision (fabrication elements vs job details/products) and then aligning both accounts and deals to that model.

### Modal footer vs in-body actions

- **Standard pattern:** customActionsHtml with `modal-confirm-btn` + `modal-cancel-btn` in `#modal-actions` footer; onConfirm reads from modalBody and returns.
- **Exceptions:** (1) **Inventory** Edit Item: no footer actions used; "Save Changes" button inside body + setTimeout + onclick. (2) **Talent** Schedule modal: "Save Allocation" and PTO "Save" inside body. (3) **Cognito** Action Center: custom buttons "Mark Completed" and "Close" in footer but then document.getElementById(...).addEventListener so not using the generic confirm/cancel wiring. In-body actions make keyboard/accessibility and "click outside to close" behavior inconsistent; prefer moving primary action to footer where possible.

### Consolidated priority list

1. **Deal edit:** Unify form (fields and labels) and entry points: add Edit to Deals list row; add Edit to account deal card or remove unreachable handleEditDeal; align deals.js and accounts.js to one deal edit form (value/mrc, notes/products/elements).
2. **Deals list:** Add `.edit-deal-btn` to list view actions cell so Edit Deal modal is reachable.
3. **Error/success:** Replace `alert()` with `showModal("Error", …)` or a shared toast for validation and API errors; use showModal("Success", …) or toast for success where appropriate.
4. **Inventory (and similar):** Refactor Edit Item modal to use footer confirm/cancel and onConfirm; replace alert() with showModal for validation and errors.
5. **Modal form styling:** Add `.form-control` (or shared input class) to account/contact/deal modal bodies and use a single layout pattern (e.g. form-grid where multi-field) for consistency.
6. **Inline styles:** Replace inline style on inventory edit button and modal body buttons with CSS classes.

---

*End of triple-dip audit. Use this document to prioritize unifying deal edit UX, standardizing error/success feedback (showModal vs alert), and aligning modal form markup and styles.*
