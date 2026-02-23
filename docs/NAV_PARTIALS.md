# Shared nav partials (CRM | Production pill)

Two nav bars are loaded from **partials** so one change updates all pages.

- **CRM pages** use `partials/nav-crm.html` (Command Center, Proposals, Deals, Contacts, Accounts, Campaigns, Sequences, Social Hub + Cognito + user menu).
- **ERP / Production pages** use `partials/nav-erp.html` (Schedule, Talent, Projects, Inventory + user menu). CRM pill links to Command Center.

A **pill toggle** under the global search lets users switch context: **CRM** → Command Center (command-center.html), **Production** → schedule. ERP nav has no Command Center link; ops use the pill to reach CRM.

## Pages using shared nav (body `data-nav`, `#nav-container`, `nav-loader.js`, `runWhenNavReady`)

| Page | data-nav | Done |
|------|----------|------|
| command-center.html | crm | ✓ |
| deals.html | crm | ✓ |
| schedule.html | erp | ✓ |
| talent.html | erp | ✓ |
| projects.html | erp | ✓ |
| proposals.html | erp | ✓ |
| contacts.html | crm | ✓ |
| accounts.html | crm | ✓ |
| campaigns.html | crm | ✓ |
| sequences.html | crm | ✓ |
| social_hub.html | crm | ✓ |
| cognito.html | crm | ✓ |
| ai-admin.html | crm | ✓ |
| inventory.html | erp | ✓ |

## Adding a new page

1. **HTML:** `<body data-nav="crm">` or `data-nav="erp">`, and `<nav class="nav-sidebar" id="nav-container"></nav>` (no inner HTML).
2. **Script:** `<script src="js/nav-loader.js"></script>` before the page’s module script.
3. **JS:** Import `runWhenNavReady` from `shared_constants.js` and run any init that touches nav (loadSVGs, setupUserMenuAndAuth, setupGlobalSearch) inside `runWhenNavReady(() => { ... })`.

## Changing the nav

Edit **partials/nav-crm.html** or **partials/nav-erp.html** only. All pages using that partial will pick up the change.
