import { showModal, hideModal } from './shared_constants.js';

// Internal state to manage the editor
let state = {
    supabase: null,
    currentUser: null,
    sequence: null,
    steps: [],
    containerElement: null,
    isEditingDetails: false,
    editingStepId: null,
    onDataChange: null, // Callback to refresh data on the parent page
};

// --- Main Exported Function ---
export function initializeAbmSequenceEditor(config) {
    state.supabase = config.supabase;
    state.currentUser = config.currentUser;
    state.sequence = config.sequence;
    state.steps = config.steps.sort((a, b) => a.step_number - b.step_number);
    state.containerElement = config.containerElement;
    state.onDataChange = config.onDataChange;
    state.isEditingDetails = false;
    state.editingStepId = null;
    render();
}

// --- Logic and Event Handlers ---

async function handleMoveStep(stepId, direction) {
    const currentStep = state.steps.find(s => s.id === stepId);
    if (!currentStep) return;

    const currentStepIndex = state.steps.findIndex(s => s.id === stepId);
    let targetStep = null;

    if (direction === 'up' && currentStepIndex > 0) {
        targetStep = state.steps[currentStepIndex - 1];
    } else if (direction === 'down' && currentStepIndex < state.steps.length - 1) {
        targetStep = state.steps[currentStepIndex + 1];
    }

    if (targetStep) {
        // Swap step numbers locally first
        const tempStepNumber = currentStep.step_number;
        currentStep.step_number = targetStep.step_number;
        targetStep.step_number = tempStepNumber;

        // Perform two separate, explicit update commands
        const { error: error1 } = await state.supabase.from("sequence_steps")
            .update({ step_number: currentStep.step_number })
            .eq('id', currentStep.id);

        const { error: error2 } = await state.supabase.from("sequence_steps")
            .update({ step_number: targetStep.step_number })
            .eq('id', targetStep.id);
        
        const error = error1 || error2;

        if (error) {
            alert("Error reordering steps: " + error.message);
            // Revert local changes if the database update fails
            targetStep.step_number = currentStep.step_number;
            currentStep.step_number = tempStepNumber;
        } else {
            if (state.onDataChange) await state.onDataChange();
        }
    }
}

async function handleSaveDetails() {
    const newName = state.containerElement.querySelector('#sequence-name-input').value.trim();
    const newDescription = state.containerElement.querySelector('#sequence-description-textarea').value.trim();
    if (!newName) { alert("Sequence name cannot be empty."); return; }

    const { error } = await state.supabase.from('sequences').update({ name: newName, description: newDescription }).eq('id', state.sequence.id);
    if (error) { alert("Error saving details: " + error.message); } 
    else {
        state.isEditingDetails = false;
        if (state.onDataChange) await state.onDataChange();
    }
}

async function handleAddStep() {
    if (state.isEditingDetails || state.editingStepId) { alert("Please save or cancel any active edits before adding a new step."); return; }
    const nextNum = state.steps.length > 0 ? Math.max(...state.steps.map(s => s.step_number)) + 1 : 1;
    const modalBody = `
        <label>Step Number</label><input type="number" id="modal-step-number" value="${nextNum}" required>
        <label>Type</label><input type="text" id="modal-step-type" required placeholder="e.g., Email, Call, LinkedIn">
        <label>Subject (for Email)</label><input type="text" id="modal-step-subject" placeholder="Optional">
        <label>Message (for Email/Notes)</label><textarea id="modal-step-message" placeholder="Optional"></textarea>
        <label>Delay (Days after previous step)</label><input type="number" id="modal-step-delay" value="0" required>
        <label>Assign To</label><select id="modal-step-assigned-to"><option value="Sales" selected>Sales</option><option value="Sales Manager">Sales Manager</option><option value="Marketing">Marketing</option></select>`;

    showModal("Add ABM Sequence Step", modalBody, async () => {
        const newStep = {
            sequence_id: state.sequence.id,
            step_number: parseInt(document.getElementById("modal-step-number").value),
            type: document.getElementById("modal-step-type").value.trim(),
            subject: document.getElementById("modal-step-subject").value.trim(),
            message: document.getElementById("modal-step-message").value.trim(),
            delay_days: parseInt(document.getElementById("modal-step-delay").value),
            assigned_to: document.getElementById("modal-step-assigned-to").value,
            user_id: state.currentUser.id
        };
        if (!newStep.type) { alert("Step Type is required."); return false; }
        const { error } = await state.supabase.from("sequence_steps").insert([newStep]);
        if (error) { alert("Error adding step: " + error.message); return false; }
        if (state.onDataChange) await state.onDataChange();
        hideModal();
        return true;
    });
}

async function handleStepActions(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const row = button.closest('tr');
    const stepId = parseInt(row.dataset.id);

    if (button.matches('.edit-step-btn')) {
        state.editingStepId = stepId;
        render();
    } else if (button.matches('.cancel-step-btn')) {
        state.editingStepId = null;
        render();
    } else if (button.matches('.save-step-btn')) {
        const updatedStep = {
            type: row.querySelector(".edit-step-type").value.trim(),
            subject: row.querySelector(".edit-step-subject").value.trim(),
            message: row.querySelector(".edit-step-message").value.trim(),
            delay_days: parseInt(row.querySelector(".edit-step-delay").value),
            assigned_to: row.querySelector(".edit-step-assigned-to").value,
        };
        if (!updatedStep.type) { alert("Step Type is required."); return; }
        const { error } = await state.supabase.from('sequence_steps').update(updatedStep).eq('id', stepId);
        if (error) { alert("Error saving step: " + error.message); } 
        else {
            state.editingStepId = null;
            if (state.onDataChange) await state.onDataChange();
        }
    } else if (button.matches('.delete-step-btn')) {
        showModal("Confirm Delete", "Are you sure you want to delete this step?", async () => {
            const { error } = await state.supabase.from('sequence_steps').delete().eq('id', stepId);
            if (error) { alert("Error deleting step: " + error.message); } 
            else { if (state.onDataChange) await state.onDataChange(); }
            hideModal();
        });
    } else if (button.matches('.move-up-btn')) {
        await handleMoveStep(stepId, 'up');
    } else if (button.matches('.move-down-btn')) {
        await handleMoveStep(stepId, 'down');
    }
}

// --- Render Functions ---

function renderSteps() {
    const stepsTableBody = state.containerElement.querySelector('#sequence-steps-table-body');
    if (!stepsTableBody) return;

    stepsTableBody.innerHTML = state.steps.map((step, index) => {
        const isEditing = state.editingStepId === step.id;
        const isFirstStep = index === 0;
        const isLastStep = index === state.steps.length - 1;
        return `
            <tr data-id="${step.id}">
                <td>${step.step_number}</td>
                <td>${isEditing ? `<input type="text" class="form-control edit-step-type" value="${step.type || ''}">` : step.type || ''}</td>
                <td>${isEditing ? `<input type="text" class="form-control edit-step-subject" value="${step.subject || ''}">` : step.subject || ''}</td>
                <td>${isEditing ? `<textarea class="form-control edit-step-message">${step.message || ''}</textarea>` : step.message || ''}</td>
                <td>${isEditing ? `<select class="form-control edit-step-assigned-to"><option value="Sales" ${step.assigned_to === 'Sales' ? 'selected' : ''}>Sales</option><option value="Sales Manager" ${step.assigned_to === 'Sales Manager' ? 'selected' : ''}>Sales Manager</option><option value="Marketing" ${step.assigned_to === 'Marketing' ? 'selected' : ''}>Marketing</option></select>` : step.assigned_to || 'Sales'}</td>
                <td>${isEditing ? `<input type="number" class="form-control edit-step-delay" value="${step.delay_days || 0}" min="0">` : step.delay_days || 0}</td>
                <td>
                    <div class="actions-cell-content">
                        ${isEditing ? `
                            <button class="btn btn-sm btn-success save-step-btn">Save</button>
                            <button class="btn btn-sm btn-secondary cancel-step-btn">Cancel</button>
                        ` : `
                            <div style="display: flex; flex-direction: column; gap: 5px;">
                                <button class="btn btn-sm btn-secondary move-up-btn ${isFirstStep ? 'hidden' : ''}" title="Move Up"><i class="fas fa-arrow-up"></i></button>
                                <button class="btn btn-sm btn-secondary move-down-btn ${isLastStep ? 'hidden' : ''}" title="Move Down"><i class="fas fa-arrow-down"></i></button>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 5px;">
                                <button class="btn btn-sm btn-primary edit-step-btn">Edit</button>
                                <button class="btn btn-sm btn-danger delete-step-btn">Delete</button>
                            </div>
                        `}
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function render() {
    if (!state.containerElement || !state.sequence) {
        state.containerElement.innerHTML = `<p>Select an ABM sequence to view its details.</p>`;
        return;
    }
    state.containerElement.innerHTML = `
        <h3>ABM Sequence Details</h3><hr>
        <div class="form-grid">
            <div class="full-span-grid-item"><label for="sequence-name-input">Name:</label><input type="text" id="sequence-name-input" class="form-control" value="${state.sequence.name || ''}" ${state.isEditingDetails ? '' : 'disabled'}></div>
            <div class="full-span-grid-item"><label for="sequence-description-textarea">Description:</label><textarea id="sequence-description-textarea" class="form-control" ${state.isEditingDetails ? '' : 'disabled'}>${state.sequence.description || ''}</textarea></div>
        </div>
        <div class="form-buttons">
            <button id="edit-sequence-details-btn" class="btn-secondary ${state.isEditingDetails ? 'hidden' : ''}">Edit Details</button>
            <button id="save-sequence-details-btn" class="btn-primary ${state.isEditingDetails ? '' : 'hidden'}">Save Changes</button>
            <button id="cancel-edit-sequence-btn" class="btn-secondary ${state.isEditingDetails ? '' : 'hidden'}">Cancel</button>
        </div><hr>
        <h3>Sequence Steps</h3>
        <div class="table-container">
            <table id="sequence-steps-table">
                <thead><tr><th>#</th><th>Type</th><th>Subject</th><th>Message</th><th>Assigned To</th><th>Delay (Days)</th><th>Actions</th></tr></thead>
                <tbody id="sequence-steps-table-body"></tbody>
            </table>
        </div>
        <div class="action-buttons"><button id="add-step-btn" class="btn-secondary ${state.isEditingDetails || state.editingStepId ? 'hidden' : ''}">Add Step</button></div>`;
    renderSteps();
    state.containerElement.querySelector('#edit-sequence-details-btn')?.addEventListener('click', () => { state.isEditingDetails = true; render(); });
    state.containerElement.querySelector('#cancel-edit-sequence-btn')?.addEventListener('click', () => { state.isEditingDetails = false; render(); });
    state.containerElement.querySelector('#save-sequence-details-btn')?.addEventListener('click', handleSaveDetails);
    state.containerElement.querySelector('#add-step-btn')?.addEventListener('click', handleAddStep);
    state.containerElement.querySelector('#sequence-steps-table-body')?.addEventListener('click', handleStepActions);
}
