// js/cognito.js
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatDate,
    setupModalListeners,
    showModal,
    hideModal,
    updateActiveNavLink,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    updateLastVisited,
    checkAndSetNotifications
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        accounts: [],
        contacts: [],
        alerts: [],
        selectedAlert: null,
        viewMode: 'dashboard',
        initialSuggestionSubject: null,
        initialSuggestionBody: null,
        filterTriggerType: '',
        filterRelevance: '',
        filterAccountId: ''
    };

    const ORIGINAL_PROMPT_BASE_TEXT = `
        You are an expert telecommunications sales executive working for Great Plains Communications. 
        Based on what you know about the products and services your company offers, Write a concise, 
        professional outreach email based on this intelligence. Let's leave out bracketed sections 
        that require user input or selection in your final response. Read through your response twice 
        and modify before providing your final suggested text. Finally, we want to be careful to not sound 
        robotic or AI generated. You got this! Oh, and the code that receives this is looking for [FirstName] 
        to lookup the associated contacts name and do not include anything past the valediction. 
        My email client populates my signature.
    `.trim();

    // --- DOM SELECTORS ---
    const dashboardViewBtn = document.getElementById('view-dashboard-btn');
    const archiveViewBtn = document.getElementById('view-archive-btn');
    const alertsContainer = document.getElementById('alerts-container');
    const pageTitle = document.querySelector('#cognito-view h2');
    const filterTriggerTypeSelect = document.getElementById('filter-trigger-type');
    const filterRelevanceSelect = document.getElementById('filter-relevance');
    const filterAccountSelect = document.getElementById('filter-account');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');

    // --- MODAL ELEMENTS (Dynamic) ---
    let initialAiSuggestionSection, refineSuggestionBtn, outreachSubjectInput, outreachBodyTextarea;
    let customPromptSection, customPromptInput, generateCustomBtn, cancelCustomBtn;
    let customSuggestionOutput, customOutreachSubjectInput, customOutreachBodyTextarea;
    let copyCustomBtn, sendEmailCustomBtn;
    let contactSelector, logInteractionNotes, logInteractionBtn, createTaskDesc, createTaskDueDate, createTaskBtn, noContactMessage;
    let alertRelevanceDisplay, alertRelevanceEmoji;

    // --- DATA FETCHING ---
    async function loadAllData() {
        if (!state.currentUser) return;

        const [
            { data: alerts, error: alertsError },
            { data: accounts, error: accountsError },
            { data: contacts, error: contactsError }
        ] = await Promise.all([
            supabase.from("cognito_alerts").select("*").eq("user_id", state.currentUser.id),
            supabase.from("accounts").select("*").eq("user_id", state.currentUser.id),
            supabase.from("contacts").select("*").eq("user_id", state.currentUser.id)
        ]);
        
        if (alertsError) console.error("Error fetching Cognito alerts:", alertsError);
        if (accountsError) console.error("Error fetching accounts:", accountsError);
        if (contactsError) console.error("Error fetching contacts:", contactsError);

        state.alerts = alerts || [];
        state.accounts = accounts || [];
        state.contacts = contacts || [];

        populateAccountFilter();
        renderAlerts();
    }

    function populateAccountFilter() {
        filterAccountSelect.innerHTML = '<option value="">All Accounts</option>';
        state.accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.name;
            filterAccountSelect.appendChild(option);
        });
        if (state.filterAccountId) {
            filterAccountSelect.value = state.filterAccountId;
        }
    }

    // --- RENDER FUNCTIONS ---
    function renderAlerts() {
        alertsContainer.innerHTML = '';
        
        let alertsToRender = state.viewMode === 'dashboard'
            ? state.alerts.filter(a => a.status === 'New')
            : state.alerts.filter(a => a.status !== 'New');

        if (state.filterTriggerType) {
            alertsToRender = alertsToRender.filter(alert => alert.trigger_type === state.filterTriggerType);
        }
        if (state.filterRelevance) {
            alertsToRender = alertsToRender.filter(alert => alert.relevance_score === parseInt(state.filterRelevance));
        }
        if (state.filterAccountId) {
            alertsToRender = alertsToRender.filter(alert => alert.account_id === parseInt(state.filterAccountId));
        }

        alertsToRender.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (alertsToRender.length === 0 && state.viewMode === 'dashboard') {
            alertsContainer.innerHTML = `<p class="placeholder-text">No new intelligence alerts today. The archive is available if you need to review past items.</p>`;
        } else if (alertsToRender.length === 0) {
            alertsContainer.innerHTML = `<p class="placeholder-text">The Intelligence Archive is empty or no alerts match your filters.</p>`;
        } else {
            alertsToRender.forEach(alert => {
                const account = state.accounts.find(acc => acc.id === alert.account_id);
                const card = document.createElement('div');
                card.className = 'alert-card';
                card.dataset.alertId = alert.id;

                const actionButtonsHTML = alert.status === 'New' ? `
                    <div class="alert-actions">
                        <button class="btn-primary action-btn" data-action="action">Action</button>
                        <button class="btn-secondary action-btn" data-action="dismiss">Dismiss</button>
                    </div>` : '';
                
                const relevanceScore = alert.relevance_score || 0;
                const relevanceEmoji = relevanceScore >= 4 ? ' 🔥' : '';
                const relevanceDisplay = `<span class="alert-relevance-pill">Score: ${relevanceScore}/5${relevanceEmoji}</span>`;

                card.innerHTML = `
                    <div class="alert-header">
                        <span class="alert-trigger-type" data-type="${alert.trigger_type}">${alert.trigger_type}</span>
                        <span class="alert-status" data-status="${alert.status}">${alert.status}</span>
                    </div>
                    <h4 class="alert-account-name">${account ? account.name : `Account ID #${alert.account_id} (Not Found)`}</h4>
                    <h5 class="alert-headline">${alert.headline}</h5>
                    <p class="alert-summary">${alert.summary}</p>
                    <div class="alert-footer">
                        <span class="alert-source">Source: <a href="${alert.source_url}" target="_blank">${alert.source_name || 'N/A'}</a></span>
                        <span class="alert-date">${formatDate(alert.created_at)}</span>
                        ${relevanceDisplay}
                    </div>
                    ${actionButtonsHTML}
                `;
                alertsContainer.appendChild(card);
            });
        }
    }

    // --- ACTION CENTER LOGIC (GEMINI INTEGRATED) ---
    async function showActionCenter(alertId) {
        state.selectedAlert = state.alerts.find(a => a.id === alertId);
        if (!state.selectedAlert) return;
    
        const account = state.accounts.find(acc => acc.id === state.selectedAlert.account_id);
        if (!account) {
            alert(`Error: Could not find the corresponding account (ID: ${state.selectedAlert.account_id}) in your Constellation database.`);
            return;
        }
        
        showModal('Action Center', `
            <div class="loader"></div>
            <p class="placeholder-text" style="text-align: center;">Generating AI suggestion...</p>
        `, null, false, `
            <button id="modal-mark-completed-btn" class="btn-primary">Mark Completed</button>
            <button id="modal-close-btn" class="btn-secondary">Close</button>
        `);
        
        document.getElementById('modal-mark-completed-btn').style.display = 'none';
    
        document.getElementById('modal-close-btn').addEventListener('click', hideModal);
        document.getElementById('modal-mark-completed-btn').addEventListener('click', handleMarkCompleted);
    
        const initialOutreachCopy = await generateOutreachCopy(state.selectedAlert, account);
        
        document.getElementById('modal-mark-completed-btn').style.display = 'inline-block';
    
        state.initialSuggestionSubject = initialOutreachCopy.subject;
        state.initialSuggestionBody = initialOutreachCopy.body;
    
        const relevantContacts = state.contacts.filter(c => c.account_id === state.selectedAlert.account_id && c.email);
        const contactOptions = relevantContacts.map(c => `<option value="${c.id}">${c.first_name} ${c.last_name} (${c.title || 'No Title'})</option>`).join('');
    
        let suggestedContactId = null;
        if(relevantContacts.length > 0) {
            if(state.selectedAlert.trigger_type === 'C-Suite Change') {
                const cLevelContact = relevantContacts.find(c => c.title && (c.title.includes('CIO') || c.title.includes('CTO') || c.title.includes('Chief')));
                suggestedContactId = cLevelContact ? cLevelContact.id : relevantContacts[0].id;
            } else {
                suggestedContactId = relevantContacts[0].id;
            }
        }
        
        const currentRelevanceScore = state.selectedAlert.relevance_score || 0;
        const modalRelevanceEmoji = currentRelevanceScore >= 4 ? ' 🔥' : '';
        const relevanceSectionHTML = `<p class="alert-relevance">Relevance: <span id="relevance-score-display">${currentRelevanceScore}/5</span><span id="relevance-fire-emoji">${modalRelevanceEmoji}</span></p>`;
    
        const modalBodyContent = `
            <div class="action-center-content">
                <div class="action-center-section">
                    <h5>Suggested Outreach</h5>
                    ${relevanceSectionHTML}
                    <label for="contact-selector">Suggested Contact:</label>
                    <select id="contact-selector" ${relevantContacts.length === 0 ? 'disabled' : ''}>
                        <option value="">-- Select a Contact --</option>
                        ${contactOptions}
                    </select>
                    <div id="initial-ai-suggestion-section">
                        <label for="outreach-subject">Suggested Subject:</label>
                        <input type="text" id="outreach-subject" value="${initialOutreachCopy.subject}" readonly>
                        <label for="outreach-body">Suggested Body:</label>
                        <textarea id="outreach-body" rows="8" readonly>${initialOutreachCopy.body}</textarea>
                        <div class="action-buttons">
                            <button class="btn-secondary" id="copy-btn">Copy</button>
                            <button class="btn-primary" id="send-email-btn">Open Email Client</button>
                        </div>
                        <button class="btn-tertiary" id="refine-suggestion-btn" style="margin-top: 15px;">Refine with Custom Prompt</button>
                    </div>
                    <div id="custom-prompt-section" style="display: none; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color);">
                        <h5>Custom Suggestion Generator</h5>
                        <p class="placeholder-text">Enter your specific instructions to refine or get a new email suggestion based on the alert.</p>
                        <label for="custom-prompt-input">Your Custom Prompt:</label>
                        <textarea id="custom-prompt-input" rows="4" placeholder="e.g., 'Make the email more urgent and focus on a direct call to action for a meeting.'"></textarea>
                        <button class="btn-primary" id="generate-custom-btn" style="width: 100%; margin-top: 10px;">Generate Custom Suggestion</button>
                        <button class="btn-secondary" id="cancel-custom-btn" style="width: 100%; margin-top: 10px;">Back to Initial Suggestion</button>
                        <div id="custom-suggestion-output" style="display: none; margin-top: 20px; padding-top: 15px; border-top: 1px dashed var(--border-color);">
                            <h6>Custom AI Suggestion:</h6>
                            <label for="custom-outreach-subject">Subject:</label>
                            <input type="text" id="custom-outreach-subject" value="" readonly>
                            <label for="custom-outreach-body">Body:</label>
                            <textarea id="custom-outreach-body" rows="8" readonly></textarea>
                            <div class="action-buttons">
                                <button class="btn-secondary" id="copy-custom-btn">Copy Custom</button>
                                <button class="btn-primary" id="send-email-custom-btn">Open Email Client (Custom)</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="action-center-section">
                    <h5>Log Actions in Constellation</h5>
                    <label for="log-interaction-notes">Log an Interaction:</label>
                    <textarea id="log-interaction-notes" rows="4" placeholder="e.g., Emailed the new CIO..." ${relevantContacts.length === 0 ? 'disabled' : ''}></textarea>
                    <button class="btn-secondary" id="log-interaction-btn" style="width: 100%; margin-bottom: 15px;" ${relevantContacts.length === 0 ? 'disabled' : ''}>Log to Constellation</button>
                    <label for="create-task-desc">Create a Task:</label>
                    <input type="text" id="create-task-desc" placeholder="e.g., Follow up with new CIO in 1 week" ${relevantContacts.length === 0 ? 'disabled' : ''}>
                    <label for="create-task-due-date">Due Date:</label>
                    <input type="date" id="create-task-due-date" ${relevantContacts.length === 0 ? 'disabled' : ''}>
                    <button class="btn-primary" id="create-task-btn" style="width: 100%;" ${relevantContacts.length === 0 ? 'disabled' : ''}>Create in Constellation</button>
                    <p class="placeholder-text" style="color: var(--warning-yellow); margin-top: 10px; ${relevantContacts.length === 0 ? '' : 'display: none;'}" id="no-contact-message">
                        Add a contact to this account in Constellation to enable logging and task creation.
                    </p>
                </div>
            </div>`;
    
        const modalBodyElement = document.getElementById('modal-body');
        if (modalBodyElement) {
            modalBodyElement.innerHTML = modalBodyContent; 
        }
    
        // Re-select all elements now that they are in the DOM
        contactSelector = document.getElementById('contact-selector');
        initialAiSuggestionSection = document.getElementById('initial-ai-suggestion-section');
        refineSuggestionBtn = document.getElementById('refine-suggestion-btn');
        outreachSubjectInput = document.getElementById('outreach-subject');
        outreachBodyTextarea = document.getElementById('outreach-body');
        customPromptSection = document.getElementById('custom-prompt-section');
        customPromptInput = document.getElementById('custom-prompt-input');
        generateCustomBtn = document.getElementById('generate-custom-btn');
        cancelCustomBtn = document.getElementById('cancel-custom-btn');
        customSuggestionOutput = document.getElementById('custom-suggestion-output');
        customOutreachSubjectInput = document.getElementById('custom-outreach-subject');
        customOutreachBodyTextarea = document.getElementById('custom-outreach-body');
        copyCustomBtn = document.getElementById('copy-custom-btn');
        sendEmailCustomBtn = document.getElementById('send-email-custom-btn');
        logInteractionNotes = document.getElementById('log-interaction-notes');
        logInteractionBtn = document.getElementById('log-interaction-btn');
        createTaskDesc = document.getElementById('create-task-desc');
        createTaskDueDate = document.getElementById('create-task-due-date');
        createTaskBtn = document.getElementById('create-task-btn');
        noContactMessage = document.getElementById('no-contact-message');
        alertRelevanceDisplay = document.getElementById('relevance-score-display');
        alertRelevanceEmoji = document.getElementById('relevance-fire-emoji');
    
        initialAiSuggestionSection.style.display = 'block';
        customPromptSection.style.display = 'none';
    
        contactSelector.addEventListener('change', handleContactChange);
        document.getElementById('send-email-btn').addEventListener('click', () => handleEmailAction(false));
        document.getElementById('copy-btn').addEventListener('click', () => handleCopyAction(false));
        document.getElementById('log-interaction-btn').addEventListener('click', handleLogInteraction);
        document.getElementById('create-task-btn').addEventListener('click', handleCreateTask);
    
        refineSuggestionBtn.addEventListener('click', () => {
            initialAiSuggestionSection.style.display = 'none';
            customPromptSection.style.display = 'block';
            customSuggestionOutput.style.display = 'none';
            customPromptInput.value = '';
            customOutreachSubjectInput.value = '';
            customOutreachBodyTextarea.value = '';
        });
    
        cancelCustomBtn.addEventListener('click', () => {
            customPromptSection.style.display = 'none';
            initialAiSuggestionSection.style.display = 'block';
        });
    
        generateCustomBtn.addEventListener('click', async () => {
            const customPrompt = customPromptInput.value.trim();
            if (!customPrompt) {
                alert("Please enter a prompt to generate a custom suggestion.");
                return;
            }
    
            generateCustomBtn.disabled = true;
            generateCustomBtn.textContent = 'Generating...';
            customOutreachSubjectInput.value = 'Generating...';
            customOutreachBodyTextarea.value = 'Generating...';
    
            const customOutreachCopy = await generateCustomOutreachCopy(
                state.selectedAlert, account, customPrompt,
                state.initialSuggestionSubject, state.initialSuggestionBody,
                ORIGINAL_PROMPT_BASE_TEXT
            );
    
            generateCustomBtn.disabled = false;
            generateCustomBtn.textContent = 'Generate Custom Suggestion';
    
            if (customOutreachCopy) {
                customOutreachSubjectInput.value = customOutreachCopy.subject;
                customOutreachBodyTextarea.value = customOutreachCopy.body;
                customSuggestionOutput.style.display = 'block';
                handlePersonalizeOutreach({ subject: customOutreachCopy.subject, body: customOutreachCopy.body }, contactSelector.value, true);
            } else {
                customOutreachSubjectInput.value = 'Error generating suggestion.';
                customOutreachBodyTextarea.value = 'Please try again or check the console for details.';
            }
        });
    
        copyCustomBtn.addEventListener('click', () => handleCopyAction(true));
        sendEmailCustomBtn.addEventListener('click', () => handleEmailAction(true));
    
        if (suggestedContactId) {
            contactSelector.value = suggestedContactId;
            contactSelector.dispatchEvent(new Event('change'));
        }
    
        if (relevantContacts.length === 0) {
            logInteractionNotes.disabled = true;
            logInteractionBtn.disabled = true;
            createTaskDesc.disabled = true;
            createTaskDueDate.disabled = true;
            createTaskBtn.disabled = true;
            noContactMessage.style.display = 'block';
        } else {
            logInteractionNotes.disabled = false;
            logInteractionBtn.disabled = false;
            createTaskDesc.disabled = false;
            createTaskDueDate.disabled = false;
            createTaskBtn.disabled = false;
            noContactMessage.style.display = 'none';
        }
    }

    function handlePersonalizeOutreach(outreachCopy, selectedContactId, isCustomTarget = false) {
        const targetBodyTextarea = isCustomTarget ? customOutreachBodyTextarea : outreachBodyTextarea;
        if (!targetBodyTextarea) return;

        if (selectedContactId) {
            const contact = state.contacts.find(c => c.id === Number(selectedContactId));
            if (contact) {
                targetBodyTextarea.value = outreachCopy.body.replace(/\[FirstName\]/g, `${contact.first_name}`);
            } else {
                targetBodyTextarea.value = outreachCopy.body;
            }
        } else {
            targetBodyTextarea.value = outreachCopy.body;
        }
    }

    async function generateOutreachCopy(alert, account) {
        try {
            const { data, error } = await supabase.functions.invoke('get-gemini-suggestion', {
                body: { alertData: alert, accountData: account }
            });
            if (error) throw error;
            return data; 
        } catch (error) {
            console.error("Error invoking get-gemini-suggestion Edge Function:", error);
            return { 
                subject: `Following up on ${account.name}'s latest news`, 
                body: `Hi [FirstName],\n\nI saw the recent news about "${alert.headline}" and wanted to reach out.\n\n[Could not generate AI suggestion. Please write your message here.]\n\nBest regards,\n[Your Name]`
            };
        }
    }

    async function generateCustomOutreachCopy(alert, account, customPrompt, previousSubject, previousBody, originalBasePrompt) {
        try {
            const { data, error } = await supabase.functions.invoke('generate-custom-suggestion', {
                body: {
                    alertData: alert, accountData: account, customPrompt: customPrompt,
                    previousSubject: previousSubject, previousBody: previousBody,
                    originalBasePrompt: originalBasePrompt
                }
            });
            if (error) throw error;
            return data;
        } catch (error) {
            console.error("Error invoking generate-custom-suggestion Edge Function:", error);
            return {
                subject: `Custom Suggestion Error: ${account.name}'s news`,
                body: `Hi [FirstName],\n\n[Failed to generate custom AI suggestion: ${error.message}]\n\nBest regards,\n[Your Name]`
            };
        }
    }

    // --- ACTION HANDLERS (Integration with Constellation) ---
    async function handleContactChange(e) {
        const selectedContactId = e.target.value;
        const initialAiCopyForPersonalization = {
            subject: state.initialSuggestionSubject,
            body: state.initialSuggestionBody
        };
        outreachSubjectInput.value = initialAiCopyForPersonalization.subject;
        handlePersonalizeOutreach(initialAiCopyForPersonalization, selectedContactId, false);

        if (customSuggestionOutput && customSuggestionOutput.style.display === 'block') {
            const currentCustomSubject = customOutreachSubjectInput.value;
            const currentCustomBody = customOutreachBodyTextarea.value;
            if (currentCustomSubject && currentCustomBody) {
                handlePersonalizeOutreach({subject: currentCustomSubject, body: currentCustomBody}, selectedContactId, true);
            }
        }
    }

    function handleEmailAction(isCustom = false) { 
        const contactId = contactSelector.value;
        if (!contactId) {
            alert('Please select a contact to email.');
            return;
        }
        const contact = state.contacts.find(c => c.id === Number(contactId));
        if (!contact || !contact.email) {
            alert('Selected contact does not have an email address.');
            return;
        }

        const subject = isCustom ? customOutreachSubjectInput.value : outreachSubjectInput.value;
        const body = isCustom ? customOutreachBodyTextarea.value : outreachBodyTextarea.value;
        window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    function handleCopyAction(isCustom = false) { 
        const body = isCustom ? customOutreachBodyTextarea.value : outreachBodyTextarea.value;
        navigator.clipboard.writeText(body).then(() => {
            alert('Email body copied to clipboard!');
        });
    }
    
    async function handleMarkCompleted() {
        if (!state.selectedAlert) return;
        console.log(`Marking alert ${state.selectedAlert.id} as completed.`);
        await updateAlertStatus(state.selectedAlert.id, 'Actioned');
        hideModal();
    }

    async function handleLogInteraction() {
        const selectedContactId = contactSelector.value;
        if (!selectedContactId) {
            alert('Please select a contact to log this interaction against.');
            return;
        }

        const notes = logInteractionNotes.value.trim();
        if (!notes) {
            alert('Please enter notes for the interaction.');
            return;
        }

        const { error } = await supabase.from('activities').insert({
            account_id: state.selectedAlert.account_id,
            contact_id: Number(selectedContactId),
            type: 'Cognito Intelligence',
            description: `[${state.selectedAlert.trigger_type}] ${state.selectedAlert.headline} - Notes: ${notes}`,
            user_id: state.currentUser.id,
            date: new Date().toISOString()
        });

        if (error) {
            alert('Error logging interaction: ' + error.message);
        } else {
            alert('Interaction logged to Constellation!');
            logInteractionNotes.value = '';
        }
    }

    async function handleCreateTask() {
        const selectedContactId = contactSelector.value;
        if (!selectedContactId) {
            alert('Please select a contact to associate with this task.');
            return;
        }
        
        const description = createTaskDesc.value.trim();
        const dueDate = createTaskDueDate.value;
        if (!description) {
            alert('Please enter a description for the task.');
            return;
        }

        const { error } = await supabase.from('tasks').insert({
            account_id: state.selectedAlert.account_id,
            contact_id: Number(selectedContactId),
            description: `Cognito: ${description}`,
            due_date: dueDate || null,
            status: 'Pending',
            user_id: state.currentUser.id
        });

        if (error) {
            alert('Error creating task: ' + error.message);
        } else {
            alert('Task created in Constellation!');
            createTaskDesc.value = '';
            createTaskDueDate.value = '';
        }
    }

    async function updateAlertStatus(alertId, newStatus) {
        console.log(`Updating alert ${alertId} status to ${newStatus}.`);
        const { error } = await supabase.from('cognito_alerts').update({ status: newStatus }).eq('id', alertId);
        if (error) {
            alert('Error updating alert status: ' + error.message);
        }
        await loadAllData();
    }

    // --- EVENT LISTENER SETUP ---
    function setupPageEventListeners() {
        setupModalListeners();
        
        dashboardViewBtn.addEventListener('click', () => {
            state.viewMode = 'dashboard';
            pageTitle.textContent = 'New Alerts';
            dashboardViewBtn.classList.add('active');
            archiveViewBtn.classList.remove('active');
            renderAlerts();
        });

        archiveViewBtn.addEventListener('click', () => {
            state.viewMode = 'archive';
            pageTitle.textContent = 'Intelligence Archive';
            archiveViewBtn.classList.add('active');
            dashboardViewBtn.classList.remove('active');
            renderAlerts();
        });

        alertsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.action-btn');
            if (!button) return;

            const card = e.target.closest('.alert-card');
            if (!card) return;

            const alertId = Number(card.dataset.alertId);
            const action = button.dataset.action;

            if (action === 'action') {
                showActionCenter(alertId);
            } else if (action === 'dismiss') {
                showModal("Confirm Dismissal", "Are you sure you want to dismiss this alert?", () => {
                    updateAlertStatus(alertId, 'Dismissed');
                    hideModal();
                });
            }
        });

        filterTriggerTypeSelect.addEventListener('change', (e) => {
            state.filterTriggerType = e.target.value;
            renderAlerts();
        });

        filterRelevanceSelect.addEventListener('change', (e) => {
            state.filterRelevance = e.target.value;
            renderAlerts();
        });

        filterAccountSelect.addEventListener('change', (e) => {
            state.filterAccountId = e.target.value;
            renderAlerts();
        });

        clearFiltersBtn.addEventListener('click', () => {
            state.filterTriggerType = '';
            state.filterRelevance = '';
            state.filterAccountId = '';
            filterTriggerTypeSelect.value = '';
            filterRelevanceSelect.value = '';
            filterAccountSelect.value = '';
            renderAlerts();
        });
    }

 // --- INITIALIZATION ---
async function initializePage() {
    await loadSVGs();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        state.currentUser = session.user;
        await setupUserMenuAndAuth(supabase, state);
        updateActiveNavLink();
        setupPageEventListeners();
        await setupGlobalSearch(supabase, state.currentUser);
        await loadAllData(); 

        // NUKE-LEVEL FIX: Await the check, THEN update the visit time.
        await checkAndSetNotifications(supabase);
        updateLastVisited(supabase, 'cognito');
    } else {
        window.location.href = "index.html";
    }
}
initializePage();
});
