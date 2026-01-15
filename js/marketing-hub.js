// js/marketing-hub.js
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatDate,
    parseCsvRow,
    addDays,
    setupModalListeners,
    showModal,
    hideModal,
    setupUserMenuAndAuth,
    loadSVGs,
    updateActiveNavLink
} from './shared_constants.js';
import { initializeAbmSequenceEditor } from './abm-sequences.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        emailTemplates: [],
        marketingSequences: [], // For old, marketing-only sequences
        marketingSequenceSteps: [],
        abmSequences: [], // For new, collaborative ABM sequences
        abmSequenceSteps: [],
        user_quotas: [],
        abmTasks: [],
        myPosts: [],
        selectedTemplateId: null,
        selectedSequenceId: null,
        selectedSequenceType: null, // To track if 'abm' or 'marketing' is selected
        isEditingSequenceDetails: false,
        originalSequenceName: '',
        originalSequenceDescription: '',
        editingStepId: null,
        originalStepValues: {},
        currentView: 'abm-center'
    };

    let isLoginMode = true;

    // --- DOM Element Selectors ---
    const authContainer = document.getElementById("auth-container");
    const marketingHubContainer = document.getElementById("marketing-hub-container");
    const authForm = document.getElementById("auth-form");
    const authError = document.getElementById("auth-error");
    const authEmailInput = document.getElementById("auth-email");
    const authPasswordInput = document.getElementById("auth-password");
    const authSubmitBtn = document.getElementById("auth-submit-btn");
    const forgotPasswordLink = document.getElementById("forgot-password-link");
    const authToggleLink = document.getElementById("auth-toggle-link");
    const signupFields = document.getElementById("signup-fields");
    const authConfirmPasswordInput = document.getElementById("auth-confirm-password");
    
    
    // Nav Links
    const navAbmCenter = document.querySelector('a[href="#abm-center"]'); // NEW
    const navEmailTemplates = document.querySelector('a[href="#email-templates"]');
    const navSequences = document.querySelector('a[href="#sequences"]');
    const navSocialPosts = document.querySelector('a[href="#social-posts"]');
    
    // Views
    const abmCenterView = document.getElementById('abm-center-view'); // NEW
    const templatesSequencesView = document.getElementById('templates-sequences-view');
    const socialPostView = document.getElementById('social-post-view');

    // ABM Table Bodies
    const abmTasksDueTableBody = document.getElementById('abm-tasks-due-table-body'); // NEW
    const abmTasksUpcomingTableBody = document.getElementById('abm-tasks-upcoming-table-body'); // NEW
    const abmTasksCompletedTableBody = document.getElementById('abm-tasks-completed-table-body'); // NEW

    // General UI
    const createNewItemBtn = document.getElementById('create-new-item-btn');
    const importItemBtn = document.getElementById('import-item-btn');
    const itemCsvInput = document.getElementById('item-csv-input');
    const deleteSelectedItemBtn = document.getElementById('delete-selected-item-btn');
    const itemList = document.getElementById('item-list');
    const listHeader = document.getElementById('list-header');
    const dynamicDetailsPanel = document.getElementById('dynamic-details-panel');
    const downloadSequenceTemplateBtn = document.getElementById('download-sequence-template-btn');
    const createPostForm = document.getElementById('create-post-form');
    const submitPostBtn = document.getElementById('submit-post-btn');
    const formFeedback = document.getElementById('form-feedback');
    const myPostsContainer = document.getElementById('my-posts-container');


    // --- Helper functions ---
    const showTemporaryMessage = (message, isSuccess = true) => {
        if (authError) {
            authError.textContent = message;
            authError.style.color = isSuccess ? 'var(--success-color)' : 'var(--error-color)';
            authError.style.display = 'block';
        }
    };

    const clearErrorMessage = () => {
        if (authError) {
            authError.textContent = "";
            authError.style.display = 'none';
        }
    };

    const updateAuthUI = () => {
        if (authSubmitBtn) authSubmitBtn.textContent = isLoginMode ? "Login" : "Sign Up";
        if (authToggleLink) {
            authToggleLink.textContent = isLoginMode ? "Need an account? Sign Up" : "Have an account? Login";
        }
        clearErrorMessage();
        if (authForm) authForm.reset();

        if (signupFields) {
            if (isLoginMode) {
                signupFields.classList.add('hidden');
                if (authConfirmPasswordInput) authConfirmPasswordInput.removeAttribute('required');
            } else {
                signupFields.classList.remove('hidden');
                if (authConfirmPasswordInput) authConfirmPasswordInput.setAttribute('required', 'required');
            }
        }

        if (forgotPasswordLink) {
            if (isLoginMode) {
                forgotPasswordLink.classList.remove('hidden');
            } else {
                forgotPasswordLink.classList.add('hidden');
            }
        }
    };

    
    // --- Data Fetching ---
    async function loadAbmData() {
        // 1. Fetch all data needed to build the task list.
        const [
            { data: activeSequences, error: activeSeqError },
            { data: contacts, error: contactsError },
            { data: accounts, error: accountsError },
            { data: sequences, error: sequencesError },
            { data: sequenceSteps, error: sequenceStepsError }
        ] = await Promise.all([
            // Start by getting only the currently active sequences for all users.
            supabase.from('contact_sequences').select('*').eq('status', 'Active'),
            supabase.from('contacts').select('id, first_name, last_name, account_id'),
            supabase.from('accounts').select('id, name'),
            supabase.from('sequences').select('id, name'),
            // We still need all steps to find the details of the current one.
            supabase.from('sequence_steps').select('*')
        ]);

        const anyError = activeSeqError || contactsError || accountsError || sequencesError || sequenceStepsError;
        if (anyError) {
            console.error('Error fetching ABM data:', anyError);
            state.abmTasks = [];
            return;
        }

        // 2. Filter and construct the marketing task list with the correct logic.
        const marketingTasks = [];
        for (const activeSeq of activeSequences) {
            // Find the specific step that is currently active for this contact.
            const currentStep = sequenceSteps.find(step => 
                step.sequence_id === activeSeq.sequence_id && 
                step.step_number === activeSeq.current_step_number
            );

            // THE CRITICAL CHECK: Only proceed if the current step is assigned to Marketing.
            if (currentStep && currentStep.assigned_to === 'Marketing') {
                const contact = contacts.find(c => c.id === activeSeq.contact_id);
                const account = contact ? accounts.find(a => a.id === contact.account_id) : null;
                const sequence = sequences.find(s => s.id === activeSeq.sequence_id);

                // Find the individual task record from the 'contact_sequence_steps' table.
                // This is needed to get the unique ID for the "Complete Task" button.
                const { data: stepRecord, error: stepRecordError } = await supabase
                    .from('contact_sequence_steps')
                    .select('id, due_date, status, completed_at')
                    .eq('contact_sequence_id', activeSeq.id)
                    .eq('sequence_step_id', currentStep.id)
                    .single();

                if (stepRecordError) {
                    console.error("Could not find the matching task record for an active step:", stepRecordError);
                    continue; // Skip this task if its record is missing
                }

                marketingTasks.push({
                    task_id: stepRecord.id, // This is the unique ID for the button
                    contact_first_name: contact?.first_name,
                    contact_last_name: contact?.last_name,
                    account_name: account?.name,
                    sequence_name: sequence?.name,
                    step_subject: currentStep?.subject,
                    step_type: currentStep?.type,
                    task_due_date: stepRecord.due_date,
                    task_status: stepRecord.status,
                    task_completed_at: stepRecord.completed_at
                });
            }
        }

        state.abmTasks = marketingTasks;
    }

    async function loadAllData() {
        if (!state.currentUser) return;
        try {
            const [
                { data: emailTemplates, error: templatesError }, 
                { data: marketingSequences, error: marketingSequencesError }, 
                { data: marketingSequenceSteps, error: marketingSequenceStepsError }, 
                { data: abmSequences, error: abmSequencesError }, 
                { data: abmSequenceSteps, error: abmSequenceStepsError }, 
                { data: userQuotas, error: userQuotasError },
                { data: myPosts, error: postsError }
            ] = await Promise.all([
                supabase.from("email_templates").select("*"), 
                supabase.from("marketing_sequences").select("*"), 
                supabase.from("marketing_sequence_steps").select("*"), 
                supabase.from("sequences").select("*").eq('is_abm', true), 
                supabase.from("sequence_steps").select("*"), 
                supabase.from("user_quotas").select("user_id, full_name"), 
                supabase.from('social_hub_posts').select('*').eq('type', 'marketing_post').order('created_at', { ascending: false }),
                loadAbmData()
            ]);

            if (templatesError) throw templatesError;
            if (marketingSequencesError) throw marketingSequencesError;
            if (marketingSequenceStepsError) throw marketingSequenceStepsError;
            if (abmSequencesError) throw abmSequencesError;
            if (abmSequenceStepsError) throw abmSequenceStepsError;
            if (userQuotasError) throw userQuotasError;
            if (postsError) throw postsError;

            state.emailTemplates = emailTemplates || [];
            state.marketingSequences = marketingSequences || [];
            state.marketingSequenceSteps = marketingSequenceSteps || [];
            state.abmSequences = abmSequences || [];
            state.abmSequenceSteps = abmSequenceSteps || [];
            state.user_quotas = userQuotas || [];
            state.myPosts = myPosts || [];

            renderContent();

            // After rendering, re-initialize the correct details panel if a sequence is active
            if (state.currentView === 'sequences' && state.selectedSequenceId) {
                if (state.selectedSequenceType === 'abm') {
                    const sequence = state.abmSequences.find(s => s.id === state.selectedSequenceId);
                    const steps = state.abmSequenceSteps.filter(s => s.sequence_id === state.selectedSequenceId);
                    if (sequence) {
                        initializeAbmSequenceEditor({
                            supabase,
                            currentUser: state.currentUser,
                            sequence,
                            steps,
                            containerElement: dynamicDetailsPanel,
                            onDataChange: loadAllData
                        });
                    }
                } else if (state.selectedSequenceType === 'marketing') {
                    // Re-render the old details panel for marketing sequences
                    renderSequenceDetails();
                }
            }
        } catch (error) {
            console.error("Error loading data:", error.message);
            alert("Failed to load data. Please try refreshing the page. Error: " + error.message);
        }
    } // <-- THE STRAY "};" WAS REMOVED FROM HERE

    // --- Render Content Based on View ---
    const renderContent = () => {
        const isAbmView = state.currentView === 'abm-center';
        const isSocialView = state.currentView === 'social-posts';
        const isTemplateSequenceView = !isAbmView && !isSocialView;

        if (abmCenterView) abmCenterView.classList.toggle('hidden', !isAbmView);
        if (templatesSequencesView) templatesSequencesView.classList.toggle('hidden', !isTemplateSequenceView);
        if (socialPostView) socialPostView.classList.toggle('hidden', !isSocialView);
        
        if (navAbmCenter) navAbmCenter.classList.toggle('active', isAbmView);
        if (navEmailTemplates) navEmailTemplates.classList.toggle('active', state.currentView === 'email-templates');
        if (navSequences) navSequences.classList.toggle('active', state.currentView === 'sequences');
        if (navSocialPosts) navSocialPosts.classList.toggle('active', isSocialView);

        if (isAbmView) {
            console.log("Data for ABM Center:", state.abmTasks); // <-- Debugger Added
            renderAbmCenter();
        } else if (isTemplateSequenceView) {
            if (state.currentView === 'email-templates') {
                if (listHeader) listHeader.textContent = 'Email Templates';
                if (createNewItemBtn) createNewItemBtn.textContent = 'Create New Template';
                if (importItemBtn) importItemBtn.classList.add('hidden');
                if (deleteSelectedItemBtn) deleteSelectedItemBtn.textContent = 'Delete Selected Template';
                if (downloadSequenceTemplateBtn) downloadSequenceTemplateBtn.classList.add('hidden');
                renderTemplateList();
                renderTemplateDetails();
            } else if (state.currentView === 'sequences') {
                if (listHeader) listHeader.textContent = 'All Sequences';
                if (createNewItemBtn) createNewItemBtn.textContent = 'New Sequence';
                if (importItemBtn) importItemBtn.classList.remove('hidden');
                // The other button labels are fine as they are generic
                if (downloadSequenceTemplateBtn) downloadSequenceTemplateBtn.classList.remove('hidden');
                renderSequenceList();
                // The details panel is now handled by the click handler, so we no longer render it here.
            }
        } else if (isSocialView) {
            renderMyPosts(); // Call new render function
        }
    };
        
    // --- NEW: ABM Center Render Functions ---
    const renderAbmCenter = () => {
        // FIX: Change 'today' to 'endOfToday' for a more reliable comparison
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999); // Set to the last millisecond of the current day

        // Filter tasks based on the end of today
        const dueTasks = (state.abmTasks || []).filter(task => 
            task.task_status === 'pending' && new Date(task.task_due_date) <= endOfToday
        );
        const upcomingTasks = (state.abmTasks || []).filter(task => 
            task.task_status === 'pending' && new Date(task.task_due_date) > endOfToday
        );
        const completedTasks = (state.abmTasks || [])
            .filter(task => task.task_status !== 'pending' && task.task_completed_at)
            .sort((a, b) => new Date(b.task_completed_at) - new Date(a.task_completed_at))
            .slice(0, 20);

        const renderRow = (task) => `
            <tr>
                <td>${task.contact_first_name || ''} ${task.contact_last_name || ''}</td>
                <td>${task.account_name || 'N/A'}</td>
                <td>${task.sequence_name || 'N/A'}</td>
                <td>${task.step_subject || task.step_type}</td>
                <td><button class="btn-primary complete-abm-task-btn" data-id="${task.task_id}">Complete Task</button></td>
            </tr>`;

        abmTasksDueTableBody.innerHTML = dueTasks.map(renderRow).join('') || `<tr><td colspan="5">No tasks are due.</td></tr>`;

        abmTasksUpcomingTableBody.innerHTML = upcomingTasks.map(task => `
            <tr>
                <td>${task.contact_first_name || ''} ${task.contact_last_name || ''}</td>
                <td>${task.account_name || 'N/A'}</td>
                <td>${task.sequence_name || 'N/A'}</td>
                <td>${task.step_subject || task.step_type}</td>
                <td>${formatDate(task.task_due_date)}</td>
            </tr>`).join('') || `<tr><td colspan="5">No upcoming tasks.</td></tr>`;

        abmTasksCompletedTableBody.innerHTML = completedTasks.map(task => `
            <tr>
                <td>${task.contact_first_name || ''} ${task.contact_last_name || ''}</td>
                <td>${task.account_name || 'N/A'}</td>
                <td>${task.step_subject || task.step_type}</td>
                <td>${formatDate(task.task_completed_at)}</td>
            </tr>`).join('') || `<tr><td colspan="4">No tasks completed yet.</td></tr>`;
    };

    async function handleCompleteAbmTask(contactSequenceStepId) {
        try {
            // Step 1: Mark the current marketing step as 'completed'
            // REMOVED .single() for resilience
            const { data: updatedSteps, error: updateError } = await supabase
                .from('contact_sequence_steps')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('id', contactSequenceStepId)
                .select();

            if (updateError) throw updateError;

            // NEW: Check if the task was actually found and updated.
            if (!updatedSteps || updatedSteps.length === 0) {
                alert("This task may have already been completed or removed. The list will now refresh.");
                await loadAllData(); // Refresh the UI to reflect the current state.
                return; // Stop the function from continuing.
            }
            
            const completedStep = updatedSteps[0]; // Proceed with the first (and only) result.
            const { contact_sequence_id, sequence_id } = completedStep;

            // Step 2: Get the parent sequence's current state
            // REMOVED .single() for resilience
            const { data: contactSequences, error: csError } = await supabase
                .from('contact_sequences')
                .select('current_step_number')
                .eq('id', contact_sequence_id);

            if (csError) throw csError;

            // NEW: Check if the parent sequence exists.
            if (!contactSequences || contactSequences.length === 0) {
                alert("Could not find the parent sequence for this task. It may have been removed. The list will now refresh.");
                await loadAllData();
                return;
            }
            const contactSequence = contactSequences[0];
            
            // The rest of the function continues as before...
            const { data: allSequenceSteps, error: stepsError } = await supabase
                .from('sequence_steps')
                .select('step_number, delay_days')
                .eq('sequence_id', sequence_id)
                .order('step_number');

            if (stepsError) throw stepsError;
            
            const currentStepNumber = contactSequence.current_step_number;
            const nextStep = allSequenceSteps.find(s => s.step_number > currentStepNumber);

            let updateData = {};
            if (nextStep) {
                const nextDueDate = new Date();
                nextDueDate.setDate(nextDueDate.getDate() + (nextStep.delay_days || 0)); 
                updateData = {
                    current_step_number: nextStep.step_number,
                    last_completed_date: new Date().toISOString(),
                    next_step_due_date: nextDueDate.toISOString(),
                };
            } else {
                updateData = {
                    status: 'Completed',
                    last_completed_date: new Date().toISOString(),
                    next_step_due_date: null,
                    current_step_number: null 
                };
            }

            const { error: advanceError } = await supabase
                .from('contact_sequences')
                .update(updateData)
                .eq('id', contact_sequence_id);

            if (advanceError) throw advanceError;
            
            await loadAllData();

        } catch (error) {
            console.error('Error completing marketing task:', error);
            alert('Error completing task: ' + error.message);
        }
    }

    // --- Email Templates Render Functions ---
    const renderTemplateList = () => {
        if (!itemList) return;
        itemList.innerHTML = "";

        const myTemplates = state.emailTemplates.filter(t => t.user_id === state.currentUser.id);
        const sharedTemplates = state.emailTemplates.filter(t => t.user_id !== state.currentUser.id);

        myTemplates.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        sharedTemplates.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        const createListItem = (template) => {
            const item = document.createElement("div");
            item.className = "list-item";
            item.dataset.id = template.id;
            item.dataset.type = 'template';

            if (template.user_id !== state.currentUser.id) {
                const creator = state.user_quotas.find(u => u && u.user_id === template.user_id);
                const creatorName = creator ? creator.full_name : 'an unknown user';
                item.innerHTML = `
                    <div class="template-list-item-content">
                        <span class="template-name">${template.name}</span>
                        <small class="template-creator">Shared by ${creatorName}</small>
                    </div>
                `;
            } else {
                item.innerHTML = `
                    <div class="template-list-item-content">
                         <span class="template-name">${template.name}</span>
                    </div>
                `;
            }

            if (template.id === state.selectedTemplateId) item.classList.add("selected");
            itemList.appendChild(item);
        };

        myTemplates.forEach(createListItem);

        if (sharedTemplates.length > 0 && myTemplates.length > 0) {
            const separator = document.createElement("div");
            separator.className = "list-separator";
            separator.textContent = "Shared Templates";
            itemList.appendChild(separator);
        }
        sharedTemplates.forEach(createListItem);

        if (state.emailTemplates.length === 0) {
            itemList.innerHTML = '<div class="list-item-placeholder">No templates created yet.</div>';
        }
    };

    const renderTemplateDetails = () => {
        state.selectedSequenceId = null;
        state.isEditingSequenceDetails = false;
        state.editingStepId = null;

        const template = state.emailTemplates.find(t => t.id === state.selectedTemplateId);

        if (template) {
            dynamicDetailsPanel.innerHTML = `
                <h3>Template Details</h3>
                <div id="template-form-container">
                    <input type="hidden" id="template-id" value="${template.id}">
                    <label for="template-name">Template Name:</label><input type="text" id="template-name" value="${template.name || ''}" required>
                    <label for="template-subject">Subject:</label><input type="text" id="template-subject" value="${template.subject || ''}">
                    <label for="template-body">Email Body:</label>
                    <div class="merge-fields-buttons">
                        <button type="button" class="btn-secondary" data-field="[FirstName]">First Name</button>
                        <button type="button" class="btn-secondary" data-field="[LastName]">Last Name</button>
                        <button type="button" class="btn-secondary" data-field="[AccountName]">Account Name</button>
                    </div>
                    <textarea id="template-body" rows="10">${template.body || ''}</textarea>
                    <div class="form-buttons">
                        <button id="save-template-btn" class="btn-primary">Save Template</button>
                        <button id="delete-template-btn" class="btn-danger">Delete Template</button>
                    </div>
                </div>
            `;
            setupTemplateDetailsListeners();
        } else {
            dynamicDetailsPanel.innerHTML = `
                <h3>New Template</h3>
                <div id="template-form-container">
                    <input type="hidden" id="template-id" value="">
                    <label for="template-name">Template Name:</label><input type="text" id="template-name" value="" required>
                    <label for="template-subject">Subject:</label><input type="text" id="template-subject" value="">
                    <label for="template-body">Email Body:</label>
                    <div class="merge-fields-buttons">
                        <button type="button" class="btn-secondary" data-field="[FirstName]">First Name</button>
                        <button type="button" class="btn-secondary" data-field="[LastName]">Last Name</button>
                        <button type="button" class="btn-secondary" data-field="[AccountName]">Account Name</button>
                    </div>
                    <textarea id="template-body" rows="10"></textarea>
                    <div class="form-buttons">
                        <button id="save-template-btn" class="btn-primary">Save Template</button>
                        <button id="delete-template-btn" class="btn-danger hidden">Delete Template</button>
                    </div>
                </div>
            `;
            setupTemplateDetailsListeners();
            const newTemplateNameInput = dynamicDetailsPanel.querySelector('#template-name');
            if (newTemplateNameInput) newTemplateNameInput.focus();
        }
    };

    function setupTemplateDetailsListeners() {
        const saveBtn = dynamicDetailsPanel.querySelector('#save-template-btn');
        const deleteBtn = dynamicDetailsPanel.querySelector('#delete-template-btn');
        const mergeFieldButtons = dynamicDetailsPanel.querySelectorAll('.merge-fields-buttons button');

        if (saveBtn) saveBtn.addEventListener('click', handleSaveTemplate);
        if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteTemplate);
        mergeFieldButtons.forEach(button => {
            button.addEventListener('click', handleMergeFieldClick);
        });
    }

    async function handleSaveTemplate() {
        const id = dynamicDetailsPanel.querySelector('#template-id')?.value;
        const name = dynamicDetailsPanel.querySelector('#template-name')?.value.trim();
        const subject = dynamicDetailsPanel.querySelector('#template-subject')?.value.trim();
        const body = dynamicDetailsPanel.querySelector('#template-body')?.value;

        if (!name) {
            alert('Template name is required.');
            return;
        }

        const templateData = { name, subject, body, user_id: state.currentUser.id };
        let error = null;

        if (id) {
            const { error: updateError } = await supabase.from('email_templates').update(templateData).eq('id', id);
            error = updateError;
        } else {
            const { data: newTemplate, error: insertError } = await supabase.from('email_templates').insert(templateData).select();
            error = insertError;
            if (!error && newTemplate && newTemplate.length > 0) {
                state.selectedTemplateId = newTemplate[0].id;
            }
        }

        if (error) {
            alert("Error saving template: " + error.message);
        } else {
            alert("Template saved successfully!");
            await loadAllData();
        }
    }

    async function handleDeleteTemplate() {
        if (!state.selectedTemplateId) return;
        showModal("Confirm Deletion", "Are you sure you want to delete this template?", async () => {
            const { error } = await supabase.from('email_templates').delete().eq('id', state.selectedTemplateId);
            if (error) {
                alert("Error deleting template: " + error.message);
            } else {
                alert("Template deleted successfully.");
                state.selectedTemplateId = null;
                await loadAllData();
            }
            hideModal();
        });
    }

    function handleMergeFieldClick(e) {
        const field = e.target.dataset.field;
        const textarea = dynamicDetailsPanel.querySelector('#template-body') || document.getElementById('modal-template-body');
        if (textarea) {
            const startPos = textarea.selectionStart;
            const endPos = textarea.selectionEnd;
            textarea.value = textarea.value.substring(0, startPos) + field + textarea.value.substring(endPos);
            textarea.setSelectionRange(startPos + field.length, startPos + field.length);
        }
    }

    // --- Sequences Render Functions ---
    const renderSequenceList = () => {
        if (!itemList) return;
        itemList.innerHTML = "";

        // Combine and sort all sequences
        const allSequences = [
            ...state.abmSequences.map(s => ({ ...s, type: 'abm', displayName: `[ABM] ${s.name}` })),
            ...state.marketingSequences.map(s => ({ ...s, type: 'marketing', displayName: `[Marketing] ${s.name}` }))
        ].sort((a, b) => a.displayName.localeCompare(b.displayName));
        
        allSequences.forEach((seq) => {
            const item = document.createElement("div");
            item.className = "list-item";
            item.textContent = seq.displayName;
            item.dataset.id = seq.id;
            item.dataset.type = 'sequence';
            item.dataset.sequenceType = seq.type; // Differentiate between 'abm' and 'marketing'
            if (seq.id === state.selectedSequenceId && seq.type === state.selectedSequenceType) {
                item.classList.add("selected");
            }
            itemList.appendChild(item);
        });

        if (allSequences.length === 0) {
            itemList.innerHTML = '<div class="list-item-placeholder">No sequences created yet.</div>';
        }
    };
    const renderSequenceSteps = () => {
        const sequenceStepsTableBody = dynamicDetailsPanel.querySelector('#sequence-steps-table-body');
        if (!sequenceStepsTableBody) return;
        sequenceStepsTableBody.innerHTML = "";

        let stepsToRender = [];

        if (state.selectedSequenceId) {
            stepsToRender = state.marketingSequenceSteps.filter(s => s.marketing_sequence_id === state.selectedSequenceId);
        } else {
            return;
        }

        stepsToRender
            .sort((a, b) => a.step_number - b.step_number)
            .forEach((step, index) => {
                const row = sequenceStepsTableBody.insertRow();
                row.dataset.id = step.id;
                row.dataset.sequenceType = 'marketing';

                const isEditingThisStep = (state.editingStepId === step.id);
                const isFirstStep = (index === 0);
                const isLastStep = (index === stepsToRender.length - 1);
                const isDisabled = false;

                row.innerHTML = `
                    <td>${step.step_number}</td>
                    <td>
                        ${isEditingThisStep && !isDisabled ?
                            `<input type="text" class="form-control edit-step-type" value="${step.type || ''}">` :
                            (step.type || '')
                        }
                    </td>
                    <td>
                        ${isEditingThisStep && !isDisabled ?
                            `<input type="text" class="form-control edit-step-subject" value="${step.subject || ''}">` :
                            (step.subject || '')
                        }
                    </td>
                    <td>
                        ${isEditingThisStep && !isDisabled ?
                            `<textarea class="form-control edit-step-message">${step.message || ''}</textarea>` :
                            (step.message || '')
                        }
                    </td>
                    <td>
                        ${isEditingThisStep && !isDisabled ?
                            `<input type="number" class="form-control edit-step-delay" value="${step.delay_days || 0}" min="0">` :
                            (step.delay_days || 0)
                        }
                    </td>
                    <td>
                        <div class="actions-cell-content" style="display: flex; justify-content: space-around; align-items: center; gap: 5px;">
                            ${isEditingThisStep && !isDisabled ?
                                `
                                <button class="btn btn-sm btn-success save-step-btn" data-id="${step.id}">Save</button>
                                <button class="btn btn-sm btn-secondary cancel-step-btn" data-id="${step.id}">Cancel</button>
                                ` :
                                `
                                <div style="display: flex; flex-direction: column; gap: 5px;">
                                    <button class="btn btn-sm btn-secondary move-up-btn ${isFirstStep || isDisabled ? 'hidden' : ''}" data-id="${step.id}"><i class="fas fa-arrow-up"></i></button>
                                    <button class="btn btn-sm btn-secondary move-down-btn ${isLastStep || isDisabled ? 'hidden' : ''}" data-id="${step.id}"><i class="fas fa-arrow-down"></i></button>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 5px;">
                                    <button class="btn btn-sm btn-primary edit-step-btn ${isDisabled ? 'hidden' : ''}" data-id="${step.id}">Edit</button>
                                    <button class="btn btn-sm btn-danger delete-step-btn ${isDisabled ? 'hidden' : ''}" data-id="${step.id}">Delete</button>
                                </div>
                                `
                            }
                        </div>
                    </td>
                `;
            });
    };

    const renderSequenceDetails = () => {
        state.selectedTemplateId = null;
        state.editingStepId = null;
        const sequence = state.marketingSequences.find(s => s.id === state.selectedSequenceId); // Corrected

        if (sequence) {
            dynamicDetailsPanel.innerHTML = `
                <h3>Marketing Sequence Details</h3>
                <hr>
                <div class="form-grid">
                    <div class="full-span-grid-item">
                        <label for="sequence-name-input">Name:</label>
                        <input type="text" id="sequence-name-input" class="form-control" value="${sequence.name || ''}" ${state.isEditingSequenceDetails ? '' : 'disabled'}>
                        <input type="hidden" id="sequence-id" value="${sequence.id}">
                        <input type="hidden" id="sequence-type" value="marketing">
                    </div>
                    <div class="full-span-grid-item">
                        <label for="sequence-description-textarea">Description:</label>
                        <textarea id="sequence-description-textarea" class="form-control" ${state.isEditingSequenceDetails ? '' : 'disabled'}>${sequence.description || ''}</textarea>
                    </div>
                </div>
                <div class="form-buttons">
                    <button id="edit-sequence-details-btn" class="btn-secondary ${state.isEditingSequenceDetails ? 'hidden' : ''}">Edit Details</button>
                    <button id="save-sequence-details-btn" class="btn-primary ${state.isEditingSequenceDetails ? '' : 'hidden'}">Save Changes</button>
                    <button id="cancel-edit-sequence-btn" class="btn-secondary ${state.isEditingSequenceDetails ? '' : 'hidden'}">Cancel</button>
                </div>

                <hr>

                <h3>Sequence Steps</h3>
                <div class="table-container">
                    <table id="sequence-steps-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Type</th>
                                <th>Subject</th>
                                <th>Message</th>
                                <th>Delay (Days)</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="sequence-steps-table-body"></tbody>
                    </table>
                </div>
                <div class="action-buttons">
                    <button id="add-step-btn" class="btn-secondary ${state.isEditingSequenceDetails || state.editingStepId ? 'hidden' : ''}">Add Step</button>
                </div>
            `;
            setupSequenceDetailsListeners();
            renderSequenceSteps();
        } else {
            dynamicDetailsPanel.innerHTML = `<h3>Sequence Details</h3><p>Select a marketing sequence from the list or click 'New Marketing Sequence' to get started.</p>`;
        }
    };

    function setupSequenceDetailsListeners() {
        const editBtn = dynamicDetailsPanel.querySelector('#edit-sequence-details-btn');
        const saveBtn = dynamicDetailsPanel.querySelector('#save-sequence-details-btn');
        const cancelBtn = dynamicDetailsPanel.querySelector('#cancel-edit-sequence-btn');
        const addStepBtn = dynamicDetailsPanel.querySelector('#add-step-btn');
        const sequenceStepsTableBody = dynamicDetailsPanel.querySelector('#sequence-steps-table-body');

        if (editBtn) editBtn.addEventListener('click', handleEditSequenceDetails);
        if (saveBtn) saveBtn.addEventListener('click', handleSaveSequenceDetails);
        if (cancelBtn) cancelBtn.addEventListener('click', handleCancelEditSequenceDetails);
        if (addStepBtn) addStepBtn.addEventListener('click', handleAddStep);
        if (sequenceStepsTableBody) sequenceStepsTableBody.addEventListener('click', handleSequenceStepActions);
    }

    async function handleEditSequenceDetails() {
        if (!state.selectedSequenceId) return;
        if (state.editingStepId) {
            alert("Please save or cancel the current step edit before editing sequence details.");
            return;
        }
        state.isEditingSequenceDetails = true;
        const currentSequence = state.marketingSequences.find(s => s.id === state.selectedSequenceId);
        if (currentSequence) {
            state.originalSequenceName = currentSequence.name || "";
            state.originalSequenceDescription = currentSequence.description || "";
        }
        renderSequenceDetails();
        dynamicDetailsPanel.querySelector('#sequence-name-input').focus();
    }

    async function handleSaveSequenceDetails() {
        if (!state.selectedSequenceId) return;
        const updatedName = dynamicDetailsPanel.querySelector('#sequence-name-input').value.trim();
        const updatedDescription = dynamicDetailsPanel.querySelector('#sequence-description-textarea').value.trim();

        if (!updatedName) {
            alert("Sequence name cannot be empty.");
            return;
        }

        if (updatedName !== state.originalSequenceName || updatedDescription !== state.originalSequenceDescription) {
            try {
                await supabase
                    .from("marketing_sequences")
                    .update({ name: updatedName, description: updatedDescription })
                    .eq("id", state.selectedSequenceId);
                alert("Sequence details saved successfully!");
            } catch (error) {
                console.error("Error saving sequence details:", error.message);
                alert("Error saving sequence details: " + error.message);
            }
        }
        
        state.isEditingSequenceDetails = false;
        await loadAllData();
    }

    function handleCancelEditSequenceDetails() {
        if (!state.selectedSequenceId) return;
        state.isEditingSequenceDetails = false;
        renderSequenceDetails();
    }

    async function handleAddStep() {
        if (!state.selectedSequenceId) return alert("Please select a marketing sequence.");
        if (state.isEditingSequenceDetails || state.editingStepId) {
            alert("Please save or cancel any active edits before adding a new step.");
            return;
        }
        const steps = state.marketingSequenceSteps.filter((s) => s.marketing_sequence_id === state.selectedSequenceId);
        const nextNum = steps.length > 0 ? Math.max(...steps.map((s) => s.step_number)) + 1 : 1;
        showModal(
            "Add Sequence Step",
            `<label>Step Number</label><input type="number" id="modal-step-number" value="${nextNum}" required><label>Type</label><input type="text" id="modal-step-type" required placeholder="e.g., Email, Call, LinkedIn"><label>Subject (for Email)</label><input type="text" id="modal-step-subject" placeholder="Optional"><label>Message (for Email/Notes)</label><textarea id="modal-step-message" placeholder="Optional"></textarea><label>Delay (Days after previous step)</label><input type="number" id="modal-step-delay" value="0" required>`,
            async () => {
                const newStep = {
                    marketing_sequence_id: state.selectedSequenceId,
                    step_number: parseInt(document.getElementById("modal-step-number").value),
                    type: document.getElementById("modal-step-type").value.trim(),
                    subject: document.getElementById("modal-step-subject").value.trim(),
                    message: document.getElementById("modal-step-message").value.trim(),
                    delay_days: parseInt(document.getElementById("modal-step-delay").value),
                    user_id: state.currentUser.id
                };
                if (!newStep.type) {
                    alert("Step Type is required.");
                    return false;
                }
                await supabase.from("marketing_sequence_steps").insert([newStep]);
                await loadAllData();
                hideModal();
                return true;
            }
        );
    }

    async function handleSequenceStepActions(e) {
        const target = e.target.closest('button');
        if (!target) return;
    
        const row = target.closest("tr[data-id]");
        if (!row) return;

        const stepId = Number(row.dataset.id);

        if (state.isEditingSequenceDetails) {
            alert("Please save or cancel sequence details edits before editing steps.");
            return;
        }

        if (target.matches(".edit-step-btn, .edit-step-btn *")) {
            if (state.editingStepId && state.editingStepId !== stepId) {
                alert("Please save or cancel the current step edit before editing another step.");
                return;
            }
            state.editingStepId = stepId;
            const currentStep = state.marketingSequenceSteps.find(s => s.id === stepId);
            if (currentStep) {
                state.originalStepValues = { ...currentStep };
            }
            renderSequenceSteps();
        } else if (target.matches(".save-step-btn, .save-step-btn *")) {
            const updatedStep = {
                id: stepId,
                step_number: parseInt(row.cells[0].textContent, 10),
                type: row.querySelector(".edit-step-type")?.value.trim() || '',
                subject: row.querySelector(".edit-step-subject")?.value.trim() || '',
                message: row.querySelector(".edit-step-message")?.value.trim() || '',
                delay_days: parseInt(row.querySelector(".edit-step-delay")?.value || 0, 10),
            };

            if (!updatedStep.type) {
                alert("Step Type is required.");
                return;
            }

            try {
                await supabase.from("marketing_sequence_steps")
                    .update({
                        type: updatedStep.type,
                        subject: updatedStep.subject,
                        message: updatedStep.message,
                        delay_days: updatedStep.delay_days
                    })
                    .eq("id", updatedStep.id);
                alert("Step saved successfully!");
            } catch (error) {
                console.error("Error saving step:", error.message);
                alert("Error saving step: " + error.message);
            } finally {
                state.editingStepId = null;
                state.originalStepValues = {};
                await loadAllData();
            }
        } else if (target.matches(".cancel-step-btn, .cancel-step-btn *")) {
            state.editingStepId = null;
            state.originalStepValues = {};
            renderSequenceSteps();
        } else if (target.matches(".delete-step-btn, .delete-step-btn *")) {
            if (state.editingStepId) {
                alert("Please save or cancel the current step edit before deleting a step.");
                return;
            }
            showModal("Confirm Delete Step", "Are you sure you want to delete this step?", async () => {
                await supabase.from("marketing_sequence_steps").delete().eq("id", stepId);
                await loadAllData();
                hideModal();
                alert("Step deleted.");
            });
        } else if (target.matches(".move-up-btn, .move-up-btn *")) {
            if (state.isEditingSequenceDetails || state.editingStepId) {
                alert("Please save or cancel any active edits before reordering steps.");
                return;
            }
            await handleMoveStep(stepId, 'up');
        } else if (target.matches(".move-down-btn, .move-down-btn *")) {
            if (state.isEditingSequenceDetails || state.editingStepId) {
                alert("Please save or cancel any active edits before reordering steps.");
                return;
            }
            await handleMoveStep(stepId, 'down');
        }
    }

    async function handleNewSequenceCreation() {
        const name = document.getElementById("modal-sequence-name").value.trim();
        if (name) {
            const existingSequence = state.marketingSequences.find(seq => seq.name.toLowerCase() === name.toLowerCase());
            if (existingSequence) {
                alert(`A marketing sequence with the name "${name}" already exists. Please choose a different name.`);
                return false;
            }

            const { data: newSeq, error } = await supabase
                .from("marketing_sequences")
                .insert([{ name: name, description: "", user_id: state.currentUser.id, type: "Marketing" }])
                .select();
            if (error) {
                alert("Error adding sequence: " + error.message);
                return false;
            }
            state.selectedSequenceId = newSeq[0].id;
            await loadAllData();
            hideModal();
            return true;
        } else {
            alert("Sequence name is required.");
            return false;
        }
    }

    async function handleMoveStep(stepId, direction) {
        const currentStep = state.marketingSequenceSteps.find(s => s.id === stepId);
        if (!currentStep) return;

        const currentSequenceSteps = state.marketingSequenceSteps
            .filter(s => s.marketing_sequence_id === state.selectedSequenceId)
            .sort((a, b) => a.step_number - b.step_number);

        const currentStepIndex = currentSequenceSteps.findIndex(s => s.id === stepId);

        let targetStep = null;
        if (direction === 'up' && currentStepIndex > 0) {
            targetStep = currentSequenceSteps[currentStepIndex - 1];
        } else if (direction === 'down' && currentStepIndex < currentSequenceSteps.length - 1) {
            targetStep = currentSequenceSteps[currentStepIndex + 1];
        }

        if (targetStep) {
            try {
                const tempStepNumber = currentStep.step_number;
                currentStep.step_number = targetStep.step_number;
                targetStep.step_number = tempStepNumber;

                await supabase.from("marketing_sequence_steps")
                    .update({ step_number: currentStep.step_number })
                    .eq("id", currentStep.id);
                await supabase.from("marketing_sequence_steps")
                    .update({ step_number: targetStep.step_number })
                    .eq("id", targetStep.id);

                await loadAllData();
            } catch (error) {
                console.error("Error reordering steps:", error.message);
                alert("Error reordering steps: " + error.message);
            }
        }
    }
    // --- NEW: Social Post Render Functions ---
    const renderMyPosts = () => {
        if (!myPostsContainer) return;
        myPostsContainer.innerHTML = "";

        if (state.myPosts.length === 0) {
            myPostsContainer.innerHTML = `<p class="placeholder-text" style="grid-column: 1 / -1;">You have not created any posts yet.</p>`;
            return;
        }

        state.myPosts.forEach(post => {
            myPostsContainer.appendChild(createMyPostCard(post));
        });
    };

    function createMyPostCard(item) {
        const card = document.createElement('div');
        card.className = 'alert-card';
        card.id = `my-post-card-${item.id}`;

        const headline = item.title;
        const link = item.link;
        const summary = item.summary || item.approved_copy;
        const sourceName = 'My Post'; // It's always their post on this page
        const dynamicLinkIndicator = item.is_dynamic_link ? `<span class="dynamic-link-indicator" title="This link generates a rich preview on LinkedIn">✨</span>` : '';

        card.innerHTML = `
            <div class="alert-header"><span class="alert-trigger-type">Campaign Asset</span></div>
            <h5 class="alert-headline">${headline} ${dynamicLinkIndicator}</h5>
            <p class="alert-summary">${(summary || '').replace(/\n/g, '<br>')}</p>
            <div class="alert-footer">
                <span class="alert-source">Source: <a href="${link}" target="_blank">${sourceName}</a></span>
                <span class="alert-date">${formatDate(item.created_at)}</span>
            </div>
            <div class="alert-actions">
                <button class="btn-secondary edit-post-btn" data-post-id="${item.id}">Edit</button>
                <button class="btn-danger delete-post-btn" data-post-id="${item.id}">Delete</button>
            </div>
        `;
        
        return card;
    }

    // --- NEW: Social Post Action Handlers ---
    async function handleEditPost(postId) {
        const post = state.myPosts.find(p => p.id === postId);
        if (!post) {
            alert("Could not find the post to edit.");
            return;
        }

        // Re-use the HTML structure from the create form for the edit modal
        const modalBody = `
            <form id="edit-post-form">
                <input type="hidden" id="edit-post-id" value="${post.id}">
                <div class="form-grid">
                    <div>
                        <label for="edit-post-title">Post Title</label>
                        <input type="text" id="edit-post-title" name="edit-post-title" value="${post.title || ''}" required>
                    </div>
                    <div>
                        <label for="edit-post-link">Sharing Link URL</label>
                        <input type="url" id="edit-post-link" name="edit-post-link" value="${post.link || ''}" required>
                    </div>
                </div>
                <div class="full-span-grid-item" style="margin-top: 1rem;">
                    <label for="edit-post-copy">Approved Post Copy</label>
                    <textarea id="edit-post-copy" name="edit-post-copy" rows="6" required>${post.approved_copy || ''}</textarea>
                </div>
                <div class="form-checkbox-group">
                    <input type="checkbox" id="edit-is-dynamic-link" name="edit-is-dynamic-link" ${post.is_dynamic_link ? 'checked' : ''}>
                    <label for="edit-is-dynamic-link">This link is optimized for social sharing (has an Open Graph image)</label>
                </div>
            </form>
        `;

        showModal("Edit Social Post", modalBody, async () => {
            const updatedPost = {
                title: document.getElementById('edit-post-title').value.trim(),
                link: document.getElementById('edit-post-link').value.trim(),
                approved_copy: document.getElementById('edit-post-copy').value.trim(),
                is_dynamic_link: document.getElementById('edit-is-dynamic-link').checked,
            };

            const { error } = await supabase.from('social_hub_posts').update(updatedPost).eq('id', post.id);

            if (error) {
                alert("Error updating post: " + error.message);
                return false;
            }

            await loadAllData(); // Refresh the list
            hideModal();
            return true;
        });
    }

    async function handleDeletePost(postId) {
        showModal("Confirm Deletion", "Are you sure you want to delete this post? This cannot be undone.", async () => {
            const { error } = await supabase.from('social_hub_posts').delete().eq('id', postId);

            if (error) {
                alert("Error deleting post: " + error.message);
                return false;
            }

            await loadAllData(); // Refresh the list
            hideModal();
            return true;
        });
    }

    // --- Unified Click Handlers ---
    function handleItemListClick(e) {
        const item = e.target.closest(".list-item");
        if (!item) return;

        const itemId = Number(item.dataset.id);
        const itemType = item.dataset.type;

        itemList.querySelectorAll('.list-item').forEach(li => li.classList.remove('selected'));
        item.classList.add('selected');

        if (itemType === 'template') {
            state.selectedTemplateId = itemId;
            state.selectedSequenceId = null;
            state.selectedSequenceType = null;
            renderTemplateDetails();
        } else if (itemType === 'sequence') {
            state.selectedTemplateId = null;
            state.selectedSequenceId = itemId;
            const sequenceType = item.dataset.sequenceType;
            state.selectedSequenceType = sequenceType;

            // NEW LOGIC: Route to the correct renderer
            if (sequenceType === 'abm') {
                const sequence = state.abmSequences.find(s => s.id === itemId);
                const steps = state.abmSequenceSteps.filter(s => s.sequence_id === itemId);
                initializeAbmSequenceEditor({
                    supabase,
                    currentUser: state.currentUser,
                    sequence,
                    steps,
                    containerElement: dynamicDetailsPanel,
                    onDataChange: loadAllData // Pass a callback to refresh data
                });
            } else {
                // Fallback to the old renderer for "marketing" sequences
                renderSequenceDetails(); 
            }
        }
    }

    function handleCreateNewItem() {
        if (state.currentView === 'email-templates') {
            state.selectedTemplateId = null;
            renderTemplateDetails();
            dynamicDetailsPanel.querySelector('#template-name').focus();
        } else if (state.currentView === 'sequences') {
            // This now needs to ask what kind of sequence to create
            const modalBody = `
                <label>Sequence Name</label>
                <input type="text" id="modal-sequence-name" required>
                <label>Sequence Type</label>
                <select id="modal-sequence-type">
                    <option value="ABM" selected>ABM (Sales & Marketing)</option>
                    <option value="Marketing">Marketing (Marketing Only)</option>
                </select>
            `;
            showModal("New Sequence", modalBody, async () => {
                const name = document.getElementById("modal-sequence-name").value.trim();
                const type = document.getElementById("modal-sequence-type").value;
                if (!name) {
                    alert("Sequence name is required.");
                    return false;
                }
                
                let error;
                if (type === 'ABM') {
                    const { error: abmError } = await supabase.from('sequences').insert([{ name, is_abm: true, user_id: state.currentUser.id }]);
                    error = abmError;
                } else {
                    const { error: marketingError } = await supabase.from('marketing_sequences').insert([{ name, user_id: state.currentUser.id }]);
                    error = marketingError;
                }

                if (error) {
                    alert("Error creating sequence: " + error.message);
                    return false;
                }
                
                await loadAllData();
                hideModal();
                return true;
            });
        }
    }

    function handleImportItem() {
        if (state.currentView === 'sequences') {
            if (!state.selectedSequenceId) return alert("Please select a sequence to import steps into.");

            // Prevent import for ABM sequences as it's not supported by that module yet
            if (state.selectedSequenceType === 'abm') {
                alert("CSV import is only supported for Marketing-Only sequences at this time.");
                return;
            }
            
            if (state.isEditingSequenceDetails || state.editingStepId) {
                alert("Please save or cancel any active edits before importing steps.");
                return;
            }
            itemCsvInput.click();
        }
    }

    async function handleDeleteSelectedItem() {
        if (state.currentView === 'email-templates') {
            if (!state.selectedTemplateId) return alert("Please select a template to delete.");
            await handleDeleteTemplate();
        } else if (state.currentView === 'sequences') {
            if (!state.selectedSequenceId) return alert("Please select a sequence to delete.");
            
            showModal("Confirm Deletion", "Are you sure? This will delete the sequence and all its steps. This cannot be undone.", async () => {
                if (state.selectedSequenceType === 'abm') {
                    // Delete steps from the main sequence_steps table
                    await supabase.from("sequence_steps").delete().eq("sequence_id", state.selectedSequenceId);
                    // Delete the sequence itself from the main sequences table
                    await supabase.from("sequences").delete().eq("id", state.selectedSequenceId);
                } else { // 'marketing'
                    // Delete steps from the marketing_sequence_steps table
                    await supabase.from("marketing_sequence_steps").delete().eq("marketing_sequence_id", state.selectedSequenceId);
                    // Delete the sequence itself from the marketing_sequences table
                    await supabase.from("marketing_sequences").delete().eq("id", state.selectedSequenceId);
                }
                state.selectedSequenceId = null;
                state.selectedSequenceType = null;
                await loadAllData();
                hideModal();
                alert("Sequence deleted successfully.");
            });
        }
    }

    function downloadCsvTemplate() {
        const csvContent = "step_number,type,subject,message,delay_days\n" +
            "1,Email,Welcome Email,Hello [FirstName],0\n" +
            "2,Call,Follow-up Call,Call [FirstName] to discuss,3\n" +
            "3.LinkedIn,Connect on LinkedIn,Connect with [FirstName] on LinkedIn,5";
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'marketing_sequence_template.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
    
    async function handlePasswordReset() {
        const resetEmailInput = document.getElementById('reset-email');
        const resetEmail = resetEmailInput ? resetEmailInput.value.trim() : '';
        
        const resetPasswordBody = `
            <p>Enter your email to receive a password reset link.</p>
            <input type="email" id="reset-email" placeholder="Email" required value="${resetEmail || ''}">
        `;
        const modalActions = `<button id="modal-confirm-btn" class="btn-primary">Send Reset Link</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`;

        if (!resetEmail) {
            showModal('Reset Password', `<p style="color: var(--error-color);">Please enter your email.</p>${resetPasswordBody}`, handlePasswordReset, true, modalActions);
            return false;
        }

        const currentConfirmBtn = document.getElementById('modal-confirm-btn');
        if (currentConfirmBtn) {
            currentConfirmBtn.disabled = true;
            currentConfirmBtn.textContent = 'Sending...';
        }

        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
            redirectTo: 'https://banneler.github.io/Constellation-IV/reset-password.html',
        });

        if (error) {
            showModal('Reset Password', `<p style="color: var(--danger-red);">Error: ${error.message}</p>${resetPasswordBody}`, handlePasswordReset, true, modalActions);
            return false;
        } else {
            showModal('Reset Password', `<p style="color: var(--success-color);">Password reset link sent to ${resetEmail}. Check your inbox!</p>`, null, false, `<button id="modal-ok-btn" class="btn-primary">Close</button>`);
            return true;
        }
    }


    // --- Event Listener Setup ---
    function setupPageEventListeners() {
        setupModalListeners();

        if (document.getElementById("logout-btn")) document.getElementById("logout-btn").addEventListener("click", () => supabase.auth.signOut());
        
        if (authForm) {
            authForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const email = authEmailInput.value.trim();
                const password = authPasswordInput.value.trim();
                clearErrorMessage();

                let error;
                if (isLoginMode) {
                    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                    error = signInError;
                } else {
                    const confirmPassword = authConfirmPasswordInput.value.trim();
                    if (password !== confirmPassword) {
                        showTemporaryMessage("Passwords do not match.", false);
                        return;
                    }
                    const { error: signUpError } = await supabase.auth.signUp({ email, password });
                    error = signUpError;
                    if (!error) {
                        showTemporaryMessage("Account created successfully! Please check your email for a confirmation link.", true);
                        isLoginMode = true;
                        updateAuthUI();
                        return;
                    }
                }

                if (error) {
                    showTemporaryMessage(error.message, false);
                } else {
                    authForm.reset();
                }
            });
        }

        if (authToggleLink) {
            authToggleLink.addEventListener("click", (e) => {
                e.preventDefault();
                isLoginMode = !isLoginMode;
                updateAuthUI();
            });
        }

        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                const resetPasswordBody = `
                    <p>Enter your email to receive a password reset link.</p>
                    <input type="email" id="reset-email" placeholder="Email" required>
                `;
                showModal(
                    'Reset Password',
                    resetPasswordBody,
                    handlePasswordReset,
                    true,
                    `<button id="modal-confirm-btn" class="btn-primary">Send Reset Link</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
                );
            });
        }

        // --- NEW: Nav and Action Listeners ---
        if (navAbmCenter) {
            navAbmCenter.addEventListener('click', (e) => {
                e.preventDefault();
                state.currentView = 'abm-center';
                renderContent();
            });
        }
        if (abmTasksDueTableBody) {
            abmTasksDueTableBody.addEventListener('click', (e) => {
                const completeButton = e.target.closest('.complete-abm-task-btn');
                if (completeButton) {
                    const taskId = completeButton.dataset.id;
                    handleCompleteAbmTask(taskId);
                }
            });
        }

        if (navEmailTemplates) {
            navEmailTemplates.addEventListener('click', (e) => {
                e.preventDefault();
                state.currentView = 'email-templates';
                state.selectedTemplateId = null;
                state.selectedSequenceId = null;
                renderContent();
            });
        }
        if (navSequences) {
            navSequences.addEventListener('click', (e) => {
                e.preventDefault();
                state.currentView = 'sequences';
                state.selectedTemplateId = null;
                state.selectedSequenceId = null;
                renderContent();
            });
        }
        if (navSocialPosts) {
            navSocialPosts.addEventListener('click', (e) => {
                e.preventDefault();
                state.currentView = 'social-posts';
                renderContent();
            });
        }
        if (itemList) itemList.addEventListener('click', handleItemListClick);
        if (createNewItemBtn) createNewItemBtn.addEventListener('click', handleCreateNewItem);
        if (importItemBtn) importItemBtn.addEventListener('click', handleImportItem);
        if (deleteSelectedItemBtn) deleteSelectedItemBtn.addEventListener('click', handleDeleteSelectedItem);
        if (downloadSequenceTemplateBtn) downloadSequenceTemplateBtn.addEventListener('click', downloadCsvTemplate);
        
        if (createPostForm) {
            createPostForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                submitPostBtn.disabled = true;
                submitPostBtn.textContent = 'Submitting...';
                formFeedback.style.display = 'none';

                const newPost = {
                    type: 'marketing_post',
                    title: document.getElementById('post-title').value.trim(),
                    link: document.getElementById('post-link').value.trim(),
                    approved_copy: document.getElementById('post-copy').value.trim(),
                    is_dynamic_link: document.getElementById('is-dynamic-link').checked,
                    source_name: 'Marketing Team',
                    status: 'new',
                    user_id: state.currentUser.id
                };

                try {
                    const { error } = await supabase.from('social_hub_posts').insert(newPost);
                    if (error) throw error;

                    formFeedback.textContent = '✅ Success! The post has been added to the Social Hub.';
                    formFeedback.style.color = 'var(--success-color)';
                    formFeedback.style.display = 'block';
                    createPostForm.reset();
                    await loadAllData(); //
                } catch (error) {
                    console.error('Error submitting post:', error);
                    formFeedback.textContent = `❌ Error: ${error.message}`;
                    formFeedback.style.color = 'var(--danger-red)';
                    formFeedback.style.display = 'block';
                } finally {
                    submitPostBtn.disabled = false;
                    submitPostBtn.textContent = 'Add Post to Social Hub';
                }
            });
        }

        if (itemCsvInput) {
            itemCsvInput.addEventListener("change", async (e) => {
                if (state.currentView !== 'sequences' || !state.selectedSequenceId) return;
                const f = e.target.files[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = async function(e) {
                    const rows = e.target.result.split("\n").filter((r) => r.trim() !== "");
                    const selectedSequence = state.marketingSequences.find((s) => s.id === state.selectedSequenceId);
                    const existingSteps = state.marketingSequenceSteps.filter(s => s.marketing_sequence_id === state.selectedSequenceId);
                    let nextAvailableStepNumber = existingSteps.length > 0 ? Math.max(...existingSteps.map(s => s.step_number)) + 1 : 1;

                    const newRecords = rows
                        .slice(1)
                        .map((row) => {
                            const c = parseCsvRow(row);
                            if (c.length < 5) {
                                console.warn("Skipping row due to insufficient columns:", row);
                                return null;
                            }
                            const currentStepNumber = nextAvailableStepNumber++;
                            const delayDays = parseInt(c[4], 10);

                            if (isNaN(delayDays)) {
                                console.warn("Skipping row due to invalid delay_days:", row, "Delay Days:", delayDays);
                                return null;
                            }

                            return {
                                marketing_sequence_id: state.selectedSequenceId,
                                step_number: currentStepNumber,
                                type: c[1] || "",
                                subject: c[2] || "",
                                message: c[3] || "",
                                delay_days: delayDays,
                                user_id: state.currentUser.id
                            };
                        })
                        .filter(record => record !== null);

                    if (newRecords.length > 0) {
                        const { error } = await supabase.from("marketing_sequence_steps").insert(newRecords);
                        if (error) {
                            alert("Error importing sequence steps: " + error.message);
                        } else {
                            alert(`${newRecords.length} steps imported into "${selectedSequence.name}".`);
                            await loadAllData();
                        }
                    } else {
                        alert("No valid records found to import. Please ensure your CSV matches the template format.");
                    }
                };
                r.readAsText(f);
                e.target.value = "";
            });
        }
    
        // <-- NEW: Delegated event listener for Edit/Delete buttons -->
        if (myPostsContainer) {
            myPostsContainer.addEventListener('click', (e) => {
                const editBtn = e.target.closest('.edit-post-btn');
                const deleteBtn = e.target.closest('.delete-post-btn');

                if (editBtn) {
                    handleEditPost(Number(editBtn.dataset.postId));
                    return;
                }
                if (deleteBtn) {
                    handleDeletePost(Number(deleteBtn.dataset.postId));
                    return;
                }
            });
        }
    } // <-- THIS IS THE CORRECT END for setupPageEventListeners


    // --- App Initialization ---
    async function initializePage() {
        await loadSVGs();
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            // User is logged in, show the main content
            state.currentUser = session.user;
            if (authContainer) authContainer.classList.add('hidden');
            if (marketingHubContainer) marketingHubContainer.classList.remove('hidden');
            
            await setupUserMenuAndAuth(supabase, state);
            setupPageEventListeners(); // Sets up listeners for the marketing hub

            const hash = window.location.hash.substring(1);
            state.currentView = ['abm-center', 'email-templates', 'sequences', 'social-posts'].includes(hash) ? hash : 'abm-center';
            
            await loadAllData();
        } else {
            // If no session, redirect to the main login page, just like other pages
            window.location.href = "index.html";
        }
    }

    supabase.auth.onAuthStateChange((_event, session) => {
        // If the session is ever lost (e.g., user logs out in another tab), redirect
        if (!session) {
            window.location.href = "index.html";
        }
    });

    initializePage();
});
