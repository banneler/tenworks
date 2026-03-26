import { SUPABASE_URL, SUPABASE_ANON_KEY, formatDate, formatMonthYear, formatMonthYearShort, parseCsvRow, themes, setupModalListeners, showModal, hideModal, updateActiveNavLink, setupUserMenuAndAuth, loadSVGs, setupGlobalSearch, checkAndSetNotifications, initializeAppState, getState, formatCurrency, runWhenNavReady, getDealStageColorClass, getDealCardContent, getKanbanDealCardContent, getStageDisplayName, getDealValue, getElementsPillHtml, DEAL_ELEMENTS_LIST, showToast, hideGlobalLoader } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        isFormDirty: false,
        accounts: [],
        contacts: [],
        activities: [],
        deals: [],
        dealStages: [],
        selectedAccountId: null,
        selectedAccountDetails: {
            account: null,
            contacts: [],
            activities: [],
            deals: [],
            tasks: [],
            contact_sequences: []
        },
        contactViewMode: 'list' 
    };
    let globalState = {};
    
    let draggedContactId = null;

    // --- DOM Element Selectors ---
    const navSidebar = document.querySelector(".nav-sidebar");
    const accountList = document.getElementById("account-list");
    const accountSearch = document.getElementById("account-search");
    const addAccountBtn = document.getElementById("add-account-btn");
    const bulkImportAccountsBtn = document.getElementById("bulk-import-accounts-btn");
    const bulkExportAccountsBtn = document.getElementById("bulk-export-accounts-btn");
    const accountCsvInput = document.getElementById("account-csv-input");
    const accountForm = document.getElementById("account-form");
    const deleteAccountBtn = document.getElementById("delete-account-btn");
    const addDealBtn = document.getElementById("add-deal-btn");
    const addTaskAccountBtn = document.getElementById("add-task-account-btn");
    
    const contactListView = document.getElementById("contact-list-view");
    const contactOrgChartView = document.getElementById("contact-org-chart-view");
    const accountContactsList = document.getElementById("account-contacts-list");
    const contactListBtn = document.getElementById("contact-list-btn");
    const contactOrgChartBtn = document.getElementById("contact-org-chart-btn");
    const orgChartMaximizeBtn = document.getElementById("org-chart-maximize-btn");
    const orgChartModalBackdrop = document.getElementById("org-chart-modal-backdrop");
    const orgChartModalContent = document.getElementById("org-chart-modal-content");
    const orgChartModalCloseBtn = document.getElementById("org-chart-modal-close-btn");

    const accountActivitiesList = document.getElementById("account-activities-list");
    const accountDealsCards = document.getElementById("account-deals-cards");
    const accountPendingTaskReminder = document.getElementById("account-pending-task-reminder");
    const aiBriefingBtn = document.getElementById("ai-briefing-btn");
    const accountFilterIcons = document.getElementById("account-filter-icons");

    const getAccountFilter = () => {
        const active = accountFilterIcons?.querySelector(".account-filter-icon.active");
        return active?.dataset.filter || "all";
    };

    function initTomSelect(el, opts = {}) {
        if (!el || typeof window.TomSelect === "undefined") return null;
        try {
            return new window.TomSelect(el, { create: false, ...opts });
        } catch (e) {
            return null;
        }
    }
    const tomSelectNoSearchOpts = () => ({
        render: { dropdown: () => { const d = document.createElement("div"); d.className = "ts-dropdown tom-select-no-search"; return d; } }
    });

    // --- Dirty Check and Navigation ---
    const handleNavigation = (url) => {
        if (state.isFormDirty) {
            showModal("Unsaved Changes", "You have unsaved changes that will be lost. Are you sure you want to leave?", () => {
                state.isFormDirty = false;
                window.location.href = url;
            }, true, `<button id="modal-confirm-btn" class="btn-primary">Discard & Leave</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        } else {
            window.location.href = url;
        }
    };

    const confirmAndSwitchAccount = async (newAccountId) => {
        const switchAccount = async () => {
            state.selectedAccountId = newAccountId;
            renderAccountList();
            await loadDetailsForSelectedAccount();
        };

        if (state.isFormDirty) {
            showModal("Unsaved Changes", "You have unsaved changes. Are you sure you want to switch accounts?", async () => {
                state.isFormDirty = false;
                hideModal();
                await switchAccount();
            }, true, `<button id="modal-confirm-btn" class="btn-primary">Discard & Switch</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        } else {
            await switchAccount();
        }
    };

    // --- Data Fetching ---
    const LIST_LOADING_HTML = '<div class="list-loading-state"><div class="list-loading-spinner" aria-hidden="true"></div><p class="list-loading-title">Loading</p><p class="list-loading-subtitle">Fetching data…</p></div>';

    async function loadInitialData() {
        globalState = getState();
        if (!globalState.currentUser) {
            hideGlobalLoader();
            return;
        }
        if (accountList) accountList.innerHTML = LIST_LOADING_HTML;

        try {
            // FIXED: Switched "deals" to "deals_tw"
            const [accountsRes, dealsRes, activitiesRes, contactsRes, dealStagesRes] = await Promise.all([
                supabase.from("accounts").select("*").eq("user_id", globalState.effectiveUserId),
                supabase.from("deals_tw").select("id, account_id, stage").eq("user_id", globalState.effectiveUserId),
                supabase.from("activities").select("id, account_id, contact_id, date").eq("user_id", globalState.effectiveUserId),
                supabase.from("contacts").select("id, account_id, reports_to").eq("user_id", globalState.effectiveUserId),
                supabase.from("deal_stages").select("*").order('sort_order')
            ]);

            if (accountsRes.error) throw accountsRes.error;
            if (dealsRes.error) throw dealsRes.error;
            if (activitiesRes.error) throw activitiesRes.error;
            if (contactsRes.error) throw contactsRes.error;
            if (dealStagesRes.error) throw dealStagesRes.error;

            state.accounts = accountsRes.data || [];
            state.deals = dealsRes.data || [];
            state.activities = activitiesRes.data || [];
            state.contacts = contactsRes.data || [];
            state.dealStages = dealStagesRes.data || [];

            renderAccountList();
        } finally {
            hideGlobalLoader();
        }
    }

    async function loadDetailsForSelectedAccount() {
        if (!state.selectedAccountId) return;

        if (contactListView) contactListView.innerHTML = '<ul id="account-contacts-list"><li class="list-loading-state"><div class="list-loading-spinner" aria-hidden="true"></div><p class="list-loading-title">Loading</p><p class="list-loading-subtitle">Contacts…</p></li></ul>';
        if (contactOrgChartView) contactOrgChartView.innerHTML = '<div class="list-loading-state"><div class="list-loading-spinner" aria-hidden="true"></div><p class="list-loading-title">Loading</p><p class="list-loading-subtitle">Contacts…</p></div>';
        if (accountActivitiesList) accountActivitiesList.innerHTML = '<li class="list-loading-state"><div class="list-loading-spinner" aria-hidden="true"></div><p class="list-loading-title">Loading</p></li>';
        if (accountDealsCards) accountDealsCards.innerHTML = '<p class="recent-activities-empty text-sm text-[var(--text-medium)] px-4 py-6">Loading...</p>';
        
        const account = state.accounts.find(a => a.id === state.selectedAccountId);
        state.selectedAccountDetails.account = account;

        // FIXED: Switched "deals" to "deals_tw"
        const [contactsRes, dealsRes, activitiesRes, tasksRes] = await Promise.all([
            supabase.from("contacts").select("*").eq("account_id", state.selectedAccountId),
            supabase.from("deals_tw").select("*").eq("account_id", state.selectedAccountId),
            supabase.from("activities").select("*").eq("account_id", state.selectedAccountId),
            supabase.from("tasks").select("*").eq("account_id", state.selectedAccountId)
        ]);

        if (contactsRes.error) throw contactsRes.error;
        if (dealsRes.error) throw dealsRes.error;
        if (activitiesRes.error) throw activitiesRes.error;
        if (tasksRes.error) throw tasksRes.error;

        const contactIds = (contactsRes.data || []).map(c => c.id);
        const sequencesRes = contactIds.length > 0
            ? await supabase.from("contact_sequences").select("*").in('contact_id', contactIds)
            : { data: [], error: null };

        if (sequencesRes.error) throw sequencesRes.error;

        state.selectedAccountDetails.contacts = contactsRes.data || [];
        state.selectedAccountDetails.deals = dealsRes.data || [];
        state.selectedAccountDetails.activities = activitiesRes.data || [];
        state.selectedAccountDetails.tasks = tasksRes.data || [];
        state.selectedAccountDetails.contact_sequences = sequencesRes.data || [];

        renderAccountDetails();
    }
    
    async function refreshData() {
        hideAccountDetails(true); 
        await loadInitialData(); 
    }

        
    const hideAccountDetails = (clearSelection = false) => {
        if (accountForm) {
            accountForm.classList.remove('hidden'); 
            accountForm.reset();
            accountForm.querySelector("#account-id").value = '';
            document.getElementById("account-last-saved").textContent = "";
        }
        
        if (contactListView) contactListView.innerHTML = '<ul id="account-contacts-list"></ul>';
        if (contactOrgChartView) contactOrgChartView.innerHTML = "";
        
        const unassignedContainer = document.getElementById("unassigned-contacts-container");
        if (unassignedContainer) unassignedContainer.innerHTML = "";

        if (accountActivitiesList) accountActivitiesList.innerHTML = "";
        if (accountDealsCards) accountDealsCards.innerHTML = "";
        if (accountPendingTaskReminder) accountPendingTaskReminder.classList.add('hidden');
        
        if (clearSelection) {
            state.selectedAccountId = null;
            state.selectedAccountDetails = { account: null, contacts: [], activities: [], deals: [], tasks: [], contact_sequences: [] };
            document.querySelectorAll(".list-item.selected").forEach(item => item.classList.remove("selected"));
            state.isFormDirty = false;
        }
        document.getElementById('account-details')?.classList.remove('active');
        document.getElementById('account-details-scrim')?.classList.remove('visible');
        document.getElementById('account-details-scrim')?.setAttribute('aria-hidden', 'true');
    };

    // --- Render Functions ---
const renderAccountList = () => {
    if (!accountList || !accountSearch || !accountFilterIcons) {
        console.error("Render failed: A required DOM element is missing.");
        return;
    }

    const searchTerm = accountSearch.value.toLowerCase();
    const statusFilter = getAccountFilter();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let hotAccountIds = new Set();
    let accountsWithOpenDealsIds = new Set();

    try {
        hotAccountIds = new Set(
            state.activities
            .filter(act => act.date && new Date(act.date) > thirtyDaysAgo)
            .map(act => {
                if (act.account_id) return act.account_id;
                const contact = state.contacts.find(c => c.id === act.contact_id);
                return contact ? contact.account_id : null;
            })
            .filter(id => id)
        );
    } catch (error) {
        console.error("Error calculating hot accounts:", error);
    }

    try {
        accountsWithOpenDealsIds = new Set(
            state.deals
            .filter(deal => deal.stage && deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost')
            .map(deal => deal.account_id)
            .filter(id => id)
        );
    } catch (error) {
        console.error("Error calculating accounts with open deals:", error);
    }

    const filteredAccounts = state.accounts.filter(account => {
        const matchesSearch = (account.name || "").toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;

        switch (statusFilter) {
            case 'hot': return hotAccountIds.has(account.id);
            case 'with_deals': return accountsWithOpenDealsIds.has(account.id);
            case 'customer': return account.is_customer === true;
            case 'prospect': return account.is_customer !== true;
            default: return true;
        }
    });

    accountList.innerHTML = "";
    filteredAccounts
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .forEach((account) => {
            const i = document.createElement("div");
            i.className = "list-item";
            i.dataset.id = account.id;

            const hasOpenDeal = accountsWithOpenDealsIds.has(account.id);
            const isHot = hotAccountIds.has(account.id);

            const dealIcon = hasOpenDeal ? '<span class="deal-open-icon">$</span>' : '';
            const hotIcon = isHot ? '<span class="hot-contact-icon">🔥</span>' : '';

            i.innerHTML = `<div class="account-list-item-row"><span class="account-list-name">${(account.name || "").replace(/</g, "&lt;")}</span><div class="list-item-icons">${hotIcon}${dealIcon}</div></div>`;

            if (account.id === state.selectedAccountId) {
                i.classList.add("selected");
            }
            accountList.appendChild(i);
        });
};

    const renderAccountDetails = () => {
        const { account, contacts, activities, deals, tasks, contact_sequences } = state.selectedAccountDetails;

        if (!account) {
            hideAccountDetails(true);
            return;
        }

        if (accountPendingTaskReminder) {
            const pendingAccountTasks = tasks.filter(task => task.status === 'Pending');
            if (pendingAccountTasks.length > 0) {
                const taskCount = pendingAccountTasks.length;
                accountPendingTaskReminder.textContent = `You have ${taskCount} pending task${taskCount > 1 ? 's' : ''} for this account.`;
                accountPendingTaskReminder.classList.remove('hidden');
            } else {
                accountPendingTaskReminder.classList.add('hidden');
            }
        }

        accountForm.classList.remove('hidden');
        accountForm.querySelector("#account-id").value = account.id;
        accountForm.querySelector("#account-name").value = account.name || "";
        
        const websiteInput = accountForm.querySelector("#account-website");
        const websiteLink = document.getElementById("account-website-link");
        websiteInput.value = account.website || "";
        
        const updateWebsiteLink = (url) => {
            if (!url || !url.trim()) { if (websiteLink) websiteLink.classList.add('hidden'); return; }
            let fullUrl = url.trim();
            if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) { fullUrl = 'https://' + fullUrl; }
            if (websiteLink) { websiteLink.href = fullUrl; websiteLink.classList.remove('hidden'); }
        };
        updateWebsiteLink(account.website);
        accountForm.querySelector("#account-phone").value = account.phone || "";
        const accountSocialEl = accountForm.querySelector("#account-social");
        if (accountSocialEl) accountSocialEl.value = account.social_media || "";
        accountForm.querySelector("#account-address").value = account.address || "";
        accountForm.querySelector("#account-notes").value = account.notes || "";
        document.getElementById("account-last-saved").textContent = account.last_saved ? `Last Saved: ${formatDate(account.last_saved)}` : "";
        accountForm.querySelector("#account-is-customer").checked = account.is_customer;

        accountDealsCards.innerHTML = "";
        if (deals.length === 0) {
            if (accountDealsCards) accountDealsCards.innerHTML = '<p class="recent-activities-empty text-sm text-[var(--text-medium)] px-4 py-6">No deals yet.</p>';
        } else if (accountDealsCards) {
            const accountName = account.name || '—';
            deals.forEach((deal) => {
                const dealId = deal.id;
                const cardHtml = getKanbanDealCardContent(deal, { accountName, draggable: false });
                const wrap = document.createElement("div");
                wrap.innerHTML = cardHtml.trim();
                const card = wrap.firstElementChild;
                if (!card) return;
                accountDealsCards.appendChild(card);
                const flipInner = card.querySelector(".deal-card-flip-inner");
                const backEditBtn = card.querySelector(".deal-card-back-edit");
                const noFlipSelector = '.deal-card-commit-toggle, .deal-card-stage-pill, .deal-card-stage-trigger, .deal-card-stage-fan, .deal-card-proposal-icon, .deal-card-editable, .deal-card-elements, .element-pill, .deal-card-back-edit, .deal-card-notes-save, .deal-card-notes-cancel';
                flipInner.addEventListener("click", (e) => {
                    if (card.classList.contains("deal-card-editing") || card.classList.contains("deal-card-notes-editing")) return;
                    const isCommit = e.target.closest(".deal-card-commit-toggle");
                    const isBackEdit = e.target.closest(".deal-card-back-edit");
                    const isNotesSave = e.target.closest(".deal-card-notes-save");
                    const isNotesCancel = e.target.closest(".deal-card-notes-cancel");
                    const inNoFlip = e.target.closest(noFlipSelector);
                    if (inNoFlip) {
                        if (isBackEdit) { e.stopPropagation(); enterNotesEditMode(card, dealId, (state.selectedAccountDetails.deals.find(d => d.id === dealId) || {}).notes || ""); return; }
                        if (isNotesSave || isNotesCancel) return;
                        return;
                    }
                    if (card.classList.contains("deal-card-flipped")) { card.classList.remove("deal-card-flipped"); return; }
                    if (isCommit) return;
                    card.classList.add("deal-card-flipped");
                });
                if (backEditBtn) {
                    backEditBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        enterNotesEditMode(card, dealId, (state.selectedAccountDetails.deals.find(d => d.id === dealId) || {}).notes || "");
                    });
                }
                replaceStagePillWithFanOnAccountCard(card, dealId);
                card.querySelectorAll(".deal-card-editable").forEach((el) => {
                    el.addEventListener("click", (e) => { e.stopPropagation(); startDealInlineEdit(card, el, dealId); });
                });
                card.querySelectorAll(".element-pill").forEach((pill) => {
                    pill.addEventListener("click", (e) => { e.stopPropagation(); handleElementPillToggle(card, pill, dealId); });
                });
            });
        }

        renderContactView();

        accountActivitiesList.innerHTML = "";
        if (activities.length === 0) {
            accountActivitiesList.innerHTML = '<p class="recent-activities-empty text-sm text-[var(--text-medium)] px-4 py-6">No activities yet.</p>';
        } else {
            activities.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((act) => {
                const c = contacts.find((co) => co.id === act.contact_id);
                const typeLower = (act.type || "").toLowerCase();
                let iconClass = "icon-default", icon = "fa-circle-info", iconPrefix = "fas";
                if (typeLower.includes("cognito") || typeLower.includes("intelligence")) { icon = "fa-magnifying-glass"; }
                else if (typeLower.includes("email")) { iconClass = "icon-email"; icon = "fa-envelope"; }
                else if (typeLower.includes("call")) { iconClass = "icon-call"; icon = "fa-phone"; }
                else if (typeLower.includes("meeting")) { iconClass = "icon-meeting"; icon = "fa-video"; }
                else if (typeLower.includes("linkedin")) { iconClass = "icon-linkedin"; icon = "fa-linkedin-in"; iconPrefix = "fa-brands"; }
                const contactNameRaw = c ? `${(c.first_name || "").trim()} ${(c.last_name || "").trim()}`.trim() || "Unknown" : "Unknown";
                const contactName = contactNameRaw.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const safeType = (act.type || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const safeDesc = (act.description || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const item = document.createElement("div");
                item.className = "recent-activity-item";
                item.innerHTML = `
                    <div class="activity-icon-wrap ${iconClass}"><i class="${iconPrefix} ${icon}"></i></div>
                    <div class="activity-body">
                        <div class="activity-meta">${safeType} with ${contactName}</div>
                        <div class="activity-description">${safeDesc}</div>
                        <div class="activity-date">${formatDate(act.date)}</div>
                    </div>
                    <div class="activity-actions"></div>
                `;
                accountActivitiesList.appendChild(item);
            });
        }

        state.isFormDirty = false;
    };

    const renderContactView = () => {
        const unassignedContainer = document.getElementById("unassigned-contacts-container");

        if (!contactListView || !contactOrgChartView || !contactListBtn || !contactOrgChartBtn || !unassignedContainer) {
            return;
        }

        if (state.contactViewMode === 'org') {
            contactListView.classList.add('hidden');
            contactOrgChartView.classList.remove('hidden');
            unassignedContainer.classList.add('hidden'); /* Constellation: no unassigned section */
            contactListBtn.classList.remove('active');
            contactOrgChartBtn.classList.add('active');
            if (orgChartMaximizeBtn) orgChartMaximizeBtn.classList.remove('hidden');
            renderOrgChart();
        } else {
            contactListView.classList.remove('hidden');
            contactOrgChartView.classList.add('hidden');
            unassignedContainer.classList.add('hidden');
            contactListBtn.classList.add('active');
            contactOrgChartBtn.classList.remove('active');
            if (orgChartMaximizeBtn) orgChartMaximizeBtn.classList.add('hidden');
            renderContactList();
        }
    };

    const renderContactList = () => {
        const { contacts, contact_sequences } = state.selectedAccountDetails;
        const listElement = document.getElementById('account-contacts-list');
        if (!listElement) return;

        listElement.innerHTML = "";
        contacts
            .sort((a, b) => (a.first_name || "").localeCompare(b.first_name || ""))
            .forEach((c) => {
                const li = document.createElement("li");
                const inSeq = contact_sequences.some((cs) => cs.contact_id === c.id && cs.status === "Active");

                const emailIcon = c.email ? `<i class="fas fa-envelope contact-attribute-icon email-icon"></i>` : '';
                const phoneIcon = c.phone ? `<i class="fas fa-phone contact-attribute-icon phone-icon"></i>` : '';

                li.innerHTML = `${phoneIcon}${emailIcon}<a href="contacts.html?contactId=${c.id}" class="contact-name-link" data-contact-id="${c.id}">${c.first_name} ${c.last_name}</a> (${c.title || "No Title"}) ${inSeq ? '<span class="sequence-status-icon"></span>' : ""}`;
                listElement.appendChild(li);
            });
    };

    // --- Org chart: pasted from Constellation-V/js/accounts.js (viewport, zoom, pan, drag/drop) ---
    const ZOOM_CONTROLS_HTML = `<div class="org-chart-zoom-controls">
        <button type="button" id="org-chart-zoom-out-btn" class="org-chart-zoom-btn" title="Zoom out"><i class="fas fa-minus"></i></button>
        <button type="button" id="org-chart-zoom-in-btn" class="org-chart-zoom-btn" title="Zoom in"><i class="fas fa-plus"></i></button>
    </div>`;

    const renderOrgChart = (container = null) => {
        const target = container || contactOrgChartView;
        if (!target) return;

        const contacts = state.selectedAccountDetails?.contacts ?? [];
        const contactMap = new Map(contacts.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        contactMap.forEach(contact => {
            if (contact.reports_to && contactMap.has(Number(contact.reports_to))) {
                contactMap.get(Number(contact.reports_to)).children.push(contact);
            } else {
                tree.push(contact);
            }
        });

        const createNodeHtml = (contact) => {
            const sortedChildren = contact.children.sort((a, b) => (a.first_name || "").localeCompare(b.first_name || ""));
            let childrenHtml = '';
            if (sortedChildren && sortedChildren.length > 0) {
                childrenHtml = `<ul class="org-chart-children">
                    ${sortedChildren.map(child => createNodeHtml(child)).join('')}
                </ul>`;
            }
            return `<li class="org-chart-node">
                <div class="contact-card" draggable="true" data-contact-id="${contact.id}">
                    <div class="contact-card-name">${contact.first_name} ${contact.last_name}</div>
                    <div class="contact-card-title">${contact.title || 'N/A'}</div>
                </div>
                ${childrenHtml}
            </li>`;
        };

        const sortedTree = tree.sort((a, b) => (a.first_name || "").localeCompare(b.first_name || ""));
        if (sortedTree.length > 0) {
            const chartHtml = `<ul class="org-chart-root">
                ${sortedTree.map(topLevelNode => createNodeHtml(topLevelNode)).join('')}
            </ul>`;
            const viewportContent = `<div class="org-chart-viewport"><div class="org-chart-scalable">${chartHtml}</div></div>`;
            if (target === contactOrgChartView) {
                target.innerHTML = `<div class="org-chart-render-target">${viewportContent}</div>${ZOOM_CONTROLS_HTML}`;
            } else {
                target.innerHTML = viewportContent;
            }
            const viewport = target.querySelector('.org-chart-viewport');
            if (viewport) fitOrgChartInViewport(viewport);
        } else {
            const placeholder = `<p class="placeholder-text" style="text-align: center; padding: 2rem 0;">No contacts found. Start adding contacts to build your org chart.</p>`;
            if (target === contactOrgChartView) {
                target.innerHTML = `<div class="org-chart-render-target">${placeholder}</div>${ZOOM_CONTROLS_HTML}`;
            } else {
                target.innerHTML = placeholder;
            }
        }

        setupOrgChartDragDrop(target);
    };

    // --- FIXED: Population & Baller Panning ---
    function fitOrgChartInViewport(viewport, zoomFactor) {
        if (!viewport) return;
        const scalable = viewport.querySelector('.org-chart-scalable');
        if (!scalable) return;

        // Initialize persistent state
        if (zoomFactor !== undefined) viewport.dataset.zoomFactor = String(zoomFactor);
        if (!viewport.dataset.panX) viewport.dataset.panX = '0';
        if (!viewport.dataset.panY) viewport.dataset.panY = '0';

        const apply = () => {
            // Base scale for "V8" logic (0.7 is a good safe start)
            const baseScale = 0.7;
            const zoom = parseFloat(viewport.dataset.zoomFactor || '1');
            const px = viewport.dataset.panX;
            const py = viewport.dataset.panY;

            // Force centering + manual pan + zoom
            scalable.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) scale(${baseScale * zoom})`;
        };

        // Force a render cycle wait
        requestAnimationFrame(() => requestAnimationFrame(apply));

        // Bind the click-to-drag repositioning
        setupOrgChartPanning(viewport, apply);
    }

    function setupOrgChartPanning(viewport, updateFn) {
        if (viewport._panInitialized) return;
        viewport._panInitialized = true;

        let isPanning = false;
        let startX, startY;

        viewport.addEventListener('mousedown', (e) => {
            // Prevent panning if clicking a contact card
            if (e.target.closest('.contact-card') || e.target.closest('button')) return;

            isPanning = true;
            viewport.style.cursor = 'grabbing';

            // Use the stored pan coordinates as the baseline
            startX = e.clientX - (parseInt(viewport.dataset.panX, 10) || 0);
            startY = e.clientY - (parseInt(viewport.dataset.panY, 10) || 0);
        });

        window.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            viewport.dataset.panX = String(e.clientX - startX);
            viewport.dataset.panY = String(e.clientY - startY);
            updateFn();
        });

        window.addEventListener('mouseup', () => {
            isPanning = false;
            viewport.style.cursor = 'grab';
        });
    }

    const setupOrgChartDragDrop = (container = null) => {
        const chartContainer = container || contactOrgChartView;
        if (!chartContainer) return;

        const isCircular = (targetId, draggedId) => {
            const contacts = state.selectedAccountDetails.contacts;
            const contactMap = new Map(contacts.map(c => [c.id, c]));

            let currentId = targetId;
            while (currentId) {
                if (currentId === draggedId) {
                    return true;
                }
                const currentContact = contactMap.get(currentId);
                currentId = currentContact && currentContact.reports_to ? Number(currentContact.reports_to) : null;
            }
            return false;
        };

        chartContainer.querySelectorAll('.contact-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                const targetCard = e.target.closest('.contact-card');
                if (!targetCard) return;

                draggedContactId = Number(targetCard.dataset.contactId);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedContactId);
                setTimeout(() => targetCard.classList.add('dragging'), 0);
            });

            card.addEventListener('dragend', (e) => {
                const targetCard = e.target.closest('.contact-card');
                if (targetCard) targetCard.classList.remove('dragging');
                draggedContactId = null;
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                const targetCard = e.target.closest('.contact-card');
                if (targetCard && Number(targetCard.dataset.contactId) !== draggedContactId) {
                    e.dataTransfer.dropEffect = 'move';
                    targetCard.classList.add('drop-target');
                }
            });

            card.addEventListener('dragleave', (e) => {
                const targetCard = e.target.closest('.contact-card');
                if (targetCard) targetCard.classList.remove('drop-target');
            });

            card.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const targetCard = e.target.closest('.contact-card');
                if (!targetCard) return;

                const localDraggedContactId = draggedContactId;
                const targetContactId = Number(targetCard.dataset.contactId);

                targetCard.classList.remove('drop-target');

                if (localDraggedContactId && localDraggedContactId !== targetContactId) {

                    if (isCircular(targetContactId, localDraggedContactId)) {
                        showModal("Invalid Move", "Cannot move a manager to report to one of their own subordinates.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                        return;
                    }

                    const { error } = await supabase.from('contacts')
                        .update({ reports_to: targetContactId })
                        .eq('id', localDraggedContactId);

                    if (error) {
                        console.error("Error updating reporting structure:", error);
                        showToast(`Could not update reporting structure: ${error.message}`, 'error');
                    } else {
                        state.selectedAccountDetails.contacts = state.selectedAccountDetails.contacts.map(contact =>
                            contact.id === localDraggedContactId
                                ? { ...contact, reports_to: targetContactId }
                                : contact
                        );

                        refreshOrgChartViews();
                    }
                }
            });
        });

        chartContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const targetCard = e.target.closest('.contact-card');
            if (!targetCard) {
                e.dataTransfer.dropEffect = 'move';
                chartContainer.classList.add('drop-target-background');
            }
        });

        chartContainer.addEventListener('dragleave', (e) => {
             if (e.target === chartContainer) {
                 chartContainer.classList.remove('drop-target-background');
             }
        });

        chartContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            chartContainer.classList.remove('drop-target-background');

            const localDraggedContactId = draggedContactId;

            const targetCard = e.target.closest('.contact-card');
            if (targetCard || !localDraggedContactId) {
                return;
            }

            const contact = state.selectedAccountDetails.contacts.find(c => c.id === localDraggedContactId);
            if (contact && contact.reports_to === null) {
                return;
            }

            const { error } = await supabase.from('contacts')
                .update({ reports_to: null })
                .eq('id', localDraggedContactId);

            if (error) {
                console.error("Error breaking reporting structure:", error);
                showToast(`Could not update reporting structure: ${error.message}`, 'error');
            } else {
                state.selectedAccountDetails.contacts = state.selectedAccountDetails.contacts.map(contact =>
                    contact.id === localDraggedContactId
                        ? { ...contact, reports_to: null }
                        : contact
                );

                refreshOrgChartViews();
            }
        });
    };

    const refreshOrgChartViews = () => {
        renderOrgChart();
        if (orgChartModalBackdrop && !orgChartModalBackdrop.classList.contains('hidden') && orgChartModalContent) {
            renderOrgChart(orgChartModalContent);
            setupOrgChartDragDrop(orgChartModalContent);
        }
    };


    // --- Deal Handlers ---
    function replaceStagePillWithFanOnAccountCard(card, dealId) {
        const stageEl = card.querySelector('.deal-card-stage');
        if (!stageEl) return;
        const deal = state.selectedAccountDetails.deals.find((d) => d.id === dealId);
        if (!deal) return;
        const stages = (state.dealStages || []).sort((a, b) => a.sort_order - b.sort_order);
        const currentStage = deal.stage || '';
        const wrap = document.createElement('div');
        wrap.className = 'deal-card-stage-fan-wrap';
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = `deal-card-stage-trigger ${getDealStageColorClass(currentStage)}`;
        trigger.innerHTML = `${getStageDisplayName(currentStage) || 'Stage'} <i class="fas fa-chevron-down deal-card-stage-chevron"></i>`;
        wrap.appendChild(trigger);
        const fan = document.createElement('div');
        fan.className = 'deal-card-stage-fan';
        const total = stages.length;
        const spread = Math.min(120, Math.max(60, (total - 1) * 25));
        const startAngle = 90 + spread / 2;
        stages.forEach((s, i) => {
            const angle = total <= 1 ? 90 : startAngle - (spread * i) / (total - 1);
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = `deal-card-stage-pill ${getDealStageColorClass(s.stage_name)}`;
            pill.textContent = getStageDisplayName(s.stage_name);
            pill.dataset.stage = s.stage_name;
            pill.style.setProperty('--fan-angle', `${angle}deg`);
            pill.style.setProperty('--fan-i', `${i}`);
            pill.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newStage = s.stage_name;
                const { error } = await supabase.from('deals_tw').update({ stage: newStage }).eq('id', dealId);
                if (error) { showToast('Error updating stage', 'error'); return; }
                deal.stage = newStage;
                trigger.innerHTML = `${getStageDisplayName(newStage)} <i class="fas fa-chevron-down deal-card-stage-chevron"></i>`;
                trigger.className = `deal-card-stage-trigger ${getDealStageColorClass(newStage)}`;
                wrap.classList.remove('open');
                document.removeEventListener('click', closeFan);
            });
            fan.appendChild(pill);
        });
        wrap.appendChild(fan);
        const closeFan = () => {
            wrap.classList.remove('open');
            document.removeEventListener('click', closeFan);
        };
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (wrap.classList.contains('open')) {
                closeFan();
            } else {
                wrap.classList.add('open');
                setTimeout(() => document.addEventListener('click', closeFan), 0);
            }
        });
        wrap.addEventListener('click', (e) => e.stopPropagation());
        fan.querySelectorAll('.deal-card-stage-pill').forEach((p) => {
            p.addEventListener('click', () => closeFan());
        });
        stageEl.replaceWith(wrap);
    }

    function startDealInlineEdit(card, el, dealId) {
        const field = el.dataset.field;
        const deal = state.selectedAccountDetails.deals.find(d => d.id === dealId);
        if (!deal || !field) return;
        if (el.classList.contains('deal-card-editing')) return;
        const currentText = el.textContent.trim();
        let input;
        if (field === 'value') {
            input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.step = '0.01';
            input.value = getDealValue(deal);
            input.className = 'deal-card-inline-input';
        } else if (field === 'name') {
            input = document.createElement('input');
            input.type = 'text';
            input.value = deal.name || '';
            input.className = 'deal-card-inline-input';
        } else if (field === 'account') {
            input = document.createElement('select');
            input.className = 'deal-card-inline-input';
            (state.accounts || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.name || '';
                if (Number(acc.id) === Number(deal.account_id)) opt.selected = true;
                input.appendChild(opt);
            });
        } else if (field === 'close_month') {
            input = document.createElement('input');
            input.type = 'month';
            input.value = deal.close_month || '';
            input.className = 'deal-card-inline-input';
        } else return;
        el.classList.add('deal-card-editing');
        el.textContent = '';
        el.appendChild(input);
        if (input.tagName === 'SELECT' && typeof window.TomSelect !== 'undefined') {
            try { initTomSelect(input, tomSelectNoSearchOpts()); } catch (e) {}
        }
        input.focus();
        const save = async () => {
            let value;
            if (field === 'value') value = parseFloat(input.value) || 0;
            else if (field === 'name') value = input.value.trim();
            else if (field === 'account') value = Number(input.tomselect ? input.tomselect.getValue() : input.value);
            else if (field === 'close_month') value = input.value || null;
            const payload = field === 'value' ? { value } : field === 'name' ? { name: value } : field === 'account' ? { account_id: value } : { close_month: value };
            const { error } = await supabase.from('deals_tw').update(payload).eq('id', dealId);
            el.classList.remove('deal-card-editing');
            input.remove();
            if (error) { renderAccountDetails(); return; }
            if (field === 'value') deal.value = value;
            else if (field === 'name') deal.name = value;
            else if (field === 'account') deal.account_id = value;
            else deal.close_month = value;
            if (field === 'value') el.textContent = formatCurrency(value) + '/mo';
            else if (field === 'name') { const safe = (value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); el.textContent = value.length > 28 ? value.substring(0, 28) + '...' : value; el.title = value; }
            else if (field === 'account') { const acc = state.accounts.find(a => a.id === value); el.textContent = acc ? acc.name : '—'; }
            else el.textContent = value ? formatMonthYearShort(value) : '—';
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    }

    async function handleElementPillToggle(card, pill, dealId) {
        const deal = state.selectedAccountDetails.deals.find(d => d.id === dealId);
        if (!deal) return;
        const element = pill.dataset.element;
        const current = (deal.elements || '').split(',').map(p => p.trim()).filter(Boolean);
        const set = new Set(current.map(p => p.toLowerCase()));
        const elLower = (element || '').toLowerCase();
        if (set.has(elLower)) set.delete(elLower);
        else set.add(elLower);
        const newList = DEAL_ELEMENTS_LIST.filter(el => set.has(el.toLowerCase()));
        const newValue = newList.join(', ');
        const { error } = await supabase.from('deals_tw').update({ elements: newValue || null }).eq('id', dealId);
        if (error) return;
        deal.elements = newValue;
        const container = card.querySelector('.deal-card-elements');
        if (container) container.innerHTML = getElementsPillHtml(dealId, newValue);
        card.querySelectorAll('.element-pill').forEach((p) => {
            p.addEventListener('click', (e) => { e.stopPropagation(); handleElementPillToggle(card, p, dealId); });
        });
    }

    async function handleCommitDeal(dealId, isCommitted) {
        const id = dealId === 'new' ? dealId : Number(dealId);
        if (id === 'new') {
            const deal = state.selectedAccountDetails.deals.find(d => d.id === 'new');
            if (deal) deal.is_committed = isCommitted;
            return;
        }
        const { error } = await supabase.from('deals_tw').update({ is_committed: isCommitted }).eq('id', id);
        if (error) {
            const checkbox = document.querySelector(`.commit-deal-checkbox[data-deal-id="${id}"]`);
            if (checkbox) checkbox.checked = !isCommitted;
            showToast('Error updating commit status: ' + error.message, 'error');
        } else {
            const dealMaster = state.deals.find(d => d.id === id);
            if (dealMaster) dealMaster.is_committed = isCommitted;
            const dealDetails = state.selectedAccountDetails.deals.find(d => d.id === id);
            if (dealDetails) dealDetails.is_committed = isCommitted;
        }
    }

    async function handleProductPillToggle(pillElement) {
        const dealIdRaw = pillElement.dataset.dealId;
        const dealId = dealIdRaw === "new" ? "new" : Number(dealIdRaw);
        const productName = pillElement.dataset.product;
        const deal = state.selectedAccountDetails.deals.find((d) => String(d.id) === String(dealId));
        if (!deal || !productName) return;

        const isActive = pillElement.classList.contains("active");
        let currentProducts = (deal.products || "").split(",").map((p) => p.trim()).filter((p) => p);

        if (isActive) {
            currentProducts = currentProducts.filter((p) => {
                const pLower = p.toLowerCase();
                const targetLower = productName.toLowerCase();
                if (targetLower === "pri/sip") return !pLower.includes("pri") && !pLower.includes("sip");
                if (targetLower === "sd-wan") return !pLower.includes("sdwan") && !pLower.includes("sd-wan");
                return pLower !== targetLower;
            });
        } else {
            currentProducts.push(productName);
        }

        const newProductsString = currentProducts.join(", ");
        deal.products = newProductsString;

        if (dealId === "new") {
            renderAccountDetails();
            return;
        }
        const { error } = await supabase.from("deals_tw").update({ products: newProductsString }).eq("id", dealId);
        if (error) return;
        const dealMaster = state.deals.find((d) => d.id === dealId);
        if (dealMaster) dealMaster.products = newProductsString;
        renderAccountDetails();
    }

    function enterNotesEditMode(card, dealId, currentNotes) {
        if (dealId === 'new') return;
        const backContent = card.querySelector(".deal-card-back-content");
        const backBody = card.querySelector(".deal-card-back-body");
        const backEditBtn = card.querySelector(".deal-card-back-edit");
        if (!backContent || !backBody || !backEditBtn) return;
        card.classList.add("deal-card-notes-editing");
        backBody.dataset.originalNotes = currentNotes;
        const textarea = document.createElement("textarea");
        textarea.className = "deal-card-notes-textarea";
        textarea.value = currentNotes;
        textarea.rows = 4;
        backBody.innerHTML = "";
        backBody.appendChild(textarea);
        const wrap = document.createElement("div");
        wrap.className = "deal-card-notes-edit-actions";
        wrap.innerHTML = `<button type="button" class="btn-icon btn-icon-sm deal-card-notes-cancel" title="Cancel"><i class="fas fa-times"></i></button><button type="button" class="btn-icon btn-icon-sm deal-card-notes-save" title="Save job details"><i class="fas fa-check"></i></button>`;
        backEditBtn.replaceWith(wrap);
        const saveBtn = wrap.querySelector(".deal-card-notes-save");
        const cancelBtn = wrap.querySelector(".deal-card-notes-cancel");
        const exitNotesEdit = () => {
            card.classList.remove("deal-card-notes-editing");
            const orig = backBody.dataset.originalNotes || "";
            const escaped = orig.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
            backBody.removeAttribute("data-original-notes");
            backBody.innerHTML = escaped || '<span class="text-muted">No job details</span>';
            const newEditBtn = document.createElement("button");
            newEditBtn.type = "button";
            newEditBtn.className = "btn-icon btn-icon-sm deal-card-back-edit";
            newEditBtn.dataset.dealId = dealId;
            newEditBtn.title = "Edit job details";
            newEditBtn.innerHTML = "<i class=\"fas fa-pen\"></i>";
            wrap.replaceWith(newEditBtn);
        };
        saveBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const value = textarea.value.trim();
            const { error } = await supabase.from("deals_tw").update({ notes: value }).eq("id", dealId);
            if (error) return;
            const deal = state.deals.find(d => d.id === dealId);
            if (deal) deal.notes = value;
            const dealDetails = state.selectedAccountDetails.deals.find(d => d.id === dealId);
            if (dealDetails) dealDetails.notes = value;
            backBody.dataset.originalNotes = value;
            exitNotesEdit();
        });
        cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); exitNotesEdit(); });
    }

    function handleEditDeal(dealId) {
        const deal = state.selectedAccountDetails.deals.find(d => d.id === dealId);
        if (!deal) return showToast("Deal not found!", "error");

        const stageOptions = state.dealStages.sort((a, b) => a.sort_order - b.sort_order).map(s => `<option value="${s.stage_name}" ${deal.stage === s.stage_name ? 'selected' : ''}>${getStageDisplayName(s.stage_name)}</option>`).join('');

        // FIXED: Removed Term Input
        showModal("Edit Deal", `
            <label>Deal Name:</label><input type="text" id="modal-deal-name" value="${deal.name || ''}" required>
            <label>Stage:</label><select id="modal-deal-stage" required>${stageOptions}</select>
            <label>Project Value:</label><input type="number" id="modal-deal-mrc" min="0" value="${deal.mrc || 0}">
            <label>Close Month:</label><input type="month" id="modal-deal-close-month" value="${deal.close_month || ''}">
            <label>Job Details:</label><textarea id="modal-deal-products" placeholder="List products, comma-separated">${deal.products || ''}</textarea>
        `, async () => {
            const stageEl = document.getElementById('modal-deal-stage');
            const updatedDealData = {
                name: document.getElementById('modal-deal-name').value.trim(),
                // Term Removed
                stage: stageEl?.tomselect ? stageEl.tomselect.getValue() : (stageEl?.value || ''),
                mrc: parseFloat(document.getElementById('modal-deal-mrc').value) || 0,
                close_month: document.getElementById('modal-deal-close-month').value || null,
                products: document.getElementById('modal-deal-products').value.trim(),
            };
            if (!updatedDealData.name) {
                showToast("Deal name is required.", "error");
                return false;
            }
            // FIXED: Switched "deals" to "deals_tw"
            const { error } = await supabase.from('deals_tw').update(updatedDealData).eq('id', dealId);
            if (error) { showToast('Error updating deal: ' + error.message, 'error'); return false; }
            await refreshData(); hideModal(); showToast("Deal updated successfully!", "success");
        }, true, `<button id="modal-confirm-btn" class="btn-primary">Save Deal</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        const modalStageSel = document.getElementById("modal-deal-stage");
        if (modalStageSel && typeof window.TomSelect !== "undefined") {
            try { initTomSelect(modalStageSel, tomSelectNoSearchOpts()); } catch (e) {}
        }
    }

    async function handlePrintBriefing() {
        const accountName = state.selectedAccountDetails.account?.name;
        const briefingContainer = document.querySelector('.ai-briefing-container');
        if (!briefingContainer) {
            showToast("Please generate a briefing first.", "error");
            return;
        }

        const printClone = briefingContainer.cloneNode(true);
        const briefingHtml = printClone.innerHTML;
        
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'absolute';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow.document;
        frameDoc.open();
        
        frameDoc.write(`
            <html>
                <head>
                    <title>Ten Works Briefing: ${accountName || 'Account'}</title>
                    <link rel="stylesheet" href="css/style.css">
                    <style>
                        @media print {
                            body {
                                margin: 15mm;
                                background-color: #ffffff !important;
                                font-family: 'Inter', system-ui, sans-serif !important;
                                color: #1a1a1a !important;
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                            }

                            /* --- TEN WORKS HEADER & LOGO --- */
                            .report-header {
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                border-bottom: 3px solid #d6ad81 !important; /* Gold Accent */
                                padding-bottom: 20px !important;
                                margin-bottom: 30px !important;
                            }

                            .logo-container {
                                height: 60px;
                            }

                            .logo-container img {
                                height: 100%;
                                width: auto;
                            }

                            .header-title-group {
                                text-align: right;
                            }

                            .report-header h3 {
                                font-size: 1.5rem !important;
                                margin: 0 !important;
                                color: #1a1a1a !important;
                                text-transform: uppercase;
                                letter-spacing: 1px;
                            }

                            .report-header p {
                                margin: 5px 0 0 0 !important;
                                color: #d6ad81 !important; /* Gold accent */
                                font-weight: 600;
                            }

                            /* --- SECTION STYLING --- */
                            h4 {
                                font-size: 1.1rem;
                                color: #d6ad81 !important; /* Gold Headings */
                                margin-top: 25px !important;
                                margin-bottom: 10px !important;
                                text-transform: uppercase;
                                display: flex;
                                align-items: center;
                            }

                            /* Remove icons for print to keep it clean, or keep them if fonts are loaded */
                            h4 i { display: none; } 

                            .briefing-section {
                                background-color: #ffffff !important;
                                border: 1px solid #e2e8f0 !important;
                                padding: 15px !important;
                                border-radius: 4px;
                                margin-bottom: 15px !important;
                                page-break-inside: avoid;
                            }

                            .briefing-pre {
                                background-color: #f8fafc !important;
                                border: 1px solid #e2e8f0 !important;
                                white-space: pre-wrap !important;
                                padding: 10px !important;
                                font-size: 0.9rem !important;
                                color: #4a5568 !important;
                            }

                            /* --- RECOMMENDATION BOX --- */
                            .briefing-section.recommendation {
                                background-color: #fdfaf6 !important; /* Very light gold tint */
                                border: 1px solid #d6ad81 !important;
                                border-left: 8px solid #d6ad81 !important;
                            }

                            .briefing-bullet-list {
                                margin: 10px 0;
                                padding-left: 25px !important;
                            }

                            .briefing-bullet-list li {
                                margin-bottom: 8px;
                                line-height: 1.5;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="report-header">
                        <div class="logo-container">
                            <img src="assets/logo.svg" alt="Ten Works Logo">
                        </div>
                        <div class="header-title-group">
                            <h3>Account Briefing</h3>
                            <p>${accountName || 'Selected Account'}</p>
                        </div>
                    </div>
                    
                    <div class="ai-briefing-container">
                        ${briefingHtml}
                    </div>
                </body>
            </html>
        `);
        frameDoc.close();

        const originalTitle = document.title;
        document.title = `Briefing_${accountName || 'Account'}`;

        setTimeout(() => {
            try {
                printFrame.contentWindow.focus();
                printFrame.contentWindow.print();
            } catch (e) {
                console.error("Print failed:", e);
            } finally {
                if (document.body.contains(printFrame)) {
                    document.body.removeChild(printFrame);
                }
                document.title = originalTitle;
            }
        }, 500); // Increased timeout to ensure logo loads
    }

    async function handleGenerateBriefing() {
        if (!state.selectedAccountId) {
            showToast("Please select an account to generate a briefing.", "error");
            return;
        }
        const { account, contacts, activities, deals } = state.selectedAccountDetails;
        if (!account) return;

        showModal("Generating AI Reconnaissance Report", `<div class="loader"></div><p class="placeholder-text" style="text-align: center;">Scanning internal records and external sources...</p>`, null, false, `<button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);

        try {
            let orgChartText = "No hierarchy defined.";
            if (contacts.length > 0) {
                const contactMap = new Map(contacts.map(c => [c.id, { ...c, children: [] }]));
                const tree = [];
                contactMap.forEach(contact => {
                    if (contact.reports_to && contactMap.has(Number(contact.reports_to))) {
                        contactMap.get(Number(contact.reports_to)).children.push(contact);
                    } else {
                        tree.push(contact);
                    }
                });
                
                const buildTextTree = (node, prefix = "") => {
                    let text = `${prefix}- ${node.first_name} ${node.last_name} (${node.title || 'N/A'})\n`;
                    node.children
                        .sort((a, b) => (a.first_name || "").localeCompare(b.first_name || ""))
                        .forEach(child => {
                            text += buildTextTree(child, prefix + "  ");
                        });
                    return text;
                };
                orgChartText = tree
                    .sort((a, b) => (a.first_name || "").localeCompare(b.first_name || ""))
                    .map(node => buildTextTree(node)).join('');
            }

            const internalData = {
                accountName: account.name,
                contacts: contacts.map(c => ({ name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), title: c.title })),
                orgChart: orgChartText,
                deals: deals.map(d => ({ name: d.name, stage: d.stage, mrc: d.mrc, close_month: d.close_month })),
                activities: activities.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5).map(act => {
                    const contact = contacts.find(c => c.id === act.contact_id);
                    const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : 'Account-Level';
                    return `[${formatDate(act.date)}] ${act.type} with ${contactName}: ${act.description}`;
                }).join('\n')
            };

            const { data: briefing, error } = await supabase.functions.invoke('get-account-briefing', { body: { internalData } });
            if (error) throw error;

            const summaryText = flattenAIResponse(briefing.summary);
            const keyPlayersHtml = flattenAIResponse(briefing.key_players).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            const pipelineText = flattenAIResponse(briefing.pipeline);
            const activityHighlightsHtml = flattenAIResponse(briefing.activity_highlights);
            const newsText = flattenAIResponse(briefing.news);
            const newContactsText = flattenAIResponse(briefing.new_contacts);
            const icebreakersHtml = flattenAIResponse(briefing.icebreakers).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            const recommendationText = flattenAIResponse(briefing.recommendation);

            let orgChartDisplayHtml = '';

            if (state.contactViewMode === 'org' && contactOrgChartView && contactOrgChartView.innerHTML.trim() !== "" && !contactOrgChartView.querySelector('.placeholder-text')) {
                
                const chartCloneHtml = contactOrgChartView.innerHTML;
                const unassignedContainer = document.getElementById("unassigned-contacts-container");
                let unassignedCloneHtml = '';
                if (unassignedContainer) {
                    unassignedCloneHtml = unassignedContainer.innerHTML;
                }
                
                orgChartDisplayHtml = `
                    <h4><i class="fas fa-sitemap"></i> Org Chart</h4>
                    <div class="briefing-section org-chart-print-container"
                         style="
                            max-height: 300px;
                            overflow: hidden;
                            border: 1px solid var(--border-color);
                            background: var(--bg-dark);
                            padding: 10px;
                            border-radius: 8px;
                        ">
                        <div id="org-chart-render-target" style="zoom: 0.75; transform-origin: top left;">
                            
                            <div id="contact-org-chart-view">
                                ${chartCloneHtml}
                            </div>
                            <div id="unassigned-contacts-container">
                                ${unassignedCloneHtml} 
                            </div>
                            
                        </div>
                    </div>`;
                
            } else if (contacts.length > 0) {
                orgChartDisplayHtml = `
                    <h4><i class="fas fa-users"></i> Key Players in CRM</h4>
                    <div class="briefing-section">
                        <p>${keyPlayersHtml}</p>
                    </div>`;
            }

            const briefingHtml = `
                <div class="ai-briefing-container">
                    <h4><i class="fas fa-database"></i> Internal Intelligence (What We Know)</h4>
                    <div class="briefing-section">
                        <p><strong>Relationship Summary:</strong> ${briefing.summary}</p>
                        ${orgChartDisplayHtml}
                        <p><strong>Open Pipeline:</strong> ${briefing.pipeline}</p>
                        <p><strong>Recent Activity:</strong></p>
                        <div class="briefing-pre">${briefing.activity_highlights}</div>
                    </div>
                    <h4><i class="fas fa-globe"></i> External Intelligence (What's Happening Now)</h4>
                    <div class="briefing-section">
                        <p><strong>Latest News & Signals:</strong> ${briefing.news}</p>
                        <p><strong>Potential New Contacts:</strong> ${briefing.new_contacts}</p>
                        <p><strong>Social Icebreakers:</strong></p>
                        <div class="briefing-pre">${icebreakersHtml}</div>
                    </div>
                    <h4><i class="fas fa-lightbulb"></i> AI Recommendation</h4>
                    <div class="briefing-section recommendation">
                        <p>${briefing.recommendation}</p>
                    </div>
                </div>`;
            
            const modalFooter = `
                <button id="print-briefing-btn" class="btn-secondary"><i class="fas fa-print"></i> Print / Download</button>
                <button id="modal-ok-btn" class="btn-primary">Close</button>
            `;
            showModal(`AI Briefing: ${account.name}`, briefingHtml, null, false, modalFooter);

        } catch (error) {
            console.error("Error invoking AI Briefing Edge Function:", error);
            showToast(`Failed to generate AI briefing: ${error.message}. Please try again.`, "error");
        }
    }


    // --- Event Listener Setup ---
    function setupPageEventListeners() {
        setupModalListeners();

        if (accountForm) {
            accountForm.addEventListener('input', () => {
                state.isFormDirty = true;
            });
        }

        if (navSidebar) {
            navSidebar.addEventListener('click', (e) => {
                const navButton = e.target.closest('a.nav-button');
                if (navButton) {
                    e.preventDefault();
                    handleNavigation(navButton.href);
                }
            });
        }

        window.addEventListener('beforeunload', (event) => {
            if (state.isFormDirty) {
                event.preventDefault();
                event.returnValue = '';
            }
        });

        if (accountSearch) accountSearch.addEventListener("input", renderAccountList);
        if (accountFilterIcons) {
            accountFilterIcons.addEventListener("click", (e) => {
                const btn = e.target.closest(".account-filter-icon");
                if (btn) {
                    accountFilterIcons.querySelectorAll(".account-filter-icon").forEach((b) => b.classList.remove("active"));
                    btn.classList.add("active");
                    renderAccountList();
                }
            });
        }

        if (addAccountBtn) {
            addAccountBtn.addEventListener("click", () => {
                const openNewAccountModal = () => {
                    hideAccountDetails(true);
                    showModal("New Account", `<label>Account Name</label><input type="text" id="modal-account-name" required>`,
                        async () => {
                            const name = document.getElementById("modal-account-name")?.value.trim();
                            if (!name) {
                                showToast("Account name is required.", "error");
                                return false;
                            }
                            globalState = getState(); 
                            const { data: newAccountArr, error } = await supabase.from("accounts").insert([{ name, user_id: globalState.effectiveUserId }]).select(); 
                            if (error) {
                                showToast("Error creating account: " + error.message, "error");
                                return false;
                            }
                            state.isFormDirty = false;
                            await refreshData();
                            state.selectedAccountId = newAccountArr?.[0]?.id;
                            renderAccountList();
                            await loadDetailsForSelectedAccount();
                            hideModal();
                            return true;
                        }, true, `<button id="modal-confirm-btn" class="btn-primary">Create Account</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
                };

                if (state.isFormDirty) {
                    showModal("Unsaved Changes", "You have unsaved changes. Discard and add a new account?", () => {
                        hideModal();
                        openNewAccountModal();
                    }, true, `<button id="modal-confirm-btn" class="btn-primary">Discard & Add New</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
                } else {
                    openNewAccountModal();
                }
            });
        }

        if (accountList) {
            accountList.addEventListener("click", (e) => {
                const item = e.target.closest(".list-item");
                if (item) {
                    const accountId = Number(item.dataset.id);
                    if (accountId !== state.selectedAccountId) {
                        confirmAndSwitchAccount(accountId);
                    }
                    document.getElementById('account-details')?.classList.add('active');
                    document.getElementById('account-details-scrim')?.classList.add('visible');
                    document.getElementById('account-details-scrim')?.setAttribute('aria-hidden', 'false');
                }
            });
        }
        const accountDetailsCloseBtn = document.getElementById('account-details-close-btn');
        const accountDetailsScrim = document.getElementById('account-details-scrim');
        if (accountDetailsCloseBtn) accountDetailsCloseBtn.addEventListener('click', () => hideAccountDetails(true));
        if (accountDetailsScrim) accountDetailsScrim.addEventListener('click', () => hideAccountDetails(true));

        if (accountDealsCards) {
            accountDealsCards.addEventListener('click', (e) => {
                const editBtn = e.target.closest('.edit-deal-btn');
                const commitToggle = e.target.closest('.deal-card-commit-toggle');
                const commitCheck = commitToggle?.querySelector('.commit-deal-checkbox') || e.target.closest('.commit-deal-checkbox');
                if (editBtn) handleEditDeal(editBtn.dataset.dealId === 'new' ? 'new' : Number(editBtn.dataset.dealId));
                if (commitCheck) handleCommitDeal(commitCheck.dataset.dealId === 'new' ? 'new' : Number(commitCheck.dataset.dealId), commitCheck.checked);
            });
        }

        if (accountForm) {
            accountForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const id = Number(accountForm.querySelector("#account-id")?.value);
                if (!id) return;
                const data = {
                    name: accountForm.querySelector("#account-name")?.value.trim(),
                    website: accountForm.querySelector("#account-website")?.value.trim(),
                    phone: accountForm.querySelector("#account-phone")?.value.trim(),
                    social_media: accountForm.querySelector("#account-social")?.value.trim() || null,
                    address: accountForm.querySelector("#account-address")?.value.trim(),
                    notes: accountForm.querySelector("#account-notes")?.value,
                    last_saved: new Date().toISOString(),
                    is_customer: accountForm.querySelector("#account-is-customer")?.checked
                };
                if (!data.name) {
                    showToast("Account name is required.", "error");
                    return;
                }

                const { error } = await supabase.from("accounts").update(data).eq("id", id);
                if (error) {
                    showToast("Error saving account: " + error.message, "error");
                    return;
                }

                state.isFormDirty = false;
                await refreshData();
                showToast("Account saved successfully!", "success");
            });
        }

        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener("click", async () => {
                if (!state.selectedAccountId) return;
                showModal("Confirm Deletion", "Are you sure you want to delete this account? This cannot be undone.",
                    async () => {
                        const { error } = await supabase.from("accounts").delete().eq("id", state.selectedAccountId);
                        if (error) {
                            showToast("Error deleting account: " + error.message, "error");
                            return;
                        }
                        state.selectedAccountId = null;
                        state.isFormDirty = false;
                        await refreshData();
                        hideAccountDetails(true);
                        hideModal();
                        showToast("Account deleted successfully!", "success");
                    }, true, `<button id="modal-confirm-btn" class="btn-danger">Delete</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            });
        }

        if (bulkImportAccountsBtn) bulkImportAccountsBtn.addEventListener("click", () => accountCsvInput.click());

        if (bulkExportAccountsBtn) {
            bulkExportAccountsBtn.addEventListener("click", () => {
                const accountsToExport = state.accounts;
                if (accountsToExport.length === 0) {
                    showModal("Info", "No accounts to export.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    return;
                }

                const headers = ["name", "website", "phone", "address", "is_customer"];
                let csvContent = headers.join(",") + "\n";

                accountsToExport.forEach(account => {
                    const row = headers.map(header => {
                        let value = account[header];
                        if (value === null || value === undefined) return '';
                        value = String(value).replace(/"/g, '""');
                        return `"${value}"`;
                    });
                    csvContent += row.join(",") + "\n";
                });

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", "accounts_export.csv");
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }

        if (accountCsvInput) {
            accountCsvInput.addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (!file) return;

                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    dynamicTyping: true,
                    complete: async (results) => {
                        const csvRecords = results.data;
                        const requiredHeaders = ["name"];
                        const actualHeaders = results.meta.fields;

                        if (!requiredHeaders.every(h => actualHeaders.includes(h))) {
                            showModal("Import Error", `CSV must contain a 'name' column.`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                            return;
                        }

                        const recordsToUpdate = [];
                        const recordsToInsert = [];
                        const existingAccountMap = new Map(state.accounts.map(acc => [String(acc.name).trim().toLowerCase(), acc]));

                        csvRecords.forEach(record => {
                            if (!record.name) return;

                            const recordName = String(record.name).trim().toLowerCase();
                            const existingAccount = existingAccountMap.get(recordName);
                            globalState = getState(); 
                            const processedRecord = {
                                name: String(record.name).trim(),
                                website: record.website || null,
                                industry: record.industry || null,
                                phone: record.phone || null,
                                address: record.address || null,
                                quantity_of_sites: (record.quantity_of_sites === 0) ? 0 : (parseInt(record.quantity_of_sites) || null),
                                employee_count: (record.employee_count === 0) ? 0 : (parseInt(record.employee_count) || null),
                                is_customer: record.is_customer === true,
                                user_id: globalState.effectiveUserId 
                            };

                            if (existingAccount) {
                                let changes = {};
                                for (const key in processedRecord) {
                                    if (key !== 'user_id' && key !== 'name' && processedRecord[key] !== existingAccount[key]) {
                                        changes[key] = { old: existingAccount[key], new: processedRecord[key] };
                                    }
                                }
                                if (Object.keys(changes).length > 0) {
                                    recordsToUpdate.push({ ...processedRecord, id: existingAccount.id, changes });
                                }
                            } else {
                                recordsToInsert.push(processedRecord);
                            }
                        });

                        if (recordsToInsert.length === 0 && recordsToUpdate.length === 0) {
                            showModal("Info", "No new accounts or changes found to import.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                            return;
                        }

                        const modalBodyHtml = `
                            <p>Review the changes below and select the records you wish to import.</p>
                            <div class="table-container-scrollable" style="max-height: 400px;">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th><input type="checkbox" id="select-all-checkbox" checked></th>
                                            <th>Action</th><th>Name</th><th>Changes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${recordsToInsert.map((r, index) => `
                                            <tr class="import-row" data-action="insert" data-index="${index}">
                                                <td><input type="checkbox" class="row-select-checkbox" checked></td>
                                                <td class="status-insert" style="color: var(--success-color);">New</td><td>${r.name}</td><td>New account will be created.</td>
                                            </tr>`).join('')}
                                        ${recordsToUpdate.map((r, index) => `
                                            <tr class="import-row" data-action="update" data-index="${index}">
                                                <td><input type="checkbox" class="row-select-checkbox" checked></td>
                                                <td class="status-update" style="color: var(--warning-yellow);">Update</td><td>${r.name}</td>
                                                <td>${Object.keys(r.changes).map(key => `<p><small><strong>${key}:</strong> <span style="color: #d9534f; text-decoration: line-through;">'${r.changes[key].old}'</span> &rarr; <strong style="color: #5cb85c;">'${r.changes[key].new}'</strong></small></p>`).join('')}</td>
                                            </tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>`;

                        showModal("Confirm CSV Import", modalBodyHtml, async () => {
                            const selectedCheckboxes = document.querySelectorAll('#modal-body .row-select-checkbox:checked');
                            let successCount = 0,
                                errorCount = 0;

                            const updatePromises = [];
                            const insertPromises = [];

                            selectedCheckboxes.forEach(cb => {
                                const row = cb.closest('.import-row');
                                const action = row.dataset.action;
                                const index = parseInt(row.dataset.index);

                                if (action === 'insert') {
                                    const record = recordsToInsert[index];
                                    insertPromises.push(supabase.from("accounts").insert(record));
                                } else if (action === 'update') {
                                    const record = recordsToUpdate[index];
                                    const updateData = Object.keys(record.changes).reduce((acc, key) => {
                                        acc[key] = record.changes[key].new;
                                        return acc;
                                    }, {});
                                    updatePromises.push(supabase.from("accounts").update(updateData).eq('id', record.id));
                                }
                            });

                            const results = await Promise.allSettled([...insertPromises, ...updatePromises]);
                            results.forEach(result => {
                                if (result.status === 'fulfilled' && !result.value.error) successCount++;
                                else errorCount++;
                            });

                            let resultMessage = `Import finished: ${successCount} successful operations.`;
                            if (errorCount > 0) resultMessage += ` ${errorCount} failed. Check console for details.`;
                            showModal("Import Complete", resultMessage, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);

                            await refreshData();
                            return true;
                        }, true, `<button id="modal-confirm-btn" class="btn-primary">Process Selected</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);

                        const selectAllCheckbox = document.getElementById('select-all-checkbox');
                        if (selectAllCheckbox) {
                            selectAllCheckbox.addEventListener('change', (e) => {
                                document.querySelectorAll('#modal-body .row-select-checkbox').forEach(cb => cb.checked = e.target.checked);
                            });
                        }
                    },
                    error: (err) => {
                        showModal("Import Error", `Error parsing CSV file: ${err.message}`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    }
                });
                e.target.value = "";
            });
        }

        if (addDealBtn) {
            addDealBtn.addEventListener("click", () => {
                if (!state.selectedAccountId) return showToast("Please select an account first.", "error");
                if (state.dealStages.length === 0) {
                    showToast("Please contact your administrator to define deal stages before creating a deal.", "error");
                    return;
                }
                const account = state.accounts.find((a) => a.id === state.selectedAccountId);
                const accountName = (account && account.name) ? account.name : "—";
                const firstStage = state.dealStages.sort((a, b) => a.sort_order - b.sort_order)[0]?.stage_name || "";
                const stageOptions = state.dealStages
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((s) => `<option value="${s.stage_name}" ${s.stage_name === firstStage ? "selected" : ""}>${getStageDisplayName(s.stage_name)}</option>`)
                    .join("");
                const stageClass = getDealStageColorClass(firstStage);
                const newCardHtml = `
                    <div class="kanban-card deal-card deal-card-flippable deal-card-editing ${stageClass}" data-id="new">
                        <div class="deal-card-flip-inner">
                            <div class="deal-card-front">
                                <div class="deal-card-header">
                                    <select id="new-deal-stage" class="deal-card-inline-input new-deal-stage-select">${stageOptions}</select>
                                    <button type="button" id="new-deal-save-btn" class="btn-primary btn-sm ml-auto"><i class="fas fa-check mr-1"></i> Save</button>
                                    <button type="button" id="new-deal-cancel-btn" class="btn-secondary btn-sm">Cancel</button>
                                </div>
                                <div class="deal-card-value">$ <input type="number" id="new-deal-value" min="0" value="0" step="0.01" class="deal-card-inline-input w-24 text-center"> /mo</div>
                                <div class="deal-card-name"><input type="text" id="new-deal-name" placeholder="Deal name" class="deal-card-inline-input w-full"></div>
                                <div class="deal-card-account">${(accountName || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
                                <div class="deal-card-elements" id="new-deal-elements">${getElementsPillHtml("new", "")}</div>
                                <div class="deal-card-footer">
                                    <span class="deal-card-close"><input type="month" id="new-deal-close-month" class="deal-card-inline-input" value=""></span>
                                </div>
                            </div>
                        </div>
                    </div>`;
                const wrap = document.createElement("div");
                wrap.innerHTML = newCardHtml.trim();
                const newCard = wrap.firstElementChild;
                if (!newCard || !accountDealsCards) return;
                accountDealsCards.insertBefore(newCard, accountDealsCards.firstChild);
                const saveBtn = newCard.querySelector("#new-deal-save-btn");
                const cancelBtn = newCard.querySelector("#new-deal-cancel-btn");
                const stageSel = newCard.querySelector("#new-deal-stage");
                if (stageSel) {
                    if (typeof window.TomSelect !== "undefined") {
                        try {
                            const ts = initTomSelect(stageSel, tomSelectNoSearchOpts());
                            if (ts) ts.on("change", (val) => {
                                newCard.className = newCard.className.replace(/\bdeal-stage-\S+/g, "").trim() + " " + getDealStageColorClass(val);
                            });
                        } catch (e) {}
                    } else {
                        stageSel.addEventListener("change", () => {
                            const stage = stageSel.value;
                            newCard.className = newCard.className.replace(/\bdeal-stage-\S+/g, "").trim() + " " + getDealStageColorClass(stage);
                        });
                    }
                }
                newCard.querySelectorAll(".element-pill").forEach((pill) => {
                    pill.addEventListener("click", (e) => {
                        e.stopPropagation();
                        pill.classList.toggle("active");
                    });
                });
                const removeNewCard = () => {
                    if (newCard.parentNode) newCard.remove();
                };
                cancelBtn.addEventListener("click", () => removeNewCard());
                saveBtn.addEventListener("click", async () => {
                    const name = (newCard.querySelector("#new-deal-name")?.value || "").trim();
                    if (!name) {
                        showToast("Deal name is required.", "error");
                        return;
                    }
                    const stageSelEl = newCard.querySelector("#new-deal-stage");
                    const stage = stageSelEl?.tomselect ? stageSelEl.tomselect.getValue() : (stageSelEl?.value || firstStage);
                    const value = parseFloat(newCard.querySelector("#new-deal-value")?.value) || 0;
                    const close_month = newCard.querySelector("#new-deal-close-month")?.value || null;
                    const elementsContainer = newCard.querySelector("#new-deal-elements");
                    const elementsStr = elementsContainer
                        ? Array.from(elementsContainer.querySelectorAll(".element-pill.active")).map((p) => p.dataset.element || "").filter(Boolean).join(", ")
                        : "";
                    globalState = getState();
                    const payload = {
                        user_id: globalState.effectiveUserId,
                        account_id: state.selectedAccountId,
                        name,
                        stage,
                        value,
                        close_month,
                        elements: elementsStr || null,
                        is_committed: false
                    };
                    const { error } = await supabase.from("deals_tw").insert([payload]);
                    if (error) {
                        showToast("Error creating deal: " + error.message, "error");
                        return;
                    }
                    removeNewCard();
                    showToast("Deal created.", "success");
                    await refreshData();
                });
            });
        }

        if (contactListView) {
            contactListView.addEventListener("click", (e) => {
                const targetLink = e.target.closest(".contact-name-link");
                if (targetLink) {
                    e.preventDefault();
                    handleNavigation(targetLink.href);
                }
            });
        }

        if (addTaskAccountBtn) {
            addTaskAccountBtn.addEventListener("click", async () => {
                if (!state.selectedAccountId) return showToast("Please select an account to add a task for.", "error");

                const currentAccount = state.accounts.find(a => a.id === state.selectedAccountId);
                if (!currentAccount) return showToast("Selected account not found.", "error");

                showModal(`Create Task for ${currentAccount.name}`,
                    `<label>Description:</label><input type="text" id="modal-task-description" required><br><label>Due Date:</label><input type="date" id="modal-task-due-date">`,
                    async () => {
                        const description = document.getElementById('modal-task-description')?.value.trim();
                        if (!description) {
                            showToast("Task description is required.", "error");
                            return false;
                        }
                            globalState = getState(); 
                        const newTask = {
                            user_id: globalState.effectiveUserId, 
                            description,
                            due_date: document.getElementById('modal-task-due-date')?.value || null,
                            status: 'Pending',
                            account_id: state.selectedAccountId,
                            contact_id: null
                        };
                        const { error } = await supabase.from('tasks').insert([newTask]);
                        if (error) {
                            showToast('Error adding task: ' + error.message, 'error');
                            return false;
                        }
                        await refreshData();
                        hideModal();
                        showToast("Task created successfully!", "success");
                        return true;
                    }, true, `<button id="modal-confirm-btn" class="btn-primary">Add Task</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            });
        }
        if (aiBriefingBtn) {
            aiBriefingBtn.addEventListener("click", handleGenerateBriefing);
        }
        
        document.body.addEventListener('click', (e) => {
            if (e.target.id === 'print-briefing-btn') {
                handlePrintBriefing();
            }
        });

        if (contactListBtn) {
            contactListBtn.addEventListener('click', () => {
                state.contactViewMode = 'list';
                localStorage.setItem('contact_view_mode', 'list');
                renderContactView();
            });
        }
        if (contactOrgChartBtn) {
            contactOrgChartBtn.addEventListener('click', () => {
                state.contactViewMode = 'org';
                localStorage.setItem('contact_view_mode', 'org');
                renderContactView();
            });
        }
        if (contactOrgChartView) {
            contactOrgChartView.addEventListener('click', (e) => {
                const zoomOut = e.target.closest('#org-chart-zoom-out-btn');
                const zoomIn = e.target.closest('#org-chart-zoom-in-btn');
                const viewport = contactOrgChartView.querySelector('.org-chart-viewport');
                if (!viewport) return;
                if (zoomOut) {
                    const current = parseFloat(viewport.dataset.zoomFactor || '1');
                    fitOrgChartInViewport(viewport, Math.max(0.5, current - 0.25));
                } else if (zoomIn) {
                    const current = parseFloat(viewport.dataset.zoomFactor || '1');
                    fitOrgChartInViewport(viewport, Math.min(2, current + 0.25));
                }
            });
        }
        if (orgChartMaximizeBtn && orgChartModalBackdrop && orgChartModalContent) {
            orgChartMaximizeBtn.addEventListener('click', () => {
                if (!orgChartModalBackdrop || !orgChartModalContent) return;
                orgChartModalBackdrop.classList.remove('hidden');
                renderOrgChart(orgChartModalContent);
                setupOrgChartDragDrop(orgChartModalContent);
                requestAnimationFrame(() => {
                    const modalViewport = orgChartModalContent.querySelector('.org-chart-viewport');
                    if (modalViewport) fitOrgChartInViewport(modalViewport);
                });
            });
        }
        if (orgChartModalCloseBtn && orgChartModalBackdrop) {
            orgChartModalCloseBtn.addEventListener('click', () => orgChartModalBackdrop.classList.add('hidden'));
        }
        if (orgChartModalBackdrop) {
            orgChartModalBackdrop.addEventListener('click', (e) => {
                if (e.target === orgChartModalBackdrop) orgChartModalBackdrop.classList.add('hidden');
            });
        }
    }
    
    async function initializePage() {
        await loadSVGs();
        
        globalState = await initializeAppState(supabase);
        if (!globalState.currentUser) {
            hideGlobalLoader();
            return;
        }

        window.addEventListener('effectiveUserChanged', async () => {
            globalState = getState();
            await refreshData();
        });

        try {
            await loadInitialData();

            const urlParams = new URLSearchParams(window.location.search);
            const accountIdFromUrl = urlParams.get('accountId');
            
            const savedView = localStorage.getItem('contact_view_mode') || 'list';
            state.contactViewMode = savedView;

            if (accountIdFromUrl) {
                state.selectedAccountId = Number(accountIdFromUrl);
                await loadDetailsForSelectedAccount();
                document.getElementById('account-details')?.classList.add('active');
                document.getElementById('account-details-scrim')?.classList.add('visible');
                document.getElementById('account-details-scrim')?.setAttribute('aria-hidden', 'false');
            } else {
                hideAccountDetails(true);
            }
            
            // Nav-dependent setup: run when nav is ready (may run immediately if already loaded)
            runWhenNavReady(async () => {
                await setupUserMenuAndAuth(supabase, globalState);
                await setupGlobalSearch(supabase);
                await checkAndSetNotifications(supabase);
                setupPageEventListeners();
            });

        } catch (error) {
            console.error("Critical error during page initialization:", error);
            showModal(
                "Loading Error",
                "There was a problem loading account data. Please refresh the page to try again.",
                null,
                false,
                `<button id="modal-ok-btn" class="btn-primary">OK</button>`
            );
        } finally {
            hideGlobalLoader();
        }
    }

    /**
     * Global Helper to prevent [object Object] errors.
     * Also handles bullet point formatting for lists.
     */
    function flattenAIResponse(data) {
        if (!data) return "";
        
        if (Array.isArray(data)) {
            data = data.map(item => {
                if (typeof item === 'object' && item !== null) {
                    return item.name ? `${item.name}${item.title ? ` (${item.title})` : ''}` : Object.values(item).join(': ');
                }
                return String(item);
            }).join('\n'); 
        }
        
        if (typeof data === 'object' && data !== null) {
            data = Object.values(data).join(': ');
        }

        let text = String(data);

        if (text.includes('•') || text.includes('\n')) {
            const lines = text.split('\n').filter(line => line.trim() !== '');
            return `<ul class="briefing-bullet-list">
                ${lines.map(line => `<li>${line.replace(/^[•\-\*]\s*/, '')}</li>`).join('')}
            </ul>`;
        }

        return text;
    }

    // Run init immediately so data loads and loader hides without waiting for nav
    initializePage();
});
