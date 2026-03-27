# Tenworks 5-Pass Functional Review (CRM + ERP)

Date: 2026-03-26  
Scope: Full app walkthrough from pre-sale to post-sale handoff, including CRM + ERP + status portal + admin tooling.  
Method: Static code and integration-path review across HTML, JS, shared utilities, and existing audit docs.

---

## Executive Snapshot

### Mission-Critical Items

1. **Password reset flow points to legacy domain**
   - `js/auth.js` uses `redirectTo: 'https://www.constellation-crm.com/reset-password.html'`.
   - Impact: Reset links can route users to the wrong environment/domain and fail production password resets.
   - Priority: **Immediate**

2. **Project team contact links use wrong query key**
   - `js/projects.js` links to `contacts.html?id=...`, while `js/contacts.js` reads `contactId`.
   - Impact: Clicking project contacts will not auto-open the intended contact detail.
   - Priority: **Immediate**

3. **Admin analytics still references old deals table**
   - `js/admin.js` uses `tablesToFetch = ['activities', 'contact_sequences', 'campaigns', 'tasks', 'deals']`.
   - App standard is `deals_tw`.
   - Impact: Broken/empty admin analytics for deal pipeline metrics.
   - Priority: **Immediate**

4. **Legacy data source script still in repo with different Supabase project**
   - `js/script.js` hardcodes a different Supabase URL than `js/shared_constants.js`.
   - Impact: High operational risk if this file is accidentally reintroduced or referenced.
   - Priority: **Immediate cleanup**

---

## Pass 1 - Architecture + System Interaction Map

### What was reviewed
- Page inventory and script wiring across CRM/ERP pages.
- Shared app infrastructure: nav injection, auth bootstrap, global search, theme/user state.
- Existing internal docs for flow intent and known migration deltas.

### Findings
- Architecture is cleanly split into:
  - **CRM:** `command-center`, `accounts`, `contacts`, `deals`, `proposals`, `campaigns`, `sequences`, `social_hub`, `cognito`.
  - **ERP:** `schedule`, `talent`, `projects`, `inventory`.
- `partials/nav-crm.html` and `partials/nav-erp.html` establish a good two-mode navigation model.
- Shared concerns are centralized in `js/shared_constants.js` (modal, global state, auth helpers, theme, search, notifications).
- One outlier exists: `js/script.js` appears legacy and not used by current HTML, but carries a separate Supabase project URL.

### Pass 1 carry-forward notes
- Validate pre-sale to post-sale handoff friction.
- Validate schema/table consistency across CRM and ERP.
- Validate cross-page deep-linking correctness.

---

## Pass 2 - CRM Flow (Pre-Sale to Closed-Won)

### Journey reviewed
- Command Center -> Accounts/Contacts -> Deals -> Proposals -> Campaigns/Sequences -> Cognito/Social support.

### Findings (Functional)

#### Required Fixes
- **Admin analytics table mismatch**  
  `js/admin.js` fetches `deals` instead of `deals_tw`.

- **Reset flow domain mismatch**  
  `js/auth.js` reset redirect targets legacy constellation domain.

- **Heavy mixed modal/alert UX**  
  `alert()` and `confirm()` are still heavily used across CRM pages (`command-center`, `campaigns`, `cognito`, `social_hub`, `proposals`, `admin`), while other flows use standardized `showModal()` and toasts.  
  This creates inconsistent validation behavior and visual tone.

#### Enhancements
- **Deal editing parity still uneven by surface**
  - Deals list/kanban/accounts do not feel fully unified in edit depth and form semantics.
  - Standardize one “full edit” entry point and one canonical payload shape.

- **Campaign workflow resilience**
  - Large dependency on modal state and dynamic DOM IDs.
  - Add lightweight guardrails around selected campaign/member assumptions before action submission.

### Pass 2 review of Pass 1 notes
- Confirmed table consistency risk (`deals` vs `deals_tw`) is real.
- Confirmed one major deep-link mismatch discovered in CRM-adjacent flow (`contacts` link from projects).

---

## Pass 3 - ERP Flow (Project Creation, Scheduling, Talent, Inventory)

### Journey reviewed
- Closed-won deal handoff -> Project launch -> Task scheduling -> Talent assignment -> Inventory allocation -> Customer status sharing.

### Findings (Functional)

#### Required Fixes
- **Broken link into Contacts from Projects**
  - `js/projects.js` uses `contacts.html?id=...`.
  - `js/contacts.js` requires `contacts.html?contactId=...`.

- **Inventory page still uses inline styles heavily**
  - Functional behavior is strong, but styling/interaction consistency diverges due to inline button styling and table-cell styles.
  - This slows theme consistency and increases regressions during UI updates.

#### Enhancements
- **Project launch logic duplicated**
  - Similar “Launch Project” creation logic exists in both `js/projects.js` and `js/schedule.js`.
  - Extract to a shared function/module to prevent drift and bugs.

- **Cross-tab state sync strategy**
  - Talent has realtime channel usage.
  - Schedule/Projects still rely largely on manual refresh and staleness banners.
  - Add common update signaling or realtime subscriptions where practical.

- **Assignment-hour assumptions**
  - Parts of scheduling capacity/staffing still rely on default-hour assumptions.
  - Align all calculations to explicit `task_assignments.hours` when present.

### Pass 3 review of prior notes
- Handoff flow is largely implemented and coherent.
- Biggest ERP-grade defect found is link contract mismatch from project contacts into CRM contact details.

---

## Pass 4 - Cross-Cutting (Security, Data Integrity, UX/Styling Consistency)

### Security + Data Integrity
- **Good:** Auth gate is present on most private pages before data loading.
- **Risk:** Manager-mode data loading in places (example: `js/command-center.js`) assumes RLS correctness; this is acceptable if RLS is strict, but fragile if policy drifts.
- **Risk:** Legacy `js/script.js` contains alternate Supabase target and anon key; remove to eliminate accidental cross-environment usage.

### UX + Style Consistency
- **Modal stack inconsistency**
  - Coexistence of `showModal`, `alert`, `confirm`, and ad-hoc inline action buttons.
- **Inline style density**
  - Significant inline styling in ERP and admin surfaces (`projects`, `inventory`, `talent`, `schedule`, `shop-dashboard`, `status`), making theme and spacing consistency harder.
- **Design rule drift**
  - Core pages follow Tenworks styling system better than utility/portal pages, where radius/padding/color tokens are often hardcoded.

### Testing Gaps
- No observable integration tests guarding:
  - route parameter contracts (`contactId`, `accountId`, `sequenceId`, `project_id`, `launch_deal_id`)
  - table name regressions (`deals_tw`)
  - high-value workflow transitions (Closed Won -> Project -> Schedule/Talent).

### Pass 4 review of prior notes
- Mission-critical items remain unchanged and confirmed.
- Most remaining issues are consistency, maintainability, and regression risk.

---

## Pass 5 - Consolidated Priorities and Action Plan

## Mission Critical (Do First)

1. **Fix password reset redirect domain**
   - File: `js/auth.js`
   - Replace legacy `constellation-crm.com` reset target with Tenworks production URL.

2. **Fix projects -> contacts deep-link parameter**
   - File: `js/projects.js`
   - Change `contacts.html?id=` to `contacts.html?contactId=`.

3. **Fix admin analytics deals source**
   - File: `js/admin.js`
   - Replace `'deals'` with `'deals_tw'` in analytics tables fetched.

4. **Retire or quarantine legacy `js/script.js`**
   - Remove from repo or clearly mark as archived/non-runtime.

---

## Necessary Enhancements (Next Wave)

1. **Unify interaction feedback**
   - Replace most `alert()`/`confirm()` calls with shared modal/toast patterns.

2. **Extract shared project-launch service**
   - Deduplicate project creation pipeline in `js/projects.js` + `js/schedule.js`.

3. **Normalize cross-page route contracts**
   - Introduce a small route helper map for query keys.
   - Add runtime guards when required params are missing.

4. **Strengthen staffing-hour consistency**
   - Standardize on `task_assignments.hours` where schema supports it.

---

## Nice-to-Dos

1. **Add smoke tests for core journey**
   - Login -> create deal -> closed won -> launch project -> assign talent -> open status link.

2. **Tokenize styling in utility/portal pages**
   - Reduce inline styles and align to Tenworks style tokens.

3. **Introduce centralized error boundary helpers**
   - Wrap repetitive Supabase operation patterns with common failure UI.

4. **Document RLS assumptions explicitly**
   - Especially for manager-mode “all-user” data fetch behavior.

---

## Workflow Health: Pre-Sale -> Post-Sale

- **Pre-sale (CRM):** Solid baseline with Accounts/Contacts/Deals/Proposals and campaign sequencing.
- **Sales-to-ops handoff:** Present and usable via Closed Won + Launch Project pathways.
- **Post-sale (ERP):** Functional structure is strong; scheduling/talent/inventory interactions are meaningful and connected.
- **Primary risks now:** Contract mismatches, residual legacy paths, and consistency debt rather than core capability gaps.

---

## Recommended Immediate Sprint (3-5 days)

1. Patch the 4 mission-critical items.
2. Replace the highest-frequency `alert()`/`confirm()` flows in:
   - `js/command-center.js`
   - `js/campaigns.js`
   - `js/admin.js`
3. Add one workflow smoke test for:
   - Deal -> Project launch
   - Project -> Contact deep-link
   - Password reset end-to-end.

---

## Final Section: Constellation CRM Cross-Review (CRM-Only)

Context for this pass:
- Compared Tenworks CRM surfaces against `/Users/ba/Constellation-V` (CRM-only; no ERP scope).
- Evaluated with the 5-pass lens from this document.
- Honored intentional product differences: Constellation is ISP/sales-tooling heavy; Tenworks is manufacturing-first CRM + ERP.
- Proposals are intentionally treated as mostly stable in Tenworks.

### What Constellation does better (worth porting)

1. **More complete impersonation refresh coverage across CRM pages**
   - Constellation listens for `effectiveUserChanged` in additional pages (`command-center`, `cognito`, `social_hub`, etc.).
   - Tenworks already has this in `accounts`, `contacts`, `campaigns`, `sequences`, but not consistently across all CRM pages.
   - Recommendation: add standardized `effectiveUserChanged` refresh handlers for remaining CRM modules.

2. **Cleaner manager pipeline controls on Deals**
   - Constellation Deals supports manager filtering by individual user (`managerSelectedUserId`) and `show_in_pipeline` behavior.
   - Recommendation: bring this team-pipeline UX into Tenworks Deals where it helps leadership views.

3. **Action confirmation pattern for external side-effects**
   - Constellation uses `showActionSuccessConfirm(...)` for “did it work?” confirmation loops after side-effect actions.
   - Recommendation: add this pattern to Tenworks for non-atomic external actions (email client handoff, third-party opens, etc.).

4. **More consistent toast-first UX in key flows**
   - Constellation uses `showToast(...)` broadly in deals/accounts/contacts.
   - Recommendation: continue replacing high-frequency `alert()`/`confirm()` in Tenworks CRM with shared modal + toast patterns.

### Keep different on purpose (do not port blindly)

1. **ISP enrichments and connectors**
   - Constellation has Salesforce/ZoomInfo-oriented flows (`logToSalesforce`, ZoomInfo locators, SF activity logging).
   - These are domain-specific and should remain optional/non-default for Tenworks manufacturing workflows.

2. **Product/deal taxonomy and language**
   - Constellation deal model is ISP-centric (`Internet`, `Dark Fiber`, `PRI/SIP`, etc.).
   - Tenworks should keep fabrication-oriented elements/material framing.

3. **Constellation-only modules**
   - Marketing Hub, HUD overlays, IRR/User Guide style surfaces are not required for Tenworks core CRM.
   - Keep excluded unless there is a direct business case.

### Important cross-checks vs our current mission-critical fixes

1. **Password reset redirect**
   - Constellation still hardcodes a specific domain in `auth.js`.
   - Tenworks now uses dynamic origin/path redirect generation, which is safer across environments.
   - Decision: keep Tenworks implementation (do not regress to hardcoded URL).

2. **Deals table naming**
   - Constellation uses `deals`; Tenworks uses `deals_tw`.
   - Decision: keep `deals_tw` in Tenworks and maintain strict table-name discipline in admin/analytics queries.

3. **Contact deep-link query contract**
   - Tenworks now routes with `contactId`, matching contacts page parsing.
   - Decision: keep this contract consistent project-wide.

4. **Legacy script surface**
   - Constellation still carries a legacy-style `script.js`.
   - Tenworks removal of `js/script.js` should remain in place to reduce accidental drift.

### CRM-only priority actions from this cross-review

1. Add `effectiveUserChanged` listeners to remaining Tenworks CRM pages that still rely on static initial load.
2. Port manager user pipeline selector behavior into `deals` team view (adapted for Tenworks data model).
3. Introduce `showActionSuccessConfirm` utility in Tenworks `shared_constants` and apply to external side-effect actions.
4. Continue alert/confirm reduction in CRM pages (`command-center`, `campaigns`, `cognito`, `admin`) using modal + toast.
5. Keep Tenworks proposals untouched for now, aside from defect-only fixes.

---

## Exhaustive Implementation Checklist (5-Pass + Constellation Cross-Review)

Use this as the execution board.  
Legend:
- `[ ]` not started
- `[~]` in progress
- `[x]` complete

### 0) Program Controls & Guardrails

- [ ] Create a dedicated branch for remediation work.
- [ ] Freeze proposal feature work (defect-only allowed), per current direction.
- [ ] Keep CRM-vs-ERP scope explicit per task (avoid accidental ERP churn during CRM sprint).
- [ ] Define “intentional differences” doc note for ISP-specific Constellation features (Salesforce/ZoomInfo/product taxonomy).
- [ ] Add a short regression checklist to PR template for query-param contracts and table names.

---

### 1) Mission-Critical Fixes (Immediate)

#### 1.1 Password reset redirect safety
- [x] Replace hardcoded reset redirect domain with dynamic origin/path in `js/auth.js`.
- [ ] Confirm reset flow in all environments (local/dev/prod host).
- [ ] Verify Supabase reset email opens valid `reset-password.html` endpoint and session exchange succeeds.
- [ ] Add a test note in docs for environment-safe reset behavior.

#### 1.2 Projects -> Contacts deep-link contract
- [x] Fix project contact link to use `contactId` in `js/projects.js`.
- [x] Verify route parsing contract in `js/contacts.js` (`contactId`).
- [x] Search and normalize all contact/account deep links across app:
  - [x] `contacts.html?contactId=...`
  - [x] `accounts.html?accountId=...`
  - [x] `sequences.html?sequenceId=...`
- [x] Normalize proposal deep-link contract:
  - [x] `projects.js` now uses `proposals.html?proposal_id=...`
  - [x] `proposals.js` accepts `proposal_id` and backward-compatible `id`
- [ ] Add helper function/constants for route key names to prevent future drift (Sprint 2+).

#### 1.3 Admin analytics table consistency
- [x] Change analytics source from `deals` to `deals_tw` in `js/admin.js`.
- [ ] Verify all admin analytics widgets render non-empty deal metrics with live data.
- [x] Scan `admin.js` for any other `deals` references and enforce `deals_tw` usage.

#### 1.4 Legacy script surface cleanup
- [x] Remove unused legacy `js/script.js` file.
- [x] Verify no HTML references to removed file.
- [x] Add lightweight guard policy via `verify_contracts.sh` (route/table/reset checks).

---

### 2) CRM Functional Hardening (Pre-Sale -> Post-Sale CRM handoff)

#### 2.1 Data-contract and table-name discipline
- [ ] Standardize table names in all CRM pages:
  - [x] `deals_tw` only (no plain `deals` in Tenworks).
  - [ ] Confirm `contacts`, `accounts`, `tasks`, `activities`, `contact_sequences`, `sequence_steps` consistency.
- [ ] Add small table-name constants (optional, but strongly recommended) for high-risk entities.
- [x] Add one script/check to grep for forbidden legacy table names (`verify_contracts.sh`).

#### 2.2 Deal editing consistency (list/kanban/accounts)
- [ ] Audit current edit entry points in:
  - [ ] `js/deals.js`
  - [ ] `js/accounts.js`
- [ ] Decide canonical full-edit behavior:
  - [ ] “Single full edit modal” + inline quick edits, or
  - [ ] “Inline-first” with modal fallback.
- [ ] Align payload shape (`value` vs `mrc`, notes/products/elements semantics).
- [ ] Ensure no view leaves fields stale after edits from another surface.

#### 2.3 CRM handoff readiness
- [ ] Validate deal stage transitions used for downstream handoff.
- [ ] Confirm “Closed Won -> Launch Project” path remains stable after CRM changes.
- [ ] Preserve intentional separation: no ERP UI sprawl into non-command-center CRM pages.

---

### 3) ERP & Cross-Module Integrity (from 5-pass findings)

Even while CRM-focused, these are known backlog-critical from the 5-pass review:

#### 3.1 Shared launch-flow deduplication
- [x] Deduplicate project launch/create logic currently duplicated in:
  - [x] `js/projects.js`
  - [x] `js/schedule.js`
- [x] Extract to shared module/helper with uniform validations and error handling.
- [x] Ensure identical behavior for `launch_deal_id` flows.

#### 3.2 Staffing/hour-model alignment
- [x] Confirm canonical staffing math source:
  - [x] `task_assignments.hours` when present.
  - [x] fallback assumptions only when schema lacks explicit hours.
- [~] Align Command Center, Talent, and Schedule calculations.

#### 3.3 Inventory/model consistency
- [ ] Verify allocated/available metrics from BOM are consistent and correctly displayed.
- [~] Reduce inline style debt in inventory actions to tokenized classes.

---

### 4) Cross-Cutting UX Consistency

#### 4.1 Modal + toast standardization
- [x] Replace high-frequency `alert()`/`confirm()` with `showModal()` + `showToast()` in:
  - [x] `js/command-center.js`
  - [x] `js/campaigns.js`
  - [x] `js/cognito.js`
  - [x] `js/admin.js`
  - [x] `js/projects.js` (selected flows)
- [~] Ensure destructive actions use consistent confirm language and button order.
- [x] Ensure success/failure feedback is accessible and visually consistent across themes.

#### 4.2 External side-effect confirmation pattern
- [x] Implement `showActionSuccessConfirm(...)`-style helper in Tenworks `shared_constants.js`.
- [~] Apply to actions that leave app context (email client, external links, clipboard-dependent steps).

#### 4.3 Form and style normalization
- [~] Reduce inline styles in high-traffic CRM/ERP views (`projects`, `inventory`, `admin`, `talent`, `schedule`).
- [~] Ensure form controls use shared classes for spacing/typography.
- [x] Validate no design-rule drift (Tenworks no-radius constraints where applicable).

---

### 5) Constellation-Derived CRM Enhancements (Selective Porting)

#### 5.1 Effective user refresh completeness
- [ ] Add/verify `effectiveUserChanged` listeners for CRM modules missing reactive reloads.
- [ ] Confirm user-menu impersonation updates dependent lists/cards/charts on each page.

#### 5.2 Manager pipeline UX on Deals
- [ ] Add manager user selector in team view (if not already equivalent) using Tenworks data model.
- [ ] Respect visibility controls for which users appear in manager pipeline rollups.
- [ ] Validate quotas/metrics recalc correctly when filtering by team member.

#### 5.3 Keep intentional differences
- [ ] Do **not** port ISP-specific enrichments by default:
  - [ ] Salesforce logging hooks
  - [ ] ZoomInfo locator dependencies
  - [ ] ISP product-family assumptions
- [ ] Document any optional future integrations as feature flags, not baseline behavior.

---

### 6) Security, Reliability, and Data Integrity

#### 6.1 Auth/session reliability
- [ ] Verify auth gates on all private pages.
- [ ] Validate reset-password flow, login redirects, and sign-out behavior consistently.

#### 6.2 RLS assumptions
- [ ] Document manager-mode data assumptions and expected RLS behavior.
- [ ] Add one verification script/checklist for manager impersonation reads.

#### 6.3 Error handling strategy
- [ ] Normalize Supabase error handling pattern (user-friendly message + console detail).
- [ ] Avoid silent failures in async UI actions.

---

### 7) Testing Matrix (Must-Pass)

#### 7.1 Core workflow smoke tests
- [ ] Auth: signup/login/reset password complete loop.
- [ ] CRM: account -> contact -> deal create/edit -> stage progression.
- [ ] Handoff: deal -> launch project trigger path.
- [ ] Deep links:
  - [ ] `contactId`
  - [ ] `accountId`
  - [ ] `sequenceId`
  - [ ] `project_id`
  - [ ] `launch_deal_id`

#### 7.2 Manager/impersonation tests
- [ ] Switch “View As” and confirm each CRM page refreshes correctly.
- [ ] Verify team-vs-mine deals metrics and filters.

#### 7.3 UX consistency tests
- [ ] Confirm no high-priority flows still use browser-native alerts unless justified.
- [ ] Confirm toast + modal appearance works in all active themes.
- [ ] Validate no accidental card radius regressions where forbidden.

---

### 8) Documentation & Delivery

- [ ] Update this review document with completion statuses per section.
- [x] Add a short “Intentional Differences vs Constellation” appendix for future contributors.
- [x] Add “Known Non-Goals” (e.g., proposal architecture rewrite deferred).
- [ ] Ship in small PRs grouped by concern:
  - [ ] PR-A mission-critical patches
  - [ ] PR-B UX feedback standardization
  - [ ] PR-C deals consistency + manager pipeline UX
  - [ ] PR-D cross-module deduplication/testing hardening

---

### 9) Definition of Done (Program Level)

- [ ] All mission-critical items are deployed and verified in target environment.
- [ ] No unresolved table-name or query-param contract mismatches remain.
- [ ] Major CRM pages use consistent modal/toast feedback patterns.
- [ ] Constellation improvements ported selectively without importing ISP-specific assumptions.
- [ ] Proposals remain stable and untouched except for defect-level safeguards.
- [ ] Smoke tests pass for auth, CRM lifecycle, and handoff navigation.

---

## 10) Sprint Plan (Execution Roadmap)

Planning assumptions:
- Team: 1-2 engineers
- Sprint length: 1 week each
- Goal: deliver stable improvements without broad refactor risk

### Sprint 1 - Stabilize Production Risk (Highest Priority)

Target outcome:
- Remove immediate user-facing breakage/regression risk.

Scope:
- [~] Lock/verify all mission-critical fixes in environment.
- [x] Finish query-param contract normalization (`contactId`, `accountId`, `sequenceId`, etc.).
- [x] Complete table-name consistency checks (`deals_tw` discipline).
- [~] Add auth/reset-password validation pass (all environments).
- [~] Ship basic smoke test checklist execution + evidence capture.

Estimated effort:
- 3-5 engineering days

Dependencies:
- Access to deployed environment(s) and Supabase project
- Test account set (standard + manager)

Exit criteria:
- No broken deep links
- No broken reset-password loop
- Admin deal analytics populated correctly
- Zero legacy table-name mismatches in active CRM code

Sprint 1 execution notes (current):
- Completed code-level contract fixes:
  - `js/auth.js` dynamic reset redirect
  - `js/projects.js` contact and proposal deep-link contract updates
  - `js/proposals.js` URL load contract (`proposal_id` + backward-compatible `id`)
  - `js/admin.js` `deals_tw` analytics source
  - removed legacy `js/script.js`
- Added repository guard script: `verify_contracts.sh`
- Latest guard result:
  - Command: `bash verify_contracts.sh`
  - Result: PASS (no legacy `deals`, no legacy `?id` contact/account links, no hardcoded Constellation reset domain)
- Remaining Sprint 1 manual validations:
  - Environment-level password reset loop (email link end-to-end)
  - Admin analytics live-data UI verification
  - Browser smoke pass for deep-link opening behavior

---

### Sprint 2 - UX Consistency + CRM Reliability

Target outcome:
- Consistent user interaction patterns and fewer support issues.

Scope:
- [x] Replace high-frequency `alert()`/`confirm()` in priority CRM pages:
  - [x] `js/command-center.js`
  - [x] `js/campaigns.js`
  - [x] `js/cognito.js`
  - [x] `js/admin.js`
  - [x] `js/projects.js` (selected flows)
- [x] Introduce/port `showActionSuccessConfirm` utility where side effects leave app context.
- [ ] Expand `effectiveUserChanged` coverage on remaining CRM pages.
- [ ] Add manager pipeline selector/rollup UX refinements in Deals (Tenworks model only).

Estimated effort:
- 4-6 engineering days

Dependencies:
- Sprint 1 complete (for stable routing/data contracts)
- Design approval for modal/toast behavior consistency

Exit criteria:
- Priority CRM flows use shared modal + toast patterns
- Manager impersonation and team filters update views predictably
- Fewer silent failure pathways in async actions

Sprint 2 execution notes (current):
- Converted `alert()` / `confirm()` usage to shared `showModal()` + `showToast()` patterns in:
  - `js/command-center.js`
  - `js/cognito.js`
  - `js/admin.js`
  - `js/campaigns.js`
  - `js/projects.js` (selected high-traffic and destructive flows)
- Added shared helper `showActionSuccess(...)` in `js/shared_constants.js` and applied it across core success paths.
- Verified no remaining `alert(`/`confirm(` matches in the five target files.
- Lint check status for touched Sprint 2 files: clean.

---

### Sprint 3 - Structural Hardening + Maintainability

Target outcome:
- Reduce drift risk and improve long-term code maintainability.

Scope:
- [x] Deduplicate shared project-launch/create logic (`projects` + `schedule`).
- [x] Align staffing/hour calculations to canonical schema usage.
- [x] Reduce inline style debt in high-traffic modules.
- [x] Add lightweight guard checks/scripts:
  - [x] forbidden table-name checks
  - [x] query-param contract checks
- [x] Final documentation updates:
  - [x] intentional Constellation differences
  - [x] known non-goals
  - [x] runbook for smoke tests

Estimated effort:
- 5-7 engineering days

Dependencies:
- Sprint 2 interaction patterns locked
- Agreement on shared helper/module boundaries

Exit criteria:
- Duplicated logic reduced in critical workflows
- Cross-page calculations and contracts are deterministic
- Documentation reflects implemented reality

Sprint 3 execution notes (current):
- Extracted launch-project modal + creation flow to shared module: `js/project_launch_shared.js`.
- Rewired both launch entry points to shared helper:
  - `js/projects.js`
  - `js/schedule.js`
- Normalized staffing load calculations to rely on explicit `task_assignments.hours`:
  - `js/schedule.js` weekly load metric
  - `js/talent.js` capacity report aggregation
- Expanded `verify_contracts.sh` with additional drift checks:
  - legacy `proposals.html?id=` deep-link key
  - duplicated launch modal markup in `projects/schedule`
  - implicit `8h` fallback patterns in assignment-hour calculations
- Reduced inline style usage in high-traffic project flows by introducing reusable CSS classes and applying them to:
  - shared launch modal UI (`js/project_launch_shared.js`)
  - project task/BOM/team/change-order rendering + modal forms (`js/projects.js`)
  - centralized style tokens in `css/style.css` (`project-*` and `launch-project-*` classes)
- Continued style-tokenization pass in ERP scheduling/staffing views:
  - schedule modals/status badges/row links moved to reusable classes (`js/schedule.js`)
  - talent internal-task/skills/schedule modals moved to reusable classes (`js/talent.js`)
  - added shared class tokens in `css/style.css` (`schedule-*` and `talent-*` blocks)
- Inline-style reduction snapshot after latest pass (target modules):
  - `js/project_launch_shared.js`: `0`
  - `js/schedule.js`: `1`
  - `js/talent.js`: `5`
  - `js/projects.js`: `2`
- Remaining inline-style cases are intentionally dynamic render values (e.g., runtime color/width calculations) rather than static style debt.

Intentional Differences vs Constellation (finalized):
- Tenworks remains manufacturing-first and keeps ERP-centric workflows as the primary model; Constellation ISP-first assumptions are not baseline imports.
- ISP-specific enrichments remain out-of-scope by default (Salesforce logging hooks, ZoomInfo dependencies, ISP product-family assumptions).
- Proposal architecture remains Tenworks-native and is only adjusted for contract/integration defects, not parity refactors.
- CRM + ERP boundary is preserved: CRM improvements should not introduce ERP-only UI coupling outside intentional handoff points.

Known Non-Goals (Sprint 3 close):
- No proposal-system rewrite.
- No Salesforce/ZoomInfo integration rollout.
- No broad CRM domain model rewrite (deals/accounts/contact ownership semantics remain current contracts).
- No full redesign sweep across all remaining inline styles when values are runtime/dynamic and tokenized via classes where practical.

---

### Critical Path & Ordering Notes

- [ ] Do **not** start broad UX refactors until Sprint 1 routing/data contracts are stable.
- [ ] Keep proposals out of scope unless defect blocks release.
- [ ] Gate each sprint with smoke tests before moving forward.
- [ ] Ship each sprint in multiple small PRs (by concern) rather than one large merge.

### Suggested PR Breakdown by Sprint

- **Sprint 1**
  - [ ] PR-1: Contract fixes (query params + table names)
  - [ ] PR-2: Auth/reset verification adjustments
  - [ ] PR-3: Smoke-test evidence + docs updates

- **Sprint 2**
  - [ ] PR-4: Modal/toast standardization (batch 1 pages)
  - [ ] PR-5: `effectiveUserChanged` expansion
  - [ ] PR-6: Deals manager pipeline UX improvements

- **Sprint 3**
  - [ ] PR-7: Shared launch-flow extraction
  - [ ] PR-8: Staffing/hour model alignment
  - [ ] PR-9: Inline-style reduction + guard scripts + final docs

---

## 11) Sprint 1 Smoke-Test Runbook (Manual)

Use this runbook to close Sprint 1 manual checks and mark Sprint 1 complete.

### A. Auth + Reset Flow (Environment Safety)

- [ ] From `index.html`, trigger **Forgot Password** with a valid user email.
- [ ] Confirm reset email link lands on the current environment `reset-password.html` (not legacy domain).
- [ ] Set new password and verify success redirect back to login.
- [ ] Log in with new password and confirm command center load.

Pass condition:
- Reset link domain/path matches current environment and password reset completes successfully.

---

### B. Deep-Link Contracts

- [ ] Open `accounts.html?accountId=<validId>` and confirm account drawer opens to that account.
- [ ] Open `contacts.html?contactId=<validId>` and confirm contact drawer opens to that contact.
- [ ] Open `sequences.html?sequenceId=<validId>` and confirm sequence details panel is selected.
- [ ] From Projects team card, click a contact and confirm `contactId` routing opens the correct contact.
- [ ] From Projects linked proposal action, confirm `proposal_id` URL loads that saved proposal.

Pass condition:
- All deep links open intended records without fallback or blank states.

---

### C. Admin Analytics Data Contract

- [ ] Open `admin.html` analytics view.
- [ ] Confirm deal-related analytics widgets/charts populate with live data (no silent empty due to table mismatch).
- [ ] Check browser console for query errors tied to `deals` vs `deals_tw`.

Pass condition:
- Deal metrics render without table-contract errors.

---

### D. Guard Script Verification

- [x] Run: `bash verify_contracts.sh`
- [x] Confirm all checks pass:
  - no `from('deals')` usage in active Tenworks JS
  - no `contacts.html?id=...` / `accounts.html?id=...`
  - no hardcoded Constellation reset domain in Tenworks auth flow

Pass condition:
- Script returns success exit code and all checks are PASS.

---

### E. Evidence Log Template

Record this when running Sprint 1 closure:

- Date:
- Environment URL:
- Tester:
- Auth/reset result:
- Deep-link result:
- Admin analytics result:
- Guard script output:
- Notes/defects found:

### Sprint 1 Completion Gate

Mark Sprint 1 done only when:
- [ ] Sections A-D all pass
- [ ] Any discovered defects are patched or explicitly deferred with owner/date
- [ ] Review doc checkboxes updated to final state
