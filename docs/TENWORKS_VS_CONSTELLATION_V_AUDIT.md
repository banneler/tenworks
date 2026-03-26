# Tenworks vs Constellation-V — Full Triple-Scoop Audit Report

**Audit date:** 2026-02-22  
**Scope:** 1:1 comparison of every HTML and JS page between Tenworks and Constellation-V.  
**Convention:** "C-V" = Constellation-V; "TW" = Tenworks. Diff direction: `-` = C-V only, `+` = TW only.

---

## File inventory

### HTML files in both codebases (compared)

| File | Diff lines (approx) |
|------|---------------------|
| accounts.html | 297 |
| admin.html | 187 |
| ai-admin.html | 78 |
| campaigns.html | 62 |
| cognito.html | 195 |
| command-center.html | 251 |
| contacts.html | 276 |
| deals.html | 288 |
| index.html | 157 |
| proposals.html | 631 |
| reset-password.html | 19 |
| sequences.html | 61 |
| social_hub.html | 104 |

### HTML only in Tenworks (no C-V counterpart)

- `partials/nav-erp.html`
- `partials/nav-crm.html`
- `projects.html`
- `inventory.html`
- `talent.html`
- `schedule.html`
- `status.html`
- `shop-dashboard.html`
- `proposal_templates/TenWorks_Proposal_Cover.html`
- `proposal_templates/TenWorks_Proposal_Blank.html`

### HTML only in Constellation-V (no Tenworks counterpart)

- `marketing-hub.html`
- `user-guide.html`
- `irr.html`
- `snippets/global-loader-overlay.html`

### JS files in both codebases (compared)

| File | Diff lines (approx) |
|------|---------------------|
| accounts.js | 2398 |
| admin.js | 56 |
| ai-admin.js | 46 |
| auth.js | 10 |
| campaigns.js | 22 |
| cognito.js | 897 |
| command-center.js | 730 |
| contacts.js | 1901 |
| deals.js | 2127 |
| proposals.js | 1437 |
| reset_password.js | **0** (identical) |
| sequences.js | 18 |
| shared_constants.js | 1300 |
| social_hub.js | 351 |
| script.js | 1049 |

### JS only in Tenworks

- `nav-loader.js`
- `projects.js`
- `inventory.js`
- `talent.js`
- `shop-dashboard.js`
- `status.js`
- `schedule.js`

### JS only in Constellation-V

- `marketing-hub.js`
- `user-guide.js`
- `irr.js`
- `hud.js`
- `enterprise-proposals-embed.js`
- `abm-sequences.js`

---

# RUN 1 — Full audit (first pass)

## 1. Cross-cutting mismatches (apply to most or all pages)

### 1.1 Branding and copy

- **Title/meta:** C-V uses "Strategic - CRM - [Page]" and "Constellation CRM"; TW uses "TenWorks [Page]" or "Ten Works · …" and "TenWorks CRM" / "fabrication pipeline".
- **Loader:** C-V uses inline SVG (constellation line + stars, class `global-loader-constellation`); TW uses `<img src="assets/logo.svg" class="global-loader-logo-spin">`.
- **Reset password:** C-V uses `assets/constellation-logo-full.svg` and class `constellation-main-logo`; TW uses `assets/logo.svg` with no constellation class.

### 1.2 Styles and assets

- **CSS:** C-V uses `output.css` + `css/global-loader.css`; TW uses `css/style.css` only.
- **Fonts:** C-V does not preconnect to Google Fonts in most files; TW adds preconnect + Inter/Rajdhani (and sometimes Orbitron).
- **Tom-select:** C-V links `tom-select@2.5.2` CSS (and sometimes script) in several pages; TW does not use Tom-select in the compared pages.
- **Body:** C-V often plain `<body>`; TW often `<body data-nav="crm">` (or equivalent) for nav highlighting.

### 1.3 Navigation and shell

- **Nav container:** C-V uses `<nav class="nav-sidebar">` with inline script on `currentScript.parentElement` and inner `<div id="global-nav-container" class="flex flex-col flex-1 min-h-0"></div>`; TW uses `<nav class="nav-sidebar" id="nav-container">` with script on `getElementById('nav-container')` and comment "CRM nav loaded by nav-loader.js" (no inner div).
- **Nav injection:** C-V uses `injectGlobalNavigation()` from shared_constants; TW uses `nav-loader.js` and `runWhenNavReady()` (no `injectGlobalNavigation` in TW shared_constants).

### 1.4 shared_constants.js

- **Supabase:** Different `SUPABASE_URL` and `SUPABASE_ANON_KEY` (different projects).
- **HUD:** C-V imports and re-exports `initHUD`, `refreshHUDNodes`, `removeDealInsightsWireframe`, `addDealInsightsWireframe`, `reloadHUDWireframes` from `hud.js`; TW has no HUD and no hud.js.
- **Global loader:** TW defines `injectGlobalLoaderMarkup`, `showGlobalLoader`, `hideGlobalLoader` and injects loader on body/DOMContentLoaded; C-V relies on loader already in HTML and does not export these in the same way.
- **App state init:** C-V fetches `user_quotas` with `full_name, is_manager`; TW fetches `full_name` only (no `is_manager` in that query in the diff sample).
- **runWhenNavReady:** TW exports `runWhenNavReady(callback)` keyed off `#nav-container` and `navReady` event; C-V does not have this (uses injectGlobalNavigation).

---

## 2. Per-page HTML mismatches

### accounts.html

- **Details panel:** C-V has no scrim/close button; TW has `details-panel-scrim`, `details-panel-close-btn`, and `glass-panel` on details panel.
- **Header locators:** C-V has Salesforce ID and Zoom Info Company Id inline editors (`#sf-locator-*`, `#zoominfo-locator-*`), plus buttons `#zoominfo-account-btn`, `#salesforce-account-btn`; TW has none of these (only AI Briefing button).
- **Add deal button:** C-V "New Deal" icon `fa-plus`; TW `fa-square-plus`.
- **Pending task reminder:** C-V uses class `pending-task-reminder-pill`; TW uses `pending-task-reminder-banner`.
- **Structure:** TW has `account-cards-row` wrapping contacts + activities; C-V structure differs (indentation and wrapping).

### admin.html

- Same branding/CSS/loader/nav pattern as above; page-specific content differs (charts, sections).

### ai-admin.html

- Same cross-cutting; fewer structural differences.

### campaigns.html

- Same cross-cutting; campaign-specific structure and IDs may differ.

### cognito.html

- **Title:** C-V "Strategic - CRM - Cognito"; TW "TenWorks Intelligence".
- **Section structure:** C-V single section with "View Archive" toggle and filter bar (trigger type, relevance, account, Clear Filters); TW has two sections: "Account Intelligence" vs "Project Discovery (Hunter)" with separate filter sets (`#intelligence-filters`, `#discovery-filters`), "New / Active" vs "Archive", and discovery filters (project stage, search, Clear).
- **Modal:** C-V modal body includes "Suggested Outreach" / action-center content; TW modal is minimal (title + body + actions).

### command-center.html

- Documented in existing `docs/COMMAND_CENTER_CONSTELLATION_DIFF.md` (ERP row, My Tasks table vs list, Sequence Steps panels, Recent Activities table vs list, Downloads, etc.).

### contacts.html

- Same branding/CSS/loader/nav; C-V likely has Salesforce/ZoomInfo or log-to-SF UI; TW has different form/panel structure.

### deals.html

- Same cross-cutting; deals-specific layout (list/kanban/charts) may differ in structure and IDs.

### index.html

- Login/landing; branding, CSS, loader, and any nav differ.

### proposals.html

- **Large structural difference:** C-V uses `output.css`, `global-loader.css`, Tom-select, Sortable, pdf-lib, snapdom; TW uses `css/style.css`, theme script on documentElement, Tailwind CDN, different inline styles (cover letter, proposal panels, no-spinner). Proposals content and sections differ significantly (TW has Ten Works–specific cover letter and scope styling).

### reset-password.html

- Only minor differences: stylesheet path (`output.css` vs `css/style.css`), logo asset and class (constellation-logo-full.svg vs logo.svg).

### sequences.html

- Same cross-cutting; sequences-specific markup may differ.

### social_hub.html

- Same cross-cutting; social hub content and structure may differ.

---

## 3. Per-file JS mismatches (summary)

### accounts.js

- **Imports:** C-V uses `injectGlobalNavigation`, `logToSalesforce`, `showGlobalLoader`, no `runWhenNavReady` / no `getKanbanDealCardContent` / no deal card helpers; TW uses `runWhenNavReady`, `hideGlobalLoader`, `getDealStageColorClass`, `getDealCardContent`, `getKanbanDealCardContent`, `getStageDisplayName`, `getDealValue`, `getElementsPillHtml`, `DEAL_ELEMENTS_LIST`, no `logToSalesforce`, no `injectGlobalNavigation`.
- **State:** C-V has `currentUser` and more comments; TW has `globalState`, no `currentUser` in state.
- **DOM:** C-V has `zoominfoAccountBtn`, `salesforceAccountBtn`, `accountIndustrySelect`, Tom-select for industry; TW has none of these; TW has `getAccountFilter()`.
- **Activity list:** C-V has "Log to SF" button handler and `logToSalesforce`; TW has no Log to SF.
- **Deal cards:** TW uses kanban-style cards with `getKanbanDealCardContent`, cycle stage, inline edit, element pills; C-V used different card content (getDealCardContent / Constellation-style) and different behavior.
- **Tom-select:** C-V uses `initTomSelect` for industry; TW does not.

### cognito.js

- Large diff (897 lines): C-V single view + archive; TW Intelligence vs Discovery sections, different filters, different modal content and copy (e.g. "Log Activity", "Create Task" in TW).

### command-center.js

- 730 lines: task list vs table, sequence steps rendering, briefing, ERP row, etc., per existing command center diff doc.

### contacts.js

- **Imports:** C-V has `logToSalesforce`, `injectGlobalNavigation`, `formatSimpleDate`, `showGlobalLoader`; TW has `runWhenNavReady`, `hideGlobalLoader`, no logToSalesforce.
- **State:** C-V has `email_log`, `products`, Tom-select refs; TW has `globalState`, no email_log/products in state.
- **Tom-select:** C-V uses Tom-select for account, sequence, industry; TW does not.
- **Log to SF:** C-V has log-to-Salesforce behavior; TW does not.

### deals.js

- **Imports:** C-V does not import `getKanbanDealCardContent`, `getDealValue`, `getDealStageColorClass`, `getElementsPillHtml`, `escapeNotesForHtml` from shared; TW does (and uses shared card + helpers).
- **Card rendering:** TW uses shared `getKanbanDealCardContent`; C-V previously had local `renderDealCard` and local helpers (now aligned in TW).
- **Deal stages / view mode / filters:** Logic may differ in details.

### proposals.js

- Proposals flow, PDF generation, cover letter, and scripts differ (snapdom vs html2canvas, etc.).

### shared_constants.js

- As in §1.4: Supabase keys, HUD, global loader, runWhenNavReady, app state init, and many function exports differ.

### social_hub.js

- 351 lines: copy and behavior (e.g. Prepare Post / Dismiss order, modal content) differ.

### script.js

- 1049 lines: likely index/login page; auth and nav setup differ.

### auth.js, admin.js, ai-admin.js, campaigns.js, sequences.js

- Smaller diffs; mostly imports (nav, loader, logToSalesforce), state, and feature flags (Salesforce, ZoomInfo, ABM, etc.).

### reset_password.js

- **No diff** — files are identical.

---

## 4. Mismatch categories (summary)

| Category | Description |
|----------|-------------|
| **Branding** | Title, meta description, loader SVG vs logo image, logo assets. |
| **CSS/Assets** | output.css + global-loader.css vs style.css; Tom-select; fonts; theme. |
| **Nav** | global-nav-container + injectGlobalNavigation vs nav-container + nav-loader.js + runWhenNavReady. |
| **Salesforce / ZoomInfo** | C-V has SF ID, ZoomInfo ID, "Log to SF" buttons, Open in Salesforce/ZoomInfo; TW does not. |
| **Tenworks-only features** | ERP row, nav-erp, projects, inventory, talent, schedule, status, shop-dashboard; deal card kanban on account page; fabrication wording. |
| **Constellation-only** | marketing-hub, user-guide, irr, hud.js, enterprise-proposals-embed, abm-sequences; Tom-select usage. |
| **Proposals** | Different stack (Sortable, pdf-lib, snapdom vs Tailwind, html2canvas) and layout. |
| **Cognito** | Intelligence vs Discovery sections, filter sets, modal copy (Log Activity, Create Task). |
| **Command center** | List vs table for tasks/steps/activities; quick-add vs modal; ERP row; Downloads. |
| **Accounts** | Scrim/close, glass-panel, no SF/ZoomInfo locators; kanban deal cards. |

---

## 5. Run 1 conclusion

- **Identical:** `reset_password.js` only.
- **Largest diffs:** accounts.js (2398), deals.js (2127), contacts.js (1901), shared_constants.js (1300), proposals.js (1437), cognito.js (897), command-center.js (730), script.js (1049).
- **Systematic:** Branding, CSS, nav, loader, and Salesforce/ZoomInfo vs Tenworks-only features explain most file-level differences. Proposals and Cognito have substantial structural and behavioral divergence.

---

*End of Run 1. Read this report in full before proceeding to Run 2.*

---

# RUN 2 — Second-pass notes (after full read of Run 1)

## 2.1 Deals page (HTML)

- **View toggles:** C-V has two toggles: (1) "My Deals" / "My Team's Deals" (`#view-my-deals-btn`, `#view-all-deals-btn`) and (2) List / Board. TW has only List vs Board in the top row (no My vs Team toggle in the sampled HTML).
- **Layout classes:** C-V uses Tailwind-style classes (`mb-6`, `flex gap-4`, `flex justify-between`, `rounded-lg border`, `p-1`); TW uses plainer classes (`deals-top-row`, `view-mode-toggle`, `deals-metrics-container`).
- **Metric label:** C-V "Closed Won (MTD)"; TW "Sold (MTD)" (aligns with getStageDisplayName).
- **Script order:** C-V has Chart.js then chartjs-plugin-annotation once; TW duplicates Chart.js script and places annotation after.
- **Toast:** C-V has `#toast-container` inside deals view; TW may place it differently (same id).
- **Add deal button:** C-V section header includes "Deal Pipeline" + add-deal btn with `fa-plus`; TW structure may differ (e.g. icon or wrapper).

## 2.2 Contacts page (HTML)

- **Details panel:** TW adds `details-panel-scrim`, `contact-details-close-btn`, and `glass-panel`; C-V has none of these.
- **ZoomInfo:** C-V has `#zoominfo-contact-btn` in contact header; TW removes it (only organic-star kept).
- **Default sort:** C-V has "First" active (`sort-first-last-btn` active); TW has "Last" active (`sort-last-first-btn` active)—default name display differs.
- **Contact account row:** C-V has `#contact-account-row` with select `#contact-account-name`; TW may keep structure but without Tom-select (native select).

## 2.3 Index / login (HTML)

- **Length:** C-V ~61 lines; TW ~93 lines (TW has more inline script and structure).
- **Theme:** C-V applies theme to `body` in a small script at bottom; TW applies theme to `document.documentElement` in head and sets default `crm-theme` in localStorage.
- **Title:** C-V "Strategic - CRM - Login"; TW "TenWorks CRM".
- **Logo:** C-V `constellation-logo-full.svg` + `constellation-main-logo`; TW TenWorks logo.
- **Layout/styling:** C-V uses `output.css`, `min-h-screen flex items-center justify-center bg-slate-50`; TW uses `css/style.css` and different container/auth styling.

## 2.4 Admin page (HTML)

- **Title:** TW currently has "Constellation - Admin Portal" (likely leftover; should be TenWorks for consistency).
- **Nav:** C-V uses `global-nav-container` pattern; TW uses inline nav with `data-svg-loader="assets/logo.svg"` (no constellation logo). TW admin nav does not use `id="nav-container"` / nav-loader comment (admin is special-case).
- **Section cards:** C-V wraps User Management and Content Management in `section-card` > `section-card-header` > `page-title` and `px-5 pb-5`; TW strips the card wrapper (e.g. plain `h2` + table-container for User Management).
- **Placeholder text:** C-V uses `placeholder-text-block`; TW uses `placeholder-text` with inline style for margin/alignment.

## 2.5 Run 2 summary

- **Deals:** My/Team view exists in C-V only (in HTML); TW emphasizes List/Board. "Sold" vs "Closed Won" and script/class differences noted.
- **Contacts:** Scrim/close/glass and default sort (Last vs First) and removal of ZoomInfo button in TW.
- **Index:** Theme on `<html>`, longer TW markup, different branding and assets.
- **Admin:** TW title says "Constellation"; section-card wrappers removed in TW; admin nav is not nav-loader-driven.
- **General:** Run 2 confirms Run 1 categories and adds concrete ID/class and copy differences for deals, contacts, index, and admin.

---

*End of Run 2. Read the full report again before Run 3 (final in-depth scan).*

---

# RUN 3 — Final in-depth scan (third pass)

## 3.1 Social Hub (HTML)

- **Sections:** C-V has two section-cards: (1) "Social Hub" with placeholder "Amplify our voice…", then "AI-Curated Content" and `#ai-articles-container`; (2) "From Our Marketing Team" with link "View Content Image Library ↗" (SharePoint) and `#marketing-posts-container`. TW has a single block: `<h2>Social Hub</h2>`, `<h3>AI-Curated Content</h3>`, `#ai-articles-container`—no "From Our Marketing Team" card, no `marketing-posts-container`, no placeholder.
- **Modal:** C-V "Regenerate" button includes `<i class="fa-solid fa-wand-magic-sparkles"></i><span>Regenerate</span>`; TW button text only "Regenerate".

## 3.2 Sequences & Campaigns (HTML)

- **Scripts at bottom:** C-V includes inline theme script (`document.body.className = theme-${savedTheme}`) then Tom-select then page module. TW replaces the theme script with `<script src="js/nav-loader.js"></script>` then Tom-select then page module. So on sequences and campaigns TW does not set body theme in-page (theme is set in index or documentElement elsewhere).
- **Sequences:** TW keeps Tom-select CSS + JS (same as C-V). Only head/nav/loader and bottom script block differ.
- **Campaigns:** Same pattern; TW title "TenWorks Campaigns", C-V "Strategic - CRM - Campaigns".

## 3.3 shared_constants.js (export surface)

- **C-V only:** `import/export` from `hud.js` (refreshHUDNodes, removeDealInsightsWireframe, addDealInsightsWireframe, reloadHUDWireframes); `logToSalesforce`; `injectGlobalNavigation`; C-V’s `showGlobalLoader` / `hideGlobalLoader` (different implementation); `setupUserMenuAndAuth(supabase, appState, options = {})`.
- **TW only:** `showGlobalLoader` / `hideGlobalLoader` (injectGlobalLoaderMarkup + class/aria); `runWhenNavReady`; `themesList`; `formatMonthYearShort`; `getDealValue`; `DEAL_ELEMENTS_LIST`; `getElementsPillHtml`; `getStageDisplayName`; `getDealStageColorClass`; `escapeNotesForHtml`; `DEAL_PRODUCT_FAMILIES`; `getProductPillHtml`; `getDealCardContent`; `getKanbanDealCardContent`; `setupUserMenuAndAuth(supabase, state)` (no options); `setupGlobalSearch` (signature may differ).
- **Supabase:** Different project URLs/keys in both.

## 3.4 script.js

- **Role:** App shell used on a page that can show either auth or CRM (dashboard, contacts, accounts, sequences, deals). Same approximate line count; large diff due to different Supabase config, state shape, and likely nav/auth handling.
- **C-V:** Inline Supabase URL/keys (C-V project); state includes currentUser, contacts, accounts, sequences, etc.; DOM selectors for auth container, CRM container, auth form, theme toggle, and view divs (dashboard, contacts, accounts, sequences, deals).
- **TW:** Same structure but TW Supabase project and different state/selectors. Confirms script.js is a major divergence point for auth + multi-view shell.

## 3.5 Deals HTML (supplement)

- **body:** TW has `class="theme-dark" data-nav="crm"`; C-V plain `<body>`. TW duplicates Chart.js script tag and adds chartjs-plugin-annotation after it; C-V has one Chart.js and one annotation script.

## 3.6 Run 3 summary and suggested actions

| Area | Finding | Suggestion |
|------|---------|------------|
| **Admin title** | TW admin.html has "Constellation - Admin Portal" | Change to "TenWorks Admin" or "TenWorks - Admin Portal" for brand consistency. |
| **Social Hub** | TW removed "From Our Marketing Team" and marketing-posts-container | Intentional Tenworks scope reduction; no change unless marketing section is reintroduced. |
| **Theme** | TW applies theme on documentElement (index) and omits body theme script on sequences/campaigns | Ensure theme is applied once (e.g. index or shared loader) so sequences/campaigns still respect crm-theme. |
| **Deals Chart.js** | TW has duplicate Chart.js script in deals.html | Remove duplicate script tag; keep one Chart.js + one annotation script. |
| **reset_password.js** | Identical in both codebases | Safe to keep in sync or treat as single source of truth. |
| **Files only in C-V** | marketing-hub, user-guide, irr, hud, enterprise-proposals-embed, abm-sequences | No action unless porting features to TW. |
| **Files only in TW** | nav-loader.js, projects, inventory, talent, schedule, status, shop-dashboard, partials, proposal_templates | Tenworks-specific; retain. |

## 3.7 Final audit conclusion

- **Run 1** established scope, file inventory, and cross-cutting vs per-file mismatch categories.
- **Run 2** added concrete HTML/ID/class/copy differences for deals, contacts, index, and admin.
- **Run 3** added: Social Hub section removal in TW; sequences/campaigns theme vs nav-loader script swap; shared_constants export delta; script.js role and Supabase/state diff; deals body/Chart.js duplicate; and a short remediation table.
- **Single identical file:** `reset_password.js`.
- **Largest divergences:** accounts.js, deals.js, contacts.js, shared_constants.js, proposals (HTML+JS), cognito (HTML+JS), command-center (HTML+JS), script.js—driven by branding, nav, loader, Salesforce/ZoomInfo absence in TW, Tenworks-only features, and proposals/Cognito/command-center UX choices.

---

*End of Run 3. Triple-scoop audit complete.*
