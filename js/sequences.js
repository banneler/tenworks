import { SUPABASE_URL, SUPABASE_ANON_KEY, formatDate, parseCsvRow, themes, setupModalListeners, showModal, hideModal, updateActiveNavLink, setupUserMenuAndAuth, addDays, loadSVGs, setupGlobalSearch, checkAndSetNotifications, initializeAppState, getState } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    console.log("sequences.js script started parsing.");
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        sequences: [],
        sequence_steps: [],
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
    const bulkAssignBtn = document.getElementById("bulk-assign-btn");
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
        
        const tables = ["sequences", "contacts", "accounts", "contact_sequences", "sequence_steps", "activities"];
        const promises = tables.map((table) =>
            supabase.from(table).select("*").eq("user_id", state.currentUser.id)
        );
        
        try {
            const results = await Promise.allSettled(promises);
            results.forEach((result, index) => {
                const tableName = tables[index];
                if (result.status === "fulfilled" && !result.value.error) {
                    state[tableName] = result.value.data || [];
                } else {
                    console.error(`Error fetching ${tableName}:`, result.status === 'fulfilled' ? result.value.error?.message : result.reason);
                }
            });

        } catch (error) {
            console.error("Critical error in loadAllData:", error);
        } finally {
            renderSequenceList();
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

                const isShared = seq.source === 'Marketing';
                const indicatorHtml = isShared ? '<i class="fa-solid fa-users-gear shared-indicator" title="Shared with Team"></i>' : '';
                
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

            const actionsHtml = `
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
        
        sequenceNameInput.disabled = false;
        sequenceDescriptionTextarea.disabled = false;

        deleteSequenceBtn.style.display = 'inline-block';
        addStepBtn.style.display = 'inline-block';
        bulkAssignBtn.style.display = 'inline-block';
        
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
        if (bulkAssignBtn) bulkAssignBtn.style.display = 'none';

        document.querySelectorAll("#sequence-list .selected").forEach(item => item.classList.remove("selected"));
        state.editingStepId = null;
        state.originalStepValues = {};
        state.aiGeneratedSteps = [];
        aiGeneratedSequencePreview.classList.add('hidden');
    };

    // --- AI and Import Handlers ---
    async function showMarketingSequencesForImport() {
        try {
            // Simplified: Fetch all shared templates from marketing_sequences
            const { data: shared, error } = await supabase.from('marketing_sequences').select('*');
            if (error) throw error;

            const personalSequenceNames = new Set(state.sequences.map(s => s.name));
            const availableSequences = shared.filter(s => !personalSequenceNames.has(s.name));

            if (availableSequences.length === 0) {
                showModal("Import Sequence", "<p>All shared sequences have already been imported.</p>", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return;
            }

            const sequenceOptionsHtml = availableSequences.map(seq => `
                <div class="list-item" data-id="${seq.id}" style="cursor: pointer; margin-bottom: 5px;">
                    <input type="radio" name="shared_sequence" value="${seq.id}" id="seq-${seq.id}" style="margin-right: 10px;">
                    <label for="seq-${seq.id}" style="flex-grow: 1; cursor: pointer;"><strong>[Shared]</strong> ${seq.name}</label>
                </div>
            `).join('');

            showModal("Import Shared Sequence", `<div class="import-modal-list">${sequenceOptionsHtml}</div>`, importMarketingSequence, true, `<button id="modal-confirm-btn" class="btn-primary">Import Selected</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);

        } catch (error) {
            showModal("Error", "Error fetching shared sequences: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        }
    }

    async function importMarketingSequence() {
        const selectedRadio = document.querySelector('input[name="shared_sequence"]:checked');
        if (!selectedRadio) {
            showModal("Error", "Please select a sequence to import.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return false;
        }

        const sourceSeqId = Number(selectedRadio.value);
        
        // Fetch from marketing tables
        const { data: original } = await supabase.from('marketing_sequences').select('*').eq('id', sourceSeqId).single();
        const { data: steps } = await supabase.from('marketing_sequence_steps').select('*').eq('marketing_sequence_id', sourceSeqId);

        // Create personal copy
        const { data: newSeq, error: insertError } = await supabase.from("sequences").insert({
            name: original.name,
            description: original.description,
            source: 'Marketing',
            user_id: state.currentUser.id
        }).select().single();

        if (insertError) {
            showModal("Error", "Import failed: " + insertError.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return false;
        }

        if (steps && steps.length > 0) {
            const newSteps = steps.map(s => ({
                sequence_id: newSeq.id,
                step_number: s.step_number,
                type: s.type,
                subject: s.subject,
                message: s.message,
                delay_days: s.delay_days,
                user_id: state.currentUser.id
            }));
            await supabase.from("sequence_steps").insert(newSteps);
        }

        hideModal();
        await loadAllData();
        renderSequenceDetails(newSeq.id);
        return true;
    }

    async function handleAiGenerateSequence() {
        if (state.editingStepId || state.aiGeneratedSteps.length > 0) {
            showModal("Error", "Please finish current edits first.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }

        const goal = aiSequenceGoalTextarea.value.trim();
        const duration = parseInt(aiTotalDurationInput.value, 10);
        const steps = parseInt(aiNumStepsInput.value, 10);
        const persona = aiPersonaPromptTextarea.value.trim();
        const types = Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(cb => cb.value);

        if (!goal || !persona || types.length === 0) {
            showModal("Error", "Please fill out Goal, Persona, and at least one Step Type.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }

        showModal("Generating Sequence", `<div class="loader"></div><p style="text-align: center;">AI is drafting your fabrication sequence...</p>`, null, false, "");

        try {
            const { data, error } = await supabase.functions.invoke('generate-sequence', {
                body: { goal, numSteps: steps, totalDuration: duration, stepTypes: types, personaPrompt: persona }
            });

            if (error) throw error;

            state.aiGeneratedSteps = data.map((step, index) => ({
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

        } catch (error) {
            hideModal();
            showModal("Error", `AI failed: ${error.message}`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        }
    }

    // --- Bulk Assign and Data Utilities ---
    async function handleBulkAssignClick() {
        if (!state.selectedSequenceId) return;

        const activeIds = new Set(state.contact_sequences.filter(cs => cs.status === 'Active').map(cs => cs.contact_id));
        const available = state.contacts.filter(c => !activeIds.has(c.id)).sort((a, b) => (a.last_name || "").localeCompare(b.last_name || ""));

        if (available.length === 0) {
            showModal("No Contacts", "All contacts are currently in active sequences.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }

        const modalBody = `
            <div class="filter-controls">
                <input type="text" id="filter-title" class="form-control" placeholder="Filter Title...">
                <input type="text" id="filter-company" class="form-control" placeholder="Filter Company...">
            </div>
            <label class="bulk-assign-select-all">
                <input type="checkbox" id="select-all-checkbox"> <span>Select All</span>
            </label>
            <div class="item-list-container-modal" id="bulk-assign-contact-list"></div>
        `;

        showModal("Bulk Assign Contacts", modalBody, processBulkAssignment, true, `<button id="modal-confirm-btn" class="btn-primary">Assign Selected</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        
        // Timeout to let modal render before rendering list
        setTimeout(() => {
            const container = document.getElementById('bulk-assign-contact-list');
            container.innerHTML = available.map(c => `
                <div class="list-item">
                    <input type="checkbox" data-contact-id="${c.id}" class="bulk-assign-checkbox">
                    <label>${c.first_name} ${c.last_name} (${c.title || 'N/A'})</label>
                </div>
            `).join('');
            
            document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
                container.querySelectorAll('.bulk-assign-checkbox').forEach(cb => cb.checked = e.target.checked);
            });
        }, 50);
    }

    async function processBulkAssignment() {
        const selectedIds = Array.from(document.querySelectorAll('.bulk-assign-checkbox:checked')).map(cb => Number(cb.dataset.contactId));
        if (selectedIds.length === 0) return false;

        const firstStep = state.sequence_steps.filter(s => s.sequence_id === state.selectedSequenceId).sort((a, b) => a.step_number - b.step_number)[0];
        if (!firstStep) return false;

        const inserts = selectedIds.map(id => ({
            contact_id: id,
            sequence_id: state.selectedSequenceId,
            current_step_number: 1,
            status: 'Active',
            next_step_due_date: addDays(new Date(), firstStep.delay_days).toISOString(),
            user_id: state.currentUser.id
        }));

        await supabase.from('contact_sequences').insert(inserts);
        hideModal();
        showModal("Success", `Added ${selectedIds.length} contacts.`, async () => { hideModal(); await loadAllData(); }, false, `<button id="modal-confirm-btn" class="btn-primary">OK</button>`);
        return false;
    }

    // --- Standard Event Listeners ---
    function setupPageEventListeners() {
        setupModalListeners();
        if (logoutBtn) logoutBtn.addEventListener("click", async () => { await supabase.auth.signOut(); window.location.href = "index.html"; });
        if (addSequenceBtn) addSequenceBtn.addEventListener("click", handleNewSequenceClick);
        if (importMarketingSequenceBtn) importMarketingSequenceBtn.addEventListener('click', showMarketingSequencesForImport);
        if (deleteSequenceBtn) deleteSequenceBtn.addEventListener("click", handleDeleteSequence);
        if (addStepBtn) addStepBtn.addEventListener("click", handleAddStep);
        if (bulkAssignBtn) bulkAssignBtn.addEventListener("click", handleBulkAssignClick);
        if (sequenceList) sequenceList.addEventListener("click", handleSequenceListClick);
        if (sequenceStepsTableBody) sequenceStepsTableBody.addEventListener("click", handleSequenceStepActions);
        if (aiGenerateSequenceBtn) aiGenerateSequenceBtn.addEventListener("click", handleAiGenerateSequence);
        if (saveAiSequenceBtn) saveAiSequenceBtn.addEventListener("click", handleSaveAiSequence);
        if (cancelAiSequenceBtn) cancelAiSequenceBtn.addEventListener("click", handleCancelAiSequence);
        
        if (aiStepTypeOtherCheckbox && aiStepTypeOtherInput) {
            aiStepTypeOtherCheckbox.addEventListener('change', () => {
                aiStepTypeOtherInput.disabled = !aiStepTypeOtherCheckbox.checked;
            });
        }
    }

    function handleSequenceListClick(e) {
        const item = e.target.closest(".list-item");
        if (item) {
            const sequenceId = Number(item.dataset.id);
            if (state.editingStepId || state.aiGeneratedSteps.length > 0) {
                showModal("Unsaved Changes", "Discard active edits?", () => {
                    state.editingStepId = null;
                    state.aiGeneratedSteps = [];
                    aiGeneratedSequencePreview.classList.add('hidden');
                    renderSequenceDetails(sequenceId);
                    document.querySelectorAll("#sequence-list .selected").forEach(i => i.classList.remove("selected"));
                    item.classList.add("selected");
                    hideModal();
                }, true);
            } else {
                renderSequenceDetails(sequenceId);
                document.querySelectorAll("#sequence-list .selected").forEach(i => i.classList.remove("selected"));
                item.classList.add("selected");
            }
        }
    }

    function handleNewSequenceClick() {
        showModal("New Sequence", `<label>Name</label><input type="text" id="modal-sequence-name" required>`, async () => {
            const name = document.getElementById("modal-sequence-name").value.trim();
            if (name) {
                const { data: newSeq } = await supabase.from("sequences").insert([{ name, source: 'Personal', user_id: state.currentUser.id }]).select().single();
                state.selectedSequenceId = newSeq.id;
                await loadAllData();
                hideModal();
                renderSequenceDetails(newSeq.id);
            }
        }, true);
    }

    function handleDeleteSequence() {
        showModal("Delete Sequence", "Are you sure?", async () => {
            await supabase.from("sequence_steps").delete().eq("sequence_id", state.selectedSequenceId);
            await supabase.from("sequences").delete().eq("id", state.selectedSequenceId);
            clearSequenceDetailsPanel(true);
            await loadAllData();
            hideModal();
        }, true);
    }

    function handleAddStep() {
        const steps = state.sequence_steps.filter(s => s.sequence_id === state.selectedSequenceId);
        const nextNum = steps.length > 0 ? Math.max(...steps.map(s => s.step_number)) + 1 : 1;
        
        showModal("Add Step", `
            <label>Step #</label><input type="number" id="modal-step-number" value="${nextNum}" required>
            <label>Type</label><input type="text" id="modal-step-type" required placeholder="Email, Call, etc.">
            <label>Subject</label><input type="text" id="modal-step-subject">
            <label>Message</label><textarea id="modal-step-message"></textarea>
            <label>Delay (Days)</label><input type="number" id="modal-step-delay" value="2" required>
        `, async () => {
            const step = {
                sequence_id: state.selectedSequenceId,
                step_number: parseInt(document.getElementById("modal-step-number").value),
                type: document.getElementById("modal-step-type").value.trim(),
                subject: document.getElementById("modal-step-subject").value.trim(),
                message: document.getElementById("modal-step-message").value.trim(),
                delay_days: parseInt(document.getElementById("modal-step-delay").value),
                user_id: state.currentUser.id
            };
            await supabase.from("sequence_steps").insert([step]);
            await loadAllData();
            hideModal();
        }, true);
    }

    async function handleSequenceStepActions(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = Number(btn.closest("tr").dataset.id);

        if (btn.matches(".edit-step-btn")) {
            state.editingStepId = id;
            renderSequenceSteps();
        } else if (btn.matches(".save-step-btn")) {
            const row = btn.closest("tr");
            const update = {
                type: row.querySelector(".edit-step-type").value,
                subject: row.querySelector(".edit-step-subject").value,
                message: row.querySelector(".edit-step-message").value,
                delay_days: parseInt(row.querySelector(".edit-step-delay").value),
                assigned_to: row.querySelector(".edit-step-assigned-to").value
            };
            await supabase.from("sequence_steps").update(update).eq("id", id);
            state.editingStepId = null;
            await loadAllData();
        } else if (btn.matches(".delete-step-btn")) {
            await supabase.from("sequence_steps").delete().eq("id", id);
            await loadAllData();
        }
    }

    // --- Init ---
    async function initializePage() {
        await loadSVGs();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            state.currentUser = session.user;
            await setupUserMenuAndAuth(supabase, state);
            await setupGlobalSearch(supabase);
            await checkAndSetNotifications(supabase);
            setupPageEventListeners();
            await loadAllData();
        } else {
            window.location.href = "index.html";
        }
    }

    function renderAiGeneratedStepsPreview() {
        if (!aiGeneratedSequenceForm) return;
        aiGeneratedSequenceForm.innerHTML = state.aiGeneratedSteps.map(s => `
            <div class="ai-step-preview-row">
                <strong>Step ${s.step_number} (${s.type}):</strong> ${s.subject || 'No Subject'}
                <p>${s.message.substring(0, 100)}...</p>
            </div>
        `).join('');
    }

    async function handleSaveAiSequence() {
        const name = prompt("Enter a name for this sequence:");
        if (!name) return;
        
        const { data: newSeq } = await supabase.from("sequences").insert({
            name, description: "AI Draft", source: "AI", user_id: state.currentUser.id
        }).select().single();

        const steps = state.aiGeneratedSteps.map(s => ({
            sequence_id: newSeq.id,
            step_number: s.step_number,
            type: s.type,
            subject: s.subject,
            message: s.message,
            delay_days: s.delay_days,
            user_id: state.currentUser.id
        }));

        await supabase.from("sequence_steps").insert(steps);
        state.aiGeneratedSteps = [];
        aiGeneratedSequencePreview.classList.add('hidden');
        await loadAllData();
        renderSequenceDetails(newSeq.id);
    }

    function handleCancelAiSequence() {
        state.aiGeneratedSteps = [];
        aiGeneratedSequencePreview.classList.add('hidden');
    }

    initializePage();
});
