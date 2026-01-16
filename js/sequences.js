import { SUPABASE_URL, SUPABASE_ANON_KEY, formatDate, parseCsvRow, themes, setupModalListeners, showModal, hideModal, updateActiveNavLink, setupUserMenuAndAuth, addDays, loadSVGs, setupGlobalSearch, checkAndSetNotifications } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    console.log("sequences.js script started parsing.");
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

   let state = {
    currentUser: null,
    sequences: [],
    sequence_steps: [],
    products: [], // <-- ADD THIS LINE
    selectedSequenceId: null,
    contacts: [],
    activities: [],
    accounts: [], 
    contact_sequences: [],
    isEditingSequenceDetails: false,
    originalSequenceName: '',
    originalSequenceDescription: '',
    editingStepId: null,
    originalStepValues: {},
    aiGeneratedSteps: []
};

    // --- DOM Element Selectors ---
    const logoutBtn = document.getElementById("logout-btn");
    const sequenceList = document.getElementById("sequence-list");
    const addSequenceBtn = document.getElementById("add-sequence-btn");
    const importMarketingSequenceBtn = document.getElementById("import-marketing-sequence-btn");
    const importSequenceBtn = document.getElementById("bulk-import-sequence-steps-btn");
    const sequenceCsvInput = document.getElementById("sequence-steps-csv-input");
    const deleteSequenceBtn = document.getElementById("delete-sequence-btn");
    const bulkAssignBtn = document.getElementById("bulk-assign-btn"); // The new button
    const sequenceStepsTableBody = document.querySelector("#sequence-steps-table-body");
    const addStepBtn = document.getElementById("add-step-btn");
    const sequenceNameInput = document.getElementById("sequence-name");
    const sequenceDescriptionTextarea = document.getElementById("sequence-description");
    const sequenceIdInput = document.getElementById("sequence-id");
    const sequenceDetailsPanel = document.getElementById("sequence-details");

    // AI Generation Section Selectors
    const aiSequenceGoalTextarea = document.getElementById("ai-sequence-goal");
    const aiTotalDurationInput = document.getElementById("ai-total-duration");
    const aiNumStepsInput = document.getElementById("ai-num-steps");
    const aiStepTypeEmailCheckbox = document.getElementById("ai-step-type-email");
    const aiStepTypeLinkedinCheckbox = document.getElementById("ai-step-type-linkedin");
    const aiStepTypeCallCheckbox = document.getElementById("ai-step-type-call");
    const aiStepTypeTaskCheckbox = document.getElementById("ai-step-type-task");
    const aiStepTypeOtherCheckbox = document.getElementById("ai-step-type-other");
    const aiStepTypeOtherInput = document.getElementById("ai-step-type-other-input");
    const aiPersonaPromptTextarea = document.getElementById("ai-persona-prompt");
    const aiGenerateSequenceBtn = document.getElementById("ai-generate-sequence-btn");
    const aiGeneratedSequencePreview = document.getElementById("ai-generated-sequence-preview");
    const aiGeneratedSequenceForm = document.getElementById("ai-generated-sequence-form");
    const saveAiSequenceBtn = document.getElementById("save-ai-sequence-btn");
    const cancelAiSequenceBtn = document.getElementById("cancel-ai-sequence-btn");
    
    // --- Data Fetching ---
  async function loadAllData() {
    if (!state.currentUser) return;
    
    const userSpecificTables = ["sequences", "contacts", "accounts", "contact_sequences", "sequence_steps", "activities"];
    const promises = userSpecificTables.map((table) =>
        supabase.from(table).select("*").eq("user_id", state.currentUser.id)
    );
    // Add promise for product_knowledge without a user_id filter
    promises.push(supabase.from('product_knowledge').select('product_name'));
    
    try {
        const results = await Promise.allSettled(promises);
        
        // Use a combined list for processing results
        const allTables = [...userSpecificTables, 'product_knowledge']; 

        results.forEach((result, index) => {
            const tableName = allTables[index];
            if (result.status === "fulfilled" && !result.value.error) {
                state[tableName] = result.value.data || [];
            } else {
                console.error(`Error fetching ${tableName}:`, result.status === 'fulfilled' ? result.value.error?.message : result.reason);
            }
        });

        // Process products into a unique, sorted list
        if (state.product_knowledge) {
            state.products = [...new Set(state.product_knowledge.map(p => p.product_name))].sort();
        }

    } catch (error) {
        console.error("Critical error in loadAllData:", error);
    } finally {
        renderSequenceList();
        renderProductCheckboxes(); // Call the new render function
        if (state.selectedSequenceId && state.sequences.some(s => s.id === state.selectedSequenceId)) {
            renderSequenceDetails(state.selectedSequenceId);
        } else {
            clearSequenceDetailsPanel(false);
        }
    }
}
    // --- Render Functions ---
    const renderSequenceList = () => {
        if (!sequenceList) return;
        sequenceList.innerHTML = "";
        state.sequences
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            .forEach((seq) => {
                const item = document.createElement("div");
                item.className = "list-item";
                item.dataset.id = seq.id;

                const isMarketingSource = seq.source === 'Marketing';
                const indicatorHtml = isMarketingSource ? '<i class="fa-solid fa-bullhorn marketing-indicator" title="Imported from Marketing"></i>' : '';
                
                const activeContacts = state.contact_sequences.filter(cs => cs.sequence_id === seq.id && cs.status === 'Active').length;
                const finishedSequences = state.contact_sequences.filter(cs => cs.sequence_id === seq.id && (cs.status === 'Completed' || cs.status === 'Removed'));
                const completedCount = finishedSequences.filter(cs => cs.status === 'Completed').length;
                const successRate = finishedSequences.length > 0 ? Math.round((completedCount / finishedSequences.length) * 100) : 0;

                item.innerHTML = `
                    <div class="sequence-info">
                        <div class="sequence-name">${indicatorHtml} ${seq.name}</div>
                        <div class="sequence-list-stats"> 
                            <span>Active: ${activeContacts}</span>
                            <span class="success-rate">Success: ${successRate}%</span>
                        </div>
                    </div>
                `;

                if (seq.id === state.selectedSequenceId) {
                    item.classList.add("selected");
                }
                sequenceList.appendChild(item);
            });
    };
function renderProductCheckboxes() {
    const productListContainer = document.getElementById('ai-product-list');
    if (!productListContainer) return;

    // --- CHANGE: Apply your existing class name ---
    productListContainer.className = 'checkbox-group'; 

    if (state.products.length === 0) {
        productListContainer.innerHTML = '<p class="placeholder-text">No products found.</p>';
        return;
    }

    // Use a simple 'div' wrapper to match the structure of your "Step Types"
    productListContainer.innerHTML = state.products.map(product => `
        <div>
            <input type="checkbox" id="seq-prod-${product.replace(/\s+/g, '-')}" class="ai-product-checkbox" value="${product}">
            <label for="seq-prod-${product.replace(/\s+/g, '-')}">${product}</label>
        </div>
    `).join('');
}
    const renderSequenceSteps = () => {
        if (!sequenceStepsTableBody) return;
        sequenceStepsTableBody.innerHTML = "";
        if (!state.selectedSequenceId) return;

        const steps = state.sequence_steps
            .filter(s => s.sequence_id === state.selectedSequenceId)
            .sort((a, b) => a.step_number - b.step_number);

        steps.forEach((step, index) => {
            const row = sequenceStepsTableBody.insertRow();
            row.dataset.id = step.id;
            const isEditingThisStep = state.editingStepId === step.id;
            const isFirstStep = index === 0;
            const isLastStep = index === steps.length - 1;
            const isReadOnly = false; 

            const actionsHtml = isReadOnly ? '<td>Read-Only</td>' : `
                <td>
                    <div class="actions-cell-content">
                        ${isEditingThisStep ?
                            `
                            <button class="btn btn-sm btn-success save-step-btn" data-id="${step.id}">Save</button>
                            <button class="btn btn-sm btn-secondary cancel-step-btn" data-id="${step.id}">Cancel</button>
                            ` :
                            `
                            <button class="btn btn-sm btn-secondary move-up-btn ${isFirstStep ? 'hidden' : ''}" data-id="${step.id}" title="Move Up"><i class="fas fa-arrow-up"></i></button>
                            <button class="btn btn-sm btn-primary edit-step-btn" data-id="${step.id}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                            <button class="btn btn-sm btn-secondary move-down-btn ${isLastStep ? 'hidden' : ''}" data-id="${step.id}" title="Move Down"><i class="fas fa-arrow-down"></i></button>
                            <button class="btn btn-sm btn-danger delete-step-btn" data-id="${step.id}" title="Delete"><i class="fas fa-trash-can"></i></button>
                            `
                        }
                    </div>
                </td>`;

            const assignedToHtml = isEditingThisStep ? `
    <select class="form-control edit-step-assigned-to">
        <option value="Sales" ${ (step.assigned_to || 'Sales') === 'Sales' ? 'selected' : '' }>Sales</option>
        <option value="Sales Manager" ${ (step.assigned_to === 'Sales Manager') ? 'selected' : '' }>Sales Manager</option>
        <option value="Marketing" ${ (step.assigned_to === 'Marketing') ? 'selected' : '' }>Marketing</option>
    </select>
` : (step.assigned_to || 'Sales');
            
           row.innerHTML = `
    <td>${step.step_number}</td>
    <td>${isEditingThisStep ? `<input type="text" class="edit-step-type" value="${step.type || ''}">` : (step.type || '')}</td>
    <td>${isEditingThisStep ? `<input type="number" class="edit-step-delay" value="${step.delay_days || 0}">` : (step.delay_days || 0)}</td>
    <td>${isEditingThisStep ? `<input type="text" class="edit-step-subject" value="${step.subject || ''}">` : (step.subject || '')}</td>
    <td>${isEditingThisStep ? `<textarea class="edit-step-message">${step.message || ''}</textarea>` : (step.message || '')}</td>
    <td>${assignedToHtml}</td> 
    ${actionsHtml}
`;
        });
    };
    
    const renderSequenceDetails = (sequenceId) => {
        const sequence = state.sequences.find(s => s.id === sequenceId);
        state.selectedSequenceId = sequenceId;

        if (!sequenceDetailsPanel) return;
        sequenceDetailsPanel.classList.remove('hidden');

        if (!sequence) {
            clearSequenceDetailsPanel(false);
            return;
        }

        sequenceIdInput.value = sequence.id;
        sequenceNameInput.value = sequence.name || "";
        sequenceDescriptionTextarea.value = sequence.description || "";
        state.originalSequenceName = sequence.name || "";
        state.originalSequenceDescription = sequence.description || "";
        
        const isReadOnly = false;
        
        sequenceNameInput.disabled = isReadOnly;
        sequenceDescriptionTextarea.disabled = isReadOnly;

        deleteSequenceBtn.style.display = 'inline-block';
        addStepBtn.style.display = 'inline-block';
        bulkAssignBtn.style.display = 'inline-block'; // Show the bulk assign button
        
        state.editingStepId = null;
        renderSequenceSteps();
    };

    const clearSequenceDetailsPanel = (hidePanel = true) => {
        state.selectedSequenceId = null;
        if (sequenceIdInput) sequenceIdInput.value = "";
        if (sequenceNameInput) {
            sequenceNameInput.value = "";
            sequenceNameInput.disabled = true;
        }
        if (sequenceDescriptionTextarea) {
            sequenceDescriptionTextarea.value = "";
            sequenceDescriptionTextarea.disabled = true;
        }
        if (sequenceStepsTableBody) sequenceStepsTableBody.innerHTML = "";

        if (hidePanel && sequenceDetailsPanel) {
            sequenceDetailsPanel.classList.add('hidden');
        } else if (sequenceDetailsPanel) {
            sequenceDetailsPanel.classList.remove('hidden');
            if (sequenceNameInput) sequenceNameInput.value = "No Sequence Selected";
            if (sequenceDescriptionTextarea) sequenceDescriptionTextarea.value = "Select a sequence from the left or create a new one.";
        }

        if (deleteSequenceBtn) deleteSequenceBtn.style.display = 'none';
        if (addStepBtn) addStepBtn.style.display = 'none';
        if (bulkAssignBtn) bulkAssignBtn.style.display = 'none'; // Hide the bulk assign button

        document.querySelectorAll("#sequence-list .selected").forEach(item => item.classList.remove("selected"));
        state.editingStepId = null;
        state.originalStepValues = {};
        state.aiGeneratedSteps = [];
        aiGeneratedSequencePreview.classList.add('hidden');
    };

    function setupPageEventListeners() {
        setupModalListeners();
        updateActiveNavLink();
        if (logoutBtn) logoutBtn.addEventListener("click", async () => { await supabase.auth.signOut(); window.location.href = "index.html"; });
        if (addSequenceBtn) addSequenceBtn.addEventListener("click", handleNewSequenceClick);
        if (importMarketingSequenceBtn) importMarketingSequenceBtn.addEventListener('click', showMarketingSequencesForImport);
        if (importSequenceBtn) importSequenceBtn.addEventListener("click", () => {
            if (!state.selectedSequenceId) return showModal("Error", "Please select a sequence to import steps into.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            if (state.isEditingSequenceDetails || state.editingStepId) { showModal("Error", "Please save or cancel any active edits before importing steps.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`); return; }
            sequenceCsvInput.click();
        });
        if(sequenceCsvInput) sequenceCsvInput.addEventListener("change", handleCsvImport);
        if (deleteSequenceBtn) deleteSequenceBtn.addEventListener("click", handleDeleteSequence);
        if (addStepBtn) addStepBtn.addEventListener("click", handleAddStep);
        if (bulkAssignBtn) bulkAssignBtn.addEventListener("click", handleBulkAssignClick); // Event listener for new button
        if (sequenceList) sequenceList.addEventListener("click", handleSequenceListClick);
        if (sequenceStepsTableBody) sequenceStepsTableBody.addEventListener("click", handleSequenceStepActions);

        document.body.addEventListener("click", (e) => {
            const target = e.target;
            if (target.classList.contains("suggested-type-btn")) {
                const stepTypeInput = document.getElementById("modal-step-type");
                if (stepTypeInput) {
                    stepTypeInput.value = target.dataset.type;
                    stepTypeInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });

        if (aiStepTypeOtherCheckbox && aiStepTypeOtherInput) {
            aiStepTypeOtherCheckbox.addEventListener('change', () => {
                aiStepTypeOtherInput.disabled = !aiStepTypeOtherCheckbox.checked;
                if (!aiStepTypeOtherCheckbox.checked) {
                    aiStepTypeOtherInput.value = '';
                }
            });
        }

        if (aiGenerateSequenceBtn) aiGenerateSequenceBtn.addEventListener("click", handleAiGenerateSequence);
        if (saveAiSequenceBtn) saveAiSequenceBtn.addEventListener("click", handleSaveAiSequence);
        if (cancelAiSequenceBtn) cancelAiSequenceBtn.addEventListener("click", handleCancelAiSequence);
    }
    
async function handleBulkAssignClick() {
    if (!state.selectedSequenceId) {
        showModal("Error", "Please select a sequence first.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        return;
    }

    const activeContactIds = new Set(state.contact_sequences.filter(cs => cs.status === 'Active').map(cs => cs.contact_id));
    
    const availableContacts = state.contacts
        .filter(contact => !activeContactIds.has(contact.id))
        .sort((a, b) => (a.last_name || "").localeCompare(b.last_name || ""));

    if (availableContacts.length === 0) {
        showModal("No Available Contacts", "All of your contacts are already in an active sequence.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        return;
    }

    // Generate unique lists for datalist dropdowns.
    const uniqueTitles = [...new Set(state.contacts.map(c => c.title).filter(Boolean))];
    const uniqueCompanies = [...new Set(state.accounts.map(a => a.name).filter(Boolean))];
    const uniqueIndustries = [...new Set(state.accounts.map(a => a.industry).filter(Boolean))];

    const titlesDatalist = `<datalist id="titles-list">${uniqueTitles.map(t => `<option value="${t}"></option>`).join('')}</datalist>`;
    const companiesDatalist = `<datalist id="companies-list">${uniqueCompanies.map(c => `<option value="${c}"></option>`).join('')}</datalist>`;
    const industriesDatalist = `<datalist id="industries-list">${uniqueIndustries.map(i => `<option value="${i}"></option>`).join('')}</datalist>`;

    const modalBody = `
        <p>Select contacts to add to this sequence. Contacts already in an active sequence are not shown.</p>
        
        ${titlesDatalist}
        ${companiesDatalist}
        ${industriesDatalist}

        <div class="filter-controls">
            <input type="text" id="filter-title" class="form-control" placeholder="Filter by Title..." list="titles-list">
            <input type="text" id="filter-company" class="form-control" placeholder="Filter by Company..." list="companies-list">
            <input type="text" id="filter-industry" class="form-control" placeholder="Filter by Industry..." list="industries-list">
            <select id="filter-activity" class="form-control">
                <option value="all">Recent Activity (All)</option>
                <option value="yes">Has Recent Activity</option>
                <option value="no">No Recent Activity</option>
            </select>
        </div>

<label class="bulk-assign-select-all">
    <input type="checkbox" id="select-all-checkbox" class="bulk-assign-checkbox">
    <span>Select All / Deselect All</span>
</label>

        <div class="item-list-container-modal" id="bulk-assign-contact-list">
            </div>
    `;

    showModal("Bulk Assign Contacts", modalBody, processBulkAssignment, true, `<button id="modal-confirm-btn" class="btn-primary">Assign Selected</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
    
    setTimeout(() => {
        const contactListContainer = document.getElementById('bulk-assign-contact-list');
        const titleFilter = document.getElementById('filter-title');
        const companyFilter = document.getElementById('filter-company');
        const industryFilter = document.getElementById('filter-industry');
        const activityFilter = document.getElementById('filter-activity');
        const selectAllCheckbox = document.getElementById('select-all-checkbox');

        if (!contactListContainer) return;

        const renderFilteredContacts = () => {
            const titleQuery = titleFilter.value.toLowerCase();
            const companyQuery = companyFilter.value.toLowerCase();
            const industryQuery = industryFilter.value.toLowerCase();
            const activityQuery = activityFilter.value;
            
            const filteredContacts = availableContacts.filter(contact => {
                const account = state.accounts.find(a => a.id === contact.account_id) || {};
                
                const titleMatch = !titleQuery || (contact.title && contact.title.toLowerCase().includes(titleQuery));
                const companyMatch = !companyQuery || (account.name && account.name.toLowerCase().includes(companyQuery));
                const industryMatch = !industryQuery || (account.industry && account.industry.toLowerCase().includes(industryQuery));

                const hasActivity = state.activities.some(act => act.contact_id === contact.id);
                const activityMatch = activityQuery === 'all' || (activityQuery === 'yes' && hasActivity) || (activityQuery === 'no' && !hasActivity);

                return titleMatch && companyMatch && industryMatch && activityMatch;
            });

            if (filteredContacts.length > 0) {
                contactListContainer.innerHTML = filteredContacts.map(contact => {
                    const account = state.accounts.find(a => a.id === contact.account_id);
                    const contactActivities = state.activities.filter(act => act.contact_id === contact.id).sort((a, b) => new Date(b.date) - new Date(a.date));
                    const lastActivity = contactActivities.length > 0 ? `Last Activity: ${formatDate(contactActivities[0].date)}` : "No activity";
                    
                    return `
                        <div class="list-item contact-item-row"> 
                            <input type="checkbox" id="contact-${contact.id}" data-contact-id="${contact.id}" class="bulk-assign-checkbox">
                            <label for="contact-${contact.id}">
                                <div class="contact-main-info">
                                    <div class="contact-name">${contact.first_name} ${contact.last_name}</div>
                                    <div class="contact-title-company">${contact.title || 'No Title'} at ${account ? account.name : 'No Account'}</div>
                                </div>
                                <span class="last-activity-date">${lastActivity}</span>
                            </label>
                        </div>
                    `;
                }).join('');
            } else {
                contactListContainer.innerHTML = `<p class="placeholder-text">No contacts match the current filters.</p>`;
            }
            
            selectAllCheckbox.checked = false;
        };
        
        titleFilter.addEventListener('input', renderFilteredContacts);
        companyFilter.addEventListener('input', renderFilteredContacts);
        industryFilter.addEventListener('input', renderFilteredContacts);
        activityFilter.addEventListener('change', renderFilteredContacts);

        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const visibleCheckboxes = contactListContainer.querySelectorAll('.bulk-assign-checkbox');
            visibleCheckboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
            });
        });

        renderFilteredContacts();
    }, 0);
}
    
async function processBulkAssignment() {
    const selectedContactIds = Array.from(document.querySelectorAll('.bulk-assign-checkbox:checked')).map(cb => Number(cb.dataset.contactId));

    if (selectedContactIds.length === 0) {
        showModal("No Selection", "No contacts were selected.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        return false; // Prevents the assignment modal from closing
    }

    const firstStep = state.sequence_steps
        .filter(s => s.sequence_id === state.selectedSequenceId)
        .sort((a, b) => a.step_number - b.step_number)[0];

    if (!firstStep) {
        showModal("Error", "This sequence has no steps. Please add steps before assigning contacts.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        return false;
    }

    const newContactSequences = selectedContactIds.map(contactId => ({
        contact_id: contactId,
        sequence_id: state.selectedSequenceId,
        current_step_number: 1,
        status: 'Active',
        next_step_due_date: addDays(new Date(), firstStep.delay_days).toISOString(),
        user_id: state.currentUser.id
    }));

    const { error } = await supabase.from('contact_sequences').insert(newContactSequences);

    if (error) {
        showModal("Error", "Error assigning contacts: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        return false;
    }

    // --- THIS IS THE FIX ---

    // 1. Manually hide the first modal (the contact list).
    hideModal();

    // 2. Show the success modal. The data reload will only happen AFTER the user clicks "OK".
    showModal(
        "Success",
        `${selectedContactIds.length} contact(s) have been successfully added to the sequence.`,
        async () => {
            hideModal(); // Close the success modal
            await loadAllData(); // THEN reload the data
        },
        false, // Don't show a cancel button
        `<button id="modal-confirm-btn" class="btn-primary">OK</button>`
    );

    // 3. Return 'false' to prevent the original modal from trying to close itself again.
    //    This is the key to stopping the race condition.
    return false;
}
                    
    // --- All other existing functions ---

    function handleSequenceListClick(e) {
        const item = e.target.closest(".list-item");

        if (item) {
            const sequenceId = Number(item.dataset.id);
            if (state.isEditingSequenceDetails || state.editingStepId || state.aiGeneratedSteps.length > 0) {
                showModal("Unsaved Changes", "You have unsaved changes. Do you want to discard them?", () => {
                    state.isEditingSequenceDetails = false;
                    state.editingStepId = null;
                    state.aiGeneratedSteps = [];
                    if(aiGeneratedSequencePreview) aiGeneratedSequencePreview.classList.add('hidden');
                    renderSequenceDetails(sequenceId);
                    document.querySelectorAll("#sequence-list .selected").forEach(i => i.classList.remove("selected"));
                    item.classList.add("selected");
                    hideModal();
                }, true, `<button id="modal-confirm-btn" class="btn-primary">Discard</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            } else {
                renderSequenceDetails(sequenceId);
                document.querySelectorAll("#sequence-list .selected").forEach(i => i.classList.remove("selected"));
                item.classList.add("selected");
            }
        }
    }

    function handleNewSequenceClick() {
        if (state.isEditingSequenceDetails || state.editingStepId || state.aiGeneratedSteps.length > 0) {
            showModal("Unsaved Changes", "You have unsaved changes or an active AI generation preview. Do you want to discard them and add a new sequence?", () => {
                state.isEditingSequenceDetails = false;
                state.editingStepId = null;
                state.aiGeneratedSteps = [];
                aiGeneratedSequencePreview.classList.add('hidden');
                clearSequenceDetailsPanel(false);
                hideModal();
                showNewSequenceModal();
            }, true, `<button id="modal-confirm-btn" class="btn-primary">Discard & New</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        } else {
            showNewSequenceModal();
        }
    }
    
    function showNewSequenceModal() {
        showModal("New Personal Sequence", `<label>Sequence Name</label><input type="text" id="modal-sequence-name" required>`, async () => {
            const name = document.getElementById("modal-sequence-name").value.trim();
            if (name) {
                const { data: newSeq, error } = await supabase.from("sequences").insert([{ name, source: 'Personal', user_id: state.currentUser.id }]).select().single();
                if (error) { showModal("Error", "Error adding sequence: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`); return false; }
                state.selectedSequenceId = newSeq.id;
                await loadAllData();
                hideModal();
                renderSequenceDetails(newSeq.id);
                return true;
            } else { showModal("Error", "Sequence name is required.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`); return false; }
        }, true, `<button id="modal-confirm-btn" class="btn-primary">Create</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
    }

    function handleDeleteSequence() {
        if (!state.selectedSequenceId) return showModal("Error", "Please select a sequence to delete.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        const sequence = state.sequences.find(s => s.id === state.selectedSequenceId);
        if (!sequence) return;

        if (sequence.source === 'Marketing') {
             showModal(
                "Confirm Removal",
                `Are you sure you want to remove the imported sequence "${sequence.name}"? This will delete your personal copy but not the original marketing template.`,
                async () => {
                    await supabase.from("sequence_steps").delete().eq("sequence_id", state.selectedSequenceId);
                    await supabase.from("sequences").delete().eq("id", state.selectedSequenceId);
                    clearSequenceDetailsPanel(true);
                    await loadAllData();
                    hideModal();
                }, true, `<button id="modal-confirm-btn" class="btn-danger">Remove</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        } else {
            if (state.isEditingSequenceDetails || state.editingStepId || state.aiGeneratedSteps.length > 0) {
                showModal("Error", "Please save or cancel any active edits or AI generation preview before deleting.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`); return; }
            showModal("Confirm Deletion", "Are you sure? This will delete the sequence and all its steps.", async () => {
                await supabase.from("sequence_steps").delete().eq("sequence_id", state.selectedSequenceId);
                await supabase.from("sequences").delete().eq("id", state.selectedSequenceId);
                clearSequenceDetailsPanel(true);
                await loadAllData();
                hideModal();
            }, true, `<button id="modal-confirm-btn" class="btn-danger">Delete</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        }
    }
    
    function handleAddStep() {
        if (!state.selectedSequenceId) return showModal("Error", "Please select a sequence.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        if (state.isEditingSequenceDetails || state.editingStepId || state.aiGeneratedSteps.length > 0) {
            showModal("Error", "Please save or cancel any active edits or AI generation preview first.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`); return; }
        const steps = state.sequence_steps.filter(s => s.sequence_id === state.selectedSequenceId);
        const nextNum = steps.length > 0 ? Math.max(...steps.map(s => s.step_number)) + 1 : 1;
        
        const suggestedTypesHtml = `
            <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-start; padding: 0 5px;">
                <button type="button" class="btn-sm btn-secondary suggested-type-btn" data-type="Email" style="flex-grow: 1; min-width: 80px;">Email</button>
                <button type="button" class="btn-sm btn-secondary suggested-type-btn" data-type="Call" style="flex-grow: 1; min-width: 80px;">Call</button>
                <button type="button" class="btn-sm btn-secondary suggested-type-btn" data-type="LinkedIn" style="flex-grow: 1; min-width: 80px;">LinkedIn</button>
                <button type="button" class="btn-sm btn-secondary suggested-type-btn" data-type="Task" style="flex-grow: 1; min-width: 80px;">Task</button>
            </div>
        `;

        showModal("Add Sequence Step", `
            <label>Step Number</label><input type="number" id="modal-step-number" value="${nextNum}" required>
            <label>Type</label><input type="text" id="modal-step-type" required placeholder="e.g., Email, Call, LinkedIn">
            ${suggestedTypesHtml}
            <label>Subject (for Email)</label><input type="text" id="modal-step-subject" placeholder="Optional">
            <label>Message (for Email/Notes)</label><textarea id="modal-step-message" placeholder="Optional"></textarea>
            <label>Delay (Days after previous step)</label><input type="number" id="modal-step-delay" value="0" required>
        `, async () => {
            const newStep = {
                sequence_id: state.selectedSequenceId,
                step_number: parseInt(document.getElementById("modal-step-number").value),
                type: document.getElementById("modal-step-type").value.trim(),
                subject: document.getElementById("modal-step-subject").value.trim(),
                message: document.getElementById("modal-step-message").value.trim(),
                delay_days: parseInt(document.getElementById("modal-step-delay").value),
                user_id: state.currentUser.id
            };
            if (!newStep.type) { showModal("Error", "Step Type is required.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`); return false; }
            await supabase.from("sequence_steps").insert([newStep]);
            await loadAllData();
            hideModal();
            return true;
        }, true, `<button id="modal-confirm-btn" class="btn-primary">Add Step</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
    }

    async function handleSequenceStepActions(e) {
        const targetButton = e.target.closest('button');
        if (!targetButton) return;
    
        const row = targetButton.closest("tr[data-id]");
        if (!row) return;

        const stepId = Number(row.dataset.id);

        if (state.isEditingSequenceDetails || state.aiGeneratedSteps.length > 0) {
            showModal("Error", "Please save or cancel other edits before modifying steps.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }

        if (targetButton.matches(".edit-step-btn, .edit-step-btn *")) {
            if (state.editingStepId) { 
                showModal("Error", "Please save or cancel the current step edit first.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return;
            }
            state.editingStepId = stepId;
            renderSequenceSteps();
        } else if (targetButton.matches(".save-step-btn, .save-step-btn *")) {
            const updatedStep = {
                type: row.querySelector(".edit-step-type").value.trim(),
                subject: row.querySelector(".edit-step-subject").value.trim(),
                message: row.querySelector(".edit-step-message").value.trim(),
                delay_days: parseInt(row.querySelector(".edit-step-delay").value || 0, 10),
                assigned_to: row.querySelector(".edit-step-assigned-to").value,
            };
            if (!updatedStep.type) { 
                showModal("Error", "Step Type is required.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return;
            }
            await supabase.from("sequence_steps").update(updatedStep).eq("id", stepId);
            state.editingStepId = null;
            await loadAllData();
        } else if (targetButton.matches(".cancel-step-btn, .cancel-step-btn *")) {
            state.editingStepId = null;
            renderSequenceSteps();
        } else if (targetButton.matches(".delete-step-btn, .delete-step-btn *")) {
            if (state.editingStepId) { 
                showModal("Error", "Please save or cancel the current step edit first.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return;
            }
            showModal("Confirm Delete Step", "Are you sure you want to delete this step?", async () => {
                await supabase.from("sequence_steps").delete().eq("id", stepId);
                await loadAllData();
                hideModal();
            }, true, `<button id="modal-confirm-btn" class="btn-danger">Delete</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        } else if (targetButton.matches(".move-up-btn, .move-up-btn *")) {
            if (state.editingStepId) {
                showModal("Error", "Please save or cancel any active edits first.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return;
            }
            await handleMoveStep(stepId, 'up');
        } else if (targetButton.matches(".move-down-btn, .move-down-btn *")) {
            if (state.editingStepId) {
                showModal("Error", "Please save or cancel any active edits first.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return;
            }
            await handleMoveStep(stepId, 'down');
        }
    }

    async function handleMoveStep(stepId, direction) {
        const allStepsInSequence = state.sequence_steps
            .filter(s => s.sequence_id === state.selectedSequenceId)
            .sort((a, b) => a.step_number - b.step_number);
    
        const currentIndex = allStepsInSequence.findIndex(s => s.id === stepId);
        if (currentIndex === -1) return;
    
        let targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
        if (targetIndex < 0 || targetIndex >= allStepsInSequence.length) return;
    
        const [movedStep] = allStepsInSequence.splice(currentIndex, 1);
        allStepsInSequence.splice(targetIndex, 0, movedStep);
    
        const updates = allStepsInSequence.map((step, index) => ({
            id: step.id,
            step_number: index + 1
        }));
        
        const updatePromises = updates.map(update => 
            supabase
                .from("sequence_steps")
                .update({ step_number: update.step_number })
                .eq('id', update.id)
        );
    
        const results = await Promise.all(updatePromises);
        const firstError = results.find(res => res.error);
    
        if (firstError) {
            console.error("Error re-ordering steps:", firstError.error);
            showModal("Error", "Could not re-order the steps. Please try again.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        }
    
        await loadAllData();
    }
    
    function handleCsvImport(e) {
        if (!state.selectedSequenceId) return;
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = async function(e) {
            const rows = e.target.result.split("\n").filter((r) => r.trim() !== "");
            const existingSteps = state.sequence_steps.filter(s => s.sequence_id === state.selectedSequenceId);
            let nextAvailableStepNumber = existingSteps.length > 0 ? Math.max(...existingSteps.map(s => s.step_number)) + 1 : 1;

            const newRecords = rows.slice(1).map((row, index) => {
                const c = parseCsvRow(row);
                if (c.length < 5) return null;
                const delayDays = parseInt(c[4], 10);
                if (isNaN(delayDays)) return null;

                return {
                    sequence_id: state.selectedSequenceId,
                    step_number: nextAvailableStepNumber + index,
                    type: c[1] || "",
                    subject: c[2] || "",
                    message: c[3] || "",
                    delay_days: delayDays,
                    user_id: state.currentUser.id
                };
            }).filter(record => record !== null);
            
            if (newRecords.length > 0) {
                const { error } = await supabase.from("sequence_steps").insert(newRecords);
                if (error) {
                    showModal("Error", "Error importing steps: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                }
                else {
                    showModal("Success", `${newRecords.length} steps imported.`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    await loadAllData();
                }
            } else {
                showModal("Info", "No valid records found to import.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            }
        };
        r.readAsText(f);
        e.target.value = "";
    }
    
async function showMarketingSequencesForImport() {
    try {
        // CHANGED: Use our RPC function to get both ABM and Marketing sequences
        const { data: allSharedSequences, error } = await supabase.rpc('get_all_sequences_for_marketing');
        if (error) throw error;

        const personalSequenceNames = new Set(state.sequences.map(s => s.name));
        // Filter out any sequences the user already has a personal copy of by name
        const availableSequences = allSharedSequences.filter(s => !personalSequenceNames.has(s.name));

        if (availableSequences.length === 0) {
            showModal("Import Sequence", "<p>All available shared sequences have already been imported.</p>", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }

        const sequenceOptionsHtml = availableSequences.map(seq => {
            // Add a visual tag to distinguish the sequence types
            const typeTag = seq.sequence_type === 'abm' ? '[ABM]' : '[Marketing]';
            return `
                <div class="list-item" data-id="${seq.id}" data-type="${seq.sequence_type}" style="cursor: pointer; margin-bottom: 5px;">
                    <input type="radio" name="shared_sequence" value="${seq.id}" id="seq-${seq.id}" style="margin-right: 10px;">
                    <label for="seq-${seq.id}" style="flex-grow: 1; cursor: pointer;"><strong>${typeTag}</strong> ${seq.name}</label>
                </div>
            `;
        }).join('');

        const modalBody = `<div class="import-modal-list">${sequenceOptionsHtml}</div>`;
        showModal("Import Shared Sequence", modalBody, importMarketingSequence, true, `<button id="modal-confirm-btn" class="btn-primary">Import Selected</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);

    } catch (error) {
        showModal("Error", "Error fetching shared sequences: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
    }
}
    
async function importMarketingSequence() {
    // Find the div wrapper for the selected radio to get the data-type attribute
    const selectedRadio = document.querySelector('input[name="shared_sequence"]:checked');
    if (!selectedRadio) {
        showModal("Error", "Please select a sequence to import.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        return false;
    }

    const selectedDiv = selectedRadio.closest('.list-item');
    const sourceSeqId = Number(selectedDiv.dataset.id);
    const sourceSeqType = selectedDiv.dataset.type;

    let originalSequence = null;
    let originalSteps = null;
    let error = null;

    // NEW: Logic to fetch from the correct source tables based on type
    if (sourceSeqType === 'abm') {
        // Fetch from the main 'sequences' and 'sequence_steps' tables
        const { data: seqData, error: seqError } = await supabase.from('sequences').select('*').eq('id', sourceSeqId).single();
        if (seqError) error = seqError;
        originalSequence = seqData;

        const { data: stepsData, error: stepsError } = await supabase.from('sequence_steps').select('*').eq('sequence_id', sourceSeqId);
        if (stepsError) error = stepsError;
        originalSteps = stepsData;
    } else {
        // Fetch from the old 'marketing_sequences' and 'marketing_sequence_steps' tables
        const { data: seqData, error: seqError } = await supabase.from('marketing_sequences').select('*').eq('id', sourceSeqId).single();
        if (seqError) error = seqError;
        originalSequence = seqData;

        const { data: stepsData, error: stepsError } = await supabase.from('marketing_sequence_steps').select('*').eq('marketing_sequence_id', sourceSeqId);
        if (stepsError) error = stepsError;
        originalSteps = stepsData;
    }

    if (error || !originalSequence) {
        showModal("Error", "Error fetching original sequence details: " + (error?.message || 'Unknown error'), null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        return false;
    }

    // This part remains the same: create a new PERSONAL sequence in the 'sequences' table
    const { data: newPersonalSequence, error: insertSeqError } = await supabase.from('sequences').insert({
        name: originalSequence.name,
        description: originalSequence.description,
        source: 'Marketing', // We still label the source as 'Marketing' for the user's view
        is_abm: sourceSeqType === 'abm', // Carry over the ABM flag
        user_id: state.currentUser.id
    }).select().single();

    if (insertSeqError) {
        showModal("Error", "Failed to create new sequence. You may already have a sequence with this name. Error: " + insertSeqError.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        return false;
    }

    // This part also remains the same: copy the steps into the 'sequence_steps' table
    if (originalSteps && originalSteps.length > 0) {
        const newSteps = originalSteps.map(step => ({
            sequence_id: newPersonalSequence.id,
            step_number: step.step_number,
            type: step.type,
            subject: step.subject,
            message: step.message,
            delay_days: step.delay_days,
            assigned_to: step.assigned_to || 'Sales', // Default to Sales if not specified
            user_id: state.currentUser.id
        }));
        const { error: insertStepsError } = await supabase.from('sequence_steps').insert(newSteps);
        if (insertStepsError) {
            // Clean up the failed sequence creation
            await supabase.from('sequences').delete().eq('id', newPersonalSequence.id);
            showModal("Error", "Failed to copy sequence steps. Error: " + insertStepsError.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return false;
        }
    }

    hideModal();
    showModal("Success", `Sequence "${originalSequence.name}" imported successfully!`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
    await loadAllData();
    state.selectedSequenceId = newPersonalSequence.id;
    renderSequenceList();
    renderSequenceDetails(newPersonalSequence.id);

    return true;
}

   async function handleAiGenerateSequence() {
    if (state.isEditingSequenceDetails || state.editingStepId || state.aiGeneratedSteps.length > 0) {
        showModal("Error", "Please save or cancel any active edits or AI generation preview first.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        return;
    }

    const sequenceGoal = aiSequenceGoalTextarea.value.trim();
    const totalDuration = parseInt(aiTotalDurationInput.value, 10);
    const numSteps = parseInt(aiNumStepsInput.value, 10);
    const selectedStepTypes = [];
    if (aiStepTypeEmailCheckbox.checked) selectedStepTypes.push(aiStepTypeEmailCheckbox.value);
    if (aiStepTypeLinkedinCheckbox.checked) selectedStepTypes.push(aiStepTypeLinkedinCheckbox.value);
    if (aiStepTypeCallCheckbox.checked) selectedStepTypes.push(aiStepTypeCallCheckbox.value);
    if (aiStepTypeTaskCheckbox.checked) selectedStepTypes.push(aiStepTypeTaskCheckbox.value);
    if (aiStepTypeOtherCheckbox.checked) {
        const customType = aiStepTypeOtherInput.value.trim();
        if (customType) {
            selectedStepTypes.push(customType);
        } else {
            showModal("Error", "Please provide a name for the 'Other' step type.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }
    }
    const personaPrompt = aiPersonaPromptTextarea.value.trim();

    // --- NEW: Gather product and industry info ---
    const selectedProducts = Array.from(document.querySelectorAll('#ai-product-list .ai-product-checkbox:checked')).map(cb => cb.value);
    const selectedIndustry = document.getElementById('ai-industry-select').value;

    if (!sequenceGoal || isNaN(totalDuration) || totalDuration < 1 || numSteps < 1 || selectedStepTypes.length === 0 || !personaPrompt) {
        showModal("Error", "Please fill out all AI generation fields correctly.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        return;
    }

    showModal("Generating Sequence", `<div class="loader"></div><p class="placeholder-text" style="text-align: center;">AI is drafting your sequence steps...</p>`, null, false, `<button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);

    try {
        // --- UPDATED: Call function with new data ---
        const { data, error } = await supabase.functions.invoke('generate-sequence-steps', {
            body: { 
                sequenceGoal, 
                numSteps, 
                totalDuration, 
                stepTypes: selectedStepTypes, 
                personaPrompt,
                product_names: selectedProducts,
                industry: selectedIndustry
            }
        });

        if (error) throw error;

        state.aiGeneratedSteps = data.steps.map((step, index) => ({
            id: `ai-temp-${index}`,
            step_number: index + 1,
            type: step.type,
            subject: step.subject || '',
            message: step.message || '',
            delay_days: step.delay_days || 0,
            isEditing: false
        }));

        renderAiGeneratedStepsPreview();
        hideModal();
        aiGeneratedSequencePreview.classList.remove('hidden');
        showModal("Success", "AI sequence generated! Review and save below.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);

    } catch (error) {
        console.error("Error generating AI sequence:", error);
        showModal("Error", `Failed to generate AI sequence: ${error.message}. Please try again.`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
    }
}
    function renderAiGeneratedStepsPreview() {
        if (!aiGeneratedSequenceForm) return;
        aiGeneratedSequenceForm.innerHTML = "";

        if (state.aiGeneratedSteps.length === 0) {
            aiGeneratedSequenceForm.innerHTML = "<p class='placeholder-text'>No steps generated yet.</p>";
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Step #</th>
                    <th>Type</th>
                    <th>Delay (Days)</th>
                    <th>Subject / Description</th>
                    <th>Content</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="ai-generated-steps-table-body"></tbody>
        `;
        aiGeneratedSequenceForm.appendChild(table);
        const tbody = table.querySelector("#ai-generated-steps-table-body");

        state.aiGeneratedSteps.forEach((step) => {
            const row = tbody.insertRow();
            row.dataset.id = step.id;
            const isEditingThisStep = step.isEditing;

            row.innerHTML = `
                <td>${step.step_number}</td>
                <td>${isEditingThisStep ? `<input type="text" class="edit-step-type" value="${step.type || ''}">` : (step.type || '')}</td>
                <td>${isEditingThisStep ? `<input type="number" class="edit-step-delay" value="${step.delay_days || 0}">` : (step.delay_days || 0)}</td>
                <td>${isEditingThisStep ? `<input type="text" class="edit-step-subject" value="${step.subject || ''}">` : (step.subject || '')}</td>
                <td>${isEditingThisStep ? `<textarea class="edit-step-message">${step.message || ''}</textarea>` : (step.message || '')}</td>
                <td>
                    <div class="actions-cell-content" style="grid-template-columns: repeat(auto-fit, minmax(40px, 1fr));">
                        ${isEditingThisStep ?
                            `
                            <button class="btn btn-sm btn-success save-ai-step-btn" data-id="${step.id}">Save</button>
                            <button class="btn btn-sm btn-secondary cancel-ai-step-btn" data-id="${step.id}">Cancel</button>
                            ` :
                            `
                            <button class="btn btn-sm btn-primary edit-ai-step-btn" data-id="${step.id}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
                            `
                        }
                    </div>
                </td>
            `;
        });

        tbody.addEventListener("click", (e) => {
            const target = e.target.closest("button");
            if (!target) return;
            const row = target.closest("tr[data-id]");
            if (!row) return;
            const stepId = row.dataset.id;
            const stepIndex = state.aiGeneratedSteps.findIndex(s => s.id === stepId);
            if (stepIndex === -1) return;

            if (target.matches(".edit-ai-step-btn, .edit-ai-step-btn *")) {
                state.aiGeneratedSteps[stepIndex].isEditing = true;
                state.aiGeneratedSteps[stepIndex].originalValues = { ...state.aiGeneratedSteps[stepIndex] };
                renderAiGeneratedStepsPreview();
            } else if (target.matches(".save-ai-step-btn, .save-ai-step-btn *")) {
                state.aiGeneratedSteps[stepIndex].type = row.querySelector(".edit-step-type").value.trim();
                state.aiGeneratedSteps[stepIndex].delay_days = parseInt(row.querySelector(".edit-step-delay").value || 0, 10);
                state.aiGeneratedSteps[stepIndex].subject = row.querySelector(".edit-step-subject").value.trim();
                state.aiGeneratedSteps[stepIndex].message = row.querySelector(".edit-step-message").value.trim();
                
                if (!state.aiGeneratedSteps[stepIndex].type) {
                    showModal("Error", "Step Type is required.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    return;
                }

                state.aiGeneratedSteps[stepIndex].isEditing = false;
                delete state.aiGeneratedSteps[stepIndex].originalValues;
                renderAiGeneratedStepsPreview();
            } else if (target.matches(".cancel-ai-step-btn, .cancel-ai-step-btn *")) {
                Object.assign(state.aiGeneratedSteps[stepIndex], state.aiGeneratedSteps[stepIndex].originalValues);
                state.aiGeneratedSteps[stepIndex].isEditing = false;
                delete state.aiGeneratedSteps[stepIndex].originalValues;
                renderAiGeneratedStepsPreview();
            }
        });
    }

    async function handleSaveAiSequence() {
        if (state.aiGeneratedSteps.some(step => step.isEditing)) {
            showModal("Error", "Please save or cancel all inline step edits before saving the sequence.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }

        showModal("Save AI Generated Sequence", `
            <label>New Sequence Name:</label>
            <input type="text" id="modal-new-sequence-name" required placeholder="e.g., AI Generated Outreach Sequence">
        `, async () => {
            const newSequenceName = document.getElementById("modal-new-sequence-name").value.trim();
            if (!newSequenceName) {
                showModal("Error", "Sequence name is required.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return false;
            }

            const existingSequence = state.sequences.find(s => s.name.toLowerCase() === newSequenceName.toLowerCase());
            if (existingSequence) {
                showModal("Error", "A sequence with this name already exists. Please choose a different name.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return false;
            }

            try {
                const { data: newSeqArr, error: seqError } = await supabase.from("sequences").insert([
                    { name: newSequenceName, description: "AI Generated Sequence", source: "AI", user_id: state.currentUser.id }
                ]).select();

                if (seqError) throw seqError;
                const newSequenceId = newSeqArr[0].id;

                const stepsToInsert = state.aiGeneratedSteps.map(step => ({
                    sequence_id: newSequenceId,
                    step_number: step.step_number,
                    type: step.type,
                    subject: step.subject,
                    message: step.message,
                    delay_days: step.delay_days,
                    user_id: state.currentUser.id
                }));

                if (stepsToInsert.length > 0) {
                    const { error: stepsError } = await supabase.from("sequence_steps").insert(stepsToInsert);
                    if (stepsError) throw stepsError;
                }

                state.aiGeneratedSteps = [];
                aiGeneratedSequencePreview.classList.add('hidden');
                state.selectedSequenceId = newSequenceId;
                await loadAllData();

                hideModal();
                showModal("Success", `AI-generated sequence "${newSequenceName}" saved successfully!`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return true;

            } catch (error) {
                console.error("Error saving AI generated sequence:", error);
                showModal("Error", `Failed to save AI sequence: ${error.message}.`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return false;
            }
        }, true, `<button id="modal-confirm-btn" class="btn-primary">Save Sequence</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
    }

    function handleCancelAiSequence() {
        showModal("Confirm Cancel", "Are you sure you want to discard the AI generated sequence?", () => {
            state.aiGeneratedSteps = [];
            aiGeneratedSequencePreview.classList.add('hidden');
            hideModal();
        }, true, `<button id="modal-confirm-btn" class="btn-danger">Discard</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
    }

    // --- App Initialization ---
    async function initializePage() {
        await loadSVGs();
        updateActiveNavLink();

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            state.currentUser = session.user;
            await setupUserMenuAndAuth(supabase, state);
            setupPageEventListeners();
            await setupGlobalSearch(supabase, state.currentUser); // <-- ADD THIS LINE
            await checkAndSetNotifications(supabase);
            await loadAllData();
        } else {
            window.location.href = "index.html";
        }
    }

    initializePage();
});
