// campaigns.js

import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatDate,
    setupModalListeners,
    getCurrentModalCallbacks,
    setCurrentModalCallbacks,
    showModal,
    hideModal,
    updateActiveNavLink,
    setupUserMenuAndAuth,
    initializeAppState,
    getState,
    loadSVGs,
    showGlobalLoader,
    hideGlobalLoader,
    showToast,
    showActionSuccess,
    setupGlobalSearch,
    checkAndSetNotifications,
    runWhenNavReady,
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        campaigns: [],
        contacts: [],
        accounts: [],
        activities: [],
        emailTemplates: [],
        user_quotas: [],
        campaignMembers: [],
        selectedCampaignId: null
    };

    let originalModalContent = {
        title: '',
        body: '',
        actions: '',
        callbacks: {
            onConfirm: null,
            onCancel: null
        }
    };

    let tempCampaignFormState = {
        campaignName: '',
        campaignType: 'Call',
        emailSourceType: 'write',
        templateSelector: '',
        campaignEmailSubject: '',
        campaignEmailBody: '',
        filterIndustry: '',
        filterStatus: ''
    };

    const getInitials = (name) => {
        if (!name || typeof name !== 'string' || name.trim() === '') return '';
        const parts = name.trim().split(' ').filter(p => p);
        if (parts.length === 1) {
            return parts[0].substring(0, 2).toUpperCase();
        }
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    };


    // --- DOM SELECTORS ---
    const activeCampaignList = document.getElementById('campaign-list-active');
    const pastCampaignList = document.getElementById('campaign-list-past');
    const campaignDetailsContent = document.getElementById('campaign-details-content');
    const campaignDetailsFlippable = document.getElementById('campaign-details-flippable');
    const campaignDetailsEmailBack = document.getElementById('campaign-details-email-back');
    const runCampaignBody = document.getElementById('run-campaign-body');
    const rcSummary = document.getElementById('rc-summary');
    const rcLayout = document.getElementById('rc-layout');
    const rcContactCard = document.getElementById('rc-contact-card');
    const rcContactContent = rcContactCard ? rcContactCard.querySelector('.run-campaign-contact-content') : null;
    const rcMiddlePanel = document.getElementById('rc-middle-panel');
    const rcActivitiesList = document.getElementById('rc-activities-list');

    const NULL_CONTACT_HTML = `
        <span class="run-campaign-null-placeholder">Select a campaign</span>
        <small>Create a Call Blitz, Guided Email, or Email Merge campaign to get started.</small>`;

    const NULL_MIDDLE_HTML = `
        <span class="run-campaign-notes-placeholder">Notes</span>
        <textarea disabled placeholder=" " aria-label="Notes (disabled until campaign selected)"></textarea>`;

    const NULL_ACTIVITY_HTML = `<p class="run-campaign-null-activity-text">No contact selected.</p>`;

    const CALL_BLITZ_CONTACT_HTML = `
        <div class="run-campaign-contact-name-row">
            <span id="contact-name-call-blitz"></span>
            <a href="#" id="contact-phone-call-blitz" class="run-campaign-contact-link"></a>
        </div>
        <small id="contact-company-call-blitz"></small>
        <div class="run-campaign-contact-actions">
            <button type="button" id="log-call-btn" class="run-campaign-icon-btn run-campaign-icon-log" title="Log Call & Next"><i class="fas fa-check"></i></button>
            <button type="button" id="skip-call-btn" class="run-campaign-icon-btn run-campaign-icon-skip" title="Skip & Next"><i class="fas fa-forward"></i></button>
        </div>`;

    const CALL_BLITZ_MIDDLE_HTML = `
        <div class="run-campaign-call-notes-form">
            <div class="run-campaign-body-inner run-campaign-body-box rc-blitz-notes">
                <span class="run-campaign-notes-placeholder" id="call-notes-placeholder">Notes</span>
                <textarea id="call-notes" name="x-call-notes" autocomplete="nope"></textarea>
            </div>
        </div>`;

    const GUIDED_EMAIL_CONTACT_HTML = `
        <div class="run-campaign-contact-name-row">
            <span id="contact-name-guided-email"></span>
            <a href="#" id="contact-email-guided-email" class="run-campaign-contact-link"></a>
        </div>
        <small id="contact-company-guided-email"></small>
        <div class="run-campaign-contact-actions">
            <button type="button" id="open-email-client-btn" class="run-campaign-icon-btn run-campaign-icon-log" title="Open in Email Client & Next"><i class="fas fa-envelope"></i></button>
            <button type="button" id="skip-email-btn" class="run-campaign-icon-btn run-campaign-icon-skip" title="Skip & Next"><i class="fas fa-forward"></i></button>
        </div>`;

    const GUIDED_EMAIL_MIDDLE_HTML = `
        <div class="run-campaign-email-form">
            <span id="email-to-address" class="hidden" aria-hidden="true"></span>
            <input type="text" id="email-subject" name="x-email-subject" placeholder="Subject" autocomplete="one-time-code" readonly>
            <div class="run-campaign-body-inner run-campaign-body-box">
                <span class="run-campaign-notes-placeholder" id="email-body-placeholder">Body</span>
                <textarea id="email-body-textarea" name="x-email-body" autocomplete="nope"></textarea>
                <div class="merge-fields-buttons run-campaign-merge-pills">
                    <button type="button" class="btn-secondary" data-field="[FirstName]">First</button>
                    <button type="button" class="btn-secondary" data-field="[LastName]">Last</button>
                    <button type="button" class="btn-secondary" data-field="[AccountName]">Account</button>
                </div>
            </div>
        </div>`;

    const EMAIL_MERGE_SUMMARY_HTML = `
        <div id="email-merge-ui">
            <p id="email-summary-text"></p>
            <div class="action-buttons">
                <button id="export-txt-btn" class="btn-secondary">Download Email Template (.txt)</button>
                <button id="export-csv-btn" class="btn-primary">Download Contacts (.csv)</button>
            </div>
        </div>`;

    const setNullState = () => {
        if (rcContactCard) rcContactCard.classList.add('run-campaign-null-contact');
        if (rcMiddlePanel) rcMiddlePanel.classList.add('rc-null');
        if (rcContactContent) rcContactContent.innerHTML = NULL_CONTACT_HTML;
        if (rcMiddlePanel) rcMiddlePanel.innerHTML = NULL_MIDDLE_HTML;
        if (rcActivitiesList) rcActivitiesList.innerHTML = NULL_ACTIVITY_HTML;
        if (rcSummary) { rcSummary.classList.add('hidden'); rcSummary.innerHTML = ''; }
        if (rcLayout) rcLayout.classList.remove('hidden');
    };

    const clearNullState = () => {
        if (rcContactCard) rcContactCard.classList.remove('run-campaign-null-contact');
        if (rcMiddlePanel) rcMiddlePanel.classList.remove('rc-null');
    };

    let createCampaignConfirmResolve = null;

    let tomSelectCampaignType = null;
    let tomSelectEmailSource = null;
    let tomSelectTemplate = null;
    let tomSelectIndustry = null;

    function initTomSelect(el, opts = {}) {
        if (typeof window.TomSelect === 'undefined') return null;
        try {
            return new window.TomSelect(el, { create: false, ...opts });
        } catch (e) {
            return null;
        }
    }

    function destroyCampaignTomSelects() {
        [tomSelectCampaignType, tomSelectEmailSource, tomSelectTemplate, tomSelectIndustry].forEach(ts => {
            if (ts) { ts.destroy(); }
        });
        tomSelectCampaignType = tomSelectEmailSource = tomSelectTemplate = tomSelectIndustry = null;
    }

    function getCampaignSelectValue(id) {
        const el = document.getElementById(id);
        if (!el) return '';
        const map = {
            'campaign-type': tomSelectCampaignType,
            'email-source-type': tomSelectEmailSource,
            'template-selector': tomSelectTemplate,
            'filter-industry': tomSelectIndustry
        };
        const ts = map[id];
        if (ts) {
            const v = ts.getValue();
            return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
        }
        return el.value ?? '';
    }

    function getFilterStatus() {
        const customerActive = document.querySelector('.customer-filter-customer.active');
        const prospectActive = document.querySelector('.customer-filter-prospect.active');
        if (customerActive && prospectActive) return ''; // both on = All
        if (customerActive) return 'customer';
        if (prospectActive) return 'prospect';
        return '__none__'; // neither on = show none
    }

    function getFilterStarredOnly() {
        const btn = document.getElementById('filter-starred-btn');
        return btn ? btn.classList.contains('is-organic') : false;
    }

    function initCampaignTomSelects() {
        const campaignTypeEl = document.getElementById('campaign-type');
        const emailSourceEl = document.getElementById('email-source-type');
        const templateEl = document.getElementById('template-selector');
        const industryEl = document.getElementById('filter-industry');
        if (campaignTypeEl && !campaignTypeEl.tomselect) tomSelectCampaignType = initTomSelect(campaignTypeEl);
        if (emailSourceEl && !emailSourceEl.tomselect) {
            tomSelectEmailSource = initTomSelect(emailSourceEl);
            setTimeout(() => {
                const input = emailSourceEl.closest('.ts-wrapper')?.querySelector('input');
                if (input) {
                    input.setAttribute('autocomplete', 'one-time-code');
                }
            }, 0);
        }
        if (templateEl && !templateEl.tomselect) tomSelectTemplate = initTomSelect(templateEl);
        if (industryEl && !industryEl.tomselect) tomSelectIndustry = initTomSelect(industryEl);
    }

    // --- RENDER FUNCTIONS ---
    const renderCampaignList = () => {
        if (!activeCampaignList || !pastCampaignList) {
            console.error("Campaign list elements not found.");
            return;
        }

        activeCampaignList.innerHTML = "";
        pastCampaignList.innerHTML = "";
        const activeCampaigns = [];
        const pastCampaigns = [];
        state.campaigns.forEach(campaign => {
            (campaign.completed_at ? pastCampaigns : activeCampaigns).push(campaign);
        });

        if (activeCampaigns.length === 0) {
            activeCampaignList.innerHTML = `<div class="list-item-placeholder">No active campaigns.</div>`;
        } else {
            activeCampaigns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach(c => renderCampaignListItem(c, activeCampaignList));
        }

        if (pastCampaigns.length === 0) {
            pastCampaignList.innerHTML = `<div class="list-item-placeholder">No past campaigns.</div>`;
        } else {
            pastCampaigns.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)).forEach(c => renderCampaignListItem(c, pastCampaignList));
        }
    };

    const renderCampaignListItem = (campaign, listElement) => {
        const item = document.createElement("div");
        item.className = "list-item";
        item.dataset.id = campaign.id;
        if (campaign.id === state.selectedCampaignId) item.classList.add("selected");

        item.innerHTML = `
            <div>
                <div>${campaign.name}</div>
                <small>${campaign.type} Campaign</small>
            </div>
        `;
        listElement.appendChild(item);
    };

    let activeRunMode = null; // 'call' | 'guided-email' | 'email-merge' | null

    const updateCampaignActiveRow = () => {
        const panel = document.getElementById('campaign-details');
        if (!panel) return;
        const campaign = state.campaigns.find(c => c.id === state.selectedCampaignId);
        const runActive = campaign && !campaign.completed_at && activeRunMode !== null;
        panel.classList.toggle('campaign-run-active', runActive);
        panel.classList.toggle('campaign-top-active', !runActive);
    };

    const renderCampaignDetails = async () => {
        if (campaignDetailsContent) campaignDetailsContent.classList.add('hidden');

        const campaign = state.campaigns.find(c => c.id === state.selectedCampaignId);

        if (!campaign) {
            if (campaignDetailsContent) {
                campaignDetailsContent.innerHTML = `<p class="campaign-details-null-text">Select a campaign to view details.</p>`;
                campaignDetailsContent.classList.remove('hidden');
            }
            activeRunMode = null;
            setNullState();
            updateCampaignActiveRow();
            return;
        }

        if (campaignDetailsContent) campaignDetailsContent.classList.remove('hidden');

        await loadCampaignMembers(campaign.id);

        if (campaign.completed_at) {
            renderCompletedCampaignSummary(campaign);
        } else {
            renderActiveCampaignDetails(campaign);
        }
        updateCampaignActiveRow();
    };

    const resetCampaignDetailsFlip = () => {
        if (campaignDetailsFlippable) {
            campaignDetailsFlippable.classList.remove('campaign-details-flipped');
        }
        if (campaignDetailsEmailBack) {
            campaignDetailsEmailBack.innerHTML = '';
        }
    };

    const renderActiveCampaignDetails = (campaign) => {
        resetCampaignDetailsFlip();
        const members = state.campaignMembers.map(member => state.contacts.find(c => c.id === member.contact_id)).filter(Boolean);
        const memberListHtml = members.length > 0 ? members.map(c => {
            const accountName = state.accounts.find(a => a.id === c.account_id)?.name || 'No Account';
            return `<li>${c.first_name} ${c.last_name} <span class="text-medium">(${accountName})</span></li>`;
        }).join('') : '<li>No contacts in this campaign.</li>';

        const hasStarted = state.campaignMembers.some(m => m.status !== 'Pending');
        const statusLabel = 'Active';
        const statusSlug = hasStarted ? 'active' : 'not-started';
        const typeIcon = campaign.type === 'Call' ? 'fa-phone' : campaign.type === 'Guided Email' ? 'fa-paper-plane' : 'fa-envelope';

        let emailCtaHtml = '';
        if (campaign.type === 'Email' || campaign.type === 'Guided Email') {
            emailCtaHtml = `
                <button type="button" id="show-email-details-btn" class="campaign-email-cta">
                    <i class="fas fa-envelope"></i>
                    <span>View email</span>
                </button>
            `;
            if (campaignDetailsEmailBack) {
                const subj = (campaign.email_subject || '(Not set)').replace(/</g, '&lt;');
                const body = (campaign.email_body || '(Not set)').replace(/</g, '&lt;').replace(/&/g, '&amp;');
                campaignDetailsEmailBack.innerHTML = `
                    <p class="campaign-email-back-subject"><strong>Subject:</strong> ${subj}</p>
                    <pre class="email-body-summary">${body}</pre>
                `;
            }
        }

        if (campaignDetailsContent) {
            campaignDetailsContent.innerHTML = `
                <div class="campaign-details-header-row">
                    <span class="campaign-details-type-icon"><i class="fas ${typeIcon}"></i></span>
                    <h3 class="campaign-details-name">${campaign.name}</h3>
                    <span class="campaign-details-status-pill campaign-details-status-${statusSlug}">${statusLabel}</span>
                    <button type="button" id="delete-campaign-details-btn" class="btn-danger btn-icon-header campaign-details-delete-btn" title="Delete campaign"><i class="fas fa-trash"></i></button>
                </div>
                <div class="campaign-details-contacts-wrap">
                    <ul class="summary-contact-list">${memberListHtml}</ul>
                </div>
                ${emailCtaHtml}
            `;
            campaignDetailsContent.classList.remove('hidden');
        }

        if (campaign.type === 'Call') {
            renderCallBlitzUI();
        } else if (campaign.type === 'Email') {
            renderEmailMergeUI();
        } else if (campaign.type === 'Guided Email') {
            renderGuidedEmailUI();
        }
    };

    const renderCompletedCampaignSummary = (campaign) => {
        resetCampaignDetailsFlip();
        const completedMembers = state.campaignMembers.filter(m => m.status === 'Completed');
        const skippedMembers = state.campaignMembers.filter(m => m.status === 'Skipped');
        let memberHtml = (members, status) => {
            if (members.length === 0) return `<li>No contacts were ${status.toLowerCase()}.</li>`;
            return members.map(member => {
                const contact = state.contacts.find(c => c.id === member.contact_id);
                return `<li>${contact ? `${contact.first_name} ${contact.last_name}` : 'Unknown Contact'}</li>`;
            }).join('');
        };
        const typeIcon = campaign.type === 'Call' ? 'fa-phone' : campaign.type === 'Guided Email' ? 'fa-paper-plane' : 'fa-envelope';
        let emailCtaHtml = '';
        if (campaign.email_body || campaign.email_subject) {
            emailCtaHtml = `
                <button type="button" id="show-email-details-btn" class="campaign-email-cta">
                    <i class="fas fa-envelope"></i>
                    <span>View email used</span>
                </button>
            `;
            if (campaignDetailsEmailBack) {
                const subj = (campaign.email_subject || '(Not set)').replace(/</g, '&lt;');
                const body = (campaign.email_body || '').replace(/</g, '&lt;').replace(/&/g, '&amp;');
                campaignDetailsEmailBack.innerHTML = `
                    <p class="campaign-email-back-subject"><strong>Subject:</strong> ${subj}</p>
                    <pre class="email-body-summary">${body || '(Not set)'}</pre>
                `;
            }
        }
        activeRunMode = null;
        setNullState();
        if (campaignDetailsContent) {
            campaignDetailsContent.innerHTML = `
                <div class="campaign-details-header-row">
                    <span class="campaign-details-type-icon"><i class="fas ${typeIcon}"></i></span>
                    <h3 class="campaign-details-name">${campaign.name}</h3>
                    <span class="campaign-details-status-pill campaign-details-status-completed">Completed</span>
                </div>
                <p class="campaign-details-meta"><strong>Completed On:</strong> ${formatDate(campaign.completed_at)}</p>
                <hr>
                <h4>Contacts Engaged (${completedMembers.length})</h4>
                <div class="campaign-details-contacts-wrap">
                    <ul class="summary-contact-list">${memberHtml(completedMembers, 'Engaged')}</ul>
                </div>
                <hr>
                <h4>Contacts Skipped (${skippedMembers.length})</h4>
                <div class="campaign-details-contacts-wrap">
                    <ul class="summary-contact-list">${memberHtml(skippedMembers, 'Skipped')}</ul>
                </div>
                ${emailCtaHtml}`;
            campaignDetailsContent.classList.remove('hidden');
        }
    };

    const renderCallBlitzUI = () => {
        if (!rcMiddlePanel) return;
        activeRunMode = 'call';
        clearNullState();

        const pendingCalls = state.campaignMembers.filter(m => m.status === 'Pending');
        if (pendingCalls.length > 0) {
            if (rcSummary) { rcSummary.classList.add('hidden'); rcSummary.innerHTML = ''; }
            if (rcLayout) rcLayout.classList.remove('hidden');
            rcContactContent.innerHTML = CALL_BLITZ_CONTACT_HTML;
            rcMiddlePanel.innerHTML = CALL_BLITZ_MIDDLE_HTML;
            rcActivitiesList.innerHTML = '';
            displayCurrentCall();
        } else {
            if (rcSummary) {
                rcSummary.innerHTML = `<p>All calls for this campaign are complete!</p>`;
                rcSummary.classList.remove('hidden');
            }
            if (rcLayout) rcLayout.classList.add('hidden');
        }
    };

    const renderEmailMergeUI = () => {
        if (!rcSummary) return;
        activeRunMode = 'email-merge';
        clearNullState();
        rcSummary.innerHTML = EMAIL_MERGE_SUMMARY_HTML;
        rcSummary.classList.remove('hidden');
        if (rcLayout) rcLayout.classList.add('hidden');
        const summaryText = document.getElementById('email-summary-text');
        if (summaryText) {
            summaryText.textContent = `This campaign includes ${state.campaignMembers.length} contact(s).`;
        }
    };

    const renderGuidedEmailUI = () => {
        if (!rcMiddlePanel) return;
        activeRunMode = 'guided-email';
        clearNullState();

        const pendingEmails = state.campaignMembers.filter(m => m.status === 'Pending');
        if (pendingEmails.length > 0) {
            if (rcSummary) { rcSummary.classList.add('hidden'); rcSummary.innerHTML = ''; }
            if (rcLayout) rcLayout.classList.remove('hidden');
            rcContactContent.innerHTML = GUIDED_EMAIL_CONTACT_HTML;
            rcMiddlePanel.innerHTML = GUIDED_EMAIL_MIDDLE_HTML;
            rcActivitiesList.innerHTML = '';
            displayCurrentEmail();
        } else {
            if (rcSummary) {
                rcSummary.innerHTML = `<p>All guided emails for this campaign are complete!</p>`;
                rcSummary.classList.remove('hidden');
            }
            if (rcLayout) rcLayout.classList.add('hidden');
        }
    };

    const checkForCampaignCompletion = async (campaignId) => {
        const {
            count,
            error
        } = await supabase.from('campaign_members').select('id', {
            count: 'exact',
            head: true
        }).eq('campaign_id', campaignId).eq('status', 'Pending');
        if (error) {
            console.error("Error checking for campaign completion:", error);
            return;
        }
        if (count === 0) {
            const {
                error: updateError
            } = await supabase.from('campaigns').update({
                completed_at: new Date().toISOString()
            }).eq('id', campaignId);
            if (updateError) console.error("Error marking campaign as complete:", updateError);
            const campaignInState = state.campaigns.find(c => c.id === campaignId);
            if (campaignInState) campaignInState.completed_at = new Date().toISOString();
            renderCampaignList();
        }
    };

    const startCallBlitz = () => {
        if (rcSummary) { rcSummary.classList.add('hidden'); rcSummary.innerHTML = ''; }
        if (rcLayout) rcLayout.classList.remove('hidden');
        if (rcContactContent) rcContactContent.innerHTML = CALL_BLITZ_CONTACT_HTML;
        if (rcMiddlePanel) rcMiddlePanel.innerHTML = CALL_BLITZ_MIDDLE_HTML;
        if (rcActivitiesList) rcActivitiesList.innerHTML = '';
        displayCurrentCall();
    };

    const updateNotesPlaceholder = (textareaId, placeholderId) => {
        const textarea = document.getElementById(textareaId);
        const placeholder = document.getElementById(placeholderId);
        if (!textarea || !placeholder) return;
        placeholder.classList.toggle('hidden', textarea.value.trim() !== '');
    };

    const fitContactLink = (el) => {
        if (!el) return;
        el.style.fontSize = '';
        const len = (el.textContent || '').length;
        if (len > 28) el.style.fontSize = '0.65rem';
        else if (len > 22) el.style.fontSize = '0.7rem';
        else if (len > 16) el.style.fontSize = '0.75rem';
    };

    const populateRunCampaignRecentActivity = (contactId, listElementId) => {
        const listEl = document.getElementById(listElementId);
        if (!listEl) return;
        listEl.innerHTML = '';
        const activities = (state.activities || [])
            .filter((act) => act.contact_id === contactId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        if (activities.length === 0) {
            listEl.innerHTML = '<p class="recent-activities-empty text-sm text-[var(--text-medium)] px-2 py-4">No activities yet.</p>';
        } else {
            activities.forEach((act) => {
                const typeLower = (act.type || '').toLowerCase();
                let iconClass = 'icon-default', icon = 'fa-circle-info', iconPrefix;
                if (typeLower.includes('cognito') || typeLower.includes('intelligence')) { icon = 'fa-magnifying-glass'; }
                else if (typeLower.includes('email')) { iconClass = 'icon-email'; icon = 'fa-envelope'; }
                else if (typeLower.includes('call')) { iconClass = 'icon-call'; icon = 'fa-phone'; }
                else if (typeLower.includes('meeting')) { iconClass = 'icon-meeting'; icon = 'fa-video'; }
                else if (typeLower.includes('linkedin')) { iconClass = 'icon-linkedin'; icon = 'fa-linkedin-in'; iconPrefix = 'fa-brands'; }
                const item = document.createElement('div');
                item.className = 'recent-activity-item';
                item.innerHTML = `
                    <div class="activity-icon-wrap ${iconClass}"><i class="${iconPrefix || 'fas'} ${icon}"></i></div>
                    <div class="activity-body">
                        <div class="activity-description">${act.type}: ${(act.description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                        <div class="activity-date">${formatDate(act.date)}</div>
                    </div>
                `;
                listEl.appendChild(item);
            });
        }
    };

    const displayCurrentCall = () => {
        const pendingCalls = state.campaignMembers.filter(m => m.status === 'Pending');
        const contactNameEl = document.getElementById('contact-name-call-blitz');
        const contactCompanyEl = document.getElementById('contact-company-call-blitz');
        const phoneLinkEl = document.getElementById('contact-phone-call-blitz');
        const callNotesEl = document.getElementById('call-notes');

        if (!contactNameEl || !contactCompanyEl || !phoneLinkEl || !callNotesEl) {
            console.error("Missing call blitz contact info elements.");
            return;
        }

        // CORRECTED LOGIC: Check if there are any pending calls left.
        if (pendingCalls.length === 0) {
            renderCampaignDetails();
            showModal("Call Blitz Complete", "All calls for this campaign have been logged or skipped!", () => {
                hideModal();
                loadAllData();
            }, true, '<button class="btn-primary" id="modal-ok-btn">OK</button>');
            return;
        }

        const currentMember = pendingCalls[0]; // Always take the first one
        const contact = state.contacts.find(c => c.id === currentMember.contact_id);
        const account = contact ? state.accounts.find(a => a.id === contact.account_id) : null;

        if (!contact) {
            console.error("Contact not found for campaign member:", currentMember);
            handleSkipCall(); // Skip this broken member
            return;
        }

        // Set a data attribute on the action buttons to identify the current member
        document.getElementById('log-call-btn').dataset.memberId = currentMember.id;
        document.getElementById('skip-call-btn').dataset.memberId = currentMember.id;

        contactNameEl.textContent = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';
        contactCompanyEl.textContent = account ? account.name : 'No Company';
        phoneLinkEl.href = contact.phone ? `tel:${contact.phone}` : '#';
        phoneLinkEl.textContent = contact.phone || 'No Phone';
        if (contact.phone) phoneLinkEl.removeAttribute('tabindex');
        else phoneLinkEl.setAttribute('tabindex', '-1');
        callNotesEl.value = '';
        updateNotesPlaceholder('call-notes', 'call-notes-placeholder');
        populateRunCampaignRecentActivity(contact.id, 'rc-activities-list');
        callNotesEl.focus();
    };

    const handleLogCall = async (event) => {
        const notesEl = document.getElementById('call-notes');
        const notes = notesEl ? notesEl.value.trim() : '';
        if (!notes) {
            showToast('Please enter call notes before logging.', 'error');
            return;
        }
        
        // CORRECTED: Get memberId from the button that was clicked
        const memberId = Number(event.target.dataset.memberId);
        const currentMember = state.campaignMembers.find(m => m.id === memberId);

        if (!currentMember) {
            console.error("No current campaign member to log call for.");
            return;
        }

        const contact = state.contacts.find(c => c.id === currentMember.contact_id);
        const campaign = state.campaigns.find(c => c.id === currentMember.campaign_id);

        if (!contact || !campaign) {
            console.error("Associated contact or campaign not found for logging activity.");
            return;
        }

        const {
            error: activityError
        } = await supabase.from('activities').insert({
            contact_id: contact.id,
            account_id: contact.account_id,
            type: 'Call',
            description: `Campaign Call: "${campaign.name}". Notes: ${notes}`,
            user_id: getState().effectiveUserId,
            date: new Date().toISOString()
        });
        if (activityError) {
            console.error("Error logging activity:", activityError);
            showToast("Failed to log call activity. Please try again.", 'error');
            return;
        }

        const {
            error: memberUpdateError
        } = await supabase.from('campaign_members').update({
            status: 'Completed',
            notes: notes,
            completed_at: new Date().toISOString()
        }).eq('id', currentMember.id);
        if (memberUpdateError) {
            console.error("Error updating campaign member status:", memberUpdateError);
            showToast("Failed to update campaign member status. Please try again.", 'error');
            return;
        }

        currentMember.status = 'Completed'; // Update local state immediately
        state.activities.push({ contact_id: contact.id, account_id: contact.account_id, type: 'Call', description: `Campaign Call: "${campaign.name}". Notes: ${notes}`, user_id: getState().effectiveUserId, date: new Date().toISOString() });
        displayCurrentCall(); // Refresh UI for next call
        await checkForCampaignCompletion(currentMember.campaign_id);
    };

    const handleSkipCall = async (event) => {
        // CORRECTED: Get memberId from the button that was clicked
        const memberId = Number(event.target.dataset.memberId);
        const currentMember = state.campaignMembers.find(m => m.id === memberId);
        if (!currentMember) {
            console.error("No current campaign member to skip call for.");
            return;
        }

        const {
            error: memberUpdateError
        } = await supabase.from('campaign_members').update({
            status: 'Skipped',
            completed_at: new Date().toISOString()
        }).eq('id', currentMember.id);
        if (memberUpdateError) {
            console.error("Error updating campaign member status (skip):", memberUpdateError);
            showToast("Failed to skip call. Please try again.", 'error');
            return;
        }

        currentMember.status = 'Skipped'; // Update local state immediately
        displayCurrentCall(); // Refresh UI for next call
        await checkForCampaignCompletion(currentMember.campaign_id);
    };

    const startGuidedEmail = () => {
        if (rcSummary) { rcSummary.classList.add('hidden'); rcSummary.innerHTML = ''; }
        if (rcLayout) rcLayout.classList.remove('hidden');
        if (rcContactContent) rcContactContent.innerHTML = GUIDED_EMAIL_CONTACT_HTML;
        if (rcMiddlePanel) rcMiddlePanel.innerHTML = GUIDED_EMAIL_MIDDLE_HTML;
        if (rcActivitiesList) rcActivitiesList.innerHTML = '';
        displayCurrentEmail();
    };

    const displayCurrentEmail = () => {
        const pending = state.campaignMembers.filter(m => m.status === 'Pending');
        const emailToAddressEl = document.getElementById('email-to-address');
        const emailSubjectEl = document.getElementById('email-subject');
        const emailBodyTextareaEl = document.getElementById('email-body-textarea');

        if (!emailToAddressEl || !emailSubjectEl || !emailBodyTextareaEl) {
            console.error("Missing guided email elements.");
            return;
        }

        // CORRECTED LOGIC: Check if any pending emails are left.
        if (pending.length === 0) {
            renderCampaignDetails();
            showModal("Guided Email Complete", "All guided emails for this campaign have been processed!", () => {
                hideModal();
                loadAllData();
            }, true, '<button class="btn-primary" id="modal-ok-btn">OK</button>');
            return;
        }

        const currentMember = pending[0]; // Always take the first pending one
        const contact = state.contacts.find(c => c.id === currentMember.contact_id);
        const account = contact ? state.accounts.find(a => a.id === contact.account_id) : null;
        const campaign = state.campaigns.find(c => c.id === currentMember.campaign_id);

        if (!contact || !campaign) {
            console.error("Associated contact or campaign not found for guided email.");
            handleSkipEmail(); // Skip this broken member
            return;
        }
        
        // Set a data attribute on the action buttons to identify the current member
        document.getElementById('open-email-client-btn').dataset.memberId = currentMember.id;
        document.getElementById('skip-email-btn').dataset.memberId = currentMember.id;


        let emailBody = (campaign.email_body || '').trim();
        emailBody = emailBody.replace(/\[FirstName\]/g, contact.first_name || '');
        emailBody = emailBody.replace(/\[LastName\]/g, contact.last_name || '');
        emailBody = emailBody.replace(/\[AccountName\]/g, account ? account.name : '');

        const contactNameGuided = document.getElementById('contact-name-guided-email');
        const contactEmailGuided = document.getElementById('contact-email-guided-email');
        const contactCompanyGuided = document.getElementById('contact-company-guided-email');
        if (contactNameGuided) contactNameGuided.textContent = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';
        if (contactCompanyGuided) contactCompanyGuided.textContent = account ? account.name : 'No Company';
        if (contactEmailGuided) {
            contactEmailGuided.href = contact.email ? `mailto:${contact.email}` : '#';
            contactEmailGuided.textContent = contact.email || 'No Email';
            fitContactLink(contactEmailGuided);
        }
        emailToAddressEl.textContent = contact.email || 'No Email';
        emailSubjectEl.value = campaign.email_subject || '';
        emailBodyTextareaEl.value = emailBody;
        updateNotesPlaceholder('email-body-textarea', 'email-body-placeholder');
        populateRunCampaignRecentActivity(contact.id, 'rc-activities-list');
        emailBodyTextareaEl.focus();
    };

    const handleOpenEmailClient = async (event) => {
        const to = document.getElementById('email-to-address')?.textContent;
        const subject = document.getElementById('email-subject')?.value;
        const body = document.getElementById('email-body-textarea')?.value;

        if (!to || to === 'No Email') {
            showToast("Cannot open email client: Contact has no email address.", 'error');
            return;
        }

        const mailtoLink = `mailto:${to}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
        window.location.href = mailtoLink;

        // CORRECTED: Get memberId from the button that was clicked
        const memberId = Number(event.target.dataset.memberId);
        const currentMember = state.campaignMembers.find(m => m.id === memberId);
        if (!currentMember) {
            console.error("No current campaign member for email client action.");
            return;
        }

        const contact = state.contacts.find(c => c.id === currentMember.contact_id);
        const campaign = state.campaigns.find(c => c.id === currentMember.campaign_id);

        if (!contact || !campaign) {
            console.error("Associated contact or campaign not found for email activity logging.");
            return;
        }

        const {
            error: activityError
        } = await supabase.from('activities').insert({
            contact_id: currentMember.contact_id,
            account_id: contact.account_id,
            type: 'Email',
            description: `Sent guided email for campaign: "${campaign.name}". Subject: ${subject || '(No Subject)'}`,
            user_id: getState().effectiveUserId,
            date: new Date().toISOString()
        });
        if (activityError) console.error("Error logging guided email activity:", activityError);

        const {
            error: memberUpdateError
        } = await supabase.from('campaign_members').update({
            status: 'Completed',
            notes: `Email opened in client. Subject: ${subject || '(No Subject)'}`,
            completed_at: new Date().toISOString()
        }).eq('id', currentMember.id);
        if (memberUpdateError) console.error("Error updating campaign member status (email):", memberUpdateError);

        currentMember.status = 'Completed'; // Update local state immediately
        const newAct = { contact_id: currentMember.contact_id, account_id: contact.account_id, type: 'Email', description: `Sent guided email for campaign: "${campaign.name}". Subject: ${subject || '(No Subject)'}`, user_id: getState().effectiveUserId, date: new Date().toISOString() };
        state.activities.push(newAct);

        // Delay to allow the mail client to open before processing the next item
        setTimeout(async () => {
            displayCurrentEmail();
            await checkForCampaignCompletion(currentMember.campaign_id);
        }, 500);
    };

    const handleSkipEmail = async (event) => {
        // CORRECTED: Get memberId from the button that was clicked
        const memberId = Number(event.target.dataset.memberId);
        const currentMember = state.campaignMembers.find(m => m.id === memberId);
        if (!currentMember) {
            console.error("No current campaign member to skip email for.");
            return;
        }

        const {
            error: memberUpdateError
        } = await supabase.from('campaign_members').update({
            status: 'Skipped',
            completed_at: new Date().toISOString()
        }).eq('id', currentMember.id);
        if (memberUpdateError) {
            console.error("Error updating campaign member status (skip email):", memberUpdateError);
            showToast("Failed to skip email. Please try again.", 'error');
            return;
        }

        currentMember.status = 'Skipped'; // Update local state immediately
        displayCurrentEmail(); // Refresh UI for next email
        await checkForCampaignCompletion(currentMember.campaign_id);
    };

    // REMOVED: captureFormState and restoreFormState functions are no longer needed
    // REMOVED: handleShowAllContactsClick function is no longer needed

    async function createCampaignAndMembers() {
        const name = document.getElementById('campaign-name')?.value.trim();
        const type = getCampaignSelectValue('campaign-type');
        const industry = getCampaignSelectValue('filter-industry');
        const status = getFilterStatus();
        const starredOnly = getFilterStarredOnly();
        let email_subject = '';
        let email_body = '';

        if (!name) {
            showToast('Campaign name is required.', 'error');
            return false;
        }

            if (type === 'Email' || type === 'Guided Email') {
                const emailSource = getCampaignSelectValue('email-source-type');
                if (emailSource === 'template') {
                    const templateId = Number(getCampaignSelectValue('template-selector'));
                const selectedTemplate = state.emailTemplates.find(t => t.id === templateId);
                if (selectedTemplate) {
                    email_subject = selectedTemplate.subject;
                    email_body = selectedTemplate.body;
                } else {
                    showToast("Please select a valid template.", 'error');
                    return false;
                }
            } else {
                email_subject = document.getElementById('campaign-email-subject')?.value.trim();
                email_body = document.getElementById('campaign-email-body')?.value;
            }
        }

        const accountIdsByIndustry = industry ? new Set(state.accounts.filter(a => a.industry === industry).map(a => a.id)) : null;
        const matchingContacts = state.contacts.filter(contact => {
            if (!contact.account_id) return false;
            const account = state.accounts.find(a => a.id === contact.account_id);
            if (!account) return false;
            const industryMatch = !accountIdsByIndustry || accountIdsByIndustry.has(account.id);
            const statusMatch = !status || (status === 'customer' && account.is_customer) || (status === 'prospect' && !account.is_customer);
            const starredMatch = !starredOnly || contact.is_organic === true;
            return industryMatch && statusMatch && starredMatch;
        });

        if (matchingContacts.length === 0) {
            showToast('No contacts match the selected filters. Please adjust filters or add contacts/accounts.', 'error');
            return false;
        }

        const confirmEl = document.getElementById('create-campaign-confirm');
        const confirmMsg = document.getElementById('create-campaign-confirm-message');
        if (confirmMsg) confirmMsg.textContent = `This campaign will include ${matchingContacts.length} contacts. Proceed?`;
        if (confirmEl) confirmEl.classList.remove('hidden');
        const confirmProceed = await new Promise(resolve => {
            createCampaignConfirmResolve = resolve;
        });
        if (confirmEl) confirmEl.classList.add('hidden');
        createCampaignConfirmResolve = null;
        if (!confirmProceed) return false;

        const filter_criteria = { industry, status, starred_only: starredOnly };
        const { data: newCampaign, error: campaignError } = await supabase.from('campaigns').insert({
            name, type, filter_criteria, email_subject, email_body, user_id: getState().effectiveUserId
        }).select().single();
        if (campaignError) {
            showToast('Error saving campaign: ' + campaignError.message, 'error');
            return false;
        }

        const membersToInsert = matchingContacts.map(c => ({
            campaign_id: newCampaign.id,
            contact_id: c.id,
            user_id: getState().effectiveUserId,
            status: 'Pending'
        }));
        const { error: membersError } = await supabase.from('campaign_members').insert(membersToInsert);
        if (membersError) {
            showToast('Error saving campaign members: ' + membersError.message, 'error');
            await supabase.from('campaigns').delete().eq('id', newCampaign.id);
            return false;
        }

        showActionSuccess(`Campaign "${name}" created successfully`, `${matchingContacts.length} members`);
        state.selectedCampaignId = newCampaign.id;
        await loadAllData();
        return true;
    }

    function renderCreateCampaignForm() {
        const container = document.getElementById('new-campaign-form-container');
        if (!container) return;
        destroyCampaignTomSelects();

        const visibleTemplates = state.emailTemplates.filter(t =>
            !t.is_cloned || t.user_id === getState().effectiveUserId
        );
        const myTemplates = visibleTemplates.filter(t => t.user_id === getState().effectiveUserId).sort((a, b) => a.name.localeCompare(b.name));
        const sharedTemplates = visibleTemplates.filter(t => t.user_id !== getState().effectiveUserId).sort((a, b) => a.name.localeCompare(b.name));

        let myTemplatesOptions = myTemplates.length > 0
            ? `<optgroup label="My Templates">${myTemplates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</optgroup>`
            : '';
        let sharedTemplatesOptions = '';
        if (sharedTemplates.length > 0) {
            const sharedOptionsHtml = sharedTemplates.map(t => {
                const creator = state.user_quotas.find(p => p && p.user_id === t.user_id);
                const creatorName = creator ? creator.full_name : '';
                const initials = getInitials(creatorName);
                return `<option value="${t.id}">${t.name} ${initials ? `(${initials})` : ''}</option>`;
            }).join('');
            sharedTemplatesOptions = `<optgroup label="Shared Templates">${sharedOptionsHtml}</optgroup>`;
        }
        const templateOptions = myTemplatesOptions + sharedTemplatesOptions;
        const uniqueIndustries = [...new Set(state.accounts.map(a => a.industry).filter(Boolean))].sort();
        const industryOptions = uniqueIndustries.map(i => `<option value="${i}">${i}</option>`).join('');

        const formHtml = `
            <div id="new-campaign-form">
                <div class="campaign-form-name-row">
                    <label for="campaign-name">Campaign Name:</label>
                    <input type="text" id="campaign-name" required placeholder="e.g., Q3 Tech Customer Outreach">
                </div>
                <div class="campaign-form-columns">
                    <div class="campaign-form-col campaign-form-col-type">
                        <label for="campaign-type">Campaign Type:</label>
                        <select id="campaign-type"><option value="Call">Call Blitz</option><option value="Email">Email Merge</option><option value="Guided Email">Guided Email</option></select>
                        <div id="email-section-container" class="hidden">
                            <label for="email-source-type">Email Source:</label>
                            <select id="email-source-type" autocomplete="one-time-code"><option value="write">Write New Email</option><option value="template">Use a Template</option></select>
                            <div id="template-select-container" class="hidden">
                                <label for="template-selector">Select Template:</label>
                                <select id="template-selector"><option value="">--Select--</option>${templateOptions}</select>
                            </div>
                            <div id="email-write-container">
                                <input type="text" id="campaign-email-subject" name="x-campaign-subject" placeholder="Subject" autocomplete="one-time-code">
                                <div class="create-campaign-body-inner create-campaign-body-box">
                                    <span class="create-campaign-body-placeholder" id="campaign-email-body-placeholder">Body</span>
                                    <textarea id="campaign-email-body" rows="8" name="x-campaign-body" autocomplete="nope"></textarea>
                                    <div class="merge-fields-buttons" id="create-campaign-merge-pills">
                                        <button type="button" class="btn-secondary" data-field="[FirstName]">First</button>
                                        <button type="button" class="btn-secondary" data-field="[LastName]">Last</button>
                                        <button type="button" class="btn-secondary" data-field="[AccountName]">Account</button>
                                    </div>
                                </div>
                            </div>
                            <div id="template-email-preview" class="hidden">
                                <p><strong>Subject:</strong> <span id="preview-template-subject"></span></p>
                                <pre id="preview-template-body" class="email-body-summary"></pre>
                            </div>
                        </div>
                        <div class="create-campaign-actions">
                            <button type="button" id="create-campaign-submit-btn" class="btn-primary btn-icon-header" title="Create Campaign"><i class="fas fa-plus"></i></button>
                        </div>
                    </div>
                    <div class="campaign-form-col campaign-form-col-filters">
                        <label for="filter-industry">Account Industry</label>
                        <select id="filter-industry"><option value="">All</option>${industryOptions}</select>
                        <label>Customer / Prospect</label>
                        <div class="customer-status-icon-row">
                            <button type="button" class="customer-filter-btn customer-filter-customer" data-role="customer" title="Customers">
                                <i class="fas fa-user-check"></i>
                            </button>
                            <button type="button" class="customer-filter-btn customer-filter-prospect" data-role="prospect" title="Prospects">
                                <i class="fas fa-user"></i>
                            </button>
                            <button type="button" id="filter-starred-btn" class="organic-star campaign-filter-star" title="Show only starred contacts">★</button>
                        </div>
                        <div id="contact-preview-container" class="contact-preview-container"></div>
                    </div>
                </div>
            </div>`;
        container.innerHTML = formHtml;
        setupCampaignFormListeners();
        initCampaignTomSelects();
    }

    function handleNewCampaignClick() {
        renderCreateCampaignForm();
        const flippable = document.getElementById('campaign-tools-flippable');
        const card = document.getElementById('campaign-tools-card');
        if (flippable) flippable.classList.remove('campaign-tools-flipped');
        if (document.getElementById('campaign-tools-title')) document.getElementById('campaign-tools-title').textContent = 'Create New Campaign';
        const flipBtn = document.getElementById('campaign-tools-flip-btn');
        const flipIcon = document.getElementById('campaign-tools-flip-icon');
        if (flipBtn) { flipBtn.title = 'Manage Templates'; flipBtn.setAttribute('aria-label', 'Manage Templates'); }
        if (flipIcon) flipIcon.className = 'fas fa-file-lines';
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function setupCampaignFormListeners() {
        const submitBtn = document.getElementById('create-campaign-submit-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', async () => {
                const ok = await createCampaignAndMembers();
                if (ok) renderCreateCampaignForm();
            });
        }

        const campaignTypeSelect = document.getElementById('campaign-type');
        const emailSectionContainer = document.getElementById('email-section-container');
        const emailSourceSelect = document.getElementById('email-source-type');
        const templateSelectContainer = document.getElementById('template-select-container');
        const emailWriteContainer = document.getElementById('email-write-container');
        const templateSelector = document.getElementById('template-selector');
        const subjectInput = document.getElementById('campaign-email-subject');
        const bodyTextarea = document.getElementById('campaign-email-body');
        const templateEmailPreview = document.getElementById('template-email-preview');
        const previewTemplateSubject = document.getElementById('preview-template-subject');
        const previewTemplateBody = document.getElementById('preview-template-body');

        const updateContactPreview = () => {
            const industry = getCampaignSelectValue('filter-industry');
            const status = getFilterStatus();
            const starredOnly = getFilterStarredOnly();

            const accountIdsByIndustry = industry ? new Set(state.accounts.filter(a => a.industry === industry).map(a => a.id)) : null;
            const matchingContacts = state.contacts.filter(contact => {
                const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
                if (!account) return false;
                const industryMatch = !accountIdsByIndustry || accountIdsByIndustry.has(account.id);
                const statusMatch = !status || (status === 'customer' && account.is_customer) || (status === 'prospect' && !account.is_customer);
                const starredMatch = !starredOnly || contact.is_organic === true;
                return industryMatch && statusMatch && starredMatch;
            });

            const previewContainer = document.getElementById('contact-preview-container');
            if (previewContainer) {
                let previewHtml = `<p><strong>${matchingContacts.length}</strong> contacts match your filters.</p>`;
                const listContent = matchingContacts.slice(0, 8).map(c => {
                    const accountName = state.accounts.find(a => a.id === c.account_id)?.name || 'No Account';
                    return `<li><strong>${c.first_name || ''} ${c.last_name || ''}</strong> <span class="text-medium">(${accountName})</span></li>`;
                }).join('');
                if (matchingContacts.length > 0) {
                    previewHtml += `<div class="filtered-contact-list"><ul>${listContent}</ul></div>`;
                }
                previewContainer.innerHTML = previewHtml;
            }
        };

        if (campaignTypeSelect) {
            campaignTypeSelect.addEventListener('change', handleCampaignTypeChange);
        }
        if (subjectInput) {
            subjectInput.setAttribute('readonly', '');
            subjectInput.addEventListener('focus', () => subjectInput.removeAttribute('readonly'), { once: true });
        }

        function handleCampaignTypeChange() {
            const showEmailSection = getCampaignSelectValue('campaign-type') === 'Email' || getCampaignSelectValue('campaign-type') === 'Guided Email';
            if (emailSectionContainer) {
                emailSectionContainer.classList.toggle('hidden', !showEmailSection);
            }
            const mergePills = document.getElementById('create-campaign-merge-pills');
            if (mergePills) {
                const useTemplate = getCampaignSelectValue('email-source-type') === 'template';
                mergePills.classList.toggle('hidden', !showEmailSection || useTemplate);
            }
        }

        if (emailSourceSelect) {
            emailSourceSelect.addEventListener('change', handleEmailSourceChange);
        }

        function handleEmailSourceChange() {
            const useTemplate = getCampaignSelectValue('email-source-type') === 'template';
            if (templateSelectContainer) templateSelectContainer.classList.toggle('hidden', !useTemplate);
            if (emailWriteContainer) {
                emailWriteContainer.classList.toggle('hidden', useTemplate);
            }
            const mergePills = document.getElementById('create-campaign-merge-pills');
            if (mergePills) {
                const showEmailSection = getCampaignSelectValue('campaign-type') === 'Email' || getCampaignSelectValue('campaign-type') === 'Guided Email';
                mergePills.classList.toggle('hidden', useTemplate || !showEmailSection);
            }
            if (templateEmailPreview) {
                if (useTemplate) {
                    templateEmailPreview.classList.remove('hidden');
                    handleTemplateSelectChange();
                } else {
                    templateEmailPreview.classList.add('hidden');
                    if (previewTemplateSubject) previewTemplateSubject.textContent = '';
                    if (previewTemplateBody) previewTemplateBody.textContent = '';
                }
            }

            if (subjectInput) subjectInput.readOnly = useTemplate;
            if (bodyTextarea) bodyTextarea.readOnly = useTemplate;

            if (useTemplate && templateSelector) {
                templateSelector.dispatchEvent(new Event('change'));
            }
        }

        if (templateSelector) {
            templateSelector.addEventListener('change', handleTemplateSelectChange);
        }

        function handleTemplateSelectChange() {
            if (getCampaignSelectValue('email-source-type') !== 'template') return;
            const templateId = Number(getCampaignSelectValue('template-selector'));
            const template = state.emailTemplates.find(t => t.id === templateId);

            if (subjectInput) subjectInput.value = template ? template.subject || '' : '';
            if (bodyTextarea) bodyTextarea.value = template ? template.body || '' : '';

            if (previewTemplateSubject) {
                previewTemplateSubject.textContent = template ? template.subject || '(No Subject)' : '';
            }
            if (previewTemplateBody) {
                previewTemplateBody.textContent = template ? template.body || '(No Content)' : '';
            }
        }

        document.getElementById('filter-industry')?.addEventListener('change', updateContactPreview);
        const filterStarredBtn = document.getElementById('filter-starred-btn');
        if (filterStarredBtn) {
            filterStarredBtn.addEventListener('click', () => {
                filterStarredBtn.classList.toggle('is-organic');
                updateContactPreview();
            });
        }

        document.getElementById('filter-industry')?.addEventListener('change', updateContactPreview);

        document.querySelectorAll('.customer-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                updateContactPreview();
            });
        });

        if (campaignTypeSelect) handleCampaignTypeChange();
        if (emailSourceSelect) handleEmailSourceChange();

        updateContactPreview();
    }

    function handleMergeFieldClick(e) {
        const field = e.target.dataset.field;
        const activeTextarea = document.getElementById('template-body') || document.getElementById('campaign-email-body') || document.getElementById('email-body-textarea');

        if (!activeTextarea || activeTextarea.readOnly) {
            console.error("No editable textarea found for merge field insertion.");
            return;
        }

        activeTextarea.focus();
        try {
            const startPos = activeTextarea.selectionStart;
            const endPos = activeTextarea.selectionEnd;
            activeTextarea.value = activeTextarea.value.substring(0, startPos) + field + activeTextarea.value.substring(endPos);
            activeTextarea.setSelectionRange(startPos + field.length, startPos + field.length);
        } catch (error) {
            activeTextarea.value += field;
        }
        if (activeTextarea.id === 'campaign-email-body') {
            updateNotesPlaceholder('campaign-email-body', 'campaign-email-body-placeholder');
        }
        if (activeTextarea.id === 'email-body-textarea') {
            updateNotesPlaceholder('email-body-textarea', 'email-body-placeholder');
        }
    }

    function handleExportCsv() {
        const campaign = state.campaigns.find(c => c.id === state.selectedCampaignId);
        if (!campaign) {
            showToast('No campaign selected for CSV export.', 'error');
            return;
        }
        let csvContent = "data:text/csv;charset=utf-8,";
        const headers = ["FirstName", "LastName", "Email", "AccountName", "Title"];
        csvContent += headers.map(h => `"${h}"`).join(",") + "\r\n";

        const membersToExport = state.campaignMembers.map(member => {
            const contact = state.contacts.find(c => c.id === member.contact_id);
            const account = contact ? state.accounts.find(a => a.id === contact.account_id) : null;
            return {
                FirstName: contact?.first_name || '',
                LastName: contact?.last_name || '',
                Email: contact?.email || '',
                AccountName: account?.name || '',
                Title: contact?.title || ''
            };
        });

        membersToExport.forEach(row => {
            const csvRow = headers.map(header => `"${(row[header] || '').replace(/"/g, '""')}"`).join(",");
            csvContent += csvRow + "\r\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${campaign.name.replace(/[^a-z0-9]/gi, '_')}_contacts.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        logMailMergeActivity(campaign.name);
    }

    function handleExportTxt() {
        const campaign = state.campaigns.find(c => c.id === state.selectedCampaignId);
        if (!campaign || !campaign.email_body) {
            showToast('No email body saved for this campaign to export as text.', 'error');
            return;
        }
        const readme = `--- MAIL MERGE INSTRUCTIONS ---\n\n1. Open Microsoft Word and paste the email body below into a new document.\n2. Go to the "Mailings" tab and click "Start Mail Merge" -> "Step-by-Step Mail Merge Wizard".\n3. For "Select recipients", choose "Use an existing list" and browse to select the CSV file you downloaded.\n4. Edit the recipient list if needed, then click "Write your e-mail message".\n5. Use the "Insert Merge Field" button to place your fields like [FirstName].\n6. Preview your messages and complete the merge to send.\n\n--- YOUR EMAIL TEMPLATE ---\n\n`;
        const textContent = readme + campaign.email_body;
        const blob = new Blob([textContent], {
            type: 'text/plain'
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${campaign.name.replace(/[^a-z0-9]/gi, '_')}_template.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function logMailMergeActivity(campaignName) {
        const activitiesToLog = state.campaignMembers.map(member => {
            const contact = state.contacts.find(c => c.id === member.contact_id);
            return {
                contact_id: member.contact_id,
                account_id: contact?.account_id,
                type: 'Email',
                description: `Included in mail merge export for campaign: "${campaignName}".`,
                user_id: getState().effectiveUserId,
                date: new Date().toISOString()
            };
        });
        if (activitiesToLog.length > 0) {
            const {
                error
            } = await supabase.from('activities').insert(activitiesToLog);
            if (error) console.error("Error logging mail merge activity:", error);
        }
    }

    function handleManageTemplatesClick() {
        renderTemplateManager();
    }

    function renderTemplateManager() {
        const visibleTemplates = state.emailTemplates.filter(template =>
            !template.is_cloned || template.user_id === getState().effectiveUserId
        );

        let templateListHtml = visibleTemplates.map(template => {
            const templateId = template.id;
            const templateName = template.name || 'Unnamed Template';
            let actionButtonsHtml = '';
            let attributionHtml = '';

            const cloneButton = `<button class="btn-secondary btn-icon-header btn-clone-template" data-id="${templateId}" title="Clone"><i class="fas fa-copy"></i></button>`;

            if (template.user_id === getState().effectiveUserId) {
                actionButtonsHtml = `
                    <button class="btn-secondary btn-icon-header btn-edit-template" data-id="${templateId}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-danger btn-icon-header btn-delete-template" data-id="${templateId}" title="Delete"><i class="fas fa-trash"></i></button>
                    ${cloneButton}
                `;
            } else {
                const creator = state.user_quotas.find(p => p && p.user_id === template.user_id);
                const creatorName = creator ? creator.full_name : 'an unknown user';
                attributionHtml = `<small class="template-attribution">Shared by ${creatorName}</small>`;
                actionButtonsHtml = cloneButton;
            }

            return `
            <div class="template-list-item">
                <div>
                    <span>${templateName}</span>
                    ${attributionHtml}
                </div>
                <div class="template-actions">
                    ${actionButtonsHtml}
                </div>
            </div>`;
        }).join('');

        if (visibleTemplates.length === 0) {
            templateListHtml = "<p>No templates available. Try creating one!</p>";
        }

        const managerBody = `<div id="template-manager">${templateListHtml}</div><hr><button id="create-new-template-btn" class="btn-primary full-width">Create New Template</button>`;
        const container = document.getElementById('template-manager-container');
        if (container) {
            container.innerHTML = managerBody;
            setupTemplateManagerListeners();
        }
    }

    function setupTemplateManagerListeners() {
        const createNewTemplateBtn = document.getElementById('create-new-template-btn');
        if (createNewTemplateBtn) {
            createNewTemplateBtn.addEventListener('click', () => openTemplateForm(null));
        }

        document.querySelectorAll('#template-manager .btn-edit-template').forEach(button => {
            button.addEventListener('click', handleEditTemplateClick);
        });

        document.querySelectorAll('#template-manager .btn-delete-template').forEach(button => {
            button.addEventListener('click', handleDeleteTemplateClick);
        });

        document.querySelectorAll('#template-manager .btn-clone-template').forEach(button => {
            button.addEventListener('click', handleCloneTemplateClick);
        });
    }

    async function handleCloneTemplateClick(e) {
        const templateId = Number(e.target.dataset.id);
        const originalTemplate = state.emailTemplates.find(t => t.id === templateId);

        if (!originalTemplate) {
            showToast("Could not find the original template to clone.", 'error');
            return;
        }

        const newName = prompt("Enter a name for your new cloned template:", `${originalTemplate.name} (Copy)`);
        if (!newName || newName.trim() === '') {
            return;
        }

        const {
            data: newTemplate,
            error
        } = await supabase.from('email_templates').insert({
            name: newName,
            subject: originalTemplate.subject,
            body: originalTemplate.body,
            user_id: getState().effectiveUserId,
            is_cloned: true
        }).select().single();

        if (error) {
            showToast("Error cloning template: " + error.message, 'error');
            return;
        }

        showActionSuccess(`Template "${newName}" created successfully`);
        await loadAllData();
        renderTemplateManager();
    }

    function handleEditTemplateClick(e) {
        const buttonElement = e.target.closest('.btn-edit-template');
        if (!buttonElement) return;

        const templateId = Number(buttonElement.dataset.id);
        const template = state.emailTemplates.find(t => t.id === templateId);

        if (template) {
            openTemplateForm(template);
        } else {
            showToast("Could not find the template for editing.", 'error');
        }
    }

    function handleDeleteTemplateClick(e) {
        const buttonElement = e.target.closest('.btn-delete-template');
        if (!buttonElement) return;
        const templateId = Number(buttonElement.dataset.id);
        handleDeleteTemplate(templateId);
    }

    let templateFormEditing = null;

    function openTemplateForm(templateToEdit = null) {
        const isEditing = templateToEdit !== null;
        templateFormEditing = templateToEdit;
        const titleEl = document.getElementById('template-form-inline-title');
        const formEl = document.getElementById('template-form-inline');
        const wrapper = document.getElementById('template-form-inline-wrapper');
        if (!titleEl || !formEl || !wrapper) return;

        titleEl.textContent = isEditing ? "Edit Email Template" : "Create New Email Template";
        const currentTemplateName = (templateToEdit?.name || '').replace(/"/g, '&quot;');
        const currentTemplateSubject = (templateToEdit?.subject || '').replace(/"/g, '&quot;');
        const currentTemplateBody = (templateToEdit?.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        formEl.innerHTML = `
            <div id="template-form-container">
                <label for="template-name">Template Name:</label><input type="text" id="template-name" value="${currentTemplateName}" required>
                <label for="template-subject">Subject:</label><input type="text" id="template-subject" name="x-template-subject" value="${currentTemplateSubject}" autocomplete="nope">
                <label for="template-body">Email Body:</label>
                <textarea id="template-body" rows="10" name="x-template-body" autocomplete="nope">${(templateToEdit?.body || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
                <div class="merge-fields-buttons">
                    <button type="button" class="btn-secondary" data-field="[FirstName]">First</button>
                    <button type="button" class="btn-secondary" data-field="[LastName]">Last</button>
                    <button type="button" class="btn-secondary" data-field="[AccountName]">Account</button>
                </div>
            </div>`;

        wrapper.classList.remove('hidden');

        const saveBtn = document.getElementById('template-form-save-btn');
        const cancelBtn = document.getElementById('template-form-cancel-btn');
        const onSave = async () => {
            const name = document.getElementById('template-name')?.value.trim();
            if (!name) { showToast('Template name is required.', 'error'); return; }
            const templateData = {
                name,
                subject: document.getElementById('template-subject')?.value.trim(),
                body: document.getElementById('template-body')?.value,
                user_id: getState().effectiveUserId
            };
            let error;
            if (templateFormEditing) {
                const { error: updateError } = await supabase.from('email_templates').update(templateData).eq('id', templateFormEditing.id);
                error = updateError;
            } else {
                const { error: insertError } = await supabase.from('email_templates').insert(templateData);
                error = insertError;
            }
            if (error) {
                showToast("Error saving template: " + error.message, 'error');
                return;
            }
            showActionSuccess(`Template "${name}" saved successfully`);
            wrapper.classList.add('hidden');
            templateFormEditing = null;
            await loadAllData();
            renderTemplateManager();
        };
        const onCancel = () => { wrapper.classList.add('hidden'); templateFormEditing = null; };

        saveBtn.replaceWith(saveBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        document.getElementById('template-form-save-btn').addEventListener('click', onSave);
        document.getElementById('template-form-cancel-btn').addEventListener('click', onCancel);
    }

    let templateDeletePendingId = null;

    function handleDeleteTemplate(templateId) {
        templateDeletePendingId = templateId;
        const msgEl = document.getElementById('template-delete-confirm-message');
        const wrapper = document.getElementById('template-delete-confirm-inline');
        if (msgEl) msgEl.textContent = "Are you sure you want to delete this template? This cannot be undone.";
        if (wrapper) wrapper.classList.remove('hidden');
    }

    async function confirmTemplateDelete() {
        if (templateDeletePendingId == null) return;
        const id = templateDeletePendingId;
        templateDeletePendingId = null;
        const wrapper = document.getElementById('template-delete-confirm-inline');
        if (wrapper) wrapper.classList.add('hidden');
        const { error } = await supabase.from('email_templates').delete().eq('id', id);
        if (error) {
            showToast("Error deleting template: " + error.message, 'error');
            return;
        }
        showActionSuccess("Template deleted successfully");
        await loadAllData();
        renderTemplateManager();
    }

    function cancelTemplateDelete() {
        templateDeletePendingId = null;
        document.getElementById('template-delete-confirm-inline')?.classList.add('hidden');
    }

    const handleDeleteSelectedCampaign = () => {
        const campaignId = state.selectedCampaignId;

        if (!campaignId) {
            showToast("Please select an active campaign to delete.", 'error');
            return;
        }

        const campaign = state.campaigns.find(c => c.id === campaignId);
        if (campaign && campaign.completed_at) {
            showToast("Cannot delete a past campaign. Please select an active campaign.", 'error');
            return;
        }

        handleDeleteCampaign(campaignId);
    };

    async function handleDeleteCampaign(campaignId) {
        showModal("Confirm Deletion", "Are you sure you want to delete this campaign? This cannot be undone.", async () => {
            await supabase.from('campaign_members').delete().eq('campaign_id', campaignId);
            await supabase.from('campaigns').delete().eq('id', campaignId);
            showActionSuccess("Campaign and its members deleted successfully");
            state.selectedCampaignId = null;
            await loadAllData();
            return true;
        });
    }

    // --- Data Fetching ---
    async function loadAllData() {
        if (!state.currentUser) {
            console.warn("loadAllData called without a current user. Skipping data fetch.");
            return;
        }
        showGlobalLoader();
        try {
            const [
                 { data: campaigns, error: campaignsError },
                 { data: contacts, error: contactsError },
                 { data: accounts, error: accountsError },
                 { data: activities, error: activitiesError },
                 { data: emailTemplates, error: templatesError },
                 { data: userQuotas, error: userQuotasError }
            ] = await Promise.all([
                supabase.from("campaigns").select("*").eq("user_id", getState().effectiveUserId),
                supabase.from("contacts").select("*").eq("user_id", getState().effectiveUserId),
                supabase.from("accounts").select("*").eq("user_id", getState().effectiveUserId),
                supabase.from("activities").select("*").eq("user_id", getState().effectiveUserId),
                supabase.from("email_templates").select("*"),
                supabase.from("user_quotas").select("user_id, full_name")
            ]);

            if (campaignsError) throw campaignsError;
            if (contactsError) throw contactsError;
            if (accountsError) throw accountsError;
            if (activitiesError) throw activitiesError;
            if (templatesError) throw templatesError;
            if (userQuotasError) throw userQuotasError;

            state.campaigns = campaigns || [];
            state.contacts = contacts || [];
            state.accounts = accounts || [];
            state.activities = activities || [];
            state.emailTemplates = emailTemplates || [];
            state.user_quotas = userQuotas || [];

            renderCampaignList();
            renderCampaignDetails();
            renderCreateCampaignForm();
            renderTemplateManager();
        } catch (error) {
            console.error("Error loading data:", error.message);
            showToast("Failed to load page data. Please try refreshing. Error: " + error.message, 'error');
        } finally {
            hideGlobalLoader();
        }
    }

    async function loadCampaignMembers(campaignId) {
        const {
            data,
            error
        } = await supabase.from('campaign_members').select('*').eq('campaign_id', campaignId);
        if (error) {
            console.error('Error fetching campaign members:', error);
            state.campaignMembers = [];
        } else {
            state.campaignMembers = data || [];
        }
    }

    function setupPageEventListeners() {
        setupModalListeners();
        updateActiveNavLink();


        const campaignToolsFlippable = document.getElementById('campaign-tools-flippable');
        const campaignToolsTitle = document.getElementById('campaign-tools-title');
        const campaignToolsFlipBtn = document.getElementById('campaign-tools-flip-btn');
        function updateCampaignToolsHeader() {
            const isTemplates = campaignToolsFlippable && campaignToolsFlippable.classList.contains('campaign-tools-flipped');
            if (campaignToolsTitle) campaignToolsTitle.textContent = isTemplates ? 'Manage Email Templates' : 'Create New Campaign';
            if (campaignToolsFlipBtn) {
                campaignToolsFlipBtn.title = isTemplates ? 'Create Campaign' : 'Manage Templates';
                campaignToolsFlipBtn.setAttribute('aria-label', campaignToolsFlipBtn.title);
            }
            const flipIcon = document.getElementById('campaign-tools-flip-icon');
            if (flipIcon) flipIcon.className = isTemplates ? 'fas fa-plus' : 'fas fa-file-lines';
        }
        if (campaignToolsFlipBtn && campaignToolsFlippable) {
            campaignToolsFlipBtn.addEventListener('click', () => {
                campaignToolsFlippable.classList.toggle('campaign-tools-flipped');
                updateCampaignToolsHeader();
                if (campaignToolsFlippable.classList.contains('campaign-tools-flipped')) renderTemplateManager();
            });
        }

        const confirmYesBtn = document.getElementById('create-campaign-confirm-yes');
        const confirmCancelBtn = document.getElementById('create-campaign-confirm-cancel');
        const confirmEl = document.getElementById('create-campaign-confirm');
        if (confirmYesBtn) confirmYesBtn.addEventListener('click', () => { if (confirmEl) confirmEl.classList.add('hidden'); if (createCampaignConfirmResolve) createCampaignConfirmResolve(true); createCampaignConfirmResolve = null; });
        if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', () => { if (confirmEl) confirmEl.classList.add('hidden'); if (createCampaignConfirmResolve) createCampaignConfirmResolve(false); createCampaignConfirmResolve = null; });

        const templateDeleteYes = document.getElementById('template-delete-yes-btn');
        const templateDeleteCancel = document.getElementById('template-delete-cancel-btn');
        if (templateDeleteYes) templateDeleteYes.addEventListener('click', confirmTemplateDelete);
        if (templateDeleteCancel) templateDeleteCancel.addEventListener('click', cancelTemplateDelete);

        document.body.addEventListener('click', (e) => {
            if (e.target.closest('.merge-fields-buttons button')) {
                handleMergeFieldClick(e);
            }

            const campaignListItem = e.target.closest('#campaign-list-active .list-item, #campaign-list-past .list-item');
            if (campaignListItem) {
                const newSelectedId = Number(campaignListItem.dataset.id);
                if (newSelectedId !== state.selectedCampaignId) {
                    state.selectedCampaignId = newSelectedId;
                    renderCampaignList();
                    renderCampaignDetails();
                }
            }
            // REMOVED: No longer need to listen for 'modal-return-btn' clicks.
            if (e.target.id === 'modal-ok-btn') {
                hideModal();
            }
        });

        const emailSubjectEl = document.getElementById('email-subject');
        if (emailSubjectEl) {
            emailSubjectEl.setAttribute('readonly', '');
            emailSubjectEl.addEventListener('focus', () => emailSubjectEl.removeAttribute('readonly'), { once: true });
        }
        const callNotesEl = document.getElementById('call-notes');
        const emailBodyEl = document.getElementById('email-body-textarea');
        const campaignDetailsPanel = document.getElementById('campaign-details');
        if (campaignDetailsPanel) {
            campaignDetailsPanel.addEventListener('input', (e) => {
                if (e.target.id === 'call-notes') updateNotesPlaceholder('call-notes', 'call-notes-placeholder');
                if (e.target.id === 'email-body-textarea') updateNotesPlaceholder('email-body-textarea', 'email-body-placeholder');
                if (e.target.id === 'campaign-email-body') updateNotesPlaceholder('campaign-email-body', 'campaign-email-body-placeholder');
            });
        }
        if (campaignDetailsPanel) {
            campaignDetailsPanel.addEventListener('wheel', (e) => {
                const wrap = e.target.closest('.campaign-details-contacts-wrap');
                if (wrap && wrap.scrollHeight > wrap.clientHeight) {
                    e.preventDefault();
                    wrap.scrollTop += e.deltaY;
                }
            }, { passive: false });
        }
        if (campaignDetailsPanel) {
            campaignDetailsPanel.addEventListener('click', (e) => {
                const logBtn = e.target.closest('#log-call-btn');
                const skipBtn = e.target.closest('#skip-call-btn');
                const openEmailBtn = e.target.closest('#open-email-client-btn');
                const skipEmailBtn = e.target.closest('#skip-email-btn');
                if (logBtn) handleLogCall({ target: logBtn });
                else if (skipBtn) handleSkipCall({ target: skipBtn });
                else if (e.target.id === 'export-csv-btn') handleExportCsv();
                else if (e.target.id === 'export-txt-btn') handleExportTxt();
                else if (openEmailBtn) handleOpenEmailClient({ target: openEmailBtn });
                else if (skipEmailBtn) handleSkipEmail({ target: skipEmailBtn });
                else if (e.target.closest('#show-email-details-btn') && campaignDetailsFlippable && campaignDetailsEmailBack && campaignDetailsEmailBack.innerHTML.trim() !== '') {
                    campaignDetailsFlippable.classList.add('campaign-details-flipped');
                } else if (e.target.closest('#campaign-details-back-btn') && campaignDetailsFlippable) {
                    campaignDetailsFlippable.classList.remove('campaign-details-flipped');
                } else if (e.target.id === 'delete-campaign-details-btn') {
                    handleDeleteSelectedCampaign();
                }
            });
        }
    }

    async function initializePage() {
        await loadSVGs();
        const appState = await initializeAppState(supabase);
        if (!appState.currentUser) {
            hideGlobalLoader();
            return;
        }
        state.currentUser = appState.currentUser;
        await setupUserMenuAndAuth(supabase, getState());
        setupPageEventListeners();
        await setupGlobalSearch(supabase, state.currentUser);
        await checkAndSetNotifications(supabase);
        await loadAllData();
        window.addEventListener('effectiveUserChanged', loadAllData);
    }

    runWhenNavReady(function () { initializePage(); });
});
