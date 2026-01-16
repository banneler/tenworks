// campaigns.js

import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatDate,
    setupModalListeners,
    // _rebindModalActionListeners, // This is no longer needed
    getCurrentModalCallbacks,
    setCurrentModalCallbacks,
    showModal,
    hideModal,
    updateActiveNavLink,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    checkAndSetNotifications
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        campaigns: [],
        contacts: [],
        accounts: [],
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

    // --- HELPER FUNCTIONS FOR PHONE NUMBERS ---

    /**
     * Sanitizes a single phone number string for use in a tel: link.
     * Replaces the first common extension separator with ';' (pause) and strips invalid characters.
     * @param {string} phone - The raw phone number string.
     * @returns {string} A sanitized string for a tel: href.
     */
    function sanitizeForTel(phone) {
        if (!phone) return '';
        
        let href = phone.trim();
        
        // 1. Replace the *first* common extension separator with a semicolon.
        // Looks for (with optional spaces): ext. ext x | # or a space-flanked 9
        href = href.replace(/(\s*(ext\.?|x|\||#| 9 )\s*)/i, ';');
        
        // 2. Strip all non-dialable characters (spaces, dashes, parens)
        // for the href, but keep '+' for country codes and ';' for the pause.
        href = href.replace(/[^0-9+;]/g, '');
        
        return href;
    }

    /**
     * Renders one or more clickable phone links into a container.
     * Splits a phone string by separators and makes each number clickable.
     * @param {HTMLElement} container - The element to inject the links into.
     * @param {string} phoneString - The raw string containing one or more phone numbers.
     */
    function renderClickablePhones(container, phoneString) {
        if (!container) return;
        
        container.innerHTML = ''; // Clear existing content
        
        if (!phoneString || phoneString.trim() === '') {
            container.textContent = 'No Phone Number';
            return;
        }
        
        // Split by common separators, then filter out empty strings
        const phoneNumbers = phoneString.split(/\s*[\/|]|\s+or\s+/i)
                                      .map(p => p.trim())
                                      .filter(p => p.length > 0);
        
        if (phoneNumbers.length === 0) {
             container.textContent = 'No Phone Number'; // Fallback
             return;
        }

        phoneNumbers.forEach((phoneText, index) => {
            const sanitizedHref = sanitizeForTel(phoneText);
            
            // Don't render a link if it's just an empty string after sanitizing
            if (sanitizedHref === '') {
                 container.textContent = phoneText; // just show the text
                 return;
            }

            const link = document.createElement('a');
            link.href = `tel:${sanitizedHref}`;
            link.textContent = phoneText; // Use the original (but trimmed) text
            link.className = 'contact-name-link'; // Match styling
            
            container.appendChild(link);
            
            // Add a separator if it's not the last item
            if (index < phoneNumbers.length - 1) {
                const separator = document.createTextNode(' / ');
                container.appendChild(separator);
            }
        });
    }
    // --- END HELPER FUNCTIONS ---


    // --- DOM SELECTORS ---
    const newCampaignBtn = document.getElementById('new-campaign-btn');
    const manageTemplatesBtn = document.getElementById('manage-templates-btn');
    const deleteCampaignBtn = document.getElementById('delete-campaign-btn');
    const activeCampaignList = document.getElementById('campaign-list-active');
    const pastCampaignList = document.getElementById('campaign-list-past');
    const campaignDetailsContent = document.getElementById('campaign-details-content');
    const callBlitzUI = document.getElementById('call-blitz-ui');
    const emailMergeUI = document.getElementById('email-merge-ui');
    const guidedEmailUI = document.getElementById('guided-email-ui');

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

        // Applied Rajdhani font to Campaign Name and dimmed the type
        item.innerHTML = `
            <div class="contact-info">
                <div class="contact-name">${campaign.name}</div>
                <small class="account-name">${campaign.type} Campaign</small>
            </div>
        `;
        listElement.appendChild(item);
    };

    const renderCampaignDetails = async () => {
        [campaignDetailsContent, callBlitzUI, emailMergeUI, guidedEmailUI].forEach(el => {
            if (el) el.classList.add('hidden');
        });

        const campaign = state.campaigns.find(c => c.id === state.selectedCampaignId);

        if (deleteCampaignBtn) {
            const canDelete = campaign && !campaign.completed_at;
            deleteCampaignBtn.disabled = !canDelete;
        }

        if (!campaign) {
            if (campaignDetailsContent) {
                campaignDetailsContent.innerHTML = `<p>Select a campaign to see its details or create a new one.</p>`;
                campaignDetailsContent.classList.remove('hidden');
            }
            return;
        }

        await loadCampaignMembers(campaign.id);

        if (campaign.completed_at) {
            renderCompletedCampaignSummary(campaign);
        } else {
            renderActiveCampaignDetails(campaign);
        }
    };

    const renderActiveCampaignDetails = (campaign) => {
        const members = state.campaignMembers.map(member => state.contacts.find(c => c.id === member.contact_id)).filter(Boolean);
        const memberListHtml = members.length > 0 ? members.map(c => {
            const accountName = state.accounts.find(a => a.id === c.account_id)?.name || 'No Account';
            return `<li>${c.first_name} ${c.last_name} <span class="text-medium">(${accountName})</span></li>`;
        }).join('') : '<li>No contacts in this campaign.</li>';

        let emailInfoHtml = '';
        if (campaign.type === 'Email' || campaign.type === 'Guided Email') {
            emailInfoHtml = `
                <hr>
                <h4>Email Content</h4>
                <p><strong>Subject:</strong> ${campaign.email_subject || '(Not set)'}</p>
                <pre class="email-body-summary">${campaign.email_body || '(Not set)'}</pre>
            `;
        }

        if (campaignDetailsContent) {
            campaignDetailsContent.innerHTML = `
                <div class="contact-info">
                    <h4 class="contact-name" style="font-size: 1.5rem; color: var(--primary-blue);">${campaign.name}</h4>
                </div>
                <p><strong>Type:</strong> ${campaign.type}</p>
                <p><strong>Status:</strong> <span style="color: var(--completed-color);">Active</span></p>
                <hr>
                <h4 class="contact-name" style="font-size: 1.1rem;">Included Contacts (${members.length})</h4>
                <ul class="summary-contact-list">${memberListHtml}</ul>
                ${emailInfoHtml}
            `;
            campaignDetailsContent.classList.remove('hidden');
        }

        if (campaign.type === 'Call' && callBlitzUI) {
            renderCallBlitzUI();
        } else if (campaign.type === 'Email' && emailMergeUI) {
            renderEmailMergeUI();
        } else if (campaign.type === 'Guided Email' && guidedEmailUI) {
            renderGuidedEmailUI();
        }
    };

    const renderCompletedCampaignSummary = (campaign) => {
        const completedMembers = state.campaignMembers.filter(m => m.status === 'Completed');
        const skippedMembers = state.campaignMembers.filter(m => m.status === 'Skipped');
        let memberHtml = (members, status) => {
            if (members.length === 0) return `<li>No contacts were ${status.toLowerCase()}.</li>`;
            return members.map(member => {
                const contact = state.contacts.find(c => c.id === member.contact_id);
                return `<li>${contact ? `${contact.first_name} ${contact.last_name}` : 'Unknown Contact'}</li>`;
            }).join('');
        };
        let emailBodyHtml = '';
        if (campaign.email_body) {
            emailBodyHtml = `<h4>Email Template Used</h4><pre class="email-body-summary">${campaign.email_body}</pre>`;
        }
        if (campaignDetailsContent) {
            campaignDetailsContent.innerHTML = `
                <h4>${campaign.name}</h4>
                <p><strong>Status:</strong> Complete</p>
                <p><strong>Completed On:</strong> ${formatDate(campaign.completed_at)}</p>
                <hr>
                <h4>Contacts Engaged (${completedMembers.length})</h4>
                <ul>${memberHtml(completedMembers, 'Engaged')}</ul>
                <hr>
                <h4>Contacts Skipped (${skippedMembers.length})</h4>
                <ul>${memberHtml(skippedMembers, 'Skipped')}</ul>
                ${emailBodyHtml}`;
            campaignDetailsContent.classList.remove('hidden');
        }
    };

    const renderCallBlitzUI = () => {
        if (!callBlitzUI) return;
        callBlitzUI.classList.remove('hidden');
        const summaryView = document.getElementById('call-summary-view');
        const activeCallView = document.getElementById('active-call-view');
        const summaryText = document.getElementById('call-summary-text');
        const startBtn = document.getElementById('start-calling-btn');

        if (!summaryView || !activeCallView || !summaryText || !startBtn) {
            console.error("Call Blitz UI elements not found.");
            return;
        }

        const pendingCalls = state.campaignMembers.filter(m => m.status === 'Pending');
        if (pendingCalls.length > 0) {
            summaryText.textContent = `This campaign has ${pendingCalls.length} call(s) remaining.`;
            startBtn.classList.remove('hidden');
        } else {
            summaryText.textContent = 'All calls for this campaign are complete!';
            startBtn.classList.add('hidden');
        }
        summaryView.classList.remove('hidden');
        activeCallView.classList.add('hidden');
    };

    const renderEmailMergeUI = () => {
        if (!emailMergeUI) return;
        emailMergeUI.classList.remove('hidden');
        const summaryText = document.getElementById('email-summary-text');
        if (summaryText) {
            summaryText.textContent = `This campaign includes ${state.campaignMembers.length} contact(s).`;
        }
    };

    const renderGuidedEmailUI = () => {
        if (!guidedEmailUI) return;
        guidedEmailUI.classList.remove('hidden');
        const summaryView = document.getElementById('guided-email-summary-view');
        const activeEmailView = document.getElementById('active-email-view');
        const summaryText = document.getElementById('guided-email-summary-text');
        const startBtn = document.getElementById('start-guided-email-btn');

        if (!summaryView || !activeEmailView || !summaryText || !startBtn) {
            console.error("Guided Email UI elements not found.");
            return;
        }

        const pendingEmails = state.campaignMembers.filter(m => m.status === 'Pending');
        if (pendingEmails.length > 0) {
            summaryText.textContent = `This campaign has ${pendingEmails.length} email(s) to send.`;
            startBtn.classList.remove('hidden');
        } else {
            summaryText.textContent = 'All guided emails for this campaign are complete!';
            startBtn.classList.add('hidden');
        }
        summaryView.classList.remove('hidden');
        activeEmailView.classList.add('hidden');
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
        const summaryView = document.getElementById('call-summary-view');
        const activeCallView = document.getElementById('active-call-view');
        if (!summaryView || !activeCallView) return;

        summaryView.classList.add('hidden');
        activeCallView.classList.remove('hidden');
        displayCurrentCall();
    };

    const displayCurrentCall = () => {
        const pendingCalls = state.campaignMembers.filter(m => m.status === 'Pending');
        const contactNameEl = document.getElementById('contact-name-call-blitz');
        const contactCompanyEl = document.getElementById('contact-company-call-blitz');
        
        // --- THIS IS THE FIX ---
        // 1. Get the element. It might be an <a> tag from the original HTML
        let phoneEl = document.getElementById('contact-phone-call-blitz');
        const callNotesEl = document.getElementById('call-notes');

        if (!contactNameEl || !contactCompanyEl || !phoneEl || !callNotesEl) {
            console.error("Missing call blitz contact info elements.");
            return;
        }

        // 2. Check if it's an <a> tag. If so, replace it with a <span>
        //    so we can safely inject our *new* <a> tags into it.
        if (phoneEl.tagName === 'A') {
            const newSpan = document.createElement('span');
            newSpan.id = phoneEl.id; // Give the new span the same ID
            newSpan.className = phoneEl.className; // Copy over any classes
            phoneEl.parentNode.replaceChild(newSpan, phoneEl);
            phoneEl = newSpan; // Re-assign our variable to the new span
        }
        // --- END FIX ---


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

        contactNameEl.textContent = `${contact.first_name || ''} ${contact.last_name || ''}`;
        contactCompanyEl.textContent = account ? account.name : 'No Company';
        
        // Now, this function will render into the <span> (phoneEl)
        renderClickablePhones(phoneEl, contact.phone);
        
        callNotesEl.value = '';
        callNotesEl.focus();
    };

    const handleLogCall = async (event) => {
        const notesEl = document.getElementById('call-notes');
        const notes = notesEl ? notesEl.value.trim() : '';
        if (!notes) {
            alert('Please enter call notes before logging.');
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
            user_id: state.currentUser.id,
            date: new Date().toISOString()
        });
        if (activityError) {
            console.error("Error logging activity:", activityError);
            alert("Failed to log call activity. Please try again.");
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
            alert("Failed to update campaign member status. Please try again.");
            return;
        }

        currentMember.status = 'Completed'; // Update local state immediately
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
            alert("Failed to skip call. Please try again.");
            return;
        }

        currentMember.status = 'Skipped'; // Update local state immediately
        displayCurrentCall(); // Refresh UI for next call
        await checkForCampaignCompletion(currentMember.campaign_id);
    };

    const startGuidedEmail = () => {
        const summaryView = document.getElementById('guided-email-summary-view');
        const activeEmailView = document.getElementById('active-email-view');
        if (!summaryView || !activeEmailView) return;

        summaryView.classList.add('hidden');
        activeEmailView.classList.remove('hidden');
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


        let emailBody = campaign.email_body || '';
        emailBody = emailBody.replace(/\[FirstName\]/g, contact.first_name || '');
        emailBody = emailBody.replace(/\[LastName\]/g, contact.last_name || '');
        emailBody = emailBody.replace(/\[AccountName\]/g, account ? account.name : '');

        emailToAddressEl.textContent = contact.email || 'No Email';
        emailSubjectEl.value = campaign.email_subject || '';
        emailBodyTextareaEl.value = emailBody;
        emailBodyTextareaEl.focus();
    };

    const handleOpenEmailClient = async (event) => {
        const to = document.getElementById('email-to-address')?.textContent;
        const subject = document.getElementById('email-subject')?.value;
        const body = document.getElementById('email-body-textarea')?.value;

        if (!to) {
            alert("Cannot open email client: Contact has no email address.");
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
            user_id: state.currentUser.id,
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
            alert("Failed to skip email. Please try again.");
            return;
        }

        currentMember.status = 'Skipped'; // Update local state immediately
        displayCurrentEmail(); // Refresh UI for next email
        await checkForCampaignCompletion(currentMember.campaign_id);
    };

    // REMOVED: captureFormState and restoreFormState functions are no longer needed
    // REMOVED: handleShowAllContactsClick function is no longer needed

    // NEW: Helper function to get contacts based on modal filters and campaign type
    function getFilteredContacts() {
        const industry = document.getElementById('filter-industry')?.value;
        const status = document.getElementById('filter-status')?.value;
        const type = document.getElementById('campaign-type')?.value;

        const accountIdsByIndustry = industry ? new Set(state.accounts.filter(a => a.industry === industry).map(a => a.id)) : null;

        return state.contacts.filter(contact => {
            const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
            if (!account) return false;

            const industryMatch = !accountIdsByIndustry || accountIdsByIndustry.has(account.id);
            const statusMatch = !status || (status === 'customer' && account.is_customer) || (status === 'prospect' && !account.is_customer);

            // NEW: Add validation based on campaign type
            let validationMatch = true;
            if (type === 'Call') {
                validationMatch = contact.phone && contact.phone.trim() !== '';
            } else if (type === 'Email' || type === 'Guided Email') {
                validationMatch = contact.email && contact.email.trim() !== '';
            }

            return industryMatch && statusMatch && validationMatch;
        });
    }

    async function handleNewCampaignClick() {
        const visibleTemplates = state.emailTemplates.filter(template =>
            !template.is_cloned || template.user_id === state.currentUser.id
        );

        const myTemplates = visibleTemplates
            .filter(t => t.user_id === state.currentUser.id)
            .sort((a, b) => a.name.localeCompare(b.name));

        const sharedTemplates = visibleTemplates
            .filter(t => t.user_id !== state.currentUser.id)
            .sort((a, b) => a.name.localeCompare(b.name));

        let myTemplatesOptions = '';
        if (myTemplates.length > 0) {
            myTemplatesOptions = `
                <optgroup label="My Templates">
                    ${myTemplates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                </optgroup>
            `;
        }

        let sharedTemplatesOptions = '';
        if (sharedTemplates.length > 0) {
            const sharedOptionsHtml = sharedTemplates.map(t => {
                const creator = state.user_quotas.find(p => p && p.user_id === t.user_id);
                const creatorName = creator ? creator.full_name : '';
                const initials = getInitials(creatorName);
                const displayName = `${t.name} ${initials ? `(${initials})` : ''}`.trim();
                return `<option value="${t.id}">${displayName}</option>`;
            }).join('');

            sharedTemplatesOptions = `
                <optgroup label="Shared Templates">
                    ${sharedOptionsHtml}
                </optgroup>
            `;
        }
        const templateOptions = myTemplatesOptions + sharedTemplatesOptions;

        const uniqueIndustries = [...new Set(state.accounts.map(a => a.industry).filter(Boolean))].sort();
        const industryOptions = uniqueIndustries.map(i => `<option value="${i}">${i}</option>`).join('');

        const modalBody = `
            <div id="new-campaign-form">
                <label for="campaign-name">Campaign Name:</label>
                <input type="text" id="campaign-name" required placeholder="e.g., Q3 Tech Customer Outreach">
                <label for="campaign-type">Campaign Type:</label>
                <select id="campaign-type"><option value="Call">Call Blitz</option><option value="Email">Email Merge</option><option value="Guided Email">Guided Email</option></select>

                <div id="email-section-container" class="hidden">
                    <label for="email-source-type">Email Source:</label>
                    <select id="email-source-type"><option value="write">Write New Email</option><option value="template">Use a Template</option></select>

                    <div id="template-select-container" class="hidden">
                        <label for="template-selector">Select Template:</label>
                        <select id="template-selector"><option value="">--Select--</option>${templateOptions}</select>
                    </div>

                    <div id="email-write-container">
                        <label for="campaign-email-subject">Email Subject:</label>
                        <input type="text" id="campaign-email-subject" placeholder="Your email subject line">
                        <label for="campaign-email-body">Email Message:</label>
                        <div class="merge-fields-buttons">
                            <button type="button" class="btn-secondary" data-field="[FirstName]">First Name</button>
                            <button type="button" class="btn-secondary" data-field="[LastName]">Last Name</button>
                            <button type="button" class="btn-secondary" data-field="[AccountName]">Account Name</button>
                        </div>
                        <textarea id="campaign-email-body" rows="8" placeholder="Hi [FirstName], ..."></textarea>
                    </div>
                    <div id="template-email-preview" class="hidden">
                        <p><strong>Subject:</strong> <span id="preview-template-subject"></span></p>
                        <pre id="preview-template-body" class="email-body-summary"></pre>
                    </div>
                </div>

                <hr><h4>Filter Target Contacts</h4>
                <label for="filter-industry">Account Industry:</label><select id="filter-industry"><option value="">All</option>${industryOptions}</select>
                <label for="filter-status">Customer Status:</label><select id="filter-status"><option value="">All</option><option value="customer">Customers Only</option><option value="prospect">Prospects Only</option></select>
                <div id="contact-preview-container" style="margin-top: 1rem;"></div>
            </div>`;

        const createCampaignAndMembers = async () => {
            const name = document.getElementById('campaign-name')?.value.trim();
            const type = document.getElementById('campaign-type')?.value;
            const industry = document.getElementById('filter-industry')?.value;
            const status = document.getElementById('filter-status')?.value;
            let email_subject = '';
            let email_body = '';

            if (!name) {
                alert('Campaign name is required.');
                return false;
            }

            if (type === 'Email' || type === 'Guided Email') {
                const emailSource = document.getElementById('email-source-type')?.value;
                if (emailSource === 'template') {
                    const templateId = Number(document.getElementById('template-selector')?.value);
                    const selectedTemplate = state.emailTemplates.find(t => t.id === templateId);
                    if (selectedTemplate) {
                        email_subject = selectedTemplate.subject;
                        email_body = selectedTemplate.body;
                    } else {
                        alert("Please select a valid template.");
                        return false;
                    }
                } else {
                    email_subject = document.getElementById('campaign-email-subject')?.value.trim();
                    email_body = document.getElementById('campaign-email-body')?.value;
                }
            }

            // MODIFIED: Use the new helper function to get filtered contacts
            const matchingContacts = getFilteredContacts();

            if (matchingContacts.length === 0) {
                alert('No contacts match the selected filters. Please adjust filters or add contacts/accounts.');
                return false;
            }

            const confirmProceed = await new Promise(resolve => {
                showModal(
                    "Confirm Campaign Creation",
                    `This campaign will include ${matchingContacts.length} contacts. Proceed?`,
                    () => resolve(true),
                    true,
                    `<button id="modal-confirm-btn" class="btn-primary">Yes, Create</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`,
                    () => resolve(false)
                );
            });

            if (!confirmProceed) {
                return false;
            }

            const filter_criteria = {
                industry,
                status
            };
            const {
                data: newCampaign,
                error: campaignError
            } = await supabase.from('campaigns').insert({
                name,
                type,
                filter_criteria,
                email_subject,
                email_body,
                user_id: state.currentUser.id
            }).select().single();
            if (campaignError) {
                alert('Error saving campaign: ' + campaignError.message);
                return false;
            }

            // BUG FIX: Ensure new members have a 'Pending' status.
            const membersToInsert = matchingContacts.map(c => ({
                campaign_id: newCampaign.id,
                contact_id: c.id,
                user_id: state.currentUser.id,
                status: 'Pending'
            }));
            const {
                error: membersError
            } = await supabase.from('campaign_members').insert(membersToInsert);
            if (membersError) {
                alert('Error saving campaign members: ' + membersError.message);
                await supabase.from('campaigns').delete().eq('id', newCampaign.id);
                return false;
            }

            alert(`Campaign "${name}" created successfully with ${matchingContacts.length} members.`);
            state.selectedCampaignId = newCampaign.id;
            await loadAllData();
            return true;
        };

        showModal("Create New Campaign", modalBody, createCampaignAndMembers);

        // REMOVED: restoreFormState is no longer needed
        setupCampaignModalListeners();
    }

    function setupCampaignModalListeners() {
        const industryFilter = document.getElementById('filter-industry');
        const statusFilter = document.getElementById('filter-status');
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
            // MODIFIED: Use the new helper function to get filtered contacts
            const matchingContacts = getFilteredContacts();

            const previewContainer = document.getElementById('contact-preview-container');
            if (previewContainer) {
                // MODIFIED: Added a note to clarify filtering behavior
                let previewHtml = `<p><strong>${matchingContacts.length}</strong> contacts match your filters.</p>
                                   <p class="text-small"><em>Note: Contacts require a phone for Call campaigns or an email for Email campaigns.</em></p>`;
                
                const listContent = matchingContacts.map(c => {
                    const accountName = state.accounts.find(a => a.id === c.account_id)?.name || 'No Account';
                    return `<li><strong>${c.first_name || ''} ${c.last_name || ''}</strong> <span class="text-medium">(${accountName})</span></li>`;
                }).join('');

                if (matchingContacts.length > 0) {
                    previewHtml += `<div class="table-container-scrollable" style="max-height: 150px;">
                                        <ul class="summary-contact-list">${listContent}</ul>
                                    </div>`;
                }

                previewContainer.innerHTML = previewHtml;

                // REMOVED: No longer need to handle 'show all' button clicks.
            }
        };

        if (campaignTypeSelect) {
            campaignTypeSelect.addEventListener('change', handleCampaignTypeChange);
        }

        // MODIFIED: Function now calls updateContactPreview to refresh the list
        function handleCampaignTypeChange() {
            const showEmailSection = campaignTypeSelect?.value === 'Email' || campaignTypeSelect?.value === 'Guided Email';
            if (emailSectionContainer) {
                emailSectionContainer.classList.toggle('hidden', !showEmailSection);
            }
            updateContactPreview(); // Refresh contact list on type change
        }

        if (emailSourceSelect) {
            emailSourceSelect.addEventListener('change', handleEmailSourceChange);
        }

        function handleEmailSourceChange() {
            const useTemplate = emailSourceSelect?.value === 'template';
            if (templateSelectContainer) templateSelectContainer.classList.toggle('hidden', !useTemplate);
            if (emailWriteContainer) {
                emailWriteContainer.classList.toggle('hidden', useTemplate);
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
            if (emailSourceSelect && emailSourceSelect.value !== 'template') return;
            const templateId = Number(templateSelector?.value);
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

        if (industryFilter) {
            industryFilter.addEventListener('change', updateContactPreview);
        }
        if (statusFilter) {
            statusFilter.addEventListener('change', updateContactPreview);
        }

        if (campaignTypeSelect) handleCampaignTypeChange();
        if (emailSourceSelect) handleEmailSourceChange();

        updateContactPreview();
    }

    function handleMergeFieldClick(e) {
        const field = e.target.dataset.field;
        const activeTextarea = document.getElementById('template-body') || document.getElementById('campaign-email-body');

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
    }

    function handleExportCsv() {
        const campaign = state.campaigns.find(c => c.id === state.selectedCampaignId);
        if (!campaign) {
            alert('No campaign selected for CSV export.');
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
            alert('No email body saved for this campaign to export as text.');
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
                user_id: state.currentUser.id,
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
            !template.is_cloned || template.user_id === state.currentUser.id
        );

        let templateListHtml = visibleTemplates.map(template => {
            const templateId = template.id;
            const templateName = template.name || 'Unnamed Template';
            let actionButtonsHtml = '';
            let attributionHtml = '';

            const cloneButton = `<button class="btn-secondary btn-clone-template" data-id="${templateId}">Clone</button>`;

            if (template.user_id === state.currentUser.id) {
                actionButtonsHtml = `
                    <button class="btn-secondary btn-edit-template" data-id="${templateId}">Edit</button>
                    <button class="btn-danger btn-delete-template" data-id="${templateId}">Delete</button>
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

        const managerBody = `<div id="template-manager">${templateListHtml}<hr><button id="create-new-template-btn" class="btn-primary full-width">Create New Template</button></div>`;
        const customFooter = `<button class="btn-secondary" id="modal-exit-btn">Exit</button>`;

        showModal("Email Template Manager", managerBody, null, true, customFooter);
        setupTemplateManagerListeners();
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

        const exitButton = document.getElementById('modal-exit-btn');
        if (exitButton) {
            exitButton.addEventListener('click', hideModal);
        }
    }

    async function handleCloneTemplateClick(e) {
        const templateId = Number(e.target.dataset.id);
        const originalTemplate = state.emailTemplates.find(t => t.id === templateId);

        if (!originalTemplate) {
            alert("Could not find the original template to clone.");
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
            user_id: state.currentUser.id,
            is_cloned: true
        }).select().single();

        if (error) {
            alert("Error cloning template: " + error.message);
            return;
        }

        alert(`Template "${newName}" created successfully!`);
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
            alert("Could not find the template for editing.");
        }
    }

    function handleDeleteTemplateClick(e) {
        const buttonElement = e.target.closest('.btn-delete-template');
        if (!buttonElement) return;
        const templateId = Number(buttonElement.dataset.id);
        handleDeleteTemplate(templateId);
    }

    function openTemplateForm(templateToEdit = null) {
        const isEditing = templateToEdit !== null;
        const modalTitle = isEditing ? "Edit Email Template" : "Create New Email Template";
        const currentTemplateName = templateToEdit?.name || '';
        const currentTemplateSubject = templateToEdit?.subject || '';
        const currentTemplateBody = templateToEdit?.body || '';

        const formBody = `
            <div id="template-form-container">
                <label for="template-name">Template Name:</label><input type="text" id="template-name" value="${currentTemplateName}" required>
                <label for="template-subject">Subject:</label><input type="text" id="template-subject" value="${currentTemplateSubject}">
                <label for="template-body">Email Body:</label>
                <div class="merge-fields-buttons">
                    <button type="button" class="btn-secondary" data-field="[FirstName]">First Name</button>
                    <button type="button" class="btn-secondary" data-field="[LastName]">Last Name</button>
                    <button type="button" class="btn-secondary" data-field="[AccountName]">Account Name</button>
                </div>
                <textarea id="template-body" rows="10">${currentTemplateBody}</textarea>
            </div>`;

        showModal(modalTitle, formBody, async () => {
            const name = document.getElementById('template-name')?.value.trim();
            if (!name) {
                alert('Template name is required.');
                return false;
            }

            const templateData = {
                name,
                subject: document.getElementById('template-subject')?.value.trim(),
                body: document.getElementById('template-body')?.value,
                user_id: state.currentUser.id
            };

            let error;
            if (isEditing) {
                const {
                    error: updateError
                } = await supabase.from('email_templates').update(templateData).eq('id', templateToEdit.id);
                error = updateError;
            } else {
                const {
                    error: insertError
                } = await supabase.from('email_templates').insert(templateData);
                error = insertError;
            }

            if (error) {
                alert("Error saving template: " + error.message);
                return false;
            }

            alert(`Template "${name}" saved successfully!`);
            await loadAllData();
            renderTemplateManager();
            return true;
        });
    }

    async function handleDeleteTemplate(templateId) {
        showModal("Confirm Deletion", "Are you sure you want to delete this template? This cannot be undone.", async () => {
            const {
                error
            } = await supabase.from('email_templates').delete().eq('id', templateId);
            if (error) {
                alert("Error deleting template: " + error.message);
                return false;
            }
            alert("Template deleted successfully.");
            await loadAllData();
            renderTemplateManager();
            return true;
        });
    }

    const handleDeleteSelectedCampaign = () => {
        const campaignId = state.selectedCampaignId;

        if (!campaignId) {
            alert("Please select an active campaign to delete.");
            return;
        }

        const campaign = state.campaigns.find(c => c.id === campaignId);
        if (campaign && campaign.completed_at) {
            alert("Cannot delete a past campaign. Please select an active campaign.");
            return;
        }

        handleDeleteCampaign(campaignId);
    };

    async function handleDeleteCampaign(campaignId) {
        showModal("Confirm Deletion", "Are you sure you want to delete this campaign? This cannot be undone.", async () => {
            await supabase.from('campaign_members').delete().eq('campaign_id', campaignId);
            await supabase.from('campaigns').delete().eq('id', campaignId);
            alert("Campaign and its members deleted successfully!");
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
        try {
            const [
                { data: campaigns, error: campaignsError },
                { data: contacts, error: contactsError },
                { data: accounts, error: accountsError },
                { data: emailTemplates, error: templatesError },
                { data: userQuotas, error: userQuotasError }
            ] = await Promise.all([
                supabase.from("campaigns").select("*").eq("user_id", state.currentUser.id),
                supabase.from("contacts").select("*").eq("user_id", state.currentUser.id),
                supabase.from("accounts").select("*").eq("user_id", state.currentUser.id),
                supabase.from("email_templates").select("*"),
                supabase.from("user_quotas").select("user_id, full_name")
            ]);

            if (campaignsError) throw campaignsError;
            if (contactsError) throw contactsError;
            if (accountsError) throw accountsError;
            if (templatesError) throw templatesError;
            if (userQuotasError) throw userQuotasError;

            state.campaigns = campaigns || [];
            state.contacts = contacts || [];
            state.accounts = accounts || [];
            state.emailTemplates = emailTemplates || [];
            state.user_quotas = userQuotas || [];

            renderCampaignList();
            renderCampaignDetails();
        } catch (error) {
            console.error("Error loading data:", error.message);
            alert("Failed to load page data. Please try refreshing. Error: " + error.message);
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

        if (newCampaignBtn) newCampaignBtn.addEventListener('click', handleNewCampaignClick);
        if (manageTemplatesBtn) manageTemplatesBtn.addEventListener('click', handleManageTemplatesClick);
        if (deleteCampaignBtn) deleteCampaignBtn.addEventListener('click', handleDeleteSelectedCampaign);

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

        const campaignDetailsPanel = document.getElementById('campaign-details');
        if (campaignDetailsPanel) {
            campaignDetailsPanel.addEventListener('click', (e) => {
                if (e.target.id === 'start-calling-btn') startCallBlitz();
                else if (e.target.id === 'log-call-btn') handleLogCall(e); // Pass the event object
                else if (e.target.id === 'skip-call-btn') handleSkipCall(e); // Pass the event object
                else if (e.target.id === 'export-csv-btn') handleExportCsv();
                else if (e.target.id === 'export-txt-btn') handleExportTxt();
                else if (e.target.id === 'start-guided-email-btn') startGuidedEmail();
                else if (e.target.id === 'open-email-client-btn') handleOpenEmailClient(e); // Pass the event object
                else if (e.target.id === 'skip-email-btn') handleSkipEmail(e); // Pass the event object
            });
        }
    }

    async function initializePage() {
        await loadSVGs();
        if (deleteCampaignBtn) {
            deleteCampaignBtn.disabled = true;
        }

        const {
            data: {
                session
            },
            error: sessionError
        } = await supabase.auth.getSession();
        if (sessionError) {
            console.error("Error getting session:", sessionError);
            window.location.href = "index.html";
            return;
        }

        if (session) {
            state.currentUser = session.user;
            await setupUserMenuAndAuth(supabase, state);
            setupPageEventListeners();
            await setupGlobalSearch(supabase, state.currentUser); // <-- ADD THIS LINE
            await checkAndSetNotifications(supabase);
            await loadAllData();
        } else {
            console.log("No active session, redirecting to index.html");
            window.location.href = "index.html";
        }
    }

    initializePage();
});
