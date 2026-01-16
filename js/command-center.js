// js/command-center.js
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatDate,
    formatSimpleDate,
    addDays,
    themes,
    setupModalListeners,
    showModal,
    hideModal,
    updateActiveNavLink,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    checkAndSetNotifications
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    // --- UPDATED LOADING SCREEN LOGIC ---
    const loadingScreen = document.getElementById('loading-screen');
    if (sessionStorage.getItem('showLoadingScreen') === 'true') {
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 7000); // 7 seconds
        }
        sessionStorage.removeItem('showLoadingScreen');
    }
    // --- END OF UPDATED LOGIC ---

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        isManager: false, // Initialize the isManager flag
        contacts: [],
        accounts: [],
        sequences: [],
        sequence_steps: [],
        activities: [],
        contact_sequences: [],
        tasks: [],
        deals: [],
        cognitoAlerts: [],
        nurtureAccounts: []
    };

    // --- DOM Element Selectors ---
    const logoutBtn = document.getElementById("logout-btn");
    const dashboardTable = document.querySelector("#dashboard-table tbody");
    const recentActivitiesTable = document.querySelector("#recent-activities-table tbody");
    const allTasksTable = document.querySelector("#all-tasks-table tbody");
    const myTasksTable = document.querySelector("#my-tasks-table tbody");
    const addNewTaskBtn = document.getElementById("add-new-task-btn");
    const aiDailyBriefingBtn = document.getElementById("ai-daily-briefing-btn");
    const aiBriefingContainer = document.getElementById("ai-briefing-container");

    // --- Utility ---
    function getStartOfLocalDayISO() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today.toISOString();
    }

    function replacePlaceholders(template, contact, account) {
        if (!template) return '';
        let result = template;
        if (contact) {
            const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
            result = result.replace(/\[FirstName\]/gi, contact.first_name || '');
            result = result.replace(/\[LastName\]/gi, contact.last_name || '');
            result = result.replace(/\[FullName\]/gi, fullName);
            result = result.replace(/\[Name\]/gi, fullName);
        }
        if (account) {
            result = result.replace(/\[AccountName\]/gi, account.name || '');
            result = result.replace(/\[Account\]/gi, account.name || '');
        }
        return result;
    }

    // --- Data Fetching ---
    async function loadAllData() {
        if (!state.currentUser) return;
        if(myTasksTable) myTasksTable.innerHTML = '<tr><td colspan="4">Loading tasks...</td></tr>';
        
        const tableMap = {
            "contacts": "contacts", "accounts": "accounts", "sequences": "sequences",
            "activities": "activities", "contact_sequences": "contact_sequences",
            "deals_tw": "deals", "tasks": "tasks", "cognito_alerts": "cognitoAlerts"
        };
        const userSpecificTables = Object.keys(tableMap);
        const publicTables = ["sequence_steps"];

        // --- THIS IS THE KEY CHANGE ---
        let userPromises;
        if (state.isManager) {
            // If user is a manager, fetch data for all users. RLS should handle permissions.
            console.log("Manager detected, fetching all user data.");
            userPromises = userSpecificTables.map(table => supabase.from(table).select("*"));
        } else {
            // If not a manager, only fetch data for the current user.
            console.log("Standard user detected, fetching only own data.");
            userPromises = userSpecificTables.map(table => supabase.from(table).select("*").eq("user_id", state.currentUser.id));
        }
        // --- END CHANGE ---

        const publicPromises = publicTables.map(table => supabase.from(table).select("*"));
        const allPromises = [...userPromises, ...publicPromises];
        const allTableNames = [...userSpecificTables, ...publicTables];

        try {
            const results = await Promise.allSettled(allPromises);
            results.forEach((result, index) => {
                const tableName = allTableNames[index];
                const stateKey = tableMap[tableName] || tableName;
                if (result.status === "fulfilled" && result.value && !result.value.error) {
                    state[stateKey] = result.value.data || [];
                } else {
                    console.error(`Error fetching ${tableName}:`, result.status === 'fulfilled' ? (result.value ? result.value.error.message : 'Unknown error') : result.reason);
                }
            });
        } catch (error) {
            console.error("Critical error in loadAllData:", error);
        }
        
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const activeAccountIds = new Set(
            state.activities
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 20)
    .forEach(act => {
        const contact = state.contacts.find(c => c.id === act.contact_id);
        const account = contact ? state.accounts.find(a => a.id === contact.account_id) : null;
        const row = recentActivitiesTable.insertRow();
        row.innerHTML = `
            <td><div class="contact-info"><div class="contact-name" style="font-size: 0.8rem; color: var(--text-dim);">${formatDate(act.date)}</div></div></td>
            <td><div class="contact-info"><div class="contact-name" style="font-size: 0.85rem;">${account ? account.name : "N/A"}</div></div></td>
            <td><div class="contact-info"><div class="contact-name" style="font-size: 0.85rem;">${contact ? `${contact.first_name} ${contact.last_name}` : "N/A"}</div></div></td>
            <td><div class="contact-info"><div class="contact-name" style="font-size: 0.85rem; font-family: 'Inter', sans-serif;">${act.type}: ${act.description}</div></div></td>
        `;
    });
            .filter(id => id)
        );
        state.nurtureAccounts = state.accounts.filter(account => !activeAccountIds.has(account.id));
        
        renderDashboard();
    }
        
    // --- Core Logic ---
    async function completeStep(csId, processedDescription = null) {
        const cs = state.contact_sequences.find((c) => c.id === csId);
        if (!cs) return;

        const contact = state.contacts.find((c) => c.id === cs.contact_id);
        const currentStepInfo = state.sequence_steps.find(s => s.sequence_id === cs.sequence_id && s.step_number === cs.current_step_number);
        
        if (contact && currentStepInfo) {
            const { error: updateStepError } = await supabase
                .from('contact_sequence_steps')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('contact_sequence_id', cs.id)
                .eq('sequence_step_id', currentStepInfo.id);

            if (updateStepError) {
                console.error("Error updating contact_sequence_step:", updateStepError);
                alert("Could not update the specific task step. Please check the console for errors.");
                return;
            }
            
            const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
            // --- UPDATED: Use processedDescription first, then step type, then fallback ---
            const descriptionForLog = processedDescription || `Sequence: ${currentStepInfo.type}` || "Completed step";
            const activityType = `Sequence: ${currentStepInfo.type}`;
            
            await supabase.from("activities").insert([{
                contact_id: contact.id,
                account_id: contact.account_id,
                date: new Date().toISOString(),
                type: activityType,
                description: descriptionForLog,
                user_id: state.currentUser.id
            }]);
        }
        
        const allStepsInSequence = state.sequence_steps
            .filter(s => s.sequence_id === cs.sequence_id)
            .sort((a, b) => a.step_number - b.step_number);
        
        const nextStep = allStepsInSequence.find(s => s.step_number > cs.current_step_number);
        
        if (nextStep) {
            await supabase.from("contact_sequences").update({
                current_step_number: nextStep.step_number,
                last_completed_date: new Date().toISOString(),
                next_step_due_date: addDays(new Date(), nextStep.delay_days).toISOString()
            }).eq("id", cs.id);
        } else {
            await supabase.from("contact_sequences").update({ status: "Completed" }).eq("id", cs.id);
        }
        
        await loadAllData();
    }

    // --- AI Briefing Logic ---
    async function handleGenerateBriefing() {
        aiBriefingContainer.classList.remove('hidden');
        aiBriefingContainer.innerHTML = `<div class="loader"></div><p class="placeholder-text" style="text-align: center;">Generating your daily briefing...</p>`;

        try {
            const briefingPayload = {
                tasks: state.tasks.filter(t => t.status === 'Pending'),
                sequenceSteps: state.contact_sequences.filter(cs => {
                    if (!cs.next_step_due_date || cs.status !== "Active") return false;
                    const dueDate = new Date(cs.next_step_due_date);
                    const startOfToday = new Date();
                    startOfToday.setHours(0, 0, 0, 0);
                    return dueDate.setHours(0, 0, 0, 0) <= startOfToday.getTime();
                }),
                deals: state.deals,
                cognitoAlerts: state.cognitoAlerts,
                nurtureAccounts: state.nurtureAccounts,
                contacts: state.contacts,
                accounts: state.accounts,
                sequences: state.sequences,
                sequence_steps: state.sequence_steps
            };
            console.log("Payload being sent to Edge Function:", briefingPayload);
            const { data: briefing, error } = await supabase.functions.invoke('get-daily-briefing', {
                body: { briefingPayload }
            });
            if (error) throw error;
            renderAIBriefing(briefing);
        } catch (error) {
            console.error("Error generating AI briefing:", error);
            aiBriefingContainer.innerHTML = `<p class="error-text">Could not generate briefing. Please try again later.</p>`;
        }
    }
        
    function renderAIBriefing(briefing) {
        const briefingHtml = `
           <ol id="ai-briefing-list">
                ${briefing.priorities.map(item => `
                    <li>
                        <strong>${item.title}</strong>
                        <em>Why: ${item.reason}</em>
                    </li>
                `).join('')}
            </ol>
        `;
        aiBriefingContainer.innerHTML = briefingHtml;
    }

    // --- Render Function ---
    function renderDashboard() {
        if (!myTasksTable || !dashboardTable || !allTasksTable || !recentActivitiesTable) return;
        myTasksTable.innerHTML = "";
        dashboardTable.innerHTML = "";
        allTasksTable.innerHTML = "";
        recentActivitiesTable.innerHTML = "";

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const salesSequenceTasks = [];
        const upcomingSalesTasks = [];
        
        const isManager = state.isManager === true;

        for (const cs of state.contact_sequences) {
            if (cs.status !== 'Active' || !cs.current_step_number) {
                continue;
            }

            const currentStep = state.sequence_steps.find(
                s => s.sequence_id === cs.sequence_id && s.step_number === cs.current_step_number
            );

            if (currentStep && ((isManager && (currentStep.assigned_to === 'Sales Manager' || cs.user_id === state.currentUser.id)) || (!isManager && (currentStep.assigned_to === 'Sales' || !currentStep.assigned_to)))) {
                const contact = state.contacts.find(c => c.id === cs.contact_id);
                const sequence = state.sequences.find(s => s.id === cs.sequence_id);
                if (contact && sequence) {
                    const taskObject = {
                        ...cs,
                        contact: contact,
                        account: contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null,
                        sequence: sequence,
                        step: currentStep
                    };
                    
                    if (cs.next_step_due_date && new Date(cs.next_step_due_date).setHours(0,0,0,0) <= startOfToday.getTime()) {
                        salesSequenceTasks.push(taskObject);
                    } else {
                        upcomingSalesTasks.push(taskObject);
                    }
                }
            }
        }

        // Only show tasks that belong to the logged-in user in "My Tasks"
        const pendingTasks = state.tasks.filter(task => task.user_id === state.currentUser.id && task.status === 'Pending').sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
        if (pendingTasks.length > 0) {
     pendingTasks.forEach(task => {
    const row = myTasksTable.insertRow();
    if (task.due_date) {
        const taskDueDate = new Date(task.due_date);
        if (taskDueDate.setHours(0,0,0,0) < startOfToday.getTime()) {
            row.classList.add('past-due');
        }
    }
    let linkedEntity = 'N/A';
    if (task.contact_id) {
        const contact = state.contacts.find(c => c.id === task.contact_id);
        if (contact) linkedEntity = `<a href="contacts.html?contactId=${contact.id}" class="contact-name-link">${contact.first_name} ${contact.last_name}</a>`;
    } else if (task.account_id) {
        const account = state.accounts.find(a => a.id === task.account_id);
        if (account) linkedEntity = `<a href="accounts.html?accountId=${account.id}" class="contact-name-link">${account.name}</a>`;
    }
    row.innerHTML = `
        <td><div class="contact-info"><div class="contact-name" style="font-size: 0.9rem; color: var(--text-dim);">${formatSimpleDate(task.due_date)}</div></div></td>
        <td><div class="contact-info"><div class="contact-name">${task.description}</div></div></td>
        <td><div class="contact-info"><div class="contact-name" style="font-size: 0.85rem; color: var(--text-medium);">${linkedEntity}</div></div></td>
        <td>
            <div class="button-group-wrapper">
                <button class="btn-primary mark-task-complete-btn" data-task-id="${task.id}">Complete</button>
                <button class="btn-secondary edit-task-btn" data-task-id="${task.id}">Edit</button>
                <button class="btn-danger delete-task-btn" data-task-id="${task.id}">Delete</button>
            </div>
        </td>`;
});
        } else {
            myTasksTable.innerHTML = '<tr><td colspan="4">No pending tasks. Great job!</td></tr>';
        }

        salesSequenceTasks.sort((a, b) => new Date(a.next_step_due_date) - new Date(b.next_step_due_date));
        
        if (salesSequenceTasks.length > 0) {
           salesSequenceTasks.forEach(task => {
    const row = dashboardTable.insertRow();
    const dueDate = new Date(task.next_step_due_date);
    if (dueDate < startOfToday) {
        row.classList.add('past-due');
    }
    
    const contactName = `${task.contact.first_name || ''} ${task.contact.last_name || ''}`;
    const rawDescription = task.step.subject || task.step.message || '';
    const description = replacePlaceholders(rawDescription, task.contact, task.account);

    let btnHtml;
    const stepTypeLower = task.step.type.toLowerCase();
    
    if (stepTypeLower === "linkedin message") {
        btnHtml = `<button class="btn-primary send-linkedin-message-btn" data-cs-id="${task.id}">Send Message</button>`;
    } else if (stepTypeLower.includes("linkedin")) { 
        btnHtml = `<button class="btn-primary open-linkedin-btn" data-cs-id="${task.id}">Open LinkedIn</button>`;
    } else if (stepTypeLower.includes("email") && task.contact.email) {
        btnHtml = `<button class="btn-primary send-email-btn" data-cs-id="${task.id}">Send Email</button>`;
    } else if (stepTypeLower === "call") {
        btnHtml = `<button class="btn-primary dial-call-btn" data-cs-id="${task.id}">Dial</button>`;
    } else {
        btnHtml = `<button class="btn-primary complete-step-btn" data-cs-id="${task.id}">Complete</button>`;
    }

    row.innerHTML = `
        <td><div class="contact-info"><div class="contact-name" style="font-size: 0.9rem; color: var(--text-dim);">${formatSimpleDate(task.next_step_due_date)}</div></div></td>
        <td><div class="contact-info"><div class="contact-name">${contactName}</div></div></td>
        <td><div class="contact-info"><div class="contact-name" style="font-size: 0.85rem; color: var(--text-medium);">${task.sequence.name}</div></div></td>
        <td><div class="contact-info"><div class="contact-name" style="font-size: 0.9rem; color: var(--warning-yellow);">${task.step.type}</div></div></td>
        <td><div class="contact-info"><div class="contact-name" style="font-size: 0.85rem; font-family: 'Inter', sans-serif; white-space: normal; line-height: 1.2;">${description}</div></div></td>
        <td><div class="button-group-wrapper">${btnHtml}</div></td>
    `;
});
        } else {
            dashboardTable.innerHTML = '<tr><td colspan="6">No sequence steps due today.</td></tr>';
        }

        upcomingSalesTasks.sort((a, b) => new Date(a.next_step_due_date) - new Date(b.next_step_due_date));
        
        upcomingSalesTasks.forEach(task => {
    const row = allTasksTable.insertRow();
    row.innerHTML = `
        <td><div class="contact-info"><div class="contact-name" style="font-size: 0.9rem; color: var(--text-dim);">${formatSimpleDate(task.next_step_due_date)}</div></div></td>
        <td><div class="contact-info"><div class="contact-name">${task.contact.first_name} ${task.contact.last_name}</div></div></td>
        <td><div class="contact-info"><div class="contact-name" style="font-size: 0.85rem; color: var(--text-medium);">${task.account ? task.account.name : "N/A"}</div></div></td>
        <td><div class="button-group-wrapper"><button class="btn-secondary revisit-step-btn" data-cs-id="${task.id}">Revisit Last Step</button></div></td>
    `;
});
    }

    // --- EVENT LISTENER SETUP ---
    function setupPageEventListeners() {
        setupModalListeners();
        if (logoutBtn) {
            logoutBtn.addEventListener("click", async () => {
                await supabase.auth.signOut();
                window.location.href = "index.html";
            });
        }
        if (addNewTaskBtn) {
            addNewTaskBtn.addEventListener('click', () => {
                const contactsOptions = state.contacts.map(c => `<option value="c-${c.id}">${c.first_name} ${c.last_name} (Contact)</option>`).join('');
                const accountsOptions = state.accounts.map(a => `<option value="a-${a.id}">${a.name} (Account)</option>`).join('');
                showModal('Add New Task', `
                    <label>Description:</label><input type="text" id="modal-task-description" required>
                    <label>Due Date:</label><input type="date" id="modal-task-due-date">
                    <label>Link To (Optional):</label>
                    <select id="modal-task-linked-entity">
                        <option value="">-- None --</option>
                        <optgroup label="Contacts">${contactsOptions}</optgroup>
                        <optgroup label="Accounts">${accountsOptions}</optgroup>
                    </select>
                `, async () => {
                    const description = document.getElementById('modal-task-description').value.trim();
                    const dueDate = document.getElementById('modal-task-due-date').value;
                    const linkedEntityValue = document.getElementById('modal-task-linked-entity').value;
                    if (!description) { alert('Description is required.'); return; }
                    const taskData = { description, due_date: dueDate || null, user_id: state.currentUser.id, status: 'Pending' };
                    if (linkedEntityValue.startsWith('c-')) { taskData.contact_id = Number(linkedEntityValue.substring(2)); }
                    else if (linkedEntityValue.startsWith('a-')) { taskData.account_id = Number(linkedEntityValue.substring(2)); }
                    const { error } = await supabase.from('tasks').insert(taskData);
                    if (error) { alert('Error adding task: ' + error.message); }
                    else { await loadAllData(); }
                });
            });
        }
        document.body.addEventListener('click', async (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            if (button.matches('.mark-task-complete-btn')) {
                const taskId = button.dataset.taskId;
                showModal('Confirm Completion', 'Mark this task as completed?', async () => {
                    await supabase.from('tasks').update({ status: 'Completed' }).eq('id', taskId);
                    await loadAllData();
                });
            } else if (button.matches('.delete-task-btn')) {
                const taskId = button.dataset.taskId;
                showModal('Confirm Deletion', 'Are you sure you want to delete this task?', async () => {
                    await supabase.from('tasks').delete().eq('id', taskId);
                    await loadAllData();
                });
            } else if (button.matches('.edit-task-btn')) {
                const taskId = button.dataset.taskId;
                const task = state.tasks.find(t => t.id == taskId);
                if (!task) { alert('Task not found.'); return; }
                const contactsOptions = state.contacts.map(c => `<option value="c-${c.id}" ${c.id === task.contact_id ? 'selected' : ''}>${c.first_name} ${c.last_name} (Contact)</option>`).join('');
                const accountsOptions = state.accounts.map(a => `<option value="a-${a.id}" ${a.id === task.account_id ? 'selected' : ''}>${a.name} (Account)</option>`).join('');
                showModal('Edit Task', `
                    <label>Description:</label><input type="text" id="modal-task-description" value="${task.description}" required>
                    <label>Due Date:</label><input type="date" id="modal-task-due-date" value="${task.due_date ? new Date(task.due_date).toISOString().substring(0, 10) : ''}">
                    <label>Link To:</label>
                    <select id="modal-task-linked-entity">
                        <option value="">-- None --</option>
                        <optgroup label="Contacts">${contactsOptions}</optgroup>
                        <optgroup label="Accounts">${accountsOptions}</optgroup>
                    </select>
                `, async () => {
                    const newDescription = document.getElementById('modal-task-description').value.trim();
                    const newDueDate = document.getElementById('modal-task-due-date').value;
                    const linkedEntityValue = document.getElementById('modal-task-linked-entity').value;
                    if (!newDescription) { alert('Task description is required.'); return; }
                    const updateData = { description: newDescription, due_date: newDueDate || null, contact_id: null, account_id: null };
                    if (linkedEntityValue.startsWith('c-')) { updateData.contact_id = Number(linkedEntityValue.substring(2)); }
                    else if (linkedEntityValue.startsWith('a-')) { updateData.account_id = Number(linkedEntityValue.substring(2)); }
                    await supabase.from('tasks').update(updateData).eq('id', taskId);
                    await loadAllData();
                });
            } else if (button.matches('.send-email-btn')) {
                const csId = Number(button.dataset.csId);
                const cs = state.contact_sequences.find(c => c.id === csId);
                if (!cs) return alert("Contact sequence not found.");
                const contact = state.contacts.find(c => c.id === cs.contact_id);
                if (!contact) return alert("Contact not found.");
                const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
                const step = state.sequence_steps.find(s => s.sequence_id === cs.sequence_id && s.step_number === cs.current_step_number);
                if (!step) return alert("Sequence step not found.");
                const subject = replacePlaceholders(step.subject, contact, account);
                const message = replacePlaceholders(step.message, contact, account);
                showModal('Compose Email', `
                    <div class="form-group">
                        <label for="modal-email-subject">Subject:</label>
                        <input type="text" id="modal-email-subject" class="form-control" value="${subject.replace(/"/g, '&quot;')}">
                    </div>
                    <div class="form-group">
                        <label for="modal-email-body">Message:</label>
                        <textarea id="modal-email-body" class="form-control" rows="10">${message}</textarea>
                    </div>
                `, async () => {
                    const finalSubject = document.getElementById('modal-email-subject').value;
                    const finalMessage = document.getElementById('modal-email-body').value;
                    const mailtoLink = `mailto:${contact.email}?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(finalMessage)}`;
                    window.open(mailtoLink, "_blank");
                    await completeStep(csId, `Email Sent: ${finalSubject}`);
                },
                true,
                `<button id="modal-confirm-btn" class="btn-primary">Send with Email Client</button>
                 <button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
                );
            } else if (button.matches('.send-linkedin-message-btn')) {
                const csId = Number(button.dataset.csId);
                const cs = state.contact_sequences.find(c => c.id === csId);
                if (!cs) return alert("Contact sequence not found.");

                const contact = state.contacts.find(c => c.id === cs.contact_id);
                if (!contact) return alert("Contact not found.");

                const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
                const step = state.sequence_steps.find(s => s.sequence_id === cs.sequence_id && s.step_number === cs.current_step_number);
                if (!step) return alert("Sequence step not found.");

                const message = replacePlaceholders(step.message, contact, account);
                const linkedinUrl = contact.linkedin_profile_url || 'https://www.linkedin.com/feed/';

                showModal('Compose LinkedIn Message', `
                    <div class="form-group">
                        <p><strong>To:</strong> ${contact.first_name} ${contact.last_name}</p>
                        <p class="modal-sub-text">The message below will be copied to your clipboard. Paste it into the message box on LinkedIn.</p>
                    </div>
                    <div class="form-group">
                        <label for="modal-linkedin-body">Message:</label>
                        <textarea id="modal-linkedin-body" class="form-control" rows="10">${message}</textarea>
                    </div>
                `, async () => {
                    const finalMessage = document.getElementById('modal-linkedin-body').value;
                    try {
                        await navigator.clipboard.writeText(finalMessage);
                    } catch (err) {
                        console.error('Failed to copy text: ', err);
                        alert('Could not copy text to clipboard. Please copy it manually.');
                    }
                    window.open(linkedinUrl, "_blank");
                    await completeStep(csId, "LinkedIn Message Sent");
                },
                true,
                `<button id="modal-confirm-btn" class="btn-primary">Copy Text & Open LinkedIn</button>
                 <button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
                );
            } else if (button.matches('.open-linkedin-btn')) {
                const csId = Number(button.dataset.csId);
                const cs = state.contact_sequences.find(c => c.id === csId);
                if (!cs) return alert("Contact sequence not found.");

                const contact = state.contacts.find(c => c.id === cs.contact_id);
                if (!contact) return alert("Contact not found.");
                
                const step = state.sequence_steps.find(s => s.sequence_id === cs.sequence_id && s.step_number === cs.current_step_number);
                if (!step) return alert("Sequence step not found.");

                const linkedinUrl = contact.linkedin_profile_url || 'https://www.linkedin.com/feed/';
                
                window.open(linkedinUrl, "_blank");
                
                const logMessage = `LinkedIn: ${step.type} Completed`;
                await completeStep(csId, logMessage);
            } else if (button.matches('.dial-call-btn')) {
                const csId = Number(button.dataset.csId);
                const cs = state.contact_sequences.find(c => c.id === csId);
                if (!cs) return alert("Contact sequence not found.");
                
                const contact = state.contacts.find(c => c.id === cs.contact_id);
                if (!contact) return alert("Contact not found.");

                const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
                const step = state.sequence_steps.find(s => s.sequence_id === cs.sequence_id && s.step_number === cs.current_step_number);
                if (!step) return alert("Sequence step not found.");

                const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
                const contactPhone = contact.phone || '';
                
                const rawScript = step.message || step.subject || 'No script provided for this step.';
                const callScript = replacePlaceholders(rawScript, contact, account);

                showModal('Log Call', `
                    <div class="form-group">
                        <label>Contact:</label>
                        <p><strong>${contactName}</strong></p>
                    </div>
                    <div class="form-group">
                        <label>Phone:</label>
                        <p><a href="tel:${contactPhone}" class="contact-name-link">${contactPhone || 'No phone on file'}</a></p>
                    </div>
                    <div class="form-group">
                        <label for="modal-call-script">Call Script:</label>
                        <textarea id="modal-call-script" class="form-control" rows="7" readonly style="background-color: #f8f8f8;">${callScript}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="modal-call-notes">Call Notes:</label>
                        <textarea id="modal-call-notes" class="form-control" rows="5" placeholder="Enter notes from your call..."></textarea>
                    </div>
                `, async () => {
                    const notes = document.getElementById('modal-call-notes').value.trim();
                    const descriptionForLog = notes ? `Call Notes: ${notes}` : 'Call Completed';
                    await completeStep(csId, descriptionForLog);
                });
            } else if (button.matches('.complete-step-btn')) {
                const csId = Number(button.dataset.csId);
                const cs = state.contact_sequences.find(c => c.id === csId);
                if (!cs) return alert("Contact sequence not found.");
                const step = state.sequence_steps.find(s => s.sequence_id === cs.sequence_id && s.step_number === cs.current_step_number);
                const logMessage = `${step.type}: ${step.subject || 'Task'} Completed`;
                completeStep(csId, logMessage);
            } else if (button.matches('.revisit-step-btn')) {
                const csId = Number(button.dataset.csId);
                const contactSequence = state.contact_sequences.find(cs => cs.id === csId);
                if (!contactSequence) return;
                
                const allStepsInSequence = state.sequence_steps
                    .filter(s => s.sequence_id === contactSequence.sequence_id)
                    .sort((a,b) => a.step_number - b.step_number);

                const currentStepIndex = allStepsInSequence.findIndex(s => s.step_number === contactSequence.current_step_number);
                
                if (currentStepIndex > 0) {
                    const previousStep = allStepsInSequence[currentStepIndex - 1];
                    showModal('Revisit Step', `Are you sure you want to go back to step ${previousStep.step_number}?`, async () => {
                        await supabase.from('contact_sequences').update({ current_step_number: previousStep.step_number, next_step_due_date: getStartOfLocalDayISO(), status: 'Active' }).eq('id', csId);
                        await loadAllData();
                    });
                } else {
                    alert("This is already the first step.");
                }
            }
        });
    }

    // --- App Initialization ---
    async function initializePage() {
        await loadSVGs();
        updateActiveNavLink();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            state.currentUser = session.user;

            // This is the sequential fix: check permissions first.
            const { data: userProfile, error } = await supabase
                .from('user_quotas')
                .select('is_manager')
                .eq('user_id', state.currentUser.id)
                .single();

            if (error && error.code !== 'PGRST116') { //PGRST116 means no row found, which is fine.
                console.error("Critical error fetching user manager status:", error);
                alert("Could not verify user permissions. Please refresh the page.");
                return;
            }
            state.isManager = userProfile?.is_manager === true;

            // Now that state.isManager is set, proceed with the rest of the setup.
            await setupUserMenuAndAuth(supabase, state);
            await setupGlobalSearch(supabase, state.currentUser);
            await checkAndSetNotifications(supabase);
            
            // The `loadAllData` function will now use the correct `state.isManager` flag.
            await loadAllData();
            
            if (aiDailyBriefingBtn) {
                aiDailyBriefingBtn.addEventListener('click', handleGenerateBriefing);
            }
            
            setupPageEventListeners();
        } else {
            window.location.href = "index.html";
        }
    }

    initializePage();
});
